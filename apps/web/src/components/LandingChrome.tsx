"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useI18n, type Locale } from "@larkwave/ui";
import { useLangT } from "@/lib/useLangT";
import { useAuthOptional } from "@/lib/auth";
import { UserAvatar } from "@/components/UserAvatar";

// Shared marketing header + footer for public pages (welcome, login, register).
// All consumers are client components; `useI18n()` is safe with or without a provider
// (falls back to Vietnamese), so this stays a lightweight client component.
//
// Màu đi qua biến `--tw-*` (kèm fallback sáng) chứ không cứng: header này dùng ở cả trang ép SÁNG
// (đăng nhập) lẫn trang ép TỐI (/welcome, /download, /blog, …) — một thanh trắng trên nền đen-tím
// là thứ đầu tiên phá hỏng cảm giác "tối hẳn". Nền header là nền trang pha trong suốt (color-mix)
// + blur, nên ở tối nó là kính đen, ở sáng là kính trắng như trước.

const BRAND = "#6C5CE7";
const GRADIENT =
  "linear-gradient(135deg, #6C5CE7 0%, #A66BFF 45%, #FF7AB6 75%, #4FB6FF 100%)";

/** Inline lightning-bolt mark (lib-style SVG, not an emoji). */
function Bolt({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M13 2 4.5 13.5H11l-1 8.5L19.5 10H13z" />
    </svg>
  );
}

const SECONDARY_LINKS: { href: string; key: string; vi: string }[] = [
  { href: "/explore", key: "landing.nav.explore", vi: "Khám phá" },
  { href: "/store", key: "landing.nav.store", vi: "Cửa hàng" },
  { href: "/pricing", key: "landing.nav.pricing", vi: "Gói & Giá" },
  { href: "/blog", key: "landing.nav.blog", vi: "Blog" },
  { href: "/download", key: "landing.nav.download", vi: "Tải app" },
];

export function LandingHeader({ lang }: { lang?: Locale } = {}) {
  const t = useLangT(lang);
  const [menuOpen, setMenuOpen] = useState(false);
  /**
   * Trang chủ KHÔNG còn đá người đã đăng nhập sang /overview nữa (xem proxy.ts), nên phần đầu
   * trang phải tự biết người xem là ai.
   *
   * `loading` là lúc còn đang hỏi máy chủ xem phiên có còn hiệu lực không. Trong quãng đó KHÔNG
   * dựng gì ở ô này: dựng cặp "Đăng nhập / Dùng thử miễn phí" rồi một nhịp sau đổi thành tên tài
   * khoản là một cú nháy thấy rõ, và tệ hơn, nó mời người đang đăng nhập bấm "Đăng nhập".
   */
  const auth = useAuthOptional();
  const user = auth?.user ?? null;
  const authLoading = auth?.loading ?? false;

  const navLinks = () =>
    SECONDARY_LINKS.map((l) => (
      <Link
        key={l.href}
        href={l.href}
        style={{ padding: "8px 12px", color: "var(--tw-text-sub, #3A4256)", fontWeight: 500, fontSize: 14, whiteSpace: "nowrap" }}
      >
        {t(l.key, l.vi)}
      </Link>
    ));

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 20,
        background: "color-mix(in srgb, var(--tw-layer, #F4F5FB) 74%, transparent)",
        backdropFilter: "blur(10px)",
        borderBottom: "1px solid var(--tw-border, #ECEDF3)",
      }}
    >
      {/* 3 responsive modes: ≥900px inline menu (row 1); 600–899px the menu drops to a 2nd row
          UNDER the logo (wraps if tight); <600px collapses to a hamburger. */}
      <style>{`
        .tw-lh-inline { display: flex; }
        .tw-lh-row2 { display: none; }
        .tw-lh-row2-links { display: flex; }
        .tw-lh-ham { display: none; }
        @media (max-width: 899px) {
          .tw-lh-inline { display: none; }
          .tw-lh-row2 { display: flex; }
        }
        @media (max-width: 599px) {
          /* KHỔ ĐIỆN THOẠI: bỏ hẳn hàng hai, ☰ về hàng một.
             Hàng hai cao 59px mà chỉ chứa đúng một nút ☰; cộng hàng một là 122px chrome và H1 bị
             đẩy xuống 246px — gần một phần ba màn hình 812px trôi qua trước khi có chữ nào đáng
             đọc. Chỗ đổi lấy khoảng trống đó là CHỮ HIỆU: biểu tượng 32px vẫn nhận ra thương
             hiệu, còn chữ "TOOLSWAVE" tốn 146px theo đúng phép đo ghi ở dưới. */
          .tw-lh-row2 { display: none; }
          .tw-lh-row2-links { display: none; }
          .tw-lh-ham { display: flex; }
          .tw-lh-wordmark { display: none; }
          /* Ở khổ điện thoại, hàng 1 CHỈ còn chữ hiệu và nút chính.
             Đo trên bản chạy thật ở khổ 375px (iPhone SE/mini — khổ rất phổ biến) với giao diện
             tiếng Việt: chữ hiệu 146px + "Đăng nhập" 56px + "Dùng thử miễn phí" 136px cộng khoảng
             cách là chạm mép 404px, tức LÒI RA 29px. Mà trang KHÔNG cuộn ngang được (thẻ cha cắt
             mất phần thừa), nên nút chính cứ thế bị xén, im lặng, không có dấu hiệu gì.
             Bản tiếng Anh vừa khít ("Try it free" chỉ 80px) nên lỗi này chỉ lộ khi xem bằng tiếng
             Việt — thử ở locale mặc định của máy là không thấy.
             "Đăng nhập" bỏ khỏi hàng 1 chứ KHÔNG mất: nó được thêm vào menu ☰ ngay dưới đây. */
          .tw-lh-login { display: none !important; }
          /* Tên tài khoản ẩn ở khổ điện thoại, chỉ còn ảnh đại diện: tên người dùng dài bao nhiêu
             là do họ đặt, không khống chế được, mà hàng 1 vừa mới đủ chỗ cho nút chính. */
          .tw-lh-account-name { display: none !important; }
          .tw-lh-primary { padding: 7px 12px !important; font-size: 13px !important; }
        }
      `}</style>

      {/* Row 1: logo + inline menu (wide only) + CTAs */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px clamp(16px, 5vw, 56px)" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--tw-text, #1E2230)", flexShrink: 0 }}>
          <span
            style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              background: GRADIENT,
              color: "#fff",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 6px 16px rgba(108,92,231,0.30)",
              flexShrink: 0,
            }}
          >
            <Bolt size={18} />
          </span>
          <strong className="tw-lh-wordmark" style={{ letterSpacing: 1, fontSize: 16 }}>TOOLSWAVE</strong>
        </Link>

        <nav className="tw-lh-inline" style={{ alignItems: "center", gap: 2, marginLeft: 14 }}>
          {navLinks()}
        </nav>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
        {/* Nút đổi ngôn ngữ ĐỨNG Ở ĐÂY chứ không chỉ ở footer: site phục vụ cả người Việt lẫn
            người nước ngoài, mà chỗ đổi cũ nằm cuối một trang dài 12.797px trên điện thoại. */}
        <LangSwitch gon />
      <div className="tw-lh-ham" style={{ position: "relative" }}>
        <button
          type="button"
          aria-label={t("landing.menu.label", "Menu")}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            height: 40,
            padding: "0 16px",
            border: "1px solid var(--tw-border, #ECEDF3)",
            borderRadius: 12,
            background: "var(--tw-surface, #fff)",
            color: "var(--tw-text-sub, #3A4256)",
            fontSize: 14,
            fontWeight: 600,
            lineHeight: 1,
            cursor: "pointer",
          }}
        >
          <span aria-hidden="true" style={{ fontSize: 18 }}>☰</span>
          {t("landing.menu.label", "Menu")}
        </button>
        {menuOpen && (
          <>
            <div onClick={() => setMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 25 }} aria-hidden="true" />
            <div
              style={{
                position: "absolute",
                right: 0,
                top: "calc(100% + 8px)",
                minWidth: 180,
                background: "var(--tw-surface, #fff)",
                border: "1px solid var(--tw-border, #ECEDF3)",
                borderRadius: 12,
                boxShadow: "0 12px 32px rgba(20,20,40,0.14)",
                padding: 6,
                display: "flex",
                flexDirection: "column",
                gap: 2,
                zIndex: 30,
              }}
            >
              {SECONDARY_LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setMenuOpen(false)}
                  style={{ padding: "10px 12px", borderRadius: 8, color: "var(--tw-text, #3A4256)", fontWeight: 500, fontSize: 14 }}
                >
                  {t(l.key, l.vi)}
                </Link>
              ))}
              {/* "Đăng nhập" sống ở ĐÂY trên khổ điện thoại, vì hàng 1 đã giấu nó đi để nút chính
                  không bị xén. Menu ☰ chỉ hiện ở ≤599px nên không cần thêm điều kiện: ở khổ lớn
                  hơn, hàng 1 vẫn có "Đăng nhập" như cũ và menu này không tồn tại. */}
              <span style={{ height: 1, background: "var(--tw-border-sub, #F1F2F7)", margin: "4px 6px" }} aria-hidden="true" />
              <Link
                href="/login"
                onClick={() => setMenuOpen(false)}
                style={{ padding: "10px 12px", borderRadius: 8, color: BRAND, fontWeight: 600, fontSize: 14 }}
              >
                {t("landing.nav.login", "Đăng nhập")}
              </Link>
            </div>
          </>
        )}
        </div>
          {authLoading ? null : user ? (
            <Link
              href="/overview"
              className="tw-lh-primary"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "5px 12px 5px 5px",
                border: "1px solid var(--tw-border, #ECEDF3)",
                borderRadius: 999,
                background: "var(--tw-surface, #fff)",
                color: "var(--tw-text, #3A4256)",
                fontWeight: 600,
                fontSize: 14,
                whiteSpace: "nowrap",
              }}
            >
              <UserAvatar name={user.name || user.email} avatarUrl={user.avatarUrl} size={28} />
              <span className="tw-lh-account-name">{user.name || user.email}</span>
            </Link>
          ) : (
            <>
              <Link href="/login" className="tw-lh-login" style={{ padding: "8px 14px", color: BRAND, fontWeight: 600, fontSize: 14, whiteSpace: "nowrap" }}>
                {t("landing.nav.login", "Đăng nhập")}
              </Link>
              <Link
                href="/register"
                className="tw-lh-primary"
                style={{
                  padding: "9px 18px",
                  background: GRADIENT,
                  color: "#fff",
                  borderRadius: 10,
                  fontWeight: 600,
                  fontSize: 14,
                  whiteSpace: "nowrap",
                  boxShadow: "0 6px 16px rgba(108,92,231,0.28)",
                }}
              >
                {t("landing.cta.tryFree", "Dùng thử miễn phí")}
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Row 2 (≤899px): a separate row UNDER row 1, divided off so it never crowds the CTAs.
          Tablet → the menu links (wrap if tight). Phone → the hamburger, right-aligned under the
          CTAs and well spaced so it's an easy, safe tap target. */}
      <div className="tw-lh-row2" style={{ alignItems: "center", padding: "8px clamp(16px, 5vw, 56px) 10px", borderTop: "1px solid var(--tw-border-sub, #F1F2F7)" }}>
        <nav className="tw-lh-row2-links" style={{ flexWrap: "wrap", alignItems: "center", gap: 2 }}>
          {navLinks()}
        </nav>
      </div>
    </header>
  );
}

/**
 * Nút chuyển VI / EN.
 *
 * Hiện TÊN NGÔN NGỮ chứ không phải lá cờ: cờ đại diện cho quốc gia, không phải ngôn ngữ — người
 * Việt ở nước ngoài và người nước ngoài ở Việt Nam đều bị cờ chỉ sai.
 *
 * Bấm đổi là đổi NGAY TẠI TRANG ĐANG XEM, không đá về trang chủ. `setLocale` ghi cả localStorage
 * lẫn cookie; cookie mới là thứ những trang kết xuất ở máy chủ (blog, bài viết) đọc được — thiếu
 * nó thì giao diện đổi sang tiếng Anh mà bài vẫn hiện tiếng Việt, đúng lỗi vừa phải sửa.
 *
 * `router.refresh()` là bắt buộc: đổi cookie thôi không làm Next dựng lại phần máy chủ, nên nếu
 * không gọi thì người dùng phải tự bấm tải lại mới thấy bài đổi ngôn ngữ.
 */
/**
 * Nút đổi tiếng Việt / English.
 *
 * `gon` là biến thể cho THANH ĐẦU TRANG: nhãn rút còn "VI" / "EN" vì ở khổ 375px hàng một chỉ
 * còn khoảng 55px cho nó. Tên đầy đủ vẫn đi vào `title` và `aria-label` nên trình đọc màn hình
 * và người rê chuột vẫn nghe/thấy đủ chữ. Footer giữ nhãn đầy đủ vì ở đó rộng rãi.
 */
function LangSwitch({ gon }: { gon?: boolean } = {}) {
  const { locale, setLocale } = useI18n();
  const router = useRouter();
  const pick = (l: "vi" | "en") => {
    if (l === locale) return;
    setLocale(l);
    router.refresh();
  };
  const btn = (l: "vi" | "en", label: string, dayDu: string) => (
    <button
      type="button"
      onClick={() => pick(l)}
      aria-current={locale === l ? "true" : undefined}
      aria-label={dayDu}
      title={dayDu}
      lang={l}
      style={{
        border: "none",
        background: "transparent",
        padding: gon ? "3px 7px" : "4px 8px",
        borderRadius: 6,
        cursor: locale === l ? "default" : "pointer",
        fontSize: 13,
        fontWeight: locale === l ? 700 : 500,
        color: locale === l ? "var(--tw-text, #1E2230)" : "var(--tw-text-sub, #6B7280)",
      }}
    >
      {label}
    </button>
  );
  return (
    <div
      style={{ display: "inline-flex", alignItems: "center", border: "1px solid var(--tw-border, #ECEDF3)", borderRadius: 999, padding: 2 }}
      role="group"
      aria-label="Ngôn ngữ / Language"
    >
      {btn("vi", gon ? "VI" : "Tiếng Việt", "Tiếng Việt")}
      <span aria-hidden="true" style={{ color: "var(--tw-border, #ECEDF3)" }}>|</span>
      {btn("en", gon ? "EN" : "English", "English")}
    </div>
  );
}

export function LandingFooter({ lang }: { lang?: Locale } = {}) {
  const t = useLangT(lang);
  return (
    <footer style={{ borderTop: "1px solid var(--tw-border, #ECEDF3)", padding: "32px clamp(16px,5vw,56px)", color: "var(--tw-text-sub, #6B7280)" }}>
      <div
        style={{
          maxWidth: 1180,
          margin: "0 auto",
          display: "flex",
          flexWrap: "wrap",
          gap: 16,
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              width: 26,
              height: 26,
              borderRadius: 8,
              background: GRADIENT,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
            }}
          >
            <Bolt size={14} />
          </span>
          <span style={{ fontWeight: 700, color: "var(--tw-text, #1E2230)" }}>Larkwave</span>
          <span style={{ fontSize: 13 }}>{t("landing.footer.tagline", "· Tạo app bằng AI")}</span>
        </div>
        <nav style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 14 }}>
          <Link href="/explore" style={{ color: "var(--tw-text-sub, #6B7280)" }}>{t("landing.nav.explore", "Khám phá")}</Link>
          <Link href="/store" style={{ color: "var(--tw-text-sub, #6B7280)" }}>{t("landing.nav.store", "Cửa hàng")}</Link>
          <Link href="/pricing" style={{ color: "var(--tw-text-sub, #6B7280)" }}>{t("landing.nav.pricing", "Gói & Giá")}</Link>
          <Link href="/blog" style={{ color: "var(--tw-text-sub, #6B7280)" }}>{t("landing.nav.blog", "Blog")}</Link>
          <Link href="/download" style={{ color: "var(--tw-text-sub, #6B7280)" }}>{t("landing.nav.download", "Tải app")}</Link>
          <Link href="/support" style={{ color: "var(--tw-text-sub, #6B7280)" }}>{t("landing.nav.support", "Hỗ trợ")}</Link>
          <Link href="/login" style={{ color: "var(--tw-text-sub, #6B7280)" }}>{t("landing.nav.login", "Đăng nhập")}</Link>
          <Link href="/register" style={{ color: "var(--tw-text-sub, #6B7280)" }}>{t("landing.nav.register", "Đăng ký")}</Link>
        </nav>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <LangSwitch />
          <span style={{ fontSize: 13 }}>© 2026 Larkwave</span>
        </div>
      </div>
    </footer>
  );
}
