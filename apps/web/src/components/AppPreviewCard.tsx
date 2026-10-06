"use client";

import {
  ApartmentOutlined,
  ChromeOutlined,
  DeleteOutlined,
  DesktopOutlined,
  GlobalOutlined,
  LinkOutlined,
  MobileOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import { App, Button, Empty, List, Modal, Popconfirm, Segmented, Skeleton, Tag, Tooltip, Typography } from "antd";
import { useRouter } from "next/navigation";
import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import type { App as AppEntity, AppMemberRole, Friend, SuiteMemberInfo, Track } from "@larkwave/shared";
import { ActionTooltip, useI18n } from "@larkwave/ui";
import { api } from "@/lib/api";
import { emitAppsChanged } from "@/lib/appEvents";
import { formatDate } from "@/lib/format";
import { CARD_SHADOW } from "@/lib/theme";
import { LiveThumb } from "@/lib/thumbnail";
import { AppStatusTag, TrackTag } from "./StatusTags";
import { UserAvatar } from "./UserAvatar";

/** Pick friends to share an app with (adds them as editor/viewer collaborators). */
function ShareModal({
  app,
  open,
  onClose,
}: {
  app: AppEntity;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const { message } = App.useApp();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState<AppMemberRole>("editor");
  const [busy, setBusy] = useState<string | null>(null);
  const [shared, setShared] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    api
      .friends()
      .then(setFriends)
      .catch(() => setFriends([]))
      .finally(() => setLoading(false));
  }, [open]);

  const share = async (f: Friend) => {
    setBusy(f.id);
    try {
      await api.addAppMember(app.id, f.email, role);
      setShared((s) => new Set(s).add(f.id));
      message.success(`${t("wcomp.appSharedWith", "Đã chia sẻ với")} ${f.name || f.email}.`);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={`${t("wcomp.appShareTitlePre", "Chia sẻ")} "${app.name}" ${t("wcomp.appShareTitlePost", "với bạn bè")}`}
      footer={null}
    >
      <div style={{ marginBottom: 12 }}>
        <Segmented
          value={role}
          onChange={(v) => setRole(v as AppMemberRole)}
          options={[
            { label: t("wcomp.appRoleEditor", "Chỉnh sửa"), value: "editor" },
            { label: t("wcomp.appRoleViewer", "Chỉ xem"), value: "viewer" },
          ]}
        />
      </div>
      {loading ? (
        <Skeleton active paragraph={{ rows: 3 }} />
      ) : friends.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={t("wcomp.appNoFriends", "Chưa có bạn bè. Hãy kết bạn ở trang Bạn bè trước.")}
        />
      ) : (
        <List
          dataSource={friends}
          renderItem={(f) => (
            <List.Item
              actions={[
                shared.has(f.id) ? (
                  <Tag key="ok" color="success">
                    {t("wcomp.appShared", "Đã chia sẻ")}
                  </Tag>
                ) : (
                  <Button
                    key="share"
                    size="small"
                    type="primary"
                    loading={busy === f.id}
                    onClick={() => void share(f)}
                  >
                    {t("wcomp.appShare", "Chia sẻ")}
                  </Button>
                ),
              ]}
            >
              <List.Item.Meta
                avatar={<UserAvatar name={f.name} avatarUrl={f.avatarUrl} size={36} />}
                title={f.name || f.email}
                description={f.email}
              />
            </List.Item>
          )}
        />
      )}
    </Modal>
  );
}

const { Text, Title } = Typography;

const TRACK_ICON: Record<Track, ReactNode> = {
  web: <GlobalOutlined />,
  mobile: <MobileOutlined />,
  extension: <ChromeOutlined />,
  desktop: <DesktopOutlined />,
  game: <PlayCircleOutlined />,
};

/** Two-stop gradient deterministically derived from the id — every app gets a
 * stable, distinct cover even when there's no real website screenshot. */
function coverGradient(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `linear-gradient(135deg, hsl(${hue} 72% 60%) 0%, hsl(${(hue + 38) % 360} 68% 48%) 100%)`;
}

function hostOf(url?: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

/** Nhãn ngắn cho vai trò của site trong "bộ site" (xem apps/api/src/builds/suite.ts). */
/**
 * Nhãn và chú giải cho từng MẶT của bộ site.
 *
 * Đi qua t() chứ không in thẳng: hai bảng này hiện trên MỌI thẻ website, nên để cứng tiếng Việt là
 * người dùng chọn tiếng Anh nhìn thấy chúng ở khắp danh sách app. Chuỗi tiếng Việt ở đây giữ nguyên
 * làm chuỗi dự phòng — đúng quy ước t("khoá", "chuỗi Việt") của cả kho.
 */
const SURFACE_TAG: Record<string, string> = {
  site: "Website",
  cms: "Quản trị",
  portal: "Cổng KH",
  api: "API",
};
const SURFACE_TAG_KEY: Record<string, string> = {
  site: "wcomp.surfaceSite",
  cms: "wcomp.surfaceCms",
  portal: "wcomp.surfacePortal",
  api: "wcomp.surfaceApi",
};
const SURFACE_TIP: Record<string, string> = {
  site: "Mặt tiền công khai của hệ thống — khách xem không cần đăng nhập.",
  cms: "Backoffice: khu quản trị nội bộ, phải đăng nhập mới vào được.",
  portal: "Cổng khách hàng: khách đăng nhập xem dữ liệu của chính họ.",
  api: "Site API — nơi duy nhất giữ cơ sở dữ liệu của cả bộ.",
};
const SURFACE_TIP_KEY: Record<string, string> = {
  site: "wcomp.surfaceSiteTip",
  cms: "wcomp.surfaceCmsTip",
  portal: "wcomp.surfacePortalTip",
  api: "wcomp.surfaceApiTip",
};

/** Thứ tự đọc của các mặt trong một bộ site. */
const SURFACE_SORT = ["site", "cms", "portal", "api"] as const;

/**
 * Các site bên trong một bộ, hiện ngay trên thẻ.
 *
 * Vì sao không chỉ ghi "4 site" rồi bắt bấm vào mới biết: mỗi site là một ĐỊA CHỈ THẬT đang chạy,
 * và việc hay làm nhất với chúng là mở ra xem. Chôn sau một cú bấm nữa thì thẻ workspace lại
 * thành thứ cản đường so với bốn thẻ rời trước đây.
 */
function SuiteParts({ members }: { members: SuiteMemberInfo[] }) {
  const { t } = useI18n();
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
      {members.map((m) => {
        const live = m.status === "live" && !!m.currentUrl;
        return (
          <Tooltip
            key={m.id}
            title={
              live
                ? `${t(SURFACE_TIP_KEY[m.surface], SURFACE_TIP[m.surface])} — ${t("wcomp.surfaceOpen", "mở")} ${m.currentUrl!.replace(/^https?:\/\//, "")}`
                : `${t(SURFACE_TIP_KEY[m.surface], SURFACE_TIP[m.surface])} — ${t("wcomp.surfaceNotLive", "chưa chạy được")} (${m.status})`
            }
          >
            <a
              href={live ? m.currentUrl! : undefined}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "3px 9px",
                borderRadius: 999,
                fontSize: 11.5,
                fontWeight: 600,
                border: "1px solid var(--tw-border, #ecedf3)",
                background: "var(--tw-surface, #fff)",
                color: live ? "var(--tw-text, #1e2230)" : "var(--tw-text-sub, #6b7280)",
                cursor: live ? "pointer" : "default",
                opacity: live ? 1 : 0.65,
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: live ? "#22C55E" : "#D1D5DB",
                }}
              />
              {t(SURFACE_TAG_KEY[m.surface], SURFACE_TAG[m.surface])}
            </a>
          </Tooltip>
        );
      })}
    </div>
  );
}

export default function AppPreviewCard({
  app,
  onDeleted,
}: {
  app: AppEntity;
  onDeleted?: (id: string) => void;
}) {
  const { t } = useI18n();
  const { message } = App.useApp();
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [redeploying, setRedeploying] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  // Các site trong bộ. Sắp theo vai chứ không theo thời gian tạo: người ta đọc "mặt tiền → quản
  // trị → cổng khách → API", còn thứ tự tạo là chuyện nội bộ của máy chủ.
  const suite = [...(app.suiteMembers ?? [])].sort(
    (a, b) => SURFACE_SORT.indexOf(a.surface) - SURFACE_SORT.indexOf(b.surface),
  );

  const open = () => router.push(`/apps/${app.id}`);
  const stop = (e: MouseEvent) => e.stopPropagation();

  const host = hostOf(app.currentUrl);

  const redeploy = async () => {
    setRedeploying(true);
    try {
      const builds = await api.listBuilds({ appId: app.id, pageSize: 1 });
      const latest = builds.items[0];
      if (!latest) {
        message.info(t("wcomp.appNoBuildToRedeploy", "Chưa có build nào để triển khai lại."));
        return;
      }
      const res = await api.redeployBuild(latest.id);
      message.success(t("wcomp.appRedeploying", "Đang triển khai lại mã nguồn hiện tại…"));
      router.push(`/apps/${app.id}?build=${res.buildId}`);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setRedeploying(false);
    }
  };

  const del = async () => {
    setDeleting(true);
    try {
      await api.deleteApp(app.id);
      message.success(t("wcomp.appDeleted", "Đã xoá app."));
      emitAppsChanged();
      onDeleted?.(app.id);
    } catch (e) {
      message.error((e as Error).message);
      setDeleting(false);
    }
  };

  return (
    <div
      className="tw-lift"
      onClick={open}
      style={{
        cursor: "pointer",
        borderRadius: 16,
        overflow: "hidden",
        // Chất kính dùng chung (components/surface): trước đây cứng `#fff` + `#ECEDF3` nên ở chế
        // độ tối là một thẻ TRẮNG trên nền đen. Viền đọc `--tw-srf-edge` để sáng lên khi hover
        // (.tw-lift:hover đổi biến; inline thắng class nên phải đi đường biến).
        background: "var(--tw-srf-glass, #fff)",
        border: "1px solid var(--tw-srf-edge, #ECEDF3)",
        boxShadow: CARD_SHADOW,
        display: "flex",
        flexDirection: "column",
        height: "100%",
      }}
    >
      {/* Cover: gradient + browser chrome, with an optional live thumbnail on top */}
      <div
        style={{
          position: "relative",
          aspectRatio: "16 / 10",
          background: coverGradient(app.id),
          overflow: "hidden",
        }}
      >
        {/* Centered system glyph + initial (the SVG-ish fallback) */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            color: "rgba(255,255,255,0.92)",
          }}
        >
          <span style={{ fontSize: 40, opacity: 0.95 }}>
            {TRACK_ICON[app.track] ?? <GlobalOutlined />}
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.3, opacity: 0.9 }}>
            {(app.name || app.slug || "?").slice(0, 22)}
          </span>
        </div>

        {/* Live screenshot of the deployed web app (covers the gradient/glyph when
            it loads; falls back to them on error). Only for deployed web apps. */}
        {app.track === "web" && app.currentUrl ? (
          <LiveThumb url={app.currentUrl} alt={app.name} />
        ) : null}

        {/* Faux browser chrome bar */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 26,
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "0 10px",
            background: "rgba(255,255,255,0.78)",
            backdropFilter: "blur(4px)",
            borderBottom: "1px solid rgba(0,0,0,0.05)",
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: 999, background: "#FF5F57" }} />
          <span style={{ width: 8, height: 8, borderRadius: 999, background: "#FEBC2E" }} />
          <span style={{ width: 8, height: 8, borderRadius: 999, background: "#28C840" }} />
          <span
            style={{
              marginLeft: 6,
              flex: 1,
              minWidth: 0,
              fontSize: 10.5,
              color: "#6B7280",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {host ?? app.slug}
          </span>
        </div>

        {/* Status / track chips on the cover */}
        <div style={{ position: "absolute", left: 10, bottom: 10, display: "flex", gap: 6 }}>
          <AppStatusTag status={app.status} />
          <TrackTag track={app.track} />
          {/* App BẢN SAO: hiện luôn độ giống trang gốc.
              Con số này vốn đã được đo và lưu ở mỗi lần dựng, nhưng chỉ ai mở log build mới thấy —
              tức gần như không ai thấy. Đưa lên thẻ để biết ngay bản sao có đạt hay không.
              Màu theo ngưỡng: dưới 70 là mức hệ thống tự chạy lượt sửa, nên đáng báo đỏ. */}
          {app.sourceUrl && typeof app.cloneScore === "number" && (
            <Tooltip
              title={`Độ giống trang gốc ${app.sourceUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}: ${app.cloneScore}%`}
            >
              <Tag
                bordered={false}
                color={app.cloneScore >= 85 ? "success" : app.cloneScore >= 70 ? "warning" : "error"}
              >
                ≈ {app.cloneScore}%
              </Tag>
            </Tooltip>
          )}
          {/* Bộ site: một thẻ cho cả hệ thống. Nhãn nói NGAY đây là mấy site, vì "Website của
              tôi" mà có một thẻ chứa bốn địa chỉ là chuyện cần báo trước, không phải để người
              dùng bấm vào rồi mới phát hiện. */}
          {suite.length > 1 ? (
            <Tooltip title={`Bộ ${suite.length} site chạy cùng nhau, dùng chung dữ liệu qua site API.`}>
              <Tag bordered={false} color="purple">
                <ApartmentOutlined /> {suite.length} site
              </Tag>
            </Tooltip>
          ) : (
            app.surface && (
              <Tooltip title={t(SURFACE_TIP_KEY[app.surface], SURFACE_TIP[app.surface])}>
                <Tag bordered={false} color="purple">
                  {t(SURFACE_TAG_KEY[app.surface], SURFACE_TAG[app.surface])}
                </Tag>
              </Tooltip>
            )
          )}
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: "13px 15px 6px", flex: 1 }}>
        <Title level={5} style={{ margin: 0 }} ellipsis={{ rows: 1 }}>
          {app.name}
        </Title>
        <Text type="secondary" style={{ fontSize: 12.5, lineHeight: 1.5 }} ellipsis>
          {app.description || t("wcomp.appNoDescription", "Không có mô tả.")}
        </Text>
        {suite.length > 1 && <SuiteParts members={suite} />}
      </div>

      {/* Footer: timestamp + quick actions */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "9px 12px",
          borderTop: "1px solid #F1F2F7",
        }}
      >
        <Text type="secondary" style={{ fontSize: 11.5 }}>
          {formatDate(app.updatedAt)}
        </Text>
        <div style={{ display: "flex", gap: 2 }} onClick={stop}>
          {app.currentUrl && (
            <ActionTooltip title={t("wcomp.appOpenLink", "Mở liên kết")}>
              <Button
                type="text"
                size="small"
                icon={<LinkOutlined />}
                href={app.currentUrl}
                target="_blank"
              />
            </ActionTooltip>
          )}
          <ActionTooltip title={t("wcomp.appShareWithFriends", "Chia sẻ với bạn bè")}>
            <Button
              type="text"
              size="small"
              icon={<TeamOutlined />}
              onClick={() => setShareOpen(true)}
            />
          </ActionTooltip>
          {app.track === "web" && (
            <Popconfirm
              title={t("wcomp.appRedeploy", "Triển khai lại")}
              description={t("wcomp.appRedeployConfirm", "Deploy lại mã nguồn hiện tại? (không tốn credit)")}
              okText={t("wcomp.appRedeployOk", "Triển khai")}
              cancelText={t("wcomp.appCancel", "Huỷ")}
              onConfirm={redeploy}
            >
              <ActionTooltip title={t("wcomp.appRedeploy", "Triển khai lại")}>
                <Button type="text" size="small" icon={<ReloadOutlined />} loading={redeploying} />
              </ActionTooltip>
            </Popconfirm>
          )}
          <Popconfirm
            title={t("wcomp.appDelete", "Xoá app")}
            description={t("wcomp.appDeleteConfirm", "Xoá vĩnh viễn app này? Không thể hoàn tác.")}
            okText={t("wcomp.appDeleteOk", "Xoá")}
            okButtonProps={{ danger: true }}
            cancelText={t("wcomp.appCancel", "Huỷ")}
            onConfirm={del}
          >
            <ActionTooltip title={t("wcomp.appDeleteShort", "Xoá")}>
              <Button type="text" size="small" danger icon={<DeleteOutlined />} loading={deleting} />
            </ActionTooltip>
          </Popconfirm>
        </div>
      </div>
      {shareOpen && <ShareModal app={app} open={shareOpen} onClose={() => setShareOpen(false)} />}
    </div>
  );
}
