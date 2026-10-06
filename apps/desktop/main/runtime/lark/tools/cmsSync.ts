import type { LarkToolDef } from './types';
import { str } from './types';
import { getLarkWebSession } from '../larkWebSession';
import { CmsSyncService, getSharedCmsBaseUrl } from '../cmsSyncService';

/**
 * A Lark agent tool that lets the user set up CMS Bitable-sync jobs CONVERSATIONALLY: paste a
 * list of "table in base" lines, the agent resolves each (using the read tools) + asks the
 * interval, previews the plan, then calls this ONCE with the whole list (one gated confirmation).
 * The connector session is attached FRESH from the persistent Lark web window — no extension.
 */
export const cmsSyncTools: LarkToolDef[] = [
  {
    name: 'cms_create_bitable_sync',
    description:
      '(GHI) TẠO một hoặc NHIỀU job đồng bộ Bitable trên hệ thống CMS (cms-lark-sync) cho người dùng. ' +
      'Dùng khi người dùng đưa một DANH SÁCH bảng-trong-base cần đồng bộ (thường mỗi dòng dạng "TÊN BẢNG base TÊN BASE"). ' +
      'Quy trình BẮT BUỘC: (1) với mỗi dòng, xác định app_token của base (khớp TÊN base với các Base đang áp dụng) và table_id của bảng — gọi bitable_list_tables / bitable_base_overview để khớp TÊN bảng → table_id CHÍNH XÁC (không được bịa); ' +
      '(2) nếu người dùng CHƯA nói chu kỳ, HỎI "muốn tự động đồng bộ mỗi bao lâu?" trước; ' +
      '(3) LIỆT KÊ trước danh sách job sẽ tạo (tên · base · bảng · chu kỳ) rồi gọi công cụ NÀY ĐÚNG MỘT LẦN với TOÀN BỘ danh sách. ' +
      'Mỗi job có thể gồm nhiều table_ids trong cùng một base. Tên job lấy ĐÚNG NGUYÊN VĂN dòng người dùng nhập. ' +
      'Yêu cầu: người dùng đã "Kết nối Lark web".',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        jobs: {
          type: 'array',
          description: 'Danh sách job đồng bộ cần tạo (đã khớp app_token + table_id thật).',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              name: str('Tên job — lấy ĐÚNG NGUYÊN VĂN dòng người dùng nhập'),
              app_token: str('app_token của Base nguồn (đã khớp từ tên base)'),
              table_ids: {
                type: 'array',
                items: { type: 'string' },
                description: 'Danh sách table_id trong base này cần đồng bộ',
              },
              interval_minutes: {
                type: 'number',
                description: 'Chu kỳ tự đồng bộ (phút). Bỏ trống nếu người dùng không nêu.',
              },
            },
            required: ['name', 'app_token', 'table_ids'],
          },
        },
      },
      required: ['jobs'],
    },
    gated: true,
    exec: async (i) => {
      const svc = new CmsSyncService({
        connectorSession: () => getLarkWebSession().getConnectorSession(),
        baseUrl: () => getSharedCmsBaseUrl(),
      });
      const jobs = Array.isArray(i.jobs) ? i.jobs : [];
      if (!jobs.length) return { created_count: 0, note: 'Không có job nào để tạo.' };
      const created: string[] = [];
      const errors: string[] = [];
      for (const j of jobs) {
        const tableIds = Array.isArray(j.table_ids) ? j.table_ids.map(String).filter(Boolean) : [];
        try {
          const r = await svc.createConnectorJob({
            name: String(j.name || '').slice(0, 200),
            appToken: String(j.app_token || ''),
            tableIds,
            enabled: true,
            intervalSeconds: j.interval_minutes ? Math.max(60, Math.round(Number(j.interval_minutes) * 60)) : undefined,
          });
          created.push(r.name || String(j.name));
        } catch (e) {
          errors.push(`${String(j.name)}: ${(e as Error)?.message || 'lỗi'}`);
        }
      }
      return {
        created_count: created.length,
        created,
        ...(errors.length ? { failed_count: errors.length, errors } : {}),
      };
    },
  },
];
