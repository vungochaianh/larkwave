"use client";

import { Tag } from "antd";
import { useI18n } from "@larkwave/ui";
import type {
  AppStatus,
  BuildStatus,
  DeploymentStatus,
  Role,
  Track,
  UserStatus,
} from "@larkwave/shared";
import {
  appStatusColor,
  appStatusLabel,
  buildStatusColor,
  buildStatusLabel,
  deploymentStatusColor,
  deploymentStatusLabel,
  roleColor,
  roleLabel,
  trackColor,
  trackLabel,
  userStatusColor,
  userStatusLabel,
} from "@/lib/format";

/**
 * Nhãn trạng thái đi qua i18n.
 *
 * Mấy bảng `*Label` trong `lib/format.ts` là hằng số tiếng Việt CỨNG, nên trong giao diện tiếng
 * Anh chúng lọt ra nguyên văn ("Đang chạy", "Thất bại"…). Vì mọi thẻ trạng thái đều đi qua đúng
 * file này nên dịch ở đây là bịt được cả loạt; các bảng cũ vẫn giữ nguyên vai trò làm CHỮ DỰ
 * PHÒNG cho `t()`.
 */
const APP_KEY: Record<AppStatus, string> = {
  draft: "status.app.draft",
  building: "status.app.building",
  live: "status.app.live",
  failed: "status.app.failed",
  archived: "status.app.archived",
  suspended: "status.app.suspended",
};
const BUILD_KEY: Record<BuildStatus, string> = {
  queued: "status.build.queued",
  running: "status.build.running",
  awaiting_approval: "status.build.awaitingApproval",
  succeeded: "status.build.succeeded",
  failed: "status.build.failed",
  canceled: "status.build.canceled",
};
const DEPLOY_KEY: Record<DeploymentStatus, string> = {
  live: "status.deploy.live",
  superseded: "status.deploy.superseded",
  failed: "status.deploy.failed",
};
const USER_KEY: Record<UserStatus, string> = {
  active: "status.user.active",
  suspended: "status.user.suspended",
};
const ROLE_KEY: Record<Role, string> = {
  admin: "status.role.admin",
  user: "status.role.user",
};

export function AppStatusTag({ status }: { status: AppStatus }) {
  const { t } = useI18n();
  return (
    <Tag color={appStatusColor[status]} bordered={false}>
      {t(APP_KEY[status], appStatusLabel[status])}
    </Tag>
  );
}

export function BuildStatusTag({ status }: { status: BuildStatus }) {
  const { t } = useI18n();
  return (
    <Tag color={buildStatusColor[status]} bordered={false}>
      {t(BUILD_KEY[status], buildStatusLabel[status])}
    </Tag>
  );
}

export function DeploymentStatusTag({ status }: { status: DeploymentStatus }) {
  const { t } = useI18n();
  return (
    <Tag color={deploymentStatusColor[status]} bordered={false}>
      {t(DEPLOY_KEY[status], deploymentStatusLabel[status])}
    </Tag>
  );
}

export function TrackTag({ track }: { track: Track | null | undefined }) {
  if (!track) return <Tag bordered={false}>auto</Tag>;
  return (
    <Tag color={trackColor[track]} bordered={false}>
      {trackLabel[track]}
    </Tag>
  );
}

export function UserStatusTag({ status }: { status: UserStatus }) {
  const { t } = useI18n();
  return (
    <Tag color={userStatusColor[status]} bordered={false}>
      {t(USER_KEY[status], userStatusLabel[status])}
    </Tag>
  );
}

export function RoleTag({ role }: { role: Role }) {
  const { t } = useI18n();
  return (
    <Tag color={roleColor[role]} bordered={false}>
      {t(ROLE_KEY[role], roleLabel[role])}
    </Tag>
  );
}
