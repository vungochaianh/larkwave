/**
 * Phân loại một chuỗi khoá Anthropic theo tiền tố — THUẦN (không import) để kiểm được bằng node.
 *
 * Trước đây "API key" nghĩa là đúng tiền tố `sk-ant-api…`. Ngày 15/10/2026 Anthropic Console cấp cho
 * người dùng một API key dạng MỚI `sk-ant-usr-…`, và app từ chối thẳng ("Chỉ chấp nhận API key
 * Anthropic (sk-ant-api…)") — chưa gọi API lần nào. Tiền tố không phải thứ API kiểm: khoá chỉ là giá
 * trị của header `x-api-key`. Nên ở đây chỉ LOẠI những dạng biết chắc KHÔNG phải API key, còn lại để
 * lần gọi thử thật tới API (validateKey) phán quyết.
 *
 * Không phải API key (oat/admin/sid/si/cc/ccsr có trong mã Claude Code CLI 2.1.295):
 *   sk-ant-oat…   token đăng nhập (`claude setup-token`) → CLAUDE_CODE_OAUTH_TOKEN, dùng gói Pro/Max
 *   sk-ant-ort…   refresh token của phiên đăng nhập OAuth
 *   sk-ant-admin… admin key (quản trị tổ chức, không gọi được /v1/messages)
 *   sk-ant-sid…, sk-ant-si-…, sk-ant-cc… / ccsr…  cookie / phiên nội bộ
 */
export type ClaudeKeyKind = 'api' | 'oauth' | 'other-anthropic' | 'not-anthropic';

const OAUTH = /^sk-ant-oat\d*-/i;
const NOT_API = /^sk-ant-(ort|admin|sid|si|ccsr|cc)\d*-/i;

export function claudeKeyKind(raw: string): ClaudeKeyKind {
  const k = String(raw || '').trim();
  if (!/^sk-ant-[a-z]+\d*-/i.test(k)) return 'not-anthropic';
  if (OAUTH.test(k)) return 'oauth';
  if (NOT_API.test(k)) return 'other-anthropic';
  return 'api';
}

/** API key Anthropic (mọi dạng: `sk-ant-api03-…`, `sk-ant-usr-…`, dạng mới sau này) — không phải token đăng nhập. */
export function isAnthropicApiKey(raw: string): boolean {
  return claudeKeyKind(raw) === 'api';
}

/** Câu báo khi khoá dán vào không dùng làm API key được — nói rõ đó là loại gì. */
export function notApiKeyMessage(raw: string): string {
  switch (claudeKeyKind(raw)) {
    case 'oauth':
      return 'Đây là token đăng nhập cá nhân (sk-ant-oat…), không phải API key. Token này dán ở mục "Kết nối Claude" chứ không dùng để chia sẻ cho người khác.';
    case 'other-anthropic':
      return 'Đây không phải API key dùng để gọi Claude (có thể là admin key hoặc token phiên). Tạo API key ở console.anthropic.com → API Keys.';
    default:
      return 'Không nhận ra khoá này. API key Anthropic bắt đầu bằng sk-ant- (vd sk-ant-api03-… hoặc sk-ant-usr-…), tạo ở console.anthropic.com → API Keys.';
  }
}
