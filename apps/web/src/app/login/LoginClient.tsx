"use client";

import { LockOutlined, MailOutlined } from "@ant-design/icons";
import { useLangT } from "@/lib/useLangT";
import type { Locale } from "@larkwave/ui";
import { App, Button, Divider, Form, Input, Space } from "antd";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import AuthCard, { authLink } from "@/components/AuthCard";
import GitButton from "@/components/GitButton";
import GoogleButton from "@/components/GoogleButton";
import { useAuth } from "@/lib/auth";
import { useAuthProviders } from "@/lib/useAuthProviders";

function LoginInner({ lang }: { lang?: Locale }) {
  const { message } = App.useApp();
  const t = useLangT(lang);
  const { login } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [loading, setLoading] = useState(false);
  // Cached + deploy-resilient: buttons stay visible through an API restart.
  const providers = useAuthProviders();

  // Surface a failed OAuth round-trip (?error=google|gitlab|github) once on mount.
  useEffect(() => {
    const err = params.get("error");
    const label: Record<string, string> = {
      google: "Google",
      gitlab: "GitLab",
      github: "GitHub",
    };
    if (err) {
      message.error(
        label[err]
          ? t("auth.loginProviderFailed", "Đăng nhập {provider} thất bại, thử lại.").replace(
              "{provider}",
              label[err],
            )
          : t("auth.loginFailed", "Đăng nhập thất bại, thử lại."),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onFinish = async (values: { email: string; password: string }) => {
    setLoading(true);
    try {
      const u = await login(values);
      message.success(t("auth.loginSuccess", "Đăng nhập thành công"));
      const next = params.get("next");
      // Honour a SPECIFIC next (a real page), but ignore the bare "/" (AuthGuard sets
      // next=/ when you hit the root logged-out) so admins still land on /admin.
      // Internal paths only: reject protocol-relative "//evil.com" (open redirect),
      // same check as app/auth/callback/page.tsx.
      const specificNext =
        next && next.startsWith("/") && !next.startsWith("//") && next !== "/" ? next : null;
      // Vào thẳng bảng điều khiển, KHÔNG về "/". Từ ngày "/" thành trang giới thiệu (commit
      // 14c3bce), đăng nhập xong mà trả về "/" là ném người vừa đăng nhập trở lại trang bán hàng
      // — họ phải tự bấm thêm một nút nữa mới vào được chỗ làm việc.
      router.replace(specificNext ?? (u.role === "admin" ? "/admin" : "/overview"));
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard
      lang={lang}
      title={t("auth.signIn", "Đăng nhập")}
      subtitle={t("auth.loginSubtitle.lw", "Tiếp tục làm việc với Lark và Trợ lý AI")}
      footer={
        <>
          {t("auth.noAccount", "Chưa có tài khoản?")}{" "}
          <Link href="/register" style={authLink}>
            {t("auth.register", "Đăng ký")}
          </Link>
        </>
      }
    >
      <Form layout="vertical" onFinish={onFinish} requiredMark={false} size="large">
        <Form.Item
          name="email"
          label={t("auth.email", "Email")}
          rules={[
            { required: true, message: t("auth.emailRequired", "Vui lòng nhập email") },
            { type: "email", message: t("auth.emailInvalid", "Email không hợp lệ") },
          ]}
        >
          <Input prefix={<MailOutlined />} placeholder="ban@email.com" autoComplete="email" />
        </Form.Item>
        <Form.Item
          name="password"
          label={t("auth.password", "Mật khẩu")}
          rules={[{ required: true, message: t("auth.passwordRequired", "Vui lòng nhập mật khẩu") }]}
        >
          <Input.Password
            prefix={<LockOutlined />}
            placeholder="••••••••"
            autoComplete="current-password"
          />
        </Form.Item>
        <div style={{ textAlign: "right", marginTop: -12, marginBottom: 16 }}>
          <Link href="/forgot" style={{ ...authLink, fontWeight: 500, fontSize: 13.5 }}>
            {t("auth.forgotLink", "Quên mật khẩu?")}
          </Link>
        </div>
        <Form.Item style={{ marginBottom: 0 }}>
          <Button type="primary" htmlType="submit" block loading={loading}>
            {t("auth.signIn", "Đăng nhập")}
          </Button>
        </Form.Item>
      </Form>
      {(providers.google || providers.gitlab || providers.github) && (
        <>
          <Divider plain style={{ color: "var(--tw-text-sub)", fontSize: 13 }}>
            {t("auth.or", "hoặc")}
          </Divider>
          <Space direction="vertical" size={10} style={{ width: "100%" }}>
            {providers.google && <GoogleButton />}
            {providers.gitlab && <GitButton provider="gitlab" />}
            {providers.github && <GitButton provider="github" />}
          </Space>
        </>
      )}
    </AuthCard>
  );
}

/**
 * Vỏ tĩnh hiện trong lúc chờ. PHẢI có — không được để `fallback={null}`.
 *
 * LoginInner đọc query string bằng useSearchParams(), nên Next bắt buộc bọc Suspense, và FALLBACK
 * LÀ THỨ DUY NHẤT được kết xuất ra HTML ở máy chủ. Để null thì /login trả về trang rỗng: không thẻ
 * h1, không một chữ nào — đo ngày 21/09/2026 trên bản chạy thật, `tw-auth-title` hoàn toàn vắng
 * trong HTML của /login trong khi /register, /forgot, /reset đều có. Máy tìm kiếm thấy trang
 * trắng ở đúng trang được liên kết tới nhiều nhất, còn người dùng thấy chớp trắng trước khi JS
 * chạy xong. Ba trang kia không vướng vì chúng không đọc query string nên không cần Suspense.
 *
 * Chỉ dựng phần vỏ (tiêu đề + mô tả), không dựng form: form nằm trong LoginInner và thay chỗ này
 * ngay khi hydrate xong. Dựng lại form ở đây sẽ thành hai form chồng nhau trong một nhịp.
 */
function LoginShell({ lang }: { lang?: Locale }) {
  const t = useLangT(lang);
  return (
    <AuthCard
      lang={lang}
      title={t("auth.signIn", "Đăng nhập")}
      subtitle={t("auth.loginSubtitle.lw", "Tiếp tục làm việc với Lark và Trợ lý AI")}
      footer={null}
    >
      {null}
    </AuthCard>
  );
}

/** `lang` từ máy chủ truyền xuống: lúc dựng ở máy chủ context i18n luôn trả 'vi' — xem lib/useLangT.ts. */
export default function LoginClient({ lang }: { lang?: Locale }) {
  return (
    <Suspense fallback={<LoginShell lang={lang} />}>
      <LoginInner lang={lang} />
    </Suspense>
  );
}
