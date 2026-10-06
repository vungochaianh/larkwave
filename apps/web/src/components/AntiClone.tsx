"use client";

import { useEffect } from "react";

/** Trang chính thức — dùng cho cả link trong cảnh báo lẫn thông điệp. */
const OFFICIAL_ORIGIN = "https://toolswave.net";

/**
 * Hostname được phép chạy bundle này. Một entry là:
 *   - chuỗi thường  → khớp CHÍNH XÁC ("toolswave.net")
 *   - bắt đầu "."   → khớp hậu tố, tức mọi subdomain (".toolswave.net" ⊃ "x.toolswave.net")
 * Thêm domain mới ở ĐÂY (một chỗ duy nhất) khi mở thêm host/preview.
 */
export const CLONE_ALLOWED_HOSTS = [
  // Sau lần hoán đổi tên miền 22/09/2026, trang chính nằm ở `toolswave.net` (trước là
  // `app.toolswave.net`). Không cần liệt kê từng subdomain vì mục `.toolswave.net` phía dưới đã
  // bắt hết — kể cả `cms.` (quản trị) và `lark.` (Larkwave).
  "toolswave.net",
  ".toolswave.net", // mọi subdomain hiện tại + tương lai
  ".pages.dev", // bản dựng web/desktop renderer trên Cloudflare Pages
  ".trycloudflare.com", // tunnel tạm khi dev/demo — thà rộng còn hơn tự khoá mình
  "localhost",
  ".localhost",
  "127.0.0.1",
  "[::1]",
  "::1",
] as const;

/**
 * Đúng khi hostname nằm trong allowlist. Cố tình RỘNG RÃI: ngoài allowlist còn cho qua
 * IP thuần và hostname không có dấu chấm (máy trong LAN, tên container, truy cập trực tiếp
 * origin khi vận hành) — kẻ clone luôn rehost trên một domain thật, còn chủ nhà thì hay
 * vào bằng IP/hostname lạ. Sai sót về phía "cho qua" chỉ mất một lớp gờ giảm tốc;
 * sai sót về phía "chặn" là trắng trang với người dùng thật.
 */
export function isAllowedHost(hostname: string): boolean {
  const h = hostname.trim().toLowerCase();
  if (!h) return true; // file:// hoặc môi trường lạ → không làm gì
  if (!h.includes(".")) return true; // "localhost", tên máy nội bộ, container…
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return true; // IPv4 thuần
  return CLONE_ALLOWED_HOSTS.some((entry) =>
    entry.startsWith(".") ? h === entry.slice(1) || h.endsWith(entry) : h === entry,
  );
}

/** Dựng cảnh báo bằng DOM API (không innerHTML) rồi thay toàn bộ nội dung trang. */
function renderCloneNotice() {
  document.title = "Bản sao trái phép — Larkwave";

  const box = document.createElement("div");
  box.style.cssText = [
    "position:fixed",
    "inset:0",
    "z-index:2147483647",
    "display:flex",
    "flex-direction:column",
    "align-items:center",
    "justify-content:center",
    "gap:14px",
    "padding:24px",
    "text-align:center",
    "background:#13151C",
    "color:#F4F5FB",
    "font:16px/1.6 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif",
  ].join(";");

  const title = document.createElement("h1");
  title.textContent = "Trang này là bản sao trái phép";
  title.style.cssText = "margin:0;font-size:24px;font-weight:700;color:#FF7AB6";

  const body = document.createElement("p");
  body.textContent =
    "Nội dung bạn đang xem được sao chép trái phép từ Larkwave và đặt trên một tên miền không " +
    "thuộc về chúng tôi. Đừng nhập email, mật khẩu hay thông tin thanh toán tại đây.";
  body.style.cssText = "margin:0;max-width:520px;color:#C9CCD8";

  const link = document.createElement("a");
  link.href = OFFICIAL_ORIGIN;
  link.rel = "noopener noreferrer";
  link.textContent = "Mở trang chính thức: toolswave.net";
  link.style.cssText =
    "margin-top:6px;padding:10px 20px;border-radius:10px;background:#6C5CE7;color:#fff;" +
    "text-decoration:none;font-weight:600";

  box.append(title, body, link);
  document.body.replaceChildren(box);
  document.body.style.margin = "0";
}

/**
 * Chống clone phía client. Nói thẳng nó LÀ gì và KHÔNG là gì:
 *
 *   LÀ: một gờ giảm tốc chống kiểu tấn công phổ biến nhất — HTTrack/wget mirror toàn bộ site
 *   rồi rehost trên domain khác để lừa đảo (phishing). Nạn nhân mở bản sao sẽ thấy cảnh báo
 *   tiếng Việt thay vì giao diện Larkwave, nên khó bị lừa nhập mật khẩu.
 *
 *   KHÔNG LÀ: một biện pháp bảo mật. Bất kỳ ai biết sửa JS đều xoá được nó trong 10 giây
 *   (xoá component, xoá <script>, hoặc chạy trình duyệt tắt JS). Nó KHÔNG bảo vệ dữ liệu,
 *   KHÔNG chống crawler, và KHÔNG thay thế cho header/WAF ở tầng edge.
 *
 * Nguyên tắc bất di bất dịch: không bao giờ được cản trở người dùng hợp lệ. Không có `window`,
 * hostname rỗng, hay bất kỳ lỗi DOM nào → im lặng bỏ qua (toàn bộ nằm trong try/catch).
 * Render ra null nên không ảnh hưởng layout/hydration.
 */
export default function AntiClone() {
  useEffect(() => {
    try {
      if (typeof window === "undefined" || !window.location) return;
      const hostname = window.location.hostname ?? "";
      if (isAllowedHost(hostname)) return;
      renderCloneNotice();
    } catch {
      /* ignore — thà không cảnh báo còn hơn làm hỏng trang của người dùng thật */
    }
  }, []);

  return null;
}
