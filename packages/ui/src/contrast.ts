/**
 * Đo và sửa tương phản màu (WCAG). Tách riêng vì hai nơi cần chung một phép tính: khối mã
 * trên màn hình, và bản PDF in ra giấy trắng — nếu mỗi bên tự tính thì cùng một đoạn mã sẽ có
 * hai màu khác nhau.
 */

/** '#rrggbb' | 'hsl(h, s%, l%)' → [r, g, b] 0-255. Prism trộn cả hai dạng trong cùng một theme. */
export function toRgb(c: string): [number, number, number] | null {
  const hex = /^#([0-9a-f]{6})$/i.exec(c.trim());
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const hsl = /^hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*\)$/i.exec(c.trim());
  if (!hsl) return null;
  const h = +hsl[1];
  const sat = +hsl[2] / 100;
  const l = +hsl[3] / 100;
  const a = sat * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return Math.round((l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)))) * 255);
  };
  return [f(0), f(8), f(4)];
}

export const relLum = ([r, g, b]: [number, number, number]) => {
  const f = (v: number) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : Math.pow((v / 255 + 0.055) / 1.055, 2.4));
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
export const contrast = (a: [number, number, number], b: [number, number, number]) => {
  const [x, y] = [relLum(a), relLum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

/**
 * Làm màu chữ đậm lại vừa đủ để đạt 4.5:1 so với nền.
 *
 * Đo thực tế trên bản deploy: oneLight có 22/24 loại token KHÔNG đạt chuẩn AA trên nền
 * #FBFAFF — chú thích chỉ 2.48:1, chuỗi 3.09:1. Nó vốn được vẽ cho một nền khác.
 *
 * Nhân đều RGB với một hệ số (tìm bằng chia đôi) giữ NGUYÊN sắc màu, chỉ hạ độ sáng — nên
 * bảng màu vẫn là oneLight, vẫn phân biệt được từ khoá / chuỗi / chú thích, chỉ là đọc được.
 * Chỉnh tay 24 màu thì lần sau đổi nền lại phải chỉnh lại từ đầu; cách này tự đúng theo nền.
 */
export function ensureContrast(color: string, bg: [number, number, number], target = 4.5): string {
  const rgb = toRgb(color);
  if (!rgb) return color;
  if (contrast(rgb, bg) >= target) return color;
  // Chia đôi trên chính GIÁ TRỊ ĐÃ LÀM TRÒN. Làm tròn sau khi tìm xong thì một kênh có thể bị
  // đẩy ngược lên và tuột xuống 4.48:1 — sát nút nhưng vẫn là trượt chuẩn.
  const at = (k: number): [number, number, number] => [
    Math.round(rgb[0] * k),
    Math.round(rgb[1] * k),
    Math.round(rgb[2] * k),
  ];
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 18; i += 1) {
    const mid = (lo + hi) / 2;
    if (contrast(at(mid), bg) >= target) lo = mid;
    else hi = mid;
    // lo = hệ số sáng lớn nhất còn đạt chuẩn → hội tụ về màu SÁNG NHẤT mà vẫn đọc được.
  }
  const out = at(lo);
  return `#${out.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('')}`;
}
