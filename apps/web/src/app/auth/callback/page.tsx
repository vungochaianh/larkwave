"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";
import Splash from "@/components/Splash";
import { useAuth } from "@/lib/auth";

function CallbackInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { loginWithToken } = useAuth();
  // Guard against double-invocation (React strict mode / re-renders).
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const token = params.get("token");
    // The OAuth start carries provider=<p> inside `next` for GitHub/GitLab, so the
    // error redirect reports the RIGHT provider instead of always "google".
    const nextParam = params.get("next");
    const provider =
      /[?&]provider=(github|gitlab)/.exec(decodeURIComponent(nextParam || ""))?.[1] || "google";
    if (!token) {
      router.replace("/login?error=" + provider);
      return;
    }

    // Where to land after auth. Only allow internal paths (no open-redirect /
    // protocol-relative "//host"). Google login has no `next` → home.
    const next =
      nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//")
        ? nextParam
        : "/";
    // Admin impersonation (?imp=1): keep this session in sessionStorage (tab-only)
    // so it never collides with the admin's own login / other tabs.
    const isImpersonation = params.get("imp") === "1";

    void (async () => {
      try {
        // Store the JWT (localStorage for a normal login, sessionStorage for an
        // impersonation tab) and verify it by fetching the current user.
        const u = await loginWithToken(token, { session: isImpersonation });
        // No explicit next → admins land on /admin, everyone else on the builder.
        //
        // KHÔNG trả về "/": từ khi "/" thành trang giới thiệu, đăng nhập Google/GitHub xong sẽ rơi
        // ngược ra trang bán hàng thay vì vào chỗ làm việc. Lỗi này không lộ ở đường đăng nhập bằng
        // mật khẩu vì đường đó đi qua login/page.tsx — sửa một chỗ là còn sót chỗ kia.
        router.replace(next !== "/" ? next : u.role === "admin" ? "/admin" : "/overview");
      } catch {
        router.replace("/login?error=" + provider);
      }
    })();
  }, [params, router, loginWithToken]);

  return <Splash tagline="Đang đăng nhập với Google..." />;
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<Splash tagline="Đang đăng nhập với Google..." />}>
      <CallbackInner />
    </Suspense>
  );
}
