/**
 * Máy trạng thái BỐ CỤC của Lark × Agents — hàm THUẦN (không React) để kiểm bằng node.
 *
 * Một agent, một danh sách hội thoại, HAI bố cục:
 *   - 'chat'  (màn "Lark × Agents"): hội thoại chiếm chỗ chính; khung Lark là NGĂN PHỤ bên phải, mặc
 *     định ĐÓNG (nút "Mở khung Lark"), tự mở khi AI thao tác / cần đăng nhập.
 *   - 'frame' (màn "Tạo workflow"): khung Lark LỚN là chính; hội thoại GẮN BÊN TRÁI với ba nấc:
 *       expanded  — bề rộng chat bình thường (420–560px), có nút mở danh sách hội thoại;
 *       collapsed — hội thoại nhỏ xinh (~300px: bong bóng gọn + ô nhập);
 *       rail      — dải dọc 48px (biểu tượng + chấm đang chạy) — bấm là mở lại.
 *     Thanh kéo đổi bề rộng; kéo hẹp quá ngưỡng thì tự "rơi" xuống nấc nhỏ hơn.
 *
 * Mọi lựa chọn nhớ RIÊNG máy này (localStorage — tiện ích của người xem, hỏng thì về mặc định).
 * Lưu ý: khung Lark là native view vẽ ĐÈ lên trang, nên KHÔNG có gì của app được nổi lên trên nó —
 * nấc nhỏ nhất là một dải nằm cạnh khung chứ không phải nút nổi.
 */

export type DockState = 'expanded' | 'collapsed' | 'rail';
export type LarkLayout = 'chat' | 'frame';

export interface LayoutPrefs {
  v: 1;
  /**
   * MỘT màn "Lark × Agents", hai cách xếp (nhớ riêng máy): 'chat' = hội thoại trước (khung Lark là
   * ngăn phụ bên phải), 'frame' = khung Lark lớn trước (hội thoại gắn trái, thu/mở được).
   */
  mode: LarkLayout;
  /** Bố cục 'frame': nấc của hội thoại bên trái. */
  dock: DockState;
  /** Bề rộng khi expanded (px). */
  expandedW: number;
  /** Bố cục 'frame' + expanded: đang mở danh sách hội thoại. */
  historyOpen: boolean;
  /** Bố cục 'chat': ngăn khung Lark bên phải đang mở. */
  sidePaneOpen: boolean;
  /** Bố cục 'chat': bề rộng ngăn khung Lark (px). */
  sidePaneW: number;
}

export const LAYOUT_KEY = 'larkwave.lark.layout.v1';
export const DOCK_W = { expandedMin: 420, expandedMax: 560, expandedDef: 460, collapsed: 300, rail: 48 } as const;
/** Khung Lark không bao giờ hẹp hơn mức này (đọc được canvas ở 1366px). */
export const FRAME_MIN = 560;
/** Ngăn khung Lark bên phải (bố cục chat). */
export const SIDE_W = { min: 380, def: 560 } as const;
/** Bề rộng tối thiểu của hội thoại khi ngăn khung Lark mở (bố cục chat). */
export const CHAT_MIN = 460;

export const DEFAULT_PREFS: LayoutPrefs = {
  v: 1,
  mode: 'chat',
  dock: 'expanded',
  expandedW: DOCK_W.expandedDef,
  historyOpen: false,
  sidePaneOpen: false,
  sidePaneW: SIDE_W.def,
};

const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : d);

/** Đọc prefs đã lưu — chuỗi hỏng/thiếu trường/giá trị lạ đều về mặc định từng trường. */
export function parseLayoutPrefs(raw: string | null | undefined): LayoutPrefs {
  let o: Record<string, unknown> = {};
  try {
    const v = JSON.parse(raw || '{}');
    if (v && typeof v === 'object' && !Array.isArray(v)) o = v;
  } catch {
    /* về mặc định */
  }
  const dock = o.dock === 'collapsed' || o.dock === 'rail' || o.dock === 'expanded' ? o.dock : DEFAULT_PREFS.dock;
  return {
    v: 1,
    mode: o.mode === 'frame' ? 'frame' : 'chat',
    dock,
    expandedW: clamp(num(o.expandedW, DOCK_W.expandedDef), DOCK_W.expandedMin, DOCK_W.expandedMax),
    historyOpen: o.historyOpen === true,
    sidePaneOpen: o.sidePaneOpen === true,
    sidePaneW: Math.max(SIDE_W.min, Math.round(num(o.sidePaneW, SIDE_W.def))),
  };
}

export function serializeLayoutPrefs(p: LayoutPrefs): string {
  return JSON.stringify(p);
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

/**
 * Bề rộng thật của hội thoại bên trái (bố cục frame) theo nấc + bề rộng màn. Expanded bị kẹp để khung
 * Lark còn ≥ FRAME_MIN; màn quá hẹp tới mức expanded không còn nổi 420px thì hiển thị như collapsed.
 */
export function dockWidth(p: Pick<LayoutPrefs, 'dock' | 'expandedW'>, total: number): { state: DockState; width: number } {
  if (p.dock === 'rail') return { state: 'rail', width: DOCK_W.rail };
  if (p.dock === 'collapsed') return { state: 'collapsed', width: DOCK_W.collapsed };
  const room = Math.max(0, Math.round(total) - FRAME_MIN);
  if (room < DOCK_W.expandedMin) return { state: 'collapsed', width: Math.min(DOCK_W.collapsed, Math.max(DOCK_W.rail, room)) };
  return { state: 'expanded', width: clamp(p.expandedW, DOCK_W.expandedMin, Math.min(DOCK_W.expandedMax, room)) };
}

export type DockAction = 'expand' | 'collapse' | 'rail' | 'toggle' | 'restore';

/** Chuyển nấc. `toggle`: expanded ⇄ collapsed (rail → collapsed). `restore`: rail/collapsed → expanded. */
export function nextDock(cur: DockState, a: DockAction): DockState {
  switch (a) {
    case 'expand':
    case 'restore':
      return 'expanded';
    case 'collapse':
      return 'collapsed';
    case 'rail':
      return 'rail';
    case 'toggle':
      return cur === 'expanded' ? 'collapsed' : 'expanded';
  }
}

/**
 * Kéo thanh chia tới bề rộng `w` → nấc + bề rộng mới. Dưới 360px thì "rơi" về collapsed, dưới 170px
 * thì về rail; từ 360px trở lên là expanded (kẹp trong 420–560 và chừa FRAME_MIN cho khung Lark).
 */
export function dragDock(w: number, total: number): { dock: DockState; expandedW?: number } {
  if (w < 170) return { dock: 'rail' };
  if (w < 360) return { dock: 'collapsed' };
  const max = Math.max(DOCK_W.expandedMin, Math.min(DOCK_W.expandedMax, Math.round(total) - FRAME_MIN));
  return { dock: 'expanded', expandedW: clamp(w, DOCK_W.expandedMin, max) };
}

/** Bố cục chat: bề rộng ngăn khung Lark, chừa ≥ CHAT_MIN cho hội thoại. */
export function sidePaneWidth(w: number, total: number): number {
  const max = Math.max(SIDE_W.min, Math.round(total) - CHAT_MIN);
  return clamp(w, SIDE_W.min, max);
}

/** Bố cục mặc định khi mở một hội thoại cũ (trước hợp nhất, hội thoại có kind 'workflow'). */
export function preferredLayout(meta: { kind?: string } | null | undefined): LarkLayout {
  return meta?.kind === 'workflow' ? 'frame' : 'chat';
}

/** Khoá hội thoại đang mở — CHUNG cho cả hai cách xếp, để đổi cách xếp vẫn ở đúng hội thoại. */
export const ACTIVE_CONV_KEY = 'larkwave.wf.activeConv';

/**
 * Chuyển cách xếp. Sang 'frame': khung lớn, hội thoại về nấc mở rộng nếu đang là dải. Về 'chat' từ nút
 * ĐÓNG khung (closeFrame) → ngăn khung phụ cũng đóng; về 'chat' bằng nút "ưu tiên hội thoại" → giữ
 * khung Lark mở ở ngăn phụ để người dùng vẫn thấy canvas.
 */
export function switchMode(p: LayoutPrefs, to: LarkLayout, how: 'toggle' | 'closeFrame' = 'toggle'): LayoutPrefs {
  if (to === 'frame') return { ...p, mode: 'frame', dock: p.dock === 'rail' ? 'collapsed' : p.dock };
  return { ...p, mode: 'chat', sidePaneOpen: how === 'closeFrame' ? false : true };
}

/** Điều khiển khung Lark mà thanh đầu hội thoại nhận (cả hai cách xếp). */
export interface LarkFrameCtl {
  /** Khung Lark đang hiện. */
  open: boolean;
  /** Mở/đóng khung (cách xếp 'frame': đóng = về hội thoại trước, khung đóng). */
  toggle: () => void;
  /** Đổi cách xếp chat-trước ↔ khung-trước. */
  expand?: () => void;
  /** Đang ở cách xếp khung-trước. */
  frameFirst?: boolean;
}
