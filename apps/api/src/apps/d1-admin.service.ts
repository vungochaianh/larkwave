import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CloudflarePagesService } from '../engine/cloudflare-pages.service';
import { AppAccessService } from '../common/app-access.service';
import { AuthUser } from '../common/auth-user';

export interface DbColumn {
  name: string;
  type: string;
  pk: boolean;
  notnull: boolean;
}
export interface DbTable {
  name: string;
  columns: DbColumn[];
  rowCount: number;
}

/**
 * In-workspace database admin: browse + edit the D1 database behind a full-stack
 * app, straight from its workspace. Reads/writes go through the Cloudflare D1
 * HTTP API against the app's own database. Table/column names are whitelisted
 * against the live schema before being put into SQL; all values are bound params.
 */
@Injectable()
export class D1AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cf: CloudflarePagesService,
    private readonly access: AppAccessService,
  ) {}

  /** Resolve the app's D1 id after an access check (read or write). */
  private async dbId(user: AuthUser, appId: string, write: boolean): Promise<string> {
    const ok = write
      ? await this.access.canWrite(user, appId)
      : await this.access.canRead(user, appId);
    if (!ok) throw new ForbiddenException('App không thuộc về bạn');
    const app = await this.prisma.app.findUnique({
      where: { id: appId },
      select: { d1DatabaseId: true },
    });
    if (!app?.d1DatabaseId) {
      throw new BadRequestException(
        'App này chưa có cơ sở dữ liệu — chỉ app full-stack (có backend + D1) mới quản trị được dữ liệu.',
      );
    }
    return app.d1DatabaseId;
  }

  /** User-facing table names (hide sqlite_* and Cloudflare's internal _cf_* ). */
  private async tableNames(dbId: string): Promise<string[]> {
    const rows = await this.cf.queryD1(
      dbId,
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '\\_%' ESCAPE '\\' ORDER BY name",
    );
    return rows.map((r) => String(r.name));
  }

  private async assertTable(dbId: string, table: string): Promise<string> {
    if (!(await this.tableNames(dbId)).includes(table)) {
      throw new BadRequestException('Bảng không tồn tại');
    }
    return table; // safe to interpolate now (whitelisted against the live schema)
  }

  private async columns(dbId: string, table: string): Promise<DbColumn[]> {
    const rows = await this.cf.queryD1(dbId, `PRAGMA table_info("${table}")`);
    return rows.map((c) => ({
      name: String(c.name),
      type: String(c.type || ''),
      pk: Number(c.pk) > 0,
      notnull: Number(c.notnull) > 0,
    }));
  }

  private async count(dbId: string, table: string): Promise<number> {
    const r = await this.cf.queryD1(dbId, `SELECT COUNT(*) AS c FROM "${table}"`);
    return Number(r[0]?.c ?? 0);
  }

  /** Schema overview: every table with its columns + row count. */
  async overview(user: AuthUser, appId: string): Promise<{ tables: DbTable[] }> {
    const dbId = await this.dbId(user, appId, false);
    const names = await this.tableNames(dbId);
    const tables: DbTable[] = [];
    for (const name of names) {
      tables.push({ name, columns: await this.columns(dbId, name), rowCount: await this.count(dbId, name) });
    }
    return { tables };
  }

  /** One page of rows for a table (each row carries `_rowid` for edit/delete). */
  async rows(
    user: AuthUser,
    appId: string,
    table: string,
    page = 1,
    pageSize = 50,
  ): Promise<{ table: string; columns: DbColumn[]; rows: Record<string, unknown>[]; total: number; page: number; pageSize: number }> {
    const dbId = await this.dbId(user, appId, false);
    const t = await this.assertTable(dbId, table);
    const size = Math.min(Math.max(Number(pageSize) || 50, 1), 200);
    const p = Math.max(Number(page) || 1, 1);
    const total = await this.count(dbId, t);
    const rows = await this.cf.queryD1(
      dbId,
      `SELECT rowid AS _rowid, * FROM "${t}" ORDER BY rowid LIMIT ? OFFSET ?`,
      [size, (p - 1) * size],
    );
    return { table: t, columns: await this.columns(dbId, t), rows, total, page: p, pageSize: size };
  }

  /** Keep only entries whose key is a real column of the table. */
  private async pick(
    dbId: string,
    table: string,
    values: Record<string, unknown>,
  ): Promise<[string, unknown][]> {
    const cols = new Set((await this.columns(dbId, table)).map((c) => c.name));
    const entries = Object.entries(values || {}).filter(([k]) => cols.has(k));
    if (!entries.length) throw new BadRequestException('Không có cột hợp lệ để ghi');
    return entries;
  }

  async insert(user: AuthUser, appId: string, table: string, values: Record<string, unknown>): Promise<{ ok: true }> {
    const dbId = await this.dbId(user, appId, true);
    const t = await this.assertTable(dbId, table);
    const entries = await this.pick(dbId, t, values);
    const sql = `INSERT INTO "${t}" (${entries.map(([k]) => `"${k}"`).join(', ')}) VALUES (${entries.map(() => '?').join(', ')})`;
    await this.cf.queryD1(dbId, sql, entries.map(([, v]) => v));
    return { ok: true };
  }

  async update(
    user: AuthUser,
    appId: string,
    table: string,
    rowid: number,
    values: Record<string, unknown>,
  ): Promise<{ ok: true }> {
    const dbId = await this.dbId(user, appId, true);
    const t = await this.assertTable(dbId, table);
    const entries = await this.pick(dbId, t, values);
    const sql = `UPDATE "${t}" SET ${entries.map(([k]) => `"${k}"=?`).join(', ')} WHERE rowid=?`;
    await this.cf.queryD1(dbId, sql, [...entries.map(([, v]) => v), rowid]);
    return { ok: true };
  }

  async remove(user: AuthUser, appId: string, table: string, rowid: number): Promise<{ ok: true }> {
    const dbId = await this.dbId(user, appId, true);
    const t = await this.assertTable(dbId, table);
    await this.cf.queryD1(dbId, `DELETE FROM "${t}" WHERE rowid=?`, [rowid]);
    return { ok: true };
  }
}
