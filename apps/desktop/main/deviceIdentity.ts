/**
 * Danh tính thiết bị của Larkwave khi đi chung hệ tài khoản với Toolswave.
 *
 * Hàm THUẦN (không import electron) để bài kiểm gọi đúng luật này.
 */

/** Tên máy hiển thị ở danh sách thiết bị điều khiển từ xa — tách khỏi app Toolswave cùng máy. */
export function relayDeviceName(host: string): string {
  const h = (host || '').trim().replace(/\.local$/i, '') || 'máy này';
  return `Larkwave · ${h}`;
}

/** Bỏ ký tự có thể làm hỏng header (xuống dòng, ngoặc) khỏi tên máy. */
function cleanHost(host: string): string {
  return (host || '').replace(/[^\w.\- ]/g, '').trim().slice(0, 60) || 'host';
}

/**
 * UA cho lời gọi tài khoản: có `Electron` (máy chủ xếp loại desktop), hệ điều hành theo đúng chuỗi
 * máy chủ dò (`Macintosh; Mac OS X` / `Windows NT` / `Linux`), và `Larkwave/<ver> (<host>)`.
 */
export function larkwaveUserAgent(platform: string, version: string, electron: string, host: string): string {
  const os =
    platform === 'darwin'
      ? 'Macintosh; Intel Mac OS X 10_15_7'
      : platform === 'win32'
        ? 'Windows NT 10.0; Win64; x64'
        : 'X11; Linux x86_64';
  return `Mozilla/5.0 (${os}) Electron/${electron || '0'} Larkwave/${version || '0'} (${cleanHost(host)})`;
}

/** Thêm UA mặc định khi renderer chưa tự đặt (không phân biệt hoa thường tên header). */
export function withDefaultUserAgent(headers: Record<string, string> | undefined, ua: string): Record<string, string> {
  const h = { ...(headers ?? {}) };
  if (!Object.keys(h).some((k) => k.toLowerCase() === 'user-agent')) h['User-Agent'] = ua;
  return h;
}
