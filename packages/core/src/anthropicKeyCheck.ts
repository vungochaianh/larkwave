/**
 * Kiểm một API key Anthropic — THUẦN (nhận `fetch` từ ngoài) để dùng chung cho lõi (main) và giao diện
 * (renderer, chạy được qua code-push trên lõi cũ), và kiểm được bằng node.
 *
 * Lỗi thật 17/10/2026: người dùng thêm API key vừa tạo, app báo "Không kiểm tra được key (HTTP 400)".
 * Bản cũ gọi `/v1/messages` với một model cố định rồi VỨT câu Anthropic trả về — mà 400 với key mới tạo
 * gần như luôn là "credit balance is too low" (tài khoản chưa nạp tiền), tức key ĐÚNG. Người dùng không
 * có cách nào biết phải làm gì.
 *
 * Nay tách hai việc:
 *  1. ĐĂNG NHẬP: `GET /v1/models` — không tốn token, không phụ thuộc model nào còn hay đã ngừng.
 *     401/403 ⇒ key sai. 200 ⇒ key ĐÚNG.
 *  2. DÙNG ĐƯỢC KHÔNG: một lượt `/v1/messages` 1 token bằng model rẻ nhất trong danh sách vừa lấy. Lỗi ở
 *     đây (hết credit, giới hạn tần suất…) KHÔNG làm key thành "sai" — trả `ok: true` kèm `warning` nói
 *     đúng câu của Anthropic và việc cần làm.
 */
import type { KeyValidation } from './runtime';

export type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{ status: number; ok: boolean; text(): Promise<string> }>;

const API = 'https://api.anthropic.com/v1';

/** Câu `error.message` trong phản hồi lỗi của Anthropic ({"type":"error","error":{"type","message"}}). */
export function anthropicErrorMessage(body: string): string {
  try {
    const j = JSON.parse(body) as { error?: { message?: string } };
    if (j?.error?.message) return String(j.error.message);
  } catch {
    /* không phải JSON */
  }
  return String(body || '').slice(0, 200);
}

/** Câu tiếng Việt cho lỗi KHÔNG phải sai key (key đã đăng nhập được). */
export function explainAnthropicUsage(status: number, message: string): string {
  if (/credit balance is too low|insufficient.*credit|billing|purchase credits/i.test(message)) {
    return 'Key ĐÚNG, nhưng tài khoản Anthropic chưa có (hoặc đã hết) credit — vào console.anthropic.com → Billing để nạp. Chưa nạp thì Claude sẽ báo lỗi khi chạy bằng key này.';
  }
  if (status === 429 || /rate limit/i.test(message)) return 'Key đúng, nhưng Anthropic đang giới hạn tần suất — thử lại sau ít phút.';
  if (/organization.*disabled|account.*disabled/i.test(message)) return `Key đúng nhưng tổ chức/tài khoản Anthropic đang bị khoá: ${message}`;
  return `Key đúng, nhưng Anthropic từ chối lượt thử (HTTP ${status}): ${message}`;
}

function pickCheapModel(ids: string[]): string | null {
  return ids.find((id) => /haiku/i.test(id)) || ids.find((id) => /sonnet/i.test(id)) || ids[0] || null;
}

export async function checkAnthropicKey(key: string, fetchFn: FetchLike, opts: { browser?: boolean; timeoutMs?: number } = {}): Promise<KeyValidation & { warning?: string }> {
  const k = String(key || '').trim();
  const headers: Record<string, string> = { 'x-api-key': k, 'anthropic-version': '2023-06-01' };
  // Gọi thẳng từ renderer: Anthropic chỉ trả CORS khi có header này.
  if (opts.browser) headers['anthropic-dangerous-direct-browser-access'] = 'true';
  const timed = async (url: string, init: Parameters<FetchLike>[1]) => {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), opts.timeoutMs ?? 15_000);
    try {
      return await fetchFn(url, { ...init, signal: ac.signal });
    } finally {
      clearTimeout(t);
    }
  };

  let models: string[] = [];
  try {
    const r = await timed(`${API}/models?limit=100`, { method: 'GET', headers });
    const body = await r.text();
    if (r.status === 401 || r.status === 403) return { ok: false, error: 'Key không hợp lệ hoặc đã bị thu hồi (Anthropic từ chối đăng nhập).' };
    if (!r.ok) return { ok: false, error: `Không kiểm tra được key (HTTP ${r.status}): ${anthropicErrorMessage(body)}` };
    try {
      models = ((JSON.parse(body) as { data?: { id?: string }[] }).data || []).map((m) => String(m.id || '')).filter(Boolean);
    } catch {
      models = [];
    }
  } catch (e) {
    return { ok: false, error: `Lỗi mạng khi kiểm tra key: ${(e as Error)?.message || e}` };
  }

  const model = pickCheapModel(models);
  if (!model) return { ok: true, warning: 'Key đúng, nhưng tài khoản chưa có model nào dùng được.' };
  try {
    const r = await timed(`${API}/messages`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }),
    });
    if (r.ok) return { ok: true, model };
    return { ok: true, model, warning: explainAnthropicUsage(r.status, anthropicErrorMessage(await r.text())) };
  } catch (e) {
    return { ok: true, model, warning: `Key đúng; lượt thử bị lỗi mạng: ${(e as Error)?.message || e}` };
  }
}
