"use client";

import {
  AppstoreOutlined,
  ArrowRightOutlined,
  ArrowUpOutlined,
  PaperClipOutlined,
  BarChartOutlined,
  BulbOutlined,
  EditOutlined,
  MessageOutlined,
  PictureOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { useRouter } from "next/navigation";
import { useState, type KeyboardEvent, type ReactNode } from "react";
import { useI18n, V } from "@larkwave/ui";
import { AGENTS, AGENTS_DEEP, AGENTS_GRADIENT } from "@/lib/theme";

/**
 * Màn mở đầu của khu làm việc Agents Chat.
 *
 * DÙNG Ở HAI ĐƯỜNG DẪN, cố ý giống hệt nhau:
 *   /agents-chat        khi chưa chọn hội thoại nào (không có ?c=) và không phải lượt mở mới (?n=)
 *   /agents-chat/new    khi bấm "Cuộc trò chuyện mới"
 *
 * Gõ thẳng /agents-chat mà rơi vào một ô trống không rõ dùng làm gì, trong khi thêm "/new" lại ra
 * màn đầy đủ, thì cùng một sản phẩm hiện ra hai bộ mặt tuỳ người dùng có gõ thêm bốn chữ hay
 * không. Nên cả hai đường cùng trỏ về đây.
 *
 * Vì sao có màn này thay vì thả thẳng người dùng vào một ô trống: ô trống không cho biết chỗ này
 * làm được gì. Mỗi thẻ dưới đây đổ sẵn một câu vào ô soạn rồi mở cuộc trò chuyện mới — người dùng
 * đọc, sửa, hoặc xoá đi gõ cái khác.
 *
 * ĐỔ SẴN CHỨ KHÔNG TỰ GỬI, cố ý. Bấm một thẻ là để bắt đầu, không phải để phát đi một câu chưa kịp
 * đọc; và mỗi lượt gửi đều trừ vào lượt tính phí của người dùng. Ô soạn có sẵn chữ thì họ còn
 * đường lùi, tự gửi thì không.
 */

type Starter = { icon: ReactNode; title: string; prompt: string };

export default function AgentsChatLauncher() {
  const router = useRouter();
  const { t } = useI18n();
  const [draft, setDraft] = useState("");
  const [focus, setFocus] = useState(false);

  const starters: Starter[] = [
    { icon: <AppstoreOutlined />, title: t("agentsChat.newApp", "Dựng một ứng dụng"), prompt: t("agentsChat.newAppPrompt", "Tôi muốn dựng một ứng dụng quản lý đơn hàng cho cửa hàng nhỏ. Hãy hỏi tôi những gì cần biết trước khi bắt đầu.") },
    { icon: <BarChartOutlined />, title: t("agentsChat.newData", "Phân tích dữ liệu"), prompt: t("agentsChat.newDataPrompt", "Tôi có một file bảng tính doanh số. Hãy giúp tôi đọc ra những con số đáng chú ý và vẽ biểu đồ.") },
    { icon: <EditOutlined />, title: t("agentsChat.newWrite", "Viết nội dung"), prompt: t("agentsChat.newWritePrompt", "Viết giúp tôi một bài giới thiệu sản phẩm, giọng tự nhiên, không sáo rỗng, khoảng 600 chữ.") },
    { icon: <PictureOutlined />, title: t("agentsChat.newImage", "Làm ảnh và video"), prompt: t("agentsChat.newImagePrompt", "Tôi cần một bộ ảnh sản phẩm đồng nhất về màu và phong cách cho fanpage. Bắt đầu từ đâu?") },
    { icon: <ThunderboltOutlined />, title: t("agentsChat.newAutomate", "Tự động hoá việc lặp lại"), prompt: t("agentsChat.newAutomatePrompt", "Mỗi ngày tôi phải tổng hợp số liệu từ nhiều nơi rồi gửi báo cáo. Giúp tôi tự động hoá việc này.") },
    { icon: <BulbOutlined />, title: t("agentsChat.newIdea", "Bàn một ý tưởng"), prompt: t("agentsChat.newIdeaPrompt", "Tôi đang có một ý tưởng kinh doanh và muốn nghe phản biện thẳng thắn. Hãy hỏi tôi trước đã.") },
  ];

  const start = (prompt?: string) => {
    const text = prompt?.trim();
    const n = Date.now().toString(36);
    router.push(text ? `/agents-chat?n=${n}&q=${encodeURIComponent(text)}` : `/agents-chat?n=${n}`);
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (draft.trim()) start(draft);
    }
  };

  return (
    <div style={{ height: "100%", overflowY: "auto" }}>
      <div style={{ maxWidth: 880, margin: "0 auto", padding: "56px 20px 72px" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
          <svg width="56" height="56" viewBox="0 0 26 26" aria-hidden="true">
            <defs>
              <linearGradient id="tw-agents-hero" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#1D4ED8" />
                <stop offset="55%" stopColor="#2563EB" />
                <stop offset="100%" stopColor="#06B6D4" />
              </linearGradient>
            </defs>
            <rect x="0" y="0" width="26" height="26" rx="8" fill="url(#tw-agents-hero)" />
            <path
              d="M4.5 16.2c2 0 2-3.6 4-3.6s2 3.6 4 3.6 2-3.6 4-3.6 2 3.6 4 3.6"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <h1 style={{ margin: 0, textAlign: "center", fontSize: "clamp(26px, 4.2vw, 36px)", fontWeight: 800, letterSpacing: -0.4, color: V.text }}>
          {t("agentsChat.newTitle", "Hôm nay bạn muốn làm gì?")}
        </h1>
        <p style={{ margin: "10px 0 0", textAlign: "center", fontSize: 15, lineHeight: 1.6, color: V.textSub }}>
          {t("agentsChat.newSubtitle", "Chọn một việc để bắt đầu — câu hỏi sẽ được đặt sẵn vào ô soạn, bạn sửa lại trước khi gửi.")}
        </p>

        {/*
          Ô SOẠN THẬT, không phải hình trang trí.
          Gõ ở đây rồi Enter (hoặc bấm mũi tên) là mở cuộc trò chuyện mới với đúng câu đó đã nằm
          sẵn trong ô soạn — cùng đường ?q= mà các thẻ gợi ý bên dưới dùng. Bản trước của màn này
          chỉ có thẻ bấm, nên người vào muốn gõ một câu của riêng mình thì không có chỗ nào để gõ.

          Shift+Enter xuống dòng, Enter gửi: đây là thói quen của mọi ô chat, làm khác đi là bắt
          người dùng học lại một thứ họ đã biết.
        */}
        <div
          style={{
            marginTop: 26,
            border: `1px solid ${focus ? AGENTS : V.border}`,
            borderRadius: 18,
            background: V.surface,
            padding: "12px 12px 10px",
            boxShadow: focus ? `0 0 0 3px ${AGENTS}1f` : "none",
            transition: "border-color .16s ease, box-shadow .16s ease",
          }}
        >
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={() => setFocus(true)}
            onBlur={() => setFocus(false)}
            onKeyDown={onKey}
            rows={2}
            placeholder={t("agentsChat.newPlaceholder", "Nhập việc bạn cần làm…")}
            style={{
              width: "100%",
              border: "none",
              outline: "none",
              resize: "none",
              background: "transparent",
              color: V.text,
              fontSize: 15,
              lineHeight: 1.6,
              fontFamily: "inherit",
              padding: "2px 4px 6px",
            }}
          />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: V.textFaint }}>
              <PaperClipOutlined />
              {t("agentsChat.newAttachHint", "Đính kèm tệp được sau khi vào cuộc trò chuyện")}
            </span>
            <button
              type="button"
              onClick={() => start(draft)}
              disabled={!draft.trim()}
              aria-label={t("agentsChat.newSend", "Bắt đầu")}
              style={{
                width: 34,
                height: 34,
                borderRadius: "50%",
                border: "none",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 15,
                color: "#FFFFFF",
                background: draft.trim() ? AGENTS_GRADIENT : V.border,
                cursor: draft.trim() ? "pointer" : "not-allowed",
                transition: "background .14s ease",
              }}
            >
              <ArrowUpOutlined />
            </button>
          </div>
        </div>

        <p style={{ margin: "22px 0 0", fontSize: 12.5, fontWeight: 600, letterSpacing: 0.3, color: V.textFaint, textTransform: "uppercase" }}>
          {t("agentsChat.newOrPick", "Hoặc chọn một việc có sẵn")}
        </p>

        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(248px, 1fr))", gap: 12 }}>
          {starters.map((s) => (
            <button
              key={s.title}
              onClick={() => start(s.prompt)}
              style={{ display: "flex", alignItems: "flex-start", gap: 12, textAlign: "left", padding: "16px 16px", borderRadius: 14, border: `1px solid ${V.border}`, background: V.surface, cursor: "pointer", transition: "border-color .14s ease, box-shadow .14s ease, transform .14s ease" }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = AGENTS; e.currentTarget.style.boxShadow = `0 0 0 3px ${AGENTS}1f`; e.currentTarget.style.transform = "translateY(-1px)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = V.border; e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.transform = "none"; }}
            >
              <span style={{ flexShrink: 0, width: 34, height: 34, borderRadius: 10, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 17, color: "#FFFFFF", background: AGENTS_GRADIENT }}>
                {s.icon}
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontWeight: 650, fontSize: 14.5, color: V.text }}>{s.title}</span>
                <span style={{ display: "block", marginTop: 3, fontSize: 12.5, lineHeight: 1.5, color: V.textSub }}>{s.prompt}</span>
              </span>
            </button>
          ))}
        </div>

        <div style={{ marginTop: 26, display: "flex", justifyContent: "center" }}>
          <button
            onClick={() => start()}
            style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "11px 20px", borderRadius: 999, border: "none", cursor: "pointer", fontWeight: 650, fontSize: 14.5, color: "#FFFFFF", background: AGENTS_GRADIENT }}
            onMouseEnter={(e) => (e.currentTarget.style.background = AGENTS_DEEP)}
            onMouseLeave={(e) => (e.currentTarget.style.background = AGENTS_GRADIENT)}
          >
            <MessageOutlined />
            {t("agentsChat.newBlank", "Bắt đầu với một ô trống")}
            <ArrowRightOutlined style={{ fontSize: 12 }} />
          </button>
        </div>
      </div>
    </div>
  );
}
