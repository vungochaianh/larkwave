/**
 * Bộ kỹ năng dựng sẵn "Larkwave · Tệp & dữ liệu": cài/cập nhật idempotent, không đụng kỹ năng của người
 * dùng (kể cả kỹ năng nhập từ Toolswave), hợp đồng hợp lệ, công cụ nhắc trong thân có thật, xoá thì
 * không cài lại, bản người dùng đã sửa thì không bị ghi đè, và nạp vào prompt theo từ khoá.
 *
 *   bash apps/desktop/test/run.sh
 */
const assert = require('node:assert');
const Module = require('node:module');
const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { createHash } = require('node:crypto');

const orig = Module._load;
Module._load = function (req) {
  if (req === 'electron') return { Notification: class { show() {} static isSupported() { return false; } }, app: { getPath: () => tmpdir(), isPackaged: false, getVersion: () => '0.0.0' }, safeStorage: { isEncryptionAvailable: () => false }, session: { fromPartition: () => ({}) }, BrowserWindow: function () {}, shell: {}, net: {} };
  return orig.apply(this, arguments);
};

const ROOT = join(__dirname, '..');
const B = join(ROOT, '.test-build');
const HOME = mkdtempSync(join(tmpdir(), 'lw-home-b-'));
process.env.HOME = HOME; // SkillHost đồng bộ sang ~/.claude/skills — kín trong thư mục tạm
const { SkillHost } = require(join(B, 'runtime', 'skills', 'skillHost.js'));
const { BUILTIN_SKILLS } = require(join(B, 'runtime', 'skills', 'builtinSkills.js'));
const core = require(join(B, 'core', 'skillContract.js'));
const learn = require(join(B, 'core', 'skillLearning.js'));

let pass = 0;
let fail = 0;
const t = async (name, fn) => {
  try {
    await fn();
    pass++;
    console.log('  ✓', name);
  } catch (e) {
    fail++;
    console.log('  ✗', name, '\n     ', e && (e.stack || e.message).split('\n').slice(0, 4).join('\n      '));
  }
};
const put = (p, v) => {
  mkdirSync(join(p, '..'), { recursive: true });
  writeFileSync(p, v);
};
const hashTree = (d) => {
  const h = createHash('sha256');
  const walk = (x) => {
    for (const f of readdirSync(x).sort()) {
      const p = join(x, f);
      try {
        walk(p);
      } catch {
        h.update(f).update(readFileSync(p));
      }
    }
  };
  walk(d);
  return h.digest('hex');
};

(async () => {
  const D = mkdtempSync(join(tmpdir(), 'lw-skb-'));
  // Kỹ năng người dùng có sẵn (như vừa nhập từ Toolswave): một cái thường, một cái giành lệnh "/xuat-bang",
  // một cái tình cờ trùng id với kỹ năng dựng sẵn.
  put(join(D, 'skills', 'registry.json'), JSON.stringify([
    { id: 'kc-a', name: 'KC A', description: 'd', enabled: true, scope: ['claude'] },
    { id: 'bao-cao', name: 'Báo cáo của tôi', description: 'd', enabled: true, scope: ['claude', 'codex'], command: 'xuat-bang' },
    { id: 'lw-tep-len-lark', name: 'Của người dùng', description: 'trùng id', enabled: true, scope: ['claude'] },
  ]));
  put(join(D, 'skills', 'lib', 'kc-a', 'SKILL.md'), '---\nname: kc-a\ndescription: d\nneeds: [x]\n---\nThân A');
  put(join(D, 'skills', 'lib', 'bao-cao', 'SKILL.md'), '---\nname: bao-cao\ndescription: d\ncommand: xuat-bang\n---\nBáo cáo riêng');
  put(join(D, 'skills', 'lib', 'lw-tep-len-lark', 'SKILL.md'), '---\nname: lw-tep-len-lark\ndescription: trùng id\n---\nCủa người dùng');
  const userLib = () => ['kc-a', 'bao-cao', 'lw-tep-len-lark'].map((id) => readFileSync(join(D, 'skills', 'lib', id, 'SKILL.md'), 'utf8')).join('§');
  const before = userLib();
  const h = new SkillHost(D);

  await t('cài lần đầu: 11 kỹ năng lw-* (7 Tệp & dữ liệu + 4 Zalo & Gmail), bật, dùng chung mọi model, đúng nhãn, thư mục CLI larkwave-lw-*', () => {
    const r = h.ensureBuiltins(BUILTIN_SKILLS);
    assert.strictEqual(r.installed.length, 10, JSON.stringify(r));
    assert.deepStrictEqual(r.kept, ['lw-tep-len-lark'], 'trùng id với kỹ năng KHÔNG dựng sẵn → không đụng');
    const list = h.list().filter((s) => s.builtin);
    assert.strictEqual(list.length, 10);
    for (const s of list) {
      assert.ok(s.id.startsWith('lw-') && s.enabled && s.scope.length === 4, s.id);
      assert.deepStrictEqual(s.tags, /^lw-(zalo|gmail)-/.test(s.id) ? ['Larkwave', 'Zalo & Gmail'] : ['Larkwave', 'Tệp & dữ liệu']);
      assert.ok(s.triggers.length >= 5, s.id);
      assert.ok(existsSync(join(HOME, '.claude', 'skills', `larkwave-${s.id}`, 'SKILL.md')), s.id);
    }
  });

  await t('kỹ năng của người dùng (nhập từ Toolswave) KHÔNG đổi một byte; lệnh "/" trùng thì kỹ năng dựng sẵn nhường', () => {
    assert.strictEqual(userLib(), before);
    const reg = JSON.parse(readFileSync(join(D, 'skills', 'registry.json'), 'utf8'));
    assert.strictEqual(reg.find((e) => e.id === 'bao-cao').command, 'xuat-bang');
    assert.strictEqual(reg.find((e) => e.id === 'lw-xuat-bang').command, 'xuat-bang-2');
    assert.strictEqual(reg.find((e) => e.id === 'lw-tep-len-lark').name, 'Của người dùng');
  });

  await t('chạy lại: idempotent (không ghi gì)', () => {
    const hs = hashTree(join(D, 'skills'));
    const r = h.ensureBuiltins(BUILTIN_SKILLS);
    assert.deepStrictEqual([r.installed.length, r.updated.length], [0, 0]);
    assert.strictEqual(hashTree(join(D, 'skills')), hs);
  });

  await t('bản mới: bản CHƯA sửa → lên bản mới (có bản lưu để lùi); bản ĐÃ sửa → giữ nguyên, báo "có bản mới"', () => {
    const md = (id) => readFileSync(join(D, 'skills', 'lib', id, 'SKILL.md'), 'utf8');
    // người dùng sửa kỹ năng đính tệp
    h.update('lw-dinh-tep-bitable', { instructions: 'Cách của tôi: luôn đọc lại 2 lần.' });
    const mine = md('lw-dinh-tep-bitable');
    const v2 = BUILTIN_SKILLS.map((d) => ({ ...d, version: d.version + 1, body: d.body + '\n\n(bản 2)' }));
    const r = h.ensureBuiltins(v2);
    assert.ok(r.updated.includes('lw-xuat-bang') && !r.updated.includes('lw-dinh-tep-bitable'), JSON.stringify(r));
    assert.ok(/\(bản 2\)/.test(md('lw-xuat-bang')));
    assert.strictEqual(md('lw-dinh-tep-bitable'), mine, 'bản đã sửa không bị ghi đè');
    assert.strictEqual(h.list().find((s) => s.id === 'lw-dinh-tep-bitable').builtinUpdate, 2);
    assert.ok(h.snapshots('lw-xuat-bang').some((x) => x.by === 'ai' && /phiên bản 2/.test(x.what)), 'có bản lưu trước khi cập nhật');
    assert.strictEqual(userLib(), before, 'vẫn không đụng kỹ năng người dùng');
  });

  await t('xoá kỹ năng dựng sẵn → KHÔNG cài lại; "khôi phục" → cài lại', () => {
    h.delete('lw-nhap-bang');
    h.ensureBuiltins(BUILTIN_SKILLS);
    assert.ok(!h.list().some((s) => s.id === 'lw-nhap-bang'));
    assert.ok(!existsSync(join(HOME, '.claude', 'skills', 'larkwave-lw-nhap-bang')));
    h.restoreBuiltins(BUILTIN_SKILLS);
    assert.ok(h.list().some((s) => s.id === 'lw-nhap-bang' && s.builtin));
  });

  await t('hợp đồng hợp lệ: ghi ra ↔ đọc lại khớp, ràng buộc biểu thức trỏ đúng khoá, không hai kỹ năng cùng sinh một khoá, không nối thành bộ', () => {
    const contracts = [];
    for (const d of BUILTIN_SKILLS) {
      const id = d.id === 'lw-tep-len-lark' ? null : d.id; // id trùng kỹ năng người dùng — kiểm trên định nghĩa
      const text = id ? readFileSync(join(D, 'skills', 'lib', id, 'SKILL.md'), 'utf8') : `---\nname: x\ndescription: d\n${core.serializeContract(d.contract).join('\n')}\n---\n`;
      const back = core.contractFieldsFrom(text);
      assert.deepStrictEqual({ n: back.needs ?? [], p: back.produces ?? [], c: back.checks ?? [] }, { n: d.contract.needs, p: d.contract.produces, c: d.contract.checks }, d.id);
      const c = core.parseSkillContract(d.id, d.name, text);
      for (const ck of c.checks) for (const ref of ck.refs) assert.ok(d.contract.produces.includes(ref) || d.contract.needs.includes(ref), `${d.id}: ràng buộc nhắc khoá lạ ${ref}`);
      assert.ok(c.checks.some((x) => x.kind === 'expr') || c.checks.length, d.id);
      contracts.push(c);
    }
    assert.deepStrictEqual(core.duplicateProducers(contracts), []);
    for (const c of contracts) assert.strictEqual(core.relatedSet(contracts, c.id).length, 1, `${c.id} không được nối với kỹ năng dựng sẵn khác`);
  });

  await t('thân kỹ năng: có từ khoá gọi VI + EN, các mục bắt buộc, và MỌI công cụ nhắc tới đều có thật', () => {
    const toolSrc = readdirSync(join(ROOT, 'main', 'runtime', 'lark', 'tools')).map((f) => readFileSync(join(ROOT, 'main', 'runtime', 'lark', 'tools', f), 'utf8')).join('\n');
    const known = new Set([...toolSrc.matchAll(/name: '([a-z_0-9]+)'/g)].map((m) => m[1]).concat(['ask_user']));
    for (const d of BUILTIN_SKILLS) {
      assert.ok(d.triggers.some((x) => /[ăâđêôơưàáạảãèéẹẻẽ]/i.test(x)) && d.triggers.some((x) => /^[a-z ]+$/i.test(x)), `${d.id}: cần từ khoá VI và EN`);
      for (const sec of ['## Khi nào dùng', '## Các bước', '## Khi lỗi']) assert.ok(d.body.includes(sec) || (sec === '## Khi lỗi' && d.body.includes('## Luật')), `${d.id} thiếu ${sec}`);
      assert.ok(/Xác minh|xác minh|BÁO|Báo/.test(d.body), d.id);
      const tools = [...d.body.matchAll(/`([a-z][a-z0-9]*_[a-z0-9_]+)`/g)].map((m) => m[1]).filter((n) => /^(lark_|bitable_|create_|fill_|prepare_|send_|schedule_|skill_|messaging_|drive_|sheets_|zalo_|gmail_)/.test(n));
      assert.ok(tools.length >= 1, d.id);
      for (const n of tools) assert.ok(known.has(n), `${d.id}: công cụ không tồn tại «${n}»`);
    }
  });

  await t('nạp vào prompt: kỹ năng dựng sẵn chỉ một dòng mục lục, ĐỦ thân khi câu lệnh khớp từ khoá; kỹ năng người dùng luôn đủ thân', async () => {
    assert.ok(learn.matchTriggers('Xuất bảng Đơn hàng ra Excel giúp tôi', ['xuất excel', 'xuất bảng']));
    assert.ok(learn.matchTriggers('please EXPORT CSV of that table', ['export csv']));
    assert.ok(!learn.matchTriggers('chào bạn', ['xuất excel']));
    const { LarkService } = require(join(B, 'runtime', 'lark', 'larkService.js'));
    const svc = new LarkService(D);
    const p1 = await svc.collectSkillsPrompt(undefined, 'claude', undefined, 'tóm tắt Base này');
    assert.ok(/mục lục/.test(p1) && /lw-xuat-bang/.test(p1), 'có mục lục');
    assert.ok(!/## Các bước/.test(p1.split('=== KỸ NĂNG (SKILLS)')[0]), 'không nạp thân kỹ năng dựng sẵn khi không khớp');
    assert.ok(/Thân A/.test(p1), 'kỹ năng người dùng vẫn đủ thân');
    const p2 = await svc.collectSkillsPrompt(undefined, 'claude', undefined, 'xuất bảng Khách hàng ra excel');
    assert.ok(/### Xuất bảng ra Excel\/CSV đầy đủ[\s\S]*lark_export_table_file/.test(p2), 'khớp từ khoá → đủ thân');
  });

  console.log(fail ? `\n${fail} ca SAI` : `\n  skillsBuiltin: TẤT CẢ ĐÚNG (${pass})`);
  process.exit(fail ? 1 : 0);
})();
