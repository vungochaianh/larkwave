import { type LarkToolDef, enc, str } from './types';
import type { LarkClient } from '../larkClient';

/**
 * Bitable ADVANCED-PERMISSION tools (custom roles + collaborators).
 *
 * These read/modify the permission config a user set up in a Lark Base
 * ("Quản lý phân quyền" / 高级权限). REQUIRES: the Base has advanced permissions
 * ENABLED, and the connected app holds the `bitable:app` scope (or `bitable:app:readonly`
 * for the read tools). Otherwise Lark returns a permission-denied envelope, which the
 * service humanises into a "grant the scope in the Developer Console" hint.
 *
 * Endpoints (open.larksuite.com):
 *   GET    /bitable/v1/apps/{app_token}/roles                          list custom roles
 *   POST   /bitable/v1/apps/{app_token}/roles                          create role
 *   PUT    /bitable/v1/apps/{app_token}/roles/{role_id}                update role
 *   DELETE /bitable/v1/apps/{app_token}/roles/{role_id}               delete role
 *   GET    /bitable/v1/apps/{app_token}/roles/{role_id}/members        list collaborators
 *   POST   /bitable/v1/apps/{app_token}/roles/{role_id}/members        add collaborator
 *   DELETE /bitable/v1/apps/{app_token}/roles/{role_id}/members/{id}   remove collaborator
 */
const apps = (appToken: string) => `/open-apis/bitable/v1/apps/${enc(appToken)}`;

interface Paged {
  items?: unknown[];
  has_more?: boolean;
  page_token?: string;
  total?: number;
}

/** Follow page_token to collect every item (bounded — perms lists are small). */
async function collectAll(c: LarkClient, path: string, pageSize: number): Promise<{ items: unknown[]; total: number }> {
  const items: unknown[] = [];
  let pageToken: string | undefined;
  for (let i = 0; i < 30; i++) {
    const d = await c.request<Paged>('GET', path, { params: { page_size: pageSize, page_token: pageToken } });
    if (Array.isArray(d?.items)) items.push(...d.items);
    if (!d?.has_more || !d?.page_token) break;
    pageToken = d.page_token;
  }
  return { items, total: items.length };
}

interface RoleShape {
  role_id?: string;
  role_name?: string;
  table_roles?: unknown[];
  block_roles?: unknown[];
}

/** Fetch a single role's current config (list + find) — so an update can PRESERVE
 *  fields the caller omits instead of wiping them. */
async function currentRole(c: LarkClient, appToken: string, roleId: string): Promise<RoleShape | undefined> {
  const { items } = await collectAll(c, `${apps(appToken)}/roles`, 30);
  return (items as RoleShape[]).find((r) => r?.role_id === roleId);
}

/** JSON-schema for one entry in table_roles — teaches the agent the real shape. */
const TABLE_ROLE_ITEM = {
  type: 'object',
  properties: {
    table_id: { type: 'string', description: 'ID của bảng' },
    table_perm: {
      type: 'integer',
      description: 'Quyền trên bảng: 0=không xem, 1=chỉ xem, 2=thêm & sửa bản ghi, 4=quản lý (sửa mọi bản ghi).',
    },
    rec_rule: { type: 'object', description: 'Quy tắc quyền theo bản ghi (tuỳ chọn).' },
    field_perm: { type: 'object', description: 'Quyền theo cột: { "tên cột": 1|2 } (tuỳ chọn).' },
    other_perm: { type: 'integer', description: 'Quyền với bản ghi khác (tuỳ chọn).' },
  },
  required: ['table_id', 'table_perm'],
};

const MEMBER_ID_TYPE = {
  type: 'string',
  description: 'Kiểu định danh thành viên: open_id | union_id | user_id | chat_id | department_id | open_department_id (mặc định open_id).',
};

export const bitablePermissionTools: LarkToolDef[] = [
  {
    name: 'bitable_list_roles',
    description:
      'Đọc CẤU HÌNH PHÂN QUYỀN (các vai trò/role tuỳ chỉnh) đã thiết lập trong một Lark Base — tên vai trò, quyền theo bảng (table_roles: xem/sửa/thêm/xoá), quyền theo bản ghi (rec_rule), quyền theo cột (field_perm) và dashboard (block_roles). Gọi khi người dùng hỏi "phân quyền", "ai được xem/sửa gì", "các vai trò trong base". ' +
      'Yêu cầu: Base đã BẬT "Phân quyền nâng cao" và app có scope bitable:app (hoặc bitable:app:readonly). Đã tự phân trang, trả về đầy đủ.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: { app_token: str('app_token của Base') },
      required: ['app_token'],
    },
    gated: false,
    exec: (i, c) => collectAll(c, `${apps(i.app_token)}/roles`, 30),
  },
  {
    name: 'bitable_list_role_members',
    description:
      'Liệt kê THÀNH VIÊN (collaborators) thuộc một vai trò phân quyền của Base (member_type: user/chat/department + tên + id). Gọi sau bitable_list_roles để biết ai đang ở trong mỗi vai trò. Đã tự phân trang.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: { app_token: str('app_token của Base'), role_id: str('role_id (lấy từ bitable_list_roles)') },
      required: ['app_token', 'role_id'],
    },
    gated: false,
    exec: (i, c) => collectAll(c, `${apps(i.app_token)}/roles/${enc(i.role_id)}/members`, 100),
  },
  {
    name: 'bitable_create_role',
    description:
      'TẠO một vai trò phân quyền mới trong Base. BẮT BUỘC có table_roles (mảng quyền theo từng bảng) — một vai trò không có quyền bảng nào sẽ bị Lark từ chối. Nên gọi bitable_list_roles trước để xem cấu trúc một vai trò có sẵn rồi tạo tương tự.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        app_token: str('app_token của Base'),
        role_name: str('Tên vai trò'),
        table_roles: {
          type: 'array',
          description: 'Quyền theo từng bảng (ít nhất 1 mục).',
          items: TABLE_ROLE_ITEM,
        },
        block_roles: {
          type: 'array',
          description: 'Quyền theo dashboard (tuỳ chọn): [{ block_id, block_type, block_perm }].',
          items: { type: 'object' },
        },
      },
      required: ['app_token', 'role_name', 'table_roles'],
    },
    gated: true,
    exec: (i, c) =>
      c.request('POST', `${apps(i.app_token)}/roles`, {
        data: { role_name: i.role_name, table_roles: i.table_roles, ...(i.block_roles ? { block_roles: i.block_roles } : {}) },
      }),
  },
  {
    name: 'bitable_update_role',
    description:
      'SỬA một vai trò phân quyền theo role_id (đổi tên và/hoặc quyền). Đây là thao tác GHI ĐÈ toàn bộ vai trò — NHƯNG tool tự BẢO TOÀN các phần bạn KHÔNG truyền (đọc cấu hình hiện tại rồi trộn). Vì vậy đổi tên thôi thì chỉ cần role_name; muốn đổi quyền thì truyền table_roles mới.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        app_token: str('app_token của Base'),
        role_id: str('role_id cần sửa'),
        role_name: str('Tên vai trò mới (bỏ trống = giữ tên cũ)'),
        table_roles: { type: 'array', description: 'Quyền theo bảng MỚI (bỏ trống = giữ nguyên quyền hiện tại).', items: TABLE_ROLE_ITEM },
        block_roles: { type: 'array', description: 'Quyền dashboard mới (bỏ trống = giữ nguyên).', items: { type: 'object' } },
      },
      required: ['app_token', 'role_id'],
    },
    gated: true,
    exec: async (i, c) => {
      // Preserve omitted fields — Lark's PUT replaces the whole role, so a rename-only
      // call must re-send the existing table_roles/block_roles or they'd be wiped.
      const cur = await currentRole(c, i.app_token, i.role_id);
      const table_roles = i.table_roles ?? cur?.table_roles ?? [];
      const block_roles = i.block_roles ?? cur?.block_roles;
      const role_name = i.role_name ?? cur?.role_name ?? '';
      return c.request('PUT', `${apps(i.app_token)}/roles/${enc(i.role_id)}`, {
        data: { role_name, table_roles, ...(block_roles ? { block_roles } : {}) },
      });
    },
  },
  {
    name: 'bitable_delete_role',
    description: 'XOÁ một vai trò phân quyền theo role_id. Thao tác không hoàn tác — xác nhận kỹ trước khi gọi.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: { app_token: str('app_token của Base'), role_id: str('role_id cần xoá') },
      required: ['app_token', 'role_id'],
    },
    gated: true,
    exec: (i, c) => c.request('DELETE', `${apps(i.app_token)}/roles/${enc(i.role_id)}`),
  },
  {
    name: 'bitable_add_role_member',
    description: 'THÊM một thành viên (người dùng/nhóm/phòng ban) vào một vai trò phân quyền. member_id là id tương ứng member_id_type.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        app_token: str('app_token của Base'),
        role_id: str('role_id'),
        member_id: str('id thành viên (open_id/user_id/chat_id/department_id…)'),
        member_id_type: MEMBER_ID_TYPE,
      },
      required: ['app_token', 'role_id', 'member_id'],
    },
    gated: true,
    exec: (i, c) =>
      c.request('POST', `${apps(i.app_token)}/roles/${enc(i.role_id)}/members`, {
        params: { member_id_type: i.member_id_type || 'open_id' },
        data: { member_id: i.member_id },
      }),
  },
  {
    name: 'bitable_remove_role_member',
    description: 'GỠ một thành viên khỏi một vai trò phân quyền (theo member_id + member_id_type).',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        app_token: str('app_token của Base'),
        role_id: str('role_id'),
        member_id: str('id thành viên cần gỡ'),
        member_id_type: MEMBER_ID_TYPE,
      },
      required: ['app_token', 'role_id', 'member_id'],
    },
    gated: true,
    exec: (i, c) =>
      c.request('DELETE', `${apps(i.app_token)}/roles/${enc(i.role_id)}/members/${enc(i.member_id)}`, {
        params: { member_id_type: i.member_id_type || 'open_id' },
      }),
  },
];
