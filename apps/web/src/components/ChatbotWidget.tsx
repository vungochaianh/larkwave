"use client";

import { CloseOutlined, RobotOutlined, SendOutlined } from "@ant-design/icons";
import { App, Avatar, Button, Input, Spin, Typography } from "antd";
import { usePathname } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useI18n } from "@larkwave/ui";
import { streamAssistant } from "@/lib/api";
import { BRAND_GRADIENT } from "@/lib/theme";
import MarkdownLite from "@/components/MarkdownLite";

const { Text } = Typography;
type Msg = { role: "user" | "assistant"; content: string };
const POS_KEY = "tw-chatbot-pos";

/** Common questions shown as one-tap chips in the empty assistant state. */
const FAQS: { key: string; vi: string }[] = [
  { key: "wcomp.faqCreateApp", vi: "Làm sao để tạo app mới?" },
  { key: "wcomp.faqDeploy", vi: "App của tôi deploy ở đâu, tên miền thế nào?" },
  { key: "wcomp.faqBuildError", vi: "Build bị lỗi thì sửa thế nào?" },
  {
    key: "wcomp.faqUpgradeFullstack",
    vi: "Nâng cấp app tĩnh thành full-stack (có cơ sở dữ liệu) thế nào?",
  },
  { key: "wcomp.faqPlanCredit", vi: "Gói cước & credit hoạt động ra sao?" },
];

/** Floating, draggable AI help-assistant. Position persists in localStorage. */
export default function ChatbotWidget() {
  const { t } = useI18n();
  const { message } = App.useApp();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null); // null = default corner
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);
  const posRef = useRef<{ x: number; y: number } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(POS_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        setPos(p);
        posRef.current = p;
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, open]);

  const fabStyle: CSSProperties = pos
    ? { left: pos.x, top: pos.y }
    : { right: 20, bottom: "calc(78px + env(safe-area-inset-bottom))" };

  const onPointerDown = (e: ReactPointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    drag.current = { sx: e.clientX, sy: e.clientY, ox: rect.left, oy: rect.top, moved: false };
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.sx;
    const dy = e.clientY - drag.current.sy;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) drag.current.moved = true;
    if (drag.current.moved) {
      const x = Math.max(8, Math.min(window.innerWidth - 56, drag.current.ox + dx));
      const y = Math.max(8, Math.min(window.innerHeight - 56, drag.current.oy + dy));
      const p = { x, y };
      posRef.current = p;
      setPos(p);
    }
  };
  const onPointerUp = () => {
    if (!drag.current) return;
    const moved = drag.current.moved;
    drag.current = null;
    if (moved) {
      try {
        if (posRef.current) localStorage.setItem(POS_KEY, JSON.stringify(posRef.current));
      } catch {
        /* ignore */
      }
    } else {
      setOpen((o) => !o);
    }
  };

  const send = (override?: string) => {
    const content = (override ?? text).trim();
    if (!content || loading) return;
    const next: Msg[] = [...msgs, { role: "user", content }];
    // Add the user turn + an empty assistant bubble to stream tokens into.
    setMsgs([...next, { role: "assistant", content: "" }]);
    setText("");
    setLoading(true);
    let acc = "";
    const setLast = (c: string) =>
      setMsgs((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = { role: "assistant", content: c };
        return copy;
      });
    streamAssistant(
      { messages: next, context: pathname ?? undefined },
      {
        onDelta: (d) => {
          acc += d;
          setLast(acc);
        },
        onDone: (reply) => {
          setLast(
            reply ||
              acc ||
              t("wcomp.chatbotNoAnswer", "Xin lỗi, mình chưa trả lời được. Bạn thử lại nhé."),
          );
          setLoading(false);
        },
        onError: (e) => {
          message.error(e.message);
          setMsgs((prev) => prev.slice(0, -1)); // drop the empty placeholder
          setLoading(false);
        },
      },
    );
  };

  return (
    <>
      {open && (
        <div
          style={{
            position: "fixed",
            right: 20,
            bottom: "calc(138px + env(safe-area-inset-bottom))",
            width: 340,
            maxWidth: "calc(100vw - 32px)",
            height: 460,
            maxHeight: "70vh",
            zIndex: 950,
            background: "#fff",
            borderRadius: 16,
            border: "1px solid #ECEDF3",
            boxShadow: "0 16px 48px rgba(17,24,39,0.22)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "12px 14px",
              borderBottom: "1px solid #F1F2F7",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Avatar size={28} icon={<RobotOutlined />} style={{ background: BRAND_GRADIENT }} />
            <Text strong style={{ flex: 1 }}>
              {t("wcomp.chatbotTitle", "Trợ lý Larkwave")}
            </Text>
            <Button type="text" size="small" icon={<CloseOutlined />} onClick={() => setOpen(false)} />
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: 12, background: "#F7F8FC" }}>
            {msgs.length === 0 && (
              <div>
                <Text type="secondary" style={{ fontSize: 13 }}>
                  {t(
                    "wcomp.chatbotWelcome",
                    "Chào bạn 👋 Mình là trợ lý Larkwave. Hỏi mình về cách sửa app, deploy, tên miền, lỗi build… hoặc chọn nhanh một câu hỏi thường gặp:",
                  )}
                </Text>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                  {FAQS.map((f) => {
                    const q = t(f.key, f.vi);
                    return (
                      <button
                        key={f.key}
                        type="button"
                        onClick={() => void send(q)}
                        style={{
                          cursor: "pointer",
                          textAlign: "left",
                          border: "1px solid rgba(108,92,231,0.25)",
                          background: "rgba(108,92,231,0.06)",
                          color: "#5B4FC2",
                          borderRadius: 999,
                          padding: "6px 12px",
                          fontSize: 12.5,
                          lineHeight: 1.4,
                        }}
                      >
                        {q}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {msgs.map((m, i) => (
                <div
                  key={i}
                  style={{
                    alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                    maxWidth: "85%",
                    background: m.role === "user" ? "#6C5CE7" : "#fff",
                    color: m.role === "user" ? "#fff" : "#1E2230",
                    padding: "8px 12px",
                    borderRadius: 12,
                    border: m.role === "user" ? "none" : "1px solid #ECEDF3",
                    fontSize: 13.5,
                    lineHeight: 1.6,
                    whiteSpace: m.role === "user" ? "pre-wrap" : "normal",
                    wordBreak: "break-word",
                  }}
                >
                  {m.role === "assistant" ? (
                    m.content ? (
                      <MarkdownLite text={m.content} />
                    ) : (
                      <Spin size="small" />
                    )
                  ) : (
                    m.content
                  )}
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
          </div>
          <div style={{ borderTop: "1px solid #ECEDF3", padding: 10, display: "flex", gap: 8 }}>
            <Input.TextArea
              value={text}
              onChange={(e) => setText(e.target.value)}
              autoSize={{ minRows: 1, maxRows: 4 }}
              placeholder={t("wcomp.chatbotAskPlaceholder", "Hỏi trợ lý…")}
              style={{ flex: 1 }}
              onPressEnter={(e) => {
                if (!e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <Button type="primary" icon={<SendOutlined />} loading={loading} onClick={() => void send()} />
          </div>
        </div>
      )}

      <div
        role="button"
        tabIndex={0}
        aria-label={t("wcomp.chatbotAi", "Trợ lý AI")}
        aria-expanded={open ? "true" : "false"}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
        title={t("wcomp.chatbotFabTitle", "Trợ lý AI (kéo để di chuyển, bấm để mở)")}
        style={{
          position: "fixed",
          ...fabStyle,
          zIndex: 951,
          width: 48,
          height: 48,
          borderRadius: "50%",
          background: BRAND_GRADIENT,
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "grab",
          boxShadow: "0 8px 22px rgba(108,92,231,0.4)",
          touchAction: "none",
          userSelect: "none",
        }}
      >
        <RobotOutlined style={{ fontSize: 22 }} />
      </div>
    </>
  );
}
