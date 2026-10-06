'use client';
import { useEffect, useRef, useState } from 'react';
import { Button, Dropdown, Input, Tooltip } from 'antd';
import { HomeOutlined, PlusOutlined, CloseOutlined, SyncOutlined, PushpinFilled } from '@ant-design/icons';
import { BRAND, V } from '../theme';

/** One open tab: a conversation id + title, and whether its AI turn is running now. */
export interface TabItem {
  id: string;
  name: string;
  status?: 'running' | 'idle';
}

/**
 * Chrome-like tab strip for open conversations (Lark × Agents). It only renders + emits —
 * every tab stays MOUNTED behind visibility, so nothing here can remount a conversation or
 * lose its stream / scroll. Reorder, middle-click close, context menu,
 * pin, and the running / waiting indicators; keyboard shortcuts live in HomeShell.
 */
export function WorkspaceTabStrip({
  apps,
  activeId,
  pinned,
  runningIds,
  lockOwnerId,
  onActivate,
  onClose,
  onHome,
  onNew,
  onRename,
  onReorder,
  onTogglePin,
  onCloseOthers,
  onCloseAll,
  onReopen,
  canReopen,
}: {
  apps: TabItem[];
  activeId: string | null;
  pinned: Set<string>;
  /** Tabs whose conversation is running right now. */
  runningIds: Set<string>;
  /** The tab that currently holds the shared AI lock, if any (may differ from active). */
  lockOwnerId?: string | null;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onHome: () => void;
  onNew: () => void;
  onRename?: (id: string, name: string) => void;
  onReorder: (from: number, to: number) => void;
  onTogglePin: (id: string) => void;
  onCloseOthers: (id: string) => void;
  onCloseAll: () => void;
  onReopen: () => void;
  canReopen: boolean;
}) {
  const [editId, setEditId] = useState<string | null>(null);
  const [editVal, setEditVal] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLSpanElement>(null);

  // Keep the active tab in view when it changes (activate via click or keyboard).
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeId]);

  const commit = () => {
    const id = editId;
    const name = editVal.trim();
    setEditId(null);
    if (id && name && onRename) onRename(id, name);
  };

  // Pinned tabs first, in their existing relative order.
  const ordered = [...apps].sort((a, b) => Number(pinned.has(b.id)) - Number(pinned.has(a.id)));

  return (
    <div
      ref={stripRef}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        height: 40,
        padding: '0 12px',
        overflowX: 'auto',
        overflowY: 'hidden',
        flexWrap: 'nowrap',
        background: V.surface,
        borderBottom: `1px solid ${V.border}`,
        scrollbarWidth: 'thin',
      }}
    >
      <Button
        size="small"
        type={activeId === null ? 'primary' : 'default'}
        icon={<HomeOutlined />}
        onClick={onHome}
        style={{ flex: '0 0 auto' }}
      >
        Trang chủ
      </Button>
      <Tooltip title="Mở tab mới (Cmd/Ctrl+T)">
        <Button size="small" type="text" icon={<PlusOutlined />} onClick={onNew} style={{ flex: '0 0 auto' }} />
      </Tooltip>

      {ordered.map((a) => {
        const active = a.id === activeId;
        const isPinned = pinned.has(a.id);
        const running = runningIds.has(a.id);
        const waiting = !!lockOwnerId && lockOwnerId !== a.id; // someone else holds the lock
        const idx = apps.findIndex((x) => x.id === a.id);
        const menu = {
          items: [
            ...(onRename ? [{ key: 'rename', label: 'Đổi tên' }] : []),
            { key: 'pin', label: isPinned ? 'Bỏ ghim' : 'Ghim tab' },
            { type: 'divider' as const },
            { key: 'close', label: 'Đóng tab' },
            { key: 'others', label: 'Đóng các tab khác' },
            { key: 'all', label: 'Đóng tất cả tab' },
            { key: 'reopen', label: 'Mở lại tab vừa đóng', disabled: !canReopen },
          ],
          onClick: ({ key }: { key: string }) => {
            if (key === 'rename') {
              setEditId(a.id);
              setEditVal(a.name || '');
            } else if (key === 'pin') onTogglePin(a.id);
            else if (key === 'close') onClose(a.id);
            else if (key === 'others') onCloseOthers(a.id);
            else if (key === 'all') onCloseAll();
            else if (key === 'reopen') onReopen();
          },
        };

        return (
          <Dropdown key={a.id} menu={menu} trigger={['contextMenu']}>
            <span
              ref={active ? activeRef : undefined}
              draggable={editId !== a.id}
              onDragStart={() => setDragId(a.id)}
              onDragEnd={() => setDragId(null)}
              onDragOver={(e) => {
                if (dragId && dragId !== a.id) e.preventDefault();
              }}
              onDrop={() => {
                if (dragId && dragId !== a.id) onReorder(apps.findIndex((x) => x.id === dragId), idx);
                setDragId(null);
              }}
              // Middle-click closes, like a browser.
              onAuxClick={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                  onClose(a.id);
                }
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                flex: '0 0 auto',
                minWidth: isPinned ? undefined : 120,
                maxWidth: isPinned ? undefined : 220,
                borderRadius: 8,
                overflow: 'hidden',
                border: active ? `1.5px solid ${BRAND}` : `1px solid ${V.border}`,
                background: active ? 'rgba(108,92,231,0.10)' : V.surface,
                opacity: dragId === a.id ? 0.5 : 1,
              }}
            >
              {editId === a.id ? (
                <Input
                  size="small"
                  autoFocus
                  value={editVal}
                  onChange={(e) => setEditVal(e.target.value)}
                  onPressEnter={commit}
                  onBlur={commit}
                  style={{ width: 150, margin: '2px 4px' }}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => onActivate(a.id)}
                  onDoubleClick={() => {
                    if (onRename) {
                      setEditId(a.id);
                      setEditVal(a.name || '');
                    }
                  }}
                  title={
                    waiting
                      ? 'Đang chờ phản hồi ở tab khác'
                      : onRename
                        ? `${a.name || a.id} — double-click để đổi tên`
                        : a.name || a.id
                  }
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    minWidth: 0,
                    flex: 1,
                    padding: isPinned ? '4px 8px' : '4px 10px',
                    border: 'none',
                    background: 'none',
                    cursor: 'pointer',
                    fontSize: 12.5,
                    fontWeight: active ? 600 : 500,
                    color: active ? V.chipText : V.text,
                  }}
                >
                  {isPinned && <PushpinFilled style={{ fontSize: 11, color: BRAND }} />}
                  {/* Spin ONLY when this tab is actually WORKING — a turn in progress, or it holds the
                      shared AI lock (an active Claude turn). A running dev server (preview live) is a
                      steady state, not "loading", so it gets a calm green dot — NOT a perpetual spinner. */}
                  {a.status === 'running' || lockOwnerId === a.id ? (
                    <SyncOutlined spin style={{ fontSize: 11, color: BRAND }} />
                  ) : waiting ? (
                    <span style={{ fontSize: 10 }} title="Đang chờ phản hồi ở tab khác">
                      ⏳
                    </span>
                  ) : running ? (
                    <span
                      title="Preview đang chạy"
                      style={{ width: 7, height: 7, borderRadius: '50%', background: '#16B98D', display: 'inline-block', flexShrink: 0 }}
                    />
                  ) : null}
                  {!isPinned && (
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {a.name || a.id}
                    </span>
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={() => onClose(a.id)}
                title="Đóng tab"
                style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '4px 7px', color: V.textFaint, flex: '0 0 auto' }}
              >
                <CloseOutlined style={{ fontSize: 10 }} />
              </button>
            </span>
          </Dropdown>
        );
      })}
    </div>
  );
}
