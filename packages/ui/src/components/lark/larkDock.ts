/**
 * Máy trạng thái của khung Lark GẮN CẠNH hội thoại (màn "Tạo workflow").
 *
 * Trang Lark là một native view (WebContentsView) của tiến trình chính, LUÔN vẽ ĐÈ lên trang app —
 * nên mọi thứ của app nằm chồng lên vùng đó (hộp xác nhận, hộp hỏi lại, menu) sẽ bị che. Hàm THUẦN
 * này quyết định mỗi nhịp: gắn đúng toạ độ, giấu (rect 0 — vẫn gắn, vẫn vẽ ở góc để trang không
 * ngủ), hay tháo hẳn. Tách riêng để kiểm được không cần React/Electron.
 */
export interface DockInput {
  /** Khung Lark đang mở (người dùng chưa thu gọn). */
  paneOpen: boolean;
  /** Có hộp thoại/menu của app đang mở (sẽ bị native view che). */
  overlayOpen: boolean;
  /** Tiến trình chính đã có trang Lark. */
  hasWindow: boolean;
  /** Toạ độ ô giữ chỗ (CSS px); null = chưa đo được. */
  rect: { x: number; y: number; width: number; height: number } | null;
  /** Màn đang hiển thị (không bị ẩn bởi tab/màn khác). */
  visible: boolean;
}

export type DockAction =
  | { kind: 'attach'; rect: { x: number; y: number; width: number; height: number } }
  | { kind: 'hide' }
  | { kind: 'detach' };

export const ZERO_RECT = { x: 0, y: 0, width: 0, height: 0 };

export function dockDecision(i: DockInput): DockAction {
  if (!i.visible) return { kind: 'detach' };
  if (!i.hasWindow) return { kind: 'detach' };
  if (!i.paneOpen) return { kind: 'hide' };
  if (i.overlayOpen) return { kind: 'hide' };
  const r = i.rect;
  if (!r || r.width < 2 || r.height < 2) return { kind: 'hide' };
  return { kind: 'attach', rect: { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) } };
}

/** Khung có nên TỰ MỞ không: AI bắt đầu thao tác, hoặc cần đăng nhập — người dùng phải thấy. */
export function shouldAutoOpen(st: { ai?: { active?: boolean }; connected?: boolean; health?: string; loginPending?: boolean } | null, wasActive: boolean): boolean {
  if (!st) return false;
  if (st.ai?.active && !wasActive) return true;
  if (st.loginPending) return true;
  if (st.health === 'dead') return true;
  return false;
}

/** Chiều rộng khung Lark: kẹp trong [minW, total - minChat]. */
export function clampPaneWidth(w: number, total: number, minW = 360, minChat = 420): number {
  const max = Math.max(minW, total - minChat);
  return Math.max(minW, Math.min(max, Math.round(w)));
}

type R = { x: number; y: number; width: number; height: number };
/**
 * Lớp nổi của app (popover, dropdown, menu) có ĐÈ lên ô giữ chỗ của khung Lark không. Chỉ khi đè mới
 * cần giấu native view — popover nằm gọn trong cột hội thoại thì khung Lark vẫn hiện, không nháy.
 * Hộp thoại (modal) phủ cả màn nên luôn đè.
 */
export function overlayHitsPane(overlays: R[], pane: R | null): boolean {
  if (!pane || pane.width < 2 || pane.height < 2) return false;
  return overlays.some((o) => o.width > 0 && o.height > 0 && o.x < pane.x + pane.width && o.x + o.width > pane.x && o.y < pane.y + pane.height && o.y + o.height > pane.y);
}

/** Selector các lớp nổi đang HIỆN của antd (dùng ở renderer để lấy toạ độ). */
export const OVERLAY_SELECTOR =
  '.ant-modal-wrap:not([style*="display: none"]) .ant-modal, .ant-drawer-open .ant-drawer-content-wrapper, .ant-popover:not(.ant-popover-hidden), .ant-dropdown:not(.ant-dropdown-hidden), .ant-select-dropdown:not(.ant-select-dropdown-hidden), .ant-picker-dropdown:not(.ant-picker-dropdown-hidden)';
