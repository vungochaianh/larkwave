import { randomUUID } from 'node:crypto';
import type { LarkChatEvent } from '@larkwave/core';
import type { LarkClient } from './larkClient';
import { LarkApiError } from './larkClient';
import type { LarkToolDef } from './tools';

export const ASK_USER_TOOL_NAME = 'ask_user';

export interface ToolExecContext {
  tools: LarkToolDef[];
  client: LarkClient;
  emit: (ev: LarkChatEvent) => void;
  confirm: (callId: string, name: string, input: unknown) => Promise<boolean>;
  ask: (callId: string, question: string, choices?: string[]) => Promise<string>;
  autoApprove?: boolean;
  /** Tự duyệt riêng từng tool (chế độ Tạo workflow: tool cộng-thêm khi công tắc Tự động bật). */
  autoApproveTool?: (name: string) => boolean;
  /**
   * Lượt này có được phép nhắc "cài lại bản mới" không.
   *
   * MẶC ĐỊNH KHÔNG. Lời nhắc chỉ có nghĩa với người ĐANG NGỒI TRƯỚC MÁY này: bot Lark trả lời trong
   * một nhóm, lượt uỷ quyền chạy hộ bạn bè, hay tác vụ định kỳ đăng vào chat — người đọc ở đó không
   * cài được gì trên máy này, và bảo họ đi cài lại là vô nghĩa lẫn khó hiểu.
   */
  allowVersionHint?: boolean;
}

/** Execute one Lark tool (shared by MCP bridge + multi-runner orchestrator). */
export async function executeLarkTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolExecContext,
): Promise<{ ok: boolean; text: string }> {
  if (name === ASK_USER_TOOL_NAME) {
    const callId = `ask_${randomUUID()}`;
    const question = String(input?.question ?? '').trim() || 'Bạn có thể làm rõ giúp tôi không?';
    const choices = Array.isArray(input?.choices) ? input.choices.map(String).slice(0, 8) : undefined;
    ctx.emit({ type: 'ask_user', callId, question, choices });
    const ASK_TIMEOUT_MS = 10 * 60_000;
    let timer: NodeJS.Timeout | undefined;
    const answer = await Promise.race<string>([
      ctx.ask(callId, question, choices),
      new Promise<string>((res) => {
        timer = setTimeout(() => res('[hết thời gian chờ — người dùng chưa trả lời]'), ASK_TIMEOUT_MS);
      }),
    ]);
    if (timer) clearTimeout(timer);
    return { ok: true, text: answer };
  }

  const tool = ctx.tools.find((t) => t.name === name);
  if (!tool) {
    // Đây là CHỮ KÝ KINH ĐIỂN của bản cài cũ: prompt (đi theo giao diện, tự cập nhật) nhắc tới một
    // tool mà phần LÕI đang cài chưa có.
    //
    // PHẢI phát sự kiện chứ không return thẳng: nhánh này trước đây trả về trước mọi `emit`, nên
    // người dùng không thấy tool nào bị thiếu, và thẻ "bản cài đã cũ" (vốn đọc `suspectAppBug` từ
    // tool_result) không bao giờ bật được — đúng ở ca duy nhất chắc chắn là do bản cũ.
    const missId = `lt_${randomUUID()}`;
    ctx.emit({ type: 'tool_call', callId: missId, name, input, gated: false });
    ctx.emit({
      type: 'tool_result',
      callId: missId,
      ok: false,
      error: `Không tìm thấy tool ${name} trong bản cài này.`,
      suspectAppBug: true,
      tier: 'error',
    });
    return { ok: false, text: `Không tìm thấy tool ${name}.` + (await versionNote(ctx.allowVersionHint)) };
  }

  const callId = `lt_${randomUUID()}`;
  // Kiểm trước: thiết kế chắc chắn bị từ chối thì đừng bắt người dùng duyệt (xem LarkToolDef.preflight).
  const pre = await runPreflight(tool, input, ctx.client);
  const needsConfirm = needsConfirmation(tool, ctx, !!pre);
  ctx.emit({ type: 'tool_call', callId, name, input, gated: needsConfirm, ...(needsConfirm ? await previewFor(tool, input) : {}) });

  if (needsConfirm) {
    const CONFIRM_TIMEOUT_MS = 10 * 60_000;
    let timer: NodeJS.Timeout | undefined;
    const allowed = await Promise.race<boolean>([
      ctx.confirm(callId, name, input),
      new Promise<boolean>((res) => {
        timer = setTimeout(() => res(false), CONFIRM_TIMEOUT_MS);
      }),
    ]);
    if (timer) clearTimeout(timer);
    if (!allowed) {
      ctx.emit({ type: 'tool_denied', callId });
      return { ok: false, text: 'Thao tác bị từ chối hoặc hết thời gian chờ xác nhận.' };
    }
  }

  try {
    const data = pre ?? (await tool.exec(input as Record<string, any>, ctx.client));
    // Tool báo hỏng bằng DỮ LIỆU (`{ok:false, reason}`) vẫn là hỏng: phát ok:false để chip trong
    // chat có màu đúng và hộp "Lỗi công cụ" liệt kê được. Trước đây mọi lượt exec không ném đều
    // báo thành công, nên loại thất bại này vô hình với người dùng.
    const failed = isSelfDeclaredFailure(data);
    ctx.emit(
      failed
        ? {
            type: 'tool_result',
            callId,
            ok: false,
            error: failureText(data),
            suspectAppBug: isFailurePayload(data),
            tier: tierForPayload(data, name),
          }
        : { type: 'tool_result', callId, ok: true, summary: summarizeTool(name, data) },
    );
    // Tool có thể BÁO HỎNG bằng dữ liệu (`{ok:false, reason}`) chứ không ném — với người dùng thì
    // hai kiểu đó hỏng như nhau, nên ghi chú phiên bản phải gắn cho cả hai.
    // `ok` phải phản ánh THẬT: trả true cho một thất bại làm runner không-Claude mất lời nhắc thử lại.
    return { ok: !failed, text: await withVersionNote(data, ctx.allowVersionHint) };
  } catch (e) {
    const message = e instanceof LarkApiError ? e.message : String((e as Error)?.message ?? e);
    // Lỗi NÉM RA là đường chiếm đa số (larkClient ném cho mọi code≠0), nên nó cũng phải đi qua
    // bộ phân loại — trước đây nó nối ghi chú VÔ ĐIỀU KIỆN, tức đổ mọi lỗi quyền/tham số/mạng
    // của Lark cho phiên bản.
    const suspect = suspectAppBugError(e);
    ctx.emit({ type: 'tool_result', callId, ok: false, error: message, suspectAppBug: suspect, tier: tierForError(e) });
    return { ok: false, text: message + (suspect ? await versionNote(ctx.allowVersionHint) : '') };
  }
}

/**
 * Thao tác này có phải DỪNG chờ người dùng bấm "Cho phép" không — luật DUY NHẤT, dùng chung cho
 * cầu MCP (Claude CLI), toolBridge (API/MAIC) và executeLarkTool (orchestrator). Ba chỗ từng tự
 * viết `tool.gated && !autoApprove && !pre` riêng; thêm một ngoại lệ ở một chỗ là ba bộ luật trôi lệch.
 *
 *  - Tool không ghi → không hỏi.
 *  - Preflight đã chặn (thiết kế chắc chắn bị từ chối) → không hỏi: kết quả lỗi về thẳng model.
 *  - "Tự động duyệt" toàn cục → không hỏi.
 *  - `autoApproveTool(name)` (chế độ Tạo workflow, công tắc Tự động) → không hỏi, NHƯNG chỉ cho tool
 *    có cờ `additive` (tạo nháp TẮT / thêm bảng-cột-lựa chọn). Tool xoá/ghi đè không có cờ đó nên
 *    vẫn hỏi dù hàm tự duyệt có trả true — chốt nằm ở đây, không phụ thuộc nơi gọi lọc đúng.
 */
export function needsConfirmation(
  tool: { gated?: boolean; additive?: boolean; name: string },
  ctx: { autoApprove?: boolean; autoApproveTool?: (name: string) => boolean },
  preflightBlocked = false,
): boolean {
  if (!tool.gated || preflightBlocked) return false;
  if (ctx.autoApprove) return false;
  if (tool.additive && ctx.autoApproveTool?.(tool.name)) return false;
  return true;
}

/** `{preview}` cho sự kiện tool_call của một thao tác đang chờ duyệt — lỗi thì bỏ qua (chỉ để hiển thị). */
export async function previewFor(tool: { preview?: (i: Record<string, any>) => Promise<unknown> }, input: unknown): Promise<{ preview?: unknown }> {
  if (!tool.preview) return {};
  try {
    const p = await Promise.race([tool.preview((input ?? {}) as Record<string, any>), new Promise((r) => setTimeout(() => r(undefined), 8000))]);
    return p === undefined ? {} : { preview: p };
  } catch {
    return {};
  }
}

/**
 * Chạy `preflight` của một tool (nếu có). Trả payload `{ok:false}` khi phải dừng trước hộp xác nhận,
 * null khi được đi tiếp. Preflight NÉM lỗi thì coi như không có preflight — chốt kiểm trong exec vẫn
 * còn, và một lỗi mạng lúc kiểm trước không được phép chặn mất thao tác người dùng muốn duyệt.
 */
export async function runPreflight(
  tool: Pick<LarkToolDef, 'preflight'>,
  input: unknown,
  client: unknown,
): Promise<Record<string, unknown> | null> {
  if (!tool.preflight) return null;
  try {
    const r = await tool.preflight((input ?? {}) as Record<string, any>, client as never);
    return r && typeof r === 'object' && (r as { ok?: unknown }).ok === false ? r : null;
  } catch {
    return null;
  }
}

/**
 * Tool có TỰ KHAI BÁO là không làm được việc không (`{ok:false}`).
 *
 * Dùng cho GIAO DIỆN: người dùng cần thấy chip lỗi dù tool không ném. Câu hỏi này KHÁC hẳn câu
 * "có đáng nghi là lỗi ứng dụng không" — gộp hai câu đó làm một thì hoặc là giấu mất thất bại,
 * hoặc là đổ oan cho phiên bản.
 */
export function isSelfDeclaredFailure(data: unknown): boolean {
  return !!data && typeof data === 'object' && (data as { ok?: unknown }).ok === false;
}

/**
 * Thất bại này có phải là DẤU HIỆU ỨNG DỤNG HỎNG không — tức có nên nhắc chuyện phiên bản.
 *
 * MẶC ĐỊNH LÀ KHÔNG. Bản đầu tiên làm ngược: coi mọi thất bại là đáng ngờ rồi trừ đi một danh sách
 * ngoại lệ. Sai cả về hình dạng lẫn hậu quả — tuyệt đại đa số lỗi tool là Lark từ chối (thiếu
 * quyền, sai tham số, không tìm thấy bản ghi), là mạng, hoặc là giới hạn sản phẩm cố ý. Cài lại bản
 * mới KHÔNG sửa được cái nào trong số đó, và bảo người dùng tải 400MB để rồi vẫn hỏng là tệ hơn im.
 *
 * Chỉ đúng HAI thứ đáng nghi:
 *  1. Công cụ KHÔNG TỒN TẠI — prompt đi theo giao diện nên tự cập nhật, còn danh sách công cụ nằm
 *     ở phần lõi; đây là chữ ký kinh điển của bản cài cũ.
 *  2. Lỗi cấp ngôn ngữ (TypeError/ReferenceError…) — mã của ta tự vỡ, không phải Lark nói không.
 */
const APP_DEFECT_RE =
  /(Không tìm thấy tool|Không có công cụ|TypeError|ReferenceError|is not a function|Cannot read propert|undefined is not)/i;

/** Lark trả lời "không" (thiếu quyền, sai tham số…) hay mạng hỏng — KHÔNG phải ứng dụng hỏng. */
function isRemoteRefusal(e: unknown): boolean {
  const name = (e as { name?: string } | null)?.name;
  return name === 'LarkApiError' || name === 'LarkNetworkError';
}

/**
 * Ba TẦNG của một thất bại, quyết định giao diện hiện nó thế nào.
 *
 * Từ khi mọi `{ok:false}` được phát ra là `ok:false`, hộp "Lỗi công cụ" đếm cả những thất bại
 * HOÀN TOÀN BÌNH THƯỜNG — `stale-ref` chẳng hạn được chính prompt dạy model rằng cứ gặp là snapshot
 * lại, một phiên dựng automation gặp chục lần là chuyện thường. Một huy hiệu đỏ "12 lỗi" cho việc
 * đó làm hỏng ý nghĩa của chính con số: người dùng học cách phớt lờ nó, rồi bỏ qua lỗi thật.
 *
 *  - 'error'   lỗi thật, người dùng cần biết và có thể phải xử lý (thiếu quyền, sai tên cột…).
 *  - 'blocked' không hỏng, nhưng cần NGƯỜI xử lý (chốt an toàn, chưa kết nối, bị từ chối).
 *  - 'noise'   nhiễu nội bộ, agent tự phục hồi (ref cũ, không thấy nút, hết ngân sách bước).
 */
export type FailureTier = 'error' | 'blocked' | 'noise';

/** Mã máy của larkWebSession/tool → tầng. Khớp CHÍNH XÁC, không khớp chuỗi con. */
const TIER_BY_CODE: Record<string, FailureTier> = {
  // Cần người xử lý.
  'requires-confirm': 'blocked',
  'sensitive-action': 'blocked',
  'no-window': 'blocked',
  'budget-exhausted': 'blocked', // hint của nó: "dừng và báo người dùng"
  'stopped-by-user': 'blocked', // người dùng bấm Dừng ở khung Lark (Tạo workflow)
  'not-lark-host': 'blocked', // chốt chỉ-Lark: trang/khung ngoài Lark
  // Nhiễu nội bộ — agent tự thử lại được.
  'stale-ref': 'noise',
  // Quy tắc chọn tầng: đọc `hint` của chính payload — hint nói với AGENT ("dùng lark_ui_open
  // trước") thì là nhiễu; hint nói với NGƯỜI ("dừng và báo người dùng") thì cần người xử lý.
  'not-on-lark': 'noise',
  'not-visible': 'noise',
  'option-not-found': 'noise',
  'disabled': 'noise',
  'nav-failed': 'noise',
  'collect-failed': 'noise',
  'obscured': 'noise', // lớp khác che điểm bấm — snapshot lại
  'missing-target': 'noise',
  'unknown-action': 'noise',
  'drag-unsupported': 'noise',
};

/**
 * Câu (không phải mã) báo hiệu "cần người xử lý" — khớp chuỗi con vì đây là văn xuôi.
 *
 * Cố ý KHÔNG có 'bị từ chối'/'hết thời gian chờ': đường từ chối phát `tool_denied` rồi return,
 * không bao giờ đi qua đây — thêm vào chỉ là code chết trông như có tác dụng.
 * Cũng KHÔNG có 'Chưa có thư mục làm việc': người dùng không có nút nào để sửa việc đó, nên nó là
 * lỗi thật của ứng dụng chứ không phải việc chờ người.
 */
const BLOCKED_PHRASES = ['Kết nối Lark web', 'từ chối thao tác'];

/**
 * Các tool LÁI GIAO DIỆN Lark: chúng chạy trong vòng lặp chụp→bấm→chờ và thất bại tạm là chuyện
 * BÌNH THƯỜNG (script chạy giữa lúc trang đang đổi, phần tử chưa render…). Nhánh bắt-tất của
 * `executeJavaScript` trả về nguyên văn thông báo exception, không khớp mã nào — nên nếu không xét
 * theo tên tool thì mỗi vòng lặp lại thắp thêm một vạch đỏ trên huy hiệu.
 */
const INNER_LOOP_TOOLS = new Set(['lark_ui_snapshot', 'lark_ui_act', 'lark_ui_wait', 'lark_ui_open', 'lark_ui_drag']);

/** Xếp tầng cho một payload `{ok:false}`. `name` là tên tool đã chạy (nếu biết). */
export function tierForPayload(data: unknown, name?: string): FailureTier {
  const o = (data || {}) as { error?: unknown; reason?: unknown; status?: unknown; blocked?: unknown };
  for (const raw of [o.error, o.status, o.blocked, o.reason]) {
    const code = String(raw ?? '').trim();
    // Một số chỗ ghép mã với chi tiết ("nav-failed: net::ERR_…") — lấy phần mã trước dấu hai chấm.
    const t = TIER_BY_CODE[code] ?? TIER_BY_CODE[code.split(':')[0].trim()];
    if (t) return t;
  }
  const text = `${String(o.error ?? '')} ${String(o.reason ?? '')}`;
  if (BLOCKED_PHRASES.some((p) => text.includes(p))) return 'blocked';
  return name && INNER_LOOP_TOOLS.has(name) ? 'noise' : 'error';
}

/** Xếp tầng cho một lỗi NÉM RA. Lark từ chối / mạng hỏng vẫn là lỗi thật người dùng cần biết. */
export function tierForError(e: unknown): FailureTier {
  const msg = String((e as Error)?.message ?? e);
  const t = TIER_BY_CODE[msg.trim()];
  if (t) return t;
  return BLOCKED_PHRASES.some((p) => msg.includes(p)) ? 'blocked' : 'error';
}

/** Lỗi NÉM RA có đáng nghi là lỗi ứng dụng không. */
export function suspectAppBugError(e: unknown): boolean {
  if (isRemoteRefusal(e)) return false;
  return APP_DEFECT_RE.test(String((e as Error)?.message ?? e));
}

/** Payload `{ok:false}` có đáng nghi là lỗi ứng dụng không. */
export function isFailurePayload(data: unknown): boolean {
  if (!isSelfDeclaredFailure(data)) return false;
  const o = data as { error?: unknown; reason?: unknown; blocked?: unknown };
  if (o.blocked) return false; // tool tự khai đây là chốt/giới hạn, không phải hỏng
  return APP_DEFECT_RE.test(`${String(o.error ?? '')} ${String(o.reason ?? '')}`);
}

/**
 * Mã máy → câu tiếng Việt cho người đọc.
 *
 * Những chuỗi này là tín hiệu nội bộ giữa larkWebSession và agent, không phải thông báo cho người
 * dùng. Đổ thẳng "stale-ref" lên chip lỗi thì người dùng chỉ thấy một từ vô nghĩa và không biết
 * phải làm gì — mà chip lỗi là thứ họ đọc khi đang bối rối nhất.
 */
const MACHINE_CODES: Record<string, string> = {
  'requires-confirm': 'bị chặn để bạn tự xác nhận trong Lark (hành động không hoàn tác được)',
  'sensitive-action': 'hành động nhạy cảm — cần bạn tự bấm trong Lark',
  'stale-ref': 'giao diện Lark đã đổi, trợ lý sẽ chụp lại rồi thử tiếp',
  'not-visible': 'không thấy nút/ô cần thao tác trên màn hình Lark',
  'option-not-found': 'không tìm thấy lựa chọn đó trong danh sách',
  'budget-exhausted': 'đã chạm giới hạn số bước cho một lượt',
  'nav-failed': 'không mở được trang Lark',
  'no-window': 'chưa có cửa sổ Lark nào đang mở',
  'not-on-lark': 'trang hiện tại không phải Lark',
  disabled: 'nút đang bị vô hiệu hoá',
};

/** Câu giải thích ngắn rút từ một payload thất bại, để hiện lên chip lỗi. */
export function failureText(data: unknown): string {
  const o = (data || {}) as { reason?: unknown; error?: unknown; hint?: unknown };
  const raw = String(o.reason ?? o.error ?? 'tool báo thất bại');
  const human = MACHINE_CODES[raw.trim()];
  if (!human) return raw.slice(0, 300);
  // Giữ lại `hint` nếu tool có kèm — đó thường là câu chỉ dẫn cụ thể nhất.
  const hint = typeof o.hint === 'string' && o.hint.trim() ? ` ${o.hint.trim()}` : '';
  return `${human}${hint}`.slice(0, 300);
}

export async function withVersionNote(data: unknown, allowed?: boolean): Promise<string> {
  const note = isFailurePayload(data) ? await versionNote(allowed) : '';
  if (!note) return JSON.stringify(data ?? { ok: true });
  return JSON.stringify({ ...(data as Record<string, unknown>), _phien_ban: note.trim() });
}

/**
 * Không bao giờ để việc lấy ghi chú phiên bản làm hỏng một lượt chat.
 *
 * Nạp ĐỘNG `../versionHint` thay vì import tĩnh. Lý do không phải phong cách: versionHint kéo
 * `codePush` → `electron`, nên chỉ cần một dòng `import` ở đầu file này là MỌI ai dùng các hàm
 * phân loại lỗi ở đây cũng lôi cả Electron theo — kể cả bản dựng cho VM (tw-lark-runner), vốn
 * chết ngay lúc khởi động với `__dirname is not defined`, một lỗi không nói gì về nguyên nhân.
 * `allowed` mặc định tắt nên đường VM không bao giờ chạm tới nhánh nạp này.
 */
export async function versionNote(allowed?: boolean): Promise<string> {
  if (!allowed) return '';
  try {
    const m = await import('../versionHint');
    return await m.toolFailureVersionNote().catch(() => '');
  } catch {
    return '';
  }
}

function summarizeTool(name: string, data: unknown): string {
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    if (Array.isArray(d.items)) return `${d.items.length} mục`;
    const rec = d.record as { record_id?: string } | undefined;
    if (rec?.record_id) return `record ${rec.record_id}`;
    if (d.message_id) return `đã gửi (${d.message_id})`;
    if (typeof d.workflow_id === 'string' && d.workflow_id) return `workflow ${d.workflow_id}${d.status_text ? ` · ${String(d.status_text)}` : ''}`;
    if (typeof d.valid === 'boolean') return d.valid ? 'thiết kế hợp lệ' : `thiết kế còn ${Array.isArray(d.errors) ? d.errors.length : ''} lỗi`;
  }
  return name;
}

/** JSON schema list for orchestrator system prompt. */
export function toolsSchemaBlock(tools: LarkToolDef[]): string {
  const lines = tools.map((t) =>
    JSON.stringify({ name: t.name, description: t.description, inputSchema: t.inputSchema, gated: t.gated }),
  );
  return lines.join('\n');
}
/**
 * Sự kiện thẻ tệp cho một lượt gọi `create_file` thành công — hoặc `null` nếu không phải.
 *
 * VÌ SAO Ở ĐÂY chứ không nằm thẳng trong nơi gọi: tool chạy qua HAI đường khác nhau và mỗi đường
 * tự viết lại phần phát sự kiện của mình —
 *
 *   • `toolBridge.execTool` — đường API trực tiếp
 *   • `mcpServer`           — lượt Lark qua Claude CLI, tức đường CHÍNH
 *
 * Lần đầu tôi chỉ gắn vào `toolBridge`. Kết quả: tệp được tạo thật, chip công cụ vẫn hiện, mà thẻ
 * tải thì không bao giờ được phát — và vì không thấy tệp đâu, trợ lý tự ý đẩy nó lên Lark Drive
 * cho người dùng còn lấy được. Nhìn từ ngoài thành "sao nó tạo trên Lark mà không tạo trong hội
 * thoại", một triệu chứng chẳng liên quan gì tới nguyên nhân.
 *
 * Gom về một hàm để hai đường không thể lệch nhau lần nữa.
 */
export function fileEventFor(name: string, data: unknown): LarkChatEvent | null {
  if (name !== 'create_file') return null;
  const d = data as {
    file_name?: unknown;
    path?: unknown;
    mime?: unknown;
    bytes?: unknown;
    upload_id?: unknown;
  };
  if (typeof d?.path !== 'string' || typeof d?.file_name !== 'string') return null;
  return {
    type: 'file',
    name: d.file_name,
    path: d.path,
    mime: typeof d.mime === 'string' ? d.mime : 'application/octet-stream',
    bytes: typeof d.bytes === 'number' ? d.bytes : 0,
    ...(typeof d.upload_id === 'string' ? { uploadId: d.upload_id } : {}),
  };
}
