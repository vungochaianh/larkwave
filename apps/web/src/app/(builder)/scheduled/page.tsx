"use client";

import {
  ClockCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { App, Button, Card, Empty, Form, Input, Modal, Select, Space, Switch, Tag, Typography } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import { V, useI18n } from "@larkwave/ui";
import { api, type ScheduledTask } from "@/lib/api";

const { Title, Text, Paragraph } = Typography;

type TFn = (key: string, fallback?: string, vars?: Record<string, string | number>) => string;

const WEEKDAYS = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
const WEEKDAY_KEYS = [
  "weekdaySun",
  "weekdayMon",
  "weekdayTue",
  "weekdayWed",
  "weekdayThu",
  "weekdayFri",
  "weekdaySat",
];
const weekdayLabel = (i: number, t: TFn) => t(`web.feat.${WEEKDAY_KEYS[i]}`, WEEKDAYS[i]);
const HOURS = Array.from({ length: 24 }, (_, h) => ({ value: h, label: String(h).padStart(2, "0") }));
const MINUTES = [0, 5, 10, 15, 30, 45].map((m) => ({ value: m, label: String(m).padStart(2, "0") }));

type Freq = "daily" | "weekdays" | "weekly" | "hourly";

/** Build a 5-field cron from the friendly picker. */
function buildCron(freq: Freq, hour: number, minute: number, weekday: number): string {
  if (freq === "hourly") return `${minute} * * * *`;
  if (freq === "weekdays") return `${minute} ${hour} * * 1-5`;
  if (freq === "weekly") return `${minute} ${hour} * * ${weekday}`;
  return `${minute} ${hour} * * *`; // daily
}

/** Human-readable label for a cron the picker produced (falls back to the raw expression). */
function describeCron(cron: string, t: TFn): string {
  const p = cron.trim().split(/\s+/);
  if (p.length !== 5) return cron;
  const [m, h, , , dow] = p;
  const hhmm = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  if (h === "*") return t("web.feat.cronHourly", "Mỗi giờ (phút {m})", { m: String(m).padStart(2, "0") });
  if (dow === "1-5") return t("web.feat.cronWeekdays", "Ngày thường (T2–T6) lúc {hhmm}", { hhmm });
  if (dow === "*") return t("web.feat.cronDaily", "Hằng ngày lúc {hhmm}", { hhmm });
  if (/^[0-6]$/.test(dow))
    return t("web.feat.cronWeekly", "{day} hằng tuần lúc {hhmm}", { day: weekdayLabel(Number(dow), t), hhmm });
  return `${cron}`;
}

function fmt(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

type Template = { key: string; name: string; prompt: string; freq: Freq; hour: number; minute: number; weekday: number };
const TEMPLATES: Template[] = [
  {
    key: "daily-brief",
    name: "Tóm tắt ngày mới",
    prompt: "Tổng hợp ngắn gọn những việc/chủ đề đáng chú ý hôm nay và gợi ý 3 việc nên ưu tiên.",
    freq: "weekdays",
    hour: 8,
    minute: 0,
    weekday: 1,
  },
  {
    key: "weekly-review",
    name: "Tổng kết tuần",
    prompt: "Tóm tắt những gì đã làm trong tuần theo 3 mục: thành quả, vướng mắc, việc tuần sau.",
    freq: "weekly",
    hour: 16,
    minute: 0,
    weekday: 5,
  },
  {
    key: "content-ideas",
    name: "Ý tưởng nội dung",
    prompt: "Đề xuất 5 ý tưởng bài đăng/nội dung mới cho tuần này, kèm 1 câu mô tả mỗi ý.",
    freq: "weekly",
    hour: 9,
    minute: 0,
    weekday: 1,
  },
  {
    key: "monitor-topic",
    name: "Theo dõi chủ đề",
    prompt: "Theo dõi và tóm tắt những điểm mới đáng chú ý về chủ đề: [điền chủ đề của bạn].",
    freq: "daily",
    hour: 9,
    minute: 0,
    weekday: 1,
  },
];

export default function ScheduledPage() {
  const { message, modal } = App.useApp();
  const { t } = useI18n();
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ScheduledTask | null>(null);
  const [saving, setSaving] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<ScheduledTask | null>(null);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setTasks(await api.listScheduledTasks());
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = (tpl?: Template) => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      name: tpl ? t(`web.feat.tplName_${tpl.key}`, tpl.name) : "",
      prompt: tpl ? t(`web.feat.tplPrompt_${tpl.key}`, tpl.prompt) : "",
      freq: tpl?.freq ?? "daily",
      hour: tpl?.hour ?? 8,
      minute: tpl?.minute ?? 0,
      weekday: tpl?.weekday ?? 1,
      enabled: true,
    });
    setOpen(true);
  };

  const openEdit = (t: ScheduledTask) => {
    setEditing(t);
    // Best-effort reverse of our cron into the picker.
    const p = t.cron.trim().split(/\s+/);
    let freq: Freq = "daily";
    let weekday = 1;
    const minute = Number(p[0]) || 0;
    const hour = p[1] === "*" ? 8 : Number(p[1]) || 8;
    if (p[1] === "*") freq = "hourly";
    else if (p[4] === "1-5") freq = "weekdays";
    else if (/^[0-6]$/.test(p[4])) {
      freq = "weekly";
      weekday = Number(p[4]);
    } else freq = "daily";
    form.resetFields();
    form.setFieldsValue({ name: t.name, prompt: t.prompt, freq, hour, minute, weekday, enabled: t.enabled });
    setOpen(true);
  };

  const submit = async () => {
    const v = await form.validateFields();
    const cron = buildCron(v.freq as Freq, Number(v.hour), Number(v.minute), Number(v.weekday));
    setSaving(true);
    try {
      if (editing) {
        await api.updateScheduledTask(editing.id, { name: v.name, prompt: v.prompt, cron, enabled: v.enabled });
        message.success(t("web.feat.savedTask", "Đã lưu tác vụ"));
      } else {
        await api.createScheduledTask({ name: v.name, prompt: v.prompt, cron, enabled: v.enabled });
        message.success(t("web.feat.createdTask", "Đã tạo tác vụ"));
      }
      setOpen(false);
      void load();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (t: ScheduledTask, enabled: boolean) => {
    try {
      const next = await api.updateScheduledTask(t.id, { enabled });
      setTasks((prev) => prev.map((x) => (x.id === t.id ? next : x)));
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const runNow = async (task: ScheduledTask) => {
    setRunningId(task.id);
    try {
      const next = await api.runScheduledTask(task.id);
      setTasks((prev) => prev.map((x) => (x.id === task.id ? next : x)));
      if (next.lastError) message.warning(t("web.feat.ranWithError", "Chạy xong nhưng có lỗi: {err}", { err: next.lastError }));
      else message.success(t("web.feat.ranOk", "Đã chạy — xem kết quả trong thẻ"));
      setViewing(next);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setRunningId(null);
    }
  };

  const remove = (task: ScheduledTask) => {
    modal.confirm({
      title: t("web.feat.deleteTaskTitle", "Xoá tác vụ này?"),
      content: t("web.feat.deleteTaskContent", "“{name}” sẽ bị xoá vĩnh viễn.", { name: task.name }),
      okText: t("web.feat.delete", "Xoá"),
      okButtonProps: { danger: true },
      cancelText: t("web.feat.cancel", "Huỷ"),
      onOk: async () => {
        try {
          await api.deleteScheduledTask(task.id);
          setTasks((prev) => prev.filter((x) => x.id !== task.id));
          message.success(t("web.feat.deleted", "Đã xoá"));
        } catch (e) {
          message.error((e as Error).message);
        }
      },
    });
  };

  const freqWatch = Form.useWatch("freq", form);

  const empty = !loading && tasks.length === 0;

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <Title level={3} style={{ margin: 0 }}>
            <ClockCircleOutlined style={{ color: "#6C5CE7", marginRight: 8 }} />
            {t("web.feat.title", "Tác vụ định kỳ")}
          </Title>
          <Text type="secondary">{t("web.feat.subtitle", "Để Trợ lý AI tự chạy theo lịch rồi gửi kết quả về Thông báo.")}</Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => load()} />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openCreate()}>
            {t("web.feat.newTask", "Tác vụ mới")}
          </Button>
        </Space>
      </div>

      {empty ? (
        <div style={{ padding: "40px 0" }}>
          <Empty description={t("web.feat.emptyDesc", "Chưa có tác vụ định kỳ nào.")} />
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
          {tasks.map((task) => (
            <Card key={task.id} styles={{ body: { padding: 16 } }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <Text strong style={{ fontSize: 15 }}>
                      {task.name}
                    </Text>
                    {task.lastError ? (
                      <Tag color="error">{t("web.feat.tagError", "Lỗi")}</Tag>
                    ) : task.runCount > 0 ? (
                      <Tag color="success">{t("web.feat.tagRan", "Đã chạy {count}×", { count: task.runCount })}</Tag>
                    ) : null}
                  </div>
                  <Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ margin: "4px 0 8px", fontSize: 13 }}>
                    {task.prompt}
                  </Paragraph>
                  <Space size="large" wrap style={{ fontSize: 12.5, color: V.textFaint }}>
                    <span>
                      <ClockCircleOutlined /> {describeCron(task.cron, t)}
                    </span>
                    <span>
                      {t("web.feat.nextRunLabel", "Lần tới:")} {task.enabled ? fmt(task.nextRunAt) : t("web.feat.disabled", "đang tắt")}
                    </span>
                    {task.lastRunAt && (
                      <span>
                        {t("web.feat.lastRunLabel", "Chạy gần nhất:")} {fmt(task.lastRunAt)}
                      </span>
                    )}
                  </Space>
                </div>
                <Space direction="vertical" align="end">
                  <Switch checked={task.enabled} onChange={(v) => void toggle(task, v)} />
                  <Space>
                    {(task.lastResult || task.lastError) && (
                      <Button size="small" onClick={() => setViewing(task)}>
                        {t("web.feat.result", "Kết quả")}
                      </Button>
                    )}
                    <Button
                      size="small"
                      icon={<PlayCircleOutlined />}
                      loading={runningId === task.id}
                      onClick={() => void runNow(task)}
                    >
                      {t("web.feat.run", "Chạy")}
                    </Button>
                    <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(task)} />
                    <Button size="small" danger icon={<DeleteOutlined />} onClick={() => remove(task)} />
                  </Space>
                </Space>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Templates */}
      <div style={{ marginTop: 28 }}>
        <Text type="secondary" style={{ fontSize: 13 }}>
          {t("web.feat.quickTemplates", "Mẫu nhanh — bấm để tạo:")}
        </Text>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10, marginTop: 8 }}>
          {TEMPLATES.map((tpl) => (
            <Card key={tpl.key} hoverable styles={{ body: { padding: 14 } }} onClick={() => openCreate(tpl)}>
              <Text strong>{t(`web.feat.tplName_${tpl.key}`, tpl.name)}</Text>
              <Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ margin: "4px 0 0", fontSize: 12.5 }}>
                {t(`web.feat.tplPrompt_${tpl.key}`, tpl.prompt)}
              </Paragraph>
            </Card>
          ))}
        </div>
      </div>

      {/* Create / edit modal */}
      <Modal
        title={editing ? t("web.feat.editTask", "Sửa tác vụ") : t("web.feat.newTask", "Tác vụ mới")}
        open={open}
        onOk={submit}
        confirmLoading={saving}
        onCancel={() => setOpen(false)}
        okText={editing ? t("web.feat.save", "Lưu") : t("web.feat.create", "Tạo")}
        cancelText={t("web.feat.cancel", "Huỷ")}
        destroyOnClose
      >
        <Form form={form} layout="vertical" requiredMark={false}>
          <Form.Item name="name" label={t("web.feat.nameLabel", "Tên tác vụ")} rules={[{ required: true, message: t("web.feat.enterName", "Nhập tên") }]}>
            <Input placeholder={t("web.feat.namePlaceholder", "vd: Tóm tắt ngày mới")} maxLength={120} />
          </Form.Item>
          <Form.Item name="prompt" label={t("web.feat.promptLabel", "Yêu cầu cho Trợ lý AI")} rules={[{ required: true, message: t("web.feat.enterPrompt", "Nhập yêu cầu") }]}>
            <Input.TextArea
              placeholder={t("web.feat.promptPlaceholder", "vd: Tổng hợp những việc đáng chú ý hôm nay và gợi ý 3 việc nên ưu tiên.")}
              autoSize={{ minRows: 3, maxRows: 8 }}
              maxLength={8000}
            />
          </Form.Item>
          <Form.Item label={t("web.feat.scheduleLabel", "Lịch chạy")} style={{ marginBottom: 8 }}>
            <Space wrap>
              <Form.Item name="freq" noStyle>
                <Select
                  style={{ width: 170 }}
                  options={[
                    { value: "daily", label: t("web.feat.freqDaily", "Hằng ngày") },
                    { value: "weekdays", label: t("web.feat.freqWeekdays", "Ngày thường (T2–T6)") },
                    { value: "weekly", label: t("web.feat.freqWeekly", "Hằng tuần") },
                    { value: "hourly", label: t("web.feat.freqHourly", "Mỗi giờ") },
                  ]}
                />
              </Form.Item>
              {freqWatch === "weekly" && (
                <Form.Item name="weekday" noStyle>
                  <Select style={{ width: 110 }} options={WEEKDAYS.map((w, i) => ({ value: i, label: weekdayLabel(i, t) }))} />
                </Form.Item>
              )}
              {freqWatch !== "hourly" && (
                <Form.Item name="hour" noStyle>
                  <Select style={{ width: 76 }} options={HOURS} />
                </Form.Item>
              )}
              <Form.Item name="minute" noStyle>
                <Select style={{ width: 76 }} options={MINUTES} />
              </Form.Item>
            </Space>
          </Form.Item>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {t("web.feat.tzNote", "Múi giờ Việt Nam (GMT+7). Kết quả sẽ hiện ở Thông báo và trong thẻ tác vụ.")}
          </Text>
          <Form.Item name="enabled" label={t("web.feat.enabledLabel", "Bật")} valuePropName="checked" style={{ marginTop: 12, marginBottom: 0 }}>
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      {/* Result viewer */}
      <Modal
        title={viewing?.name}
        open={!!viewing}
        onCancel={() => setViewing(null)}
        footer={<Button onClick={() => setViewing(null)}>{t("web.feat.close", "Đóng")}</Button>}
        width={720}
      >
        {viewing?.lastError && (
          <div style={{ marginBottom: 12 }}>
            <Tag color="error">{t("web.feat.tagError", "Lỗi")}</Tag> <Text type="danger">{viewing.lastError}</Text>
          </div>
        )}
        <div style={{ fontSize: 12.5, color: V.textFaint, marginBottom: 10 }}>
          {t("web.feat.lastRunLabel", "Chạy gần nhất:")} {fmt(viewing?.lastRunAt ?? null)}
        </div>
        <div
          style={{
            maxHeight: "60vh",
            overflow: "auto",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            fontSize: 14,
            lineHeight: 1.6,
            background: V.surfaceMuted,
            border: `1px solid ${V.border}`,
            borderRadius: 10,
            padding: 14,
          }}
        >
          {viewing?.lastResult || t("web.feat.noResult", "Chưa có kết quả.")}
        </div>
      </Modal>
    </div>
  );
}
