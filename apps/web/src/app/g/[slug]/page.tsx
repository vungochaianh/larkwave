"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { SendOutlined } from "@ant-design/icons";
import { Button, Empty, Input, Skeleton, Typography } from "antd";
import { ChatMarkdown } from "@larkwave/ui";
import type { PublicAssistantInfo } from "@larkwave/shared";
import { api, streamPublicAssistant } from "@/lib/api";
import ForceLight from "@/components/ForceLight";
import { LandingHeader } from "@/components/LandingChrome";

const { Title, Text } = Typography;
const BRAND = "#6C5CE7";
type Msg = { role: "user" | "assistant"; text: string };

/** PUBLIC, chat-able assistant link (/g/<slug>). Anonymous; the turn runs on hosted MAIC and is
 *  metered to the link OWNER's budget (read-only, rate-limited server-side). */
export default function PublicAssistantPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug;
  const [info, setInfo] = useState<PublicAssistantInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!slug) return;
    api.getPublicAssistant(slug).then(setInfo).catch(() => setNotFound(true)).finally(() => setLoading(false));
  }, [slug]);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs]);

  const send = () => {
    const prompt = input.trim();
    if (!prompt || busy || !slug) return;
    setInput("");
    setBusy(true);
    setMsgs((m) => [...m, { role: "user", text: prompt }, { role: "assistant", text: "" }]);
    streamPublicAssistant(slug, prompt, {
      onDelta: (d) =>
        setMsgs((m) => {
          const last = m[m.length - 1];
          return last?.role === "assistant" ? [...m.slice(0, -1), { ...last, text: last.text + d }] : m;
        }),
      onError: (e) =>
        setMsgs((m) => {
          setBusy(false);
          return [...m.slice(0, -1), { role: "assistant" as const, text: `⚠️ ${e.message}` }];
        }),
      onDone: () => setBusy(false),
    });
  };

  return (
    <ForceLight>
      <LandingHeader />
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "16px 14px 12px", display: "flex", flexDirection: "column", height: "calc(100dvh - 70px)" }}>
        {loading ? (
          <Skeleton active paragraph={{ rows: 4 }} />
        ) : notFound || !info ? (
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <Empty description="Liên kết không tồn tại hoặc đã tắt." />
            <Link href="/" style={{ color: BRAND, fontWeight: 600 }}>← Larkwave</Link>
          </div>
        ) : !info.enabled ? (
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <Empty description="Trợ lý này hiện đã tắt chia sẻ." />
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 8 }}>
              <Title level={4} style={{ margin: 0, color: "#1E2230" }}>{info.label}</Title>
              <Text type="secondary" style={{ fontSize: 12.5 }}>Trợ lý AI công khai · bởi {info.owner} · chạy trên Larkwave</Text>
            </div>
            <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 18, padding: "10px 0" }}>
              {msgs.length === 0 && (
                <div style={{ margin: "auto", color: "#8A90A2", textAlign: "center", fontSize: 15 }}>✳ Hỏi bất cứ điều gì…</div>
              )}
              {msgs.map((m, i) =>
                m.role === "user" ? (
                  <div key={i} style={{ alignSelf: "flex-end", maxWidth: "88%", background: BRAND, color: "#fff", padding: "10px 15px", borderRadius: 18, borderTopRightRadius: 6, whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 14.5, lineHeight: 1.55 }}>
                    {m.text}
                  </div>
                ) : (
                  <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <span style={{ width: 28, height: 28, minWidth: 28, borderRadius: 9, display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#fff", background: `linear-gradient(135deg, ${BRAND}, #8B7CF0)` }}>✳</span>
                    <div style={{ flex: 1, minWidth: 0, fontSize: 14.5, lineHeight: 1.62, color: "#1E2230" }}>{m.text ? <ChatMarkdown content={m.text} /> : "…"}</div>
                  </div>
                ),
              )}
            </div>
            <div style={{ display: "flex", gap: 8, paddingTop: 10, borderTop: "1px solid #ECEDF3" }}>
              <Input.TextArea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                autoSize={{ minRows: 1, maxRows: 5 }}
                placeholder="Nhắn cho trợ lý…"
                disabled={busy}
                onPressEnter={(e) => { if (!e.shiftKey) { e.preventDefault(); send(); } }}
              />
              <Button type="primary" icon={<SendOutlined />} onClick={send} loading={busy} disabled={!input.trim()} style={{ height: "auto" }} />
            </div>
            <Text type="secondary" style={{ fontSize: 11, textAlign: "center", marginTop: 8 }}>
              Trợ lý AI có thể mắc lỗi. <Link href="/" style={{ color: BRAND, fontWeight: 600 }}>Tạo trợ lý của bạn →</Link>
            </Text>
          </>
        )}
      </div>
    </ForceLight>
  );
}
