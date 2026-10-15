/**
 * Lượt Lark trên Gemini CLI (geminiCli.ts). Đường cũ (orchestrator) chạy `gemini -p … --yolo`: tự
 * duyệt MỌI công cụ dựng sẵn — shell, ghi tệp, web — kể cả ở lượt bot do người lạ trong nhóm gửi tới.
 * Đường mới đi cầu MCP Lark như Claude; các bài dưới giữ cho nó không trượt về chỗ cũ.
 *
 *   bash apps/desktop/test/run.sh
 */
const assert = require('node:assert');
const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, realpathSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const G = require('../.test-build/runtime/lark/geminiCli.js');

let failed = 0;
const test = (name, fn) => {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (e) {
    failed++;
    console.error(`✗ ${name}\n  ${e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n  ') : e}`);
  }
};

test('tham số: KHÔNG --yolo, chỉ máy chủ lark, tắt extension, có policy, stream-json', () => {
  const { args, stdin } = G.geminiArgs({ prompt: 'xin chào', model: 'gemini-3-pro-preview', policyPath: '/t/p.toml' });
  assert.strictEqual(stdin, undefined);
  assert.ok(!args.includes('--yolo') && !args.includes('-y'), 'không được tự duyệt mọi công cụ');
  assert.deepStrictEqual(args.slice(args.indexOf('--approval-mode'), args.indexOf('--approval-mode') + 2), ['--approval-mode', 'default']);
  assert.deepStrictEqual(args.slice(args.indexOf('--allowed-mcp-server-names'), args.indexOf('--allowed-mcp-server-names') + 2), ['--allowed-mcp-server-names', 'lark']);
  assert.deepStrictEqual(args.slice(args.indexOf('-e'), args.indexOf('-e') + 2), ['-e', 'none']);
  assert.deepStrictEqual(args.slice(args.indexOf('--policy'), args.indexOf('--policy') + 2), ['--policy', '/t/p.toml']);
  assert.deepStrictEqual(args.slice(args.indexOf('-o'), args.indexOf('-o') + 2), ['-o', 'stream-json']);
  assert.deepStrictEqual(args.slice(args.indexOf('-m'), args.indexOf('-m') + 2), ['-m', 'gemini-3-pro-preview']);
  assert.strictEqual(args[args.indexOf('-p') + 1], 'xin chào');
  assert.ok(!args.includes('--resume'));
  const r = G.geminiArgs({ prompt: 'x', resumeId: 'abc-123', policyPath: '/p' });
  assert.deepStrictEqual(r.args.slice(-2), ['--resume', 'abc-123']);
  assert.ok(!r.args.includes('-m'), 'không chọn model ⇒ để CLI tự chọn');
});

test('prompt dài đi qua stdin, -p chỉ còn câu nhắc ngắn', () => {
  const long = 'x'.repeat(G.GEMINI_STDIN_MIN_CHARS + 1);
  const { args, stdin } = G.geminiArgs({ prompt: long, policyPath: '/p' });
  assert.strictEqual(stdin, long);
  assert.strictEqual(args[args.indexOf('-p') + 1], G.GEMINI_STDIN_TAIL);
});

test('settings: MCP lark (httpUrl + khoá + trust + hạn chờ), chỉ cho lark, KHÔNG công cụ dựng sẵn', () => {
  const s = G.geminiWorkspaceSettings({ bridgeUrl: 'http://127.0.0.1:5/mcp', bridgeToken: 'tok', timeoutMs: 900000, fileTools: false });
  assert.deepStrictEqual(s.mcpServers.lark, { httpUrl: 'http://127.0.0.1:5/mcp', headers: { 'x-tw-token': 'tok' }, timeout: 900000, trust: true });
  assert.deepStrictEqual(s.mcp.allowed, ['lark']);
  assert.deepStrictEqual(s.tools.core, [], 'tools.core [] = không đăng ký công cụ dựng sẵn nào');
  assert.strictEqual(s.skills.enabled, false);
  assert.strictEqual(s.experimental.enableAgents, false);
  assert.ok(!/_/.test(G.GEMINI_MCP_SERVER), 'tên server có "_" làm policy hiểu sai (tài liệu Gemini CLI)');
  const f = G.geminiWorkspaceSettings({ bridgeUrl: 'u', bridgeToken: 't', timeoutMs: 1, fileTools: true });
  assert.deepStrictEqual(f.tools.core, ['read_file', 'grep_search'], 'chủ máy: chỉ Read + Grep như đường Claude');
});

test('policy: từ chối shell/ghi/web ở MỌI lượt; đọc tệp chỉ khi được phép', () => {
  const noFiles = G.geminiPolicyToml(false);
  const withFiles = G.geminiPolicyToml(true);
  for (const t of ['run_shell_command', 'write_file', 'replace', 'web_fetch', 'google_web_search', 'save_memory', 'activate_skill']) {
    assert.ok(noFiles.includes(`"${t}"`) && withFiles.includes(`"${t}"`), `${t} phải bị từ chối`);
  }
  assert.ok(noFiles.includes('"read_file"') && noFiles.includes('"grep_search"'));
  assert.ok(!withFiles.includes('"read_file"') && !withFiles.includes('"grep_search"'));
  assert.match(noFiles, /decision = "deny"\npriority = 999/);
  assert.match(noFiles, /mcpName = "lark"\ndecision = "allow"/);
});

test('lời dặn hệ thống: tên công cụ có tiền tố mcp_lark_, không có shell', () => {
  const p = G.geminiSystemPreamble(false);
  assert.match(p, /mcp_lark_lark_web_delete/);
  assert.match(p, /mcp_lark_ask_user/);
  assert.match(p, /không được đọc tệp/);
  assert.match(G.geminiSystemPreamble(true), /read_file/);
});

test('đọc stream-json: init / chữ / cảnh báo / lỗi / kết quả / lỗi chết trước vòng chạy', () => {
  assert.deepStrictEqual(G.parseGeminiLine('{"type":"init","timestamp":"t","session_id":"s-1","model":"gemini-3-pro-preview"}'), { kind: 'init', sessionId: 's-1', model: 'gemini-3-pro-preview' });
  assert.deepStrictEqual(G.parseGeminiLine('{"type":"message","role":"assistant","content":"Chào","delta":true}'), { kind: 'text', text: 'Chào' });
  assert.deepStrictEqual(G.parseGeminiLine('{"type":"message","role":"user","content":"câu hỏi"}'), { kind: 'other' }, 'câu hỏi vọng lại không được in ra');
  assert.deepStrictEqual(G.parseGeminiLine('{"type":"error","severity":"warning","message":"Loop detected, stopping execution"}'), { kind: 'warning', message: 'Loop detected, stopping execution' });
  assert.deepStrictEqual(G.parseGeminiLine('{"type":"error","severity":"error","message":"Maximum session turns exceeded"}'), { kind: 'error', message: 'Maximum session turns exceeded' });
  assert.deepStrictEqual(G.parseGeminiLine('{"type":"result","status":"success","stats":{}}'), { kind: 'result', ok: true });
  assert.deepStrictEqual(G.parseGeminiLine('{"type":"result","status":"error","error":{"type":"X","message":"boom"}}'), { kind: 'result', ok: false, message: 'boom' });
  assert.deepStrictEqual(G.parseGeminiLine('{"type":"tool_use","tool_name":"mcp_lark_x","tool_id":"1","parameters":{}}'), { kind: 'other' });
  // Đúng đầu ra đo được khi chưa đăng nhập (Gemini CLI 0.34.0, 15/10/2026).
  const authJson = '{"session_id":"6ad2","error":{"type":"Error","message":"Please set an Auth method in your /Users/x/.gemini/settings.json or specify one of the following environment variables before running: GEMINI_API_KEY, GOOGLE_GENAI_USE_VERTEXAI, GOOGLE_GENAI_USE_GCA","code":41}}';
  const ev = G.parseGeminiLine(authJson);
  assert.strictEqual(ev.kind, 'error');
  assert.strictEqual(G.parseGeminiLine('Loaded cached credentials.'), null);
  assert.strictEqual(G.parseGeminiLine('{không phải json'), null);
});

test('lỗi dễ hiểu: chưa đăng nhập → bảo chạy `gemini` và Login with Google', () => {
  assert.match(G.friendlyGeminiError('Please set an Auth method in your settings.json'), /chạy `gemini`.*Login with Google/);
  assert.match(G.friendlyGeminiError('', 41), /chưa đăng nhập/);
  assert.match(G.friendlyGeminiError('429 RESOURCE_EXHAUSTED'), /hạn mức/);
  assert.match(G.friendlyGeminiError('ENOENT'), /npm i -g @google\/gemini-cli/);
  assert.match(G.friendlyGeminiError('', 53), /quá nhiều bước/);
  assert.match(G.friendlyGeminiError('lạ'), /Gemini CLI báo lỗi: lạ/);
});

test('lỗi API lồng JSON: rút câu trong cùng; khoá API sai → câu riêng', () => {
  // Nguyên văn đo được với khoá giả (Gemini CLI 0.34.0, 15/10/2026), cắt bớt phần details.
  const raw = '[API Error: {"error":{"message":"{\\n  \\"error\\": {\\n    \\"code\\": 400,\\n    \\"message\\": \\"API key not valid. Please pass a valid API key.\\",\\n    \\"status\\": \\"INVALID_ARGUMENT\\"\\n  }\\n}\\n","code":400,"status":"Bad Request"}}]';
  assert.strictEqual(G.innermostGeminiMessage(raw), 'API key not valid. Please pass a valid API key.');
  assert.match(G.friendlyGeminiError(raw), /Khoá API Gemini không hợp lệ/);
  const quota = '[API Error: {"error":{"message":"{\\n \\"error\\": {\\"code\\": 429, \\"message\\": \\"Resource has been exhausted (e.g. check quota).\\", \\"status\\": \\"RESOURCE_EXHAUSTED\\"}}","code":429}}]';
  assert.match(G.friendlyGeminiError(quota), /hạn mức[\s\S]*Resource has been exhausted/);
  assert.strictEqual(G.innermostGeminiMessage('lỗi thường'), 'lỗi thường');
});

test('--resume hỏng (mã 42 / "Error resuming session") ⇒ chạy lại phiên mới', () => {
  assert.ok(G.isGeminiResumeMissing('Error resuming session: Invalid session identifier "x"', 42));
  assert.ok(G.isGeminiResumeMissing('', 42) === false, 'mã 42 không kèm chữ phiên = lỗi tham số khác');
  assert.ok(!G.isGeminiResumeMissing('network down', 1));
});

test('phiên còn không: đọc projects.json + chats/session-*-<8 ký tự>.json; dự án chưa có phiên ⇒ KHÔNG resume', () => {
  const home = mkdtempSync(join(tmpdir(), 'gem-home-'));
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'gem-cwd-')));
  const id = '6ad20816-fb99-49c0-bfc8-cd66ff4666c2';
  assert.strictEqual(G.geminiSessionExists(cwd, id, home), false, 'chưa có projects.json');
  writeFileSync(join(home, 'projects.json'), JSON.stringify({ projects: { [cwd]: 'conv-1' } }));
  assert.strictEqual(G.geminiSessionExists(cwd, id, home), false, 'chưa có thư mục chats');
  mkdirSync(join(home, 'tmp', 'conv-1', 'chats'), { recursive: true });
  writeFileSync(join(home, 'tmp', 'conv-1', 'chats', 'session-2026-10-15T03-00-ffffffff.json'), '{}');
  assert.strictEqual(G.geminiSessionExists(cwd, id, home), false, 'chỉ có phiên KHÁC');
  writeFileSync(join(home, 'tmp', 'conv-1', 'chats', `session-2026-10-15T03-01-${id.slice(0, 8)}.json`), '{}');
  assert.strictEqual(G.geminiSessionExists(cwd, id, home), true);
  assert.strictEqual(G.geminiSessionExists(cwd, '../../etc', home), false, 'id lạ không được thành đường dẫn');
});

test('id phiên Gemini chỉ dùng khi thuộc ĐÚNG phiên agent hiện tại', () => {
  assert.strictEqual(G.pickGeminiResume({ agent: 'a1', gemini: 'g1' }, 'a1'), 'g1');
  assert.strictEqual(G.pickGeminiResume({ agent: 'a0', gemini: 'g1' }, 'a1'), null, 'app đã xoay phiên (đổi runner / nén)');
  assert.strictEqual(G.pickGeminiResume(null, 'a1'), null);
  assert.strictEqual(G.pickGeminiResume({ agent: 'a1', gemini: '' }, 'a1'), null);
});

test('định tuyến: lượt Lark chọn Gemini đi runLarkGemini, KHÔNG về orchestrator --yolo', () => {
  const src = readFileSync(join(__dirname, '..', 'main', 'runtime', 'lark', 'larkAgent.ts'), 'utf8');
  const gi = src.indexOf("runner === 'gemini' && !deps.generalMode");
  const oi = src.indexOf("import('./larkOrchestrator')");
  assert.ok(gi > 0 && oi > 0 && gi < oi, 'nhánh Gemini phải đứng TRƯỚC nhánh orchestrator');
  const agent = readFileSync(join(__dirname, '..', 'main', 'runtime', 'lark', 'larkGeminiAgent.ts'), 'utf8');
  assert.ok(!/--yolo/.test(agent.replace(/\/\/.*$/gm, '')), 'đường Gemini không được dùng --yolo');
  assert.ok(/GEMINI_SYSTEM_MD/.test(agent));
  assert.ok(/rm\(settingsPath/.test(agent), 'settings.json (chứa khoá của lượt) phải bị xoá khi xong');
});

if (failed) {
  console.error(`\n${failed} bài lỗi`);
  process.exit(1);
}
