"use client";

import {
  CheckOutlined,
  CommentOutlined,
  DownloadOutlined,
  ReloadOutlined,
  RobotOutlined,
  SaveOutlined,
} from "@ant-design/icons";
import {
  App,
  Button,
  Col,
  Divider,
  Drawer,
  Input,
  List,
  Row,
  Segmented,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import type {
  AdminUpdateFeedbackRequest,
  Feedback,
  FeedbackSeverity,
  FeedbackSimilar,
  FeedbackStatus,
} from "@larkwave/shared";
import { SEVERITY_LABEL } from "@larkwave/shared";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import FeedbackAttachments from "@/components/FeedbackAttachments";
import { V, BRAND } from "@larkwave/ui";

const { Title, Text, Paragraph } = Typography;
const PAGE_SIZE = 20;

const STATUS_META: Record<FeedbackStatus, { label: string; color: string }> = {
  open: { label: "Chưa xử lý", color: "gold" },
  resolved: { label: "Đã xử lý", color: "green" },
  duplicate: { label: "Trùng lặp", color: "default" },
  rejected: { label: "Từ chối", color: "red" },
};
const SEVERITY_COLOR: Record<FeedbackSeverity, string> = {
  low: "blue",
  medium: "gold",
  high: "orange",
  critical: "red",
};

/** Editable triage state for the open report. */
interface Triage {
  status: FeedbackStatus;
  severity: FeedbackSeverity | null;
  adminNote: string;
  duplicateOfId: string | null;
}
const triageOf = (f: Feedback): Triage => ({
  status: f.status,
  severity: f.severity,
  adminNote: f.adminNote ?? "",
  duplicateOfId: f.duplicateOfId,
});

export default function AdminFeedbackPage() {
  const { message, modal } = App.useApp();
  const [items, setItems] = useState<Feedback[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string>("open");
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<Feedback | null>(null);
  const [form, setForm] = useState<Triage | null>(null);
  const [busy, setBusy] = useState(false);
  const [similar, setSimilar] = useState<FeedbackSimilar[]>([]);
  const [findingSimilar, setFindingSimilar] = useState(false);

  const load = useCallback(
    async (p = 1, st = status) => {
      setLoading(true);
      try {
        const res = await api.adminFeedback({
          page: p,
          pageSize: PAGE_SIZE,
          ...(st !== "all" ? { status: st } : {}),
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
    [status, message],
  );

  useEffect(() => {
    void load(1, status);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const resolveAll = () => {
    modal.confirm({
      title: "Xử lý tất cả báo lỗi đang mở?",
      content: "Mọi báo lỗi 'Chưa xử lý' sẽ chuyển sang 'Đã xử lý'.",
      okText: "Xử lý tất cả",
      cancelText: "Huỷ",
      onOk: async () => {
        try {
          const r = await api.resolveAllFeedback();
          message.success(`Đã xử lý ${r.count} báo lỗi.`);
          void load(1, status);
        } catch (e) {
          message.error((e as Error).message);
        }
      },
    });
  };

  const exportCsv = async () => {
    try {
      const rows = await api.exportFeedback(status);
      const esc = (v: unknown) => {
        const s = v == null ? "" : String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const header = [
        "ID", "Email", "Tên", "Trạng thái", "Mức độ",
        "Nội dung", "Trang", "Ngày tạo", "Ngày xử lý",
      ];
      const body = rows.map((f) =>
        [
          f.id, f.user?.email ?? "", f.user?.name ?? "", f.status, f.severity ?? "",
          f.message, f.url ?? "",
          f.createdAt, f.resolvedAt ?? "",
        ]
          .map(esc)
          .join(","),
      );
      // BOM so Excel reads UTF-8 (Vietnamese) correctly.
      const csv = "﻿" + [header.join(","), ...body].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `feedback-${status}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      message.success(`Đã xuất ${rows.length} báo lỗi ra CSV.`);
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const openDrawer = (f: Feedback) => {
    setActive(f);
    setForm(triageOf(f));
    setSimilar([]);
  };

  const patch = (p: Partial<Triage>) => setForm((f) => (f ? { ...f, ...p } : f));

  const save = async (override?: Partial<Triage>) => {
    if (!active || !form) return;
    const next = { ...form, ...override };
    setBusy(true);
    try {
      const body: AdminUpdateFeedbackRequest = {
        status: next.status,
        severity: next.severity,
        adminNote: next.adminNote,
        duplicateOfId: next.duplicateOfId,
      };
      const updated = await api.adminUpdateFeedback(active.id, body);
      message.success("Đã lưu.");
      setItems((xs) => xs.map((x) => (x.id === updated.id ? updated : x)));
      setActive(updated);
      setForm(triageOf(updated));
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const findSimilar = async () => {
    if (!active) return;
    setFindingSimilar(true);
    try {
      const res = await api.adminFeedbackSimilar(active.id);
      setSimilar(res);
      if (!res.length) message.info("Không tìm thấy báo cáo tương tự.");
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setFindingSimilar(false);
    }
  };

  const columns: ColumnsType<Feedback> = [
    {
      title: "Người báo",
      key: "user",
      width: 170,
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <Text strong style={{ fontSize: 13 }}>
            {r.user?.name || r.user?.email || "—"}
          </Text>
          <Text type="secondary" style={{ fontSize: 11.5 }}>
            {r.user?.email}
          </Text>
        </Space>
      ),
    },
    {
      title: "Nội dung",
      dataIndex: "message",
      key: "message",
      render: (v: string) => (
        <Text style={{ fontSize: 13 }}>{v.length > 90 ? v.slice(0, 90) + "…" : v}</Text>
      ),
    },
    {
      title: "Mức độ",
      dataIndex: "severity",
      key: "severity",
      width: 110,
      render: (s: FeedbackSeverity | null) =>
        s ? (
          <Tag color={SEVERITY_COLOR[s]} bordered={false}>
            {SEVERITY_LABEL[s]}
          </Tag>
        ) : (
          <Text type="secondary" style={{ fontSize: 12 }}>
            —
          </Text>
        ),
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      width: 110,
      render: (s: FeedbackStatus) => (
        <Tag color={STATUS_META[s].color} bordered={false}>
          {STATUS_META[s].label}
        </Tag>
      ),
    },
    {
      title: "Lúc",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 130,
      render: (v) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {formatDate(v)}
        </Text>
      ),
    },
  ];

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>
            <CommentOutlined style={{ color: BRAND, marginInlineEnd: 8 }} />
            Báo lỗi từ người dùng
          </Title>
          <Text type="secondary">
            Phân loại, đánh dấu trùng và phản hồi cho người báo.
            ({total} bản ghi)
          </Text>
        </div>
        <Space>
          <Segmented
            value={status}
            onChange={(v) => setStatus(v as string)}
            options={[
              { label: "Chưa xử lý", value: "open" },
              { label: "Đã xử lý", value: "resolved" },
              { label: "Trùng", value: "duplicate" },
              { label: "Tất cả", value: "all" },
            ]}
          />
          <Button icon={<CheckOutlined />} onClick={resolveAll}>
            Xử lý tất cả
          </Button>
          <Button icon={<DownloadOutlined />} onClick={() => void exportCsv()}>
            Xuất CSV
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => void load(page, status)}>
            Tải lại
          </Button>
        </Space>
      </div>

      <Table<Feedback>
        rowKey="id"
        size="small"
        loading={loading}
        columns={columns}
        dataSource={items}
        onRow={(r) => ({ onClick: () => openDrawer(r), style: { cursor: "pointer" } })}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total,
          showSizeChanger: false,
          onChange: (p) => void load(p, status),
        }}
      />

      <Drawer
        title="Phân loại báo lỗi"
        width={Math.min(680, typeof window !== "undefined" ? window.innerWidth - 40 : 680)}
        open={!!active}
        onClose={() => setActive(null)}
        destroyOnClose
        extra={
          form ? (
            <Button type="primary" icon={<SaveOutlined />} loading={busy} onClick={() => void save()}>
              Lưu
            </Button>
          ) : null
        }
      >
        {active && form && (
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {active.user?.name || active.user?.email} · {formatDate(active.createdAt)}
              </Text>
              <Paragraph style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{active.message}</Paragraph>
              {active.url && (
                <a href={active.url} target="_blank" rel="noreferrer" style={{ fontSize: 12.5 }}>
                  {active.url}
                </a>
              )}
            </div>

            {active.attachments.length > 0 && (
              <div>
                <Text strong style={{ fontSize: 12.5, display: "block", marginBottom: 6 }}>
                  Tệp đính kèm ({active.attachments.length})
                </Text>
                <FeedbackAttachments
                  attachments={active.attachments}
                  fetcher={(uploadId) => api.adminFeedbackAttachment(active.id, uploadId)}
                />
              </div>
            )}

            {active.context?.logs && active.context.logs.length > 0 && (
              <details>
                <summary style={{ cursor: "pointer", fontSize: 12.5, fontWeight: 600 }}>
                  Log gần đây ({active.context.logs.length})
                </summary>
                <pre
                  style={{
                    // Nền khối mã kiểu GitHub tối — cố ý TỐI ở cả hai chế độ. Khối log đọc dễ hơn hẳn trên
      // nền tối, và lập trình viên quen thấy nó như vậy; đổi theo theme ở đây là làm khó người đọc.
      background: "#0d1117",
                    color: `${V.textSub}`,
                    borderRadius: 8,
                    padding: 12,
                    fontSize: 11.5,
                    maxHeight: 220,
                    overflow: "auto",
                    whiteSpace: "pre-wrap",
                    marginTop: 8,
                  }}
                >
                  {active.context.logs.join("\n")}
                </pre>
              </details>
            )}

            <Divider style={{ margin: 0 }} />

            <Row gutter={[12, 12]}>
              <Col span={12}>
                <Text strong style={{ fontSize: 12.5, display: "block", marginBottom: 4 }}>
                  Trạng thái
                </Text>
                <Select<FeedbackStatus>
                  value={form.status}
                  style={{ width: "100%" }}
                  onChange={(v) => patch({ status: v })}
                  options={(Object.keys(STATUS_META) as FeedbackStatus[]).map((s) => ({
                    value: s,
                    label: STATUS_META[s].label,
                  }))}
                />
              </Col>
              <Col span={12}>
                <Text strong style={{ fontSize: 12.5, display: "block", marginBottom: 4 }}>
                  Mức độ
                </Text>
                <Select<FeedbackSeverity | "none">
                  value={form.severity ?? "none"}
                  style={{ width: "100%" }}
                  onChange={(v) => patch({ severity: v === "none" ? null : v })}
                  options={[
                    { value: "none", label: "— Chưa phân loại —" },
                    ...(Object.keys(SEVERITY_LABEL) as FeedbackSeverity[]).map((s) => ({
                      value: s,
                      label: SEVERITY_LABEL[s],
                    })),
                  ]}
                />
              </Col>
            </Row>

            <Divider style={{ margin: 0 }} />

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <Text strong style={{ fontSize: 12.5 }}>
                  Lỗi trùng lặp
                </Text>
                <Button
                  size="small"
                  icon={<RobotOutlined />}
                  loading={findingSimilar}
                  onClick={() => void findSimilar()}
                >
                  Tìm lỗi tương tự (AI)
                </Button>
              </div>
              {form.duplicateOfId ? (
                <Space>
                  <Tag color="default">Đang đánh dấu trùng với: {form.duplicateOfId}</Tag>
                  <Button size="small" onClick={() => void save({ duplicateOfId: null, status: "open" })}>
                    Bỏ đánh dấu
                  </Button>
                </Space>
              ) : (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Đánh dấu báo cáo NÀY là trùng với một báo cáo CŨ HƠN.
                </Text>
              )}
              {similar.length > 0 && (
                <List
                  size="small"
                  style={{ marginTop: 8 }}
                  dataSource={similar}
                  renderItem={(c) => (
                    <List.Item
                      actions={[
                        <Button
                          key="dup"
                          size="small"
                          type="link"
                          onClick={() => void save({ duplicateOfId: c.id, status: "duplicate" })}
                        >
                          Đánh dấu trùng với cái này
                        </Button>,
                      ]}
                    >
                      <List.Item.Meta
                        title={
                          <Space size={6}>
                            <Tag color="purple" bordered={false}>
                              {c.score}%
                            </Tag>
                            <Text style={{ fontSize: 12.5 }}>
                              {c.user?.name || c.user?.email || "—"} · {formatDate(c.createdAt)}
                            </Text>
                          </Space>
                        }
                        description={
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {c.message.length > 110 ? c.message.slice(0, 110) + "…" : c.message}
                            {c.reason ? ` — ${c.reason}` : ""}
                          </Text>
                        }
                      />
                    </List.Item>
                  )}
                />
              )}
            </div>

            <div>
              <Text strong style={{ fontSize: 12.5, display: "block", marginBottom: 4 }}>
                Ghi chú admin (hiển thị cho người báo)
              </Text>
              <Input.TextArea
                value={form.adminNote}
                onChange={(e) => patch({ adminNote: e.target.value })}
                autoSize={{ minRows: 2, maxRows: 5 }}
                placeholder="Nguyên nhân / cách fix / phản hồi…"
              />
            </div>
          </Space>
        )}
      </Drawer>
    </Space>
  );
}
