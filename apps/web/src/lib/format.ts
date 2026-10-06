import dayjs from "dayjs";
import "dayjs/locale/vi";
import relativeTime from "dayjs/plugin/relativeTime";
import type { UserStatus, Role } from "@larkwave/shared";

dayjs.locale("vi");
dayjs.extend(relativeTime);

export function formatDate(value?: string | number | null): string {
  if (!value) return "—";
  return dayjs(value).format("DD/MM/YYYY HH:mm");
}

export function fromNow(value?: string | number | null): string {
  if (!value) return "—";
  return dayjs(value).fromNow();
}

type TagColor = string;

export const userStatusColor: Record<UserStatus, TagColor> = {
  active: "success",
  suspended: "error",
};

export const userStatusLabel: Record<UserStatus, string> = {
  active: "Hoạt động",
  suspended: "Tạm khoá",
};

export const roleColor: Record<Role, TagColor> = {
  admin: "gold",
  user: "default",
};

export const roleLabel: Record<Role, string> = {
  admin: "Quản trị",
  user: "Người dùng",
};
