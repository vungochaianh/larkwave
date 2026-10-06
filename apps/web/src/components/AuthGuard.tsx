"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useI18n } from "@larkwave/ui";
import { useAuth } from "@/lib/auth";
import Splash from "./Splash";

/**
 * Routes that are viewable while LOGGED OUT. These live under the (builder)
 * layout (so they get the app chrome) but must NOT bounce anonymous visitors to
 * /login — e.g. the public pricing page (also whitelisted in proxy PUBLIC_PATHS).
 * A public route renders its children with a null user; the page itself hides
 * any personalized bits and shows a sign-up CTA instead.
 */
const PUBLIC_ROUTES = ["/pricing"];

function isPublicRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return PUBLIC_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`));
}

/**
 * Full-page branded splash. Kept under the `FullPageSpinner` name for backward
 * compatibility with existing imports; renders the premium <Splash/> instead of
 * a bare antd Spin.
 */
export function FullPageSpinner({ tip }: { tip?: string }) {
  return <Splash tagline={tip} />;
}

/**
 * Client-side guard. The proxy already gates on the cookie; this guard waits
 * for the user object and optionally enforces a required role.
 */
export default function AuthGuard({
  children,
  requireAdmin = false,
}: {
  children: ReactNode;
  requireAdmin?: boolean;
}) {
  const { t } = useI18n();
  const { user, token, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const publicRoute = isPublicRoute(pathname);

  useEffect(() => {
    // Public routes (e.g. /pricing) are viewable logged-out — never redirect them.
    if (publicRoute) return;
    // Only bounce to /login when there is genuinely NO session. During a deploy
    // api.me() fails transiently and refresh() deliberately KEEPS the token
    // without setting user — bouncing then would log out a valid customer for
    // the whole ~30–60s restart. A present token means "session still valid,
    // user just hasn't reloaded yet", so we wait (Splash) and let auth.tsx's
    // backoff self-heal instead of redirecting.
    if (!loading && !user && !token) {
      // Preserve where the user was headed so login sends them back there (not home).
      // Runs client-side only, so window.location is safe.
      const here = window.location.pathname + window.location.search;
      const keep = here && here !== "/" && !here.startsWith("/login");
      router.replace(keep ? `/login?next=${encodeURIComponent(here)}` : "/login");
    }
  }, [loading, user, token, router, publicRoute]);

  if (loading) return <Splash tagline={t("wcomp.agBooting", "Đang khởi động không gian làm việc…")} />;
  // No user yet: on a public route render the children anyway (anonymous-viewable);
  // otherwise we're either redirecting (no token) or waiting for a transient
  // api.me() to recover (token present) — both render the branded Splash.
  if (!user) {
    if (publicRoute) return <>{children}</>;
    return <Splash tagline={t("wcomp.agRedirecting", "Đang chuyển hướng…")} />;
  }

  if (requireAdmin && user.role !== "admin") {
    return (
      <div
        style={{
          minHeight: "60vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}
      >
        <div style={{ fontSize: 48, fontWeight: 800, color: "#6C5CE7" }}>
          403
        </div>
        <div style={{ color: "#6B7280" }}>
          {t("wcomp.agNoAdminAccess", "Bạn không có quyền truy cập khu vực quản trị.")}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
