import {
  type CheckResult,
  type FactSheet,
  type SkillContract,
  blockedReport,
  changedVerdicts,
  duplicateProducers,
  parseFactBlock,
  readySkills,
  runChecks,
} from '@larkwave/core';

/**
 * Chạy MỘT BỘ skill có hợp đồng, kiểm chéo sau mỗi bước.
 *
 * Vì sao phải là một vòng lặp trong MÃ, không phải một câu trong prompt: nếu chỉ đưa cả 5-7 skill
 * vào system prompt rồi dặn "nhớ kiểm chéo nhau", mô hình sẽ chạy theo thứ tự nó thích và tự nhận
 * là đã kiểm. Dự án này đã dính đúng kiểu đó nhiều lần. Ở đây mỗi skill là MỘT lượt riêng, dữ
 * liệu nó sinh ra được đọc lại bằng mã, và ràng buộc được TÍNH chứ không được hỏi.
 *
 * Mọi phụ thuộc đều tiêm vào (`deps`) — không fs, không electron, không mạng trực tiếp — nên bài
 * kiểm chạy được toàn bộ vòng lặp này mà không cần mô hình thật.
 */

export type SkillRunEvent =
  | { type: 'plan'; order: string[] }
  | { type: 'skill_start'; id: string; name: string; attempt: number }
  | { type: 'skill_done'; id: string; produced: string[] }
  | { type: 'checks'; changed: CheckResult[] }
  | { type: 'conflict'; failing: CheckResult[]; retryingSkill?: string }
  | { type: 'blocked'; detail: string }
  /** Bỏ qua vì khoá đã có sẵn trong dữ liệu đầu vào — sự kiện RIÊNG, không phải một dòng `note`:
   *  lịch sử chạy cần phân biệt được "bỏ qua" với "đã chạy", mà dò chuỗi tiếng Việt thì vỡ ngay
   *  lần đầu ai đó sửa câu chữ. */
  | { type: 'skipped'; id: string; name: string; produces: string[] }
  /** Một LƯỢT của kỹ năng hỏng (hết giờ, mất mạng, hết hạn mức). Sự kiện riêng để lịch sử ghi được
   *  LÝ DO — trước đây chỉ có một dòng `note` bằng lời, và lịch sử chỉ thấy "không ra khoá". */
  | { type: 'turn_failed'; id: string; name: string; attempt: number; reason: string }
  | { type: 'note'; text: string };

export interface SkillRunDeps {
  /** Một lượt agent: nhận prompt, trả về nguyên văn mô hình nói. */
  runTurn(prompt: string): Promise<string>;
  /**
   * Phán một ràng buộc BẰNG LỜI. Không có thì các ràng buộc loại đó ở nguyên `unknown` — cố ý:
   * thà nói "chưa kiểm được" còn hơn tự nhận đã kiểm.
   */
  judge?(assertion: string, facts: FactSheet): Promise<'pass' | 'fail' | 'unknown'>;
  emit(ev: SkillRunEvent): void;
}

export interface SkillRunOptions {
  /** Dữ liệu có sẵn từ đầu (người dùng đưa vào, hoặc đọc từ Base). */
  seedFacts?: FactSheet;
  /** Số lần chạy lại TỐI ĐA một skill khi ràng buộc của nó gãy. */
  maxRetriesPerSkill?: number;
  /**
   * Bỏ qua kỹ năng nào có ĐỦ `produces` đã nằm sẵn trong `seedFacts`. Mặc định BẬT.
   *
   * Vì sao mặc định bật: khi lượt chạy được kích hoạt từ một dòng Base, `seedFacts` chính là dữ
   * liệu THẬT của khách — có thể do người nhập tay. `readySkills()` chỉ xét `needs` và "đã chạy
   * chưa", không xét "khoá này đã có sẵn rồi", nên nếu không có luật này thì kỹ năng vẫn chạy và
   * GHI ĐÈ lên cái người ta vừa gõ. Chạy tay thì `seedFacts` rỗng nên luật này không đụng gì.
   *
   * Tắt khi muốn tính lại để đối chiếu chứ không phải để lấp chỗ trống.
   */
  skipSeeded?: boolean;
}

export interface SkillRunResult {
  facts: FactSheet;
  checks: CheckResult[];
  /** Thứ tự skill THỰC SỰ đã chạy — không nhất thiết trùng thứ tự người dùng viết ra. */
  ran: string[];
  /** Skill không chạy được và vì sao. Rỗng = xong hết. */
  blocked: { name: string; missing: string[]; nobodyProduces: string[] }[];
  /** Ràng buộc còn SAI khi dừng. Rỗng = không còn mâu thuẫn nào. */
  failing: CheckResult[];
}

const DEFAULT_RETRIES = 2;

/** Bảng dữ liệu hiện có, viết cho mô hình đọc. */
function factsBlock(facts: FactSheet): string {
  const keys = Object.keys(facts);
  if (!keys.length) return '(chưa có dữ liệu nào)';
  return keys.map((k) => `${k}: ${JSON.stringify(facts[k])}`).join('\n');
}

/**
 * Prompt cho MỘT skill. Cố tình chỉ đưa skill NÀY, không đưa cả bộ: đưa cả bộ là quay lại đúng
 * tình trạng cũ — mô hình tự nhảy sang skill khác giữa chừng và không ai biết bước nào đã xong.
 */
function skillPrompt(
  c: SkillContract,
  body: string,
  facts: FactSheet,
  problem?: { failing: CheckResult[]; attempt: number },
): string {
  const parts = [
    `[KỸ NĂNG: ${c.name}]`,
    body.trim(),
    '',
    '--- DỮ LIỆU ĐÃ CÓ ---',
    factsBlock(facts),
  ];
  // Khoá mình CẦN là kết quả CHỐT của các bước trước, không phải gợi ý.
  //
  // Thiếu câu này thì một kỹ năng tổng hợp sẽ quay lại Lark ĐẾM LẠI TỪ ĐẦU thay vì cộng bốn con số
  // vừa được đưa cho — và ràng buộc "tổng == tổng bốn thành phần" gãy ở mọi lần thử, vì nó đang so
  // số nó tự đếm với số của người khác. Đo thật trên máy người dùng: bộ SWOT thử lại 3 lần, lần nào
  // cũng gãy đúng ràng buộc đó, trong khi bốn bước đếm phía trước đều xong sạch.
  if (c.needs.length) {
    parts.push(
      '',
      '--- CÁC KHOÁ DƯỚI ĐÂY LÀ KẾT QUẢ CHỐT, DÙNG NGUYÊN ---',
      c.needs.join(', '),
      'Chúng do các bước TRƯỚC trong chính lượt chạy này tính ra. Hãy DÙNG NGUYÊN giá trị đang có ở',
      'phần "DỮ LIỆU ĐÃ CÓ" — TUYỆT ĐỐI không truy vấn lại Lark để tự đếm lại chúng.',
      'Ràng buộc nào là phép tính trên các khoá này thì phải tính TỪ CHÍNH chúng.',
      'Nếu bạn cho rằng một giá trị trong đó sai, hãy NÓI RÕ khoá nào sai và vì sao — đừng lặng lẽ',
      'thay bằng số bạn tự đếm, vì làm vậy chỉ khiến ràng buộc gãy mãi mà không ai biết lý do.',
    );
  }
  if (problem) {
    parts.push(
      '',
      '--- LẦN TRƯỚC SAI, PHẢI SỬA ---',
      'Kết quả bạn vừa đưa ra vi phạm ràng buộc dưới đây. Hãy làm lại cho đúng, hoặc nếu dữ liệu',
      'đầu vào mới là cái sai thì NÓI RÕ dữ liệu nào sai thay vì bịa ra số cho vừa ràng buộc:',
      ...problem.failing.map((r) => `  • ${r.check.raw} → ${r.reason}`),
    );
  }
  if (c.produces.length) {
    parts.push(
      '',
      '--- BẮT BUỘC KẾT THÚC BẰNG KHỐI NÀY ---',
      'Dòng cuối câu trả lời phải là một khối như sau, chứa ĐÚNG các khoá dưới đây:',
      '```facts',
      ...c.produces.map((p) => `${p}: <giá trị>`),
      '```',
      'Không biết giá trị nào thì bỏ trống dòng đó — TUYỆT ĐỐI không bịa.',
    );
  }
  return parts.join('\n');
}

export async function runSkillSet(
  contracts: readonly SkillContract[],
  bodies: ReadonlyMap<string, string>,
  deps: SkillRunDeps,
  opts: SkillRunOptions = {},
): Promise<SkillRunResult> {
  const maxRetries = opts.maxRetriesPerSkill ?? DEFAULT_RETRIES;
  let facts: FactSheet = { ...(opts.seedFacts ?? {}) };
  /** Khoá có SẴN từ đầu — khác hẳn khoá do một kỹ năng trong lượt này sinh ra. */
  const seeded = new Set(Object.keys(opts.seedFacts ?? {}));
  const skipSeeded = opts.skipSeeded !== false;
  const done = new Set<string>();
  const ran: string[] = [];
  /** Kỹ năng bỏ cuộc vì lượt agent hỏng — khác hẳn "chạy xong nhưng sai ràng buộc". */
  const failedSkills: string[] = [];
  /** Giữ cả ID để VÒNG HAI còn quay lại được. Chỉ giữ chuỗi thì không biết chạy lại cái nào. */
  const failedIds: { id: string; name: string; reason: string }[] = [];
  let prevChecks: CheckResult[] = runChecks(contracts, facts);

  // Xung đột hợp đồng phát hiện TRƯỚC khi chạy: hai skill cùng sinh một khoá nghĩa là kết quả
  // đổi theo thứ tự — đúng thứ tính năng này sinh ra để loại bỏ, nên chạy tiếp là vô nghĩa.
  const dups = duplicateProducers(contracts);
  if (dups.length) {
    const detail = dups.map((d) => `"${d.key}" do cả ${d.owners.join(' và ')} cùng sinh ra`).join('; ');
    deps.emit({ type: 'blocked', detail: `Xung đột hợp đồng: ${detail}. Mỗi khoá chỉ được một kỹ năng sinh ra.` });
    return { facts, checks: prevChecks, ran, blocked: [], failing: [] };
  }

  deps.emit({ type: 'plan', order: readySkills(contracts, facts, done).map((c) => c.name) });

  while (done.size < contracts.length) {
    const ready = readySkills(contracts, facts, done);
    if (!ready.length) break; // bế tắc — báo ở dưới

    const c = ready[0];

    // Khoá nó định sinh ra đã có sẵn hết ⇒ không chạy, và KHÔNG đụng vào dữ liệu đang có.
    // Đánh dấu xong để vòng lặp tiến lên và để các kỹ năng sau nó vẫn mở khoá bình thường.
    if (skipSeeded && c.produces.length && c.produces.every((p) => seeded.has(p))) {
      done.add(c.id);
      deps.emit({ type: 'skipped', id: c.id, name: c.name, produces: c.produces });
      deps.emit({ type: 'note', text: `${c.name}: bỏ qua — ${c.produces.join(', ')} đã có sẵn trong dữ liệu đầu vào.` });
      continue;
    }

    let attempt = 0;
    let accepted = false;
    // Ràng buộc mà LƯỢT VỪA RỒI của kỹ năng này làm gãy — dùng để nhắc nó sửa ở lượt sau.
    let justBroke: CheckResult[] = [];
    // Mốc so sánh chốt MỘT LẦN, trước mọi lần thử. Cập nhật mốc sau mỗi lần thử thì lần thứ hai
    // sẽ coi ràng buộc vẫn-đang-gãy là "cũ" và cho qua — một kỹ năng cố chấp chỉ bị thử lại đúng
    // một lần rồi kết quả sai được nhận.
    const keyOf = (r: CheckResult) => `${r.check.owner}::${r.check.raw}`;
    const baselineBroken = new Set(prevChecks.filter((r) => r.verdict === 'fail').map(keyOf));

    while (attempt <= maxRetries && !accepted) {
      attempt += 1;
      deps.emit({ type: 'skill_start', id: c.id, name: c.name, attempt });

      // Một lượt agent hỏng (quá giờ, mất mạng, hết hạn mức) KHÔNG được làm sập cả bộ. Ném ra
      // ngoài là người dùng mất sạch kết quả của những kỹ năng đã chạy xong trước đó — với một bộ
      // 7 kỹ năng chạy vài phút thì đó là mất rất nhiều công vì một sự cố thoáng qua.
      let text: string;
      try {
        text = await deps.runTurn(
          skillPrompt(c, bodies.get(c.id) ?? '', facts, attempt > 1 ? { failing: justBroke, attempt } : undefined),
        );
      } catch (e) {
        const msg = (e as Error)?.message || 'lỗi không rõ';
        deps.emit({ type: 'turn_failed', id: c.id, name: c.name, attempt, reason: msg });
        deps.emit({ type: 'note', text: `${c.name}: lượt chạy hỏng — ${msg}` });
        if (attempt <= maxRetries) continue; // thử lại; sự cố mạng thường qua nhanh
        // Hết lượt thử: bỏ qua kỹ năng này, các kỹ năng khác vẫn chạy tiếp. Khoá nó định sinh ra
        // sẽ thiếu, và `blockedReport` sẽ nói rõ điều đó ở cuối.
        failedSkills.push(`${c.name} (${msg})`);
        failedIds.push({ id: c.id, name: c.name, reason: msg });
        break;
      }

      // CHỈ nhận những khoá skill này khai là nó sinh ra. Nhận bừa mọi khoá trong khối là mở đường
      // cho một skill lặng lẽ ghi đè kết quả của skill khác — mà "khoá của ai" chính là thứ giữ
      // cho việc kiểm chéo có nghĩa.
      const emitted = parseFactBlock(text);
      const taken: FactSheet = {};
      for (const k of c.produces) if (k in emitted) taken[k] = emitted[k];
      const strayKeys = Object.keys(emitted).filter((k) => !c.produces.includes(k));
      if (strayKeys.length) {
        deps.emit({ type: 'note', text: `${c.name}: bỏ qua khoá không khai báo — ${strayKeys.join(', ')}` });
      }

      const next: FactSheet = { ...facts, ...taken };
      const nextChecks = runChecks(contracts, next);
      const broke = nextChecks.filter((r) => r.verdict === 'fail');

      // Ai phải sửa? Kỹ năng VỪA CHẠY — bất kể ràng buộc đó do ai khai.
      //
      // Trước đây chỗ này lọc theo `owner === c.id`, và đó là lỗi đúng ngay giữa giá trị của tính
      // năng: ca "kiểm chéo" điển hình là kỹ năng B sinh ra một giá trị làm gãy ràng buộc mà kỹ
      // năng A khai. Lọc theo chủ sở hữu thì ca đó KHÔNG kích hoạt chạy lại lần nào — mâu thuẫn
      // được ghi nhận rồi cho qua. Người phải sửa là người vừa thay đổi dữ liệu, không phải người
      // đã viết ra ràng buộc.
      //
      // Chỉ tính ràng buộc MỚI gãy: cái đã gãy từ trước không phải do lượt này gây ra, bắt nó sửa
      // là quay vòng vô ích.
      const newlyBroken = broke.filter((r) => !baselineBroken.has(keyOf(r)));
      if (newlyBroken.length && attempt <= maxRetries) {
        justBroke = newlyBroken;
        deps.emit({ type: 'conflict', failing: newlyBroken, retryingSkill: c.name });
        // KHÔNG đụng vào `prevChecks`: nó là mốc để tính "ràng buộc nào vừa đổi trạng thái" khi
        // lượt này cuối cùng được nhận. Ghi đè ở đây thì mọi thay đổi do lượt thử hỏng gây ra bị
        // tính nhầm là đã báo rồi, và người dùng không bao giờ thấy chúng.
        continue;
      }

      facts = next;
      const changed = changedVerdicts(prevChecks, nextChecks);
      prevChecks = nextChecks;
      accepted = true;
      done.add(c.id);
      ran.push(c.name);
      deps.emit({ type: 'skill_done', id: c.id, produced: Object.keys(taken) });
      if (changed.length) deps.emit({ type: 'checks', changed });
      if (broke.length) deps.emit({ type: 'conflict', failing: broke });

      const missing = c.produces.filter((p) => !(p in taken));
      if (missing.length) {
        // Không ép chạy lại: skill có thể đã nói rõ "không xác định được". Nhưng phải NÓI RA, vì
        // khoá thiếu sẽ chặn các skill sau và lúc đó rất khó lần ra nguyên nhân.
        deps.emit({ type: 'note', text: `${c.name}: chưa ra ${missing.join(', ')} — các bước cần khoá này sẽ dừng.` });
      }
    }
    if (!accepted) {
      // Chỉ tới đây khi MỌI lượt chạy của kỹ năng này đều hỏng (xem khối catch ở trên). Đánh dấu
      // đã xong để vòng lặp tiến lên — nếu không, `readySkills` sẽ chọn lại đúng nó mãi mãi.
      // Kết quả sai-vì-ràng-buộc KHÔNG đi qua đây: lượt thử cuối luôn được nhận và báo ở `failing`.
      done.add(c.id);
    }
  }

  /**
   * VÒNG HAI — quay lại những kỹ năng đã hỏng.
   *
   * Vòng một bỏ qua một kỹ năng hỏng để các kỹ năng sau vẫn chạy được. Nhưng lúc nó hỏng, bảng
   * khoá còn ÍT hơn bây giờ: các kỹ năng chạy sau đã thêm dữ liệu vào. Một kỹ năng hỏng vì thiếu
   * đầu vào, hoặc vì một sự cố thoáng qua, giờ có thể chạy được.
   *
   * Đây là cách người ta làm việc thật: gặp chỗ tắc thì để đó làm việc khác, xong quay lại. Bỏ
   * luôn ngay lần đầu là vứt đi một kỹ năng chỉ vì nó xui xẻo đứng sớm trong danh sách.
   *
   * CHỈ MỘT vòng: hai kỹ năng hỏng vì cùng một lý do thật sự (sai quyền Lark, bảng không tồn tại)
   * sẽ hỏng lại y như cũ, và lặp thêm chỉ tốn thời gian của người đang ngồi chờ.
   */
  if (failedIds.length) {
    const retryList = [...failedIds];
    failedIds.length = 0;
    failedSkills.length = 0;
    for (const f of retryList) {
      const c = contracts.find((x) => x.id === f.id);
      if (!c) continue;
      const missing = c.needs.filter((n) => !(n in facts));
      if (missing.length) {
        // Vẫn thiếu đầu vào ⇒ chạy lại cũng hỏng y như cũ. Nói rõ thiếu gì thay vì thử cho có.
        failedSkills.push(`${c.name} (vẫn thiếu ${missing.join(', ')})`);
        continue;
      }
      deps.emit({ type: 'note', text: `${c.name}: quay lại thử lần nữa — dữ liệu giờ đã đầy hơn lúc nó hỏng.` });
      deps.emit({ type: 'skill_start', id: c.id, name: c.name, attempt: 1 });
      try {
        const text = await deps.runTurn(skillPrompt(c, bodies.get(c.id) ?? '', facts));
        const emitted = parseFactBlock(text);
        const taken: FactSheet = {};
        for (const k of c.produces) if (k in emitted) taken[k] = emitted[k];
        facts = { ...facts, ...taken };
        prevChecks = runChecks(contracts, facts);
        ran.push(c.name);
        deps.emit({ type: 'skill_done', id: c.id, produced: Object.keys(taken) });
      } catch (e) {
        const msg = (e as Error)?.message || 'lỗi không rõ';
        deps.emit({ type: 'turn_failed', id: c.id, name: c.name, attempt: 1, reason: msg });
        failedSkills.push(`${c.name} (${msg})`);
      }
    }
  }

  // Ràng buộc bằng lời: giờ mới hỏi mô hình, và chỉ hỏi những cái đã đủ dữ liệu.
  if (deps.judge) {
    for (const r of prevChecks) {
      if (r.check.kind !== 'prose' || r.verdict !== 'unknown') continue;
      const have = new Set(Object.keys(facts));
      if (!r.check.refs.every((k) => have.has(k))) continue;
      const verdict = await deps.judge(r.check.raw, facts);
      r.verdict = verdict;
      r.reason = verdict === 'unknown' ? 'mô hình không kết luận được' : `mô hình phán: ${verdict}`;
    }
  }

  for (const f of failedSkills) deps.emit({ type: 'blocked', detail: `${f} — bỏ qua sau khi thử lại không được` });

  const blocked = blockedReport(contracts, facts, done).map((b) => ({
    name: b.name,
    missing: b.missing,
    nobodyProduces: b.nobodyProduces,
  }));
  for (const b of blocked) {
    const why = b.nobodyProduces.length
      ? `thiếu ${b.nobodyProduces.join(', ')} và không kỹ năng nào trong bộ sinh ra — phải cung cấp từ ngoài`
      : `chờ ${b.missing.join(', ')}`;
    deps.emit({ type: 'blocked', detail: `${b.name}: ${why}` });
  }

  return { facts, checks: prevChecks, ran, blocked, failing: prevChecks.filter((r) => r.verdict === 'fail') };
}
