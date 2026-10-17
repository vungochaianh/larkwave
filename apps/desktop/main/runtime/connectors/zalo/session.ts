/**
 * Zalo session lifecycle: QR login, credential storage, restore-on-start,
 * logout, reconnect.
 *
 * Nothing here imports Electron or zca-js at module scope. Everything the
 * outside world supplies arrives through ZaloSessionManagerOptions, so the QR
 * state machine and the credential store are testable with a fake client, and
 * the file loads fine under plain `node --test`.
 *
 * Ported from socado-desktop/main/zalo/ZaloManager.ts, with four fixes:
 *
 *  1. Credentials were plaintext JSON on disk (ZaloManager.ts:52) — a
 *     ready-to-use session-hijack payload. They are now encrypted with Electron
 *     safeStorage, and the plaintext fallback is loud in the log.
 *  2. zca-js's loginQR() promise never settles on expiry/decline unless the
 *     caller invokes the event's own retry()/abort() (zca-js loginQR.js:290).
 *     The old UI just called loginQR() again, leaking the first attempt and
 *     leaving two QR flows racing. One run is kept here and its retry() reused.
 *  3. loginQR() already resolves to a logged-in API; the old code threw that
 *     away and logged in a second time with the GotLoginInfo credentials.
 *  4. A dropped websocket left the account silently offline forever. It now
 *     reconnects with exponential backoff, and stops asking (requesting a fresh
 *     QR instead) once Zalo says the credentials are dead.
 *
 * The Map<userId, Session> of the source is kept and made real: every account
 * has its own api, its own credential file and its own reconnect budget.
 *
 * LARKWAVE (17/10/2026): chép từ Social Wave `main/channels/zalo/session.ts` (đã chạy thật ở bản 0.5.0).
 * Chỉ thêm, không đổi máy trạng thái QR / kho khoá / nối lại: (1) kiểu ngữ cảnh định nghĩa tại chỗ thay
 * cho core/types của Social Wave; (2) phần nối zca-js có thêm ĐỌC tin (listener `message`/`old_messages`,
 * selfListen bật để thấy cả tin mình gửi, xin tin cũ khi vừa kết nối), danh sách/lịch sử NHÓM và gửi vào
 * nhóm — chuyển tin lên qua `onMessages` của bộ quản lý. Agent không chạm tới tệp này: mọi việc đi qua
 * connectors/zalo/zaloService.ts và chỉ trong lượt có kỹ năng Zalo (xem connectorGate).
 * (3) 17/10/2026: lịch sử nhóm qua kho tin cloud (endpoint cũ Zalo đã bỏ, trả 404/rỗng), phân trang tin cũ
 * (requestOldMessages), và xuất cookie phiên web cho cửa sổ Zalo Web (zaloWeb.ts) — xem createZcaClient.
 */

import {promises as fs} from 'node:fs';
import path from 'node:path';
/** Ngữ cảnh tối thiểu bộ quản lý cần (bên Social Wave: core/types ChannelContext). */
export interface ChannelContext {
    userDataDir: string;
    log: (level: 'debug' | 'info' | 'warn' | 'error', msg: string, meta?: unknown) => void;
    /** Đẩy sự kiện sống (QR, trạng thái tài khoản) lên giao diện. */
    emit: (event: string, payload: unknown) => void;
}

/** Cùng tập với SendErrorKind của Social Wave. */
export type SendErrorKind = 'invalid-recipient' | 'auth' | 'rate-limited' | 'transient' | 'blocked' | 'unknown';

/** Một tin Zalo đã chuẩn hoá (người hoặc nhóm). Chỉ giữ trong bộ nhớ — xem messages.ts. */
export interface ZaloMessage {
    threadId: string;
    isGroup: boolean;
    msgId: string;
    /** Id phía máy gửi — dùng khớp tin đồng bộ từ điện thoại với tin app đã thấy. */
    cliMsgId?: string;
    /** 'phone' = tin nhập từ đồng bộ điện thoại. Bỏ trống = tin Zalo Web (trực tiếp / lịch sử máy chủ). */
    source?: 'phone';
    fromId: string;
    fromName: string;
    isSelf: boolean;
    text: string;
    ts: number;
}

export interface ZaloGroup {
    groupId: string;
    name: string;
    members: number;
}

// ─── The seam onto zca-js ────────────────────────────────────────────────────
// Only what this transport actually calls. The real library is adapted onto it
// in createZcaClient() below, so nothing else in the file depends on zca-js.

export interface ZaloAccountInfo {
    userId: string;
    name: string;
    avatar: string;
    phone: string;
}

export interface ZaloFriend {
    uid: string;
    name: string;
    phone: string;
}

export interface ZaloFoundUser {
    uid: string;
    name: string;
    avatar: string;
}

export interface ZaloListenHandlers {
    onClosed: (code: number, reason: string) => void;
    onError: (err: unknown) => void;
    /** Larkwave: tin mới và tin cũ (đồng bộ lúc vừa kết nối). */
    onMessages?: (messages: ZaloMessage[]) => void;
}

export interface ZaloApi {
    ownId(): string;
    account(): Promise<ZaloAccountInfo>;
    friends(): Promise<ZaloFriend[]>;
    findUserByPhone(phone: string): Promise<ZaloFoundUser | null>;
    isFriend(uid: string): Promise<boolean>;
    sendText(text: string, threadId: string): Promise<{msgId: string | null}>;
    /** Cheap round-trip used by health(). */
    ping(): Promise<void>;
    listen(handlers: ZaloListenHandlers): void;
    stopListening(): void;
    /** Larkwave: danh sách nhóm đang tham gia. */
    groups?(): Promise<ZaloGroup[]>;
    /** Larkwave: lịch sử gần nhất của một nhóm. */
    groupHistory?(groupId: string, count: number): Promise<ZaloMessage[]>;
    /** Larkwave: gửi chữ vào một hội thoại người HOẶC nhóm. */
    sendTextTo?(text: string, threadId: string, isGroup: boolean): Promise<{msgId: string | null}>;
    /** Larkwave: lịch sử nhóm từ kho tin cloud (getrecentv2) — MỘT trang, mới → cũ; `cursor` = trang tiếp. */
    groupCloudPage?(groupId: string, count: number, cursor?: string): Promise<{messages: ZaloMessage[]; cursor?: string; hasMore: boolean}>;
    /** Larkwave: xin Zalo thêm một trang tin cũ (1-1 hoặc nhóm) qua listener. Trả các tin trang đó. */
    requestOlder?(isGroup: boolean, lastMsgId?: string): Promise<ZaloMessage[]>;
    /** Larkwave: cookie của phiên web hiện tại — để nhét vào cửa sổ Zalo Web (cùng phiên, khỏi quét QR lại). */
    webCookies?(): Promise<ZaloWebCookie[]>;
}

/** Một cookie của phiên Zalo web, dạng đặt được vào Electron session. */
export interface ZaloWebCookie {
    name: string;
    value: string;
    domain?: string;
    path?: string;
    secure?: boolean;
    httpOnly?: boolean;
    /** Giây epoch; bỏ trống = cookie phiên. */
    expirationDate?: number;
}

export interface ZaloCredentials {
    imei: string;
    userAgent: string;
    /** Cookie jar zca-js sinh ra. Ta chỉ lưu và trả lại nguyên vẹn, không đọc. */
    cookie: unknown;
    language?: string;
}

export interface ZaloQrEvent {
    kind: 'qr-generated' | 'qr-expired' | 'qr-scanned' | 'qr-declined' | 'got-login-info';
    /** PNG base64, không kèm tiền tố `data:`. Renderer tự thêm. */
    image?: string;
    displayName?: string;
    avatar?: string;
    credentials?: ZaloCredentials;
    /**
     * zca-js làm mới mã ngay trong phiên đang chạy. Phải dùng hai hàm này —
     * gọi loginQR() lần nữa sẽ bỏ rơi phiên cũ trong trạng thái treo.
     */
    retry?: () => void;
    abort?: () => void;
}

export interface ZaloClient {
    login(creds: ZaloCredentials): Promise<ZaloApi>;
    loginQR(onEvent: (ev: ZaloQrEvent) => void): Promise<ZaloApi>;
}

// ─── QR login state machine ──────────────────────────────────────────────────

export type QrState =
    | 'idle'
    | 'starting'
    | 'awaiting-scan'
    | 'scanned'
    | 'authenticating'
    | 'success'
    | 'expired'
    | 'declined'
    | 'error'
    | 'aborted';

export type QrEventKind = ZaloQrEvent['kind'] | 'start' | 'login-ok' | 'login-failed' | 'abort' | 'retry';

/**
 * Chuyển trạng thái. Sự kiện không hợp lệ giữ nguyên trạng thái thay vì ném lỗi:
 * zca-js có thể bỏ qua bước "đã quét" khi người dùng xác nhận quá nhanh, và một
 * mã QR hết hạn vẫn có thể nhận được sự kiện muộn.
 */
const QR_TRANSITIONS: Record<QrState, Partial<Record<QrEventKind, QrState>>> = {
    idle: {start: 'starting'},
    starting: {
        'qr-generated': 'awaiting-scan',
        'got-login-info': 'authenticating',
        'login-failed': 'error',
        abort: 'aborted',
    },
    'awaiting-scan': {
        'qr-scanned': 'scanned',
        'qr-expired': 'expired',
        'qr-declined': 'declined',
        'got-login-info': 'authenticating',
        'login-failed': 'error',
        abort: 'aborted',
    },
    scanned: {
        'got-login-info': 'authenticating',
        'qr-expired': 'expired',
        'qr-declined': 'declined',
        'login-failed': 'error',
        abort: 'aborted',
    },
    authenticating: {
        'login-ok': 'success',
        'login-failed': 'error',
        abort: 'aborted',
    },
    // Ba trạng thái hỏng đều quay lại được: retry() của zca-js sinh mã mới trong
    // cùng phiên, start là người dùng bấm "Đăng nhập" lần nữa.
    expired: {retry: 'starting', start: 'starting', 'qr-generated': 'awaiting-scan', abort: 'aborted'},
    declined: {retry: 'starting', start: 'starting', 'qr-generated': 'awaiting-scan', abort: 'aborted'},
    error: {retry: 'starting', start: 'starting', abort: 'aborted'},
    aborted: {retry: 'starting', start: 'starting'},
    // Đăng nhập xong vẫn cho mở phiên mới: ứng dụng hỗ trợ nhiều tài khoản Zalo.
    success: {start: 'starting'},
};

export function qrTransition(state: QrState, event: QrEventKind): QrState {
    return QR_TRANSITIONS[state][event] ?? state;
}

/** Trạng thái hỏng nhưng người dùng tự sửa được bằng cách tạo lại mã. */
export function isQrRecoverable(state: QrState): boolean {
    return state === 'expired' || state === 'declined' || state === 'error' || state === 'aborted';
}

export function isQrSettled(state: QrState): boolean {
    return state === 'success' || isQrRecoverable(state);
}

const QR_MESSAGES: Record<QrState, string> = {
    idle: 'Chưa bắt đầu đăng nhập',
    starting: 'Đang tạo mã QR...',
    'awaiting-scan': 'Mở Zalo trên điện thoại rồi quét mã QR này',
    scanned: 'Đã quét mã, đang chờ bạn xác nhận trên điện thoại',
    authenticating: 'Đang đăng nhập vào Zalo...',
    success: 'Đăng nhập Zalo thành công',
    expired: 'Mã QR đã hết hạn, hãy tạo mã mới',
    declined: 'Bạn đã từ chối đăng nhập trên điện thoại',
    error: 'Đăng nhập Zalo thất bại',
    aborted: 'Đã huỷ đăng nhập Zalo',
};

/** Ảnh QR chỉ còn nghĩa khi mã vẫn sống. */
const QR_IMAGE_STATES: QrState[] = ['awaiting-scan', 'scanned', 'authenticating'];

export interface QrLoginSnapshot {
    state: QrState;
    /** PNG base64, không kèm tiền tố `data:`. */
    image?: string;
    scannedName?: string;
    scannedAvatar?: string;
    /** Có khi state === 'success'. */
    accountId?: string;
    /** Câu chữ đã sẵn sàng hiển thị cho người dùng. */
    message: string;
}

// ─── Credential storage ──────────────────────────────────────────────────────

export interface StoredZaloAccount {
    accountId: string;
    label: string;
    avatar: string;
    phone: string;
    credentials: ZaloCredentials;
    savedAt: string;
    /** true khi bản ghi trên đĩa CHƯA được mã hoá (máy không có keychain). */
    plaintext: boolean;
}

export interface ZaloCredentialStore {
    list(): Promise<string[]>;
    load(accountId: string): Promise<StoredZaloAccount | null>;
    save(rec: Omit<StoredZaloAccount, 'savedAt' | 'plaintext'>): Promise<void>;
    remove(accountId: string): Promise<void>;
}

/**
 * Hộp bí mật của hệ điều hành. Trả null nghĩa là máy không mã hoá được — bên
 * gọi sẽ ghi plaintext và ghi log cảnh báo, chứ không im lặng.
 */
export interface SecretVault {
    encrypt(plain: string): Promise<string | null>;
    decrypt(payload: string): Promise<string | null>;
}

interface SafeStorageLike {
    isEncryptionAvailable(): boolean;
    encryptString(plainText: string): Buffer;
    decryptString(encrypted: Buffer): string;
}

/** `electron` là module `export =`; tuỳ cách biên dịch, nó tới dưới dạng nào cũng được. */
interface ElectronSafeStorageModule {
    safeStorage?: SafeStorageLike;
    default?: {safeStorage?: SafeStorageLike};
}

/**
 * electron.safeStorage, imported lazily so this module still loads (and tests
 * still run) outside Electron. Verified against electron 42.11.8:
 * isEncryptionAvailable / encryptString / decryptString.
 */
export function electronSafeStorageVault(log: ChannelContext['log']): SecretVault {
    let cached: SafeStorageLike | null | undefined;

    const storage = async (): Promise<SafeStorageLike | null> => {
        if (cached !== undefined) return cached;
        try {
            const electron: ElectronSafeStorageModule = await import('electron');
            const safeStorage = electron.safeStorage ?? electron.default?.safeStorage;
            cached = safeStorage && safeStorage.isEncryptionAvailable() ? safeStorage : null;
        } catch {
            cached = null; // Chạy ngoài Electron (test, script CLI).
        }
        if (!cached) {
            log('warn', '[zalo] Hệ điều hành không cung cấp kho khoá an toàn — thông tin đăng nhập sẽ lưu dạng thường');
        }
        return cached;
    };

    return {
        async encrypt(plain: string): Promise<string | null> {
            const ss = await storage();
            if (!ss) return null;
            try {
                return ss.encryptString(plain).toString('base64');
            } catch (err) {
                log('error', '[zalo] Mã hoá thông tin đăng nhập thất bại', err);
                return null;
            }
        },
        async decrypt(payload: string): Promise<string | null> {
            const ss = await storage();
            if (!ss) return null;
            try {
                return ss.decryptString(Buffer.from(payload, 'base64'));
            } catch (err) {
                log('error', '[zalo] Giải mã thông tin đăng nhập thất bại', err);
                return null;
            }
        },
    };
}

interface CredentialEnvelope {
    v: 1;
    enc: 'safe-storage' | 'plaintext';
    savedAt: string;
    label: string;
    avatar: string;
    phone: string;
    /** base64 của safeStorage, hoặc JSON thô khi enc === 'plaintext'. */
    payload: string;
}

/** Zalo userId là chuỗi số, nhưng tên tệp thì không tin dữ liệu từ mạng được. */
const SAFE_ACCOUNT_ID = /^[A-Za-z0-9_-]{1,64}$/;

export class FileZaloCredentialStore implements ZaloCredentialStore {
    private readonly dir: string;
    private readonly vault: SecretVault;
    private readonly log: ChannelContext['log'];

    constructor(dir: string, vault: SecretVault, log: ChannelContext['log']) {
        this.dir = dir;
        this.vault = vault;
        this.log = log;
    }

    private file(accountId: string): string {
        if (!SAFE_ACCOUNT_ID.test(accountId)) {
            throw new Error(`Mã tài khoản Zalo không hợp lệ: ${accountId}`);
        }
        return path.join(this.dir, `${accountId}.json`);
    }

    async list(): Promise<string[]> {
        try {
            const names = await fs.readdir(this.dir);
            return names
                .filter((n) => n.endsWith('.json'))
                .map((n) => n.slice(0, -'.json'.length))
                .filter((id) => SAFE_ACCOUNT_ID.test(id));
        } catch {
            return []; // Chưa đăng nhập lần nào.
        }
    }

    async load(accountId: string): Promise<StoredZaloAccount | null> {
        let envelope: CredentialEnvelope;
        try {
            const raw = await fs.readFile(this.file(accountId), 'utf8');
            envelope = JSON.parse(raw) as CredentialEnvelope;
        } catch (err) {
            const code = (err as {code?: string} | null)?.code;
            if (code !== 'ENOENT') this.log('warn', `[zalo] Không đọc được thông tin đăng nhập ${accountId}`, err);
            return null;
        }

        let plain: string | null;
        if (envelope.enc === 'safe-storage') {
            plain = await this.vault.decrypt(envelope.payload);
            if (plain === null) {
                // Keychain đổi hoặc hồ sơ máy khác: người dùng phải quét lại QR.
                this.log('error', `[zalo] Không giải mã được thông tin đăng nhập ${accountId}, cần quét lại mã QR`);
                return null;
            }
        } else {
            this.log('warn', `[zalo] Thông tin đăng nhập ${accountId} đang lưu dạng thường trên đĩa`);
            plain = envelope.payload;
        }

        try {
            return {
                accountId,
                label: envelope.label ?? '',
                avatar: envelope.avatar ?? '',
                phone: envelope.phone ?? '',
                credentials: JSON.parse(plain) as ZaloCredentials,
                savedAt: envelope.savedAt ?? '',
                plaintext: envelope.enc === 'plaintext',
            };
        } catch (err) {
            this.log('error', `[zalo] Thông tin đăng nhập ${accountId} hỏng định dạng`, err);
            return null;
        }
    }

    async save(rec: Omit<StoredZaloAccount, 'savedAt' | 'plaintext'>): Promise<void> {
        const file = this.file(rec.accountId);
        const plain = JSON.stringify(rec.credentials);
        const sealed = await this.vault.encrypt(plain);
        if (sealed === null) {
            this.log(
                'error',
                `[zalo] Lưu thông tin đăng nhập ${rec.accountId} dạng KHÔNG mã hoá — bất kỳ ai đọc được tệp này đều chiếm được phiên Zalo`,
            );
        }
        const envelope: CredentialEnvelope = {
            v: 1,
            enc: sealed === null ? 'plaintext' : 'safe-storage',
            savedAt: new Date().toISOString(),
            label: rec.label,
            avatar: rec.avatar,
            phone: rec.phone,
            payload: sealed ?? plain,
        };
        await fs.mkdir(this.dir, {recursive: true});
        await fs.writeFile(file, JSON.stringify(envelope), {encoding: 'utf8', mode: 0o600});
    }

    async remove(accountId: string): Promise<void> {
        try {
            await fs.unlink(this.file(accountId));
        } catch (err) {
            const code = (err as {code?: string} | null)?.code;
            if (code !== 'ENOENT') this.log('warn', `[zalo] Không xoá được thông tin đăng nhập ${accountId}`, err);
        }
    }
}

// ─── Failure classification ──────────────────────────────────────────────────

/** Cùng tập với SendErrorKind, để index.ts chỉ việc gắn thêm câu chữ tiếng Việt. */
export type ZaloFailureKind = SendErrorKind;

/**
 * Heuristic. zca-js ném ZaloApiError(message, error_code) và Zalo không công bố
 * bảng mã lỗi, nên ta khớp theo lời nhắn. Chuỗi "Request failed with status
 * code N" là của chính zca-js (utils.js:582) nên chắc chắn đúng.
 * Thứ tự quan trọng: tài khoản bị khoá phải thắng "spam" của rate-limit.
 */
const FAILURE_PATTERNS: Array<{kind: ZaloFailureKind; re: RegExp}> = [
    {kind: 'blocked', re: /\bblock|bị chặn|bị khoá|bị khóa|kho[áa] t[àa]i kho[ảa]n|restrict|hạn chế|vi phạm|suspend|status code 403/i},
    {kind: 'auth', re: /đăng nhập|not logged|unauthor|cookie|session (expired|invalid)|invalid token|hết hiệu lực|status code 401/i},
    {kind: 'rate-limited', re: /rate.?limit|too many|quá nhiều|gửi quá|giới hạn|flood|spam|thử lại sau|status code 429/i},
    {
        kind: 'invalid-recipient',
        re: /người lạ|stranger|not (a )?friend|chưa (là|kết) bạn|không tìm thấy|not found|no exist|not exist|invalid (user|uid|recipient|thread)|thread.*invalid/i,
    },
    {
        kind: 'transient',
        re: /timeout|timed out|network|fetch failed|socket|econn|etimedout|enotfound|eai_again|status code 5\d\d|parse response data/i,
    },
];

function failureText(err: unknown): string {
    if (err === null || err === undefined) return '';
    if (typeof err === 'string') return err;
    const e = err as {name?: unknown; message?: unknown; code?: unknown};
    return [e.name, e.message, e.code]
        .filter((v) => v !== undefined && v !== null)
        .map((v) => String(v))
        .join(' ');
}

export function classifyZaloFailure(err: unknown): ZaloFailureKind {
    const text = failureText(err);
    for (const p of FAILURE_PATTERNS) {
        if (p.re.test(text)) return p.kind;
    }
    return 'unknown';
}

/** Mã lỗi Zalo giữ nguyên để in vào báo cáo gửi. */
export function zaloErrorCode(err: unknown): string | undefined {
    const code = (err as {code?: unknown} | null)?.code;
    return typeof code === 'number' || typeof code === 'string' ? String(code) : undefined;
}

export function zaloErrorText(err: unknown): string {
    const e = err as {message?: unknown} | null;
    const msg = typeof e?.message === 'string' && e.message ? e.message : String(err);
    return msg.length > 160 ? `${msg.slice(0, 157)}...` : msg;
}

// ─── Sessions ────────────────────────────────────────────────────────────────

export type ZaloSessionStatus = 'connecting' | 'ready' | 'reconnecting' | 'logged-out' | 'error';

export interface ZaloSession {
    accountId: string;
    label: string;
    avatar: string;
    phone: string;
    status: ZaloSessionStatus;
    /** null khi phiên đã chết; giữ lại bản ghi để màn hình Kênh vẫn thấy tài khoản. */
    api: ZaloApi | null;
    lastActivityAt: number;
    reconnectAttempts: number;
    message: string;
}

export interface TimerHandle {
    cancel(): void;
}

export type Scheduler = (fn: () => void, ms: number) => TimerHandle;

const defaultScheduler: Scheduler = (fn, ms) => {
    const timer = setTimeout(fn, ms);
    // unref: hẹn giờ kết nối lại không được giữ tiến trình sống khi ứng dụng thoát.
    const unref = (timer as unknown as {unref?: () => void}).unref;
    if (typeof unref === 'function') unref.call(timer);
    return {cancel: () => clearTimeout(timer)};
};

/** Mã đóng websocket của zca-js (CloseReason, apis/listen.d.ts). */
const CLOSE_MANUAL = 1000;
const CLOSE_DUPLICATE = 3000;
const CLOSE_KICKED = 3003;

export const ZALO_EVENTS = {
    qr: 'zalo:qr',
    accounts: 'zalo:accounts',
    accountStatus: 'zalo:account-status',
} as const;

export interface ZaloSessionManagerOptions {
    ctx: ChannelContext;
    /** Mặc định: client thật dựng trên zca-js, nạp lười ở lần dùng đầu tiên. */
    client?: ZaloClient;
    /** Mặc định: tệp mã hoá trong <userDataDir>/channels/zalo. */
    store?: ZaloCredentialStore;
    schedule?: Scheduler;
    now?: () => number;
    maxReconnectAttempts?: number;
    reconnectBaseMs?: number;
    reconnectCapMs?: number;
    /** Larkwave: nhận tin (mới + cũ) của từng tài khoản — dựng sổ tin trong bộ nhớ. */
    onMessages?: (accountId: string, messages: ZaloMessage[]) => void;
}

export class ZaloSessionManager {
    private readonly ctx: ChannelContext;
    private readonly store: ZaloCredentialStore;
    private readonly schedule: Scheduler;
    private readonly now: () => number;
    private readonly maxReconnectAttempts: number;
    private readonly reconnectBaseMs: number;
    private readonly reconnectCapMs: number;

    private client: ZaloClient | null;
    private readonly accounts = new Map<string, ZaloSession>();
    private readonly reconnectTimers = new Map<string, TimerHandle>();
    private qr: QrLoginSnapshot = {state: 'idle', message: QR_MESSAGES.idle};
    private qrActions: {retry?: () => void; abort?: () => void} = {};
    private qrRun: Promise<void> | null = null;
    private disposed = false;
    private readonly onMessages?: (accountId: string, messages: ZaloMessage[]) => void;

    constructor(opts: ZaloSessionManagerOptions) {
        this.ctx = opts.ctx;
        this.client = opts.client ?? null;
        this.store = opts.store
            ?? new FileZaloCredentialStore(
                path.join(opts.ctx.userDataDir, 'channels', 'zalo'),
                electronSafeStorageVault(opts.ctx.log),
                opts.ctx.log,
            );
        this.schedule = opts.schedule ?? defaultScheduler;
        this.now = opts.now ?? (() => Date.now());
        this.maxReconnectAttempts = opts.maxReconnectAttempts ?? 6;
        this.reconnectBaseMs = opts.reconnectBaseMs ?? 5_000;
        this.reconnectCapMs = opts.reconnectCapMs ?? 300_000;
        this.onMessages = opts.onMessages;
    }

    // ── Đọc trạng thái ───────────────────────────────────────────────────────

    sessions(): ZaloSession[] {
        return [...this.accounts.values()];
    }

    readySessions(): ZaloSession[] {
        return this.sessions().filter((s) => s.status === 'ready' && s.api !== null);
    }

    get(accountId: string): ZaloSession | undefined {
        return this.accounts.get(accountId);
    }

    qrSnapshot(): QrLoginSnapshot {
        return this.qr;
    }

    markActivity(accountId: string): void {
        const session = this.accounts.get(accountId);
        if (session) session.lastActivityAt = this.now();
    }

    // ── Khôi phục lúc khởi động ──────────────────────────────────────────────

    /** Không bao giờ ném: một tài khoản hỏng không được chặn các tài khoản khác. */
    async restoreAll(): Promise<number> {
        let restored = 0;
        let ids: string[] = [];
        try {
            ids = await this.store.list();
        } catch (err) {
            this.ctx.log('error', '[zalo] Không đọc được danh sách tài khoản đã lưu', err);
            return 0;
        }

        for (const id of ids) {
            if (this.disposed) break;
            const rec = await this.store.load(id).catch(() => null);
            if (!rec) {
                this.markDown(id, id, 'logged-out', 'Không đọc được thông tin đăng nhập, cần quét lại mã QR');
                continue;
            }
            // Tuần tự: Zalo để ý những đợt đăng nhập dồn dập từ cùng một máy.
            const ok = await this.loginStored(rec);
            if (ok) restored++;
        }

        this.ctx.log('info', `[zalo] Khôi phục ${restored}/${ids.length} phiên đã lưu`);
        this.emitAccounts();
        return restored;
    }

    private async loginStored(rec: StoredZaloAccount): Promise<boolean> {
        this.upsertPlaceholder(rec.accountId, rec.label, 'connecting', 'Đang kết nối lại Zalo...');
        try {
            const client = await this.clientOrCreate();
            const api = await client.login(rec.credentials);
            await this.attach(api, rec.credentials);
            return true;
        } catch (err) {
            const kind = classifyZaloFailure(err);
            this.ctx.log('warn', `[zalo] Khôi phục ${rec.accountId} thất bại (${kind})`, err);
            if (kind === 'auth' || kind === 'blocked') {
                this.markDown(rec.accountId, rec.label, kind === 'blocked' ? 'error' : 'logged-out', kind === 'blocked'
                    ? 'Tài khoản Zalo đang bị hạn chế'
                    : 'Phiên Zalo đã hết hiệu lực, cần quét lại mã QR');
            } else {
                this.markDown(rec.accountId, rec.label, 'error', 'Chưa kết nối được tới Zalo');
                this.scheduleReconnect(rec.accountId);
            }
            return false;
        }
    }

    // ── Đăng nhập bằng QR ────────────────────────────────────────────────────

    /**
     * Mở một phiên QR. Trả về ngay ảnh chụp trạng thái đầu tiên; các bước sau
     * đến renderer qua sự kiện ZALO_EVENTS.qr.
     */
    async beginQrLogin(): Promise<QrLoginSnapshot> {
        if (this.disposed) return this.qr;

        if (this.qrRun) {
            if (!isQrSettled(this.qr.state)) {
                this.ctx.log('warn', '[zalo] Đã có phiên đăng nhập QR đang chạy');
                return this.qr;
            }
            // Mã cũ hết hạn/bị từ chối: zca-js vẫn đang treo chờ retry() hoặc
            // abort(). Đóng đúng phiên đó trước, đừng để nó sống ký sinh.
            const pending = this.qrRun;
            if (this.abortQr()) {
                await pending.catch(() => undefined);
            } else {
                this.ctx.log('warn', '[zalo] Phiên QR cũ không huỷ được, bỏ qua và mở phiên mới');
                this.qrRun = null;
            }
        }

        this.setQr('start', {});

        let client: ZaloClient;
        try {
            client = await this.clientOrCreate();
        } catch (err) {
            this.ctx.log('error', '[zalo] Không khởi tạo được thư viện Zalo', err);
            this.setQr('login-failed', {message: 'Không khởi tạo được Zalo trên máy này'});
            return this.qr;
        }

        let creds: ZaloCredentials | null = null;
        this.qrRun = client
            .loginQR((ev) => {
                if (ev.credentials) creds = ev.credentials;
                if (ev.retry) this.qrActions.retry = ev.retry;
                if (ev.abort) this.qrActions.abort = ev.abort;
                this.setQr(ev.kind, {
                    image: ev.image,
                    scannedName: ev.displayName,
                    scannedAvatar: ev.avatar,
                });
            })
            .then(async (api) => {
                const session = await this.attach(api, creds);
                this.setQr('login-ok', {accountId: session.accountId});
            })
            .catch((err: unknown) => {
                const aborted = /abort/i.test(failureText(err));
                this.ctx.log(aborted ? 'info' : 'error', '[zalo] Phiên đăng nhập QR kết thúc', err);
                this.setQr(aborted ? 'abort' : 'login-failed', {});
            })
            .finally(() => {
                this.qrRun = null;
                this.qrActions = {};
            });

        return this.qr;
    }

    /** Tạo lại mã trong cùng phiên. false = không còn phiên nào để tạo lại. */
    retryQr(): boolean {
        const retry = this.qrActions.retry;
        if (!retry) return false;
        this.setQr('retry', {});
        try {
            retry();
            return true;
        } catch (err) {
            this.ctx.log('error', '[zalo] Tạo lại mã QR thất bại', err);
            this.setQr('login-failed', {});
            return false;
        }
    }

    abortQr(): boolean {
        const abort = this.qrActions.abort;
        if (!abort) return false;
        try {
            abort();
            return true;
        } catch (err) {
            this.ctx.log('warn', '[zalo] Huỷ phiên QR thất bại', err);
            return false;
        }
    }

    // ── Đăng xuất ────────────────────────────────────────────────────────────

    async logout(accountId: string): Promise<void> {
        this.cancelReconnect(accountId);
        const session = this.accounts.get(accountId);
        this.stopListening(session);
        this.accounts.delete(accountId);
        await this.store.remove(accountId);
        this.ctx.log('info', `[zalo] Đã đăng xuất tài khoản ${accountId}`);
        this.emitAccounts();
    }

    // ── Kết nối lại ──────────────────────────────────────────────────────────

    /**
     * Đăng nhập lại ngay bằng thông tin đã lưu. send() gọi hàm này khi gặp lỗi
     * xác thực, trước khi bỏ cuộc với người nhận.
     */
    async reconnect(accountId: string): Promise<boolean> {
        if (this.disposed) return false;
        this.cancelReconnect(accountId);

        const session = this.accounts.get(accountId);
        const rec = await this.store.load(accountId).catch(() => null);
        if (!rec) {
            this.markDown(accountId, session?.label ?? accountId, 'logged-out', 'Không còn thông tin đăng nhập, cần quét lại mã QR');
            return false;
        }

        if (session) {
            session.status = 'reconnecting';
            session.message = 'Đang kết nối lại Zalo...';
            this.emitStatus(session);
        }
        this.stopListening(session);

        try {
            const client = await this.clientOrCreate();
            const api = await client.login(rec.credentials);
            await this.attach(api, rec.credentials);
            this.ctx.log('info', `[zalo] Đã kết nối lại ${accountId}`);
            return true;
        } catch (err) {
            const kind = classifyZaloFailure(err);
            this.ctx.log('warn', `[zalo] Kết nối lại ${accountId} thất bại (${kind})`, err);
            if (kind === 'auth') {
                this.markDown(accountId, rec.label, 'logged-out', 'Phiên Zalo đã hết hiệu lực, cần quét lại mã QR');
                return false;
            }
            if (kind === 'blocked') {
                this.markDown(accountId, rec.label, 'error', 'Tài khoản Zalo đang bị hạn chế, ngừng kết nối lại');
                return false;
            }
            this.scheduleReconnect(accountId);
            return false;
        }
    }

    private scheduleReconnect(accountId: string): void {
        if (this.disposed) return;
        if (this.reconnectTimers.has(accountId)) return;

        const session = this.accounts.get(accountId);
        const attempt = (session?.reconnectAttempts ?? 0) + 1;
        if (session) session.reconnectAttempts = attempt;

        if (attempt > this.maxReconnectAttempts) {
            this.markDown(
                accountId,
                session?.label ?? accountId,
                'logged-out',
                `Không kết nối lại được sau ${this.maxReconnectAttempts} lần thử, cần quét lại mã QR`,
            );
            return;
        }

        const delay = this.backoffMs(attempt);
        this.ctx.log('info', `[zalo] ${accountId}: thử kết nối lại lần ${attempt} sau ${Math.round(delay / 1000)}s`);
        const handle = this.schedule(() => {
            this.reconnectTimers.delete(accountId);
            void this.reconnect(accountId);
        }, delay);
        this.reconnectTimers.set(accountId, handle);
    }

    /** Luỹ thừa 2, chặn trần, cộng jitter để nhiều tài khoản không cùng đập vào Zalo. */
    private backoffMs(attempt: number): number {
        const exp = Math.min(this.reconnectCapMs, this.reconnectBaseMs * 2 ** (attempt - 1));
        return exp + Math.floor(Math.random() * (exp / 4));
    }

    private cancelReconnect(accountId: string): void {
        const handle = this.reconnectTimers.get(accountId);
        if (!handle) return;
        handle.cancel();
        this.reconnectTimers.delete(accountId);
    }

    private handleClosed(accountId: string, api: ZaloApi, code: number, reason: string): void {
        if (this.disposed || code === CLOSE_MANUAL) return;

        const session = this.accounts.get(accountId);
        if (!session) return;
        if (session.api !== api) {
            // Socket cũ đóng muộn sau khi ta đã đăng nhập lại. Bỏ qua, nếu không
            // phiên mới đang tốt sẽ bị đánh dấu là mất kết nối.
            this.ctx.log('debug', `[zalo] ${accountId}: bỏ qua sự kiện đóng của phiên cũ (${code})`);
            return;
        }

        if (code === CLOSE_DUPLICATE) {
            // Chính kết nối mới của ta đã thay chỗ kết nối cũ. Nối lại nữa là tự đá nhau.
            this.ctx.log('debug', `[zalo] ${accountId}: socket cũ đóng vì có kết nối mới`);
            return;
        }

        if (code === CLOSE_KICKED) {
            this.markDown(accountId, session.label, 'logged-out', 'Zalo đã đăng xuất phiên này, cần quét lại mã QR');
            return;
        }

        session.status = 'reconnecting';
        session.message = `Mất kết nối Zalo (${code}${reason ? `: ${reason}` : ''}), đang thử lại`;
        this.emitStatus(session);
        this.scheduleReconnect(accountId);
    }

    // ── Vòng đời phiên ───────────────────────────────────────────────────────

    private async clientOrCreate(): Promise<ZaloClient> {
        if (!this.client) this.client = await createZcaClient(this.ctx.log);
        return this.client;
    }

    private async attach(api: ZaloApi, creds: ZaloCredentials | null): Promise<ZaloSession> {
        const info = await api.account();
        const accountId = info.userId || api.ownId();
        const previous = this.accounts.get(accountId);

        // Hai listener trên cùng một tài khoản sẽ nhân đôi mọi sự kiện.
        if (previous && previous.api && previous.api !== api) this.stopListening(previous);

        const session: ZaloSession = {
            accountId,
            label: info.name || previous?.label || accountId,
            avatar: info.avatar || previous?.avatar || '',
            phone: info.phone || previous?.phone || '',
            status: 'ready',
            api,
            lastActivityAt: this.now(),
            reconnectAttempts: 0,
            message: 'Đã kết nối',
        };
        this.accounts.set(accountId, session);
        this.cancelReconnect(accountId);

        if (creds) {
            await this.store
                .save({accountId, label: session.label, avatar: session.avatar, phone: session.phone, credentials: creds})
                .catch((err: unknown) => this.ctx.log('error', `[zalo] Không lưu được thông tin đăng nhập ${accountId}`, err));
        } else {
            // Xảy ra khi zca-js không phát GotLoginInfo: phiên vẫn dùng được
            // đến khi đóng ứng dụng, nhưng sẽ không khôi phục lại được.
            this.ctx.log('warn', `[zalo] ${accountId}: không có thông tin đăng nhập để lưu, lần sau phải quét lại QR`);
        }

        api.listen({
            onClosed: (code, reason) => this.handleClosed(accountId, api, code, reason),
            onError: (err) => this.ctx.log('warn', `[zalo] ${accountId}: lỗi kết nối`, err),
            onMessages: (messages) => {
                try {
                    this.onMessages?.(accountId, messages);
                } catch (err) {
                    this.ctx.log('warn', `[zalo] ${accountId}: lỗi khi ghi sổ tin`, err);
                }
            },
        });

        this.ctx.log('info', `[zalo] Đã đăng nhập ${session.label} (${accountId})`);
        this.emitStatus(session);
        this.emitAccounts();
        return session;
    }

    private upsertPlaceholder(accountId: string, label: string, status: ZaloSessionStatus, message: string): ZaloSession {
        const previous = this.accounts.get(accountId);
        const session: ZaloSession = {
            accountId,
            label: previous?.label || label || accountId,
            avatar: previous?.avatar ?? '',
            phone: previous?.phone ?? '',
            status,
            api: status === 'ready' ? previous?.api ?? null : null,
            lastActivityAt: previous?.lastActivityAt ?? this.now(),
            reconnectAttempts: previous?.reconnectAttempts ?? 0,
            message,
        };
        this.accounts.set(accountId, session);
        return session;
    }

    /** Tài khoản còn hiện trên màn hình Kênh, nhưng không gửi được nữa. */
    private markDown(accountId: string, label: string, status: 'logged-out' | 'error', message: string): void {
        this.cancelReconnect(accountId);
        this.stopListening(this.accounts.get(accountId));
        const session = this.upsertPlaceholder(accountId, label, status, message);
        this.ctx.log('warn', `[zalo] ${accountId}: ${message}`);
        this.emitStatus(session);
        this.emitAccounts();
    }

    private stopListening(session: ZaloSession | undefined): void {
        if (!session?.api) return;
        try {
            session.api.stopListening();
        } catch (err) {
            this.ctx.log('debug', `[zalo] ${session.accountId}: dừng listener thất bại`, err);
        }
        session.api = null;
    }

    private setQr(event: QrEventKind, patch: Partial<QrLoginSnapshot>): void {
        const previous = this.qr;
        const state = qrTransition(previous.state, event);
        if (state === previous.state && patch.image === undefined && patch.scannedName === undefined) {
            this.ctx.log('debug', `[zalo] QR bỏ qua sự kiện ${event} ở trạng thái ${previous.state}`);
            return;
        }

        const keepImage = QR_IMAGE_STATES.includes(state);
        const keepScan = state === 'scanned' || state === 'authenticating';
        this.qr = {
            state,
            message: patch.message ?? QR_MESSAGES[state],
            image: patch.image ?? (keepImage ? previous.image : undefined),
            scannedName: patch.scannedName ?? (keepScan ? previous.scannedName : undefined),
            scannedAvatar: patch.scannedAvatar ?? (keepScan ? previous.scannedAvatar : undefined),
            accountId: patch.accountId ?? (state === 'success' ? previous.accountId : undefined),
        };
        this.ctx.emit(ZALO_EVENTS.qr, this.qr);
    }

    private emitAccounts(): void {
        this.ctx.emit(
            ZALO_EVENTS.accounts,
            this.sessions().map((s) => ({
                accountId: s.accountId,
                label: s.label,
                avatar: s.avatar,
                phone: s.phone,
                status: s.status,
                message: s.message,
            })),
        );
    }

    private emitStatus(session: ZaloSession): void {
        this.ctx.emit(ZALO_EVENTS.accountStatus, {
            accountId: session.accountId,
            status: session.status,
            message: session.message,
        });
    }

    async dispose(): Promise<void> {
        this.disposed = true;
        this.abortQr();
        this.qrActions = {};
        this.qrRun = null;
        for (const handle of this.reconnectTimers.values()) handle.cancel();
        this.reconnectTimers.clear();
        for (const session of this.accounts.values()) this.stopListening(session);
    }
}

// ─── zca-js adapter ──────────────────────────────────────────────────────────

type ZcaModule = typeof import('zca-js');
type ZcaApi = InstanceType<ZcaModule['API']>;

/**
 * Nạp zca-js lười và bọc lại thành ZaloClient. Đây là chỗ DUY NHẤT trong kênh
 * Zalo biết tên hàm thật của thư viện.
 */
export async function createZcaClient(log: ChannelContext['log']): Promise<ZaloClient> {
    const zca: ZcaModule = await import('zca-js');
    // Larkwave BẬT selfListen: kỹ năng đọc hội thoại cần thấy cả tin chính mình gửi (Social Wave tắt vì chỉ gửi đi).
    const zalo = new zca.Zalo({selfListen: true, checkUpdate: false, logging: false});

    const norm = (m: {type?: unknown; threadId?: unknown; isSelf?: unknown; data?: Record<string, any>}): ZaloMessage => {
        const d = m.data ?? {};
        const c = d.content;
        const text =
            typeof c === 'string'
                ? c
                : c && typeof c === 'object'
                  ? [c.title, c.description, c.href].filter((x) => typeof x === 'string' && x).join(' · ') || `[${String(d.msgType || 'tệp/đính kèm')}]`
                  : '';
        return {
            threadId: String(m.threadId ?? ''),
            isGroup: m.type === zca.ThreadType.Group,
            msgId: String(d.msgId ?? d.cliMsgId ?? ''),
            ...(d.cliMsgId !== undefined && d.cliMsgId !== null ? {cliMsgId: String(d.cliMsgId)} : {}),
            fromId: String(d.uidFrom ?? ''),
            fromName: String(d.dName ?? ''),
            isSelf: !!m.isSelf,
            text,
            ts: Number(d.ts) || Date.now(),
        };
    };

    const adapt = (api: ZcaApi): ZaloApi => {
        const anyApi = api as unknown as Record<string, any>;
        /** Endpoint riêng của Larkwave qua `api.custom` (cùng cách ký/mã hoá như hàm có sẵn của zca-js). */
        const custom = <P, R>(name: string, cb: (a: {ctx: any; utils: any; props: P}) => Promise<R>): ((props: P) => Promise<R>) => {
            if (!(name in anyApi)) anyApi.custom(name, cb);
            return (props: P) => anyApi[name](props) as Promise<R>;
        };
        const cloudPage = custom<{groupId: string; count: number; cursor?: string}, any>('lwGroupCloudPage', async ({ctx, utils, props}) => {
            const host = anyApi.zpwServiceMap?.group_cloud_message?.[0];
            if (!host) throw new Error('Zalo không cấp dịch vụ group_cloud_message cho phiên này');
            const base = utils.makeURL(`${host}/api/cm/getrecentv2`);
            const params = {groupId: String(props.groupId).replace(/^g/, ''), globalMsgId: Number(props.cursor) || 0, count: props.count, msgIds: [], imei: ctx.imei, src: 3};
            const enc = utils.encodeAES(JSON.stringify(params));
            if (!enc) throw new Error('Không mã hoá được tham số');
            const res = await utils.request(utils.makeURL(base, {params: enc, nretry: 0}), {method: 'GET'});
            return utils.resolve(res, (r: {data: unknown}) => (typeof r.data === 'string' ? JSON.parse(r.data) : r.data));
        });
        /**
         * Cookie của phiên web hiện tại, đọc từ bộ cookie của zca-js (`ctx.cookie`, một CookieJar của tough-cookie).
         * Dùng để nhét vào cửa sổ Zalo Web (zaloWeb.ts) → cùng một phiên đăng nhập, Zalo không đá nhau, khỏi quét QR lại.
         */
        const cookies = custom<void, ZaloWebCookie[]>('lwWebCookies', async ({ctx}) => {
            const jar = ctx.cookie;
            if (!jar?.serialize) return [];
            const data = await jar.serialize();
            return ((data?.cookies ?? []) as Record<string, unknown>[]).map((c) => ({
                name: String(c.key ?? ''),
                value: String(c.value ?? ''),
                domain: c.domain ? String(c.domain) : undefined,
                path: c.path ? String(c.path) : '/',
                secure: !!c.secure,
                httpOnly: !!c.httpOnly,
                ...(typeof c.expires === 'string' && c.expires !== 'Infinity' ? {expirationDate: Math.floor(new Date(c.expires).getTime() / 1000)} : {}),
            })).filter((c) => c.name && c.value);
        });

        return {
        ownId: () => api.getOwnId(),
        account: async () => {
            const info = await api.fetchAccountInfo();
            // Zalo đã đổi hình dạng phản hồi này ít nhất một lần, nên đọc phòng thủ.
            const profile = info?.profile;
            return {
                userId: String(profile?.userId ?? api.getOwnId()),
                name: profile?.displayName || profile?.zaloName || profile?.username || 'Zalo',
                avatar: profile?.avatar ?? '',
                phone: profile?.phoneNumber ?? '',
            };
        },
        friends: async () => {
            const list = await api.getAllFriends();
            return (list ?? []).map((f) => ({
                uid: String(f.userId),
                name: f.displayName || f.zaloName || '',
                phone: f.phoneNumber ?? '',
            }));
        },
        findUserByPhone: async (phone) => {
            const user = await api.findUser(phone);
            if (!user?.uid) return null;
            return {
                uid: String(user.uid),
                name: user.display_name || user.zalo_name || '',
                avatar: user.avatar ?? '',
            };
        },
        isFriend: async (uid) => {
            const status = await api.getFriendRequestStatus(uid);
            return Number(status?.is_friend ?? 0) > 0;
        },
        sendText: async (text, threadId) => {
            const res = await api.sendMessage(text, threadId, zca.ThreadType.User);
            const msgId = res?.message?.msgId;
            return {msgId: msgId === undefined || msgId === null ? null : String(msgId)};
        },
        ping: async () => {
            await api.keepAlive();
        },
        groups: async () => {
            const all = await api.getAllGroups();
            const ids = Object.keys(all?.gridVerMap ?? {});
            const out: ZaloGroup[] = [];
            // getGroupInfo nhận nhiều id một lần; chia mẻ cho nhẹ.
            for (let i = 0; i < ids.length; i += 50) {
                const info = await api.getGroupInfo(ids.slice(i, i + 50));
                const map = (info?.gridInfoMap ?? {}) as Record<string, {name?: string; totalMember?: number}>;
                for (const id of ids.slice(i, i + 50)) out.push({groupId: id, name: map[id]?.name || id, members: Number(map[id]?.totalMember) || 0});
            }
            return out;
        },
        groupHistory: async (groupId, count) => {
            // Endpoint cũ (`/api/group/history`) Zalo đã bỏ: trả 404/rỗng — đây là lý do "đọc nhóm chỉ ra vài tin".
            // Kho tin cloud (getrecentv2) phân trang lùi theo `lastMsgId` (zca-js PR #370, đã kiểm trên tài khoản thật).
            try {
                const out: ZaloMessage[] = [];
                let cursor: string | undefined;
                for (let i = 0; i < 20 && out.length < count; i++) {
                    const page = await cloudPage({groupId, count: Math.min(50, count - out.length), cursor});
                    const raw = Array.isArray(page?.groupMsgs) ? page.groupMsgs : [];
                    out.push(...raw.map((m: unknown) => norm(new zca.GroupMessage(api.getOwnId(), m as never) as never)));
                    const next = page?.lastMsgId ? String(page.lastMsgId) : undefined;
                    if (!page?.hasMore || !next || next === cursor || !raw.length) break;
                    cursor = next;
                }
                if (out.length) return out;
            } catch (err) {
                log('debug', '[zalo] lịch sử nhóm (cloud) lỗi — thử endpoint cũ', err);
            }
            const res = await api.getGroupChatHistory(groupId, count);
            return (res?.groupMsgs ?? []).map((m) => norm(m as never));
        },
        sendTextTo: async (text, threadId, isGroup) => {
            const res = await api.sendMessage(text, threadId, isGroup ? zca.ThreadType.Group : zca.ThreadType.User);
            const msgId = res?.message?.msgId;
            return {msgId: msgId === undefined || msgId === null ? null : String(msgId)};
        },
        listen: (handlers) => {
            api.listener.on('closed', (code, reason) => handlers.onClosed(Number(code), String(reason ?? '')));
            api.listener.on('error', (err) => handlers.onError(err));
            if (handlers.onMessages) {
                const sink = handlers.onMessages;
                api.listener.on('message', (m) => sink([norm(m as never)]));
                api.listener.on('old_messages', (msgs) => sink((msgs ?? []).map((m) => norm(m as never))));
                // Vừa kết nối: xin Zalo đồng bộ tin gần đây của chat 1-1 và nhóm (đến qua `old_messages`).
                api.listener.on('connected', () => {
                    try {
                        api.listener.requestOldMessages(zca.ThreadType.User);
                        api.listener.requestOldMessages(zca.ThreadType.Group);
                    } catch (err) {
                        log('debug', '[zalo] requestOldMessages lỗi', err);
                    }
                });
            }
            // retryOnClose là lớp nối lại của zca-js (chỉ dựng lại websocket);
            // lớp của ta ở trên đăng nhập lại khi cookie mới là thứ cứu được.
            api.listener.start({retryOnClose: true});
        },
        stopListening: () => {
            try {
                api.listener.stop();
            } catch (err) {
                log('debug', '[zalo] listener.stop() lỗi', err);
            }
        },
        groupCloudPage: async (groupId, count, cursor) => {
            const page = await cloudPage({groupId, count: Math.max(1, Math.min(50, count)), cursor});
            const raw = Array.isArray(page?.groupMsgs) ? page.groupMsgs : [];
            const messages = raw.map((m: unknown) => norm(new zca.GroupMessage(api.getOwnId(), m as never) as never));
            const next = page?.lastMsgId ? String(page.lastMsgId) : undefined;
            return {messages, cursor: next, hasMore: !!page?.hasMore && !!next && next !== cursor};
        },
        requestOlder: (isGroup, lastMsgId) =>
            new Promise<ZaloMessage[]>((resolve) => {
                const type = isGroup ? zca.ThreadType.Group : zca.ThreadType.User;
                const on = (msgs: unknown[], t: unknown) => {
                    if (t === type) done((msgs ?? []).map((m) => norm(m as never)));
                };
                const timer = setTimeout(() => done([]), 12_000);
                const done = (out: ZaloMessage[]) => {
                    clearTimeout(timer);
                    api.listener.off('old_messages', on as never);
                    resolve(out);
                };
                api.listener.on('old_messages', on as never);
                try {
                    api.listener.requestOldMessages(type, (lastMsgId ?? null) as never);
                } catch {
                    done([]);
                }
            }),
        webCookies: () => cookies(undefined),
        };
    };

    const toCredentials = (creds: ZaloCredentials): Parameters<typeof zalo.login>[0] => ({
        imei: creds.imei,
        userAgent: creds.userAgent,
        language: creds.language ?? 'vi',
        // Cookie jar đi thẳng từ zca-js ra đĩa rồi quay lại; ta không diễn giải nó.
        cookie: creds.cookie as Parameters<typeof zalo.login>[0]['cookie'],
    });

    return {
        login: async (creds) => adapt(await zalo.login(toCredentials(creds))),
        loginQR: async (onEvent) => {
            const api = await zalo.loginQR({}, (event) => {
                switch (event.type) {
                    case zca.LoginQRCallbackEventType.QRCodeGenerated:
                        onEvent({
                            kind: 'qr-generated',
                            image: event.data.image,
                            retry: event.actions.retry,
                            abort: event.actions.abort,
                        });
                        break;
                    case zca.LoginQRCallbackEventType.QRCodeExpired:
                        onEvent({kind: 'qr-expired', retry: event.actions.retry, abort: event.actions.abort});
                        break;
                    case zca.LoginQRCallbackEventType.QRCodeScanned:
                        onEvent({
                            kind: 'qr-scanned',
                            displayName: event.data.display_name,
                            avatar: event.data.avatar,
                            retry: event.actions.retry,
                            abort: event.actions.abort,
                        });
                        break;
                    case zca.LoginQRCallbackEventType.QRCodeDeclined:
                        onEvent({kind: 'qr-declined', retry: event.actions.retry, abort: event.actions.abort});
                        break;
                    case zca.LoginQRCallbackEventType.GotLoginInfo:
                        onEvent({
                            kind: 'got-login-info',
                            credentials: {
                                imei: event.data.imei,
                                userAgent: event.data.userAgent,
                                cookie: event.data.cookie,
                                language: 'vi',
                            },
                        });
                        break;
                    default:
                        break;
                }
            });
            return adapt(api);
        },
    };
}
