"use client";

import {
  ClockCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import {
  App as AntApp,
  Alert,
  Button,
  Card,
  Empty,
  Input,
  Modal,
  Select,
  Skeleton,
  Switch,
  Tag,
  Typography,
} from "antd";
import { useCallback, useEffect, useState } from "react";
import type { App as AppEntity, Automation, UpsertAutomationRequest } from "@larkwave/shared";
import { useI18n } from "@larkwave/ui";
import { api } from "@/lib/api";
import { CARD_SHADOW } from "@/lib/theme";
import { fromNow } from "@/lib/format";

const { Text, Paragraph } = Typography;

type TFn = (key: string, fallback?: string) => string;

const INTERVALS: { value: number; key: string; vi: string }[] = [
  { value: 15, key: "build.every15m", vi: "Mỗi 15 phút" },
  { value: 60, key: "build.everyHour", vi: "Mỗi giờ" },
  { value: 360, key: "build.every6h", vi: "Mỗi 6 giờ" },
  { value: 1440, key: "build.daily", vi: "Hàng ngày" },
  { value: 10080, key: "build.weekly", vi: "Hàng tuần" },
];
const intervalLabel = (m: number, t: TFn) => {
  const found = INTERVALS.find((i) => i.value === m);
  return found ? t(found.key, found.vi) : `${t("build.everyPrefix", "Mỗi")} ${m} ${t("build.minutesUnit", "phút")}`;
};

function statusTag(a: Automation, t: TFn) {
  if (!a.lastRunAt)
    return (
      <Tag bordered={false} color="default">
        {t("build.notRun", "Chưa chạy")}
      </Tag>
    );
  if (a.lastStatus >= 200 && a.lastStatus < 400)
    return (
      <Tag bordered={false} color="success">
        OK {a.lastStatus}
      </Tag>
    );
  return (
    <Tag bordered={false} color="error">
      {a.lastStatus || t("build.error", "Lỗi")}
    </Tag>
  );
}

export default function AutomationsPanel({ app }: { app: AppEntity }) {
  const { message, modal } = AntApp.useApp();
  const { t } = useI18n();
  const [items, setItems] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Automation | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await api.listAutomations(app.id));
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [app.id, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (a: Automation, enabled: boolean) => {
    try {
      await api.updateAutomation(app.id, a.id, { ...toDto(a), enabled });
      setItems((xs) => xs.map((x) => (x.id === a.id ? { ...x, enabled } : x)));
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const runNow = async (a: Automation) => {
    setBusy(a.id);
    try {
      const updated = await api.runAutomation(app.id, a.id);
      setItems((xs) => xs.map((x) => (x.id === a.id ? updated : x)));
      message.success(`${t("build.ran", "Đã chạy")} "${a.name}" → ${updated.lastStatus || updated.lastError || "?"}`);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const del = (a: Automation) =>
    modal.confirm({
      title: t("build.deleteTask", "Xoá tác vụ"),
      content: `${t("build.delete", "Xoá")} "${a.name}"?`,
      okText: t("build.delete", "Xoá"),
      okButtonProps: { danger: true },
      cancelText: t("build.cancel", "Huỷ"),
      onOk: async () => {
        await api.deleteAutomation(app.id, a.id);
        setItems((xs) => xs.filter((x) => x.id !== a.id));
      },
    });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, width: "100%", maxWidth: 1120, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Paragraph type="secondary" style={{ margin: 0, flex: 1, minWidth: 240 }}>
          {t(
            "build.automationsIntroA",
            "Tác vụ định kỳ — hệ thống tự gọi một đường dẫn trên chính app của bạn theo lịch (vd",
          )}
          <Text code>/api/cron/...</Text>
          {t("build.automationsIntroB", "). Lý tưởng cho gửi báo cáo, dọn dữ liệu, đồng bộ…")}
        </Paragraph>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
          {t("build.addTask", "Thêm tác vụ")}
        </Button>
      </div>

      {!app.currentUrl && (
        <Alert
          banner
          type="info"
          message={t(
            "build.automationNotDeployed",
            "App chưa được deploy — tác vụ sẽ chỉ chạy sau khi app có URL công khai.",
          )}
        />
      )}

      {loading ? (
        <Card style={{ boxShadow: CARD_SHADOW, borderRadius: 14 }}>
          <Skeleton active paragraph={{ rows: 3 }} />
        </Card>
      ) : items.length === 0 ? (
        <Card style={{ boxShadow: CARD_SHADOW, borderRadius: 14 }}>
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("build.noTasks", "Chưa có tác vụ nào.")}>
            <Button icon={<PlusOutlined />} onClick={() => setCreating(true)}>
              {t("build.createFirstTask", "Tạo tác vụ đầu tiên")}
            </Button>
          </Empty>
        </Card>
      ) : (
        items.map((a) => (
          <Card key={a.id} style={{ boxShadow: CARD_SHADOW, borderRadius: 14 }} styles={{ body: { padding: 16 } }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <Text strong>{a.name}</Text>
                  {statusTag(a, t)}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                  <Tag bordered={false} icon={<ClockCircleOutlined />} color="purple">
                    {intervalLabel(a.intervalMinutes, t)}
                  </Tag>
                  <Text code style={{ fontSize: 12 }}>
                    {a.method} {a.path}
                  </Text>
                </div>
                <Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: 6 }}>
                  {a.lastRunAt ? `${t("build.lastRun", "Chạy lần cuối")} ${fromNow(a.lastRunAt)}` : t("build.notRun", "Chưa chạy")}
                  {a.lastError ? ` · ${a.lastError}` : ""}
                </Text>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <Switch size="small" checked={a.enabled} onChange={(v) => void toggle(a, v)} />
                <Button
                  type="text"
                  size="small"
                  icon={<PlayCircleOutlined />}
                  loading={busy === a.id}
                  onClick={() => void runNow(a)}
                  title={t("build.runNow", "Chạy ngay")}
                />
                <Button type="text" size="small" icon={<EditOutlined />} onClick={() => setEditing(a)} title={t("build.edit", "Sửa")} />
                <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => del(a)} title={t("build.delete", "Xoá")} />
              </div>
            </div>
          </Card>
        ))
      )}

      {(creating || editing) && (
        <AutomationModal
          appId={app.id}
          initial={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={(saved) => {
            setItems((xs) => {
              const idx = xs.findIndex((x) => x.id === saved.id);
              return idx >= 0 ? xs.map((x) => (x.id === saved.id ? saved : x)) : [...xs, saved];
            });
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

/** Strip an Automation to the upsert payload (for toggle updates). */
function toDto(a: Automation): UpsertAutomationRequest {
  return {
    name: a.name,
    enabled: a.enabled,
    intervalMinutes: a.intervalMinutes,
    method: a.method,
    path: a.path,
    body: a.body,
  };
}

function AutomationModal({
  appId,
  initial,
  onClose,
  onSaved,
}: {
  appId: string;
  initial: Automation | null;
  onClose: () => void;
  onSaved: (a: Automation) => void;
}) {
  const { message } = AntApp.useApp();
  const { t } = useI18n();
  const intervalOptions = INTERVALS.map((i) => ({ value: i.value, label: t(i.key, i.vi) }));
  const [name, setName] = useState(initial?.name ?? "");
  const [intervalMinutes, setInterval] = useState(initial?.intervalMinutes ?? 1440);
  const [method, setMethod] = useState(initial?.method ?? "GET");
  const [path, setPath] = useState(initial?.path ?? "/");
  const [body, setBody] = useState(initial?.body ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) {
      message.warning(t("build.enterTaskName", "Nhập tên tác vụ."));
      return;
    }
    setSaving(true);
    try {
      const payload: UpsertAutomationRequest = {
        name: name.trim(),
        intervalMinutes,
        method,
        path: path.trim() || "/",
        body: method === "GET" ? null : body.trim() || null,
      };
      const saved = initial
        ? await api.updateAutomation(appId, initial.id, { ...payload, enabled: initial.enabled })
        : await api.createAutomation(appId, payload);
      onSaved(saved);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title={
        <span>
          <ThunderboltOutlined style={{ color: "#6C5CE7", marginInlineEnd: 8 }} />
          {initial ? t("build.editTask", "Sửa tác vụ") : t("build.newTask", "Tác vụ mới")}
        </span>
      }
      onCancel={onClose}
      onOk={() => void save()}
      okText={t("build.save", "Lưu")}
      cancelText={t("build.cancel", "Huỷ")}
      confirmLoading={saving}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
        <div>
          <Text strong style={{ fontSize: 13 }}>{t("build.name", "Tên")}</Text>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("build.taskNamePlaceholder", "vd: Gửi báo cáo ngày")} maxLength={80} />
        </div>
        <div>
          <Text strong style={{ fontSize: 13 }}>{t("build.schedule", "Lịch chạy")}</Text>
          <Select
            value={intervalMinutes}
            onChange={setInterval}
            options={intervalOptions}
            style={{ width: "100%" }}
          />
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: "0 0 120px" }}>
            <Text strong style={{ fontSize: 13 }}>Method</Text>
            <Select
              value={method}
              onChange={setMethod}
              style={{ width: "100%" }}
              options={["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => ({ value: m, label: m }))}
            />
          </div>
          <div style={{ flex: 1 }}>
            <Text strong style={{ fontSize: 13 }}>{t("build.pathLabel", "Đường dẫn (trên app của bạn)")}</Text>
            <Input value={path} onChange={(e) => setPath(e.target.value)} placeholder="/api/cron/digest" addonBefore="…app-url" />
          </div>
        </div>
        {method !== "GET" && (
          <div>
            <Text strong style={{ fontSize: 13 }}>{t("build.bodyLabel", "Body (JSON, tuỳ chọn)")}</Text>
            <Input.TextArea value={body} onChange={(e) => setBody(e.target.value)} autoSize={{ minRows: 2, maxRows: 5 }} placeholder='{"key":"value"}' />
          </div>
        )}
      </div>
    </Modal>
  );
}
