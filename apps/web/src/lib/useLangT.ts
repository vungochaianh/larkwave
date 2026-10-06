"use client";

import { useEffect, useState } from "react";
import { useI18n, translate, type Locale } from "@larkwave/ui";

/**
 * Dịch chữ cho một island nằm trong trang kết xuất ở MÁY CHỦ.
 *
 * Vấn đề nó giải. Client component dựng ở máy chủ thì context i18n chưa có gì để dựa vào nên luôn
 * trả 'vi'. Trang bài viết và trang blog thì đã biết ngôn ngữ (từ `?lang=` hoặc cookie) và dựng
 * thân bài đúng thứ tiếng — chỉ những island bên trong là không. Đo ngày 23/09/2026 trên
 * /blog?lang=en: bài tiếng Anh, còn menu, mục lục và hàng nút chia sẻ vẫn tiếng Việt trong HTML
 * máy chủ trả về, rồi mới đổi sau khi hydrate. Máy tìm kiếm đọc HTML thô nên chỉ thấy vế đầu.
 *
 * Hai giai đoạn, cố ý:
 *  - trước khi mount: tin `lang` (thứ máy chủ vừa dùng) → HTML đầu tiên đúng thứ tiếng;
 *  - sau khi mount: tin context → bấm nút đổi ngôn ngữ thì island đổi theo, không đứng lại.
 *
 * Bình thường hai giai đoạn cho cùng một chữ (detectLocale cũng đọc `?lang=` rồi cookie, đúng thứ
 * tự máy chủ dùng), nên không có cảnh chữ nhảy và không lệch hydrate.
 */
/**
 * Ngôn ngữ HIỆU LỰC của một island, theo đúng luật hai giai đoạn ở trên.
 *
 * Có những island không chỉ cần dịch CHỮ mà còn phải chọn DỮ LIỆU theo ngôn ngữ — /pricing chọn
 * giữa hai bản catalog gói (tiếng Việt và tiếng Anh) cho khách chưa đăng nhập. Chúng cần chính
 * con số `locale` chứ không phải hàm `t`, và nếu tự tính lại luật "trước/sau khi mount" ở từng
 * nơi thì sớm muộn hai bản sao lệch nhau. Một chỗ tính, nhiều nơi dùng.
 */
export function useNgonNguIsland(lang?: Locale): Locale {
  const { locale } = useI18n();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? locale : lang ?? locale;
}

export function useLangT(lang?: Locale) {
  const { t: tCtx, locale } = useI18n();
  const dung = useNgonNguIsland(lang);
  if (dung === locale) return tCtx;
  return (k: string, f?: string, v?: Record<string, string | number>) => translate(dung, k, f, v);
}
