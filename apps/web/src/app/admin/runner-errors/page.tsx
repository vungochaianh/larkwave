"use client";

import { ApiOutlined, ReloadOutlined, SearchOutlined, WarningOutlined } from "@ant-design/icons";
import { App, Input, Segmented, Space, Table, Tag, Tooltip, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import type { RunnerErrorReport, RunnerErrorRow } from "@/lib/api";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { V, OK, ERR, WARN, BRAND } from "@larkwave/ui";

const { Title, Text, Paragraph } = Typography;

// Nhãn + màu theo loại lỗi. Giữ khớp với RUNNER_ERROR_KINDS phía API.
const KIND_LABEL: Record<string, string> = {
  auth: "Xác thực",
  credit: "Hết credit",
  context: "Tràn ngữ cảnh",
  overload: "Quá tải",
  rate_limit: "Giới hạn tần suất",
  other: "Khác",
};
const KIND_COLOR: Record<string, string> = {
  auth: ERR,
  credit: WARN,
  context: BRAND,
  overload: "#8c8c8c",
  rate_limit: "#8c8c8c",
  other: "#8c8c8c",
};

const SURFACE_LABEL: Record<string, string> = {
  lark: "Lark Agents",
  general: "Trợ lý AI",
  remote: "Từ xa",
};

const DAYS_OPTS = [
  { label: "24 giờ", value: 1 },
  { label: "7 ngày", value: 7 },
  { label: "30 ngày", value: 30 },
];

/** Thẻ số tổng quan nhỏ. */
function Stat({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <div
      style={{
        border: `1px solid ${V.border}`,
        background: V.surface,
        borderRadius: 12,
        padding: "10px 14px",
        minWidth: 120,
      }}
    >
      <div style={{ fontSize: 12, color: V.textFaint }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color ?? V.text }}>{value}</div>
    </div>
  );
}

export default function RunnerErrorsPage() {
  const { message } = App.useApp();
  const [data, setData] = useState<RunnerErrorReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState(7);
  const [kind, setKind] = useState<string>("");
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.adminRunnerErrors({ days, kind: kind || undefined, q: q || undefined, limit: 200 });
      setData(r);
    } catch (e) {
      message.error((e as Error)?.message || "Không tải được danh sách lỗi runner.");
    } finally {
      setLoading(false);
    }
  }, [days, kind, q, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: ColumnsType<RunnerErrorRow> = [
    {
      title: "Lúc",
      dataIndex: "createdAt",
      width: 150,
      render: (v: string) => <Text style={{ fontSize: 12.5 }}>{formatDate(v)}</Text>,
    },
    {
      title: "Người dùng",
      dataIndex: "email",
      render: (v: string) => <Text copyable={{ text: v }} style={{ fontSize: 12.5 }}>{v}</Text>,
    },
    {
      title: "Loại",
      dataIndex: "kind",
      width: 130,
      filters: Object.keys(KIND_LABEL).map((k) => ({ text: KIND_LABEL[k], value: k })),
      onFilter: (val, r) => r.kind === val,
      render: (k: string) => <Tag color={KIND_COLOR[k] ?? "#8c8c8c"}>{KIND_LABEL[k] ?? k}</Tag>,
    },
    {
      title: "Runner",
      dataIndex: "runner",
      width: 150,
      render: (runner: string, r) => (
        <Text style={{ fontSize: 12.5 }}>
          {runner}
          {r.model ? <span style={{ color: V.textFaint }}> · {r.model}</span> : null}
        </Text>
      ),
    },
    {
      title: "Màn",
      dataIndex: "surface",
      width: 110,
      render: (s: string) => <Text style={{ fontSize: 12.5 }}>{SURFACE_LABEL[s] ?? s}</Text>,
    },
    {
      title: "Nội dung lỗi",
      dataIndex: "message",
      render: (m: string) => (
        <Tooltip title={m}>
          <Text style={{ fontSize: 12, fontFamily: "ui-monospace, monospace" }}>
            {m.length > 120 ? `${m.slice(0, 120)}…` : m}
          </Text>
        </Tooltip>
      ),
    },
  ];

  return (
    <div style={{ padding: "4px 2px" }}>
      <Title level={3} style={{ marginBottom: 4 }}>
        <ApiOutlined /> Lỗi runner gần đây
      </Title>
      <Paragraph type="secondary" style={{ marginBottom: 16, maxWidth: 820 }}>
        Lỗi người dùng gặp khi chạy agent trên MÁY HỌ (Claude CLI hỏng xác thực / hết credit) hoặc khi hỏi qua
        “Gói Larkwave”. Các lượt CLI chạy cục bộ nên máy chủ không tự thấy — bảng này do chính giao diện gửi về,
        giúp chủ động phát hiện ai đang kẹt thay vì chờ họ báo.
      </Paragraph>

      <Space wrap style={{ marginBottom: 16 }}>
        <Stat label="Tổng lỗi" value={data?.total ?? 0} color={ERR} />
        {(data?.byKind ?? []).slice(0, 4).map((k) => (
          <Stat key={k.kind} label={KIND_LABEL[k.kind] ?? k.kind} value={k.count} color={KIND_COLOR[k.kind]} />
        ))}
      </Space>

      {!!data?.topUsers?.length && (
        <div style={{ marginBottom: 16 }}>
          <Text strong style={{ fontSize: 13 }}>
            <WarningOutlined style={{ color: WARN }} /> Gặp nhiều nhất:
          </Text>{" "}
          <Space wrap size={6} style={{ marginLeft: 6 }}>
            {data.topUsers.map((u) => (
              <Tag
                key={u.userId}
                style={{ cursor: "pointer" }}
                onClick={() => setQ(u.email)}
                color={u.count >= 5 ? ERR : "default"}
              >
                {u.email} · {u.count}
              </Tag>
            ))}
          </Space>
        </div>
      )}

      <Space wrap style={{ marginBottom: 12 }}>
        <Segmented
          options={DAYS_OPTS}
          value={days}
          onChange={(v) => setDays(v as number)}
        />
        <Segmented
          options={[{ label: "Tất cả loại", value: "" }, ...Object.keys(KIND_LABEL).map((k) => ({ label: KIND_LABEL[k], value: k }))]}
          value={kind}
          onChange={(v) => setKind(v as string)}
        />
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder="Tìm theo email / nội dung"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onPressEnter={() => void load()}
          style={{ width: 260 }}
        />
        <Tooltip title="Tải lại">
          <ReloadOutlined onClick={() => void load()} style={{ cursor: "pointer", color: BRAND, fontSize: 16 }} />
        </Tooltip>
      </Space>

      <Table<RunnerErrorRow>
        rowKey="id"
        size="small"
        loading={loading}
        columns={columns}
        dataSource={data?.items ?? []}
        pagination={{ pageSize: 25, showSizeChanger: false }}
        locale={{ emptyText: loading ? "Đang tải…" : "Chưa có lỗi runner nào trong khoảng này — tốt!" }}
      />
    </div>
  );
}
