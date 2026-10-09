import { type LarkToolDef, str } from './types';
import { getLarkWebSession } from '../larkWebSession';

/**
 * UI-AUTOMATION tools — the agent READS the live Lark web page (snapshot) and ACTS on it (click/fill/
 * select/drag) to build an Automation / Workflow INSIDE Lark's own editor, so Lark itself produces
 * the valid internal schema (no 800004006 guessing). Driven over CDP (`webContents.debugger`:
 * accessibility tree incl. cross-origin iframes, real mouse/keyboard input, network capture) on the
 * SAME logged-in page the user sees in "Trình duyệt Lark"; the old executeJavaScript driver is
 * only a fallback. Templates ("làm mẫu một lần → dùng lại") replay a hand-made automation.
 *
 * SAFETY: these build a DISABLED draft only. Clicks on enable/publish/delete/test-run controls and
 * on "OK" inside a delete/enable dialog are refused (requires-confirm) — a human enables in Lark.
 * Lark-host-only; capped per run (80); the user's "Dừng" aborts; fail-closed (covered point,
 * unknown ref → refuse). Truth = the captured network save, not "I clicked".
 * See docs/lark-browser.md + toolswave-lark-workflow-800004006 memory.
 */
const NEED_WEB = 'Cần "Kết nối Lark web" (Cài đặt → Lark × Agents). Chưa kết nối thì không điều khiển được cửa sổ Lark.';

function baseUrl(appToken?: string): string | undefined {
  if (!appToken) return undefined;
  const host = getLarkWebSession().status().host;
  if (!host) return undefined;
  return host.replace(/\/+$/, '') + '/base/' + encodeURIComponent(appToken);
}

export const larkUiTools: LarkToolDef[] = [
  {
    name: 'lark_ui_open',
    gated: false,
    description:
      '(THỬ NGHIỆM — ĐIỀU KHIỂN UI LARK) Hiện cửa sổ Lark web + (tuỳ chọn) điều hướng tới 1 URL hoặc Base. Gọi TRƯỚC khi tự dựng Automation trong giao diện Lark. Truyền `url` (trang Lark bất kỳ) HOẶC `app_token` (mở thẳng /base/<app_token>, tránh iframe nhúng). Reset bộ đếm thao tác của phiên.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: { url: str('URL Lark cần mở'), app_token: str('app_token Base → mở /base/<app_token>') },
      required: [],
    },
    exec: async (i) => {
      const web = getLarkWebSession();
      if (!web.status().connected) return { ok: false, error: NEED_WEB };
      return web.uiOpen((i.url as string) || baseUrl(i.app_token as string));
    },
  },
  {
    name: 'lark_ui_snapshot',
    gated: false,
    description:
      '(THỬ NGHIỆM — ĐIỀU KHIỂN UI LARK) Chụp giao diện Lark hiện tại → cây aria gọn: mỗi dòng "- vai_trò \"tên\" [trạng thái] [ref=N]" (dialog/menu/listbox là tiêu đề nhóm, `text "…" [ref]` = chữ bấm được — dùng cho nút/ô trên trình vẽ workflow không có vai trò). Đọc XUYÊN iframe khác origin (Base nhúng). ref ỔN ĐỊNH giữa các snapshot khi phần tử còn đó. Gọi LẠI sau mỗi hành động làm đổi giao diện (domChanged/urlChanged). `saves` = những lần Lark vừa LƯU.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: { max: { type: 'number', description: 'Số dòng tối đa (mặc định 220)' } },
      required: [],
    },
    exec: async (i) => {
      const web = getLarkWebSession();
      if (!web.status().connected) return { ok: false, error: NEED_WEB };
      return web.uiSnapshot({ max: i.max as number });
    },
  },
  {
    name: 'lark_ui_act',
    gated: false,
    description:
      '(THỬ NGHIỆM — ĐIỀU KHIỂN UI LARK) Thực hiện 1 hành động trên 1 `ref` của snapshot MỚI NHẤT. `action`: click | dblclick | fill | clear | select | press | hover | scrollIntoView | scrollBy. `value` cho fill/select; `key` cho press (Enter/Escape/ArrowDown…); `dx`/`dy` cho scrollBy. ' +
      'Chọn control theo VAI TRÒ + TÊN (VN/EN/CN khác nhau), đừng bám số #ref qua nhiều snapshot. Combobox tuỳ biến: click để mở → snapshot lại → click đúng option. ' +
      'AN TOÀN: hành động BẬT/XUẤT BẢN/XOÁ automation bị CHẶN (trả requires-confirm) — KHÔNG tự bật, hãy DỪNG và để người dùng tự bấm trong Lark. Sau hành động nếu domChanged/urlChanged → snapshot lại.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        ref: { type: 'number', description: '#ref từ snapshot mới nhất' },
        action: str('click|dblclick|fill|clear|select|press|hover|scrollIntoView|scrollBy'),
        value: str('giá trị cho fill/select'),
        key: str('phím cho press: Enter/Escape/Tab/ArrowDown/ArrowUp…'),
        dx: { type: 'number', description: 'cuộn ngang cho scrollBy' },
        dy: { type: 'number', description: 'cuộn dọc cho scrollBy (mặc định 300)' },
        submit: { type: 'boolean', description: 'fill xong nhấn Enter' },
      },
      required: ['ref'],
    },
    exec: async (i) => {
      const web = getLarkWebSession();
      if (!web.status().connected) return { ok: false, error: NEED_WEB };
      return web.uiAct(i);
    },
  },
  {
    name: 'lark_ui_wait',
    gated: false,
    description:
      '(THỬ NGHIỆM — ĐIỀU KHIỂN UI LARK) Chờ trước khi snapshot lại: `text` (tới khi chữ hiện ra — kể cả trong iframe), `role`/`name` (tới khi có phần tử đó, vd role="dialog"), `network_idle` (tới khi mạng yên — sau khi bấm Lưu/chọn bảng), hoặc `ms` (ngủ cố định). Kết hợp được; `timeout_ms` mặc định 8000. resolved=false nghĩa là hết giờ — snapshot lại xem trang đang ở đâu.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        ms: { type: 'number', description: 'ngủ cố định (ms)' },
        text: str('chờ tới khi thấy text này'),
        role: str('chờ tới khi có phần tử vai trò này (vd dialog, menu, option, button)'),
        name: str('… và/hoặc tên này (vd "Thêm hành động")'),
        network_idle: { type: 'boolean', description: 'chờ tới khi mạng YÊN (không còn request) — dùng sau khi bấm Lưu / chọn bảng' },
        idle_ms: { type: 'number', description: 'mạng phải yên trong ngần này ms (mặc định 600)' },
        timeout_ms: { type: 'number', description: 'tối đa chờ (mặc định 8000, tối đa 30000)' },
        selector: str('(cũ) CSS selector để đếm số phần tử — chỉ khung chính'),
        stableMs: { type: 'number', description: '(cũ) coi là ổn định khi số đếm không đổi trong ngần này ms (mặc định 400)' },
      },
      required: [],
    },
    exec: async (i) => {
      const web = getLarkWebSession();
      if (!web.status().connected) return { ok: false, error: NEED_WEB };
      return web.uiWait(i);
    },
  },
  {
    name: 'lark_ui_drag',
    gated: false,
    description:
      '(THỬ NGHIỆM — ĐIỀU KHIỂN UI LARK) KÉO-THẢ THẬT bằng chuột (nhấn → di nhiều bước → thả) — để NỐI 2 nút trên trình vẽ Quy trình (kéo từ chấm/cổng ra của nút này sang nút kia), di chuyển thẻ, sắp xếp. `from_ref` = phần tử bắt đầu kéo; `to_ref` = phần tử đích, HOẶC `dx`/`dy` (px) để kéo một đoạn. `steps` = số bước di (mặc định 12). Sau khi kéo: snapshot lại để kiểm đường nối đã có chưa. Kéo vào vùng tên "Xoá/Delete" bị chặn.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        from_ref: { type: 'number', description: '#ref phần tử bắt đầu kéo' },
        to_ref: { type: 'number', description: '#ref phần tử đích' },
        dx: { type: 'number', description: 'kéo ngang (px) nếu không có to_ref' },
        dy: { type: 'number', description: 'kéo dọc (px) nếu không có to_ref' },
        steps: { type: 'number', description: 'số bước di chuột (2–60, mặc định 12)' },
      },
      required: ['from_ref'],
    },
    exec: async (i) => {
      const web = getLarkWebSession();
      if (!web.status().connected) return { ok: false, error: NEED_WEB };
      return web.uiDrag(i);
    },
  },
  {
    name: 'lark_ui_saved',
    gated: false,
    description:
      '(THỬ NGHIỆM — ĐIỀU KHIỂN UI LARK) SỰ THẬT từ mạng: liệt kê những lần Lark THỰC SỰ lưu automation/workflow trong lượt này (đường dẫn, op, code Lark trả về, workflowID, status 0=nháp/1=bật). Gọi sau khi bấm "Lưu" trong Lark để LẤY workflowID THẬT báo cho người dùng — đừng nói "đã tạo" nếu ở đây không có lần lưu ok=true.',
    inputSchema: { type: 'object', additionalProperties: false, properties: {}, required: [] },
    exec: async () => {
      const web = getLarkWebSession();
      if (!web.status().connected) return { ok: false, error: NEED_WEB };
      return web.uiSaved();
    },
  },
  {
    name: 'lark_ui_template_list',
    gated: false,
    description:
      '(MẪU "LÀM MẪU MỘT LẦN → DÙNG LẠI") Liệt kê các MẪU automation/workflow người dùng đã dựng tay một lần trong "Trình duyệt Lark" rồi lưu lại. Mỗi mẫu có `vars` (biến: bảng/cột/view/option/người/nhóm — `key`, `kind`, `original`, `table` = biến bảng chứa cột, `hint` = tên gợi ý). Đây là đường DỰ PHÒNG: tạo workflow mặc định bằng bitable_workflow_create (Open API v3). Chỉ khi v3 không dùng được mới tới bước này — và GỌI TRƯỚC khi tự lái giao diện: nếu có mẫu khớp yêu cầu thì dùng `lark_ui_template_apply` (nhanh + chắc chắn hợp lệ).',
    inputSchema: { type: 'object', additionalProperties: false, properties: {}, required: [] },
    exec: async () => {
      const web = getLarkWebSession();
      const list = web.templateList();
      return { ok: true, count: list.length, templates: list };
    },
  },
  {
    name: 'lark_ui_template_apply',
    gated: true,
    description:
      '(MẪU "LÀM MẪU MỘT LẦN → DÙNG LẠI") Tạo một automation/workflow MỚI dạng BẢN NHÁP (TẮT) từ một mẫu — gửi lại đúng khuôn Lark đã lưu khi người dùng làm tay, chỉ thay id. `template_id`; `app_token` = Base đích (bỏ trống = Base gốc của mẫu → nhân bản); `vars` = { "<key>": "<id mới>" } — BẮT BUỘC đủ mọi biến bảng/cột/view/option khi Base đích KHÁC Base gốc (lấy id thật qua bitable_list_tables / bitable_list_fields, khớp theo `hint`/tên); người/nhóm mặc định giữ nguyên. `title` = tên mới (tuỳ chọn). KHÔNG bao giờ bật — báo người dùng workflowID và bảo họ mở Lark xem lại rồi tự BẬT.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        template_id: str('id mẫu (từ lark_ui_template_list)'),
        app_token: str('Base đích (bỏ trống = Base gốc của mẫu)'),
        vars: { type: 'object', description: '{ "tbl_1": "tblXXXX", "fld_1": "fldYYYY", … }', additionalProperties: { type: 'string' } },
        title: str('tên cho bản nháp mới (tuỳ chọn)'),
      },
      required: ['template_id'],
    },
    exec: async (i) => {
      const web = getLarkWebSession();
      if (!web.status().connected) return { ok: false, error: NEED_WEB };
      const vars: Record<string, string> = {};
      if (i.vars && typeof i.vars === 'object') for (const [k, v] of Object.entries(i.vars as Record<string, unknown>)) if (v != null) vars[k] = String(v);
      return web.templateApply({ id: String(i.template_id || ''), baseId: (i.app_token as string) || undefined, vars, title: (i.title as string) || undefined });
    },
  },
  {
    name: 'lark_app_inspect',
    gated: false,
    description:
      '(THỬ NGHIỆM — SOI APP LARK) Mở một trang **Lark App / aPaaS** ("Ứng dụng" low-code, URL dạng https://…/app/<id>?pageId=…) trong cửa sổ Lark rồi CHẨN LỖI LOADING + liệt kê chức năng. ' +
      'BẮT BUỘC truyền `url` ĐẦY ĐỦ (không phải app_token trơn — route /app/ cần URL đầy đủ). Chỉ ĐỌC, không bấm gì. ' +
      'Trả về: `status` (ok | empty=root trống | stuck=spinner kẹt | error=có banner lỗi/refetch fail | nav-failed), `bannerTexts` (chữ lỗi người dùng thấy), `failedRequests` (4xx/5xx hoặc Lark soft-error code≠0 + msg — chỉ ra nguyên nhân gốc như thiếu quyền/thiếu field/table), `consoleErrors`, và `controls` (bề mặt chức năng đã render). ' +
      'QUAN TRỌNG — TAB: các tab trong app (vd "Trang Tổng Hợp / Dữ Liệu Vận Đơn / …") là điều hướng phụ trong TRANG, `pageId` trên URL KHÔNG deep-link tới tab → mở lên luôn rơi vào tab ĐẦU. Muốn soi ĐÚNG một tab, truyền `tab` = TÊN tab (vd "Dữ Liệu Vận Đơn"); tool sẽ mở → chờ → click tab đó → chờ tab tải → mới soi. Xem `tabClicked`/`controls` để biết đã đúng tab chưa; nếu `tabNote` báo không thấy, đọc controls lấy tên tab đúng rồi thử lại. ' +
      'ĐỌC XUYÊN IFRAME: nếu trang là Lark Docs có khối Bitable/Base NHÚNG (tab "Dữ Liệu Vận Đơn"… nằm trong khối nhúng), tool soi XUYÊN vào các iframe đó (kể cả khác origin, qua main-process) — kết quả `frames[]` liệt kê từng frame, `controls` gắn `frame` để biết control ở khối nhúng nào. Lỗi khối nhúng thường hiện ở `consoleErrors` (vd "Record error", "getChartId error" = chart bị xoá/mất quyền) chứ không có banner. ' +
      'LƯU Ý: Open API KHÔNG đọc được trang aPaaS — chỉ soi qua giao diện này; "chức năng" = mức RENDER + có control, không test hành vi sâu. Cần đã "Kết nối Lark web".',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        url: str('URL ĐẦY ĐỦ của trang Lark App (https://…/app/<id>?pageId=…)'),
        tab: str('(tuỳ chọn) TÊN tab/mục cần soi (vd "Dữ Liệu Vận Đơn") — vì URL không deep-link được tới tab'),
        settle_ms: { type: 'number', description: 'thời gian chờ app tải xong trước khi soi (mặc định 3500ms)' },
      },
      required: ['url'],
    },
    exec: async (i) => {
      const web = getLarkWebSession();
      if (!web.status().connected) return { ok: false, error: NEED_WEB };
      return web.appInspect(String(i.url || ''), { settleMs: i.settle_ms as number, tab: i.tab as string });
    },
  },
];
