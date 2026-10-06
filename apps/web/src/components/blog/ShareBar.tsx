"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { type Locale } from "@larkwave/ui";
import { useLangT } from "@/lib/useLangT";

const noSubscribe = () => () => {};
const hasNativeShare = () => typeof navigator !== "undefined" && typeof navigator.share === "function";
const serverNoShare = () => false;

/**
 * Hàng nút chia sẻ bài viết. Ba mạng có URL chia sẻ công khai (Facebook, X, LinkedIn) là link
 * thuần — mở tab mới, không cần JS; "Sao chép" và "Chia sẻ…" (Web Share API, có trên điện thoại
 * và Safari) mới cần client.
 *
 * `native` đọc qua useSyncExternalStore với snapshot server = false: server không biết trình
 * duyệt có `navigator.share` hay không, HTML đầu tiên không có nút, client hydrate xong mới hiện —
 * không lệch hydrate và không phải setState trong effect.
 */
export default function ShareBar({ url, title, lang }: { url: string; title: string; lang?: Locale }) {
  // `t` trong tệp này đã là tiêu đề đã mã hoá cho link chia sẻ, nên bộ dịch tên là `tr`.
  const tr = useLangT(lang);
  const native = useSyncExternalStore(noSubscribe, hasNativeShare, serverNoShare);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  const u = encodeURIComponent(url);
  const t = encodeURIComponent(title);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard API cần HTTPS + quyền; rơi về cách cũ để nút vẫn làm việc trên WebView cũ.
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        /* bó tay thì thôi — người dùng vẫn copy được từ thanh địa chỉ */
      }
      document.body.removeChild(ta);
    }
    setCopied(true);
  };

  const share = async () => {
    try {
      await navigator.share({ title, url });
    } catch {
      /* người dùng đóng hộp chia sẻ — không phải lỗi */
    }
  };

  return (
    <div className="tw-bl-share" aria-label={tr("blog.share.label", "Chia sẻ bài viết")}>
      <a
        className="tw-bl-share-btn"
        href={`https://www.facebook.com/sharer/sharer.php?u=${u}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={tr("blog.share.facebook", "Chia sẻ lên Facebook")}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 22v-8h2.7l.4-3.2h-3.1V8.8c0-.9.3-1.6 1.6-1.6h1.7V4.4c-.3 0-1.3-.1-2.5-.1-2.5 0-4.1 1.5-4.1 4.2v2.3H7.4V14h2.8v8h3.3z" /></svg>
        <span>Facebook</span>
      </a>
      <a
        className="tw-bl-share-btn"
        href={`https://twitter.com/intent/tweet?url=${u}&text=${t}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={tr("blog.share.x", "Chia sẻ lên X")}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.5 3h3l-6.8 7.8L21.7 21h-6.2l-4.9-6.3L5 21H2l7.3-8.3L1.7 3H8l4.4 5.8L17.5 3zm-1.1 16.2h1.7L7 4.7H5.2l11.2 14.5z" /></svg>
        <span>X</span>
      </a>
      <a
        className="tw-bl-share-btn"
        href={`https://www.linkedin.com/sharing/share-offsite/?url=${u}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={tr("blog.share.linkedin", "Chia sẻ lên LinkedIn")}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.9 8.5H3.6V21h3.3V8.5zM5.3 3a1.9 1.9 0 100 3.8 1.9 1.9 0 000-3.8zM20.4 21v-6.9c0-3.4-.7-6-4.7-6-1.9 0-3.2 1-3.7 2h-.1V8.5H8.8V21h3.3v-6.2c0-1.6.3-3.2 2.3-3.2s2 1.9 2 3.3V21h4z" /></svg>
        <span>LinkedIn</span>
      </a>
      <button type="button" className={`tw-bl-share-btn${copied ? " is-done" : ""}`} onClick={copy} aria-live="polite">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.6 13.4a1 1 0 001.4 0l4.6-4.6a3.5 3.5 0 10-5-5L10 5.4a1 1 0 001.4 1.4l1.6-1.6a1.5 1.5 0 112.1 2.1l-4.5 4.7a1 1 0 000 1.4zm2.8-2.8a1 1 0 00-1.4 0l-4.6 4.6a3.5 3.5 0 105 5l1.6-1.6a1 1 0 00-1.4-1.4l-1.6 1.6a1.5 1.5 0 11-2.1-2.1l4.5-4.7a1 1 0 000-1.4z" /></svg>
        <span>{copied ? tr("blog.share.copied", "Đã sao chép") : tr("blog.share.copy", "Sao chép link")}</span>
      </button>
      {native && (
        <button type="button" className="tw-bl-share-btn" onClick={share}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 16a3 3 0 00-2.2 1l-6.9-4a3 3 0 000-2l6.9-4A3 3 0 1015 5c0 .3 0 .6.1.9L8.3 9.8a3 3 0 100 4.4l6.8 3.9A3 3 0 1018 16z" /></svg>
          <span>{tr("blog.share.native", "Chia sẻ…")}</span>
        </button>
      )}
    </div>
  );
}
