/**
 * GHI THEO KHOÁ ("upsert" — `match_by`): cập nhật bản ghi đã có thay vì thêm dòng trùng.
 *
 * Vì sao cần: một lịch "mỗi sáng đọc tệp Excel → ghi vào bảng" chạy lần thứ hai là nhân đôi mọi dòng —
 * công cụ ghi chỉ biết THÊM. Khai cột khoá (vd «Mã đơn») thì mỗi dòng vào được so với bảng đang có:
 *   - chưa có khoá → THÊM (cộng thêm, tự duyệt được)
 *   - có đúng một bản ghi cùng khoá, mọi ô gửi lên đã giống → KHÔNG ĐỔI (không ghi gì)
 *   - có đúng một bản ghi cùng khoá, có ô khác → SỬA đúng các ô khác (ghi đè → cần duyệt / cần quyền
 *     "ghi đè ô" khi chạy tự động)
 *   - nhiều bản ghi cùng khoá / khoá rỗng / hai dòng vào cùng khoá → KHÔNG ghi dòng đó, báo rõ.
 *
 * Thuần (không I/O) + một biến thể Open API (custom app, dùng được trên VM).
 */
import type { LarkClient } from './larkClient';

/** Chuẩn hoá giá trị khoá để so: bỏ khoảng trắng thừa, không phân biệt hoa/thường, "12.0" ≡ "12". */
export function normKey(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.map(normKey).filter(Boolean).join('|');
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return normKey(o.text ?? o.name ?? o.value ?? o.link ?? '');
  }
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  const s = String(v).normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
  // "001" giữ nguyên (mã có số 0 đầu là CHỮ); "12.0"/"12,0" → "12" chỉ khi không có số 0 đầu.
  if (/^-?(0|[1-9]\d*)([.,]0+)?$/.test(s)) return s.replace(/[.,]0+$/, '');
  return s;
}

export function compositeKey(values: unknown[]): string {
  const parts = values.map(normKey);
  return parts.some((p) => !p) ? '' : parts.join('␟');
}

export interface UpsertPlan {
  /** Chỉ số dòng vào cần THÊM. */
  creates: number[];
  /** Dòng vào cần SỬA bản ghi đã có (chỉ các trường khác). */
  updates: { index: number; recordId: string; fields: string[] }[];
  /** Dòng vào giống hệt bản ghi đã có. */
  unchanged: { index: number; recordId: string }[];
  /** Không ghi (lỗi theo từng dòng): khoá rỗng, khoá trùng trong dữ liệu vào, nhiều bản ghi cùng khoá. */
  rejected: { index: number; reason: string }[];
}

/**
 * Lập kế hoạch ghi theo khoá.
 * @param existing  bản ghi đang có: id + khoá đã chuẩn hoá (rỗng = không tham gia khớp)
 * @param incoming  dòng vào: khoá đã chuẩn hoá + danh sách tên trường gửi lên
 * @param same      (dòng vào, id bản ghi, tên trường) → ô gửi lên có giống ô đang có không
 */
export function planUpsert(
  existing: { id: string; key: string }[],
  incoming: { key: string; fields: string[] }[],
  same: (index: number, recordId: string, field: string) => boolean,
): UpsertPlan {
  const byKey = new Map<string, string[]>();
  for (const r of existing) {
    if (!r.key) continue;
    const list = byKey.get(r.key) ?? [];
    list.push(r.id);
    byKey.set(r.key, list);
  }
  const seenIn = new Map<string, number>();
  const plan: UpsertPlan = { creates: [], updates: [], unchanged: [], rejected: [] };
  incoming.forEach((row, index) => {
    if (!row.key) {
      plan.rejected.push({ index, reason: 'thiếu giá trị ở cột khoá' });
      return;
    }
    if (seenIn.has(row.key)) {
      plan.rejected.push({ index, reason: `trùng khoá với dòng ${seenIn.get(row.key)! + 1} trong dữ liệu vào` });
      return;
    }
    seenIn.set(row.key, index);
    const hits = byKey.get(row.key) ?? [];
    if (!hits.length) {
      plan.creates.push(index);
      return;
    }
    if (hits.length > 1) {
      plan.rejected.push({ index, reason: `${hits.length} bản ghi trong bảng cùng khoá (${hits.slice(0, 3).join(', ')}) — không biết sửa bản nào` });
      return;
    }
    const recordId = hits[0];
    const changed = row.fields.filter((f) => !same(index, recordId, f));
    if (changed.length) plan.updates.push({ index, recordId, fields: changed });
    else plan.unchanged.push({ index, recordId });
  });
  return plan;
}

/** Tóm tắt kế hoạch thành một câu (hộp xác nhận + kết quả công cụ). */
export function planSummary(p: UpsertPlan): string {
  const parts = [`${p.creates.length} dòng mới`, `${p.updates.length} dòng cần sửa`, `${p.unchanged.length} dòng không đổi`];
  if (p.rejected.length) parts.push(`${p.rejected.length} dòng không ghi được`);
  return parts.join(' · ');
}

// ── Open API (custom app) ────────────────────────────────────────────────────────────────────────

type J = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const enc = encodeURIComponent;

/** Làm phẳng một ô Open API về giá trị so được (chữ / số / danh sách tên). */
function flatOpenApi(v: J): unknown {
  if (v === null || v === undefined) return '';
  if (typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map((x) => (x && typeof x === 'object' ? x.text ?? x.name ?? x.link ?? x.file_token ?? JSON.stringify(x) : x)).join(', ');
  return v.text ?? v.name ?? v.link ?? v.value ?? JSON.stringify(v);
}

async function readAllOpenApi(c: LarkClient, appToken: string, table: string): Promise<{ id: string; fields: Record<string, J> }[]> {
  const items: J[] = [];
  let pageToken: string | undefined;
  let total: number | null = null;
  for (let page = 0; page < 1000; page++) {
    const d = (await c.request('POST', `/open-apis/bitable/v1/apps/${enc(appToken)}/tables/${enc(table)}/records/search`, {
      params: { page_size: 500, ...(pageToken ? { page_token: pageToken } : {}) },
      data: {},
    })) as J;
    if (typeof d?.total === 'number') total = d.total;
    items.push(...(d?.items || []));
    if (!d?.has_more || !d?.page_token) break;
    pageToken = d.page_token;
  }
  if (total !== null && items.length !== total) throw new Error(`Đọc thiếu dữ liệu (Open API): ${items.length}/${total} bản ghi — không ghi theo khoá trên dữ liệu thiếu.`);
  return items.map((it) => ({ id: String(it.record_id), fields: it.fields || {} }));
}

/** Kế hoạch ghi theo khoá qua Open API (chỉ đọc). */
export async function openApiUpsertPlan(
  c: LarkClient,
  appToken: string,
  table: string,
  records: { fields: Record<string, unknown> }[],
  matchBy: string[],
): Promise<{ plan: UpsertPlan; existing: { id: string; fields: Record<string, J> }[] }> {
  const existing = await readAllOpenApi(c, appToken, table);
  const byId = new Map(existing.map((r) => [r.id, r]));
  const plan = planUpsert(
    existing.map((r) => ({ id: r.id, key: compositeKey(matchBy.map((k) => flatOpenApi(r.fields[k]))) })),
    records.map((r) => ({ key: compositeKey(matchBy.map((k) => r.fields?.[k])), fields: Object.keys(r.fields || {}) })),
    (i, id, f) => normKey(flatOpenApi(byId.get(id)?.fields?.[f])) === normKey(records[i].fields?.[f]),
  );
  return { plan, existing };
}

/** Ghi theo khoá qua Open API: batch_create dòng mới, batch_update dòng đổi, đọc lại đủ. */
export async function openApiUpsert(
  c: LarkClient,
  appToken: string,
  table: string,
  records: { fields: Record<string, unknown> }[],
  matchBy: string[],
): Promise<J> {
  const { plan } = await openApiUpsertPlan(c, appToken, table, records, matchBy);
  const base = `/open-apis/bitable/v1/apps/${enc(appToken)}/tables/${enc(table)}`;
  let createdIds: string[] = [];
  if (plan.creates.length) {
    const res = (await c.request('POST', `${base}/records/batch_create`, { data: { records: plan.creates.map((i) => ({ fields: records[i].fields })) } })) as J;
    createdIds = (res?.records || []).map((r: J) => r.record_id).filter(Boolean);
  }
  if (plan.updates.length) {
    await c.request('POST', `${base}/records/batch_update`, {
      data: { records: plan.updates.map((u) => ({ record_id: u.recordId, fields: Object.fromEntries(u.fields.map((f) => [f, records[u.index].fields[f]])) })) },
    });
  }
  const touched = [...createdIds, ...plan.updates.map((u) => u.recordId)];
  const back = touched.length ? ((await c.request('POST', `${base}/records/batch_get`, { data: { record_ids: touched } }).catch(() => null)) as J) : null;
  const got = (back?.records || []).length;
  const verified = got === touched.length && createdIds.length === plan.creates.length;
  return {
    ok: verified && !plan.rejected.length,
    via: 'openapi',
    created: createdIds.length,
    updated: plan.updates.length,
    unchanged: plan.unchanged.length,
    created_record_ids: createdIds,
    updated_record_ids: plan.updates.map((u) => u.recordId),
    ...(plan.rejected.length ? { rejected: plan.rejected.slice(0, 40) } : {}),
    verified,
    note: verified
      ? `GHI THEO KHOÁ (${matchBy.join(' + ')}): ${planSummary(plan)} — đã đọc lại đủ ${got} bản ghi.`
      : 'CHƯA xác minh được bản ghi vừa ghi — KHÔNG được nói đã ghi.',
  };
}
