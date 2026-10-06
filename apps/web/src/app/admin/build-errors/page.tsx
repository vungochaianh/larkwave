"use client";

import {
  BugOutlined,
  CheckOutlined,
  ReloadOutlined,
  SearchOutlined,
  ToolOutlined,
  UndoOutlined,
} from "@ant-design/icons";
import {
  App,
  Button,
  Drawer,
  Input,
  Segmented,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { Track } from "@larkwave/shared";
import type { BuildErrorEntry } from "@/lib/api";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import BuildDetail from "@/components/BuildDetail";
import { V, OK, ERR, BRAND } from "@larkwave/ui";

const { Title, Text, Paragraph } = Typography;

const STAGE_LABEL: Record<string, string> = {
  intake: "Phân loại",
  blueprint: "Thiết kế",
  spec: "Đặc tả",
  codegen: "Sinh code",
  build: "Build",
  preview: "Preview",
  deploy: "Deploy",
};

const STAGE_STATUS_COLOR: Record<string, string> = {
  done: OK,
  error: ERR,
  running: BRAND,
  pending: `${V.border}`,
  skipped: `${V.border}`,
};

/** Compact run-progress timeline: one dot per pipeline stage, coloured by status. */
function StageStrip({ stages }: { stages: { name: string; status: string }[] }) {
  if (!stages?.length)
    return (
      <Text type="secondary" style={{ fontSize: 11.5 }}>
        —
      </Text>
    );
  return (
    <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
      {stages.map((s, i) => (
        <Tooltip key={i} title={`${STAGE_LABEL[s.name] ?? s.name}: ${s.status}`}>
          <span
            style={{
              width: 9,
              height: 9,
              borderRadius: 999,
              background: STAGE_STATUS_COLOR[s.status] ?? `${V.border}`,
              display: "inline-block",
            }}
          />
        </Tooltip>
      ))}
    </span>
  );
}

const PAGE_SIZE = 15;

export default function AdminBuildErrorsPage() {
  const { message, modal } = App.useApp();
  const [items, setItems] = useState<BuildErrorEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<BuildErrorEntry | null>(null);
  const [fixing, setFixing] = useState(false);
  const [fixingId, setFixingId] = useState<string | null>(null);
  // "open" = chưa xử lý (default), "all" = kể cả đã xử lý.
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [dismissingId, setDismissingId] = useState<string | null>(null);

  // "Check & fix": re-run the build's deploy of its generated source (no credit).
  // Works for deploy-stage failures; codegen-stage failures return a clear message.
  const fix = async (entry: BuildErrorEntry) => {
    setFixing(true);
    setFixingId(entry.id);
    try {
      await api.redeployBuild(entry.id);
      message.success("Đã kích hoạt chạy lại để sửa lỗi — theo dõi trong app.");
      setActive(null);
      void load(page, q);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setFixing(false);
      setFixingId(null);
    }
  };

  // One-click: mark ALL unresolved errored builds as handled.
  const dismissAll = () => {
    modal.confirm({
      title: "Đánh dấu tất cả lỗi build là đã xử lý?",
      content: "Mọi lỗi build chưa xử lý sẽ được ẩn khỏi danh sách (có thể mở lại ở bộ lọc Tất cả).",
      okText: "Đánh dấu tất cả",
      cancelText: "Huỷ",
      onOk: async () => {
        try {
          const r = await api.dismissAllBuildErrors();
          message.success(`Đã xử lý ${r.count} lỗi build.`);
          void load(1, q);
        } catch (e) {
          message.error((e as Error).message);
        }
      },
    });
  };

  // Mark an error resolved (clears it from the default view) or re-open it.
  const dismiss = async (entry: BuildErrorEntry, reviewed: boolean) => {
    setDismissingId(entry.id);
    try {
      await api.dismissBuildError(entry.id, reviewed);
      message.success(reviewed ? "Đã đánh dấu đã xử lý." : "Đã mở lại lỗi.");
      if (active?.id === entry.id) setActive(null);
      void load(page, q);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setDismissingId(null);
    }
  };

  const load = useCallback(
    async (p = 1, search = q) => {
      setLoading(true);
      try {
        const res = await api.adminBuildErrors({
          page: p,
          pageSize: PAGE_SIZE,
          ...(search ? { q: search } : {}),
          ...(filter === "all" ? { reviewed: "all" } : {}),
        });
        setItems(res.items);
        setTotal(res.total);
        setPage(p);
      } catch (e) {
        message.error((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [q, filter, message],
  );

  useEffect(() => {
    void load(1, q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const columns: ColumnsType<BuildErrorEntry> = [
    {
      title: "App",
      key: "app",
      width: 200,
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <Link href={`/apps/${r.appId}`} target="_blank">
            <Text strong style={{ fontSize: 13 }}>
              {r.appName}
            </Text>
          </Link>
          <Text type="secondary" style={{ fontSize: 11.5 }}>
            {r.ownerEmail}
          </Text>
        </Space>
      ),
    },
    {
      title: "Hỏng ở",
      dataIndex: "failedStage",
      key: "failedStage",
      width: 110,
      render: (v: string | null, r) =>
        v ? (
          <Tag color="error" bordered={false}>
            {STAGE_LABEL[v] ?? v}
          </Tag>
        ) : r.status === "canceled" ? (
          <Tag bordered={false}>Đã huỷ</Tag>
        ) : (
          <Tag color="warning" bordered={false}>?</Tag>
        ),
    },
    {
      title: "Tiến trình",
      key: "stages",
      width: 120,
      render: (_, r) => <StageStrip stages={r.stages} />,
    },
    {
      title: "Lỗi",
      dataIndex: "error",
      key: "error",
      render: (v: string | null, r) => (
        <Tooltip title={v || undefined} placement="topLeft">
          <Text style={{ fontSize: 12.5, color: v ? ERR : V.textFaint }}>
            {v ? (v.length > 120 ? v.slice(0, 120) + "…" : v) : `(không có thông báo · "${(r.prompt ?? "").slice(0, 40)}")`}
          </Text>
        </Tooltip>
      ),
    },
    {
      title: "Lúc",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 140,
      render: (v) => <Text type="secondary" style={{ fontSize: 12 }}>{formatDate(v)}</Text>,
    },
    {
      title: "Ngày sửa",
      dataIndex: "updatedAt",
      key: "updatedAt",
      width: 140,
      render: (v) => <Text type="secondary" style={{ fontSize: 12 }}>{formatDate(v)}</Text>,
    },
    {
      title: "",
      key: "actions",
      width: 96,
      render: (_, r) => (
        <Space size={0}>
          <Tooltip title="Sửa & chạy lại">
            <Button
              type="text"
              size="small"
              aria-label="Sửa & chạy lại"
              icon={<ToolOutlined />}
              loading={fixingId === r.id}
              disabled={!!fixingId && fixingId !== r.id}
              onClick={(e) => {
                e.stopPropagation();
                void fix(r);
              }}
            />
          </Tooltip>
          {r.reviewed ? (
            <Tooltip title="Mở lại lỗi">
              <Button
                type="text"
                size="small"
                icon={<UndoOutlined />}
                loading={dismissingId === r.id}
                onClick={(e) => {
                  e.stopPropagation();
                  void dismiss(r, false);
                }}
              />
            </Tooltip>
          ) : (
            <Tooltip title="Đánh dấu đã xử lý (passed)">
              <Button
                type="text"
                size="small"
                icon={<CheckOutlined style={{ color: OK }} />}
                loading={dismissingId === r.id}
                onClick={(e) => {
                  e.stopPropagation();
                  void dismiss(r, true);
                }}
              />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>
            <BugOutlined style={{ color: ERR, marginInlineEnd: 8 }} />
            Báo cáo lỗi build
          </Title>
          <Text type="secondary">
            Mọi build bị lỗi / huỷ trên toàn hệ thống — bấm vào dòng để xem log đầy đủ. ({total} bản ghi)
          </Text>
        </div>
        <Space wrap>
          <Segmented
            value={filter}
            onChange={(v) => setFilter(v as "open" | "all")}
            options={[
              { label: "Chưa xử lý", value: "open" },
              { label: "Tất cả", value: "all" },
            ]}
          />
          <Input
            allowClear
            prefix={<SearchOutlined style={{ color: V.textFaint }} />}
            placeholder="Tìm theo app / lỗi / yêu cầu…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onPressEnter={() => void load(1, q.trim())}
            style={{ width: 260 }}
          />
          <Button icon={<CheckOutlined />} onClick={dismissAll}>
            Đánh dấu tất cả đã xử lý
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => void load(page, q)}>
            Tải lại
          </Button>
        </Space>
      </div>

      <Table<BuildErrorEntry>
        rowKey="id"
        size="small"
        loading={loading}
        columns={columns}
        dataSource={items}
        onRow={(r) => ({ onClick: () => setActive(r), style: { cursor: "pointer" } })}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total,
          showSizeChanger: false,
          onChange: (p) => void load(p, q),
        }}
      />

      <Drawer
        title={
          active ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <BugOutlined style={{ color: ERR }} />
              {active.appName}
            </span>
          ) : null
        }
        width={Math.min(760, typeof window !== "undefined" ? window.innerWidth - 40 : 760)}
        open={!!active}
        onClose={() => setActive(null)}
        destroyOnClose
        extra={
          active ? (
            <Space>
              {active.reviewed ? (
                <Button
                  icon={<UndoOutlined />}
                  loading={dismissingId === active.id}
                  onClick={() => void dismiss(active, false)}
                >
                  Mở lại
                </Button>
              ) : (
                <Button
                  icon={<CheckOutlined />}
                  loading={dismissingId === active.id}
                  onClick={() => void dismiss(active, true)}
                >
                  Đánh dấu đã xử lý
                </Button>
              )}
              <Button
                type="primary"
                icon={<ToolOutlined />}
                loading={fixing}
                onClick={() => void fix(active)}
              >
                Sửa & chạy lại
              </Button>
            </Space>
          ) : null
        }
      >
        {active && (
          <>
            <Paragraph style={{ marginBottom: 6 }}>
              <Text type="secondary">Yêu cầu: </Text>
              {active.prompt}
            </Paragraph>
            {active.stages?.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Tiến trình chạy (đánh giá để cải thiện):
                </Text>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                  {active.stages.map((s, i) => (
                    <Tag
                      key={i}
                      bordered={false}
                      color={
                        s.status === "error"
                          ? "error"
                          : s.status === "done"
                            ? "success"
                            : s.status === "running"
                              ? "processing"
                              : "default"
                      }
                    >
                      {STAGE_LABEL[s.name] ?? s.name}
                      {s.detail ? ` · ${s.detail}` : ""}
                    </Tag>
                  ))}
                </div>
              </div>
            )}
            {active.error && (
              <Paragraph
                style={{
                  background: `${ERR}14`,
                  border: `1px solid ${ERR}3d`,
                  borderRadius: 8,
                  padding: "8px 12px",
                  color: ERR,
                  fontSize: 13,
                  whiteSpace: "pre-wrap",
                }}
              >
                {active.error}
              </Paragraph>
            )}
            <BuildDetail buildId={active.id} track={(active.track as Track) ?? "web"} />
          </>
        )}
      </Drawer>
    </Space>
  );
}
