'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge, Button, Empty, Input, Spin, Typography } from 'antd';
import { CloseOutlined, SendOutlined } from '@ant-design/icons';
import { accountApi, fromNow, type ChatMessage, type Conversation, type Friend } from './api';
import { UserAvatar } from './UserAvatar';
import { useAccountAuth } from './auth';
import { onOpenMessenger, emitMessengerWindows } from './messenger';
import { BRAND, V } from '../theme';

const { Text } = Typography;

/**
 * In-app friend DMs (ported from the web MessengerWidget, simplified). One global instance mounted
 * in AppShell. A header inbox button drives the conversation list; clicking a conversation opens a
 * floating chat window (up to 2). The desktop accountFetch proxy buffers responses (no SSE), so it
 * POLLS: the list every 8s, each open thread every 5s, paused while the window is hidden.
 */
export function MessengerWidget({
  listOpen,
  onCloseList,
  onUnread,
}: {
  listOpen: boolean;
  onCloseList: () => void;
  onUnread: (n: number) => void;
}) {
  const { user } = useAccountAuth();
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [windows, setWindows] = useState<Friend[]>([]);

  const openWindow = useCallback((f: Friend) => {
    setWindows((w) => (w.some((x) => x.id === f.id) ? w : [...w, f].slice(-2)));
    onCloseList();
  }, [onCloseList]);

  // Open a chat window when anything (e.g. FriendsView "Nhắn tin") calls openMessenger().
  useEffect(() => onOpenMessenger(openWindow), [openWindow]);

  // Tell floating UI (the "báo lỗi" FAB) how many chat windows are open so it can dodge them.
  useEffect(() => {
    emitMessengerWindows(windows.length);
  }, [windows.length]);
  useEffect(() => () => emitMessengerWindows(0), []);

  // Poll conversations + total unread (drives the header badge) while signed in.
  useEffect(() => {
    if (!user) return;
    let alive = true;
    const tick = async () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      try {
        const c = await accountApi.conversations();
        if (!alive) return;
        setConvs(c);
        onUnread(c.reduce((s, x) => s + (x.unread || 0), 0));
      } catch {
        /* ignore — offline / transient */
      }
    };
    void tick();
    const id = setInterval(tick, 8000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [user, onUnread]);

  // Refresh the list the moment it's opened.
  useEffect(() => {
    if (!listOpen || !user) return;
    setLoadingList(true);
    accountApi
      .conversations()
      .then(setConvs)
      .catch(() => {})
      .finally(() => setLoadingList(false));
  }, [listOpen, user]);

  if (!user) return null;

  return (
    <>
      {listOpen && (
        <div
          style={{
            position: 'fixed',
            top: 62,
            right: 18,
            width: 320,
            maxHeight: '70vh',
            background: V.surface,
            borderRadius: 14,
            boxShadow: '0 16px 48px rgba(17,24,39,0.18)',
            border: `1px solid ${V.border}`,
            zIndex: 200,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ padding: '12px 14px', borderBottom: `1px solid ${V.borderSub}`, display: 'flex', alignItems: 'center' }}>
            <Text strong style={{ flex: 1 }}>
              Tin nhắn
            </Text>
            <Button size="small" type="text" icon={<CloseOutlined />} onClick={onCloseList} />
          </div>
          <div style={{ overflowY: 'auto', padding: 6 }}>
            {loadingList && !convs.length ? (
              <div style={{ textAlign: 'center', padding: 24 }}>
                <Spin />
              </div>
            ) : convs.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="Chưa có cuộc trò chuyện. Vào “Bạn bè” để nhắn tin."
                style={{ padding: '14px 0' }}
              />
            ) : (
              convs.map((c) => (
                <div
                  key={c.friend.id}
                  onClick={() => openWindow(c.friend)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10, cursor: 'pointer' }}
                >
                  <Badge count={c.unread} size="small" offset={[-2, 2]}>
                    <UserAvatar name={c.friend.name} avatarUrl={c.friend.avatarUrl} size={36} />
                  </Badge>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: c.unread ? 700 : 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.friend.name || c.friend.email}
                    </div>
                    <div style={{ fontSize: 12, color: V.textSub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.lastMessage || '—'}
                    </div>
                  </div>
                  <span style={{ fontSize: 11, color: V.textFaint }}>{fromNow(c.lastAt)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
      {windows.map((f, i) => (
        <ChatWindow key={f.id} friend={f} offset={i} onClose={() => setWindows((w) => w.filter((x) => x.id !== f.id))} />
      ))}
    </>
  );
}

function ChatWindow({ friend, offset, onClose }: { friend: Friend; offset: number; onClose: () => void }) {
  const [msgs, setMsgs] = useState<ChatMessage[] | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      try {
        const t = await accountApi.messageThread(friend.id);
        if (alive) setMsgs(t);
      } catch {
        /* ignore */
      }
    };
    void tick();
    const id = setInterval(tick, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [friend.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView();
  }, [msgs]);

  const send = async () => {
    const b = text.trim();
    if (!b || sending) return;
    setText('');
    setSending(true);
    try {
      const m = await accountApi.sendMessage(friend.id, b);
      setMsgs((p) => [...(p || []), m]);
    } catch {
      setText(b); // restore on failure
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 16,
        right: 16 + offset * 312,
        width: 300,
        height: 430,
        background: V.surface,
        borderRadius: 14,
        boxShadow: '0 16px 48px rgba(17,24,39,0.22)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        zIndex: 210,
        border: `1px solid ${V.border}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: `1px solid ${V.borderSub}` }}>
        <UserAvatar name={friend.name} avatarUrl={friend.avatarUrl} size={28} />
        <Text strong style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {friend.name || friend.email}
        </Text>
        <Button size="small" type="text" icon={<CloseOutlined />} onClick={onClose} />
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {!msgs ? (
          <div style={{ textAlign: 'center', marginTop: 30 }}>
            <Spin />
          </div>
        ) : msgs.length === 0 ? (
          <Text type="secondary" style={{ fontSize: 12.5 }}>
            Bắt đầu trò chuyện…
          </Text>
        ) : (
          msgs.map((m) => (
            <div key={m.id} style={{ alignSelf: m.mine ? 'flex-end' : 'flex-start', maxWidth: '82%' }}>
              <div
                style={{
                  padding: '7px 11px',
                  borderRadius: 12,
                  fontSize: 13,
                  lineHeight: 1.45,
                  wordBreak: 'break-word',
                  background: m.mine ? BRAND : V.surfaceAlt,
                  color: m.mine ? '#fff' : V.text,
                  border: m.mine ? 'none' : `1px solid ${V.border}`,
                }}
              >
                {m.body}
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
      <div style={{ display: 'flex', gap: 6, padding: '8px 10px', borderTop: `1px solid ${V.borderSub}` }}>
        <Input.TextArea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Nhắn tin…"
          autoSize={{ minRows: 1, maxRows: 3 }}
          onPressEnter={(e) => {
            if (!e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <Button type="primary" icon={<SendOutlined />} loading={sending} onClick={() => void send()} />
      </div>
    </div>
  );
}
