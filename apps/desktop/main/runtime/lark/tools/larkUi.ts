import { type LarkToolDef, str } from './types';
import { getLarkWebSession } from '../larkWebSession';

/**
 * UI-AUTOMATION tools — the agent READS the live Lark web DOM (snapshot) and ACTS on it (click/fill/
 * select) to build an Automation INSIDE Lark's own panel, so Lark itself produces the valid internal
 * schema (no 800004006 guessing). Runs in the hidden logged-in Lark window via executeJavaScript.
 *
 * SAFETY: these build a DISABLED draft only. lark_ui_act refuses clicks on enable/publish/delete
 * controls (SENSITIVE_UI → requires-confirm) — a human enables in Lark. Only work when Lark web is
 * connected; capped per drive session; Lark-host-only. See toolswave-lark-workflow-800004006 memory.
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
      '(THỬ NGHIỆM — ĐIỀU KHIỂN UI LARK) Chụp giao diện Lark hiện tại → danh sách nút/ô/menu ĐÁNH SỐ (#ref · vai trò · tên · trạng thái). Đây là thứ bạn ĐỌC để quyết định bấm/điền. Menu/dropdown/portal đều nằm trong danh sách. Gọi LẠI sau mỗi hành động làm đổi giao diện (domChanged/urlChanged).',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: { max: { type: 'number', description: 'Số phần tử tối đa (mặc định 200)' } },
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
      '(THỬ NGHIỆM — ĐIỀU KHIỂN UI LARK) Chờ trước khi snapshot lại: `text` (tới khi text hiện ra), `selector`+`stableMs` (tới khi số phần tử khớp ổn định — hợp cho danh sách tải bất đồng bộ/ảo hoá), hoặc `ms` (ngủ cố định). Dùng sau khi bấm mở panel/nạp dữ liệu.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        ms: { type: 'number', description: 'ngủ cố định (ms)' },
        text: str('chờ tới khi thấy text này'),
        selector: str('CSS selector để đếm số phần tử'),
        stableMs: { type: 'number', description: 'coi là ổn định khi số đếm không đổi trong ngần này ms (mặc định 400)' },
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
