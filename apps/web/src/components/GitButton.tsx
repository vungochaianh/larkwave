"use client";

import { GithubFilled, GitlabFilled } from "@ant-design/icons";
import { Button } from "antd";
import { useState } from "react";
import type { GitProvider } from "@larkwave/shared";
import { useI18n } from "@larkwave/ui";
import { API_ORIGIN } from "@/lib/api";

const META: Record<
  GitProvider,
  { label: string; icon: React.ReactNode; color: string }
> = {
  gitlab: {
    label: "Đăng nhập với GitLab",
    icon: <GitlabFilled style={{ color: "#FC6D26" }} />,
    color: "#FC6D26",
  },
  github: {
    label: "Đăng nhập với GitHub",
    icon: <GithubFilled style={{ color: "#1E2230" }} />,
    color: "#1E2230",
  },
};

/**
 * Full-page navigation to the API's GitLab/GitHub OAuth entrypoint. fetch()
 * cannot follow the 302 → provider-consent chain, so we hard-navigate.
 *
 * Pass `linkToken` to connect the provider to the *currently logged-in* user
 * (used by the import flow) — the API carries it through OAuth state and links
 * the provider to that account instead of logging in / creating a new one.
 */
export default function GitButton({
  provider,
  label,
  linkToken,
}: {
  provider: GitProvider;
  label?: string;
  linkToken?: string | null;
}) {
  const { t } = useI18n();
  const meta = META[provider];
  const [loading, setLoading] = useState(false);
  const onClick = () => {
    setLoading(true);
    // Carry the current origin (app vs aapp) so OAuth returns us to THIS frontend.
    const params = new URLSearchParams({ origin: window.location.origin });
    if (linkToken) params.set("link", linkToken);
    window.location.href = `${API_ORIGIN}/auth/${provider}?${params.toString()}`;
  };

  return (
    <Button block size="large" icon={meta.icon} onClick={onClick} loading={loading} disabled={loading}>
      {label ?? t(`wcomp.gitLogin.${provider}`, meta.label)}
    </Button>
  );
}
