import { randomBytes } from 'node:crypto';
import type { ValidationProfile } from './workflowV3';
import type { WebField, WebTable } from './larkWebApi';

/**
 * Thiết kế workflow dạng `steps` CHÍNH THỨC (Base v3 — cùng thứ agent dựng và bộ kiểm workflowV3
 * kiểm) → bản nháp NỘI BỘ mà trình soạn Automation của Lark web lưu (`draft` + `extra`).
 *
 * Vì sao cần chuyển: Open API v3 cần token của custom app (người dùng không muốn nhập App ID);
 * đường web chỉ nhận định dạng NỘI BỘ: bước `{id, type, data, stepTitle, next:[{ids}]}`, bảng/cột
 * viết thành bí danh `ref_<tbl>` / `ref_<tbl>_<fld>`, và `extra.TableMap` ánh xạ bí danh → id thật.
 *
 * CHỈ chuyển những loại bước mà khuôn nội bộ đã được ĐO TỪ DỮ LIỆU THẬT (fixtures trong
 * test/fixtures/lark-web): AddRecordTrigger, SetRecordTrigger (lọc theo lựa chọn), LarkMessageAction
 * (gửi người, tiêu đề + nội dung chữ/tham chiếu cột, nút mở bản ghi). Loại khác → `unsupported`,
 * agent chuyển sang tự thao tác trình soạn của Lark trong khung Chromium (lark_ui_*). Không đoán.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type J = any;

export const WEB_SUPPORTED_TYPES = ['AddRecordTrigger', 'SetRecordTrigger', 'LarkMessageAction'] as const;

export interface WebUser {
  id: string;
  name: string;
  avatarUrl?: string;
}

export interface ConvertResult {
  ok: boolean;
  draft?: J;
  extra?: J;
  triggerName?: string;
  errors: string[];
  unsupported?: string[];
}

const rid = (p: string) => p + randomBytes(6).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 8);
const fold = (s: string) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();

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

/**
 * `triggerName` mà automation/create nhận — ĐÚNG bảng ánh xạ trong mã trình soạn của Lark
 * (`_n[yr.AddRecord] = $r() ? "addRecordV2" : "addRecord"`, cờ "ccm.bitable.automation_add_record_v2"
 * mặc định false; `[yr.SetRecord] = "setRecord"`).
 */
export const TRIGGER_NAME: Record<string, string> = {
  AddRecordTrigger: 'addRecord',
  SetRecordTrigger: 'setRecord',
};

const DEFAULT_CONTROLS = ['pasteUpdate', 'automationBatchUpdate', 'appendImport', 'openAPIBatchUpdate'];

/**
 * Chuyển `steps` v3 → draft/extra nội bộ. `me` = người đang đăng nhập Lark web (người nhận mặc
 * định khi thiết kế nói "gửi cho tôi"). Người nhận v3 dạng open_id `ou_…` KHÔNG dùng được ở đây
 * (web dùng id nội bộ dạng số) — chỉ nhận "me"/id số/tên trùng với `me`.
 */
export function v3ToInternal(input: { title: string; steps: J[] }, tables: WebTable[], me: WebUser | null): ConvertResult {
  const errors: string[] = [];
  const unsupported: string[] = [];
  const steps: J[] = Array.isArray(input.steps) ? input.steps : [];
  if (!steps.length) return { ok: false, errors: ['Thiết kế không có bước nào.'] };
  for (const s of steps) if (!(WEB_SUPPORTED_TYPES as readonly string[]).includes(String(s?.type))) unsupported.push(String(s?.type));
  if (unsupported.length) return { ok: false, errors: [`Chưa hỗ trợ tạo thẳng qua phiên web: ${[...new Set(unsupported)].join(', ')}`], unsupported: [...new Set(unsupported)] };
  if (steps.some((s) => s?.children?.links?.length)) return { ok: false, errors: ['Rẽ nhánh/lặp chưa hỗ trợ tạo thẳng qua phiên web.'], unsupported: ['children'] };

  const tableByName = (n: string) => tables.find((t) => fold(t.name) === fold(n)) || tables.find((t) => t.id === n);
  const TableMap: Record<string, { TableID: string; FieldMap: Record<string, string>; ViewMap: Record<string, string> }> = {};
  const tref = (t: WebTable) => {
    const k = `ref_${t.id}`;
    if (!TableMap[k]) TableMap[k] = { TableID: t.id, FieldMap: {}, ViewMap: {} };
    return k;
  };
  const fref = (t: WebTable, fieldId: string) => {
    const k = `ref_${t.id}_${fieldId}`;
    TableMap[tref(t)].FieldMap[k] = fieldId;
    return k;
  };

  // id thiết kế → id nội bộ (Lark dùng tiền tố trig…/act…) + bảng của trigger (cho ref).
  const idMap = new Map<string, string>();
  for (const s of steps) idMap.set(String(s.id), /Trigger$/.test(String(s.type)) ? rid('trig') : rid('act'));
  const trigger = steps[0];
  if (!/Trigger$/.test(String(trigger?.type))) return { ok: false, errors: ['Bước đầu tiên phải là trigger.'] };
  const trigTable = tableByName(String(trigger?.data?.table_name ?? ''));
  if (!trigTable) return { ok: false, errors: [`Không thấy bảng «${trigger?.data?.table_name ?? ''}» trong Base.`] };
  const stepNum = new Map<string, number>(steps.map((s, i) => [String(s.id), i + 1]));

  /** "$.<step>.<fld>" → cột của bản ghi trigger (hoặc null nếu không hợp lệ). */
  const refField = (ref: string): { stepKey: string; src: J; f: WebField } | null => {
    const m = /^\$\.([^.]+)\.(fld[A-Za-z0-9]+)$/.exec(String(ref));
    if (!m) return null;
    const src = steps.find((s) => String(s.id) === m[1]);
    if (!src || !/Trigger$/.test(String(src.type))) return null; // chỉ tham chiếu bản ghi của trigger
    const f = trigTable.fields.find((x) => x.id === m[2]);
    return f ? { stepKey: m[1], src, f } : null;
  };
  /**
   * Khối ref nội bộ tới một cột của bản ghi trigger — ĐÚNG khuôn trình soạn Lark lưu (đo từ một
   * automation thật đang chạy, xem fixture automation-person-field.json): `value: "step"`, id kết
   * thúc bằng một số ngẫu nhiên. Dùng cho cả ref trong nội dung tin nhắn lẫn người nhận là cột Người.
   */
  const stepRef = (r: { stepKey: string; src: J; f: WebField }, withExtra: boolean): J => {
    const sid = idMap.get(r.stepKey)!;
    return {
      fields: [{ fieldId: fref(trigTable, r.f.id), type: r.f.type }],
      id: `${sid}-${trigTable.id}-${r.f.id}-${10000 + Math.floor(Math.random() * 50000)}`,
      stepId: sid,
      stepNum: stepNum.get(r.stepKey) ?? 1,
      stepType: String(r.src.type),
      tableId: tref(trigTable),
      tagType: 'step',
      type: 'ref',
      value: 'step',
      recordInfo: {},
      ...(withExtra ? { extra: {} } : {}),
    };
  };
  const refItem = (ref: string): J | null => {
    const r = refField(ref);
    return r ? stepRef(r, true) : null;
  };
  const nextOf = (s: J) => (s?.next ? [{ ids: [idMap.get(String(s.next)) || String(s.next)] }] : []);

  const out: J[] = [];
  for (const s of steps) {
    const id = idMap.get(String(s.id))!;
    const d = s.data || {};
    const stepTitle = String(s.title || '');
    if (s.type === 'AddRecordTrigger') {
      const watched = d.watched_field_name ? trigTable.fields.find((f) => fold(f.name) === fold(d.watched_field_name)) : trigTable.fields.find((f) => f.isPrimary) || trigTable.fields[0];
      if (!watched) errors.push(`AddRecordTrigger: không thấy cột «${d.watched_field_name}» trong bảng «${trigTable.name}».`);
      out.push({
        id,
        type: 'AddRecordTrigger',
        data: {
          tableId: tref(trigTable),
          ...(watched ? { watchedFieldId: fref(trigTable, watched.id) } : {}),
          triggerControlList: Array.isArray(d.trigger_control_list) && d.trigger_control_list.length ? d.trigger_control_list : DEFAULT_CONTROLS,
        },
        stepTitle,
        next: nextOf(s),
      });
    } else if (s.type === 'SetRecordTrigger') {
      const watch: J[] = Array.isArray(d.field_watch_info) ? d.field_watch_info : [];
      if (!watch.length) errors.push('SetRecordTrigger: cần field_watch_info (cột nào đổi).');
      const fields: J[] = [];
      for (const w of watch) {
        const f = trigTable.fields.find((x) => fold(x.name) === fold(w?.field_name));
        if (!f) {
          errors.push(`SetRecordTrigger: không thấy cột «${w?.field_name}».`);
          continue;
        }
        const vals: J[] = Array.isArray(w?.value) ? w.value : [];
        if (vals.length && !(f.type === 3 || f.type === 4)) {
          errors.push(`SetRecordTrigger: lọc theo giá trị chỉ hỗ trợ cột lựa chọn (cột «${f.name}» là ${f.typeName}).`);
          continue;
        }
        const optIds = vals.map((v) => {
          const name = typeof v?.value === 'object' ? v.value?.name ?? v.value?.id : v?.value;
          const o = f.options?.find((x) => x.id === name || fold(x.name) === fold(String(name)));
          if (!o) errors.push(`SetRecordTrigger: cột «${f.name}» không có lựa chọn «${name}».`);
          return o?.id;
        });
        fields.push({ fieldId: fref(trigTable, f.id), fieldType: f.type, operator: vals.length ? 'is' : 'isNotEmpty', value: optIds.filter(Boolean) });
      }
      out.push({
        id,
        type: 'SetRecordTrigger',
        data: { tableId: tref(trigTable), recordType: 'All', filterInfo: null, fields, triggerControlList: ['pasteUpdate', 'automationBatchUpdate', 'openAPIBatchUpdate'] },
        stepTitle,
        next: nextOf(s),
      });
    } else if (s.type === 'LarkMessageAction') {
      const persons: J[] = [];
      for (const r of Array.isArray(d.receiver) ? d.receiver : []) {
        const v = r?.value && typeof r.value === 'object' ? r.value : {};
        const rawId = String(typeof r?.value === 'string' ? r.value : v.id ?? '');
        // Người nhận = CỘT NGƯỜI của bản ghi trigger (vd «Sales phụ trách»): ref "$.<trigger>.<fld>".
        // Chấp nhận cả khi agent bọc ref trong value_type "user" (`{id:"$.trigger_1.fld…"}`).
        if (/^\$\./.test(rawId)) {
          const rf = refField(rawId);
          if (!rf) errors.push(`LarkMessageAction: người nhận «${rawId}» không hợp lệ (chỉ cột của bản ghi trigger, dạng $.<trigger>.<fld…>).`);
          else if (!PERSON_FIELD_TYPES.has(rf.f.type)) errors.push(`LarkMessageAction: cột «${rf.f.name}» là ${rf.f.typeName}, không phải cột Người — không dùng làm người nhận được.`);
          else persons.push(stepRef(rf, false));
          continue;
        }
        const isMe = !rawId || rawId === 'me' || (me && (rawId === me.id || fold(String(v.name || '')) === fold(me.name)));
        if (r?.value_type === 'user' && isMe && me) persons.push(userTag(me));
        else if (r?.value_type === 'user' && /^\d{6,}$/.test(rawId)) persons.push(userTag({ id: rawId, name: String(v.name || rawId) }));
        else
          errors.push(
            `LarkMessageAction: người nhận «${v.name || rawId || r?.value_type}» chưa hỗ trợ qua phiên web (được: "tôi", id người dùng nội bộ, hoặc cột Người của bản ghi trigger dạng {value_type:"ref",value:"$.<trigger>.<fld…>"}). Nhóm chat → dùng trình soạn của Lark.`,
          );
      }
      if (!persons.length && !errors.length) errors.push('LarkMessageAction: cần ít nhất một người nhận.');
      const titleText = (Array.isArray(d.title) ? d.title : []).map((x: J) => (x?.value_type === 'text' ? String(x.value ?? '') : '')).join('');
      const paragraph: J[] = [];
      for (const c of Array.isArray(d.content) ? d.content : []) {
        if (c?.value_type === 'text') paragraph.push({ type: 'text', text: String(c.value ?? ''), extra: {} });
        else if (c?.value_type === 'ref') {
          const ri = refItem(String(c.value));
          if (ri) paragraph.push(ri);
          else errors.push(`LarkMessageAction: tham chiếu «${c.value}» không hợp lệ (chỉ cột của bản ghi trigger, dạng $.<trigger>.<fld…>).`);
        }
      }
      if (!paragraph.length) errors.push('LarkMessageAction: nội dung tin nhắn trống.');
      const trigId = idMap.get(String(trigger.id))!;
      // Nút: chỉ "mở bản ghi của trigger" (khuôn stepLink đo từ dữ liệu thật). v3 viết link là
      // ref "$.<trigger>.recordLink"; link khác (URL chữ, thêm/sửa bản ghi) chưa có khuôn → từ chối.
      const btns: J[] = Array.isArray(d.btn_list) ? d.btn_list : [];
      for (const b of btns) {
        const links: J[] = Array.isArray(b?.link) ? b.link : [];
        const okLink = (b?.btn_action ?? 'openLink') === 'openLink' && (links.length === 0 || links.every((l) => l?.value_type === 'ref' && /\.recordLink$/.test(String(l?.value))));
        if (!okLink) errors.push('LarkMessageAction: nút chỉ hỗ trợ "mở bản ghi" (link = $.<trigger>.recordLink) qua phiên web; nút khác → dựng trong trình soạn của Lark.');
      }
      const wantBtn = btns.length > 0 || d.open_record_button === true;
      out.push({
        id,
        type: 'LarkMessageAction',
        data: {
          notifyIdentity: 'mixed',
          robotType: 'baseApp',
          persons,
          // Trình soạn Lark lưu `groups` là BẢN SAO của `persons` (thấy ở mọi automation thật đã
          // đọc, cả người dùng lẫn cột Người) — giữ đúng như thế.
          groups: JSON.parse(JSON.stringify(persons)),
          title: titleText ? [{ text: titleText, type: 'text' }] : [],
          titleTemplateColor: 'blue',
          content: [],
          btnList: wantBtn
            ? [
                {
                  btnKey: rid('message_btn_'),
                  btnAction: 'openLink',
                  btnStyle: 'primary',
                  text: String(d.btn_list?.[0]?.text || 'Xem bản ghi'),
                  link: [
                    {
                      id: `${trigId}-${trigTable.id}-recordUrl1100`,
                      type: 'ref',
                      tagType: 'stepLink',
                      stepId: trigId,
                      stepType: String(trigger.type),
                      tableId: tref(trigTable),
                      isShortcut: true,
                      fieldId: `${tref(trigTable)}_`,
                      viewId: '',
                      value: '',
                      stepNum: 1,
                    },
                  ],
                },
              ]
            : [],
          needBtn: wantBtn,
          needTopBase: false,
          needCompress: true,
          sendMsgScene: 'send',
          senders: [],
          senderType: 4,
          attachments: [],
          contentType: 'rich_text',
          richTextContent: [{ type: 'paragraph', lineMarkerList: [], value: paragraph }],
          buttonConfig: { notRepeatClickMode: 'AllUser', mutualExclusion: false },
        },
        stepTitle: stepTitle || 'Gửi tin nhắn Lark',
        version: '1.1.0',
        next: nextOf(s),
      });
      if (wantBtn) TableMap[tref(trigTable)].FieldMap[`${tref(trigTable)}_`] = '';
    }
  }
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    draft: { steps: out, title: String(input.title || 'Tự động hoá') },
    extra: { TableMap, BlockMap: {}, BtnTrigger: { TableID: '', FieldID: '' } },
    triggerName: TRIGGER_NAME[String(trigger.type)] || '',
    errors: [],
  };
}

/** Kiểu cột dùng làm người nhận được: Người, Người tạo, Người sửa, Tra cứu (thường tra ra người). */
export const PERSON_FIELD_TYPES = new Set([11, 1003, 1004, 19]);

function userTag(u: WebUser): J {
  return { type: 'ref', avatarUrl: u.avatarUrl || '', id: u.id, entityId: u.id, value: u.name, tagType: 'user', owner_type: 0, department: '' };
}

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
  const got: string[] = Array.isArray(draft?.steps) ? draft.steps.map((s: J) => String(s?.type)) : [];
  const want = expected.steps.map((s: J) => String(s?.type));
  if (got.join(',') !== want.join(',')) problems.push(`Bước đã lưu (${got.join(' → ') || 'trống'}) khác thiết kế (${want.join(' → ')}).`);
  if (enabled) problems.push('Automation đang BẬT — Larkwave không bao giờ bật; kiểm tra ngay trong Lark.');
  return { ok: !problems.length, enabled, problems };
}
