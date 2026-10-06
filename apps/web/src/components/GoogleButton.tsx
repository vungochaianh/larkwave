"use client";

import { Button } from "antd";
import { useState } from "react";
import { useI18n } from "@larkwave/ui";
import { API_ORIGIN } from "@/lib/api";

/** Google's multicolour "G" mark, inline so it needs no extra dependency. */
function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.583-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.892 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}

/**
 * Full-page navigation to the API's Google OAuth entrypoint. EventSource/fetch
 * cannot follow the 302 → accounts.google.com chain, so we hard-navigate.
 */
export default function GoogleButton({
  label,
}: {
  label?: string;
}) {
  const { t } = useI18n();
  const shownLabel = label ?? t("wcomp.googleLogin", "Đăng nhập với Google");
  const [loading, setLoading] = useState(false);
  const onClick = () => {
    setLoading(true);
    // Carry the current origin (app vs aapp) so OAuth returns us to THIS frontend.
    const origin = encodeURIComponent(window.location.origin);
    window.location.href = `${API_ORIGIN}/auth/google?origin=${origin}`;
  };

  return (
    <Button block size="large" icon={<GoogleG />} onClick={onClick} loading={loading} disabled={loading}>
      {shownLabel}
    </Button>
  );
}
