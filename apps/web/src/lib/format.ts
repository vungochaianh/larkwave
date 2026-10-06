import dayjs from "dayjs";
import "dayjs/locale/vi";
import relativeTime from "dayjs/plugin/relativeTime";
import type {
  AppStatus,
  BuildStatus,
  DeploymentStatus,
  StageStatus,
  Track,
  UserStatus,
  Role,
} from "@larkwave/shared";

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

export const appStatusColor: Record<AppStatus, TagColor> = {
  draft: "default",
  building: "processing",
  live: "success",
  failed: "error",
  archived: "warning",
  suspended: "error",
};

export const appStatusLabel: Record<AppStatus, string> = {
  draft: "Bản nháp",
  building: "Đang build",
  live: "Đang chạy",
  failed: "Thất bại",
  archived: "Lưu trữ",
  suspended: "Tạm ngưng",
};

export const buildStatusColor: Record<BuildStatus, TagColor> = {
  queued: "default",
  running: "processing",
  awaiting_approval: "purple",
  succeeded: "success",
  failed: "error",
  canceled: "warning",
};

export const buildStatusLabel: Record<BuildStatus, string> = {
  queued: "Trong hàng đợi",
  running: "Đang chạy",
  awaiting_approval: "Chờ duyệt thiết kế",
  succeeded: "Thành công",
  failed: "Thất bại",
  canceled: "Đã huỷ",
};

export const deploymentStatusColor: Record<DeploymentStatus, TagColor> = {
  live: "success",
  superseded: "default",
  failed: "error",
};

export const deploymentStatusLabel: Record<DeploymentStatus, string> = {
  live: "Đang chạy",
  superseded: "Đã thay thế",
  failed: "Thất bại",
};

export const stageStatusColor: Record<StageStatus, string> = {
  pending: "#C7CCD9",
  running: "#6C5CE7",
  done: "#16B98D",
  error: "#EF4444",
  skipped: "#9AA3B5",
};

export const trackColor: Record<Track, TagColor> = {
  web: "gold",
  mobile: "geekblue",
  extension: "purple",
  desktop: "cyan",
  game: "magenta",
};

export const trackLabel: Record<Track, string> = {
  web: "Web",
  mobile: "Mobile",
  extension: "Extension",
  desktop: "Desktop",
  game: "Game",
};

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
