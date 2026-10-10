/**
 * Phép chốt "tệp này có nằm trong thư mục cho phép không" — MỘT chỗ duy nhất.
 *
 * Trước đây luật này nằm rải ở hai nơi (`send_file` và handler IPC mở tệp) và bài kiểm thì CHÉP
 * LẠI luật lần thứ ba. Ba bản chép của một luật bảo mật là ba cơ hội để chúng trôi khác nhau, và
 * bài kiểm chép-lại thì vẫn xanh trong lúc mã thật đã hỏng — nó chỉ kiểm chính nó.
 *
 * Vì sao cần chốt: `path` tới từ lượt chạy của model, tức dữ liệu không tin được, y như một ô dữ
 * liệu trong Base. Không chốt thì `send_file` gửi được khoá SSH vào một nhóm Lark, và handler IPC
 * gọi `shell.openPath` lên một tệp thực thi — tức là CHẠY nó.
 *
 * Từ 10/2026 còn thêm BỘ PHÂN GIẢI đường dẫn (`classifyLocalPath` thuần + `resolveLocalFile` có đĩa):
 * hội thoại nhập từ Toolswave mang theo đường dẫn tệp nằm trong thư mục làm việc CỦA TOOLSWAVE
 * (`…/@toolswave/desktop/lark/work/<convId>/…`). Chốt cũ từ chối thẳng các đường đó, nên agent nói
 * "đính tệp «File test.xlsx» vào ô…" rồi hỏng ở đúng bước cuối. Nay: đường nằm trong thư mục làm
 * việc Toolswave của MỘT hội thoại có thật ở Larkwave → chép ĐÚNG tệp đó (nguồn chỉ đọc) sang thư
 * mục làm việc Larkwave của hội thoại rồi dùng bản chép. Mọi đường khác vẫn bị từ chối.
 *
 * Thuần Node (không electron) — dùng được ở bản chạy nền trên VM và trong bài kiểm.
 */
import * as nodePath from 'node:path';
import { copyFile, lstat, mkdir, readFile, realpath, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';

/** `node:path` của nền đang chạy, hoặc `path.win32`/`path.posix` (bài kiểm ma trận Windows). */
export type PathLib = Pick<typeof nodePath, 'resolve' | 'join' | 'relative' | 'sep' | 'isAbsolute' | 'basename' | 'extname' | 'dirname'>;

/**
 * `p` có nằm trong `root` (hoặc chính là `root`) không.
 *
 * Hai chi tiết quyết định tính đúng, cả hai đều từng là lỗi thật ở đâu đó:
 *
 *  1. `resolve()` TRƯỚC khi so — nếu không thì `.../work/../../.ssh/id_rsa` lọt qua vì chuỗi của
 *     nó vẫn bắt đầu bằng `root`.
 *  2. Nối `sep` khi so tiền tố — `startsWith(root)` trần cho `/var/www/work-khac` lọt qua vì nó
 *     cùng tiền tố với `/var/www/work`. Và phải là `sep` chứ KHÔNG phải `'/'` cứng: trên Windows
 *     `resolve()` trả dấu `\`, nên một dấu gạch chéo cứng biến chốt bảo mật thành lỗi chức năng —
 *     chặn oan MỌI tệp hợp lệ, và chỉ máy Windows mới thấy.
 */
export function isInsideDir(root: string | null | undefined, p: string | null | undefined, lib: PathLib = nodePath): boolean {
  if (!root || !p) return false;
  const r = lib.resolve(root);
  const t = lib.resolve(p);
  if (t === r) return true;
  // Gốc là thư mục gốc ổ đĩa ("/" hoặc "C:\") thì đã kết thúc bằng sep — đừng nối thêm lần nữa.
  return t.startsWith(r.endsWith(lib.sep) ? r : r + lib.sep);
}

/** Thư mục userData của app desktop Toolswave, theo thứ tự ưu tiên (bản cài trước, bản dev sau). */
export function toolswaveDataDirCandidates(platform: string, home: string, appData?: string, xdgConfig?: string): string[] {
  const lib = platform === 'win32' ? nodePath.win32 : nodePath.posix;
  const roots: string[] = [];
  if (platform === 'darwin') roots.push(lib.join(home, 'Library', 'Application Support'));
  else if (platform === 'win32') roots.push(appData || lib.join(home, 'AppData', 'Roaming'));
  else roots.push(xdgConfig || process.env.XDG_CONFIG_HOME || lib.join(home, '.config'));
  const out: string[] = [];
  for (const r of roots) {
    out.push(lib.join(r, '@toolswave', 'desktop'));
    out.push(lib.join(r, '@toolswave', 'desktop (development)'));
    out.push(lib.join(r, 'toolswave-desktop'));
  }
  return out;
}

/**
 * Đuôi tệp KHÔNG được mở bằng ứng dụng mặc định: `shell.openPath` lên các tệp này là CHẠY chúng.
 * Danh sách theo cả ba hệ điều hành (một đường dẫn từ máy này có thể là tệp chép từ máy khác).
 */
const EXEC_EXT = new Set([
  '.app', '.command', '.tool', '.terminal', '.workflow', '.scpt', '.scptd', '.applescript', '.pkg', '.mpkg', '.dmg', '.prefpane', '.kext',
  '.exe', '.msi', '.msp', '.bat', '.cmd', '.com', '.scr', '.pif', '.cpl', '.ps1', '.psm1', '.vbs', '.vbe', '.js', '.jse', '.wsf', '.wsh', '.hta', '.lnk', '.url', '.reg', '.jar', '.appref-ms', '.gadget', '.msc', '.inf',
  '.sh', '.bash', '.zsh', '.csh', '.ksh', '.fish', '.run', '.bin', '.desktop', '.appimage', '.deb', '.rpm', '.py', '.pl', '.rb', '.php',
]);
export function isExecutableName(name: string | null | undefined): boolean {
  const n = String(name || '').trim().toLowerCase();
  if (!n) return false;
  const ext = n.lastIndexOf('.') >= 0 ? n.slice(n.lastIndexOf('.')) : '';
  return EXEC_EXT.has(ext);
}

/** Môi trường để phân giải đường dẫn tệp do MODEL đưa (dữ liệu không tin được). */
export interface LocalFilePolicy {
  /** Thư mục được dùng thẳng: thư mục làm việc/xuất của lượt, thư mục đính kèm, thư mục tự động hoá. */
  roots: (string | null | undefined)[];
  /** `userData/lark/work` của Larkwave — nơi chép tệp từ Toolswave sang (giữ đúng `<convId>/<tên>`). */
  larkwaveWorkRoot?: string | null;
  /** Thư mục userData của Toolswave (ứng viên) — CHỈ để nhận dạng + đọc, không bao giờ ghi. */
  toolswaveRoots?: string[];
  /** Hội thoại có tồn tại ở Larkwave không (chỉ chép tệp của hội thoại đã nhập). */
  conversationExists?: (convId: string) => boolean;
  /** Bộ đường dẫn (bài kiểm truyền `path.win32`). */
  lib?: PathLib;
}

export type PathClass =
  | { kind: 'root'; abs: string; root: string }
  | { kind: 'toolswave'; abs: string; twRoot: string; twConvDir: string; convId: string; rel: string; dest: string }
  | { kind: 'deny'; reason: string };

const SAFE_CONV = /^[A-Za-z0-9_-]{1,80}$/;
/** Trần MỘT tệp chép từ Toolswave (cùng trần với bộ nhập dữ liệu). */
export const TOOLSWAVE_COPY_MAX_BYTES = 200 * 1024 * 1024;

/** Bỏ ngoặc/khoảng trắng bao quanh mà model hay dán kèm ("…", «…», '…', `…`), và tiền tố file://. */
function cleanInput(p: string): string {
  let s = String(p ?? '').trim();
  for (let k = 0; k < 2; k++) s = s.replace(/^["'`«“]+|["'`»”]+$/g, '').trim();
  if (/^file:\/\//i.test(s)) {
    try {
      s = decodeURIComponent(s.replace(/^file:\/\//i, ''));
    } catch {
      /* giữ nguyên */
    }
  }
  return s;
}

/**
 * PHÂN LOẠI (không đụng đĩa) một đường dẫn do model đưa:
 *  - `root`: nằm trong một thư mục được phép → dùng thẳng.
 *  - `toolswave`: nằm trong `<Toolswave>/lark/work/<convId>/…` của MỘT hội thoại có ở Larkwave →
 *    chép sang `<larkwaveWorkRoot>/<convId>/<rel>` rồi dùng bản chép.
 *  - `deny`: mọi thứ khác (đường tuyệt đối tuỳ ý, `..`, thư mục Toolswave ngoài lark/work, hội
 *    thoại không có ở Larkwave…).
 * Đường dẫn TƯƠNG ĐỐI được hiểu theo thư mục đầu tiên trong `roots` (thư mục làm việc của lượt).
 */
export function classifyLocalPath(input: string | null | undefined, policy: LocalFilePolicy): PathClass {
  const lib = policy.lib ?? nodePath;
  const raw = cleanInput(String(input ?? ''));
  if (!raw) return { kind: 'deny', reason: 'Thiếu đường dẫn tệp.' };
  if (raw.includes('\0')) return { kind: 'deny', reason: 'Đường dẫn không hợp lệ.' };
  // `..` bị từ chối THẲNG kể cả khi resolve xong vẫn nằm trong thư mục cho phép: model không có lý do
  // gì để leo thư mục, và chốt hai lớp rẻ hơn một lần sai.
  if (raw.split(/[\\/]+/).some((seg) => seg === '..')) return { kind: 'deny', reason: 'Không dùng ".." trong đường dẫn tệp.' };
  const roots = policy.roots.filter((r): r is string => !!r);
  let abs: string;
  if (lib.isAbsolute(raw)) abs = lib.resolve(raw);
  else if (roots[0]) abs = lib.resolve(roots[0], raw);
  else return { kind: 'deny', reason: 'Đường dẫn tương đối nhưng lượt này chưa có thư mục làm việc.' };

  for (const r of roots) {
    if (isInsideDir(r, abs, lib) && lib.resolve(r) !== abs) return { kind: 'root', abs, root: lib.resolve(r) };
  }

  for (const tw of policy.toolswaveRoots ?? []) {
    const work = lib.join(tw, 'lark', 'work');
    if (!isInsideDir(work, abs, lib) || lib.resolve(work) === abs) continue;
    const rest = lib.relative(lib.resolve(work), abs).split(/[\\/]+/).filter(Boolean);
    const convId = rest[0] ?? '';
    const relParts = rest.slice(1);
    if (!SAFE_CONV.test(convId) || !relParts.length) return { kind: 'deny', reason: 'Đường dẫn Toolswave không trỏ vào tệp của một hội thoại.' };
    if (relParts.some((s) => s.startsWith('.'))) return { kind: 'deny', reason: 'Tệp ẩn/tệp cấu hình của CLI trong thư mục Toolswave không được dùng.' };
    if (!policy.larkwaveWorkRoot) return { kind: 'deny', reason: 'Chưa có thư mục làm việc Larkwave để chép tệp sang.' };
    if (!policy.conversationExists?.(convId)) {
      return { kind: 'deny', reason: `Tệp thuộc hội thoại Toolswave «${convId}» chưa được nhập vào Larkwave — nhập dữ liệu từ Toolswave trước (Cài đặt → Dữ liệu từ app Toolswave).` };
    }
    const rel = relParts.join(lib.sep);
    const dest = lib.join(lib.resolve(policy.larkwaveWorkRoot), convId, rel);
    return { kind: 'toolswave', abs, twRoot: lib.resolve(tw), twConvDir: lib.join(lib.resolve(work), convId), convId, rel, dest };
  }

  if (/[\\/]@toolswave[\\/]|[\\/]toolswave-desktop[\\/]/i.test(abs)) {
    return { kind: 'deny', reason: 'Chỉ dùng được tệp trong thư mục làm việc (lark/work/<hội thoại>) của app Toolswave, không phải chỗ khác trong dữ liệu app.' };
  }
  return { kind: 'deny', reason: 'Tệp nằm ngoài các thư mục được phép (thư mục hội thoại, tệp đính kèm, thư mục tự động hoá).' };
}

async function sha256File(p: string): Promise<string> {
  return createHash('sha256').update(await readFile(p)).digest('hex');
}

/** realpath của `p` có còn nằm trong realpath của `dir` không (chặn symlink trỏ ra ngoài). */
async function realInside(dir: string, p: string): Promise<boolean> {
  try {
    const [rd, rp] = await Promise.all([realpath(dir), realpath(p)]);
    return isInsideDir(rd, rp);
  } catch {
    return false;
  }
}

export type ResolvedFile =
  | { ok: true; path: string; copiedFrom?: string; note?: string }
  | { ok: false; reason: string };

/**
 * PHÂN GIẢI có đĩa: phân loại rồi kiểm symlink, và chép tệp Toolswave sang Larkwave khi cần.
 *
 * Luật chép (nguồn CHỈ ĐỌC — `copyFile` từ nguồn, không bao giờ ghi vào thư mục Toolswave):
 *  - đích chưa có → chép;
 *  - đích có, cùng nội dung → dùng đích;
 *  - đích có, khác nội dung, ĐÍCH MỚI HƠN → KHÔNG ghi đè (bản ở Larkwave có thể đã được sửa) —
 *    chép sang tên bên cạnh `<tên> (Toolswave).<đuôi>` và dùng bản đó;
 *  - đích có, khác nội dung, NGUỒN MỚI HƠN → cập nhật đích.
 * Chỉ tệp thường (không thư mục, không symlink trỏ ra ngoài thư mục hội thoại), ≤ 200 MB.
 */
export async function resolveLocalFile(input: string | null | undefined, policy: LocalFilePolicy): Promise<ResolvedFile> {
  const c = classifyLocalPath(input, policy);
  if (c.kind === 'deny') return { ok: false, reason: c.reason };
  if (c.kind === 'root') {
    // Tệp chưa tồn tại: trả đường dẫn, để công cụ báo "không tìm thấy" bằng lời của nó.
    const st = await lstat(c.abs).catch(() => null);
    if (!st) return { ok: true, path: c.abs };
    if (!(await realInside(c.root, c.abs))) return { ok: false, reason: 'Liên kết (symlink) trỏ ra ngoài thư mục được phép.' };
    return { ok: true, path: c.abs };
  }
  // Toolswave → Larkwave
  const st = await lstat(c.abs).catch(() => null);
  if (!st) return { ok: false, reason: `Không tìm thấy tệp trong thư mục Toolswave: ${nodePath.basename(c.abs)}` };
  if (!(await realInside(c.twConvDir, c.abs))) return { ok: false, reason: 'Liên kết (symlink) trỏ ra ngoài thư mục hội thoại Toolswave.' };
  const real = await stat(c.abs).catch(() => null);
  if (!real?.isFile()) return { ok: false, reason: 'Chỉ chép được TỆP (không phải thư mục).' };
  if (real.size > TOOLSWAVE_COPY_MAX_BYTES) return { ok: false, reason: `Tệp quá lớn để chép (${Math.round(real.size / 1048576)} MB > 200 MB).` };
  const dst = await stat(c.dest).catch(() => null);
  let target = c.dest;
  let note = 'Đã chép tệp từ thư mục Toolswave sang thư mục hội thoại Larkwave (bản gốc giữ nguyên).';
  if (dst?.isFile()) {
    const same = dst.size === real.size && (await sha256File(c.dest)) === (await sha256File(c.abs));
    if (same) return { ok: true, path: c.dest, copiedFrom: c.abs, note: 'Dùng bản đã chép sẵn ở Larkwave (cùng nội dung với tệp Toolswave).' };
    if (dst.mtimeMs > real.mtimeMs) {
      const ext = nodePath.extname(c.dest);
      target = `${c.dest.slice(0, c.dest.length - ext.length)} (Toolswave)${ext}`;
      note = 'Larkwave đã có tệp cùng tên MỚI HƠN (khác nội dung) — không ghi đè; bản Toolswave được chép sang tên bên cạnh.';
      const alt = await stat(target).catch(() => null);
      if (alt?.isFile() && alt.size === real.size && (await sha256File(target)) === (await sha256File(c.abs))) {
        return { ok: true, path: target, copiedFrom: c.abs, note };
      }
    } else {
      note = 'Đã cập nhật bản chép ở Larkwave theo tệp Toolswave mới hơn.';
    }
  } else if (dst) {
    return { ok: false, reason: 'Đích chép đang là một thư mục — không ghi đè.' };
  }
  await mkdir(nodePath.dirname(target), { recursive: true });
  await copyFile(c.abs, target);
  return { ok: true, path: target, copiedFrom: c.abs, note };
}
