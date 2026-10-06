"use client";

import { useEffect, useState, type MouseEvent } from "react";
import { type Locale } from "@larkwave/ui";
import { useLangT } from "@/lib/useLangT";
import { useReducedMotion } from "@/components/fx";
import type { TocItem } from "./blogShared";

/**
 * Mục lục bài viết.
 *
 * `BlogMarkdown` không gắn id cho heading và không được sửa nó, nên island này làm thay sau khi
 * mount: tìm h2/h3 trong `#bodyId` theo THỨ TỰ và gán id từ `items` (server rút từ Markdown bằng
 * cùng luật — xem extractToc). Danh sách mục lục thì đã có trong HTML server, không phải chờ.
 *
 * Hai bản (cột dính trên máy rộng, `<details>` gập trên máy hẹp) cùng render một lúc và CSS ẩn
 * một trong hai — nên effect gán id chạy hai lần; gán trùng id giống nhau là vô hại.
 */
export default function TableOfContents({
  items,
  bodyId,
  variant,
  lang,
}: {
  items: TocItem[];
  bodyId: string;
  /** `aside`: cột dính bên phải. `mobile`: khối gập ở đầu bài. */
  variant: "aside" | "mobile";
  lang?: Locale;
}) {
  const t = useLangT(lang);
  const reduced = useReducedMotion();
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const body = document.getElementById(bodyId);
    if (!body) return;
    const hs = Array.from(body.querySelectorAll<HTMLElement>("h2, h3"));
    const n = Math.min(hs.length, items.length);
    for (let i = 0; i < n; i += 1) hs[i].id = items[i].id;

    // Mở thẳng /blog/x#muc: id chỉ có sau mount nên trình duyệt chưa kịp nhảy — nhảy hộ.
    const hash = decodeURIComponent(window.location.hash.slice(1));
    if (hash && items.some((it) => it.id === hash)) {
      document.getElementById(hash)?.scrollIntoView({ block: "start" });
    }

    if (typeof IntersectionObserver === "undefined") return;
    // Vùng quan sát là dải ngang gần đỉnh màn (dưới header dính): heading nào vừa đi qua đó là
    // mục đang đọc. Không dùng "heading nào đang hiện" vì trên màn cao có 3–4 heading hiện cùng lúc.
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id);
      },
      { rootMargin: "-90px 0px -70% 0px", threshold: 0 },
    );
    hs.slice(0, n).forEach((h) => io.observe(h));
    return () => io.disconnect();
  }, [items, bodyId]);

  if (items.length === 0) return null;

  const go = (e: MouseEvent<HTMLAnchorElement>, id: string) => {
    const el = document.getElementById(id);
    if (!el) return; // id chưa gán được → để link nhảy theo cách mặc định
    e.preventDefault();
    el.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" });
    window.history.replaceState(null, "", `#${id}`);
    setActive(id);
  };

  const list = (
    <nav className="tw-bl-toc" aria-label={t("blog.toc", "Mục lục")}>
      {items.map((it) => (
        <a
          key={it.id}
          href={`#${it.id}`}
          className={`${it.level === 3 ? "is-h3" : ""}${active === it.id ? " is-active" : ""}`}
          onClick={(e) => go(e, it.id)}
        >
          {it.text}
        </a>
      ))}
    </nav>
  );

  if (variant === "mobile") {
    return (
      <details className="tw-bl-toc-m">
        <summary>{t("blog.toc", "Mục lục")}</summary>
        {list}
      </details>
    );
  }
  return (
    <div className="tw-bl-aside-in">
      <p className="tw-bl-section-h">{t("blog.toc", "Mục lục")}</p>
      {list}
    </div>
  );
}
