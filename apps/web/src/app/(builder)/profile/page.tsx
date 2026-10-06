"use client";

import {
  AppstoreOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  CloudServerOutlined,
  CopyOutlined,
  DeleteOutlined,
  DeploymentUnitOutlined,
  EditOutlined,
  FireOutlined,
  LockOutlined,
  MailOutlined,
  ThunderboltOutlined,
  TrophyOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import {
  Alert,
  App,
  Button,
  Card,
  Form,
  Grid,
  Input,
  Modal,
  Progress,
  Skeleton,
  Space,
  Switch,
  Tooltip,
  Typography,
  Upload,
} from "antd";
import type { UploadProps } from "antd";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  computeXp,
  levelInfo,
  type ActivityDay,
  type MeActivity,
  type MeOverview,
  type User,
} from "@larkwave/shared";
import Link from "next/link";
import { TrophyOutlined as TrophyIcon } from "@ant-design/icons";
import { api, ApiError } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import { CARD_SHADOW } from "@/lib/theme";
import { DeviceManager, useI18n, V } from "@larkwave/ui";
import UsageWidget from "@/components/UsageWidget";
import { AchievementsCard } from "@/components/Achievements";
import { AdminBadge, PlanBadge, UserAvatar } from "@/components/UserAvatar";

const { Title, Text } = Typography;

export default function ProfilePage() {
  const { user } = useAuth();
  const { message } = App.useApp();
  const { t } = useI18n();

  const [overview, setOverview] = useState<MeOverview | null>(null);
  const [activity, setActivity] = useState<MeActivity | null>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [ov, act] = await Promise.all([
          api.meOverview(),
          api.meActivity(365),
        ]);
        if (cancelled) return;
        setOverview(ov);
        setActivity(act);
      } catch (e) {
        if (!cancelled) message.error((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [message]);

  const joinedAt = overview?.joinedAt ?? user?.createdAt ?? null;

  return (
    <Space direction="vertical" size={20} style={{ width: "100%" }}>
      <ProfileHeader
        user={user}
        joinedAt={joinedAt}
        onEdit={() => setEditOpen(true)}
        onChangePassword={() => setPwdOpen(true)}
      />

      <EditProfileModal open={editOpen} onClose={() => setEditOpen(false)} />
      <ChangePasswordModal open={pwdOpen} onClose={() => setPwdOpen(false)} />

      {/* Plan & monthly build quota */}
      <UsageWidget variant="card" />

      {/* Device manager — login sessions, max 3 per account */}
      <Card styles={{ body: { padding: 20 } }} style={{ boxShadow: CARD_SHADOW }}>
        <DeviceManager />
      </Card>

      {/* Referral: share to earn credits */}
      <ReferralCard />

      {/* Overview stat tiles */}
      <StatGrid overview={overview} loading={loading} />

      {/* Streak cards */}
      <StreakRow activity={activity} loading={loading} />

      {/* XP & level */}
      <LevelCard overview={overview} loading={loading} />

      {/* Achievement badge collection */}
      <AchievementsCard
        overview={overview}
        activity={activity}
        plan={user?.plan}
        joinedAt={joinedAt}
        loading={loading}
      />

      {/* Contribution graph */}
      <Card
        styles={{ body: { padding: 20 } }}
        style={{ boxShadow: CARD_SHADOW }}
        title={
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <CalendarOutlined style={{ color: "#6C5CE7" }} />
            {t("money.contributionActivity", "Hoạt động đóng góp")}
          </span>
        }
        extra={
          activity ? (
            <Text type="secondary" style={{ fontSize: 12.5 }}>
              {activity.total} {t("money.buildsLast12", "build trong 12 tháng qua")}
            </Text>
          ) : undefined
        }
      >
        {loading || !activity ? (
          <Skeleton active paragraph={{ rows: 4 }} />
        ) : (
          <ContributionGraph days={activity.days} />
        )}
      </Card>
    </Space>
  );
}

function ProfileHeader({
  user,
  joinedAt,
  onEdit,
  onChangePassword,
}: {
  user: User | null;
  joinedAt: string | null;
  onEdit: () => void;
  onChangePassword: () => void;
}) {
  const { t } = useI18n();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const name = user?.name || t("money.user", "Người dùng");
  const email = user?.email || "";
  return (
    <Card styles={{ body: { padding: isMobile ? 16 : 22 } }} style={{ boxShadow: CARD_SHADOW }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: isMobile ? 14 : 18,
        }}
      >
        <UserAvatar
          name={name}
          avatarUrl={user?.avatarUrl}
          size={isMobile ? 60 : 76}
          fontScale={0.45}
          style={{ boxShadow: "0 8px 22px rgba(108,92,231,0.28)" }}
        />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <Title level={3} style={{ margin: 0 }} ellipsis={{ rows: 1 }}>
              {name}
            </Title>
            {user?.role === "admin" && <AdminBadge />}
            {/* Nhãn gói LÀ MỘT LIÊN KẾT tới trang gói. Thanh bên đã bỏ mục "Gói & Thanh toán"
                (24/09/2026) vì /pricing nay là trang giới thiệu công khai, không phải màn hình
                trong app — nhưng bỏ mà không để lại lối nào thì người đã đăng nhập không còn
                đường nâng gói, tức là tự cắt đứt đường mua của chính mình. Đây là lối đó. */}
            <Link href="/pricing" title="Xem các gói và nâng cấp">
              <PlanBadge plan={user?.plan} />
            </Link>
          </div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 16,
              marginTop: 6,
              color: V.textSub,
              fontSize: 13.5,
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <MailOutlined style={{ color: V.textFaint }} />
              {email}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <CalendarOutlined style={{ color: V.textFaint }} />
              {t("money.joined", "Tham gia")} {joinedAt ? formatDate(joinedAt) : "—"}
            </span>
          </div>
        </div>
        <Space wrap size={8}>
          <Button icon={<LockOutlined />} onClick={onChangePassword}>
            {t("money.changePassword", "Đổi mật khẩu")}
          </Button>
          <Button icon={<EditOutlined />} onClick={onEdit}>
            {t("money.editProfile", "Sửa hồ sơ")}
          </Button>
        </Space>
      </div>
    </Card>
  );
}

const AVATAR_MAX_BYTES = 3 * 1024 * 1024;
const AVATAR_MIME = ["image/png", "image/jpeg", "image/webp", "image/gif"];

/**
 * Edit-profile modal: rename + change avatar (upload / Google picture / clear).
 * Each mutation returns the updated User which we push into the auth provider
 * via `applyUser`, so the sidebar + header refresh instantly everywhere.
 */
function EditProfileModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { user, applyUser, refresh } = useAuth();
  const { message } = App.useApp();
  const { t } = useI18n();
  const [form] = Form.useForm<{ name: string; discoverable: boolean }>();
  const [savingName, setSavingName] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);

  // Reset the fields to current values whenever the modal opens.
  useEffect(() => {
    if (open)
      form.setFieldsValue({ name: user?.name ?? "", discoverable: user?.discoverable !== false });
  }, [open, user?.name, user?.discoverable, form]);

  const handleAvatarUpload: UploadProps["beforeUpload"] = (file) => {
    if (!AVATAR_MIME.includes(file.type)) {
      message.error(t("money.avatarMime", "Chỉ chấp nhận ảnh PNG, JPEG, WEBP hoặc GIF."));
      return Upload.LIST_IGNORE;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      message.error(t("money.avatarTooBig", "Ảnh phải nhỏ hơn 3MB."));
      return Upload.LIST_IGNORE;
    }
    setAvatarBusy(true);
    api
      .uploadAvatar(file as File)
      .then((updated) => {
        applyUser(updated);
        message.success(t("money.avatarUpdated", "Đã cập nhật ảnh đại diện."));
      })
      .catch((e) => message.error((e as Error).message))
      .finally(() => setAvatarBusy(false));
    // We handle the request ourselves; tell AntD not to upload.
    return Upload.LIST_IGNORE;
  };

  const clearAvatar = async () => {
    setAvatarBusy(true);
    try {
      const updated = await api.setAvatarUrl(null);
      applyUser(updated);
      message.success(t("money.avatarRemoved", "Đã xoá ảnh đại diện."));
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setAvatarBusy(false);
    }
  };

  const saveName = async () => {
    let values: { name: string; discoverable?: boolean };
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setSavingName(true);
    try {
      const updated = await api.updateProfile({
        name: values.name.trim(),
        discoverable: values.discoverable,
      });
      applyUser(updated);
      message.success(t("money.profileSaved", "Đã lưu hồ sơ."));
      // Belt-and-braces: re-sync from /me so any derived fields stay fresh.
      void refresh();
      onClose();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSavingName(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={t("money.editProfile", "Sửa hồ sơ")}
      okText={t("money.saveBtn", "Lưu")}
      cancelText={t("money.close", "Đóng")}
      confirmLoading={savingName}
      onOk={saveName}
      destroyOnHidden
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          margin: "8px 0 20px",
        }}
      >
        <UserAvatar
          name={user?.name}
          avatarUrl={user?.avatarUrl}
          size={64}
          fontScale={0.45}
        />
        <Space direction="vertical" size={8} style={{ flex: 1 }}>
          <Space wrap size={8}>
            <Upload
              accept={AVATAR_MIME.join(",")}
              showUploadList={false}
              beforeUpload={handleAvatarUpload}
              disabled={avatarBusy}
            >
              <Button icon={<UploadOutlined />} loading={avatarBusy}>
                {t("money.changeAvatar", "Đổi ảnh")}
              </Button>
            </Upload>
            {user?.avatarUrl && (
              <Button
                icon={<DeleteOutlined />}
                onClick={clearAvatar}
                disabled={avatarBusy}
              >
                {t("money.removeAvatar", "Xoá ảnh")}
              </Button>
            )}
          </Space>
          <Typography.Text type="secondary" style={{ fontSize: 12.5 }}>
            {t("money.avatarHint", "PNG, JPEG, WEBP hoặc GIF, tối đa 3MB.")}
          </Typography.Text>
        </Space>
      </div>

      <Form form={form} layout="vertical" requiredMark={false}>
        <Form.Item
          name="name"
          label={t("money.name", "Tên")}
          rules={[
            { required: true, message: t("money.nameRequired", "Vui lòng nhập tên.") },
            {
              validator: (_, v) =>
                (v?.trim().length ?? 0) >= 1 && (v?.trim().length ?? 0) <= 60
                  ? Promise.resolve()
                  : Promise.reject(new Error(t("money.nameLength", "Tên dài 1–60 ký tự."))),
            },
          ]}
        >
          <Input placeholder={t("money.displayName", "Tên hiển thị")} maxLength={60} allowClear />
        </Form.Item>
        <Form.Item
          name="discoverable"
          label={t("money.discoverable", "Cho phép người khác tìm thấy tôi")}
          valuePropName="checked"
          tooltip={t("money.discoverableTip", "Bật: hồ sơ của bạn hiện trong mục Khám phá người dùng để người khác kết bạn. Tắt: chỉ ai biết email mới mời được bạn.")}
          style={{ marginBottom: 0 }}
        >
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  );
}

const PWD_RESEND_COOLDOWN = 60;

/**
 * Change-password modal (OTP). Step 1: send a 6-digit code to the current
 * user's email. Step 2: enter the code + new password. Works for Google-login
 * users too — this is how they set a password for the first time.
 */
function ChangePasswordModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { message } = App.useApp();
  const { t } = useI18n();
  const [form] = Form.useForm<{ code: string; newPassword: string }>();

  const [codeSent, setCodeSent] = useState(false);
  const [sentTo, setSentTo] = useState("");
  const [sending, setSending] = useState(false); // request/resend code
  const [saving, setSaving] = useState(false); // submit change
  const [serverError, setServerError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  // Reset all transient state every time the modal opens.
  useEffect(() => {
    if (open) {
      setCodeSent(false);
      setSentTo("");
      setSending(false);
      setSaving(false);
      setServerError(null);
      setCooldown(0);
      form.resetFields();
    }
  }, [open, form]);

  // Resend cooldown ticker.
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => {
      setCooldown((c) => (c <= 1 ? 0 : c - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  const requestCode = async (isResend: boolean) => {
    setSending(true);
    setServerError(null);
    try {
      const res = await api.requestPasswordCode();
      setSentTo(res.sentTo);
      setCodeSent(true);
      setCooldown(PWD_RESEND_COOLDOWN);
      message.success(isResend ? t("money.codeResent", "Đã gửi lại mã") : `${t("money.codeSentTo", "Đã gửi mã tới")} ${res.sentTo}`);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const submit = async () => {
    let values: { code: string; newPassword: string };
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setSaving(true);
    setServerError(null);
    try {
      await api.changePassword(values.code, values.newPassword);
      message.success(t("money.passwordChanged", "Đã đổi mật khẩu"));
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.statusCode === 400) {
        setServerError(e.message);
        form.setFieldValue("code", "");
      } else {
        message.error((e as Error).message);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={t("money.changePassword", "Đổi mật khẩu")}
      cancelText={t("money.close", "Đóng")}
      okText={t("money.changePassword", "Đổi mật khẩu")}
      okButtonProps={{ disabled: !codeSent }}
      confirmLoading={saving}
      onOk={submit}
      destroyOnHidden
    >
      {!codeSent ? (
        <div style={{ margin: "8px 0" }}>
          <Typography.Paragraph style={{ color: V.textSub, fontSize: 13.5 }}>
            {t(
              "money.otpIntro",
              "Chúng tôi sẽ gửi một mã xác thực 6 số tới email của bạn. Nhập mã đó cùng mật khẩu mới để hoàn tất.",
            )}
          </Typography.Paragraph>
          <Button
            type="primary"
            icon={<MailOutlined />}
            block
            loading={sending}
            onClick={() => requestCode(false)}
          >
            {t("money.sendCode", "Gửi mã xác thực")}
          </Button>
        </div>
      ) : (
        <>
          <Alert
            type="success"
            showIcon
            message={`${t("money.codeSentTo", "Đã gửi mã tới")} ${sentTo}`}
            description={t("money.otpCheckInbox", "Kiểm tra hộp thư (cả Spam). Mã có hiệu lực trong 10 phút.")}
            style={{ margin: "8px 0 18px" }}
          />

          {serverError && (
            <Alert
              type="error"
              showIcon
              message={serverError}
              style={{ marginBottom: 16 }}
            />
          )}

          <Form form={form} layout="vertical" requiredMark={false}>
            <Form.Item
              name="code"
              label={t("money.otpCode", "Mã xác thực")}
              rules={[
                { required: true, message: t("money.otpRequired", "Vui lòng nhập mã 6 số") },
                { pattern: /^\d{6}$/, message: t("money.otpDigits", "Mã gồm 6 chữ số") },
              ]}
              style={{ marginBottom: 18 }}
            >
              <Input.OTP length={6} inputMode="numeric" />
            </Form.Item>
            <Form.Item
              name="newPassword"
              label={t("money.newPassword", "Mật khẩu mới")}
              rules={[
                { required: true, message: t("money.pwdRequired", "Vui lòng nhập mật khẩu") },
                { min: 8, message: t("money.pwdMin", "Mật khẩu tối thiểu 8 ký tự") },
                { max: 128, message: t("money.pwdMax", "Mật khẩu tối đa 128 ký tự") },
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
              label={t("money.confirmPassword", "Xác nhận mật khẩu")}
              dependencies={["newPassword"]}
              hasFeedback
              rules={[
                { required: true, message: t("money.confirmRequired", "Vui lòng xác nhận mật khẩu") },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue("newPassword") === value) {
                      return Promise.resolve();
                    }
                    return Promise.reject(
                      new Error(t("money.pwdMismatch", "Mật khẩu xác nhận không khớp")),
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
          </Form>

          <div style={{ fontSize: 13.5, color: V.textSub }}>
            {t("money.noCode", "Không nhận được mã?")}{" "}
            <Button
              type="link"
              onClick={() => requestCode(true)}
              disabled={cooldown > 0 || sending}
              loading={sending}
              style={{ padding: 0, height: "auto", fontWeight: 600 }}
            >
              {cooldown > 0 ? `${t("money.resendCode", "Gửi lại mã")} (${cooldown}s)` : t("money.resendCode", "Gửi lại mã")}
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}

function LevelCard({
  overview,
  loading,
}: {
  overview: MeOverview | null;
  loading: boolean;
}) {
  const { t } = useI18n();
  const xp = overview
    ? computeXp({
        apps: overview.totalApps,
        succeededBuilds: overview.succeededBuilds,
        deployments: overview.totalDeployments,
        visits: overview.totalVisits ?? 0,
      })
    : 0;
  const lvl = levelInfo(xp);
  const pct = lvl.xpForNext > 0 ? Math.round((lvl.xpInLevel / lvl.xpForNext) * 100) : 0;

  return (
    <Card
      styles={{ body: { padding: 20 } }}
      style={{ boxShadow: CARD_SHADOW }}
      title={
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <TrophyIcon style={{ color: "#F59E0B" }} />
          {t("money.levelXp", "Cấp độ & XP")}
        </span>
      }
      extra={
        <Link href="/leaderboard">
          <Button type="link" size="small">
            {t("money.leaderboard", "Bảng xếp hạng")} →
          </Button>
        </Link>
      }
    >
      {loading ? (
        <Skeleton active paragraph={{ rows: 2 }} />
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 18,
              background: "linear-gradient(135deg, #6C5CE7 0%, #A66BFF 100%)",
              color: "#fff",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              boxShadow: "0 8px 20px rgba(108,92,231,0.30)",
            }}
          >
            <span style={{ fontSize: 10, opacity: 0.85, lineHeight: 1 }}>LV</span>
            <span style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.1 }}>{lvl.level}</span>
          </div>
          <div style={{ flex: 1, minWidth: "min(220px, 100%)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <Text strong style={{ fontSize: 15 }}>
                {lvl.title}
              </Text>
              <Text type="secondary" style={{ fontSize: 12.5 }}>
                {lvl.xp.toLocaleString("vi-VN")} XP
              </Text>
            </div>
            <Progress
              percent={pct}
              showInfo={false}
              strokeColor={{ "0%": "#6C5CE7", "100%": "#A66BFF" }}
              style={{ margin: "8px 0 2px" }}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {t("money.remaining", "Còn")} {(lvl.xpForNext - lvl.xpInLevel).toLocaleString("vi-VN")} {t("money.xpToLevel", "XP để lên cấp")} {lvl.level + 1}
            </Text>
          </div>
        </div>
      )}
    </Card>
  );
}

function StatGrid({
  overview,
  loading,
}: {
  overview: MeOverview | null;
  loading: boolean;
}) {
  const { t } = useI18n();
  const tiles: {
    label: string;
    value: number | undefined;
    icon: ReactNode;
    color: string;
    bg: string;
  }[] = [
    {
      label: t("money.statTotalApps", "Tổng apps"),
      value: overview?.totalApps,
      icon: <AppstoreOutlined />,
      color: "#6C5CE7",
      bg: "rgba(108,92,231,0.12)",
    },
    {
      label: t("money.statLive", "Đang live"),
      value: overview?.liveApps,
      icon: <CloudServerOutlined />,
      color: "#16B98D",
      bg: "rgba(22,185,141,0.14)",
    },
    {
      label: t("money.statTotalBuilds", "Tổng builds"),
      value: overview?.totalBuilds,
      icon: <ThunderboltOutlined />,
      color: "#F59E0B",
      bg: "rgba(245,158,11,0.14)",
    },
    {
      label: t("money.statSucceeded", "Build thành công"),
      value: overview?.succeededBuilds,
      icon: <CheckCircleOutlined />,
      color: "#16B98D",
      bg: "rgba(22,185,141,0.14)",
    },
    {
      label: t("money.statFailed", "Build lỗi"),
      value: overview?.failedBuilds,
      icon: <CloseCircleOutlined />,
      color: "#EF4444",
      bg: "rgba(239,68,68,0.12)",
    },
    {
      label: "Deployments",
      value: overview?.totalDeployments,
      icon: <DeploymentUnitOutlined />,
      color: "#4FB6FF",
      bg: "rgba(79,182,255,0.16)",
    },
  ];

  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(auto-fit, minmax(170px, 1fr))",
        gap: isMobile ? 10 : 14,
      }}
    >
      {tiles.map((t) => (
        <Card
          key={t.label}
          styles={{ body: { padding: isMobile ? 13 : 16 } }}
          style={{ boxShadow: CARD_SHADOW }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 10 : 13, minWidth: 0 }}>
            <span
              style={{
                display: "inline-flex",
                width: isMobile ? 38 : 44,
                height: isMobile ? 38 : 44,
                minWidth: isMobile ? 38 : 44,
                borderRadius: 12,
                alignItems: "center",
                justifyContent: "center",
                fontSize: isMobile ? 17 : 19,
                background: t.bg,
                color: t.color,
                flexShrink: 0,
              }}
            >
              {t.icon}
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 12.5, color: V.textSub }}>{t.label}</div>
              {loading || t.value === undefined ? (
                <Skeleton.Button active size="small" style={{ width: 52, height: 24 }} />
              ) : (
                <div
                  style={{
                    fontSize: isMobile ? 20 : 24,
                    fontWeight: 700,
                    color: V.text,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {t.value}
                </div>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function StreakRow({
  activity,
  loading,
}: {
  activity: MeActivity | null;
  loading: boolean;
}) {
  const { t } = useI18n();
  const cards: {
    label: string;
    value: number | undefined;
    suffix: string;
    icon: ReactNode;
    gradient: string;
  }[] = [
    {
      label: t("money.currentStreak", "Chuỗi hiện tại"),
      value: activity?.currentStreak,
      suffix: t("money.daysUnit", "ngày"),
      icon: <FireOutlined />,
      gradient: "linear-gradient(135deg, #FF7A59 0%, #FF4D6D 100%)",
    },
    {
      label: t("money.longestStreak", "Chuỗi dài nhất"),
      value: activity?.longestStreak,
      suffix: t("money.daysUnit", "ngày"),
      icon: <TrophyOutlined />,
      gradient: "linear-gradient(135deg, #6C5CE7 0%, #A66BFF 100%)",
    },
    {
      label: t("money.totalContributions", "Tổng đóng góp"),
      value: activity?.total,
      suffix: "build",
      icon: <ThunderboltOutlined />,
      gradient: "linear-gradient(135deg, #16B98D 0%, #4FB6FF 100%)",
    },
  ];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))",
        gap: 14,
      }}
    >
      {cards.map((c) => (
        <Card
          key={c.label}
          styles={{ body: { padding: 18 } }}
          style={{ boxShadow: CARD_SHADOW }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span
              style={{
                display: "inline-flex",
                width: 50,
                height: 50,
                minWidth: 50,
                borderRadius: 14,
                alignItems: "center",
                justifyContent: "center",
                fontSize: 23,
                color: "#fff",
                background: c.gradient,
                flexShrink: 0,
              }}
            >
              {c.icon}
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, color: V.textSub }}>{c.label}</div>
              {loading || c.value === undefined ? (
                <Skeleton.Button active size="small" style={{ width: 70, height: 28 }} />
              ) : (
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 6,
                  }}
                >
                  <span style={{ fontSize: 28, fontWeight: 800, color: V.text }}>
                    {c.value}
                  </span>
                  <span style={{ fontSize: 13, color: V.textFaint }}>{c.suffix}</span>
                </div>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

/** Map a day count to a 0–4 heat level (0 = none, 4 = most). */
function levelFor(count: number, max: number): number {
  if (count <= 0) return 0;
  if (max <= 0) return 1;
  const ratio = count / max;
  if (ratio > 0.75) return 4;
  if (ratio > 0.5) return 3;
  if (ratio > 0.25) return 2;
  return 1;
}

interface Week {
  /** 7 cells, index 0 = Monday … 6 = Sunday; null = padding before the window. */
  cells: (ActivityDay | null)[];
  /** Month label to show above this week column, or "" for none. */
  monthLabel: string;
}

/**
 * GitHub-style contribution heatmap built from a flat ascending list of days.
 * Columns are weeks (Mon→Sun), padded so the first column starts on a Monday.
 */
function ContributionGraph({ days }: { days: ActivityDay[] }) {
  const { t } = useI18n();
  const monthLabels = useMemo(
    () => [
      t("web.prof.monthJan", "Th1"),
      t("web.prof.monthFeb", "Th2"),
      t("web.prof.monthMar", "Th3"),
      t("web.prof.monthApr", "Th4"),
      t("web.prof.monthMay", "Th5"),
      t("web.prof.monthJun", "Th6"),
      t("web.prof.monthJul", "Th7"),
      t("web.prof.monthAug", "Th8"),
      t("web.prof.monthSep", "Th9"),
      t("web.prof.monthOct", "Th10"),
      t("web.prof.monthNov", "Th11"),
      t("web.prof.monthDec", "Th12"),
    ],
    [t],
  );
  const weekdayLabels = [
    "",
    t("web.prof.weekdayMon", "T2"),
    "",
    t("web.prof.weekdayWed", "T4"),
    "",
    t("web.prof.weekdayFri", "T6"),
    "",
  ];
  const { weeks, max } = useMemo(() => {
    if (days.length === 0) return { weeks: [] as Week[], max: 0 };

    const maxCount = days.reduce((m, d) => Math.max(m, d.count), 0);

    // Weekday index with Monday = 0 … Sunday = 6.
    const mondayIndex = (date: string): number => {
      const dow = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0=Sun … 6=Sat
      return (dow + 6) % 7;
    };

    // Pad the front so the first real day lands on its correct weekday row.
    const padded: (ActivityDay | null)[] = [];
    const firstPad = mondayIndex(days[0].date);
    for (let i = 0; i < firstPad; i++) padded.push(null);
    padded.push(...days);

    const built: Week[] = [];
    let lastMonth = -1;
    for (let i = 0; i < padded.length; i += 7) {
      const cells = padded.slice(i, i + 7);
      while (cells.length < 7) cells.push(null);

      // Use the first real day in the column to decide the month label.
      const firstReal = cells.find((c): c is ActivityDay => c !== null);
      let monthLabel = "";
      if (firstReal) {
        const m = new Date(`${firstReal.date}T00:00:00Z`).getUTCMonth();
        if (m !== lastMonth) {
          monthLabel = monthLabels[m];
          lastMonth = m;
        }
      }
      built.push({ cells, monthLabel });
    }
    return { weeks: built, max: maxCount };
  }, [days, monthLabels]);

  if (weeks.length === 0) {
    return (
      <Text type="secondary">{t("money.noActivity", "Chưa có hoạt động nào trong khoảng thời gian này.")}</Text>
    );
  }

  return (
    <div className="tw-contrib-scroll">
      <div style={{ display: "inline-flex", alignItems: "flex-start" }}>
        {/* Weekday labels column */}
        <div style={{ paddingTop: 16 }}>
          <div className="tw-contrib-weekdays">
            {weekdayLabels.map((w, i) => (
              <div key={i} className="tw-contrib-weekday">
                {w}
              </div>
            ))}
          </div>
        </div>

        <div>
          {/* Month labels aligned over the columns */}
          <div
            className="tw-contrib-months"
            style={{ gridTemplateColumns: `repeat(${weeks.length}, 12px)`, gap: 3 }}
          >
            {weeks.map((w, i) => (
              <span key={i}>{w.monthLabel}</span>
            ))}
          </div>

          {/* The heatmap grid */}
          <div className="tw-contrib">
            {weeks.map((week, wi) =>
              week.cells.map((cell, di) => {
                if (!cell) {
                  return (
                    <span
                      key={`${wi}-${di}`}
                      className="tw-contrib-cell is-empty"
                    />
                  );
                }
                const lvl = levelFor(cell.count, max);
                return (
                  <Tooltip
                    key={`${wi}-${di}`}
                    title={`${cell.count} build · ${cell.date}`}
                    mouseEnterDelay={0.05}
                  >
                    <span className={`tw-contrib-cell lvl-${lvl}`} />
                  </Tooltip>
                );
              }),
            )}
          </div>

          {/* Legend */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginTop: 12,
              fontSize: 11.5,
              color: V.textFaint,
            }}
          >
            <span style={{ marginRight: 2 }}>{t("money.less", "Ít")}</span>
            {[0, 1, 2, 3, 4].map((l) => (
              <span key={l} className={`tw-contrib-cell lvl-${l}`} />
            ))}
            <span style={{ marginLeft: 2 }}>{t("money.more", "Nhiều")}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** "Giới thiệu bạn" — shareable referral link + reward + count. */
function ReferralCard() {
  const { message } = App.useApp();
  const { t } = useI18n();
  const [data, setData] = useState<{
    link: string;
    referrals: number;
    rewardPerReferral: number;
  } | null>(null);
  const [errored, setErrored] = useState(false);

  // Refresh from the backend; on failure KEEP the last-known-good data (never
  // hide the card mid-deploy) and retry with backoff until the API returns.
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const delays = [1500, 3000, 6000, 10000]; // backoff while the API is down (deploy)
    let attempt = 0;

    const load = () => {
      api
        .getReferral()
        .then((next) => {
          if (!active) return;
          setData(next);
          setErrored(false);
        })
        .catch(() => {
          if (!active) return;
          // Transient failure (API restarting mid-deploy): DON'T drop any
          // data we already have — flag the error and retry with backoff.
          setErrored(true);
          if (attempt < delays.length) {
            timer = setTimeout(load, delays[attempt]);
            attempt += 1;
          }
        });
    };
    load();

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, []);

  const copy = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.link);
      message.success(t("money.referralCopied", "Đã sao chép liên kết giới thiệu"));
    } catch {
      window.prompt(t("money.copyLinkPrompt", "Sao chép liên kết:"), data.link);
    }
  };

  // Render the shell unconditionally so the card never vanishes during a
  // deploy. Link/referrals/reward fill in once loaded; before the first
  // successful response we show a lightweight placeholder instead of nothing.
  return (
    <Card style={{ boxShadow: CARD_SHADOW }} styles={{ body: { padding: 18 } }}>
      <Title level={5} style={{ margin: 0 }}>
        <ThunderboltOutlined style={{ color: "#6C5CE7" }} /> {t("money.referTitle", "Giới thiệu bạn — nhận credit")}
      </Title>
      <Text type="secondary" style={{ fontSize: 13, display: "block", marginTop: 4 }}>
        {data ? (
          <>
            {t("money.referDesc1", "Mỗi người bạn giới thiệu tạo app đầu tiên thành công: cả hai cùng nhận +")}
            {data.rewardPerReferral}{t("money.referDesc2", " credit. Bạn đã giới thiệu ")}{data.referrals}{t("money.referDesc3", " người.")}
          </>
        ) : errored ? (
          t("money.referRetry", "Đang kết nối lại… liên kết giới thiệu sẽ hiển thị ngay khi sẵn sàng.")
        ) : (
          t("money.referLoading", "Đang tải liên kết giới thiệu…")
        )}
      </Text>
      <Space.Compact style={{ width: "100%", marginTop: 12 }}>
        <Input
          readOnly
          value={data?.link ?? ""}
          placeholder={t("money.referLinkLoading", "Đang tải…")}
        />
        <Button
          type="primary"
          icon={<CopyOutlined />}
          disabled={!data}
          onClick={() => void copy()}
        >
          {t("money.copy", "Sao chép")}
        </Button>
      </Space.Compact>
    </Card>
  );
}
