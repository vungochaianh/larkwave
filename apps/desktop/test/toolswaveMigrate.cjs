/**
 * Nhập dữ liệu từ app desktop Toolswave — trên FIXTURE dựng tạm (không đụng dữ liệu thật).
 *
 * Chốt: ánh xạ theo cùng user id, `_local` → `_local`, tệp phẳng kiểu cũ → `_local`, KHÔNG nhập
 * tài khoản khác, bỏ mọi *.bin / blob mã hoá / trường bí mật, không mang runnerId, không ghi đè bản
 * Larkwave mới hơn, tôn trọng bia mộ, chạy thử không ghi gì, chạy lại không đổi gì, thư mục
 * Toolswave không bị đổi một byte, kỹ năng vào thư mục CLI với tiền tố `larkwave-`.
 *
 *   bash apps/desktop/test/run.sh
 */
const assert = require('node:assert');
const Module = require('node:module');
const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, statSync } = require('node:fs');
const { createHash } = require('node:crypto');
const { tmpdir } = require('node:os');
const { join, relative } = require('node:path');

const orig = Module._load;
Module._load = function (req) {
  if (req === 'electron') return { safeStorage: { isEncryptionAvailable: () => false } };
  return orig.apply(this, arguments);
};

const B = join(__dirname, '..', '.test-build');
const M = require(join(B, 'runtime', 'migrate', 'toolswaveMigrator.js'));

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

const UID = 'cmuser0000000000000000001';
const OTHER = 'cmother000000000000000009';
const put = (p, v) => {
  mkdirSync(join(p, '..'), { recursive: true });
  writeFileSync(p, typeof v === 'string' || Buffer.isBuffer(v) ? v : JSON.stringify(v));
};
const sess = (id, updatedAt, items, extra = {}) => ({
  id,
  claudeSessionId: `cli-${id}`,
  title: `t-${id}`,
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt,
  items,
  ...extra,
});
const it = (id, text) => ({ id, kind: 'msg', role: 'user', text, ts: 1 });

function treeHash(dir) {
  const h = createHash('sha256');
  const walk = (d) => {
    for (const f of readdirSync(d).sort()) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else h.update(relative(dir, p)).update(readFileSync(p));
    }
  };
  walk(dir);
  return h.digest('hex');
}

function makeSource() {
  const S = mkdtempSync(join(tmpdir(), 'tw-src-'));
  // hội thoại: của user, _local, phẳng kiểu cũ, của tài khoản KHÁC
  put(join(S, 'lark/sessions', UID, 's-new.json'), sess('s-new', '2026-09-10T00:00:00Z', [
    it('a', 'mới'),
    { id: 'f1', kind: 'file', name: 'report.xlsx', path: join(S, 'lark/work/s-new/report.xlsx'), mime: 'x', bytes: 1024, ts: 2 },
    { id: 'f2', kind: 'file', name: 'huge.bin.out', path: join(S, 'lark/work/s-new/huge.bin.out'), mime: 'x', bytes: 2048, ts: 3 },
    { id: 'f3', kind: 'file', name: 'sub.csv', path: join(S, 'lark/work/s-new/thu muc/sub.csv'), mime: 'x', bytes: 3, ts: 4 },
  ], { agentSessionId: 'ag-1' }));
  put(join(S, 'lark/sessions', UID, 's-both.json'), sess('s-both', '2026-09-05T00:00:00Z', [it('x', 'cũ'), it('tw-only', 'chỉ ở Toolswave')]));
  put(join(S, 'lark/sessions', UID, 's-dead.json'), sess('s-dead', '2026-09-05T00:00:00Z', [it('d', 'đã xoá ở Larkwave')]));
  put(join(S, 'lark/sessions', '_local', 's-local.json'), sess('s-local', '2026-09-02T00:00:00Z', [it('l', 'chưa đăng nhập')]));
  put(join(S, 'lark/sessions', 's-flat.json'), sess('s-flat', '2026-08-01T00:00:00Z', [it('f', 'kiểu cũ')]));
  put(join(S, 'lark/sessions', OTHER, 's-other.json'), sess('s-other', '2026-09-01T00:00:00Z', [it('o', 'người khác')]));
  // cấu hình Lark
  put(join(S, 'lark/accounts', UID, 'settings.json'), { autoApprove: true, defaultModel: 'opus', runnerId: 'pc-tw', webHost: 'x.larksuite.com', appSecret: 'LỘ' });
  put(join(S, 'lark/accounts', UID, 'bases.json'), [{ appToken: 'bA', name: 'A' }, { appToken: 'bB', name: 'B' }]);
  put(join(S, 'lark/accounts', UID, 'automations.json'), [{ id: 'au1', name: 'lịch 1', appToken: 'bA', tableId: 'tb1' }]);
  put(join(S, 'lark/accounts', UID, 'creds.bin'), Buffer.concat([Buffer.from('v10'), Buffer.from([1, 2, 3, 0, 255])]));
  put(join(S, 'lark/accounts', UID, 'apps.bin'), 'PLAIN:[{"appId":"cli_x","appSecret":"LỘ"}]');
  put(join(S, 'lark/accounts', UID, 'user.bin'), Buffer.from([0x76, 0x31, 0x30, 9, 9, 0]));
  put(join(S, 'lark/accounts', OTHER, 'settings.json'), { defaultModel: 'other-user' });
  put(join(S, 'lark/settings.json'), { defaultRunner: 'claude' }); // phẳng kiểu cũ → _local
  // bia mộ, Đặc tả, lịch sử đăng nhập, grants, work
  put(join(S, 'lark/deleted', UID, 'deleted.json'), { 's-gone': 1700000000000 });
  put(join(S, 'lark/specs', UID, 'spec.json'), { v: 1, updatedAt: '2026-09-01', bases: [{ appToken: 'bA', source: { fetchedAt: '2026-09-01' } }], workflows: [], relations: [], insights: [], syncLog: [] });
  put(join(S, `lark-relogin-${UID}.json`), [{ at: '2026-09-01T00:00:00Z', source: 'local', outcome: 'success' }]);
  put(join(S, 'lark/grants.json'), { g1: { appTokens: ['bA'], mode: 'ask' } });
  put(join(S, 'lark/work/s-new/report.xlsx'), Buffer.alloc(1024, 1));
  put(join(S, 'lark/work/s-new/huge.bin.out'), Buffer.alloc(2048, 1));
  put(join(S, 'lark/work/s-new/.claude/state.json'), '{}');
  put(join(S, 'lark/work/s-new/thu muc/sub.csv'), 'a,b');
  put(join(S, 'lark/work/s-new/~$report.xlsx'), 'lock');
  put(join(S, 'lark/work/s-other/x.txt'), 'không thuộc hội thoại được nhập');
  // kỹ năng + plugin
  put(join(S, 'skills/registry.json'), [{ id: 'kc-a', name: 'KC A', description: 'd', enabled: true, scope: ['claude'] }, { id: 'kc-b', name: 'KC B', description: 'd', enabled: true, scope: ['claude'] }]);
  put(join(S, 'skills/lib/kc-a/SKILL.md'), '---\nname: kc-a\ndescription: d\nneeds: x\n---\nThân A');
  put(join(S, 'skills/lib/kc-b/SKILL.md'), '---\nname: kc-b\ndescription: d\n---\nThân B');
  put(join(S, 'skills/snapshots.json'), { 'kc-a': [{ at: '1', by: 'you', what: 'tạo', md: 'x' }] });
  put(join(S, 'skills/set-runs.json'), { set1: [{ at: '1' }] });
  put(join(S, 'plugins/registry.json'), [{ id: 'p1', name: 'P1', version: '1', enabled: true, signed: false }]);
  put(join(S, 'plugins/p1/manifest.json'), { id: 'p1' });
  // thứ cố ý bỏ
  put(join(S, 'account/token.bin'), Buffer.from([0x76, 0x31, 0x30, 1, 0]));
  put(join(S, 'agent/settings.json'), { enabled: true, deviceName: 'MyMac' });
  put(join(S, 'Partitions/tw-lark-web-x/Cookies'), Buffer.from([0, 1, 2]));
  put(join(S, 'apps-index.json'), '{}');
  return S;
}

function makeDest() {
  const D = mkdtempSync(join(tmpdir(), 'lw-dst-'));
  // Larkwave đã có bản MỚI HƠN của s-both (có item riêng) + đã xoá s-dead.
  put(join(D, 'lark/sessions', UID, 's-both.json'), sess('s-both', '2026-09-20T00:00:00Z', [it('x', 'cũ'), it('lw-only', 'chỉ ở Larkwave')], { claudeSessionId: 'cli-larkwave' }));
  put(join(D, 'lark/deleted', UID, 'deleted.json'), { 's-dead': 1800000000000 });
  put(join(D, 'lark/accounts', UID, 'settings.json'), { defaultModel: 'fable' });
  put(join(D, 'skills/registry.json'), [{ id: 'kc-b', name: 'KC B (Larkwave)', description: 'mine', enabled: true, scope: ['claude'] }]);
  put(join(D, 'skills/lib/kc-b/SKILL.md'), '---\nname: kc-b\ndescription: mine\n---\nBản Larkwave');
  return D;
}

const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
// Kín: không bao giờ quét/ghi ~/.claude thật của máy chạy kiểm.
const claudeEnv = { CLAUDE_CONFIG_DIR: mkdtempSync(join(tmpdir(), 'lw-claude-')) };

(async () => {
  const S = makeSource();
  const D = makeDest();
  const before = treeHash(S);
  const destBefore = treeHash(D);

  await t('tìm thấy thư mục Toolswave (theo đường dẫn từng HĐH) + bỏ thư mục chỉ có cache', async () => {
    const mac = M.toolswaveDataDirCandidates('darwin', '/Users/u');
    assert.ok(mac.includes('/Users/u/Library/Application Support/@toolswave/desktop'));
    assert.ok(mac.includes('/Users/u/Library/Application Support/@toolswave/desktop (development)'));
    const win = M.toolswaveDataDirCandidates('win32', 'C:/u', 'C:/u/AppData/Roaming');
    assert.ok(win.some((p) => p.includes('@toolswave') && p.includes('Roaming')));
    const empty = mkdtempSync(join(tmpdir(), 'tw-empty-'));
    assert.deepStrictEqual(M.findToolswaveDataDirs([S, empty, D], D), [S]);
  });

  let dry;
  await t('chạy thử: đếm đủ, KHÔNG ghi gì (cả đích lẫn nguồn)', async () => {
    dry = await M.migrateFromToolswave({ sources: [S], dest: D, userId: UID, claudeEnv, dryRun: true, maxWorkFileBytes: 1500 });
    assert.strictEqual(dry.dryRun, true);
    assert.strictEqual(treeHash(D), destBefore);
    assert.strictEqual(treeHash(S), before);
    assert.strictEqual(dry.counts.sessions.added, 3); // s-new, s-local, s-flat
    assert.strictEqual(dry.counts.sessions.merged, 1); // s-both
    assert.strictEqual(dry.counts.skills.added, 1); // kc-a (kc-b đã có)
    assert.strictEqual(dry.counts.skills.unchanged, 1);
    assert.strictEqual(dry.followUps.length, 2);
  });

  let real;
  await t('chạy thật xong — thư mục Toolswave không đổi một byte', async () => {
    real = await M.migrateFromToolswave({ sources: [S], dest: D, userId: UID, claudeEnv, maxWorkFileBytes: 1500 });
    assert.strictEqual(treeHash(S), before);
    assert.deepStrictEqual(real.counts, dry.counts, 'chạy thử phải đếm đúng như chạy thật');
  });

  await t('cùng user id: hội thoại vào lark/sessions/<id>; _local và tệp phẳng vào _local', async () => {
    assert.ok(existsSync(join(D, 'lark/sessions', UID, 's-new.json')));
    assert.ok(existsSync(join(D, 'lark/sessions/_local/s-local.json')));
    assert.ok(existsSync(join(D, 'lark/sessions/_local/s-flat.json')));
    assert.ok(!existsSync(join(D, 'lark/sessions', UID, 's-local.json')), '_local KHÔNG được nhận vào tài khoản');
  });
  await t('KHÔNG nhập dữ liệu của tài khoản khác', async () => {
    assert.ok(!existsSync(join(D, 'lark/sessions', OTHER)));
    assert.ok(!existsSync(join(D, 'lark/accounts', OTHER)));
  });
  await t('hội thoại mới: bỏ id phiên CLI cũ (cwd của Toolswave), giữ nội dung', async () => {
    const s = J(join(D, 'lark/sessions', UID, 's-new.json'));
    assert.strictEqual(s.claudeSessionId, '');
    assert.strictEqual(s.agentSessionId, undefined);
    assert.strictEqual(s.items[0].text, 'mới');
  });
  await t('hội thoại đã có: hợp nhất item (không mất bên nào), bản Larkwave mới hơn quyết định + giữ phiên CLI Larkwave', async () => {
    const s = J(join(D, 'lark/sessions', UID, 's-both.json'));
    const ids = s.items.map((i) => i.id);
    assert.deepStrictEqual(ids, ['x', 'lw-only', 'tw-only']);
    assert.strictEqual(s.updatedAt, '2026-09-20T00:00:00Z');
    assert.strictEqual(s.claudeSessionId, 'cli-larkwave');
  });
  await t('bia mộ Larkwave thắng: hội thoại đã xoá không quay lại; bia mộ Toolswave được hợp vào', async () => {
    assert.ok(!existsSync(join(D, 'lark/sessions', UID, 's-dead.json')));
    const tomb = J(join(D, 'lark/deleted', UID, 'deleted.json'));
    assert.ok('s-dead' in tomb && 's-gone' in tomb);
  });
  await t('settings: Larkwave thắng, KHÔNG mang runnerId, trường bí mật bị bỏ', async () => {
    const st = J(join(D, 'lark/accounts', UID, 'settings.json'));
    assert.strictEqual(st.defaultModel, 'fable');
    assert.strictEqual(st.autoApprove, true);
    assert.strictEqual(st.webHost, 'x.larksuite.com');
    assert.strictEqual(st.runnerId, undefined);
    assert.strictEqual(st.appSecret, undefined);
    assert.ok(real.droppedSecretFields >= 1);
    assert.strictEqual(J(join(D, 'lark/accounts/_local/settings.json')).defaultRunner, 'claude');
  });
  await t('Base + lịch tự động hoá: hợp theo khoá', async () => {
    assert.deepStrictEqual(J(join(D, 'lark/accounts', UID, 'bases.json')).map((b) => b.appToken), ['bA', 'bB']);
    assert.strictEqual(J(join(D, 'lark/accounts', UID, 'automations.json'))[0].appToken, 'bA');
  });
  await t('MỌI *.bin / dữ liệu mã hoá đều không chép, và được liệt kê kèm lý do', async () => {
    for (const f of ['creds.bin', 'apps.bin', 'user.bin']) assert.ok(!existsSync(join(D, 'lark/accounts', UID, f)), f);
    assert.ok(!existsSync(join(D, 'account')));
    assert.ok(!existsSync(join(D, 'Partitions')));
    assert.ok(!existsSync(join(D, 'agent')), 'không bật điều khiển từ xa hộ');
    assert.ok(real.skipped.some((s) => /creds\.bin/.test(s.path) && /mã hoá/.test(s.reason)));
    assert.ok(real.skipped.some((s) => s.path === 'Partitions'));
    assert.ok(!real.skipped.some((s) => s.path.includes(UID)), 'đường dẫn trong báo cáo phải che id');
    // không lộ nội dung bí mật ở bất kỳ tệp nào đã ghi
    const all = [];
    const walk = (d) => readdirSync(d).forEach((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : all.push(readFileSync(join(d, f), 'utf8'))));
    walk(D);
    assert.ok(!all.some((c) => c.includes('LỘ')));
  });
  await t('grants.json KHÔNG chép (tránh hai app cùng chạy một lượt uỷ quyền)', async () => {
    assert.ok(!existsSync(join(D, 'lark/grants.json')));
    assert.ok(real.skipped.some((s) => s.path === 'lark/grants.json'));
  });
  await t('Đặc tả + lịch sử đăng nhập Lark web', async () => {
    assert.strictEqual(J(join(D, 'lark/specs', UID, 'spec.json')).bases[0].appToken, 'bA');
    assert.strictEqual(J(join(D, `lark-relogin-${UID}.json`)).length, 1);
  });
  await t('tệp làm việc: chỉ của hội thoại được nhập, cả thư mục con; bỏ tệp quá trần / tệp khoá / thư mục ẩn — kèm lý do', async () => {
    assert.ok(existsSync(join(D, 'lark/work/s-new/report.xlsx')));
    assert.ok(existsSync(join(D, 'lark/work/s-new/thu muc/sub.csv')));
    assert.ok(!existsSync(join(D, 'lark/work/s-new/huge.bin.out')));
    assert.ok(!existsSync(join(D, 'lark/work/s-new/~$report.xlsx')));
    assert.ok(!existsSync(join(D, 'lark/work/s-new/.claude')));
    assert.ok(!existsSync(join(D, 'lark/work/s-other')));
    assert.ok(real.skipped.some((x) => /huge\.bin\.out/.test(x.path) && /quá lớn/.test(x.reason)));
    assert.ok(real.skipped.some((x) => /report\.xlsx/.test(x.path) && /tạm\/khoá/.test(x.reason)));
  });
  await t('thẻ tệp trỏ sang bản chép ở Larkwave; tệp không chép (quá lớn) thì giữ đường cũ', async () => {
    const s = J(join(D, 'lark/sessions', UID, 's-new.json'));
    const by = Object.fromEntries(s.items.map((x) => [x.id, x]));
    assert.strictEqual(by.f1.path, join(D, 'lark/work/s-new/report.xlsx'));
    assert.strictEqual(by.f3.path, join(D, 'lark/work/s-new/thu muc/sub.csv'));
    assert.strictEqual(by.f2.path, join(S, 'lark/work/s-new/huge.bin.out'));
    assert.strictEqual(real.counts.fileLinks.merged, 2);
    assert.strictEqual(dry.counts.fileLinks.merged, 2, 'chạy thử đếm đúng như chạy thật');
  });
  await t('kỹ năng: thêm kc-a (giữ hợp đồng), KHÔNG ghi đè kc-b của Larkwave; snapshots/set-runs; plugin', async () => {
    const reg = J(join(D, 'skills/registry.json'));
    assert.deepStrictEqual(reg.map((e) => e.id), ['kc-b', 'kc-a']);
    assert.strictEqual(reg[0].name, 'KC B (Larkwave)');
    assert.match(readFileSync(join(D, 'skills/lib/kc-a/SKILL.md'), 'utf8'), /needs: x/);
    assert.match(readFileSync(join(D, 'skills/lib/kc-b/SKILL.md'), 'utf8'), /Bản Larkwave/);
    assert.ok(J(join(D, 'skills/snapshots.json'))['kc-a']);
    assert.ok(J(join(D, 'skills/set-runs.json')).set1);
    assert.ok(existsSync(join(D, 'plugins/p1/manifest.json')));
  });
  await t('chạy lại: không thêm gì nữa, đích không đổi (idempotent)', async () => {
    const h = treeHash(D);
    const again = await M.migrateFromToolswave({ sources: [S], dest: D, userId: UID, claudeEnv, maxWorkFileBytes: 1500 });
    const added = Object.values(again.counts).reduce((n, c) => n + c.added + c.merged, 0);
    assert.strictEqual(added, 0, JSON.stringify(again.counts));
    assert.strictEqual(treeHash(D), h);
  });
  await t('lượt BỔ SUNG chỉ-tệp (máy đã nhập bằng bản cũ): chép tệp còn thiếu + trỏ lại thẻ tệp, không đụng hạng mục khác', async () => {
    const D2 = makeDest();
    // Giả lập bản nhập CŨ: hội thoại đã có, thẻ tệp còn trỏ vào Toolswave, chưa có tệp làm việc nào.
    put(join(D2, 'lark/sessions', UID, 's-new.json'), J(join(S, 'lark/sessions', UID, 's-new.json')));
    const r = await M.migrateFromToolswave({ sources: [S], dest: D2, userId: UID, claudeEnv, filesOnly: true, maxWorkFileBytes: 1500 });
    assert.ok(existsSync(join(D2, 'lark/work/s-new/report.xlsx')));
    assert.strictEqual(J(join(D2, 'lark/sessions', UID, 's-new.json')).items.find((x) => x.id === 'f1').path, join(D2, 'lark/work/s-new/report.xlsx'));
    assert.strictEqual(r.counts.skills.added, 0, 'không chạy hạng mục kỹ năng');
    assert.strictEqual(r.counts.automations.added, 0, 'không chạy hạng mục lịch');
    assert.ok(!existsSync(join(D2, 'skills/lib/kc-a')));
    const again = await M.migrateFromToolswave({ sources: [S], dest: D2, userId: UID, claudeEnv, filesOnly: true, maxWorkFileBytes: 1500 });
    assert.strictEqual(again.counts.workFiles.added + again.counts.fileLinks.merged, 0, 'chạy lại không đổi gì');
  });
  await t('dấu đã nhập theo tài khoản', async () => {
    assert.strictEqual(await M.readMarker(D, UID), null);
    await M.writeMarker(D, real);
    assert.strictEqual((await M.readMarker(D, UID)).userId, UID);
    assert.strictEqual(await M.readMarker(D, OTHER), null);
  });
  await t('từ chối ghi vào thư mục Toolswave (đích nằm trong nguồn)', async () => {
    await assert.rejects(M.migrateFromToolswave({ sources: [S], dest: join(S, 'inner'), userId: UID }), /từ chối ghi/);
    assert.strictEqual(treeHash(S), before);
  });
  await t('chưa đăng nhập ⇒ không chạy', async () => {
    await assert.rejects(M.migrateFromToolswave({ sources: [S], dest: D, userId: '', claudeEnv }), /đăng nhập/);
  });
  await t('nhận diện blob mã hoá + trường bí mật', async () => {
    assert.ok(M.isEncryptedBlob(Buffer.from('v10\x01\x02')));
    assert.ok(M.isEncryptedBlob(Buffer.from('PLAIN:{}')));
    assert.ok(!M.isEncryptedBlob(Buffer.from('{"a":1}\n')));
    const r = M.stripSecrets({ appToken: 'keep', tableId: 'keep', appSecret: 's', nested: { refresh_token: 'r', ok: 'djEwAAAAAAAAAAAAAAAAAAAAAAAA' }, list: [{ password: 'p', name: 'n' }] });
    assert.deepStrictEqual(r.value, { appToken: 'keep', tableId: 'keep', nested: {}, list: [{ name: 'n' }] });
    assert.strictEqual(r.dropped, 4);
  });

  // ── kỹ năng vào thư mục CLI có tiền tố larkwave- ──
  await t('SkillHost.resync đặt kỹ năng vào ~/.claude/skills/larkwave-<id>, không đụng <id> của Toolswave', async () => {
    const HOME = mkdtempSync(join(tmpdir(), 'lw-home-'));
    put(join(HOME, '.claude/skills/kc-a/SKILL.md'), 'bản của Toolswave');
    const prevHome = process.env.HOME;
    process.env.HOME = HOME;
    try {
      const { SkillHost } = require(join(B, 'runtime', 'skills', 'skillHost.js'));
      const h = new SkillHost(D);
      h.resync();
      assert.ok(existsSync(join(HOME, '.claude/skills/larkwave-kc-a/SKILL.md')));
      assert.ok(existsSync(join(HOME, '.claude/skills/larkwave-kc-b/SKILL.md')));
      assert.strictEqual(readFileSync(join(HOME, '.claude/skills/kc-a/SKILL.md'), 'utf8'), 'bản của Toolswave');
      h.delete('kc-a');
      assert.ok(!existsSync(join(HOME, '.claude/skills/larkwave-kc-a')));
      assert.ok(existsSync(join(HOME, '.claude/skills/kc-a/SKILL.md')), 'xoá ở Larkwave không được xoá bản của Toolswave');
    } finally {
      process.env.HOME = prevHome;
    }
  });

  console.log(fail ? `\n${fail} ca SAI` : `\nTẤT CẢ ĐÚNG (${pass})`);
  process.exit(fail ? 1 : 0);
})();
