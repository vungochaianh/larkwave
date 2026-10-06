'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, App, Badge, Button, Checkbox, Drawer, Dropdown, Grid, Input, Modal, Popover, Segmented, Space, Switch, Tag, Tooltip, Typography } from 'antd';
import { AttachmentPreview, type PreviewableAttachment } from '../AttachmentPreview';
import { renderUserText } from '../chat/renderUserText';
import { LoadingOutlined, SendOutlined, RobotOutlined, PlusOutlined, DeleteOutlined, DatabaseOutlined, PaperClipOutlined, CloseOutlined, FileTextOutlined, ShareAltOutlined, LinkOutlined, GlobalOutlined, StopOutlined, InfoCircleOutlined, SearchOutlined, ReloadOutlined, CopyOutlined, EditOutlined, ShrinkOutlined, ArrowsAltOutlined, WarningOutlined, CheckCircleFilled, MenuOutlined, FilePdfOutlined } from '@ant-design/icons';
import { exportTranscriptPdf } from '../../exportPdf';
import type { LarkBaseRef, LarkChatEvent, LarkChatMode, LarkNoteDoc, LarkSessionMeta, RuntimeAdapter } from '@larkwave/core';
import { AUTO_CONTINUE_MAX, AUTO_CONTINUE_PROMPT, nextStepAfterTurn, saysUnfinished } from '@larkwave/core';
import { messageDigest } from '../../messageDigest';
import { useAgentBusy } from '../../useAgentBusy';
import { accountApi, getToken } from '../../account/api';
import { BRAND, V } from '../../theme';
import { ChatMarkdown } from '../ChatMarkdown';
import { diagnoseRunnerError, RunnerErrorCard, classifyRunnerError, reportRunnerError } from '../runnerError';
import { AnswerActionsRow } from './AnswerActionsRow';
import { UpdateHintCard } from '../UpdateHintCard';
import { CollapsedAnswer } from './CollapsedAnswer';
import { NotesPanel } from './NotesPanel';
import { loadFold, saveFold, onFoldChange, isLongAnswer, type FoldStore } from '../../larkFold';
import { RunnerModelPicker } from '../RunnerModelPicker';
import { clockTime, humanDuration } from '../../time';
import { useSlashCommands, skillsToCommandItems, type SlashCommandItem } from '../SlashCommandMenu';
import { ToolCallGroup, type ToolCallState } from './ToolCallCard';
import { ConfirmToolModal, type PendingConfirm } from './ConfirmToolModal';
import { AskUserModal, type PendingAsk } from './AskUserModal';
import { takeLarkPrompt } from './larkHandoff';
import { useI18n } from '../../i18n';

const { Text } = Typography;

type ChatItem =
  | {
      kind: 'msg';
      id: string;
      role: 'user' | 'assistant';
      text: string;
      agent?: string;
      images?: { name: string; dataUrl: string }[];
      label?: string;
      /** When the message appeared (epoch ms). Absent on conversations saved before this existed. */
      ts?: number;
      /** Assistant only: wall-clock the turn took, filled in when it finishes. */
      durMs?: number;
    }
  | { kind: 'tool'; id: string; call: ToolCallState }
  /**
   * Tệp agent vừa dựng (create_file). Lưu vào lịch sử hội thoại như mọi mục khác, nên mở lại
   * hội thoại cũ vẫn thấy — tệp nằm trong thư mục hội thoại, không bị dọn theo lượt chạy.
   */
  | {
      kind: 'file';
      id: string;
      name: string;
      path: string;
      mime: string;
      bytes: number;
      /** Bản trên máy chủ — để mở lại được ở MÁY KHÁC, nơi `path` không tồn tại. */
      uploadId?: string;
      ts?: number;
    };

/**
 * Thẻ tệp agent vừa dựng — bấm là mở bằng ứng dụng mặc định.
 *
 * Mở qua IPC riêng chứ không phải `openExternal`: đường này nhận ĐƯỜNG DẪN trên máy, và phía main
 * chặn mọi thứ nằm ngoài thư mục hội thoại. `openExternal` chỉ nhận http(s) — đúng như vậy, vì nới
 * nó ra để mở được tệp nội bộ là mở luôn cho mọi đường dẫn khác.
 */
function FileCard({ item, runtime }: { item: Extract<ChatItem, { kind: 'file' }>; runtime: RuntimeAdapter }) {
  const { message } = App.useApp();
  const [busy, setBusy] = useState(false);
  const kb = item.bytes > 1048576 ? `${(item.bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(item.bytes / 1024))} KB`;
  /**
   * Mở tệp. Ưu tiên bản TRÊN MÁY; không có thì lấy bản đã sao lưu trên máy chủ.
   *
   * Hai đường vì tệp đi theo TÀI KHOẢN chứ không theo máy: mở cùng hội thoại ở máy khác thì
   * `path` trỏ vào một đường dẫn không tồn tại ở đó. Trước đây gặp ca ấy là một thông báo lỗi
   * cụt, trong khi tệp vẫn còn nguyên trên máy chủ.
   */
  const open = async () => {
    setBusy(true);
    try {
      if (runtime.openLocalFile) {
        const r = await runtime.openLocalFile(item.path);
        if (r.ok) return;
        if (!item.uploadId) return message.error(r.error || 'Không mở được tệp.');
      }
      if (!item.uploadId) return message.info('Bản này chưa mở được tệp từ hội thoại.');
      const raw = await accountApi.uploadRaw(item.uploadId);
      const bin = atob(raw.dataBase64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], { type: raw.mime || item.mime }));
      const a = document.createElement('a');
      a.href = url;
      a.download = raw.name || item.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) {
      message.error((e as Error).message || 'Không mở được tệp.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      onClick={busy ? undefined : open}
      style={{
        alignSelf: 'flex-start',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        maxWidth: '94%',
        padding: '10px 14px',
        border: `1px solid ${V.border}`,
        borderRadius: 12,
        background: V.surface,
        cursor: busy ? 'progress' : 'pointer',
      }}
    >
      <FileTextOutlined style={{ fontSize: 20, color: BRAND }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: V.text, wordBreak: 'break-word' }}>{item.name}</div>
        <div style={{ fontSize: 11.5, color: V.textSub }}>{kb} · bấm để mở</div>
      </div>
    </div>
  );
}

const rid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);

const EXAMPLES: { k: string; text: string }[] = [
  { k: 'ex1', text: 'Liệt kê tất cả các bảng trong Base đã đăng ký' },
  { k: 'ex2', text: 'Bảng đầu tiên có những trường (cột) nào?' },
  { k: 'ex3', text: 'Có bao nhiêu bản ghi trong bảng "Khách hàng"?' },
  { k: 'ex4', text: 'Tìm các bản ghi có Trạng thái = "ON" trong bảng Đơn' },
  { k: 'ex5', text: 'Tóm tắt dữ liệu trong Base này giúp tôi' },
  { k: 'ex6', text: 'Thêm một dòng mới vào bảng Công việc: Tên = "Demo", Trạng thái = "Mới"' },
  { k: 'ex7', text: 'Cập nhật bản ghi … thành …' },
  { k: 'ex8', text: 'Gửi tin nhắn vào nhóm chat … nội dung …' },
];

/** Quick "utils" shown when a Base is active — the agent works on that Base. */
const BASE_UTILS: { k: string; label: string; prompt: string }[] = [
  { k: 'tablesCols', label: '🔍 Bảng & cột', prompt: 'Liệt kê ĐẦY ĐỦ TẤT CẢ bảng trong base đang chọn (kể cả bảng chưa có bản ghi nào), kèm các cột (tên + kiểu) của từng bảng. Làm cho HẾT trong một lượt, KHÔNG hỏi lại "xem tiếp không" dù nhiều bảng.' },
  { k: 'summaryBase', label: '📋 Tóm tắt base', prompt: 'Dùng bitable_base_overview để tóm tắt base đang chọn: liệt kê ĐẦY ĐỦ các bảng (kể cả bảng rỗng), mỗi bảng nêu số bản ghi (record_count), các cột chính, và vài bản ghi mẫu để minh hoạ ý nghĩa. Làm gọn, không hỏi lại.' },
  { k: 'evalBase', label: '📊 Đánh giá base', prompt: 'Đánh giá thiết kế của base đang chọn: điểm mạnh, điểm yếu, các cột/bảng còn thiếu, gợi ý cải thiện cụ thể.' },
  { k: 'permissions', label: '🔐 Phân quyền', prompt: 'Xem cấu hình phân quyền của base đang chọn: gọi bitable_list_roles để liệt kê các vai trò + quyền theo từng bảng/bản ghi/cột, và (nếu cần) bitable_list_role_members để xem thành viên mỗi vai trò. Trình bày gọn thành bảng dễ đọc.' },
  { k: 'readWf', label: '🔧 Đọc workflow', prompt: 'Đọc và giải thích các workflow/automation (tự động hoá) của base đang áp dụng — gọi bitable_read_workflows với app_token của base này. Trình bày mỗi workflow: trigger → điều kiện (Nếu/Nếu không) → hành động. Nếu chưa kết nối Lark web hoặc thiếu quyền, nhắc tôi bật ở Cài đặt → "Kết nối Lark web".' },
  { k: 'auditWf', label: '🔎 Soát lỗi workflow', prompt: 'workflow-audit' },
  { k: 'suggestWf', label: '🧩 Nên thêm workflow nào', prompt: 'workflow-suggest' },
  { k: 'debugEndpoint', label: '🐞 Endpoint (gỡ lỗi)', prompt: 'debug' },
  { k: 'design', label: '🎨 Thiết kế / bổ sung', prompt: 'Dựa trên dữ liệu hiện có, đề xuất schema hoàn chỉnh cho base đang chọn rồi (sau khi tôi duyệt) tạo các bảng/cột còn thiếu.' },
  { k: 'kanban', label: '📌 Tạo Kanban pipeline', prompt: 'Tạo một view Kanban theo cột trạng thái/giai đoạn cho bảng chính của base đang chọn để làm pipeline.' },
  { k: 'sampleData', label: '🌱 Nhập dữ liệu mẫu', prompt: 'Tạo và nhập một vài bản ghi mẫu hợp lý vào các bảng của base đang chọn để minh hoạ.' },
];

/** Animated "…" while the agent is working (before it streams text). Width-stable. */
function TypingDots() {
  const { t: tr } = useI18n();
  const [n, setN] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setN((x) => (x + 1) % 4), 350);
    return () => clearInterval(t);
  }, []);
  return (
    <span style={{ fontSize: 13, color: V.textFaint }}>
      {tr('chat.assistantComposing', 'Trợ lý đang soạn')}{'.'.repeat(n)}
      <span style={{ opacity: 0 }}>{'.'.repeat(3 - n)}</span>
    </span>
  );
}

/** Summarise the CURRENT conversation (not the base) — the agent has the chat history. */
const SUMMARY_PROMPT =
  'Tóm tắt lại cuộc hội thoại của chúng ta cho tới hiện tại: những câu hỏi/yêu cầu chính tôi đã nêu và kết quả/kết luận tương ứng. Trình bày gạch đầu dòng, ngắn gọn, tiếng Việt. Chỉ tóm tắt — KHÔNG gọi tool, KHÔNG thay đổi dữ liệu.';

/** The chat surface: Ask/Build toggle, streamed assistant text, tool cards, confirm modal. */
export function LarkChat({
  runtime,
  basesRev = 0,
  blocked,
  onOpenSkills,
  pinnedSessionId,
  hideSessionList = false,
}: {
  runtime: RuntimeAdapter;
  basesRev?: number;
  /**
   * Khi có: khung này khoá vào ĐÚNG hội thoại đó thay vì tự chọn "hội thoại đang mở".
   * Dùng cho chế độ nhiều tab — mỗi tab là một khung, và tab nào cũng phải giữ nguyên hội thoại
   * của nó kể cả khi tab khác đổi hội thoại đang active ở tầng dưới.
   */
  pinnedSessionId?: string;
  /** Ẩn danh sách hội thoại bên trong: ở chế độ nhiều tab thanh tab đã thay vai trò đó. */
  hideSessionList?: boolean;
  /** Open the Skills screen — the "/" menu's "Tạo lệnh mới" row. Absent = the row is hidden. */
  onOpenSkills?: () => void;
  /** Hand the synthesized app brief to the builder (fills the Composer + navigates). */
  /** When set (web, desktop offline): disable the composer + show this notice — nothing to send to. */
  blocked?: string | null;
}) {
  const { t: tr } = useI18n();
  const { message, modal } = App.useApp();
  /** Translate a built-in chip label (by its stable key); custom user asks pass through untranslated. */
  const chipLabel = (c: { label: string; k?: string }) => (c.k ? tr(`chat.util_${c.k}`, c.label) : c.label);
  const [mode, setMode] = useState<LarkChatMode>('ask');
  /** File đính kèm đang mở xem trước (null = đóng). */
  const [previewAtt, setPreviewAtt] = useState<PreviewableAttachment | null>(null);
  /** Skill đang mở để đọc, khi bấm chip "/lệnh" trong tin nhắn. */
  const [skillInfo, setSkillInfo] = useState<{ item: SlashCommandItem; body?: string; loading: boolean } | null>(null);
  const [input, setInput] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const composerRef = useRef<any>(null); // antd TextArea ref (for focusing on "edit message")
  const [busy, setBusy] = useState(false);
  /**
   * Chữ có ĐANG chảy về không — khác hẳn "tin cuối là tin trợ lý có chữ".
   *
   * Chấm chờ trước đây bị ẩn chỉ vì tin cuối cùng là tin trợ lý có nội dung. Sau khi người dùng
   * trả lời một câu hỏi `ask_user`, lượt chạy tiếp nhưng tin cuối vẫn là tin ĐÃ VIẾT XONG từ
   * trước — nên màn hình im lặng hoàn toàn dù nút Dừng vẫn đỏ. Đúng lúc người dùng vừa trả lời và
   * đang chờ nhất thì không có gì báo là máy đang làm việc.
   *
   * Nay chỉ coi là đang chảy khi độ dài chữ VỪA tăng; im quá `FLOW_IDLE_MS` là chấm chờ hiện lại.
   */
  const [textFlowing, setTextFlowing] = useState(false);
  const flowRef = useRef(0);
  // Shared AI lock (main process). If a lock is held but it isn't THIS chat's own in-flight
  // turn (busy === false), another tab/build/relay is running → block sending here too.
  const agentOwner = useAgentBusy();
  const blockedByOther = !!agentOwner && !busy;
  // ── "/" menu: the user's skills that carry a slash-command shortcut ──
  const [slashCmds, setSlashCmds] = useState<SlashCommandItem[]>([]);
  const slashRefreshed = useRef(false); // re-read the list once, the first time the composer is focused
  const loadSlashCmds = useCallback(async () => {
    if (!runtime.supportsSkillCommands) return; // older desktop build → no "/" menu at all
    try {
      // The runtime can serve the shortcuts directly; otherwise filter the full skill list.
      const light = await runtime.listSkillCommands?.();
      if (light) { setSlashCmds(light.filter((c) => !!c.command)); return; }
      const skills = runtime.listSkills ? await runtime.listSkills() : null;
      if (skills) setSlashCmds(skillsToCommandItems(skills));
    } catch { /* a convenience menu — a failure just means no commands, never a toast */ }
  }, [runtime]);
  useEffect(() => { void loadSlashCmds(); }, [loadSlashCmds]);
  const slash = useSlashCommands({
    value: input,
    onChange: setInput,
    commands: slashCmds,
    disabled: busy || !!blocked, // the textarea itself is disabled then
    getCaret: () => composerRef.current?.resizableTextArea?.textArea?.selectionStart ?? null,
    getEl: () => composerRef.current?.resizableTextArea?.textArea ?? null,
    // Only where a command can actually be stored — otherwise the Skills screen hides the field
    // and the row is a dead end (an older installed desktop main).
    onCreateCommand: runtime.supportsSkillCommands ? onOpenSkills : undefined,
  });
  // Responsive: on a phone / narrow web view, the conversation-history sidebar becomes a Drawer so
  // the chat gets the full width (on a wide desktop window it stays inline).
  const screens = Grid.useBreakpoint();
  const narrow = !screens.lg;
  const [navOpen, setNavOpen] = useState(false);
  const [items, setItems] = useState<ChatItem[]>([]);
  const [pendings, setPendings] = useState<PendingConfirm[]>([]);
  const [asks, setAsks] = useState<PendingAsk[]>([]);
  const [sessionId, setSessionId] = useState('');
  const [sessions, setSessions] = useState<LarkSessionMeta[]>([]);
  // Collapsed answers — a per-machine view preference (see larkFold.ts for why it is
  // deliberately NOT stored on the message or in the shared session payload).
  const [fold, setFold] = useState<FoldStore>(loadFold);
  const seededRef = useRef('');
  const foldedSet = new Set(fold.sessions[sessionId]?.ids || []);
  const updateFold = (mut: (s: FoldStore) => FoldStore) =>
    setFold((prev) => {
      const next = mut(prev);
      saveFold(next);
      return next;
    });
  const setSessionFold = (ids: string[]) =>
    updateFold((s) => ({ ...s, sessions: { ...s.sessions, [sessionId]: { t: Date.now(), ids } } }));
  const toggleFold = (id: string) => {
    const cur = fold.sessions[sessionId]?.ids || [];
    const folding = !cur.includes(id);
    setSessionFold(folding ? [...cur, id] : cur.filter((x) => x !== id));
    // Folding is when a summary becomes worth paying for — and only once per message.
    if (folding) {
      const it = items.find((x) => x.id === id);
      if (it && it.kind === 'msg') ensureSummary(id, it.text);
    }
  };
  /** Ids of every assistant answer currently in view — drives "thu gọn / mở tất cả". */
  const answerIds = (): string[] =>
    items.flatMap((it) => (it.kind === 'msg' && it.role === 'assistant' ? [it.id] : []));

  // ── Notes / todos + AI summaries (durable; require a main process that has the RPCs) ──
  const notesReady = !!runtime.larkSaveNotes;
  const [notesOpen, setNotesOpen] = useState(false);
  const emptyNotes = (): LarkNoteDoc => ({ v: 1, notes: [], updatedAt: '' });
  const [notesDoc, setNotesDoc] = useState<LarkNoteDoc>(emptyNotes);
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [summaries, setSummaries] = useState<Record<string, string>>({});
  const summarizing = useRef<Set<string>>(new Set());
  const openTodoN = notesDoc.notes.filter((n) => n.todo && !n.done).length;

  // Load this conversation's notes + cached summaries whenever the session changes.
  useEffect(() => {
    if (!sessionId) {
      setNotesDoc(emptyNotes());
      setSummaries({});
      return;
    }
    let dead = false;
    void runtime
      .larkNotes?.(sessionId)
      .then((d) => {
        if (!dead) setNotesDoc(d || emptyNotes());
      })
      .catch(() => {});
    void runtime
      .larkSummaries?.(sessionId)
      .then((m) => {
        if (!dead) setSummaries(m || {});
      })
      .catch(() => {});
    return () => {
      dead = true;
    };
  }, [sessionId, runtime]);

  // Độ dài chữ của tin trợ lý ở CUỐI danh sách. Chỉ cần độ dài, không cần nội dung.
  const tailLen = (() => {
    const l = items[items.length - 1];
    return l && l.kind === 'msg' && l.role === 'assistant' ? (l.text || '').length : 0;
  })();
  useEffect(() => {
    // Ngắn đi = sang tin mới hoặc bị viết lại; chỉ cập nhật mốc, không coi là đang chảy.
    if (tailLen <= flowRef.current) {
      flowRef.current = tailLen;
      return;
    }
    flowRef.current = tailLen;
    setTextFlowing(true);
    const id = setTimeout(() => setTextFlowing(false), 1200);
    return () => clearTimeout(id);
  }, [tailLen]);

  /**
   * Câu hỏi chuyển sang từ màn hình khác (vd "Nhờ AI thiết kế lại bộ" ở trang Kỹ năng).
   *
   * Chỉ ĐIỀN vào ô soạn, KHÔNG tự gửi: câu do máy dựng nên người dùng phải đọc lại và sửa trước khi
   * gửi — tự gửi là thay họ quyết định một lượt chạy có thể ghi dữ liệu.
   */
  useEffect(() => {
    const p = takeLarkPrompt();
    if (p) setInput(p);
  }, []);

  /**
   * Mở lại một hội thoại thì DỰNG LẠI những lời hỏi còn đang chờ.
   *
   * Tiến trình chính vẫn chờ nguyên như cũ (`pending`/`pendingAsk` sống ở đó), nhưng hộp hỏi thì
   * nằm trong state này — rời hội thoại là state chết theo. Quay vào thì thao tác treo ở
   * "cần xác nhận" mà không còn chỗ nào bấm, và 10 phút sau tiến trình chính tự từ chối. Người
   * dùng không làm gì sai và cũng không có cách nào cứu.
   *
   * KHÔNG xoá state đang có khi đổi hội thoại: hai hội thoại chạy song song thì hộp của cái kia
   * vẫn phải giữ. Chỉ gộp thêm những callId chưa có.
   */
  useEffect(() => {
    if (!sessionId || !runtime.larkPendingPrompts) return;
    let alive = true;
    void runtime
      .larkPendingPrompts(sessionId)
      .then((p) => {
        if (!alive) return;
        setPendings((cur) => [...cur, ...p.confirms.filter((c) => !cur.some((x) => x.callId === c.callId))]);
        setAsks((cur) => [...cur, ...p.asks.filter((a) => !cur.some((x) => x.callId === a.callId))]);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [sessionId, runtime]);

  /** Debounced save — notes must never block typing, and never touch session.updatedAt. */
  const saveNotes = (next: LarkNoteDoc) => {
    setNotesDoc(next);
    if (!sessionId || !runtime.larkSaveNotes) return;
    if (notesTimer.current) clearTimeout(notesTimer.current);
    notesTimer.current = setTimeout(() => {
      void runtime.larkSaveNotes?.(sessionId, next).catch(() => {});
    }, 500);
  };

  /** Capture an answer as a todo, linked back to the message it came from. */
  const noteFromMessage = (id: string, text: string) => {
    const label = messageDigest(text).title;
    const next: LarkNoteDoc = {
      v: 1,
      notes: [
        ...notesDoc.notes,
        {
          id: `n-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
          text: label,
          todo: true,
          done: false,
          createdAt: new Date().toISOString(),
          srcId: id,
          srcExcerpt: label.slice(0, 80),
        },
      ],
      updatedAt: new Date().toISOString(),
    };
    saveNotes(next);
    setNotesOpen(true);
  };

  /** Scroll to (and briefly highlight) the message a note was captured from. */
  const jumpToMessage = (srcId: string) => {
    const el = document.getElementById(`tw-msg-${srcId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.style.transition = 'background .2s ease';
    const prev = el.style.background;
    el.style.background = 'rgba(108,92,231,0.12)';
    setTimeout(() => {
      el.style.background = prev;
    }, 1200);
  };

  // ── Error inbox: a badge button + modal listing failed tool calls. Each error toggles between
  //    "chưa xử lý" ↔ "đã xử lý" (resolved). The badge counts only UNRESOLVED ones. A recurrence
  //    is a NEW call id, so it comes back as unresolved even if you'd resolved the earlier one. ──
  const [resolvedErr, setResolvedErr] = useState<Set<string>>(() => new Set());
  const [errModalOpen, setErrModalOpen] = useState(false);
  const jumpToTool = (callId: string) => {
    const el = document.getElementById(`tw-tool-${callId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const prev = el.style.boxShadow;
    el.style.transition = 'box-shadow .2s ease';
    el.style.boxShadow = '0 0 0 2px rgba(239,68,68,0.55)';
    setTimeout(() => {
      el.style.boxShadow = prev;
    }, 1400);
  };
  const toggleResolved = (callId: string) =>
    setResolvedErr((prev) => {
      const n = new Set(prev);
      if (n.has(callId)) n.delete(callId);
      else n.add(callId);
      return n;
    });
  // CHỈ lỗi THẬT vào hộp "Lỗi công cụ". Thất bại tầng 'blocked' (cần người xử lý) và 'noise'
  // (agent tự phục hồi, vd `stale-ref`) vẫn hiện trong dòng chảy hội thoại nhưng không được đếm:
  // một huy hiệu đỏ "12 lỗi" cho việc bình thường dạy người dùng phớt lờ chính con số đó.
  // `tier` vắng mặt = sự kiện từ bản cũ → coi như lỗi thật, giữ nguyên hành vi trước đây.
  const errorItems = items.filter(
    (it): it is Extract<ChatItem, { kind: 'tool' }> =>
      it.kind === 'tool' && it.call.status === 'error' && (it.call.tier ?? 'error') === 'error',
  );
  const unresolvedErrN = errorItems.filter((it) => !resolvedErr.has(it.call.callId)).length;

  /**
   * Generate the AI summary for a folded answer using the ACTIVE runner (local CLI or
   * direct API — whichever the switch selects) and cache it on the conversation. Fire
   * and forget: the structural digest is already on screen, so this only ever upgrades it.
   */
  const ensureSummary = (itemId: string, text: string) => {
    if (!runtime.larkSummarize || !sessionId) return;
    if (summaries[itemId] || summarizing.current.has(itemId)) return;
    summarizing.current.add(itemId);
    void runtime
      .larkSummarize(sessionId, itemId, text)
      .then((s) => {
        if (s) setSummaries((m) => ({ ...m, [itemId]: s }));
      })
      .catch(() => {})
      .finally(() => summarizing.current.delete(itemId));
  };

  useEffect(() => onFoldChange(() => setFold(loadFold())), []);

  // Auto-fold long answers ONCE, when a session is first opened — never at render and
  // never mid-turn. It runs on the already-hydrated array, so it structurally cannot
  // race the streaming update that rewrites the trailing item. Newest answer stays open.
  useEffect(() => {
    if (!sessionId || sessionId === seededRef.current || items.length === 0) return;
    seededRef.current = sessionId;
    const store = loadFold();
    if (store.sessions[sessionId] || !store.auto) return; // explicit intent wins forever
    let lastAsst = -1;
    items.forEach((it, i) => {
      if (it.kind === 'msg' && it.role === 'assistant') lastAsst = i;
    });
    const ids = items.flatMap((it, i) =>
      it.kind === 'msg' && it.role === 'assistant' && i !== lastAsst && isLongAnswer(it.text) ? [it.id] : [],
    );
    if (!ids.length) return;
    const next: FoldStore = { ...store, sessions: { ...store.sessions, [sessionId]: { t: Date.now(), ids } } };
    saveFold(next);
    setFold(next);
  }, [sessionId, items]);
  const [autoApprove, setAutoApprove] = useState(false);
  const [bases, setBases] = useState<LarkBaseRef[]>([]); // registered Bases
  const [convBases, setConvBases] = useState<LarkBaseRef[]>([]); // THIS conversation's Bases
  const [picker, setPicker] = useState<{ open: boolean; sel: string[] }>({ open: false, sel: [] });
  const [pickerQuery, setPickerQuery] = useState('');
  const [attachments, setAttachments] = useState<{ name: string; dataBase64: string; isImage: boolean; mime: string }[]>([]);
  // Context-window fill for this conversation (from Claude's per-turn usage). Drives the
  // "nearing the limit → start a fresh chat" banner.
  const [ctx, setCtx] = useState<{ percentUsed: number; contextTokens: number; windowTokens: number } | null>(null);
  /**
   * Ảnh chụp `items`/`ctx` cho đoạn xử lý CHẠY SAU khi lượt kết thúc.
   *
   * Đoạn đó nằm trong closure của `send`, nên nếu đọc thẳng `items`/`ctx` thì nó thấy giá trị lúc
   * lượt BẮT ĐẦU — tức luôn luôn "chưa có kết luận", và sẽ tự nối tiếp cả khi agent đã trả lời
   * xong. Ref luôn trỏ tới giá trị mới nhất.
   */
  const itemsRef = useRef<ChatItem[]>([]);
  const ctxRef = useRef<{ percentUsed: number; contextTokens: number; windowTokens: number } | null>(null);
  // Giữ ref khớp state ở MỌI lần vẽ — rẻ hơn nhiều so với việc đoạn chạy-sau phải tự đi tìm.
  itemsRef.current = items;
  ctxRef.current = ctx;
  const [handoffBusy, setHandoffBusy] = useState(false);
  /** Public share link for the OPEN conversation (null = not shared yet). */
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  /** items.length captured at the last successful share (per session) → drives the "cần đồng bộ" badge. */
  const [sharedCounts, setSharedCounts] = useState<Record<string, number>>({});
  const [runnerId, setRunnerId] = useState('claude');
  const [runnerModel, setRunnerModel] = useState('');
  const runnerSwitchedRef = useRef(false);
  const lastAgentRef = useRef('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const backupRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** Read picked/pasted files into base64 attachments (cap 12). */
  const readFiles = async (files: FileList | File[]) => {
    const all = Array.from(files);
    const list = all.slice(0, 12);
    if (all.length > list.length) message.info(tr('chat.max12PerTime', 'Chỉ đính kèm tối đa 12 file mỗi lần — đã bỏ bớt phần dư.'));
    const read = await Promise.all(
      list.map(
        (f) =>
          new Promise<{ name: string; dataBase64: string; isImage: boolean; mime: string; failed?: boolean }>((resolve) => {
            const r = new FileReader();
            r.onload = () => {
              const res = String(r.result || '');
              const b64 = res.includes(',') ? res.split(',')[1] : res;
              const isImage = (f.type || '').startsWith('image/');
              const mime = f.type || (isImage ? 'image/png' : 'application/octet-stream');
              resolve({ name: f.name || (isImage ? `anh.${(f.type.split('/')[1] || 'png')}` : 'file'), dataBase64: b64, isImage, mime });
            };
            r.onerror = () => resolve({ name: f.name || 'file', dataBase64: '', isImage: false, mime: '', failed: true });
            r.readAsDataURL(f);
          }),
      ),
    );
    // Surface read failures instead of silently dropping them.
    const failed = read.filter((x) => x.failed || !x.dataBase64);
    if (failed.length) message.error(`${tr('chat.cantReadFiles', 'Không đọc được')} ${failed.length} file: ${failed.map((x) => x.name).join(', ')}`);
    const okFiles = read
      .filter((x) => x.dataBase64)
      .map(({ name, dataBase64, isImage, mime }) => ({ name, dataBase64, isImage, mime }));
    if (attachments.length + okFiles.length > 12) message.info(tr('chat.max12Kept', 'Tối đa 12 file đính kèm — đã giữ 12 file đầu.'));
    setAttachments((a) => [...a, ...okFiles].slice(0, 12));
  };
  const onPaste = (e: React.ClipboardEvent) => {
    const raw = Array.from(e.clipboardData?.items || [])
      .filter((it) => it.type.startsWith('image/'))
      .map((it) => it.getAsFile())
      .filter(Boolean) as File[];
    if (!raw.length) return;
    e.preventDefault();
    // Ảnh từ clipboard tên "image.png" cho MỌI lần dán, nên hai ảnh dán liên tiếp trùng tên và
    // không phân biệt nổi khi xem lại. Đặt tên theo thời điểm dán.
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const when = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    const imgs = raw.map(
      (f, i) =>
        new File([f], `dan-${when}${raw.length > 1 ? `-${i + 1}` : ''}.${(f.type.split('/')[1] || 'png').replace('jpeg', 'jpg')}`, {
          type: f.type,
        }),
    );
    void readFiles(imgs);
  };

  // Load the registered Bases (for the picker + "add Base"). Re-runs when basesRev
  // bumps (a Base was added/removed in Settings) so the new Base shows without reload.
  useEffect(() => {
    runtime.larkListBases?.().then((b) => setBases(b || [])).catch(() => undefined);
  }, [runtime, basesRev]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [items, pendings]);

  // Direct-API mode (run via provider API, no local CLI) + whether the chosen provider has a key.
  const [apiKeyReady, setApiKeyReady] = useState(false);
  /** Nguồn chạy agent: CLI trên máy · khoá API riêng · gói Larkwave (MAIC). */
  const [runSource, setRunSource] = useState<'cli' | 'api' | 'maic'>('cli');
  const [maicAvailable, setMaicAvailable] = useState(false);

  // Load the persisted auto-approve preference.
  useEffect(() => {
    runtime.larkStatus?.().then((s) => {
      setAutoApprove(!!s.autoApprove);
      setApiKeyReady(!!s.apiKeyReady);
      setRunSource(s.larkRunSource ?? (s.apiMode ? 'api' : 'cli'));
      setMaicAvailable(!!s.maicAvailable);
      if (s.defaultRunner) setRunnerId(s.defaultRunner);
      if (s.defaultModel) setRunnerModel(s.defaultModel);
    }).catch(() => undefined);
  }, [runtime]);

  const pickRunSource = (src: 'cli' | 'api' | 'maic') => {
    setRunSource(src);
    runtime.larkSetAgentPrefs
      ?.({ larkRunSource: src })
      .then((s) => setApiKeyReady(!!s.apiKeyReady))
      .catch(() => undefined);
  };

  const refreshSessions = () => {
    runtime.larkSessions?.().then((s) => setSessions(s || [])).catch(() => undefined);
  };

  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);
  // Whether the CURRENT session's items were loaded successfully. A relay load that FAILED (timeout
  // on a large conversation) must NOT be treated as an empty conversation — otherwise the next
  // save would wipe the real session on the machine. We block saving until a good load/turn.
  const loadedRef = useRef(true);
  const sessionIdRef = useRef('');
  useEffect(() => { sessionIdRef.current = sessionId; });

  // Adopt the SHARED active conversation: pick the session larkService marks `active` (so the web —
  // driving this same desktop over the relay — opens the SAME conversation the desktop is on, instead
  // of clobbering it with the most-recent one). Falls back to most-recent, then a fresh session.
  const syncFromActive = useCallback(async () => {
    if (!runtime.larkSessions) return; // web with no session support (shouldn't happen over relay)
    let list: LarkSessionMeta[];
    try {
      list = (await runtime.larkSessions()) || [];
    } catch {
      return; // relay/RPC failed (e.g. desktop busy) — keep the current view, NEVER clobber
    }
    if (!mountedRef.current) return;
    setSessions(list);
    if (!list.length) {
      // Only spawn a fresh session when the machine GENUINELY has none AND nothing is loaded here —
      // a transient relay hiccup must never replace a conversation with a blank one.
      if (sessionIdRef.current) return;
      const r = await runtime.larkNewSession?.([]).catch(() => undefined);
      if (!mountedRef.current || !r?.id) return;
      setSessionId(r.id);
      setItems([]);
      setConvBases([]);
      loadedRef.current = true;
      return;
    }
    // Ở chế độ nhiều tab, hội thoại của khung này do thanh tab quyết định — KHÔNG được chọn theo
    // cờ `active` toàn cục, vì cờ đó chỉ có một và sẽ kéo mọi tab về cùng một hội thoại.
    // Tab đã khoá vào một hội thoại thì PHẢI là hội thoại đó, kể cả khi nó chưa có trong danh
    // sách (hội thoại mới chưa có tin nhắn nào nên chưa được ghi xuống đĩa). Rơi về hội thoại
    // khác là tab hiển thị nhầm nội dung của người khác.
    const target = pinnedSessionId
      ? list.find((s) => s.id === pinnedSessionId) || { id: pinnedSessionId }
      : list.find((s) => s.active) || list[0];
    let r: { items?: unknown[]; bases?: unknown; runner?: string; model?: string } | null;
    try {
      r = (await runtime.larkSwitchSession?.(target.id)) ?? null;
    } catch {
      return; // couldn't load the conversation body — keep the current view, don't show/save empty
    }
    if (!mountedRef.current || !r) return;
    setSessionId(target.id);
    setItems((r.items as ChatItem[]) || []);
    setConvBases((r.bases as LarkBaseRef[]) || []);
    if (r.runner) setRunnerId(r.runner);
    if (r.model) setRunnerModel(r.model);
    loadedRef.current = true;
  }, [runtime]);

  // On open: continue the shared active conversation (restoring its applied Bases).
  useEffect(() => {
    void syncFromActive();
  }, [syncFromActive]);

  // When a REMOTE (relay) turn finishes on this machine, re-read the shared session so the desktop
  // reflects what the web just did (new messages / switched session) instead of showing stale state.
  const prevOwnerKind = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevOwnerKind.current;
    prevOwnerKind.current = agentOwner?.kind ?? null;
    if (prev === 'relay' && !agentOwner && !busy) void syncFromActive();
  }, [agentOwner, busy, syncFromActive]);

  /** Persist the conversation's Bases immediately (so add/remove survives reopen). */
  const persistBases = (next: LarkBaseRef[]) => {
    if (sessionId && runtime.larkSaveSession) void runtime.larkSaveSession(sessionId, items as unknown[], next);
  };
  const addBase = (tok: string) => {
    const b = bases.find((x) => x.appToken === tok);
    if (!b || convBases.some((x) => x.appToken === tok)) return;
    const next = [...convBases, b];
    setConvBases(next);
    persistBases(next);
  };
  const removeBase = (tok: string) => {
    const next = convBases.filter((x) => x.appToken !== tok);
    setConvBases(next);
    persistBases(next);
  };

  // ── Quick-add a Base by app_token/URL right here (no trip to Settings) ───────
  const [quickBase, setQuickBase] = useState('');
  const [quickBusy, setQuickBusy] = useState(false);
  /** Register the pasted app_token/URL, refresh the list, return the newly-added Base(s). */
  const quickRegisterBase = async (): Promise<LarkBaseRef[]> => {
    const v = quickBase.trim();
    if (!v || !runtime.larkAddBase) return [];
    setQuickBusy(true);
    try {
      const isUrl = /^https?:\/\//i.test(v);
      const before = new Set(bases.map((b) => b.appToken));
      const next = await runtime.larkAddBase(isUrl ? { url: v } : { appToken: v });
      setBases(next);
      setQuickBase('');
      const added = next.filter((b) => !before.has(b.appToken));
      message.success(added.length ? `${tr('chat.baseAddedName', 'Đã thêm Base')} "${added[0].name}".` : tr('chat.baseExists', 'Base đã có sẵn.'));
      return added;
    } catch (e) {
      message.error((e as Error)?.message || tr('chat.baseAddFailed', 'Không thêm được Base.'));
      return [];
    } finally {
      setQuickBusy(false);
    }
  };
  /** Quick-add from the NEW-CHAT picker → also tick the new Base in the selection. */
  const quickAddToPicker = async () => {
    const added = await quickRegisterBase();
    if (added.length) setPicker((p) => ({ ...p, sel: [...new Set([...p.sel, ...added.map((b) => b.appToken)])] }));
  };
  /** Quick-add from the applied-Bases bar → apply the new Base to THIS conversation now. */
  const quickAddToConversation = async () => {
    const added = await quickRegisterBase();
    if (!added.length) return;
    const next = [...convBases, ...added.filter((b) => !convBases.some((c) => c.appToken === b.appToken))];
    setConvBases(next);
    persistBases(next);
  };
  /** Shared little "paste app_token / URL" input used by both quick-add spots. */
  const quickAddInput = (onAdd: () => void) => (
    <Space.Compact style={{ width: '100%' }}>
      <Input
        size="small"
        placeholder={tr('chat.pasteAppTokenUrl', 'Dán app_token hoặc URL Base')}
        value={quickBase}
        onChange={(e) => setQuickBase(e.target.value)}
        onPressEnter={onAdd}
      />
      <Button size="small" type="primary" icon={<PlusOutlined />} loading={quickBusy} onClick={onAdd}>
        {tr('chat.add', 'Thêm')}
      </Button>
    </Space.Compact>
  );

  const updateTool = (callId: string, fn: (c: ToolCallState) => ToolCallState) =>
    setItems((prev) =>
      prev.map((it) => (it.kind === 'tool' && it.call.callId === callId ? { ...it, call: fn(it.call) } : it)),
    );

  const apply = (ev: LarkChatEvent) => {
    if (ev.type === 'text') {
      let finalText = '';
      setItems((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.kind === 'msg' && last.role === 'assistant') {
          finalText = last.text + ev.delta;
          return [...prev.slice(0, -1), { ...last, text: finalText }];
        }
        finalText = ev.delta;
        return [...prev, { kind: 'msg', id: rid(), role: 'assistant', text: finalText, ts: Date.now() }];
      });
      // Lỗi xác thực/credit hay tới dưới dạng CHỮ assistant (CLI in lỗi như câu trả lời) → vẫn báo
      // telemetry. reportRunnerError tự chống gửi trùng khi chữ stream cập nhật liên tục.
      const fix = diagnoseRunnerError(finalText);
      if (fix) reportRunnerError({ runner: runnerId, model: runnerModel || undefined, kind: fix.kind, message: finalText, surface: 'lark' });
    } else if (ev.type === 'tool_call') {
      setItems((prev) => [
        ...prev,
        { kind: 'tool', id: ev.callId, call: { callId: ev.callId, name: ev.name, input: ev.input, gated: ev.gated, status: 'pending' } },
      ]);
      if (ev.gated) setPendings((p) => [...p, { callId: ev.callId, name: ev.name, input: ev.input }]);
    } else if (ev.type === 'tool_result') {
      updateTool(ev.callId, (c) => ({ ...c, status: ev.ok ? 'ok' : 'error', summary: ev.summary, error: ev.error, suspectAppBug: ev.suspectAppBug, tier: ev.tier }));
      // The tool already ran (e.g. auto-approved server-side) — drop any lingering confirm.
      setPendings((p) => p.filter((x) => x.callId !== ev.callId));
    } else if (ev.type === 'file') {
      setItems((prev) => [
        ...prev,
        {
          kind: 'file',
          id: rid(),
          name: ev.name,
          path: ev.path,
          mime: ev.mime,
          bytes: ev.bytes,
          ...(ev.uploadId ? { uploadId: ev.uploadId } : {}),
          ts: Date.now(),
        },
      ]);
    } else if (ev.type === 'tool_denied') {
      updateTool(ev.callId, (c) => ({ ...c, status: 'denied' }));
      setPendings((p) => p.filter((x) => x.callId !== ev.callId));
    } else if (ev.type === 'ask_user') {
      setAsks((a) => [...a, { callId: ev.callId, question: ev.question, choices: ev.choices }]);
    } else if (ev.type === 'usage') {
      setCtx({ percentUsed: ev.percentUsed, contextTokens: ev.contextTokens, windowTokens: ev.windowTokens });
      // Ghi tên model THẬT lên bong bóng trả lời, thay cho bí danh. Người dùng chọn "opus", còn
      // "opus" là đời nào thì tuỳ CLI trên máy — không hiện ra thì không ai biết mình đang chạy gì.
      if (ev.model) lastAgentRef.current = `${runnerId} · ${ev.model}`;
    } else if (ev.type === 'error') {
      message.error(ev.message);
      // Ghi lỗi vào hội thoại (không chỉ toast thoáng qua) để người dùng đọc + làm theo các bước;
      // diagnoseRunnerError khi render sẽ biến nó thành thẻ hướng dẫn. + báo telemetry cho /admin.
      setItems((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.kind === 'msg' && last.role === 'assistant' && last.text === ev.message) return prev;
        return [...prev, { kind: 'msg', id: rid(), role: 'assistant', text: ev.message, ts: Date.now() }];
      });
      reportRunnerError({ runner: runnerId, model: runnerModel || undefined, kind: classifyRunnerError(ev.message), message: ev.message, surface: 'lark' });
    }
  };

  /** Deliver the user's answer for a pending `ask_user` → resumes the paused agent. */
  const answer = (callId: string, ans: string) => {
    runtime.larkAnswerAsk?.(callId, ans);
    setAsks((a) => a.filter((x) => x.callId !== callId));
  };

  // `label` (optional): a SHORT, friendly title to show in the user bubble INSTEAD of the raw
  // prompt — for "Hỏi nhanh"/preset chips whose real prompt is a long technical instruction the
  // user shouldn't see spilled into the transcript. The full `text` still goes to the AI.
  /** Mở nội dung skill mà chip "/lệnh" trỏ tới (thân skill nạp khi cần). */
  const openSkillInfo = (item: SlashCommandItem) => {
    setSkillInfo({ item, loading: !!runtime.readSkill });
    if (!runtime.readSkill) return;
    void runtime
      .readSkill(item.id)
      .then((r) =>
        setSkillInfo((p) => (p && p.item.id === item.id ? { ...p, body: r.instructions, loading: false } : p)),
      )
      .catch(() => setSkillInfo((p) => (p ? { ...p, loading: false } : p)));
  };

  /**
   * Mở lại một tệp ĐÃ GỬI. Đọc thẳng từ thư mục làm việc của hội thoại thay vì nhét nội dung tệp
   * vào bản ghi hội thoại: bản ghi còn được sao lưu lên máy chủ, một tệp .xlsx vài MB nhét vào đó
   * là phình vô ích — mà tệp thì vẫn đang nằm sẵn trên đĩa cho agent đọc lại.
   */
  const openSentFile = (name: string) => {
    if (!runtime.larkReadFile || !sessionId) {
      message.info(tr('chat.fileGone', 'Không còn giữ nội dung tệp này trên máy bạn để xem lại.'));
      return;
    }
    void runtime
      .larkReadFile(sessionId, name)
      .then((r) => {
        if (!r) {
          message.info(tr('chat.fileGone', 'Không còn giữ nội dung tệp này trên máy bạn để xem lại.'));
          return;
        }
        const ext = name.split('.').pop()?.toLowerCase() ?? '';
        const mime =
          ext === 'png' ? 'image/png'
          : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
          : ext === 'gif' ? 'image/gif'
          : ext === 'webp' ? 'image/webp'
          : ext === 'pdf' ? 'application/pdf'
          : ext === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : ext === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          : ext === 'pptx' ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
          : 'text/plain';
        setPreviewAtt({ name, mime, dataBase64: r.dataBase64, isImage: mime.startsWith('image/') });
      })
      .catch(() => message.info(tr('chat.fileGone', 'Không còn giữ nội dung tệp này trên máy bạn để xem lại.')));
  };

  /**
   * Số lần TỰ nối tiếp còn lại cho yêu cầu hiện tại của người dùng.
   *
   * Có trần vì tự nối là một vòng lặp tốn tiền: một lượt hiểu nhầm có thể tự gọi mình mãi. Ba lần
   * đủ cho ca thường gặp (agent dựng 30 bảng, mỗi lượt được chừng 7 bảng), mà vẫn dừng hẳn nếu
   * nó thật sự bế tắc. Đặt lại mỗi khi NGƯỜI gửi tin mới.
   */
  const autoLeftRef = useRef(0);

  const send = async (text?: string, label?: string, auto = false) => {
    if (blocked) return; // desktop offline — nothing to send to
    const prompt = (text ?? input).trim();
    // `mime` đi kèm: thiếu nó thì đường web dựng File không có type → octet-stream → máy chủ từ
    // chối ảnh, và lỗi bị nuốt. Cùng lỗi đã sửa ở AgentChat.
    const atts = attachments.map((a) => ({ name: a.name, dataBase64: a.dataBase64, mime: a.mime }));
    if ((!prompt && !atts.length) || busy || handoffBusy || !runtime.larkChat) return;
    const effective = prompt || tr('chat.analyzeFiles', 'Đọc + phân tích các file đính kèm giúp tôi.');
    // Keep image attachments IN the transcript (bounded ~1.5MB/img) so they show in the
    // chat history AND in a shared conversation — not just as a "📎 name" text marker.
    const imgs = attachments
      .filter((a) => a.isImage && a.dataBase64 && a.dataBase64.length < 2_000_000)
      .map((a) => ({ name: a.name, dataUrl: `data:${a.mime};base64,${a.dataBase64}` }));
    setInput('');
    setAttachments([]);
    if (!auto) autoLeftRef.current = AUTO_CONTINUE_MAX; // yêu cầu MỚI của người dùng → nạp lại lượt tự nối
    setBusy(true);
    setItems((prev) => [
      ...prev,
      {
        kind: 'msg',
        id: rid(),
        role: 'user',
        text: effective + (atts.length ? `\n\n📎 ${atts.map((a) => a.name).join(', ')}` : ''),
        ts: Date.now(),
        ...(imgs.length ? { images: imgs } : {}),
        ...(label ? { label } : {}),
      },
    ]);
    const startedAt = Date.now();
    try {
      lastAgentRef.current = `${runnerId}${runnerModel ? ` · ${runnerModel}` : ''}`;
      for await (const ev of runtime.larkChat({
        prompt: effective,
        mode,
        activeBases: convBases,
        attachments: atts.length ? atts : undefined,
        runner: runnerId,
        model: runnerModel || undefined,
        runnerSwitched: runnerSwitchedRef.current,
        // Pin the turn to the conversation shown here so a relay (web/phone) turn or a second
        // desktop tab runs against — and resumes — THIS session, not the desktop's last-active one.
        ...(sessionId ? { sessionId } : {}),
      }))
        apply(ev);
      runnerSwitchedRef.current = false;
    } catch (e) {
      message.error((e as Error)?.message || tr('chat.agentRunError', 'Lỗi khi chạy agent.'));
    } finally {
      setItems((cur) => {
        const c = [...cur];
        const last = c[c.length - 1];
        if (last?.kind === 'msg' && last.role === 'assistant') {
          // Stamp who answered AND how long the user waited, in one pass.
          c[c.length - 1] = {
            ...last,
            ...(lastAgentRef.current ? { agent: lastAgentRef.current } : {}),
            ...(last.durMs === undefined ? { durMs: Date.now() - startedAt } : {}),
          };
        }
        return c;
      });
      setBusy(false);
      setPendings([]);
      setAsks([]);
      /**
       * LƯỢT DỪNG GIỮA CHỪNG MÀ KHÔNG NÓI GÌ — tự xử lý, đừng để người dùng tưởng đã xong.
       *
       * Triệu chứng người dùng gặp: agent gọi một loạt `bitable_create_table` rồi im, ô soạn mở
       * lại như thể xong việc. Họ hỏi "xong chưa" thì agent đếm lại và trả lời "chưa, còn 17
       * bảng". Tức lượt chạy kết thúc mà KHÔNG có kết luận, và không có gì phân biệt được với
       * thành công.
       *
       * Nguyên nhân gần như luôn là ngữ cảnh đã đầy: mỗi lượt nối tiếp phiên cũ, tới sát trần thì
       * model chỉ còn chỗ cho vài lời gọi rồi hết. Nên xử lý theo đúng thứ tự đó:
       *   1. ngữ cảnh gần đầy  → sang phiên mới (giữ tóm tắt) rồi chạy tiếp
       *   2. còn chỗ           → nối tiếp ngay
       *   3. hết lượt tự nối   → NÓI RA, không im lặng
       *
       * Chỉ tự nối khi lượt đó CÓ gọi công cụ: một câu hỏi đáp ngắn không có kết luận thì là trả
       * lời rỗng thật, nối thêm chỉ tốn tiền.
       */
      void (async () => {
        const cur = itemsRef.current;
        const last = cur[cur.length - 1];
        // Luật ở `core/chatTurn` — một chỗ, kiểm được mà không cần dựng cả màn hình.
        const ketLuan = last?.kind === 'msg' && last.role === 'assistant' ? last.text.trim() : '';
        const step = nextStepAfterTurn({
          hasConclusion: !!ketLuan,
          // Kết luận tự nhận còn dở ("8/24 bảng", "còn 17 bảng") thì không tính là xong.
          conclusionSaysUnfinished: !!ketLuan && saysUnfinished(ketLuan),
          usedTools: cur.some((it) => it.kind === 'tool'),
          ctxUsed: ctxRef.current?.percentUsed ?? null,
          autoLeft: autoLeftRef.current,
          canHandoff: !!(runtime.larkCompactSession || runtime.larkHandoffSession),
        });
        if (step === 'none') return;

        /** Nén ngữ cảnh tại chỗ. Trả về true nếu đã nén được. */
        const nenNguCanh = async (): Promise<boolean> => {
          try {
            if (runtime.larkCompactSession) {
              const r = await runtime.larkCompactSession(sessionId || undefined);
              if (r?.ok) {
                setCtx(null);
                setItems((p) => [
                  ...p,
                  {
                    kind: 'msg',
                    id: rid(),
                    role: 'assistant',
                    text: tr(
                      'chat.compacted',
                      '🗜️ Ngữ cảnh đã gần đầy — đã nén lại và giữ nguyên cuộc trò chuyện này.',
                    ),
                    ts: Date.now(),
                  },
                ]);
                return true;
              }
            } else {
              await handoffSession(); // bản cài cũ: thà sang hội thoại mới còn hơn kẹt ở trần
              return true;
            }
          } catch {
            /* nén hỏng thì cứ để nguyên, còn hơn dừng hẳn */
          }
          return false;
        };

        // Lượt xong tử tế nhưng ngữ cảnh gần đầy: nén NGAY, không chạy thêm lượt nào.
        // Không nén chủ động thì hội thoại cứ ngồi ở 100% và lượt SAU mới là lượt hỏng.
        if (step === 'compact') {
          await nenNguCanh();
          return;
        }

        if (step === 'warn') {
          setItems((p) => [
            ...p,
            {
              kind: 'msg',
              id: rid(),
              role: 'assistant',
              text: tr(
                'chat.stalledNote',
                '⚠️ Lượt chạy dừng mà chưa có kết luận, và đã tự chạy tiếp hết số lần cho phép. Việc có thể CHƯA XONG — hãy nhắn "tiếp tục" để chạy thêm, hoặc hỏi "còn thiếu gì" để agent tự kiểm lại.',
              ),
              ts: Date.now(),
            },
          ]);
          return;
        }
        autoLeftRef.current -= 1;

        /**
         * Ngữ cảnh đầy: NÉN TẠI CHỖ, giữ nguyên hội thoại đang mở.
         *
         * Không đẩy người dùng sang hội thoại mới — họ đang làm dở, và cắt đôi lịch sử giữa chừng
         * là thứ khó chịu hơn cả việc phải chờ. Bên dưới phiên Claude được thay bằng phiên mới
         * mang theo bản tóm tắt; bên trên thì không có gì đổi.
         *
         * `larkHandoffSession` chỉ là lối lùi cho bản cài CŨ chưa có `larkCompactSession`: ở đó
         * thà sang hội thoại mới còn hơn kẹt ở trần ngữ cảnh mãi.
         */
        if (step === 'handoff-then-continue') {
          await nenNguCanh();
        }
        await send(tr('chat.autoContinuePrompt', AUTO_CONTINUE_PROMPT), tr('chat.autoContinueLabel', 'Tự chạy tiếp'), true);
      })();
      // Persist the conversation (reads the latest items via the functional setter). GUARD: only save
      // when the session was loaded successfully — never persist over a session whose body we failed
      // to load from the machine (that would wipe the real conversation + its Bases). NOTE: we DON'T
      // pass `bases` here — a chat turn must never change the conversation's Base (base add/remove
      // goes through persistBases). Omitting it makes larkSaveSession PRESERVE the existing Base, so
      // a momentarily-empty convBases (relay load quirk) can't demote the conversation to "Chưa gắn base".
      if (loadedRef.current && sessionId && runtime.larkSaveSession) {
        setItems((cur) => {
          void runtime.larkSaveSession!(sessionId, cur as unknown[]).then(refreshSessions);
          return cur;
        });
      }
      scheduleBackup(); // debounced push to the Larkwave account
    }
  };

  /** Debounced backup/sync to the account after activity (best-effort, offline-safe). */
  const scheduleBackup = () => {
    if (!runtime.larkBackupSync) return;
    if (backupRef.current) clearTimeout(backupRef.current);
    backupRef.current = setTimeout(() => {
      runtime.larkBackupSync?.().catch(() => undefined);
    }, 8000);
  };

  const decide = (callId: string, decision: 'allow' | 'deny') => {
    runtime.larkConfirmTool?.(callId, decision);
    setPendings((p) => p.filter((x) => x.callId !== callId));
  };

  // "Cuộc trò chuyện mới": if Bases are registered, ask WHICH to apply (multi-select);
  // otherwise start straight away.
  const openNewChat = () => {
    if (busy) return;
    if (bases.length === 0) {
      void startChat([]);
      return;
    }
    setPicker({ open: true, sel: convBases.map((b) => b.appToken) });
  };
  const startChat = async (selTokens: string[]) => {
    const sel = bases.filter((b) => selTokens.includes(b.appToken));
    const r = await runtime.larkNewSession?.(sel).catch(() => undefined);
    if (!r?.id) {
      message.error(tr('chat.newSessionFailed', 'Không tạo được hội thoại mới (máy bận/mạng chậm?). Thử lại.'));
      setPicker({ open: false, sel: [] });
      return;
    }
    setSessionId(r.id);
    setItems([]);
    setPendings([]);
    setAsks([]);
    setCtx(null);
    setConvBases(sel);
    loadedRef.current = true; // a genuinely-new empty session is safe to persist
    setPicker({ open: false, sel: [] });
    refreshSessions();
  };

  /**
   * Context-limit handoff: summarize the current chat → fresh session that inherits the
   * summary (Bases preserved). Falls back to a plain new chat if the runtime can't summarize.
   */
  const handoffSession = async () => {
    if (handoffBusy || busy) return;
    if (!runtime.larkHandoffSession) {
      openNewChat();
      return;
    }
    setHandoffBusy(true);
    try {
      const { id, summary, bases: keptBases } = await runtime.larkHandoffSession();
      setSessionId(id);
      setItems(
        summary.trim()
          ? [{ kind: 'msg', id: rid(), role: 'assistant', text: `📋 ${tr('chat.summaryFromPrev', 'Tóm tắt từ phiên trước:')}\n\n${summary.trim()}` }]
          : [],
      );
      setConvBases(keptBases || []); // keep the UI's active Bases in sync with the new session
      setPendings([]);
      setAsks([]);
      setCtx(null);
      refreshSessions();
      message.success(tr('chat.newSessionKeptSummary', 'Đã tạo phiên mới — agent vẫn nhớ phần tóm tắt của phiên trước.'));
    } catch (e) {
      message.error((e as Error)?.message || tr('chat.newSessionFailed2', 'Không tạo được phiên mới.'));
    } finally {
      setHandoffBusy(false);
    }
  };

  const switchTo = async (id: string) => {
    if (busy || id === sessionId) return;
    let r: { items?: unknown[]; bases?: unknown; runner?: string; model?: string } | null;
    try {
      r = (await runtime.larkSwitchSession?.(id)) ?? null;
    } catch {
      r = null;
    }
    if (!r) {
      // Relay load failed (e.g. timeout on a large conversation) — DON'T switch to an empty view;
      // that would let the next save wipe the real session. Keep the current one.
      message.error(tr('chat.loadSessionFailed', 'Không tải được hội thoại từ máy (mạng chậm/máy bận?). Chưa đổi gì — thử lại sau.'));
      return;
    }
    setSessionId(id);
    setItems((r.items as ChatItem[]) || []);
    setConvBases((r.bases as LarkBaseRef[]) || []);
    if (r.runner) setRunnerId(r.runner);
    if (r.model) setRunnerModel(r.model);
    setPendings([]);
    setAsks([]);
    setCtx(null);
    loadedRef.current = true;
  };

  const deleteSession = (id: string) => {
    const meta = sessions.find((s) => s.id === id);
    modal.confirm({
      title: tr('chat.deleteConvTitle', 'Xoá cuộc trò chuyện này?'),
      content: `“${meta?.title || tr('chat.conversation', 'Cuộc trò chuyện')}” ${tr('chat.willBeDeleted', 'sẽ bị xoá khỏi máy. Không thể hoàn tác.')}`,
      okText: tr('chat.delete', 'Xoá'),
      okButtonProps: { danger: true },
      cancelText: tr('chat.cancel', 'Huỷ'),
      onOk: () => {
        // Optimistic: drop it from the sidebar INSTANTLY + close the dialog now (don't await the
        // relay round-trip — that felt slow). The actual delete + re-sync run in the background.
        setSessions((prev) => prev.filter((s) => s.id !== id));
        const done = runtime.larkDeleteSession?.(id).catch(() => undefined);
        if (id === sessionId) void startChat([]); // dropped the OPEN one → fresh chat (bg)
        else void done?.then(() => refreshSessions()); // re-sync sidebar in bg (self-heals if needed)
      },
    });
  };

  // ── Public sharing (publish this conversation to a website link) ────────────
  const canShare = !!runtime.larkShareSession; // desktop only
  // Reflect the OPEN conversation's share state (so we show "copy link" vs "share").
  useEffect(() => {
    if (!canShare || !sessionId || !getToken()) {
      setShareUrl(null);
      return;
    }
    let alive = true;
    runtime
      .larkShareStatus?.(sessionId)
      .then((r) => {
        if (!alive) return;
        setShareUrl(r.url);
        // The server reports how many items are CURRENTLY published → an ACCURATE baseline that
        // survives app restarts (badge = local items minus what's actually on the link).
        if (r.url && typeof r.itemCount === 'number') {
          setSharedCounts((m) => ({ ...m, [sessionId]: r.itemCount as number }));
        }
      })
      .catch(() => alive && setShareUrl(null));
    return () => {
      alive = false;
    };
  }, [runtime, canShare, sessionId]);

  // Fallback baseline for an OLD desktop build that doesn't report itemCount: assume in-sync at
  // the moment we learn it's shared, so the badge counts only turns added afterwards.
  useEffect(() => {
    if (shareUrl && sessionId && sharedCounts[sessionId] == null) {
      setSharedCounts((m) => ({ ...m, [sessionId]: items.length }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareUrl, sessionId, items.length]);

  const copyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      message.success(tr('chat.linkCopied', 'Đã copy link — dán để chia sẻ, người khác xem trên web.'));
    } catch {
      message.info(url); // clipboard blocked → at least show it
    }
  };

  /** Copy any message text to the clipboard. */
  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text ?? '');
      message.success(tr('chat.copiedDot', 'Đã sao chép.'));
    } catch {
      message.info(tr('chat.copyBlocked', 'Không sao chép được — trình duyệt chặn clipboard.'));
    }
  };

  /** Load a message's text into the composer for editing + re-sending — refine a question, or
   *  correct/steer an answer so the agent understands (train). Doesn't send until you press Enter. */
  const editInComposer = (text: string) => {
    setInput(text ?? '');
    setTimeout(() => composerRef.current?.focus?.(), 0);
  };

  const doShare = async (opts?: { announce?: boolean }) => {
    if (!sessionId) return;
    if (!getToken()) {
      message.warning(tr('chat.loginToShare', 'Đăng nhập tài khoản Larkwave để chia sẻ hội thoại công khai.'));
      return;
    }
    if (!items.length) {
      message.warning(tr('chat.nothingToShare', 'Hội thoại chưa có nội dung để chia sẻ.'));
      return;
    }
    setShareBusy(true);
    try {
      // Persist the latest transcript first, then upsert the SAME share link with fresh content.
      await runtime.larkSaveSession?.(sessionId, items as unknown[], convBases);
      const res = await runtime.larkShareSession!(sessionId);
      setShareUrl(res.url);
      setSharedCounts((m) => ({ ...m, [sessionId]: items.length })); // now in-sync → clear the badge
      if (opts?.announce) {
        message.success(tr('chat.shareUpdated', 'Đã cập nhật nội dung mới nhất lên link chia sẻ (mở lại/hard-refresh trang để thấy).'));
      } else {
        await copyLink(res.url);
      }
    } catch (e) {
      message.error((e as Error)?.message || tr('chat.shareFailed', 'Chia sẻ thất bại.'));
    } finally {
      setShareBusy(false);
    }
  };

  const doUnshare = async () => {
    if (!sessionId) return;
    setShareBusy(true);
    try {
      await runtime.larkUnshareSession!(sessionId);
      setShareUrl(null);
      message.success(tr('chat.unshared', 'Đã ngừng chia sẻ — link không còn truy cập được.'));
    } catch (e) {
      message.error((e as Error)?.message || tr('chat.unshareFailed', 'Không bỏ chia sẻ được.'));
    } finally {
      setShareBusy(false);
    }
  };

  const openExternal = (url: string) => (runtime.openExternal ? runtime.openExternal(url) : window.open(url, '_blank'));

  // Turns added since the last share → shown as a badge prompting "cập nhật nội dung" to re-sync.
  const shareBaseline = shareUrl && sessionId ? sharedCounts[sessionId] : undefined;
  const pendingShareN = shareBaseline != null && items.length > shareBaseline ? items.length - shareBaseline : 0;

  // User-defined "Hỏi nhanh" (quick-asks) — one-click prompts the user adds, persisted
  // per-device in localStorage (these are lightweight prompt shortcuts, distinct from the
  // heavier Skills system). They append to the built-in chips.
  const [customAsks, setCustomAsks] = useState<{ label: string; prompt: string }[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const v = JSON.parse(localStorage.getItem('tw_lark_quickasks') || '[]');
      if (!Array.isArray(v)) return [];
      // Drop malformed/empty entries + de-dupe by label (corrupted storage → unique keys).
      const seen = new Set<string>();
      const out: { label: string; prompt: string }[] = [];
      for (const x of v) {
        const label = typeof x?.label === 'string' ? x.label.trim() : '';
        const prompt = typeof x?.prompt === 'string' ? x.prompt.trim() : '';
        if (label && prompt && !seen.has(label)) {
          seen.add(label);
          out.push({ label, prompt });
        }
      }
      return out;
    } catch {
      return [];
    }
  });
  const persistAsks = (list: { label: string; prompt: string }[]) => {
    setCustomAsks(list);
    if (typeof window !== 'undefined') localStorage.setItem('tw_lark_quickasks', JSON.stringify(list));
  };
  const [guideChip, setGuideChip] = useState<{ label: string; prompt: string; custom?: boolean } | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  // "Hỏi nhanh" chips: collapse to one line with a Xem thêm / Thu gọn toggle instead of a
  // horizontal scrollbar when they overflow.
  const [chipsExpanded, setChipsExpanded] = useState(false);
  const [chipsOverflow, setChipsOverflow] = useState(false);
  const chipsRef = useRef<HTMLDivElement>(null);
  const [newLabel, setNewLabel] = useState('');
  const [newPrompt, setNewPrompt] = useState('');

  const baseChips = (convBases.length ? BASE_UTILS : EXAMPLES.map((e) => ({ k: e.k, label: e.text, prompt: e.text }))).map((c) => {
    // "Đọc workflow": inject the applied Base's app_token(s) so the agent doesn't call the tool
    // with an empty app_token (the CLI often won't fill it from context on its own).
    if (c.label.includes('Đọc workflow') && convBases.length) {
      const list = convBases.map((b) => `${b.name} (app_token=${b.appToken})`).join('; ');
      return {
        ...c,
        prompt:
          `Đọc và giải thích ĐẦY ĐỦ, CHI TIẾT các workflow/automation (tự động hoá) của base đang áp dụng: ${list}. ` +
          `Gọi bitable_read_workflows với app_token=${convBases[0].appToken}${convBases.length > 1 ? ' (rồi lần lượt các base còn lại)' : ''}. ` +
          'ĐỊNH DẠNG BẮT BUỘC (giao diện sẽ tự vẽ đẹp): với TỪNG workflow, in một tiêu đề đúng dạng "**WF<số>: <tên>** — đang bật/đang tắt" ' +
          '(đánh số WF1, WF2… để bấm liên kết được); NGAY DƯỚI đó dán NGUYÊN VĂN nội dung field "logic" của workflow đó từ kết quả tool — ' +
          'GIỮ nguyên từng dòng "• <biểu tượng> …", thụt lề 2 khoảng trắng mỗi cấp, tên bảng/cột/tuỳ chọn trong «…», và các nhãn "┗ ✔ ĐÚNG →", "┗ ✗ NGƯỢC LẠI →", "┗ Nhánh …", "┗ Mặc định …", "↳ chỉ chạy tiếp NẾU …". ' +
          'TUYỆT ĐỐI KHÔNG diễn giải cây thành đoạn văn, KHÔNG rút gọn, KHÔNG bỏ bước, KHÔNG đổi «…» thành id. Khi nhắc lại một workflow ở chỗ khác thì viết "WF<số>". ' +
          'Nếu tool báo chưa kết nối Lark web, nhắc tôi vào Cài đặt → "Kết nối Lark web".',
      };
    }
    // Audit chip: find problems in the existing workflows.
    if (c.label.includes('Soát lỗi') && convBases.length) {
      return {
        ...c,
        prompt:
          `Soát lỗi/rà soát toàn bộ workflow của base ${convBases[0].name} (app_token=${convBases[0].appToken}). ` +
          'Gọi bitable_read_workflows để đọc tất cả (và bitable_list_fields nếu cần đối chiếu cột). Đánh số các workflow WF1, WF2… (nhắc tới chúng bằng "WF<số>" để bấm liên kết được). Tìm và chỉ ra các vấn đề: ' +
          'workflow đang TẮT (có nên bật không?); nhánh không bao giờ chạy hoặc điều kiện mâu thuẫn/không thể thoả; ' +
          'hành động trỏ tới bảng/cột đã bị đổi tên hoặc xoá; workflow không có hành động; ' +
          'hai workflow cùng ghi vào một cột (xung đột) hoặc trùng lặp; thiếu nhánh "Nếu không"; nguy cơ vòng lặp/kích hoạt dây chuyền vô tận. ' +
          'Với mỗi vấn đề: nêu rõ WF<số> nào, lỗi gì, mức độ (cao/vừa/thấp), và CÁCH SỬA cụ thể. Trình bày thành bảng dễ đọc (tên bảng/cột để trong «…»); nếu không có lỗi thì nói rõ.',
      };
    }
    // Suggest chip: propose new workflows the base should have.
    if (c.label.includes('Nên thêm') && convBases.length) {
      return {
        ...c,
        prompt:
          `Dựa trên các bảng/cột hiện có của base ${convBases[0].name} (app_token=${convBases[0].appToken}) và các workflow đang có ` +
          '(đọc bằng bitable_read_workflows + bitable_base_overview), đề xuất những automation/workflow NÊN THÊM để base hoàn thiện & tự động hơn. ' +
          'Gợi ý theo các nhóm: nhắc hạn/quá hạn, tự điền & tính toán, thông báo khi đổi trạng thái, kiểm tra tồn kho/ngưỡng, chống trùng, tổng hợp/rollup, đồng bộ giữa bảng. ' +
          'Với mỗi đề xuất nêu: mục đích, TRIGGER (bảng + điều kiện), HÀNH ĐỘNG, và mức ưu tiên (tên bảng/cột để trong «…»). ' +
          'Sau khi tôi chọn, bạn có thể TẠO trực tiếp bằng bitable_create_workflow (mặc định để TẮT cho tôi xem lại trước).',
      };
    }
    // Debug chip: dump the sniffed internal endpoints VERBATIM so we can locate the base's
    // node-tree list endpoint (needed to enumerate + name the flowchart Workflows).
    if (c.label.includes('gỡ lỗi') && convBases.length) {
      return {
        ...c,
        prompt:
          `Gọi bitable_read_workflows với app_token=${convBases[0].appToken} và debug=true. ` +
          'IN NGUYÊN VĂN toàn bộ kết quả JSON (đặc biệt captured_endpoints và captured_workflow_ids), ' +
          'KHÔNG tóm tắt, KHÔNG bỏ bớt dòng nào — tôi cần copy danh sách endpoint này.',
      };
    }
    return c;
  });
  const baseLabels = new Set(baseChips.map((b) => b.label));
  // A custom ask never shadows a built-in label → the combined labels stay unique (safe
  // React keys) and `isCustom` can trust the label to identify a deletable custom entry.
  const chips = [...baseChips, ...customAsks.filter((a) => !baseLabels.has(a.label))];
  const isCustom = (label: string) => !baseLabels.has(label) && customAsks.some((a) => a.label === label);

  // Show the toggle only when the chips actually overflow one line (re-measure on
  // chip-count, expand state, and window resize).
  useEffect(() => {
    const measure = () => {
      const el = chipsRef.current;
      if (!el) return;
      setChipsOverflow(el.scrollHeight > el.clientHeight + 2);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [chips.length, chipsExpanded, sessionId]);

  const addAsk = () => {
    const label = newLabel.trim();
    const prompt = newPrompt.trim();
    if (!label || !prompt) return message.warning(tr('chat.enterNameContent', 'Nhập tên + nội dung câu hỏi.'));
    if (chips.some((a) => a.label === label)) return message.warning(tr('chat.nameExists', 'Tên này đã tồn tại.'));
    persistAsks([...customAsks, { label, prompt }]);
    setNewLabel('');
    setNewPrompt('');
    message.success(tr('chat.quickAskAdded', 'Đã thêm hỏi nhanh.'));
  };
  const removeAsk = (label: string) => persistAsks(customAsks.filter((a) => a.label !== label));
  const addable = bases.filter((b) => !convBases.some((c) => c.appToken === b.appToken));

  // Group saved conversations by their PRIMARY Base for the sidebar categories.
  const NONE = '__none__';
  const groupMap = new Map<string, { name: string; sessions: LarkSessionMeta[] }>();
  for (const s of sessions) {
    const primary = s.bases?.[0];
    const key = primary?.appToken || NONE;
    const name = primary?.name || tr('chat.noBaseAttached', 'Chưa gắn base');
    if (!groupMap.has(key)) groupMap.set(key, { name, sessions: [] });
    groupMap.get(key)!.sessions.push(s);
  }
  const order: string[] = [];
  for (const b of bases) order.push(b.appToken);
  for (const k of groupMap.keys()) if (!order.includes(k)) order.push(k);
  const groups = order.filter((k) => groupMap.has(k)).map((k) => ({ key: k, ...groupMap.get(k)! }));

  const sidebarInner = (
    <>
      <Button
        type="primary"
        ghost
        block
        icon={<PlusOutlined />}
        disabled={busy}
        onClick={() => {
          setNavOpen(false);
          openNewChat();
        }}
      >
        {tr('chat.newConversation', 'Cuộc trò chuyện mới')}
      </Button>
      <div style={{ flex: 1, overflowY: 'auto', marginTop: 10 }}>
        {groups.length === 0 && (
          <Text type="secondary" style={{ fontSize: 12, paddingLeft: 4 }}>{tr('chat.noConversations', 'Chưa có cuộc trò chuyện')}</Text>
        )}
        {groups.map((g) => (
          <div key={g.key} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '2px 4px 4px', fontSize: 11, fontWeight: 700, color: V.textFaint, letterSpacing: 0.3 }}>
              <DatabaseOutlined style={{ fontSize: 11 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</span>
            </div>
            {g.sessions.map((s) => (
              <div
                key={s.id}
                onClick={() => {
                  setNavOpen(false);
                  void switchTo(s.id);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 8px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  background: s.id === sessionId ? 'rgba(108,92,231,0.10)' : 'transparent',
                }}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, fontWeight: s.id === sessionId ? 600 : 400, color: s.id === sessionId ? BRAND : V.textSub }}>
                    {s.title || tr('chat.conversation', 'Cuộc trò chuyện')}
                  </span>
                  {s.runner && s.runner !== 'claude' && (
                    <span style={{ fontSize: 10, color: V.textFaint }}>{s.runner}</span>
                  )}
                </span>
                <DeleteOutlined
                  style={{ color: V.textFaint, fontSize: 13, padding: 4 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    void deleteSession(s.id);
                  }}
                />
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );

  return (
    // Nền caro giống Trợ lý AI và phần còn lại của app — hai màn hội thoại phải cùng một chất liệu.
    <div className="tw-grid-bg" style={{ display: 'flex', flex: 1, minHeight: 0, height: '100%', backgroundColor: V.layer }}>
      {/* LEFT: conversation history, grouped by Base (like ChatGPT/Claude). Inline on a wide window;
          a Drawer on a phone / narrow web view so the chat keeps full width. */}
      {/* Ở chế độ nhiều tab thanh tab đã thay vai trò của danh sách này — để cả hai thì màn hình
          có hai bộ điều hướng nói cùng một chuyện, và bấm vào danh sách sẽ kéo tab sang hội thoại
          khác trong khi tiêu đề tab vẫn đứng yên. */}
      {!narrow && !hideSessionList && (
        <div style={{ width: 232, minWidth: 232, borderRight: `1px solid ${V.border}`, background: V.surface, display: 'flex', flexDirection: 'column', padding: '10px 8px 10px 10px' }}>
          {sidebarInner}
        </div>
      )}
      {narrow && !hideSessionList && (
        <Drawer
          open={navOpen}
          onClose={() => setNavOpen(false)}
          placement="left"
          width={Math.min(300, typeof window !== 'undefined' ? window.innerWidth - 48 : 300)}
          title={tr('chat.conversation', 'Cuộc trò chuyện')}
          styles={{ body: { padding: 12, display: 'flex', flexDirection: 'column' } }}
        >
          {sidebarInner}
        </Drawer>
      )}

      {/* RIGHT: the active conversation. */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', paddingLeft: narrow ? 0 : 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
          {narrow && (
            <Tooltip title={tr('chat.conversation', 'Cuộc trò chuyện')}>
              <Button icon={<MenuOutlined />} onClick={() => setNavOpen(true)} style={{ flex: '0 0 auto' }} />
            </Tooltip>
          )}
          <RunnerModelPicker
            storageKeyRunner="tw_lark_runner"
            storageKeyModel="tw_lark_runner_model"
            onChange={(id, m) => {
              if (id !== runnerId || m !== runnerModel) runnerSwitchedRef.current = true;
              setRunnerId(id);
              setRunnerModel(m || '');
              void runtime.larkSetAgentPrefs?.({ runner: id, model: m });
            }}
          />
          {/* Info: switching agents mid-conversation is safe (moved out of the row to keep it one line). */}
          <Tooltip title={tr('chat.switchAgentTip', 'Đổi agent giữa chừng: lịch sử chat giữ nguyên; ngữ cảnh CLI được nối lại từ transcript.')}>
            <InfoCircleOutlined style={{ color: V.textFaint, fontSize: 13, cursor: 'help', flex: '0 0 auto' }} />
          </Tooltip>
          {/* Nguồn chạy AI: CLI trên máy · khoá API riêng · gói Larkwave.
              Trước đây là một công tắc hai trạng thái, nên không có chỗ nào đặt lựa chọn thứ ba —
              mà lựa chọn thứ ba mới là cái không đòi hỏi người dùng cài gì hay dán khoá gì. */}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flex: '0 0 auto' }}>
            <Segmented
              size="small"
              value={runSource}
              onChange={(v) => pickRunSource(v as 'cli' | 'api' | 'maic')}
              options={[
                { value: 'cli', label: tr('chat.srcCli', 'CLI trên máy') },
                {
                  value: 'api',
                  label: apiKeyReady
                    ? tr('chat.srcApi', 'API riêng')
                    : tr('chat.srcApiNoKey', 'API riêng (thiếu key)'),
                },
                {
                  value: 'maic',
                  label: tr('chat.srcMaic', 'Gói Larkwave'),
                  // Máy chủ chưa có MAIC hoặc chưa đăng nhập ⇒ khoá, đừng bày ra rồi báo lỗi khi bấm.
                  disabled: !maicAvailable,
                },
              ]}
            />
            <Tooltip
              title={
                runSource === 'api' && !apiKeyReady
                  ? tr('chat.apiNoKeyTip', 'Đã chọn API riêng nhưng CHƯA có API key cho agent đang chọn — dán key ở phần cài đặt agent (bấm agent ở sidebar trái).')
                  : runSource === 'maic'
                    ? tr('chat.srcMaicTip', 'Chạy bằng gói token bạn đã mua trên website — KHÔNG cần cài CLI, KHÔNG cần khoá API riêng. Công cụ Lark vẫn chạy trên máy này bằng kết nối của bạn, nên App Secret không rời máy.')
                    : !maicAvailable
                      ? tr('chat.srcMaicOff', 'CLI trên máy = dùng Claude/Grok/… đã cài. API riêng = dán khoá của bạn. Gói Larkwave cần đăng nhập tài khoản mới dùng được.')
                      : tr('chat.runModeTip3', 'CLI trên máy = dùng bản CLI đã cài. API riêng = gọi thẳng nhà cung cấp bằng khoá của bạn. Gói Larkwave = chạy bằng token đã mua, không cần cài gì.')
              }
            >
              <InfoCircleOutlined style={{ color: V.textFaint, fontSize: 13, cursor: 'help' }} />
            </Tooltip>
          </span>
          {/* Right-aligned toolbar cluster. ONE auto-margin anchor for every control here —
              the share block used to own it, so anything added beside it drifted left
              whenever sharing was unavailable or no session was open. */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 6, rowGap: 6 }}>
          {/* View controls — collapse/expand every answer at once. */}
          {sessionId && answerIds().length > 0 && (
            <Dropdown
              trigger={['click']}
              menu={{
                items: [
                  { key: 'foldAll', icon: <ShrinkOutlined />, label: tr('chat.collapseAllAnswers', 'Thu gọn tất cả câu trả lời') },
                  { key: 'expandAll', icon: <ArrowsAltOutlined />, label: tr('chat.expandAll', 'Mở tất cả') },
                  { type: 'divider' },
                  {
                    key: 'auto',
                    label: `${fold.auto ? '✓ ' : ''}${tr('chat.autoCollapse', 'Tự thu gọn câu trả lời dài khi mở hội thoại')}`,
                  },
                ],
                onClick: ({ key }) => {
                  if (key === 'foldAll') setSessionFold(answerIds());
                  else if (key === 'expandAll') setSessionFold([]);
                  else if (key === 'auto') updateFold((s) => ({ ...s, auto: !s.auto }));
                },
              }}
            >
              <Tooltip title={tr('chat.collapseExpand', 'Thu gọn / mở rộng câu trả lời')}>
                <Button size="small" icon={<ShrinkOutlined />}>
                  {tr('chat.display', 'Hiển thị ▾')}
                </Button>
              </Tooltip>
            </Dropdown>
          )}
          {/* Export the whole conversation to PDF (renderer print → "Save as PDF"). */}
          {sessionId && items.some((it) => it.kind === 'msg') && (
            <Tooltip title={tr('chat.exportPdfTip', 'Xuất hội thoại này ra file PDF')}>
              <Button
                size="small"
                icon={<FilePdfOutlined />}
                onClick={() => {
                  const meta = sessions.find((s) => s.id === sessionId);
                  const msgs = items
                    .filter((it) => it.kind === 'msg')
                    .map((it) => {
                      const m = it as Extract<ChatItem, { kind: 'msg' }>;
                      return { role: m.role, text: m.text, agent: m.agent };
                    });
                  exportTranscriptPdf({
                    title: meta?.title || `${tr('chat.conversation', 'Cuộc trò chuyện')} · Lark × Agents`,
                    messages: msgs,
                    subtitle: 'Lark × Agents',
                  });
                }}
              >
                {tr('chat.exportPdf', 'Xuất PDF')}
              </Button>
            </Tooltip>
          )}
          {/* Notes rail toggle — only when the installed main process has the notes RPCs,
              so an older build shows no half-working button instead of an empty panel. */}
          {notesReady && sessionId && (
            <Tooltip title={tr('chat.notesTip', 'Ghi chú & việc cần làm của hội thoại này')}>
              <Badge count={openTodoN} size="small" offset={[-4, 2]}>
                <Button
                  size="small"
                  icon={<FileTextOutlined />}
                  type={notesOpen ? 'primary' : 'default'}
                  ghost={notesOpen}
                  onClick={() => setNotesOpen((o) => !o)}
                >
                  {tr('chat.notes', 'Ghi chú')}
                </Button>
              </Badge>
            </Tooltip>
          )}
          {errorItems.length > 0 && (
            <Tooltip title={tr('chat.errToolsTip', 'Các công cụ chạy lỗi trong hội thoại này')}>
              <Badge count={unresolvedErrN} size="small" offset={[-4, 2]}>
                <Button
                  size="small"
                  danger={unresolvedErrN > 0}
                  icon={<WarningOutlined />}
                  onClick={() => setErrModalOpen(true)}
                >
                  {tr('chat.errors', 'Lỗi')}
                </Button>
              </Badge>
            </Tooltip>
          )}
          {canShare && sessionId && (
            <div>
              {shareUrl ? (
                <Dropdown
                  trigger={['click']}
                  menu={{
                    items: [
                      { key: 'refresh', icon: <ReloadOutlined />, label: `${tr('chat.updateLatest', 'Cập nhật nội dung mới nhất')}${pendingShareN ? ` (${pendingShareN} ${tr('chat.newTurns', 'lượt mới')})` : ''}` },
                      { key: 'copy', icon: <LinkOutlined />, label: tr('chat.copyLink', 'Copy link') },
                      { key: 'open', icon: <GlobalOutlined />, label: tr('chat.openSharePage', 'Mở trang chia sẻ') },
                      { type: 'divider' },
                      { key: 'unshare', icon: <StopOutlined />, danger: true, label: tr('chat.unshareLabel', 'Bỏ chia sẻ') },
                    ],
                    onClick: ({ key }) => {
                      if (key === 'refresh') void doShare({ announce: true });
                      else if (key === 'copy') void copyLink(shareUrl);
                      else if (key === 'open') openExternal(shareUrl);
                      else if (key === 'unshare') void doUnshare();
                    },
                  }}
                >
                  <Tooltip title={pendingShareN ? `${pendingShareN} ${tr('chat.newTurnsUnsynced', 'lượt mới chưa đồng bộ — bấm "Cập nhật nội dung mới nhất"')}` : tr('chat.syncedWithLink', 'Đã đồng bộ với link chia sẻ')}>
                    <Badge count={pendingShareN} size="small" offset={[-4, 2]}>
                      <Button size="small" icon={<GlobalOutlined />} loading={shareBusy} type={pendingShareN ? 'primary' : 'default'} ghost={pendingShareN > 0}>
                        {tr('chat.sharedBtn', 'Đã chia sẻ ▾')}
                      </Button>
                    </Badge>
                  </Tooltip>
                </Dropdown>
              ) : (
                <Tooltip title={tr('chat.createPublicLink', 'Tạo link công khai để xem hội thoại này trên web')}>
                  <Button size="small" icon={<ShareAltOutlined />} loading={shareBusy} onClick={() => void doShare()}>
                    {tr('chat.share', 'Chia sẻ')}
                  </Button>
                </Tooltip>
              )}
            </div>
          )}
          </div>
        </div>
        {/* Applied-Bases bar — the conversation works across these Bases. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingBottom: 8, marginBottom: 4, borderBottom: `1px solid ${V.borderSub}`, flexWrap: 'wrap' }}>
          <DatabaseOutlined style={{ color: BRAND }} />
          <Text style={{ fontSize: 13, fontWeight: 600, color: V.textSub }}>{tr('chat.appliedBases', 'Base áp dụng:')}</Text>
          {convBases.length === 0 && (
            <Text type="secondary" style={{ fontSize: 12 }}>{tr('chat.noBaseWillAsk', 'chưa gắn — bot sẽ hỏi mỗi lần')}</Text>
          )}
          {convBases.map((b) => (
            <Tag
              key={b.appToken}
              color="purple"
              closable
              onClose={(e) => {
                e.preventDefault();
                removeBase(b.appToken);
              }}
              style={{ marginInlineEnd: 0 }}
            >
              {b.name}
            </Tag>
          ))}
          {addable.length > 0 && (
            <Dropdown
              trigger={['click']}
              menu={{ items: addable.map((b) => ({ key: b.appToken, label: b.name })), onClick: ({ key }) => addBase(key) }}
            >
              <Button size="small" type="dashed" icon={<PlusOutlined />}>
                {tr('chat.addBase', 'Thêm base')}
              </Button>
            </Dropdown>
          )}
          {/* Quick-add a brand-new Base (app_token/URL) without leaving the chat. */}
          {runtime.larkAddBase && (
            <Popover
              trigger="click"
              placement="bottomLeft"
              title={tr('chat.addNewBase', 'Thêm Base mới')}
              content={
                <div style={{ width: 260 }}>
                  <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 6 }}>
                    {tr('chat.pasteBaseAutoApply', 'Dán app_token hoặc URL Base — sẽ tự áp dụng cho cuộc trò chuyện này.')}
                  </Text>
                  {quickAddInput(quickAddToConversation)}
                </div>
              }
            >
              <Tooltip title={tr('chat.quickAddBaseTip', 'Thêm nhanh Base mới bằng app_token/URL')}>
                <Button size="small" type="text" icon={<PlusOutlined />} style={{ color: BRAND }}>
                  {tr('chat.newBase', 'Base mới')}
                </Button>
              </Tooltip>
            </Popover>
          )}
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '2px 2px 6px' }}>
          {items.length === 0 && (
            <div style={{ textAlign: 'center', color: V.textFaint, marginTop: 36 }}>
              <RobotOutlined style={{ fontSize: 28, color: BRAND }} />
              <div style={{ marginTop: 10, fontWeight: 600, color: V.textSub }}>
                {convBases.length
                  ? `${tr('chat.quickAskFor', 'Hỏi nhanh cho')} ${convBases.length} ${tr('chat.basesApplied', 'base đang áp dụng')}`
                  : tr('chat.larkQaIntro', 'Hỏi đáp & tuỳ chỉnh dữ liệu Lark bằng AI (Claude / Grok / …)')}
              </div>
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 460, margin: '12px auto 0' }}>
                {chips.map((c) => (
                  <div
                    key={c.label}
                    onClick={() => send(c.prompt, chipLabel(c))}
                    style={{ padding: '8px 12px', borderRadius: 10, border: `1px solid ${V.border}`, cursor: 'pointer', fontSize: 13, color: V.textSub, background: V.surface }}
                  >
                    {chipLabel(c)}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Có công cụ hỏng + bản cài đã cũ → nói thẳng, không chờ trợ lý kể lại. */}
            {items.map((it, i) =>
              it.kind === 'tool' ? (
                // Gộp các tool-call LIÊN TIẾP vào một nhóm thu gọn: chỉ render ở ĐẦU chuỗi; các tool
                // sau trong chuỗi trả null (đã nằm trong nhóm). ToolCallGroup tự bọc id `tw-tool-…`.
                i > 0 && items[i - 1].kind === 'tool' ? null : (
                  <ToolCallGroup
                    key={`tg-${it.id}`}
                    calls={(() => {
                      const run: ToolCallState[] = [];
                      for (let j = i; j < items.length && items[j].kind === 'tool'; j += 1) {
                        run.push((items[j] as Extract<ChatItem, { kind: 'tool' }>).call);
                      }
                      return run;
                    })()}
                  />
                )
              ) : it.kind === 'file' ? (
                <FileCard key={it.id} item={it} runtime={runtime} />
              ) : (
                <div key={it.id} id={`tw-msg-${it.id}`} style={{ display: 'flex', justifyContent: it.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: it.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: it.role === 'user' ? '82%' : '94%' }}>
                  <div
                    style={{
                      maxWidth: '100%',
                      padding: '8px 12px',
                      borderRadius: 12,
                      whiteSpace: it.role === 'user' ? 'pre-wrap' : 'normal',
                      wordBreak: 'break-word',
                      fontSize: 13.5,
                      lineHeight: 1.5,
                      background: it.role === 'user' ? BRAND : V.surface,
                      color: it.role === 'user' ? '#fff' : V.text,
                      border: it.role === 'user' ? 'none' : `1px solid ${V.border}`,
                    }}
                  >
                    {it.role === 'assistant' && it.agent && (
                      <Tag style={{ marginBottom: 6, fontSize: 10 }} color="purple">{it.agent}</Tag>
                    )}
                    {/* Lúc gửi / lúc trả lời xong + chờ bao lâu — cùng cách hiển thị với Trợ lý AI. */}
                    {(!!it.ts || !!it.durMs) && (
                      <div
                        style={{
                          fontSize: 10.5,
                          marginBottom: 4,
                          color: it.role === 'user' ? 'rgba(255,255,255,0.72)' : V.textFaint,
                          textAlign: it.role === 'user' ? 'right' : 'left',
                        }}
                      >
                        {clockTime(it.ts)}
                        {it.durMs ? ` · ${tr('chat.tookTime', 'mất {d}', { d: humanDuration(it.durMs) })}` : ''}
                      </div>
                    )}
                    {it.role === 'assistant' && foldedSet.has(it.id) ? (
                      <CollapsedAnswer
                        text={it.text}
                        images={it.images?.length}
                        summary={summaries[it.id]}
                        onExpand={() => toggleFold(it.id)}
                      />
                    ) : (
                      <>
                    {it.role === 'assistant' ? (
                      <>
                        {(() => {
                          // Lỗi xác thực/credit → thẻ các bước sửa, thay cho câu lỗi tiếng Anh khó hiểu.
                          const fix = diagnoseRunnerError(it.text);
                          if (fix) return <RunnerErrorCard kind={fix.kind} raw={it.text} tr={tr} />;
                          return <ChatMarkdown content={it.text} />;
                        })()}
                        <AnswerActionsRow
                          text={it.text}
                          // CHỈ ở tin cuối, và chỉ khi không có lượt nào đang chạy: nút ở một tin
                          // cũ là mời người dùng trả lời một câu hỏi đã qua từ lâu, và bấm vào đó
                          // sẽ gửi đi một câu lạc hẳn khỏi mạch chuyện.
                          show={i === items.length - 1 && !busy}
                          mode={mode}
                          tr={tr}
                          onPick={(t) => void send(t)}
                          onSwitchExecute={() => setMode('build')}
                        />
                      </>
                    ) : it.label ? (
                      // A preset "Hỏi nhanh": show the SHORT friendly title, not the long raw
                      // instruction prompt (which still went to the AI).
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ opacity: 0.85 }}>⚡</span>
                        {it.label}
                      </span>
                    ) : (
                      // Drop the "📎 name" marker line when we show the real image below.
                      // Còn lại đi qua renderUserText: chip "/lệnh" và từng TÊN TỆP vẫn bấm được
                      // sau khi gửi — trước đó chúng trở lại thành chữ chết ngay khi bấm Gửi.
                      <span>
                        {renderUserText(
                          it.images?.length ? it.text.replace(/\n*📎[^\n]*$/, '').trimEnd() : it.text,
                          slashCmds,
                          openSkillInfo,
                          openSentFile,
                        )}
                      </span>
                    )}
                    {it.images && it.images.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                        {it.images.map((img, ii) => (
                          <img
                            key={ii}
                            src={img.dataUrl}
                            alt={img.name}
                            style={{
                              maxWidth: '100%',
                              maxHeight: 240,
                              borderRadius: 8,
                              display: 'block',
                              border: it.role === 'user' ? '1px solid rgba(255,255,255,0.35)' : `1px solid ${V.border}`,
                            }}
                          />
                        ))}
                      </div>
                    )}
                      </>
                    )}
                  </div>
                  {/* Per-message actions: copy + edit-to-re-ask (train/steer the agent). */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, rowGap: 2, marginTop: 2 }}>
                    {it.role === 'assistant' && (
                      <Button
                        type="text"
                        size="small"
                        style={{ height: 22, padding: '0 6px', fontSize: 11.5, color: V.textFaint }}
                        icon={
                          foldedSet.has(it.id) ? (
                            <ArrowsAltOutlined style={{ fontSize: 12 }} />
                          ) : (
                            <ShrinkOutlined style={{ fontSize: 12 }} />
                          )
                        }
                        onClick={() => toggleFold(it.id)}
                      >
                        {foldedSet.has(it.id) ? tr('chat.expandMsg', 'Mở rộng') : tr('chat.collapseMsg', 'Thu gọn')}
                      </Button>
                    )}
                    {it.role === 'assistant' && notesReady && (
                      <Tooltip title={tr('chat.saveAsTodoTip', 'Lưu thành việc cần làm, có liên kết về tin nhắn này')}>
                        <Button
                          type="text"
                          size="small"
                          style={{ height: 22, padding: '0 6px', fontSize: 11.5, color: V.textFaint }}
                          icon={<FileTextOutlined style={{ fontSize: 12 }} />}
                          onClick={() => noteFromMessage(it.id, it.text)}
                        >
                          {tr('chat.notes', 'Ghi chú')}
                        </Button>
                      </Tooltip>
                    )}
                    <Button
                      type="text"
                      size="small"
                      style={{ height: 22, padding: '0 6px', fontSize: 11.5, color: V.textFaint }}
                      icon={<CopyOutlined style={{ fontSize: 12 }} />}
                      onClick={() => void copyText(it.text)}
                    >
                      {tr('chat.copy', 'Sao chép')}
                    </Button>
                    <Button
                      type="text"
                      size="small"
                      style={{ height: 22, padding: '0 6px', fontSize: 11.5, color: V.textFaint }}
                      icon={<EditOutlined style={{ fontSize: 12 }} />}
                      onClick={() => editInComposer(it.text)}
                    >
                      {it.role === 'user' ? tr('chat.editAskAgain', 'Sửa & hỏi lại') : tr('chat.editReask', 'Chỉnh sửa / hỏi lại')}
                    </Button>
                  </div>
                  </div>
                </div>
              ),
            )}
            {/* Typing indicator — while the agent works and hasn't started streaming text yet. */}
            {busy &&
              (() => {
                // `textFlowing` chứ KHÔNG phải "tin cuối có chữ": xem chú thích ở khai báo.
                return textFlowing ? null : (
                  <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                    <div style={{ padding: '9px 14px', borderRadius: 12, background: V.surface, border: `1px solid ${V.border}` }}>
                      <TypingDots />
                    </div>
                  </div>
                );
              })()}
          </div>
          <div ref={bottomRef} />
        </div>

        {/* Ngoài vùng cuộn, ngay trên ô soạn — xem AgentChat cho lý do. */}
        <UpdateHintCard visible={items.some((x) => x.kind === 'tool' && x.call.suspectAppBug === true)} />

        <div style={{ borderTop: `1px solid ${V.border}`, paddingTop: 10 }}>
          {/* Skills / quick utils — base-scoped when a Base is active. Wraps to multiple
              lines (no horizontal scroll); collapsed to one line with a Xem thêm / Thu gọn
              toggle when it overflows. */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, paddingBottom: 8 }}>
          <div
            ref={chipsRef}
            style={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 6,
              maxHeight: chipsExpanded ? undefined : 34,
              overflow: 'hidden',
            }}
          >
            <span style={{ flex: '0 0 auto', fontSize: 11, fontWeight: 700, color: V.textFaint }}>{tr('chat.quickAskLabel', '⚡ Hỏi nhanh')}</span>
            <Tooltip title={tr('chat.summaryTip', 'Tóm tắt nhanh những gì đã trao đổi trong cuộc hội thoại này')}>
              <button
                type="button"
                disabled={busy || items.length === 0}
                onClick={() => void send(SUMMARY_PROMPT, tr('chat.summaryLabel', '📊 Tóm tắt hội thoại'))}
                style={{
                  flex: '0 0 auto',
                  padding: '5px 11px',
                  borderRadius: 999,
                  border: `1px solid ${V.border}`,
                  background: busy || items.length === 0 ? V.layer : V.chipBg,
                  cursor: busy || items.length === 0 ? 'default' : 'pointer',
                  fontSize: 12,
                  fontWeight: 600,
                  color: V.chipText,
                  whiteSpace: 'nowrap',
                }}
              >
                {tr('chat.summaryChip', '📝 Tóm tắt hội thoại')}
              </button>
            </Tooltip>
            {chips.map((c) => (
              <span
                key={c.label}
                style={{
                  flex: '0 0 auto',
                  display: 'inline-flex',
                  alignItems: 'center',
                  borderRadius: 999,
                  border: `1px solid ${V.border}`,
                  background: V.surface,
                }}
              >
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void send(c.prompt, chipLabel(c))}
                  title={c.prompt}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    padding: '5px 3px 5px 11px',
                    cursor: busy ? 'default' : 'pointer',
                    fontSize: 12,
                    color: V.chipText,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {chipLabel(c).length > 38 ? chipLabel(c).slice(0, 38) + '…' : chipLabel(c)}
                </button>
                <Tooltip title={tr('chat.whatDoesThisDo', 'Xem mục này làm gì')}>
                  <InfoCircleOutlined
                    onClick={() => setGuideChip({ ...c, custom: isCustom(c.label) })}
                    style={{ padding: '0 9px 0 2px', color: V.textFaint, fontSize: 12, cursor: 'pointer' }}
                  />
                </Tooltip>
              </span>
            ))}
            <Tooltip title={tr('chat.addOwnQuickAsk', 'Thêm câu hỏi nhanh của riêng bạn')}>
              <button
                type="button"
                onClick={() => setManageOpen(true)}
                style={{
                  flex: '0 0 auto',
                  padding: '5px 11px',
                  borderRadius: 999,
                  border: `1px dashed ${V.border}`,
                  background: V.surface,
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 600,
                  color: BRAND,
                  whiteSpace: 'nowrap',
                }}
              >
                {tr('chat.addChip', '＋ Thêm')}
              </button>
            </Tooltip>
          </div>
          {(chipsOverflow || chipsExpanded) && (
            <Button
              size="small"
              type="text"
              onClick={() => setChipsExpanded((v) => !v)}
              style={{ flex: '0 0 auto', fontSize: 11, height: 26, padding: '0 8px', color: V.textSub }}
            >
              {chipsExpanded ? tr('chat.collapseChips', 'Thu gọn ▴') : tr('chat.showMore', 'Xem thêm ▾')}
            </Button>
          )}
          </div>
          {/* Per-chip guide: what this quick-ask does when clicked. */}
          <Modal
            open={!!guideChip}
            onCancel={() => setGuideChip(null)}
            title={guideChip ? chipLabel(guideChip) : ''}
            okText={tr('chat.runNow', 'Chạy ngay')}
            cancelText={tr('chat.close', 'Đóng')}
            okButtonProps={{ disabled: busy }}
            onOk={() => {
              if (guideChip) void send(guideChip.prompt, chipLabel(guideChip));
              setGuideChip(null);
            }}
          >
            <Text type="secondary" style={{ fontSize: 12.5 }}>
              {tr('chat.guideChipDesc', 'Khi bấm mục này, trợ lý sẽ nhận đúng yêu cầu sau (bạn không phải gõ lại):')}
            </Text>
            <div
              style={{
                marginTop: 8,
                padding: 12,
                background: V.surfaceAlt,
                border: `1px solid ${V.borderSub}`,
                borderRadius: 8,
                fontSize: 13,
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
                color: V.textSub,
              }}
            >
              {guideChip?.prompt}
            </div>
            {guideChip?.custom && (
              <Button
                danger
                size="small"
                type="text"
                icon={<DeleteOutlined />}
                style={{ marginTop: 10, paddingLeft: 0 }}
                onClick={() => {
                  if (guideChip) removeAsk(guideChip.label);
                  setGuideChip(null);
                }}
              >
                {tr('chat.deleteThisQuickAsk', 'Xoá hỏi nhanh này')}
              </Button>
            )}
          </Modal>
          {/* Manage + add custom quick-asks. */}
          <Modal open={manageOpen} onCancel={() => setManageOpen(false)} title={tr('chat.myQuickAsks', 'Hỏi nhanh của tôi')} footer={null}>
            <Text type="secondary" style={{ fontSize: 12.5 }}>
              {tr('chat.quickAskExplain', '"Hỏi nhanh" là các câu hỏi/yêu cầu bấm-một-cái để gửi ngay cho trợ lý — khỏi gõ lại. Thêm câu bạn hay dùng (vd "📈 Đánh giá dữ liệu tháng này") rồi nó sẽ xuất hiện ở thanh ⚡ Hỏi nhanh.')}
            </Text>
            {customAsks.length > 0 && (
              <div style={{ marginTop: 12 }}>
                {customAsks.map((a) => (
                  <div key={a.label} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: `1px solid ${V.borderSub}` }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: V.textSub }}>{a.label}</div>
                      <div style={{ fontSize: 12, color: V.textFaint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.prompt}</div>
                    </div>
                    <Button size="small" disabled={busy} onClick={() => { void send(a.prompt, a.label); setManageOpen(false); }}>{tr('chat.run', 'Chạy')}</Button>
                    <Button size="small" danger type="text" icon={<DeleteOutlined />} onClick={() => removeAsk(a.label)} />
                  </div>
                ))}
              </div>
            )}
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${V.border}` }}>
              <Text style={{ fontSize: 12.5, fontWeight: 600 }}>{tr('chat.addNewQuickAsk', 'Thêm hỏi nhanh mới')}</Text>
              <Input
                size="small"
                placeholder={tr('chat.shortNamePlaceholder', 'Tên ngắn (vd 📈 Đánh giá tháng)')}
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                maxLength={40}
                style={{ marginTop: 8 }}
              />
              <Input.TextArea
                placeholder={tr('chat.quickAskContentPlaceholder', 'Nội dung câu hỏi/yêu cầu gửi cho trợ lý…')}
                value={newPrompt}
                onChange={(e) => setNewPrompt(e.target.value)}
                autoSize={{ minRows: 2, maxRows: 5 }}
                maxLength={800}
                style={{ marginTop: 8 }}
              />
              <div style={{ marginTop: 8, textAlign: 'right' }}>
                <Button type="primary" size="small" icon={<PlusOutlined />} onClick={addAsk}>
                  {tr('chat.add', 'Thêm')}
                </Button>
              </div>
            </div>
          </Modal>
          {/* Context-limit warning — fires as the resumed conversation nears the model window. */}
          {ctx && ctx.percentUsed >= 0.8 && (
            <Alert
              type="warning"
              showIcon
              closable
              onClose={() => setCtx(null)}
              style={{ marginBottom: 8 }}
              message={`${tr('chat.convUsed', 'Cuộc trò chuyện đã dùng')} ~${Math.round(ctx.percentUsed * 100)}% ${tr('chat.agentContext', 'ngữ cảnh agent')}`}
              description={tr(
                'chat.contextWarnDesc',
                'Khi gần đầy, agent có thể quên phần đầu. App sẽ TỰ NÉN ngữ cảnh ngay trong cuộc trò chuyện này ' +
                  '(giữ nguyên lịch sử và Base) rồi làm tiếp — bạn không phải làm gì.',
              )}
              action={
                <Button size="small" type="primary" loading={handoffBusy} disabled={busy || handoffBusy} onClick={handoffSession}>
                  {tr('chat.newSessionKeepSummary', 'Tạo phiên mới (giữ tóm tắt)')}
                </Button>
              }
            />
          )}
          {/* Settings row: mode + auto-approve. */}
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10, rowGap: 8, marginBottom: 8 }}>
            <Segmented
              value={mode}
              onChange={(v) => setMode(v as LarkChatMode)}
              options={[
                { label: tr('chat.qa', 'Hỏi đáp'), value: 'ask' },
                { label: tr('chat.execute', 'Thực thi'), value: 'build' },
              ]}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {mode === 'ask'
                ? tr('chat.readOnlyData', 'Chỉ đọc dữ liệu')
                : autoApprove
                  ? tr('chat.writeAuto', 'Cho phép ghi — tự động, không hỏi')
                  : tr('chat.writeConfirm', 'Cho phép ghi (xác nhận từng thao tác)')}
            </Text>
            <span style={{ flex: 1 }} />
            {runtime.larkSetAutoApprove && (
              <Tooltip title={tr('chat.autoApproveTip', 'Bật: thao tác ghi trong chế độ Thực thi chạy luôn, KHÔNG hỏi xác nhận từng cái. Tắt: xác nhận từng thao tác (an toàn hơn).')}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Switch
                    size="small"
                    checked={autoApprove}
                    onChange={async (on) => {
                      setAutoApprove(on); // optimistic
                      try {
                        const s = await runtime.larkSetAutoApprove!(on);
                        setAutoApprove(!!s.autoApprove);
                      } catch {
                        setAutoApprove(!on);
                        message.error(tr('chat.savePrefFailed', 'Không lưu được tuỳ chọn.'));
                      }
                    }}
                  />
                  <Text type="secondary" style={{ fontSize: 12 }}>{tr('chat.autoApprove', 'Tự động duyệt')}</Text>
                </span>
              </Tooltip>
            )}
          </div>
          {attachments.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
              {attachments.map((a, i) => (
                <span
                  key={i}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 8, background: V.surfaceAlt, border: `1px solid ${V.borderSub}`, fontSize: 12, color: V.textSub, maxWidth: 220 }}
                >
                  <FileTextOutlined />
                  {/* Bấm vào TÊN để xem trước. Trước đây đính kèm chỉ là một cái tên — người dùng
                      không tự kiểm được mình vừa gửi đúng file chưa, và với .xlsx thì cũng không
                      biết trong đó có gì. Thành phần xem trước đã có sẵn, chỉ chưa được nối vào. */}
                  <span
                    role="button"
                    tabIndex={0}
                    title={tr('chat.previewAttachment', 'Xem trước')}
                    onClick={() =>
                      setPreviewAtt({
                        name: a.name,
                        mime: a.mime,
                        dataBase64: a.dataBase64,
                        isImage: (a.mime || '').startsWith('image/'),
                      })
                    }
                    style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer', textDecoration: 'underline dotted' }}
                  >
                    {a.name}
                  </span>
                  <CloseOutlined
                    style={{ cursor: 'pointer', fontSize: 10 }}
                    onClick={() => setAttachments((p) => p.filter((_, j) => j !== i))}
                  />
                </span>
              ))}
            </div>
          )}
          {blocked && (
            <Alert type="warning" showIcon message={blocked} style={{ marginBottom: 8, borderRadius: 10 }} />
          )}
          {blockedByOther && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 8,
                padding: '6px 10px',
                borderRadius: 8,
                background: V.surfaceAlt,
                border: `1px solid ${V.border}`,
                fontSize: 12.5,
                color: V.textSub,
              }}
            >
              <span style={{ flex: 1 }}>
                {tr('chat.waitingAiAt', '⏳ Đang chờ AI trả lời ở')}{' '}
                <b>{agentOwner?.kind === 'relay' ? tr('chat.turnFromPhone', 'một lượt từ điện thoại') : `"${agentOwner?.label || tr('chat.otherTab', 'tab khác')}"`}</b>{' '}
                {tr('chat.composeMeanwhile', '— bạn có thể soạn trước, nút gửi sẽ mở lại khi xong.')}
              </span>
              <Button size="small" type="link" onClick={() => void runtime.agentUnlock?.()}>
                {tr('chat.unlockIfStuck', 'Mở khoá nếu treo')}
              </Button>
            </div>
          )}
          {/* position:relative — the "/" popup opens upward, anchored to this row. */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', position: 'relative' }}>
            {slash.menu}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              aria-label={tr('chat.attachDocsImages', 'Đính kèm tài liệu hoặc ảnh')}
              accept="image/*,.pdf,.txt,.md,.csv,.json,.docx,.doc,.xlsx,.pptx"
              style={{ display: 'none' }}
              onChange={(e) => {
                if (e.target.files?.length) void readFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <Tooltip title={tr('chat.attachForClaude', 'Đính kèm tài liệu / ảnh để Claude đọc + phân tích')}>
              <Button icon={<PaperClipOutlined />} disabled={busy} onClick={() => fileInputRef.current?.click()} />
            </Tooltip>
            <Input.TextArea
              ref={composerRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onPaste={onPaste}
              onFocus={() => {
                // A skill created since mount should show up without a reload.
                if (!slashRefreshed.current) { slashRefreshed.current = true; void loadSlashCmds(); }
              }}
              placeholder={blocked ? tr('chat.computerOffline', 'Máy tính chưa online…') : tr('chat.larkComposerPlaceholder', 'Hỏi, hoặc đính kèm/dán ảnh + tài liệu để Claude phân tích… (tối đa 12 file)')}
              autoSize={{ minRows: 1, maxRows: 4 }}
              onKeyDown={(e) => {
                if (slash.handleKeyDown(e)) return; // the "/" menu owns ↑↓ / Enter / Tab / Esc while open
                if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return; // IME candidate commit
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              disabled={busy || !!blocked}
            />
            {busy ? (
              <Tooltip title={tr('chat.stopTurn', 'Dừng lượt AI đang chạy')}>
                <Button
                  danger
                  icon={<StopOutlined />}
                  // Dừng ĐÚNG lượt của tab này. Không truyền khoá là mở khoá khẩn cấp TOÀN BỘ —
                  // ở chế độ nhiều tab thì đó là giết luôn hội thoại của người khác đang chạy.
                  onClick={() => void runtime.agentUnlock?.(sessionId ? `lark:${sessionId}` : undefined)}
                >
                  {tr('chat.stop', 'Dừng')}
                </Button>
              </Tooltip>
            ) : (
              <Button type="primary" icon={<SendOutlined />} disabled={blockedByOther || !!blocked} onClick={() => send()}>
                {tr('chat.send', 'Gửi')}
              </Button>
            )}
          </div>
        </div>
        <Modal
          open={errModalOpen}
          onCancel={() => setErrModalOpen(false)}
          footer={null}
          width={620}
          title={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <WarningOutlined style={{ color: '#EF4444' }} />
              {tr('chat.toolErrors', 'Lỗi công cụ')} ({unresolvedErrN} {tr('chat.unresolved', 'chưa xử lý')} / {errorItems.length} {tr('chat.total', 'tổng')})
            </span>
          }
        >
          {errorItems.length === 0 ? (
            <div style={{ color: V.textSub, padding: '8px 0' }}>{tr('chat.noErrors', 'Không có lỗi nào.')}</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '60vh', overflowY: 'auto' }}>
              {errorItems.map((it) => {
                const done = resolvedErr.has(it.call.callId);
                return (
                  <div
                    key={it.call.callId}
                    style={{
                      border: `1px solid ${V.border}`,
                      borderRadius: 10,
                      padding: '8px 10px',
                      background: done ? V.surfaceAlt : `rgba(239,68,68,0.06)`,
                      opacity: done ? 0.7 : 1,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                      <span style={{ fontFamily: 'monospace', fontWeight: 600, color: done ? V.textSub : '#EF4444' }}>
                        {it.call.name}
                      </span>
                      <Tag color={done ? 'success' : 'error'} style={{ marginInlineEnd: 0 }}>
                        {done ? tr('chat.resolved', 'đã xử lý') : tr('chat.unresolved', 'chưa xử lý')}
                      </Tag>
                    </div>
                    <div
                      style={{
                        fontSize: 12.5,
                        color: V.textSub,
                        wordBreak: 'break-word',
                        textDecoration: done ? 'line-through' : 'none',
                      }}
                    >
                      {it.call.error || tr('chat.unknownError', 'Lỗi không rõ')}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <Button
                        size="small"
                        type={done ? 'default' : 'primary'}
                        ghost={!done}
                        icon={done ? <ReloadOutlined /> : <CheckCircleFilled />}
                        onClick={() => toggleResolved(it.call.callId)}
                      >
                        {done ? tr('chat.markUnresolved', 'Đánh dấu chưa xử lý') : tr('chat.markResolved', 'Đánh dấu đã xử lý')}
                      </Button>
                      <Button
                        size="small"
                        icon={<SearchOutlined />}
                        onClick={() => {
                          setErrModalOpen(false);
                          setTimeout(() => jumpToTool(it.call.callId), 180);
                        }}
                      >
                        {tr('chat.viewInChat', 'Xem trong hội thoại')}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Modal>
        {/* Notes rail — third flex child of the chat row. minHeight:0 is required: the
            chat sits in a constrained flex chain and the note list scrolls itself. */}
        {notesOpen && notesReady && !narrow && (
          <div
            style={{
              flex: '0 0 300px',
              width: 300,
              minWidth: 300,
              borderLeft: `1px solid ${V.border}`,
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
              paddingLeft: 10,
              marginLeft: 10,
            }}
          >
            <NotesPanel
              doc={notesDoc}
              onChange={saveNotes}
              onJump={jumpToMessage}
              onClose={() => setNotesOpen(false)}
            />
          </div>
        )}
      </div>
      {/* Notes as a right Drawer on a phone / narrow web view (the inline rail would break the layout). */}
      {notesOpen && notesReady && narrow && (
        <Drawer
          open
          placement="right"
          onClose={() => setNotesOpen(false)}
          width={Math.min(360, typeof window !== 'undefined' ? window.innerWidth - 32 : 360)}
          title={tr('chat.notes', 'Ghi chú')}
          styles={{ body: { padding: 12, display: 'flex', flexDirection: 'column' } }}
        >
          <NotesPanel
            doc={notesDoc}
            onChange={saveNotes}
            onJump={(id) => { setNotesOpen(false); jumpToMessage(id); }}
            onClose={() => setNotesOpen(false)}
          />
        </Drawer>
      )}

      <ConfirmToolModal pending={pendings[0] ?? null} onDecide={decide} />
      <AskUserModal pending={asks[0] ?? null} onAnswer={answer} />

      {/* New conversation → pick which Base(s) it applies to. */}
      <Modal
        open={picker.open}
        title={tr('chat.whichBaseForConv', 'Áp dụng base nào cho cuộc trò chuyện này?')}
        okText={tr('chat.start', 'Bắt đầu')}
        cancelText={tr('chat.cancel', 'Huỷ')}
        onOk={() => { setPickerQuery(''); void startChat(picker.sel); }}
        onCancel={() => { setPickerQuery(''); setPicker({ open: false, sel: [] }); }}
      >
        <Text type="secondary" style={{ fontSize: 13 }}>
          {tr('chat.pickBasesDesc', 'Chọn 1 hoặc nhiều Base để bot làm việc trong cuộc trò chuyện này (có thể thêm/bớt sau). Để trống = không gắn base.')}
        </Text>
        {bases.length === 0 ? (
          <div style={{ marginTop: 12 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {tr('chat.noBasePasteBelow', 'Chưa có Base nào — dán app_token hoặc URL Base bên dưới để thêm nhanh:')}
            </Text>
          </div>
        ) : (
          <>
            {bases.length > 6 && (
              <Input
                size="small"
                allowClear
                prefix={<SearchOutlined style={{ color: V.textFaint }} />}
                placeholder={tr('chat.searchBaseByName', 'Tìm base theo tên…')}
                value={pickerQuery}
                onChange={(e) => setPickerQuery(e.target.value)}
                style={{ marginTop: 12 }}
              />
            )}
            <Checkbox.Group
              style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12, maxHeight: 320, overflowY: 'auto' }}
              value={picker.sel}
              onChange={(v) => setPicker((p) => ({ ...p, sel: v as string[] }))}
              options={bases
                .filter((b) => b.name.toLowerCase().includes(pickerQuery.trim().toLowerCase()))
                .map((b) => ({ label: b.name, value: b.appToken }))}
            />
            {pickerQuery.trim() &&
              !bases.some((b) => b.name.toLowerCase().includes(pickerQuery.trim().toLowerCase())) && (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {tr('chat.noBaseMatch', 'Không tìm thấy base khớp')} “{pickerQuery.trim()}”.
                </Text>
              )}
          </>
        )}
        {/* Quick-add a Base right here instead of going to Settings. */}
        {runtime.larkAddBase && (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${V.borderSub}` }}>
            <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 6 }}>
              {tr('chat.quickAddBaseForConv', 'Thêm nhanh Base mới (tự chọn cho cuộc trò chuyện này):')}
            </Text>
            {quickAddInput(quickAddToPicker)}
          </div>
        )}
      </Modal>

      {/* Xem trước file đính kèm — mở khi bấm vào tên file (cả trong ô soạn lẫn tin đã gửi). */}
      <AttachmentPreview att={previewAtt} open={!!previewAtt} onClose={() => setPreviewAtt(null)} />

      {/* Nội dung skill khi bấm chip "/lệnh" — giống hệt Trợ lý AI bên web. */}
      <Modal
        open={!!skillInfo}
        onCancel={() => setSkillInfo(null)}
        footer={null}
        width={760}
        title={skillInfo ? `/${skillInfo.item.command} — ${skillInfo.item.name}` : ''}
        styles={{ body: { maxHeight: '64vh', overflow: 'auto' } }}
      >
        {skillInfo && (
          <>
            {skillInfo.item.enabled === false && (
              <Alert
                type="warning"
                showIcon
                style={{ marginBottom: 10, borderRadius: 10 }}
                message={tr('chat.skillOffNote', 'Skill này đang TẮT, nhưng gõ lệnh vẫn áp dụng nó cho lượt đó.')}
              />
            )}
            {!!skillInfo.item.description && (
              <div style={{ fontSize: 13.5, color: V.textSub, marginBottom: 12 }}>{skillInfo.item.description}</div>
            )}
            {skillInfo.loading ? (
              <LoadingOutlined style={{ color: BRAND }} />
            ) : skillInfo.body ? (
              <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', margin: 0, fontSize: 12.5, lineHeight: 1.6, color: V.text, background: V.surfaceMuted, border: `1px solid ${V.border}`, borderRadius: 10, padding: 12 }}>
                {skillInfo.body}
              </pre>
            ) : (
              <div style={{ color: V.textFaint, fontSize: 13 }}>
                {tr('chat.skillBodyUnavailable', 'Không đọc được nội dung skill này.')}
              </div>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}
