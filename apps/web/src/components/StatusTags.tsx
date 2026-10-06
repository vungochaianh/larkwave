"use client";

import { Tag } from "antd";
import { useI18n } from "@larkwave/ui";
import type { Role, UserStatus } from "@larkwave/shared";
import { roleColor, roleLabel, userStatusColor, userStatusLabel } from "@/lib/format";

const USER_KEY: Record<UserStatus, string> = {
  active: "status.user.active",
  suspended: "status.user.suspended",
};
const ROLE_KEY: Record<Role, string> = {
  admin: "status.role.admin",
  user: "status.role.user",
};

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
