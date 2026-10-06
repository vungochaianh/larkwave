import type { HookAPI as ModalHookAPI } from "antd/es/modal/useModal";
import type { PlanId } from "@larkwave/shared";
import { ApiError } from "@/lib/api";
import { moBangGoi } from "@/lib/planModal";

/** Official Larkwave Facebook fanpage — single source of truth for contact links. */
export const FANPAGE_URL = "https://web.facebook.com/toolswave.net";

/** Format a VND amount the Vietnamese way: 199000 -> "199.000đ". */
export function formatVnd(amount: number): string {
  if (amount <= 0) return "0đ";
  return `${amount.toLocaleString("vi-VN")}đ`;
}

/** Per-plan accent colour used for cards / tags across the billing UI. */
export const PLAN_ACCENT: Record<PlanId, string> = {
  free: "#9AA3B5",
  starter: "#4FB6FF",
  pro: "#6C5CE7",
  enterprise: "#16B98D",
};

/** The plan we highlight as "Phổ biến" on the pricing page. */
export const POPULAR_PLAN: PlanId = "pro";

/**
 * Tên gói phải đi qua i18n, KHÔNG dùng `plan.label` của API.
 *
 * `plans.ts` ở máy chủ chỉ có nhãn tiếng Việt và không có bản dịch nào; người đã đăng nhập chọn
 * tiếng Anh vẫn nhận về "Khởi đầu / Chuyên nghiệp". Bốn khoá `wcomp.plan*` đã có sẵn cả hai thứ
 * tiếng, nên chỗ nào biết `id` thì dùng chúng và chỉ rơi về `label` khi gặp một gói lạ.
 */
export function tenGoi(t: (k: string, d: string) => string, id: string, label: string): string {
  switch (id) {
    case "free":
      return t("wcomp.planFree", "Miễn phí");
    case "starter":
      return t("wcomp.planStarter", "Khởi đầu");
    case "pro":
      return t("wcomp.planPro", "Chuyên nghiệp");
    case "enterprise":
      return t("wcomp.planEnterprise", "Doanh nghiệp");
    default:
      return label;
  }
}

/**
 * Nếu `err` là lỗi 402 về hạn mức (đã dùng 100% gói tháng, hoặc gói miễn phí bị tắt) thì mở
 * đường nâng gói cho người dùng và trả `true` (đã xử lý). Không phải 402 thì trả `false` để
 * nơi gọi xử lý lỗi theo cách thường.
 *
 * MỞ BẢNG NGAY TẠI CHỖ, KHÔNG ĐIỀU HƯỚNG NỮA.
 *
 * Bản trước hiện một `modal.warning` một dòng rồi `router.push('/pricing')` — tức đúng lúc người
 * dùng vừa bấm dựng một app thì họ bị đẩy ra khỏi bảng điều khiển, sang một trang tiếp thị nền
 * tối không mặc vỏ dashboard. Thứ họ cần lúc đó không phải một trang bán hàng, mà là hai câu trả
 * lời: còn bao nhiêu, và trả bao nhiêu thì đi tiếp được.
 *
 * `moBangGoi()` trả `false` khi không có `<PlanModal/>` nào đang được gắn (trang công khai không có
 * vỏ dashboard). Lúc đó MỚI rơi về đường cũ — cảnh báo + `onUpgrade()` — để cú bấm không bao giờ
 * lặng im.
 *
 * `modal` là thể hiện từ `App.useApp()`; `onUpgrade` nên điều hướng sang /pricing.
 */
export function handleQuotaError(
  err: unknown,
  modal: Pick<ModalHookAPI, "warning">,
  onUpgrade: () => void,
): boolean {
  if (err instanceof ApiError && err.statusCode === 402) {
    const body = err.body as { code?: string; message?: string } | undefined;
    const laHanMuc =
      body?.code === "FREE_PLAN_DISABLED" ||
      body?.code === "QUOTA_EXCEEDED" ||
      body?.code === "INSUFFICIENT_CREDITS";
    if (laHanMuc) {
      const daMo = moBangGoi(
        body?.code === "FREE_PLAN_DISABLED" ? "tat-goi-mien-phi" : "het-han-muc",
      );
      if (daMo) return true;
    }
    // Free plan turned off by an admin → nudge the user to a paid plan.
    if (body?.code === "FREE_PLAN_DISABLED") {
      modal.warning({
        title: "Chế độ miễn phí đang tắt",
        content:
          body.message ??
          "Vui lòng nâng cấp lên gói trả phí để tiếp tục dùng Trợ lý AI.",
        okText: "Xem các gói",
        okButtonProps: { type: "primary" },
        onOk: () => onUpgrade(),
        maskClosable: true,
      });
      return true;
    }
    if (body?.code === "QUOTA_EXCEEDED" || body?.code === "INSUFFICIENT_CREDITS") {
      modal.warning({
        title: "Đã dùng hết gói tháng này",
        content:
          body.message ?? "Bạn đã dùng hết 100% gói tháng này. Nâng gói để tiếp tục.",
        okText: "Xem các gói",
        okButtonProps: { type: "primary" },
        onOk: () => onUpgrade(),
        maskClosable: true,
      });
      return true;
    }
  }

  return false;
}
