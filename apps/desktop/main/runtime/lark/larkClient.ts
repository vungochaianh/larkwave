/**
 * Thin Lark (larksuite.com — international, NOT feishu.cn) Open API client.
 *
 * Deliberately hand-rolled on global `fetch` (Node 20) instead of pulling in the
 * official SDK: the desktop main bundle stays dependency-free and we own the one
 * footgun that matters — Lark returns HTTP 200 even on logical/token errors, with
 * the real status in the JSON envelope `{ code, msg, data }` (code 0 = success).
 * Every call funnels through `request()`, which throws `LarkApiError` on a
 * non-zero code, re-mints the tenant token on an auth error, and backs off once on
 * a frequency-control error (99991400).
 *
 * Auth: a self-built CUSTOM APP mints a `tenant_access_token` from app_id +
 * app_secret (POST /open-apis/auth/v3/tenant_access_token/internal). The token is
 * cached in memory with its expiry and refreshed proactively — never persisted.
 */

const LARK_HOST = 'https://open.larksuite.com';

/** Per-request transport timeout (Lark calls should never hang the agent loop). */
const TIMEOUT_MS = 20_000;
/** Retries for TRANSPORT failures (network error / timeout / HTTP 5xx). */
const MAX_NET_RETRIES = 2;
/** Retries for rate-limit (HTTP 429 / frequency-control code 99991400). */
const MAX_RATE_RETRIES = 3;
/** Retries for auth (token expired/invalid) — re-mint once. */
const MAX_AUTH_RETRIES = 1;
/** Lark codes meaning the access token is expired/invalid → re-mint + retry. */
const AUTH_CODES = new Set([99991663, 99991661, 99991668]);
/** Lark codes meaning frequency control (rate limit) → backoff + retry. */
const RATE_CODES = new Set([99991400]);

/** A non-zero Lark envelope `{code,msg}` (HTTP was 200; the error is logical). */
export class LarkApiError extends Error {
  constructor(
    readonly code: number,
    readonly larkMsg: string,
    readonly path?: string,
    /** Lark `log_id`/`request_id` — quote it when asking Lark support. */
    readonly logId?: string,
  ) {
    super(`Lark API ${code}: ${larkMsg}${path ? ` (${path})` : ''}${logId ? ` [log_id ${logId}]` : ''}`);
    this.name = 'LarkApiError';
  }
}

/** A TRANSPORT failure (no/!=200-with-body response) after retries — offline, DNS, timeout, 5xx. */
export class LarkNetworkError extends Error {
  constructor(
    readonly path: string,
    readonly cause?: unknown,
  ) {
    super(`Không kết nối được tới Lark (${path}). Kiểm tra mạng rồi thử lại.`);
    this.name = 'LarkNetworkError';
  }
}

interface RequestOptions {
  params?: Record<string, unknown>;
  data?: unknown;
  /** internal: how many auth re-mints have been attempted. */
  authAttempts?: number;
  /** internal: how many rate-limit backoffs have been attempted. */
  rateAttempts?: number;
  /** internal: the user token failed auth even after a refresh → use tenant for this call. */
  userTokenDead?: boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Capped exponential backoff with jitter: ~0.5s, 1s, 2s, … (max 8s). */
const backoff = (attempt: number) => Math.min(8_000, 500 * 2 ** attempt) + Math.floor(Math.random() * 250);
/** Honor a `Retry-After` header (seconds), capped, else null. */
function retryAfterMs(res: Response): number | null {
  const h = res.headers.get('retry-after');
  if (!h) return null;
  const s = Number(h);
  return Number.isFinite(s) ? Math.min(8_000, Math.max(0, s) * 1000) : null;
}

/** Trần dung lượng một lượt tải về — chặn bằng Content-Length trước, rồi chặn lại theo byte thật. */
const MAX_DOWNLOAD_BYTES = 64 * 1024 * 1024;
/** Trần cho tệp GỬI LÊN. Lark chặn 30MB ở im/v1/files; chặn sớm ở đây để báo lỗi hiểu được
 *  thay vì để người dùng chờ hết một lượt đẩy rồi mới nhận một mã lỗi trơ trọi. */
const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;
/** Đẩy vài MB qua mạng Việt Nam chậm hơn một câu truy vấn nhiều — dùng hạn riêng, rộng hơn. */
const UPLOAD_TIMEOUT_MS = 180_000;

/** Hạn cho MỘT lượt tải. Đủ rộng cho tệp lớn, đủ chặt để không treo cả chuỗi thử. */
const DOWNLOAD_TIMEOUT_MS = 90_000;

function qs(params?: Record<string, unknown>): string {
  if (!params) return '';
  const pairs: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    pairs.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return pairs.length ? `?${pairs.join('&')}` : '';
}

export class LarkClient {
  private token: string | null = null;
  private tokenExpiresAt = 0; // epoch ms

  /**
   * When set, supplies a valid `user_access_token` (refreshing it as needed). If it
   * yields a token, requests are made AS THE USER (full access to everything the user
   * can see) instead of as the app (tenant). Returns null to fall back to the tenant
   * token. `force` is passed on an auth-error retry so a stale token gets refreshed.
   */
  userTokenProvider?: (force?: boolean) => Promise<string | null>;

  constructor(
    private readonly appId: string,
    private readonly appSecret: string,
    private readonly host: string = LARK_HOST,
  ) {}

  /** `fetch` with a hard timeout (so a stuck call can't hang the agent loop). */
  /**
   * `timeoutMs` theo TỪNG lời gọi. Trước đây mọi lời gọi đều dùng chung 20s — kể cả TẢI TỆP, nên
   * một tệp đính kèm vài chục MB trên đường truyền chậm bị cắt giữa chừng và hiện ra như lỗi mạng
   * khó hiểu. Lời gọi API JSON vẫn giữ 20s; tải nhị phân được nới rộng.
   */
  private async doFetch(url: string, init: RequestInit, timeoutMs = TIMEOUT_MS): Promise<Response> {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), timeoutMs);
    try {
      return await fetch(url, { ...init, signal: c.signal });
    } finally {
      clearTimeout(t);
    }
  }

  /** Mint (or return the cached) tenant_access_token, refreshing ~5 min early. Retries transport failures. */
  async getTenantAccessToken(force = false): Promise<string> {
    const now = Date.now();
    if (!force && this.token && now < this.tokenExpiresAt - 300_000) return this.token;
    const url = `${this.host}/open-apis/auth/v3/tenant_access_token/internal`;
    let lastErr: unknown;
    for (let attempt = 0; attempt <= MAX_NET_RETRIES; attempt++) {
      try {
        const res = await this.doFetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json; charset=utf-8' },
          body: JSON.stringify({ app_id: this.appId, app_secret: this.appSecret }),
        });
        if (res.status >= 500) {
          lastErr = new Error(`HTTP ${res.status}`);
          if (attempt < MAX_NET_RETRIES) await sleep(backoff(attempt));
          continue;
        }
        const json = (await res.json().catch(() => ({}))) as {
          code?: number;
          msg?: string;
          tenant_access_token?: string;
          expire?: number;
          log_id?: string;
        };
        if (json.code !== 0 || !json.tenant_access_token) {
          // Logical error (bad creds etc.) — not retryable.
          throw new LarkApiError(json.code ?? -1, json.msg || 'không lấy được tenant_access_token', undefined, json.log_id);
        }
        this.token = json.tenant_access_token;
        this.tokenExpiresAt = now + (json.expire ?? 7200) * 1000;
        return this.token;
      } catch (e) {
        if (e instanceof LarkApiError) throw e; // logical error → don't retry
        lastErr = e; // transport/timeout → back off + retry
        if (attempt < MAX_NET_RETRIES) await sleep(backoff(attempt));
      }
    }
    throw new LarkNetworkError('auth/v3/tenant_access_token', lastErr);
  }

  /**
   * Generic authenticated call. Returns `data` on success; throws `LarkApiError` on a
   * non-zero envelope code or `LarkNetworkError` on a transport failure. Bounded retries:
   * transport/5xx (backoff), rate-limit 429/99991400 (Retry-After or backoff), and auth
   * (re-mint once). If a USER-token call still fails auth after a refresh, it falls back
   * to the tenant token for that call instead of failing the whole operation.
   */
  /**
   * Tải NGUYÊN BYTE một tệp (media/attachment) về.
   *
   * `request()` luôn `res.json()` nên không dùng được cho tệp nhị phân: một .xlsx đi qua đó sẽ
   * thành `{}` rồi lỗi. Dùng chung cách lấy token (ưu tiên user token — tệp đính kèm trong Bitable
   * thường CHỈ đọc được bằng quyền của chính người dùng, tenant token bị 403), nhưng đọc ra Buffer.
   *
   * Thử lại một lần với token vừa làm mới khi gặp 401/403 — hệt `request()`, vì tệp đính kèm là
   * đúng chỗ token hết hạn hay lộ ra nhất.
   *
   * `path` nhận được cả ĐƯỜNG DẪN tương đối lẫn URL TUYỆT ĐỐI. Lý do: ô đính kèm của Bitable trả
   * sẵn một `url` đã kèm tham số `extra` ĐÚNG (có cả `rev`) do chính máy chủ Lark sinh ra — dùng
   * lại nguyên văn URL đó chắc ăn hơn mọi cách tự dựng. URL tuyệt đối bị giới hạn đúng host Lark
   * để một `url` bịa trong dữ liệu không kéo được token của ta đi nơi khác.
   */
  /**
   * TẢI LÊN Lark (multipart/form-data) — chiều ngược của `downloadBinary`.
   *
   * Trước bản này client chỉ biết tải XUỐNG, nên agent đọc được tệp người ta gửi tới mà không có
   * cách nào gửi lại tệp do chính nó dựng ra. Ba đích đến đều dùng multipart nhưng KHÁC endpoint
   * và khác tên trường, nên gom vào một chỗ và để nơi gọi khai đích:
   *
   *   im/v1/files          → gửi vào chat, trả `file_key`
   *   drive/v1/files/upload_all → lưu vào thư mục Drive, trả `file_token`
   *   drive/v1/medias/upload_all → đính vào ô Bitable, trả `file_token` (bắt buộc kèm `extra`)
   *
   * `extra` PHẢI là chuỗi JSON, không phải object: `qs()` làm `String(v)` nên một object lọt vào
   * đây sẽ thành `[object Object]` và Lark trả 400 — đúng cái bẫy đã tốn một lần gỡ ở đường tải
   * xuống (xem chú thích `downloadBinary`). Ở đây `extra` đi trong THÂN multipart chứ không phải
   * query, nhưng cùng lý do: phải tự `JSON.stringify` trước.
   *
   * KHÔNG dùng `request()` được: hàm đó ghim `content-type: application/json` và `JSON.stringify`
   * thân — multipart cần trình duyệt/undici tự đặt `boundary`, nên phải để `FormData` tự lo.
   */
  async uploadBinary(
    path: string,
    fields: Record<string, string | number | undefined>,
    file: { name: string; bytes: Buffer; mime?: string },
    retry = true,
  ): Promise<Record<string, unknown>> {
    if (file.bytes.length > MAX_UPLOAD_BYTES) {
      throw new Error(
        `Tệp quá lớn để gửi lên Lark (${(file.bytes.length / 1048576).toFixed(1)}MB, tối đa ${MAX_UPLOAD_BYTES / 1048576}MB).`,
      );
    }
    const userTok = this.userTokenProvider && retry ? await this.userTokenProvider(false).catch(() => null) : null;
    const token = userTok || (await this.getTenantAccessToken(!retry));

    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined && v !== null && v !== '') form.append(k, String(v));
    }
    // `size` là trường BẮT BUỘC của cả ba endpoint và Lark đối chiếu với số byte thật — lệch là
    // 400 với thông báo không nhắc gì tới size.
    form.append('size', String(file.bytes.length));
    form.append(
      'file',
      new Blob([new Uint8Array(file.bytes)], { type: file.mime || 'application/octet-stream' }),
      file.name,
    );

    // Hạn rộng hơn lời gọi JSON thường: đây là đẩy vài MB qua mạng Việt Nam, không phải một câu
    // truy vấn. Hạn ngắn ở đây nghĩa là báo cáo lớn không bao giờ gửi đi được.
    const res = await this.doFetch(
      `${this.host}${path}`,
      { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: form as unknown as BodyInit },
      UPLOAD_TIMEOUT_MS,
    );
    const json = (await res.json().catch(() => ({}))) as { code?: number; msg?: string; data?: Record<string, unknown> };
    if (!res.ok || (json.code ?? 0) !== 0) {
      const logId = res.headers.get('x-tt-logid') || res.headers.get('x-request-id') || '';
      // 401/403 ở lượt ĐẦU thường là token hết hạn — thử lại đúng một lần với token mới, giống
      // cách `request()` làm. Không lặp vô hạn: sai scope thì thử bao nhiêu lần cũng vẫn sai.
      if (retry && (res.status === 401 || res.status === 403)) {
        return this.uploadBinary(path, fields, file, false);
      }
      throw new Error(
        `Gửi tệp lên Lark thất bại (HTTP ${res.status}, code ${json.code ?? '?'}): ${json.msg ?? 'không rõ'}` +
          (logId ? ` [logid ${logId}]` : ''),
      );
    }
    return json.data ?? {};
  }

  async downloadBinary(
    path: string,
    params?: Record<string, unknown>,
    retry = true,
  ): Promise<{ bytes: Buffer; mime: string; fileName?: string }> {
    // `retry=false` là lượt thử LẠI sau 401/403. Trước đây nó vẫn xin user token (chỉ khác cờ làm
    // mới), nên một tài khoản cá nhân không có quyền với tệp này sẽ hỏng HAI lần và KHÔNG BAO GIỜ
    // rơi về token của app — đúng ca mà tenant token lại đọc được (app là cộng tác viên của Base).
    const userTok = this.userTokenProvider && retry ? await this.userTokenProvider(false).catch(() => null) : null;
    const token = userTok || (await this.getTenantAccessToken(!retry));
    let target: string;
    if (/^https?:\/\//i.test(path)) {
      const u = new URL(path);
      const allowed = new URL(this.host).host;
      // Chỉ chấp nhận host của chính Lark (host cấu hình, hoặc miền open-apis của Lark/Feishu).
      if (u.host !== allowed && !/(^|\.)(larksuite|feishu)\.(com|cn)$/i.test(u.host)) {
        throw new Error(`URL tải tệp không thuộc Lark: ${u.host}`);
      }
      target = `${u.toString()}${qs(params).replace(/^\?/, u.search ? '&' : '?')}`;
    } else {
      target = `${this.host}${path}${qs(params)}`;
    }
    // Hạn riêng cho tải tệp: đây là một mắt xích trong CHUỖI thử nhiều cách nối tiếp nhau, một lượt
    // treo là treo cả chuỗi và người dùng chỉ thấy màn hình đứng im.
    let res: Response;
    try {
      res = await this.doFetch(
        target,
        { method: 'GET', headers: { Authorization: `Bearer ${token}` } },
        DOWNLOAD_TIMEOUT_MS,
      );
    } catch (e) {
      const msg = (e as Error)?.name === 'AbortError' || /abort/i.test(String((e as Error)?.message))
        ? `Tải tệp quá ${DOWNLOAD_TIMEOUT_MS / 1000}s chưa xong — bỏ qua cách này.`
        : (e as Error)?.message;
      throw new Error(msg);
    }
    if ((res.status === 401 || res.status === 403) && retry) {
      return this.downloadBinary(path, params, false);
    }
    const ctype = res.headers.get('content-type') || '';
    if (!res.ok) {
      // Endpoint này trả BINARY nên lỗi thường KHÔNG có body JSON — thực tế 400 về với body RỖNG.
      // Thông báo "HTTP 400" trơ trọi không giúp được ai, nên tự diễn giải theo mã trạng thái và
      // giữ lại log-id của Lark (thứ duy nhất bộ phận hỗ trợ của họ tra được).
      const body = (await res.text().catch(() => '')).trim();
      const logId = res.headers.get('x-tt-logid') || res.headers.get('x-request-id') || '';
      const why =
        res.status === 400
          ? 'thiếu hoặc sai tham số `extra` (tệp đính kèm của Bitable có quyền nâng cao bắt buộc phải kèm ngữ cảnh bảng)'
          : res.status === 403
            ? 'không có quyền tải (thiếu scope, hoặc ứng dụng chưa được thêm làm cộng tác viên của tài liệu)'
            : res.status === 404
              ? 'file_token không tồn tại hoặc tệp đã bị xoá'
              : res.status === 429
                ? 'bị giới hạn tần suất (5 QPS) — thử lại sau giây lát'
                : 'lỗi từ phía Lark';
      throw new Error(
        `Tải tệp thất bại (HTTP ${res.status}: ${why})` +
          (body ? ` ${body.slice(0, 200)}` : '') +
          (logId ? ` [logid ${logId}]` : ''),
      );
    }
    // Lark trả JSON khi có LỖI logic dù HTTP 200 — nhận ra bằng content-type để không lưu một
    // thông báo lỗi thành "tệp" rồi bảo người dùng là đã tải xong.
    if (/application\/json/i.test(ctype)) {
      const j = (await res.json().catch(() => ({}))) as { code?: number; msg?: string };
      throw new Error(`Lark từ chối tải tệp (code ${j.code ?? '?'}): ${j.msg ?? 'không rõ'}`);
    }
    // Chặn theo Content-Length TRƯỚC khi đọc: kiểm tra sau khi arrayBuffer() xong nghĩa là một tệp
    // 2GB vẫn được nạp trọn vào RAM rồi mới bị từ chối — tức là đúng lúc cần chặn thì đã muộn.
    const declared = Number(res.headers.get('content-length') || 0);
    if (declared > MAX_DOWNLOAD_BYTES) {
      throw new Error(
        `Tệp quá lớn (${(declared / 1048576).toFixed(1)}MB, tối đa ${MAX_DOWNLOAD_BYTES / 1048576}MB).`,
      );
    }
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length > MAX_DOWNLOAD_BYTES) {
      throw new Error(
        `Tệp quá lớn (${(bytes.length / 1048576).toFixed(1)}MB, tối đa ${MAX_DOWNLOAD_BYTES / 1048576}MB).`,
      );
    }
    const cd = res.headers.get('content-disposition') || '';
    const m = /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(cd);
    return {
      bytes,
      mime: ctype.split(';')[0] || 'application/octet-stream',
      ...(m ? { fileName: decodeURIComponent(m[1]) } : {}),
    };
  }

  async request<T = unknown>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
    const authAttempts = opts.authAttempts ?? 0;
    const rateAttempts = opts.rateAttempts ?? 0;

    // Prefer the user token (acts AS the user → full access); fall back to tenant. Skip
    // the user token entirely once it's been marked dead for this call.
    const userTok =
      this.userTokenProvider && !opts.userTokenDead
        ? await this.userTokenProvider(authAttempts > 0).catch(() => null)
        : null;
    const usingUser = !!userTok;
    const token = userTok || (await this.getTenantAccessToken(authAttempts > 0 && !usingUser));

    // Transport-retry loop for THIS request (network error / timeout / 5xx).
    let res: Response | null = null;
    let netErr: unknown;
    for (let n = 0; n <= MAX_NET_RETRIES; n++) {
      try {
        res = await this.doFetch(`${this.host}${path}${qs(opts.params)}`, {
          method,
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json; charset=utf-8' },
          body: opts.data !== undefined ? JSON.stringify(opts.data) : undefined,
        });
      } catch (e) {
        netErr = e;
        res = null;
        if (n < MAX_NET_RETRIES) await sleep(backoff(n));
        continue;
      }
      if (res.status >= 500 && n < MAX_NET_RETRIES) {
        await sleep(backoff(n));
        res = null;
        continue;
      }
      break;
    }
    if (!res) throw new LarkNetworkError(path, netErr);

    // HTTP-level rate limit (before the envelope) — honor Retry-After.
    if (res.status === 429 && rateAttempts < MAX_RATE_RETRIES) {
      await sleep(retryAfterMs(res) ?? backoff(rateAttempts));
      return this.request<T>(method, path, { ...opts, rateAttempts: rateAttempts + 1 });
    }

    const json = (await res.json().catch(() => ({}))) as {
      code?: number;
      msg?: string;
      data?: T;
      log_id?: string;
      request_id?: string;
    };
    const logId = json.log_id ?? json.request_id;

    if (json.code === 0) return json.data as T;

    // Token expired/invalid → re-mint once and retry.
    if (json.code !== undefined && AUTH_CODES.has(json.code) && authAttempts < MAX_AUTH_RETRIES) {
      if (!usingUser) await this.getTenantAccessToken(true);
      return this.request<T>(method, path, { ...opts, authAttempts: authAttempts + 1 });
    }
    // User token still auth-failing after a refresh → fall back to the tenant token for
    // this call (degrade gracefully instead of failing the whole operation).
    if (json.code !== undefined && AUTH_CODES.has(json.code) && usingUser && !opts.userTokenDead) {
      return this.request<T>(method, path, { ...opts, userTokenDead: true, authAttempts: 0 });
    }
    // Frequency control → capped backoff, then retry.
    if (json.code !== undefined && RATE_CODES.has(json.code) && rateAttempts < MAX_RATE_RETRIES) {
      await sleep(retryAfterMs(res) ?? backoff(rateAttempts));
      return this.request<T>(method, path, { ...opts, rateAttempts: rateAttempts + 1 });
    }
    throw new LarkApiError(json.code ?? res.status, json.msg || res.statusText, path, logId);
  }

  // ── Convenience wrappers used by connect/summary (tools call request directly) ──

  /** Tenant display name (best-effort; requires the tenant scope). */
  async tenantName(): Promise<string | undefined> {
    try {
      const d = await this.request<{ tenant?: { name?: string } }>('GET', '/open-apis/tenant/v2/tenant/query');
      return d.tenant?.name;
    } catch {
      return undefined;
    }
  }

  /** Base metadata — used to resolve a friendly name for a registered app_token. */
  getBaseApp(appToken: string) {
    return this.request<{ app: { name: string; app_token: string } }>(
      'GET',
      `/open-apis/bitable/v1/apps/${encodeURIComponent(appToken)}`,
    );
  }

  listTables(appToken: string, pageToken?: string) {
    return this.request<{ items: { table_id: string; name: string }[]; page_token?: string; has_more?: boolean }>(
      'GET',
      `/open-apis/bitable/v1/apps/${encodeURIComponent(appToken)}/tables`,
      { params: { page_size: 100, page_token: pageToken } },
    );
  }

  /**
   * List ALL tables of a Base, following pagination (the API returns up to
   * page_size=100 per page + a page_token / has_more). Returns the full set so the
   * agent never sees a truncated list.
   */
  async listAllTables(appToken: string): Promise<{ items: { table_id: string; name: string }[]; total: number }> {
    const all: { table_id: string; name: string }[] = [];
    let pageToken: string | undefined;
    do {
      const r = await this.listTables(appToken, pageToken);
      if (Array.isArray(r.items)) all.push(...r.items);
      pageToken = r.has_more ? r.page_token : undefined;
    } while (pageToken);
    return { items: all, total: all.length };
  }
}
