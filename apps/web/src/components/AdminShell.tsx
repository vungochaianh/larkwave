"use client";

import { ApiOutlined, AppstoreOutlined, AuditOutlined, BarChartOutlined, BulbFilled, BulbOutlined, CommentOutlined, CreditCardOutlined, CloudServerOutlined, DashboardOutlined, DollarOutlined, LogoutOutlined, MenuFoldOutlined, MenuOutlined, MenuUnfoldOutlined, RobotOutlined, MessageOutlined, RocketOutlined, UserOutlined } from "@ant-design/icons";
import { Button, ConfigProvider, Drawer, Dropdown, Grid, Layout, Menu, Tooltip } from "antd";
import type { MenuProps } from "antd";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTabTitle, nhanTheoDuongDan } from "@/lib/useTabTitle";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { V, useI18n, useThemeMode } from "@larkwave/ui";
import { useAuth } from "@/lib/auth";
import { PlanBadge, UserAvatar } from "@/components/UserAvatar";
import FeedbackButton from "@/components/FeedbackButton";
import ChatbotWidget from "@/components/ChatbotWidget";

const { Header, Sider, Content } = Layout;
const { useBreakpoint } = Grid;

/** Tím thương hiệu — cùng một hằng với AppShell và packages/ui/theme.ts. */
const BRAND = "#6C5CE7";

/** Ghi nhớ trạng thái thu gọn của thanh bên quản trị (khác khoá với AppShell để hai mặt độc lập). */
const COLLAPSED_KEY = "tw_admin_nav_collapsed";

interface NavItem {
  key: string;
  icon: ReactNode;
  label: string;
}
interface NavGroup {
  title: string;
  items: NavItem[];
}

const NAV: NavGroup[] = [
  {
    title: "Tổng quan",
    items: [
      { key: "/admin", icon: <DashboardOutlined />, label: "Dashboard" },
      { key: "/admin/reports", icon: <BarChartOutlined />, label: "Báo cáo" },
      { key: "/admin/claude", icon: <MessageOutlined />, label: "Claude" },
      { key: "/admin/system", icon: <RocketOutlined />, label: "Hệ thống" },
    ],
  },
  {
    title: "Vận hành",
    items: [
      { key: "/admin/users", icon: <UserOutlined />, label: "Người dùng" },
      { key: "/admin/runner-errors", icon: <CloudServerOutlined />, label: "Lỗi runner" },
      { key: "/admin/feedback", icon: <CommentOutlined />, label: "Báo lỗi người dùng" },
    ],
  },
  {
    title: "Cấu hình",
    items: [
      { key: "/admin/ai", icon: <RobotOutlined />, label: "Quản lý AI" },
      { key: "/admin/maic", icon: <ApiOutlined />, label: "MAIC — hạn mức" },
      { key: "/admin/billing", icon: <DollarOutlined />, label: "Gói & Giá" },
      { key: "/admin/payments", icon: <CreditCardOutlined />, label: "Thanh toán" },
      { key: "/admin/audit", icon: <AuditOutlined />, label: "Nhật ký" },
    ],
  },
];

const ALL_KEYS = NAV.flatMap((g) => g.items.map((i) => i.key));

/** Đọc trạng thái thu gọn NGAY trong bộ khởi tạo (không đợi effect) để thanh bên không nháy khi gắn lại. */
function readCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Logo + tên ở đầu thanh bên. Cùng cấu trúc với `Brand` của AppShell (logo gradient 30px, chữ
 * TOOLSWAVE 800) — chỉ thêm dòng "ADMIN CONSOLE" tím để người dùng biết mình đang ở mặt quản trị.
 */
function AdminBrand({ collapsed }: { collapsed: boolean }) {
  return (
    <Link
      href="/admin"
      style={{
        height: 60,
        display: "flex",
        alignItems: "center",
        gap: 11,
        padding: collapsed ? "0" : "0 18px",
        justifyContent: collapsed ? "center" : "flex-start",
        borderBottom: `1px solid ${V.borderSub}`,
        overflow: "hidden",
        flex: "0 0 auto",
      }}
    >
      <span
        className="tw-logo-mark"
        style={{
          display: "inline-flex",
          minWidth: 30,
          width: 30,
          height: 30,
          borderRadius: 10,
          alignItems: "center",
          justifyContent: "center",
          fontSize: 15,
          boxShadow: "0 6px 16px rgba(108,92,231,0.30)",
        }}
      >
        <CloudServerOutlined />
      </span>
      {!collapsed && (
        <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
          <span style={{ fontWeight: 800, letterSpacing: 1, fontSize: 15, color: V.text }}>
            TOOLSWAVE
          </span>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: BRAND }}>
            ADMIN CONSOLE
          </span>
        </span>
      )}
    </Link>
  );
}

/**
 * Nội dung thanh bên: dùng chung cho Sider (màn rộng) và Drawer (điện thoại), nên chỉ viết một lần.
 */
function SidebarInner({
  collapsed,
  selected,
  onNavigate,
}: {
  collapsed: boolean;
  selected: string;
  onNavigate?: () => void;
}) {
  const { t } = useI18n();
  const { mode } = useThemeMode();

  // Mỗi nhóm là một tiêu đề nhỏ (không bấm được) rồi tới các mục. Khi thu gọn, tiêu đề đổi thành
  // một vạch mảnh để vẫn thấy ranh giới giữa các nhóm mà không tốn chỗ.
  const menuItems: MenuProps["items"] = NAV.flatMap((group, gi) => {
    const header = {
      key: `__grp_${gi}`,
      type: "group" as const,
      label: collapsed ? (
        gi === 0 ? null : (
          <div style={{ height: 1, background: V.borderSub, margin: "8px 12px" }} />
        )
      ) : (
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 800,
            letterSpacing: 1.4,
            textTransform: "uppercase",
            color: V.textFaint,
          }}
        >
          {t(`wcomp.adminGroup.${gi}`, group.title)}
        </span>
      ),
    };
    const items = group.items.map((m) => ({
      key: m.key,
      icon: m.icon,
      label: (
        <Link href={m.key} onClick={onNavigate}>
          {t(`wcomp.adminNav.${m.key}`, m.label)}
        </Link>
      ),
    }));
    return [header, ...items];
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <AdminBrand collapsed={collapsed} />
      <div style={{ flex: 1, overflowY: "auto", paddingTop: 6 }}>
        {/* Mục đang chọn: nền tối thì chữ trắng trên tím đặc (antd mặc định là tím trên tím nhạt,
            ~2.2:1, không đạt AA); nền sáng giữ tím trên nền tím rất nhạt. Tắt vạch phải mặc định của
            antd (activeBarBorderWidth) vì viền sáng của mục đang chọn đã vẽ bằng CSS `.tw-admin`. */}
        <ConfigProvider
          theme={{
            components: {
              Menu: {
                activeBarBorderWidth: 0,
                itemBorderRadius: 10,
                itemMarginInline: 8,
                ...(mode === "dark"
                  ? {
                      itemSelectedColor: "#fff",
                      itemSelectedBg: BRAND,
                      itemActiveBg: "rgba(124,108,240,0.16)",
                    }
                  : {
                      itemSelectedColor: BRAND,
                      itemSelectedBg: "rgba(108,92,231,0.10)",
                      itemHoverBg: "rgba(108,92,231,0.06)",
                    }),
              },
            },
          }}
        >
          <Menu
            mode="inline"
            selectedKeys={[selected]}
            style={{ background: "transparent", borderInlineEnd: "none" }}
            items={menuItems}
          />
        </ConfigProvider>
      </div>
    </div>
  );
}

export default function AdminShell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const pathname = usePathname();
  // Khu quản trị chỉ có tiếng Việt nên nhãn lấy thẳng từ NAV, không qua i18n.
  useTabTitle(nhanTheoDuongDan(pathname, NAV.flatMap((g) => g.items)) ?? "Quản trị");
  const router = useRouter();
  const { user, logout } = useAuth();
  const { mode, toggle: toggleTheme } = useThemeMode();
  const screens = useBreakpoint();
  // Dưới `lg` thanh bên thành Drawer: một cột 72px cố định ở ~380px sẽ ăn mất 1/5 chiều ngang
  // của bảng — bảng số liệu là thứ quản trị viên cần rộng nhất.
  const isMobile = !screens.lg;

  const [collapsed, setCollapsed] = useState<boolean>(readCollapsed);
  const applyCollapsed = useCallback((next: boolean) => {
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
    } catch {
      /* bỏ qua: chỉ là tiện ích ghi nhớ */
    }
  }, []);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Sang trang thì đóng Drawer (điện thoại).
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  const selected =
    ALL_KEYS.filter(
      (k) => pathname === k || (k !== "/admin" && pathname.startsWith(k)),
    ).sort((a, b) => b.length - a.length)[0] ?? "/admin";

  return (
    // `tw-admin`: điểm móc cho toàn bộ CSS quản trị trong globals.css (mặt kính, chấm trạng thái,
    // tabular-nums…). Mọi trang admin nằm trong đây nên không phải sửa từng trang.
    <Layout className="tw-admin" style={{ minHeight: "100vh", background: V.layer }}>
      {!isMobile && (
        <Sider
          className="tw-admin-sider"
          collapsedWidth={72}
          width={252}
          collapsible
          collapsed={collapsed}
          onCollapse={applyCollapsed}
          trigger={null}
          style={{
            position: "sticky",
            top: 0,
            height: "100vh",
            // Đặt nền inline vì antd Sider mặc định là xanh navy (#001529) ở theme sáng — theme
            // dùng chung không ghi đè token Layout. Quầng sáng tím ở góc trên do CSS `.tw-admin-sider::before` vẽ.
            background: V.surface,
            borderRight: `1px solid ${V.border}`,
            overflow: "auto",
          }}
        >
          <SidebarInner collapsed={collapsed} selected={selected} />
        </Sider>
      )}
      <Layout style={{ background: "transparent", minWidth: 0 }}>
        <Header
          className="tw-admin-header"
          style={{
            position: "sticky",
            top: 0,
            zIndex: 20,
            display: "flex",
            alignItems: "center",
            gap: isMobile ? 6 : 14,
            padding: isMobile ? "0 8px" : "0 20px",
            height: 60,
            // Mờ trong suốt để blur có tác dụng (đặc thì blur vô nghĩa); color-mix giữ đúng màu
            // bề mặt của cả hai theme thay vì ghim rgba trắng như trước.
            background: `color-mix(in srgb, ${V.surface} 78%, transparent)`,
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            borderBottom: `1px solid ${V.border}`,
          }}
        >
          {isMobile ? (
            <Button
              type="text"
              aria-label={t("wcomp.adminExpandMenu", "Mở rộng menu")}
              icon={<MenuOutlined />}
              onClick={() => setDrawerOpen(true)}
              style={{ flex: "0 0 auto" }}
            />
          ) : (
            <Tooltip title={collapsed ? t("action.expand", "Mở rộng") : t("action.collapse", "Thu gọn")}>
              <Button
                type="text"
                aria-label={collapsed ? t("wcomp.adminExpandMenu", "Mở rộng menu") : t("wcomp.adminCollapseMenu", "Thu gọn menu")}
                icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                onClick={() => applyCollapsed(!collapsed)}
              />
            </Tooltip>
          )}

          {/* Tiêu đề co giãn + cắt "…" để trên màn hẹp nó nhường chỗ cho các nút bên phải. */}
          <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                fontWeight: 700,
                fontSize: isMobile ? 14.5 : 15,
                color: V.text,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {t("wcomp.adminTitle", "Larkwave · Quản trị")}
            </span>
            <span className="tw-admin-pill hidden sm:inline-flex">ADMIN</span>
          </div>

          {/* Đổi nền sáng/tối: mặt quản trị chạy ở host riêng (aapp.), localStorage tách theo
              origin nên lựa chọn ở app chính không mang sang đây — không có nút này thì admin
              kẹt mãi ở nền sáng. */}
          <Tooltip title={mode === "dark" ? t("comp.shell.switchLight", "Chuyển nền sáng") : t("comp.shell.switchDark", "Chuyển nền tối")}>
            <Button
              type="text"
              aria-label={t("comp.shell.toggleTheme", "Đổi nền sáng/tối")}
              icon={mode === "dark" ? <BulbFilled style={{ color: "#F5C542" }} /> : <BulbOutlined />}
              onClick={toggleTheme}
              style={{ flex: "0 0 auto" }}
            />
          </Tooltip>

          <Dropdown
            trigger={["click"]}
            placement="bottomRight"
            menu={{
              items: [
                {
                  key: "email",
                  disabled: true,
                  label: (
                    <span style={{ color: V.textFaint, fontSize: 12.5 }}>
                      {user?.email}
                    </span>
                  ),
                },
                { type: "divider" },
                {
                  key: "app",
                  icon: <AppstoreOutlined />,
                  label: t("wcomp.adminBackToApp", "Về App"),
                  onClick: () => router.push("/"),
                },
                {
                  key: "logout",
                  icon: <LogoutOutlined />,
                  danger: true,
                  label: t("action.logout", "Đăng xuất"),
                  onClick: () => {
                    logout();
                    router.replace("/login");
                  },
                },
              ],
            }}
          >
            <div
              className="tw-admin-user"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                cursor: "pointer",
                flex: "0 0 auto",
                padding: "4px 6px",
                borderRadius: 12,
              }}
            >
              <UserAvatar
                name={user?.name}
                avatarUrl={user?.avatarUrl}
                size={32}
              />
              <span
                className="hidden sm:inline"
                style={{ color: V.text, fontWeight: 600, fontSize: 13.5, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              >
                {user?.name || user?.email}
              </span>
              <span className="hidden sm:inline">
                <PlanBadge plan={user?.plan} />
              </span>
            </div>
          </Dropdown>
        </Header>

        {/* Lưới caro trôi chậm — chữ ký bề mặt của app (AppShell dùng cùng lớp này); dừng khi
            prefers-reduced-motion (rule sẵn trong theme.ts/globals.css). Nền đặt bằng token nên
            đổi theme là đổi theo. */}
        <Content className="tw-grid-bg tw-admin-content" style={{ backgroundColor: V.layer }}>
          {/* Popup của antd (Modal/Drawer/Dropdown/Tooltip) render ngoài `.tw-admin` qua portal nên
              không thừa hưởng tabular-nums; gắn `tw-admin-pop` cho chúng để số trong hộp thoại
              (xác nhận thanh toán, chi tiết build) cũng thẳng cột. */}
          <ConfigProvider
            modal={{ className: "tw-admin-pop" }}
            drawer={{ className: "tw-admin-pop" }}
            dropdown={{ className: "tw-admin-pop" }}
            popover={{ className: "tw-admin-pop" }}
            tooltip={{ className: "tw-admin-pop" }}
          >
            <div
              style={{
                maxWidth: 1440,
                margin: "0 auto",
                // Mép hẹp trên điện thoại để bảng có trọn chiều ngang; rộng rãi trên desktop.
                padding: isMobile ? "14px 12px 48px" : "26px 28px 64px",
              }}
            >
              {children}
            </div>
          </ConfigProvider>
        </Content>
      </Layout>

      {/* Nút báo lỗi nổi — cùng logic với app chính, để admin gửi lỗi (kèm ảnh/log) từ bất kỳ trang nào. */}
      <FeedbackButton />
      {/* Trợ lý AI (cùng model/prompt với app chính qua /assistant) để admin cũng có Trợ lý trên aapp. */}
      <ChatbotWidget />

      <Drawer
        placement="left"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={264}
        closable={false}
        styles={{ body: { padding: 0, background: V.surface }, header: { display: "none" } }}
      >
        <SidebarInner collapsed={false} selected={selected} onNavigate={() => setDrawerOpen(false)} />
      </Drawer>
    </Layout>
  );
}
