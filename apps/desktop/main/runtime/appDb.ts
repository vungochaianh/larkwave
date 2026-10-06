import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AppDbOverview, AppDbResult } from '@larkwave/core';

/**
 * Local SQLite browser/editor for a desktop app, powered by sql.js (WASM — no native
 * module, so it survives the unsigned/no-rebuild packaging). Each call opens the app's
 * `.db`/`.sqlite` file fresh (to reflect external writes by the app's own backend),
 * runs the operation, and — for writes — exports + persists the bytes back.
 *
 * The WASM is copied next to the bundled main as `sql-wasm.wasm` (see nextron.config.js);
 * we load it as `wasmBinary` so there's no fragile locateFile/CDN dependency (works offline).
 */

// sql.js ships no first-party d.ts here — type the surface we use loosely.
type SqlExecResult = { columns: string[]; values: unknown[][] }[];
interface SqlDatabase {
  exec(sql: string, params?: unknown[]): SqlExecResult;
  run(sql: string, params?: unknown[]): void;
  getRowsModified(): number;
  export(): Uint8Array;
  close(): void;
}
interface SqlJsStatic {
  Database: new (data?: Uint8Array | null) => SqlDatabase;
}

let sqlPromise: Promise<SqlJsStatic> | null = null;

function loadWasmBinary(): Uint8Array | undefined {
  const candidates = [
    join(__dirname, 'sql-wasm.wasm'), // copied next to background.js (dev + packaged)
    join(process.resourcesPath || '', 'app', 'sql-wasm.wasm'),
    join(__dirname, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
  ];
  for (const p of candidates) {
    try {
      return readFileSync(p);
    } catch {
      /* try next */
    }
  }
  return undefined;
}

function getSql(): Promise<SqlJsStatic> {
  if (!sqlPromise) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const initSqlJs = require('sql.js') as (cfg?: { wasmBinary?: Uint8Array }) => Promise<SqlJsStatic>;
    const wasmBinary = loadWasmBinary();
    sqlPromise = initSqlJs(wasmBinary ? { wasmBinary } : {}).catch((e) => {
      sqlPromise = null; // allow a later retry
      throw e;
    });
  }
  return sqlPromise;
}

const DB_PREFERRED = ['data.db', 'database.db', 'db.sqlite', 'app.db', 'data.sqlite', 'sqlite.db', 'dev.db'];
const DB_EXT = /\.(db|sqlite|sqlite3)$/i;
const SUBDIRS = ['server', 'backend', 'data', 'db', 'api', 'prisma', 'src'];
const READ_ONLY = /^\s*(select|pragma|explain|with)\b/i;

/** Locate the app's SQLite file: preferred names first, then any *.db/*.sqlite at the root
 *  or one level into a common backend/data dir. Returns null if the app has no DB yet. */
export async function findDbPath(appDir: string): Promise<string | null> {
  for (const n of DB_PREFERRED) {
    try {
      const p = join(appDir, n);
      await stat(p);
      return p;
    } catch {
      /* next */
    }
  }
  const scan = async (dir: string): Promise<string | null> => {
    try {
      for (const e of await readdir(dir, { withFileTypes: true })) {
        if (e.isFile() && DB_EXT.test(e.name)) return join(dir, e.name);
      }
    } catch {
      /* unreadable */
    }
    return null;
  };
  const root = await scan(appDir);
  if (root) return root;
  for (const sub of SUBDIRS) {
    const hit = await scan(join(appDir, sub));
    if (hit) return hit;
  }
  return null;
}

/** sql.js reads ONLY the main db file, but a live backend (better-sqlite3 / any WAL-mode SQLite)
 *  keeps its committed data in `<db>-wal` while the main file stays near-empty — so the browser saw
 *  0 tables. Read the main image and overlay the committed WAL frames so it reflects live data.
 *  Best-effort: any parse anomaly falls back to the main file. */
function pageSizeOf(main: Buffer, wal: Buffer): number {
  const wps = wal.readUInt32BE(8); // WAL header: page size
  if (wps === 1) return 65536;
  if (wps >= 512 && (wps & (wps - 1)) === 0) return wps;
  const dps = main.length >= 18 ? main.readUInt16BE(16) : 4096; // db header: page size
  return dps === 1 ? 65536 : dps || 4096;
}
function applyWal(main: Buffer, wal: Buffer): Buffer {
  const magic = wal.readUInt32BE(0);
  if (magic !== 0x377f0682 && magic !== 0x377f0683) return main;
  const pageSize = pageSizeOf(main, wal);
  const salt1 = wal.readUInt32BE(16);
  const salt2 = wal.readUInt32BE(20);
  const FRAME_HDR = 24;
  const frameLen = FRAME_HDR + pageSize;
  const frames: { pno: number; commit: number; data: Buffer }[] = [];
  let off = 32;
  while (off + frameLen <= wal.length) {
    // Frames from an older checkpoint cycle carry a different salt → stop (ring buffer boundary).
    if (wal.readUInt32BE(off + 8) !== salt1 || wal.readUInt32BE(off + 12) !== salt2) break;
    frames.push({ pno: wal.readUInt32BE(off), commit: wal.readUInt32BE(off + 4), data: wal.subarray(off + FRAME_HDR, off + frameLen) });
    off += frameLen;
  }
  let lastCommit = -1;
  for (let i = 0; i < frames.length; i++) if (frames[i].commit !== 0) lastCommit = i;
  if (lastCommit < 0) return main; // nothing committed in the WAL yet
  const finalPages = frames[lastCommit].commit; // db size (pages) after the last commit
  const latest = new Map<number, Buffer>();
  for (let i = 0; i <= lastCommit; i++) latest.set(frames[i].pno, frames[i].data);
  const out = Buffer.alloc(finalPages * pageSize);
  const mainPages = Math.floor(main.length / pageSize);
  for (let p = 1; p <= finalPages; p++) {
    const wp = latest.get(p);
    if (wp) wp.copy(out, (p - 1) * pageSize);
    else if (p <= mainPages) main.copy(out, (p - 1) * pageSize, (p - 1) * pageSize, p * pageSize);
  }
  return out;
}
async function readDbBytesWithWal(path: string): Promise<Uint8Array> {
  const main = await readFile(path);
  let wal: Buffer | null = null;
  try {
    wal = await readFile(path + '-wal');
  } catch {
    wal = null;
  }
  if (!wal || wal.length < 32 + 24) return new Uint8Array(main);
  try {
    return new Uint8Array(applyWal(main, wal));
  } catch {
    return new Uint8Array(main);
  }
}
/** True when a non-empty `-wal` sits next to the db (a backend is holding un-checkpointed data) —
 *  writing the sql.js-exported main file then would corrupt/race that backend, so writes are gated. */
async function hasLiveWal(path: string): Promise<boolean> {
  try {
    return (await stat(path + '-wal')).size > 0;
  } catch {
    return false;
  }
}

async function openDb(SQL: SqlJsStatic, path: string): Promise<SqlDatabase> {
  const bytes = await readDbBytesWithWal(path);
  return new SQL.Database(bytes);
}

async function persist(db: SqlDatabase, path: string): Promise<void> {
  await writeFile(path, Buffer.from(db.export()));
}

/** Tables (with row counts + columns) of the app's DB, or `available:false` when there's no
 *  DB file / the WASM engine couldn't load. */
export async function dbOverview(appDir: string): Promise<AppDbOverview> {
  const path = await findDbPath(appDir);
  if (!path) return { available: false, tables: [] };
  let SQL: SqlJsStatic;
  try {
    SQL = await getSql();
  } catch (e) {
    return { available: false, tables: [], error: `Không nạp được công cụ SQLite: ${(e as Error).message}` };
  }
  let db: SqlDatabase | null = null;
  try {
    db = await openDb(SQL, path);
    const tnames = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
    const names = tnames.length ? (tnames[0].values.map((r) => String(r[0])) as string[]) : [];
    const tables = names.map((name) => {
      let rows = 0;
      try {
        const c = db!.exec(`SELECT count(*) FROM "${name.replace(/"/g, '""')}"`);
        rows = c.length ? Number(c[0].values[0][0]) : 0;
      } catch {
        /* view/locked — leave 0 */
      }
      const info = db!.exec(`PRAGMA table_info("${name.replace(/"/g, '""')}")`);
      const columns = info.length
        ? info[0].values.map((r) => ({ name: String(r[1]), type: String(r[2] || '') }))
        : [];
      return { name, rows, columns };
    });
    return { available: true, path, tables };
  } catch (e) {
    return { available: false, tables: [], error: (e as Error).message };
  } finally {
    db?.close();
  }
}

/** Paginated rows of a table (includes a hidden `__rowid` so the UI can UPDATE/DELETE a row). */
export async function dbRows(appDir: string, table: string, limit = 50, offset = 0): Promise<AppDbResult> {
  const path = await findDbPath(appDir);
  if (!path) return { columns: [], rows: [], error: 'Chưa có cơ sở dữ liệu.' };
  const SQL = await getSql();
  let db: SqlDatabase | null = null;
  const q = `"${table.replace(/"/g, '""')}"`;
  try {
    db = await openDb(SQL, path);
    let total = 0;
    try {
      const c = db.exec(`SELECT count(*) FROM ${q}`);
      total = c.length ? Number(c[0].values[0][0]) : 0;
    } catch {
      /* ignore */
    }
    // rowid lets the UI edit/delete a row precisely; harmless extra column for normal tables.
    const res = db.exec(`SELECT rowid AS __rowid, * FROM ${q} LIMIT ${Math.max(1, Math.min(500, limit))} OFFSET ${Math.max(0, offset)}`);
    if (!res.length) return { columns: ['__rowid'], rows: [], total };
    return { columns: res[0].columns, rows: res[0].values, total };
  } catch (e) {
    return { columns: [], rows: [], error: (e as Error).message };
  } finally {
    db?.close();
  }
}

/** Run SQL (optionally with bound `params`). SELECT/PRAGMA → returns rows (no write).
 *  Anything else → executes + persists the file back. `params` lets the UI bind values
 *  safely (identifiers are escaped by the caller; values are parameterized). */
export async function dbExec(appDir: string, sql: string, params?: unknown[]): Promise<AppDbResult> {
  const path = await findDbPath(appDir);
  if (!path) return { columns: [], rows: [], error: 'Chưa có cơ sở dữ liệu.' };
  const SQL = await getSql();
  let db: SqlDatabase | null = null;
  try {
    db = await openDb(SQL, path);
    if (READ_ONLY.test(sql)) {
      const res = db.exec(sql, params);
      return res.length ? { columns: res[0].columns, rows: res[0].values } : { columns: [], rows: [] };
    }
    // Writing the exported main file while a backend holds the WAL would corrupt/desync it.
    if (await hasLiveWal(path)) {
      return {
        columns: [],
        rows: [],
        error: 'App đang chạy (dữ liệu đang ở WAL) — hãy DỪNG "Xem trước cục bộ"/đóng app rồi mới sửa dữ liệu ở đây để tránh hỏng DB.',
      };
    }
    db.run(sql, params);
    const rowsModified = db.getRowsModified();
    await persist(db, path);
    return { columns: [], rows: [], rowsModified };
  } catch (e) {
    return { columns: [], rows: [], error: (e as Error).message };
  } finally {
    db?.close();
  }
}

/** Create a fresh empty `data.db` (with one example table) when the app has no DB yet, so the
 *  user can start designing data locally. No-op (returns the overview) if a DB already exists. */
export async function dbCreate(appDir: string): Promise<AppDbOverview> {
  const existing = await findDbPath(appDir);
  if (existing) return dbOverview(appDir);
  const SQL = await getSql();
  const db = new SQL.Database();
  try {
    db.run(
      'CREATE TABLE items (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, note TEXT, created_at TEXT DEFAULT (datetime(\'now\')));',
    );
    await persist(db, join(appDir, 'data.db'));
  } finally {
    db.close();
  }
  return dbOverview(appDir);
}
