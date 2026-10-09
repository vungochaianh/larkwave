import type { ValidationProfile } from './workflowV3';
import type { WebTable } from './larkWebApi';

/**
 * Cầu nối cho đường "Tạo workflow" qua phiên Lark web: hồ sơ kiểm v3 dựng từ kết quả quét web + đọc
 * lại sau khi ghi. Bộ chuyển thiết kế v3 → bản nháp NỘI BỘ (mọi loại bước) nằm ở workflowInternal.ts.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type J = any;

export { WEB_SUPPORTED_TYPES, WEB_UI_ONLY_TYPES, TRIGGER_NAME, v3ToInternal, internalOutline, internalTreeText, outlineSignature } from './workflowInternal';
export type { WebUser, ConvertResult, ConvertOptions } from './workflowInternal';
import { outlineSignature } from './workflowInternal';

/** Hồ sơ cho bộ kiểm v3 dựng từ kết quả quét web (cùng dạng validationProfileFrom). */
export function profileFromWebTables(tables: WebTable[]): ValidationProfile {
  return {
    tables: tables.map((t) => ({
      table_id: t.id,
      name: t.name,
      fields: t.fields.map((f) => ({
        field_id: f.id,
        name: f.name,
        type: f.type,
        ui_type: f.uiType,
        options: f.options?.map((o) => o.name),
      })),
    })),
  };
}

/** Kiểu cột dùng làm người nhận được: Người, Người tạo, Người sửa, Tra cứu (thường tra ra người). */
export const PERSON_FIELD_TYPES = new Set([11, 1003, 1004, 19]);

/**
 * Đọc lại sau khi ghi: bản nháp đã lưu có đúng số bước + đúng loại, và ĐANG TẮT không. Không bao
 * giờ "tin là đã lưu" chỉ vì request trả code 0.
 */
export function verifyReadBack(saved: J, expected: { steps: J[] }): { ok: boolean; enabled: boolean; problems: string[] } {
  const problems: string[] = [];
  if (!saved) return { ok: false, enabled: false, problems: ['Không thấy automation vừa tạo trong danh sách của Base.'] };
  const enabled = Number(saved.status) === 1;
  let draft: J = saved.draft;
  if (typeof draft === 'string') {
    try {
      draft = JSON.parse(draft);
    } catch {
      draft = null;
    }
  }
  const got = outlineSignature(draft);
  const want = outlineSignature(expected);
  if (got !== want) problems.push(`Cây bước đã lưu (${got || 'trống'}) khác bản gửi (${want}).`);
  if (enabled) problems.push('Automation đang BẬT — Larkwave không bao giờ bật; kiểm tra ngay trong Lark.');
  return { ok: !problems.length, enabled, problems };
}
