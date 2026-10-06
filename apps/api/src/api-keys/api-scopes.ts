/**
 * Phạm vi quyền của API key — luật thuần, có bài kiểm.
 *
 * Tách khỏi guard có chủ ý: đây là thứ quyết định một chương trình bên ngoài được làm gì trên tài
 * khoản người dùng. Nó phải kiểm được bằng bài kiểm chứ không phải bằng cách gọi thử API thật rồi
 * nhìn xem có nổ không.
 */

/** Các quyền hiện có. Thêm quyền mới thì thêm cả vào `SCOPE_LABELS` để giao diện hiện được. */
export const API_SCOPES = ['apps:read', 'apps:write', 'builds:read', 'account:read'] as const;
export type ApiScope = (typeof API_SCOPES)[number];

/** Nhãn tiếng Việt cho giao diện chọn quyền. */
export const SCOPE_LABELS: Record<ApiScope, string> = {
  'apps:read': 'Xem danh sách app',
  'apps:write': 'Tạo app mới (tốn hạn mức)',
  'builds:read': 'Xem trạng thái lượt dựng',
  'account:read': 'Xem gói và hạn mức đã dùng',
};

/**
 * Tuyến đường nào cần quyền nào.
 *
 * Khoá là "<METHOD> <đường dẫn đã chuẩn hoá>". Tuyến KHÔNG có trong bảng này thì KHÔNG cho gọi —
 * danh sách trắng, không phải danh sách đen. Thêm một endpoint mới mà quên khai ở đây thì nó bị
 * chặn; đó là chiều hỏng ĐÚNG, còn chiều ngược lại là một endpoint mới vô tình mở cho mọi key.
 */
export const ROUTE_SCOPE: Record<string, ApiScope> = {
  'POST /pub/apps': 'apps:write',
  'GET /pub/apps': 'apps:read',
  'GET /pub/builds/:id': 'builds:read',
  'GET /pub/me': 'account:read',
};

/**
 * Chuẩn hoá đường dẫn thật thành khoá tra bảng: thay mọi đoạn trông như id bằng ":id".
 *
 * Không chuẩn hoá thì mỗi lượt gọi `/pub/builds/<id khác nhau>` là một dòng riêng trong sổ, và
 * báo cáo "gọi endpoint nào nhiều nhất" trở thành một danh sách hàng nghìn dòng mỗi dòng một lượt.
 */
export function normalizeRoute(method: string, path: string): string {
  const clean = path.split('?')[0].replace(/\/+$/, '') || '/';
  const parts = clean.split('/').map((seg) => {
    // cuid/uuid/số dài — đủ để bắt mọi kiểu id dự án đang dùng mà không đụng vào từ thường.
    if (/^[a-z0-9]{20,}$/i.test(seg) || /^[0-9a-f-]{32,}$/i.test(seg) || /^\d{6,}$/.test(seg)) return ':id';
    return seg;
  });
  return `${method.toUpperCase()} ${parts.join('/')}`;
}

/** Đọc mảng phạm vi từ cột Json, bỏ giá trị lạ. */
export function readScopes(raw: unknown): ApiScope[] {
  if (!Array.isArray(raw)) return [];
  const ok = new Set<string>(API_SCOPES);
  return [...new Set(raw.map((x) => String(x)).filter((x) => ok.has(x)))] as ApiScope[];
}

/**
 * Key này có được gọi tuyến đó không?
 *
 * Hai luật, và luật thứ nhất là thứ giữ cho mọi tích hợp đang chạy không chết:
 *  1. Phạm vi RỖNG = toàn quyền. Các key phát trước khi có tính năng này không có phạm vi nào;
 *     coi chúng là "không quyền gì" sẽ làm chết mọi chương trình đang dùng mà không báo trước.
 *  2. Tuyến không khai trong bảng ⇒ TỪ CHỐI, kể cả với key toàn quyền. Một endpoint mới phải được
 *     khai báo có chủ ý mới mở ra được.
 */
export function canCall(scopes: readonly string[], routeKey: string): boolean {
  const need = ROUTE_SCOPE[routeKey];
  if (!need) return false;
  if (scopes.length === 0) return true;
  return scopes.includes(need);
}

/** Mốc đầu THÁNG DƯƠNG LỊCH hiện tại — cửa sổ tính hạn mức theo key. */
export function monthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
