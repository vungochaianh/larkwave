"use client";

import { LockOutlined, MailOutlined, UserOutlined } from "@ant-design/icons";
import { useLangT } from "@/lib/useLangT";
import type { Locale } from "@larkwave/ui";
import { App, Button, Divider, Form, Input, Space } from "antd";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import AuthCard, { authLink } from "@/components/AuthCard";
import GitButton from "@/components/GitButton";
import GoogleButton from "@/components/GoogleButton";
import { useAuth } from "@/lib/auth";
import { useAuthProviders } from "@/lib/useAuthProviders";

/** `lang` từ máy chủ truyền xuống: lúc dựng ở máy chủ context i18n luôn trả 'vi' — xem lib/useLangT.ts. */
export default function RegisterClient({ lang }: { lang?: Locale }) {
  const { message } = App.useApp();
  const t = useLangT(lang);
  const { register } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  // Cached + deploy-resilient: buttons stay visible through an API restart.
  const providers = useAuthProviders();

  const onFinish = async (values: {
    name?: string;
    email: string;
    password: string;
  }) => {
    setLoading(true);
    try {
      await register({
        email: values.email,
        password: values.password,
        ...(values.name ? { name: values.name } : {}),
      });
      message.success(t("auth.registerSuccess", "Tạo tài khoản thành công"));
      // Như trang đăng nhập: về bảng điều khiển, không về trang giới thiệu.
      router.replace("/overview");
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard
      lang={lang}
      title={t("auth.registerTitle", "Tạo tài khoản")}
      subtitle={t("auth.registerSubtitle", "Bắt đầu biến ý tưởng thành app")}
      footer={
        <>
          {t("auth.haveAccount", "Đã có tài khoản?")}{" "}
          <Link href="/login" style={authLink}>
            {t("auth.signIn", "Đăng nhập")}
          </Link>
        </>
      }
    >
      <Form layout="vertical" onFinish={onFinish} requiredMark={false} size="large">
        <Form.Item name="name" label={t("auth.nameOptional", "Tên (tuỳ chọn)")}>
          <Input
            prefix={<UserOutlined />}
            placeholder={t("auth.namePlaceholder", "Tên của bạn")}
            autoComplete="name"
          />
        </Form.Item>
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
          rules={[
            { required: true, message: t("auth.passwordRequired", "Vui lòng nhập mật khẩu") },
            { min: 8, message: t("auth.passwordMin", "Mật khẩu tối thiểu 8 ký tự") },
          ]}
        >
          <Input.Password
            prefix={<LockOutlined />}
            placeholder={t("auth.passwordMinPlaceholder", "Tối thiểu 8 ký tự")}
            autoComplete="new-password"
          />
        </Form.Item>
        <Form.Item style={{ marginBottom: 0 }}>
          <Button type="primary" htmlType="submit" block loading={loading}>
            {t("auth.register", "Đăng ký")}
          </Button>
        </Form.Item>
      </Form>
      {(providers.google || providers.gitlab || providers.github) && (
        <>
          <Divider plain style={{ color: "var(--tw-text-sub)", fontSize: 13 }}>
            {t("auth.orSignUpWith", "hoặc đăng ký với")}
          </Divider>
          <Space direction="vertical" size={10} style={{ width: "100%" }}>
            {providers.google && (
              <GoogleButton label={t("auth.signUpWithGoogle", "Đăng ký với Google")} />
            )}
            {providers.gitlab && (
              <GitButton
                provider="gitlab"
                label={t("auth.signUpWithGitlab", "Đăng ký với GitLab")}
              />
            )}
            {providers.github && (
              <GitButton
                provider="github"
                label={t("auth.signUpWithGithub", "Đăng ký với GitHub")}
              />
            )}
          </Space>
        </>
      )}
    </AuthCard>
  );
}
