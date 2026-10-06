"use client";

import {
  ApiOutlined,
  AppstoreAddOutlined,
  AppstoreOutlined,
  BugOutlined,
  BulbOutlined,
  BulbFilled,
  CloudServerOutlined,
  DesktopOutlined,
  ExperimentOutlined,
  FacebookFilled,
  HomeOutlined,
  DashboardOutlined,
  KeyOutlined,
  IdcardOutlined,
  LoginOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MessageOutlined,
  MenuOutlined,
  MenuUnfoldOutlined,
  MoreOutlined,
  PlusOutlined,
  PushpinFilled,
  RobotOutlined,
  SafetyOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  TrophyOutlined,
} from "@ant-design/icons";
import { Badge, Button, Drawer, Dropdown, Grid, Layout, Menu, Tooltip } from "antd";
import { V, BRAND_GRADIENT, useThemeMode, useI18n, type Locale } from "@larkwave/ui";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTabTitle } from "@/lib/useTabTitle";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { App as AppEntity } from "@larkwave/shared";
import { chuDau } from "@/lib/chuDau";
import { api } from "@/lib/api";
import RunningBuildsButton from "@/components/RunningBuildsButton";
import SidebarQuotas from "@/components/SidebarQuotas";
import PlanModal from "@/components/PlanModal";
import { onAppsChanged } from "@/lib/appEvents";
import { useAuth } from "@/lib/auth";
import { FANPAGE_URL } from "@/lib/billing";
import { AdminBadge, PlanBadge, UserAvatar } from "@/components/UserAvatar";
import FeedbackButton from "@/components/FeedbackButton";
import ChatbotWidget from "@/components/ChatbotWidget";
import NotificationBell from "@/components/NotificationBell";
import MessengerWidget from "@/components/MessengerWidget";
import ImpersonationBanner from "@/components/ImpersonationBanner";
import { SurfaceScope } from "@/components/surface";

const { Sider, Header, Content } = Layout;
const { useBreakpoint } = Grid;

/** Larkwave brand violet — used as the solid active-nav background in dark mode. */
const BRAND = "#6C5CE7";

interface NavChild {
  key: string;
  label: string;
  /** Mục con trong nhóm vẫn giữ biểu tượng — nhóm "Làm app" có 5 mục, chỉ chữ thì khó quét. */
  icon?: ReactNode;
}
interface NavItem {
  key: string;
  label: string;
  icon: ReactNode;
  /** When present, this item is a submenu (children navigate; the parent expands). */
  children?: NavChild[];
}

const NAV: NavItem[] = [
  // "Tổng quan" đứng ĐẦU: đây là chỗ nhìn bao quát cả tài khoản, nên nó mở màn thanh bên chứ
  // không nấp sau nhóm làm việc.
  { key: "/overview", label: "Tổng quan", icon: <DashboardOutlined /> },
  // Mọi thứ thuộc việc LÀM WEBSITE gom về một nhóm: tạo, website của mình, khám phá app người
  // khác, mẫu để bắt đầu, và tích hợp để nối dịch vụ. Trước đó năm mục này nằm rải rác giữa
  // Marketing, Claude, Điều khiển từ xa… nên phải quét cả thanh bên mới thấy đủ. App desktop đã
  // gom kiểu này từ trước (nhóm `grp-app`) — đây là bù cho web cho khớp.
  {
    key: "grp-app",
    label: "Làm website",
    icon: <ThunderboltOutlined />,
    children: [
      { key: "/create-website", label: "Tạo website", icon: <ThunderboltOutlined /> },
      { key: "/apps", label: "Website của tôi", icon: <AppstoreOutlined /> },
      // KHÔNG còn mục "Khám phá app" ở đây: khối duyệt app cộng đồng nay nằm ngay dưới trang
      // "Tạo website", đúng chỗ người ta đang tìm ý tưởng. Một mục riêng trong thanh bên dẫn tới
      // cùng nội dung chỉ làm thanh bên dài thêm mà không thêm đường đi nào mới.
      // Trang /explore VẪN CÒN và vẫn công khai — nó là trang người ngoài vào xem và là nguồn
      // liên kết từ ngoài, xoá đi là mất cả hai.
      { key: "/templates", label: "Mẫu", icon: <AppstoreAddOutlined /> },
      { key: "/integrations", label: "Integrations", icon: <ApiOutlined /> },
    ],
  },
  // Khu "Agents Chat" gom các tính năng AI (Trò chuyện / Dự án / Artifacts / Tác vụ định kỳ).
  { key: "/agents-chat", label: "Agents Chat", icon: <RobotOutlined /> },
  // KHÔNG còn nhóm "Marketing" (02/10/2026): bộ Make Video / Picture / Blog đã chuyển sang Social
  // Wave. Thanh bên của web có BẢN RIÊNG, không dùng chung với `packages/ui` — nên lần gỡ trước chỉ
  // sạch bên desktop, còn ba mục này vẫn đứng đây dẫn tới trang đã xoá.
  { key: "/skills", label: "Skills", icon: <ExperimentOutlined /> },
  {
    key: "remote",
    label: "Điều khiển từ xa",
    icon: <DesktopOutlined />,
    children: [
      { key: "/remote/agent", label: "Máy của tôi" },
      { key: "/remote/chat", label: "Trò chuyện" },
      { key: "/remote/lark-chat", label: "Lark × Agents" },
      { key: "/remote/lark", label: "Lark (đồng bộ CMS)" },
    ],
  },
  { key: "/community", label: "Cộng đồng", icon: <MessageOutlined /> },
  { key: "/friends", label: "Bạn bè", icon: <TeamOutlined /> },
  { key: "/leaderboard", label: "Xếp hạng", icon: <TrophyOutlined /> },
  { key: "/api", label: "API", icon: <KeyOutlined /> },
  // KHÔNG còn mục "Gói & Thanh toán" ở đây (24/09/2026). Gói hiện tại đã hiện ngay trên trang Hồ
  // sơ, và /pricing nay là trang giới thiệu công khai chứ không phải màn hình trong app — để nó
  // trong thanh bên là dẫn người dùng ra khỏi bảng điều khiển mà không báo trước.
  // Cùng lý do với "Khám phá app" đã bỏ ở trên: một mục thanh bên dẫn tới trang công khai chỉ làm
  // thanh bên dài thêm. Trang /pricing VẪN CÒN và vẫn công khai.
  { key: "/storage", label: "Dung lượng", icon: <CloudServerOutlined /> },
  { key: "/reports", label: "Báo lỗi của tôi", icon: <BugOutlined /> },
  { key: "/profile", label: "Hồ sơ", icon: <IdcardOutlined /> },
];

/** NAV item key → i18n message key (for translating labels at render; falls back to the raw label). */
const NAV_I18N: Record<string, string> = {
  "grp-app": "nav.buildApps",
  "/create-website": "nav.createApp",
  "/overview": "nav.overview",
  "/agents-chat": "nav.agentsChat",
  "/skills": "nav.skills",
  "/storage": "nav.storage",
  "/apps": "nav.apps",
  remote: "nav.remote",
  "/remote/agent": "nav.remote.myMachine",
  "/remote/chat": "nav.remote.chat",
  "/remote/lark-chat": "nav.remote.lark",
  "/remote/lark": "nav.remote.larkCms",
  "/community": "nav.community",
  "/explore": "nav.explore",
  "/friends": "nav.friends",
  "/leaderboard": "nav.leaderboard",
  "/templates": "nav.templates",
  "/integrations": "nav.integrations",
  "/api": "nav.api",
  "/pricing": "nav.pricing",
  "/reports": "nav.reports",
  "/profile": "nav.profile",
};

/**
 * Nhóm nào đang mở, đọc từ chỗ đã lưu. Chạy được lúc kết xuất phía máy chủ (trả mặc định) lẫn
 * trên trình duyệt.
 */
function readOpenKeys(selected: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem("tw_nav_open");
    if (raw !== null) {
      const saved: unknown = JSON.parse(raw);
      if (Array.isArray(saved)) return saved.filter((k): k is string => typeof k === "string");
    }
  } catch {
    /* rơi về mặc định bên dưới */
  }
  // Chưa lưu gì: mở sẵn nhóm chứa mục đang chọn.
  const parent = NAV.find((n) => n.children?.some((c) => c.key === selected))?.key;
  return parent ? [parent] : [];
}

function selectedKey(pathname: string): string {
  // "/" nay là TRANG CHỦ, không còn là trang tạo website — nên nó KHÔNG được làm sáng mục "Tạo
  // website" nữa. Người dùng chê đúng chỗ này: nhìn menu thì tưởng trang gốc là trang tạo app.
  if (pathname.startsWith("/create-website")) return "/create-website";
  if (pathname.startsWith("/overview")) return "/overview";
  if (pathname.startsWith("/assistant")) return "/assistant";
  if (pathname.startsWith("/remote/lark-chat")) return "/remote/lark-chat";
  if (pathname.startsWith("/remote/lark")) return "/remote/lark";
  if (pathname.startsWith("/remote/chat")) return "/remote/chat";
  if (pathname.startsWith("/remote")) return "/remote/agent";
  if (pathname.startsWith("/agent")) return "/remote/agent";
  if (pathname.startsWith("/apps")) return "/apps";
  if (pathname.startsWith("/community")) return "/community";
  if (pathname.startsWith("/explore")) return "/explore";
  if (pathname.startsWith("/friends")) return "/friends";
  if (pathname.startsWith("/leaderboard")) return "/leaderboard";
  if (pathname.startsWith("/templates")) return "/templates";
  if (pathname.startsWith("/integrations")) return "/integrations";
  if (pathname.startsWith("/api")) return "/api";
  if (pathname.startsWith("/pricing")) return "/pricing";
  // /billing now redirects to the merged /pricing page — highlight the same item.
  if (pathname.startsWith("/billing")) return "/pricing";
  if (pathname.startsWith("/profile")) return "/profile";
  return "";
}

/** Returns the i18n message key for the current section's title (translated at the call site). */
function sectionTitleKey(pathname: string): string {
  return NAV_I18N[selectedKey(pathname)] || "";
}

/**
 * Liên kết sang mặt quản trị từ site công khai.
 *
 * Sau khi hai hệ hoán đổi tên miền (22/09/2026): site công khai ở `toolswave.net`, mặt quản trị ở
 * `cms.toolswave.net`. Bản cũ dựng `aapp.` từ tiền tố `app.` — nay `app.` lẫn `aapp.` đều thuộc
 * hệ thống KHÁC, nên quy tắc đó vừa không còn khớp vừa có thể ném người quản trị sang nhầm site.
 */
function adminUrl(): string {
  if (typeof window === "undefined") return "/admin";
  const { protocol, host } = window.location;
  // Đang ở chính mặt quản trị, hoặc chạy máy phát triển: dùng đường dẫn nội bộ.
  const may = host.startsWith("localhost") || host.startsWith("127.") || host.startsWith("[");
  if (host.startsWith("cms.") || may) return "/admin";
  const goc = host.startsWith("www.") ? host.slice(4) : host;
  return `${protocol}//cms.${goc}`;
}

function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <span
      className="tw-logo-mark"
      style={{
        display: "inline-flex",
        minWidth: size,
        width: size,
        height: size,
        borderRadius: size * 0.32,
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.5,
        boxShadow: "0 6px 16px rgba(108,92,231,0.30)",
      }}
    >
      <ThunderboltOutlined />
    </span>
  );
}

function Brand({ collapsed }: { collapsed: boolean }) {
  return (
    <Link
      href="/"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 11,
        height: 60,
        padding: collapsed ? "0" : "0 18px",
        justifyContent: collapsed ? "center" : "flex-start",
        borderBottom: `1px solid ${V.borderSub}`,
      }}
    >
      <LogoMark />
      {!collapsed && (
        <span
          style={{
            fontWeight: 800,
            letterSpacing: 1,
            fontSize: 16,
            color: V.text,
          }}
        >
          TOOLSWAVE
        </span>
      )}
    </Link>
  );
}

function UserBlock({ collapsed }: { collapsed: boolean }) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const { t } = useI18n();

  // Logged-out (e.g. an anonymous visitor on a public route like /pricing): show a
  // sign-in CTA where the user chrome would be, instead of an empty avatar/menu.
  if (!user) {
    const loginBtn = (
      <Link
        href="/login"
        className="tw-userblock"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: collapsed ? "8px 0" : "8px 10px",
          borderRadius: 12,
          color: V.text,
          fontSize: 13.5,
          fontWeight: 600,
          justifyContent: collapsed ? "center" : "flex-start",
        }}
      >
        <LoginOutlined style={{ fontSize: 17, color: BRAND }} />
        {!collapsed && <span>{t("nav.login", "Đăng nhập")}</span>}
      </Link>
    );
    return (
      <div style={{ padding: collapsed ? 8 : 12, borderTop: `1px solid ${V.borderSub}` }}>
        {collapsed ? (
          <Tooltip title={t("nav.login", "Đăng nhập")} placement="right">
            {loginBtn}
          </Tooltip>
        ) : (
          loginBtn
        )}
      </div>
    );
  }

  const menu = {
    items: [
      {
        key: "email",
        disabled: true,
        label: (
          <span style={{ color: V.textFaint, fontSize: 12.5 }}>{user?.email}</span>
        ),
      },
      { type: "divider" as const },
      ...(user?.role === "admin"
        ? [
            {
              key: "admin",
              icon: <SafetyOutlined />,
              label: t("comp.shell.admin", "Quản trị"),
              onClick: () => {
                window.open(adminUrl(), "_blank", "noopener");
              },
            },
          ]
        : []),
      {
        key: "logout",
        icon: <LogoutOutlined />,
        danger: true,
        label: t("comp.shell.logout", "Đăng xuất"),
        onClick: () => {
          logout();
          router.replace("/login");
        },
      },
    ],
  };

  return (
    <div style={{ padding: collapsed ? 8 : 12, borderTop: `1px solid ${V.borderSub}` }}>
      <Dropdown menu={menu} placement="topLeft" trigger={["click"]}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: collapsed ? "8px 0" : "8px 10px",
            borderRadius: 12,
            cursor: "pointer",
            justifyContent: collapsed ? "center" : "flex-start",
            transition: "background .15s ease",
          }}
          className="tw-userblock"
        >
          <UserAvatar
            name={user?.name}
            avatarUrl={user?.avatarUrl}
            size={34}
          />
          {!collapsed && (
            <div style={{ minWidth: 0, lineHeight: 1.25, flex: 1 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  minWidth: 0,
                }}
              >
                <span
                  style={{
                    fontWeight: 600,
                    fontSize: 13.5,
                    color: V.text,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {user?.name || t("comp.shell.userFallback", "Người dùng")}
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  marginTop: 3,
                }}
              >
                {user?.role === "admin" && <AdminBadge />}
                <PlanBadge plan={user?.plan} />
              </div>
            </div>
          )}
        </div>
      </Dropdown>
    </div>
  );
}

/** Facebook fanpage contact link shown in the sidebar footer. */
function ContactLink({ collapsed }: { collapsed: boolean }) {
  const { t } = useI18n();
  const inner = (
    <a
      href={FANPAGE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="tw-userblock"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: collapsed ? "8px 0" : "8px 10px",
        borderRadius: 12,
        color: V.textSub,
        fontSize: 13.5,
        fontWeight: 500,
        justifyContent: collapsed ? "center" : "flex-start",
      }}
    >
      <FacebookFilled style={{ color: "#1877F2", fontSize: 17 }} />
      {!collapsed && <span>{t("comp.shell.contact", "Liên hệ")}</span>}
    </a>
  );
  return (
    <div style={{ padding: collapsed ? 8 : 12, paddingBottom: 0 }}>
      {collapsed ? <Tooltip title={t("comp.shell.contactFanpage", "Liên hệ fanpage")} placement="right">{inner}</Tooltip> : inner}
    </div>
  );
}

/**
 * Pinned apps quick-access list in the sidebar. Fetches the user's pinned apps
 * and re-fetches on navigation (so a pin/unpin elsewhere reflects). Hidden when
 * collapsed or empty; any fetch failure is swallowed so it never breaks nav.
 */
function PinnedApps({
  collapsed,
  pathname,
  onNavigate,
}: {
  collapsed: boolean;
  pathname: string;
  onNavigate?: () => void;
}) {
  const { t } = useI18n();
  const [apps, setApps] = useState<AppEntity[]>([]);

  const load = useCallback(() => {
    api
      .listApps({ pinned: true, pageSize: 8 })
      .then((res) => setApps(res.items))
      // On a transient failure (e.g. API restarting during a deploy) keep the
      // last-known-good list so the "Đã ghim" group stays visible. The group
      // only hides when a SUCCESSFUL response actually returns [] (real-empty).
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load, pathname]);

  // Refresh the moment an app is pinned/unpinned/deleted anywhere (no F5 needed).
  useEffect(() => onAppsChanged(load), [load]);

  const unpin = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    setApps((a) => a.filter((x) => x.id !== id));
    await api.setAppPinned(id, false).catch(() => load());
  };

  if (collapsed || apps.length === 0) return null;

  return (
    <div style={{ padding: "8px 12px 0" }}>
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 800,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          color: V.textFaint,
          padding: "0 6px 6px",
        }}
      >
        {t("comp.shell.pinned", "Đã ghim")}
      </div>
      {apps.map((a) => (
        <Link
          key={a.id}
          href={`/apps/${a.id}`}
          onClick={onNavigate}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 8px",
            borderRadius: 8,
            color: V.textSub,
          }}
          className="tw-pinned-row"
        >
          <span
            style={{
              width: 20,
              height: 20,
              minWidth: 20,
              borderRadius: 6,
              background: "rgba(108,92,231,0.12)",
              color: "#6C5CE7",
              fontSize: 11,
              fontWeight: 700,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {chuDau(a.name) || "A"}
          </span>
          <span
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: 13,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {a.name}
          </span>
          <Tooltip title={t("comp.shell.unpin", "Bỏ ghim")}>
            <PushpinFilled
              onClick={(e) => void unpin(e, a.id)}
              style={{ color: V.textFaint, fontSize: 12 }}
            />
          </Tooltip>
        </Link>
      ))}
    </div>
  );
}

/**
 * Recently-updated apps in the sidebar (excludes pinned — those have their own
 * group above). Quick access to what you were just working on; refreshes on
 * navigation + whenever apps change. Hidden when collapsed or empty.
 */
function RecentApps({
  collapsed,
  pathname,
  onNavigate,
}: {
  collapsed: boolean;
  pathname: string;
  onNavigate?: () => void;
}) {
  const { t } = useI18n();
  const [apps, setApps] = useState<AppEntity[]>([]);

  const load = useCallback(() => {
    api
      .listApps({ pageSize: 12 })
      .then((res) => setApps(res.items.filter((a) => !a.pinned).slice(0, 6)))
      // On a transient failure (e.g. API restarting during a deploy) keep the
      // last-known-good list so the "Gần đây" group stays visible. The group
      // only hides when a SUCCESSFUL response actually returns [] (real-empty).
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load, pathname]);
  useEffect(() => onAppsChanged(load), [load]);

  if (collapsed || apps.length === 0) return null;

  return (
    <div style={{ padding: "10px 12px 0" }}>
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 800,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          color: V.textFaint,
          padding: "0 6px 6px",
        }}
      >
        {t("comp.shell.recent", "Gần đây")}
      </div>
      {apps.map((a) => {
        const base = `/apps/${a.id}`;
        const active = pathname === base || pathname.startsWith(`${base}/`);
        return (
          <Link
            key={a.id}
            href={`/apps/${a.id}`}
            onClick={onNavigate}
            className="tw-pinned-row"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 8px",
              borderRadius: 8,
              color: active ? "#5B4FC2" : V.textSub,
              background: active ? "rgba(108,92,231,0.10)" : "transparent",
            }}
          >
            <span
              style={{
                width: 20,
                height: 20,
                minWidth: 20,
                borderRadius: 6,
                background: "rgba(108,92,231,0.12)",
                color: "#6C5CE7",
                fontSize: 11,
                fontWeight: 700,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {chuDau(a.name) || "A"}
            </span>
            <span
              style={{
                flex: 1,
                minWidth: 0,
                fontSize: 13,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {a.name}
            </span>
            {a.status === "live" && (
              <Tooltip title={t("comp.shell.running", "Đang chạy")}>
                <span
                  style={{
                    width: 7,
                    height: 7,
                    minWidth: 7,
                    borderRadius: "50%",
                    background: "#16B98D",
                  }}
                />
              </Tooltip>
            )}
          </Link>
        );
      })}
    </div>
  );
}

function SidebarInner({
  collapsed,
  selected,
  pathname,
  onNavigate,
}: {
  collapsed: boolean;
  selected: string;
  pathname: string;
  onNavigate?: () => void;
}) {
  const { t } = useI18n();
  // Submenu open state — CONTROLLED + forced empty when the rail is collapsed, so the collapsed
  // Sider never renders a stuck submenu popover (the old `defaultOpenKeys` did exactly that on the
  // auto-collapsed chat pages). Hovering the collapsed icon still opens its popup normally.
  // Đọc NGAY trong bộ khởi tạo, không đợi effect.
  //
  // Vì sao quan trọng: `/explore` nằm NGOÀI nhóm route `(builder)` và tự dựng AppShell của riêng
  // nó, nên bấm Explore ↔ Templates là AppShell GẮN LẠI. Nếu trạng thái bắt đầu sai rồi mới sửa
  // trong effect thì mỗi lần gắn lại React vẽ khung sai trước — thanh bên cụp xuống rồi bung ra.
  // Máy nhanh chỉ nháy một khung hình nên đo không thấy; máy chậm thì thấy rõ.
  const [openKeys, setOpenKeys] = useState<string[]>(() => readOpenKeys(selected));

  const applyOpenKeys = useCallback((keys: string[]) => {
    setOpenKeys(keys);
    try {
      localStorage.setItem("tw_nav_open", JSON.stringify(keys));
    } catch {
      /* ignore */
    }
  }, []);

  // Lần đầu tiên (chưa lưu gì) thì ghi lại giá trị mặc định vừa tính, để những lần gắn sau chỉ
  // đọc từ chỗ đã lưu chứ không tính lại theo trang đang đứng — đó chính là lỗi "bấm sang mục
  // ngoài nhóm là nhóm cụp" trước đây.
  useEffect(() => {
    try {
      if (localStorage.getItem("tw_nav_open") === null && openKeys.length) {
        localStorage.setItem("tw_nav_open", JSON.stringify(openKeys));
      }
    } catch {
      /* ignore */
    }
  }, [openKeys]);

  // Unread DM badge on the "Bạn bè" nav item — refreshed on navigation + every 25s.
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    let alive = true;
    const fetchUnread = () =>
      api
        .unreadMessages()
        .then((r) => alive && setUnread(r.count))
        .catch(() => undefined);
    fetchUnread();
    const t = setInterval(fetchUnread, 25000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [pathname]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        // Trong suốt: nền kính (blur + quầng tím) nằm ở Sider/Drawer bên ngoài; một lớp nền đặc
        // ở đây sẽ che mất nó.
        background: "transparent",
      }}
    >
      <Brand collapsed={collapsed} />
      <div style={{ flex: 1, overflowY: "auto", paddingTop: 10 }}>
        {/* Token của Menu (kể cả sửa lỗi tương phản AA ở chế độ tối: chữ trắng trên nền tím đặc
            thay cho tím-trên-tím-nhạt ~2.2:1) giờ nằm trong SurfaceScope → surfaceTheme.ts, cùng
            chỗ với Card/Table/Button, để một chỗ quyết định cả bộ. */}
        <Menu
          mode="inline"
          selectedKeys={selected ? [selected] : []}
          openKeys={collapsed ? [] : openKeys}
          onOpenChange={(keys) => applyOpenKeys(keys as string[])}
          style={{ borderInlineEnd: "none", background: "transparent" }}
          items={NAV.map((n) =>
            n.children
              ? {
                  key: n.key,
                  icon: n.icon,
                  label: t(NAV_I18N[n.key], n.label),
                  children: n.children.map((c) => ({
                    key: c.key,
                    icon: c.icon,
                    label: (
                      <Link href={c.key} onClick={onNavigate}>
                        {t(NAV_I18N[c.key], c.label)}
                      </Link>
                    ),
                  })),
                }
              : {
                  key: n.key,
                  icon: n.icon,
                  label: (
                    <Link href={n.key} onClick={onNavigate}>
                      {n.key === "/friends" && unread > 0 ? (
                        <Badge count={unread} size="small" offset={[10, 0]}>
                          <span style={{ paddingRight: 2 }}>{t(NAV_I18N[n.key], n.label)}</span>
                        </Badge>
                      ) : (
                        t(NAV_I18N[n.key], n.label)
                      )}
                    </Link>
                  ),
                },
          )}
        />
        <PinnedApps collapsed={collapsed} pathname={pathname} onNavigate={onNavigate} />
        <RecentApps collapsed={collapsed} pathname={pathname} onNavigate={onNavigate} />
      </div>
      {/* Hạn mức AI + dung lượng: hai con số cùng trả lời "tôi còn bao nhiêu?" nên đứng cạnh nhau. */}
      <SidebarQuotas collapsed={collapsed} />
      <ContactLink collapsed={collapsed} />
      <UserBlock collapsed={collapsed} />
    </div>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const screens = useBreakpoint();
  const isMobile = !screens.lg;
  const { mode: themeMode, toggle: toggleTheme } = useThemeMode();
  const { t, locale, setLocale } = useI18n();

  // Nav rail DEFAULTS to collapsed (focused view) — the user opens it if they want, and that choice
  // persists across visits.
  const [collapsed, setCollapsed] = useState(() => {
    // Cùng lý do như `openKeys`: bắt đầu bằng `true` rồi để effect sửa lại nghĩa là mỗi lần gắn
    // lại thanh bên co xuống 72px rồi mới bung ra 248px — đây mới là cái nháy dễ thấy nhất.
    if (typeof window === "undefined") return true;
    try {
      const v = window.localStorage.getItem("tw_nav_collapsed");
      if (v !== null) return v === "1";
    } catch {
      /* ignore */
    }
    return true;
  });
  const applyCollapsed = useCallback((next: boolean) => {
    setCollapsed(next);
    try {
      localStorage.setItem("tw_nav_collapsed", next ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);
  // (Không còn effect khôi phục: giá trị đã được đọc ngay trong bộ khởi tạo ở trên. Sửa lại
  // trong effect chính là nguồn gốc của cái nháy.)
  const [drawerOpen, setDrawerOpen] = useState(false);

  const selected = selectedKey(pathname);
  const title = t(sectionTitleKey(pathname), "Larkwave");
  // Tiêu đề tab đi theo mục đang mở và theo ngôn ngữ — xem `lib/useTabTitle.ts`.
  useTabTitle(sectionTitleKey(pathname) ? title : undefined);

  // The app workspace (/apps/:id) is a full-bleed console — drop the centred
  // max-width cap and tighten the gutters so the sub-nav sits flush to the
  // sidebar and Preview/Code use the full remaining width.
  // Chat pages own their full layout (sidebar + chat fill the area) — no centered column.
  const chatBleed = /^\/(assistant|remote\/(chat|lark-chat))(\/|$)/.test(pathname);
  /** Không gian làm việc của một app: `/apps/<id>` và mọi đường con của nó. */
  const isAppWorkspace = /^\/apps\/[^/]+(\/|$)/.test(pathname);
  const fullBleed = isAppWorkspace || chatBleed;

  // Close the mobile drawer on navigation.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // Apply a captured referral once the user is in the app (authed). The backend
  // guards it (only a fresh, not-yet-referred account), so this is safe to retry.
  useEffect(() => {
    let ref: string | null = null;
    try {
      ref = localStorage.getItem("tw_ref");
    } catch {
      /* ignore */
    }
    if (!ref) return;
    void api
      .captureReferral(ref)
      .catch(() => undefined)
      .finally(() => {
        try {
          localStorage.removeItem("tw_ref");
        } catch {
          /* ignore */
        }
      });
  }, []);

  return (
    <SurfaceScope>
    {/* `tw-app` là móc của toàn bộ bộ bề mặt dùng chung (surface/surface.css): thẻ kính, bảng,
        nhãn, nút, tiêu đề, và bảng màu đen-tím ở chế độ tối. Nền Layout + Content để TRONG SUỐT
        để lộ lớp sáng tĩnh vẽ trên <body> (ba quầng màu mờ) — đây là "chiều sâu từ lớp": nền →
        kính thanh bên/đầu trang → thẻ → nội dung. */}
    <Layout className="tw-app" style={{ minHeight: "100vh", background: "transparent" }}>
      {!isMobile && (
        <Sider
          width={248}
          collapsedWidth={72}
          collapsible
          collapsed={collapsed}
          onCollapse={applyCollapsed}
          trigger={null}
          className="tw-app-sider"
          style={{
            position: "sticky",
            top: 0,
            height: "100vh",
            // Kính tối: nền bề mặt pha trong suốt + blur, để quầng màu của nền lộ qua rất nhẹ.
            // Viền phải là vệt sáng dọc (surface.css ::after) nên ở đây chỉ còn kẻ mảnh.
            background: "var(--tw-srf-chrome)",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            borderRight: "1px solid var(--tw-srf-line)",
          }}
        >
          <SidebarInner collapsed={collapsed} selected={selected} pathname={pathname} />
        </Sider>
      )}

      <Layout style={{ background: "transparent" }}>
        <ImpersonationBanner />
        <Header
          className="tw-app-header"
          style={{
            position: "sticky",
            top: 0,
            zIndex: 20,
            display: "flex",
            alignItems: "center",
            gap: isMobile ? 4 : 14,
            padding: isMobile ? "0 8px" : "0 20px",
            height: 60,
            // Cùng chất kính với thanh bên (surface.css --tw-srf-chrome: bề mặt pha trong suốt,
            // đúng màu ở cả sáng lẫn tối). Viền dưới thật là vệt sáng ngang do ::after vẽ.
            background: "var(--tw-srf-chrome)",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            borderBottom: "1px solid var(--tw-srf-line)",
          }}
        >
          {isMobile ? (
            <Button
              type="text"
              icon={<MenuOutlined />}
              onClick={() => setDrawerOpen(true)}
              style={{ flex: "0 0 auto" }}
            />
          ) : (
            <Tooltip title={collapsed ? t("comp.shell.expand", "Mở rộng") : t("comp.shell.collapse", "Thu gọn")}>
              <Button
                type="text"
                icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                onClick={() => applyCollapsed(!collapsed)}
              />
            </Tooltip>
          )}

          {/* Title flexes + truncates so a long section name never pushes the actions off-screen. */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <span
              style={{
                fontWeight: 700,
                fontSize: isMobile ? 15 : 16,
                color: V.text,
                display: "block",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {title}
            </span>
          </div>

          {isMobile ? (
            // Mobile: fold the low-frequency toggles (language + theme) into a "more" menu so the
            // header stays uncluttered; keep only the bell + create action visible.
            <Dropdown
              trigger={["click"]}
              placement="bottomRight"
              menu={{
                items: [
                  {
                    key: "lang",
                    icon: <span style={{ fontWeight: 700, fontSize: 12 }}>{locale === "en" ? "EN" : "VI"}</span>,
                    label: locale === "en" ? "Tiếng Việt" : "English",
                    onClick: () => setLocale((locale === "en" ? "vi" : "en") as Locale),
                  },
                  {
                    key: "theme",
                    icon: themeMode === "dark" ? <BulbFilled style={{ color: "#F5C542" }} /> : <BulbOutlined />,
                    label: themeMode === "dark" ? t("comp.shell.lightMode", "Nền sáng") : t("comp.shell.darkMode", "Nền tối"),
                    onClick: toggleTheme,
                  },
                ],
              }}
            >
              <Button type="text" icon={<MoreOutlined />} aria-label={t("comp.shell.more", "Thêm")} style={{ flex: "0 0 auto" }} />
            </Dropdown>
          ) : (
            <>
              <Tooltip title={locale === "en" ? "Chuyển sang Tiếng Việt" : "Switch to English"}>
                <Button
                  type="text"
                  aria-label={t("lang.label")}
                  onClick={() => setLocale((locale === "en" ? "vi" : "en") as Locale)}
                  style={{ fontWeight: 700, fontSize: 12.5, minWidth: 40 }}
                >
                  {locale === "en" ? "EN" : "VI"}
                </Button>
              </Tooltip>

              <Tooltip title={themeMode === "dark" ? t("comp.shell.switchLight", "Chuyển nền sáng") : t("comp.shell.switchDark", "Chuyển nền tối")}>
                <Button
                  type="text"
                  aria-label={t("comp.shell.toggleTheme", "Đổi nền sáng/tối")}
                  icon={themeMode === "dark" ? <BulbFilled style={{ color: "#F5C542" }} /> : <BulbOutlined />}
                  onClick={toggleTheme}
                />
              </Tooltip>
            </>
          )}

          <RunningBuildsButton />
          <NotificationBell />

          {/* On the chat pages the floating "Báo lỗi" FAB would cover the composer's Send button,
              so it lives here in the header instead (next to Tạo app). Hidden on mobile to save room. */}
          {/* Báo lỗi lên HEADER ở các màn hình có khung trò chuyện riêng: để nổi thì nó đè lên
              nút Gửi và trông như một nút chat nữa. */}
          {(chatBleed || isAppWorkspace) && !isMobile && <FeedbackButton variant="header" />}

          {/* Chat cộng đồng sống trên HEADER chứ không phải FAB góc phải dưới: trên /apps/:id góc đó
              đã có nút báo lỗi + nút chat sửa app, ba bong bóng chồng lên nhau. Ở đây nó cũng mount trên
              MỌI trang — trước kia nằm trong nhóm FAB nên /remote/agent mất luôn openMessenger(). */}
          <MessengerWidget variant="header" />

          <Link href="/create-website" style={{ flex: "0 0 auto" }}>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              aria-label={t("comp.shell.createApp", "Tạo website")}
              title={t("comp.shell.createApp", "Tạo website")}
              // Vivid gradient pill — matches the desktop header's primary CTA.
              style={{ background: BRAND_GRADIENT, border: "none", boxShadow: "0 6px 16px rgba(108,92,231,0.35)", fontWeight: 600 }}
            >
              <span className="hidden sm:inline">{t("comp.shell.createApp", "Tạo website")}</span>
            </Button>
          </Link>
        </Header>

        {/* Không còn nền đặc: lưới caro (tw-grid-bg::before) vẽ thẳng lên lớp sáng của <body>. */}
        <Content className="tw-grid-bg tw-app-content">
          <div
            style={
              chatBleed
                ? {
                    // The chat page fills the whole area edge-to-edge (its own sidebar + composer).
                    maxWidth: "none",
                    margin: 0,
                    padding: 0,
                  }
                : fullBleed
                ? {
                    maxWidth: "none",
                    margin: 0,
                    padding: "18px 20px 56px",
                  }
                : {
                    // Wide, near-full-width content area so dashboards/grids use
                    // the screen instead of floating in a narrow centred column.
                    // Capped only so ultra-wide monitors don't stretch lines to
                    // an unreadable length. Pages that are pure reading lists or
                    // single forms cap their own inner column on top of this.
                    maxWidth: 1600,
                    margin: "0 auto",
                    // Tight gutters on phones so pages get the full width (was a flat 32px, which
                    // left only ~296px usable at 360px); roomy on desktop.
                    padding: isMobile ? "16px 12px 48px" : "26px 32px 64px",
                  }
            }
          >
            {children}
          </div>
        </Content>
      </Layout>

      {/* Floating helpers on every page: bug report + draggable AI assistant.
          On an app-detail page (/apps/:id) the in-page chat panel IS the assistant
          (context-aware: iterate + help), so hide the global one to avoid two FABs.
          On /remote/agent AND the remote-chat pages the page has its own bottom composer + Send
          button, so hide ALL the floating FABs there (they covered Send); Báo lỗi moves to the header. */}
      {!/^\/remote\/agent/.test(pathname ?? "") && !chatBleed && (
        <>
          {/* Không gian làm việc của một app (`/apps/<id>` VÀ mọi đường con) đã có khung trò
              chuyện riêng — thêm nút nổi ở đây là ba nút chat chồng nhau trên cùng màn hình.

              Luật này TRƯỚC ĐÂY dùng `$` ở cuối trong khi `fullBleed` ngay trên thì không, tức là
              hai luật cho cùng một trang khác nhau đúng một ký tự. Hệ quả: ở đường con bất kỳ dưới
              /apps/<id>, trang vẫn toàn màn nhưng ChatbotWidget lại hiện — đúng nút chat thứ ba
              người dùng gặp. Nay cả hai dùng chung một biến, không thể lệch nữa. */}
          {!isAppWorkspace && <FeedbackButton />}
          {!isAppWorkspace && <ChatbotWidget />}
        </>
      )}

      <Drawer
        placement="left"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={264}
        closable={false}
        styles={{ body: { padding: 0 }, header: { display: "none" } }}
      >
        <SidebarInner
          collapsed={false}
          selected={selected}
          pathname={pathname}
          onNavigate={() => setDrawerOpen(false)}
        />
      </Drawer>

      {/* Bảng "Gói & mức dùng": gắn MỘT lần ở đây, mở được từ bất kỳ đâu qua `moBangGoi()` — kể
          cả từ khối catch của một lần bấm (xem lib/planModal.ts). Nó tự nghe, nên không cần prop nào. */}
      <PlanModal />
    </Layout>
    </SurfaceScope>
  );
}
