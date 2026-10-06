"use client";

import {
  ArrowLeftOutlined,
  ClockCircleOutlined,
  CodeOutlined,
  DeleteOutlined,
  EditOutlined,
  ExperimentOutlined,
  FolderOutlined,
  MenuOutlined,
  MoreOutlined,
  PaperClipOutlined,
  PlusOutlined,
  PushpinFilled,
  PushpinOutlined,
} from "@ant-design/icons";
import { Button, Drawer, Dropdown, Grid, Input, Modal, Tooltip, type MenuProps } from "antd";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTabTitle, nhanTheoDuongDan } from "@/lib/useTabTitle";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { V, useI18n } from "@larkwave/ui";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { BRAND, AGENTS } from "@/lib/theme";
import { PlanBadge, UserAvatar } from "@/components/UserAvatar";
import { SurfaceScope } from "@/components/surface";
import {
  RAIL_COLLAPSED_W,
  RAIL_W,
  RailCollapseButton,
  RailControls,
  useRailCollapsed,
} from "@/components/WorkspaceChrome";

const { useBreakpoint } = Grid;

type ConvMeta = { id: string; title: string; sessionId?: string; updatedAt: number; projectId?: string; pinned?: boolean };
type ChatIndex = { conversations: ConvMeta[]; projects: { id: string; name: string }[] };

// AgentChat's conversation store keys (shared origin) — the rail keeps them consistent after a
// direct mutation so a mounted AgentChat can't resurrect/overwrite the change.
const IDX_KEY = (uid: string) => `tw_agentchat_index_${uid}`;
const BODY_KEY = (uid: string, id: string) => `tw_agentchat_body_${uid}_${id}`;

/**
 * Vỏ khu làm việc "Agents Chat". Một dải bên trái gom các tính năng AI — nút mở cuộc trò chuyện mới, thanh
 * điều hướng (Dự án / Artifacts / Tác vụ định kỳ / Skills), danh sách dự án, và danh sách hội thoại
 * gần đây (mỗi dòng có menu Ghim / Đổi tên / Chuyển / Xoá). Phần chính hiển thị tính năng đang mở.
 *
 * Bản trước của vỏ này đặt tên "Claude" và dựng lại giao diện claude.ai — ghi chú cũ nói thẳng mục
 * tiêu là "để người quen claude.ai thấy quen tay". Đó là tên và giao diện của sản phẩm hãng khác,
 * nên đã bỏ: đổi tên thành Agents Chat, chữ hiệu sans kèm dấu sóng riêng, bảng màu xanh dương.
 */
export default function AgentsChatShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useI18n();
  const screens = useBreakpoint();
  const isDesktop = !!screens.md;
  const uid = user?.id || "";
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { collapsed, toggle: toggleRail } = useRailCollapsed();
  const [index, setIndex] = useState<ChatIndex>({ conversations: [], projects: [] });
  const [showAll, setShowAll] = useState(false);
  const [activeChatId, setActiveChatId] = useState("");
  /** AgentChat tự khai báo khi đang có lượt chạy (sự kiện `tw-chat-busy`). */
  const [chatBusy, setChatBusy] = useState(false);
  /** Đã tải xong danh sách ít nhất một lần (dù rỗng) — để phân biệt "chưa có" với "chưa tải được". */
  const [indexLoaded, setIndexLoaded] = useState(false);
  const [indexError, setIndexError] = useState(false);
  const [renameTarget, setRenameTarget] = useState<{ id: string; val: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);

  const onChat = pathname === "/agents-chat";

  const navItems = [
    { key: "/agents-chat/projects", label: t("agentsChat.projects", "Dự án"), icon: <FolderOutlined /> },
    { key: "/agents-chat/artifacts", label: t("agentsChat.artifacts", "Artifacts"), icon: <CodeOutlined /> },
    { key: "/agents-chat/scheduled", label: t("agentsChat.scheduled", "Tác vụ định kỳ"), icon: <ClockCircleOutlined /> },
    { key: "/agents-chat/files", label: t("agentsChat.files", "Tệp đã tải lên"), icon: <PaperClipOutlined /> },
    { key: "/agents-chat/skills", label: t("nav.skills", "Skills"), icon: <ExperimentOutlined /> },
  ];
  // Tiêu đề tab theo mục đang mở — xem `lib/useTabTitle.ts`.
  useTabTitle(onChat ? t("nav.agentsChat", "Agents Chat") : nhanTheoDuongDan(pathname, navItems));

  /**
   * Tải danh sách hội thoại.
   *
   * Trước đây lỗi mạng bị nuốt, danh sách giữ nguyên giá trị khởi tạo là RỖNG, và thanh bên
   * hiện "Chưa có cuộc trò chuyện nào" — người dùng tưởng mất sạch lịch sử. Đây đúng lớp lỗi
   * "ẩn cho tới khi tải xong" đã sửa ở chỗ khác, còn sót lại đây.
   *
   * Nay: hỏng thì GIỮ những gì đang có, và nếu chưa từng tải được thì lấy tạm bản lưu trong máy
   * để vẫn còn thứ để mở, kèm một dòng nói rõ là lỗi mạng chứ không phải trống.
   */
  const refresh = useCallback(() => {
    apiFetch<ChatIndex>("/agent/chat/index")
      .then((r) => {
        setIndex({ conversations: r.conversations || [], projects: r.projects || [] });
        setIndexLoaded(true);
        setIndexError(false);
      })
      .catch(() => {
        setIndexError(true);
        setIndex((prev) => {
          if (prev.conversations.length) return prev;
          let local: ConvMeta[] = [];
          try {
            local = JSON.parse(localStorage.getItem(IDX_KEY(uid)) || "[]") as ConvMeta[];
          } catch {
            local = [];
          }
          return local.length ? { ...prev, conversations: local } : prev;
        });
      });
  }, [uid]);

  useEffect(() => {
    try {
      const c = new URLSearchParams(window.location.search).get("c");
      if (c) setActiveChatId(c);
    } catch {
      /* ignore */
    }
    refresh();
  }, [refresh]);

  useEffect(() => {
    const onFocus = () => refresh();
    const onSaved = (e: Event) => {
      const d = (e as CustomEvent<{ id: string; title: string }>).detail;
      if (!d?.id) return;
      setActiveChatId(d.id);
      setIndex((prev) => {
        const rest = prev.conversations.filter((c) => c.id !== d.id);
        return { ...prev, conversations: [{ id: d.id, title: d.title, updatedAt: Date.now() }, ...rest] };
      });
      window.setTimeout(refresh, 1600);
    };
    // A mutation happened inside AgentChat (header menu) — server push is debounced, so refetch late.
    const onRefresh = () => window.setTimeout(refresh, 1800);
    const onBusy = (e: Event) => setChatBusy(!!(e as CustomEvent<{ busy: boolean }>).detail?.busy);
    window.addEventListener("focus", onFocus);
    window.addEventListener("tw-chat-saved", onSaved as EventListener);
    window.addEventListener("tw-chat-refresh", onRefresh);
    window.addEventListener("tw-chat-busy", onBusy as EventListener);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("tw-chat-saved", onSaved as EventListener);
      window.removeEventListener("tw-chat-refresh", onRefresh);
      window.removeEventListener("tw-chat-busy", onBusy as EventListener);
    };
  }, [refresh]);

  // ── Direct conversation mutations (server + localStorage + notify a mounted AgentChat) ──
  const readLocal = (): ConvMeta[] => {
    try {
      return JSON.parse(localStorage.getItem(IDX_KEY(uid)) || "[]");
    } catch {
      return [];
    }
  };
  const writeLocal = (list: ConvMeta[]) => {
    try {
      localStorage.setItem(IDX_KEY(uid), JSON.stringify(list.slice(0, 80)));
    } catch {
      /* quota */
    }
  };
  const patchConv = (id: string, patch: Partial<ConvMeta>) => {
    setIndex((prev) => ({ ...prev, conversations: prev.conversations.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
    const local = readLocal();
    if (local.some((c) => c.id === id)) writeLocal(local.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    const conv = index.conversations.find((c) => c.id === id);
    if (conv) void apiFetch("/agent/chat/index", { method: "PUT", body: { conversations: [{ ...conv, ...patch }] } }).catch(() => undefined);
    try {
      window.dispatchEvent(new CustomEvent("tw-chat-command"));
    } catch {
      /* ignore */
    }
  };
  const removeConv = (id: string) => {
    setIndex((prev) => ({ ...prev, conversations: prev.conversations.filter((c) => c.id !== id) }));
    writeLocal(readLocal().filter((c) => c.id !== id));
    try {
      localStorage.removeItem(BODY_KEY(uid, id));
    } catch {
      /* ignore */
    }
    void apiFetch(`/agent/chat/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => undefined);
    try {
      window.dispatchEvent(new CustomEvent("tw-chat-command", { detail: { deletedId: id } }));
    } catch {
      /* ignore */
    }
    if (activeChatId === id) {
      setActiveChatId("");
      if (onChat) router.replace("/agents-chat");
    }
  };

  /**
   * Điều hướng — nhưng KHÔNG âm thầm giết một lượt trả lời đang chạy.
   *
   * Rời khỏi /agents-chat sẽ tháo AgentChat và cắt luồng đang chảy. Trước đây việc này xảy ra ngay khi
   * bấm, không hỏi gì: người dùng mất câu trả lời (và vẫn bị trừ hạn mức) mà không hiểu vì sao.
   */
  const go = (href: string) => {
    const leave = (): void => {
      router.push(href);
      setDrawerOpen(false);
    };
    if (chatBusy && onChat && !href.startsWith("/agents-chat?")) {
      Modal.confirm({
        title: t("agentsChat.leaveWhileBusyTitle", "Trợ lý đang trả lời"),
        content: t(
          "agentsChat.leaveWhileBusyBody",
          "Rời khỏi màn hình này sẽ huỷ lượt trả lời đang chạy. Bạn vẫn muốn đi tiếp?",
        ),
        okText: t("agentsChat.leaveAnyway", "Đi tiếp, huỷ lượt này"),
        okButtonProps: { danger: true },
        cancelText: t("common.stay", "Ở lại"),
        onOk: leave,
      });
      return;
    }
    leave();
  };
  const openChat = (id: string) => {
    setActiveChatId(id);
    go(`/agents-chat?c=${encodeURIComponent(id)}`);
  };
  /**
   * "Cuộc trò chuyện mới" mở màn /agents-chat/new chứ không nhảy thẳng vào ô trống.
   *
   * Ô trống không cho biết chỗ này làm được gì — người mới vào nhìn con trỏ nhấp nháy rồi thoát.
   * Màn mở đầu bày sẵn vài việc làm được, và vẫn có nút "Bắt đầu với một ô trống" cho người đã
   * biết mình cần gì, nên không ai bị chặn thêm một bước.
   */
  const newChat = () => {
    setActiveChatId("");
    go("/agents-chat/new");
  };

  const convs = useMemo(
    () =>
      [...index.conversations].sort((a, b) => {
        if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
        return (b.updatedAt || 0) - (a.updatedAt || 0);
      }),
    [index.conversations],
  );
  const shown = showAll ? convs : convs.slice(0, 15);

  const rowMenu = (c: ConvMeta): MenuProps => ({
    items: [
      { key: "pin", icon: <PushpinOutlined />, label: c.pinned ? t("chat.unpin", "Bỏ ghim") : t("chat.pinTop", "Ghim lên đầu") },
      { key: "rename", icon: <EditOutlined />, label: t("chat.rename", "Đổi tên") },
      ...(index.projects.length
        ? [
            {
              key: "move",
              icon: <FolderOutlined />,
              label: t("chat.moveToProject", "Chuyển vào project"),
              children: [
                ...index.projects.map((p) => ({ key: `mv:${p.id}`, label: p.name, disabled: c.projectId === p.id })),
                ...(c.projectId ? [{ type: "divider" as const }, { key: "mv:none", label: t("chat.removeFromProject", "Bỏ khỏi project") }] : []),
              ],
            },
          ]
        : []),
      { type: "divider" as const },
      { key: "del", icon: <DeleteOutlined />, label: t("chat.delete", "Xoá"), danger: true },
    ],
    onClick: ({ key, domEvent }) => {
      domEvent.stopPropagation();
      if (key === "pin") patchConv(c.id, { pinned: !c.pinned });
      else if (key === "rename") setRenameTarget({ id: c.id, val: c.title || "" });
      else if (key === "del") setDeleteTarget({ id: c.id, title: c.title || "" });
      else if (key === "mv:none") patchConv(c.id, { projectId: "" });
      else if (key.startsWith("mv:")) patchConv(c.id, { projectId: key.slice(3) });
    },
  });

  const rowBase: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 12,
    width: "100%",
    border: "none",
    background: "transparent",
    fontSize: 14.5,
    padding: "9px 12px",
    borderRadius: 10,
    cursor: "pointer",
    textAlign: "left",
    transition: "background .12s ease",
  };

  // `mini` là tham số chứ không đọc thẳng `collapsed`: ngăn kéo trên di động phải LUÔN hiện bản
  // mở rộng, thu gọn một tấm ngăn kéo vốn đã hẹp thì chẳng để làm gì.
  const railFor = (mini: boolean) => (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minWidth: 0, overflowX: "hidden", background: V.surface, borderRight: `1px solid ${V.border}` }}>
      <style>{`.tw-conv-row .tw-conv-more{opacity:0;transition:opacity .12s ease}.tw-conv-row:hover .tw-conv-more{opacity:1}@media (max-width:767px){.tw-conv-more{opacity:1 !important}}`}</style>
      {/*
        KHÔNG có chữ hiệu hay logo ở đây, và đó là chủ ý.

        Đây là khu làm việc bên trong sản phẩm, người dùng đã đăng nhập và đã biết mình đang ở đâu
        — một cái tên nữa đặt trên đầu dải bên chỉ chiếm chỗ của thứ họ thật sự cần nhìn, là danh
        sách chức năng và danh sách hội thoại. Tên sản phẩm đã có sẵn ở vỏ ngoài.

        Nên chỗ này chỉ còn nút thu gọn, và vì không còn gì để căn hai đầu nên nó dồn về phải.
      */}
      <div style={{ padding: mini ? "14px 8px 8px" : "16px 16px 10px", display: "flex", alignItems: "center", justifyContent: mini ? "center" : "flex-end", gap: 8 }}>
        {isDesktop && <RailCollapseButton collapsed={mini} onToggle={toggleRail} />}
      </div>

      <div style={{ padding: mini ? "0 6px 4px" : "0 8px 4px" }}>
        <Tooltip title={mini ? t("agentsChat.newChat", "Cuộc trò chuyện mới") : ""} placement="right">
          <button
            onClick={newChat}
            style={{ ...rowBase, color: V.text, fontWeight: 500, justifyContent: mini ? "center" : undefined, padding: mini ? "9px 0" : rowBase.padding }}
            onMouseEnter={(e) => (e.currentTarget.style.background = V.chipBg)}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <span style={{ fontSize: 17, display: "inline-flex", color: AGENTS }}><PlusOutlined /></span>
            {!mini && t("agentsChat.newChat", "Cuộc trò chuyện mới")}
          </button>
        </Tooltip>
      </div>

      <nav style={{ padding: mini ? "0 6px 6px" : "0 8px 6px", display: "flex", flexDirection: "column", gap: 2 }}>
        {navItems.map((it) => {
          const on = pathname === it.key || pathname.startsWith(it.key + "/");
          const btn = (
            <button
              key={it.key}
              onClick={() => go(it.key)}
              style={{ ...rowBase, background: on ? V.chipBg : "transparent", color: on ? V.chipText : V.textSub, fontWeight: on ? 600 : 500, justifyContent: mini ? "center" : undefined, padding: mini ? "9px 0" : rowBase.padding }}
              onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = V.chipBg; }}
              onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = "transparent"; }}
            >
              <span style={{ fontSize: 16, display: "inline-flex", color: on ? AGENTS : V.textFaint }}>{it.icon}</span>
              {!mini && it.label}
            </button>
          );
          return mini ? (
            <Tooltip key={it.key} title={it.label} placement="right">
              {btn}
            </Tooltip>
          ) : (
            btn
          );
        })}
      </nav>

      {/* Thu gọn thì ẩn hẳn phần này: tên dự án và tiêu đề hội thoại không rút xuống một biểu
          tượng mà còn nghĩa được. Cột biểu tượng ở trên vẫn đủ để đi tới nơi cần. */}
      {mini ? (
        <div style={{ flex: 1, minHeight: 0 }} />
      ) : (
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", padding: "6px 8px 8px" }}>
        <div style={{ padding: "6px 6px 4px", display: "flex", alignItems: "center" }}>
          <span style={{ flex: 1, fontSize: 11.5, fontWeight: 700, letterSpacing: 0.4, color: V.textFaint, textTransform: "uppercase" }}>{t("agentsChat.projects", "Dự án")}</span>
        </div>
        {index.projects.length === 0 ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 8px 8px", fontSize: 12.5, color: V.textFaint }}>
            <PushpinOutlined style={{ fontSize: 12 }} />
            {t("agentsChat.pinProjects", "Ghim dự án để xem ở đây")}
          </div>
        ) : (
          <div style={{ marginBottom: 6 }}>
            {index.projects.slice(0, 6).map((p) => (
              <button
                key={p.id}
                onClick={() => go("/agents-chat/projects")}
                style={{ ...rowBase, padding: "6px 10px", fontSize: 13.5, color: V.textSub }}
                onMouseEnter={(e) => (e.currentTarget.style.background = V.chipBg)}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <FolderOutlined style={{ fontSize: 13, color: V.textFaint }} />
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
              </button>
            ))}
          </div>
        )}

        <div style={{ padding: "10px 6px 4px" }}>
          <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 0.4, color: V.textFaint, textTransform: "uppercase" }}>{t("agentsChat.chatsAndTasks", "Trò chuyện & tác vụ")}</span>
        </div>
        {convs.length === 0 ? (
          <div style={{ padding: "4px 8px", fontSize: 12.5, color: V.textFaint }}>
            {indexError && !indexLoaded ? (
              <>
                {t("agentsChat.chatsLoadFailed", "Chưa tải được danh sách (lỗi mạng).")}{" "}
                <a
                  onClick={(e) => {
                    e.preventDefault();
                    refresh();
                  }}
                  style={{ color: BRAND }}
                >
                  {t("common.retry", "Thử lại")}
                </a>
              </>
            ) : (
              t("agentsChat.noChats", "Chưa có cuộc trò chuyện nào")
            )}
          </div>
        ) : (
          <>
            {shown.map((c) => {
              const on = onChat && activeChatId === c.id;
              return (
                <div
                  key={c.id}
                  className="tw-conv-row"
                  role="button"
                  tabIndex={0}
                  onClick={() => openChat(c.id)}
                  style={{ ...rowBase, padding: "7px 6px 7px 10px", fontSize: 13.5, gap: 6, background: on ? V.chipBg : "transparent", color: on ? V.chipText : V.textSub, fontWeight: on ? 600 : 400 }}
                  onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = V.chipBg; }}
                  onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = "transparent"; }}
                >
                  {c.pinned && <PushpinFilled style={{ fontSize: 11, color: V.textFaint, flexShrink: 0 }} />}
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title?.trim() || t("chat.conversation", "Cuộc trò chuyện")}</span>
                  <Dropdown trigger={["click"]} menu={rowMenu(c)} placement="bottomRight">
                    <span
                      className="tw-conv-more"
                      onClick={(e) => e.stopPropagation()}
                      style={{ flexShrink: 0, width: 30, height: 30, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 8, color: V.textFaint }}
                    >
                      <MoreOutlined />
                    </span>
                  </Dropdown>
                </div>
              );
            })}
            {convs.length > 15 && (
              <button
                onClick={() => setShowAll((s) => !s)}
                style={{ ...rowBase, padding: "7px 10px", fontSize: 13, color: V.textFaint }}
                onMouseEnter={(e) => (e.currentTarget.style.background = V.chipBg)}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                {showAll ? t("agentsChat.viewLess", "Thu gọn") : t("agentsChat.viewAll", "Xem tất cả hội thoại")}
              </button>
            )}
          </>
        )}
      </div>
      )}

      <div style={{ padding: mini ? 6 : 10, borderTop: `1px solid ${V.border}` }}>
        <RailControls collapsed={mini} />
        {mini ? (
          <>
            <Tooltip title={t("agentsChat.backToApp", "Về ứng dụng")} placement="right">
              <Link href="/" style={{ display: "flex", justifyContent: "center", padding: "9px 0", borderRadius: 10, color: V.textSub }}>
                <ArrowLeftOutlined />
              </Link>
            </Tooltip>
            {user && (
              <div style={{ display: "flex", justifyContent: "center", padding: "8px 0" }}>
                <UserAvatar name={user.name || user.email} avatarUrl={user.avatarUrl} size={28} />
              </div>
            )}
          </>
        ) : (
          <>
            <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 10, color: V.textSub, textDecoration: "none", fontSize: 13.5 }}>
              <ArrowLeftOutlined /> {t("agentsChat.backToApp", "Về ứng dụng")}
            </Link>
            {user && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px" }}>
                <UserAvatar name={user.name || user.email} avatarUrl={user.avatarUrl} size={28} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: V.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.name || user.email}</span>
                <PlanBadge plan={user.plan} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );

  return (
    // `tw-app` + SurfaceScope: cùng bộ bề mặt (thẻ kính, bảng, nhãn, bảng màu đen-tím khi tối) với
    // AppShell, để bấm từ /overview sang đây không thấy "hai sản phẩm". Xem components/surface.
    <SurfaceScope>
    <div className="tw-app" style={{ display: "flex", height: "100vh", overflow: "hidden", background: V.layer }}>
      {isDesktop ? (
        <aside style={{ width: collapsed ? RAIL_COLLAPSED_W : RAIL_W, flexShrink: 0, height: "100%", transition: "width .16s ease" }}>{railFor(collapsed)}</aside>
      ) : (
        <Drawer open={drawerOpen} placement="left" width={288} onClose={() => setDrawerOpen(false)} styles={{ body: { padding: 0 } }} closable={false}>
          {railFor(false)}
        </Drawer>
      )}

      <main className="tw-grid-bg" style={{ flex: 1, minWidth: 0, height: "100%", display: "flex", flexDirection: "column", overflow: "hidden", position: "relative", backgroundColor: V.layer }}>
        {!isDesktop && (
          <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: V.surface, borderBottom: `1px solid ${V.border}` }}>
            <Button type="text" icon={<MenuOutlined />} onClick={() => setDrawerOpen(true)} />
            <span style={{ fontWeight: 700, color: V.text }}>{onChat ? t("agentsChat.chat", "Trò chuyện") : navItems.find((i) => pathname.startsWith(i.key))?.label}</span>
          </div>
        )}
        {/* flex:1 + minHeight:0 so a fill child (chat) gets the exact remaining height, and scrollable
            pages (projects/artifacts/…) scroll here instead of the whole main. overflowX:hidden so wide
            chat content (tables/code scroll within their own wrappers) never x-scrolls the workspace. */}
        <div style={{ flex: 1, minWidth: 0, minHeight: 0, overflowY: "auto", overflowX: "hidden" }}>{children}</div>
      </main>

      <Modal
        open={!!renameTarget}
        title={t("chat.rename", "Đổi tên")}
        okText={t("chat.save", "Lưu")}
        cancelText={t("chat.cancel", "Huỷ")}
        okButtonProps={{ disabled: !renameTarget?.val.trim() }}
        onCancel={() => setRenameTarget(null)}
        onOk={() => {
          if (renameTarget) {
            const v = renameTarget.val.trim().slice(0, 60);
            if (v) patchConv(renameTarget.id, { title: v });
          }
          setRenameTarget(null);
        }}
        destroyOnClose
      >
        <Input
          autoFocus
          value={renameTarget?.val || ""}
          maxLength={60}
          onChange={(e) => setRenameTarget((r) => (r ? { ...r, val: e.target.value } : r))}
          onPressEnter={() => {
            if (renameTarget) {
              const v = renameTarget.val.trim().slice(0, 60);
              if (v) patchConv(renameTarget.id, { title: v });
            }
            setRenameTarget(null);
          }}
        />
      </Modal>

      <Modal
        open={!!deleteTarget}
        title={t("chat.deleteConvTitle", "Xoá cuộc trò chuyện này?")}
        okText={t("chat.delete", "Xoá")}
        cancelText={t("chat.cancel", "Huỷ")}
        okButtonProps={{ danger: true }}
        onCancel={() => setDeleteTarget(null)}
        onOk={() => {
          if (deleteTarget) removeConv(deleteTarget.id);
          setDeleteTarget(null);
        }}
      >
        <div style={{ color: V.textSub }}>{t("chat.deleteConvContent", "Cuộc trò chuyện này sẽ bị xoá và không thể khôi phục.")}</div>
      </Modal>
    </div>
    </SurfaceScope>
  );
}
