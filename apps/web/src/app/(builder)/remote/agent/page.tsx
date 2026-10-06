"use client";

import { CheckCircleFilled, CloseCircleOutlined, DeleteOutlined, DesktopOutlined, EditOutlined, LoadingOutlined, MoreOutlined, PlusOutlined, SendOutlined, StopOutlined, ThunderboltOutlined, UserOutlined } from "@ant-design/icons";
import { Alert, App, Avatar, Button, Dropdown, Empty, Grid, Input, Modal, Select, Spin, Tag, Tooltip, Typography } from "antd";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RUNNER_CATALOG, type AgentConversation, type AgentDevice, type RemoteTask, type RemoteTaskEventItem, type RemoteTaskStatus, type RunnerId } from "@larkwave/shared";
import { useI18n } from "@larkwave/ui";
import { api, streamRemoteTasks } from "@/lib/api";
import { fromNow } from "@/lib/format";
import { BRAND_GRADIENT, CARD_SHADOW } from "@/lib/theme";

/** Shape of the translate fn from useI18n (kept local so module-scope helpers can accept it). */
type TFn = (key: string, fallback?: string, vars?: Record<string, string | number>) => string;

const { Text, Title } = Typography;

// Rank for picking the most-advanced status when a stale refetch races a live
// stream event (so a 'done' from the stream is never regressed to 'running').
const STATUS_RANK: Record<RemoteTaskStatus, number> = {
  queued: 0,
  running: 1,
  done: 2,
  error: 2,
  canceled: 2,
};
function moreAdvancedStatus(a: RemoteTaskStatus, b: RemoteTaskStatus): RemoteTaskStatus {
  return (STATUS_RANK[a] ?? 0) > (STATUS_RANK[b] ?? 0) ? a : b;
}
/** Union of two event lists by id, preserving order (server first, then any
 *  locally-streamed events the list endpoint omitted). */
function mergeEvents(
  local: RemoteTaskEventItem[] | undefined,
  srv: RemoteTaskEventItem[] | undefined,
): RemoteTaskEventItem[] | undefined {
  const out = [...(srv ?? [])];
  const ids = new Set(out.map((e) => e.id));
  for (const e of local ?? []) if (!ids.has(e.id)) out.push(e);
  return out.length ? out : undefined;
}

// ── Status presentation ──────────────────────────────────────────────────────
const STATUS_META: Record<
  RemoteTaskStatus,
  { labelKey: string; label: string; color: string }
> = {
  queued: { labelKey: "remote.status.queued", label: "Đang chờ", color: "default" },
  running: { labelKey: "remote.status.running", label: "Đang chạy", color: "processing" },
  done: { labelKey: "remote.status.done", label: "Hoàn tất", color: "success" },
  error: { labelKey: "remote.status.error", label: "Lỗi", color: "error" },
  canceled: { labelKey: "remote.status.canceled", label: "Đã huỷ", color: "warning" },
};

const TERMINAL: RemoteTaskStatus[] = ["done", "error", "canceled"];

/** Best-effort human text from a streamed event payload (BuildEvent-shaped). */
function eventText(ev: RemoteTaskEventItem, t: TFn): string {
  const p = ev.payload ?? {};
  const pick = (...keys: string[]): string | null => {
    for (const k of keys) {
      const v = (p as Record<string, unknown>)[k];
      if (typeof v === "string" && v.trim()) return v;
    }
    return null;
  };
  if (ev.kind === "stage") {
    const name = pick("name", "stage", "label", "title");
    const status = pick("status");
    return name ? (status ? `${name} · ${status}` : name) : t("remote.agent.stage", "Giai đoạn");
  }
  if (ev.kind === "progress") {
    const msg = pick("message", "text", "label");
    const pct = (p as Record<string, unknown>).progress;
    if (typeof pct === "number") return msg ? `${msg} (${pct}%)` : `${pct}%`;
    return msg ?? t("remote.agent.progress", "Tiến độ");
  }
  return (
    pick("message", "text", "line", "log", "detail", "status") ??
    JSON.stringify(p)
  );
}

export default function AgentPage() {
  const { t } = useI18n();
  const { message, modal } = App.useApp();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;

  // Catalog-driven runner + model pickers.
  const [runner, setRunner] = useState<RunnerId>(RUNNER_CATALOG[0].id);
  const runnerEntry = useMemo(
    () => RUNNER_CATALOG.find((r) => r.id === runner) ?? RUNNER_CATALOG[0],
    [runner],
  );
  const [model, setModel] = useState<string>(RUNNER_CATALOG[0].models[0].id);

  // Keep model valid whenever the runner changes.
  useEffect(() => {
    if (!runnerEntry.models.some((m) => m.id === model)) {
      setModel(runnerEntry.models[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runner]);

  // Devices.
  const [devices, setDevices] = useState<AgentDevice[]>([]);
  const [deviceId, setDeviceId] = useState<string | undefined>(undefined);

  // Tasks (thread) + per-task expand state + replayed full events.
  const [tasks, setTasks] = useState<RemoteTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const [prompt, setPrompt] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Named conversations (top selector). activeConvId undefined = "Tất cả".
  const [conversations, setConversations] = useState<AgentConversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | undefined>(undefined);
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);

  // ── Initial load: tasks + devices ──────────────────────────────────────────
  const loadTasks = useCallback(async () => {
    try {
      const t = await api.listRemoteTasks(activeConvId);
      // Server returns newest-first; render oldest→newest like a chat thread.
      const fresh = [...t].reverse();
      setTasks((prev) => {
        if (!prev.length) return fresh;
        // MERGE — a refetch (triggered by a stream event for an unknown task) must
        // not wipe events/status that arrived live on OTHER in-progress tasks.
        const prevById = new Map(prev.map((p) => [p.id, p]));
        const merged = fresh.map((srv) => {
          const local = prevById.get(srv.id);
          if (!local) return srv;
          return {
            ...srv,
            events: mergeEvents(local.events, srv.events),
            status: moreAdvancedStatus(local.status, srv.status),
            result: srv.result ?? local.result,
            error: srv.error ?? local.error,
          };
        });
        // Keep prev rows the server list doesn't have yet (optimistic / just-created).
        const freshIds = new Set(fresh.map((f) => f.id));
        const extras = prev.filter((p) => !freshIds.has(p.id));
        return [...merged, ...extras];
      });
    } catch {
      /* non-fatal */
    } finally {
      setLoading(false);
    }
  }, [activeConvId]);

  const loadDevices = useCallback(async () => {
    try {
      const d = await api.listDevices();
      setDevices(d);
      // Default to the first online device (else leave unset → server auto-picks).
      setDeviceId((prev) => prev ?? d.find((x) => x.online)?.id);
    } catch {
      /* non-fatal */
    }
  }, []);

  const loadConversations = useCallback(async () => {
    try {
      setConversations(await api.listConversations());
    } catch {
      /* non-fatal */
    }
  }, []);

  // Reload the thread whenever the active conversation changes (and on mount).
  useEffect(() => {
    setTasks([]);
    setLoading(true);
    void loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    void loadDevices();
    void loadConversations();
    // Re-poll devices so a desktop that connects AFTER the page opened shows up without a refresh.
    const t = setInterval(() => {
      void loadDevices();
    }, 20000);
    return () => clearInterval(t);
  }, [loadDevices, loadConversations]);

  // ── Live progress: append events / flip status on the matching task ─────────
  useEffect(() => {
    const stop = streamRemoteTasks((ev) => {
      setTasks((prev) => {
        const idx = prev.findIndex((x) => x.id === ev.taskId);
        if (idx === -1) {
          // A task we don't have yet (e.g. created on another device) — refetch.
          void loadTasks();
          return prev;
        }
        const next = [...prev];
        const cur = next[idx];
        const events = ev.event
          ? cur.events?.some((e) => e.id === ev.event!.id)
            ? cur.events
            : [...(cur.events ?? []), ev.event]
          : cur.events;
        next[idx] = {
          ...cur,
          status: ev.status,
          events,
          ...(ev.result !== undefined ? { result: ev.result } : {}),
          ...(ev.error !== undefined ? { error: ev.error } : {}),
        };
        return next;
      });
    });
    return () => stop();
  }, [loadTasks]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [tasks]);

  // ── Expand a task → fetch its full event history for replay ─────────────────
  const toggleExpand = useCallback(
    async (id: string) => {
      const willOpen = !expanded[id];
      setExpanded((e) => ({ ...e, [id]: willOpen }));
      if (!willOpen) return;
      try {
        const full = await api.remoteTask(id);
        setTasks((prev) =>
          prev.map((t) => (t.id === id ? { ...t, ...full } : t)),
        );
      } catch {
        /* keep partial */
      }
    },
    [expanded],
  );

  const onlineCount = devices.filter((d) => d.online).length;

  const shownTasks = tasks;

  // ── Send a task ─────────────────────────────────────────────────────────────
  const send = useCallback(async () => {
    const text = prompt.trim();
    if (!text || sending) return;
    setSending(true);
    // Optimistic user bubble.
    const tempId = `tmp-${Date.now()}`;
    const optimistic: RemoteTask = {
      id: tempId,
      deviceId: deviceId ?? null,
      runner,
      model,
      prompt: text,
      status: "queued",
      result: null,
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      startedAt: null,
      finishedAt: null,
      events: [],
      conversationId: activeConvId ?? null,
    };
    setTasks((prev) => [...prev, optimistic]);
    setPrompt("");
    try {
      const res = await api.createRemoteTask({
        prompt: text,
        runner,
        model,
        ...(deviceId ? { deviceId } : {}),
        ...(activeConvId ? { conversationId: activeConvId } : {}),
      });
      // Replace the optimistic row with the server task.
      setTasks((prev) =>
        prev.map((t) => (t.id === tempId ? res.task : t)),
      );
      void loadConversations(); // refresh order / task counts
      if (!res.deviceOnline) {
        message.warning(
          t(
            "remote.agent.offlineWarn",
            "Máy tính của bạn đang offline — lệnh đã được xếp hàng và sẽ chạy khi máy kết nối.",
          ),
        );
      }
    } catch (e) {
      // Roll back the optimistic bubble on failure.
      setTasks((prev) => prev.filter((t) => t.id !== tempId));
      setPrompt(text);
      message.error((e as Error).message);
    } finally {
      setSending(false);
    }
  }, [prompt, sending, deviceId, runner, model, message, activeConvId, loadConversations, t]);

  // ── Conversation actions ─────────────────────────────────────────────────────
  const newConversation = useCallback(async () => {
    try {
      const c = await api.createConversation();
      setConversations((prev) => [c, ...prev]);
      setActiveConvId(c.id);
    } catch (e) {
      message.error((e as Error).message);
    }
  }, [message]);
  const renameConv = useCallback(
    async (id: string, title: string) => {
      try {
        const c = await api.renameConversation(id, title);
        setConversations((prev) => prev.map((x) => (x.id === id ? c : x)));
      } catch (e) {
        message.error((e as Error).message);
      }
    },
    [message],
  );
  const deleteConv = useCallback(
    async (id: string) => {
      try {
        await api.deleteConversation(id);
        setConversations((prev) => prev.filter((x) => x.id !== id));
        setActiveConvId((cur) => (cur === id ? undefined : cur));
      } catch (e) {
        message.error((e as Error).message);
      }
    },
    [message],
  );

  return (
    <div
      style={{
        maxWidth: 880,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        height: "calc(100vh - 60px - 84px)",
        minHeight: 420,
      }}
    >
      {/* Header + conversation selector (single column — the app's main nav is the only rail) */}
      <div style={{ marginBottom: 12 }}>
        <Title level={4} style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 22 }}>🖥</span> {t("remote.agent.title", "Máy của tôi")}
        </Title>
        <Text type="secondary" style={{ fontSize: 13, display: "block", marginTop: 2, marginBottom: 10 }}>
          {t(
            "remote.agent.subtitle.lw",
            "Gửi câu hỏi/yêu cầu — máy đã đăng nhập của bạn chạy Trợ lý AI cục bộ (chỉ đọc) và trả kết quả về đây.",
          )}
        </Text>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <Select<string>
            value={activeConvId ?? "__all__"}
            onChange={(v) => setActiveConvId(v === "__all__" ? undefined : v)}
            style={{
              minWidth: isMobile ? 0 : 220,
              flex: isMobile ? "1 1 100%" : "1 1 220px",
              maxWidth: isMobile ? "100%" : 380,
            }}
            options={[
              { value: "__all__", label: `🗂 ${t("remote.agent.allTasks", "Tất cả tác vụ")}` },
              ...conversations.map((c) => ({
                value: c.id,
                label: `💬 ${c.title}${typeof c.taskCount === "number" && c.taskCount ? ` (${c.taskCount})` : ""}`,
              })),
            ]}
          />
          <Tooltip title={t("remote.agent.newConvTooltip", "Tạo hội thoại mới")}>
            <Button icon={<PlusOutlined />} onClick={() => void newConversation()}>
              {t("remote.agent.new", "Mới")}
            </Button>
          </Tooltip>
          {activeConvId && (
            <Dropdown
              trigger={["click"]}
              menu={{
                items: [
                  {
                    key: "rename",
                    label: t("remote.agent.rename", "Đổi tên"),
                    icon: <EditOutlined />,
                    onClick: () => {
                      const c = conversations.find((x) => x.id === activeConvId);
                      if (c) setRenaming({ id: c.id, title: c.title });
                    },
                  },
                  {
                    key: "delete",
                    label: t("remote.agent.deleteConv", "Xoá hội thoại"),
                    icon: <DeleteOutlined />,
                    danger: true,
                    onClick: () =>
                      modal.confirm({
                        title: t("remote.agent.deleteConvConfirm", "Xoá hội thoại này?"),
                        content: t(
                          "remote.agent.deleteConvContent",
                          "Các tác vụ bên trong không mất — chúng chuyển về “Tất cả tác vụ”.",
                        ),
                        okText: t("remote.agent.delete", "Xoá"),
                        okButtonProps: { danger: true },
                        cancelText: t("remote.common.cancel", "Huỷ"),
                        onOk: () => deleteConv(activeConvId),
                      }),
                  },
                ],
              }}
            >
              <Button icon={<MoreOutlined />} />
            </Dropdown>
          )}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          marginBottom: 12,
        }}
      >
        {/* Device picker */}
        <Select<string>
          value={deviceId}
          onChange={setDeviceId}
          placeholder={t("remote.agent.pickDevice", "Tự chọn máy")}
          style={{ minWidth: isMobile ? 0 : 180, flex: isMobile ? "1 1 100%" : "1 1 180px" }}
          suffixIcon={<DesktopOutlined />}
          notFoundContent={t("remote.agent.noDevice", "Chưa có máy nào")}
          allowClear
          options={devices.map((d) => ({
            value: d.id,
            label: (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: d.online ? "#16B98D" : "#C0C5D2",
                    display: "inline-block",
                    flexShrink: 0,
                  }}
                />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                  {d.name || d.platform}
                </span>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {d.online ? "online" : fromNow(d.lastSeenAt)}
                </Text>
              </span>
            ),
          }))}
        />
        {/* Runner (provider) picker */}
        <Select<RunnerId>
          value={runner}
          onChange={setRunner}
          style={{ minWidth: isMobile ? 0 : 150, flex: isMobile ? "1 1 46%" : "1 1 150px" }}
          options={RUNNER_CATALOG.map((r) => ({ value: r.id, label: r.label }))}
        />
        {/* Model picker (within the chosen runner) */}
        <Select<string>
          value={model}
          onChange={setModel}
          style={{ minWidth: isMobile ? 0 : 150, flex: isMobile ? "1 1 46%" : "1 1 150px" }}
          options={runnerEntry.models.map((m) => ({ value: m.id, label: m.label }))}
        />
      </div>

      {/* Offline hint */}
      {devices.length > 0 && onlineCount === 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message={t("remote.agent.noOnlineTitle", "Không có máy nào đang online")}
          description={t(
            "remote.agent.noOnlineDesc",
            "Hãy mở app Larkwave trên máy tính và bật 'Điều khiển từ xa'. Lệnh bạn gửi sẽ được xếp hàng và chạy khi máy kết nối.",
          )}
        />
      )}
      {!loading && devices.length === 0 && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message={t("remote.agent.noDeviceTitle", "Chưa có máy nào được kết nối")}
          description={
            <span style={{ fontSize: 12.5 }}>
              {t("remote.agent.noDeviceDesc1a", "Cài và đăng nhập app Larkwave trên máy tính, bật ")}
              <b>{t("nav.remote", "Điều khiển từ xa")}</b>
              {t("remote.agent.noDeviceDesc1b", " để máy hiện ra ở đây.")}
              <br />
              <b>{t("remote.agent.noDeviceDesc2.lw", "Nếu trên máy đã bật mà đây vẫn trống:")}</b>
              {t("remote.agent.noDeviceDesc3", " gần như chắc chắn bạn đang đăng nhập trang này bằng ")}
              <b>{t("remote.agent.noDeviceDesc4", "tài khoản khác")}</b>
              {t("remote.agent.noDeviceDesc5", " với tài khoản trên máy. Relay tách theo tài khoản — hãy đăng nhập ")}
              <b>{t("remote.agent.noDeviceDesc6", "đúng tài khoản như trên máy")}</b>
              {t("remote.agent.noDeviceDesc7.lw", " (xem email ở mục Cài đặt → Điều khiển từ xa trên máy).")}
            </span>
          }
        />
      )}

      {/* Thread */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          background: "#F7F8FC",
          border: "1px solid #ECEDF3",
          borderRadius: 14,
          padding: isMobile ? 12 : 16,
        }}
      >
        {loading ? (
          <Spin style={{ display: "block", margin: "40px auto" }} />
        ) : shownTasks.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              t("remote.agent.empty", "Chưa có lệnh nào. Gửi yêu cầu đầu tiên ở dưới.")
            }
            style={{ marginTop: 40 }}
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {shownTasks.map((t) => (
              <TaskTurn
                key={t.id}
                task={t}
                expanded={!!expanded[t.id]}
                onToggle={() => void toggleExpand(t.id)}
              />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Composer */}
      <div
        style={{
          marginTop: 12,
          display: "flex",
          gap: 8,
          alignItems: "flex-end",
        }}
      >
        <Input.TextArea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={t("remote.agent.composerPlaceholder.lw", "Ví dụ: Tóm tắt các file trong thư mục Báo cáo tuần này…")}
          autoSize={{ minRows: 1, maxRows: 5 }}
          style={{ flex: 1 }}
          onPressEnter={(e) => {
            if (!e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <Button
          type="primary"
          icon={<SendOutlined />}
          loading={sending}
          onClick={() => void send()}
          style={{ height: 40 }}
        >
          <span className="hidden sm:inline">{t("remote.agent.send", "Gửi")}</span>
        </Button>
      </div>

      {/* Rename conversation */}
      <Modal
        open={!!renaming}
        title={t("remote.agent.renameConvTitle", "Đổi tên hội thoại")}
        okText={t("remote.common.save", "Lưu")}
        cancelText={t("remote.common.cancel", "Huỷ")}
        onCancel={() => setRenaming(null)}
        onOk={() => {
          if (renaming && renaming.title.trim()) {
            void renameConv(renaming.id, renaming.title.trim());
            setRenaming(null);
          }
        }}
      >
        <Input
          value={renaming?.title ?? ""}
          onChange={(e) => setRenaming((r) => (r ? { ...r, title: e.target.value } : r))}
          onPressEnter={() => {
            if (renaming && renaming.title.trim()) {
              void renameConv(renaming.id, renaming.title.trim());
              setRenaming(null);
            }
          }}
          maxLength={80}
          autoFocus
        />
      </Modal>
    </div>
  );
}

/** One remote task rendered as a chat exchange: prompt bubble + agent response. */
function TaskTurn({
  task,
  expanded,
  onToggle,
}: {
  task: RemoteTask;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { t } = useI18n();
  const meta = STATUS_META[task.status];
  const running = task.status === "running" || task.status === "queued";
  const events = task.events ?? [];
  // Collapsed: show the last few events; expanded: the full replayed history.
  const shown = expanded ? events : events.slice(-4);
  const runnerLabel =
    RUNNER_CATALOG.find((r) => r.id === task.runner)?.label ?? task.runner;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {/* User prompt bubble */}
      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "flex-start",
          flexDirection: "row-reverse",
        }}
      >
        <Avatar
          size={30}
          icon={<UserOutlined />}
          style={{ background: "#EEF0FB", color: "#6C5CE7", flexShrink: 0 }}
        />
        <div style={{ maxWidth: "88%" }}>
          <div
            style={{
              background:
                "linear-gradient(135deg, rgba(108,92,231,0.12), rgba(166,107,255,0.10))",
              border: "1px solid rgba(108,92,231,0.20)",
              borderRadius: "14px 4px 14px 14px",
              padding: "10px 14px",
              color: "#1E2230",
              fontSize: 14,
              lineHeight: 1.55,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {task.prompt}
          </div>
          <div
            style={{
              display: "flex",
              gap: 6,
              flexWrap: "wrap",
              justifyContent: "flex-end",
              marginTop: 6,
            }}
          >
            <Tag bordered={false} style={{ margin: 0, background: "#F1F2F7", color: "#6B7280" }}>
              {runnerLabel}
              {task.model ? ` · ${task.model}` : ""}
            </Tag>
            {task.device?.name && (
              <Tag
                bordered={false}
                style={{ margin: 0, background: "#F1F2F7", color: "#6B7280" }}
              >
                <DesktopOutlined /> {task.device.name}
              </Tag>
            )}
          </div>
        </div>
      </div>

      {/* Agent response bubble */}
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <Avatar
          size={30}
          icon={running ? <LoadingOutlined /> : <ThunderboltOutlined />}
          style={{ background: BRAND_GRADIENT, color: "#fff", flexShrink: 0 }}
        />
        <div
          style={{
            maxWidth: "88%",
            flex: 1,
            background: "#FFFFFF",
            border: "1px solid #ECEDF3",
            borderRadius: "4px 14px 14px 14px",
            boxShadow: CARD_SHADOW,
            padding: "10px 14px",
            fontSize: 13.5,
            lineHeight: 1.55,
          }}
        >
          {/* Status chip */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
              marginBottom: events.length || task.result || task.error ? 8 : 0,
            }}
          >
            <Tag
              color={meta.color}
              icon={
                task.status === "done" ? (
                  <CheckCircleFilled />
                ) : task.status === "error" ? (
                  <CloseCircleOutlined />
                ) : task.status === "canceled" ? (
                  <StopOutlined />
                ) : running ? (
                  <LoadingOutlined />
                ) : undefined
              }
              style={{ margin: 0 }}
            >
              {t(meta.labelKey, meta.label)}
            </Tag>
            <Text type="secondary" style={{ fontSize: 11 }}>
              {fromNow(task.updatedAt)}
            </Text>
            {events.length > 4 && (
              <Button
                type="link"
                size="small"
                onClick={onToggle}
                style={{ padding: 0, height: "auto", fontSize: 12 }}
              >
                {expanded
                  ? t("action.collapse", "Thu gọn")
                  : t("remote.agent.viewAll", "Xem tất cả ({count})", { count: events.length })}
              </Button>
            )}
          </div>

          {/* Streamed log list */}
          {shown.length > 0 && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 2,
                fontFamily:
                  "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                fontSize: 12,
                color: "#3A4256",
                background: "#F7F8FC",
                border: "1px solid #F1F2F7",
                borderRadius: 8,
                padding: "8px 10px",
                maxHeight: expanded ? 340 : 160,
                overflowY: "auto",
              }}
            >
              {shown.map((ev) => (
                <div
                  key={ev.id}
                  style={{
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    color: ev.kind === "error" ? "#EF4444" : undefined,
                  }}
                >
                  {ev.kind === "stage" ? "▸ " : ""}
                  {eventText(ev, t)}
                </div>
              ))}
            </div>
          )}

          {/* Result / error / link */}
          {task.status === "done" && (
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
              {task.result && (
                <Text style={{ fontSize: 13.5, whiteSpace: "pre-wrap" }}>
                  {task.result}
                </Text>
              )}
            </div>
          )}
          {task.status === "error" && task.error && (
            <Text type="danger" style={{ fontSize: 12.5, display: "block", marginTop: 6 }}>
              {task.error}
            </Text>
          )}
        </div>
      </div>
    </div>
  );
}
