"use client";

import { LockOutlined, MailOutlined } from "@ant-design/icons";
import { useLangT } from "@/lib/useLangT";
import type { Locale } from "@larkwave/ui";
import { Alert, App, Button, Form, Grid, Input, Result, Typography } from "antd";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import AuthCard, { authLink } from "@/components/AuthCard";
import { api, ApiError } from "@/lib/api";

const RESEND_COOLDOWN = 60;

/** `lang` từ máy chủ truyền xuống: lúc dựng ở máy chủ context i18n luôn trả 'vi' — xem lib/useLangT.ts. */
export default function ForgotClient({ lang }: { lang?: Locale }) {
  const { message } = App.useApp();
  const t = useLangT(lang);
  const router = useRouter();
  const screens = Grid.useBreakpoint();

  // step 1 = enter email, step 2 = enter OTP + new password, done = success
  const [step, setStep] = useState<1 | 2>(1);
  const [done, setDone] = useState(false);
  const [email, setEmail] = useState("");

  const [sending, setSending] = useState(false); // step 1 / resend
  const [resetting, setResetting] = useState(false); // step 2 submit
  const [serverError, setServerError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  const [resetForm] = Form.useForm<{ code: string; password: string }>();

  // Tick the resend cooldown down once per second.
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (cooldown <= 0) return;
    timerRef.current = setInterval(() => {
      setCooldown((c) => (c <= 1 ? 0 : c - 1));
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [cooldown]);

  // Step 1: send the code, then move to step 2 regardless (no enumeration).
  const sendCode = async (targetEmail: string) => {
    setSending(true);
    setServerError(null);
    try {
      await api.forgotPassword(targetEmail);
      setEmail(targetEmail);
      setStep(2);
      setCooldown(RESEND_COOLDOWN);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const onSendEmail = (values: { email: string }) => sendCode(values.email.trim());

  const onResend = async () => {
    if (cooldown > 0 || sending) return;
    await sendCode(email);
    message.success(t("auth.codeResent", "Đã gửi lại mã"));
  };

  // Step 2: submit code + new password.
  const onReset = async (values: { code: string; password: string }) => {
    setResetting(true);
    setServerError(null);
    try {
      await api.resetPassword(email, values.code, values.password);
      setDone(true);
      message.success(t("auth.passwordChanged", "Đổi mật khẩu thành công"));
      setTimeout(() => router.replace("/login"), 1500);
    } catch (e) {
      if (e instanceof ApiError && e.statusCode === 400) {
        // Show the server's Vietnamese message inline and let them retry.
        setServerError(e.message);
        resetForm.setFieldValue("code", "");
      } else {
        message.error((e as Error).message);
      }
    } finally {
      setResetting(false);
    }
  };

  const footer = (
    <>
      {t("auth.rememberPassword", "Nhớ lại mật khẩu?")}{" "}
      <Link href="/login" style={authLink}>
        {t("auth.signIn", "Đăng nhập")}
      </Link>
    </>
  );

  if (done) {
    return (
      <AuthCard
      lang={lang}
        title={t("auth.resetTitle", "Đặt lại mật khẩu")}
        subtitle={t("auth.done", "Hoàn tất")}
        footer={footer}
      >
        <Result
          status="success"
          title={t("auth.passwordChanged", "Đổi mật khẩu thành công")}
          subTitle={t("auth.redirectingToLogin", "Đang chuyển đến trang đăng nhập...")}
          extra={
            <Link href="/login">
              <Button type="primary" block size="large">
                {t("auth.signInNow", "Đăng nhập ngay")}
              </Button>
            </Link>
          }
        />
      </AuthCard>
    );
  }

  if (step === 1) {
    return (
      <AuthCard
      lang={lang}
        title={t("auth.forgotTitle", "Quên mật khẩu")}
        subtitle={t("auth.forgotSubtitle", "Nhập email để nhận mã xác thực 6 số")}
        footer={footer}
      >
        <Form layout="vertical" onFinish={onSendEmail} requiredMark={false} size="large">
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
          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" block loading={sending}>
              {t("auth.sendCode", "Gửi mã xác thực")}
            </Button>
          </Form.Item>
        </Form>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      lang={lang}
      title={t("auth.resetTitle", "Đặt lại mật khẩu")}
      subtitle={t("auth.resetSubtitle", "Nhập mã 6 số và mật khẩu mới")}
      footer={footer}
    >
      <Typography.Paragraph style={{ fontSize: 13.5, color: "var(--tw-text-sub)", textAlign: "center" }}>
        {t("auth.otpSentTo", "Nếu email tồn tại, mã 6 số đã được gửi tới")}{" "}
        <strong style={{ color: "var(--tw-text)" }}>{email}</strong>{" "}
        {t("auth.checkSpam", "(kiểm tra cả Spam).")}
      </Typography.Paragraph>

      {serverError && (
        <Alert
          type="error"
          showIcon
          message={serverError}
          style={{ marginBottom: 16 }}
        />
      )}

      <Form
        form={resetForm}
        layout="vertical"
        onFinish={onReset}
        requiredMark={false}
        size="large"
      >
        <Form.Item
          name="code"
          label={t("auth.otpLabel", "Mã xác thực")}
          rules={[
            { required: true, message: t("auth.otpRequired", "Vui lòng nhập mã 6 số") },
            { pattern: /^\d{6}$/, message: t("auth.otpPattern", "Mã gồm 6 chữ số") },
          ]}
          style={{ marginBottom: 18 }}
        >
          <Input.OTP length={6} inputMode="numeric" autoFocus size={screens.md ? "large" : "middle"} />
        </Form.Item>
        <Form.Item
          name="password"
          label={t("auth.newPassword", "Mật khẩu mới")}
          rules={[
            { required: true, message: t("auth.passwordRequired", "Vui lòng nhập mật khẩu") },
            { min: 8, message: t("auth.passwordMin", "Mật khẩu tối thiểu 8 ký tự") },
            { max: 128, message: t("auth.passwordMax", "Mật khẩu tối đa 128 ký tự") },
          ]}
          hasFeedback
        >
          <Input.Password
            prefix={<LockOutlined />}
            placeholder="••••••••"
            autoComplete="new-password"
          />
        </Form.Item>
        <Form.Item
          name="confirm"
          label={t("auth.confirmPassword", "Xác nhận mật khẩu")}
          dependencies={["password"]}
          hasFeedback
          rules={[
            { required: true, message: t("auth.confirmRequired", "Vui lòng xác nhận mật khẩu") },
            ({ getFieldValue }) => ({
              validator(_, value) {
                if (!value || getFieldValue("password") === value) {
                  return Promise.resolve();
                }
                return Promise.reject(
                  new Error(t("auth.passwordMismatch", "Mật khẩu xác nhận không khớp")),
                );
              },
            }),
          ]}
        >
          <Input.Password
            prefix={<LockOutlined />}
            placeholder="••••••••"
            autoComplete="new-password"
          />
        </Form.Item>
        <Form.Item style={{ marginBottom: 12 }}>
          <Button type="primary" htmlType="submit" block loading={resetting}>
            {t("auth.resetTitle", "Đặt lại mật khẩu")}
          </Button>
        </Form.Item>
      </Form>

      <div style={{ textAlign: "center", fontSize: 13.5, color: "var(--tw-text-sub)" }}>
        {t("auth.noCode", "Không nhận được mã?")}{" "}
        <Button
          type="link"
          onClick={onResend}
          disabled={cooldown > 0 || sending}
          loading={sending}
          style={{ padding: 0, height: "auto", fontWeight: 600 }}
        >
          {cooldown > 0
            ? `${t("auth.resendCode", "Gửi lại mã")} (${cooldown}s)`
            : t("auth.resendCode", "Gửi lại mã")}
        </Button>
      </div>
    </AuthCard>
  );
}
