"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Tooltip } from "antd";
import { BulbFilled, BulbOutlined, MenuFoldOutlined, MenuUnfoldOutlined } from "@ant-design/icons";
import { V, useThemeMode, useI18n, type Locale } from "@larkwave/ui";

/**
 * Bộ điều khiển cho "không gian làm việc" có vỏ riêng, không dùng AppShell. Hiện chỉ còn
 * /agents-chat — /marketing từng là vỏ thứ hai, nay đã chuyển sang Social Wave.
 *
 * Vì sao cần: vỏ đó dựng độc lập với AppShell nên KHÔNG có thanh tiêu đề — mà đó đúng là chỗ
 * AppShell đặt nút đổi nền sáng/tối, đổi ngôn ngữ và thu gọn thanh bên. Ai vào /agents-chat là
 * mất sạch ba thứ đó, không còn đường nào khác để chỉnh.
 *
 * Vẫn để RIÊNG một file dù giờ chỉ một chỗ dùng: file này tồn tại để hai vỏ không lệch nhau, và
 * vỏ thứ hai có thể quay lại. Gộp nó vào AgentsChatShell là bỏ mất chỗ đặt sẵn đó.
 */

/** Bề rộng thanh bên: mở, và khi thu gọn chỉ còn cột biểu tượng. */
export const RAIL_W = 272;
export const RAIL_COLLAPSED_W = 64;

const KEY = "tw_ws_collapsed";

/**
 * Trạng thái thu gọn thanh bên của không gian làm việc.
 *
 * Dùng KHOÁ RIÊNG, không dùng chung `tw_nav_collapsed` của AppShell: thanh bên ở đây chứa NỘI
 * DUNG (danh sách hội thoại, nhóm công cụ) chứ không phải chỉ mấy biểu tượng điều hướng. Gộp một
 * khoá thì việc thu gọn thanh điều hướng chính lại lặng lẽ giấu mất danh sách hội thoại — hai
 * hành động khác hẳn nhau bị buộc vào cùng một công tắc.
 *
 * Mặc định MỞ, ngược với AppShell: ở đây thanh bên là đường chính để đi lại.
 */
export function useRailCollapsed(): { collapsed: boolean; toggle: () => void } {
  const [collapsed, setCollapsed] = useState(false);

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  // Đọc lại lựa chọn đã lưu sau khi gắn (an toàn với kết xuất phía máy chủ: giữ nguyên mặc định
  // cho tới khi hàm này chạy).
  useEffect(() => {
    try {
      const v = localStorage.getItem(KEY);
      if (v !== null) setCollapsed(v === "1");
    } catch {
      /* ignore */
    }
  }, []);

  return { collapsed, toggle };
}

/** Nút thu gọn/mở, đặt cạnh tên không gian ở đầu thanh bên. */
export function RailCollapseButton({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const { t } = useI18n();
  const label = collapsed ? t("comp.shell.expand", "Mở rộng") : t("comp.shell.collapse", "Thu gọn");
  return (
    <Tooltip title={label} placement="right">
      <Button
        type="text"
        size="small"
        aria-label={label}
        icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
        onClick={onToggle}
        style={{ color: V.textSub }}
      />
    </Tooltip>
  );
}

/**
 * Đổi ngôn ngữ + đổi nền sáng/tối.
 *
 * Đặt ở CHÂN thanh bên chứ không thêm một thanh tiêu đề mới: hai không gian này đều là màn hình
 * cao (trò chuyện, thư viện), thêm một dải ngang 60px chỉ để chứa hai cái nút là lấy mất chiều
 * cao ở đúng chỗ cần nó nhất.
 */
export function RailControls({ collapsed }: { collapsed: boolean }) {
  const { mode, toggle } = useThemeMode();
  const { t, locale, setLocale } = useI18n();
  const dark = mode === "dark";
  const place = collapsed ? "right" : "top";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: collapsed ? "column" : "row",
        alignItems: "center",
        justifyContent: collapsed ? "center" : "flex-start",
        gap: 2,
        padding: collapsed ? "2px 0 4px" : "0 2px 4px",
      }}
    >
      <Tooltip title={locale === "en" ? "Chuyển sang Tiếng Việt" : "Switch to English"} placement={place}>
        <Button
          type="text"
          size="small"
          aria-label={t("lang.label")}
          onClick={() => setLocale((locale === "en" ? "vi" : "en") as Locale)}
          style={{ fontWeight: 700, fontSize: 12, minWidth: 36, color: V.textSub }}
        >
          {locale === "en" ? "EN" : "VI"}
        </Button>
      </Tooltip>

      <Tooltip
        title={dark ? t("comp.shell.switchLight", "Chuyển nền sáng") : t("comp.shell.switchDark", "Chuyển nền tối")}
        placement={place}
      >
        <Button
          type="text"
          size="small"
          aria-label={t("comp.shell.toggleTheme", "Đổi nền sáng/tối")}
          icon={dark ? <BulbFilled style={{ color: "#F5C542" }} /> : <BulbOutlined />}
          onClick={toggle}
          style={{ color: V.textSub }}
        />
      </Tooltip>
    </div>
  );
}
