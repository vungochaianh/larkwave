/**
 * Gemini CLI cho lượt Lark — phần THUẦN (không spawn, không electron) để kiểm được bằng node.
 *
 * Vì sao có đường riêng cho Gemini thay vì vòng orchestrator chung của grok/codex:
 *  - orchestrator gọi `gemini -p … --yolo` mỗi bước: --yolo tự duyệt MỌI công cụ dựng sẵn của Gemini
 *    (chạy shell, ghi tệp, web_fetch) — kể cả ở lượt bot Lark do NGƯỜI LẠ trong nhóm gửi tới;
 *  - mỗi bước gửi lại toàn bộ hội thoại + bảng công cụ dạng chữ, không có trí nhớ thật giữa các lượt,
 *    không stream chữ, và tối đa 12 bước.
 * Gemini CLI (đo trên 0.34.0) có đủ thứ để đi đúng đường của Claude: máy chủ MCP qua HTTP, `--resume
 * <uuid>`, `-o stream-json`, `--allowed-mcp-server-names`, policy engine. Nên nó dùng chung CẦU MCP
 * Lark (mcpServer.ts) — công cụ ghi vẫn tự hỏi người dùng trong app như với Claude.
 *
 * Các sự thật đo được trên mã nguồn 0.34.0 (đừng đoán khi nâng cấp — đọc lại):
 *  - chạy headless thì thư mục luôn được coi là tin cậy (isHeadlessMode) ⇒ `.gemini/settings.json`
 *    trong cwd được nạp, MCP được kết nối;
 *  - quyết định `ask_user` của policy bị coi là TỪ CHỐI khi headless ⇒ không cần --yolo;
 *  - `tools.core` là danh sách CHO PHÉP công cụ dựng sẵn: `[]` = không đăng ký công cụ dựng sẵn nào;
 *  - công cụ MCP mang tên `mcp_<server>_<tool>`; tên server không được có dấu gạch dưới;
 *  - `GEMINI_SYSTEM_MD=<tệp>` THAY HẲN lời nhắc hệ thống, dựng lại MỖI lần chạy (không đóng băng
 *    theo phiên như Claude CLI) ⇒ không cần xoay phiên khi luật đổi;
 *  - phiên lưu ở `~/.gemini/tmp/<slug>/chats/session-<thời điểm>-<8 ký tự đầu id>.json`, slug lấy từ
 *    `~/.gemini/projects.json` (khoá = đường dẫn thư mục làm việc). Không tự đặt được id phiên: id lấy
 *    từ sự kiện `init`;
 *  - `--resume <uuid>`: id không có trong khi dự án có phiên khác ⇒ thoát mã 42 ("Error resuming
 *    session"); dự án CHƯA có phiên nào ⇒ LẶNG LẼ mở phiên mới và chạy luôn câu hỏi không có lịch sử.
 *    Vì vậy phải tự kiểm phiên còn trước khi --resume (geminiSessionExists);
 *  - `-e none` tắt mọi extension (extension có thể nạp thêm ngữ cảnh / máy chủ MCP).
 */
import { readFileSync, readdirSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** Tên máy chủ MCP của cầu Lark trong cấu hình Gemini (KHÔNG dùng dấu gạch dưới — xem trên). */
export const GEMINI_MCP_SERVER = 'lark';

/** Công cụ dựng sẵn của Gemini CLI 0.34 (tools/definitions). Lượt Lark chặn hết, trừ file tools. */
export const GEMINI_BUILTIN_TOOLS = [
  'read_file',
  'grep_search',
  'glob',
  'list_directory',
  'read_many_files',
  'write_file',
  'replace',
  'run_shell_command',
  'web_fetch',
  'google_web_search',
  'save_memory',
  'write_todos',
  'ask_user',
  'activate_skill',
  'enter_plan_mode',
  'exit_plan_mode',
  'get_internal_docs',
  'tracker_create_task',
  'tracker_update_task',
  'tracker_get_task',
  'tracker_list_tasks',
  'tracker_add_dependency',
  'tracker_visualize',
] as const;

/**
 * Công cụ đọc tệp tương đương `Read`+`Grep` của đường Claude. CHỈ cho lượt của chính chủ máy hoặc
 * khi người dùng vừa đính kèm tệp (xem LarkAgentDeps.allowFileTools) — lượt bot Lark trong nhóm do
 * người lạ gửi tới, cấp đọc tệp ở đó là cho bất kỳ ai nhắn được cho bot đọc tệp trong máy.
 */
export const GEMINI_FILE_TOOLS = ['read_file', 'grep_search'] as const;

/** `.gemini/settings.json` của THƯ MỤC LÀM VIỆC cho một lượt. Chứa khoá của lượt ⇒ ghi 0600, xoá khi xong. */
export function geminiWorkspaceSettings(opts: { bridgeUrl: string; bridgeToken: string; timeoutMs: number; fileTools: boolean }): Record<string, unknown> {
  return {
    mcpServers: {
      [GEMINI_MCP_SERVER]: {
        httpUrl: opts.bridgeUrl,
        headers: { 'x-tw-token': opts.bridgeToken },
        // Một công cụ ghi có thể đứng chờ người dùng duyệt tới 10 phút (xem MCP_TOOL_WAIT_MS).
        timeout: opts.timeoutMs,
        // Cầu tự hỏi người dùng cho công cụ ghi (hộp xác nhận trong app). Không trust thì Gemini
        // headless coi mọi công cụ MCP là "cần duyệt" ⇒ từ chối hết.
        trust: true,
      },
    },
    // Chỉ máy chủ của ta — máy chủ MCP người dùng tự cài (~/.gemini/settings.json) không được tham gia.
    mcp: { allowed: [GEMINI_MCP_SERVER] },
    // DANH SÁCH CHO PHÉP công cụ dựng sẵn: không có shell, ghi tệp, web — đúng như đường Claude.
    tools: { core: opts.fileTools ? [...GEMINI_FILE_TOOLS] : [] },
    // Kỹ năng do Larkwave tự chèn vào lời nhắc theo đúng runner; kỹ năng của Gemini CLI không nạp.
    skills: { enabled: false },
    // Subagent của Gemini chạy ở chế độ YOLO.
    experimental: { enableAgents: false },
  };
}

/**
 * Tệp policy (TOML) cho `--policy`: lưới thứ hai sau `tools.core` — TỪ CHỐI mọi công cụ dựng sẵn không
 * được phép, kể cả khi bản CLI sau này đăng ký chúng bằng đường khác `tools.core` không chặn.
 */
export function geminiPolicyToml(fileTools: boolean): string {
  const allowed = new Set<string>(fileTools ? GEMINI_FILE_TOOLS : []);
  const deny = GEMINI_BUILTIN_TOOLS.filter((t) => !allowed.has(t));
  return [
    '# Larkwave — lượt Lark chạy trên Gemini CLI. Tạo theo lượt, xoá khi xong.',
    '[[rule]]',
    `toolName = [${deny.map((t) => JSON.stringify(t)).join(', ')}]`,
    'decision = "deny"',
    'priority = 999',
    '',
    '[[rule]]',
    `mcpName = ${JSON.stringify(GEMINI_MCP_SERVER)}`,
    'decision = "allow"',
    'priority = 998',
    '',
  ].join('\n');
}

/** Lời dặn riêng cho Gemini, đặt TRƯỚC lời nhắc Lark chung (viết cho Claude). */
export function geminiSystemPreamble(fileTools: boolean): string {
  return [
    '# Larkwave — agent Lark chạy trên Gemini CLI',
    '',
    `- Công cụ Lark trong phiên này mang tiền tố \`mcp_${GEMINI_MCP_SERVER}_\`: hướng dẫn bên dưới gọi \`lark_web_delete\` thì công cụ thật là \`mcp_${GEMINI_MCP_SERVER}_lark_web_delete\`, \`ask_user\` là \`mcp_${GEMINI_MCP_SERVER}_ask_user\`.`,
    '- Không có công cụ chạy lệnh shell, ghi tệp hay duyệt web. Mọi việc với Lark đi qua công cụ Lark; tệp cho người dùng thì dựng bằng công cụ tạo tệp của Lark.',
    fileTools
      ? '- Đọc tệp trong thư mục làm việc (tệp đính kèm, tệp công cụ Lark tải về) bằng `read_file`; tìm trong tệp dài bằng `grep_search`. Hướng dẫn bên dưới gọi chúng là Read và Grep.'
      : '- Lượt này không được đọc tệp trên máy.',
    '- Trả lời bằng ngôn ngữ người dùng đang dùng (mặc định tiếng Việt).',
    '',
  ].join('\n');
}

export function geminiAttachmentNote(names: string[]): string {
  return (
    `[Người dùng đính kèm ${names.length} file trong THƯ MỤC LÀM VIỆC hiện tại: ${names.join(', ')}. ` +
    'Hãy DÙNG `read_file` để ĐỌC + phân tích từng file TRƯỚC, rồi mới thực hiện yêu cầu bên dưới. ' +
    'Với file Office (.xlsx/.docx/.pptx) thì ĐỌC file "<tên>.txt" đi kèm — đó là phần chữ đã được ' +
    'trích sẵn; bản gốc là nhị phân. TUYỆT ĐỐI KHÔNG dùng lark_read_attachment cho các file này: công cụ ' +
    'đó chỉ dành cho tệp nằm trong Bitable/Drive, không phải file trong thư mục làm việc.]\n\n'
  );
}

/** Prompt dài hơn mức này đi qua STDIN (argv có trần của hệ điều hành); `-p <x>` nối `<x>` vào SAU stdin. */
export const GEMINI_STDIN_MIN_CHARS = 60_000;
export const GEMINI_STDIN_TAIL = '(Thực hiện đúng yêu cầu mới nhất của người dùng ở cuối nội dung phía trên.)';

export function geminiArgs(opts: { prompt: string; model?: string; resumeId?: string; policyPath: string }): { args: string[]; stdin?: string } {
  const big = opts.prompt.length > GEMINI_STDIN_MIN_CHARS;
  const args = [
    '-p',
    big ? GEMINI_STDIN_TAIL : opts.prompt,
    '-o',
    'stream-json',
    // KHÔNG --yolo: công cụ cần duyệt bị từ chối khi headless; công cụ Lark được trust + policy allow.
    '--approval-mode',
    'default',
    '--allowed-mcp-server-names',
    GEMINI_MCP_SERVER,
    '-e',
    'none',
    '--policy',
    opts.policyPath,
  ];
  if (opts.model) args.push('-m', opts.model);
  if (opts.resumeId) args.push('--resume', opts.resumeId);
  return big ? { args, stdin: opts.prompt } : { args };
}

/** Một dòng của `-o stream-json` (gemini-cli-core output/types). */
export type GeminiStreamLine =
  | { kind: 'init'; sessionId: string; model?: string }
  | { kind: 'text'; text: string }
  | { kind: 'warning'; message: string }
  | { kind: 'error'; message: string }
  | { kind: 'result'; ok: boolean; message?: string }
  | { kind: 'other' };

export function parseGeminiLine(line: string): GeminiStreamLine | null {
  const s = line.trim();
  if (!s || s[0] !== '{') return null;
  let o: any;
  try {
    o = JSON.parse(s);
  } catch {
    return null;
  }
  switch (o?.type) {
    case 'init':
      return typeof o.session_id === 'string' ? { kind: 'init', sessionId: o.session_id, ...(typeof o.model === 'string' ? { model: o.model } : {}) } : { kind: 'other' };
    case 'message':
      // Sự kiện `message` của người dùng là chính câu hỏi vọng lại — bỏ.
      return o.role === 'assistant' && typeof o.content === 'string' && o.content ? { kind: 'text', text: o.content } : { kind: 'other' };
    case 'error':
      return o.severity === 'error' ? { kind: 'error', message: String(o.message || '') } : { kind: 'warning', message: String(o.message || '') };
    case 'result':
      return o.status === 'error' ? { kind: 'result', ok: false, message: String(o.error?.message || '') } : { kind: 'result', ok: true };
    case undefined:
      // Lỗi chết trước khi vào vòng chạy (vd chưa đăng nhập) được in ra dưới dạng JsonOutput: {session_id, error}.
      return o?.error?.message ? { kind: 'error', message: String(o.error.message) } : { kind: 'other' };
    default:
      return { kind: 'other' }; // tool_use / tool_result: cầu MCP đã tự báo lên giao diện
  }
}

/**
 * Lỗi API của Gemini tới dưới dạng JSON lồng nhiều lớp đã escape (đo: `[API Error: {"error":{"message":"{\\n
 * \\"error\\": {… \\"message\\": \\"API key not valid…\\"`). Lấy câu `message` TRONG CÙNG — đó mới là chữ
 * người đọc được; không có thì trả nguyên văn.
 */
export function innermostGeminiMessage(raw: string): string {
  const t = String(raw || '');
  const all = [...t.matchAll(/\\*"message\\*"\s*:\s*\\*"((?:[^"\\]|\\(?!"))+)\\*"/g)].map((m) => m[1].replace(/\\n/g, ' ').trim());
  const last = all.filter((x) => x && !x.startsWith('{')).pop();
  return last || t.trim();
}

/** Câu lỗi người dùng đọc được — kèm việc cần làm. */
export function friendlyGeminiError(raw: string, exitCode?: number | null): string {
  const t = innermostGeminiMessage(String(raw || '').trim());
  if (/API key not valid|API_KEY_INVALID|invalid api key/i.test(String(raw || ''))) {
    return 'Khoá API Gemini không hợp lệ. Sửa khoá trong phần cài đặt runner, hoặc xoá khoá đi để dùng đăng nhập Google (chạy `gemini` trong Terminal → "Login with Google").';
  }
  if (/set an Auth method|GEMINI_API_KEY|GOOGLE_GENAI_USE|not authenticated|login required|code"?\s*:\s*41\b/i.test(t) || exitCode === 41) {
    return 'Gemini CLI chưa đăng nhập. Mở Terminal, chạy `gemini`, chọn "Login with Google" rồi đăng nhập; hoặc dán khoá API Gemini trong phần cài đặt runner. Xong thì gửi lại câu hỏi.';
  }
  if (/RESOURCE_EXHAUSTED|quota|\b429\b|rate limit/i.test(t)) {
    return `Gemini báo hết hạn mức (quota) cho model này. Đợi một lúc, hoặc chọn model khác (vd Flash), rồi thử lại.${t ? `\n\nChi tiết: ${t.slice(0, 300)}` : ''}`;
  }
  if (/model.*(not found|not supported|invalid)|404.*model|unknown model/i.test(t)) {
    return `Tài khoản Gemini của bạn không dùng được model đã chọn. Chọn model khác trong danh sách rồi thử lại.${t ? `\n\nChi tiết: ${t.slice(0, 300)}` : ''}`;
  }
  if (exitCode === 53 || /Maximum session turns/i.test(t)) return 'Gemini dừng vì đã chạy quá nhiều bước trong một lượt. Chia yêu cầu nhỏ hơn rồi thử lại.';
  if (/ENOENT/.test(t)) return 'Không tìm thấy Gemini CLI. Cài bằng `npm i -g @google/gemini-cli` (hoặc `brew install gemini-cli`), chạy `gemini` một lần để đăng nhập, rồi thử lại.';
  return t ? `Gemini CLI báo lỗi: ${t.slice(0, 600)}` : `Gemini CLI dừng bất thường${exitCode != null ? ` (mã ${exitCode})` : ''}.`;
}

/** `--resume <id>` hỏng vì id không có (dự án còn phiên khác): CLI in câu này rồi thoát mã 42. */
export function isGeminiResumeMissing(stderr: string, exitCode: number | null): boolean {
  return /Error resuming session|Invalid session identifier/i.test(stderr) || (exitCode === 42 && /session/i.test(stderr));
}

/** Thư mục gốc `.gemini` của CLI (GEMINI_CLI_HOME đổi được, như Storage.getGlobalGeminiDir). */
export function geminiHomeDir(env: NodeJS.ProcessEnv = process.env): string {
  return join(env.GEMINI_CLI_HOME || homedir(), '.gemini');
}

/**
 * Phiên `sessionId` còn trên máy cho thư mục làm việc `cwd` không. PHẢI kiểm trước khi `--resume`: dự án
 * chưa có phiên nào thì CLI lặng lẽ mở phiên mới và trả lời như chưa từng có hội thoại.
 */
export function geminiSessionExists(cwd: string, sessionId: string, geminiDir = geminiHomeDir()): boolean {
  if (!/^[0-9a-f-]{8,}$/i.test(sessionId)) return false;
  let projects: Record<string, string> = {};
  try {
    projects = (JSON.parse(readFileSync(join(geminiDir, 'projects.json'), 'utf8')) as { projects?: Record<string, string> }).projects ?? {};
  } catch {
    return false;
  }
  const keys = new Set<string>([cwd]);
  try {
    keys.add(realpathSync(cwd));
  } catch {
    /* thư mục đã mất — vẫn thử theo đường dẫn gốc */
  }
  const tail = `-${sessionId.slice(0, 8)}.json`;
  for (const k of keys) {
    const slug = projects[k];
    if (!slug) continue;
    try {
      if (readdirSync(join(geminiDir, 'tmp', slug, 'chats')).some((f) => f.startsWith('session-') && f.endsWith(tail))) return true;
    } catch {
      /* chưa có thư mục chats */
    }
  }
  return false;
}

/** Tệp nhỏ trong thư mục hội thoại: phiên Gemini ứng với phiên agent nào của app (agentSessionId). */
export const GEMINI_SESSION_FILE = join('.larkwave', 'gemini-session.json');

/** Id phiên Gemini đã lưu — CHỈ khi nó thuộc đúng phiên agent hiện tại (app xoay phiên ⇒ tự hết hiệu lực). */
export function pickGeminiResume(saved: unknown, agentSessionId: string): string | null {
  const s = saved as { agent?: unknown; gemini?: unknown } | null;
  if (!s || s.agent !== agentSessionId || typeof s.gemini !== 'string' || !s.gemini) return null;
  return s.gemini;
}
