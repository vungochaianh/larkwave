/**
 * Hội thoại cũ phải NHỚ ngữ cảnh: phiên Claude CLI gốc (`~/.claude/projects/<slug(cwd)>/<id>.jsonl`)
 * được chép sang thư mục làm việc Larkwave (lúc nhập từ Toolswave + "cứu" lúc `--resume` hụt), và khi
 * không còn bản gốc ở đâu thì lịch sử nhồi lại đủ dài + giữ kết quả công cụ/tệp.
 *
 *   bash apps/desktop/test/run.sh
 */
const assert = require('node:assert');
const Module = require('node:module');
const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, statSync, utimesSync, realpathSync } = require('node:fs');
const { createHash } = require('node:crypto');
const { tmpdir, homedir } = require('node:os');
const { join, relative } = require('node:path');

const orig = Module._load;
Module._load = function (req) {
  if (req === 'electron') return { safeStorage: { isEncryptionAvailable: () => false } };
  return orig.apply(this, arguments);
};

const B = join(__dirname, '..', '.test-build');
const C = require(join(B, 'runtime', 'claudeSessions.js'));
const M = require(join(B, 'runtime', 'migrate', 'toolswaveMigrator.js'));
const T = require(join(B, 'runtime', 'lark', 'transcript.js'));
const CB = require(join(B, 'runtime', 'contextBudget.js'));
const X = require(join(B, 'runtime', 'lark', 'larkToolExec.js'));

let pass = 0;
let fail = 0;
const t = async (name, fn) => {
  try {
    await fn();
    pass++;
    console.log('  ✓', name);
  } catch (e) {
    fail++;
    console.log('  ✗', name, '\n     ', e && e.message);
  }
};
const put = (p, v) => {
  mkdirSync(join(p, '..'), { recursive: true });
  writeFileSync(p, typeof v === 'string' || Buffer.isBuffer(v) ? v : JSON.stringify(v));
};
const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
function treeHash(dir) {
  const h = createHash('sha256');
  const walk = (d) => {
    if (!existsSync(d)) return;
    for (const f of readdirSync(d).sort()) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else h.update(relative(dir, p)).update(readFileSync(p));
    }
  };
  walk(dir);
  return h.digest('hex');
}
/** Băm kiểu Java viết ĐỘC LẬP với mã nguồn (để bài kiểm không tự đúng với chính nó). */
function javaHash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = Math.imul(31, h) + s.charCodeAt(i) | 0;
  return h;
}

const SID = '68470fd4-14ee-48da-9b3c-89537dcf9b5c';
const SID2 = 'ad99aa4b-1b37-41b6-a3b8-765d8b499620';

(async () => {
  // ── slug ────────────────────────────────────────────────────────────────────────────────────
  await t('slug khớp tên thư mục thật của CLI: Toolswave + Larkwave (development) + bản cài + Windows', async () => {
    assert.strictEqual(
      C.claudeProjectSlug('/Users/deveris/Library/Application Support/@toolswave/desktop/lark/work/da6b8d9f-d323-4a3c-8eb7-4734b813c561'),
      '-Users-deveris-Library-Application-Support--toolswave-desktop-lark-work-da6b8d9f-d323-4a3c-8eb7-4734b813c561',
    );
    assert.strictEqual(
      C.claudeProjectSlug('/Users/deveris/Library/Application Support/@larkwave/desktop (development)/lark/work/52fbd9a1-f9bf-4e01-a497-46cd6d03c720'),
      '-Users-deveris-Library-Application-Support--larkwave-desktop--development--lark-work-52fbd9a1-f9bf-4e01-a497-46cd6d03c720',
    );
    assert.strictEqual(
      C.claudeProjectSlug('/Users/u/Library/Application Support/@toolswave/desktop (development)/lark/work/x1'),
      '-Users-u-Library-Application-Support--toolswave-desktop--development--lark-work-x1',
    );
    assert.strictEqual(C.claudeProjectSlug('/Users/u/Library/Application Support/@larkwave/desktop/lark/work/x1'), '-Users-u-Library-Application-Support--larkwave-desktop-lark-work-x1');
    assert.strictEqual(C.claudeProjectSlug('C:\\Users\\u\\AppData\\Roaming\\@larkwave\\desktop\\lark\\work\\x1'), 'C--Users-u-AppData-Roaming--larkwave-desktop-lark-work-x1');
  });
  await t('slug: ký tự ngoài ASCII mỗi ký tự 1 dấu "-", NFD = NFC; đường dài >200 cắt + băm Java base36', async () => {
    assert.strictEqual(C.claudeProjectSlug('/Users/Đức/Tài liệu'), '-Users---c-T-i-li-u');
    assert.strictEqual(C.claudeProjectSlug('/Users/Đức/Tài liệu'.normalize('NFD')), C.claudeProjectSlug('/Users/Đức/Tài liệu'));
    const long = '/Users/u/' + 'thu-muc-rat-dai/'.repeat(20) + 'lark/work/abc';
    const raw = long.replace(/[^a-zA-Z0-9]/g, '-');
    assert.ok(raw.length > 200);
    assert.strictEqual(C.claudeProjectSlug(long), `${raw.slice(0, 200)}-${Math.abs(javaHash(long)).toString(36)}`);
  });
  await t('slug đối chiếu với thư mục THẬT trong ~/.claude/projects của máy này (nếu có)', async () => {
    const projects = join(homedir(), '.claude', 'projects');
    if (!existsSync(projects)) return;
    const dirs = new Set(readdirSync(projects));
    const roots = [
      join(homedir(), 'Library', 'Application Support', '@toolswave', 'desktop', 'lark', 'work'),
      join(homedir(), 'Library', 'Application Support', '@larkwave', 'desktop (development)', 'lark', 'work'),
    ];
    let checked = 0;
    for (const r of roots) {
      if (!existsSync(r)) continue;
      for (const conv of readdirSync(r)) {
        const slug = C.claudeProjectSlug(realpathSync(join(r, conv)));
        if (dirs.has(slug)) checked++;
      }
    }
    // Có thư mục làm việc ⇒ ít nhất một slug phải trùng đúng tên thư mục CLI đã tạo.
    if (roots.some((r) => existsSync(r) && readdirSync(r).length)) assert.ok(checked > 0, 'không slug nào khớp thư mục thật');
  });
  await t('thư mục cấu hình theo CLAUDE_CONFIG_DIR, tên chung theo CLAUDE_CODE_PROJECT_DIR_NAME (chỉ khi có CONFIG_DIR)', async () => {
    assert.strictEqual(C.claudeProjectsDir({}, '/h'), '/h/.claude/projects');
    assert.strictEqual(C.claudeProjectsDir({ CLAUDE_CONFIG_DIR: '/cfg' }, '/h'), '/cfg/projects');
    assert.strictEqual(C.claudeProjectDirFor('/nope/x', { CLAUDE_CONFIG_DIR: '/cfg', CLAUDE_CODE_PROJECT_DIR_NAME: 'shared' }, '/h'), '/cfg/projects/shared');
    assert.strictEqual(C.claudeProjectDirFor('/nope/x', { CLAUDE_CODE_PROJECT_DIR_NAME: 'shared' }, '/h'), '/h/.claude/projects/-nope-x');
    assert.strictEqual(C.claudeProjectDirFor('/nope/x', { CLAUDE_CONFIG_DIR: '/cfg', CLAUDE_CODE_PROJECT_DIR_NAME: '../bad' }, '/h'), '/cfg/projects/-nope-x');
  });
  await t('cwd như CLI thấy: realpath (thư mục tạm macOS /var → /private/var) + NFC', async () => {
    const d = mkdtempSync(join(tmpdir(), 'lw-cwd-'));
    assert.strictEqual(C.cliCwd(d), realpathSync(d).normalize('NFC'));
  });

  // ── tìm + chép ───────────────────────────────────────────────────────────────────────────────
  const CFG = mkdtempSync(join(tmpdir(), 'lw-claude-cfg-'));
  const P = join(CFG, 'projects');
  const env = { CLAUDE_CONFIG_DIR: CFG };
  const old1 = join(P, '-old-a');
  const old2 = join(P, '-old-b');
  put(join(old1, `${SID}.jsonl`), '{"a":1}\n');
  put(join(old2, `${SID}.jsonl`), '{"a":1}\n{"b":2}\n');
  put(join(old2, SID, 'tool-results', 'r1.txt'), 'kết quả công cụ');
  put(join(old2, `${SID2}.jsonl`), '{"other":true}\n');
  put(join(old2, `${SID.slice(0, 30)}.jsonl`), 'tiền tố giống — không được lấy');
  utimesSync(join(old1, `${SID}.jsonl`), new Date(1000e3), new Date(1000e3));
  utimesSync(join(old2, `${SID}.jsonl`), new Date(2000e3), new Date(2000e3));

  await t('tìm phiên: ĐÚNG id, bản mới nhất thắng, bỏ thư mục loại trừ, từ chối id lạ', async () => {
    const f = await C.findClaudeTranscript(SID, { projectsDir: P });
    assert.strictEqual(f.dir, old2);
    const g = await C.findClaudeTranscript(SID, { projectsDir: P, excludeDirs: [old2] });
    assert.strictEqual(g.dir, old1);
    assert.strictEqual(await C.findClaudeTranscript('../../etc/passwd', { projectsDir: P }), null);
    assert.strictEqual(await C.findClaudeTranscript('3f0c0000-0000-0000-0000-000000000000', { projectsDir: P }), null);
    const pref = await C.findClaudeTranscript(SID, { projectsDir: P, preferDirs: [old1] });
    assert.strictEqual(pref.dir, old1, 'thư mục ưu tiên được xét trước');
  });
  await t('chép: copied → unchanged (đích mới hơn) → updated (đích là đoạn đầu) → diverged (giữ đích); không di chuyển; thư mục phụ', async () => {
    const to = join(P, '-new');
    const r1 = await C.copyClaudeSession({ sessionId: SID, fromDir: old2, toDir: to });
    assert.strictEqual(r1.status, 'copied');
    assert.strictEqual(r1.sidecarFiles, 1);
    assert.ok(existsSync(join(old2, `${SID}.jsonl`)), 'nguồn còn nguyên (chép, không chuyển)');
    assert.strictEqual(readFileSync(join(to, SID, 'tool-results', 'r1.txt'), 'utf8'), 'kết quả công cụ');
    assert.ok(!existsSync(join(to, `${SID2}.jsonl`)), 'không chép phiên id khác');
    assert.strictEqual((await C.copyClaudeSession({ sessionId: SID, fromDir: old2, toDir: to })).status, 'unchanged');
    // Bên nguồn chạy tiếp (dài thêm), bên đích chưa → cập nhật.
    writeFileSync(join(old2, `${SID}.jsonl`), '{"a":1}\n{"b":2}\n{"c":3}\n');
    utimesSync(join(to, `${SID}.jsonl`), new Date(1500e3), new Date(1500e3));
    utimesSync(join(old2, `${SID}.jsonl`), new Date(3000e3), new Date(3000e3));
    assert.strictEqual((await C.copyClaudeSession({ sessionId: SID, fromDir: old2, toDir: to })).status, 'updated');
    assert.strictEqual(readFileSync(join(to, `${SID}.jsonl`), 'utf8'), '{"a":1}\n{"b":2}\n{"c":3}\n');
    // Hai bên cùng chạy tiếp → không ghi đè đích.
    writeFileSync(join(to, `${SID}.jsonl`), '{"a":1}\n{"LARKWAVE":1}\n');
    utimesSync(join(to, `${SID}.jsonl`), new Date(1500e3), new Date(1500e3));
    assert.strictEqual((await C.copyClaudeSession({ sessionId: SID, fromDir: old2, toDir: to })).status, 'diverged');
    assert.match(readFileSync(join(to, `${SID}.jsonl`), 'utf8'), /LARKWAVE/);
    // Chạy thử không ghi gì.
    const dry = join(P, '-dry');
    assert.strictEqual((await C.copyClaudeSession({ sessionId: SID, fromDir: old2, toDir: dry, dryRun: true })).status, 'copied');
    assert.ok(!existsSync(dry));
  });
  await t('cứu phiên lúc --resume hụt: chép đúng id vào slug của cwd hiện tại; lần hai không làm gì', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'lw-conv-'));
    const r = await C.rescueClaudeSession(SID2, cwd, env);
    const dest = join(P, C.claudeProjectSlug(realpathSync(cwd)));
    assert.ok(r && r.to === dest && r.from === old2);
    assert.ok(existsSync(join(dest, `${SID2}.jsonl`)));
    assert.ok(!existsSync(join(dest, `${SID}.jsonl`)), 'không bao giờ kéo theo phiên khác');
    assert.strictEqual(await C.rescueClaudeSession(SID2, cwd, env), null);
    assert.strictEqual(await C.rescueClaudeSession('b0000000-0000-4000-8000-000000000000', cwd, env), null);
  });

  // ── nhập từ Toolswave: nối phiên Claude ─────────────────────────────────────────────────────
  const UID = 'cmuser0000000000000000001';
  const S = mkdtempSync(join(tmpdir(), 'tw-src-'));
  const D = mkdtempSync(join(tmpdir(), 'lw-dst-'));
  const CFG2 = mkdtempSync(join(tmpdir(), 'lw-claude2-'));
  const env2 = { CLAUDE_CONFIG_DIR: CFG2 };
  const P2 = join(CFG2, 'projects');
  const conv = (id, sid, extra = {}) => ({ id, claudeSessionId: sid, agentSessionId: sid, title: id, createdAt: '2026-09-01', updatedAt: '2026-09-02', items: [{ id: `${id}-m`, kind: 'msg', role: 'user', text: 'xin chào' }], ...extra });
  const A = 'aaaaaaaa-0000-4000-8000-000000000001'; // có bản ghi ở slug Toolswave
  const Bq = 'bbbbbbbb-0000-4000-8000-000000000002'; // bản ghi ở thư mục dự án KHÁC (cwd cũ)
  const Cq = 'cccccccc-0000-4000-8000-000000000003'; // không còn bản ghi
  const Dq = 'dddddddd-0000-4000-8000-000000000004'; // Larkwave có sẵn hội thoại, chưa có phiên
  const Eq = 'eeeeeeee-0000-4000-8000-000000000005'; // Larkwave đã chạy tiếp bằng phiên của nó
  for (const [cid, sid] of [['c-a', A], ['c-b', Bq], ['c-c', Cq], ['c-d', Dq], ['c-e', Eq]]) put(join(S, 'lark/sessions', UID, `${cid}.json`), conv(cid, sid));
  mkdirSync(join(S, 'lark/work/c-a'), { recursive: true });
  const twSlugA = join(P2, C.claudeProjectSlug(realpathSync(join(S, 'lark/work/c-a'))));
  put(join(twSlugA, `${A}.jsonl`), '{"type":"user","message":"bảng đầu tên Khách hàng"}\n');
  put(join(twSlugA, A, 'tool-results', 'mcp-lark-overview.txt'), 'tbl1: Khách hàng (12 cột)');
  put(join(P2, '-Users-x-somewhere-else', `${Bq}.jsonl`), '{"b":1}\n');
  put(join(P2, '-Users-x-somewhere-else', `${Eq}.jsonl`), '{"e":1}\n');
  put(join(P2, '-Users-x-somewhere-else', `${Dq}.jsonl`), '{"d":1}\n');
  put(join(D, 'lark/sessions', UID, 'c-d.json'), { ...conv('c-d', ''), agentSessionId: undefined, claudeSessionId: '' });
  const LW_OWN = 'ffffffff-0000-4000-8000-000000000006';
  put(join(D, 'lark/sessions', UID, 'c-e.json'), { ...conv('c-e', LW_OWN), updatedAt: '2026-09-09' });
  const srcBefore = treeHash(S);

  let rep;
  await t('nhập: chép <id>.jsonl + thư mục phụ sang slug thư mục làm việc Larkwave, GIỮ id phiên', async () => {
    rep = await M.migrateFromToolswave({ sources: [S], dest: D, userId: UID, claudeEnv: env2 });
    const lwSlugA = join(P2, C.claudeProjectSlug(realpathSync(join(D, 'lark/work/c-a'))));
    assert.ok(existsSync(join(lwSlugA, `${A}.jsonl`)));
    assert.strictEqual(readFileSync(join(lwSlugA, A, 'tool-results', 'mcp-lark-overview.txt'), 'utf8'), 'tbl1: Khách hàng (12 cột)');
    const s = J(join(D, 'lark/sessions', UID, 'c-a.json'));
    assert.strictEqual(s.agentSessionId, A);
    assert.strictEqual(s.claudeSessionId, A);
    assert.ok(existsSync(join(twSlugA, `${A}.jsonl`)), 'bản Toolswave còn nguyên');
    assert.strictEqual(treeHash(S), srcBefore, 'thư mục Toolswave không đổi');
  });
  await t('nhập: phiên ở cwd cũ khác vẫn được tìm theo đúng id; không còn bản ghi ⇒ bỏ id + ghi lý do', async () => {
    assert.strictEqual(J(join(D, 'lark/sessions', UID, 'c-b.json')).agentSessionId, Bq);
    assert.ok(existsSync(join(P2, C.claudeProjectSlug(realpathSync(join(D, 'lark/work/c-b'))), `${Bq}.jsonl`)));
    const c = J(join(D, 'lark/sessions', UID, 'c-c.json'));
    assert.strictEqual(c.agentSessionId, undefined);
    assert.strictEqual(c.claudeSessionId, '');
    assert.ok(rep.skipped.some((x) => /phiên Claude/.test(x.reason)));
  });
  await t('nhập: hội thoại Larkwave chưa có phiên → nhận phiên gốc; đã chạy tiếp bằng phiên riêng → giữ phiên Larkwave', async () => {
    assert.strictEqual(J(join(D, 'lark/sessions', UID, 'c-d.json')).agentSessionId, Dq);
    assert.ok(existsSync(join(P2, C.claudeProjectSlug(realpathSync(join(D, 'lark/work/c-d'))), `${Dq}.jsonl`)));
    const e = J(join(D, 'lark/sessions', UID, 'c-e.json'));
    assert.strictEqual(e.agentSessionId, LW_OWN);
    const slugE = C.claudeProjectSlug(C.cliCwd(join(D, 'lark/work/c-e')));
    assert.ok(!existsSync(join(P2, slugE, `${Eq}.jsonl`)), 'không kéo phiên Toolswave đè lên hội thoại Larkwave đã chạy tiếp');
  });
  await t('báo cáo: "phiên Claude đã nối lại" đếm đúng; chạy lại không đổi gì (idempotent)', async () => {
    assert.strictEqual(rep.counts.claudeSessions.added, 3, JSON.stringify(rep.counts.claudeSessions)); // c-a, c-b, c-d
    const h1 = treeHash(D);
    const h2 = treeHash(CFG2);
    const again = await M.migrateFromToolswave({ sources: [S], dest: D, userId: UID, claudeEnv: env2 });
    assert.strictEqual(again.counts.claudeSessions.added + again.counts.claudeSessions.merged, 0);
    assert.strictEqual(treeHash(D), h1);
    assert.strictEqual(treeHash(CFG2), h2);
  });
  await t('lượt bổ sung cho máy đã nhập bằng bản cũ (id bị bỏ): sessionsOnly nối lại phiên, không đụng hạng mục khác', async () => {
    const D2 = mkdtempSync(join(tmpdir(), 'lw-dst2-'));
    // Trạng thái sau bản nhập CŨ: hội thoại có, id phiên rỗng.
    put(join(D2, 'lark/sessions', UID, 'c-a.json'), { ...conv('c-a', ''), agentSessionId: undefined, claudeSessionId: '' });
    put(join(S, 'skills/registry.json'), [{ id: 'kc-x', name: 'x' }]);
    put(join(S, 'skills/lib/kc-x/SKILL.md'), '---\nname: kc-x\n---\nx');
    const r = await M.migrateFromToolswave({ sources: [S], dest: D2, userId: UID, claudeEnv: env2, sessionsOnly: true });
    assert.strictEqual(J(join(D2, 'lark/sessions', UID, 'c-a.json')).agentSessionId, A);
    assert.ok(existsSync(join(P2, C.claudeProjectSlug(realpathSync(join(D2, 'lark/work/c-a'))), `${A}.jsonl`)));
    assert.ok(!existsSync(join(D2, 'skills')), 'sessionsOnly không nhập kỹ năng');
    assert.strictEqual(r.counts.skills.added, 0);
  });
  await t('chạy thử: không chép phiên nào', async () => {
    const D3 = mkdtempSync(join(tmpdir(), 'lw-dst3-'));
    const before = treeHash(CFG2);
    const r = await M.migrateFromToolswave({ sources: [S], dest: D3, userId: UID, claudeEnv: env2, dryRun: true });
    assert.ok(r.counts.claudeSessions.added >= 3);
    assert.strictEqual(treeHash(CFG2), before);
    assert.ok(!existsSync(join(D3, 'lark')));
  });

  // ── đường lui: lịch sử nhồi lại ─────────────────────────────────────────────────────────────
  await t('ngân sách lịch sử theo cửa sổ model/runner: 1M → 60k, Haiku 200k → 16k, Codex/Grok/Gemini cũng lớn hơn 9k', async () => {
    assert.strictEqual(CB.transcriptBudgetTokens('claude', 'claude-opus-5-5'), 60000);
    assert.strictEqual(CB.transcriptBudgetTokens('claude', undefined), 60000);
    assert.strictEqual(CB.transcriptBudgetTokens('claude', 'claude-haiku-4-5'), 16000);
    assert.strictEqual(CB.transcriptBudgetTokens('gemini'), 60000);
    assert.ok(CB.transcriptBudgetTokens('codex') > 9000 && CB.transcriptBudgetTokens('codex') <= 60000);
    assert.ok(CB.transcriptBudgetTokens('grok') > 9000);
  });
  const items = [];
  items.push({ kind: 'msg', role: 'user', text: 'NHIỆM VỤ: gộp 5 bảng của Base X' });
  for (let i = 0; i < 400; i++) {
    items.push({ kind: 'msg', role: i % 2 ? 'assistant' : 'user', text: `lượt ${i} ` + 'nội dung dài '.repeat(40) });
    if (i === 200) items.push({ kind: 'tool', call: { name: 'lark_web_write_records', status: 'ok', input: { app_token: 'bX', table_id: 'tblA', rows: [[1, 2]] }, summary: 'đã ghi 3 dòng', memo: 'written=3 · record_ids=[recA,recB,recC] · https://x.larksuite.com/base/bX?table=tblA' } });
    if (i === 300) items.push({ kind: 'file', name: 'Báo cáo.xlsx', path: '/w/Báo cáo.xlsx', bytes: 20480, mime: 'x', preview: { summary: '2 sheet · «Tổng hợp» 120 dòng × 6 cột' } });
  }
  await t('lịch sử 60k giữ nhiều hơn hẳn 9k, ghim tin đầu, có kết quả công cụ (memo) + thẻ tệp', async () => {
    const small = T.buildTranscript(items, 9000);
    const big = T.buildTranscript(items, 60000);
    assert.ok(big.length > small.length * 4, `${big.length} vs ${small.length}`);
    assert.ok(big.startsWith('Người dùng: NHIỆM VỤ'), 'tin đầu được ghim');
    assert.ok(small.startsWith('Người dùng: NHIỆM VỤ'));
    assert.match(big, /record_ids=\[recA,recB,recC\]/);
    assert.match(big, /đã ghi 3 dòng/);
    assert.match(big, /\{"app_token":"bX","table_id":"tblA"\}/);
    assert.match(big, /Tệp đã dựng cho người dùng: «Báo cáo\.xlsx» · 20 KB · 2 sheet/);
    assert.ok(T.approxTokens(big) <= 60000 + 3000);
  });
  await t('lịch sử API: bắt đầu bằng user, xen kẽ, không kết thúc bằng user; công cụ gập vào trợ lý', async () => {
    const h = T.buildApiHistory(items, 60000);
    assert.strictEqual(h[0].role, 'user');
    for (let i = 1; i < h.length; i++) assert.notStrictEqual(h[i].role, h[i - 1].role);
    assert.strictEqual(h[h.length - 1].role, 'assistant');
    assert.ok(h.some((m) => m.role === 'assistant' && /record_ids/.test(m.text)));
  });
  await t('memo kết quả công cụ: id/số lượng/link/tên, bỏ bí mật + dữ liệu thô', async () => {
    const m = X.memoForTool('x', { ok: true, written: 3, table_id: 'tblA', record_ids: ['r1', 'r2'], url: 'https://t.larksuite.com/base/b?table=tblA', name: 'Khách hàng', access_token: 'BÍ-MẬT', tmp_url: 'https://lộ', preview: { rows: [[1]] } });
    assert.match(m, /written=3/);
    assert.match(m, /table_id=tblA/);
    assert.match(m, /record_ids=\[r1,r2\]/);
    assert.match(m, /https:\/\/t\.larksuite\.com/);
    assert.match(m, /«Khách hàng»/);
    assert.ok(!/BÍ-MẬT|lộ/.test(m));
    assert.strictEqual(X.memoForTool('x', null), '');
  });

  console.log(fail ? `\n${fail} ca SAI` : `\nTẤT CẢ ĐÚNG (${pass})`);
  process.exit(fail ? 1 : 0);
})();
