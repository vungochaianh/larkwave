/**
 * Phiên "gốc" của Claude CLI nằm ở đâu trên đĩa, và cách chép nó sang thư mục làm việc khác.
 *
 * VÌ SAO CẦN: Claude CLI cất mỗi phiên theo THƯ MỤC LÀM VIỆC lúc chạy:
 *
 *     <CLAUDE_CONFIG_DIR | ~/.claude>/projects/<slug(cwd)>/<sessionId>.jsonl   (+ thư mục <sessionId>/)
 *
 * Larkwave chạy mỗi hội thoại Lark ở `userData/lark/work/<convId>`, Toolswave chạy ở
 * `…/@toolswave/desktop/lark/work/<convId>` — khác userData ⇒ khác slug ⇒ `--resume <id>` báo
 * "No conversation found" dù bản ghi đầy đủ vẫn nằm ngay cạnh. Khi đó larkAgent chỉ còn cách nhồi
 * lại một bản chữ rút gọn của hội thoại — mất kết quả công cụ, mất phần cũ. Chép đúng tệp `.jsonl`
 * sang thư mục slug của Larkwave là CLI nối lại phiên gốc, nhớ trọn như chưa từng chuyển app.
 *
 * Luật slug ĐỌC THẲNG từ bản CLI đang cài (2.1.295), không đoán:
 *   - cwd = `realpathSync(process.cwd()).normalize('NFC')` (hỏng thì bỏ realpath)
 *   - slug = cwd.replace(/[^a-zA-Z0-9]/g, '-'); dài quá 200 ký tự thì cắt 200 + '-' + băm
 *     (băm kiểu Java `h = (h << 5) - h + charCode | 0` trên cwd, `Math.abs(h).toString(36)`)
 *   - thư mục cấu hình = `CLAUDE_CONFIG_DIR ?? ~/.claude` (NFC); nếu có `CLAUDE_CONFIG_DIR` VÀ
 *     `CLAUDE_CODE_PROJECT_DIR_NAME` hợp lệ thì mọi cwd dùng chung tên thư mục đó.
 * Đối chiếu tên thư mục thật trong ~/.claude/projects: `…Application-Support--toolswave-desktop-lark-work-<id>`
 * và `…Application-Support--larkwave-desktop--development--lark-work-<id>` (test/claudeSessions.cjs).
 *
 * THUẦN NODE (không electron) — dùng được ở bộ nhập dữ liệu, ở larkAgent và trong bài kiểm.
 * Không bao giờ đọc/chép phiên có id khác id được hỏi.
 */
import { realpathSync } from 'node:fs';
import { copyFile, mkdir, readdir, readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

/** Tên thư mục slug dài hơn mức này thì CLI cắt + gắn băm. */
export const CLAUDE_SLUG_MAX = 200;

/** Băm chuỗi kiểu Java (`String.hashCode`), đúng hàm CLI dùng cho slug dài. */
export function javaStringHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return h;
}

/** Slug thư mục dự án của Claude CLI cho một đường dẫn TUYỆT ĐỐI (đã realpath). */
export function claudeProjectSlug(absPath: string): string {
  const p = String(absPath).normalize('NFC');
  const s = p.replace(/[^a-zA-Z0-9]/g, '-');
  if (s.length <= CLAUDE_SLUG_MAX) return s;
  return `${s.slice(0, CLAUDE_SLUG_MAX)}-${Math.abs(javaStringHash(p)).toString(36)}`;
}

type Env = Record<string, string | undefined>;

/** Thư mục cấu hình của Claude CLI theo đúng môi trường sẽ truyền cho lượt chạy. */
export function claudeConfigDir(env: Env = process.env, home: string = homedir()): string {
  const v = env.CLAUDE_CONFIG_DIR;
  return (v && v.trim() ? v : join(home, '.claude')).normalize('NFC');
}

export function claudeProjectsDir(env: Env = process.env, home: string = homedir()): string {
  return join(claudeConfigDir(env, home), 'projects');
}

const PROJECT_DIR_NAME_RE = /^[A-Za-z0-9_-]{1,64}$/;
const RESERVED_NAME_RE = /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;

/** cwd đúng như CLI sẽ thấy: realpath + NFC (thư mục chưa có thì giữ nguyên chuỗi). */
export function cliCwd(cwd: string): string {
  try {
    return realpathSync(cwd).normalize('NFC');
  } catch {
    return resolve(cwd).normalize('NFC');
  }
}

/** Thư mục chứa phiên của một cwd — `<projects>/<slug>` (hoặc tên chung khi có biến ghi đè). */
export function claudeProjectDirFor(cwd: string, env: Env = process.env, home: string = homedir()): string {
  const override = env.CLAUDE_CONFIG_DIR ? env.CLAUDE_CODE_PROJECT_DIR_NAME : undefined;
  const name = override && PROJECT_DIR_NAME_RE.test(override) && !RESERVED_NAME_RE.test(override) ? override : claudeProjectSlug(cliCwd(cwd));
  return join(claudeProjectsDir(env, home), name);
}

/** Id phiên hợp lệ để ghép vào đường dẫn (UUID) — chặn `../` và mọi thứ lạ. */
export function isSessionId(id: unknown): id is string {
  return typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

export interface FoundTranscript {
  /** Thư mục dự án (slug) đang chứa phiên. */
  dir: string;
  file: string;
  mtimeMs: number;
  size: number;
}

async function statFile(p: string): Promise<{ mtimeMs: number; size: number } | null> {
  try {
    const s = await stat(p);
    return s.isFile() ? { mtimeMs: s.mtimeMs, size: s.size } : null;
  } catch {
    return null;
  }
}

async function isDir(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Tìm `<sessionId>.jsonl` trong MỌI thư mục dự án — đúng id, bản sửa gần nhất thắng.
 * `preferDirs` được xét trước (vd thư mục slug của app cũ); `excludeDirs` bị bỏ (thư mục hiện tại,
 * nơi CLI vừa báo không thấy).
 */
export async function findClaudeTranscript(
  sessionId: string,
  opts: { projectsDir: string; preferDirs?: string[]; excludeDirs?: string[] },
): Promise<FoundTranscript | null> {
  if (!isSessionId(sessionId)) return null;
  const name = `${sessionId}.jsonl`;
  const excluded = new Set((opts.excludeDirs ?? []).map((d) => resolve(d)));
  for (const d of opts.preferDirs ?? []) {
    if (excluded.has(resolve(d))) continue;
    const st = await statFile(join(d, name));
    if (st && st.size > 0) return { dir: d, file: join(d, name), ...st };
  }
  let entries: string[] = [];
  try {
    entries = await readdir(opts.projectsDir);
  } catch {
    return null;
  }
  let best: FoundTranscript | null = null;
  for (const e of entries) {
    const d = join(opts.projectsDir, e);
    if (excluded.has(resolve(d))) continue;
    const st = await statFile(join(d, name));
    if (!st || st.size === 0) continue;
    if (!best || st.mtimeMs > best.mtimeMs) best = { dir: d, file: join(d, name), ...st };
  }
  return best;
}

export type CopySessionStatus =
  /** Chép mới sang đích. */
  | 'copied'
  /** Đích cũ hơn và là ĐOẠN ĐẦU của nguồn (bên kia chạy tiếp, bên này chưa) → cập nhật. */
  | 'updated'
  /** Đích đã có và mới bằng/hơn nguồn — không làm gì. */
  | 'unchanged'
  /** Hai bên đều đã chạy tiếp từ cùng một phiên — giữ đích, không ghi đè. */
  | 'diverged'
  /** Không có bản nguồn. */
  | 'missing';

async function isPrefixOf(shorter: string, longer: string): Promise<boolean> {
  try {
    const [a, b] = await Promise.all([readFile(shorter), readFile(longer)]);
    return a.length <= b.length && b.subarray(0, a.length).equals(a);
  } catch {
    return false;
  }
}

/** Chép thư mục phụ `<sessionId>/` (tool-results, subagents…): chỉ tệp đích chưa có. */
async function copySidecar(from: string, to: string, dryRun: boolean): Promise<number> {
  if (!(await isDir(from))) return 0;
  let n = 0;
  let entries: string[] = [];
  try {
    entries = await readdir(from);
  } catch {
    return 0;
  }
  for (const e of entries) {
    const a = join(from, e);
    const b = join(to, e);
    if (await isDir(a)) {
      n += await copySidecar(a, b, dryRun);
      continue;
    }
    if (await statFile(b)) continue;
    if (!dryRun) {
      await mkdir(to, { recursive: true });
      await copyFile(a, b);
    }
    n++;
  }
  return n;
}

/**
 * CHÉP (không bao giờ di chuyển) một phiên từ thư mục dự án này sang thư mục dự án khác.
 * Đích đã có và mới hơn ⇒ bỏ qua. Đích cũ hơn ⇒ chỉ cập nhật khi đích là đoạn đầu của nguồn,
 * để không xoá mất những lượt đã chạy ở bên đích.
 */
export async function copyClaudeSession(o: {
  sessionId: string;
  fromDir: string;
  toDir: string;
  dryRun?: boolean;
}): Promise<{ status: CopySessionStatus; sidecarFiles: number }> {
  if (!isSessionId(o.sessionId) || resolve(o.fromDir) === resolve(o.toDir)) return { status: 'missing', sidecarFiles: 0 };
  const name = `${o.sessionId}.jsonl`;
  const src = join(o.fromDir, name);
  const dst = join(o.toDir, name);
  const s = await statFile(src);
  if (!s || s.size === 0) return { status: 'missing', sidecarFiles: 0 };
  const d = await statFile(dst);
  let status: CopySessionStatus;
  if (!d) status = 'copied';
  else if (d.mtimeMs >= s.mtimeMs) status = 'unchanged';
  else if (await isPrefixOf(dst, src)) status = d.size === s.size ? 'unchanged' : 'updated';
  else status = 'diverged';
  if ((status === 'copied' || status === 'updated') && !o.dryRun) {
    await mkdir(o.toDir, { recursive: true });
    await copyFile(src, dst);
  }
  const sidecarFiles = status === 'diverged' ? 0 : await copySidecar(join(o.fromDir, o.sessionId), join(o.toDir, o.sessionId), !!o.dryRun);
  return { status, sidecarFiles };
}

/**
 * "Cứu" một phiên mà `--resume` vừa báo không thấy: tìm đúng `<sessionId>.jsonl` ở thư mục dự án
 * KHÁC (hội thoại nhập từ Toolswave, chuyển thư mục, khôi phục từ máy khác), chép sang thư mục của
 * cwd hiện tại. Trả về nơi đã lấy, hoặc null nếu không thấy ở đâu cả.
 */
export async function rescueClaudeSession(
  sessionId: string,
  cwd: string,
  env: Env = process.env,
  home: string = homedir(),
): Promise<{ from: string; to: string; status: CopySessionStatus } | null> {
  if (!isSessionId(sessionId)) return null;
  const to = claudeProjectDirFor(cwd, env, home);
  const found = await findClaudeTranscript(sessionId, { projectsDir: claudeProjectsDir(env, home), excludeDirs: [to] });
  if (!found) return null;
  // Đích chưa có (CLI vừa báo không thấy) — chép. Có thì đừng đụng: đó là phiên khác cùng id.
  if (await statFile(join(to, `${sessionId}.jsonl`))) return null;
  const r = await copyClaudeSession({ sessionId, fromDir: found.dir, toDir: to });
  return r.status === 'copied' || r.status === 'updated' ? { from: found.dir, to, status: r.status } : null;
}
