import { type LarkToolDef, enc, uuid, str } from './types';
import { noteBitableContext } from './attachments';
import type { LarkClient } from '../larkClient';

const apps = (appToken: string) => `/open-apis/bitable/v1/apps/${enc(appToken)}`;

const OPTIONS_SAMPLE = 20;

/** Lark field `description` wants an object { text }. Accept a plain string OR a pre-shaped
 *  object; return {} when empty so we never send a bad payload. */
function fieldDesc(d: unknown): { description?: { text: string } } {
  if (!d) return {};
  if (typeof d === 'string') return d.trim() ? { description: { text: d.trim() } } : {};
  if (typeof d === 'object' && typeof (d as { text?: unknown }).text === 'string') return { description: d as { text: string } };
  return {};
}

/** Normalize a table's initial `fields` so each column's `description` (string or object) is sent
 *  in Lark's { text } shape — so a designed Base gets real column descriptions. */
function normFields(fields: unknown): unknown[] {
  if (!Array.isArray(fields)) return [];
  return fields.map((f) => {
    if (!f || typeof f !== 'object') return f;
    const { description, ...rest } = f as Record<string, unknown>;
    return { ...rest, ...fieldDesc(description) };
  });
}

/**
 * A single-/multi-select column carries its option list in `property.options` — full
 * `{name,id,color}` objects, OFTEN HUNDREDS. Real user base: some tables returned 120–240 KB
 * of field JSON purely from option catalogs → the CLI agent overflowed + spilled to a file it
 * couldn't re-read → only 15/26 tables summarised. So even option NAMES-in-full are too much
 * when a column has hundreds of options across a 26-table Base. Policy: expose `ui_type` (so
 * single vs multi-select is explicit) + `options_count` + `options_sample` (first 20 names) —
 * enough to understand the valid domain, bounded so it never overflows. `full: true` returns
 * the raw property (every option + id/color) — use it to get the COMPLETE domain of ONE column.
 */
function compactField(f: Record<string, unknown>): Record<string, unknown> {
  if (!f || typeof f !== 'object') return f;
  const prop = f.property as Record<string, unknown> | undefined;
  let property = prop;
  if (prop && Array.isArray((prop as { options?: unknown[] }).options)) {
    const { options, ...rest } = prop as { options: { name?: string }[] } & Record<string, unknown>;
    const names = options.map((o) => o?.name).filter((n): n is string => !!n);
    property = { ...rest, options_count: names.length, options_sample: names.slice(0, OPTIONS_SAMPLE) };
  }
  return {
    field_id: f.field_id,
    field_name: f.field_name,
    type: f.type,
    ui_type: f.ui_type,
    is_primary: f.is_primary,
    ...(property !== undefined ? { property } : {}),
  };
}

/** GET a table's fields, compacted by default (see compactField). `full` returns raw. */
async function listFields(c: LarkClient, appToken: string, tableId: string, full = false): Promise<unknown> {
  const d = await c.request<{ items?: Record<string, unknown>[]; [k: string]: unknown }>(
    'GET',
    `${apps(appToken)}/tables/${enc(tableId)}/fields`,
    { params: { page_size: 200 } },
  );
  if (full || !Array.isArray(d?.items)) return d;
  return { ...d, items: d.items.map(compactField) };
}

/** Compress ONE record field value to a short, human-readable sample (Lark values are often
 *  arrays of {text}/{name} segments). Keeps summaries small — the ACTUAL selected dropdown /
 *  linked values show here, without dumping full option catalogs. */
function trimValue(v: unknown): unknown {
  if (v == null) return v;
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  if (typeof v === 'string') return v.length > 100 ? v.slice(0, 100) + '…' : v;
  if (Array.isArray(v)) {
    const parts = v
      .slice(0, 10)
      .map((x) => {
        if (x == null) return '';
        if (typeof x === 'string') return x;
        if (typeof x === 'object') {
          const o = x as Record<string, unknown>;
          // Ô ĐÍNH KÈM: giữ lại file_token. Rút gọn thành mỗi cái tên là làm mất đúng thứ duy nhất
          // dùng để tải tệp — model nhìn tổng quan thấy "có file Excel" nhưng không có cách nào mở.
          if (typeof o.file_token === 'string') {
            return `${String(o.name ?? o.file_name ?? 'tệp')} <file_token:${o.file_token}>`;
          }
          return String(o.text ?? o.name ?? o.en_name ?? o.file_name ?? safeStringify(o));
        }
        return String(x);
      })
      .filter((s) => s !== '');
    const s = parts.join(', ');
    return s.length > 140 ? s.slice(0, 140) + '…' : s;
  }
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const s = String(o.text ?? o.name ?? o.en_name ?? safeStringify(o));
    return s.length > 100 ? s.slice(0, 100) + '…' : s;
  }
  return v;
}

/** JSON.stringify that never throws (circular / exotic values) — trimValue runs inside a
 *  bounded-concurrency worker; an uncaught throw here would sink the whole overview. */
function safeStringify(o: unknown): string {
  try {
    return JSON.stringify(o) ?? '[object]';
  } catch {
    return '[object]';
  }
}

function trimRecord(fields: Record<string, unknown> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(fields || {})) out[k] = trimValue(val);
  return out;
}

interface TableRef {
  table_id: string;
  name: string;
}

/** Run `fn` over items with bounded concurrency (order preserved). A whole-base overview is
 *  2 calls/table — sequential is slow on a 26–100 table Base; 5-wide keeps it snappy while
 *  staying well under Lark's rate limit (the client also backs off on 429). */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let idx = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (idx < items.length) {
        const cur = idx++;
        out[cur] = await fn(items[cur]);
      }
    }),
  );
  return out;
}

/** One bounded call → the whole Base's structure + a few TRIMMED sample records per table.
 *  Encapsulates the "summarize a base" policy so the agent can't re-bloat: compact fields
 *  (name+type+options_count, NO option catalog) + up to N (≤10) sample records each. */
async function baseOverview(c: LarkClient, appToken: string, sampleN: number): Promise<unknown> {
  const n = Math.max(0, Math.min(Math.trunc(sampleN), 10));
  const { items: tables } = (await c.listAllTables(appToken)) as { items: TableRef[] };
  const out = await mapLimit(tables, 5, async (t) => {
    let fields: unknown[] = [];
    try {
      const f = (await listFields(c, appToken, t.table_id)) as { items?: Record<string, unknown>[] };
      fields = (f.items || []).map((x) => {
        const prop = x.property as { options_count?: number; options_sample?: string[] } | undefined;
        // ui_type makes single- vs multi-select explicit; options_count + sample show the
        // valid domain without dumping hundreds of options (that overflowed the old version).
        return {
          name: x.field_name,
          type: x.type,
          ui_type: x.ui_type,
          ...(prop?.options_count != null ? { options_count: prop.options_count, options_sample: prop.options_sample } : {}),
        };
      });
    } catch {
      /* keep going — a field-list error on one table shouldn't sink the overview */
    }
    let sample_records: unknown[] = [];
    let record_count: number | undefined;
    if (n > 0) {
      try {
        const r = await c.request<{ items?: { fields?: Record<string, unknown> }[]; total?: number }>(
          'POST',
          `${apps(appToken)}/tables/${enc(t.table_id)}/records/search`,
          { params: { page_size: n }, data: {} },
        );
        record_count = r?.total;
        sample_records = (r?.items || []).map((rec) => trimRecord(rec.fields));
      } catch {
        /* empty / no-access table → just skip its samples */
      }
    }
    return { table_id: t.table_id, name: t.name, record_count, fields, sample_records };
  });
  return { table_count: tables.length, tables: out };
}

/** Bitable / Base — the primary "customize Lark server data" surface. */
export const bitableTools: LarkToolDef[] = [
  /**
   * CẤP "APP" — tạo và đổi tên chính cái Base.
   *
   * Trước đây bộ tool chỉ xuống tới bảng / cột / bản ghi / view / role, không có cấp app. Hậu quả
   * thật: agent dựng xong 32 bảng nhưng Base thì KHÔNG CÓ TÊN và nằm trơ ở gốc Drive — người dùng
   * phải tự vào Lark đặt tên rồi kéo đi. Chính agent đã tự chẩn ra và nói đúng hai endpoint còn
   * thiếu; cả hai đã đối chiếu tài liệu Lark trước khi viết.
   */
  {
    name: 'bitable_create_app',
    description:
      'TẠO một Base (multidimensional table) MỚI, có TÊN và nằm đúng thư mục. ' +
      'Dùng tool này thay vì dựng bảng vào một Base không tên ở gốc Drive. ' +
      '`folder_token` lấy từ drive_list_files hoặc drive_create_folder; bỏ trống thì Base nằm ở gốc. ' +
      'Trả về app_token để dùng cho mọi tool bitable_* sau đó.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['name'],
      properties: {
        name: str('Tên Base. Đặt tiếng Việt có dấu thoải mái, vd "2.0 XNK - Base Tổng Hợp".'),
        folder_token: str('Thư mục chứa Base. Bỏ trống = gốc Drive.'),
        time_zone: str('Múi giờ, vd "Asia/Ho_Chi_Minh". Bỏ trống = mặc định của tenant.'),
      },
    },
    gated: true,
    exec: (i, c) =>
      c.request('POST', '/open-apis/bitable/v1/apps', {
        data: {
          name: i.name,
          ...(i.folder_token ? { folder_token: i.folder_token } : {}),
          ...(i.time_zone ? { time_zone: i.time_zone } : {}),
        },
      }),
  },

  {
    name: 'bitable_update_app',
    description:
      'ĐỔI TÊN một Base đã có (hoặc bật/tắt quyền nâng cao). Dùng khi Base chưa có tên, hoặc tên ' +
      'không khớp quy ước đánh số của người dùng.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['app_token'],
      properties: {
        app_token: str('app_token của Base.'),
        name: str('Tên mới. Bỏ trống = không đổi tên.'),
        is_advanced: { type: 'boolean', description: 'Bật/tắt quyền nâng cao. Bỏ trống = không đổi.' },
      },
    },
    gated: true,
    exec: (i, c) =>
      c.request('PUT', apps(i.app_token), {
        data: {
          ...(i.name !== undefined ? { name: i.name } : {}),
          ...(i.is_advanced !== undefined ? { is_advanced: i.is_advanced } : {}),
        },
      }),
  },

  {
    name: 'bitable_list_tables',
    description:
      'Liệt kê TẤT CẢ các bảng (tables) trong một Lark Base/Bitable (đã tự động phân trang — trả về đầy đủ, không bị cắt). Gọi khi cần biết một Base có những bảng nào trước khi đọc hoặc ghi dữ liệu.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: { app_token: str('app_token của Base (lấy từ danh sách Base đã đăng ký)') },
      required: ['app_token'],
    },
    gated: false,
    exec: (i, c) => c.listAllTables(i.app_token),
  },
  {
    name: 'bitable_list_fields',
    description:
      'Liệt kê các trường (cột) của một bảng: tên + kiểu + ui_type (biết rõ single/multi-select). Gọi TRƯỚC khi tạo/sửa bản ghi để biết TÊN CỘT chính xác (phân biệt hoa thường). ' +
      'Với cột LỰA CHỌN, KHÔNG dội toàn bộ options (base thật có cột hàng trăm option → tràn context) mà trả về options_count (tổng số giá trị hợp lệ) + options_sample (~20 giá trị mẫu). ' +
      'Muốn ĐẦY ĐỦ 100% giá trị hợp lệ của MỘT cột thì đặt full=true (trả cả id/màu).',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        app_token: str('app_token của Base'),
        table_id: str('table_id của bảng'),
        full: { type: 'boolean', description: 'true = trả về đầy đủ property (kèm mọi options). Mặc định false (gọn).' },
      },
      required: ['app_token', 'table_id'],
    },
    gated: false,
    exec: (i, c) => listFields(c, i.app_token, i.table_id, !!i.full),
  },
  {
    name: 'bitable_resolve_url',
    description:
      'Chuyển một LINK Lark bất kỳ thành app_token của Base. Dùng KHI người dùng DÁN một URL Base/Wiki trong chat — gọi tool này để lấy app_token rồi mới thao tác (bitable_list_tables…). ' +
      'Hỗ trợ: …/base/<token>, …/bitable/<token>, và …/wiki/<node> (base nhúng trong Wiki — tự resolve node → obj_token qua Wiki API). ' +
      'Trả về { app_token, name?, kind }. Nếu là link Wiki mà không resolve được: báo người dùng cần scope wiki:wiki, hoặc mở Base → ••• → Development Tool để lấy app_token.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: { url: str('URL Lark (…/base/… , …/bitable/… hoặc …/wiki/…)') },
      required: ['url'],
    },
    gated: false,
    exec: async (i, c) => {
      const url = String(i.url ?? '');
      const direct = url.match(/\/(?:base|bitable)\/([A-Za-z0-9]{10,})/);
      if (direct) return { app_token: direct[1], kind: 'base' };
      const wiki = url.match(/\/wiki\/([A-Za-z0-9]{10,})/);
      if (!wiki) throw new Error('URL không phải link Base/Bitable/Wiki hợp lệ (cần …/base/…, …/bitable/… hoặc …/wiki/…).');
      const r = await c.request<{ node?: { obj_token?: string; obj_type?: string; title?: string } }>(
        'GET',
        '/open-apis/wiki/v2/spaces/get_node',
        { params: { token: wiki[1], obj_type: 'wiki' } },
      );
      const node = r?.node;
      if (!node?.obj_token)
        throw new Error('Không lấy được app_token từ link Wiki — có thể bạn chưa có quyền xem trang này, hoặc app/tài khoản thiếu scope wiki:wiki. Cách khác: mở Base → ••• → Development Tool để copy app_token.');
      if (node.obj_type && node.obj_type !== 'bitable')
        throw new Error(`Trang Wiki này là "${node.obj_type}", không phải Bitable Base.`);
      return { app_token: node.obj_token, name: node.title, kind: 'wiki' };
    },
  },
  {
    name: 'bitable_base_overview',
    description:
      'TỔNG QUAN GỌN của cả một Base — gọi MỘT lần để tóm tắt/nắm nhanh thay vì tự quét từng bảng (tránh quá tải). Trả về: mọi bảng + cột (tên + kiểu + ui_type; cột LỰA CHỌN kèm options_count + ~20 giá trị mẫu, KHÔNG dội hàng trăm option để không tràn) + số bản ghi thật mỗi bảng (record_count) + tối đa N bản ghi MẪU mỗi bảng (mặc định 5, giá trị đã cắt gọn — giá trị đang được chọn hiện trong bản ghi mẫu). Bảng RỖNG vẫn được liệt kê. Cần đủ 100% options của MỘT cột thì dùng bitable_list_fields full=true; cần thêm bản ghi thì dùng bitable_search_records.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        app_token: str('app_token của Base'),
        sample_records: {
          type: 'integer',
          description: 'Số bản ghi mẫu mỗi bảng (mặc định 5, tối đa 10). Đặt 0 nếu chỉ cần cấu trúc, không cần dữ liệu mẫu.',
        },
      },
      required: ['app_token'],
    },
    gated: false,
    exec: (i, c) => baseOverview(c, i.app_token, i.sample_records ?? 5),
  },
  {
    name: 'bitable_search_records',
    description:
      'Tìm/đọc bản ghi trong một bảng (chọn cột, LỌC phía máy chủ, sắp xếp, phân trang). Gọi khi người dùng hỏi về dữ liệu cụ thể. ' +
      'Ưu tiên truyền `filter` để máy chủ lọc sẵn (nhanh + đúng) thay vì tải hết rồi tự lọc.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        app_token: str('app_token của Base'),
        table_id: str('table_id của bảng'),
        page_size: { type: 'integer', description: 'Số bản ghi tối đa (mặc định 50, tối đa 500)' },
        page_token: str('Token trang tiếp theo (lấy từ kết quả trước)'),
        field_names: { type: 'array', items: { type: 'string' }, description: 'Chỉ lấy các cột này (theo tên)' },
        filter: {
          type: 'object',
          description:
            'Lọc phía máy chủ: {conjunction:"and"|"or", conditions:[{field_name:"Tên cột", operator:"is|isNot|contains|doesNotContain|isEmpty|isNotEmpty|isGreater|isGreaterEqual|isLess|isLessEqual", value:["..."]}]}',
        },
        sort: {
          type: 'array',
          description: 'Sắp xếp: [{field_name:"Tên cột", desc:true|false}]',
          items: { type: 'object' },
        },
      },
      required: ['app_token', 'table_id'],
    },
    gated: false,
    exec: async (i, c) => {
      noteBitableContext(String(i.app_token || ''), String(i.table_id || ''));
      const d = await c.request('POST', `${apps(i.app_token)}/tables/${enc(i.table_id)}/records/search`, {
        params: { page_size: i.page_size ?? 50, page_token: i.page_token },
        data: {
          field_names: i.field_names,
          ...(i.filter ? { filter: i.filter } : {}),
          ...(Array.isArray(i.sort) && i.sort.length ? { sort: i.sort } : {}),
        },
      });
      // Nhắc lại app_token/table_id trong KẾT QUẢ: sang lượt sau model chỉ còn nhớ tên tool và một
      // mẩu input, nên nếu không nhắc lại thì nó không còn cách nào biết bảng nào để đọc đính kèm.
      return { app_token: i.app_token, table_id: i.table_id, ...(d as Record<string, unknown>) };
    },
  },
  {
    name: 'bitable_get_record',
    description: 'Lấy chi tiết MỘT bản ghi theo record_id.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: { app_token: str('app_token'), table_id: str('table_id'), record_id: str('record_id') },
      required: ['app_token', 'table_id', 'record_id'],
    },
    gated: false,
    exec: async (i, c) => {
      noteBitableContext(String(i.app_token || ''), String(i.table_id || ''));
      const d = await c.request('GET', `${apps(i.app_token)}/tables/${enc(i.table_id)}/records/${enc(i.record_id)}`);
      return { app_token: i.app_token, table_id: i.table_id, ...(d as Record<string, unknown>) };
    },
  },
  {
    name: 'bitable_create_record',
    description:
      'Tạo MỘT bản ghi (dòng) mới trong bảng. Hành động GHI — sẽ hỏi xác nhận trước khi chạy. `fields` là object theo TÊN CỘT; kiểu giá trị: Text="chuỗi", Number=100, Date=mốc-thời-gian-ms, SingleSelect="lựa chọn", MultiSelect=["a","b"], Checkbox=true. Nếu chưa chắc tên cột, gọi bitable_list_fields trước.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        app_token: str('app_token'),
        table_id: str('table_id'),
        fields: { type: 'object', description: 'Map tên-cột → giá trị' },
      },
      required: ['app_token', 'table_id', 'fields'],
    },
    gated: true,
    exec: (i, c) =>
      c.request('POST', `${apps(i.app_token)}/tables/${enc(i.table_id)}/records`, {
        params: { client_token: uuid() },
        data: { fields: i.fields },
      }),
  },
  {
    name: 'bitable_update_record',
    description:
      'Cập nhật MỘT bản ghi theo record_id. Hành động GHI — sẽ hỏi xác nhận. Chỉ truyền các cột muốn đổi trong `fields`.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        app_token: str('app_token'),
        table_id: str('table_id'),
        record_id: str('record_id'),
        fields: { type: 'object', description: 'Các cột cần cập nhật (theo tên)' },
      },
      required: ['app_token', 'table_id', 'record_id', 'fields'],
    },
    gated: true,
    exec: (i, c) =>
      c.request('PUT', `${apps(i.app_token)}/tables/${enc(i.table_id)}/records/${enc(i.record_id)}`, {
        data: { fields: i.fields },
      }),
  },
  {
    name: 'bitable_delete_record',
    description: 'Xoá MỘT bản ghi theo record_id. Hành động GHI nguy hiểm — sẽ hỏi xác nhận.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: { app_token: str('app_token'), table_id: str('table_id'), record_id: str('record_id') },
      required: ['app_token', 'table_id', 'record_id'],
    },
    gated: true,
    exec: (i, c) => c.request('DELETE', `${apps(i.app_token)}/tables/${enc(i.table_id)}/records/${enc(i.record_id)}`),
  },

  // ── Cấu trúc Base: tạo/xoá BẢNG và CỘT (dùng để dựng schema, vd CRM) ─────────
  {
    name: 'bitable_create_table',
    description:
      'TẠO MỘT BẢNG MỚI trong Base, kèm (tuỳ chọn) các cột ban đầu. Dùng tool này để DỰNG cấu trúc dữ liệu (vd thiết kế CRM). Hành động GHI cấu trúc — sẽ hỏi xác nhận. ' +
      '`fields` = mảng [{field_name, type, property?, description?}]. `type` là SỐ của Lark: 1=Văn bản, 2=Số, 3=Chọn một (SingleSelect), 4=Chọn nhiều (MultiSelect), 5=Ngày giờ, 7=Checkbox, 11=Người, 13=Điện thoại, 15=URL, 17=Đính kèm, 18=Liên kết bảng, 19=Lookup, 20=Công thức, 1005=Tự tăng. ' +
      'CỘT ĐẦU TIÊN là cột chính (primary) — chỉ được dùng kiểu Văn bản(1)/Số(2)/Ngày giờ(5)/Công thức(20)/Tự tăng(1005). ' +
      'Với Chọn một/nhiều: property = {options:[{name:"..."},{name:"..."}]}. ' +
      'BẮT BUỘC KHI THIẾT KẾ BASE: mỗi cột NÊN có `description` (mô tả cột) — chuỗi ngắn giải thích cột dùng làm gì / định dạng dữ liệu; nó hiện ngay trên đầu cột trong Base để người dùng hiểu ngay.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        app_token: str('app_token của Base'),
        name: str('Tên bảng cần tạo'),
        fields: {
          type: 'array',
          description: 'Các cột ban đầu: [{ field_name, type(số), property?, description? }]. Cột đầu là cột chính. NÊN kèm description cho mỗi cột.',
          items: { type: 'object' },
        },
      },
      required: ['app_token', 'name'],
    },
    gated: true,
    exec: (i, c) => {
      const fields = normFields(i.fields);
      return c.request('POST', `${apps(i.app_token)}/tables`, {
        data: { table: { name: i.name, ...(fields.length ? { fields } : {}) } },
      });
    },
  },
  {
    name: 'bitable_create_field',
    description:
      'THÊM MỘT CỘT (field) vào một bảng đã có. Hành động GHI cấu trúc — sẽ hỏi xác nhận. ' +
      '`type` là SỐ của Lark: 1=Văn bản, 2=Số, 3=Chọn một, 4=Chọn nhiều, 5=Ngày giờ, 7=Checkbox, 11=Người, 13=Điện thoại, 15=URL, 17=Đính kèm, 18=Liên kết bảng, 19=Lookup, 20=Công thức. ' +
      'Chọn một/nhiều: property={options:[{name:"..."}]}. Lookup/Liên kết cần property phù hợp (table_id liên kết). ' +
      'NÊN kèm `description` (mô tả cột — hiện ngay trên đầu cột trong Base) để người dùng hiểu cột dùng làm gì.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        app_token: str('app_token'),
        table_id: str('table_id của bảng cần thêm cột'),
        field_name: str('Tên cột mới'),
        type: { type: 'integer', description: 'Kiểu cột (số Lark) — xem mô tả tool.' },
        property: { type: 'object', description: 'Thuộc tính theo kiểu (vd Select: {options:[{name}]}).' },
        description: str('Mô tả cột (hiện trên đầu cột trong Base) — nên có để giải thích cột dùng làm gì.'),
      },
      required: ['app_token', 'table_id', 'field_name', 'type'],
    },
    gated: true,
    exec: (i, c) =>
      c.request('POST', `${apps(i.app_token)}/tables/${enc(i.table_id)}/fields`, {
        data: { field_name: i.field_name, type: i.type, ...(i.property ? { property: i.property } : {}), ...fieldDesc(i.description) },
      }),
  },
  {
    name: 'bitable_update_field',
    description:
      'Sửa MỘT cột (đổi tên / đổi kiểu / sửa property). Hành động GHI cấu trúc — sẽ hỏi xác nhận. `type` dùng cùng bảng số như bitable_create_field.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        app_token: str('app_token'),
        table_id: str('table_id'),
        field_id: str('field_id của cột cần sửa'),
        field_name: str('Tên cột mới'),
        type: { type: 'integer', description: 'Kiểu cột (số Lark).' },
        property: { type: 'object', description: 'Thuộc tính kiểu.' },
        description: str('Mô tả cột (hiện trên đầu cột) — truyền để thêm/đổi mô tả.'),
      },
      required: ['app_token', 'table_id', 'field_id', 'field_name', 'type'],
    },
    gated: true,
    exec: (i, c) =>
      c.request('PUT', `${apps(i.app_token)}/tables/${enc(i.table_id)}/fields/${enc(i.field_id)}`, {
        data: { field_name: i.field_name, type: i.type, ...(i.property ? { property: i.property } : {}), ...fieldDesc(i.description) },
      }),
  },
  {
    name: 'bitable_delete_field',
    description: 'Xoá MỘT cột (field) theo field_id. Hành động GHI nguy hiểm — sẽ hỏi xác nhận.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: { app_token: str('app_token'), table_id: str('table_id'), field_id: str('field_id') },
      required: ['app_token', 'table_id', 'field_id'],
    },
    gated: true,
    exec: (i, c) => c.request('DELETE', `${apps(i.app_token)}/tables/${enc(i.table_id)}/fields/${enc(i.field_id)}`),
  },
  {
    name: 'bitable_delete_table',
    description: 'Xoá MỘT bảng (cùng toàn bộ dữ liệu) theo table_id. Hành động GHI RẤT nguy hiểm — sẽ hỏi xác nhận.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: { app_token: str('app_token'), table_id: str('table_id') },
      required: ['app_token', 'table_id'],
    },
    gated: true,
    exec: (i, c) => c.request('DELETE', `${apps(i.app_token)}/tables/${enc(i.table_id)}`),
  },

  // ── Thao tác HÀNG LOẠT (bulk) — nhập/sửa/xoá nhiều bản ghi một lần ───────────
  {
    name: 'bitable_batch_create_records',
    description:
      'Tạo NHIỀU bản ghi cùng lúc (tối đa 1000/lần). Dùng khi nhập nhiều dòng (vd seed dữ liệu CRM mẫu). Hành động GHI — sẽ hỏi xác nhận. `records` = mảng [{fields:{tên cột→giá trị}}].',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        app_token: str('app_token'),
        table_id: str('table_id'),
        records: { type: 'array', description: 'Mảng [{ fields: { tên cột → giá trị } }]', items: { type: 'object' } },
      },
      required: ['app_token', 'table_id', 'records'],
    },
    gated: true,
    exec: (i, c) =>
      c.request('POST', `${apps(i.app_token)}/tables/${enc(i.table_id)}/records/batch_create`, {
        params: { client_token: uuid() },
        data: { records: i.records },
      }),
  },
  {
    name: 'bitable_batch_update_records',
    description:
      'Cập nhật NHIỀU bản ghi cùng lúc. Hành động GHI — sẽ hỏi xác nhận. `records` = mảng [{record_id, fields:{cột→giá trị}}].',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        app_token: str('app_token'),
        table_id: str('table_id'),
        records: { type: 'array', description: 'Mảng [{ record_id, fields:{...} }]', items: { type: 'object' } },
      },
      required: ['app_token', 'table_id', 'records'],
    },
    gated: true,
    exec: (i, c) =>
      c.request('POST', `${apps(i.app_token)}/tables/${enc(i.table_id)}/records/batch_update`, {
        data: { records: i.records },
      }),
  },
  {
    name: 'bitable_batch_delete_records',
    description: 'Xoá NHIỀU bản ghi cùng lúc theo danh sách record_id. Hành động GHI nguy hiểm — sẽ hỏi xác nhận. `record_ids` = mảng chuỗi record_id.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        app_token: str('app_token'),
        table_id: str('table_id'),
        record_ids: { type: 'array', description: 'Mảng các record_id cần xoá', items: { type: 'string' } },
      },
      required: ['app_token', 'table_id', 'record_ids'],
    },
    gated: true,
    exec: (i, c) =>
      c.request('POST', `${apps(i.app_token)}/tables/${enc(i.table_id)}/records/batch_delete`, {
        data: { records: i.record_ids },
      }),
  },

  // ── Views (góc nhìn) — Kanban theo giai đoạn = "pipeline" CRM, Lịch, Gantt… ───
  {
    name: 'bitable_list_views',
    description: 'Liệt kê các view (góc nhìn) của một bảng — Grid/Kanban/Gallery/Gantt/Form. Gọi để biết bảng đang có những view nào.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: { app_token: str('app_token'), table_id: str('table_id') },
      required: ['app_token', 'table_id'],
    },
    gated: false,
    exec: (i, c) => c.request('GET', `${apps(i.app_token)}/tables/${enc(i.table_id)}/views`, { params: { page_size: 100 } }),
  },
  {
    name: 'bitable_create_view',
    description:
      'TẠO một view mới cho bảng. Hành động GHI cấu trúc — sẽ hỏi xác nhận. `view_type`: "grid" (bảng), "kanban" (bảng Kanban — DÙNG để làm PIPELINE CRM theo cột Trạng thái/Giai đoạn), "gallery" (thẻ ảnh), "gantt" (tiến độ), "form" (biểu mẫu nhập liệu). Sau khi tạo Kanban, người dùng chọn cột nhóm (SingleSelect) trên giao diện Lark.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        app_token: str('app_token'),
        table_id: str('table_id'),
        view_name: str('Tên view'),
        view_type: str('grid | kanban | gallery | gantt | form'),
      },
      required: ['app_token', 'table_id', 'view_name', 'view_type'],
    },
    gated: true,
    exec: (i, c) =>
      c.request('POST', `${apps(i.app_token)}/tables/${enc(i.table_id)}/views`, {
        data: { view_name: i.view_name, view_type: i.view_type },
      }),
  },
  {
    name: 'bitable_delete_view',
    description: 'Xoá một view theo view_id (KHÔNG xoá dữ liệu, chỉ xoá góc nhìn). Hành động GHI — sẽ hỏi xác nhận.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: { app_token: str('app_token'), table_id: str('table_id'), view_id: str('view_id') },
      required: ['app_token', 'table_id', 'view_id'],
    },
    gated: true,
    exec: (i, c) => c.request('DELETE', `${apps(i.app_token)}/tables/${enc(i.table_id)}/views/${enc(i.view_id)}`),
  },
];
