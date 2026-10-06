"use client";

import { EyeOutlined, LogoutOutlined } from "@ant-design/icons";
import { Button } from "antd";
import { useI18n } from "@larkwave/ui";
import { useAuth } from "@/lib/auth";

/** Decode the `imp` (impersonating-admin id) claim from a JWT payload, if present. */
function impersonatorOf(token: string | null): string | null {
  if (!token) return null;
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(json) as { imp?: unknown };
    return typeof payload.imp === "string" ? payload.imp : null;
  } catch {
    return null;
  }
}

/**
 * Shown on the builder when the current session is an ADMIN IMPERSONATION (the
 * JWT carries an `imp` claim). Makes it unmistakable that actions run on the
 * target user's account + offers a one-click exit (logout of the impersonation
 * session — the admin's own session lives on the aapp host, untouched).
 */
export default function ImpersonationBanner() {
  const { t } = useI18n();
  const { user, token, logout } = useAuth();
  if (!impersonatorOf(token)) return null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
        padding: "7px 16px",
        background: "#FFF4D6",
        borderBottom: "1px solid #F2D98B",
        color: "#7A5A00",
        fontSize: 13,
      }}
    >
      <EyeOutlined />
      <span>
        {t("wcomp.impViewingAs", "Bạn đang xem với tư cách")}{" "}
        <b>{user?.name || user?.email || t("wcomp.impUser", "người dùng")}</b>{" "}
        {t(
          "wcomp.impNotice",
          "(chế độ admin). Mọi thao tác sẽ thực hiện trên tài khoản này.",
        )}
      </span>
      <div style={{ flex: 1 }} />
      <Button size="small" icon={<LogoutOutlined />} onClick={() => logout()}>
        {t("wcomp.impExit", "Thoát")}
      </Button>
    </div>
  );
}
