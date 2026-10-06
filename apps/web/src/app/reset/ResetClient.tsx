"use client";

import { useLangT } from "@/lib/useLangT";
import type { Locale } from "@larkwave/ui";
import { Button, Result } from "antd";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import AuthCard, { authLink } from "@/components/AuthCard";

/**
 * Legacy route. The backend no longer emails reset *links* — password resets now
 * use a 6-digit OTP code entered on /forgot. We keep this path alive (so old
 * emailed links don't 404) and bounce visitors to the new flow.
 */
/** `lang` từ máy chủ truyền xuống: lúc dựng ở máy chủ context i18n luôn trả 'vi' — xem lib/useLangT.ts. */
export default function ResetClient({ lang }: { lang?: Locale }) {
  const t = useLangT(lang);
  const router = useRouter();

  useEffect(() => {
    const t = setTimeout(() => router.replace("/forgot"), 2000);
    return () => clearTimeout(t);
  }, [router]);

  return (
    <AuthCard
      lang={lang}
      title={t("auth.resetTitle", "Đặt lại mật khẩu")}
      subtitle={t("auth.resetChangedSubtitle", "Quy trình đặt lại mật khẩu đã thay đổi")}
      footer={
        <>
          {t("auth.rememberPassword", "Nhớ lại mật khẩu?")}{" "}
          <Link href="/login" style={authLink}>
            {t("auth.signIn", "Đăng nhập")}
          </Link>
        </>
      }
    >
      <Result
        status="info"
        title={t("auth.processChanged", "Quy trình đã thay đổi")}
        subTitle={t(
          "auth.resetChangedBody",
          "Giờ đây bạn đặt lại mật khẩu bằng mã 6 số gửi qua email. Đang chuyển bạn đến trang Quên mật khẩu...",
        )}
        extra={
          <Link href="/forgot">
            <Button type="primary" block size="large">
              {t("auth.goToForgot", "Đến trang Quên mật khẩu")}
            </Button>
          </Link>
        }
      />
    </AuthCard>
  );
}
