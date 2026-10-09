'use client';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Alert, App as AntApp, Button, Drawer, Dropdown, Empty, Grid, Image, Input, Modal, Segmented, Select, Skeleton, Tooltip, type MenuProps } from 'antd';
import {
  SendOutlined,
  PaperClipOutlined,
  PlusOutlined,
  ExperimentOutlined,
  TeamOutlined,
  LoadingOutlined,
  StopOutlined,
  CommentOutlined,
  CloseOutlined,
  FileOutlined,
  ShareAltOutlined,
  DeleteOutlined,
  EditOutlined,
  MoreOutlined,
  SearchOutlined,
  FolderOutlined,
  FolderOpenOutlined,
  PushpinOutlined,
  PushpinFilled,
  DownOutlined,
  RightOutlined,
  DownloadOutlined,
  FolderAddOutlined,
  FilePdfOutlined,
  FileExcelOutlined,
  FileWordOutlined,
  FilePptOutlined,
  CopyOutlined,
  ReloadOutlined,
  SyncOutlined,
  MenuOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import type { LarkChatEvent } from '@larkwave/core';
import { useRuntime } from '../../RuntimeProvider';
import { useAccountAuth } from '../../account/auth';
import { useAgentBusy } from '../../useAgentBusy';
import { desktopRunnerPrefs } from '../../runnerPrefs';
import { accountApi, type LarkGrant, type ChatIndex } from '../../account/api';
import { V, BRAND, BRAND_GRADIENT, WARN, ERR, OK, CARD_SHADOW } from '../../theme';
import { exportRenderedPdf } from '../../exportPdf';
import { ChatMarkdown } from '../ChatMarkdown';
import { diagnoseRunnerError, RunnerErrorCard, classifyRunnerError, reportRunnerError } from '../runnerError';
import { UpdateHintCard } from '../UpdateHintCard';
import { RunnerModelPicker } from '../RunnerModelPicker';
import { useSlashCommands, skillsToCommandItems, type SlashCommandItem } from '../SlashCommandMenu';
import { renderUserText } from '../chat/renderUserText';
import { AttachmentPreview, type PreviewableAttachment } from '../AttachmentPreview';
import { clockTime, humanDuration } from '../../time';
import { parseAskedFields } from './askedForm';
import { AgentGrantsPanel } from './AgentGrantsPanel';
import { FEATURE_FRIENDS } from '../../features';
import { UserAvatar } from '../../account/UserAvatar';
import { useI18n } from '../../i18n';

const ownerName = (g?: LarkGrant | null) => g?.owner?.name || g?.owner?.email || 'bạn bè';

type Att = { name: string; dataBase64: string; isImage: boolean; mime: string; libId?: string };
type Img = { name: string; dataUrl: string };
type Item =
  | {
      kind: 'msg';
      id: string;
      role: 'user' | 'assistant';
      text: string;
      images?: Img[];
      /** Tệp TRỢ LÝ tạo ra trong lượt này (hợp đồng .xlsx, báo cáo .pdf…) — bấm để tải về. */
      /** Tệp trợ lý tạo ra. Hai dạng: `uploadId` = nằm trên máy chủ (đường web/MAIC),
       *  `path` = nằm trên chính máy này (đường desktop). Một thẻ hiển thị cho cả hai. */
      made?: { uploadId?: string; path?: string; name: string; size: number; mime: string }[];
      /** When this message appeared (epoch ms). Absent on messages saved before this existed. */
      ts?: number;
      /** Assistant only: how long the turn took, filled in when it finishes. */
      durMs?: number;
    }
  // Cùng tập trạng thái với ToolCallState của LarkChat — trước đây thiếu 'denied', nên một thao
  // tác bị người dùng TỪ CHỐI phải ép thành 'error' và hiện đỏ ở màn này trong khi màn Lark hiện
  // xám. Hai màn nói khác nhau về cùng một sự việc.
  | { kind: 'tool'; id: string; name: string; status: 'pending' | 'ok' | 'error' | 'denied'; summary?: string; error?: string; suspectAppBug?: boolean; tier?: 'error' | 'blocked' | 'noise' };
/** One saved conversation (ChatGPT-style history). Bodies are stored separately by id. */
type ConvMeta = { id: string; title: string; sessionId: string; updatedAt: number; projectId?: string; pinned?: boolean };
/** A project = a named folder grouping conversations (ChatGPT "Projects"). */
type Project = { id: string; name: string };
/** A file the user uploaded, kept in the Library (IndexedDB, so images don't blow the quota). */
type LibItem = { id: string; uid: string; name: string; mime: string; isImage: boolean; dataBase64: string; convId: string; ts: number };

/** Biểu tượng theo đuôi tệp — đủ để phân biệt hợp đồng .xlsx với báo cáo .pdf trong một liếc mắt. */
function fileEmoji(name: string): string {
  const e = (name.split('.').pop() || '').toLowerCase();
  if (e === 'pdf') return '📕';
  if (e === 'xlsx' || e === 'xls' || e === 'csv') return '📊';
  if (e === 'docx' || e === 'doc') return '📄';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(e)) return '🖼️';
  if (['zip', 'rar', '7z'].includes(e)) return '🗜️';
  return '📎';
}

const rid = () => `${Date.now().toString(36)}-${Math.floor(performance.now() * 1000).toString(36)}`;

/** Heuristic: does this ask for a real PICTURE (→ OpenAI image gen) rather than a
 *  coding/diagram answer? "vẽ sơ đồ" (diagram) stays with the LLM; "tạo hình/ảnh/logo…" → image. */
function isImageRequest(s: string): boolean {
  const t = (s || '').slice(0, 160).toLowerCase();
  return /(^|\s)(tạo|vẽ|thiết kế|generate|create|draw|make|design)\b[^\n]{0,50}\b(hình ảnh|hình|ảnh|image|picture|photo|logo|poster|icon|avatar|banner|tranh|wallpaper|sticker|artwork|illustration)\b/.test(t);
}
// The CLI `--resume` REQUIRES a UUID — a non-UUID id errors out. Conversation/session ids are UUIDs.
const uuid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });

// ── Conversation history persistence (renderer localStorage) ─────────────────
// An INDEX (list of {id,title,sessionId,updatedAt}) + one BODY (Item[]) per conversation, so a
// long history never bloats a single blob. Images are stripped from persisted bodies (quota).
const IDX_KEY = (uid: string) => `tw_agentchat_index_${uid}`;
const BODY_KEY = (uid: string, id: string) => `tw_agentchat_body_${uid}_${id}`;
const loadIndex = (uid: string): ConvMeta[] => {
  try { return JSON.parse(localStorage.getItem(IDX_KEY(uid)) || '[]'); } catch { return []; }
};
const saveIndex = (uid: string, list: ConvMeta[]) => {
  try { localStorage.setItem(IDX_KEY(uid), JSON.stringify(list.slice(0, 80))); } catch { /* quota */ }
};
const loadBody = (uid: string, id: string): Item[] => {
  try { return JSON.parse(localStorage.getItem(BODY_KEY(uid, id)) || '[]'); } catch { return []; }
};
const stripImages = (items: Item[]): Item[] =>
  // Drop only heavy inline data: URLs (localStorage quota); KEEP small http(s) image URLs
  // (e.g. AI-generated pictures stored on the server) so they survive a reload.
  items.map((it) => {
    if (it.kind !== 'msg' || !it.images) return it;
    const kept = it.images.filter((im) => im.dataUrl && !im.dataUrl.startsWith('data:'));
    return { ...it, images: kept.length ? kept : undefined };
  });
const saveBody = (uid: string, id: string, items: Item[]) => {
  // A big HTML/SVG artifact body can overflow the localStorage quota. Rather than silently drop it
  // (which lost the artifact on refresh), evict OTHER conversations' bodies (they're on the server
  // too and re-hydrate on open) oldest-first, then retry — so the ACTIVE conversation always persists.
  const payload = JSON.stringify(stripImages(items).slice(-240));
  try { localStorage.setItem(BODY_KEY(uid, id), payload); return; } catch { /* quota — prune + retry */ }
  try {
    const others = loadIndex(uid).map((c) => c.id).filter((cid) => cid !== id);
    for (let k = others.length - 1; k >= 0; k--) {
      try { localStorage.removeItem(BODY_KEY(uid, others[k])); } catch { /* ignore */ }
      try { localStorage.setItem(BODY_KEY(uid, id), payload); return; } catch { /* keep evicting */ }
    }
  } catch { /* give up — the server copy is the backstop */ }
};
const delBody = (uid: string, id: string) => { try { localStorage.removeItem(BODY_KEY(uid, id)); } catch { /* ignore */ } };

const PROJ_KEY = (uid: string) => `tw_agentchat_projects_${uid}`;
const loadProjects = (uid: string): Project[] => {
  try { return JSON.parse(localStorage.getItem(PROJ_KEY(uid)) || '[]'); } catch { return []; }
};
const saveProjects = (uid: string, list: Project[]) => {
  try { localStorage.setItem(PROJ_KEY(uid), JSON.stringify(list.slice(0, 60))); } catch { /* quota */ }
};

// ── Library (uploaded files) — IndexedDB so large images don't hit the localStorage quota ────
const LIB_DB = 'tw_agentchat';
const LIB_STORE = 'library';
const LIB_CAP = 120; // keep the newest N uploaded files (pruned when the Library is opened)
/**
 * Bản sao cục bộ cũng hết hạn sau 30 ngày, ĐÚNG BẰNG hạn của máy chủ.
 *
 * Nếu chỉ máy chủ xoá còn IndexedDB thì giữ mãi, ngay trên máy đã tải tệp lên người dùng vẫn xem
 * lại được sau một năm — tức lời hứa "lưu 30 ngày" là sai ở đúng nơi họ hay kiểm tra nhất. Cùng
 * một luật ở cả hai phía thì thông báo "đã hết hạn" mới là sự thật.
 */
const LIB_TTL_MS = 30 * 24 * 60 * 60 * 1000;
let _libDb: Promise<IDBDatabase | null> | null = null;
function libOpen(): Promise<IDBDatabase | null> {
  if (_libDb) return _libDb; // reuse one connection per session (don't leak a new DB per op)
  _libDb = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') { _libDb = null; return resolve(null); }
      const req = indexedDB.open(LIB_DB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(LIB_STORE)) {
          const os = db.createObjectStore(LIB_STORE, { keyPath: 'id' });
          os.createIndex('uid', 'uid', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { _libDb = null; resolve(null); }; // allow a retry next call
    } catch { _libDb = null; resolve(null); }
  });
  return _libDb;
}
async function libPut(rec: LibItem): Promise<void> {
  const db = await libOpen();
  if (!db) return;
  try {
    const tx = db.transaction(LIB_STORE, 'readwrite');
    tx.onerror = () => { /* quota/abort — fail quietly, the Library just won't gain this file */ };
    tx.objectStore(LIB_STORE).put(rec);
  } catch { /* ignore */ }
}
async function libList(uid: string): Promise<LibItem[]> {
  const db = await libOpen();
  if (!db) return [];
  const all = await new Promise<LibItem[]>((resolve) => {
    try {
      const req = db.transaction(LIB_STORE, 'readonly').objectStore(LIB_STORE).index('uid').getAll(uid);
      req.onsuccess = () => resolve(((req.result as LibItem[]) || []).sort((a, b) => b.ts - a.ts));
      req.onerror = () => resolve([]);
    } catch { resolve([]); }
  });
  const cutoff = Date.now() - LIB_TTL_MS;
  const live = all.filter((r) => r.ts >= cutoff);
  // Dọn bản quá hạn ngay khi phát hiện, để dung lượng trình duyệt không phình theo thời gian.
  all.filter((r) => r.ts < cutoff).forEach((r) => void libDel(r.id));
  return live;
}

/** Bản cục bộ của một tệp còn hạn không? Dùng để nói "đã hết hạn" thay vì "không tìm thấy". */
async function libFind(uid: string, name: string): Promise<{ item: LibItem | null; expired: boolean }> {
  const db = await libOpen();
  if (!db) return { item: null, expired: false };
  const all = await new Promise<LibItem[]>((resolve) => {
    try {
      const req = db.transaction(LIB_STORE, 'readonly').objectStore(LIB_STORE).index('uid').getAll(uid);
      req.onsuccess = () => resolve(((req.result as LibItem[]) || []).sort((a, b) => b.ts - a.ts));
      req.onerror = () => resolve([]);
    } catch { resolve([]); }
  });
  const hits = all.filter((r) => r.name === name);
  if (!hits.length) return { item: null, expired: false };
  const cutoff = Date.now() - LIB_TTL_MS;
  const live = hits.find((r) => r.ts >= cutoff);
  // Có bản ghi nhưng đều quá hạn → nói rõ là HẾT HẠN, khác hẳn với chưa từng có.
  return live ? { item: live, expired: false } : { item: null, expired: true };
}
async function libDel(id: string): Promise<void> {
  const db = await libOpen();
  if (!db) return;
  try { db.transaction(LIB_STORE, 'readwrite').objectStore(LIB_STORE).delete(id); } catch { /* ignore */ }
}

// Classify a Library file for the type filter tabs + the type-specific icon.
type Kind = 'image' | 'doc' | 'sheet' | 'slide' | 'pdf' | 'other';
const KIND_ORDER: Kind[] = ['image', 'doc', 'sheet', 'slide', 'pdf', 'other'];
const KIND_LABEL: Record<Kind, string> = { image: 'Ảnh', doc: 'Tài liệu', sheet: 'Bảng tính', slide: 'Trình chiếu', pdf: 'PDF', other: 'Khác' };
const KIND_COLOR: Record<Kind, string> = { image: BRAND, doc: '#4FB6FF', sheet: '#16B98D', slide: '#F59E0B', pdf: '#EF4444', other: '#9AA3B5' };
const fileKind = (it: LibItem): Kind => {
  if (it.isImage) return 'image';
  const e = (it.name.split('.').pop() || '').toLowerCase();
  const m = (it.mime || '').toLowerCase();
  if (e === 'pdf' || m.includes('pdf')) return 'pdf';
  if (['xlsx', 'xls', 'csv'].includes(e) || m.includes('sheet') || m.includes('excel') || m.includes('csv')) return 'sheet';
  if (['pptx', 'ppt'].includes(e) || m.includes('presentation') || m.includes('powerpoint')) return 'slide';
  if (['doc', 'docx', 'txt', 'md', 'rtf'].includes(e) || m.includes('word') || m.startsWith('text/')) return 'doc';
  return 'other';
};
const kindIcon = (k: Kind, size = 40) => {
  const style = { fontSize: size, color: KIND_COLOR[k] };
  if (k === 'pdf') return <FilePdfOutlined style={style} />;
  if (k === 'sheet') return <FileExcelOutlined style={style} />;
  if (k === 'slide') return <FilePptOutlined style={style} />;
  if (k === 'doc') return <FileWordOutlined style={style} />;
  return <FileOutlined style={style} />;
};

const deriveTitle = (items: Item[]): string => {
  const firstUser = items.find((it) => it.kind === 'msg' && it.role === 'user') as Extract<Item, { kind: 'msg' }> | undefined;
  const t = (firstUser?.text || '').split('\n')[0].replace(/^📎.*/, '').trim();
  return t ? t.slice(0, 44) : '';
};

/** Group the conversation index into ChatGPT-style date buckets. */
const groupConvs = (list: ConvMeta[]): { key: string; label: string; items: ConvMeta[] }[] => {
  const now = Date.now();
  const day = 86_400_000;
  const t0 = new Date(); t0.setHours(0, 0, 0, 0);
  const today = t0.getTime();
  const buckets: { key: string; label: string; items: ConvMeta[] }[] = [
    { key: 'today', label: 'Hôm nay', items: [] },
    { key: 'yesterday', label: 'Hôm qua', items: [] },
    { key: 'last7', label: '7 ngày qua', items: [] },
    { key: 'older', label: 'Trước đó', items: [] },
  ];
  for (const c of list) {
    if (c.updatedAt >= today) buckets[0].items.push(c);
    else if (c.updatedAt >= today - day) buckets[1].items.push(c);
    else if (c.updatedAt >= now - 7 * day) buckets[2].items.push(c);
    else buckets[3].items.push(c);
  }
  return buckets.filter((b) => b.items.length);
};

// Starter prompts shown on the empty state (local assistant only). Clicking one sends it.
const SUGGESTIONS: { k: string; icon: string; title: string; prompt: string }[] = [
  { k: 'email', icon: '✍️', title: 'Soạn email chuyên nghiệp', prompt: 'Viết giúp tôi một email chuyên nghiệp, lịch sự để xin gia hạn thanh toán thêm 7 ngày.' },
  { k: 'explain', icon: '💡', title: 'Giải thích dễ hiểu', prompt: 'Giải thích khái niệm "dòng tiền" cho người mới bắt đầu, kèm một ví dụ thực tế.' },
  { k: 'plan', icon: '🧭', title: 'Lập kế hoạch 30 ngày', prompt: 'Lập kế hoạch 30 ngày chi tiết để ra mắt một sản phẩm mới, chia theo tuần.' },
  { k: 'trend', icon: '🔎', title: 'Tra cứu xu hướng AI', prompt: 'Tìm và tóm tắt các xu hướng công nghệ AI nổi bật gần đây.' },
];

// Coral spark (claude.ai-style 8-ray sunburst) for the new-chat hero.
const SPARK_COLOR = '#D97757';
function Spark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" aria-hidden="true" style={{ display: 'inline-block', flexShrink: 0 }}>
      {Array.from({ length: 8 }).map((_, i) => {
        const a = (i * Math.PI) / 4;
        return (
          <line
            key={i}
            x1={50 + 15 * Math.cos(a)}
            y1={50 + 15 * Math.sin(a)}
            x2={50 + 46 * Math.cos(a)}
            y2={50 + 46 * Math.sin(a)}
            stroke={SPARK_COLOR}
            strokeWidth={11}
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}

/**
 * "Trợ lý AI" — a general, capable ChatGPT/Claude-style assistant (NOT tied to Lark). Reuses the
 * desktop chat ENGINE via runtime.larkChat({ scope: 'general' }). ChatGPT-style layout: a left
 * conversation-history sidebar (saved locally) + the chat on the right. A friend-shared assistant
 * (source select) runs read-only on the owner's machine and is ephemeral (not saved to history).
 */

/**
 * Render a user message, turning a leading "/lệnh" into a clickable chip.
 *
 * The command is the user's own shortcut, so seeing it as flat text gives no way to check WHAT it
 * actually sends — which matters when the answer looks wrong and you want to know whether the
 * skill even applied. Only an exact match against the user's own commands becomes a chip; any
 * other slash text stays literal.
 */
export function AgentChat({
  blocked,
  fill,
  embedded,
  initialConversationId,
  onOpenSkills,
  initialPrompt,
}: {
  blocked?: string | null;
  fill?: boolean;
  /** Open the Skills screen (the "/" menu's "Tạo lệnh mới" row, and the "+" menu's Skills item).
   *  The desktop shell passes its own navigate(); on the web we fall back to /agents-chat/skills. */
  onOpenSkills?: () => void;
  /** Rendered inside the /agents-chat workspace, which supplies its own conversation rail —
   *  so hide AgentChat's own history sidebar and let the chat panel fill the width. */
  embedded?: boolean;
  /** Open this conversation on mount (a /agents-chat?c=<id> deep link) instead of the most recent one. */
  initialConversationId?: string;
  /**
   * Đổ sẵn một câu vào ô soạn khi mở cuộc trò chuyện mới (màn /agents-chat/new chuyền qua ?q=…).
   *
   * CHỈ ĐỔ SẴN, KHÔNG TỰ GỬI. Người dùng bấm một thẻ gợi ý là để bắt đầu, không phải để phát đi
   * một câu họ chưa kịp đọc — và mỗi lượt gửi đều tốn lượt tính phí của họ. Đổ sẵn thì họ còn sửa
   * được, hoặc xoá đi mà gõ cái khác.
   */
  initialPrompt?: string;
} = {}) {
  const runtime = useRuntime();
  const { t: tr } = useI18n();
  const { message, modal } = AntApp.useApp();
  const kindLabelT: Record<Kind, string> = {
    image: tr('chat.kindImage', 'Ảnh'),
    doc: tr('chat.kindDoc', 'Tài liệu'),
    sheet: tr('chat.kindSheet', 'Bảng tính'),
    slide: tr('chat.kindSlide', 'Trình chiếu'),
    pdf: tr('chat.kindPdf', 'PDF'),
    other: tr('chat.kindOther', 'Khác'),
  };
  const { user } = useAccountAuth();
  const owner = useAgentBusy();
  const localBusy = !!owner; // shared one-turn lock across the app (LOCAL turns only)
  const uid = user?.id || '_local';
  // Signed in → the conversation history syncs to the server (desktop ↔ server ↔ web). '_local'
  // (logged out) stays local-only.
  const signedIn = !!user?.id;
  const openRef = useRef('');            // the conversation currently on screen (for async body hydrate)
  const idxPushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const projPushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** uid đã kéo-hợp-nhất dự án từ máy chủ ít nhất một lần (chốt trước khi được PUT thay-toàn-bộ). */
  const projectsPulledRef = useRef<string | null>(null);
  // Responsive: on a phone / narrow web view the history sidebar becomes a Drawer (full-width chat).
  const screens = Grid.useBreakpoint();
  const narrow = !screens.lg;
  const isMobile = !screens.md; // phone-width: tighten padding / stack things
  const [navOpen, setNavOpen] = useState(false);
  const [hdrRename, setHdrRename] = useState<{ id: string; val: string } | null>(null); // header rename modal (embedded)
  const [convShare, setConvShare] = useState<{ id: string; slug?: string; loading: boolean } | null>(null); // public conversation link

  const [items, setItems] = useState<Item[]>([]);
  // While a conversation is being opened (deep link / most-recent / switch), suppress the empty-state
  // hero so it never FLASHES before the messages load. False = genuinely empty (show the hero).
  const [opening, setOpening] = useState<boolean>(() => !!initialConversationId || !embedded);
  const [input, setInput] = useState(initialPrompt ?? '');
  const [composerFocused, setComposerFocused] = useState(false);
  // ── "/" menu: the user's skills that carry a slash-command shortcut ──
  const taRef = useRef<HTMLTextAreaElement>(null);
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
  /** Skills screen: the desktop shell navigates in-app; the web has a real route. */
  const goSkills = () => {
    if (onOpenSkills) return onOpenSkills();
    try { window.location.assign('/agents-chat/skills'); } catch { /* ignore */ }
  };
  /** "+" menu → open a NEW LINE with "/" and focus, which opens the menu. A command is only
   *  recognised at the start of a line, so appending mid-line would show nothing. */
  const openSlashMenu = () => {
    setInput((p) => (!p ? '/' : /\n[ \t]*$/.test(p) ? `${p}/` : `${p.replace(/[ \t]+$/, '')}\n/`));
    setTimeout(() => {
      const el = taRef.current;
      if (!el) return;
      el.focus();
      try { el.setSelectionRange(el.value.length, el.value.length); } catch { /* ignore */ }
    }, 0);
  };
  const [attachments, setAttachments] = useState<Att[]>([]);
  /** Tin nhắn của chính mình đang được sửa để hỏi lại (null = không sửa gì). */
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  /** Nội dung người dùng gõ vào biểu mẫu điền nhanh, khoá theo "<id tin nhắn>:<số mục>". */
  const [answers, setAnswers] = useState<Record<string, string>>({});
  /**
   * Phần thân ĐÃ HIỂN THỊ của mỗi câu trả lời, để xuất PDF nhân bản đúng nó.
   *
   * Dựng lại từ Markdown thì mất bảng, mất màu cú pháp, và không thể in nổi artifact (nằm trong
   * iframe do trình duyệt vẽ, không phải markdown). Nhân bản DOM thì bản in bám theo mọi nâng
   * cấp của ChatMarkdown mà chỗ này không phải sửa gì.
   */
  const bodyRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  /** Attachment being previewed (any format — see AttachmentPreview). */
  const [preview, setPreview] = useState<PreviewableAttachment | null>(null);
  /** Skill whose details the user opened by clicking its "/lệnh" chip in a message. */
  const [skillInfo, setSkillInfo] = useState<{ item: SlashCommandItem; body?: string; loading: boolean } | null>(null);
  const [runnerId, setRunnerId] = useState(() => desktopRunnerPrefs().runner || 'claude');
  const [runnerModel, setRunnerModel] = useState(() => desktopRunnerPrefs().model || '');
  // Conversation history (local assistant only).
  const [convs, setConvs] = useState<ConvMeta[]>([]);
  const [activeId, setActiveId] = useState('');
  const [renamingId, setRenamingId] = useState('');
  const [renameText, setRenameText] = useState('');
  // Projects (folders), search, and the file Library.
  const [projects, setProjects] = useState<Project[]>([]);
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [projModal, setProjModal] = useState<{ mode: 'new' | 'rename'; id?: string; forConv?: string } | null>(null);
  const [projName, setProjName] = useState('');
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libItems, setLibItems] = useState<LibItem[]>([]);
  const [libQuery, setLibQuery] = useState('');
  const [libTab, setLibTab] = useState<'all' | Kind>('all');
  // Source: '' = my own local assistant; else a grantId for a friend-shared (read-only) one.
  const [sourceId, setSourceId] = useState('');
  const [received, setReceived] = useState<LarkGrant[]>([]);
  const [shareOpen, setShareOpen] = useState(false);
  const [relayBusy, setRelayBusy] = useState(false); // waiting on a friend's machine to answer
  const [hostedBusy, setHostedBusy] = useState(false); // a hosted/local turn is streaming (web MAIC path)
  /** Lúc lượt hiện tại bắt đầu — để đếm giây trong chỉ báo "đang làm". */
  const [turnStartedAt, setTurnStartedAt] = useState<number | null>(null);
  const relayCancel = useRef(false);
  /**
   * Người dùng bấm "Dừng" giữa một lượt CHẠY TRÊN MÁY CHỦ (đường MAIC).
   *
   * Trước đây nút Dừng chỉ xử lý đường relay; với lượt hosted nó gọi `agentUnlock` — thứ mở khoá
   * phiên AI cục bộ, hoàn toàn không liên quan tới luồng đang chảy. Bấm xong không có gì xảy ra,
   * không một dòng phản hồi. Nay cờ này cắt vòng lặp đọc sự kiện ngay ở nhịp kế tiếp.
   */
  const hostedCancel = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false); // whether the CLI session already exists (→ --resume)
  const sidRef = useRef<string>('');
  const fileRef = useRef<HTMLInputElement>(null);
  const dirtyRef = useRef(false); // true only after a NEW turn — so merely opening a conv doesn't re-save/reorder

  const shared = !!sourceId;
  const slash = useSlashCommands({
    value: input,
    onChange: setInput,
    commands: slashCmds,
    // A delegated ("shared") turn runs on the OWNER's machine against THEIR skills, so our own
    // shortcuts would be meaningless text there — no menu in that mode.
    disabled: !!blocked || shared,
    getCaret: () => taRef.current?.selectionStart ?? null,
    getEl: () => taRef.current,
    // Hidden for a delegated turn (it runs on someone else's machine, against THEIR skills) and on
    // a runtime that can't store a command — there the Skills screen has no command field, so the
    // row would walk the user to a dead end.
    onCreateCommand: shared || !runtime.supportsSkillCommands ? undefined : goSkills,
  });
  const busy = localBusy || relayBusy || hostedBusy; // composer-disabling: local/relay/hosted turn
  /**
   * Nói ra bên ngoài rằng đang có một lượt chạy.
   *
   * Vỏ trang (AgentsChatShell) là thứ điều hướng, mà điều hướng đi chỗ khác sẽ THÁO component này và
   * giết luôn lượt đang chảy — không hỏi, không cảnh báo. Nó không có cách nào tự biết, nên chỗ
   * duy nhất biết phải tự khai báo. Đóng tab cũng vậy: chặn bằng beforeunload.
   */
  useEffect(() => {
    try {
      window.dispatchEvent(new CustomEvent('tw-chat-busy', { detail: { busy } }));
    } catch {
      /* ignore */
    }
    if (!busy) return;
    const onBeforeUnload = (e: BeforeUnloadEvent): void => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      try {
        window.dispatchEvent(new CustomEvent('tw-chat-busy', { detail: { busy: false } }));
      } catch {
        /* ignore */
      }
    };
  }, [busy]);

  // Nhích mỗi giây CHỈ khi đang chạy — không thì mỗi hội thoại mở ra là một vòng lặp render vô ích.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    if (!busy) return;
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [busy]);
  const source = received.find((g) => g.id === sourceId) || null;
  const displayName = (user?.name || user?.email?.split('@')[0] || '').replace(/\./g, ' ').trim();
  // Time-aware greeting for the new-chat hero (claude.ai-style).
  const greetHour = new Date().getHours();
  const greetKey = greetHour >= 23 || greetHour < 5 ? 'late' : greetHour < 11 ? 'morning' : greetHour < 18 ? 'afternoon' : 'evening';
  const greetingText = tr(
    `chat.greet_${greetKey}`,
    greetKey === 'late' ? 'Khuya rồi' : greetKey === 'morning' ? 'Chào buổi sáng' : greetKey === 'afternoon' ? 'Chào buổi chiều' : 'Chào buổi tối',
  );
  // Tell an external shell (the /agents-chat rail) that a conversation's meta changed (pin/rename/move/delete).
  const notifyRail = () => {
    if (typeof window !== 'undefined') {
      try { window.dispatchEvent(new CustomEvent('tw-chat-refresh')); } catch { /* ignore */ }
    }
  };

  // Received shared assistants (agentchat grants a friend claimed).
  const loadReceived = useCallback(async () => {
    // Trợ lý được bạn bè chia sẻ chỉ có khi Bạn bè bật (FEATURE_FRIENDS) — tắt thì chỉ còn trợ lý của mình.
    if (!FEATURE_FRIENDS) return;
    try {
      const b = await accountApi.larkGrantsReceived();
      setReceived(b.active.filter((g) => g.kind === 'agentchat' && g.status === 'active'));
    } catch {
      /* offline — only the local assistant is available */
    }
  }, []);
  useEffect(() => { void loadReceived(); }, [loadReceived]);
  // If the selected shared source vanished (revoked/expired), fall back to the local assistant.
  useEffect(() => {
    if (sourceId && !received.some((g) => g.id === sourceId)) {
      setSourceId('');
      dirtyRef.current = false;
      setItems(loadBody(uid, activeId));
    }
  }, [received, sourceId, uid, activeId]);

  // Load the conversation history for this account; open the most recent (or a fresh one).
  useEffect(() => {
    setProjects(loadProjects(uid));
    const idx = loadIndex(uid);
    setConvs(idx);
    const wanted = initialConversationId ? idx.find((c) => c.id === initialConversationId) : undefined;
    if (initialConversationId) {
      // Deep link (/agents-chat?c=<id>): open that conversation. If it isn't in the local index yet
      // (created on another device), still open its id and pull the body from the server.
      const id = initialConversationId;
      setActiveId(id);
      openRef.current = id;
      sidRef.current = wanted ? wanted.sessionId : uuid();
      const body = loadBody(uid, id);
      startedRef.current = body.length > 0;
      setItems(body);
      if (!body.length && signedIn) void hydrateBodyFromServer(id);
      else setOpening(false);
    } else if (!embedded && idx.length) {
      // Standalone /assistant: reopen the most recent conversation. In the embedded /agents-chat
      // workspace, no `?c=` means a NEW chat (the hero) — never silently reopen the last one.
      const first = idx[0];
      setActiveId(first.id);
      sidRef.current = first.sessionId;
      const body = loadBody(uid, first.id);
      startedRef.current = body.length > 0;
      setItems(body);
      if (!body.length && signedIn) void hydrateBodyFromServer(first.id);
      else setOpening(false);
    } else {
      const id = uuid();
      setActiveId(id);
      sidRef.current = uuid();
      startedRef.current = false;
      setItems([]);
      setOpening(false);
    }
    dirtyRef.current = false;
    setSourceId('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  // Write one conversation (body + index entry, moved to top) to localStorage NOW.
  const persistNow = (id: string, its: Item[]) => {
    if (!id || !its.length) return;
    saveBody(uid, id, its);
    const existing = convs.find((c) => c.id === id);
    const title = existing?.title || deriveTitle(its) || tr('chat.conversation', 'Cuộc trò chuyện');
    // Preserve pinned/projectId — rebuilding the meta from scratch would silently un-pin /
    // un-folder the conversation on every turn.
    const meta: ConvMeta = { ...existing, id, sessionId: sidRef.current, title, updatedAt: Date.now() };
    setConvs((prev) => {
      const ex = prev.find((c) => c.id === id);
      const m: ConvMeta = { ...ex, id, sessionId: sidRef.current, title: ex?.title || title, updatedAt: meta.updatedAt };
      const next = [m, ...prev.filter((c) => c.id !== id)];
      saveIndex(uid, next);
      return next;
    });
    dirtyRef.current = false;
    // Let an external shell (the /agents-chat workspace rail) reflect this conversation immediately —
    // prepend/highlight it without waiting on the debounced server-index push.
    if (typeof window !== 'undefined') {
      try { window.dispatchEvent(new CustomEvent('tw-chat-saved', { detail: { id, title } })); } catch { /* ignore */ }
    }
    // Sync the body (text-only, capped like saveBody) up to the server for the other devices/web.
    if (signedIn && !shared) void accountApi.chatPushBody(id, meta, stripImages(its).slice(-240)).catch(() => undefined);
  };
  // Flush a pending (dirty) LOCAL conversation before we navigate away from it — so switching
  // conversation / starting a new chat right after a reply never drops that reply.
  const flushPending = () => {
    if (dirtyRef.current && !shared && activeId && items.length) persistNow(activeId, items);
  };

  // Persist the active LOCAL conversation whenever it settles (never during a running turn, and
  // never for a friend-shared ephemeral chat). Adds it to the index on its first message.
  useEffect(() => {
    if (shared || busy || !activeId || !items.length || !dirtyRef.current) return;
    const t = setTimeout(() => persistNow(activeId, items), 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, busy, shared, activeId, uid]);

  // Latest snapshot for the unmount flush (leaving the screen entirely won't call flushPending).
  const latest = useRef({ items, activeId, shared });
  useEffect(() => { latest.current = { items, activeId, shared }; });
  useEffect(
    () => () => {
      const s = latest.current;
      if (!dirtyRef.current || s.shared || !s.activeId || !s.items.length) return;
      saveBody(uid, s.activeId, s.items);
      const idx = loadIndex(uid);
      const existing = idx.find((c) => c.id === s.activeId);
      const title = existing?.title || deriveTitle(s.items) || 'Cuộc trò chuyện';
      saveIndex(uid, [{ ...existing, id: s.activeId, sessionId: sidRef.current, title, updatedAt: Date.now() }, ...idx.filter((c) => c.id !== s.activeId)]);
    },
    [uid],
  );

  // A refresh / tab-close can land mid-answer (the streaming reveal widens that window), and React's
  // unmount cleanup is NOT guaranteed to run before the page unloads → the reply would be lost. Save
  // LOCALLY on `pagehide` too (synchronous, survives a reload; the next mount re-hydrates from it).
  useEffect(() => {
    const flush = () => {
      const s = latest.current;
      if (!dirtyRef.current || s.shared || !s.activeId || !s.items.length) return;
      saveBody(uid, s.activeId, s.items);
      const idx = loadIndex(uid);
      const existing = idx.find((c) => c.id === s.activeId);
      const title = existing?.title || deriveTitle(s.items) || 'Cuộc trò chuyện';
      saveIndex(uid, [
        { ...existing, id: s.activeId, sessionId: sidRef.current, title, updatedAt: Date.now() },
        ...idx.filter((c) => c.id !== s.activeId),
      ]);
    };
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  // The /agents-chat rail mutated a conversation's meta directly (pin/rename/move/delete) — it already
  // wrote localStorage + the server. Re-read our in-memory index from localStorage so a later
  // debounced push can't resurrect/overwrite the change.
  useEffect(() => {
    const onCmd = () => setConvs(loadIndex(uid));
    window.addEventListener('tw-chat-command', onCmd);
    return () => window.removeEventListener('tw-chat-command', onCmd);
  }, [uid]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [items]);

  // ── Server history sync: desktop ↔ server ↔ web ────────────────────────────
  // Track which conversation is on screen (guards the async body hydrate below).
  useEffect(() => { openRef.current = activeId; }, [activeId]);

  const [syncing, setSyncing] = useState(false);
  const [syncedAt, setSyncedAt] = useState<number | null>(null);

  // Merge a server index into local state (newest updatedAt wins) + persist locally.
  const applyServerIndex = useCallback((idx: ChatIndex) => {
    setConvs((prev) => {
      const byId = new Map<string, ConvMeta>(prev.map((c) => [c.id, c]));
      for (const s of idx.conversations) {
        const local = byId.get(s.id);
        if (!local || s.updatedAt >= local.updatedAt) {
          byId.set(s.id, { id: s.id, title: s.title, sessionId: s.sessionId, updatedAt: s.updatedAt, projectId: s.projectId, pinned: s.pinned });
        }
      }
      const merged = Array.from(byId.values()).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 80);
      saveIndex(uid, merged);
      return merged;
    });
    setProjects((prev) => {
      const byId = new Map(prev.map((p) => [p.id, p]));
      for (const p of idx.projects) if (!byId.has(p.id)) byId.set(p.id, { id: p.id, name: p.name });
      const merged = Array.from(byId.values());
      saveProjects(uid, merged);
      return merged;
    });
  }, [uid]);

  // Push every local conversation (meta + projects + bodies) up to the server.
  const pushAllLocal = useCallback(async () => {
    const localIdx = loadIndex(uid);
    await accountApi.chatPushIndex(localIdx).catch(() => undefined);
    if (projectsPulledRef.current === uid) await accountApi.chatPushProjects(loadProjects(uid)).catch(() => undefined);
    for (const c of localIdx.slice(0, 80)) {
      const b = loadBody(uid, c.id);
      if (b.length) await accountApi.chatPushBody(c.id, c, b).catch(() => undefined);
    }
  }, [uid]);

  // Pull the server index on mount (after the local load), MERGE by id (newest updatedAt wins), then
  // one-time BULK-push this device's existing bodies so old chats land on the server (desktop → web).
  useEffect(() => {
    if (!signedIn) return;
    let alive = true;
    void (async () => {
      try {
        const idx = await accountApi.chatGetIndex();
        if (!alive) return;
        applyServerIndex(idx);
        projectsPulledRef.current = uid;
        setSyncedAt(Date.now());
        const flag = `tw_agentchat_synced_${uid}`;
        if (!localStorage.getItem(flag)) {
          for (const c of loadIndex(uid).slice(0, 80)) {
            if (!alive) return;
            const b = loadBody(uid, c.id);
            if (b.length) await accountApi.chatPushBody(c.id, c, b).catch(() => undefined);
          }
          try { localStorage.setItem(flag, '1'); } catch { /* ignore */ }
        }
      } catch { /* offline / not signed in — local-only is fine */ }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, signedIn]);

  // Manual "Đồng bộ": push everything local up, then pull + merge back. Gives the user a visible
  // control + confirmation (the automatic sync is otherwise silent).
  const syncNow = useCallback(async () => {
    if (!signedIn || syncing) return;
    setSyncing(true);
    try {
      await pushAllLocal();
      applyServerIndex(await accountApi.chatGetIndex());
      setSyncedAt(Date.now());
      message.success(tr('chat.chatSynced', 'Đã đồng bộ hội thoại'));
    } catch (e) {
      message.error(tr('chat.syncNotDone', 'Đồng bộ chưa xong') + ': ' + ((e as Error)?.message || tr('chat.networkError', 'lỗi mạng')));
    } finally {
      setSyncing(false);
    }
  }, [signedIn, syncing, pushAllLocal, applyServerIndex, message, tr]);

  // Push conversation META whenever it changes (catches new chats, rename, pin, project moves,
  // delete). Debounced; body content rides its own push in persistNow.
  useEffect(() => {
    if (!signedIn || shared) return;
    if (idxPushTimer.current) clearTimeout(idxPushTimer.current);
    idxPushTimer.current = setTimeout(() => { void accountApi.chatPushIndex(convs).catch(() => undefined); }, 1500);
    return () => { if (idxPushTimer.current) clearTimeout(idxPushTimer.current); };
  }, [convs, signedIn, shared]);

  // Push projects whenever they change (debounced).
  // `PUT /agent/chat/projects` THAY TOÀN BỘ danh sách dự án của tài khoản (máy chủ xoá dự án không
  // có trong danh sách) — và danh sách đó dùng chung với app/web Toolswave. Máy vừa cài (danh sách
  // rỗng) mà đẩy trước khi kéo-hợp-nhất xong là xoá sạch dự án bên kia. Chỉ đẩy SAU lần kéo đầu.
  useEffect(() => {
    if (!signedIn || projectsPulledRef.current !== uid) return;
    if (projPushTimer.current) clearTimeout(projPushTimer.current);
    projPushTimer.current = setTimeout(() => { void accountApi.chatPushProjects(projects).catch(() => undefined); }, 1500);
    return () => { if (projPushTimer.current) clearTimeout(projPushTimer.current); };
  }, [projects, signedIn]);

  // Fetch a conversation's body from the server when it isn't on THIS device yet (e.g. a chat made
  // on the desktop, opened on the web for the first time).
  const hydrateBodyFromServer = async (id: string) => {
    try {
      const r = await accountApi.chatGetBody(id);
      const body = (r.body as Item[] | null) || [];
      if (body.length && openRef.current === id) {
        saveBody(uid, id, body);
        startedRef.current = true;
        setItems(body);
      }
    } catch { /* offline — leave the local (empty) body */ }
    setOpening(false); // done attempting — reveal messages if loaded, else the (genuinely empty) hero
  };

  const updateTool = (id: string, fn: (c: Extract<Item, { kind: 'tool' }>) => Extract<Item, { kind: 'tool' }>) =>
    setItems((prev) => prev.map((it) => (it.kind === 'tool' && it.id === id ? fn(it) : it)));

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
      // Lỗi xác thực/credit nhiều khi tới dưới dạng CHỮ assistant (CLI in lỗi như câu trả lời) chứ
      // không phải sự kiện 'error' → vẫn phải báo telemetry. reportRunnerError tự chống gửi trùng.
      const fix = diagnoseRunnerError(finalText);
      if (fix) reportRunnerError({ runner: runnerId, model: runnerModel || undefined, kind: fix.kind, message: finalText, surface: 'general' });
    } else if (ev.type === 'tool_call') {
      setItems((prev) => [...prev, { kind: 'tool', id: ev.callId, name: ev.name, status: 'pending' }]);
    } else if (ev.type === 'tool_result') {
      updateTool(ev.callId, (c) => ({ ...c, status: ev.ok ? 'ok' : 'error', summary: ev.summary, error: ev.error, suspectAppBug: ev.suspectAppBug, tier: ev.tier }));
    } else if (ev.type === 'tool_denied') {
      // Không xử lý thì chip công cụ kẹt ở "đang chạy" vĩnh viễn — người dùng bấm Từ chối rồi
      // vẫn thấy vòng xoay. LarkChat đã xử lý từ lâu; màn này thì chưa.
      updateTool(ev.callId, (c) => ({ ...c, status: 'denied', summary: tr('chat.toolDenied', 'đã từ chối') }));
    } else if (ev.type === 'files') {
      // Tệp trợ lý vừa tạo — gắn vào bong bóng trả lời cuối để bấm tải ngay tại chỗ.
      setItems((prev) => {
        const back = [...prev].reverse().findIndex((x) => x.kind === 'msg' && x.role === 'assistant');
        if (back < 0) {
          return [...prev, { kind: 'msg', id: rid(), role: 'assistant', text: '', ts: Date.now(), made: ev.files }];
        }
        const at = prev.length - 1 - back;
        const cur = prev[at] as Extract<Item, { kind: 'msg' }>;
        return [...prev.slice(0, at), { ...cur, made: [...(cur.made ?? []), ...ev.files] }, ...prev.slice(at + 1)];
      });
      dirtyRef.current = true;
    } else if (ev.type === 'file') {
      // Đường DESKTOP: tệp nằm trên chính máy này, không có uploadId. Gắn vào đúng bong bóng
      // như đường web để người dùng chỉ thấy MỘT kiểu thẻ, dù tệp tới từ hai nguồn khác nhau.
      const f = { path: ev.path, name: ev.name, size: ev.bytes, mime: ev.mime };
      setItems((prev) => {
        const back = [...prev].reverse().findIndex((x) => x.kind === 'msg' && x.role === 'assistant');
        if (back < 0) return [...prev, { kind: 'msg', id: rid(), role: 'assistant', text: '', ts: Date.now(), made: [f] }];
        const at = prev.length - 1 - back;
        const cur = prev[at] as Extract<Item, { kind: 'msg' }>;
        return [...prev.slice(0, at), { ...cur, made: [...(cur.made ?? []), f] }, ...prev.slice(at + 1)];
      });
      dirtyRef.current = true;
    } else if (ev.type === 'error') {
      message.error(ev.message);
      // Ngoài toast thoáng qua, GHI lỗi vào hội thoại: toast biến mất sau vài giây, còn lỗi xác thực/
      // credit cần ở lại để người dùng đọc + làm theo các bước (diagnoseRunnerError sẽ biến nó thành
      // thẻ hướng dẫn). Chỉ ghi khi bong bóng cuối chưa phải chính lỗi này (tránh nhân đôi).
      setItems((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.kind === 'msg' && last.role === 'assistant' && last.text === ev.message) return prev;
        return [...prev, { kind: 'msg', id: rid(), role: 'assistant', text: ev.message, ts: Date.now() }];
      });
      reportRunnerError({ runner: runnerId, model: runnerModel || undefined, kind: classifyRunnerError(ev.message), message: ev.message, surface: 'general' });
      dirtyRef.current = true;
    }
  };

  /**
   * Dán ảnh thẳng vào khung soạn (Ctrl/Cmd+V).
   *
   * Cách người ta thực sự làm việc: chụp màn hình rồi dán, không phải lưu ra tệp → mở hộp thoại
   * chọn tệp → tìm lại. Ảnh trong clipboard KHÔNG có tên, nên đặt tên theo thời điểm dán để về sau
   * còn phân biệt được trong "Tệp đã tải lên" và trong chính hội thoại.
   *
   * CHỈ chặn sự kiện khi clipboard THỰC SỰ có ảnh: dán chữ thường phải chạy như bình thường.
   */
  const pasteFiles = async (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData?.items || []);
    const imgs = items.filter((it) => it.kind === 'file' && it.type.startsWith('image/'));
    if (!imgs.length) return;
    e.preventDefault();
    const stamp = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const when = `${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}-${pad(stamp.getHours())}${pad(stamp.getMinutes())}${pad(stamp.getSeconds())}`;
    const files = imgs
      .map((it, i) => {
        const f = it.getAsFile();
        if (!f) return null;
        const ext = (f.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
        // Đổi tên qua File mới: tệp từ clipboard thường tên "image.png" cho MỌI lần dán, nên hai
        // ảnh dán liên tiếp sẽ trùng tên và không phân biệt nổi khi xem lại.
        return new File([f], `dan-${when}${imgs.length > 1 ? `-${i + 1}` : ''}.${ext}`, { type: f.type });
      })
      .filter(Boolean) as File[];
    if (!files.length) return;
    const dt = new DataTransfer();
    files.forEach((f) => dt.items.add(f));
    await pickFiles(dt.files);
    message.success(
      files.length > 1
        ? tr('chat.pastedN', 'Đã dán {n} ảnh', { n: String(files.length) })
        : tr('chat.pasted', 'Đã dán ảnh'),
    );
  };

  const pickFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const read = await Promise.all(
      Array.from(files).slice(0, 12).map(
        (f) =>
          new Promise<Att & { failed?: boolean }>((resolve) => {
            const r = new FileReader();
            const isImage = (f.type || '').startsWith('image/');
            r.onload = () => {
              const b64 = String(r.result || '').split(',')[1] || '';
              resolve({ name: f.name || (isImage ? 'anh.png' : 'file'), dataBase64: b64, isImage, mime: f.type || '' });
            };
            r.onerror = () => resolve({ name: f.name || 'file', dataBase64: '', isImage: false, mime: '', failed: true });
            r.readAsDataURL(f);
          }),
      ),
    );
    const ok = read.filter((x) => !x.failed && x.dataBase64);
    if (read.some((x) => x.failed)) message.warning(tr('chat.someFilesUnreadable', 'Một số file không đọc được — đã bỏ qua.'));
    setAttachments((prev) => [...prev, ...ok].slice(0, 12));
  };

  const setMsgText = (id: string, text: string) =>
    setItems((prev) => prev.map((it) => (it.kind === 'msg' && it.id === id ? { ...it, text } : it)));

  /** A friend-shared assistant runs on the OWNER's machine: submit the turn, poll for the answer. */
  const relaySend = async (grantId: string, prompt: string) => {
    setRelayBusy(true);
    relayCancel.current = false;
    const pendingId = rid();
    setItems((prev) => [...prev, { kind: 'msg', id: pendingId, role: 'assistant', text: '', ts: Date.now() }]);
    try {
      const t = await accountApi.larkGrantSubmitTurn(grantId, prompt);
      const deadline = Date.now() + 180_000;
      for (;;) {
        await new Promise((r) => setTimeout(r, 2000));
        if (relayCancel.current) { setMsgText(pendingId, `⏹ ${tr('chat.cancelledWait', 'Đã huỷ chờ.')}`); break; }
        const s = await accountApi.larkGrantTurn(t.id);
        if (s.status === 'succeeded') { setMsgText(pendingId, s.result || tr('chat.noContent', '(không có nội dung)')); break; }
        if (s.status === 'failed' || s.status === 'denied') { setMsgText(pendingId, `⚠️ ${s.error || tr('chat.rejected', 'Bị từ chối')}`); break; }
        if (Date.now() > deadline) { setMsgText(pendingId, `⚠️ ${tr('chat.timeoutMachineOf', 'Quá thời gian chờ — máy của')} ${ownerName(source)} ${tr('chat.mayBeOff', 'có thể đang tắt.')}`); break; }
      }
    } catch (e) {
      setMsgText(pendingId, `⚠️ ${e instanceof Error ? e.message : tr('chat.sendFailed', 'Không gửi được')}`);
    } finally {
      setRelayBusy(false);
      relayCancel.current = false;
    }
  };

  const send = async (override?: string) => {
    if (blocked) return; // desktop offline — nothing to send to
    const prompt = (override ?? input).trim();
    // Attachments always go with a LOCAL send (incl. clicking a starter suggestion) — only the
    // prompt text comes from `override`; a shared turn carries text only.
    // `mime` đi kèm: thiếu nó thì đường web dựng File không có type và máy chủ từ chối ảnh.
    const atts = shared ? [] : attachments.map((a) => ({ name: a.name, dataBase64: a.dataBase64, mime: a.mime }));
    const libAtts = shared ? [] : attachments.filter((a) => a.dataBase64 && !a.libId); // NEW uploads → Library
    if ((!prompt && !atts.length) || busy) return;
    if (!shared && !runtime.larkChat) return;
    const effective = prompt || tr('chat.analyzeFiles', 'Đọc + phân tích các file đính kèm giúp tôi.');
    const imgs = shared
      ? []
      : attachments
          .filter((a) => a.isImage && a.dataBase64 && a.dataBase64.length < 2_000_000)
          .map((a) => ({ name: a.name, dataUrl: `data:${a.mime};base64,${a.dataBase64}` }));
    setInput('');
    setAttachments([]);
    if (!shared) dirtyRef.current = true; // a real LOCAL turn → the persist effect will save + reorder
    libAtts.forEach((a) => void libPut({ id: uuid(), uid, name: a.name, mime: a.mime, isImage: a.isImage, dataBase64: a.dataBase64, convId: activeId, ts: Date.now() }));
    setItems((prev) => [
      ...prev,
      {
        kind: 'msg',
        id: rid(),
        role: 'user',
        text: effective + (atts.length ? `\n\n📎 ${atts.map((a) => a.name).join(', ')}` : ''),
        ts: Date.now(),
        ...(imgs.length ? { images: imgs } : {}),
      },
    ]);
    if (shared) {
      await relaySend(sourceId, effective);
      return;
    }
    // "tạo hình/ảnh/logo…" → generate a REAL AI image (OpenAI) instead of an LLM text turn.
    if (!atts.length && isImageRequest(effective)) {
      const pid = rid();
      const startedAt = Date.now();
      setItems((prev) => [...prev, { kind: 'msg', id: pid, role: 'assistant', text: tr('chat.drawingImage', '🎨 Đang vẽ ảnh…'), ts: Date.now() }]);
      setHostedBusy(true);
      try {
        const { url } = await accountApi.assistantImage(effective);
        setItems((prev) => prev.map((it) => (it.kind === 'msg' && it.id === pid
          ? { ...it, text: `${tr('chat.imageFor', 'Ảnh cho')}: "${effective}"`, images: [{ name: effective.slice(0, 60), dataUrl: url }] }
          : it)));
        dirtyRef.current = true;
      } catch (e) {
        setItems((prev) => prev.map((it) => (it.kind === 'msg' && it.id === pid
          ? { ...it, text: (e as Error)?.message || tr('chat.imageFailed', 'Không tạo được ảnh, bạn thử lại nhé.') }
          : it)));
      } finally {
        stampDuration(startedAt);
        setHostedBusy(false);
      }
      return;
    }
    const startedAt = Date.now();
    setTurnStartedAt(startedAt);
    hostedCancel.current = false;
    setHostedBusy(true);
    try {
      for await (const ev of runtime.larkChat!({
        prompt: effective,
        mode: 'ask',
        scope: 'general',
        sessionId: sidRef.current,
        resume: startedRef.current,
        attachments: atts.length ? atts : undefined,
        runner: runnerId,
        model: runnerModel || undefined,
      })) {
        if (hostedCancel.current) break; // `break` gọi generator.return() → đóng luôn kết nối SSE
        apply(ev);
      }
      startedRef.current = true;
    } catch (e) {
      message.error((e as Error)?.message || tr('chat.agentRunError', 'Lỗi khi chạy agent.'));
    } finally {
      stampDuration(startedAt);
      setTurnStartedAt(null);
      setHostedBusy(false);
    }
  };

  // ── Conversation management ────────────────────────────────────────────────
  /** Tải một tệp trợ lý tạo ra: lấy bản gốc từ máy chủ rồi lưu về máy. */
  const downloadMade = async (f: { uploadId?: string; path?: string; name: string; mime: string }) => {
    // Tệp nằm sẵn trên máy (đường desktop): mở thẳng bằng ứng dụng mặc định. Không đi vòng qua
    // máy chủ — tệp chưa bao giờ rời khỏi máy này, mà tải nó lên chỉ để tải về là vô nghĩa.
    if (f.path) {
      if (!runtime.openLocalFile) return message.info(tr('chat.cantOpenFile', 'Bản này chưa mở được tệp từ hội thoại.'));
      const r = await runtime.openLocalFile(f.path);
      if (!r.ok) message.error(r.error || tr('chat.openFileFailed', 'Không mở được tệp.'));
      return;
    }
    if (!f.uploadId) return;
    try {
      const raw = await accountApi.uploadRaw(f.uploadId);
      const bin = atob(raw.dataBase64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], { type: raw.mime || f.mime || 'application/octet-stream' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = raw.name || f.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) {
      message.error((e as Error).message || tr('chat.downloadFailed', 'Không tải được tệp.'));
    }
  };

  const copyMsg = (text: string) => {
    try { void navigator.clipboard?.writeText(text); message.success(tr('chat.copied', 'Đã sao chép')); } catch { message.error(tr('chat.copyFailedShort', 'Không sao chép được')); }
  };

  /**
   * Xuất một câu trả lời ra PDF, giữ đúng cách nó đang hiển thị.
   *
   * Lưu ý thành thật với người dùng: đây là hộp thoại IN của trình duyệt, nơi họ chọn "Lưu thành
   * PDF" — không phải tải thẳng một tệp về. Trong kho không có thư viện sinh PDF nào, và thêm
   * một thư viện nặng chỉ để bỏ một cú bấm là không đáng.
   */
  const savePdf = (msgId: string) => {
    const node = bodyRefs.current.get(msgId);
    if (!node) {
      message.error(tr('chat.pdfFailed', 'Không xuất được PDF cho câu trả lời này.'));
      return;
    }
    const title = convs.find((c) => c.id === activeId)?.title || tr('chat.assistant', 'Trợ lý AI');
    exportRenderedPdf({ title, subtitle: 'Larkwave · Trợ lý AI', nodes: [node] });
  };

  // ── Public conversation link (read-only transcript at /s/<slug>) ──
  const shareBase = () =>
    typeof window !== 'undefined' && window.location.hostname.endsWith('toolswave.net') ? window.location.origin : 'https://toolswave.net';
  const openConvShare = async (id: string) => {
    setConvShare({ id, loading: true });
    try {
      const r = await accountApi.chatShare(id);
      setConvShare({ id, slug: r.slug, loading: false });
    } catch (e) {
      message.error((e as Error)?.message || tr('chat.shareFailed', 'Không tạo được liên kết'));
      setConvShare(null);
    }
  };
  const unshareConv = async (id: string) => {
    try { await accountApi.chatUnshare(id); } catch { /* ignore */ }
    setConvShare(null);
    message.success(tr('chat.shareStopped', 'Đã gỡ chia sẻ'));
  };

  /** Re-run the last user prompt (ChatGPT "regenerate"): drop the old assistant reply, ask again. */
  const regenerate = async () => {
    if (busy || shared || !runtime.larkChat) return;
    let idx = -1;
    for (let k = items.length - 1; k >= 0; k--) {
      const it = items[k];
      if (it.kind === 'msg' && it.role === 'user') { idx = k; break; }
    }
    if (idx < 0) return;
    const um = items[idx] as Extract<Item, { kind: 'msg' }>;
    const userText = (um.text || '').split('\n\n📎')[0].trim();
    if (!userText) return;
    setItems((prev) => prev.slice(0, idx + 1)); // drop the previous answer + its tool lines
    dirtyRef.current = true;
    try {
      for await (const ev of runtime.larkChat!({
        prompt: userText, mode: 'ask', scope: 'general', sessionId: sidRef.current, resume: startedRef.current, runner: runnerId, model: runnerModel || undefined,
      }))
        apply(ev);
      startedRef.current = true;
    } catch (e) {
      message.error((e as Error)?.message || tr('chat.regenError', 'Lỗi khi chạy lại.'));
    }
  };

  /**
   * Sửa lại câu hỏi của mình rồi hỏi lại.
   *
   * Bỏ hết những gì SAU tin nhắn đó (câu trả lời cũ + các dòng công cụ) rồi gửi bản mới: giữ lại
   * câu trả lời cho một câu hỏi đã bị thay là để lại một đoạn hội thoại nói dối về chính nó.
   * Phần "📎 tên tệp" không đưa vào ô sửa — tệp đã gửi thì không sửa được, và để nguyên dòng đó
   * trong ô nhập sẽ khiến người dùng tưởng lần này cũng đính kèm.
   */
  const startEdit = (msgId: string) => {
    if (busy || shared) return;
    const it = items.find((x) => x.kind === 'msg' && x.id === msgId) as Extract<Item, { kind: 'msg' }> | undefined;
    if (!it) return;
    setEditing({ id: msgId, text: (it.text || '').split('\n\n📎')[0] });
  };

  const submitEdit = async () => {
    const ed = editing;
    if (!ed || busy || shared || !runtime.larkChat) return;
    const text = ed.text.trim();
    if (!text) return;
    const idx = items.findIndex((x) => x.kind === 'msg' && x.id === ed.id);
    if (idx < 0) return;
    setEditing(null);
    setItems((prev) => [
      ...prev.slice(0, idx),
      { ...(prev[idx] as Extract<Item, { kind: 'msg' }>), text, ts: Date.now() },
    ]);
    // Tiêu đề hội thoại lấy từ tin nhắn ĐẦU TIÊN. Sửa chính tin đó mà không đổi tiêu đề thì cột
    // trái vẫn hiện câu hỏi cũ — người dùng tìm lại hội thoại theo một câu không còn tồn tại.
    const firstUser = items.findIndex((x) => x.kind === 'msg' && x.role === 'user');
    if (idx === firstUser) {
      const t = text.split('\n')[0].slice(0, 60).trim();
      if (t) setConvs((prev) => prev.map((c) => (c.id === activeId ? { ...c, title: t } : c)));
    }
    dirtyRef.current = true;
    const startedAt = Date.now();
    setTurnStartedAt(startedAt);
    hostedCancel.current = false;
    setHostedBusy(true);
    try {
      for await (const ev of runtime.larkChat!({
        prompt: text, mode: 'ask', scope: 'general', sessionId: sidRef.current,
        resume: startedRef.current, runner: runnerId, model: runnerModel || undefined,
      })) {
        if (hostedCancel.current) break;
        apply(ev);
      }
      startedRef.current = true;
    } catch (e) {
      message.error((e as Error)?.message || tr('chat.regenError', 'Lỗi khi chạy lại.'));
    } finally {
      stampDuration(startedAt);
      setTurnStartedAt(null);
      setHostedBusy(false);
    }
  };

  /**
   * Gộp các ô đã điền thành MỘT tin nhắn rồi gửi như bình thường.
   *
   * Giữ nguyên SỐ THỨ TỰ và nhắc lại nhãn: model đã đánh số các câu hỏi, nên trả lời theo đúng số
   * là cách duy nhất để nó ghép lại không nhầm. Mục bỏ trống thì ghi rõ "chưa có" thay vì im lặng
   * bỏ qua — im lặng sẽ khiến model tưởng đã đủ và tự bịa nốt.
   */
  const sendAnswers = async (msgId: string, fields: { no: number; label: string }[]) => {
    if (busy || shared) return;
    const filled = fields
      .map((f) => ({ f, v: (answers[`${msgId}:${f.no}`] ?? '').trim() }))
      .filter((x) => x.v);
    const other = (answers[`${msgId}:other`] ?? '').trim();
    if (!filled.length && !other) {
      message.info(tr('chat.fillSomething', 'Bạn điền ít nhất một mục nhé.'));
      return;
    }
    const skipped = fields.filter((f) => !(answers[`${msgId}:${f.no}`] ?? '').trim());
    const body =
      filled.map((x) => `${x.f.no}. ${x.f.label}\n→ ${x.v}`).join('\n\n') +
      (skipped.length ? `\n\nChưa có: ${skipped.map((f) => f.no).join(', ')}.` : '') +
      (other ? `\n\n${other}` : '');
    setAnswers((p) => {
      const next = { ...p };
      for (const k of Object.keys(next)) if (k.startsWith(`${msgId}:`)) delete next[k];
      return next;
    });
    await send(body);
  };

  const newChat = () => {
    if (busy) return;
    setNavOpen(false); // close the mobile history drawer
    flushPending(); // don't lose the conversation we're leaving
    const id = uuid();
    setActiveId(id);
    sidRef.current = uuid();
    startedRef.current = false;
    dirtyRef.current = false;
    setItems([]);
    setAttachments([]);
    setInput('');
    setQuery(''); // so the new (unsaved) conversation isn't hidden by an active search filter
    if (shared) { setSourceId(''); } // a new chat is always the local assistant
  };

  const selectConv = (id: string) => {
    if (busy || id === activeId) return;
    setNavOpen(false); // close the mobile history drawer
    const meta = convs.find((c) => c.id === id);
    if (!meta) return;
    flushPending(); // save the conversation we're leaving before loading the new one
    if (shared) setSourceId('');
    setActiveId(id);
    openRef.current = id;
    sidRef.current = meta.sessionId;
    const body = loadBody(uid, id);
    startedRef.current = body.length > 0;
    dirtyRef.current = false;
    setItems(body);
    setAttachments([]);
    setInput('');
    setQuery('');
    // Not on this device yet (e.g. a desktop chat opened on the web) → pull its body from the server.
    // Show the opening loader (not the empty hero) while it hydrates.
    if (!body.length && signedIn && !shared) { setOpening(true); void hydrateBodyFromServer(id); }
  };

  const deleteConv = (id: string) => {
    if (busy) return; // don't delete a conversation while a turn is running into it
    modal.confirm({
      title: tr('chat.deleteConvTitle', 'Xoá cuộc trò chuyện này?'),
      content: tr('chat.deleteConvContent', 'Cuộc trò chuyện này sẽ bị xoá và không thể khôi phục.'),
      okText: tr('chat.delete', 'Xoá'),
      okButtonProps: { danger: true },
      cancelText: tr('chat.cancel', 'Huỷ'),
      onOk: () => {
        if (busy) return;
        delBody(uid, id);
        if (signedIn) void accountApi.chatDeleteConv(id).catch(() => undefined);
        // Functional update: a debounced save may have added/bumped another conv while the
        // dialog was open — don't clobber the index with a stale snapshot.
        setConvs((prev) => {
          const next = prev.filter((c) => c.id !== id);
          saveIndex(uid, next);
          return next;
        });
        notifyRail();
        if (id === activeId) {
          const fallback = convs.filter((c) => c.id !== id);
          if (fallback.length) selectConv(fallback[0].id);
          else newChat();
        }
      },
    });
  };

  const commitRename = (id: string) => {
    const title = renameText.trim().slice(0, 60);
    setRenamingId('');
    if (!title) return;
    setConvs((prev) => {
      const next = prev.map((c) => (c.id === id ? { ...c, title } : c));
      saveIndex(uid, next);
      return next;
    });
    notifyRail();
  };

  // ── Projects / pinning / library ───────────────────────────────────────────
  const updateConv = (id: string, patch: Partial<ConvMeta>) => {
    setConvs((prev) => {
      const next = prev.map((c) => (c.id === id ? { ...c, ...patch } : c));
      saveIndex(uid, next);
      return next;
    });
    notifyRail();
  };
  const togglePin = (id: string) => {
    setConvs((prev) => {
      const next = prev.map((c) => (c.id === id ? { ...c, pinned: !c.pinned } : c));
      saveIndex(uid, next);
      return next;
    });
    notifyRail();
  };
  const moveConv = (id: string, projectId?: string) => updateConv(id, { projectId });

  const persistProjects = (list: Project[]) => { setProjects(list); saveProjects(uid, list); };
  const submitProjModal = () => {
    const name = projName.trim().slice(0, 40);
    const m = projModal;
    setProjModal(null);
    setProjName('');
    if (!m || !name) return;
    if (m.mode === 'rename' && m.id) {
      persistProjects(projects.map((p) => (p.id === m.id ? { ...p, name } : p)));
    } else {
      const p: Project = { id: uuid(), name };
      persistProjects([p, ...projects]);
      if (m.forConv) moveConv(m.forConv, p.id); // create-and-assign
    }
  };
  const deleteProject = (id: string) =>
    modal.confirm({
      title: tr('chat.deleteProjTitle', 'Xoá project này?'),
      content: tr('chat.deleteProjContent', 'Các hội thoại trong project sẽ chuyển về "Chats" (không bị xoá).'),
      okText: tr('chat.delete', 'Xoá'), okButtonProps: { danger: true }, cancelText: tr('chat.cancel', 'Huỷ'),
      onOk: () => {
        persistProjects(projects.filter((p) => p.id !== id));
        setConvs((prev) => {
          const next = prev.map((c) => (c.projectId === id ? { ...c, projectId: undefined } : c));
          saveIndex(uid, next);
          return next;
        });
      },
    });

  const openLibrary = async () => {
    setLibraryOpen(true);
    let list = await libList(uid); // newest-first
    if (list.length > LIB_CAP) {
      const extra = list.slice(LIB_CAP); // oldest beyond the cap
      await Promise.all(extra.map((e) => libDel(e.id)));
      list = list.slice(0, LIB_CAP);
    }
    setLibItems(list);
  };
  const removeLibItem = async (id: string) => { await libDel(id); setLibItems((prev) => prev.filter((x) => x.id !== id)); };
  const reuseLibItem = (it: LibItem) => {
    if (shared) {
      // Leaving the ephemeral shared chat: reload the local conversation so the next send doesn't
      // overwrite it with the shared transcript (mirrors the source Select / selectConv).
      setSourceId('');
      const body = loadBody(uid, activeId);
      startedRef.current = body.length > 0;
      dirtyRef.current = false;
      setItems(body);
    }
    // libId tags this as an already-stored file so send() won't duplicate it in the Library.
    setAttachments((prev) => [...prev, { name: it.name, dataBase64: it.dataBase64, isImage: it.isImage, mime: it.mime, libId: it.id }].slice(0, 12));
    setLibraryOpen(false);
  };
  const downloadLibItem = (it: LibItem) => {
    try {
      const a = document.createElement('a');
      a.href = `data:${it.mime || 'application/octet-stream'};base64,${it.dataBase64}`;
      a.download = it.name || 'file';
      a.click();
    } catch { /* ignore */ }
  };

  // The active conversation may be brand-new (not yet in the saved index) — show it at the top.
  const activeSaved = convs.some((c) => c.id === activeId);
  const q = query.trim().toLowerCase();
  const matches = (c: ConvMeta) => !q || (c.title || '').toLowerCase().includes(q);
  const visible = convs.filter(matches);
  const pinnedConvs = visible.filter((c) => c.pinned);
  const projectConvs = (pid: string) => visible.filter((c) => c.projectId === pid && !c.pinned);
  // "Chats" = not pinned and not in an existing project.
  const looseConvs = visible.filter((c) => !c.pinned && (!c.projectId || !projects.some((p) => p.id === c.projectId)));
  const groups = groupConvs(looseConvs);
  // The last assistant message gets the "regenerate" action (only the latest turn can be re-run).
  let lastAssistantId = '';
  for (let k = items.length - 1; k >= 0; k--) {
    const it = items[k];
    if (it.kind === 'msg' && it.role === 'assistant') { lastAssistantId = it.id; break; }
  }

  /**
   * Record how long the turn took on the assistant bubble that just finished.
   *
   * Wall-clock from "user pressed send" to "the answer stopped" — the number the user actually
   * feels. Only the LAST assistant message is stamped, and only once, so a re-render or a second
   * turn never rewrites an earlier one.
   */
  const stampDuration = (startedAt: number) => {
    const durMs = Date.now() - startedAt;
    setItems((prev) => {
      for (let k = prev.length - 1; k >= 0; k--) {
        const it = prev[k];
        if (it.kind !== 'msg' || it.role !== 'assistant') continue;
        if (it.durMs !== undefined) return prev;
        const next = prev.slice();
        next[k] = { ...it, durMs };
        return next;
      }
      return prev;
    });
  };

  /**
   * Preview a file the user already SENT. Its bytes are not on the message — they live in the
   * local Library (IndexedDB) that `libPut` wrote at send time — so look it up by name, newest
   * first (the same name can be attached more than once).
   */
  const openSentFile = (name: string) => {
    void libFind(uid, name)
      .then(({ item, expired }) => {
        if (expired) {
          // Phân biệt rõ hai chuyện: tệp ĐÃ TỪNG có và bị xoá theo hạn, với tệp chưa bao giờ được
          // giữ trên máy này. Người dùng cần biết mình mất gì vì lý do gì.
          message.info(
            tr('chat.fileExpired', 'Tệp "{name}" đã bị xoá vì quá hạn lưu trữ 30 ngày.', { name }),
          );
          return;
        }
        if (!item) {
          message.info(tr('chat.fileGone', 'Không còn giữ nội dung tệp này trên máy bạn để xem lại.'));
          return;
        }
        setPreview({ name: item.name, mime: item.mime, dataBase64: item.dataBase64, isImage: item.isImage });
      })
      .catch(() => message.info(tr('chat.fileGone', 'Không còn giữ nội dung tệp này trên máy bạn để xem lại.')));
  };

  /** Open the details of the skill a "/lệnh" chip refers to (body loaded on demand). */
  const openSkillInfo = (item: SlashCommandItem) => {
    setSkillInfo({ item, loading: !!runtime.readSkill });
    if (!runtime.readSkill) return;
    void runtime
      .readSkill(item.id)
      .then((r) => setSkillInfo((p) => (p && p.item.id === item.id ? { ...p, body: r.instructions, loading: false } : p)))
      .catch(() => setSkillInfo((p) => (p ? { ...p, loading: false } : p)));
  };

  // ── Composer (rendered centered when empty, pinned at bottom when chatting) ──
  const sendDisabled = !!blocked || (!input.trim() && !(shared ? false : attachments.length));
  const composer = (
    // position:relative — the "/" popup opens upward, anchored to this wrapper.
    <div style={{ width: '100%', position: 'relative' }}>
      {slash.menu}
      {blocked && (
        <Alert type="warning" showIcon message={blocked} style={{ marginBottom: 8, borderRadius: 12 }} />
      )}
      <div style={{ border: `1px solid ${composerFocused ? BRAND : V.border}`, borderRadius: 20, background: V.surface, padding: '10px 12px', boxShadow: composerFocused ? `0 0 0 3px ${BRAND}22, ${CARD_SHADOW}` : CARD_SHADOW, opacity: blocked ? 0.6 : 1, transition: 'border-color .16s ease, box-shadow .16s ease' }}>
        {attachments.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {attachments.map((a, i) => (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '3px 8px', borderRadius: 8, background: V.surfaceMuted, border: `1px solid ${V.border}` }}>
                {a.isImage ? '🖼' : <FileOutlined />}{' '}
                {/* Clickable: the point is to check "did I pick the right file, and can the AI
                    actually read it?" BEFORE spending a turn — see AttachmentPreview. */}
                <Tooltip title={tr('chat.previewOpen', 'Bấm để xem trước nội dung')}>
                  <span
                    onClick={() => setPreview({ name: a.name, mime: a.mime, dataBase64: a.dataBase64, isImage: a.isImage })}
                    style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer', textDecoration: 'underline dotted', textUnderlineOffset: 2 }}
                  >
                    {a.name}
                  </span>
                </Tooltip>
                <CloseOutlined style={{ fontSize: 10, cursor: 'pointer', color: V.textFaint }} onClick={() => setAttachments((p) => p.filter((_, j) => j !== i))} />
              </span>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="image/*,.pdf,.txt,.md,.csv,.json,.docx,.doc,.xlsx,.pptx"
            style={{ display: 'none' }}
            onChange={(e) => { void pickFiles(e.target.files); e.target.value = ''; }}
          />
          <Dropdown
            trigger={['click']}
            disabled={!!blocked}
            placement="topLeft"
            menu={{
              items: [
                { key: 'attach', icon: <PaperClipOutlined />, label: tr('chat.addFilesPhotos', 'Thêm ảnh / tệp'), disabled: busy || shared },
                // Always offered (not gated on having authored one): the "/" menu carries built-in
                // commands + "Tạo lệnh mới" even for a user with no skills yet.
                ...(!shared ? [{ key: 'slash', icon: <ThunderboltOutlined />, label: tr('chat.slashSkills', 'Lệnh nhanh (gõ /)') }] : []),
                ...(embedded ? [{ key: 'skills', icon: <ExperimentOutlined />, label: tr('nav.skills', 'Skills') }] : []),
              ],
              onClick: ({ key }) => {
                if (key === 'attach') fileRef.current?.click();
                else if (key === 'slash') openSlashMenu();
                else if (key === 'skills') goSkills();
              },
            }}
          >
            <Button type="text" icon={<PlusOutlined />} aria-label={tr('chat.addMenu', 'Thêm')} disabled={!!blocked} />
          </Dropdown>
          <textarea
            ref={taRef}
            value={input}
            disabled={!!blocked}
            onChange={(e) => setInput(e.target.value)}
            onPaste={(e) => void pasteFiles(e)}
            onFocus={() => {
              setComposerFocused(true);
              // A skill created since mount should show up without a reload.
              if (!slashRefreshed.current) { slashRefreshed.current = true; void loadSlashCmds(); }
            }}
            onBlur={() => setComposerFocused(false)}
            onKeyDown={(e) => {
              if (slash.handleKeyDown(e)) return; // the "/" menu owns ↑↓ / Enter / Tab / Esc while open
              if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return; // IME candidate commit
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); }
            }}
            placeholder={blocked ? tr('chat.computerOffline', 'Máy tính chưa online…') : shared ? `${tr('chat.askAssistantOf', 'Hỏi trợ lý của')} ${ownerName(source)}…` : isMobile ? tr('chat.messageAssistantShort', 'Nhắn cho trợ lý…') : tr('chat.messageAssistant', 'Nhắn cho trợ lý…  (Enter để gửi, Shift+Enter xuống dòng, dán ảnh bằng Ctrl/Cmd+V)')}
            rows={2}
            style={{ flex: 1, minWidth: 0, resize: 'none', border: 'none', outline: 'none', background: 'transparent', color: V.text, fontSize: 14.5, fontFamily: 'inherit', minHeight: 46, maxHeight: 220, lineHeight: 1.5, padding: '6px 0' }}
          />
          {busy ? (
            <Tooltip title={tr('chat.stop', 'Dừng')}>
              <Button
                danger
                shape="circle"
                icon={<StopOutlined />}
                onClick={() => {
                  // Dừng phải tác động đúng ĐƯỜNG đang chạy: relay (chờ máy bạn bè), hosted
                  // (luồng trên máy chủ) hay cục bộ (khoá AI dùng chung) là ba thứ khác nhau.
                  if (relayBusy) relayCancel.current = true;
                  if (hostedBusy) {
                    hostedCancel.current = true;
                    setHostedBusy(false);
                    setTurnStartedAt(null);
                  }
                  if (localBusy || !hostedBusy) void runtime.agentUnlock?.();
                  message.info(tr('chat.stopping', 'Đã dừng lượt trả lời.'));
                }}
                style={{ width: 40, height: 40, minWidth: 40 }}
              />
            </Tooltip>
          ) : (
            <button
              type="button"
              onClick={() => void send()}
              disabled={sendDisabled}
              title={tr('chat.sendEnter', 'Gửi (Enter)')}
              style={{
                width: 40, height: 40, minWidth: 40, borderRadius: '50%', border: 'none',
                cursor: sendDisabled ? 'not-allowed' : 'pointer', color: '#fff', fontSize: 16,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: sendDisabled ? V.surfaceMuted : BRAND_GRADIENT,
                boxShadow: sendDisabled ? 'none' : `0 4px 14px ${BRAND}55`,
                transition: 'transform .12s ease, box-shadow .12s ease, background .2s ease',
              }}
              onMouseEnter={(e) => { if (!sendDisabled) e.currentTarget.style.transform = 'scale(1.07)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; }}
            >
              <SendOutlined style={{ color: sendDisabled ? V.textFaint : '#fff' }} />
            </button>
          )}
        </div>
      </div>
      <div style={{ textAlign: 'center', fontSize: 11, color: V.textSub, marginTop: 6 }}>
        {shared
          ? `${tr('chat.runsOnMachineOf', 'Chạy trên máy của')} ${ownerName(source)} ${tr('chat.readOnlyNoPrivate', '· chỉ đọc — không truy cập dữ liệu riêng của họ.')}`
          : tr('chat.aiDisclaimer', 'Trợ lý AI có thể mắc lỗi. Hãy kiểm chứng những thông tin quan trọng.')}
      </div>
    </div>
  );

  const convRow = (c: ConvMeta) => {
    const active = c.id === activeId && !shared;
    const menuItems: MenuProps['items'] = [
      { key: 'pin', icon: <PushpinOutlined />, label: c.pinned ? tr('chat.unpin', 'Bỏ ghim') : tr('chat.pinTop', 'Ghim lên đầu') },
      {
        key: 'move',
        icon: <FolderOutlined />,
        label: tr('chat.moveToProject', 'Chuyển vào project'),
        children: [
          ...projects.map((p) => ({ key: `mv:${p.id}`, label: p.name, disabled: c.projectId === p.id })),
          { key: 'mv:new', icon: <FolderAddOutlined />, label: tr('chat.newProjectDots', 'Project mới…') },
          ...(c.projectId ? [{ type: 'divider' as const }, { key: 'mv:none', label: tr('chat.removeFromProject', 'Bỏ khỏi project') }] : []),
        ],
      },
      { key: 'rename', icon: <EditOutlined />, label: tr('chat.rename', 'Đổi tên') },
      { type: 'divider' },
      { key: 'del', icon: <DeleteOutlined />, label: tr('chat.delete', 'Xoá'), danger: true },
    ];
    const onMenu: MenuProps['onClick'] = ({ key }) => {
      if (key === 'pin') togglePin(c.id);
      else if (key === 'rename') { setRenamingId(c.id); setRenameText(c.title); }
      else if (key === 'del') deleteConv(c.id);
      else if (key === 'mv:none') moveConv(c.id, undefined);
      else if (key === 'mv:new') { setProjName(''); setProjModal({ mode: 'new', forConv: c.id }); }
      else if (key.startsWith('mv:')) moveConv(c.id, key.slice(3));
    };
    return (
      <div
        key={c.id}
        onClick={() => selectConv(c.id)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '7px 9px', borderRadius: 9, cursor: 'pointer',
          background: active ? `${BRAND}14` : 'transparent', marginBottom: 1,
        }}
        onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = V.surfaceAlt; }}
        onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
      >
        {renamingId === c.id ? (
          <Input
            size="small"
            autoFocus
            value={renameText}
            onChange={(e) => setRenameText(e.target.value)}
            onPressEnter={() => commitRename(c.id)}
            onBlur={() => commitRename(c.id)}
            onClick={(e) => e.stopPropagation()}
            style={{ flex: 1 }}
          />
        ) : (
          <>
            {c.pinned && <PushpinFilled style={{ fontSize: 10, color: active ? BRAND : V.textFaint }} />}
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, fontWeight: active ? 600 : 400, color: active ? BRAND : V.textSub }}>
              {c.title || tr('chat.conversation', 'Cuộc trò chuyện')}
            </span>
            <Dropdown menu={{ items: menuItems, onClick: onMenu }} trigger={['click']} placement="bottomRight">
              <MoreOutlined onClick={(e) => e.stopPropagation()} style={{ fontSize: 14, color: V.textFaint, opacity: 0.65 }} />
            </Dropdown>
          </>
        )}
      </div>
    );
  };

  const projectFolder = (p: Project) => {
    const cs = projectConvs(p.id);
    const isCollapsed = collapsed[p.id];
    const menu: MenuProps['items'] = [
      { key: 'rename', icon: <EditOutlined />, label: tr('chat.renameProject', 'Đổi tên project') },
      { key: 'del', icon: <DeleteOutlined />, label: tr('chat.deleteProjectLabel', 'Xoá project'), danger: true },
    ];
    return (
      <div key={p.id} style={{ marginBottom: 3 }}>
        <div
          onClick={() => setCollapsed((s) => ({ ...s, [p.id]: !s[p.id] }))}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderRadius: 8, cursor: 'pointer' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = V.surfaceAlt; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          {isCollapsed ? <RightOutlined style={{ fontSize: 9, color: V.textFaint }} /> : <DownOutlined style={{ fontSize: 9, color: V.textFaint }} />}
          {isCollapsed ? <FolderOutlined style={{ fontSize: 13, color: BRAND }} /> : <FolderOpenOutlined style={{ fontSize: 13, color: BRAND }} />}
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, fontWeight: 600, color: V.text }}>{p.name}</span>
          {cs.length > 0 && <span style={{ fontSize: 11, color: V.textFaint }}>{cs.length}</span>}
          <Dropdown
            menu={{ items: menu, onClick: ({ key, domEvent }) => { domEvent.stopPropagation(); if (key === 'rename') { setProjName(p.name); setProjModal({ mode: 'rename', id: p.id }); } else deleteProject(p.id); } }}
            trigger={['click']}
            placement="bottomRight"
          >
            <MoreOutlined onClick={(e) => e.stopPropagation()} style={{ fontSize: 14, color: V.textFaint, opacity: 0.65 }} />
          </Dropdown>
        </div>
        {!isCollapsed && (
          <div style={{ paddingLeft: 12 }}>
            {cs.length ? cs.map(convRow) : <div style={{ fontSize: 12, color: V.textFaint, padding: '4px 8px' }}>{tr('chat.emptyFolder', 'Trống — chuyển hội thoại vào đây')}</div>}
          </div>
        )}
      </div>
    );
  };

  // Header conversation menu (embedded /agents-chat workspace): same actions as a sidebar row.
  const activeConv = convs.find((c) => c.id === activeId);
  const hdrTitle = activeConv?.title?.trim() || tr('chat.newConversation', 'Cuộc trò chuyện mới');
  const hdrMenuItems: MenuProps['items'] = activeConv
    ? [
        { key: 'pin', icon: <PushpinOutlined />, label: activeConv.pinned ? tr('chat.unpin', 'Bỏ ghim') : tr('chat.pinTop', 'Ghim lên đầu') },
        {
          key: 'move',
          icon: <FolderOutlined />,
          label: tr('chat.moveToProject', 'Chuyển vào project'),
          children: [
            ...projects.map((p) => ({ key: `mv:${p.id}`, label: p.name, disabled: activeConv.projectId === p.id })),
            { key: 'mv:new', icon: <FolderAddOutlined />, label: tr('chat.newProjectDots', 'Project mới…') },
            ...(activeConv.projectId ? [{ type: 'divider' as const }, { key: 'mv:none', label: tr('chat.removeFromProject', 'Bỏ khỏi project') }] : []),
          ],
        },
        { key: 'rename', icon: <EditOutlined />, label: tr('chat.rename', 'Đổi tên') },
        { key: 'sharepub', icon: <ShareAltOutlined />, label: tr('chat.sharePublicLink', 'Chia sẻ (link công khai)') },
        { type: 'divider' },
        { key: 'del', icon: <DeleteOutlined />, label: tr('chat.delete', 'Xoá'), danger: true },
      ]
    : [];
  const hdrMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (!activeConv) return;
    const id = activeConv.id;
    if (key === 'pin') togglePin(id);
    else if (key === 'rename') setHdrRename({ id, val: activeConv.title || '' });
    else if (key === 'del') deleteConv(id);
    else if (key === 'sharepub') void openConvShare(id);
    else if (key === 'mv:none') moveConv(id, undefined);
    else if (key === 'mv:new') { setProjName(''); setProjModal({ mode: 'new', forConv: id }); }
    else if (key.startsWith('mv:')) moveConv(id, key.slice(3));
  };

  return (
    <div style={{ display: 'flex', height: fill ? '100%' : 'calc(100vh - 104px)', minHeight: 0, minWidth: 0, width: '100%', position: 'relative', overflowX: 'hidden' }}>
      {/* LEFT: conversation history (ChatGPT-style) — inline on a wide screen; a slide-in overlay
          (with backdrop) on a phone / narrow web view so the chat keeps the full width.
          Hidden entirely when `embedded` — the /agents-chat workspace supplies its own conversation rail. */}
      {!embedded && (<>
      {narrow && navOpen && (
        <div onClick={() => setNavOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 25 }} />
      )}
      <div
        style={
          narrow
            ? {
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: 0,
                width: Math.min(300, typeof window !== 'undefined' ? window.innerWidth - 48 : 300),
                background: V.layer,
                borderRight: `1px solid ${V.border}`,
                display: 'flex',
                flexDirection: 'column',
                padding: 12,
                zIndex: 26,
                transform: navOpen ? 'translateX(0)' : 'translateX(-112%)',
                transition: 'transform .22s ease',
                boxShadow: navOpen ? '2px 0 18px rgba(0,0,0,0.18)' : 'none',
              }
            : { width: 260, minWidth: 260, background: V.layer, borderRight: `1px solid ${V.border}`, display: 'flex', flexDirection: 'column', padding: '10px 12px 0' }
        }
      >
        <Button type="primary" block icon={<PlusOutlined />} disabled={busy} onClick={newChat} style={{ fontWeight: 600, height: 40, borderRadius: 12 }}>
          {tr('chat.newConversation', 'Cuộc trò chuyện mới')}
        </Button>
        <Input
          allowClear
          size="small"
          prefix={<SearchOutlined style={{ color: V.textFaint }} />}
          placeholder={tr('chat.searchConversations', 'Tìm hội thoại…')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ marginTop: 9 }}
        />
        <Button block size="small" icon={<FolderOpenOutlined />} onClick={() => void openLibrary()} style={{ marginTop: 8, justifyContent: 'flex-start', display: 'flex', alignItems: 'center' }}>
          {tr('chat.fileLibrary', 'Thư viện tệp')}
        </Button>
        {signedIn && (
          <Tooltip title={syncedAt ? `${tr('chat.syncedAt', 'Đã đồng bộ lúc')} ${new Date(syncedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} ${tr('chat.historyMatches', '— lịch sử khớp giữa máy tính và web')}` : tr('chat.syncHistoryTip', 'Đồng bộ lịch sử hội thoại giữa máy tính và web')}>
            <Button
              block
              size="small"
              icon={<SyncOutlined spin={syncing} />}
              loading={syncing}
              onClick={() => void syncNow()}
              style={{ marginTop: 8, justifyContent: 'flex-start', display: 'flex', alignItems: 'center' }}
            >
              {syncing ? tr('chat.syncing', 'Đang đồng bộ…') : syncedAt ? `${tr('chat.sync', 'Đồng bộ')} · ${new Date(syncedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}` : tr('chat.sync', 'Đồng bộ')}
            </Button>
          </Tooltip>
        )}

        {received.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <div style={GROUP_LABEL}>{tr('chat.assistantGroup', 'TRỢ LÝ')}</div>
            <Select
              size="small"
              value={sourceId}
              disabled={busy}
              style={{ width: '100%' }}
              onChange={(v) => {
                flushPending(); // save the local conversation before switching assistant
                setSourceId(v);
                setInput('');
                setAttachments([]);
                dirtyRef.current = false;
                setItems(v ? [] : loadBody(uid, activeId));
              }}
              options={[
                { value: '', label: tr('chat.myAssistant', 'Trợ lý của tôi') },
                ...received.map((g) => ({ value: g.id, label: `${tr('chat.assistantOfName', 'Trợ lý của')} ${ownerName(g)}` })),
              ]}
            />
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto', marginTop: 12 }}>
          {shared ? (
            <div style={{ fontSize: 12, color: V.textFaint, padding: '6px 4px', lineHeight: 1.5 }}>
              {tr('chat.usingAssistantOf', 'Đang dùng trợ lý của')} <b style={{ color: V.textSub }}>{ownerName(source)}</b> {tr('chat.instantNoHistory', '— hỏi–đáp tức thời, không lưu lịch sử.')}
            </div>
          ) : q ? (
            visible.length === 0 ? (
              <div style={{ fontSize: 12, color: V.textFaint, padding: '6px 4px' }}>{tr('chat.noConvFound', 'Không tìm thấy hội thoại nào')}</div>
            ) : (
              <div>{visible.map(convRow)}</div>
            )
          ) : (
            <>
              {!activeSaved && (
                <div style={{ marginBottom: 12 }}>
                  <div style={GROUP_LABEL}>{tr('chat.current', 'HIỆN TẠI')}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 9px', borderRadius: 9, background: `${BRAND}14` }}>
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, fontWeight: 600, color: BRAND }}>
                      {tr('chat.newConversation', 'Cuộc trò chuyện mới')}
                    </span>
                  </div>
                </div>
              )}

              {pinnedConvs.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={GROUP_LABEL}><PushpinFilled style={{ fontSize: 10, marginRight: 4 }} />{tr('chat.pinnedGroup', 'ĐÃ GHIM')}</div>
                  {pinnedConvs.map(convRow)}
                </div>
              )}

              <div style={{ marginBottom: 12 }}>
                <div style={{ ...GROUP_LABEL, display: 'flex', alignItems: 'center' }}>
                  <span style={{ flex: 1 }}>PROJECTS</span>
                  <Tooltip title={tr('chat.createNewProject', 'Tạo project mới')}>
                    <FolderAddOutlined style={{ cursor: 'pointer', fontSize: 13 }} onClick={() => { setProjName(''); setProjModal({ mode: 'new' }); }} />
                  </Tooltip>
                </div>
                {projects.length === 0 ? (
                  <div style={{ fontSize: 12, color: V.textFaint, padding: '2px 8px' }}>{tr('chat.noProjects', 'Chưa có project — bấm + để tạo')}</div>
                ) : (
                  projects.map(projectFolder)
                )}
              </div>

              {groups.map((g) => (
                <div key={g.label} style={{ marginBottom: 12 }}>
                  <div style={GROUP_LABEL}>{tr(`chat.bucket_${g.key}`, g.label).toUpperCase()}</div>
                  {g.items.map(convRow)}
                </div>
              ))}
              {groups.length === 0 && pinnedConvs.length === 0 && activeSaved && (
                <div style={{ fontSize: 12, color: V.textFaint, padding: '6px 4px' }}>{tr('chat.noConversations', 'Chưa có cuộc trò chuyện')}</div>
              )}
            </>
          )}
        </div>
      </div>
      </>)}

      {/* RIGHT: chat — nền caro của thương hiệu, giống mọi màn khác trong app.
          Mang class ngay tại đây chứ không dựa vào khung ngoài: AgentChat còn được nhúng ở
          /remote/chat và ở desktop, nơi khung cha có thể không có lớp caro nào. Bong bóng, thẻ
          và ô soạn vẫn giữ nền đặc nên chữ luôn nằm trên nền phẳng, lưới chỉ hiện ở khoảng trống. */}
      <div className="tw-grid-bg" style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflowX: 'hidden', backgroundColor: V.layer }}>
        {/* Header — full-width divider, content aligned to the centered message column */}
        <div style={{ borderBottom: `1px solid ${V.borderSub}`, flex: '0 0 auto' }}>
          {embedded ? (
            /* Embedded (/agents-chat) header — CSS GRID (title | share). `minmax(0,1fr)` lets the title
               truncate with … (like claude.ai) while the `auto` share column ALWAYS keeps its width,
               so Share can never be clipped, at any panel width. */
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center', gap: 8, width: '100%', boxSizing: 'border-box', padding: isMobile ? '6px 12px 10px' : '6px 16px 11px' }}>
              <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
                {!shared && activeConv ? (
                  <Dropdown trigger={['click']} menu={{ items: hdrMenuItems, onClick: hdrMenuClick }}>
                    <span style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, maxWidth: '100%', fontWeight: 600, fontSize: 15, color: V.text, padding: '3px 6px', borderRadius: 8 }}>
                      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{hdrTitle}</span>
                      <DownOutlined style={{ fontSize: 10, color: V.textFaint, flexShrink: 0 }} />
                    </span>
                  </Dropdown>
                ) : (
                  <span style={{ fontWeight: 600, fontSize: 15, color: V.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                    {shared ? `${tr('chat.assistantOfName', 'Trợ lý của')} ${ownerName(source)}` : hdrTitle}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                {localBusy && owner && <LoadingOutlined style={{ color: WARN }} />}
                {relayBusy && <LoadingOutlined style={{ color: WARN }} />}
                {/* Public share is the primary (outside) action; team/cowork sharing is nested. */}
                <Dropdown
                  trigger={['click']}
                  menu={{
                    items: [
                      { key: 'pubconv', icon: <ShareAltOutlined />, label: tr('chat.sharePublicLink', 'Chia sẻ (link công khai)'), disabled: !activeConv },
                      { type: 'divider' },
                      { key: 'team', icon: <TeamOutlined />, label: tr('chat.shareTeamCowork', 'Cộng tác nhóm / mời người…') },
                    ],
                    onClick: ({ key }) => {
                      if (key === 'pubconv') { if (activeConv) void openConvShare(activeConv.id); }
                      else if (key === 'team') setShareOpen(true);
                    },
                  }}
                >
                  <Button size="small" icon={<ShareAltOutlined />} />
                </Dropdown>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 6 : 10, minHeight: 34, boxSizing: 'border-box', padding: isMobile ? '4px 12px 10px' : '4px 24px 11px', width: '100%', maxWidth: 768, margin: '0 auto', overflow: 'hidden' }}>
              {narrow && (
                <Tooltip title={tr('chat.conversationsTip', 'Hội thoại')}>
                  <Button size="small" icon={<MenuOutlined />} onClick={() => setNavOpen(true)} style={{ flex: '0 0 auto' }} />
                </Tooltip>
              )}
              <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 9, overflow: 'hidden' }}>
                <span style={{ display: 'inline-flex', width: 26, height: 26, minWidth: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13, background: `linear-gradient(135deg, ${BRAND}, #8B7CF0)` }}>
                  <CommentOutlined />
                </span>
                <span style={{ fontWeight: 600, fontSize: 15, color: V.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {shared ? `${tr('chat.assistantOfName', 'Trợ lý của')} ${ownerName(source)}` : tr('nav.assistant', 'Trợ lý AI')}
                </span>
              </div>
              {localBusy && owner && <span style={{ fontSize: 12, color: WARN, display: 'inline-flex', alignItems: 'center', gap: 5 }}><LoadingOutlined /> {tr('chat.runningEllipsis', 'Đang chạy…')}</span>}
              {relayBusy && <span style={{ fontSize: 12, color: WARN, display: 'inline-flex', alignItems: 'center', gap: 5 }}><LoadingOutlined /> {tr('chat.asking', 'Đang hỏi')} {ownerName(source)}…</span>}
              {!shared && (
                <RunnerModelPicker
                  storageKeyRunner="tw_agent_runner"
                  storageKeyModel="tw_agent_runner_model"
                  onChange={(id, m) => { setRunnerId(id); setRunnerModel(m || ''); }}
                />
              )}
              <Tooltip title={FEATURE_FRIENDS ? tr('chat.shareAssistantTip', 'Chia sẻ Trợ lý AI cho bạn bè / lời mời') : tr('chat.createPublicLink', 'Tạo link công khai')}>
                <Button size="small" icon={<ShareAltOutlined />} onClick={() => setShareOpen(true)} style={{ flexShrink: 0 }}>{narrow ? undefined : tr('chat.share', 'Chia sẻ')}</Button>
              </Tooltip>
            </div>
          )}
        </div>

        {items.length === 0 && opening ? (
          /* Opening a conversation — a quiet loader instead of flashing the empty-state hero. */
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <LoadingOutlined style={{ fontSize: 24, color: BRAND }} />
          </div>
        ) : items.length === 0 ? (
          /* EMPTY: centered welcome + composer + suggestions (ChatGPT-style) */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: isMobile ? 16 : 22, padding: isMobile ? '8px 14px 32px' : '8px 8px 40px', overflowY: 'auto' }}>
            <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              {shared ? (
                <>
                  <span style={{ display: 'inline-flex', width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 26, background: `linear-gradient(135deg, ${BRAND}, #8B7CF0)`, boxShadow: `0 8px 24px ${BRAND}44`, marginBottom: 12 }}>
                    <CommentOutlined />
                  </span>
                  <div style={{ fontSize: isMobile ? 21 : 24, fontWeight: 700, color: V.text }}>
                    {`${tr('chat.assistantOfName', 'Trợ lý của')} ${ownerName(source)}`}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 14.5, color: V.textSub, lineHeight: 1.5 }}>
                    {tr('chat.sharedWelcome', 'Hỏi–đáp qua trợ lý chạy trên máy người chia sẻ (chỉ đọc + tra cứu web). Cần máy họ đang mở.')}
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: isMobile ? 10 : 14 }}>
                    <Spark size={isMobile ? 26 : 34} />
                    <span style={{ fontSize: isMobile ? 25 : 33, fontWeight: 500, color: V.text, fontFamily: "Georgia, 'Times New Roman', serif", letterSpacing: 0.2 }}>
                      {greetingText}{displayName ? `, ${displayName}` : ''}
                    </span>
                  </div>
                  {!embedded && (
                    <div style={{ marginTop: 10, fontSize: 14.5, color: V.textSub, lineHeight: 1.5 }}>
                      {tr('chat.localWelcome', 'Bạn đang nghĩ gì hôm nay? Hỏi bất cứ điều gì — hoặc gửi ảnh/file để mình phân tích.')}
                    </div>
                  )}
                </>
              )}
            </div>
            <div style={{ width: '100%', maxWidth: 720 }}>{composer}</div>
            {!shared && !embedded && (
              <div style={{ width: '100%', maxWidth: 720, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: 10 }}>
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s.title}
                    onClick={() => void send(tr(`chat.suggPrompt_${s.k}`, s.prompt))}
                    disabled={busy}
                    style={{ textAlign: 'left', cursor: busy ? 'default' : 'pointer', background: V.surface, border: `1px solid ${V.border}`, borderRadius: 12, padding: '11px 13px', display: 'flex', gap: 10, alignItems: 'center', transition: 'border-color .15s, transform .15s' }}
                    onMouseEnter={(e) => { if (!busy) { e.currentTarget.style.borderColor = BRAND; e.currentTarget.style.transform = 'translateY(-1px)'; } }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = V.border; e.currentTarget.style.transform = 'none'; }}
                  >
                    <span style={{ fontSize: 17, lineHeight: 1 }}>{s.icon}</span>
                    <span style={{ fontSize: 13, fontWeight: 500, color: V.textSub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tr(`chat.suggTitle_${s.k}`, s.title)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Messages */}
            <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column', gap: 18, padding: isMobile ? '8px 12px 16px' : '10px 24px 20px' }}>
              <div style={{ width: '100%', maxWidth: 768, margin: '0 auto', alignSelf: 'center', display: 'flex', flexDirection: 'column', gap: 26 }}>
                {/* Có công cụ hỏng + bản cài đã cũ → nói thẳng, không chờ trợ lý kể lại. */}
                {items.map((it) =>
                  it.kind === 'tool' ? (
                    <div key={it.id} style={{ alignSelf: 'flex-start', maxWidth: '85%', fontSize: 12.5, color: V.textSub, display: 'flex', alignItems: 'center', gap: 7, padding: '4px 10px', borderRadius: 8, background: V.surfaceAlt, border: `1px solid ${V.borderSub}` }}>
                      {/* Chấm đỏ dành cho lỗi THẬT; tầng 'blocked'/'noise' hiện xám (xem ToolCallCard). */}
                      {it.status === 'pending' ? (
                        <LoadingOutlined style={{ color: WARN }} />
                      ) : (
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            background:
                              it.status === 'ok'
                                ? OK
                                : it.status === 'denied' || (it.tier ?? 'error') !== 'error'
                                  ? V.textFaint
                                  : ERR,
                          }}
                        />
                      )}
                      <span style={{ fontFamily: 'ui-monospace, monospace' }}>{it.name}</span>
                      {it.summary && <span style={{ color: V.textFaint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>· {it.summary}</span>}
                      {/* Lỗi tool VẪN được lưu trong `it.error` nhưng trước đây không bao giờ hiện ra —
                          người dùng chỉ đọc được câu model tự viết lại, thường mơ hồ hơn hẳn nguyên
                          nhân thật ("có thể do quyền…" trong khi lỗi thật là thiếu tham số). */}
                      {it.status === 'error' && it.error && (
                        // Màu theo TẦNG, giống ToolCallCard: chấm xám mà chữ đỏ là hai nửa của
                        // cùng một dòng nói ngược nhau.
                        <span
                          style={{
                            color: (it.tier ?? 'error') === 'error' ? ERR : V.textFaint,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={it.error}
                        >
                          · {it.error}
                        </span>
                      )}
                    </div>
                  ) : it.role === 'user' ? (
                    <div key={it.id} style={{ alignSelf: 'flex-end', maxWidth: '82%', display: 'flex', gap: 8, alignItems: 'flex-start', flexDirection: 'row-reverse' }}>
                      <UserAvatar name={user?.name} avatarUrl={user?.avatarUrl} size={28} />
                      {editing?.id === it.id ? (
                        // Sửa tại chỗ. Ô sửa nền trắng chứ không giữ nền tím của bong bóng: chữ
                        // trắng trên tím rất khó soạn, và người dùng cần thấy rõ đây là ô nhập.
                        <div style={{ width: 'min(560px, 78vw)', border: `1px solid ${BRAND}`, borderRadius: 16, background: V.surface, padding: 10 }}>
                          <textarea
                            autoFocus
                            value={editing.text}
                            onChange={(e) => setEditing({ id: it.id, text: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') { e.preventDefault(); setEditing(null); }
                              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void submitEdit(); }
                            }}
                            rows={3}
                            style={{ width: '100%', resize: 'vertical', border: 'none', outline: 'none', background: 'transparent', color: V.text, fontSize: 14.5, fontFamily: 'inherit', lineHeight: 1.55 }}
                          />
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
                            <Button size="small" onClick={() => setEditing(null)}>{tr('chat.cancel', 'Huỷ')}</Button>
                            <Button size="small" type="primary" disabled={!editing.text.trim()} onClick={() => void submitEdit()}>
                              {tr('chat.sendAgain', 'Gửi lại')}
                            </Button>
                          </div>
                          <div style={{ marginTop: 4, fontSize: 11.5, color: V.textFaint }}>
                            {tr('chat.editHint', 'Gửi lại sẽ bỏ các câu trả lời phía sau tin nhắn này.')}
                          </div>
                        </div>
                      ) : (
                      <div style={{ background: BRAND, color: '#fff', padding: '10px 15px', borderRadius: 18, borderTopRightRadius: 6, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 14.5, lineHeight: 1.55, boxShadow: `0 2px 10px ${BRAND}33` }}>
                        {renderUserText(it.text, slashCmds, (item) => openSkillInfo(item), openSentFile)}
                        {it.images?.map((im, i) => (
                          <img key={i} src={im.dataUrl} alt={im.name} style={{ display: 'block', marginTop: 8, maxWidth: 220, borderRadius: 8 }} />
                        ))}
                        {!!it.ts && (
                          <div style={{ marginTop: 6, fontSize: 11, color: 'rgba(255,255,255,0.72)', textAlign: 'right', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 6 }}>
                            {!shared && !busy && (
                              <button
                                type="button"
                                onClick={() => startEdit(it.id)}
                                title={tr('chat.editAsk', 'Sửa câu hỏi và hỏi lại')}
                                style={{ border: 'none', background: 'transparent', color: 'rgba(255,255,255,0.72)', cursor: 'pointer', padding: 0, fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 3 }}
                              >
                                <EditOutlined /> {tr('chat.edit', 'Sửa')}
                              </button>
                            )}
                            {clockTime(it.ts)}
                          </div>
                        )}
                      </div>
                      )}
                    </div>
                  ) : (
                    <div key={it.id} style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
                      <span style={{ display: 'inline-flex', width: 28, height: 28, minWidth: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 14, background: `linear-gradient(135deg, ${BRAND}, #8B7CF0)` }}><CommentOutlined /></span>
                      <div style={{ flex: 1, minWidth: 0, fontSize: 14.5, lineHeight: 1.62, color: V.text, paddingTop: 1 }}>
                        <div ref={(el) => { if (el) bodyRefs.current.set(it.id, el); else bodyRefs.current.delete(it.id); }}>
                          {(() => {
                            // Lỗi xác thực/credit của runner → thẻ các bước sửa, thay cho câu lỗi tiếng Anh khó hiểu.
                            const fix = diagnoseRunnerError(it.text);
                            if (fix) return <RunnerErrorCard kind={fix.kind} raw={it.text} tr={tr} />;
                            return it.text ? <ChatMarkdown content={it.text} /> : <LoadingOutlined style={{ color: BRAND }} />;
                          })()}
                        </div>
                        {!!it.made?.length && (
                          // Tệp trợ lý tạo ra. Bấm là tải bản GỐC về máy — thứ trước đây bị vứt
                          // cùng workspace nên người dùng chỉ đọc được mô tả của một tệp không có thật.
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                            {it.made.map((f) => (
                              <button
                                key={f.uploadId ?? f.path ?? f.name}
                                type="button"
                                onClick={() => void downloadMade(f)}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
                                  border: `1px solid ${V.border}`, background: V.surface, borderRadius: 12,
                                  padding: '9px 12px', cursor: 'pointer', maxWidth: 420,
                                }}
                              >
                                <span style={{ fontSize: 18 }}>{fileEmoji(f.name)}</span>
                                <span style={{ minWidth: 0, flex: 1 }}>
                                  <span style={{ display: 'block', color: V.text, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {f.name}
                                  </span>
                                  <span style={{ display: 'block', color: V.textFaint, fontSize: 11.5 }}>
                                    {(f.size / 1024).toFixed(0)} KB · {tr('chat.tapToDownload', 'bấm để tải về')}
                                  </span>
                                </span>
                                <DownloadOutlined style={{ color: BRAND }} />
                              </button>
                            ))}
                          </div>
                        )}
                        {it.images?.map((im, i) => (
                          // Constrain the antd Image WRAPPER (not just the <img>) so the hover
                          // "Preview" mask fits the picture exactly — no leftover grey box.
                          <div key={i} style={{ marginTop: 10, maxWidth: 420 }}>
                            <Image
                              src={im.dataUrl}
                              alt={im.name}
                              wrapperStyle={{ width: '100%', display: 'block' }}
                              style={{ width: '100%', height: 'auto', borderRadius: 12, display: 'block' }}
                            />
                          </div>
                        ))}
                        {/* BIỂU MẪU ĐIỀN NHANH. Khi trợ lý hỏi một loạt thông tin, bắt người dùng
                            gõ lại "1. …, 2. …, 3. …" là bắt họ làm việc của máy. Chỉ hiện ở câu
                            trả lời CUỐI: các câu cũ đã được trả lời rồi. */}
                        {it.id === lastAssistantId && !busy && !shared && (() => {
                          // Truyền cả câu hỏi của người dùng: khi CHÍNH HỌ hỏi "còn thiếu gì",
                          // câu trả lời thường là danh sách trần không có tiêu đề nào để bám vào.
                          const askIdx = items.findIndex((x) => x.id === it.id);
                          const prevAsk = items
                            .slice(0, askIdx)
                            .reverse()
                            .find((x) => x.kind === 'msg' && x.role === 'user') as
                            | Extract<Item, { kind: 'msg' }>
                            | undefined;
                          const fields = parseAskedFields(it.text, prevAsk?.text ?? '');
                          if (!fields.length) return null;
                          return (
                            <div style={{ marginTop: 12, border: `1px solid ${V.border}`, borderRadius: 14, background: V.surface, padding: 12 }}>
                              <div style={{ fontSize: 12.5, color: V.textSub, marginBottom: 8 }}>
                                {tr('chat.fillHere', 'Điền nhanh rồi gửi — bỏ trống mục nào cũng được.')}
                              </div>
                              {fields.map((f) => (
                                <div key={f.no} style={{ marginBottom: 8 }}>
                                  <div style={{ fontSize: 12.5, color: V.text, marginBottom: 3 }}>
                                    <b>{f.no}.</b> {f.label}
                                  </div>
                                  <Input
                                    size="small"
                                    value={answers[`${it.id}:${f.no}`] ?? ''}
                                    onChange={(e) => setAnswers((p) => ({ ...p, [`${it.id}:${f.no}`]: e.target.value }))}
                                    onPressEnter={() => void sendAnswers(it.id, fields)}
                                    placeholder={tr('chat.yourAnswer', 'Trả lời của bạn…')}
                                  />
                                </div>
                              ))}
                              <div style={{ marginBottom: 8 }}>
                                <div style={{ fontSize: 12.5, color: V.text, marginBottom: 3 }}>
                                  {tr('chat.otherNote', 'Ghi chú thêm (không bắt buộc)')}
                                </div>
                                <Input.TextArea
                                  rows={2}
                                  value={answers[`${it.id}:other`] ?? ''}
                                  onChange={(e) => setAnswers((p) => ({ ...p, [`${it.id}:other`]: e.target.value }))}
                                  placeholder={tr('chat.otherPlaceholder', 'Điều gì khác bạn muốn nói thêm…')}
                                />
                              </div>
                              <Button type="primary" size="small" onClick={() => void sendAnswers(it.id, fields)}>
                                {tr('chat.sendAnswers', 'Gửi các câu trả lời')}
                              </Button>
                            </div>
                          );
                        })()}
                        {it.text && !busy && (
                          <div style={{ display: 'flex', gap: 2, marginTop: 2, marginLeft: -6, alignItems: 'center' }}>
                            {(!!it.ts || !!it.durMs) && (
                              <span style={{ fontSize: 11, color: V.textFaint, marginLeft: 6, marginRight: 4 }}>
                                {clockTime(it.ts)}
                                {/* Wall-clock the user actually waited — the honest number, not model time. */}
                                {it.durMs ? ` · ${tr('chat.tookTime', 'mất {d}', { d: humanDuration(it.durMs) })}` : ''}
                              </span>
                            )}
                            <Tooltip title={tr('chat.copy', 'Sao chép')}>
                              <Button type="text" size="small" icon={<CopyOutlined />} style={{ color: V.textFaint }} onClick={() => copyMsg(it.text)} />
                            </Tooltip>
                            <Tooltip title={tr('chat.savePdf', 'Lưu câu trả lời này thành PDF')}>
                              <Button type="text" size="small" icon={<FilePdfOutlined />} style={{ color: V.textFaint }} onClick={() => savePdf(it.id)} />
                            </Tooltip>
                            {it.id === lastAssistantId && !shared && (
                              <Tooltip title={tr('chat.regenerate', 'Tạo lại câu trả lời')}>
                                <Button type="text" size="small" icon={<ReloadOutlined />} style={{ color: V.textFaint }} onClick={() => void regenerate()} />
                              </Tooltip>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ),
                )}
                {/* CHỈ BÁO ĐANG CHẠY. Trước đây nó chỉ hiện khi tin cuối là của NGƯỜI DÙNG — nên
                    vừa có chữ đầu tiên ("I'll read the attached file first.") là biến mất, dù lượt
                    còn chạy thêm 5 phút. Người dùng ngồi nhìn một câu đứng im, không biết còn sống
                    hay đã chết. Nay hiện suốt lượt, kèm ĐỒNG HỒ ĐẾM để thấy rõ nó đang nhúc nhích. */}
                {busy && items.length > 0 && (
                  <div style={{ display: 'flex', gap: 11, alignItems: 'center' }}>
                    <span style={{ display: 'inline-flex', width: 28, height: 28, minWidth: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 14, background: `linear-gradient(135deg, ${BRAND}, #8B7CF0)` }}>
                      <CommentOutlined />
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, color: V.textSub, fontSize: 14 }}>
                      <span className="tw-typing"><i /><i /><i /></span>
                      {tr('chat.working', 'Trợ lý đang làm…')}
                      {turnStartedAt ? (
                        <span style={{ color: V.textFaint, fontSize: 12.5 }}>
                          {humanDuration(nowTick - turnStartedAt)}
                        </span>
                      ) : null}
                    </span>
                  </div>
                )}
              </div>
            </div>
            {/* Thẻ "bản cài đã cũ" nằm NGOÀI vùng cuộn, ngay trên ô soạn.
                Đặt trong dòng chảy tin nhắn thì nó trôi mất: cả hai khung chat tự cuộn xuống đáy
                sau mỗi lượt, mà hội thoại đủ dài để có tool hỏng thì cũng đủ dài để đẩy thẻ ra
                ngoài màn hình. Ở đây thì không thể bị cuộn mất, và không phụ thuộc thời điểm
                `needsReinstall` về (nó đến bất đồng bộ, sau lần cuộn cuối).
                CHỈ hiện khi main phân loại thất bại là đáng ngờ do ứng dụng — lỗi quyền/mạng/giới
                hạn thì cài lại bao nhiêu lần cũng vậy. */}
            <div style={{ width: '100%', maxWidth: 768, margin: '0 auto', alignSelf: 'center', padding: isMobile ? '0 12px' : '0 24px' }}>
              <UpdateHintCard visible={items.some((x) => x.kind === 'tool' && x.suspectAppBug === true)} />
            </div>
            {/* Composer pinned at bottom */}
            <div style={{ width: '100%', maxWidth: 768, margin: '0 auto', alignSelf: 'center', padding: isMobile ? '0 12px 6px' : '0 24px' }}>{composer}</div>
          </>
        )}
      </div>

      <Modal
        open={!!projModal}
        title={projModal?.mode === 'rename' ? tr('chat.renameProject', 'Đổi tên project') : tr('chat.newProject', 'Project mới')}
        onCancel={() => { setProjModal(null); setProjName(''); }}
        onOk={submitProjModal}
        okText={projModal?.mode === 'rename' ? tr('chat.save', 'Lưu') : tr('chat.create', 'Tạo')}
        cancelText={tr('chat.cancel', 'Huỷ')}
        okButtonProps={{ disabled: !projName.trim() }}
        destroyOnClose
      >
        <Input
          autoFocus
          placeholder={tr('chat.projectNamePlaceholder', 'Tên project (vd: Công việc, Marketing…)')}
          value={projName}
          onChange={(e) => setProjName(e.target.value)}
          onPressEnter={submitProjModal}
          maxLength={40}
        />
      </Modal>

      {/* Header rename (embedded /agents-chat workspace) */}
      <Modal
        open={!!hdrRename}
        title={tr('chat.rename', 'Đổi tên')}
        onCancel={() => setHdrRename(null)}
        onOk={() => {
          if (hdrRename) {
            const t = hdrRename.val.trim().slice(0, 60);
            if (t) updateConv(hdrRename.id, { title: t });
          }
          setHdrRename(null);
        }}
        okText={tr('chat.save', 'Lưu')}
        cancelText={tr('chat.cancel', 'Huỷ')}
        okButtonProps={{ disabled: !hdrRename?.val.trim() }}
        destroyOnClose
      >
        <Input
          autoFocus
          value={hdrRename?.val || ''}
          onChange={(e) => setHdrRename((h) => (h ? { ...h, val: e.target.value } : h))}
          onPressEnter={() => {
            if (hdrRename) {
              const t = hdrRename.val.trim().slice(0, 60);
              if (t) updateConv(hdrRename.id, { title: t });
            }
            setHdrRename(null);
          }}
          maxLength={60}
        />
      </Modal>

      {/* Public conversation link */}
      <Modal
        open={!!convShare}
        title={tr('chat.sharePublicLink', 'Chia sẻ (link công khai)')}
        onCancel={() => setConvShare(null)}
        footer={null}
        destroyOnClose
      >
        {convShare?.loading || !convShare?.slug ? (
          <Skeleton active paragraph={{ rows: 1 }} />
        ) : (
          <div>
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 12 }}
              message={tr('chat.sharePublicNote', 'Bất kỳ ai có liên kết đều xem được nội dung hội thoại này (chỉ đọc).')}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <Input readOnly value={`${shareBase()}/s/${convShare.slug}`} onFocus={(e) => e.currentTarget.select()} />
              <Button type="primary" onClick={() => copyMsg(`${shareBase()}/s/${convShare.slug}`)}>{tr('chat.copyLink', 'Sao chép')}</Button>
            </div>
            <div style={{ marginTop: 14, textAlign: 'right' }}>
              <Button danger size="small" onClick={() => void unshareConv(convShare.id)}>{tr('chat.stopSharing', 'Gỡ chia sẻ')}</Button>
            </div>
          </div>
        )}
      </Modal>

      <Drawer
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        width={screens.md ? 720 : '100%'}
        styles={{ header: { paddingBottom: 12 }, body: { paddingTop: 16 } }}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FolderOpenOutlined style={{ color: BRAND }} />
            <span style={{ fontWeight: 700 }}>{tr('chat.library', 'Thư viện')}</span>
            <span style={{ fontSize: 12, fontWeight: 400, color: V.textFaint }}>{libItems.length} {tr('chat.filesUnit', 'tệp')}</span>
          </div>
        }
      >
        {(() => {
          const q = libQuery.trim().toLowerCase();
          // Only show type tabs for kinds that actually have files (+ "Tất cả").
          const present = KIND_ORDER.filter((k) => libItems.some((it) => fileKind(it) === k));
          const tabValue = libTab !== 'all' && present.includes(libTab) ? libTab : 'all';
          const list = libItems.filter(
            (it) => (tabValue === 'all' || fileKind(it) === tabValue) && (!q || (it.name || '').toLowerCase().includes(q)),
          );
          return (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                <div style={{ maxWidth: '100%', overflowX: 'auto', minWidth: 0 }}>
                  <Segmented
                    value={tabValue}
                    onChange={(v) => setLibTab(v as 'all' | Kind)}
                    options={[{ label: tr('chat.allCap', 'Tất cả'), value: 'all' }, ...present.map((k) => ({ label: kindLabelT[k], value: k }))]}
                  />
                </div>
                <Input
                  allowClear
                  prefix={<SearchOutlined style={{ color: V.textFaint }} />}
                  placeholder={tr('chat.searchByFileName', 'Tìm theo tên tệp…')}
                  value={libQuery}
                  onChange={(e) => setLibQuery(e.target.value)}
                  style={{ flex: 1, minWidth: 180, maxWidth: 320, borderRadius: 999 }}
                />
              </div>
              {list.length === 0 ? (
                <Empty
                  style={{ marginTop: 48 }}
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={libItems.length === 0 ? tr('chat.noFilesYet', 'Chưa có tệp nào — ảnh/file bạn gửi cho trợ lý sẽ xuất hiện ở đây') : tr('chat.noFilesMatch', 'Không tìm thấy tệp phù hợp')}
                />
              ) : (
                // PreviewGroup makes every image open in a full-screen gallery (zoom + prev/next).
                <Image.PreviewGroup>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(158px, 1fr))', gap: 14 }}>
                    {list.map((it) => {
                      const kind = fileKind(it);
                      return (
                        <div
                          key={it.id}
                          style={{ border: `1px solid ${V.border}`, borderRadius: 12, overflow: 'hidden', background: V.surface, transition: 'border-color .15s, box-shadow .15s', boxShadow: CARD_SHADOW }}
                          onMouseEnter={(e) => { e.currentTarget.style.borderColor = BRAND; e.currentTarget.style.boxShadow = `0 6px 18px ${BRAND}22`; }}
                          onMouseLeave={(e) => { e.currentTarget.style.borderColor = V.border; e.currentTarget.style.boxShadow = CARD_SHADOW; }}
                        >
                          <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', background: V.surfaceAlt, overflow: 'hidden', position: 'relative' }}>
                            {it.isImage ? (
                              <Image
                                src={`data:${it.mime};base64,${it.dataBase64}`}
                                alt={it.name}
                                width="100%"
                                height={120}
                                style={{ objectFit: 'cover' }}
                                preview={{ mask: <span style={{ fontSize: 12 }}>{tr('chat.view', 'Xem')}</span> }}
                              />
                            ) : (
                              <>
                                {kindIcon(kind, 40)}
                                <span style={{ position: 'absolute', top: 8, right: 8, fontSize: 9, fontWeight: 700, color: KIND_COLOR[kind], background: `${KIND_COLOR[kind]}1f`, padding: '1px 6px', borderRadius: 5, textTransform: 'uppercase' }}>{kindLabelT[kind]}</span>
                              </>
                            )}
                          </div>
                          <div style={{ padding: '9px 10px' }}>
                            <div style={{ fontSize: 12.5, fontWeight: 500, color: V.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={it.name}>{it.name}</div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                              <span style={{ fontSize: 10.5, color: V.textFaint }}>{new Date(it.ts).toLocaleDateString('vi-VN')}</span>
                              <span style={{ display: 'flex', gap: 0 }}>
                                <Tooltip title={tr('chat.reuse', 'Dùng lại')}><Button size="small" type="text" icon={<PaperClipOutlined />} onClick={() => reuseLibItem(it)} /></Tooltip>
                                <Tooltip title={tr('chat.download', 'Tải xuống')}><Button size="small" type="text" icon={<DownloadOutlined />} onClick={() => downloadLibItem(it)} /></Tooltip>
                                <Tooltip title={tr('chat.delete', 'Xoá')}><Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => void removeLibItem(it.id)} /></Tooltip>
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Image.PreviewGroup>
              )}
            </>
          );
        })()}
      </Drawer>

      <Drawer
        open={shareOpen}
        onClose={() => { setShareOpen(false); void loadReceived(); }}
        title={tr('chat.shareAssistant', 'Chia sẻ Trợ lý AI')}
        width={screens.md ? 560 : '100%'}
        destroyOnClose
      >
        <AgentGrantsPanel onChanged={() => void loadReceived()} />
      </Drawer>

      {/* Xem trước tệp đính kèm — mọi định dạng, kể cả .xlsx/.docx (server đã trích sẵn chữ). */}
      {/* onUploaded: giữ lại id máy chủ trả về. Không giữ thì mỗi lần xem trước một .xlsx lại
          tạo thêm một dòng Upload mồ côi — và giờ những dòng đó sẽ hiện hết trong "Tệp đã tải lên". */}
      <AttachmentPreview
        att={preview}
        open={!!preview}
        onClose={() => setPreview(null)}
        onUploaded={(uploadId) => setPreview((p) => (p ? { ...p, uploadId } : p))}
      />

      {/* Thông tin skill khi bấm vào chip "/lệnh" trong tin nhắn. */}
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
                {tr('chat.skillNoBody', 'Không đọc được nội dung skill.')}
              </div>
            )}
            <div style={{ marginTop: 10 }}>
              <Button type="link" style={{ paddingLeft: 0 }} onClick={goSkills}>
                {tr('chat.skillEdit', 'Mở màn hình Skills để sửa')}
              </Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}

const GROUP_LABEL: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: V.textFaint,
  letterSpacing: 0.3,
  padding: '2px 4px 5px',
};
