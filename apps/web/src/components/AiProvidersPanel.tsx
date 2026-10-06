"use client";

import { CheckCircleFilled, MinusCircleOutlined, RobotOutlined, SaveOutlined } from "@ant-design/icons";
import { Alert, App, Button, Card, Input, Space, Tag, Typography } from "antd";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@larkwave/ui";
import type { AiKeyMask, AiStatus } from "@/lib/api";
import { api } from "@/lib/api";

const { Title, Text, Paragraph } = Typography;

/**
 * Admin panel: provider status (Anthropic/OpenAI/Grok), set the optional
 * OpenAI/Grok keys (encrypted server-side), and a plain-language explainer of how
 * the agent/model routing currently works.
 */
export default function AiProvidersPanel() {
  const { t } = useI18n();
  const { message } = App.useApp();
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [anthropicKey, setAnthropicKey] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [grokKey, setGrokKey] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setStatus(await api.adminAiStatus());
    } catch (e) {
      message.error((e as Error).message);
    }
  }, [message]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!anthropicKey.trim() && !openaiKey.trim() && !grokKey.trim()) {
      message.warning(t("wcomp.aiEnterOneKey", "Nhập ít nhất một key để lưu."));
      return;
    }
    setSaving(true);
    try {
      await api.setAiKeys({
        ...(anthropicKey.trim() ? { anthropic: anthropicKey.trim() } : {}),
        ...(openaiKey.trim() ? { openai: openaiKey.trim() } : {}),
        ...(grokKey.trim() ? { grok: grokKey.trim() } : {}),
      });
      message.success(t("wcomp.aiKeysSaved", "Đã lưu key (mã hoá). Provider đã sẵn sàng."));
      setAnthropicKey("");
      setOpenaiKey("");
      setGrokKey("");
      void load();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const keyHint = (k?: AiKeyMask) =>
    k?.set
      ? `${t("wcomp.aiConfigured", "Đã cấu hình")} ••••${k.last4} · #${k.hash} (${
          k.source === "admin" ? "CMS" : "env"
        })`
      : t("wcomp.aiNotConfigured", "Chưa cấu hình");

  return (
    <Card
      title={
        <Space>
          <RobotOutlined style={{ color: "#6C5CE7" }} />
          <span>{t("wcomp.aiPanelTitle", "AI Providers & Logic vận hành agents")}</span>
        </Space>
      }
      style={{ marginBottom: 16 }}
    >
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        {/* Provider status */}
        <div>
          <Text strong>{t("wcomp.aiConnectedProviders", "Nhà cung cấp đang kết nối")}</Text>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 8 }}>
            {status?.providers.map((p) => (
              <Card key={p.id} size="small" style={{ minWidth: 220, flex: "1 1 220px" }}>
                <Space direction="vertical" size={2} style={{ width: "100%" }}>
                  <Space>
                    {p.enabled ? (
                      <CheckCircleFilled style={{ color: "#16B98D" }} />
                    ) : (
                      <MinusCircleOutlined style={{ color: "#9AA3B5" }} />
                    )}
                    <Text strong>{p.label}</Text>
                    <Tag color={p.enabled ? "green" : "default"} bordered={false}>
                      {p.enabled ? t("wcomp.aiOn", "Bật") : t("wcomp.aiOff", "Tắt")}
                    </Tag>
                  </Space>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {p.role}
                  </Text>
                </Space>
              </Card>
            ))}
          </div>
        </div>

        {/* Key inputs */}
        <div>
          <Text strong>{t("wcomp.aiApiKeys", "Khoá API (mã hoá khi lưu — không hiện lại)")}</Text>
          <Paragraph type="secondary" style={{ fontSize: 12.5, margin: "4px 0 10px" }}>
            {t("wcomp.aiKeysPre", "Dán key ở đây thay vì sửa")} <code>.env</code>.{" "}
            {t(
              "wcomp.aiKeysPost",
              "Để trống = giữ key hiện tại. Ưu tiên key đặt ở đây, nếu trống thì dùng biến môi trường.",
            )}
          </Paragraph>
          <Space direction="vertical" size={10} style={{ width: "100%", maxWidth: 560 }}>
            <div>
              <Text style={{ fontSize: 13 }}>Anthropic Claude — {keyHint(status?.keys.anthropic)}</Text>
              <Input.Password
                value={anthropicKey}
                onChange={(e) => setAnthropicKey(e.target.value)}
                placeholder={t("wcomp.aiAnthropicPlaceholder", "sk-ant-… (key chính; để trống = giữ key trong .env)")}
                autoComplete="off"
              />
            </div>
            <div>
              <Text style={{ fontSize: 13 }}>OpenAI — {keyHint(status?.keys.openai)}</Text>
              <Input.Password
                value={openaiKey}
                onChange={(e) => setOpenaiKey(e.target.value)}
                placeholder={t("wcomp.aiOpenaiPlaceholder", "sk-proj-… (KHÔNG dùng sk-admin)")}
                autoComplete="off"
              />
            </div>
            <div>
              <Text style={{ fontSize: 13 }}>xAI Grok — {keyHint(status?.keys.grok)}</Text>
              <Input.Password
                value={grokKey}
                onChange={(e) => setGrokKey(e.target.value)}
                placeholder={t("wcomp.aiGrokPlaceholder", "xai-… (API key, KHÔNG phải management token)")}
                autoComplete="off"
              />
            </div>
            <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => void save()}>
              {t("wcomp.aiSaveKey", "Lưu key")}
            </Button>
          </Space>
        </div>

        {/* How the keys are used */}
        <Alert
          type="info"
          showIcon
          message={t("wcomp.aiUsageTitle.lw", "Key dùng vào việc gì")}
          description={
            <div style={{ fontSize: 13 }}>
              {t(
                "wcomp.aiUsageDesc.lw",
                "Anthropic: trợ lý trợ giúp (dự phòng khi MAIC chưa cấu hình) và phân loại báo lỗi. OpenAI: tạo ảnh AI trong Trợ lý. Trợ lý AI chính chạy qua MAIC (Claude hosted) hoặc CLI trên máy người dùng — không dùng các key này.",
              )}
            </div>
          }
        />
      </Space>
    </Card>
  );
}
