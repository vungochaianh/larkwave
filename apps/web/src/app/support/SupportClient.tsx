"use client";

import { useCallback, useEffect, useState } from "react";
import { useLangT, useNgonNguIsland } from "@/lib/useLangT";
import type { Locale } from "@larkwave/ui";
import Link from "next/link";
import { App, Button, Collapse, Input, Tag, Spin } from "antd";
import type { Feedback, FeedbackStatus, MyFeedbackResponse } from "@larkwave/shared";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { FANPAGE_URL } from "@/lib/billing";
import { useI18n } from "@larkwave/ui";
import { LandingHeader, LandingFooter } from "@/components/LandingChrome";
import { CursorGlow } from "@/components/fx";
import { faqFor } from "./faq";

const BRAND = "#6C5CE7";
const GRADIENT =
  "linear-gradient(135deg, #6C5CE7 0%, #A66BFF 45%, #FF7AB6 75%, #4FB6FF 100%)";

/** Chỗ người ta tự tìm được câu trả lời nhanh hơn chờ trả lời. Đặt TRƯỚC ô báo lỗi là có chủ ý. */
type TFn = (k: string, fb?: string) => string;
const selfServe = (t: TFn) => [
  { href: "/community", title: t("sup.ssCommunity.lw", "Cộng đồng"), desc: t("sup.ssCommunityD.lw", "Hỏi người dùng khác, xem mẹo dùng Lark Agents và Kỹ năng.") },
  { href: "/pricing", title: t("sup.ssPrice", "Gói & Giá"), desc: t("sup.ssPriceD.lw", "Hạn mức dùng AI mỗi tháng, và gói miễn phí gồm những gì.") },
  { href: "/download", title: t("sup.ssApp", "Tải app desktop"), desc: t("sup.ssAppD.lw", "Kết nối Lark bằng QR và chạy AI ngay trên máy bạn.") },
];

/**
 * Nhãn trạng thái. Giá trị lấy từ `FeedbackStatus` trong @larkwave/shared, KHÔNG tự đặt.
 *
 * Bản đầu tôi viết theo trí nhớ là new/triaged/fixed — không có cái nào tồn tại. Mọi báo cáo sẽ
 * rơi xuống nhánh mặc định và hiện ra chuỗi thô tiếng Anh cho người dùng đọc.
 */
function StatusTag({ s, t }: { s: FeedbackStatus; t: TFn }) {
  const map: Record<FeedbackStatus, { color: string; label: string }> = {
    open: { color: "blue", label: t("sup.stOpen", "Đang xử lý") },
    resolved: { color: "green", label: t("sup.stResolved", "Đã xử lý") },
    duplicate: { color: "gold", label: t("sup.stDuplicate", "Trùng báo cáo khác") },
    rejected: { color: "default", label: t("sup.stRejected", "Không phải lỗi") },
  };
  const m = map[s] ?? { color: "default", label: String(s) };
  return <Tag color={m.color}>{m.label}</Tag>;
}

/** `lang` từ máy chủ: lúc dựng ở máy chủ context i18n luôn trả 'vi' — xem lib/useLangT.ts. */
export default function SupportClient({ lang }: { lang?: Locale }) {
  // `locale` cũng phải theo `lang`, không chỉ riêng `t`: danh sách câu hỏi thường gặp chọn bản vi/en
  // theo biến này. Để nó rơi về context là trang tiếng Anh dựng ra câu hỏi tiếng Việt trong HTML máy chủ
  // — đúng lúc page.tsx đang khai FAQPage JSON-LD với inLanguage en-US.
  const t = useLangT(lang);
  const locale = useNgonNguIsland(lang);
  const { user, loading } = useAuth();
  const FAQ = faqFor(locale);
  const SELF_SERVE = selfServe(t);
  const { message } = App.useApp();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [mine, setMine] = useState<MyFeedbackResponse | null>(null);
  const [loadingMine, setLoadingMine] = useState(false);

  const loadMine = useCallback(async () => {
    if (!user) return;
    setLoadingMine(true);
    try {
      setMine(await api.myFeedback());
    } catch {
      /* không tải được danh sách thì vẫn phải gửi được báo cáo mới — đừng chặn cả trang vì nó */
    } finally {
      setLoadingMine(false);
    }
  }, [user]);

  useEffect(() => {
    void loadMine();
  }, [loadMine]);

  const submit = async () => {
    const msg = text.trim();
    // Ngưỡng 10 ký tự: "lỗi", "app hỏng" thì không lần ra được gì, và người gửi cũng chẳng nhận
    // được gì ngoài một vòng hỏi lại.
    if (msg.length < 10) {
      message.warning(t("sup.tooShort", "Mô tả giúp cụ thể hơn — bạn đang ở màn nào, bấm gì thì ra lỗi?"));
      return;
    }
    setSending(true);
    try {
      await api.submitFeedback({
        message: msg,
        url: typeof window !== "undefined" ? window.location.href : undefined,
        context: { userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "" },
      });
      message.success(t("sup.sent", "Đã gửi. Cảm ơn bạn — mỗi báo cáo đều được đọc."));
      setText("");
      void loadMine();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <main style={{ background: "var(--tw-layer, #FFFFFF)", color: "var(--tw-text, #1E2230)", minHeight: "100vh" }}>
      <CursorGlow />
      <LandingHeader lang={lang} />

      <div style={{ maxWidth: 880, margin: "0 auto", padding: "clamp(28px,5vw,56px) clamp(16px,5vw,28px) 72px" }}>
        <h1 style={{ fontSize: "clamp(30px,5vw,44px)", fontWeight: 800, lineHeight: 1.15, margin: "0 0 12px", letterSpacing: -0.5 }}>
          {t("sup.title", "Góp ý & Hỗ trợ")}
        </h1>
        <p style={{ fontSize: 18, lineHeight: 1.6, color: "var(--tw-text-sub, #3A4256)", margin: "0 0 40px" }}>
          {t("sup.lede", "Gặp lỗi, thấy chỗ khó dùng, hay muốn đề xuất tính năng — gửi thẳng ở đây. Mỗi báo cáo đều được đọc và phân loại.")}
        </p>

        {/* ── tự tìm trước ── */}
        <h2 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 14px" }}>{t("sup.quickFind", "Tìm nhanh")}</h2>
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", marginBottom: 44 }}>
          {SELF_SERVE.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              style={{
                display: "block",
                padding: "16px 18px",
                borderRadius: 12,
                border: "1px solid rgba(127,127,127,0.25)",
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 4 }}>{s.title}</div>
              <div style={{ fontSize: 13.5, color: "var(--tw-text-sub, #6B7280)", lineHeight: 1.5 }}>{s.desc}</div>
            </Link>
          ))}
        </div>

        {/* ── báo lỗi ── */}
        <h2 id="bao-loi" style={{ fontSize: 22, fontWeight: 800, margin: "0 0 14px" }}>
          {t("sup.report", "Báo lỗi hoặc góp ý")}
        </h2>

        {loading ? (
          <Spin />
        ) : user ? (
          <div style={{ marginBottom: 44 }}>
            <Input.TextArea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              maxLength={4000}
              showCount
              placeholder={t("sup.placeholder", "Bạn đang ở màn nào, bấm gì thì ra lỗi, và bạn mong đợi điều gì xảy ra? Càng cụ thể càng sửa nhanh.")}
            />
            <Button
              type="primary"
              onClick={submit}
              loading={sending}
              style={{ marginTop: 12, background: GRADIENT, border: "none", fontWeight: 600 }}
            >
              {t("sup.send", "Gửi báo cáo")}
            </Button>

            {/* Báo cáo của chính người dùng. Không có phần này thì gửi xong là rơi vào im lặng, và
                lần sau người ta không gửi nữa. */}
            <div style={{ marginTop: 28 }}>
              <h3 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 10px" }}>{t("sup.yours", "Báo cáo của bạn")}</h3>
              {/* Tóm tắt báo cáo đã gửi. Không hiện thì người gửi không thấy báo cáo của mình dẫn
                  tới đâu, và lần sau họ không gửi nữa. */}
              {mine && mine.totalReports > 0 && (
                <p style={{ fontSize: 13.5, color: "var(--tw-text-sub, #6B7280)", margin: "0 0 12px" }}>
                  Bạn đã gửi <b>{mine.totalReports}</b> báo cáo · <b>{mine.resolvedCount}</b> đã xử lý
                </p>
              )}
              {loadingMine ? (
                <Spin size="small" />
              ) : mine?.items?.length ? (
                <div style={{ display: "grid", gap: 10 }}>
                  {mine.items.slice(0, 8).map((f: Feedback) => (
                    <div
                      key={f.id}
                      style={{ padding: "12px 14px", borderRadius: 10, border: "1px solid rgba(127,127,127,0.22)" }}
                    >
                      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
                        <StatusTag s={f.status} t={t} />
                        <span style={{ fontSize: 12.5, color: "var(--tw-text-faint, #9AA3B5)" }}>
                          {new Date(f.createdAt).toLocaleDateString("vi-VN")}
                        </span>
                      </div>
                      <div style={{ fontSize: 14, lineHeight: 1.5 }}>{f.message.slice(0, 220)}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: "var(--tw-text-sub, #6B7280)", fontSize: 14 }}>
                  {t("sup.none", "Bạn chưa gửi báo cáo nào.")}
                </p>
              )}
            </div>
          </div>
        ) : (
          // Chưa đăng nhập thì KHÔNG dựng một ô nhập rồi báo lỗi lúc bấm gửi: đầu API đòi đăng
          // nhập, nên nói thẳng từ đầu và chừa một kênh không cần tài khoản.
          <div
            style={{
              marginBottom: 44,
              padding: "20px 22px",
              borderRadius: 12,
              border: "1px solid rgba(127,127,127,0.25)",
            }}
          >
            <p style={{ margin: "0 0 14px", lineHeight: 1.6 }}>
              {t("sup.needLogin", "Gửi báo cáo cần đăng nhập — để bạn theo dõi được trạng thái xử lý, và để chúng tôi hỏi lại khi cần thêm thông tin.")}
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link href="/login?next=%2Fsupport">
                <Button type="primary" style={{ background: GRADIENT, border: "none", fontWeight: 600 }}>
                  {t("sup.loginToSend", "Đăng nhập để gửi")}
                </Button>
              </Link>
              <a href={FANPAGE_URL} target="_blank" rel="noopener noreferrer">
                <Button>{t("sup.fanpage", "Nhắn qua fanpage")}</Button>
              </a>
            </div>
          </div>
        )}

        {/* ── câu hỏi thường gặp ── */}
        <h2 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 14px" }}>{t("sup.faq", "Câu hỏi thường gặp")}</h2>
        {/* forceRender: BẮT BUỘC, không phải tuỳ chọn.
            Mặc định Collapse chỉ render nội dung khi mở, nên câu trả lời KHÔNG nằm trong HTML máy
            chủ trả về. Bộ soi đo được 232 từ hiển thị — "trang mỏng". Tệ hơn: JSON-LD FAQPage bên
            layout khai đầy đủ câu trả lời trong khi trang không hiện chúng, và đó đúng là kiểu dữ
            liệu có cấu trúc bị phạt. Render sẵn rồi thu gọn bằng CSS thì cả người lẫn máy đều thấy. */}
        <Collapse
          accordion
          defaultActiveKey={["0"]}
          items={FAQ.map((f, i) => ({
            key: String(i),
            forceRender: true,
            label: <span style={{ fontWeight: 600 }}>{f.q}</span>,
            children: <p style={{ margin: 0, lineHeight: 1.6 }}>{f.a}</p>,
          }))}
        />

        {/* ── kênh liên hệ ── */}
        <div
          style={{
            marginTop: 44,
            padding: "24px 26px",
            borderRadius: 16,
            background: GRADIENT,
            color: "#fff",
          }}
        >
          <div style={{ fontWeight: 800, fontSize: 19, marginBottom: 6 }}>{t("sup.stillStuck", "Chưa tìm thấy câu trả lời?")}</div>
          <p style={{ margin: "0 0 16px", lineHeight: 1.6, opacity: 0.95 }}>
            {t("sup.stillStuckD", "Nhắn cho chúng tôi qua fanpage — không cần tài khoản.")}
          </p>
          <a href={FANPAGE_URL} target="_blank" rel="noopener noreferrer">
            <Button style={{ background: "#fff", color: BRAND, border: "none", fontWeight: 700 }}>
              {t("sup.openFanpage", "Mở fanpage")} →
            </Button>
          </a>
        </div>
      </div>

      <LandingFooter lang={lang} />
    </main>
  );
}
