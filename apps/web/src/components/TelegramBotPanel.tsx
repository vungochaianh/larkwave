"use client";

import { CheckCircleFilled, MinusCircleOutlined, SaveOutlined, SendOutlined } from "@ant-design/icons";
import { Alert, App, Button, Card, Input, Space, Tag, Typography } from "antd";
import { useCallback, useEffect, useState } from "react";
import type { TelegramAdminStatus } from "@larkwave/shared";
import { useI18n } from "@larkwave/ui";
import { api } from "@/lib/api";

const { Text, Paragraph } = Typography;

/**
 * Admin panel: set the platform Telegram bot token WITHOUT a redeploy. The token is
 * AES-encrypted server-side (Setting.telegramEnc), preferred over env, and saving it
 * re-registers the Telegram webhook immediately. Powers the "nhắn Telegram → máy chạy"
 * remote-run bridge shared by all users.
 */
export default function TelegramBotPanel() {
  const { t } = useI18n();
  const { message } = App.useApp();
  const [status, setStatus] = useState<TelegramAdminStatus | null>(null);
  const [token, setToken] = useState("");
  const [username, setUsername] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setStatus(await api.adminTelegramStatus());
    } catch (e) {
      message.error((e as Error).message);
    }
  }, [message]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!token.trim()) {
      message.warning(t("wcomp.tgPasteToken", "Dán bot token (từ @BotFather) để lưu."));
      return;
    }
    setSaving(true);
    try {
      const s = await api.setTelegramBot({ botToken: token.trim(), botUsername: username.trim() || undefined });
      setStatus(s);
      setToken("");
      setUsername("");
      message.success(
        s.configured
          ? `${t("wcomp.tgSavedWebhook", "Đã lưu (mã hoá) + đăng ký webhook. Bot:")} @${s.botUsername ?? "?"}`
          : t("wcomp.tgSaved", "Đã lưu."),
      );
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    setSaving(true);
    try {
      setStatus(await api.setTelegramBot({ botToken: "" }));
      message.success(t("wcomp.tgTokenRemoved", "Đã gỡ token (quay về biến môi trường nếu có)."));
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card
      title={
        <Space>
          <SendOutlined style={{ color: "#229ED9" }} />
          <span>{t("wcomp.tgPanelTitle", "Bot Telegram (điều khiển máy từ xa)")}</span>
        </Space>
      }
      style={{ marginBottom: 16 }}
    >
      <Space direction="vertical" size={14} style={{ width: "100%" }}>
        <Space wrap>
          {status?.configured ? (
            <Tag icon={<CheckCircleFilled />} color="green">
              {t("wcomp.tgConfigured", "Đã cấu hình")}{status.tokenLast4 ? ` ••••${status.tokenLast4}` : ""} ({status.source === "admin" ? "CMS" : "env"})
            </Tag>
          ) : (
            <Tag icon={<MinusCircleOutlined />} color="default">
              {t("wcomp.tgNotConfigured", "Chưa cấu hình")}
            </Tag>
          )}
          {status?.botUsername && (
            <a href={`https://t.me/${status.botUsername}`} target="_blank" rel="noreferrer">
              @{status.botUsername}
            </a>
          )}
        </Space>

        <div>
          <Paragraph type="secondary" style={{ fontSize: 12.5, margin: "0 0 10px" }}>
            {t("wcomp.tgTokenPre", "Dán bot token ở đây thay vì sửa")} <code>.env</code> —{" "}
            {t("wcomp.tgTokenMid", "lưu là")}{" "}
            <b>{t("wcomp.tgTokenBold", "áp dụng ngay, không cần deploy lại")}</b>{" "}
            {t("wcomp.tgTokenPost", "(token được mã hoá; webhook tự đăng ký). Tạo bot ở")}{" "}
            <b>@BotFather</b> → <code>/newbot</code> → {t("wcomp.tgTokenCopy", "copy token.")}
          </Paragraph>
          <Space direction="vertical" size={10} style={{ width: "100%", maxWidth: 560 }}>
            <div>
              <Text style={{ fontSize: 13 }}>{t("wcomp.tgBotToken", "Bot token")}</Text>
              <Input.Password
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder={t("wcomp.tgTokenPlaceholder", "123456789:AA… (từ @BotFather; để trống = giữ nguyên)")}
                autoComplete="off"
              />
            </div>
            <div>
              <Text style={{ fontSize: 13 }}>{t("wcomp.tgBotUsername", "Bot @username (tuỳ chọn — để làm link t.me)")}</Text>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={t("wcomp.tgUsernamePlaceholder", "vd: larkwave_bot (không có @). Bỏ trống = tự lấy qua getMe.")}
                autoComplete="off"
              />
            </div>
            <Space>
              <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => void save()}>
                {t("wcomp.tgSaveRegister", "Lưu + đăng ký webhook")}
              </Button>
              {status?.configured && status.source === "admin" && (
                <Button danger onClick={() => void clear()} loading={saving}>
                  {t("wcomp.tgRemoveToken", "Gỡ token")}
                </Button>
              )}
            </Space>
          </Space>
        </div>

        <Alert
          type="info"
          showIcon
          message={t("wcomp.tgHowTitle", "Cách hoạt động")}
          description={
            <div style={{ fontSize: 12.5, lineHeight: 1.7 }}>
              {t(
                "wcomp.tgHowA",
                "Một bot Telegram DÙNG CHUNG cho mọi người dùng. Mỗi người vào app → Điều khiển từ xa → “Nối Telegram” để lấy mã, gửi",
              )}{" "}
              <code>/start &lt;mã&gt;</code>{" "}
              {t(
                "wcomp.tgHowB",
                "cho bot trong chat/nhóm họ muốn dùng. Sau đó nhắn nội dung vào chat đó là máy của họ chạy rồi trả kết quả về. Webhook:",
              )}{" "}
              <code>{status?.webhookUrl}</code>
            </div>
          }
        />
      </Space>
    </Card>
  );
}
