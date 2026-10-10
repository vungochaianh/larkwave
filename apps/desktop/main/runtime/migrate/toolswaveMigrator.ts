/**
 * Nhập dữ liệu cũ của app desktop Toolswave vào Larkwave (một lần sau lần đăng nhập đầu, và nút
 * "Nhập lại dữ liệu từ Toolswave" trong Cài đặt).
 *
 * Vì sao làm được theo "cùng một user id": từ 10/2026 Larkwave dùng chung hệ tài khoản với
 * Toolswave (cùng API `api.toolswave.net`, cùng cuid), nên `lark/sessions/<userId>` bên Toolswave
 * chính là `lark/sessions/<userId>` bên này.
 *
 * Những luật KHÔNG ĐƯỢC PHÁ:
 *   1. Thư mục Toolswave là CHỈ ĐỌC. Chỉ `readFile/readdir/stat` ở phía nguồn; mọi lệnh ghi đi qua
 *      `writeDest`/`copyDest`, và hai hàm đó từ chối mọi đích nằm trong một thư mục nguồn.
 *   2. Không đụng dữ liệu MÃ HOÁ: mọi `*.bin` (safeStorage — App Secret Lark, bot, OAuth cá nhân,
 *      token tài khoản/runner/Claude), cookie trong `Partitions/`, Keychain/DPAPI. Trường trông như
 *      bí mật trong tệp JSON thường cũng bị bỏ (chỉ trường đó, phần còn lại giữ).
 *   3. Không ghi đè dữ liệu Larkwave mới hơn: hội thoại hợp nhất bằng `mergeSession` (hợp item theo
 *      id, bản mới hơn quyết định thứ tự), Đặc tả bằng `mergeSpec`; settings/automations/
 *      registry thì bản Larkwave thắng khi trùng khoá; tệp đã có thì bỏ qua.
 *   4. `_local` (dữ liệu lúc chưa đăng nhập) chỉ vào `_local` bên này — không tự nhận vào tài khoản
 *      (bất biến chống rò rỉ của larkService.setAccount). Tệp phẳng kiểu cũ cũng vào `_local`.
 *   5. Hội thoại Larkwave đã xoá (bia mộ) không được nhập lại.
 *   6. Chạy lại bao nhiêu lần cũng ra cùng kết quả (mọi bước là hợp tập hợp / bỏ qua nếu đã có).
 *
 * Thuần Node (không electron) để bài kiểm chạy được trên fixture.
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rename, stat, writeFile, copyFile } from 'node:fs/promises';
import { join, resolve, sep, dirname } from 'node:path';
import { mergeSession, mergeSpec, type StoredSession } from '../lark/larkMerge';
import { claudeProjectDirFor, claudeProjectsDir, copyClaudeSession, findClaudeTranscript, isSessionId } from '../claudeSessions';
import type { LarkSpecDoc, ToolswaveMigrationCategory, ToolswaveMigrationReport } from '@larkwave/core';

export type MigrateCategory = ToolswaveMigrationCategory;
export type MigrateReport = ToolswaveMigrationReport;
export interface CategoryCount {
  /** Mục mới được chép sang (hoặc SẼ chép, ở chế độ chạy thử). */
  added: number;
  /** Mục đã có ở Larkwave và được hợp nhất thêm phần còn thiếu. */
  merged: number;
  /** Mục đã có đủ ở Larkwave — không làm gì. */
  unchanged: number;
}

export interface MigrateOpts {
  /** Thư mục userData của Toolswave tìm được (findToolswaveDataDirs). */
  sources: string[];
  /** userData của Larkwave. */
  dest: string;
  /** User id của tài khoản đang đăng nhập (JWT `sub`). */
  userId: string;
  dryRun?: boolean;
  /** Giới hạn tệp làm việc (lark/work) — chỉ chép tệp nhỏ. */
  maxWorkFileBytes?: number;
  maxWorkTotalBytes?: number;
  /**
   * Môi trường của Claude CLI (để tính đúng `~/.claude/projects` và slug) — mặc định process.env.
   * Bài kiểm trỏ `CLAUDE_CONFIG_DIR` vào fixture.
   */
  claudeEnv?: Record<string, string | undefined>;
  /** Chỉ chạy hạng mục hội thoại (+ nối lại phiên Claude) — lượt bổ sung cho tài khoản đã nhập trước bản này. */
  sessionsOnly?: boolean;
}

export const FOLLOW_UPS = [
  'Đăng nhập Lark web một lần (quét QR) — phiên/cookie Lark của Toolswave được mã hoá riêng cho app đó nên không chép sang.',
  'Nếu bạn dùng "Lark Bot (App ID)": nhập lại App Secret ở mục Lark Bot (App ID) — App Secret được mã hoá bằng khoá của app Toolswave nên không chép sang.',
];

/** Thư mục userData của app desktop Toolswave, theo thứ tự ưu tiên (bản cài trước, bản dev sau). */
export function toolswaveDataDirCandidates(platform: string, home: string, appData?: string): string[] {
  const roots: string[] = [];
  if (platform === 'darwin') roots.push(join(home, 'Library', 'Application Support'));
  else if (platform === 'win32') roots.push(appData || join(home, 'AppData', 'Roaming'));
  else roots.push(process.env.XDG_CONFIG_HOME || join(home, '.config'));
  const out: string[] = [];
  for (const r of roots) {
    out.push(join(r, '@toolswave', 'desktop'));
    out.push(join(r, '@toolswave', 'desktop (development)'));
    out.push(join(r, 'toolswave-desktop'));
  }
  return out;
}

/** Ứng viên nào thực sự có dữ liệu Lark/kỹ năng (bỏ thư mục chỉ có cache Chromium). */
export function findToolswaveDataDirs(candidates: string[], dest: string): string[] {
  const d = resolve(dest);
  return candidates.filter((c) => {
    const r = resolve(c);
    if (r === d) return false;
    return existsSync(join(c, 'lark')) || existsSync(join(c, 'skills')) || existsSync(join(c, 'plugins'));
  });
}

// ── bí mật ────────────────────────────────────────────────────────────────────────────────────

/** Tên trường chứa bí mật. KHÔNG gồm `appToken`/`tableId` — đó là định danh Base, không bí mật. */
const SECRET_KEY = /^(app_?secret|secret|client_?secret|access_?token|refresh_?token|user_?access_?token|tenant_?access_?token|encrypt_?key|verification_?token|password|passwd|api_?key|apikey|cookie|cookies|csrf(_?token)?|session_?token|private_?key|jwt|token)$/i;

/** Chuỗi trông như blob safeStorage/OSCrypt (v10/v11 thô hoặc base64) hoặc blob dự phòng `PLAIN:`. */
export function looksEncrypted(v: string): boolean {
  if (/^v1[01]/.test(v) && /[^\x20-\x7e]/.test(v)) return true; // OSCrypt thô
  if (/^(djEw|djEx)[A-Za-z0-9+/=]{16,}$/.test(v)) return true; // base64 của "v10"/"v11"
  if (v.startsWith('PLAIN:')) return true;
  return false;
}

/** Bỏ trường bí mật khỏi một giá trị JSON (đệ quy). Trả về bản sạch + số trường đã bỏ. */
export function stripSecrets<T>(value: T): { value: T; dropped: number } {
  let dropped = 0;
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        if (SECRET_KEY.test(k) && x !== null && x !== undefined && typeof x !== 'boolean') {
          dropped++;
          continue;
        }
        if (typeof x === 'string' && looksEncrypted(x)) {
          dropped++;
          continue;
        }
        out[k] = walk(x);
      }
      return out;
    }
    return v;
  };
  return { value: walk(value) as T, dropped };
}

/** Nội dung tệp có phải blob mã hoá / nhị phân (không phải JSON văn bản) không. */
export function isEncryptedBlob(buf: Buffer): boolean {
  if (buf.length === 0) return false;
  const head = buf.subarray(0, 6).toString('latin1');
  if (head.startsWith('PLAIN:')) return true;
  if (head.startsWith('v10') || head.startsWith('v11')) return true;
  // Byte điều khiển (ngoài tab/xuống dòng) ở 512 byte đầu ⇒ nhị phân.
  const n = Math.min(buf.length, 512);
  for (let i = 0; i < n; i++) {
    const b = buf[i]!;
    if (b === 0 || (b < 9) || (b > 13 && b < 32)) return true;
  }
  return false;
}

// ── trợ giúp đọc/ghi ──────────────────────────────────────────────────────────────────────────

const scopeOf = (id: string) => id.replace(/[^A-Za-z0-9_-]/g, '') || '_local';

async function ls(dir: string): Promise<string[]> {
  try {
    return await readdir(dir);
  } catch {
    return [];
  }
}
async function isDir(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isDirectory();
  } catch {
    return false;
  }
}

function emptyCounts(): Record<MigrateCategory, CategoryCount> {
  const cats: MigrateCategory[] = ['sessions', 'claudeSessions', 'deleted', 'specs', 'larkConfig', 'automations', 'bases', 'relogin', 'workFiles', 'skills', 'plugins'];
  return Object.fromEntries(cats.map((c) => [c, { added: 0, merged: 0, unchanged: 0 }])) as Record<MigrateCategory, CategoryCount>;
}

class Ctx {
  readonly report: MigrateReport;
  private readonly srcRoots: string[];
  constructor(
    readonly o: MigrateOpts,
    readonly dryRun: boolean,
  ) {
    this.srcRoots = o.sources.map((s) => resolve(s) + sep);
    this.report = {
      dryRun,
      userId: o.userId,
      sources: o.sources,
      at: new Date().toISOString(),
      counts: emptyCounts(),
      skipped: [],
      droppedSecretFields: 0,
      followUps: [...FOLLOW_UPS],
    };
  }
  /** Chốt luật 1: không bao giờ ghi vào trong một thư mục nguồn. */
  private guard(p: string): void {
    const r = resolve(p);
    if (this.srcRoots.some((s) => (r + sep).startsWith(s))) throw new Error(`từ chối ghi vào thư mục Toolswave: ${p}`);
  }
  async writeDest(p: string, data: string): Promise<void> {
    this.guard(p);
    if (this.dryRun) return;
    await mkdir(dirname(p), { recursive: true });
    const tmp = `${p}.${process.pid}.migrate.tmp`;
    await writeFile(tmp, data);
    await rename(tmp, p);
  }
  /** Chốt luật 1 cho đích nằm NGOÀI userData (thư mục phiên của Claude CLI). */
  guardDest(p: string): void {
    this.guard(p);
  }
  async mkdirDest(p: string): Promise<void> {
    this.guard(p);
    if (this.dryRun) return;
    await mkdir(p, { recursive: true });
  }
  async copyDest(from: string, to: string): Promise<void> {
    this.guard(to);
    if (this.dryRun) return;
    await mkdir(dirname(to), { recursive: true });
    await copyFile(from, to);
  }
  count(c: MigrateCategory, k: keyof CategoryCount, n = 1): void {
    this.report.counts[c][k] += n;
  }
  skip(src: string, abs: string, reason: string): void {
    const rel = abs.startsWith(src) ? abs.slice(src.length).replace(/^[\\/]+/, '') : abs;
    // Gộp lý do giống nhau theo mẫu đường dẫn (ẩn id) để báo cáo gọn và không lộ dữ liệu.
    const masked = rel.replace(/[A-Za-z0-9_-]{20,}/g, '<id>').replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, '<uuid>');
    if (!this.report.skipped.some((s) => s.path === masked && s.reason === reason)) this.report.skipped.push({ path: masked, reason });
  }
  async readJson<T>(src: string, p: string): Promise<T | null> {
    let buf: Buffer;
    try {
      buf = await readFile(p);
    } catch {
      return null;
    }
    if (isEncryptedBlob(buf)) {
      this.skip(src, p, 'mã hoá (safeStorage) — không giải mã');
      return null;
    }
    try {
      const { value, dropped } = stripSecrets(JSON.parse(buf.toString('utf8')) as T);
      this.report.droppedSecretFields += dropped;
      return value;
    } catch {
      this.skip(src, p, 'JSON hỏng');
      return null;
    }
  }
}

async function readDestJson<T>(p: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(p, 'utf8')) as T;
  } catch {
    return null;
  }
}

// ── từng hạng mục ────────────────────────────────────────────────────────────────────────────

/** Nguồn → các cặp (thư mục phạm vi nguồn, phạm vi đích). Chỉ user hiện tại + `_local`. */
function scopesFor(userId: string): { from: string; to: string }[] {
  const u = scopeOf(userId);
  return [
    { from: u, to: u },
    { from: '_local', to: '_local' },
  ];
}

async function migrateSessions(ctx: Ctx, src: string, migratedIds: Set<string>): Promise<void> {
  const root = join(src, 'lark', 'sessions');
  const dest = join(ctx.o.dest, 'lark', 'sessions');
  // Tệp phẳng kiểu cũ (trước khi chia theo tài khoản) → `_local`.
  const jobs: { file: string; to: string }[] = [];
  for (const f of await ls(root)) if (f.endsWith('.json')) jobs.push({ file: join(root, f), to: '_local' });
  for (const { from, to } of scopesFor(ctx.o.userId)) {
    for (const f of await ls(join(root, from))) if (f.endsWith('.json')) jobs.push({ file: join(root, from, f), to });
  }
  const tombs = new Map<string, Record<string, number>>();
  for (const job of jobs) {
    if (!tombs.has(job.to)) tombs.set(job.to, (await readDestJson<Record<string, number>>(join(ctx.o.dest, 'lark', 'deleted', job.to, 'deleted.json'))) ?? {});
    const s = await ctx.readJson<StoredSession>(src, job.file);
    if (!s || typeof s.id !== 'string' || !s.id) continue;
    if (tombs.get(job.to)![s.id]) {
      ctx.skip(src, job.file, 'đã xoá ở Larkwave (bia mộ) — không nhập lại');
      continue;
    }
    const target = join(dest, job.to, `${scopeOf(s.id)}.json`);
    const ex = await readDestJson<StoredSession>(target);
    // Phiên Claude CLI của hội thoại bên Toolswave. Nó nằm ở thư mục slug của cwd TOOLSWAVE nên
    // `--resume` từ thư mục Larkwave sẽ báo "không tìm thấy" — chép bản ghi gốc sang slug của
    // Larkwave thì CLI nối lại đúng phiên đó, nhớ trọn (kể cả kết quả công cụ) thay vì chỉ một
    // bản chữ rút gọn.
    const twSid = activeSessionId(s);
    const exSid = ex ? activeSessionId(ex) : null;
    // Larkwave đã chạy tiếp hội thoại này bằng phiên CỦA NÓ (khác id) → phiên đó mới là phần nối
    // tiếp, giữ nguyên. Còn lại (chưa có / trùng id) thì nối phiên gốc.
    const linked = twSid && (!exSid || exSid === twSid) ? await linkClaudeSession(ctx, src, s.id, twSid) : false;
    if (!ex) {
      const next: StoredSession = linked ? { ...s, claudeSessionId: twSid!, agentSessionId: twSid! } : { ...s, claudeSessionId: '' };
      // Không thấy bản ghi phiên ở đâu cả: bỏ id để lượt sau mở phiên mới, nối tiếp bằng lịch sử.
      if (!linked) delete next.agentSessionId;
      await ctx.writeDest(target, JSON.stringify(next, null, 2));
      ctx.count('sessions', 'added');
      migratedIds.add(s.id);
      continue;
    }
    const merged = mergeSession(ex, s);
    const adopt = linked && !exSid; // hội thoại có sẵn ở Larkwave (vd kéo từ bản sao lưu) nhưng chưa có phiên CLI
    if (merged === ex && !adopt) {
      ctx.count('sessions', 'unchanged');
      continue;
    }
    // Giữ id phiên CLI của Larkwave (nó mới chạy được ở thư mục này) — hoặc nhận phiên gốc vừa nối.
    const keep: StoredSession = adopt
      ? { ...merged, claudeSessionId: twSid!, agentSessionId: twSid! }
      : { ...merged, claudeSessionId: ex.claudeSessionId, ...(ex.agentSessionId ? { agentSessionId: ex.agentSessionId } : {}) };
    if (!adopt && !ex.agentSessionId) delete keep.agentSessionId;
    await ctx.writeDest(target, JSON.stringify(keep, null, 2));
    ctx.count('sessions', merged === ex ? 'unchanged' : 'merged');
    migratedIds.add(s.id);
  }
}

/** Id phiên CLI mà lượt kế tiếp sẽ `--resume` (cùng luật với larkService.loadTurnState). */
function activeSessionId(s: StoredSession): string | null {
  const id = s.agentSessionId || s.claudeSessionId || '';
  return isSessionId(id) ? id : null;
}

/**
 * Chép `<sid>.jsonl` (+ thư mục phụ `<sid>/`) từ slug của thư mục làm việc Toolswave sang slug của
 * thư mục làm việc Larkwave (tạo sẵn thư mục làm việc để realpath khớp đúng thứ CLI sẽ thấy).
 * Không thấy ở slug Toolswave thì tìm đúng id ở mọi thư mục dự án (phiên cũ từng chạy ở cwd khác).
 * Trả về true khi đích có bản ghi dùng được (vừa chép, vừa cập nhật, hoặc đã có sẵn).
 */
async function linkClaudeSession(ctx: Ctx, src: string, convId: string, sid: string): Promise<boolean> {
  const env = ctx.o.claudeEnv ?? process.env;
  const projects = claudeProjectsDir(env);
  const workDir = join(ctx.o.dest, 'lark', 'work', scopeOf(convId));
  // Slug tính trên đường dẫn đã chuẩn hoá; thư mục làm việc CHỈ được tạo khi thật sự có phiên để chép
  // (không đẻ thư mục rỗng cho mọi hội thoại), và tính lại slug sau khi tạo (realpath — đúng thứ CLI thấy).
  let toDir = claudeProjectDirFor(workDir, env);
  const fromPreferred = claudeProjectDirFor(join(src, 'lark', 'work', scopeOf(convId)), env);
  const found = await findClaudeTranscript(sid, { projectsDir: projects, preferDirs: [fromPreferred], excludeDirs: [toDir] });
  if (!found) {
    // Có thể đã nằm sẵn ở đích (lần nhập trước, hoặc CLI đã chạy ở thư mục Larkwave).
    const already = await findClaudeTranscript(sid, { projectsDir: projects, preferDirs: [toDir] });
    if (already && already.dir === toDir) {
      ctx.count('claudeSessions', 'unchanged');
      return true;
    }
    ctx.skip(src, join(src, 'lark', 'sessions', `${convId}.json`), 'không còn bản ghi phiên Claude CLI trên máy — lượt sau nối lại bằng lịch sử hội thoại');
    return false;
  }
  if (!ctx.dryRun) {
    await ctx.mkdirDest(workDir);
    toDir = claudeProjectDirFor(workDir, env);
  }
  ctx.guardDest(toDir);
  const r = await copyClaudeSession({ sessionId: sid, fromDir: found.dir, toDir, dryRun: ctx.dryRun });
  if (r.status === 'copied') ctx.count('claudeSessions', 'added');
  else if (r.status === 'updated') ctx.count('claudeSessions', 'merged');
  else if (r.status === 'unchanged') ctx.count('claudeSessions', 'unchanged');
  else if (r.status === 'diverged') {
    ctx.count('claudeSessions', 'unchanged');
    ctx.skip(src, join(src, 'lark', 'sessions', `${convId}.json`), 'phiên Claude đã chạy tiếp ở cả hai app — giữ bản Larkwave, không ghi đè');
  }
  return r.status !== 'missing';
}

async function migrateDeleted(ctx: Ctx, src: string): Promise<void> {
  for (const { from, to } of scopesFor(ctx.o.userId)) {
    const p = join(src, 'lark', 'deleted', from, 'deleted.json');
    const remote = await ctx.readJson<Record<string, number>>(src, p);
    if (!remote) continue;
    const target = join(ctx.o.dest, 'lark', 'deleted', to, 'deleted.json');
    const ex = (await readDestJson<Record<string, number>>(target)) ?? {};
    const next = { ...ex };
    let changed = 0;
    for (const [id, at] of Object.entries(remote)) {
      if (typeof at !== 'number') continue;
      // Xoá ở Toolswave ⇒ hội thoại đó cũng không nên hiện ở đây (nó có thể đã được kéo về từ
      // bản sao lưu trước đó). Giữ mốc SỚM nhất — đúng luật bia mộ của larkBackupSync.
      if (!next[id] || at < next[id]!) {
        next[id] = at;
        changed++;
      }
    }
    if (!changed) {
      ctx.count('deleted', 'unchanged');
      continue;
    }
    await ctx.writeDest(target, JSON.stringify(next));
    ctx.count('deleted', Object.keys(ex).length ? 'merged' : 'added');
  }
}

async function migrateSpecs(ctx: Ctx, src: string): Promise<void> {
  for (const { from, to } of scopesFor(ctx.o.userId)) {
    const remote = await ctx.readJson<LarkSpecDoc>(src, join(src, 'lark', 'specs', from, 'spec.json'));
    if (!remote) continue;
    const target = join(ctx.o.dest, 'lark', 'specs', to, 'spec.json');
    const ex = await readDestJson<LarkSpecDoc>(target);
    const merged = mergeSpec(ex, remote);
    if (!merged) continue;
    if (ex && JSON.stringify(merged) === JSON.stringify(ex)) {
      ctx.count('specs', 'unchanged');
      continue;
    }
    await ctx.writeDest(target, JSON.stringify(merged, null, 2));
    ctx.count('specs', ex ? 'merged' : 'added');
  }
}

/** Các trường settings riêng máy/app — không bao giờ mang sang. */
const MACHINE_ONLY_SETTINGS = new Set(['runnerId']);

async function migrateLarkConfig(ctx: Ctx, src: string): Promise<void> {
  const pairs: { dir: string; to: string }[] = [
    // Cấu hình phẳng kiểu cũ (`lark/settings.json` …) → `_local`, như SecretStore.migrateLegacyRootOnce.
    { dir: join(src, 'lark'), to: '_local' },
    ...scopesFor(ctx.o.userId).map(({ from, to }) => ({ dir: join(src, 'lark', 'accounts', from), to })),
  ];
  for (const { dir, to } of pairs) {
    const tdir = join(ctx.o.dest, 'lark', 'accounts', to);
    for (const f of await ls(dir)) {
      if (f.endsWith('.bin')) ctx.skip(src, join(dir, f), 'mã hoá (safeStorage) — App Secret/bot/OAuth cá nhân: nhập lại');
    }
    // settings.json — Larkwave thắng khi trùng khoá.
    const st = await ctx.readJson<Record<string, unknown>>(src, join(dir, 'settings.json'));
    if (st) {
      for (const k of MACHINE_ONLY_SETTINGS) delete st[k];
      const target = join(tdir, 'settings.json');
      const ex = await readDestJson<Record<string, unknown>>(target);
      const merged = { ...st, ...(ex ?? {}) };
      if (ex && JSON.stringify(merged) === JSON.stringify(ex)) ctx.count('larkConfig', 'unchanged');
      else {
        await ctx.writeDest(target, JSON.stringify(merged, null, 2));
        ctx.count('larkConfig', ex ? 'merged' : 'added');
      }
    }
    // bases.json — hợp theo appToken.
    const bases = await ctx.readJson<{ appToken?: string }[]>(src, join(dir, 'bases.json'));
    if (Array.isArray(bases)) {
      const target = join(tdir, 'bases.json');
      const ex = (await readDestJson<{ appToken?: string }[]>(target)) ?? [];
      const have = new Set(ex.map((b) => b?.appToken));
      const add = bases.filter((b) => b?.appToken && !have.has(b.appToken));
      ctx.count('bases', 'added', add.length);
      ctx.count('bases', 'unchanged', bases.length - add.length);
      if (add.length) await ctx.writeDest(target, JSON.stringify([...ex, ...add], null, 2));
    }
    // automations.json — hợp theo id, Larkwave thắng.
    const autos = await ctx.readJson<{ id?: string }[]>(src, join(dir, 'automations.json'));
    if (Array.isArray(autos)) {
      const target = join(tdir, 'automations.json');
      const ex = (await readDestJson<{ id?: string }[]>(target)) ?? [];
      const have = new Set(ex.map((a) => a?.id));
      const add = autos.filter((a) => a?.id && !have.has(a.id));
      ctx.count('automations', 'added', add.length);
      ctx.count('automations', 'unchanged', autos.length - add.length);
      if (add.length) await ctx.writeDest(target, JSON.stringify([...ex, ...add], null, 2));
    }
  }
}

async function migrateRelogin(ctx: Ctx, src: string): Promise<void> {
  for (const { from, to } of scopesFor(ctx.o.userId)) {
    const p = join(src, `lark-relogin-${from}.json`);
    const remote = await ctx.readJson<{ at?: string }[]>(src, p);
    if (!Array.isArray(remote)) continue;
    const target = join(ctx.o.dest, `lark-relogin-${to}.json`);
    const ex = (await readDestJson<{ at?: string }[]>(target)) ?? [];
    const have = new Set(ex.map((e) => e?.at));
    const add = remote.filter((e) => e?.at && !have.has(e.at));
    if (!add.length) {
      ctx.count('relogin', 'unchanged');
      continue;
    }
    const next = [...ex, ...add].sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 30);
    await ctx.writeDest(target, JSON.stringify(next));
    ctx.count('relogin', ex.length ? 'merged' : 'added');
  }
}

/**
 * `lark/grants.json` (chính sách uỷ quyền cho bạn bè) CỐ Ý không chép: hàng đợi lượt uỷ quyền
 * nằm trên máy chủ dùng chung, và cổng uỷ quyền chỉ phục vụ quyền có chính sách tại máy. Chép
 * sang là hai app cùng bốc một lượt (máy chủ không giành lượt nguyên tử) → chạy hai lần. Quyền tạo
 * ở Toolswave tiếp tục do app Toolswave phục vụ.
 */
async function noteGrants(ctx: Ctx, src: string): Promise<void> {
  const p = join(src, 'lark', 'grants.json');
  if (existsSync(p)) ctx.skip(src, p, 'quyền uỷ quyền cho bạn bè — app Toolswave tiếp tục phục vụ (tránh một lượt chạy hai lần)');
}

async function migrateWorkFiles(ctx: Ctx, src: string, ids: Set<string>): Promise<void> {
  const maxFile = ctx.o.maxWorkFileBytes ?? 5 * 1024 * 1024;
  let budget = ctx.o.maxWorkTotalBytes ?? 200 * 1024 * 1024;
  const root = join(src, 'lark', 'work');
  for (const conv of await ls(root)) {
    if (!ids.has(conv) && conv !== 'sched-files') continue;
    const walk = async (rel: string): Promise<void> => {
      const abs = join(root, conv, rel);
      for (const f of await ls(abs)) {
        const a = join(abs, f);
        const r = rel ? join(rel, f) : f;
        // Thư mục cấu hình CLI (.claude/…) trong cwd của hội thoại: bỏ — có thể chứa trạng thái phiên.
        if (f.startsWith('.')) continue;
        if (await isDir(a)) {
          await walk(r);
          continue;
        }
        let size = 0;
        try {
          size = (await stat(a)).size;
        } catch {
          continue;
        }
        if (size > maxFile || size > budget) {
          ctx.skip(src, a, 'tệp làm việc quá lớn');
          continue;
        }
        const to = join(ctx.o.dest, 'lark', 'work', conv, r);
        if (existsSync(to)) {
          ctx.count('workFiles', 'unchanged');
          continue;
        }
        budget -= size;
        await ctx.copyDest(a, to);
        ctx.count('workFiles', 'added');
      }
    };
    await walk('');
  }
}

/** Chép nguyên một thư mục (bỏ tệp ẩn), không ghi đè tệp đã có. Trả về số tệp mới. */
async function copyTree(ctx: Ctx, from: string, to: string): Promise<number> {
  let n = 0;
  for (const f of await ls(from)) {
    if (f.startsWith('.')) continue;
    const a = join(from, f);
    const b = join(to, f);
    if (await isDir(a)) n += await copyTree(ctx, a, b);
    else if (!existsSync(b)) {
      const buf = await readFile(a).catch(() => null);
      if (!buf) continue;
      if (f.endsWith('.bin') || (f.endsWith('.json') && isEncryptedBlob(buf))) {
        ctx.skip(ctx.o.sources.find((s) => a.startsWith(s)) ?? '', a, 'mã hoá — không giải mã');
        continue;
      }
      await ctx.copyDest(a, b);
      n++;
    }
  }
  return n;
}

async function migrateSkills(ctx: Ctx, src: string): Promise<void> {
  const sdir = join(src, 'skills');
  const tdir = join(ctx.o.dest, 'skills');
  const reg = await ctx.readJson<{ id?: string }[]>(src, join(sdir, 'registry.json'));
  if (!Array.isArray(reg)) return;
  const ex = (await readDestJson<{ id?: string }[]>(join(tdir, 'registry.json'))) ?? [];
  const have = new Set(ex.map((e) => e?.id));
  const add: { id?: string }[] = [];
  for (const e of reg) {
    if (!e?.id || typeof e.id !== 'string' || !/^[A-Za-z0-9_.-]+$/.test(e.id)) continue;
    const lib = join(sdir, 'lib', e.id);
    if (have.has(e.id)) {
      ctx.count('skills', 'unchanged');
      continue;
    }
    if (!existsSync(join(lib, 'SKILL.md'))) {
      ctx.skip(src, lib, 'kỹ năng thiếu SKILL.md');
      continue;
    }
    await copyTree(ctx, lib, join(tdir, 'lib', e.id));
    add.push(e);
    ctx.count('skills', 'added');
  }
  if (add.length) await ctx.writeDest(join(tdir, 'registry.json'), JSON.stringify([...ex, ...add], null, 2));
  // Lịch sử sửa (snapshots) + lượt chạy bộ kỹ năng chéo (set-runs): hợp theo khoá, Larkwave thắng.
  for (const f of ['snapshots.json', 'set-runs.json']) {
    const remote = await ctx.readJson<Record<string, unknown>>(src, join(sdir, f));
    if (!remote || typeof remote !== 'object' || Array.isArray(remote)) continue;
    const target = join(tdir, f);
    const cur = (await readDestJson<Record<string, unknown>>(target)) ?? {};
    const keys = Object.keys(remote).filter((k) => !(k in cur));
    if (!keys.length) continue;
    const next = { ...cur };
    for (const k of keys) next[k] = remote[k];
    await ctx.writeDest(target, JSON.stringify(next, null, 2));
  }
  if (existsSync(join(sdir, 'disabled'))) ctx.skip(src, join(sdir, 'disabled'), 'bố cục kỹ năng cũ (trước 1.0.25) — đã có trong lib');
}

async function migratePlugins(ctx: Ctx, src: string): Promise<void> {
  const pdir = join(src, 'plugins');
  const tdir = join(ctx.o.dest, 'plugins');
  const reg = await ctx.readJson<{ id?: string }[]>(src, join(pdir, 'registry.json'));
  if (Array.isArray(reg)) {
    const ex = (await readDestJson<{ id?: string }[]>(join(tdir, 'registry.json'))) ?? [];
    const have = new Set(ex.map((e) => e?.id));
    const add: { id?: string }[] = [];
    for (const e of reg) {
      if (!e?.id || typeof e.id !== 'string' || !/^[A-Za-z0-9_.-]+$/.test(e.id)) continue;
      if (have.has(e.id)) {
        ctx.count('plugins', 'unchanged');
        continue;
      }
      await copyTree(ctx, join(pdir, e.id), join(tdir, e.id));
      add.push(e);
      ctx.count('plugins', 'added');
    }
    if (add.length) await ctx.writeDest(join(tdir, 'registry.json'), JSON.stringify([...ex, ...add], null, 2));
  }
  const keys = await ctx.readJson<string[]>(src, join(pdir, 'trusted-keys.json'));
  if (Array.isArray(keys)) {
    const target = join(tdir, 'trusted-keys.json');
    const ex = (await readDestJson<string[]>(target)) ?? [];
    const add = keys.filter((k) => typeof k === 'string' && !ex.includes(k));
    if (add.length) await ctx.writeDest(target, JSON.stringify([...ex, ...add], null, 2));
  }
}

/** Những thứ cố ý KHÔNG chép (ghi vào báo cáo để người dùng biết vì sao). */
async function noteIntentionalSkips(ctx: Ctx, src: string): Promise<void> {
  const notes: [string, string][] = [
    ['Partitions', 'phiên/cookie Lark web — mã hoá theo app Toolswave: đăng nhập Lark web lại (QR)'],
    ['account', 'token tài khoản (mã hoá) — đăng nhập Larkwave bằng chính tài khoản Toolswave'],
    ['runners', 'khoá API runner (mã hoá) — nhập lại trong Cài đặt nếu dùng'],
    ['claude', 'token/khoá Claude (mã hoá) — kết nối lại trong Cài đặt nếu dùng'],
    ['agent', 'điều khiển từ xa — không bật tự động (tránh hai app cùng nhận một lệnh)'],
    ['Local Storage', 'tuỳ chọn giao diện (kể cả "Hỏi nhanh của tôi") nằm trong kho trình duyệt của app Toolswave — không đọc'],
    ['apps', 'dự án App Builder — không thuộc Larkwave'],
  ];
  for (const [d, why] of notes) if (existsSync(join(src, d))) ctx.skip(src, join(src, d), why);
}

/**
 * Chạy (hoặc chạy thử) việc nhập. Chạy thử: đếm y như thật nhưng không ghi gì.
 */
export async function migrateFromToolswave(o: MigrateOpts): Promise<MigrateReport> {
  if (!o.userId) throw new Error('Cần đăng nhập để nhập dữ liệu theo đúng tài khoản.');
  const ctx = new Ctx(o, !!o.dryRun);
  for (const src of o.sources) {
    const ids = new Set<string>();
    await migrateSessions(ctx, src, ids);
    if (o.sessionsOnly) continue;
    await migrateDeleted(ctx, src);
    await migrateSpecs(ctx, src);
    await migrateLarkConfig(ctx, src);
    await migrateRelogin(ctx, src);
    await noteGrants(ctx, src);
    await migrateWorkFiles(ctx, src, ids);
    await migrateSkills(ctx, src);
    await migratePlugins(ctx, src);
    await noteIntentionalSkips(ctx, src);
  }
  return ctx.report;
}

// ── dấu đã nhập (chạy tự động đúng một lần cho mỗi tài khoản) ─────────────────────────────────

export function markerPath(dest: string, userId: string): string {
  return join(dest, 'migrations', `toolswave-${scopeOf(userId)}.json`);
}
export async function readMarker(dest: string, userId: string): Promise<MigrateReport | null> {
  return readDestJson<MigrateReport>(markerPath(dest, userId));
}
export async function writeMarker(dest: string, report: MigrateReport): Promise<void> {
  const p = markerPath(dest, report.userId);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify(report, null, 2));
}
