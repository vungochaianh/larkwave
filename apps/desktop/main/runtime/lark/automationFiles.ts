/**
 * THƯ MỤC RIÊNG của mỗi quy tắc tự động hoá: `userData/lark/automations/<id>/`
 *
 *   inputs/     "Tệp nguồn" người dùng thêm (chép vào) — lượt chạy đọc từ đây
 *   sources/    tệp tải TƯƠI từ Lark mỗi lần chạy (Drive / ô đính kèm Base / Lark Sheets)
 *   outputs/<lần chạy>/   tệp lượt chạy dựng ra (giữ N lần gần nhất)
 *   .extract/   chữ trích từ Excel/Word để agent Read được (Read không mở nổi tệp ZIP nhị phân)
 *   state.json  dấu băm các tệp ĐÃ xử lý — cho tuỳ chọn "chỉ xử lý tệp mới"
 *
 * Vì sao cần: trước đây lượt theo lịch chỉ có một thư mục `sched-files` dùng chung cho MỌI lịch, không
 * có chỗ để đặt tệp đầu vào, và chạy hai lần là xử lý lại y nguyên những tệp đã ghi vào Base (dòng trùng).
 *
 * Thuần Node (không electron) — bản chạy nền trên VM dùng cùng bố cục (dưới thư mục làm việc của nó).
 */
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, extname, join, relative, sep } from 'node:path';
import { extractOfficeText, officeKindFor } from './ooxml';
import { FORMAT_META } from './fileBuild';

export interface AutoFolder {
  root: string;
  inputs: string;
  sources: string;
  outputs: string;
  extract: string;
  statePath: string;
}

export interface InputFile {
  /** Đường dẫn tương đối với thư mục gốc của quy tắc (vd `inputs/Đơn hàng.xlsx`). */
  rel: string;
  name: string;
  path: string;
  bytes: number;
  mtimeMs: number;
  sha256: string;
  /** Tệp này đến từ nguồn Lark (tải tươi) hay người dùng thêm vào inputs/. */
  from: 'inputs' | 'sources';
}

export interface AutoState {
  /** sha256 → lần xử lý đầu tiên. Giới hạn MAX_PROCESSED (bỏ mục cũ nhất). */
  processed: Record<string, { at: string; name: string }>;
}

const MAX_PROCESSED = 5000;
const SAFE_ID = /[^A-Za-z0-9_-]/g;

export function automationRoot(baseDir: string, id: string): string {
  const safe = String(id || '').replace(SAFE_ID, '') || 'default';
  return join(baseDir, 'lark', 'automations', safe);
}

export function folderFor(root: string): AutoFolder {
  return {
    root,
    inputs: join(root, 'inputs'),
    sources: join(root, 'sources'),
    outputs: join(root, 'outputs'),
    extract: join(root, '.extract'),
    statePath: join(root, 'state.json'),
  };
}

export async function ensureAutomationFolder(baseDir: string, id: string): Promise<AutoFolder> {
  const f = folderFor(automationRoot(baseDir, id));
  for (const d of [f.inputs, f.sources, f.outputs]) await mkdir(d, { recursive: true });
  return f;
}

/** Tên tệp an toàn (không thể thoát khỏi thư mục), giữ chữ có dấu. */
export function safeInputName(name: string): string {
  const b = basename(String(name || '').replace(/[\\/]+/g, '/')).replace(/[\u0000-\u001f<>:"|?*]/g, '_').trim();
  const clean = b.replace(/^\.+/, '').slice(0, 120);
  return clean || 'tep';
}

async function sha256(path: string): Promise<string> {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

async function walk(dir: string, out: string[]): Promise<void> {
  let items: string[] = [];
  try {
    items = await readdir(dir);
  } catch {
    return;
  }
  for (const n of items.sort()) {
    if (n.startsWith('.')) continue; // thư mục/tệp ẩn (kể cả .extract)
    const p = join(dir, n);
    const st = await stat(p).catch(() => null);
    if (!st) continue;
    if (st.isDirectory()) await walk(p, out);
    else if (st.isFile()) out.push(p);
  }
}

/** Mọi tệp đầu vào: `inputs/` (người dùng thêm) + `sources/` (vừa tải từ Lark), kèm băm nội dung. */
export async function listInputFiles(f: AutoFolder): Promise<InputFile[]> {
  const out: InputFile[] = [];
  for (const [dir, from] of [
    [f.inputs, 'inputs'],
    [f.sources, 'sources'],
  ] as const) {
    const files: string[] = [];
    await walk(dir, files);
    for (const p of files) {
      const st = await stat(p);
      out.push({ rel: relative(f.root, p).split(sep).join('/'), name: basename(p), path: p, bytes: st.size, mtimeMs: st.mtimeMs, sha256: await sha256(p), from });
    }
  }
  return out;
}

export async function readAutoState(f: AutoFolder): Promise<AutoState> {
  try {
    const j = JSON.parse(await readFile(f.statePath, 'utf8')) as AutoState;
    return { processed: j && typeof j.processed === 'object' && j.processed ? j.processed : {} };
  } catch {
    return { processed: {} };
  }
}

/** Ghi nguyên tử (tmp + rename): đọc giữa chừng luôn thấy bản cũ trọn vẹn hoặc bản mới trọn vẹn. */
async function writeJsonAtomic(path: string, data: unknown): Promise<void> {
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2));
  await rename(tmp, path);
}

export async function markProcessed(f: AutoFolder, files: Pick<InputFile, 'sha256' | 'name'>[]): Promise<AutoState> {
  const st = await readAutoState(f);
  const now = new Date().toISOString();
  for (const x of files) if (!st.processed[x.sha256]) st.processed[x.sha256] = { at: now, name: x.name };
  const keys = Object.keys(st.processed);
  if (keys.length > MAX_PROCESSED) {
    const keep = keys.sort((a, b) => st.processed[a].at.localeCompare(st.processed[b].at)).slice(keys.length - MAX_PROCESSED);
    st.processed = Object.fromEntries(keep.map((k) => [k, st.processed[k]]));
  }
  await mkdir(f.root, { recursive: true });
  await writeJsonAtomic(f.statePath, st);
  return st;
}

/**
 * Tệp nào lượt này phải xử lý. `onlyNew` = bỏ tệp có NỘI DUNG đã xử lý (theo sha256 — đổi tên không
 * làm nó thành "mới", sửa nội dung thì có). Không bật thì xử lý tất cả.
 */
export function pendingFiles(files: InputFile[], state: AutoState, onlyNew: boolean): { todo: InputFile[]; already: InputFile[] } {
  if (!onlyNew) return { todo: files, already: [] };
  const todo: InputFile[] = [];
  const already: InputFile[] = [];
  const seen = new Set<string>();
  for (const x of files) {
    if (state.processed[x.sha256] || seen.has(x.sha256)) already.push(x);
    else {
      seen.add(x.sha256);
      todo.push(x);
    }
  }
  return { todo, already };
}

/** Mốc thời gian dùng làm tên thư mục lần chạy (sắp xếp được theo chữ). */
export function runStamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export async function newRunDir(f: AutoFolder, stamp = runStamp()): Promise<string> {
  let dir = join(f.outputs, stamp);
  for (let n = 2; n < 50; n++) {
    const st = await stat(dir).catch(() => null);
    if (!st) break;
    dir = join(f.outputs, `${stamp}-${n}`);
  }
  await mkdir(dir, { recursive: true });
  return dir;
}

/** Giữ `keep` lần chạy gần nhất có kết quả; xoá thư mục cũ hơn. Trả số thư mục đã xoá. */
export async function pruneRuns(f: AutoFolder, keep: number): Promise<number> {
  const k = Math.max(1, Math.floor(keep || 10));
  let dirs: string[] = [];
  try {
    dirs = (await readdir(f.outputs)).filter((n) => !n.startsWith('.')).sort();
  } catch {
    return 0;
  }
  const drop = dirs.slice(0, Math.max(0, dirs.length - k));
  for (const d of drop) await rm(join(f.outputs, d), { recursive: true, force: true });
  return drop.length;
}

const MIME_BY_EXT: Record<string, string> = Object.fromEntries(Object.values(FORMAT_META).map((m) => [m.ext.replace(/^\./, ''), m.mime]));

export async function listRunOutputs(dir: string): Promise<{ name: string; path: string; bytes: number; mime: string }[]> {
  const files: string[] = [];
  await walk(dir, files);
  const out: { name: string; path: string; bytes: number; mime: string }[] = [];
  for (const p of files) {
    const st = await stat(p);
    const ext = extname(p).replace(/^\./, '').toLowerCase();
    out.push({ name: basename(p), path: p, bytes: st.size, mime: MIME_BY_EXT[ext] || 'application/octet-stream' });
  }
  return out;
}

/** Thêm một "Tệp nguồn" vào inputs/. Không ghi đè tệp KHÁC cùng tên (thêm hậu tố -2, -3…). */
export async function addInputFile(f: AutoFolder, name: string, bytes: Buffer): Promise<{ name: string; path: string }> {
  await mkdir(f.inputs, { recursive: true });
  const safe = safeInputName(name);
  const ext = extname(safe);
  const stem = safe.slice(0, safe.length - ext.length);
  let target = join(f.inputs, safe);
  for (let n = 2; n < 1000; n++) {
    const st = await stat(target).catch(() => null);
    if (!st) break;
    if (st.isFile() && createHash('sha256').update(await readFile(target)).digest('hex') === createHash('sha256').update(bytes).digest('hex')) {
      return { name: basename(target), path: target }; // đã có đúng tệp này
    }
    target = join(f.inputs, `${stem}-${n}${ext}`);
  }
  await writeFile(target, bytes);
  return { name: basename(target), path: target };
}

/** Chép một tệp sẵn có trên máy vào inputs/ (người dùng chọn). */
export async function copyIntoInputs(f: AutoFolder, src: string): Promise<{ name: string; path: string }> {
  return addInputFile(f, basename(src), await readFile(src));
}

export async function removeInputFile(f: AutoFolder, name: string): Promise<boolean> {
  const safe = safeInputName(name);
  const p = join(f.inputs, safe);
  const st = await stat(p).catch(() => null);
  if (!st?.isFile()) return false;
  await rm(p, { force: true });
  return true;
}

/**
 * Trích chữ của tệp Office ra `.extract/<rel>.txt` để agent Read được. Trả danh sách đường dẫn
 * TƯƠNG ĐỐI (với thư mục gốc) gồm tệp gốc + bản chữ (nếu có) — đưa thẳng cho lượt agent làm "tệp đính
 * kèm" (Read bật, câu dặn đọc trước).
 */
export async function extractForAgent(f: AutoFolder, files: InputFile[]): Promise<string[]> {
  const names: string[] = [];
  for (const x of files) {
    names.push(x.rel);
    const kind = officeKindFor(x.name, '');
    if (!kind) continue;
    try {
      const text = extractOfficeText(await readFile(x.path), kind);
      if (!text.trim()) continue;
      const out = join(f.extract, `${x.rel.replace(/\//g, '__')}.txt`);
      await mkdir(f.extract, { recursive: true });
      await writeFile(out, text.slice(0, 400_000), 'utf8');
      names.push(relative(f.root, out).split(sep).join('/'));
    } catch {
      /* tệp hỏng — agent vẫn thấy tệp gốc */
    }
  }
  return names;
}

/** Ghi một tệp tải từ Lark vào sources/<id nguồn>/ (ghi đè bản của lần chạy trước — luôn là bản tươi). */
export async function saveSourceFile(f: AutoFolder, sourceId: string, name: string, bytes: Buffer): Promise<string> {
  const dir = join(f.sources, String(sourceId || 'nguon').replace(SAFE_ID, '') || 'nguon');
  await mkdir(dir, { recursive: true });
  const p = join(dir, safeInputName(name));
  await writeFile(p, bytes);
  return p;
}

/** Dọn sạch sources/ trước một lần tải mới (nguồn bị bỏ khỏi cấu hình không để lại tệp cũ). */
export async function clearSources(f: AutoFolder): Promise<void> {
  await rm(f.sources, { recursive: true, force: true });
  await mkdir(f.sources, { recursive: true });
}
