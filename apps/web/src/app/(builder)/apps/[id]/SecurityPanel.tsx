"use client";

import {
  DeleteOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  LockOutlined,
  PlusOutlined,
  SaveOutlined,
} from "@ant-design/icons";
import { App as AntApp, Alert, Button, Card, Input, Skeleton, Typography } from "antd";
import { useCallback, useEffect, useState } from "react";
import type { App as AppEntity } from "@larkwave/shared";
import { useI18n } from "@larkwave/ui";
import { api } from "@/lib/api";
import { CARD_SHADOW } from "@/lib/theme";

const { Text, Paragraph } = Typography;

type Row = { key: string; value: string };

export default function SecurityPanel({
  app,
  onChanged,
}: {
  app: AppEntity;
  onChanged?: () => void;
}) {
  const { message } = AntApp.useApp();
  const { t } = useI18n();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reveal, setReveal] = useState<Record<number, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getAppSecrets(app.id);
      setRows(res.secrets.length ? res.secrets : []);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [app.id, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const setRow = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, { key: "", value: "" }]);
  const delRow = (i: number) => setRows((rs) => rs.filter((_, idx) => idx !== i));

  const invalid = rows.some((r) => r.key.trim() && !/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(r.key.trim()));

  const save = async () => {
    if (invalid) {
      message.error(t("build.invalidVarName", "Tên biến không hợp lệ (chỉ chữ/số/_, bắt đầu bằng chữ hoặc _)."));
      return;
    }
    setSaving(true);
    try {
      const secrets = rows.filter((r) => r.key.trim()).map((r) => ({ key: r.key.trim(), value: r.value }));
      const res = await api.updateAppSecrets(app.id, secrets);
      setRows(res.secrets);
      message.success(t("build.secretsSaved", "Đã lưu secrets. Bấm “Triển khai lại” để nạp vào app."));
      onChanged?.();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const isFullstack = app.backendKind === "fullstack";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, width: "100%", maxWidth: 1040, margin: "0 auto" }}>
      <Paragraph type="secondary" style={{ margin: 0 }}>
        {t(
          "build.secretsIntroA",
          "Biến môi trường & secrets cho app. Được mã hoá khi lưu và nạp vào Cloudflare Pages khi deploy — backend (Functions) đọc qua",
        )}{" "}
        <Text code>env.TÊN_BIẾN</Text>.{" "}
        {t("build.secretsIntroB", "KHÔNG để lộ ra frontend.")}
      </Paragraph>

      {!isFullstack && (
        <Alert
          type="info"
          message={t(
            "build.secretsStaticNote",
            "App này hiện là tĩnh (chưa có backend). Secrets chỉ có tác dụng khi app có backend (Functions). Bạn vẫn có thể đặt trước để dùng khi nâng cấp full-stack.",
          )}
          banner
        />
      )}

      <Card style={{ boxShadow: CARD_SHADOW, borderRadius: 14 }} styles={{ body: { padding: 16 } }}>
        {loading ? (
          <Skeleton active paragraph={{ rows: 3 }} />
        ) : rows.length === 0 ? (
          <div style={{ textAlign: "center", padding: "12px 0" }}>
            <LockOutlined style={{ fontSize: 26, color: "#9AA3B5" }} />
            <Paragraph type="secondary" style={{ margin: "8px 0 14px" }}>
              {t("build.noSecrets", "Chưa có secret nào. Thêm biến môi trường đầu tiên.")}
            </Paragraph>
            <Button icon={<PlusOutlined />} onClick={addRow}>
              {t("build.addVar", "Thêm biến")}
            </Button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {rows.map((r, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Input
                  placeholder={t("build.varNamePlaceholder", "TÊN_BIẾN")}
                  value={r.key}
                  onChange={(e) => setRow(i, { key: e.target.value })}
                  style={{ flex: "0 0 38%", fontFamily: "monospace" }}
                  status={r.key.trim() && !/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(r.key.trim()) ? "error" : undefined}
                  autoComplete="off"
                  data-1p-ignore=""
                  data-lpignore="true"
                  data-form-type="other"
                />
                <Input
                  placeholder={t("build.valuePlaceholder", "giá trị")}
                  type={reveal[i] ? "text" : "password"}
                  value={r.value}
                  onChange={(e) => setRow(i, { value: e.target.value })}
                  style={{ flex: 1 }}
                  autoComplete="off"
                  data-1p-ignore=""
                  data-lpignore="true"
                  data-form-type="other"
                  suffix={
                    <span
                      style={{ cursor: "pointer", color: "#9AA3B5" }}
                      onClick={() => setReveal((s) => ({ ...s, [i]: !s[i] }))}
                    >
                      {reveal[i] ? <EyeInvisibleOutlined /> : <EyeOutlined />}
                    </span>
                  }
                />
                <Button type="text" danger icon={<DeleteOutlined />} onClick={() => delRow(i)} />
              </div>
            ))}
            <div>
              <Button icon={<PlusOutlined />} onClick={addRow} type="dashed" block>
                {t("build.addVar", "Thêm biến")}
              </Button>
            </div>
          </div>
        )}
      </Card>

      <div>
        <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={save} disabled={loading}>
          {t("build.saveSecrets", "Lưu secrets")}
        </Button>
      </div>
    </div>
  );
}
