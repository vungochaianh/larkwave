"use client";

import { ArrowLeftOutlined, CloseOutlined, MessageOutlined, MinusOutlined, SendOutlined } from "@ant-design/icons";
import { App, Badge, Button, Empty, Grid, Input, List, Skeleton, Spin, Typography } from "antd";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage, Conversation, Friend } from "@larkwave/shared";
import { useI18n } from "@larkwave/ui";
import { api, streamMessages } from "@/lib/api";
import { fromNow } from "@/lib/format";
import { onOpenMessenger } from "@/lib/messenger";
import { UserAvatar } from "@/components/UserAvatar";

const { Text } = Typography;

const WIN_W = 328;

/**
 * Global, Messenger-style floating chat. The trigger lives in the AppShell
 * header (message icon + unread badge); the conversation list drops from it,
 * and 1:1 chats pop as floating windows at the bottom-right that can be
 * minimized/closed. Any page opens a window via `openMessenger(friend)`.
 */
/**
 * `variant` quyết định chỗ đặt NÚT MỞ, không đổi gì khác: cửa sổ chat bật ra vẫn là position:fixed.
 * "header" để nó nằm trên thanh đầu trang — góc phải dưới đã có nút báo lỗi, hai bong bóng đụng nhau.
 *
 * CHỈ ĐƯỢC MOUNT MỘT LẦN: nó đăng ký onOpenMessenger, mount hai lần thì openMessenger() mở hai cửa sổ.
 */
export default function MessengerWidget({ variant = "fab" }: { variant?: "fab" | "header" } = {}) {
  const { t } = useI18n();
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [listOpen, setListOpen] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  // Open windows (newest last). minimized chats collapse to a slim bar.
  const [windows, setWindows] = useState<Friend[]>([]);
  const [minimized, setMinimized] = useState<Record<string, boolean>>({});

  const loadList = useCallback(async () => {
    try {
      const c = await api.conversations();
      setConversations(c);
    } catch {
      /* non-fatal */
    }
  }, []);

  // Initial + periodic refresh of the conversation list / unread badge.
  useEffect(() => {
    void loadList();
    const t = setInterval(() => void loadList(), 25000);
    return () => clearInterval(t);
  }, [loadList]);

  // One global SSE stream keeps the list + badge live when no window is focused.
  useEffect(() => {
    const stop = streamMessages((ev) => {
      if (ev.type === "message") void loadList();
    });
    return () => stop();
  }, [loadList]);

  const openWindow = useCallback((friend: Friend) => {
    setWindows((prev) => {
      const exists = prev.some((f) => f.id === friend.id);
      return exists ? prev : [...prev.slice(-2), friend]; // cap at 3 windows
    });
    setMinimized((m) => ({ ...m, [friend.id]: false }));
    setListOpen(false);
  }, []);

  // External open requests (e.g. /friends "Nhắn tin", notification deep-link).
  useEffect(() => onOpenMessenger(openWindow), [openWindow]);

  const closeWindow = (id: string) => {
    setWindows((prev) => prev.filter((f) => f.id !== id));
    void loadList();
  };

  const friendFromConversation = (c: Conversation): Friend => c.friend;

  const totalUnread = conversations.reduce((n, c) => n + (c.unread || 0), 0);

  // The Messenger launcher is a floating FAB on the BOTTOM ROW, immediately left
  // of the Báo lỗi button (right:20, 44px). Sitting at bottom:20 keeps it clear of
  // the AI-chatbot panel (which opens upward from bottom:138) on every page type —
  // raising it into the stack would let that panel cover/block it.
  const FAB_RIGHT = 76;
  const FAB_BOTTOM = 20;
  /** Safe-area-aware bottom offset (clears the iOS home indicator on phones). */
  const safeBottom = (px: number) => `calc(${px}px + env(safe-area-inset-bottom))`;
  const listBottom = FAB_BOTTOM + 56;
  const screens = Grid.useBreakpoint();

  const toggleList = () => {
    setListOpen((o) => !o);
    if (!listOpen) {
      setLoadingList(conversations.length === 0);
      void loadList().finally(() => setLoadingList(false));
    }
  };

  return (
    <>
      {/* Fixed wrapper so the Badge has a sized, in-flow Button to anchor to —
          putting `position:fixed` on the Button itself collapses the Badge box
          (count then renders detached / invisible). Native title, no antd Tooltip
          (which mispositions around a fixed child). */}
      <div
        style={
          variant === "header"
            ? { flex: "0 0 auto" }
            : { position: "fixed", right: FAB_RIGHT, bottom: safeBottom(FAB_BOTTOM), zIndex: 940 }
        }
      >
        <Badge count={totalUnread} size="small" overflowCount={99}>
          <Button
            shape="circle"
            {...(variant === "header" ? { type: "text" as const } : {})}
            icon={<MessageOutlined style={{ fontSize: 18, color: "#6C5CE7" }} />}
            onClick={toggleList}
            aria-label={t("wcomp.msgFriendsAria", "Tin nhắn bạn bè")}
            title={t("wcomp.msgTitle", "Tin nhắn")}
            style={
              variant === "header"
                ? { width: 36, height: 36 }
                : {
                    width: 44,
                    height: 44,
                    background: "#fff",
                    boxShadow: "0 6px 20px rgba(17,24,39,0.18)",
                  }
            }
          />
        </Badge>
      </div>

      {/* Conversation list — pops up from the floating FAB (bottom-right). */}
      {listOpen && (
        <>
          <div
            onClick={() => setListOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 1000 }}
          />
          <div
            style={{
              position: "fixed",
              bottom: safeBottom(listBottom),
              right: 20,
              width: 320,
              maxHeight: "70vh",
              display: "flex",
              flexDirection: "column",
              background: "#fff",
              borderRadius: 14,
              border: "1px solid #ECEDF3",
              boxShadow: "0 16px 48px rgba(17,24,39,0.18)",
              zIndex: 1002,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "12px 16px",
                borderBottom: "1px solid #F1F2F7",
                fontWeight: 700,
                fontSize: 15,
              }}
            >
              {t("wcomp.msgTitle", "Tin nhắn")}
            </div>
            <div style={{ flex: 1, overflowY: "auto" }}>
              {/* Pinned: "Máy của tôi" — the remote-agent thread (runs on your
                  signed-in desktop). Always at the very top of the list. */}
              <div
                onClick={() => {
                  setListOpen(false);
                  router.push("/agent");
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 14px",
                  cursor: "pointer",
                  borderBottom: "1px solid #F1F2F7",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#F4F5FB")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <span
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: "50%",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "rgba(108,92,231,0.12)",
                    fontSize: 20,
                    flexShrink: 0,
                  }}
                >
                  🖥
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Text strong style={{ display: "block" }}>
                    {t("wcomp.msgMyMachine", "Máy của tôi (Agent)")}
                  </Text>
                  <Text type="secondary" ellipsis style={{ fontSize: 12.5, display: "block" }}>
                    {t("wcomp.msgMyMachineDesc", "Gửi lệnh chạy ngay trên máy tính của bạn")}
                  </Text>
                </div>
              </div>
              {loadingList ? (
                <Skeleton active paragraph={{ rows: 3 }} style={{ padding: 16 }} />
              ) : conversations.length === 0 ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={t("wcomp.msgNoConversations", "Chưa có hội thoại nào")}
                  style={{ padding: "28px 0" }}
                />
              ) : (
                <List
                  dataSource={conversations}
                  renderItem={(c) => {
                    const preview = c.lastMessage;
                    return (
                      <div
                        onClick={() => openWindow(friendFromConversation(c))}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "10px 14px",
                          cursor: "pointer",
                          background: c.unread ? "#F6F5FF" : "transparent",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "#F4F5FB")}
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.background = c.unread ? "#F6F5FF" : "transparent")
                        }
                      >
                        <Badge count={c.unread} size="small" offset={[-2, 2]}>
                          <UserAvatar name={c.friend.name} avatarUrl={c.friend.avatarUrl} size={40} />
                        </Badge>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: 8,
                            }}
                          >
                            <Text strong={!!c.unread} ellipsis style={{ flex: 1, minWidth: 0 }}>
                              {c.friend.name || c.friend.email}
                            </Text>
                            <Text type="secondary" style={{ fontSize: 11, flexShrink: 0 }}>
                              {fromNow(c.lastAt)}
                            </Text>
                          </div>
                          <Text
                            type={c.unread ? undefined : "secondary"}
                            ellipsis
                            style={{ fontSize: 12.5, display: "block", fontWeight: c.unread ? 600 : 400 }}
                          >
                            {preview}
                          </Text>
                        </div>
                      </div>
                    );
                  }}
                />
              )}
            </div>
          </div>
        </>
      )}

      {/* Floating chat windows, stacked from the bottom-right (left of the FABs).
          Desktop: base 132 clears the 120px-wide FAB column so it isn't covered;
          stacked. Mobile (!md): show only the most-recent window full-width at a
          small inset — stacked offsets would push older windows off-screen. */}
      {(screens.md ? windows : windows.slice(-1)).map((f, i) => (
        <ChatWindow
          key={f.id}
          friend={f}
          offsetRight={screens.md ? 132 + i * (WIN_W + 12) : 12}
          minimized={!!minimized[f.id]}
          onToggleMinimize={() =>
            setMinimized((m) => ({ ...m, [f.id]: !m[f.id] }))
          }
          onBack={() => {
            closeWindow(f.id);
            setListOpen(true);
          }}
          onClose={() => closeWindow(f.id)}
          onActivity={loadList}
        />
      ))}
    </>
  );
}

/** A single floating 1:1 chat window (Messenger-style). */
function ChatWindow({
  friend,
  offsetRight,
  minimized,
  onToggleMinimize,
  onBack,
  onClose,
  onActivity,
}: {
  friend: Friend;
  offsetRight: number;
  minimized: boolean;
  onToggleMinimize: () => void;
  onBack: () => void;
  onClose: () => void;
  onActivity: () => void;
}) {
  const { t } = useI18n();
  const { message } = App.useApp();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchThread = useCallback(
    async (initial: boolean) => {
      if (initial) setLoading(true);
      try {
        const t = await api.messageThread(friend.id);
        setMessages(t);
      } catch {
        /* keep prior */
      } finally {
        if (initial) setLoading(false);
      }
    },
    [friend.id],
  );

  useEffect(() => {
    void fetchThread(true);
    // Reading the thread marks received messages as read → refresh list badge.
    onActivity();
    const stop = streamMessages((ev) => {
      if (ev.type !== "message" || !ev.message) return;
      const m = ev.message;
      if (m.senderId !== friend.id && m.recipientId !== friend.id) return;
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
    });
    const t = setInterval(() => void fetchThread(false), 12000);
    return () => {
      stop();
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [friend.id]);

  useEffect(() => {
    if (!minimized) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, minimized]);

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const m = await api.sendMessage(friend.id, body);
      setMessages((prev) => [...prev, m]);
      setText("");
      onActivity();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const header = (
    <div
      onClick={minimized ? onToggleMinimize : undefined}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 10px",
        background: "#6C5CE7",
        color: "#fff",
        cursor: minimized ? "pointer" : "default",
        flexShrink: 0,
      }}
    >
      <Button
        type="text"
        size="small"
        icon={<ArrowLeftOutlined />}
        onClick={(e) => {
          e.stopPropagation();
          onBack();
        }}
        title={t("wcomp.msgBackToList", "Về danh sách hội thoại")}
        style={{ color: "#fff", marginRight: -4 }}
      />
      <UserAvatar name={friend.name} avatarUrl={friend.avatarUrl} size={28} />
      <span
        style={{
          flex: 1,
          minWidth: 0,
          fontWeight: 600,
          fontSize: 13.5,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {friend.name || friend.email}
      </span>
      <Button
        type="text"
        size="small"
        icon={<MinusOutlined />}
        onClick={(e) => {
          e.stopPropagation();
          onToggleMinimize();
        }}
        style={{ color: "#fff" }}
      />
      <Button
        type="text"
        size="small"
        icon={<CloseOutlined />}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        style={{ color: "#fff" }}
      />
    </div>
  );

  return (
    <div
      style={{
        position: "fixed",
        bottom: 16,
        right: offsetRight,
        width: WIN_W,
        maxWidth: "calc(100vw - 24px)",
        height: minimized ? "auto" : 440,
        maxHeight: "calc(100vh - 90px)",
        display: "flex",
        flexDirection: "column",
        background: "#fff",
        borderRadius: 14,
        border: "1px solid #ECEDF3",
        boxShadow: "0 16px 48px rgba(17,24,39,0.2)",
        zIndex: 1001,
        overflow: "hidden",
      }}
    >
      {header}

      {!minimized && (
        <>
          <div style={{ flex: 1, overflowY: "auto", padding: 14, background: "#F7F8FC" }}>
            {loading ? (
              <Spin style={{ display: "block", margin: "28px auto" }} />
            ) : messages.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={t("wcomp.msgSayHi", "Gửi lời chào nhé!")}
                style={{ marginTop: 30 }}
              />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {messages.map((m) => (
                  <div
                    key={m.id}
                    style={{
                      alignSelf: m.mine ? "flex-end" : "flex-start",
                      maxWidth: "82%",
                      background: m.mine ? "#6C5CE7" : "#fff",
                      color: m.mine ? "#fff" : "#1E2230",
                      padding: "7px 11px",
                      borderRadius: 14,
                      border: m.mine ? "none" : "1px solid #ECEDF3",
                      boxShadow: "0 1px 2px rgba(17,24,39,0.05)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 13.5,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                      }}
                    >
                      {m.body}
                    </div>
                    <div style={{ fontSize: 10, opacity: 0.7, marginTop: 3, textAlign: "right" }}>
                      {fromNow(m.createdAt)}
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
            )}
          </div>

          <div
            style={{
              borderTop: "1px solid #ECEDF3",
              padding: 8,
              background: "#fff",
              display: "flex",
              gap: 6,
              alignItems: "flex-end",
              flexShrink: 0,
            }}
          >
            <Input.TextArea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t("wcomp.msgInputPlaceholder", "Nhập tin nhắn…")}
              autoSize={{ minRows: 1, maxRows: 3 }}
              style={{ flex: 1 }}
              onPressEnter={(e) => {
                if (!e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <Button
              type="primary"
              size="small"
              icon={<SendOutlined />}
              loading={sending}
              onClick={() => void send()}
            />
          </div>
        </>
      )}

    </div>
  );
}
