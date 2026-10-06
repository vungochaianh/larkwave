'use client';
import { useMemo, useState } from 'react';
import { Button, Checkbox, Input, Tooltip } from 'antd';
import { CloseOutlined, DeleteOutlined, FileTextOutlined, AimOutlined } from '@ant-design/icons';
import type { LarkNote, LarkNoteDoc } from '@larkwave/core';
import { V, BRAND } from '../../theme';
import { useI18n } from '../../i18n';

const nid = () => `n-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/**
 * Notes + todos for ONE conversation. Ordering is computed at display time and never
 * stored — the stored order stays insertion order, so a concurrent edit from another
 * device can't scramble it.
 */
export function NotesPanel({
  doc,
  onChange,
  onJump,
  onClose,
}: {
  doc: LarkNoteDoc;
  onChange: (next: LarkNoteDoc) => void;
  /** Scroll the chat to the message a note was captured from. */
  onJump?: (srcId: string) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState('');
  // Sticky within the session: a burst of todos is Enter-Enter-Enter.
  const [asTodo, setAsTodo] = useState(true);

  const notes = doc.notes;
  const openTodos = notes.filter((n) => n.todo && !n.done);
  const plain = notes.filter((n) => !n.todo);
  const doneTodos = notes.filter((n) => n.todo && n.done);

  const groups = useMemo(
    () => [
      // A worklist reads top-down oldest-first; reference notes read newest-first.
      { key: 'todo', label: t('chat.todos', 'Việc cần làm'), list: [...openTodos].sort((a, b) => a.createdAt.localeCompare(b.createdAt)) },
      { key: 'note', label: t('chat.notes', 'Ghi chú'), list: [...plain].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) },
      {
        key: 'done',
        label: `${t('chat.doneLabel', 'Đã xong')} (${doneTodos.length})`,
        list: [...doneTodos].sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || '')),
      },
    ],
    [notes, t],
  );

  const commit = (next: LarkNote[]) => onChange({ v: 1, notes: next, updatedAt: new Date().toISOString() });

  const add = () => {
    const text = draft.trim().slice(0, 500);
    if (!text) return;
    setDraft('');
    commit([
      ...notes,
      { id: nid(), text, todo: asTodo, done: false, createdAt: new Date().toISOString() },
    ]);
  };
  const toggleDone = (n: LarkNote) =>
    commit(
      notes.map((x) =>
        x.id === n.id
          ? { ...x, done: !x.done, doneAt: !x.done ? new Date().toISOString() : undefined, updatedAt: new Date().toISOString() }
          : x,
      ),
    );
  const remove = (id: string) => commit(notes.filter((x) => x.id !== id));

  const row = (n: LarkNote) => (
    <div
      key={n.id}
      style={{ display: 'flex', alignItems: 'flex-start', gap: 6, padding: '5px 2px', borderRadius: 6 }}
    >
      {n.todo ? (
        <Checkbox checked={n.done} onChange={() => toggleDone(n)} style={{ marginTop: 1 }} />
      ) : (
        <span style={{ color: V.textFaint, fontSize: 11, lineHeight: '20px' }}>•</span>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12.5,
            lineHeight: 1.45,
            color: n.done ? V.textFaint : V.text,
            textDecoration: n.done ? 'line-through' : 'none',
            wordBreak: 'break-word',
          }}
        >
          {n.text}
        </div>
        {n.srcExcerpt && (
          <Tooltip title={t('chat.openSourceMsg', 'Mở tin nhắn đã tạo ra ghi chú này')}>
            <button
              type="button"
              onClick={() => n.srcId && onJump?.(n.srcId)}
              style={{
                marginTop: 2,
                border: 'none',
                background: 'none',
                padding: 0,
                cursor: n.srcId ? 'pointer' : 'default',
                color: V.chipText,
                fontSize: 10.5,
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                gap: 3,
                maxWidth: '100%',
              }}
            >
              <AimOutlined style={{ fontSize: 10 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.srcExcerpt}</span>
            </button>
          </Tooltip>
        )}
      </div>
      <Button
        type="text"
        size="small"
        style={{ height: 20, width: 20, minWidth: 20, padding: 0, color: V.textFaint }}
        icon={<DeleteOutlined style={{ fontSize: 11 }} />}
        onClick={() => remove(n.id)}
      />
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <FileTextOutlined style={{ color: BRAND }} />
        <span style={{ fontWeight: 700, fontSize: 13, color: V.text }}>{t('chat.notes', 'Ghi chú')}</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: V.textSub }}>
          {doneTodos.length}/{openTodos.length + doneTodos.length} {t('chat.tasksUnit', 'việc')}
        </span>
        <Button type="text" size="small" icon={<CloseOutlined style={{ fontSize: 11 }} />} onClick={onClose} />
      </div>
      <div style={{ fontSize: 10.5, color: V.textFaint, marginTop: 2, marginBottom: 8 }}>
        {t('chat.notesSubtitle', 'Gắn với cuộc trò chuyện này · đồng bộ theo tài khoản')}
      </div>

      <Input.TextArea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onPressEnter={(e) => {
          if (!e.shiftKey) {
            e.preventDefault();
            add();
          }
        }}
        autoSize={{ minRows: 1, maxRows: 4 }}
        placeholder={t('chat.notesPlaceholder', 'Thêm việc cần làm hoặc ghi chú…')}
        style={{ fontSize: 12.5 }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
        <Checkbox checked={asTodo} onChange={(e) => setAsTodo(e.target.checked)} style={{ fontSize: 12 }}>
          <span style={{ fontSize: 12, color: V.textSub }}>{t('chat.todos', 'Việc cần làm')}</span>
        </Checkbox>
        <span style={{ flex: 1 }} />
        <Button size="small" type="primary" onClick={add} disabled={!draft.trim()}>
          {t('chat.add', 'Thêm')}
        </Button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', marginTop: 10, minHeight: 0 }}>
        {notes.length === 0 && (
          <div style={{ fontSize: 11.5, color: V.textFaint, lineHeight: 1.5 }}>
            {t('chat.notesEmptyPre', 'Chưa có ghi chú nào. Gõ ở trên để thêm việc cần làm, hoặc bấm')}{' '}
            <b>{t('chat.notes', 'Ghi chú')}</b> {t('chat.notesEmptyPost', 'dưới một câu trả lời để lưu kèm liên kết tới tin nhắn đó.')}
          </div>
        )}
        {groups.map((g) =>
          g.list.length === 0 ? null : (
            <div key={g.key} style={{ marginBottom: 10 }}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: 0.8,
                  textTransform: 'uppercase',
                  color: V.textFaint,
                  marginBottom: 2,
                }}
              >
                {g.label}
              </div>
              {g.list.map(row)}
            </div>
          ),
        )}
      </div>
    </div>
  );
}
