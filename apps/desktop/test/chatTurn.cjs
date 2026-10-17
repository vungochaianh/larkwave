/**
 * Sau một lượt chat thì làm gì tiếp — luật ở `core/chatTurn`.
 *
 * Lỗi người dùng gặp: agent gọi một loạt `bitable_create_table` rồi im, ô soạn mở lại như thể xong
 * việc. Hỏi "xong chưa" thì nó đếm lại và trả lời "chưa, còn 17 bảng". Nhìn từ ngoài, "dừng giữa
 * chừng" trông y hệt "đã xong" — và đó mới là phần tệ.
 */
const assert = require('node:assert');
const {
  nextStepAfterTurn,
  waitingOnUser,
  AUTO_CONTINUE_MAX,
  CTX_HANDOFF_AT,
  AUTO_CONTINUE_PROMPT,
} = require('../../../packages/core/dist/chatTurn.js');

const base = { hasConclusion: false, usedTools: true, ctxUsed: 0.3, autoLeft: 3, canHandoff: true };

// ── Lượt xong tử tế thì KHÔNG đụng vào ───────────────────────────────────────────────
assert.strictEqual(nextStepAfterTurn({ ...base, hasConclusion: true }), 'none');
// Ngữ cảnh gần đầy thì KHÔNG chạy tiếp, nhưng vẫn phải NÉN — xem phần "nén chủ động" ở cuối.
// (Khẳng định này từng là 'none'; nó ghi lại hành vi cũ, và chính hành vi đó làm hội thoại ngồi
// ở 100% mãi.)
assert.strictEqual(nextStepAfterTurn({ ...base, hasConclusion: true, ctxUsed: 0.98 }), 'compact');
console.log('✓ có kết luận thì không tự chạy tiếp');

// ── Không gọi công cụ nào thì cũng không chạy tiếp ───────────────────────────────────
// Người dùng gõ "ok", agent không nói gì: nối thêm chỉ tốn tiền.
assert.strictEqual(nextStepAfterTurn({ ...base, usedTools: false }), 'none');
console.log('✓ lượt không chạy công cụ nào thì để yên');

// ── Dừng giữa chừng, còn chỗ → chạy tiếp ─────────────────────────────────────────────
assert.strictEqual(nextStepAfterTurn(base), 'continue');
console.log('✓ dừng giữa chừng mà còn ngữ cảnh → tự chạy tiếp');

// ── Dừng giữa chừng, ngữ cảnh đầy → sang phiên mới rồi mới chạy tiếp ─────────────────
assert.strictEqual(nextStepAfterTurn({ ...base, ctxUsed: CTX_HANDOFF_AT }), 'handoff-then-continue');
assert.strictEqual(nextStepAfterTurn({ ...base, ctxUsed: 1 }), 'handoff-then-continue');
// Ngay dưới ngưỡng thì vẫn chạy tiếp trong phiên cũ.
assert.strictEqual(nextStepAfterTurn({ ...base, ctxUsed: CTX_HANDOFF_AT - 0.01 }), 'continue');
// Máy không chuyển phiên được (bản cài cũ) thì vẫn phải chạy tiếp, không được đứng im.
assert.strictEqual(nextStepAfterTurn({ ...base, ctxUsed: 1, canHandoff: false }), 'continue');
console.log('✓ ngữ cảnh đầy → sang phiên mới trước; bản cũ không chuyển được thì vẫn chạy tiếp');

// ── Hết lượt tự chạy → PHẢI nói ra, không được im ────────────────────────────────────
assert.strictEqual(nextStepAfterTurn({ ...base, autoLeft: 0 }), 'warn');
assert.strictEqual(nextStepAfterTurn({ ...base, autoLeft: 0, ctxUsed: 1 }), 'warn');
// Nhưng chỉ cảnh báo khi THẬT SỰ dở dang — xong rồi thì đừng doạ người ta.
assert.strictEqual(nextStepAfterTurn({ ...base, autoLeft: 0, hasConclusion: true }), 'none');
console.log('✓ hết lượt tự chạy thì nói ra, nhưng không doạ khi đã xong');

// ── Vòng lặp phải HỮU HẠN ────────────────────────────────────────────────────────────
let left = AUTO_CONTINUE_MAX;
let n = 0;
for (;;) {
  const step = nextStepAfterTurn({ ...base, ctxUsed: 1, autoLeft: left });
  if (step === 'warn') break;
  left -= 1;
  n += 1;
  assert.ok(n <= AUTO_CONTINUE_MAX + 1, 'tự chạy tiếp phải dừng, không được lặp vô hạn');
}
assert.strictEqual(n, AUTO_CONTINUE_MAX, `phải tự chạy đúng ${AUTO_CONTINUE_MAX} lần rồi dừng`);
console.log(`✓ tự chạy tối đa ${AUTO_CONTINUE_MAX} lần rồi dừng hẳn — không có vòng lặp vô hạn`);

// ── Câu dặn phải bắt ĐẾM LẠI và bắt TỔNG KẾT ─────────────────────────────────────────
// Hai thứ này đúng là hai lỗi đã xảy ra: tin trí nhớ nên báo xong khi còn thiếu 17 bảng,
// và kết thúc không có dòng tổng kết nên người dùng tưởng đã xong.
assert.ok(/KIỂM LẠI THỰC TẾ/.test(AUTO_CONTINUE_PROMPT), 'phải bắt kiểm lại thực tế, đừng tin trí nhớ');
assert.ok(/tổng kết/.test(AUTO_CONTINUE_PROMPT), 'phải bắt kết thúc bằng dòng tổng kết');
console.log('✓ câu dặn bắt đếm lại thực tế và bắt tổng kết');

// ── Nén TẠI CHỖ: hội thoại không được đổi ────────────────────────────────────────────
// Người dùng nói thẳng: "vẫn dùng hội thoại cũ được mà" — Claude nén ngay trong cuộc trò chuyện
// đang mở chứ không đẩy sang cái mới. Giữ luật đó trong mã, không chỉ trong trí nhớ.
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const chat = readFileSync(
  join(__dirname, '..', '..', '..', 'packages', 'ui', 'src', 'components', 'lark', 'LarkChat.tsx'),
  'utf8',
);
// Việc nén nằm trong MỘT hàm dùng chung (`nenNguCanh`), gọi từ cả nhánh nén-chủ-động lẫn nhánh
// nén-rồi-chạy-tiếp — nên kiểm chính hàm đó, đừng kiểm theo vị trí trong tệp.
const nen = chat.slice(chat.indexOf('const nenNguCanh'), chat.indexOf('const nenNguCanh') + 1600);
assert.ok(/runtime\.larkCompactSession/.test(nen), 'phải NÉN tại chỗ, không tạo hội thoại mới');
assert.ok(
  nen.indexOf('larkCompactSession') < nen.indexOf('handoffSession()'),
  'nén tại chỗ phải được thử TRƯỚC; tạo hội thoại mới chỉ là lối lùi cho bản cài cũ',
);
// Và cả hai nhánh đều phải đi qua hàm đó, không ai tự viết lại.
for (const b of ["step === 'compact'", "step === 'handoff-then-continue'"]) {
  const seg = chat.slice(chat.indexOf(b), chat.indexOf(b) + 300);
  assert.ok(/nenNguCanh\(\)/.test(seg), `nhánh ${b} phải gọi nenNguCanh()`);
}

const svc = readFileSync(
  join(__dirname, '..', 'main', 'runtime', 'lark', 'larkService.ts'),
  'utf8',
);
const body = svc.slice(svc.indexOf('async larkCompactSession('), svc.indexOf('async larkCompactSession(') + 3500);
// Ba việc bắt buộc của một lần nén tại chỗ.
assert.ok(/started: false/.test(body), 'phải đặt started:false, nếu không lượt sau vẫn --resume phiên đã đầy');
assert.ok(/this\.carryover = \{ sessionId: id/.test(body), 'bản tóm tắt phải khoá theo ĐÚNG id hội thoại này');
assert.ok(/agentSessionId: fresh/.test(body), 'phải thay phiên Claude bên dưới bằng phiên mới');
// Và KHÔNG được tạo hội thoại mới.
assert.ok(!/larkNewSession/.test(body), 'nén tại chỗ KHÔNG được tạo hội thoại mới');
console.log('✓ nén TẠI CHỖ: thay phiên bên dưới, giữ nguyên hội thoại người dùng đang mở');

// ── Kết luận TỰ NÓI là chưa xong thì không được tính là xong ─────────────────────────
// Ca đã lọt lưới thật: "Xác nhận: 8/24 bảng đã dựng. Tiếp tục 1.3 và 1.4." là một câu trả lời,
// nên luật cũ dừng ngay — người dùng đọc câu tự tin rồi ngồi chờ, việc thì đứng im.
const { saysUnfinished } = require('../../../packages/core/dist/chatTurn.js');

for (const t of [
  'Xác nhận: 8/24 bảng đã dựng. Tiếp tục 1.3 và 1.4.',
  'Chưa xong — còn 17 bảng. Tôi chạy tiếp ngay (14/31 bảng đã có).',
  'Đã tạo 2 bảng danh mục đầu. Tiếp tục 4 bảng danh mục còn lại.',
  'Hai bảng xong, còn lại 5 bảng nữa.',
  'Still 6 remaining, not yet done.',
]) {
  assert.ok(saysUnfinished(t), `phải nhận ra là CÒN DỞ: ${t}`);
}
console.log('✓ nhận ra kết luận tự nhận còn dở (phân số tiến độ, "còn N", "chưa xong", "tiếp tục")');

// KHÔNG được bắt nhầm một báo cáo đã xong.
for (const t of [
  'Đã dựng xong toàn bộ 24/24 bảng. Không còn gì thiếu.',
  'Xong. Đã đối chiếu 128 dòng, tổng thu khớp bảng phân bổ.',
  'Hoàn tất: 31/31 bảng, mỗi bảng đủ cột và mô tả.',
  'Đã tạo file Excel và đính kèm trong hội thoại.',
  'Tỉ lệ khớp 100%.',
]) {
  assert.ok(!saysUnfinished(t), `KHÔNG được coi là còn dở: ${t}`);
}
console.log('✓ không bắt nhầm báo cáo đã xong (kể cả khi có phân số 24/24)');

// Và luật tổng phải đổi theo.
assert.strictEqual(
  nextStepAfterTurn({ ...base, hasConclusion: true, conclusionSaysUnfinished: true }),
  'continue',
  'kết luận nói còn dở ⇒ phải chạy tiếp',
);
assert.strictEqual(
  nextStepAfterTurn({ ...base, hasConclusion: true, conclusionSaysUnfinished: false }),
  'none',
  'kết luận nói đã xong ⇒ để yên',
);
// Vẫn phải có trần: nói còn dở mãi cũng không được chạy vô hạn.
assert.strictEqual(
  nextStepAfterTurn({ ...base, hasConclusion: true, conclusionSaysUnfinished: true, autoLeft: 0 }),
  'warn',
  'hết lượt tự chạy thì vẫn phải dừng và nói ra',
);
console.log('✓ kết luận "còn dở" → chạy tiếp, nhưng vẫn có trần');

// ── Nén CHỦ ĐỘNG: xong việc mà ngữ cảnh gần đầy thì vẫn nén ─────────────────────────
// Người dùng hỏi đúng chỗ này: "tôi không bị đóng session dù full". Luật cũ chỉ nén khi một lượt
// DỪNG GIỮA CHỪNG, nên hội thoại cứ ngồi ở 100%: mỗi lượt vẫn chạy, nhưng model mất dần phần đầu
// và băng cảnh báo nằm đó mãi. Nén trước khi hỏng, đừng chờ sự cố.
assert.strictEqual(
  nextStepAfterTurn({ ...base, hasConclusion: true, ctxUsed: 0.9 }),
  'compact',
  'xong việc + ngữ cảnh gần đầy ⇒ nén ngay',
);
assert.strictEqual(
  nextStepAfterTurn({ ...base, hasConclusion: true, ctxUsed: 0.5 }),
  'none',
  'còn nhiều chỗ thì đừng nén — mỗi lần nén tốn một lượt tóm tắt',
);
// Máy không nén được (bản cài cũ) thì đừng hứa suông.
assert.strictEqual(
  nextStepAfterTurn({ ...base, hasConclusion: true, ctxUsed: 0.9, canHandoff: false }),
  'none',
);
// Nén chủ động KHÔNG được kéo theo một lượt chạy mới: người dùng chưa yêu cầu gì.
assert.notStrictEqual(nextStepAfterTurn({ ...base, hasConclusion: true, ctxUsed: 0.9 }), 'continue');
console.log('✓ nén CHỦ ĐỘNG khi xong việc mà ngữ cảnh gần đầy, và không tự chạy thêm lượt nào');

// ── Gắn Base vào hội thoại chưa nhắn gì PHẢI được giữ ────────────────────────────────
// Lỗi thật người dùng báo: "gán nhiều base, sau cập nhật là mất hết". Luật cũ chỉ xét tin nhắn,
// nên gắn 5 Base vào một hội thoại chưa nhắn gì là mất sạch — và mất NGAY ở lần lưu kế tiếp
// (lưu theo bản nháp cũ), không cần khởi động lại.
const { shouldPersistSession } = require('../../../packages/core/dist/chatTurn.js');

// Bấm "+" rồi bỏ đó: KHÔNG được đẻ ra hội thoại rỗng nằm lại trong "Hội thoại cũ".
assert.strictEqual(shouldPersistSession({ hasExisting: false, itemCount: 0, basesCount: 0 }), false);
// Gắn Base là thao tác CÓ CHỦ Ý — phải ghi, dù chưa nhắn gì.
assert.strictEqual(shouldPersistSession({ hasExisting: false, itemCount: 0, basesCount: 1 }), true);
assert.strictEqual(shouldPersistSession({ hasExisting: false, itemCount: 0, basesCount: 5 }), true);
// Có nội dung thì ghi như cũ.
assert.strictEqual(shouldPersistSession({ hasExisting: false, itemCount: 2, basesCount: 0 }), true);
// Đã có trên đĩa thì luôn ghi tiếp — kể cả khi vừa gỡ hết Base (gỡ cũng là chủ ý).
assert.strictEqual(shouldPersistSession({ hasExisting: true, itemCount: 0, basesCount: 0 }), true);
console.log('✓ gắn Base được giữ, nhưng bấm "+" rồi bỏ đó vẫn không đẻ hội thoại rỗng');

// Và larkService phải gọi vào luật đó, không tự viết lại.
const svc2 = readFileSync(join(__dirname, '..', 'main', 'runtime', 'lark', 'larkService.ts'), 'utf8');
const save = svc2.slice(svc2.indexOf('async larkSaveSession('), svc2.indexOf('async larkSaveSession(') + 2500);
assert.ok(/shouldPersistSession\(/.test(save), 'larkSaveSession phải dùng luật chung');
// Bỏ qua thì vẫn phải NHỚ Base vào bản nháp, nếu không lần lưu sau lại lấy danh sách cũ.
assert.ok(/this\.draftBases\.set\(id, bases\)/.test(save), 'bỏ qua ghi đĩa thì vẫn phải cập nhật bản nháp');
console.log('✓ larkSaveSession dùng luật chung, và vẫn nhớ Base vào bản nháp khi chưa ghi đĩa');

// ── Vòng lặp "Tự chạy tiếp" (lỗi thật 18/10/2026) ───────────────────────────────────────────────
// Agent trả lời "bạn bấm vào nhóm … rồi nhắn đọc tiếp" + "còn thiếu từ 1/10 đến 16/10". Câu đó bị
// đọc thành (a) ngày 1/10 là tiến độ "1 trên 10", (b) "chưa xong" ⇒ tự chạy tiếp 4 lần in lại y hệt.
const choNguoiDung = 'Việc chưa xong. Bạn bấm vào nhóm Đầu tư AI trong cửa sổ Zalo Web, rồi nhắn mình "đọc tiếp".';
assert.strictEqual(waitingOnUser(choNguoiDung), true, 'câu chờ người dùng phải nhận ra được');
assert.strictEqual(waitingOnUser('Đã tạo xong 8 bảng và 10 workflow.'), false);
assert.strictEqual(
  nextStepAfterTurn({ hasConclusion: true, conclusionSaysUnfinished: true, conclusionWaitsOnUser: true, usedTools: true, ctxUsed: 0.2, autoLeft: 3, canHandoff: true }),
  'none',
  'đang chờ người dùng ⇒ KHÔNG tự chạy tiếp',
);
// Ngày tháng kiểu Việt không phải tiến độ.
assert.strictEqual(saysUnfinished('Còn thiếu từ 1/10 đến 16/10, đã xong ngày 17/10.'), false, 'ngày 1/10 không phải "1 trên 10"');
assert.strictEqual(saysUnfinished('Mới dựng 8/24 bảng.'), true, 'tiến độ thật vẫn nhận ra');
assert.strictEqual(saysUnfinished('Hạn chót 5/10/2026, mọi thứ đã xong.'), false);
console.log('✓ tự chạy tiếp: dừng khi chờ người dùng; ngày tháng không bị đọc thành tiến độ');
