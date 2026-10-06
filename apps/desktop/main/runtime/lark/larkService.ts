import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Notification } from 'electron';
import { APIA_BASE, parseSkillCommands, shouldPersistSession, stripSkillCommands } from '@larkwave/core';
import { hasContract, parseSkillContract, relatedSet, rowsToWrite, type LarkSkillSet, type SkillContract, type SkillSetRun, type SkillTarget } from '@larkwave/core';
import { runSkillSet, type SkillRunEvent, type SkillRunResult } from './skillRun';

/** Kết quả trích xuất của MỘT tệp. `failing` rỗng = dòng sạch, được ghi. */
export interface ExtractRow {
  file: string;
  facts: Record<string, string | number | boolean | null>;
  failing: string[];
  blocked: string[];
}

export interface ExtractRunResult {
  rows: ExtractRow[];
  /** Số dòng SẠCH — sẽ ghi (hoặc đã ghi). */
  wouldWrite: number;
  written: number;
  table: string;
  base: string;
}
import type {
  BuildEvent,
  LarkReloginEntry,
  LarkGrantPolicy,
  LarkNoteDoc,
  LarkAppRef,
  LarkAutomation,
  LarkAutomationInput,
  LarkAutomationRunResult,
  LarkBaseRef,
  LarkBaseSnapshot,
  LarkBotConfig,
  LarkBotStatus,
  LarkChatEvent,
  LarkChatInput,
  LarkChatMode,
  LarkConnection,
  LarkSessionMeta,
  LarkShareInfo,
  LarkSnapshotTable,
  LarkSpecDoc,
  LarkTableRef,
  LarkToolRunResult,
  PluginInfo,
  PluginPanelInfo,
  SpecBase,
  SpecBuildResult,
  SpecInsight,
  SpecPromoteInput,
  SpecRelation,
  SpecSyncEntry,
  SpecWorkflow,
} from '@larkwave/core';
import { buildSpec } from './specBuilder';

// ── "Dựng app từ phân tích" snapshot bounds (keep the builder prompt small) ──
const SNAPSHOT_MAX_TABLES = 6;
const SNAPSHOT_MAX_FIELDS = 40;
const SNAPSHOT_MAX_ROWS = 5;

// ── "Tự động nạp Base" Drive-walk bounds (avoid scanning a huge drive forever) ──
const DISCOVER_MAX_FOLDERS = 80;
const DISCOVER_MAX_BASES = 200;
// Bases are often organised in a Lark WIKI (numbered "1.1 / 1.2 …" trees), which the
// Drive-files API does NOT list → also walk wiki spaces + nodes, bounded.
const DISCOVER_MAX_WIKI_NODES = 500;
interface DriveFile {
  token: string;
  name?: string;
  type?: string; // 'bitable' | 'docx' | 'sheet' | 'folder' | 'shortcut' | …
  shortcut_info?: { target_type?: string; target_token?: string };
}
interface DriveFilesPage {
  files?: DriveFile[];
  has_more?: boolean;
  next_page_token?: string;
}
/** Lark Bitable field `type` (a number) → a readable kind. */
const LARK_FIELD_TYPE: Record<number, string> = {
  1: 'Văn bản',
  2: 'Số',
  3: 'Chọn một',
  4: 'Chọn nhiều',
  5: 'Ngày giờ',
  7: 'Checkbox',
  11: 'Người',
  13: 'Điện thoại',
  15: 'URL',
  17: 'Đính kèm',
  18: 'Liên kết bảng',
  19: 'Lookup',
  20: 'Công thức',
  21: 'Liên kết 2 chiều',
  22: 'Vị trí',
  23: 'Nhóm',
  1001: 'Tạo lúc',
  1002: 'Sửa lúc',
  1003: 'Người tạo',
  1004: 'Người sửa',
  1005: 'Tự tăng',
};

/** Flatten one Lark record field value to a plain JSON-friendly value for the prompt. */
function simplifyVal(v: unknown): unknown {
  if (v == null) return v;
  if (Array.isArray(v)) {
    const parts = v.map((x) =>
      x && typeof x === 'object'
        ? ((x as Record<string, unknown>).text ??
          (x as Record<string, unknown>).name ??
          (x as Record<string, unknown>).en_name ??
          (x as Record<string, unknown>).link ??
          '')
        : x,
    );
    const flat = parts.filter((p) => p !== '' && p != null);
    return flat.length <= 1 ? (flat[0] ?? '') : flat;
  }
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return o.text ?? o.name ?? o.link ?? o.value ?? JSON.stringify(v).slice(0, 120);
  }
  if (typeof v === 'string') return v.length > 200 ? v.slice(0, 200) + '…' : v;
  return v;
}
function simplifyRecord(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields ?? {})) out[k] = simplifyVal(v);
  return out;
}

/** Minimal shape of a persisted chat item (a renderer bubble or tool card) as needed to rebuild
 *  a transcript. Items are otherwise stored opaquely; only these fields are read here. */
interface ChatItemLite {
  kind?: string;
  role?: string;
  text?: string;
  call?: { name?: string; input?: unknown; summary?: string; status?: string; error?: string };
}

/** A persisted Lark chat session (claudeSessionId drives `--resume`; items are the
 *  renderer's chat bubbles/tool cards, stored opaquely for full restore). */
interface StoredSession {
  id: string;
  claudeSessionId: string;
  /** Agent session id (Claude --resume; others: logical id + UI transcript). */
  agentSessionId?: string;
  runner?: string;
  model?: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  items: unknown[];
  /** The Bases applied to this conversation (the agent works across them). */
  bases?: LarkBaseRef[];
  /** User-authored notes + todos for this conversation. */
  notes?: LarkNoteDoc;
  /** AI summaries of collapsed answers, keyed by chat-item id. Cached because each
   *  one costs a model call — regenerating on every reopen would burn tokens. */
  summaries?: Record<string, string>;
}

/** A `skills/registry.json` record, as SkillHost writes it (see runtime/skills/skillHost.ts).
 *  Read-only here — the chat engine only needs to find + load a skill, never to edit one. */
interface SkillRegistryEntry {
  id: string;
  name: string;
  enabled?: boolean;
  scope?: string[];
  tags?: string[];
  /** Slash-command shortcut WITHOUT the leading "/" (absent/empty = no shortcut). */
  command?: string;
}

// ── Skill slash-commands ("/sieu-ba") ───────────────────────────────────────
/** Skills one message may invoke. A typed command is explicit intent, but three full skill
 *  bodies in front of the question is already as much as a turn can usefully follow. */
const SKILL_COMMAND_MAX_PER_TURN = 3;
/** Char budget for those bodies — mirrors collectSkillsPrompt's system-prompt budget. */
const SKILL_COMMAND_BUDGET = 40000;
/** The server's `MaicChatRunDto.prompt` is capped at 20 000 chars (a 400 otherwise). A typed
 *  command can inline far more than that, so the HOSTED path trims the skill block — never the
 *  user's own question, which sits at the tail. */
const MAIC_PROMPT_MAX = 20000;

/**
 * Union chat items of one conversation from two devices by their stable id, so NO turn is
 * lost when both diverged. The newer side (by session.updatedAt) sets the order; any item
 * the other side has but the newer lacks (e.g. a turn appended offline on the losing side)
 * is kept, appended after. Wholesale last-write-wins would silently delete the offline
 * turn. Returns `base` unchanged (same ref) when nothing extra needs adding.
 */
function mergeItems(base: unknown[], other: unknown[]): unknown[] {
  const idOf = (it: unknown) => (it && typeof it === 'object' ? (it as { id?: unknown }).id : undefined);
  const have = new Set(base.map(idOf).filter((x) => typeof x === 'string'));
  const extra = other.filter((it) => {
    const id = idOf(it);
    return typeof id === 'string' && !have.has(id);
  });
  return extra.length ? [...base, ...extra] : base;
}

/**
 * Merge two copies of one conversation for cross-device backup. Items are UNIONED by id so
 * a divergent offline turn on either side is never lost; title/bases follow the newer side.
 * Notes + summaries merge INDEPENDENTLY of session.updatedAt — notes deliberately do NOT
 * bump it (so jotting one never reorders the history list), which means a
 * session.updatedAt-only comparison would silently drop a device's notes when both sides
 * share the same updatedAt. Notes win by their own doc.updatedAt; summaries union (they're
 * append-only per item). Returns `local` unchanged when nothing changed, so the caller only
 * rewrites the file when it actually differs.
 */
/** Số lượt giữ lại trong hội thoại của một lịch (20 lần chạy). Dùng CHUNG với saveScheduledResult
 *  — hai con số lệch nhau là tệp cứ phình rồi bị cắt qua lại mỗi lần đồng bộ. */
const SCHED_ITEM_CAP = 40;

function mergeSession(local: StoredSession, remote: StoredSession): StoredSession {
  const remoteNewer = (remote.updatedAt || '') > (local.updatedAt || '');
  const base = remoteNewer ? remote : local;
  const other = remoteNewer ? local : remote;
  let items = mergeItems(base.items ?? [], other.items ?? []);
  // Hội thoại của một LỊCH bị cắt bớt ở máy (giữ 40 lượt gần nhất). Nhưng `mergeItems` là phép
  // HỢP theo id rồi NỐI phần thừa vào CUỐI, nên những lượt vừa bị cắt lại được máy chủ trả về —
  // tệp phình lại như cũ, và lượt CŨ nằm DƯỚI lượt MỚI khi mở hội thoại. Sắp theo `ts` rồi cắt
  // lại ở đây là chỗ DUY NHẤT chặn được cả hai, vì đây là nơi hai bản gặp nhau.
  if ((base.id || local.id || '').startsWith('sched-') && items.length > SCHED_ITEM_CAP) {
    const tsOf = (it: unknown) => Number((it as { ts?: number })?.ts ?? 0);
    items = [...items].sort((a, b) => tsOf(a) - tsOf(b)).slice(-SCHED_ITEM_CAP);
  }
  const notes =
    (remote.notes?.updatedAt || '') > (local.notes?.updatedAt || '') ? remote.notes : local.notes;
  const summaries =
    local.summaries || remote.summaries ? { ...(other.summaries ?? {}), ...(base.summaries ?? {}) } : undefined;
  // No change to the local copy? return it as-is so the caller skips the rewrite.
  if (
    base === local &&
    items === local.items &&
    notes === local.notes &&
    summariesEqual(summaries, local.summaries)
  ) {
    return local;
  }
  return { ...base, items, notes, ...(summaries ? { summaries } : {}) };
}

function summariesEqual(a?: Record<string, string>, b?: Record<string, string>): boolean {
  const ak = a ? Object.keys(a) : [];
  const bk = b ? Object.keys(b) : [];
  if (ak.length !== bk.length) return false;
  return ak.every((k) => a?.[k] === b?.[k]);
}

/**
 * Merge two copies of the "Đặc tả" doc for cross-device backup. Each Base is re-fetched
 * atomically per sync, so union-by-appToken (newer source.fetchedAt wins the whole Base) is
 * both correct and safe: two devices that synced DIFFERENT Bases keep both; two that synced
 * the same one keep the fresher read. Workflows union by id (newer wins). Insights union by
 * hash (dismissed is sticky). Overview is user-owned → last-write-wins by its own updatedAt.
 * Relations union by (from→to:field). Returns null-safe: either side may be missing.
 */
function mergeSpec(local: LarkSpecDoc | null, remote: LarkSpecDoc | null): LarkSpecDoc | null {
  if (!local) return remote;
  if (!remote) return local;
  const newerAt = (a?: { fetchedAt?: string }, b?: { fetchedAt?: string }) =>
    (a?.fetchedAt || '') >= (b?.fetchedAt || '');

  const bases = new Map<string, SpecBase>();
  for (const b of local.bases) bases.set(b.appToken, b);
  for (const b of remote.bases) {
    const ex = bases.get(b.appToken);
    if (!ex || !newerAt(ex.source, b.source)) bases.set(b.appToken, b);
  }
  const workflows = new Map<string, SpecWorkflow>();
  for (const w of local.workflows) workflows.set(w.workflowId, w);
  for (const w of remote.workflows) {
    const ex = workflows.get(w.workflowId);
    if (!ex || !newerAt(ex.source, w.source)) workflows.set(w.workflowId, w);
  }
  const insights = new Map<string, SpecInsight>();
  for (const i of [...local.insights, ...remote.insights]) {
    const ex = insights.get(i.hash);
    if (!ex) insights.set(i.hash, i);
    else insights.set(i.hash, { ...ex, dismissed: ex.dismissed || i.dismissed });
  }
  const relations = new Map<string, SpecRelation>();
  for (const r of [...local.relations, ...remote.relations])
    relations.set(`${r.fromTableId}->${r.toTableId}:${r.viaFieldId ?? ''}`, r);
  const syncLog = new Map<string, SpecSyncEntry>();
  for (const e of [...local.syncLog, ...remote.syncLog]) syncLog.set(e.at, e);
  const overview =
    (remote.overview?.updatedAt || '') > (local.overview?.updatedAt || '') ? remote.overview : local.overview;

  return {
    v: 1,
    updatedAt: (remote.updatedAt || '') > (local.updatedAt || '') ? remote.updatedAt : local.updatedAt,
    overview,
    bases: [...bases.values()],
    workflows: [...workflows.values()],
    relations: [...relations.values()],
    insights: [...insights.values()],
    syncLog: [...syncLog.values()].sort((a, b) => (b.at || '').localeCompare(a.at || '')).slice(0, 50),
  };
}
import { allTools, isWriteTool, readOnlyTools } from './tools';
import { extractOfficeText, officeKindFor } from './ooxml';
import { setAttachmentDir } from './tools/attachments';
import { setFileOutDir, setFileUploader, setPdfMaker } from './tools/files';
import { newFilesSince, snapshotDir } from './fileBuild';
import { canMakePdf, htmlToPdf } from './filePdf';
import type { LarkToolDef } from './tools/types';
import { claudeAvailable, hasInjectedCredential } from '../claudeRunner';
import { tryAcquire, release, currentOwner, isBusy, maxConcurrent, type Lease } from '../agentLock';
import { PluginHost } from '../plugins/pluginHost';
import { AutomationEngine } from './automationEngine';
import { SecretStore, type StoredAutomation, type StoredUserAuth } from './secretStore';
import { LarkApiError, LarkClient, LarkNetworkError } from './larkClient';
import { exchangeCode, fetchUserName, LarkOAuthError, refreshTokens } from './larkOAuth';
import { runLarkAgent } from './larkAgent';
import { setAgentScheduler } from './scheduleBridge';
import { runLarkApiAgent } from './larkApiAgent';
import { runLarkMaicAgent } from './larkMaicAgent';
import { getActiveKey } from '../claudeKeyStore';
import { getProviderKey } from '../runners/runnerTokenStore';
import { resolveTool } from './tools';
import { buildSystemPrompt, buildGeneralSystemPrompt, buildReadOnlyAssistantPrompt } from './systemPrompt';
import { versionPromptLine } from '../versionHint';
import { LarkWebhook, type BotMessage } from './webhook';
import { TunnelManager } from './tunnel';
import { getLarkWebSession } from './larkWebSession';
import { CmsSyncService, CMS_SYNC_DEFAULT_BASE, setSharedCmsBaseUrl, type CmsSyncJob } from './cmsSyncService';
import type { LarkWebInfo } from '@larkwave/core';

/**
 * Owns the connected Lark custom app in the main process: credential storage,
 * the LarkClient (token lifecycle), the registered Bases, the chat agent loop (supports any runner),
 * and the pending-confirmation map for gated writes.
 */
/**
 * Câu trả lời cho một lượt chạy KHÔNG CÓ NGƯỜI TRÔNG khi agent hỏi lại.
 *
 * Trả chuỗi rỗng là sai — người dùng báo "tự động hoá không thực thi mà cứ hỏi lại": agent đặt
 * câu hỏi, nhận về một chuỗi rỗng (không phải câu trả lời, cũng không phải lời từ chối), nên nó
 * hỏi lại; hết lượt này tới lượt khác cho tới khi chạm hạn giờ. Nhìn từ ngoài thì đúng là "cứ hỏi
 * lại mà không làm gì".
 *
 * Nói THẲNG rằng không có ai để hỏi, và bảo nó tự quyết rồi đi tiếp. Một câu hỏi treo phải biến
 * thành một chỉ dẫn, không phải thành sự im lặng.
 */
const NO_ONE_TO_ASK =
  'Đây là lượt chạy TỰ ĐỘNG, KHÔNG có ai để trả lời câu hỏi của bạn. ' +
  'Hãy TỰ CHỌN phương án hợp lý nhất theo dữ liệu đang có rồi LÀM TIẾP, và nêu rõ giả định bạn đã ' +
  'chọn trong phần báo cáo cuối. Chỉ dừng lại khi thật sự không thể làm gì thêm — khi đó giải ' +
  'thích ngắn gọn còn thiếu chính xác cái gì. ĐỪNG hỏi lại.';

export class LarkService {
  private readonly store: SecretStore;
  private readonly plugins: PluginHost;
  private readonly automation: AutomationEngine;
  private readonly cmsSync!: CmsSyncService;
  private cmsRefreshTimer: ReturnType<typeof setInterval> | null = null;
  /** Periodic Lark-web session health probe (proactive "session lỗi → đăng nhập lại" alert). */
  private healthTimer: ReturnType<typeof setInterval> | null = null;
  /** Pushes a "session died" event to the renderer (set by the main process; → a banner). */
  private sessionDeadEmitter: (() => void) | null = null;
  private client: LarkClient | null = null;
  private appId: string | null = null;
  private tenantName: string | undefined;
  /** Personal-account OAuth session (user_access_token); null = app-token only. */
  private userAuth: StoredUserAuth | null = null;
  /** Dedupe concurrent user-token refreshes. */
  private userRefresh: Promise<string | null> | null = null;
  /** CSRF state for the in-flight OAuth login (set by userAuthStart). */
  private oauthState: string | null = null;
  /**
   * Trạng thái lượt của TỪNG hội thoại (id phiên CLI để --resume, đã chạy lần nào chưa, runner,
   * model). Trước đây bốn thứ này là bốn ô nhớ dùng chung cho cả dịch vụ — chạy song song thì
   * lượt này ghi đè của lượt kia: `claude --resume <id của hội thoại khác>` trộn ngữ cảnh hai
   * cuộc trò chuyện, hoặc `resume:false` làm một hội thoại mất sạch trí nhớ.
   */
  private readonly turnState = new Map<
    string,
    { agentSessionId: string | null; started: boolean; runner: string; model?: string }
  >();
  /** Stable conversation id for the local Claude session; null = next turn starts fresh. */
  private chatSessionId: string | null = null;
  /** True once the current session has had at least one turn (→ resume, not start). */
  private chatStarted = false;
  /** A handoff summary to inject into the NEXT session's first prompt (so the fresh Claude
   *  session actually inherits the prior context, not just a displayed note). */
  private carryover: { sessionId: string; summary: string } | null = null;
  /**
   * callId → { hội thoại nào đang chờ, hàm trả lời }.
   *
   * callId vốn đã là duy nhất toàn cục nên định tuyến câu trả lời luôn đúng địa chỉ. Phải ghi kèm
   * hội thoại vì `clearPending()` trước đây xoá SẠCH map: khi hai hội thoại chạy song song, lượt
   * vừa bắt đầu sẽ tự động TỪ CHỐI mọi xác nhận ghi đang treo của lượt kia — người dùng chưa hề
   * bấm gì mà công cụ đã bị "từ chối".
   */
  private readonly pending = new Map<
    string,
    // `name`/`input` giữ lại để DỰNG LẠI lời hỏi khi người dùng rời hội thoại rồi quay vào — nếu
    // không, thứ đang chờ chỉ tồn tại trong state của renderer, mà state đó chết theo lần rời đi.
    { convId: string | null; resolve: (ok: boolean) => void; name?: string; input?: unknown }
  >();
  /** callId → { hội thoại, hàm trả lời } cho `ask_user`. Cùng lý do như `pending`. */
  private readonly pendingAsk = new Map<
    string,
    { convId: string | null; resolve: (answer: string) => void; question?: string; choices?: string[] }
  >();
  private webhook: LarkWebhook | null = null;
  /** cloudflared quick tunnel giving the webhook a public URL (Feature: bot without manual ngrok). */
  private readonly tunnel = new TunnelManager();
  private readonly baseDir: string;
  /** F3 — a `/run <prompt>` message in a bot chat triggers a real remote build on this
   *  machine. Injected by LocalRuntimeAdapter (which owns createBuild). Undefined = feature off. */
  private remoteBuild?: (input: { prompt: string; runner?: string; model?: string }) => AsyncIterable<BuildEvent>;
  /** Cached owner open_id (the personally-logged-in Lark user) — the ONLY sender allowed
   *  to trigger an autonomous /run build. Cached so a transient identity-fetch failure
   *  doesn't lock the owner out mid-session. */
  private ownerOpenIdCache = '';
  /** The signed-in Larkwave account. Local sessions are stored PER-ACCOUNT under it, so
   *  switching accounts on one device never mixes conversations (and never pushes account
   *  A's chats into account B's server backup). null = not signed in → a device-only pool. */
  private currentUserId: string | null = null;
  private legacyMigrated = false;
  /** The conversation the renderer currently has open (drives which claude session
   *  to --resume + which file to save into). */
  private activeSessionId: string | null = null;
  private activeRunner = 'claude';
  private activeModel: string | undefined;
  /**
   * Các lượt ĐANG CHẠY, khoá theo hội thoại. Huỷ cần CẢ HAI: `abort()` giết tiến trình CLI ngay
   * lập tức (finally của generator không chạy được khi nó đang đỗ chờ CLI im lặng), rồi
   * `.return()` dọn cầu nối.
   *
   * Trước đây là MỘT ô nhớ cho cả dịch vụ: lượt thứ hai ghi đè, làm mất tham chiếu tới CLI của
   * lượt thứ nhất → nút Dừng giết nhầm hội thoại, hoặc tiến trình mồ côi chạy tới hết 10 phút.
   */
  private readonly runs = new Map<string, { gen: AsyncGenerator<LarkChatEvent>; abort: AbortController }>();
  /** Runners whose direct-API key was seen out of credit → skip the API (use the CLI) for the rest
   *  of the session instead of retrying the dead key every turn. Cleared when API prefs change. */
  private apiCreditOut = new Set<string>();

  /**
   * Dừng một lượt Lark. Không truyền hội thoại = dừng TẤT CẢ (thoát app, đổi tài khoản, ngắt kết
   * nối). Nút "Dừng" của mỗi tab phải truyền đúng hội thoại của nó, nếu không nó sẽ giết lượt của
   * hội thoại khác.
   */
  cancelChat(convId?: string): void {
    const kill = (r: { gen: AsyncGenerator<LarkChatEvent>; abort: AbortController }) => {
      r.abort.abort();
      void r.gen.return(undefined);
    };
    if (convId) {
      const r = this.runs.get(convId);
      if (r) kill(r);
      return;
    }
    for (const r of [...this.runs.values()]) kill(r);
  }

  /** Hội thoại nào đang chạy — giao diện dùng để chấm dấu "đang chạy" lên từng tab. */
  runningSessionIds(): string[] {
    return [...this.runs.keys()];
  }

  constructor(baseDir: string) {
    this.baseDir = baseDir;
    this.store = new SecretStore(baseDir);
    this.plugins = new PluginHost(baseDir);
    this.userAuth = this.store.getUserAuth();
    // "Tự động hoá (Larkwave)" — polls Bases + runs rule actions while the app is open.
    this.automation = new AutomationEngine(
      () => this.ensureClient(),
      () => this.store.getAutomations(),
      (list) => this.store.setAutomations(list),
      () => this.amRunner(),
      {
        // 900s, KHÔNG phải mặc định 240s. Mặc định ấy đặt cho "một lịch báo cáo", nhưng đường
        // này là nơi việc "Chạy AI agent" đi qua — và việc người dùng đặt vào đó thường là chạy
        // trọn một KỸ NĂNG trên Base, đúng loại việc mà chính chú thích của tham số đã nói là
        // cần rộng hơn nhiều. Hai đường kỹ năng khác đã nhận 600s từ trước, riêng đường này bị
        // bỏ quên.
        //
        // Đo trên lịch sử thật: lượt chạy XONG gần nhất mất 488 giây — tức trần 240s cắt vào
        // giữa một công việc bình thường, không phải cắt một lượt chạy loạn. Lấy 900s cho có
        // biên, vì lịch 9h sáng không có ai ngồi chờ; và từ nay hết giờ là cắt thật nên trần
        // rộng KHÔNG còn đồng nghĩa với việc để một lượt hỏng chạy mãi.
        run: (prompt, mode, stats) => this.runScheduledAgentTurn(prompt, mode, stats, undefined, undefined, 900_000),
        save: (ruleId, ruleName, prompt, result) => this.saveScheduledResult(ruleId, ruleName, prompt, result),
        notify: (title, body) => this.notifyScheduled(title, body),
      },
      // App desktop có đủ bộ công cụ (kể cả lark_ui_* cần trình duyệt). Máy nền dùng bộ headless.
      (name) => resolveTool(name),
      { runSet: (skillId, seedFacts, o) => this.runSkillSetForAutomation(skillId, seedFacts, o) },
    );
    // PDF chỉ dựng được ở nơi có Electron. Đăng ký một lần lúc khởi động; bản chạy nền trên VM
    // không chạy qua đây nên `create_file` ở đó tự báo là chưa dựng được PDF và gợi ý .docx —
    // nói rõ còn hơn để agent thử lại PDF tới lúc hết giờ.
    setPdfMaker(canMakePdf() ? htmlToPdf : null);
    /**
     * Tệp agent dựng ra được sao lưu lên máy chủ tài khoản, để nó đi theo TÀI KHOẢN chứ không
     * nằm chết trên một máy — đúng cách hội thoại vẫn làm. Chưa đăng nhập thì bỏ qua, tệp vẫn
     * ghi cục bộ như thường.
     */
    setFileUploader(async (f) => {
      const token = this.accountTokenGetter?.();
      if (!token) return null;
      const form = new FormData();
      form.append('file', new Blob([new Uint8Array(f.bytes)], { type: f.mime }), f.name);
      // `purpose=chat` xếp tệp vào đúng nhóm ở trang "Tệp đã tải lên", thay vì lẫn với ảnh
      // đại diện và tệp báo lỗi.
      const r = await fetch(`${APIA_BASE}/uploads?purpose=chat`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!r.ok) return null;
      const j = (await r.json().catch(() => null)) as { id?: string; data?: { id?: string } } | null;
      return j?.id ?? j?.data?.id ?? null;
    });
    this.automation.start();
    // Let the agent auto-create a schedule from chat ("mỗi ngày 9h chạy PBTTCN…") via the
    // schedule_agent_job tool → a run_agent time-schedule automation.
    setAgentScheduler(async (i) => {
      const promptKey = i.prompt.trim();
      const list = this.automation.upsert({
        name: i.name?.trim() || i.prompt.slice(0, 40).trim() || 'Lịch AI',
        enabled: true,
        appToken: '',
        tableId: '',
        intervalSec: i.mode === 'interval' ? Math.max(60, Math.floor(i.intervalSec || 3600)) : 60,
        triggerType: 'schedule',
        schedule:
          i.mode === 'interval'
            ? { mode: 'interval' }
            : { mode: 'daily', atHour: i.atHour ?? 9, atMinute: i.atMinute ?? 0, days: i.days },
        action: {
          type: 'run_agent',
          prompt: i.prompt,
          // Lịch do agent tạo mặc định THỰC THI — người dùng nói "mỗi ngày 9h chạy PBTTCN" là
          // muốn nó chạy, không phải muốn nó báo lại rằng mình không có quyền chạy.
          mode: i.mode2 === 'ask' ? 'ask' : 'build',
          ...(i.postToChatId ? { postToChatId: i.postToChatId } : {}),
          saveConversation: i.saveConversation !== false,
          notify: i.notify !== false,
        },
      });
      // KHÔNG lấy phần tử cuối: `upsert` nay gộp lịch trùng vào mục có sẵn (xem chống trùng ở
      // AutomationEngine.upsert), nên mục vừa tạo/cập nhật có thể nằm ở giữa danh sách. Lấy cuối
      // mảng sẽ trả về tên của một lịch KHÁC — và người dùng nhận một câu xác nhận nói về việc
      // họ không hề vừa tạo.
      const created =
        [...list].reverse().find((r) => r.triggerType === 'schedule' && r.action?.type === 'run_agent' && (r.action.prompt || '').trim() === promptKey) ??
        list[list.length - 1];
      const when =
        i.mode === 'interval'
          ? `mỗi ${Math.round((i.intervalSec || 3600) / 60)} phút`
          : `mỗi ngày ${String(i.atHour ?? 9).padStart(2, '0')}:${String(i.atMinute ?? 0).padStart(2, '0')}`;
      return { id: created?.id || '', name: created?.name || i.name || 'Lịch AI', when };
    });
    // CMS Bitable sync: the desktop keeps the connector session (cookies/csrf) fresh so the
    // user never has to re-capture it via the browser extension.
    this.cmsSync = new CmsSyncService({
      connectorSession: () => getLarkWebSession().getConnectorSession(),
      baseUrl: () => this.store.getSettings().cmsSyncBaseUrl || CMS_SYNC_DEFAULT_BASE,
      syncConnectorTable: (t, tbl, hid, htype, dom) => getLarkWebSession().syncConnectorTable(t, tbl, hid, htype, dom),
    });
    setSharedCmsBaseUrl(this.store.getSettings().cmsSyncBaseUrl); // so the Lark tool reaches the same backend
    // Keep the CMS connector session fresh AND revive any job the backend auto-disabled when its
    // session expired (see cmsSync.refreshAll). Every 30 min — Lark sessions can die within a few
    // hours and the old 6h cadence left auto-disabled jobs dead for most of a day (the "không gọi
    // lại" report). Best-effort; skipped silently when web isn't connected.
    this.cmsRefreshTimer = setInterval(() => {
      void this.cmsSync.refreshAll().catch(() => undefined);
    }, 30 * 60 * 1000);
    // Startup heal: the persistent Lark window restores its session on boot, so a short delay later
    // revive once — this immediately re-enables jobs that got auto-disabled while the app was closed
    // (the server scheduler then resumes them), instead of waiting up to a full interval.
    setTimeout(() => {
      void this.cmsSync.refreshAll().catch(() => undefined);
    }, 20_000);
    // Proactive Lark-web session health: the reactive path (a failed API call) already reveals the
    // login window, but a session can silently die while idle. Probe every 10 min; probeHealth
    // fires the dead-handler ONCE per alive→dead transition (→ OS Notification + renderer banner).
    getLarkWebSession().setDeadHandler(() => this.onLarkSessionDead());
    this.healthTimer = setInterval(() => {
      void getLarkWebSession().probeHealth().catch(() => undefined);
    }, 10 * 60 * 1000);
  }

  /** Wire the renderer push for "session died" (main process supplies the sender). */
  setSessionDeadEmitter(cb: () => void): void {
    this.sessionDeadEmitter = cb;
  }

  /** Session died (reactive call OR probe) → tell the user to re-login right away. */
  private onLarkSessionDead(): void {
    try {
      if (Notification.isSupported()) {
        const n = new Notification({
          title: 'Phiên Lark web đã hết hạn',
          body: 'Đăng nhập lại để tiếp tục đồng bộ / tự động hoá. Bấm để mở cửa sổ đăng nhập.',
        });
        n.on('click', () => {
          try {
            getLarkWebSession().reveal();
          } catch {
            /* ignore */
          }
        });
        n.show();
      }
    } catch {
      /* Notification is best-effort */
    }
    try {
      this.sessionDeadEmitter?.();
    } catch {
      /* renderer push is best-effort */
    }
  }

  // ── Chat sessions (history) ─────────────────────────────────────────────────
  /** Root that holds the per-account session subfolders (+ the legacy flat files). */
  private sessionsRoot(): string {
    return join(this.baseDir, 'lark', 'sessions');
  }
  /** The session folder for a specific account (null → the logged-out `_local` pool).
   *  cuids are already filesystem-safe; sanitize defensively so a scope is never a path. */
  private sessionsDirFor(userId: string | null): string {
    const scope = userId ? userId.replace(/[^A-Za-z0-9_-]/g, '') || '_local' : '_local';
    return join(this.sessionsRoot(), scope);
  }
  private sessionsDir(): string {
    return this.sessionsDirFor(this.currentUserId);
  }
  /**
   * Path of the STABLE per-conversation working directory (`<userData>/lark/work/<id>`).
   *
   * Claude Code buckets its sessions BY CWD (`~/.claude/projects/<slug-of-cwd>/<sessionId>.jsonl`),
   * so a turn that runs in a different directory can NOT `--resume` the session earlier turns
   * created: the CLI silently forks a SECOND session under the same id and the conversation loses
   * everything that happened in the other bucket. That is exactly what used to happen — plain Lark
   * turns ran in the inherited process cwd, every ATTACHMENT turn ran in a throwaway temp dir, and
   * general chat got a fresh temp dir on EVERY turn (so its `--resume` never hit = no memory at
   * all). Pinning one directory per conversation keeps all of its turns in the same bucket.
   */
  private workDirPath(conversationId: string): string {
    const safe = conversationId.replace(/[^A-Za-z0-9_-]/g, '') || 'default';
    return join(this.baseDir, 'lark', 'work', safe);
  }
  /** workDirPath() + ensure it exists. */
  private async chatWorkDir(conversationId: string): Promise<string> {
    const dir = this.workDirPath(conversationId);
    await mkdir(dir, { recursive: true });
    return dir;
  }
  /** The per-account "Đặc tả" file (a sibling of the sessions folders). One doc per account. */
  /**
   * Danh sách hội thoại ĐÃ XOÁ của một tài khoản ("bia mộ").
   *
   * Cần thiết vì hợp nhất khi đồng bộ là phép HỢP TẬP HỢP theo id: xoá tệp cục bộ xong, lần đồng
   * bộ sau kéo bản trên máy chủ về và ghi lại y nguyên — người dùng xoá mãi không mất. Bia mộ là
   * thứ duy nhất phân biệt được "máy này chưa có" với "máy này đã xoá rồi".
   */
  private deletedPathFor(userId: string | null): string {
    const scope = userId ? userId.replace(/[^A-Za-z0-9_-]/g, '') || '_local' : '_local';
    return join(this.baseDir, 'lark', 'deleted', scope, 'deleted.json');
  }
  private async readDeletedAt(path: string): Promise<Record<string, number>> {
    try {
      const raw = JSON.parse(await readFile(path, 'utf8')) as Record<string, number>;
      return raw && typeof raw === 'object' ? raw : {};
    } catch {
      return {};
    }
  }
  private async writeDeletedAt(path: string, map: Record<string, number>): Promise<void> {
    await mkdir(dirname(path), { recursive: true }).catch(() => undefined);
    await writeFile(path, JSON.stringify(map), 'utf8');
  }

  private specPathFor(userId: string | null): string {
    const scope = userId ? userId.replace(/[^A-Za-z0-9_-]/g, '') || '_local' : '_local';
    return join(this.baseDir, 'lark', 'specs', scope, 'spec.json');
  }
  private async readSpecAt(path: string): Promise<LarkSpecDoc | null> {
    try {
      return JSON.parse(await readFile(path, 'utf8')) as LarkSpecDoc;
    } catch {
      return null;
    }
  }
  /** Atomic tmp+rename write (a reader sees the whole old or whole new file, never a partial). */
  private async writeSpecAt(path: string, doc: LarkSpecDoc): Promise<void> {
    const dir = path.slice(0, path.lastIndexOf('/'));
    await mkdir(dir, { recursive: true });
    const tmp = `${path}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(doc, null, 2));
    await rename(tmp, path);
  }
  /** The userId a Larkwave JWT belongs to (its `sub`), so backup can scope to the TOKEN's
   *  account rather than the possibly-lagging currentUserId — the two must never disagree
   *  about whose server blob we read/write. */
  private userIdFromToken(token: string): string | null {
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf8')) as { sub?: string };
      return typeof payload.sub === 'string' && payload.sub ? payload.sub : null;
    } catch {
      return null;
    }
  }

  /**
   * Set the signed-in account. Called by the renderer on login/logout/switch. Scopes all
   * subsequent session reads/writes/backup to that account (`sessions/<userId>/`); null =
   * the device-only `_local` pool used when signed out.
   *
   * There is deliberately NO auto-adoption of `_local` into an account: a conversation
   * created while signed out belongs to no account, and pulling it into the next login
   * would leak it (and push it to that account's server backup). A signed-in user's real
   * history reappears from their own server backup (larkBackupSync on open). The one-time
   * legacy migration below moves the old shared flat files into `_local` for the same
   * reason — no account is presumed to own them.
   */
  async setAccount(userId: string | null): Promise<void> {
    const next = userId || null;
    await this.migrateLegacyOnce();
    const changed = next !== this.currentUserId;
    if (changed) {
      // Bản nháp thuộc về tài khoản CŨ. Giữ lại thì một lượt lưu muộn sẽ tạo tệp trong thư mục
      // của tài khoản mới — đúng thứ chốt chặn trong `larkSaveSession` sinh ra để ngăn.
      this.draftBases.clear();
      this.turnState.clear();
    }
    this.currentUserId = next;
    // ALWAYS re-scope the config store (also on the initial null call) so the one-time
    // legacy migration runs and a signed-out user still sees their migrated connection.
    // Bases/settings/automations read from the store on demand → re-scoped for free.
    this.store.setScope(next);
    this.userAuth = this.store.getUserAuth();
    // The Lark WEB session (cookie login) is per-account too: point it at this account's
    // partition so its cookies isolate + persist per account.
    getLarkWebSession().setScope(next ? next.replace(/[^A-Za-z0-9_-]/g, '') || '_local' : '_local');
    if (changed) {
      // Kill any turn still running under the OLD account before switching — otherwise it
      // keeps executing (and its renderer-side deferred save) under the new identity.
      this.cancelChat();
      // Drop the cached connection so it re-loads from THIS account's creds on next use
      // (or reads null → the connect screen).
      this.client = null;
      this.appId = null;
      this.tenantName = undefined;
      // The bot listener is per-account too: stop the old account's, resume the new one's.
      await this.stopWebhook().catch(() => undefined);
      void this.initBot();
      // Remember the Lark web login: if this account connected before, silently restore it
      // from its persisted cookies (hidden window; gives up quietly if they expired).
      const savedHost = this.store.getSettings().webHost;
      if (savedHost) void getLarkWebSession().reconnect(savedHost).catch(() => undefined);
      // Switching identity: drop the in-memory open conversation so the UI starts clean.
      this.activeSessionId = null;
      this.resetChat();
    }
  }

  /** One-time: move legacy flat `sessions/*.json` (the old per-machine layout shared by
   *  every account) into the `_local` pool. They are not attributed to any account —
   *  backed-up ones reappear per-account from the server; the rest stay device-local. */
  private async migrateLegacyOnce(): Promise<void> {
    if (this.legacyMigrated) return;
    this.legacyMigrated = true;
    const root = this.sessionsRoot();
    let files: string[];
    try {
      files = await readdir(root);
    } catch {
      return;
    }
    const flat = files.filter((f) => f.endsWith('.json'));
    if (!flat.length) return;
    const dest = join(root, '_local');
    await mkdir(dest, { recursive: true }).catch(() => undefined);
    for (const f of flat) {
      await rename(join(root, f), join(dest, f)).catch(() => undefined);
    }
  }
  private async readSessionIn(dir: string, id: string): Promise<StoredSession | null> {
    try {
      return JSON.parse(await readFile(join(dir, `${id}.json`), 'utf8')) as StoredSession;
    } catch {
      return null;
    }
  }
  private readSession(id: string): Promise<StoredSession | null> {
    return this.readSessionIn(this.sessionsDir(), id);
  }
  /** In-flight write per session id, so concurrent savers can't interleave. */
  private readonly sessionWrites = new Map<string, Promise<void>>();

  /**
   * Atomic, serialized session write. Was a bare writeFile, which was fine at the old
   * once-per-turn cadence but not now that notes save on a typing debounce: two writers
   * on the same file could interleave and leave truncated JSON, losing the conversation.
   * tmp+rename makes a reader see either the old file or the whole new one, never a
   * half-written one; the queue makes concurrent saves apply in order.
   */
  private async persistSession(s: StoredSession, dir: string = this.sessionsDir()): Promise<void> {
    const key = `${dir}::${s.id}`;
    const prev = this.sessionWrites.get(key) ?? Promise.resolve();
    const next = prev
      .catch(() => {})
      .then(async () => {
        await mkdir(dir, { recursive: true });
        const target = join(dir, `${s.id}.json`);
        const tmp = `${target}.${process.pid}.tmp`;
        await writeFile(tmp, JSON.stringify(s, null, 2));
        await rename(tmp, target);
      });
    this.sessionWrites.set(key, next);
    try {
      await next;
    } finally {
      if (this.sessionWrites.get(key) === next) this.sessionWrites.delete(key);
    }
  }
  private deriveTitle(items: unknown[]): string {
    const first = (items as { kind?: string; role?: string; text?: string }[]).find(
      (it) => it?.kind === 'msg' && it?.role === 'user',
    );
    return (first?.text || '').trim().slice(0, 60) || 'Cuộc trò chuyện';
  }

  /** List saved sessions (newest first). */
  async larkSessions(): Promise<LarkSessionMeta[]> {
    let files: string[];
    try {
      files = await readdir(this.sessionsDir());
    } catch {
      return [];
    }
    const metas: LarkSessionMeta[] = [];
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      const s = await this.readSession(f.replace(/\.json$/, ''));
      if (s)
        metas.push({
          id: s.id,
          title: s.title || 'Cuộc trò chuyện',
          updatedAt: s.updatedAt || s.createdAt,
          bases: Array.isArray(s.bases) ? s.bases : [],
          runner: s.runner || 'claude',
          model: s.model,
          openTodos: (s.notes?.notes ?? []).filter((n) => n.todo && !n.done).length || undefined,
          active: s.id === this.activeSessionId,
        });
    }
    metas.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    return metas;
  }

  /** Start a brand-new conversation (fresh Claude session) scoped to `bases`. */
  async larkNewSession(bases?: LarkBaseRef[]): Promise<{ id: string }> {
    const now = new Date().toISOString();
    const id = randomUUID();
    const agentId = randomUUID();
    const settings = this.store.getSettings();
    const runner = settings.defaultRunner || 'claude';
    const model = settings.defaultModel;
    this.activeSessionId = id;
    this.chatSessionId = agentId;
    this.chatStarted = false;
    this.activeRunner = runner;
    this.activeModel = model;
    // Chỉ ghi nhớ ở BỘ NHỚ — CHƯA chạm đĩa.
    //
    // Trước đây hàm này ghi ngay một tệp phiên rỗng, nên mỗi lần bấm "+" là một hội thoại trống
    // nằm lại vĩnh viễn trong "Hội thoại cũ". Hội thoại chỉ đáng lưu khi đã có tương tác — và
    // `persistSession` sẽ tự ghi ở lần lưu đầu tiên sau lượt trò chuyện.
    void now;
    this.turnState.set(id, { agentSessionId: agentId, started: false, runner, model });
    this.draftBases.set(id, Array.isArray(bases) ? bases : []);
    return { id };
  }

  /**
   * Base đã chọn cho một hội thoại CHƯA được ghi xuống đĩa. `persistSession` đọc lại khi lưu
   * lần đầu, để lựa chọn Base lúc mở tab không mất.
   */
  private readonly draftBases = new Map<string, LarkBaseRef[]>();
  /**
   * Context-limit handoff: summarize the CURRENT conversation, then start a FRESH session
   * (same Bases) that inherits the summary. The summary is (a) shown as the new session's
   * opening message and (b) injected into the new session's first prompt to Claude (via
   * `this.carryover`), so the fresh Claude session genuinely continues the work.
   */
  async larkHandoffSession(): Promise<{ summary: string; id: string; bases: LarkBaseRef[] }> {
    let summary = '';
    const client = this.ensureClient();
    // Only summarize if there's an in-progress session to summarize.
    if (client && this.chatSessionId && this.chatStarted) {
      const systemPrompt = buildSystemPrompt({
        tenantName: this.tenantName,
        bases: this.store.getBases(),
        mode: 'ask',
        userLoggedIn: this.userLoggedIn(),
      });
      try {
        for await (const ev of runLarkAgent(
          'Tóm tắt NGẮN GỌN cuộc trò chuyện này để tiếp tục ở một phiên mới: mục tiêu, dữ liệu/Base đang dùng, các quyết định đã chốt, và việc đang làm dở. Chỉ trả về phần tóm tắt, không hỏi lại.',
          'ask',
          {
            client,
            systemPrompt,
            runner: this.activeRunner,
            model: this.activeModel,
            session: { id: this.chatSessionId, resume: this.chatStarted },
            awaitConfirm: async () => false,
            awaitAsk: async () => NO_ONE_TO_ASK,
            // Tác vụ nội bộ (tóm tắt phiên) — cũng không có ai trả lời, nên câu hỏi phải thành chỉ dẫn.
          },
        )) {
          if (ev.type === 'text') summary += ev.delta;
        }
      } catch {
        /* graceful: empty summary, still rotate to a clean session */
      }
    }
    // Keep the SAME Bases the current conversation was using (not all registered ones).
    const current = this.activeSessionId ? await this.readSession(this.activeSessionId) : null;
    const bases = current?.bases?.length ? current.bases : this.store.getBases();
    const keepRunner = this.activeRunner;
    const keepModel = this.activeModel;
    const { id } = await this.larkNewSession(bases);
    this.activeRunner = keepRunner;
    this.activeModel = keepModel;
    const fresh = await this.readSession(id);
    if (fresh) {
      await this.persistSession({ ...fresh, runner: keepRunner, model: keepModel });
    }
    summary = summary.trim();
    if (summary) {
      // Seed the displayed transcript…
      await this.larkSaveSession(
        id,
        [{ kind: 'msg', id: randomUUID(), role: 'assistant', text: `📋 Tóm tắt từ phiên trước:\n\n${summary}` }],
        bases,
      );
      // …and carry it into the new session's first prompt to Claude.
      this.carryover = { sessionId: id, summary };
    }
    return { summary, id, bases };
  }

  /**
   * NÉN NGỮ CẢNH TẠI CHỖ — giữ nguyên hội thoại người dùng đang dùng.
   *
   * Khác `larkHandoffSession` ở đúng chỗ quan trọng nhất: hàm kia tạo một HỘI THOẠI MỚI, nên
   * người dùng đang làm dở bị đẩy sang một tab khác và lịch sử nhìn thấy bị cắt làm đôi. Claude
   * Code thì nén ngay trong cuộc trò chuyện đang mở, và đó mới là thứ người ta quen.
   *
   * Ở đây "hội thoại" và "phiên Claude" là HAI thứ: hội thoại là thứ người dùng thấy (id, lịch
   * sử, Base), còn `agentSessionId` là phiên của CLI bên dưới. Nén = thay phiên bên dưới, giữ
   * nguyên mọi thứ bên trên:
   *
   *   1. nhờ chính phiên cũ tóm tắt (nó là thứ duy nhất còn nhớ)
   *   2. đổi `agentSessionId` sang id mới + `started:false` ⇒ lượt sau MỞ PHIÊN MỚI, không `--resume`
   *   3. cài `carryover` theo ĐÚNG id hội thoại này ⇒ bản tóm tắt được tiêm vào lượt kế tiếp
   *
   * Vì sao `-p` không tự lo được: Claude CLI chỉ tự nén ở chế độ tương tác. Lượt của ta chạy
   * `-p --resume`, nên ngữ cảnh cứ phình tới trần rồi lượt chạy chết lặng giữa chừng.
   */
  async larkCompactSession(convId?: string): Promise<{ ok: boolean; summary: string }> {
    const id = convId || this.activeSessionId;
    if (!id) return { ok: false, summary: '' };
    const client = this.ensureClient();
    let summary = '';
    if (client && this.chatSessionId && this.chatStarted) {
      const systemPrompt = buildSystemPrompt({
        tenantName: this.tenantName,
        bases: this.store.getBases(),
        mode: 'ask',
        userLoggedIn: this.userLoggedIn(),
      });
      try {
        for await (const ev of runLarkAgent(
          'Tóm tắt cuộc trò chuyện này để CHÍNH BẠN đọc lại và làm tiếp sau khi ngữ cảnh được nén. ' +
            'Nêu: mục tiêu, Base/bảng đang thao tác (kèm id), các quyết định đã chốt, ĐÃ LÀM XONG những gì ' +
            '(liệt kê cụ thể), và CÒN LẠI những gì. Chỉ trả về phần tóm tắt, không hỏi lại.',
          'ask',
          {
            client,
            systemPrompt,
            runner: this.activeRunner,
            model: this.activeModel,
            session: { id: this.chatSessionId, resume: this.chatStarted },
            awaitConfirm: async () => false,
            awaitAsk: async () => NO_ONE_TO_ASK,
          },
        )) {
          if (ev.type === 'text') summary += ev.delta;
        }
      } catch {
        /* tóm tắt hỏng thì vẫn nén: thà mất bối cảnh còn hơn kẹt ở trần ngữ cảnh mãi */
      }
    }
    summary = summary.trim();

    // Phiên Claude MỚI cho cùng hội thoại cũ.
    const fresh = randomUUID();
    const prev = this.turnState.get(id);
    this.turnState.set(id, {
      agentSessionId: fresh,
      started: false,
      runner: prev?.runner || this.activeRunner || 'claude',
      ...(prev?.model ?? this.activeModel ? { model: prev?.model ?? this.activeModel } : {}),
    });
    this.chatSessionId = fresh;
    this.chatStarted = false;
    const stored = await this.readSession(id);
    if (stored) await this.persistSession({ ...stored, agentSessionId: fresh });
    if (summary) this.carryover = { sessionId: id, summary };
    return { ok: true, summary };
  }

  /** Switch to a saved conversation — resumes its session, returns items + bases. */
  async larkSwitchSession(id: string): Promise<{
    items: unknown[];
    bases?: LarkBaseRef[];
    runner?: string;
    model?: string;
  }> {
    const s = await this.readSession(id);
    if (!s) return { items: [], bases: [] };
    if (this.carryover && this.carryover.sessionId !== id) this.carryover = null;
    this.activeSessionId = s.id;
    this.chatSessionId = s.agentSessionId || s.claudeSessionId;
    this.activeRunner = s.runner || 'claude';
    this.activeModel = s.model;
    this.chatStarted = true;
    // Giữ map theo-hội-thoại khớp với thao tác mở tab, để lượt kế tiếp của hội thoại này không
    // phải đọc lại đĩa và không lệch với thứ giao diện đang hiển thị.
    this.turnState.set(s.id, {
      agentSessionId: s.agentSessionId || s.claudeSessionId || null,
      started: true,
      runner: s.runner || 'claude',
      model: s.model,
    });
    return {
      items: Array.isArray(s.items) ? s.items : [],
      bases: Array.isArray(s.bases) ? s.bases : [],
      runner: this.activeRunner,
      model: this.activeModel,
    };
  }

  /**
   * Nạp trạng thái lượt của một hội thoại — đọc thẳng từ tệp phiên, KHÔNG chạm vào field dùng
   * chung. Đây là bản thay cho việc gọi `larkSwitchSession` giữa lượt: hàm đó ghi vào state toàn
   * cục nên chỉ đúng khi có duy nhất một lượt.
   */
  private async loadTurnState(convId: string): Promise<{
    agentSessionId: string | null;
    started: boolean;
    runner: string;
    model?: string;
  }> {
    const cached = this.turnState.get(convId);
    if (cached) return cached;
    const s = await this.readSession(convId);
    const st = {
      agentSessionId: s ? s.agentSessionId || s.claudeSessionId || null : null,
      started: !!s,
      runner: s?.runner || this.store.getSettings().defaultRunner || 'claude',
      model: s?.model ?? this.store.getSettings().defaultModel,
    };
    this.turnState.set(convId, st);
    return st;
  }

  /** Persist the current conversation's items (+ applied Bases when provided). */
  async larkSaveSession(id: string, items: unknown[], bases?: LarkBaseRef[]): Promise<void> {
    const existing = await this.readSession(id);
    // Never CREATE a session file here — only update one that already exists in the current
    // account's scope, HOẶC một bản nháp do chính máy này vừa mở (`draftBases`).
    //
    // Chốt chặn gốc: một lượt bắt đầu dưới tài khoản A mà lưu muộn sau khi đã chuyển sang B thì
    // không tìm thấy tệp trong thư mục B và im lặng bỏ qua — nếu không nó sẽ ghi hội thoại của A
    // vào sessions/B/ rồi đẩy lên máy chủ của B.
    //
    // Khe mở thêm: từ khi `larkNewSession` KHÔNG ghi đĩa nữa (để bấm "+" không đẻ ra hội thoại
    // rỗng), lần lưu ĐẦU TIÊN của một hội thoại mới cũng không có `existing`. Bản nháp nằm trong
    // bộ nhớ của tiến trình này và bị xoá khi đổi tài khoản, nên nó không phá được chốt trên.
    const draft = this.draftBases.get(id);
    if (!existing && draft === undefined) return;
    /**
     * Hội thoại rỗng thì chưa đáng lưu — NHƯNG gắn Base là chuyện khác.
     *
     * Lỗi đã xảy ra: người dùng bấm "+", gắn 5 Base, rồi mất sạch. Vì chốt rỗng ở đây thoát ra
     * mà KHÔNG cập nhật bản nháp, nên:
     *   • nhắn tin đầu tiên → lưu theo bản nháp CŨ ⇒ Base vừa gắn biến mất, không cần khởi động lại
     *   • khởi động lại / code-push → bản nháp nằm trong bộ nhớ nên mất nốt
     *
     * Gắn Base là một THAO TÁC CÓ CHỦ Ý của người dùng, không phải hệ quả của việc bấm "+". Nên
     * nó đáng được ghi xuống đĩa ngay, kể cả khi chưa có tin nhắn nào. Bấm "+" rồi bỏ đó thì vẫn
     * không đẻ ra hội thoại rỗng, vì lúc đó `bases` rỗng và ta vẫn thoát như cũ.
     */
    // Luật ở `core/chatTurn.shouldPersistSession` — một chỗ, kiểm được mà không cần electron.
    const worthSaving = shouldPersistSession({
      hasExisting: !!existing,
      itemCount: Array.isArray(items) ? items.length : 0,
      basesCount: Array.isArray(bases) ? bases.length : 0,
    });
    if (!worthSaving) {
      // Vẫn phải nhớ Base vào bản nháp, nếu không lần lưu sau lại lấy danh sách cũ.
      if (bases !== undefined) this.draftBases.set(id, bases);
      return;
    }
    const now = new Date().toISOString();
    await this.persistSession({
      // Carry forward anything this method doesn't know about (notes, summaries, and
      // whatever a later version adds). Rebuilding from a fixed key list silently wiped
      // those on the next completed turn.
      ...existing,
      id,
      claudeSessionId: existing?.claudeSessionId || this.chatSessionId || randomUUID(),
      agentSessionId: existing?.agentSessionId || this.chatSessionId || randomUUID(),
      runner: this.activeRunner || existing?.runner || 'claude',
      model: this.activeModel ?? existing?.model,
      title: existing?.title || this.deriveTitle(items),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      items,
      bases: bases !== undefined ? bases : existing?.bases ?? draft,
    });
    // Đã có tệp thật → bản nháp hết vai trò.
    this.draftBases.delete(id);
  }

  // ── Delegated access ("Cổng uỷ quyền") ────────────────────────────────────
  /** The AUTHORITATIVE scope for each grant, on the owner's disk. The server only ever
   *  stores base NAMES; the app_tokens live here, so a compromised server can ask for a
   *  turn but can never widen what that turn is allowed to touch. */
  private grantsPath() {
    return join(this.baseDir, 'lark', 'grants.json');
  }

  async getGrantPolicies(): Promise<Record<string, LarkGrantPolicy>> {
    try {
      return JSON.parse(await readFile(this.grantsPath(), 'utf8')) as Record<string, LarkGrantPolicy>;
    } catch {
      return {};
    }
  }

  async setGrantPolicy(grantId: string, policy: LarkGrantPolicy | null): Promise<void> {
    const all = await this.getGrantPolicies();
    if (policy) all[grantId] = policy;
    else delete all[grantId];
    await mkdir(join(this.baseDir, 'lark'), { recursive: true });
    const tmp = `${this.grantsPath()}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(all, null, 2), { mode: 0o600 });
    await rename(tmp, this.grantsPath());
  }

  /**
   * Build the ONLY toolset a delegated turn may use. Enforcement lives here, at the tool
   * layer — the earlier version merely named the allowed Bases in the system prompt while
   * the bridge still accepted any app_token, which let a friend reach Bases the owner
   * never ticked. Two rules, both checked at call time:
   *   1. Bitable read tools only (no IM / Docs / Drive / contacts / calendar surface).
   *   2. Every call must carry an app_token that is inside this grant's policy.
   * A tool with no app_token argument is dropped rather than trusted, because it would
   * act on some ambient "current base" the grant never authorised.
   */
  private scopedGrantTools(policy: LarkGrantPolicy): LarkToolDef[] {
    const allowed = new Set(policy.appTokens);
    const writable = new Set(
      Object.entries(policy.writeTokens ?? {})
        .filter(([token, on]) => on && allowed.has(token))
        .map(([token]) => token),
    );
    // Công cụ GHI chỉ được đưa vào bộ khi grant ở chế độ 'build' VÀ có ít nhất một Base cho ghi.
    // Không có gì để ghi thì đừng đưa tool ghi vào tay agent — bớt một đường để nó đi sai.
    const canWriteAnything = policy.mode === 'build' && writable.size > 0;
    const pool: LarkToolDef[] = canWriteAnything ? allTools() : readOnlyTools();

    return pool
      .filter((t) => t.name.startsWith('bitable_'))
      .filter((t) => JSON.stringify(t.inputSchema ?? {}).includes('app_token'))
      .map((t) => ({
        ...t,
        exec: async (input: Record<string, any>, client: LarkClient) => {
          const token = String(input?.app_token ?? '');
          if (!token) throw new Error('Từ chối: lượt uỷ quyền phải chỉ rõ app_token của Base.');
          if (!allowed.has(token)) {
            // CỐ Ý không nói Base đó có tồn tại hay không — chỉ nói "ngoài phạm vi". Xác nhận sự
            // tồn tại của một Base cũng là rò rỉ: người được chia sẻ dò được tên bảng nội bộ.
            throw new Error('Từ chối: Base này không nằm trong phạm vi được chia sẻ.');
          }
          // `gated` = công cụ có tác dụng phụ (ghi/xoá). Kiểm theo TỪNG Base ngay tại thời điểm
          // gọi, không dựa vào việc "đã lọc lúc dựng bộ": cùng một tool ghi có thể hợp lệ với
          // Base này mà không hợp lệ với Base kia.
          if (t.gated && !writable.has(token)) {
            throw new Error('Từ chối: bạn chỉ có quyền ĐỌC trên Base này, không được sửa dữ liệu.');
          }
          return t.exec(input, client);
        },
      }));
  }

  /**
   * Run ONE delegated turn for a grantee, confined to `scopedGrantTools`. Policy is
   * re-read from disk on every call (never cached), so narrowing or revoking a grant
   * takes effect immediately. Bounded by a wall-clock timeout so one runaway prompt
   * cannot wedge the gateway or burn unbounded tokens. Never throws to the caller.
   */
  async runGrantTurn(grantId: string, prompt: string): Promise<{ ok: boolean; text?: string; error?: string }> {
    const policy = (await this.getGrantPolicies())[grantId];
    if (!policy) return { ok: false, error: 'Chưa cấu hình phạm vi cho quyền này trên máy chủ sở hữu' };
    if (policy.revoked) return { ok: false, error: 'Quyền đã bị thu hồi' };
    if (!policy.appTokens?.length) return { ok: false, error: 'Quyền này chưa được cấp Base nào' };
    const client = this.ensureClient();
    if (!client) return { ok: false, error: 'Máy chủ sở hữu chưa kết nối Lark' };

    const allowed = this.store.getBases().filter((b) => policy.appTokens.includes(b.appToken));
    if (allowed.length === 0) return { ok: false, error: 'Base được cấp không còn tồn tại trên máy chủ sở hữu' };
    const tools = this.scopedGrantTools(policy);
    if (tools.length === 0) return { ok: false, error: 'Không có công cụ hợp lệ cho lượt uỷ quyền' };

    // Chế độ của lượt uỷ quyền bám theo chính sách trên đĩa của CHỦ SỞ HỮU: 'build' chỉ khi
    // grant cho phép VÀ có Base được cấp quyền ghi. Việc chặn thật nằm ở `scopedGrantTools`
    // (theo từng Base) — dòng này chỉ để lời nhắc hệ thống nói đúng thứ agent thực sự làm được.
    const writableTokens = Object.entries(policy.writeTokens ?? {})
      .filter(([token, on]) => on && policy.appTokens.includes(token))
      .map(([token]) => token);
    const delegatedMode: 'ask' | 'build' =
      policy.mode === 'build' && writableTokens.length > 0 ? 'build' : 'ask';
    const systemPrompt = buildSystemPrompt({
      tenantName: this.tenantName,
      bases: allowed,
      mode: delegatedMode,
      userLoggedIn: this.userLoggedIn(),
      // scopedGrantTools chỉ giữ tool tiền tố `bitable_` → không có lark_read_attachment ở lượt này.
      hasAttachmentTool: false,
    });

    let out = '';
    let timedOut = false;
    // Cắt THẬT, cùng lý do với `runScheduledAgentTurn`: cờ suông chỉ được đọc khi có sự kiện kế
    // tiếp, mà lượt treo thì chẳng có sự kiện nào — nên tiến trình con sống quá trần lúc nào
    // không hay. Ở lượt CHẠY HỘ điều đó còn khó chịu hơn: đó là yêu cầu của NGƯỜI KHÁC đang
    // chạy trên máy chủ nhà, và chủ máy không ngồi đó để tắt.
    const stopper = new AbortController();
    const timer = setTimeout(() => {
      timedOut = true;
      stopper.abort();
    }, 120_000);
    try {
      for await (const ev of runLarkAgent(prompt.slice(0, 4000), 'ask', {
        client,
        systemPrompt,
        signal: stopper.signal,
        // SECURITY: pin the CLAUDE runner. The scope-checked toolsOverride enforces ONLY on the
        // claude MCP-bridge path; a non-claude runner (this.activeRunner may be codex/grok/gemini
        // if the owner last used one) routes to runLarkOrchestrator, which spawns a CLI with
        // --dangerously-bypass-approvals-and-sandbox / --yolo / --always-approve and its OWN
        // shell/fs tools auto-approved — that would give a grantee unsandboxed command execution
        // on the owner's machine, bypassing the Bitable-only scope entirely. mode 'ask' already
        // forces the claude ASK model, so activeModel isn't needed here.
        runner: 'claude',
        session: { id: randomUUID(), resume: false },
        toolsOverride: tools,
        // A delegated turn must never block on the owner being at the keyboard, and a
        // grantee must never be able to drive an interactive prompt.
        awaitConfirm: async () => false,
        awaitAsk: async () => NO_ONE_TO_ASK,
        // Lượt CHẠY HỘ: người gửi yêu cầu không ngồi ở đây, nên câu hỏi cũng treo y như lượt theo lịch.
      })) {
        if (timedOut) break;
        if (ev.type === 'text') out += ev.delta;
        if (out.length > 60_000) break;
      }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Lỗi khi chạy lượt' };
    } finally {
      clearTimeout(timer);
    }
    if (timedOut && !out.trim()) return { ok: false, error: 'Quá thời gian chạy (120 giây)' };
    return { ok: true, text: out.trim() };
  }

  /**
   * Run ONE delegated turn for a shared "Trợ lý AI" (kind='agentchat'). Unlike a Lark grant
   * this needs NO Lark connection and NO per-base policy — the entire policy IS "read-only":
   * the CLI is confined to read/search/browse tools (no Bash/Write/Edit), enforced in
   * larkAgent via a --tools whitelist + --disallowedTools deny. Bounded by a wall-clock
   * timeout + output cap; never throws to the caller. `grantId` is accepted for signature
   * parity with the Lark path (and future per-grant model routing) but isn't a scope key.
   */
  async runAgentGrantTurn(_grantId: string, prompt: string): Promise<{ ok: boolean; text?: string; error?: string }> {
    const text = String(prompt || '').trim();
    if (!text) return { ok: false, error: 'Nội dung trống' };
    // SECURITY: pin the CLAUDE runner. The read-only tool whitelist (--tools/--disallowedTools/
    // --strict-mcp-config) is enforced ONLY on the claude path; the other runners (codex/grok/
    // gemini) spawn sandbox-bypassing CLIs. Never inherit this.activeRunner (the owner may have
    // last used a non-claude runner) and never pass this.activeModel (it may be a non-claude
    // model id) — let claude use its default model.
    const systemPrompt = buildReadOnlyAssistantPrompt();

    let out = '';
    let timedOut = false;
    // Cắt THẬT, cùng lý do với `runScheduledAgentTurn`: cờ suông chỉ được đọc khi có sự kiện kế
    // tiếp, mà lượt treo thì chẳng có sự kiện nào — nên tiến trình con sống quá trần lúc nào
    // không hay. Ở lượt CHẠY HỘ điều đó còn khó chịu hơn: đó là yêu cầu của NGƯỜI KHÁC đang
    // chạy trên máy chủ nhà, và chủ máy không ngồi đó để tắt.
    const stopper = new AbortController();
    const timer = setTimeout(() => {
      timedOut = true;
      stopper.abort();
    }, 120_000);
    try {
      for await (const ev of runLarkAgent(text.slice(0, 8000), 'ask', {
        systemPrompt,
        signal: stopper.signal,
        runner: 'claude',
        session: { id: randomUUID(), resume: false },
        // No Lark, no scope: a private scratch workspace + read-only built-in tools only.
        generalMode: true,
        readOnly: true,
        // A delegated turn must never block on the owner being at the keyboard, and a
        // grantee must never be able to drive an interactive prompt.
        awaitConfirm: async () => false,
        awaitAsk: async () => NO_ONE_TO_ASK,
        // Lượt CHẠY HỘ: người gửi yêu cầu không ngồi ở đây, nên câu hỏi treo y như lượt theo lịch.
      })) {
        if (timedOut) break;
        if (ev.type === 'text') out += ev.delta;
        if (out.length > 60_000) break;
      }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Lỗi khi chạy lượt' };
    } finally {
      clearTimeout(timer);
    }
    if (timedOut && !out.trim()) return { ok: false, error: 'Quá thời gian chạy (120 giây)' };
    return { ok: true, text: out.trim() };
  }

  /**
   * Run a saved Lark-agent prompt HEADLESS for a scheduled automation (e.g. a recurring
   * "PBTTCN" reconciliation). Owner turn pinned to the claude ASK path → read-only Lark tools
   * (bitable etc.), fresh session, non-interactive (auto-decline confirms), bounded by a timeout.
   */
  /**
   * Chạy MỘT lượt agent theo lịch.
   *
   * `mode` mặc định 'build' (THỰC THI). Trước đây chỗ này ghim cứng 'ask' + `awaitConfirm` luôn
   * trả false, nên mọi lịch đều chỉ đọc: một lịch kiểu "mỗi ngày 9h đối chiếu rồi ghi vào bảng
   * 4.1.3" chạy xong chỉ trả về một câu giải thích rằng nó không có quyền tạo bản ghi — đúng cái
   * việc người dùng đặt lịch để khỏi phải tự làm.
   *
   * Ở chế độ thực thi, `awaitConfirm` PHẢI tự duyệt: lượt chạy này không có ai ngồi trước máy để
   * bấm xác nhận, và trả false thì mọi thao tác ghi đều bị từ chối — tức lại quay về chỉ-đọc, chỉ
   * khác là lần này im lặng. Việc đặt một lịch THỰC THI chính là sự cho phép ấy; giao diện nói rõ
   * điều đó ở chỗ chọn, và mỗi lần chạy đều được ghi vào lịch sử kèm SỐ THAO TÁC GHI để rà lại.
   *
   * Runner vẫn ghim 'claude' như cũ: một lượt chạy không người trông không được phép rơi sang
   * runner có thể thoát khỏi hộp cát.
   */
  async runScheduledAgentTurn(
    prompt: string,
    mode: 'ask' | 'build' = 'build',
    stats?: { tools: number; writes: number },
    /** Trần ký tự. Mặc định 8000 hợp cho một lịch; một lượt SKILL mang cả thân skill + bảng dữ
     *  liệu nên cần rộng hơn, và cắt cụt ở đây thì skill mất phần cuối mà không ai báo. */
    maxChars = 8000,
    /** Thư mục chứa tệp cho lượt này (dùng cho kỹ năng trích xuất đọc Excel/PDF/ảnh). */
    attach?: { dir: string; names: string[] },
    /**
     * Trần thời gian. Mặc định 240s hợp cho một lịch báo cáo.
     *
     * Một lượt KỸ NĂNG thì cần rộng hơn nhiều: nó thường quét trọn một bảng có phân trang, và
     * 240s là vừa đủ để bị cắt ngang giữa lúc đang đọc trang cuối.
     */
    timeoutMs = 240_000,
  ): Promise<string> {
    const text = String(prompt || '').trim();
    if (!text) throw new Error('Prompt trống');
    const client = this.ensureClient();
    if (!client) throw new Error('Chưa kết nối Lark trên máy chủ');
    const scoped = this.basesForPrompt(text);
    const systemPrompt = buildSystemPrompt({
      tenantName: this.tenantName,
      // Chỉ nêu Base việc này dùng tới. Cấp cả kho cho một lượt chạy không ai trông, ở chế độ được
      // GHI, là mở ra đúng số chỗ nó có thể ghi nhầm — xem basesForPrompt.
      bases: scoped.length ? scoped : this.store.getBases(),
      mode,
      userLoggedIn: this.userLoggedIn(),
    });
    let out = '';
    let timedOut = false;
    /**
     * CẮT THẬT khi hết giờ, không chỉ giơ cờ lên rồi chờ.
     *
     * Trước đây trần thời gian chỉ bật `timedOut` rồi trông vào `if (timedOut) break` trong vòng
     * lặp. Nhưng vòng lặp đang TREO ở `await` chờ sự kiện kế tiếp: model đang nghĩ, hoặc một lời
     * gọi công cụ đang quét bảng phân trang. Không có sự kiện nào tới thì không ai kiểm cờ cả.
     *
     * Đo trên lịch sử chạy thật của người dùng: trần 240 giây, mà các lượt chạy tới 259s, 272s,
     * 369s, và một lượt 958s — GẤP BỐN lần trần. Tức lượt chạy vẫn làm việc, vẫn tốn tiền, chạy
     * xong xuôi rồi mới bị vứt kết quả đi vì "đã quá giờ". Tệ hơn cả không đặt trần: tốn đủ tiền
     * mà không nhận được gì.
     *
     * `runLarkAgent` giết tiến trình con NGAY khi `signal` báo huỷ, nên đây là chỗ cắt thật.
     */
    const stopper = new AbortController();
    const timer = setTimeout(() => {
      timedOut = true;
      stopper.abort();
    }, timeoutMs);
    /**
     * Nơi `create_file` ghi tệp cho lượt CHẠY THEO LỊCH.
     *
     * Không có dòng này thì một lịch "mỗi sáng xuất báo cáo Excel" hỏng ngay ở bước cuối với câu
     * "Chưa có thư mục ghi tệp" — chỗ khó chịu nhất để hỏng, vì mọi việc nặng đã làm xong. Đường
     * chat đặt thư mục theo hội thoại; lượt theo lịch không có hội thoại nên dùng MỘT thư mục
     * dùng chung, CỐ ĐỊNH. Không sinh ngẫu nhiên mỗi lượt vì hai lý do: `send_file` chạy ở lượt
     * sau `create_file` và phải thấy được tệp vừa dựng, và một thư mục mới mỗi lần chạy nghĩa là
     * mỗi ngày một thư mục rác nữa nằm lại trong userData.
     *
     * Trùng tên giữa hai lịch thì lịch chạy sau ghi đè — đúng ý: báo cáo hôm nay thay báo cáo
     * hôm qua, chứ không phải xếp chồng vô hạn.
     */
    const outDir = await this.chatWorkDir('sched-files').catch(() => undefined);
    setFileOutDir(outDir ?? null);
    try {
      for await (const ev of runLarkAgent(text.slice(0, maxChars), mode, {
        client,
        systemPrompt,
        runner: 'claude',
        signal: stopper.signal,
        /**
         * MỘT LỊCH KHÔNG ĐƯỢC TẠO THÊM LỊCH.
         *
         * Lượt này chạy vì một lịch vừa tới giờ, và nó cầm trọn bộ công cụ mặc định — trong đó
         * có `schedule_agent_job`. Prompt của lịch thường viết theo giọng người dùng đặt việc
         * ("mỗi ngày 9h chạy skill PBTTCN trên Base …"), nên model rất dễ đọc ra là "hãy ĐẶT
         * LỊCH" thay vì "hãy LÀM". Nó gọi tool đặt lịch, `awaitConfirm` ở chế độ build tự duyệt,
         * thế là sinh một quy tắc nữa — và vì chống trùng chỉ khớp khi prompt GIỐNG HỆT TỪNG CHỮ
         * (xem AutomationEngine.upsert), chỉ cần model diễn đạt lệch một chữ là thành quy tắc
         * mới, id mới, và một hội thoại `sched-<id>` mới. Lần chạy sau lặp lại. Nhìn từ ngoài:
         * hội thoại cứ mọc thêm mà việc thì không ai làm.
         *
         * Bỏ đúng một công cụ là chặn vòng tự nhân bản ấy ngay tại gốc. Người dùng vẫn đặt lịch
         * được như cũ trong hội thoại thường — chỗ có người ngồi đọc câu xác nhận.
         */
        toolsOverride: (mode === 'ask' ? readOnlyTools() : allTools()).filter(
          (t) => t.name !== 'schedule_agent_job',
        ),
        session: { id: randomUUID(), resume: false },
        ...(attach?.names.length ? { attachDir: attach.dir, attachNames: attach.names } : {}),
        // Chế độ thực thi: tự duyệt (xem chú thích trên). Chế độ chỉ-đọc: từ chối như cũ —
        // ở đó một lời xin ghi là dấu hiệu prompt sai, không phải việc cần cho qua.
        awaitConfirm: async () => mode === 'build',
        awaitAsk: async () => NO_ONE_TO_ASK,
      })) {
        if (timedOut) break;
        if (ev.type === 'text') out += ev.delta;
        // Đếm để ghi vào lịch sử: tổng số lời gọi, và bao nhiêu trong đó là thao tác GHI — đó là
        // con số người dùng cần nhất khi rà lại một lịch chạy tự động.
        if (ev.type === 'tool_call' && stats) {
          stats.tools += 1;
          // Tra thẳng bảng công cụ, KHÔNG dùng `ev.gated`: cờ đó là `tool.gated && !autoApprove`,
          // nên khi tự-duyệt bật lên thì một thao tác ghi lại báo gated=false và lịch sử sẽ nói
          // "0 thao tác ghi" cho đúng lượt đã ghi nhiều nhất.
          if (isWriteTool(ev.name)) stats.writes += 1;
        }
        if (out.length > 80_000) break;
      }
    } finally {
      clearTimeout(timer);
    }
    // HẾT GIỜ LÀ HỎNG, kể cả khi đã có chữ.
    //
    // Trước đây chỉ ném khi output RỖNG — hết giờ giữa chừng mà có chữ dở dang thì trả về như thể
    // thành công. Với một lượt kỹ năng, đoạn văn cụt đó không có khối ```facts ở cuối, nên kỹ năng
    // "chạy xong" mà không ra khoá nào, và vòng lặp chỉ ghi một dòng chú thích nhẹ nhàng. Đo trên
    // máy người dùng: một bộ 5 kỹ năng hỏng đúng kiểu này ở CẢ HAI lượt chạy, và nguyên nhân thật
    // (hết giờ) không hiện ở đâu cả — chỉ thấy "chưa ra khoá".
    //
    // Một câu trả lời bị cắt không phải là câu trả lời. Ném ra thì `skillRun` thử lại được, và nếu
    // vẫn hỏng thì người dùng đọc được đúng lý do.
    if (timedOut) {
      throw new Error(
        `Quá thời gian chạy (${Math.round(timeoutMs / 1000)} giây)` +
          (out.trim() ? ' — kết quả bị cắt giữa chừng nên không dùng được.' : ''),
      );
    }
    const answer = out.trim();
    /**
     * HẾT LƯỢT CLAUDE KHÔNG PHẢI LÀ MỘT BÁO CÁO.
     *
     * Khi thuê bao chạm trần tuần, CLI không trả mã lỗi — nó in "You've hit your weekly limit"
     * ra như một câu trả lời bình thường rồi thoát êm. `friendlyRunnerError` không thấy gì vì
     * nó chỉ đọc kênh LỖI. Thế là lịch sử ghi dấu ✓, và người dùng lướt qua tưởng lịch đã chạy.
     * Đo trên lịch sử thật của người dùng: lượt 15/9 ghi "✓ · 6s · You've hit your weekly limit".
     * Một lượt 6 giây không đọc nổi một dòng Base nào — nhưng dấu ✓ nói ngược lại.
     *
     * Chốt theo ĐỘ DÀI trước rồi mới tới chữ: một báo cáo thật có nhắc chữ "limit" vẫn dài hơn
     * nhiều, nên ngưỡng ngắn giữ cho luật này không cắt nhầm việc đang chạy đúng.
     */
    if (answer.length < 300 && /hit your .{0,20}limit|weekly limit|usage limit/i.test(answer)) {
      throw new Error(`Claude đã hết lượt dùng — chưa chạy được gì. CLI trả về: ${answer}`);
    }
    return answer;
  }

  // ── Bộ kỹ năng có hợp đồng: chạy và kiểm chéo liên tục ───────────────────────────────

  /**
   * Hợp đồng của MỌI skill đã bật, kèm thân SKILL.md.
   *
   * Đọc từ đúng registry mà SkillHost ghi, nên không có bản chép thứ hai để trôi lệch.
   */
  /**
   * @param includeDisabled Lấy cả kỹ năng đang TẮT. Chỉ dùng cho việc HIỂN THỊ.
   *
   * Vì sao cần tách: danh sách bộ lọc theo `enabled` thì tắt một kỹ năng là cả bộ biến mất khỏi màn
   * hình — người dùng tưởng mất dữ liệu. Nặng hơn: chế độ sửa bộ phải tắt các kỹ năng lại (để lịch
   * tự động không nổ giữa lúc sửa dở), mà tắt xong thì chính cái đang sửa biến mất.
   *
   * Đường CHẠY vẫn chỉ lấy kỹ năng đang bật — tắt là tắt, không chạy.
   */
  private async loadSkillContracts(
    includeDisabled = false,
  ): Promise<{ contracts: SkillContract[]; bodies: Map<string, string>; off: Set<string> }> {
    const contracts: SkillContract[] = [];
    const bodies = new Map<string, string>();
    const off = new Set<string>();
    for (const e of await this.readSkillRegistry()) {
      if (!e.enabled) {
        if (!includeDisabled) continue;
        off.add(e.id);
      }
      const md = await readFile(join(this.baseDir, 'skills', 'lib', e.id, 'SKILL.md'), 'utf8').catch(() => '');
      if (!md) continue;
      contracts.push(parseSkillContract(e.id, e.name || e.id, md));
      bodies.set(e.id, await this.readSkillBody(e.id));
    }
    return { contracts, bodies, off };
  }

  /** Những skill có khai hợp đồng — giao diện dùng để biết skill nào chạy được theo bộ. */
  async listSkillSets(): Promise<
    {
      id: string;
      name: string;
      members: string[];
      issues: string[];
      target?: string;
      runs?: SkillSetRun[];
      tags?: string[];
      produces?: string[];
    }[]
  > {
    const history = await this.readSetRuns();
    // Nhãn lấy từ sổ đăng ký (SKILL.md không giữ nhãn). Chỉ dùng để GOM NHÓM KHI HIỂN THỊ.
    const tagsById = new Map((await this.readSkillRegistry()).map((e) => [e.id, e.tags ?? []]));
    const { contracts, off } = await this.loadSkillContracts(true);
    const withContract = contracts.filter(hasContract);
    const seen = new Set<string>();
    const out: LarkSkillSet[] = [];
    for (const c of withContract) {
      if (seen.has(c.id)) continue;
      const set = relatedSet(withContract, c.id);
      for (const m of set) seen.add(m.id);
      // Kỹ năng đứng MỘT MÌNH vẫn hiện ở đây, có chủ ý.
      //
      // Trước đây lọc `set.length < 2` với lý lẽ "một mình thì không kiểm chéo với ai". Nhưng hậu
      // quả là: người dùng khai hợp đồng đúng cho 4 kỹ năng, mở màn hình lên thì thấy
      // "Chưa kỹ năng nào khai hợp đồng" — máy nói họ chưa làm gì trong khi họ vừa làm xong. Và
      // một kỹ năng đơn CÓ `target` thì vẫn chạy được thật (trích tệp rồi ghi bảng), nên giấu nó
      // đi là giấu luôn nút chạy.
      //
      // `soloReason` nói rõ vì sao nó đứng một mình, để người dùng biết phải thêm gì mới nối được.
      const solo = set.length < 2;
      const issues: string[] = [];
      const produced = new Set(set.flatMap((m) => m.produces));
      for (const m of set) {
        for (const n of m.needs) {
          if (!produced.has(n)) issues.push(`"${m.name}" cần ${n} nhưng không kỹ năng nào trong bộ sinh ra`);
        }
      }
      /**
       * Sắp theo THỨ TỰ SẼ CHẠY, không phải thứ tự duyệt đồ thị.
       *
       * `relatedSet` trả về theo đường lan từ kỹ năng gốc — nên kỹ năng TỔNG HỢP (cần khoá của mọi
       * kỹ năng khác, tức là chạy CUỐI) lại đứng đầu danh sách. Nối chúng bằng mũi tên "→" là nói
       * với người dùng một thứ tự SAI, ngay ở chỗ dễ tin nhất.
       *
       * Đây là mô phỏng đúng vòng lặp thật với bảng khoá rỗng: lặp lại việc chọn kỹ năng đã đủ
       * `needs`. Thứ tự thật lúc chạy có thể khác nếu dữ liệu đầu vào đã có sẵn khoá — nên giao
       * diện gọi nó là thứ tự DỰ KIẾN, và lịch sử chạy mới là thứ tự đã xảy ra.
       */
      const ordered: SkillContract[] = [];
      {
        const have = new Set<string>();
        const left = [...set];
        while (left.length) {
          const i = left.findIndex((m) => m.needs.every((n) => have.has(n)));
          // Không ai đủ điều kiện ⇒ vòng phụ thuộc hoặc thiếu khoá. Đổ nốt phần còn lại theo thứ
          // tự cũ chứ không bỏ sót: `issues` ở dưới đã nói rõ bộ này sẽ dừng giữa chừng.
          if (i < 0) {
            ordered.push(...left);
            break;
          }
          const [m] = left.splice(i, 1);
          for (const p of m.produces) have.add(p);
          ordered.push(m);
        }
      }
      const target = set.map((m) => m.target).find(Boolean);
      // Khoá đã khai `map` nhưng không kỹ năng nào sinh ra ⇒ cột đó sẽ luôn trống. Nói TRƯỚC khi
      // chạy, vì phát hiện sau khi đã ghi 50 dòng thì phải đi dọn bảng.
      if (target) {
        const produced = new Set(set.flatMap((m) => m.produces));
        for (const key of Object.keys(target.map)) {
          if (!produced.has(key)) issues.push(`cột "${target.map[key]}" gắn với khoá ${key} nhưng không kỹ năng nào sinh ra`);
        }
      }
      if (solo && !c.needs.length && !c.checks.length && !c.target) {
        issues.push(
          `chỉ khai "produces" nên chưa nối với kỹ năng nào — thêm "needs" (khoá do kỹ năng khác sinh ra) ` +
            `hoặc "checks" nhắc tới khoá của chúng thì mới kiểm chéo được`,
        );
      }
      /**
       * Nhãn đại diện cho bộ = nhãn mà ĐA SỐ thành viên mang.
       *
       * Ban đầu dùng GIAO của mọi thành viên, và luật đó giòn: chỉ cần MỘT kỹ năng quên gắn nhãn
       * là giao thành rỗng và cả ngăn mất tên — dù bốn kỹ năng còn lại đều gắn đủ. Chuyện này xảy
       * ra thật ngay lần đầu, vì mô hình nhớ khai `needs` (thiếu là bộ không chạy) nhưng hay quên
       * nhãn (thiếu vẫn chạy).
       *
       * "Đa số" phân biệt được hai chuyện khác hẳn nhau mà giao thì gộp làm một: nhãn VẮNG ở một
       * thành viên (bộ vẫn thuộc về nhãn đó) và nhãn chỉ MỘT thành viên mang (không đại diện cho
       * bộ). Với bộ 2 thành viên, "quá nửa" nghĩa là cả hai — đúng bằng giao, nên ca đơn giản
       * không đổi hành vi.
       */
      const tagCount = new Map<string, number>();
      for (const m of set) for (const t of tagsById.get(m.id) ?? []) tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
      const shared = [...tagCount.entries()].filter(([, n]) => n * 2 > set.length).map(([t]) => t);
      out.push({
        id: c.id,
        ...(shared.length ? { tags: shared.sort() } : {}),
        produces: [...new Set(set.flatMap((m) => m.produces))],
        ...(() => {
          // Tiền tố chung của mọi khoá trong bộ. Cắt tới dấu gạch dưới CUỐI CÙNG còn chung nhau,
          // để `tt_kh_trung` + `tt_tong_soluong` ra `tt_` chứ không ra `tt_` rồi lại `tt_t`.
          const keys = [...new Set(set.flatMap((m) => [...m.needs, ...m.produces]))];
          if (keys.length < 2) return {};
          let pre = keys[0];
          for (const k of keys) {
            let i = 0;
            while (i < pre.length && i < k.length && pre[i] === k[i]) i++;
            pre = pre.slice(0, i);
          }
          const cut = pre.lastIndexOf('_');
          return cut > 0 ? { ns: pre.slice(0, cut + 1) } : {};
        })(),
        nodes: ordered.map((m) => ({
          id: m.id,
          name: m.name,
          needs: m.needs,
          produces: m.produces,
          checks: m.checks.map((c) => c.raw),
          enabled: !off.has(m.id),
          // Bước này phải chạy SAU ai — suy từ khoá, không phải từ vị trí trong danh sách.
          after: ordered
            .filter((x) => x.id !== m.id && x.produces.some((k) => m.needs.includes(k)))
            .map((x) => x.name),
        })),
        ...(history[c.id]?.length ? { runs: history[c.id] } : {}),
        name: ordered.map((m) => m.name).join(' → '),
        members: ordered.map((m) => m.name),
        issues,
        ...(target ? { target: target.table } : {}),
      });
    }
    return out;
  }

  /** Tệp lưu lịch sử chạy bộ kỹ năng. Nằm cạnh thư viện kỹ năng, không lẫn vào sổ đăng ký. */
  private setRunsPath(): string {
    return join(this.baseDir, 'skills', 'set-runs.json');
  }

  private async readSetRuns(): Promise<Record<string, SkillSetRun[]>> {
    try {
      const raw = await readFile(this.setRunsPath(), 'utf8');
      const j = JSON.parse(raw) as Record<string, SkillSetRun[]>;
      return j && typeof j === 'object' ? j : {};
    } catch {
      // Chưa có tệp / tệp hỏng ⇒ coi như chưa có lịch sử. Lịch sử là thứ PHỤ, hỏng nó không được
      // phép làm hỏng lượt chạy.
      return {};
    }
  }

  /**
   * Ghi một lượt vào lịch sử. Giữ 20 lượt gần nhất mỗi bộ, MỚI NHẤT Ở ĐẦU.
   *
   * Cắt ở 20 vì thứ người dùng thật sự so là "lượt này với vài lượt trước"; giữ vô hạn thì tệp
   * phình theo thời gian mà không ai đọc tới phần đuôi.
   */
  private async recordSetRun(setId: string, run: SkillSetRun): Promise<void> {
    try {
      const all = await this.readSetRuns();
      all[setId] = [run, ...(all[setId] ?? [])].slice(0, 20);
      await mkdir(join(this.baseDir, 'skills'), { recursive: true });
      await writeFile(this.setRunsPath(), JSON.stringify(all, null, 2));
    } catch {
      /* lịch sử hỏng không được làm hỏng lượt chạy */
    }
  }

  /**
   * Chạy bộ kỹ năng chứa `skillId`: từng kỹ năng một lượt riêng, kiểm chéo sau MỖI lượt.
   *
   * Vì sao không nhét cả bộ vào một lượt như đường cũ: nhét cả bộ thì mô hình tự chọn thứ tự và
   * tự nhận là đã đối chiếu — đúng thứ người dùng đang gặp. Ở đây thứ tự do dữ liệu quyết định
   * (`readySkills`) và ràng buộc được TÍNH bằng mã (`evalCheck`), không phải được hỏi.
   */
  async runSkillSetById(
    skillId: string,
    opts?: {
      seedFacts?: Record<string, string | number | boolean | null>;
      /**
       * 'ask' = chỉ đọc (chạy thử), 'build' = được ghi vào Base thật.
       *
       * Mặc định CHỈ ĐỌC có chủ ý. Lượt chạy bộ mượn đường của lịch tự động, mà ở đó thao tác
       * ghi được TỰ DUYỆT vì không ai ngồi trông. Người bấm nút thì đang ngồi trông — mặc định
       * ghi thẳng vào Base thật ngay lần đầu chạy một tính năng mới là đánh đổi sai chiều.
       */
      mode?: 'ask' | 'build';
      /** Xem `SkillRunOptions.skipSeeded`. Mặc định (bỏ trống) = bật. */
      skipSeeded?: boolean;
      onEvent?: (e: SkillRunEvent) => void;
    },
  ): Promise<SkillRunResult> {
    const mode = opts?.mode === 'build' ? 'build' : 'ask';
    const { contracts, bodies } = await this.loadSkillContracts();
    const withContract = contracts.filter(hasContract);
    const set = relatedSet(withContract, skillId);
    if (!set.length) throw new Error('Kỹ năng này chưa khai báo hợp đồng (needs/produces/checks).');

    // Dựng diễn biến từng bước TỪ CHÍNH dòng sự kiện của vòng lặp, không dựng lại từ kết quả cuối.
    // Kết quả cuối không nói được bước nào làm gãy ràng buộc rồi bị bắt chạy lại — mà đó đúng là
    // phần đáng đọc nhất của một lượt kiểm chéo.
    const steps: SkillSetRun['steps'] = [];
    const startedMs = Date.now();
    const track = (e: SkillRunEvent) => {
      if (e.type === 'skipped') {
        steps.push({ name: e.name, attempt: 0, produced: e.produces, broke: [], skipped: true });
      } else if (e.type === 'skill_start') {
        steps.push({ name: e.name, attempt: e.attempt, produced: [], broke: [] });
      } else if (e.type === 'skill_done') {
        // Gắn vào bước ĐANG mở của đúng kỹ năng này (lần thử cuối), không phải bước cuối danh sách.
        for (let i = steps.length - 1; i >= 0; i--) {
          if (!steps[i].skipped && !steps[i].produced.length) {
            steps[i].produced = e.produced;
            break;
          }
        }
      } else if (e.type === 'turn_failed') {
        for (let i = steps.length - 1; i >= 0; i--) {
          if (steps[i].name === e.name && steps[i].attempt === e.attempt) {
            steps[i].failed = e.reason;
            break;
          }
        }
      } else if (e.type === 'conflict' && e.retryingSkill) {
        for (let i = steps.length - 1; i >= 0; i--) {
          if (steps[i].name === e.retryingSkill) {
            steps[i].broke = e.failing.map((f) => f.check.raw);
            break;
          }
        }
      }
    };

    const result = await runSkillSet(
      set,
      bodies,
      {
        // Mỗi kỹ năng là một lượt agent ĐỘC LẬP: không nối tiếp hội thoại, nên kết quả bước sau
        // không bị lời lẽ của bước trước dẫn dắt — chỉ dữ liệu trong bảng mới truyền đi được.
        // 10 phút: kỹ năng kiểm chéo thường quét trọn một bảng có phân trang. Đo thật trên máy
        // người dùng, một bước như vậy chạm trần 240s và trả về kết quả cụt.
        runTurn: (prompt) => this.runScheduledAgentTurn(prompt, mode, undefined, 24_000, undefined, 600_000),
        judge: async (assertion, facts) => {
          const answer = await this.runScheduledAgentTurn(
            [
              'Chỉ trả lời đúng MỘT từ: PASS, FAIL hoặc UNKNOWN.',
              'Ràng buộc cần kiểm:',
              assertion,
              'Dữ liệu:',
              ...Object.entries(facts).map(([k, v]) => `${k}: ${JSON.stringify(v)}`),
              'Không chắc thì trả UNKNOWN — đừng đoán.',
            ].join('\n'),
            'ask',
            undefined,
            12_000,
          ).catch(() => '');
          const a = answer.toUpperCase();
          // Khớp chặt: một câu dài lan man KHÔNG được coi là kết luận. Thà UNKNOWN.
          if (/\bFAIL\b/.test(a)) return 'fail';
          if (/\bPASS\b/.test(a)) return 'pass';
          return 'unknown';
        },
        emit: (e) => {
          track(e);
          opts?.onEvent?.(e);
        },
      },
      { seedFacts: opts?.seedFacts, skipSeeded: opts?.skipSeeded },
    );

    await this.recordSetRun(skillId, {
      at: new Date(startedMs).toISOString(),
      ms: Date.now() - startedMs,
      mode,
      ran: result.ran,
      failing: result.checks.filter((c) => c.verdict === 'fail').map((c) => c.check.raw),
      blocked: result.blocked.map((b) => b.name),
      steps,
    });
    return result;
  }

  /**
   * Chạy một bộ kỹ năng CHO TỰ ĐỘNG HOÁ, rồi ghi kết quả về.
   *
   * Tách khỏi `runSkillSetById` vì ba khác biệt đều thuộc về ngữ cảnh "không ai ngồi trông":
   *   • mặc định `build` — đặt lịch là để nó LÀM, không phải để giải thích vì sao không làm được;
   *   • `skipSeeded` bật — dữ liệu đưa vào là dòng Base THẬT của khách, không được ghi đè;
   *   • trả về câu tóm tắt đọc được, vì thứ duy nhất người dùng thấy sau đó là dòng lịch sử chạy.
   *
   * Đường ghi dùng lại `rowsToWrite()` chứ không viết lại luật lọc ở đây — đây đúng là luật mà sai
   * một lần là dữ liệu rác vào Base thật của khách.
   */
  async runSkillSetForAutomation(
    skillId: string,
    seedFacts: Record<string, string | number | boolean | null>,
    opts: {
      writeBack?: 'target' | 'record' | 'none';
      writeMap?: Record<string, string>;
      /** Dòng đã kích hoạt, để `writeBack: 'record'` cập nhật lại đúng nó. */
      record?: { appToken: string; tableId: string; recordId: string };
    } = {},
  ): Promise<{ summary: string; writes: number }> {
    const run = await this.runSkillSetById(skillId, { seedFacts, mode: 'build', skipSeeded: true });
    const failing = run.checks.filter((c) => c.verdict === 'fail');
    const head = `${run.ran.length} kỹ năng: ${run.ran.join(' → ') || '(không kỹ năng nào chạy)'}`;

    // Ràng buộc còn gãy ⇒ KHÔNG ghi gì cả, và nói rõ gãy cái nào. Ghi một phần ở đây là để lại
    // trong Base một dòng trông như đã xong nhưng số liệu chỏi nhau — thứ rất khó lần ra sau này.
    if (failing.length) {
      return {
        summary: `${head}\nKHÔNG ghi: còn ${failing.length} ràng buộc sai — ${failing
          .map((f) => f.check.raw)
          .join('; ')}`,
        writes: 0,
      };
    }

    const mode = opts.writeBack ?? 'target';
    if (mode === 'none') return { summary: `${head}\nChỉ báo cáo, không ghi.`, writes: 0 };

    if (mode === 'record') {
      const rec = opts.record;
      if (!rec) return { summary: `${head}\nKhông ghi: lịch theo GIỜ không có dòng nào để cập nhật.`, writes: 0 };
      const fields: Record<string, string | number | boolean> = {};
      for (const [key, column] of Object.entries(opts.writeMap ?? {})) {
        const v = run.facts[key];
        // `null`/rỗng coi như không có — ghi đè lên ô đang có dữ liệu là XOÁ mất dữ liệu cũ.
        if (v === undefined || v === null || v === '') continue;
        fields[column] = v;
      }
      if (!Object.keys(fields).length) return { summary: `${head}\nKhông ghi: chưa khoá nào ra giá trị.`, writes: 0 };
      const tool = resolveTool('bitable_update_record');
      const client = this.ensureClient();
      if (!tool || !client) throw new Error('Chưa kết nối Lark để ghi kết quả.');
      await tool.exec({ app_token: rec.appToken, table_id: rec.tableId, record_id: rec.recordId, fields }, client);
      return { summary: `${head}\nĐã cập nhật ${Object.keys(fields).length} ô của dòng vừa kích hoạt.`, writes: 1 };
    }

    const { contracts } = await this.loadSkillContracts();
    const target = relatedSet(contracts.filter(hasContract), skillId)
      .map((c) => c.target)
      .find(Boolean);
    if (!target) return { summary: `${head}\nKhông ghi: bộ này chưa khai \`target:\` trong SKILL.md.`, writes: 0 };
    const records = rowsToWrite([{ file: '', facts: run.facts, failing: [] }], target);
    if (!records.length) return { summary: `${head}\nKhông ghi: không khoá nào khớp cột đã khai.`, writes: 0 };
    const written = await this.writeRowsToTarget(target, records);
    return { summary: `${head}\nĐã ghi ${written} dòng vào bảng "${target.table}".`, writes: written };
  }

  // ── Trích xuất từ tệp rồi GHI vào bảng ───────────────────────────────────────────────

  /**
   * Dựng một thư mục làm việc cho MỘT tệp, kèm bản chữ đã trích nếu là tệp Office.
   *
   * Tệp Office là nhị phân — `Read` mở ra chỉ thấy rác, và mô hình (đã thấy trong thực tế) quay
   * sang đoán `lark_read_attachment`, vốn dành cho tệp trong Bitable/Drive → 404 rồi kết luận
   * "không đọc được file Excel". Ảnh và PDF thì `Read` xử được thẳng.
   */
  private async stageOneFile(path: string): Promise<{ dir: string; names: string[] }> {
    const dir = join(tmpdir(), `tw-extract-${randomUUID()}`);
    await mkdir(dir, { recursive: true });
    const safe = (path.split(/[\\/]/).pop() || 'file').replace(/[^\w.\- ]+/g, '_').slice(0, 80) || 'file';
    const buf = await readFile(path);
    await writeFile(join(dir, safe), buf);
    const names = [safe];
    const kind = officeKindFor(safe, '');
    if (kind) {
      const text = extractOfficeText(buf, kind);
      if (text.trim()) {
        const txt = `${safe}.txt`;
        await writeFile(join(dir, txt), text.slice(0, 400_000), 'utf8');
        names.push(txt);
      }
    }
    return { dir, names };
  }

  /**
   * Đọc từng tệp → trích theo ĐÚNG format đã khai (`produces` + `target.map`) → ghi vào bảng.
   *
   * Luật quan trọng nhất, và là lý do cả hệ hợp đồng tồn tại: **dòng nào không qua được ràng buộc
   * thì KHÔNG ghi**. Trích xuất chạy ở chế độ chỉ-đọc; việc ghi diễn ra sau, một lần, và chỉ với
   * những dòng sạch. Nếu để agent vừa trích vừa ghi thì dòng sai đã nằm trong Base trước khi ai
   * kịp kiểm — đúng thứ người dùng đang phải đi dọn bằng tay.
   *
   * Mỗi tệp là MỘT lượt độc lập: một hoá đơn hỏng không được kéo theo các hoá đơn khác, và kết
   * quả tệp trước không được dẫn dắt cách đọc tệp sau.
   */
  async extractFilesToTable(
    skillId: string,
    filePaths: string[],
    opts?: { dryRun?: boolean; onEvent?: (e: SkillRunEvent) => void },
  ): Promise<ExtractRunResult> {
    const { contracts, bodies } = await this.loadSkillContracts();
    const withContract = contracts.filter(hasContract);
    const set = relatedSet(withContract, skillId);
    if (!set.length) throw new Error('Kỹ năng này chưa khai báo hợp đồng.');
    const target = set.map((c) => c.target).find(Boolean);
    if (!target) throw new Error('Bộ kỹ năng này chưa khai `target:` (bảng đích) trong SKILL.md.');

    const rows: ExtractRow[] = [];
    const startedMs = Date.now();
    for (const path of filePaths.slice(0, 50)) {
      const fileName = path.split(/[\\/]/).pop() || path;
      opts?.onEvent?.({ type: 'note', text: `— tệp: ${fileName}` });
      let staged: { dir: string; names: string[] } | null = null;
      try {
        staged = await this.stageOneFile(path);
        const run = await runSkillSet(
          set,
          bodies,
          {
            // CHỈ ĐỌC ở bước trích. Ghi là việc của bước sau, sau khi ràng buộc đã chạy.
            runTurn: (prompt) =>
              this.runScheduledAgentTurn(prompt, 'ask', undefined, 24_000, staged!, 600_000),
            emit: (e) => opts?.onEvent?.(e),
          },
          { seedFacts: { ten_tep: fileName } },
        );
        rows.push({
          file: fileName,
          facts: run.facts,
          failing: run.checks.filter((c) => c.verdict === 'fail').map((c) => `${c.check.raw} — ${c.reason}`),
          blocked: run.blocked.map((b) => b.name),
        });
      } catch (e) {
        // Một tệp hỏng không được làm hỏng cả mẻ — cùng luật với vòng lặp kỹ năng.
        rows.push({ file: fileName, facts: {}, failing: [`không đọc được: ${(e as Error)?.message}`], blocked: [] });
      } finally {
        if (staged) await rm(staged.dir, { recursive: true, force: true }).catch(() => undefined);
      }
    }

    // Luật lọc nằm ở `rowsToWrite` (hàm thuần, có bài kiểm) — không viết lại ở đây, vì đây đúng
    // là luật mà sai một lần là dữ liệu rác vào Base thật của khách.
    const records = rowsToWrite(rows, target);

    const written = opts?.dryRun ? 0 : await this.writeRowsToTarget(target, records);

    // Lượt trích xuất cũng vào lịch sử: đây là đường DUY NHẤT ghi thẳng vào Base của khách, nên
    // "lần nào ghi, ghi mấy dòng, tệp nào bị chặn" là thứ cần rà lại được sau này.
    await this.recordSetRun(skillId, {
      at: new Date(startedMs).toISOString(),
      ms: Date.now() - startedMs,
      mode: opts?.dryRun ? 'ask' : 'build',
      ran: rows.map((r) => r.file),
      failing: [...new Set(rows.flatMap((r) => r.failing))],
      blocked: [...new Set(rows.flatMap((r) => r.blocked))],
      steps: rows.map((r) => ({
        name: r.file,
        attempt: 1,
        produced: Object.keys(r.facts),
        broke: r.failing,
      })),
      wrote: written,
    });

    return { rows, wouldWrite: records.length, written, table: target.table, base: target.base ?? '' };
  }

  /**
   * Ghi các dòng đã lọc vào bảng đích khai trong `target:`.
   *
   * Tách riêng vì hai lối vào cùng cần nó — trích từ tệp, và bộ kỹ năng chạy theo tự động hoá. Để
   * mỗi lối tự dựng lời gọi batch_create là mời hai luật ghi khác nhau len vào cùng một tính năng.
   */
  private async writeRowsToTarget(
    target: SkillTarget,
    records: { fields: Record<string, string | number | boolean> }[],
  ): Promise<number> {
    if (!records.length) return 0;
    const base = this.store
      .getBases()
      .find((b) => !target.base || (b.name || '').trim().toLowerCase() === target.base.trim().toLowerCase());
    if (!base) throw new Error(`Không tìm thấy Base "${target.base ?? '(mặc định)'}" trong danh sách đã đăng ký.`);
    const client = this.ensureClient();
    if (!client) throw new Error('Chưa kết nối Lark.');
    const tableId = await this.resolveTableId(base.appToken, target.table);
    await client.request(
      'POST',
      `/open-apis/bitable/v1/apps/${encodeURIComponent(base.appToken)}/tables/${encodeURIComponent(tableId)}/records/batch_create`,
      { data: { records } },
    );
    return records.length;
  }

  /**
   * Tên các CỘT của một bảng — cho form tạo kỹ năng gợi ý khoá từ thứ người dùng NHÌN THẤY.
   *
   * Vì sao cần: trước đây form bắt họ tự nghĩ ra tên khoá từ hư không. Nhưng thứ họ thật sự đang
   * làm việc cùng là các cột trong Base — "Số điện thoại", "Mã đơn". Cho chọn từ đó thì khoá bám
   * vào cái có thật, và hai kỹ năng cùng nói về một cột sẽ ra cùng một khoá.
   */
  async listFieldNames(appToken: string, tableId: string): Promise<string[]> {
    const client = this.ensureClient();
    if (!client) throw new Error('Chưa kết nối Lark.');
    const res = (await client.request(
      'GET',
      `/open-apis/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/fields`,
      { params: { page_size: 200 } },
    )) as { items?: { field_name?: string }[] };
    return (res.items ?? []).map((f) => String(f.field_name ?? '')).filter(Boolean);
  }

  /** table_id từ TÊN bảng (hoặc chính table_id nếu người dùng đã khai id). */
  private async resolveTableId(appToken: string, table: string): Promise<string> {
    if (/^tbl\w+$/.test(table)) return table;
    const client = this.ensureClient();
    if (!client) throw new Error('Chưa kết nối Lark.');
    const res = (await client.request(
      'GET',
      `/open-apis/bitable/v1/apps/${encodeURIComponent(appToken)}/tables`,
      { params: { page_size: 100 } },
    )) as { items?: { table_id: string; name: string }[] };
    const hit = (res.items || []).find((t) => (t.name || '').trim().toLowerCase() === table.trim().toLowerCase());
    if (!hit) throw new Error(`Không tìm thấy bảng "${table}" trong Base.`);
    return hit.table_id;
  }

  /** Save one scheduled-agent run as a Lark conversation (shows in the conversation list). */
  /**
   * Chỉ những Base mà việc này THẬT SỰ dùng tới.
   *
   * Trước đây lượt chạy theo lịch được cấp TOÀN BỘ kho Base đã đăng ký. Đo trên máy người dùng:
   * một lịch chỉ cần đúng một Base ("Base Test") lại được cấp cả 40. Hai hậu quả, cái sau nặng hơn:
   *  • mỗi lượt chạy nhét 40 dòng Base vào prompt hệ thống — trả tiền token cho 39 thứ không dùng;
   *  • và quan trọng hơn: agent chạy tự động, không ai trông, lại nhìn thấy 39 Base không liên
   *    quan. Ở chế độ THỰC THI đó là 39 chỗ nó có thể ghi nhầm vào.
   *
   * Cách nhận: app_token của Base nằm ngay trong câu lệnh của lịch (người dùng hoặc agent luôn
   * phải nêu ra để làm việc). Không nhận ra cái nào thì trả RỖNG — thà agent hỏi "Base nào?" còn
   * hơn mở cho nó cả kho.
   */
  private basesForPrompt(prompt: string): LarkBaseRef[] {
    const all = this.store.getBases();
    const hit = all.filter((b) => b.appToken && prompt.includes(b.appToken));
    return hit;
  }

  /**
   * Kết quả một lần chạy theo lịch → NỐI vào hội thoại của chính lịch đó.
   *
   * Trước đây mỗi lần chạy tạo một hội thoại MỚI (id ngẫu nhiên). Một lịch chạy hằng ngày đẻ ra
   * 30 hội thoại một tháng, tất cả cùng tên, tất cả cùng một câu hỏi — danh sách "Hội thoại cũ"
   * ngập rác và hội thoại thật của người dùng bị đẩy xuống dưới. Nay mỗi lịch có ĐÚNG MỘT hội
   * thoại, và mỗi lần chạy là một lượt mới trong đó — đọc đúng như một cuộc trò chuyện thật, và
   * xoá một lần là sạch cả lịch sử của lịch ấy.
   *
   * Id suy ra từ id của lịch (ổn định), nên `persistSession` ghi đè đúng tệp cũ.
   */
  private async saveScheduledResult(
    ruleId: string,
    ruleName: string,
    prompt: string,
    result: string,
  ): Promise<void> {
    const now = new Date().toISOString();
    const nowMs = Date.now();
    // Không có ruleId (đường gọi cũ) thì lùi về hành vi cũ, còn hơn mất báo cáo.
    const id = ruleId ? `sched-${ruleId}` : randomUUID();
    const prev = ruleId ? await this.readSession(id) : null;
    const agentId = prev?.agentSessionId ?? randomUUID();
    // `ts` là bắt buộc, không phải trang trí: đồng bộ sao lưu hợp nhất theo id rồi NỐI phần thừa
    // vào cuối mảng, nên không có mốc thời gian thì các lượt cũ từ máy chủ sẽ nằm DƯỚI lượt mới.
    const turn = [
      { kind: 'msg' as const, id: randomUUID(), role: 'user' as const, text: prompt, ts: nowMs },
      { kind: 'msg' as const, id: randomUUID(), role: 'assistant' as const, text: result, ts: nowMs + 1 },
    ];
    // Giữ SCHED_ITEM_CAP lượt gần nhất. Một lịch chạy mỗi giờ suốt một năm mà không cắt thì tệp
    // phiên phình tới mức mở hội thoại là treo giao diện. Trần này CÒN được áp lại sau khi đồng
    // bộ hợp nhất (xem mergeSession) — nếu không thì máy chủ trả lại đúng những lượt vừa cắt.
    const items = [...(prev?.items ?? []), ...turn].slice(-SCHED_ITEM_CAP);
    // GỠ BIA MỘ của chính id này.
    //
    // `larkDeleteSession` ghi một bia mộ (TTL 180 ngày) để máy khác xoá theo. Với id ngẫu nhiên
    // thì vô hại, nhưng id nay ỔN ĐỊNH theo lịch: người dùng xoá lịch sử một lần là mọi báo cáo
    // về sau bị đồng bộ lặng lẽ xoá đi suốt 180 ngày — lịch vẫn chạy, vẫn bắn thông báo, mà
    // "Hội thoại cũ" thì trống không và không có gì giải thích.
    // Xoá lịch sử cũ KHÔNG có nghĩa là cấm lịch ghi báo cáo mới.
    if (ruleId) {
      try {
        const dpath = this.deletedPathFor(this.currentUserId);
        const map = await this.readDeletedAt(dpath);
        if (map[id] !== undefined) {
          delete map[id];
          await this.writeDeletedAt(dpath, map);
        }
      } catch {
        /* best-effort: thà ghi báo cáo còn hơn chặn cả lượt chạy vì một tệp phụ */
      }
    }
    await this.persistSession({
      // Giữ lại MỌI thứ hàm này không biết tới (ghi chú người dùng gõ vào hội thoại, tóm tắt AI
      // đã tốn tiền sinh ra, và bất cứ trường nào bản sau thêm). Dựng lại từ một danh sách khoá
      // cố định là xoá sạch chúng ở lần chạy kế — `larkSaveSession` đã vấp đúng cái bẫy này.
      ...(prev ?? {}),
      id,
      claudeSessionId: agentId,
      agentSessionId: agentId,
      runner: 'claude',
      title: `📋 ${ruleName}`.slice(0, 60),
      createdAt: prev?.createdAt ?? now,
      updatedAt: now,
      items,
      // Base của hội thoại lịch = Base việc đó thật sự dùng, KHÔNG phải cả kho (xem basesForPrompt).
      // `prev?.bases` được tôn trọng vì người dùng có thể đã tự thêm/bớt ở hàng "Base áp dụng".
      bases: prev?.bases ?? this.basesForPrompt(prompt),
    });
  }

  /**
   * Máy này có đang là CHỦ chạy lịch không?
   *
   * Hỏi máy chủ, vì lịch còn có thể chạy ở một máy nền (VM). Nhịp tim cũng là lời xin quyền: máy
   * chủ trả về `isMine` để ta biết có được chạy lượt này không.
   *
   * Ba lối thoát, đều cố ý nghiêng về "cứ chạy":
   *  • Chưa đăng nhập ⇒ chạy. Không đăng nhập thì cũng không có VM nào chạy hộ được.
   *  • Gọi hỏng / mất mạng ⇒ chạy, và nhớ kết quả cũ trong 5 phút để không đập vào máy chủ mỗi
   *    10 giây khi mạng chập chờn.
   *  • Máy chủ nói "không phải bạn" ⇒ IM. Đây là lối duy nhất dừng, và là lý do cả cơ chế tồn tại.
   */
  private runnerCache: { at: number; mine: boolean } | null = null;
  private async amRunner(): Promise<boolean> {
    const token = this.accountTokenGetter?.();
    if (!token) return true;
    const now = Date.now();
    // Nhịp 60 giây: đủ dày để lease 90 giây không hết hạn oan, đủ thưa để không ồn.
    if (this.runnerCache && now - this.runnerCache.at < 60_000) return this.runnerCache.mine;
    try {
      const r = await fetch(`${APIA_BASE}/me/lark-runner/beat`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ ownerId: this.runnerId(), ownerKind: 'desktop', label: hostname() }),
      });
      if (!r.ok) {
        this.runnerCache = { at: now, mine: true };
        return true;
      }
      const j = (await r.json()) as { isMine?: boolean };
      const mine = j.isMine !== false;
      this.runnerCache = { at: now, mine };
      return mine;
    } catch {
      this.runnerCache = { at: now, mine: true };
      return true;
    }
  }

  /** Định danh ổn định của máy này, sinh một lần rồi nhớ trong cài đặt. */
  private runnerIdCache = '';
  private runnerId(): string {
    if (this.runnerIdCache) return this.runnerIdCache;
    const st = this.store.getSettings() as { runnerId?: string };
    if (st.runnerId) {
      this.runnerIdCache = st.runnerId;
      return st.runnerId;
    }
    const id = `pc-${randomUUID().slice(0, 8)}`;
    this.store.setSettings({ runnerId: id } as never);
    this.runnerIdCache = id;
    return id;
  }

  /** Desktop notification when a scheduled-agent run finishes. */
  private notifyScheduled(title: string, body: string): void {
    try {
      if (Notification.isSupported()) {
        new Notification({ title: `📋 ${title}`, body: body || 'Đã chạy xong theo lịch.' }).show();
      }
    } catch {
      /* best-effort */
    }
  }

  /** Notes/todos for one conversation. */
  async larkNotes(id: string): Promise<LarkNoteDoc | null> {
    return (await this.readSession(id))?.notes ?? null;
  }

  /**
   * Save notes WITHOUT touching the session's own updatedAt — only the doc's. Jotting a
   * note must not reorder the conversation list (sorted by updatedAt) nor make this
   * device spuriously "newest" in the account backup merge.
   */
  async larkSaveNotes(id: string, doc: LarkNoteDoc): Promise<void> {
    const existing = await this.readSession(id);
    if (!existing) return; // never conjure a session from a stray note save
    await this.persistSession({ ...existing, notes: doc });
  }

  // ── Đặc tả hệ thống (living Lark spec) ──────────────────────────────────────
  /** Prefer the token's account for scoping (the renderer sets currentUserId async/un-awaited,
   *  so during a switch the token is the reliable identity — same rule larkBackupSync uses). */
  private scopeFor(token?: string): string | null {
    return (token ? this.userIdFromToken(token) : null) ?? this.currentUserId;
  }
  /** The Bases a sync should re-fetch: the union applied across THIS account's conversations,
   *  falling back to every registered Base when no conversation has scoped things yet. */
  private async specScopeBases(): Promise<LarkBaseRef[]> {
    const byToken = new Map<string, LarkBaseRef>();
    for (const s of await this.allSessions()) {
      for (const b of s.bases ?? []) if (b?.appToken && !byToken.has(b.appToken)) byToken.set(b.appToken, b);
    }
    if (byToken.size === 0) for (const b of this.store.getBases()) byToken.set(b.appToken, b);
    return [...byToken.values()];
  }

  /** The current per-account spec doc (null if never built). */
  async larkSpec(token?: string): Promise<LarkSpecDoc | null> {
    return this.readSpecAt(this.specPathFor(this.scopeFor(token)));
  }

  /** Persist an edited spec (user-owned overview, dismissed insight). Local write only —
   *  the cross-device push rides the next larkBackupSync (renderer calls it after an edit). */
  async larkSaveSpec(doc: LarkSpecDoc, token?: string): Promise<void> {
    await this.writeSpecAt(this.specPathFor(this.scopeFor(token)), { ...doc, updatedAt: new Date().toISOString() });
  }

  /**
   * "Đồng bộ đặc tả": re-fetch every applied Base (structure + workflows) LIVE, merge into the
   * prior doc by real Lark id, persist, and return the merged doc + the added/changed/removed
   * diff. Holds the shared AI turn-lock so it can't overlap a chat/build turn (API coherence).
   */
  async larkBuildSpec(token?: string): Promise<SpecBuildResult> {
    const client = this.ensureClient();
    if (!client) throw new Error('Chưa kết nối Lark — hãy kết nối trước khi đồng bộ đặc tả.');
    const lease = tryAcquire({ kind: 'lark', label: 'Đồng bộ đặc tả', startedAt: Date.now() });
    if (!lease) {
      const o = currentOwner();
      throw new Error(`Đang chạy một lượt AI ở "${o?.label || 'nơi khác'}" — chờ xong rồi đồng bộ đặc tả.`);
    }
    try {
      const scope = this.scopeFor(token);
      const prior = await this.readSpecAt(this.specPathFor(scope));
      const bases = await this.specScopeBases();
      if (bases.length === 0)
        throw new Error('Chưa có Base nào để phân tích — thêm Base hoặc trò chuyện trong Lark × Agents trước.');
      const result = await buildSpec({ client, bases, prior });
      await this.writeSpecAt(this.specPathFor(scope), result.doc);
      return result;
    } finally {
      release(lease);
    }
  }

  /** Promote one conversation finding into the spec as an insight (no full re-fetch). Deduped
   *  by (kind + normalized text), so promoting the same thing twice is a no-op. */
  async larkPromoteToSpec(input: SpecPromoteInput, token?: string): Promise<LarkSpecDoc> {
    const path = this.specPathFor(this.scopeFor(token));
    const now = new Date().toISOString();
    const doc: LarkSpecDoc = (await this.readSpecAt(path)) ?? {
      v: 1,
      updatedAt: now,
      overview: { text: '', updatedAt: now },
      bases: [],
      workflows: [],
      relations: [],
      insights: [],
      syncLog: [],
    };
    const text = (input.text || '').trim().slice(0, 2000);
    if (text) {
      const hash = `${input.kind}:${text.toLowerCase().replace(/\s+/g, ' ').slice(0, 200)}`;
      if (!doc.insights.some((i) => i.hash === hash)) {
        const insight: SpecInsight = {
          id: randomUUID(),
          kind: input.kind,
          text,
          entityKey: input.entityKey,
          hash,
          source: { tool: 'conversation', fetchedAt: now, sessionId: input.sessionId, itemId: input.itemId },
          createdAt: now,
        };
        doc.insights = [insight, ...doc.insights];
      }
    }
    doc.updatedAt = now;
    await this.writeSpecAt(path, doc);
    return doc;
  }

  // ── CMS Bitable sync (desktop keeps the connector session fresh) ────────────
  cmsSyncConfig(): { baseUrl: string; webReady: boolean } {
    return { baseUrl: this.store.getSettings().cmsSyncBaseUrl || CMS_SYNC_DEFAULT_BASE, webReady: false };
  }
  cmsSyncSetBaseUrl(url: string): void {
    const next = (url || '').trim() || CMS_SYNC_DEFAULT_BASE;
    this.store.setSettings({ cmsSyncBaseUrl: next });
    setSharedCmsBaseUrl(next);
  }
  /** Is the Lark web session live enough to extract a fresh connector session? */
  async cmsSyncWebReady(): Promise<boolean> {
    return !!(await getLarkWebSession().getConnectorSession());
  }
  cmsSyncListJobs(): Promise<CmsSyncJob[]> {
    return this.cmsSync.listJobs();
  }
  cmsSyncCreateJob(input: {
    name: string;
    appToken: string;
    tableIds: string[];
    enabled?: boolean;
    intervalSeconds?: number;
  }): Promise<CmsSyncJob> {
    return this.cmsSync.createConnectorJob(input);
  }
  cmsSyncSetJobTables(jobId: string, tableIds: string[]): Promise<CmsSyncJob> {
    return this.cmsSync.setJobTables(jobId, tableIds);
  }
  cmsSyncUpdateJob(
    jobId: string,
    patch: {
      name?: string;
      description?: string;
      intervalSeconds?: number;
      enabled?: boolean;
      ignoreSchedule?: boolean;
      schedule?: { activeHoursStart?: number; activeHoursEnd?: number; activeDays?: number[]; timezone?: string };
    },
  ): Promise<CmsSyncJob> {
    return this.cmsSync.updateJob(jobId, patch);
  }
  cmsSyncGetErrorReport(): Promise<{ enabled: boolean; larkWebhookUrl: string; chatId: string }> {
    return this.cmsSync.getErrorReport();
  }
  cmsSyncSetErrorReport(cfg: { enabled: boolean; larkWebhookUrl: string; chatId: string }): Promise<{ enabled: boolean; larkWebhookUrl: string; chatId: string }> {
    return this.cmsSync.setErrorReport(cfg);
  }
  cmsSyncKeeperStatus(): Promise<Record<string, unknown>> {
    return this.cmsSync.getKeeperStatus();
  }
  cmsSyncListLarkChats(): Promise<{ chatId: string; name: string }[]> {
    return this.cmsSync.listLarkChats();
  }
  /** The signed-in user's Lark identity (via user_info) — so a created group includes them, not
   *  just the bot. The EMAIL is app-independent (the backend resolves it in ITS namespace), so it
   *  works across the desktop OAuth app vs the backend tenant app; open_id is a best-effort extra. */
  private async getMyLarkIdentity(): Promise<{ openId: string; email: string }> {
    const tok = await this.validUserToken().catch(() => null);
    if (!tok) return { openId: '', email: '' };
    try {
      const r = await fetch('https://open.larksuite.com/open-apis/authen/v1/user_info', {
        headers: { Authorization: `Bearer ${tok}` },
      });
      const j = (await r.json().catch(() => ({}))) as {
        data?: { open_id?: string; email?: string; enterprise_email?: string };
      };
      return { openId: j?.data?.open_id || '', email: j?.data?.enterprise_email || j?.data?.email || '' };
    } catch {
      return { openId: '', email: '' };
    }
  }
  async cmsSyncCreateLarkChat(
    name: string,
  ): Promise<{ chatId: string; name: string; addedMembers: number; joinLink?: string; memberError?: string }> {
    const me = await this.getMyLarkIdentity();
    return this.cmsSync.createLarkChat(name, me.openId ? [me.openId] : [], me.email ? [me.email] : []);
  }
  cmsSyncTestErrorReport(target: { larkWebhookUrl?: string; chatId?: string }): Promise<{
    ok: boolean;
    results: { target: string; ok: boolean; error?: string }[];
  }> {
    return this.cmsSync.testErrorReport(target);
  }

  /** Create a Lark group for chatting WITH THE BOT. Uses the connected app's TENANT token
   *  (userTokenDead) so the BOT (app) is the owner/member — only then can it reply there — and
   *  returns a join link so the user can enter with one tap. */
  async larkBotCreateChat(name: string): Promise<{ chatId: string; name: string; joinLink?: string }> {
    const client = this.ensureClient();
    if (!client) throw new Error('Chưa kết nối app Lark — vào "Lark × Agents" để kết nối trước.');
    const created = await client.request<{ chat_id?: string; name?: string }>('POST', '/open-apis/im/v1/chats', {
      data: { name: name.trim() },
      userTokenDead: true,
    });
    const chatId = created?.chat_id || '';
    let joinLink: string | undefined;
    if (chatId) {
      try {
        const lk = await client.request<{ share_link?: string }>('POST', `/open-apis/im/v1/chats/${chatId}/link`, {
          data: { validity_period: 'permanently', link_type: 'share_link' },
          userTokenDead: true,
        });
        joinLink = lk?.share_link || undefined;
      } catch {
        /* link is best-effort */
      }
    }
    return { chatId, name: created?.name || name.trim(), joinLink };
  }
  cmsSyncRefreshAll(): Promise<{ total: number; refreshed: number; reenabled: number; failed: number; errors: string[] }> {
    return this.cmsSync.refreshAll();
  }
  async cmsSyncLoginHistory(): Promise<LarkReloginEntry[]> {
    return getLarkWebSession().getReloginHistory();
  }
  cmsSyncRefreshJob(jobId: string): Promise<CmsSyncJob> {
    return this.cmsSync.refreshJobById(jobId);
  }
  cmsSyncExecute(jobId: string): Promise<{ ok: boolean; synced?: number; total?: number; failed?: string[]; details?: string[]; viaLocal?: boolean; error?: string }> {
    return this.cmsSync.execute(jobId);
  }
  cmsSyncToggle(jobId: string): Promise<CmsSyncJob> {
    return this.cmsSync.toggle(jobId);
  }
  cmsSyncDeleteJob(jobId: string): Promise<void> {
    return this.cmsSync.deleteJob(jobId);
  }

  /** Cached AI summaries for collapsed answers, keyed by chat-item id. */
  async larkSummaries(id: string): Promise<Record<string, string>> {
    return (await this.readSession(id))?.summaries ?? {};
  }

  /**
   * Summarize ONE answer with the active runner (local CLI or direct API — whichever the
   * existing switch selects) and cache it on the conversation, so reopening never pays
   * for it twice. Runs in its OWN throwaway agent session so it cannot pollute the real
   * conversation's context or its `--resume` chain. Returns '' on any failure; the UI
   * falls back to the instant structural digest, so a summary is never load-bearing.
   */
  async larkSummarize(id: string, itemId: string, text: string): Promise<string> {
    const existing = await this.readSession(id);
    const cached = existing?.summaries?.[itemId];
    if (cached) return cached;
    const client = this.ensureClient();
    if (!client) return '';
    const body = text.length > 12000 ? `${text.slice(0, 12000)}\n…(đã cắt bớt)` : text;
    let out = '';
    try {
      for await (const ev of runLarkAgent(
        `Tóm tắt câu trả lời sau trong TỐI ĐA 2 câu tiếng Việt, nêu đúng kết quả/kết luận chính. Không mở đầu ("Đây là...", "Tóm tắt:"), không markdown, không hỏi lại, không gọi công cụ.\n\n---\n${body}`,
        'ask',
        {
          client,
          systemPrompt:
            'Bạn là bộ tóm tắt. Chỉ trả về đúng phần tóm tắt ngắn gọn bằng tiếng Việt. Tuyệt đối không gọi công cụ nào.',
          runner: this.activeRunner,
          model: this.activeModel,
          session: { id: randomUUID(), resume: false },
          awaitConfirm: async () => false,
          // Ở ĐÂY rỗng là ĐÚNG, khác mọi chỗ khác: prompt cấm gọi công cụ và việc duy nhất là
          // tóm tắt, nên không có vòng lặp nào để treo. Đưa NO_ONE_TO_ASK vào chỉ tổ khiến bộ
          // tóm tắt viết thêm một đoạn về "giả định đã chọn" vào giữa bản tóm tắt.
          awaitAsk: async () => '',
        },
      )) {
        if (ev.type === 'text') out += ev.delta;
      }
    } catch {
      return '';
    }
    const summary = out.replace(/\s+/g, ' ').trim().slice(0, 400);
    if (!summary) return '';
    const cur = await this.readSession(id);
    if (cur) await this.persistSession({ ...cur, summaries: { ...(cur.summaries ?? {}), [itemId]: summary } });
    return summary;
  }

  /**
   * Đặt tên cho một hội thoại.
   *
   * Tên vốn được SUY RA từ tin nhắn đầu (`deriveTitle`) và `persistSession` giữ nguyên tên cũ nếu
   * đã có — nên chỉ cần ghi được `title` một lần là nó dính luôn. Trước đây không có đường nào
   * ghi, nên người dùng chịu chết với cái tên máy tự đặt.
   *
   * Tên rỗng = TRẢ VỀ tên tự suy: xoá tên thủ công phải quay lại hành vi mặc định, chứ không để
   * lại một hội thoại không tên.
   */
  // ── Kho tệp của Lark Agents (chỉ trên máy này) ────────────────────────────
  /**
   * Tệp đính kèm đang nằm trong thư mục làm việc của từng hội thoại.
   *
   * CHỈ liệt kê hội thoại của TÀI KHOẢN ĐANG ĐĂNG NHẬP. Thư mục làm việc đặt tên theo id hội
   * thoại chứ không theo tài khoản (`lark/work/<id>`), nên quét thẳng thư mục đó sẽ phơi cả tệp
   * của tài khoản khác dùng chung máy. Đi từ danh sách phiên của tài khoản hiện tại là cách duy
   * nhất giữ đúng ranh giới đó.
   */
  async larkListFiles(): Promise<
    { convId: string; title: string; files: { name: string; size: number; mtime: number }[] }[]
  > {
    const sessions = await this.allSessions();
    const out: { convId: string; title: string; files: { name: string; size: number; mtime: number }[] }[] = [];
    for (const s of sessions) {
      const dir = this.workDirPath(s.id);
      let names: string[];
      try {
        names = await readdir(dir);
      } catch {
        continue; // hội thoại chưa từng đính kèm gì
      }
      const files: { name: string; size: number; mtime: number }[] = [];
      for (const name of names) {
        if (name.startsWith('.')) continue; // tệp ẩn của công cụ, không phải thứ người dùng gửi
        try {
          const st = await stat(join(dir, name));
          if (!st.isFile()) continue;
          files.push({ name, size: st.size, mtime: st.mtimeMs });
        } catch {
          /* bỏ qua tệp đọc không được */
        }
      }
      if (files.length) {
        files.sort((a, b) => b.mtime - a.mtime);
        out.push({ convId: s.id, title: (s.title || '').trim() || 'Cuộc trò chuyện', files });
      }
    }
    return out.sort((a, b) => (b.files[0]?.mtime ?? 0) - (a.files[0]?.mtime ?? 0));
  }

  /** Tên tệp an toàn: chặn mọi mưu đồ đi ra khỏi thư mục làm việc của hội thoại. */
  private safeFileIn(convId: string, name: string): string | null {
    const base = name.replace(/^.*[\\/]/, '');
    if (!base || base === '.' || base === '..' || base.startsWith('.')) return null;
    return join(this.workDirPath(convId), base);
  }

  /** Đọc một tệp để xem trước. Trả null khi không có hoặc quá lớn. */
  async larkReadFile(convId: string, name: string): Promise<{ dataBase64: string; size: number } | null> {
    const path = this.safeFileIn(convId, name);
    if (!path) return null;
    try {
      const st = await stat(path);
      // Trần 25 MB: xem trước là để liếc qua, không phải để nhồi cả tệp lớn qua cầu IPC.
      if (!st.isFile() || st.size > 25 * 1024 * 1024) return null;
      const buf = await readFile(path);
      return { dataBase64: buf.toString('base64'), size: st.size };
    } catch {
      return null;
    }
  }

  /** Xoá hẳn một tệp đính kèm khỏi máy. */
  async larkDeleteFile(convId: string, name: string): Promise<{ ok: boolean }> {
    const path = this.safeFileIn(convId, name);
    if (!path) return { ok: false };
    try {
      await rm(path, { force: true });
      return { ok: true };
    } catch {
      return { ok: false };
    }
  }

  async larkRenameSession(id: string, title: string): Promise<void> {
    const s = await this.readSession(id);
    if (!s) return;
    const next = (title ?? '').trim().slice(0, 80);
    await this.persistSession({
      ...s,
      title: next || this.deriveTitle(Array.isArray(s.items) ? s.items : []),
      updatedAt: new Date().toISOString(),
    });
  }

  async larkDeleteSession(id: string): Promise<void> {
    await rm(join(this.sessionsDir(), `${id}.json`), { force: true });
    // Ghi bia mộ TRƯỚC khi bất kỳ lượt đồng bộ nào chạy: thiếu nó thì bản trên máy chủ sẽ được
    // kéo về và hội thoại sống lại.
    const dpath = this.deletedPathFor(this.currentUserId);
    const map = await this.readDeletedAt(dpath);
    map[id] = Date.now();
    await this.writeDeletedAt(dpath, map).catch(() => undefined);
    // The conversation's working dir holds only its own attachments → goes with it.
    if (id.replace(/[^A-Za-z0-9_-]/g, '')) {
      await rm(this.workDirPath(id), { recursive: true, force: true }).catch(() => {});
    }
    if (this.activeSessionId === id) {
      this.activeSessionId = null;
      this.resetChat();
    }
  }

  /** Read every full session blob (for backup). */
  private async allSessionsIn(dir: string): Promise<StoredSession[]> {
    let files: string[];
    try {
      files = await readdir(dir);
    } catch {
      return [];
    }
    const out: StoredSession[] = [];
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      const s = await this.readSessionIn(dir, f.replace(/\.json$/, ''));
      if (s) out.push(s);
    }
    return out;
  }
  private allSessions(): Promise<StoredSession[]> {
    return this.allSessionsIn(this.sessionsDir());
  }

  /**
   * Back up + sync the local Lark data (chat sessions + bases + settings) to the
   * user's Larkwave account, so it survives a lost machine + syncs across devices.
   * Pull → merge (sessions: union by id, newest updatedAt wins; bases: union;
   * settings: this device wins) → write merged back to local → push the merged blob.
   * The Lark app_secret is NEVER sent — it stays local (OS keychain). Offline-safe:
   * a failed pull/push is a no-op (local stays the source of truth; next sync retries).
   * `token` = the Larkwave-account JWT (passed from the renderer).
   */
  async larkBackupSync(token: string): Promise<{ at: string } | null> {
    if (!token) return null;
    const url = `${APIA_BASE}/me/lark-backup`;
    const auth = { Authorization: `Bearer ${token}` };
    // Scope to the TOKEN's account, not currentUserId. The renderer sets currentUserId via
    // an async, un-awaited larkSetAccount; during an account switch the token can already
    // be B while currentUserId is still A. Deriving the folder from the token guarantees we
    // read/write B's local sessions for B's server blob — never cross-pushing A's chats.
    const backupDir = this.sessionsDirFor(this.userIdFromToken(token) ?? this.currentUserId);

    // The per-account spec file (a sibling of backupDir), scoped by the SAME token identity.
    const specPath = this.specPathFor(this.userIdFromToken(token) ?? this.currentUserId);

    // 1. Pull (best-effort).
    let remote: {
      sessions?: StoredSession[];
      bases?: LarkBaseRef[];
      settings?: Record<string, unknown>;
      /** Quy tắc tự động hoá — đồng bộ để MÁY KHÁC (kể cả VM chạy nền) dùng được cùng bộ lịch. */
      automations?: StoredAutomation[];
      spec?: LarkSpecDoc;
      /** id hội thoại đã xoá → mốc thời gian xoá. Máy khác đọc để xoá theo. */
      deleted?: Record<string, number>;
    } = {};
    try {
      const r = await fetch(url, { headers: auth });
      if (r.ok) {
        const j = (await r.json()) as { data?: typeof remote } | null;
        if (j?.data && typeof j.data === 'object') remote = j.data;
      }
    } catch {
      /* offline → skip pull; we still push below if reachable */
    }

    // 2a. Bia mộ: hợp nhất danh sách đã xoá của máy này với của máy chủ.
    //
    // XOÁ LÀ MẤT HẲN, kể cả khi một máy khác vừa sửa hội thoại đó sau. Đây là lựa chọn có chủ ý:
    // người dùng bấm xoá thì mong nó biến mất, chứ không mong nó sống lại vì một máy khác lỡ mở
    // ra xem. (Đổi lại: mất một sửa đổi rất muộn ở máy kia — chấp nhận được, vì cái họ vừa yêu
    // cầu là XOÁ.)
    const deletedPath = this.deletedPathFor(this.userIdFromToken(token) ?? this.currentUserId);
    const deleted = await this.readDeletedAt(deletedPath);
    for (const [id, at] of Object.entries(remote.deleted ?? {})) {
      if (typeof at === 'number' && (!deleted[id] || at < deleted[id]!)) deleted[id] = at;
    }
    // Dọn bia mộ quá cũ để danh sách không phình mãi. Sau ngần này thì mọi máy đã đồng bộ xong.
    const TOMBSTONE_TTL = 180 * 24 * 3600 * 1000;
    const now = Date.now();
    for (const [id, at] of Object.entries(deleted)) if (now - at > TOMBSTONE_TTL) delete deleted[id];

    // 2b. Merge sessions (union by id, newest wins) + persist server-newer ones locally.
    const byId = new Map<string, StoredSession>();
    for (const s of await this.allSessionsIn(backupDir)) byId.set(s.id, s);
    // Máy khác xoá → máy này phải xoá theo, cả trong bộ nhớ lẫn trên đĩa.
    for (const id of Object.keys(deleted)) {
      if (byId.delete(id)) {
        await rm(join(backupDir, `${id}.json`), { force: true }).catch(() => undefined);
      }
    }
    for (const s of remote.sessions ?? []) {
      if (!s?.id) continue;
      if (deleted[s.id]) continue; // đã xoá — KHÔNG kéo về nữa
      const ex = byId.get(s.id);
      if (!ex) {
        byId.set(s.id, s);
        await this.persistSession(s, backupDir).catch(() => undefined);
        continue;
      }
      const merged = mergeSession(ex, s);
      if (merged !== ex) {
        byId.set(s.id, merged);
        await this.persistSession(merged, backupDir).catch(() => undefined);
      }
    }
    const mergedSessions = [...byId.values()];
    await this.writeDeletedAt(deletedPath, deleted).catch(() => undefined);

    // 3. Merge bases (union by app_token) + settings (this device wins).
    const baseMap = new Map(this.store.getBases().map((b) => [b.appToken, b]));
    for (const b of remote.bases ?? []) if (b?.appToken && !baseMap.has(b.appToken)) baseMap.set(b.appToken, b);
    const mergedBases = [...baseMap.values()];
    this.store.setBases(mergedBases);
    const mergedSettings = { ...(remote.settings ?? {}), ...this.store.getSettings() };
    // Lịch: hợp nhất theo id, bản của MÁY NÀY thắng. Không xoá lịch chỉ vì máy kia không có nó —
    // một máy vừa cài xong sẽ có danh sách rỗng, và "rỗng thắng" là xoá sạch lịch của máy khác.
    const localAuto = this.store.getAutomations();
    const autoById = new Map((remote.automations ?? []).filter((a) => a?.id).map((a) => [a.id, a]));
    for (const a of localAuto) autoById.set(a.id, a);
    const mergedAutomations = [...autoById.values()];
    if (mergedAutomations.length !== localAuto.length) this.store.setAutomations(mergedAutomations);
    this.store.setSettings(mergedSettings as { autoApprove?: boolean; activeBase?: string });

    // 3b. Merge the spec (union bases/workflows by id, insights by hash) + persist locally.
    const mergedSpec = mergeSpec(await this.readSpecAt(specPath), remote.spec ?? null);
    if (mergedSpec) await this.writeSpecAt(specPath, mergedSpec).catch(() => undefined);

    // 4. Push the merged blob (best-effort).
    try {
      const r = await fetch(url, {
        method: 'PUT',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: {
            sessions: mergedSessions,
            bases: mergedBases,
            settings: mergedSettings,
            // Lịch tự động hoá đi theo bản sao lưu vì hai lý do: đổi máy thì lịch còn nguyên, và
            // một máy chạy nền (VM) đọc được cùng bộ lịch mà không phải cấu hình lại ở hai nơi.
            // Máy NÀY thắng khi trùng id — giống hệt cách `settings` đang hợp nhất.
            automations: mergedAutomations,
            // Đẩy bia mộ lên để MÁY KHÁC cũng xoá theo — không có nó thì máy kia lại đẩy
            // hội thoại đã xoá ngược lên máy chủ, và vòng lặp sống-lại tiếp tục.
            ...(Object.keys(deleted).length ? { deleted } : {}),
            ...(mergedSpec ? { spec: mergedSpec } : {}),
          },
        }),
      });
      if (r.ok) {
        const j = (await r.json()) as { updatedAt?: string };
        return { at: j.updatedAt ?? new Date().toISOString() };
      }
    } catch {
      /* offline → local is merged + safe; next sync pushes */
    }
    return null;
  }

  // ── Public sharing (publish a conversation to a website link) ────────────────
  /**
   * Publish (or update) a conversation to a PUBLIC link. Uploads a SANITIZED payload —
   * only the display transcript + title/runner; the app_secret and Base app_tokens NEVER
   * leave the machine. Re-sharing the same session updates the same link (server upserts
   * by userId+sourceId). `token` = the Larkwave-account JWT.
   */
  async shareSession(sessionId: string, token: string): Promise<LarkShareInfo> {
    if (!token) throw new Error('Cần đăng nhập tài khoản Larkwave để chia sẻ.');
    const s = await this.readSession(sessionId);
    if (!s) throw new Error('Không tìm thấy hội thoại để chia sẻ.');
    const items = Array.isArray(s.items) ? s.items : [];
    if (!items.length) throw new Error('Hội thoại chưa có nội dung để chia sẻ.');
    const payload = {
      sourceId: sessionId,
      title: s.title || this.deriveTitle(items),
      // Only the renderer transcript + light meta — NO session ids, NO Base app_tokens.
      data: { items, runner: s.runner || 'claude', model: s.model, createdAt: s.createdAt },
    };
    const res = await fetch(`${APIA_BASE}/me/lark-shares`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    if (!res.ok) {
      let msg = `Chia sẻ thất bại (${res.status})`;
      try {
        msg = (JSON.parse(text) as { message?: string }).message || msg;
      } catch {
        /* non-JSON */
      }
      throw new Error(msg);
    }
    return JSON.parse(text) as LarkShareInfo;
  }

  /** Current public URL for a shared conversation (by local session id) + how many items are
   *  currently published (for the "cần đồng bộ" badge), or null. */
  async shareStatus(sessionId: string, token: string): Promise<{ url: string | null; itemCount?: number }> {
    if (!token) return { url: null };
    try {
      const res = await fetch(`${APIA_BASE}/me/lark-shares`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return { url: null };
      const list = (await res.json()) as { sourceId: string; url: string; itemCount?: number }[];
      const hit = Array.isArray(list) ? list.find((r) => r.sourceId === sessionId) : undefined;
      return { url: hit?.url ?? null, itemCount: hit?.itemCount };
    } catch {
      return { url: null };
    }
  }

  /** Un-publish a shared conversation (resolve its share id by local session id, then delete). */
  async unshareSession(sessionId: string, token: string): Promise<void> {
    if (!token) throw new Error('Cần đăng nhập tài khoản Larkwave.');
    const res = await fetch(`${APIA_BASE}/me/lark-shares`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error('Không tải được danh sách đã chia sẻ.');
    const list = (await res.json()) as { id: string; sourceId: string }[];
    const hit = Array.isArray(list) ? list.find((r) => r.sourceId === sessionId) : undefined;
    if (!hit) return; // already not shared
    await fetch(`${APIA_BASE}/me/lark-shares/${encodeURIComponent(hit.id)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  /** Called once at startup: resume the bot listener if it was enabled. */
  async initBot(): Promise<void> {
    const cfg = this.store.getBotConfig();
    if (cfg?.enabled) await this.startWebhook(cfg).catch(() => {});
  }

  // ── Curated plugins ────────────────────────────────────────────────────────
  listPlugins(): PluginInfo[] {
    return this.plugins.list();
  }
  installPlugin(source: string): PluginInfo[] {
    return this.plugins.install(source);
  }
  setPluginEnabled(id: string, enabled: boolean): PluginInfo[] {
    return this.plugins.setEnabled(id, enabled);
  }
  uninstallPlugin(id: string): PluginInfo[] {
    return this.plugins.uninstall(id);
  }

  pluginPanels(): PluginPanelInfo[] {
    return this.plugins.collectPanels();
  }

  /** Run a Lark tool directly (UI-initiated, e.g. a plugin form panel). */
  async runTool(name: string, input: Record<string, unknown>): Promise<LarkToolRunResult> {
    const client = this.ensureClient();
    if (!client) return { ok: false, error: 'Chưa kết nối Lark.' };
    const tool = resolveTool(name) ?? this.plugins.collectTools().find((t) => t.name === name);
    if (!tool) return { ok: false, error: `Không tìm thấy tool ${name}.` };
    try {
      const data = await tool.exec(input, client);
      return { ok: true, data };
    } catch (e) {
      return { ok: false, error: e instanceof LarkApiError ? e.message : String((e as Error)?.message ?? e) };
    }
  }

  // ── Bot (Event Subscription) ───────────────────────────────────────────────
  private localUrl(port: number): string {
    return `http://127.0.0.1:${port}/`;
  }

  async botStatus(): Promise<LarkBotStatus> {
    const cfg = this.store.getBotConfig();
    const settings = this.store.getSettings();
    const port = cfg?.port ?? 3017;
    return {
      running: !!this.webhook?.isRunning(),
      enabled: cfg?.enabled ?? false,
      port,
      encryptKeySet: !!cfg?.encryptKey,
      verificationTokenSet: !!cfg?.verificationToken,
      runner: cfg?.runner ?? settings.defaultRunner ?? 'claude',
      model: cfg?.model ?? settings.defaultModel,
      localUrl: this.localUrl(port),
      activity: this.webhook?.stats(),
      tunnel: cfg?.tunnel ?? false,
      publicUrl: this.tunnel.status().url,
      tunnelRunning: this.tunnel.status().running,
      tunnelError: this.tunnel.status().error,
    };
  }

  async configureBot(input: LarkBotConfig): Promise<LarkBotStatus> {
    const stored = this.store.getBotConfig();
    const merged: LarkBotConfig = {
      enabled: input.enabled,
      port: input.port || stored?.port || 3017,
      encryptKey: input.encryptKey?.trim() || stored?.encryptKey,
      verificationToken: input.verificationToken?.trim() || stored?.verificationToken,
      runner: input.runner ?? stored?.runner ?? this.store.getSettings().defaultRunner,
      model: input.model ?? stored?.model ?? this.store.getSettings().defaultModel,
      tunnel: input.tunnel ?? stored?.tunnel ?? false,
    };
    this.store.setBotConfig(merged);
    await this.stopWebhook();
    if (merged.enabled) {
      try {
        await this.startWebhook(merged);
      } catch (e) {
        return { ...(await this.botStatus()), running: false, error: (e as Error)?.message };
      }
    }
    return this.botStatus();
  }

  private async startWebhook(cfg: LarkBotConfig): Promise<void> {
    if (!this.webhook) this.webhook = new LarkWebhook((m) => void this.handleBotMessage(m));
    await this.webhook.start({ port: cfg.port, encryptKey: cfg.encryptKey, verificationToken: cfg.verificationToken });
    // Optional public URL via cloudflared (best-effort — the error surfaces in botStatus().tunnelError).
    if (cfg.tunnel) await this.tunnel.start(cfg.port).catch(() => undefined);
    else await this.tunnel.stop();
  }

  private async stopWebhook(): Promise<void> {
    if (this.webhook) await this.webhook.stop().catch(() => {});
    await this.tunnel.stop();
  }

  /** F3 — wire the remote-build runner (LocalRuntimeAdapter.createBuild). */
  setRemoteBuild(fn: (input: { prompt: string; runner?: string; model?: string }) => AsyncIterable<BuildEvent>): void {
    this.remoteBuild = fn;
  }

  // ── Phase 1b: hosted (MAIC) general chat — run "Trợ lý AI" on Larkwave's server (no local Claude) ──

  /** Getter for the signed-in Larkwave account token (set by the main process). Needed to call the
   *  server's /agent/maic-ask on the user's behalf. */
  private accountTokenGetter?: () => string | null;
  setAccountTokenGetter(fn: () => string | null): void {
    this.accountTokenGetter = fn;
  }

  /**
   * Bật "Larkwave chạy lịch hộ": đẩy app_secret ĐANG LƯU TRÊN MÁY NÀY lên máy chủ.
   *
   * Chạy trong tiến trình chính có chủ ý: khoá đọc từ keychain rồi đi thẳng ra mạng, KHÔNG đi
   * qua renderer. Renderer chỉ bấm nút và nhận ok/lỗi — không bao giờ cầm app_secret. Nếu sau
   * này ai định chuyển việc này sang renderer cho "tiện", đó chính là chỗ khoá bắt đầu rò.
   *
   * Người dùng phải TỰ bấm. Đừng gọi hàm này từ luồng kết nối Lark hay lúc khởi động.
   */
  async hostedRunnerEnable(): Promise<{ ok: boolean; error?: string }> {
    const token = this.accountTokenGetter?.();
    if (!token) return { ok: false, error: 'Chưa đăng nhập tài khoản Larkwave.' };
    const creds = this.store.getCreds();
    if (!creds?.appId || !creds?.appSecret) return { ok: false, error: 'Máy này chưa kết nối Lark.' };
    try {
      const r = await fetch(`${APIA_BASE}/me/lark-hosted`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ appId: creds.appId, appSecret: creds.appSecret, label: 'Larkwave chạy hộ' }),
      });
      if (!r.ok) {
        const t = await r.text().catch(() => '');
        // Lấy câu tiếng Việt máy chủ trả về nếu có — nó nói đúng lý do (thiếu LARK_CREDS_KEY…).
        let msg = `Máy chủ từ chối (HTTP ${r.status})`;
        try {
          const j = JSON.parse(t) as { message?: string };
          if (j?.message) msg = j.message;
        } catch {
          /* giữ câu mặc định */
        }
        return { ok: false, error: msg };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error)?.message || 'Không gọi được máy chủ.' };
    }
  }

  /** Cache of whether the server has the hosted assistant (MAIC) configured (5-min TTL). */
  private maicAvailCache: { at: number; ok: boolean } | null = null;

  private async maicHostedAvailable(): Promise<boolean> {
    const now = Date.now();
    if (this.maicAvailCache && now - this.maicAvailCache.at < 300_000) return this.maicAvailCache.ok;
    let ok = false;
    const token = this.accountTokenGetter?.();
    if (token) {
      try {
        const r = await fetch(`${APIA_BASE}/agent/maic/status`, { headers: { Authorization: `Bearer ${token}` } });
        if (r.ok) ok = !!((await r.json()) as { enabled?: boolean }).enabled;
      } catch {
        ok = false;
      }
    }
    this.maicAvailCache = { at: now, ok };
    return ok;
  }

  /** Run ONE general turn on the server via MAIC (hosted Claude). No local CLI. */
  private async *runHostedChat(input: LarkChatInput): AsyncGenerator<LarkChatEvent> {
    const token = this.accountTokenGetter?.();
    if (!token) {
      yield { type: 'error', message: 'Chưa đăng nhập tài khoản Larkwave để dùng Trợ lý AI (hosted).' };
      yield { type: 'done' };
      return;
    }
    try {
      const res = await fetch(`${APIA_BASE}/agent/maic-ask`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          prompt: input.prompt,
          model: input.model,
          sessionId: input.sessionId,
          resume: input.resume,
        }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        yield {
          type: 'error',
          message:
            res.status === 402
              ? 'Bạn đã dùng hết hạn mức gói tháng này. Nâng gói để tiếp tục dùng Trợ lý AI.'
              : `Trợ lý AI (hosted) lỗi ${res.status}: ${t.slice(0, 160)}`,
        };
        yield { type: 'done' };
        return;
      }
      const j = (await res.json()) as { answer?: string };
      if (j.answer) yield { type: 'text', delta: j.answer };
      yield { type: 'done' };
    } catch (e) {
      yield { type: 'error', message: (e as Error)?.message || 'Lỗi khi chạy Trợ lý AI (hosted).' };
      yield { type: 'done' };
    }
  }

  /** Force/allow/disable hosted mode: true = always hosted, false = never, undefined = auto (hosted
   *  only when there is no usable local Claude). Persisted in settings. */
  async setHostedMode(mode: boolean | null): Promise<LarkConnection> {
    this.store.setSettings({ hostedMode: mode ?? undefined });
    this.maicAvailCache = null; // re-probe next turn
    return this.status();
  }

  /** Best-effort text reply into a Lark chat. */
  private async replyText(client: LarkClient, chatId: string, text: string): Promise<void> {
    try {
      await client.request('POST', '/open-apis/im/v1/messages', {
        params: { receive_id_type: 'chat_id' },
        data: { receive_id: chatId, msg_type: 'text', content: JSON.stringify({ text }), uuid: randomUUID() },
      });
    } catch {
      /* best-effort reply */
    }
  }

  /** `/run <prompt>` (or `/chay`, `/app`) in a bot chat → run a real build on THIS
   *  machine and reply with the result. Distinct from the read-only ask flow below.
   *
   *  SECURITY: `/run` starts a fully-autonomous (bypassPermissions) build under the
   *  owner's credentials, so it is gated hard: (1) the bot MUST have an Encrypt Key
   *  configured (otherwise the public webhook authenticates nothing), and (2) the
   *  sender's open_id MUST be the machine owner's (the personally-logged-in Lark user).
   *  Group members / forged events are refused. */
  private async handleRunCommand(client: LarkClient, m: BotMessage, prompt: string): Promise<void> {
    const chatId = m.chatId;
    if (!this.remoteBuild) {
      await this.replyText(client, chatId, 'Tính năng chạy lệnh trên máy chưa sẵn sàng ở bản này.');
      return;
    }
    // Gate 1 — require an Encrypt Key so the webhook can't be spoofed by a plaintext POST.
    if (!this.store.getBotConfig()?.encryptKey) {
      await this.replyText(
        client,
        chatId,
        '⚠️ Để dùng /run cần đặt Encrypt Key cho bot (Cài đặt bảo mật) — nếu không, ai biết URL webhook cũng chạy được lệnh trên máy bạn.',
      );
      return;
    }
    // Gate 2 — only the machine owner (personally-logged-in Lark user) may trigger a build.
    const me = await this.getMyLarkIdentity().catch(() => ({ openId: '', email: '' }));
    if (me.openId) this.ownerOpenIdCache = me.openId;
    const ownerOpenId = me.openId || this.ownerOpenIdCache;
    if (!ownerOpenId) {
      await this.replyText(client, chatId, '⚠️ Cần đăng nhập Lark cá nhân (chủ máy) để dùng /run.');
      return;
    }
    if (!m.senderId || m.senderId !== ownerOpenId) {
      await this.replyText(
        client,
        chatId,
        '⚠️ Chỉ chủ máy mới chạy được /run trên máy này (bảo mật).',
      );
      return;
    }
    if (!prompt) {
      await this.replyText(client, chatId, 'Cú pháp: <code>/run &lt;yêu cầu&gt;</code> — ví dụ: /run tạo trang landing bán cà phê.');
      return;
    }
    await this.replyText(client, chatId, '⏳ Đã nhận — máy đang chạy, xong sẽ báo lại ở đây.');
    const botCfg = this.store.getBotConfig();
    const runner = botCfg?.runner || this.store.getSettings().defaultRunner || 'claude';
    const model = botCfg?.model || this.store.getSettings().defaultModel;
    let appId: string | undefined;
    let previewUrl: string | undefined;
    let ok = true;
    let err = '';
    try {
      for await (const ev of this.remoteBuild({ prompt, runner, model })) {
        if (ev.type === 'result') {
          appId = ev.appId ?? appId;
          previewUrl = ev.previewUrl ?? previewUrl;
        } else if (ev.type === 'status' && ev.status === 'failed') {
          ok = false;
        } else if (ev.type === 'error') {
          ok = false;
          err = ev.message || err;
        }
      }
    } catch (e) {
      ok = false;
      err = (e as Error).message;
    }
    const summary = ok
      ? `✅ Xong!${appId ? `\nApp: ${appId}` : ''}${previewUrl ? `\nXem thử: ${previewUrl}` : ''}`
      : `❌ Không chạy được: ${err || 'thất bại'}`;
    await this.replyText(client, chatId, summary);
  }

  /** Answer an incoming Lark message (READ-ONLY) and reply in the same chat. */
  private async handleBotMessage(m: BotMessage): Promise<void> {
    const client = this.ensureClient();
    if (!client) return;
    // In a group the bot is usually @mentioned, which prefixes the text with a mention
    // placeholder like "@_user_1" (or the literal bot name). Strip leading mentions +
    // whitespace so "/run" is still recognized when it isn't the very first character.
    const text = m.text.replace(/^(?:\s*@_(?:user_\d+|all))+\s*/i, '').trim() || m.text.trim();
    // F3 — `/run <prompt>` triggers a real build on this machine (not the read-only ask).
    const runMatch = text.match(/^\/(run|chay|app)(?:@\w+)?\b\s*/i);
    if (runMatch) {
      await this.handleRunCommand(client, m, text.slice(runMatch[0].length).trim());
      return;
    }
    const systemPrompt = buildSystemPrompt({
      tenantName: this.tenantName,
      bases: this.store.getBases(),
      mode: 'ask',
      userLoggedIn: this.userLoggedIn(),
    });
    let answer = '';
    try {
      const botCfg = this.store.getBotConfig();
      const botRunner = botCfg?.runner || this.store.getSettings().defaultRunner || 'claude';
      const botModel = botCfg?.model || this.store.getSettings().defaultModel;
      for await (const ev of runLarkAgent(text, 'ask', {
        client,
        systemPrompt,
        runner: botRunner,
        model: botModel,
        session: { id: randomUUID(), resume: false },
        extraTools: this.plugins.collectTools().filter((t) => !t.gated),
        awaitConfirm: async () => false,
        awaitAsk: async () =>
          'Đây là kênh bot không có người trả lời trực tiếp. Hãy trả lời tốt nhất có thể với thông tin hiện có, hoặc nói rõ bạn cần thêm thông tin gì.',
      })) {
        if (ev.type === 'text') answer += ev.delta;
      }
    } catch {
      answer = 'Xin lỗi, mình gặp lỗi khi xử lý câu hỏi.';
    }
    answer = answer.trim() || 'Mình chưa trả lời được câu này.';
    try {
      await client.request('POST', '/open-apis/im/v1/messages', {
        params: { receive_id_type: 'chat_id' },
        data: { receive_id: m.chatId, msg_type: 'text', content: JSON.stringify({ text: answer }), uuid: randomUUID() },
      });
    } catch {
      /* best-effort reply */
    }
  }

  /** Lazily build the LarkClient from stored creds. */
  private ensureClient(): LarkClient | null {
    if (this.client) return this.client;
    const creds = this.store.getCreds();
    if (!creds) return null;
    this.appId = creds.appId;
    this.client = new LarkClient(creds.appId, creds.appSecret);
    this.client.userTokenProvider = (force) => this.validUserToken(force);
    return this.client;
  }

  /** True while the personal-account login can still be used (refresh not expired). */
  private userLoggedIn(): boolean {
    return !!this.userAuth && Date.now() < this.userAuth.refreshExpiresAt;
  }

  /** Logged in, but the OAuth `scope` we were GRANTED clearly lacks Bitable → every Bitable
   *  read/write comes back empty with no error (Lark drops un-published requested scopes).
   *  Only asserts when the granted-scope string is present (avoids false alarms). */
  private userBitableScopeMissing(): boolean {
    const g = this.userAuth?.scope;
    return this.userLoggedIn() && !!g && !g.split(/\s+/).includes('bitable:app');
  }

  /** The direct-API key for a runner (Claude managed key, or the provider key). */
  private resolveApiKey(runner: string): string | null {
    return runner === 'claude' ? getActiveKey() : getProviderKey(runner);
  }
  /** Whether the direct-API path is on AND the chosen runner has a usable key. */
  private apiReady(runner: string): boolean {
    return (this.store.getSettings().apiMode ?? false) && !!this.resolveApiKey(runner);
  }

  /** Direct-API config for a runner — SHARED by the Lark agent AND codegen (Tạo app),
   *  so the user configures "API trực tiếp" + keys once and both surfaces honour it. */
  apiConfig(runner: string): { apiMode: boolean; apiKey: string | null } {
    const apiMode = this.store.getSettings().apiMode ?? false;
    return { apiMode, apiKey: apiMode ? this.resolveApiKey(runner) : null };
  }

  // ── EXPERIMENTAL: Lark WEB session (internal-API access for workflow reading) ──
  /** Open the Lark web login window; resolves once logged in. `url` = any URL from the
   *  user's workspace so we land on their tenant shard. */
  async webConnect(url?: string): Promise<LarkWebInfo> {
    // Fall back to the remembered shard so re-login lands on the user's OWN tenant host (needed so
    // the connector sync runs on the base's shard with the right session cookies).
    const target = url || this.store.getSettings().webHost || undefined;
    const info = await getLarkWebSession().connect(target);
    // Remember a successful login for THIS account so it auto-restores next time.
    if (info.connected && info.host) this.store.setSettings({ webHost: info.host });
    return info;
  }
  webStatus(): LarkWebInfo {
    const s = getLarkWebSession();
    const paths = s.capturedInfo();
    return { ...s.status(), workflowEndpoint: paths.length ? paths[0] : undefined };
  }
  webDisconnect(): void {
    getLarkWebSession().disconnect();
    this.store.setSettings({ webHost: null }); // forget the remembered login for this account
  }
  webReveal(): void {
    getLarkWebSession().reveal();
  }
  webSetWorkflowUrl(url: string): LarkWebInfo {
    getLarkWebSession().setCapturedUrl(url);
    return this.webStatus();
  }
  // UI-automation: record real Lark UI + capture the exact valid workflow request, then replay it.
  webStartRecorder(url?: string): Promise<{ ok: boolean; error?: string }> {
    return getLarkWebSession().startRecorder(url);
  }
  webStopRecorder(): void {
    getLarkWebSession().stopRecorder();
  }
  webGetRecording(): ReturnType<ReturnType<typeof getLarkWebSession>['getRecording']> {
    return getLarkWebSession().getRecording();
  }
  webReplayWorkflow(opts?: { enable?: boolean }): Promise<{ workflowID: string; baseId: string; title: string }> {
    return getLarkWebSession().replayCapturedWorkflow(opts);
  }

  async status(): Promise<LarkConnection> {
    const claude = await claudeAvailable().catch(() => false);
    const c = this.ensureClient();
    const settings = this.store.getSettings();
    const autoApprove = settings.autoApprove ?? false;
    const userLoggedIn = this.userLoggedIn();
    const userName = userLoggedIn ? this.userAuth?.userName : undefined;
    const defaultRunner = settings.defaultRunner || 'claude';
    const defaultModel = settings.defaultModel;
    const apiMode = settings.apiMode ?? false;
    if (!c)
      return {
        connected: false,
        claudeAvailable: claude,
        autoApprove,
        userLoggedIn,
        userName,
        defaultRunner,
        defaultModel,
        apiMode,
        // Cũng trả ở nhánh CHƯA kết nối: thiếu thì mở app lần đầu, lựa chọn nguồn chạy nhảy về
        // 'cli' rồi lần lưu kế tiếp ghi đè mất lựa chọn thật của người dùng.
        larkRunSource: settings.larkRunSource ?? (apiMode ? 'api' : 'cli'),
        maicAvailable: !!this.accountTokenGetter?.() && this.maicAvailCache?.ok !== false,
      };
    return {
      connected: true,
      appId: this.appId ?? undefined,
      tenantName: this.tenantName,
      claudeAvailable: claude,
      autoApprove,
      userLoggedIn,
      userName,
      userBitableScopeMissing: this.userBitableScopeMissing(),
      defaultRunner,
      defaultModel,
      apiMode,
      apiKeyReady: this.apiReady(defaultRunner),
      larkRunSource: settings.larkRunSource ?? (apiMode ? 'api' : 'cli'),
      // Chỉ hiện lựa chọn "gói Larkwave" khi máy chủ THẬT SỰ có MAIC và người dùng đã đăng nhập.
      // Bày một lựa chọn rồi báo lỗi khi bấm thì tệ hơn là không bày.
      maicAvailable: !!this.accountTokenGetter?.() && this.maicAvailCache?.ok !== false,
    };
  }

  /** Default + per-device Lark agent prefs (also used for new sessions). `apiMode` toggles
   *  the direct-API (no-CLI) execution path. */
  async setAgentPrefs(prefs: {
    runner?: string;
    model?: string;
    apiMode?: boolean;
    larkRunSource?: 'cli' | 'api' | 'maic';
  }): Promise<LarkConnection> {
    this.store.setSettings({
      defaultRunner: prefs.runner,
      defaultModel: prefs.model,
      // Giữ `apiMode` đồng bộ với nguồn chạy: hai thứ này từng là hai công tắc rời, và để lệch
      // nhau thì người dùng chọn "gói Larkwave" mà đường chạy vẫn rẽ theo cờ cũ.
      apiMode: prefs.larkRunSource ? prefs.larkRunSource === 'api' : prefs.apiMode,
      larkRunSource: prefs.larkRunSource,
    });
    if (prefs.runner) this.activeRunner = prefs.runner;
    if (prefs.model !== undefined) this.activeModel = prefs.model || undefined;
    if (prefs.apiMode !== undefined) this.apiCreditOut.clear(); // let the user retry the API after fixing the key
    return this.status();
  }

  // ── Personal-account login (user_access_token → full access as the user) ────

  /**
   * Return a valid user_access_token, refreshing it if near/at expiry. Null when not
   * logged in or the refresh token has itself expired (→ requests use the tenant token).
   * `force` bypasses the freshness check (used on an auth-error retry). Concurrent
   * callers share one in-flight refresh.
   */
  async validUserToken(force = false): Promise<string | null> {
    const a = this.userAuth;
    if (!a) return null;
    if (Date.now() >= a.refreshExpiresAt) {
      this.clearUserAuth(); // refresh token dead → require a fresh login
      return null;
    }
    if (!force && Date.now() < a.expiresAt - 60_000) return a.accessToken;
    if (!this.userRefresh) {
      this.userRefresh = (async () => {
        const creds = this.store.getCreds();
        if (!creds) return null;
        try {
          const t = await refreshTokens(creds.appId, creds.appSecret, a.refreshToken);
          const next: StoredUserAuth = { ...t, userName: a.userName };
          this.userAuth = next;
          this.store.setUserAuth(next);
          return next.accessToken;
        } catch (e) {
          // Only wipe the personal session on a PERMANENT failure (revoked/expired refresh
          // token). On a transient network/5xx blip, KEEP the session and just return null
          // for this call (falls back to the tenant token; retried on the next call) — so a
          // momentary outage doesn't silently log the user out + downgrade their scope.
          if (e instanceof LarkOAuthError && e.transient) return null;
          this.clearUserAuth();
          return null;
        } finally {
          this.userRefresh = null;
        }
      })();
    }
    return this.userRefresh;
  }

  private clearUserAuth(): void {
    this.userAuth = null;
    this.store.clearUserAuth();
  }

  /**
   * Begin personal-account OAuth: returns the app id + a fresh CSRF state. The desktop
   * main process opens the authorize window with these and intercepts the callback.
   */
  userAuthStart(): { appId: string; state: string } | { error: string } {
    const creds = this.store.getCreds();
    if (!creds) return { error: 'Hãy kết nối custom app (App ID + Secret) trước khi đăng nhập bằng tài khoản.' };
    // One login at a time: a second window would clobber oauthState and strand the first.
    if (this.oauthState)
      return { error: 'Đang có một phiên đăng nhập Lark khác đang mở. Hãy hoàn tất hoặc đóng cửa sổ đó rồi thử lại.' };
    this.oauthState = randomUUID();
    return { appId: creds.appId, state: this.oauthState };
  }

  /** Abandon an in-flight OAuth login (window cancelled/errored) so a new one can start. */
  userAuthCancel(): void {
    this.oauthState = null;
  }

  /** Finish OAuth: validate the state, exchange the code for user tokens, store them. */
  async userAuthComplete(code: string, state?: string): Promise<LarkConnection> {
    const creds = this.store.getCreds();
    if (!creds) {
      this.oauthState = null;
      return this.status();
    }
    // Defense-in-depth CSRF check (the OAuth window also verifies state): the code must
    // belong to the login this service started, and the flow is one-use.
    if (!this.oauthState || (state !== undefined && state !== this.oauthState)) {
      this.oauthState = null;
      const s = await this.status();
      return { ...s, error: 'Phiên đăng nhập Lark không hợp lệ hoặc đã hết hạn — hãy đăng nhập lại.' };
    }
    try {
      const tokens = await exchangeCode(creds.appId, creds.appSecret, code);
      const userName = await fetchUserName(tokens.accessToken);
      const auth: StoredUserAuth = { ...tokens, userName };
      this.userAuth = auth;
      this.store.setUserAuth(auth);
      return this.status();
    } catch (e) {
      const s = await this.status();
      return { ...s, error: humanize(e) };
    } finally {
      this.oauthState = null; // one-use: clear on success or failure
    }
  }

  /** Log out of the personal account (revert to app/tenant-token access). */
  async userLogout(): Promise<LarkConnection> {
    this.clearUserAuth();
    return this.status();
  }

  /** Toggle auto-approving writes (Build mode runs without per-tool confirm). */
  async setAutoApprove(on: boolean): Promise<LarkConnection> {
    this.store.setSettings({ autoApprove: on });
    return this.status();
  }

  async connect(creds: { appId: string; appSecret: string; name?: string }): Promise<LarkConnection> {
    return this.doConnect(creds.appId.trim(), creds.appSecret.trim(), creds.name?.trim() || undefined);
  }

  /** Reconnect to a remembered app by id (secret pulled from the encrypted history). */
  async connectSaved(appId: string): Promise<LarkConnection> {
    const saved = this.store.getApp(appId);
    if (!saved) {
      const s = await this.status();
      return { ...s, error: 'Không tìm thấy app đã lưu — hãy nhập lại App ID + Secret.' };
    }
    return this.doConnect(saved.appId, saved.appSecret, saved.name);
  }

  /** Shared connect path: test the creds (real token mint), persist as active + remember
   *  in history. On failure the active connection is left untouched. */
  private async doConnect(appId: string, appSecret: string, name?: string): Promise<LarkConnection> {
    const claude = await claudeAvailable().catch(() => false);
    if (!appId || !appSecret) return { connected: false, claudeAvailable: claude, error: 'Thiếu App ID hoặc App Secret.' };
    const client = new LarkClient(appId, appSecret);
    client.userTokenProvider = (force) => this.validUserToken(force);
    try {
      await client.getTenantAccessToken(true); // real credential test
    } catch (e) {
      return { connected: false, claudeAvailable: claude, error: humanize(e) };
    }
    this.store.setCreds({ appId, appSecret });
    this.client = client;
    this.appId = appId;
    this.tenantName = await client.tenantName();
    // Remember it (encrypted) so the user can switch back without re-pasting the secret.
    this.store.upsertApp({ appId, appSecret, name, tenantName: this.tenantName, lastUsedAt: new Date().toISOString() });
    return {
      connected: true,
      appId,
      tenantName: this.tenantName,
      claudeAvailable: claude,
      tokenValid: true,
      autoApprove: this.store.getSettings().autoApprove ?? false,
    };
  }

  /** Remembered apps (no secrets) — newest-used first, with the active one flagged. */
  listApps(): LarkAppRef[] {
    return this.store.getApps().map((a) => ({
      appId: a.appId,
      name: a.name,
      tenantName: a.tenantName,
      lastUsedAt: a.lastUsedAt,
      active: a.appId === this.appId,
    }));
  }

  renameApp(appId: string, name: string): LarkAppRef[] {
    this.store.renameApp(appId, name.trim().slice(0, 60));
    return this.listApps();
  }

  /** Drop a remembered app; if it's the one currently connected, disconnect too. */
  async forgetApp(appId: string): Promise<LarkAppRef[]> {
    if (this.appId === appId) await this.disconnect();
    this.store.removeApp(appId);
    return this.listApps();
  }

  /**
   * Actively validate the connection (a real token mint) so a session that quietly
   * expired while the app sat idle is DETECTED and surfaced, instead of only failing
   * the next chat turn. Force-re-mints the tenant token and proactively refreshes the
   * personal-account token; sets `tokenValid` / `userTokenExpired` for the UI.
   */
  async checkConnection(): Promise<LarkConnection> {
    const base = await this.status();
    if (!base.connected) return base;
    const client = this.ensureClient();
    if (!client) return { ...base, tokenValid: false };
    let tokenValid = true;
    let error: string | undefined;
    try {
      await client.getTenantAccessToken(true); // force a fresh mint = genuine health probe
      // Refresh the cached tenant name if it wasn't resolved at connect time.
      if (!this.tenantName) this.tenantName = await client.tenantName().catch(() => undefined);
    } catch (e) {
      tokenValid = false;
      error = humanize(e);
    }
    // Proactively refresh the personal token so an expired refresh-token is caught now.
    let userTokenExpired = false;
    if (this.userAuth) {
      const tok = await this.validUserToken(false).catch(() => null);
      if (!tok && !this.userLoggedIn()) userTokenExpired = true;
    }
    return { ...(await this.status()), tokenValid, userTokenExpired, error };
  }

  async disconnect(): Promise<void> {
    // Also drop the personal-account session: otherwise the previous user's
    // user_access_token/refresh_token linger in memory and could be refreshed and
    // re-persisted against a newly-connected app's creds (credential leak across sessions).
    this.clearUserAuth();
    this.userRefresh = null; // cancel any in-flight refresh so it can't re-persist tokens
    this.oauthState = null; // abandon any half-finished OAuth login
    this.clearPending(); // deny open gated-tool confirmations so their promises don't hang
    this.store.clearCreds();
    this.client = null;
    this.appId = null;
    this.tenantName = undefined;
    this.resetChat();
    await this.stopWebhook(); // bot can't reply without a client
  }

  /** Drop the shared conversation so the next turn starts a fresh Claude session. */
  resetChat(): void {
    this.chatSessionId = null;
    this.chatStarted = false;
    this.activeSessionId = null;
    this.carryover = null;
  }

  listBases(): LarkBaseRef[] {
    return this.store.getBases();
  }

  /**
   * Snapshot a Base's structure + a few sample rows per table — the grounding for
   * the "dựng app từ phân tích" handoff into the builder. Bounded (tables/fields/rows
   * capped) so the synthesized builder prompt stays small. Best-effort per table:
   * a table whose fields/records aren't readable is included with whatever resolved.
   */
  async baseSnapshot(appToken: string): Promise<LarkBaseSnapshot> {
    const client = this.ensureClient();
    if (!client) throw new Error('Chưa kết nối Lark — hãy kết nối trước.');
    const meta = await client.getBaseApp(appToken).catch(() => null);
    const baseName =
      meta?.app?.name || this.store.getBases().find((b) => b.appToken === appToken)?.name || appToken;
    const tablesRes = await client.listAllTables(appToken).catch(() => ({ items: [], total: 0 }));
    const tables: LarkSnapshotTable[] = [];
    for (const t of tablesRes.items.slice(0, SNAPSHOT_MAX_TABLES)) {
      const fieldsRes = await client
        .request<{ items?: { field_name: string; type: number }[] }>(
          'GET',
          `/open-apis/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(t.table_id)}/fields`,
          { params: { page_size: 200 } },
        )
        .catch(() => ({ items: [] as { field_name: string; type: number }[] }));
      const fields = (fieldsRes.items ?? []).slice(0, SNAPSHOT_MAX_FIELDS).map((f) => ({
        name: f.field_name,
        type: LARK_FIELD_TYPE[f.type] ?? `loại ${f.type}`,
      }));
      const recRes = await client
        .request<{ items?: { fields: Record<string, unknown> }[] }>(
          'POST',
          `/open-apis/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(t.table_id)}/records/search`,
          { params: { page_size: SNAPSHOT_MAX_ROWS } },
        )
        .catch(() => ({ items: [] as { fields: Record<string, unknown> }[] }));
      const sample = (recRes.items ?? []).slice(0, SNAPSHOT_MAX_ROWS).map((r) => simplifyRecord(r.fields));
      tables.push({ tableName: t.name, fields, sample });
    }
    return { appToken, baseName, tables };
  }

  /**
   * Also enumerate Bases that live inside Lark WIKI spaces — the Drive-files walk
   * misses these, and structured workspaces (numbered "1.1 / 1.2 …" trees) usually
   * keep their Bases in a Wiki. Lists every wiki space the user can see, walks each
   * space's node tree (BFS), and collects `bitable` nodes' obj_token. Bounded + best-
   * effort; needs the `wiki:wiki:readonly` scope + the personal (user) token.
   */
  private async discoverWikiBases(client: LarkClient, found: Map<string, string>): Promise<void> {
    interface WikiSpace { space_id?: string; name?: string }
    interface WikiSpacesPage { items?: WikiSpace[]; has_more?: boolean; page_token?: string }
    interface WikiNode { node_token?: string; obj_token?: string; obj_type?: string; title?: string; has_child?: boolean }
    interface WikiNodesPage { items?: WikiNode[]; has_more?: boolean; page_token?: string }

    // 1. All wiki spaces the user can access.
    const spaces: WikiSpace[] = [];
    let sTok: string | undefined;
    let sPages = 0;
    do {
      const r = await client
        .request<WikiSpacesPage>('GET', '/open-apis/wiki/v2/spaces', { params: { page_size: 50, page_token: sTok } })
        .catch((err) => {
          console.warn('[lark] discoverWikiBases spaces error:', (err as Error)?.message || err);
          return {} as WikiSpacesPage;
        });
      for (const s of r.items ?? []) if (s?.space_id) spaces.push(s);
      sTok = r.has_more ? r.page_token : undefined;
      sPages++;
    } while (sTok && sPages < 20 && spaces.length < 200);

    // 2. Walk each space's node tree (BFS); a node whose obj_type is 'bitable' IS a Base.
    let nodeVisits = 0;
    for (const space of spaces) {
      if (found.size >= DISCOVER_MAX_BASES) break;
      const queue: (string | undefined)[] = [undefined]; // undefined = the space root
      const seen = new Set<string>();
      while (queue.length && nodeVisits < DISCOVER_MAX_WIKI_NODES && found.size < DISCOVER_MAX_BASES) {
        const parent = queue.shift();
        if (parent !== undefined) {
          if (seen.has(parent)) continue;
          seen.add(parent);
        }
        let nTok: string | undefined;
        let nPages = 0;
        do {
          const r = await client
            .request<WikiNodesPage>('GET', `/open-apis/wiki/v2/spaces/${encodeURIComponent(space.space_id!)}/nodes`, {
              params: { page_size: 50, page_token: nTok, parent_node_token: parent },
            })
            .catch((err) => {
              console.warn('[lark] discoverWikiBases nodes error:', (err as Error)?.message || err);
              return {} as WikiNodesPage;
            });
          for (const n of r.items ?? []) {
            nodeVisits++;
            if (n.obj_type === 'bitable' && n.obj_token && !found.has(n.obj_token)) {
              found.set(n.obj_token, n.title || n.obj_token);
            }
            if (n.has_child && n.node_token && seen.size + queue.length < DISCOVER_MAX_WIKI_NODES) {
              queue.push(n.node_token);
            }
          }
          nTok = r.has_more ? r.page_token : undefined;
          nPages++;
        } while (nTok && nPages < 20 && found.size < DISCOVER_MAX_BASES);
      }
    }
  }

  /**
   * Auto-discover the user's Bases (needs the personal login — the tenant token only
   * sees the app's own drive). Walks BOTH their Lark Drive (BFS over folders, collecting
   * every `bitable` file + shortcuts) AND their Wiki spaces (numbered "1.1/1.2…" trees
   * live here, invisible to the Drive API). Bounded so a huge workspace can't run forever.
   * Merges the result into the registered Bases and returns the full list.
   */
  async discoverBases(): Promise<LarkBaseRef[]> {
    const client = this.ensureClient();
    if (!client) throw new Error('Chưa kết nối Lark.');
    if (!this.userLoggedIn())
      throw new Error('Cần đăng nhập tài khoản Lark (quét QR) để tự động nạp Base của bạn.');

    const found = new Map<string, string>(); // appToken → name
    const seen = new Set<string>();
    const queue: (string | undefined)[] = [undefined]; // undefined = root cloud space
    let folderVisits = 0;

    while (queue.length && folderVisits < DISCOVER_MAX_FOLDERS && found.size < DISCOVER_MAX_BASES) {
      const folderToken = queue.shift();
      if (folderToken !== undefined) {
        if (seen.has(folderToken)) continue;
        seen.add(folderToken);
      }
      folderVisits++;
      let pageToken: string | undefined;
      let pages = 0;
      do {
        const res: DriveFilesPage = await client
          .request<DriveFilesPage>('GET', '/open-apis/drive/v1/files', {
            params: { folder_token: folderToken, page_size: 200, page_token: pageToken },
          })
          .catch((err) => {
            // A failed page ends this folder's pagination — log so a partial result isn't
            // silently mistaken for "the user has no more Bases".
            console.warn('[lark] discoverBases page error:', (err as Error)?.message || err);
            return {} as DriveFilesPage;
          });
        for (const f of res.files ?? []) {
          if (f.type === 'bitable') {
            found.set(f.token, f.name || f.token);
          } else if (f.type === 'shortcut' && f.shortcut_info?.target_type === 'bitable' && f.shortcut_info.target_token) {
            found.set(f.shortcut_info.target_token, f.name || f.shortcut_info.target_token);
          } else if (f.type === 'folder' && seen.size + queue.length < DISCOVER_MAX_FOLDERS) {
            queue.push(f.token);
          }
        }
        pageToken = res.has_more ? res.next_page_token : undefined;
        pages++;
      } while (pageToken && pages < 10 && found.size < DISCOVER_MAX_BASES);
    }

    // Also sweep WIKI spaces — structured workspaces keep their Bases there, invisible
    // to the Drive API above (best-effort: a missing wiki scope just yields nothing).
    await this.discoverWikiBases(client, found).catch((err) =>
      console.warn('[lark] discoverWikiBases failed:', (err as Error)?.message || err),
    );

    // Merge discovered Bases into the registered list (existing names win).
    const byToken = new Map(this.store.getBases().map((b) => [b.appToken, b] as const));
    for (const [appToken, name] of found) {
      if (!byToken.has(appToken)) byToken.set(appToken, { appToken, name });
    }
    const merged = Array.from(byToken.values());
    this.store.setBases(merged);
    return merged;
  }

  async addBase(input: { appToken?: string; url?: string; name?: string; description?: string }): Promise<LarkBaseRef[]> {
    const client = this.ensureClient();
    let name = input.name?.trim();
    // A pasted app_token (no slash) is used directly; otherwise parse the URL.
    let appToken = input.appToken && !input.appToken.includes('/') ? input.appToken.trim() : '';
    if (!appToken) {
      const parsed = parseBaseUrl(input.url || input.appToken || '');
      if (parsed.appToken) {
        appToken = parsed.appToken;
      } else if (parsed.wikiNode) {
        // A Base embedded in a Wiki: the URL only carries a wiki NODE token, not the
        // app_token → resolve it through the Wiki API.
        if (!client) throw new Error('Chưa kết nối Lark — hãy kết nối trước khi thêm Base.');
        const resolved = await this.resolveWikiBase(client, parsed.wikiNode);
        appToken = resolved.appToken;
        if (!name) name = resolved.name;
      }
    }
    if (!appToken) throw new Error('Thiếu app_token hoặc URL Base hợp lệ.');
    if (!name && client) {
      try {
        name = (await client.getBaseApp(appToken)).app?.name;
      } catch {
        /* keep the token as the name if metadata isn't accessible */
      }
    }
    const existing = this.store.getBases().find((b) => b.appToken === appToken);
    const description = input.description?.trim() ?? existing?.description;
    const bases = this.store.getBases().filter((b) => b.appToken !== appToken);
    // Preserve the prior name when editing only the description (name not re-supplied).
    bases.push({ appToken, name: name || existing?.name || appToken, description: description || undefined });
    this.store.setBases(bases);
    return bases;
  }

  /** Resolve a Wiki node token → the underlying Base's app_token (Bitable in Wiki). */
  private async resolveWikiBase(client: LarkClient, nodeToken: string): Promise<{ appToken: string; name?: string }> {
    try {
      const r = await client.request<{ node?: { obj_token?: string; obj_type?: string; title?: string } }>(
        'GET',
        '/open-apis/wiki/v2/spaces/get_node',
        { params: { token: nodeToken, obj_type: 'wiki' } },
      );
      const node = r?.node;
      if (!node?.obj_token) throw new Error('Wiki không trả về obj_token.');
      if (node.obj_type && node.obj_type !== 'bitable') {
        throw new Error(`Wiki node là "${node.obj_type}", không phải Bitable.`);
      }
      return { appToken: node.obj_token, name: node.title };
    } catch (e) {
      throw new Error(
        'Không tự lấy được app_token từ link Wiki. Cách khắc phục: (1) cấp scope "wiki:wiki:readonly" cho Custom App rồi thử lại; ' +
          'HOẶC (2) mở Base → nút "•••" → Development Tool → copy "Base ID(appToken)" rồi dán vào ô này. ' +
          `(Chi tiết: ${(e as Error).message})`,
      );
    }
  }

  removeBase(appToken: string): LarkBaseRef[] {
    const bases = this.store.getBases().filter((b) => b.appToken !== appToken);
    this.store.setBases(bases);
    return bases;
  }

  // ── Tự động hoá (Larkwave rule engine) ─────────────────────────────────────
  /** Public rule shape — drop the engine's internal dedup set (can be large). */
  private publicRule(r: StoredAutomation): LarkAutomation {
    const { firedRecordIds: _drop, ...rest } = r;
    return rest;
  }
  listAutomations(): LarkAutomation[] {
    return this.automation.list().map((r) => this.publicRule(r));
  }
  saveAutomation(input: LarkAutomationInput): LarkAutomation[] {
    return this.automation.upsert(input).map((r) => this.publicRule(r));
  }
  deleteAutomation(id: string): LarkAutomation[] {
    return this.automation.remove(id).map((r) => this.publicRule(r));
  }
  setAutomationEnabled(id: string, on: boolean): LarkAutomation[] {
    return this.automation.setEnabled(id, on).map((r) => this.publicRule(r));
  }
  runAutomation(id: string): Promise<LarkAutomationRunResult> {
    return this.automation.execute(id);
  }
  /** Tables of a Base — powers the automation form's table picker. */
  async listTables(appToken: string): Promise<LarkTableRef[]> {
    const client = this.ensureClient();
    if (!client) throw new Error('Chưa kết nối Lark — hãy kết nối trước.');
    const res = await client.listAllTables(appToken);
    return res.items.map((t) => ({ tableId: t.table_id, name: t.name }));
  }

  /**
   * Render ONE persisted chat item to a transcript line, or null to skip it. Includes `tool`
   * items (name + args + result summary), not just `msg` text — so a rebuilt transcript carries
   * the memory of what the agent already fetched/wrote in Lark on earlier turns (otherwise a
   * non-claude/API runner re-fetches or hallucinates that data every turn).
   */
  private renderItemLine(it: ChatItemLite): string | null {
    if (it?.kind === 'msg' && typeof it.text === 'string' && it.text.trim()) {
      // Per-message cap so no single line (incl. the always-pinned first user message) can bust the
      // window budget or the CLI `-p` argv (ARG_MAX) — e.g. a pasted document as the first message.
      return `${it.role === 'user' ? 'Người dùng' : 'Trợ lý'}: ${it.text.trim().slice(0, 4000)}`;
    }
    if (it?.kind === 'tool' && it.call?.name) {
      const c = it.call;
      let argStr = '';
      try {
        // Cắt thẳng JSON ở 300 ký tự sẽ NUỐT MẤT đúng thứ đáng giữ nhất khi tham số dài (filter/sort/
        // field_names của bitable_search_records chẳng hạn): các ĐỊNH DANH. Mất app_token/table_id ở
        // các lượt sau nghĩa là model không còn đường đọc lại bảng đó — hay đọc tệp đính kèm trong nó.
        // Nên tách định danh ra trước, chỉ cắt phần còn lại.
        const inp = (c.input || {}) as Record<string, unknown>;
        const KEYS = ['app_token', 'table_id', 'record_id', 'field_id', 'file_token', 'chat_id'];
        const ids: Record<string, unknown> = {};
        const rest: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(inp)) (KEYS.includes(k) ? ids : rest)[k] = v;
        const idStr = Object.keys(ids).length ? JSON.stringify(ids) : '';
        const restStr = Object.keys(rest).length ? JSON.stringify(rest).slice(0, 300) : '';
        argStr = idStr || restStr ? ` ${[idStr, restStr].filter(Boolean).join(' ')}` : '';
      } catch {
        argStr = '';
      }
      // "(lỗi)" trơ trọi là vô dụng ở lượt sau: model không biết đã hỏng VÌ SAO nên hoặc lặp lại y
      // nguyên lời gọi sai, hoặc bỏ cuộc. Giữ lại một đoạn thông báo lỗi thật.
      const res = c.summary
        ? ` → ${String(c.summary).slice(0, 400)}`
        : c.status === 'error'
          ? ` → (lỗi: ${String(c.error || 'không rõ').slice(0, 200)})`
          : '';
      return `[Tool ${c.name}${argStr}]${res}`;
    }
    return null;
  }

  /**
   * Rebuild a compact TEXT transcript of a conversation. Used (a) as the ONLY cross-turn memory
   * for non-claude CLI runners (no `--resume`), and (b) to RE-SEED claude when its local CLI
   * session is gone (cross-device restore / reinstall / CLI prune) or after switching runner —
   * without which the default runner silently forgets the whole conversation the UI still shows.
   * Windowed by an approximate TOKEN budget (newest-first), not a fixed message count, and the
   * first user message (task/scope) is preserved when older turns are evicted.
   */
  private buildTranscript(items: unknown[], budgetTokens = 9000): string {
    const rendered = (items as ChatItemLite[])
      .map((it) => ({ it, line: this.renderItemLine(it) }))
      .filter((x): x is { it: ChatItemLite; line: string } => !!x.line);
    if (!rendered.length) return '';
    const picked: string[] = [];
    let used = 0;
    let evicted = false;
    for (let i = rendered.length - 1; i >= 0; i--) {
      const t = Math.ceil(rendered[i].line.length / 4);
      if (used + t > budgetTokens) {
        evicted = true;
        break;
      }
      picked.push(rendered[i].line);
      used += t;
    }
    picked.reverse();
    if (evicted) {
      const firstUser = rendered.find((r) => r.it.kind === 'msg' && r.it.role === 'user');
      picked.unshift('… (đã lược bớt phần cũ hơn của hội thoại) …');
      if (firstUser && !picked.includes(firstUser.line)) picked.unshift(firstUser.line);
    }
    return picked.join('\n');
  }

  /**
   * Same windowing as buildTranscript but shaped for the DIRECT-API path (structured messages).
   * Tool items are folded in as assistant lines so the model keeps the memory of prior Lark reads/
   * writes. Replaces the old fixed `.slice(-14)` msg-only cap (which dropped tool context + early
   * turns) with a token budget.
   */
  private buildApiHistory(
    items: unknown[],
    budgetTokens = 9000,
  ): { role: 'user' | 'assistant'; text: string }[] {
    const msgs = (items as ChatItemLite[])
      .map((it) => {
        if (it?.kind === 'msg' && (it.role === 'user' || it.role === 'assistant') && typeof it.text === 'string' && it.text.trim()) {
          return { role: it.role as 'user' | 'assistant', text: it.text.trim() };
        }
        const line = it?.kind === 'tool' ? this.renderItemLine(it) : null;
        return line ? { role: 'assistant' as const, text: line } : null;
      })
      .filter((x): x is { role: 'user' | 'assistant'; text: string } => !!x);
    const picked: { role: 'user' | 'assistant'; text: string }[] = [];
    let used = 0;
    for (let i = msgs.length - 1; i >= 0; i--) {
      const t = Math.ceil(msgs[i].text.length / 4);
      if (used + t > budgetTokens) break;
      picked.push(msgs[i]);
      used += t;
    }
    picked.reverse();
    // Normalize for provider constraints: Anthropic requires the first message to be a user turn;
    // Gemini requires STRICT user/assistant alternation. Folding tool items in as assistant lines
    // (and token-windowing) can otherwise start on assistant or repeat a role → 400. So: drop any
    // leading non-user entries, then merge consecutive same-role entries into one.
    const out: { role: 'user' | 'assistant'; text: string }[] = [];
    for (const m of picked) {
      if (!out.length && m.role !== 'user') continue; // must begin on a user turn
      const prev = out[out.length - 1];
      if (prev && prev.role === m.role) prev.text = `${prev.text}\n${m.text}`;
      else out.push({ role: m.role, text: m.text });
    }
    // Callers append the CURRENT turn as a user message, so history must end on an assistant turn
    // (or be empty) to preserve strict alternation — drop a dangling trailing user (a prior turn
    // that produced no assistant reply).
    while (out.length && out[out.length - 1].role === 'user') out.pop();
    return out;
  }

  /** The user's skill registry (`skills/registry.json`, written by SkillHost) — [] when there is
   *  none yet or it can't be parsed. Shared by the system-prompt injection and the "/" commands. */
  private async readSkillRegistry(): Promise<SkillRegistryEntry[]> {
    try {
      const raw = await readFile(join(this.baseDir, 'skills', 'registry.json'), 'utf8').catch(() => '');
      if (!raw) return [];
      const reg = JSON.parse(raw);
      return Array.isArray(reg) ? (reg.filter((e) => e && e.id) as SkillRegistryEntry[]) : [];
    } catch {
      return [];
    }
  }

  /** One skill's SKILL.md markdown WITHOUT its YAML frontmatter — '' when it can't be read. */
  private async readSkillBody(id: string): Promise<string> {
    try {
      const md = await readFile(join(this.baseDir, 'skills', 'lib', id, 'SKILL.md'), 'utf8');
      return md.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '').trim();
    } catch {
      return '';
    }
  }

  /**
   * Expand any `/command` the user typed into the skill it names: that skill's FULL instructions
   * are prepended to the prompt, so the invoked skill reaches EVERY path — hosted MAIC, the claude
   * CLI, the grok/gemini/codex orchestrator and direct API alike (none of them read the skills
   * folder, and MAIC never even sees the system prompt). A typed command is EXPLICIT intent, so it
   * applies even when the skill is disabled and whatever its runner scope. Returns the prompt
   * unchanged (and no ids) when nothing matched; `applied` lets the caller keep the same skill out
   * of the system-prompt block so its body isn't sent twice in one turn.
   */
  private async expandSkillCommands(prompt: string): Promise<{ prompt: string; applied: string[] }> {
    try {
      const byCommand = new Map<string, SkillRegistryEntry>();
      for (const e of await this.readSkillRegistry()) if (e.command) byCommand.set(e.command.toLowerCase(), e);
      if (!byCommand.size) return { prompt, applied: [] };
      const { commands } = parseSkillCommands(prompt, byCommand.keys());
      if (!commands.length) return { prompt, applied: [] };
      const blocks: string[] = [];
      const applied: string[] = [];
      const usedCommands: string[] = [];
      let total = 0;
      for (const cmd of commands.slice(0, SKILL_COMMAND_MAX_PER_TURN)) {
        const e = byCommand.get(cmd);
        if (!e) continue;
        const body = await this.readSkillBody(e.id);
        if (!body) continue;
        const block =
          `[LỆNH SKILL: /${cmd} — "${e.name}"]\n` +
          'Áp dụng skill sau cho yêu cầu này (bắt buộc):\n' +
          `${body}\n---`;
        // Always keep the FIRST block: a typed command must never end up a silent no-op, even if
        // that one skill is bigger than the whole budget.
        if (blocks.length && total + block.length > SKILL_COMMAND_BUDGET) break;
        blocks.push(block);
        applied.push(e.id);
        usedCommands.push(cmd);
        total += block.length;
      }
      if (!blocks.length) return { prompt, applied: [] };
      // Strip ONLY the commands we actually applied — one dropped by the cap or the budget stays
      // in the message instead of vanishing. Nothing left = the command WAS the request.
      const rest = stripSkillCommands(prompt, usedCommands) || `Thực hiện skill "${byCommand.get(usedCommands[0])?.name ?? ''}".`;
      return { prompt: `${blocks.join('\n\n')}\n\n${rest}`, applied };
    } catch {
      return { prompt, applied: [] }; // a broken registry must never break the turn
    }
  }

  /**
   * Build the "Skills" block appended to the chat system prompt: the FULL instructions of every
   * ENABLED skill scoped to the runner THIS turn actually uses. The CLI only surfaces skill NAMES
   * in `-p` mode (not their bodies), so without this the model can't actually follow a skill the
   * user invokes by name (e.g. "chạy PBTTCN").
   *
   * PER-BASE scoping (opt-in via TAGS): if a skill is tagged with the EXACT name of a registered
   * Base, it's only injected when that Base is active in the conversation — so a user can target a
   * skill to one Base by tagging it with that Base's name. Skills with no base-name tag apply everywhere.
   */
  private async collectSkillsPrompt(
    activeBases?: LarkBaseRef[],
    runner?: string,
    skipIds?: readonly string[],
  ): Promise<string> {
    try {
      const reg = await this.readSkillRegistry();
      if (!reg.length) return '';
      // Scope is per RUNNER: a grok-only / gemini-only skill was previously never injected because
      // this filter was hard-wired to 'claude'. Default to claude when the caller has no runner yet.
      const target = runner || 'claude';
      const baseNames = new Set(
        (this.store.getBases() || []).map((b) => (b.name || '').trim().toLowerCase()).filter(Boolean),
      );
      const activeNames = new Set(
        (activeBases || []).map((b) => (b.name || '').trim().toLowerCase()).filter(Boolean),
      );
      const blocks: string[] = [];
      let total = 0;
      for (const e of reg) {
        if (!e.enabled || !Array.isArray(e.scope) || !e.scope.includes(target)) continue;
        if (skipIds?.includes(e.id)) continue; // already inlined by its "/" command — don't send it twice
        const tags: string[] = Array.isArray(e.tags) ? e.tags.map((t: unknown) => String(t).trim().toLowerCase()) : [];
        const baseTags = tags.filter((t) => baseNames.has(t));
        if (baseTags.length && !baseTags.some((t) => activeNames.has(t))) continue; // scoped to a non-active Base
        const body = await this.readSkillBody(e.id);
        if (!body) continue;
        const block = `### ${e.name}\n${body}`;
        if (total + block.length > 40000) break; // keep the prompt from bloating
        blocks.push(block);
        total += block.length;
      }
      if (!blocks.length) return '';
      return (
        '\n\n=== KỸ NĂNG (SKILLS) DO NGƯỜI DÙNG ĐỊNH NGHĨA ===\n' +
        'Dưới đây là các quy trình người dùng đã lưu. Khi người dùng yêu cầu chạy/áp dụng một kỹ năng theo TÊN ' +
        '(vd "chạy PBTTCN"), hãy LÀM THEO ĐÚNG các bước của kỹ năng tương ứng bằng các tool Lark. Nếu một bước cần ' +
        'GHI dữ liệu mà đang ở chế độ HỎI ĐÁP (chỉ đọc), hãy nhắc người dùng bật "Thực thi".\n\n' +
        blocks.join('\n\n')
      );
    } catch {
      return '';
    }
  }

  async *chat(input: LarkChatInput): AsyncGenerator<LarkChatEvent> {
    // GENERAL "Agents chat" reuses this whole engine but needs NO Lark connection.
    const general = input.scope === 'general';
    // Slash-commands are expanded ONCE, here — BEFORE the hosted/local split — so an invoked skill
    // covers every downstream path, including hosted MAIC (which returns early below and would
    // otherwise send the raw `/sieu-ba …` text to the server). Never mutate `input`: the caller
    // (a renderer tab, or the phone relay) owns that object.
    const { prompt: basePrompt, applied: commandSkillIds } = await this.expandSkillCommands(input.prompt);
    const client = this.ensureClient();
    if (!client && !general) {
      yield { type: 'error', message: 'Chưa kết nối Lark. Hãy nhập App ID + App Secret ở panel kết nối.' };
      yield { type: 'done' };
      return;
    }
    // Khoá theo TỪNG HỘI THOẠI (xem agentLock): nhiều hội thoại chạy song song được, chỉ bị từ
    // chối khi chính hội thoại này đang chạy — chống bấm Gửi hai lần — hoặc khi đã chạm trần số
    // lượt song song. Lấy TRƯỚC clearPending() để lượt bị từ chối không kịp dọn xác nhận của lượt
    // đang chạy. Nhả trong finally.
    const remote = input.source === 'relay';
    const lockSessionId = input.sessionId ?? this.activeSessionId ?? undefined;
    const lease = tryAcquire(
      {
        kind: remote ? 'relay' : 'lark',
        sessionId: lockSessionId,
        label: remote ? 'Lark × Agents · từ xa' : 'Lark × Agents',
        startedAt: Date.now(),
      },
      // Chỉ giết ĐÚNG hội thoại của lease này. Bản cũ gọi cancelChat() không tham số nên một lượt
      // bị đồng hồ canh dọn sẽ kéo theo mọi lượt khác đang chạy.
      () => this.cancelChat(lockSessionId),
    );
    if (!lease) {
      const busySelf = lockSessionId ? isBusy(`${remote ? 'relay' : 'lark'}:${lockSessionId}`) : false;
      const o = currentOwner();
      yield {
        type: 'error',
        message: busySelf
          ? 'Hội thoại này đang chờ AI trả lời — chờ xong rồi gửi tiếp.'
          : o?.kind === 'relay'
            ? 'Đang chạy một lượt từ điện thoại — chờ xong rồi gửi tiếp.'
            : `Đang chạy tối đa ${maxConcurrent()} hội thoại cùng lúc — chờ một cuộc xong rồi gửi tiếp.`,
      };
      yield { type: 'done' };
      return;
    }
    try {
      this.clearPending(); // drop any stale confirmations from a previous turn
      // Phase 1b — HOSTED general chat: run "Trợ lý AI" on Larkwave's server (MAIC) instead of the
      // local CLI when there's no usable local Claude (or the user forced hosted). Lets the desktop
      // work with NO local Claude install. Claude users are unaffected (auto = local when available).
      if (general && this.accountTokenGetter?.()) {
        const hm = this.store.getSettings().hostedMode;
        const wantHosted =
          hm === true || (hm !== false && !(await claudeAvailable().catch(() => false)));
        if (wantHosted && (await this.maicHostedAvailable())) {
          // Trim from the FRONT (the skill block) so the user's own question always survives.
          const hostedPrompt =
            basePrompt.length > MAIC_PROMPT_MAX ? basePrompt.slice(basePrompt.length - MAIC_PROMPT_MAX) : basePrompt;
          yield* this.runHostedChat({ ...input, prompt: hostedPrompt });
          return;
        }
      }
      // RC2 — bind this turn to the DISPLAYED conversation. A relay turn (web/phone) or a second
      // desktop tab may target a conversation other than the desktop's current activeSessionId;
      // without pinning, the turn would run on (and --resume) the WRONG session and its exchange
      // would be saved into a session whose CLI context never saw it. No-op when it already matches
      // (the desktop-native single-tab case). General chat pins via its own sessionId path below.
      // Hội thoại của CHÍNH lượt này. Từ đây trở đi tuyệt đối không đọc `this.activeSessionId`
      // nữa: đó là "tab người dùng đang xem", không phải "hội thoại lượt này thuộc về" — hai thứ
      // khác nhau ngay khi có hai lượt chạy song song.
      const convId = general ? input.sessionId || null : input.sessionId ?? this.activeSessionId;
      const ts = convId
        ? await this.loadTurnState(convId)
        : { agentSessionId: null, started: false, runner: 'claude', model: undefined as string | undefined };
      if (!ts.agentSessionId) {
        ts.agentSessionId = randomUUID();
        ts.started = false;
      }
    const runner = input.runner || ts.runner || this.store.getSettings().defaultRunner || 'claude';
    const model = input.model ?? ts.model ?? this.store.getSettings().defaultModel;
    ts.runner = runner;
    ts.model = model;
    // Vẫn cập nhật field dùng chung cho GIAO DIỆN (danh sách phiên, nhãn runner đang chọn) —
    // nhưng chỉ khi lượt này đúng là tab đang xem, để không đổi nhãn dưới chân người dùng.
    if (convId && convId === this.activeSessionId) {
      this.activeRunner = runner;
      this.activeModel = model;
    }

    // General chat keeps its OWN caller-supplied session id (kept out of Lark's session state)
    // and never touches the Lark transcript/carryover.
    const stored = !general && convId ? await this.readSession(convId) : null;
    // RC1 — build the recent transcript for EVERY runner (not just non-claude). Non-claude/API use
    // it as their only cross-turn memory; claude uses it to RE-SEED context when `--resume` can't
    // find the CLI session locally (cross-device restore / reinstall / prune). claude's normal
    // --resume path ignores it, so the happy path is unchanged.
    let transcript = !general ? this.buildTranscript(stored?.items ?? []) : undefined;
    let runnerSwitchNote: string | undefined;
    if (!general && input.runnerSwitched && stored?.items?.length) {
      runnerSwitchNote = this.buildTranscript(stored.items);
      // Switching runner starts a FRESH agent session (the previous runner's native/--resume
      // context does not transfer). Rotate for claude too — otherwise claude would --resume the
      // OLD id and the switch note would be built but never used → the switch loses all context.
      ts.agentSessionId = randomUUID();
      ts.started = false;
    }

    const session = general
      ? { id: input.sessionId || randomUUID(), resume: !!input.resume }
      : { id: ts.agentSessionId!, resume: ts.started };
    if (!general) ts.started = true;
    // If this session was just handed off from a full one, prepend the carried-over summary
    // to the first prompt so the fresh Claude session inherits the prior context (consume once).
    let turnPrompt = basePrompt;
    if (!general && this.carryover && convId && this.carryover.sessionId === convId) {
      turnPrompt = `[Bối cảnh từ phiên trước — tiếp tục công việc này]\n${this.carryover.summary}\n\n[Yêu cầu mới của người dùng]\n${basePrompt}`;
      this.carryover = null;
      // The summary is now IN turnPrompt (a fresh handoff session holds only that summary bubble),
      // so do NOT also seed it via the transcript/switch-note — that would send it to Claude twice.
      transcript = undefined;
      runnerSwitchNote = undefined;
    }
    // Inject the user's ENABLED skills scoped to THIS turn's runner (their full instructions) into
    // the prompt. The CLI only knows skill NAMES in `-p` mode — not their bodies — so "chạy PBTTCN"
    // wouldn't do anything; this makes the model actually FOLLOW the skill when asked by name.
    const skillsBlock = await this.collectSkillsPrompt(input.activeBases, runner, commandSkillIds);
    // Cho agent biết bản cài đang chạy có cũ không. Chỉ thêm ở lượt TRÒ CHUYỆN (có người đang đọc);
    // lượt tóm tắt nội bộ và tác vụ định kỳ thì không cần và chỉ làm bẩn kết quả.
    const versionLine = versionPromptLine();
    const systemPrompt =
      (general
        ? buildGeneralSystemPrompt({ versionLine })
        : buildSystemPrompt({
            versionLine,
            tenantName: this.tenantName,
            bases: this.store.getBases(),
            mode: input.mode,
            activeBases: input.activeBases,
            userLoggedIn: this.userLoggedIn(),
            userBitableScopeMissing: this.userBitableScopeMissing(),
          })) + skillsBlock;
    // When auto-approve is on, writes run without the per-tool confirm prompt.
    const autoApprove = this.store.getSettings().autoApprove ?? false;

    // Pin EVERY turn of this conversation to one working directory so `claude --resume` always
    // looks in the bucket the previous turns wrote to (see workDirPath). Best-effort: if the dir
    // can't be created we fall back to the old per-turn behaviour rather than failing the turn.
    const conversationId = general ? input.sessionId || session.id : convId || ts.agentSessionId!;
    const workDir = await this.chatWorkDir(conversationId).catch(() => undefined);
    // Cho tool đọc-tệp-đính-kèm biết ghi vào đâu. Cùng thư mục với workspace của lượt chat này,
    // nên tệp Claude tải về nằm ngay cạnh thứ nó đang làm — và bị dọn cùng phiên như mọi thứ khác.
    setAttachmentDir(workDir ?? null);
    // Tệp agent DỰNG RA nằm cùng chỗ với tệp nó tải về: cùng một thư mục hội thoại, nên
    // `--resume` của lượt sau vẫn thấy, và cùng bị dọn theo phiên như mọi thứ khác.
    setFileOutDir(workDir ?? null);

    // Materialise any attached files/images into the dir the agent runs in. It MUST be the
    // conversation dir, not a temp one: a temp dir would put this turn in a different Claude
    // session bucket than the rest of the chat and split the conversation's memory in two.
    let attachDir: string | undefined;
    const attachNames: string[] = [];
    if (input.attachments?.length) {
      attachDir = workDir ?? join(tmpdir(), `tw-lark-attach-${randomUUID()}`);
      await mkdir(attachDir, { recursive: true });
      for (const a of input.attachments.slice(0, 12)) {
        const safe = (a.name || 'file').replace(/[^\w.\- ]+/g, '_').slice(0, 80) || 'file';
        try {
          const buf = Buffer.from(a.dataBase64, 'base64');
          await writeFile(join(attachDir, safe), buf);
          attachNames.push(safe);

          // Tệp Office là NHỊ PHÂN — `Read` mở ra chỉ thấy rác, và model (đã từng thấy trong thực
          // tế) quay sang đoán `lark_read_attachment`, vốn dành cho tệp nằm trong Bitable/Drive
          // chứ không phải tệp cục bộ → HTTP 404 rồi kết luận "không đọc được file Excel".
          // Trích sẵn phần chữ ra một tệp .txt bên cạnh để `Read` dùng được ngay. Bộ đọc đã có
          // sẵn trong dự án (ooxml.ts), trước giờ chỉ chưa nối vào đường đính kèm này.
          const kind = officeKindFor(safe, a.mime || '');
          if (kind) {
            const text = extractOfficeText(buf, kind);
            if (text.trim()) {
              const txt = `${safe}.txt`;
              await writeFile(join(attachDir, txt), text.slice(0, 400_000), 'utf8');
              attachNames.push(txt);
            }
          }
        } catch {
          /* skip a bad attachment */
        }
      }
    }

    // DIRECT-API path (no local CLI) when the user turned it on AND a key exists for
    // the chosen provider — otherwise fall through to the CLI/MCP path.
    const apiMode = this.store.getSettings().apiMode ?? false;
    const apiKey = apiMode ? this.resolveApiKey(runner) : null;
    // Ran the DIRECT API (vs the local CLI). Skip the API if its key was already seen out of
    // credit this session → go straight to the CLI/subscription (no dead-key retry every turn).
    const onApi = !!(apiMode && apiKey && !general && !this.apiCreditOut.has(runner));
    // NGUỒN CHẠY THỨ BA: gói Larkwave (MAIC). Không cần CLI cài trên máy, không cần khoá API
    // riêng — máy chủ giữ khoá MAIC, chặn theo gói của người dùng và ghi sổ token; công cụ Lark
    // vẫn chạy TRÊN MÁY NÀY nên App Secret không rời máy. Xem larkMaicAgent.ts.
    const onMaic = !!(this.store.getSettings().larkRunSource === 'maic' && !general && this.accountTokenGetter?.());
    // The CLI spawn injects a stored API key (if any) into claude's env — so a credit error may be
    // THAT key being drained while the user's own `claude` subscription is fine. When set, recover
    // by retrying on the subscription (key stripped).
    const keyInjected = hasInjectedCredential();

    /**
     * Đọc cờ tự-động-duyệt LÚC HỎI, không phải lúc bắt đầu lượt.
     *
     * Trước đây `autoApprove` được đọc một lần rồi đóng băng vào closure này. Người dùng thấy một
     * thao tác ghi đang chờ duyệt, bật "Tự động duyệt" lên — và KHÔNG có gì xảy ra: lượt đang chạy
     * vẫn hỏi tiếp, rồi hết 10 phút là bị từ chối. Đúng lúc người ta vừa làm đúng thứ cần làm thì
     * nó không ăn thua, mà cũng chẳng có gì nói cho họ biết vì sao.
     *
     * Cờ này ở trong settings nên đọc lại mỗi lần gần như không tốn gì.
     */
    const confirm = (callId: string, name: string, input: unknown) => {
      if (this.store.getSettings().autoApprove) return Promise.resolve(true);
      return new Promise<boolean>((resolve) => this.pending.set(callId, { convId, resolve, name, input }));
    };

    // Khai báo NGOÀI `try` để khối `finally` bên dưới còn thấy: nó phải gỡ đăng ký đúng lượt này.
    const abort = new AbortController();
    const runKey = conversationId;
    try {
      let inner: AsyncGenerator<LarkChatEvent>;
      if (onMaic) {
        inner = runLarkMaicAgent(turnPrompt, input.mode, {
          client: client!,
          systemPrompt,
          accountToken: this.accountTokenGetter!()!,
          ...(model ? { model } : {}),
          sessionId: conversationId,
          extraTools: this.plugins.collectTools(),
          autoApprove,
          // Lượt trò chuyện của chính người ngồi trước máy — chỉ ở đây mới nhắc cài lại bản mới.
          allowVersionHint: true,
          awaitConfirm: confirm,
          signal: abort.signal,
        });
      } else if (onApi) {
        const history = this.buildApiHistory(stored?.items ?? []);
        inner = runLarkApiAgent(turnPrompt, input.mode, {
          client: client!,
          systemPrompt,
          runner,
          model,
          apiKey,
          history,
          extraTools: this.plugins.collectTools(),
          autoApprove,
          // Lượt TRÒ CHUYỆN của chính người ngồi trước máy — chỉ ở đây mới nhắc cài lại bản mới.
          allowVersionHint: true,
          awaitConfirm: confirm,
          signal: abort.signal,
        });
      } else {
        inner = runLarkAgent(turnPrompt, input.mode, {
          client: client ?? undefined,
          systemPrompt,
          runner,
          model,
          transcript,
          runnerSwitchNote,
          session,
          extraTools: this.plugins.collectTools(),
          autoApprove,
          allowVersionHint: true, // xem nhánh trên
          allowFileTools: true, // lượt của chính chủ máy — xem LarkAgentDeps.allowFileTools
          attachDir,
          attachNames,
          generalMode: general,
          cwd: workDir ?? (general ? attachDir : undefined),
          awaitConfirm: confirm,
          awaitAsk: (callId, question, choices) =>
            new Promise<string>((resolve) => {
              this.pendingAsk.set(callId, { convId, resolve, question, choices });
            }),
          signal: abort.signal,
        });
      }
      // Store the generator so cancelChat()/the shared lock can stop it: abort() kills
      // the child synchronously, then `.return()` runs its finally to clean up the bridge.
      this.runs.set(runKey, { gen: inner, abort });
      /**
       * Ảnh chụp thư mục TRƯỚC lượt chạy, để cuối lượt biết tệp nào là MỚI.
       *
       * Ở màn "Trợ lý AI" chung, agent KHÔNG có `create_file` (chỗ đó cố ý không bắc cầu MCP) —
       * nó dùng `Write`/`Bash` sẵn có của CLI. Nghĩa là tệp vẫn được tạo ra, chỉ là chẳng ai nói
       * cho giao diện biết, nên người dùng nhận một câu "đã lưu file ở ..." kèm một đường dẫn
       * trong thư mục tạm mà họ không có cách nào mở.
       *
       * So SÁNH TRƯỚC–SAU thay vì bắt tool: cách này bắt được mọi tệp CLI tạo bằng bất kỳ đường
       * nào (Write, Bash, một script nó tự viết), và không phải đụng vào ranh giới kiến trúc của
       * chế độ chat chung.
       *
       * Tệp đính kèm người dùng gửi lên đã nằm sẵn trong thư mục trước khi chụp, nên không bị
       * nhận nhầm thành sản phẩm của lượt này.
       */
      const filesBefore = general && workDir ? await snapshotDir(workDir) : new Map<string, number>();
      let creditErr = '';
      for await (const ev of inner) {
        // Hold a credit-exhaustion error and auto-recover on the OTHER runner (below) BEFORE
        // surfacing it. BIDIRECTIONAL: local CLI out of API-credit → try the direct API; the
        // direct-API KEY out of credit → fall back to the local Claude CLI (subscription). The
        // common real case: the app is set to API mode with a drained key while `claude` is
        // logged in and full — this makes the turn just work instead of erroring every time.
        if (
          ev.type === 'error' &&
          (!general || keyInjected) && // general chat is CLI-only → only recoverable via subscription
          /hết credit api|credit balance is too low|insufficient.*credit|payment required|invalid.*api key|authentication/i.test(ev.message)
        ) {
          creditErr = ev.message;
          continue;
        }
        yield ev;
      }
      /**
       * CHỈ ở chế độ chat chung. Lượt Lark có `create_file`, và tool đó đã tự phát thẻ ngay lúc
       * dựng xong — quét thêm ở đây thì đúng một tệp hiện HAI thẻ, người dùng không biết bản nào
       * là bản nào. Chế độ chung không có tool ấy nên quét là đường duy nhất.
       */
      if (general && workDir) {
        for (const f of await newFilesSince(workDir, filesBefore)) {
          yield { type: 'file', name: f.name, path: f.path, mime: f.mime, bytes: f.bytes };
        }
      }
      if (creditErr) {
        if (keyInjected) {
          // Most common real cause: a stored/active API key was injected into claude's env and is
          // out of credit (or invalid), hijacking a working subscription. Re-run THIS turn on the
          // user's OWN claude login (key stripped) — works for both general + Lark chats.
          yield { type: 'text', delta: '\n\n_(API key trong app hết credit/không hợp lệ — chuyển sang đăng nhập Claude CLI của bạn, giữ nguyên hội thoại…)_\n\n' };
          const fb = runLarkAgent(turnPrompt, input.mode, {
            client: client ?? undefined,
            systemPrompt,
            runner,
            model,
            transcript,
            runnerSwitchNote,
            session,
            extraTools: this.plugins.collectTools(),
            autoApprove,
            attachDir,
            attachNames,
            generalMode: general,
            readOnly: false,
            cwd: workDir ?? (general ? attachDir : undefined),
            preferSubscription: true, // ← ignore the injected key; use the subscription
            awaitConfirm: confirm,
            awaitAsk: (callId, question, choices) =>
              new Promise<string>((resolve) => {
                this.pendingAsk.set(callId, { convId, resolve, question, choices });
              }),
            signal: abort.signal,
          });
          this.runs.set(runKey, { gen: fb, abort });
          for await (const ev of fb) yield ev;
        } else if (onApi) {
          // API key ran out of credit → re-run THIS turn on the local Claude CLI (subscription),
          // history preserved. If the CLI is also out (e.g. it's on a drained key too), its own
          // error surfaces — never worse than before.
          this.apiCreditOut.add(runner); // don't hammer the dead key on the next turns
          yield { type: 'text', delta: '\n\n_(API hết credit — tự chuyển sang Claude CLI/subscription, giữ nguyên hội thoại…)_\n\n' };
          const fb = runLarkAgent(turnPrompt, input.mode, {
            client: client ?? undefined,
            systemPrompt,
            runner,
            model,
            transcript,
            runnerSwitchNote,
            session,
            extraTools: this.plugins.collectTools(),
            autoApprove,
            attachDir,
            attachNames,
            generalMode: general,
            cwd: workDir ?? (general ? attachDir : undefined),
            awaitConfirm: confirm,
            awaitAsk: (callId, question, choices) =>
              new Promise<string>((resolve) => {
                this.pendingAsk.set(callId, { convId, resolve, question, choices });
              }),
            signal: abort.signal,
          });
          this.runs.set(runKey, { gen: fb, abort });
          for await (const ev of fb) yield ev;
        } else {
          // Local CLI ran out of API credit → re-run THIS turn via the direct API if a key exists.
          const fbKey = this.resolveApiKey(runner);
          if (fbKey) {
            yield { type: 'text', delta: '\n\n_(Hết credit ở CLI — tự chuyển sang API trực tiếp, giữ nguyên hội thoại…)_\n\n' };
            const history = this.buildApiHistory(stored?.items ?? []);
            const fb = runLarkApiAgent(turnPrompt, input.mode, {
              client: client!,
              systemPrompt,
              runner,
              model,
              apiKey: fbKey,
              history,
              extraTools: this.plugins.collectTools(),
              autoApprove,
              awaitConfirm: confirm,
              signal: abort.signal,
            });
            this.runs.set(runKey, { gen: fb, abort });
            for await (const ev of fb) yield ev;
          } else {
            // No alternate key configured → surface the original clear, actionable error.
            yield { type: 'error', message: creditErr };
          }
        }
      }
      } finally {
        // Chỉ gỡ khi ô đó VẪN là của lượt mình: một lượt kết thúc muộn không được xoá đăng ký
        // của lượt mới vừa bắt đầu trên cùng hội thoại (cùng kiểu kiểm danh tính như `release`).
        if (this.runs.get(runKey)?.abort === abort) this.runs.delete(runKey);
        this.clearPending(runKey);
        if (attachDir) await rm(attachDir, { recursive: true, force: true }).catch(() => undefined);
      }
    } finally {
      // Outer finally: releasing here (not in the streaming finally) also covers a throw
      // in the pre-stream setup (session read, prompt build) — the lock must never leak.
      release(lease);
    }
  }

  /**
   * Những lời hỏi ĐANG CHỜ của một hội thoại — để giao diện dựng lại sau khi người dùng rời đi rồi
   * quay vào.
   *
   * Vì sao cần: `pending`/`pendingAsk` sống ở tiến trình chính và vẫn chờ đúng như cũ, nhưng cái
   * HỘP hỏi thì nằm trong state của renderer — rời hội thoại là state chết. Quay vào thì thao tác
   * vẫn treo ở "cần xác nhận" mà không còn chỗ nào bấm, và 10 phút sau tiến trình chính tự từ chối.
   * Người dùng không làm gì sai, cũng không có cách nào cứu.
   */
  pendingPrompts(convId: string): {
    confirms: { callId: string; name: string; input: unknown }[];
    asks: { callId: string; question: string; choices?: string[] }[];
  } {
    const confirms: { callId: string; name: string; input: unknown }[] = [];
    for (const [callId, e] of this.pending) {
      if (e.convId !== convId) continue;
      confirms.push({ callId, name: e.name ?? '(không rõ)', input: e.input ?? {} });
    }
    const asks: { callId: string; question: string; choices?: string[] }[] = [];
    for (const [callId, e] of this.pendingAsk) {
      if (e.convId !== convId) continue;
      asks.push({ callId, question: e.question ?? '', ...(e.choices ? { choices: e.choices } : {}) });
    }
    return { confirms, asks };
  }

  confirmTool(callId: string, decision: 'allow' | 'deny'): void {
    const e = this.pending.get(callId);
    if (e) {
      this.pending.delete(callId);
      e.resolve(decision === 'allow');
    }
  }

  /** Deliver the user's answer to a pending `ask_user` → resumes the paused agent loop. */
  answerAsk(callId: string, answer: string): void {
    const e = this.pendingAsk.get(callId);
    if (e) {
      this.pendingAsk.delete(callId);
      e.resolve(answer);
    }
  }

  /**
   * Dọn các xác nhận đang treo. Truyền hội thoại = CHỈ dọn của hội thoại đó; không truyền = dọn
   * tất cả (ngắt kết nối / đổi tài khoản / thoát app).
   *
   * Đây là chỗ hỏng nặng nhất khi chạy song song: bản cũ luôn dọn sạch, nên lượt vừa bắt đầu sẽ
   * TỪ CHỐI mọi xác nhận ghi đang treo của lượt kia, và lượt kết thúc sẽ trả lời rác cho câu hỏi
   * `ask_user` mà lượt kia đang chờ — agent đi tiếp với thông tin sai chứ không chỉ dừng lại.
   */
  private clearPending(convId?: string): void {
    for (const [callId, e] of [...this.pending]) {
      if (convId && e.convId !== convId) continue;
      this.pending.delete(callId);
      e.resolve(false);
    }
    // Unblock any unanswered ask_user calls so their promises (and the CLI) don't hang.
    for (const [callId, e] of [...this.pendingAsk]) {
      if (convId && e.convId !== convId) continue;
      this.pendingAsk.delete(callId);
      e.resolve('[người dùng đã đóng/huỷ — không có câu trả lời]');
    }
  }
}

/** Lark Base/Bitable share URLs look like `…/base/<app_token>?table=…`. */
/**
 * Parse a Lark URL into either a Base `appToken` (direct `/base|/bitable/<token>`)
 * or a `wikiNode` token (`/wiki/<node>` — a Base embedded in a Wiki, which must be
 * resolved to its app_token via the Wiki API).
 */
function parseBaseUrl(url: string): { appToken?: string; wikiNode?: string } {
  const base = url.match(/\/(?:base|bitable)\/([A-Za-z0-9]{10,})/);
  if (base) return { appToken: base[1] };
  const wiki = url.match(/\/wiki\/([A-Za-z0-9]{10,})/);
  if (wiki) return { wikiNode: wiki[1] };
  return {};
}

/**
 * Turn a Lark error into actionable Vietnamese for the UI. Maps the credential/auth/rate
 * codes precisely, falls back to keyword detection for permission/not-found (the message is
 * usually English), and always quotes the `log_id` for support. A transport failure becomes
 * a network message instead of a confusing raw status.
 */
function humanize(e: unknown): string {
  if (e instanceof LarkNetworkError) {
    return 'Không kết nối được tới Lark. Kiểm tra mạng (hoặc proxy/tường lửa) rồi thử lại.';
  }
  if (e instanceof LarkApiError) {
    const ref = e.logId ? ` (mã hỗ trợ: ${e.logId})` : '';
    const code = e.code;
    if (code === 10003 || code === 99991000 || code === 99991001) return 'App ID hoặc App Secret không đúng.';
    if (code === 99991663 || code === 99991661 || code === 99991668)
      return 'Phiên/đăng nhập Lark đã hết hạn. Hãy kết nối lại app hoặc đăng nhập lại tài khoản.' + ref;
    if (code === 99991400) return 'Lark đang giới hạn tần suất gọi. Chờ một lát rồi thử lại.' + ref;
    const msg = (e.larkMsg || e.message || '').toLowerCase();
    // Bitable advanced-permission (roles) not enabled on the Base. The codes are best-effort
    // (Lark's roles 1254xxx series); the message check is kept NARROW to avoid mislabelling
    // unrelated permission errors — the generic branch below still covers those.
    if (code === 1254045 || code === 1254302 || /advanced permission|高级权限/.test(msg))
      return (
        `Base này chưa BẬT "Phân quyền nâng cao" hoặc app chưa đủ quyền để đọc/sửa phân quyền. Trong Lark Base: "..." → Quản lý phân quyền → bật Phân quyền nâng cao; và cấp scope bitable:app cho app trên Developer Console. Mã lỗi ${code}.` +
        ref
      );
    if (/permission|access denied|forbidden|no permission|unauthorized|scope/.test(msg))
      return (
        `Thiếu quyền truy cập. Hãy cấp đủ scope cho app trên Lark Developer Console (vd bitable:app cho phân quyền Base), và thêm app/tài khoản vào tài nguyên (Base/Doc/Sheet) này. Mã lỗi ${code}.` +
        ref
      );
    if (/not found|not exist|does not exist|invalid.*token|invalid_param|notexist/.test(msg))
      return `Không tìm thấy tài nguyên (Base/bảng/bản ghi) — kiểm tra lại app_token/ID. Mã lỗi ${code}.` + ref;
    return `Lark báo lỗi ${code}: ${e.larkMsg || e.message}` + ref;
  }
  return (e as Error)?.message || 'Kết nối Lark thất bại.';
}
