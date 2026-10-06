"use client";

import {
  ReloadOutlined,
  SyncOutlined,
  StopOutlined,
  CheckCircleOutlined,
  HistoryOutlined,
} from "@ant-design/icons";
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Drawer,
  Input,
  Popconfirm,
  Progress,
  Row,
  Space,
  Statistic,
  Table,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import { api, type MaicEndUser, type MaicRunRow } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { ERR } from "@larkwave/ui";

const { Title, Text, Paragraph } = Typography;

const usd = (n: number | null | undefined) => `$${Number(n ?? 0).toFixed(4)}`;

/** Đỏ khi đã cạn, cam khi sắp cạn — người trực cần thấy ai sắp bị chặn TRƯỚC khi họ gọi lên. */
const mucDo = (p: number | null): "exception" | "normal" | "active" =>
  p === null ? "normal" : p >= 100 ? "exception" : p >= 80 ? "active" : "normal";

export default function AdminMaicPage() {
  const { message } = App.useApp();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [rows, setRows] = useState<MaicEndUser[]>([]);
  const [summary, setSummary] = useState<{
    endUsers: number;
    blocked: number;
    totalRuns: number;
    totalCostUsd: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  // Ngăn kéo lịch sử lượt chạy của một người
  const [openFor, setOpenFor] = useState<MaicEndUser | null>(null);
  const [runs, setRuns] = useState<MaicRunRow[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);

  const load = useCallback(
    async (tim = "") => {
      setLoading(true);
      try {
        const st = await api.maicAdminStatus();
        setEnabled(st.enabled);
        if (!st.enabled) {
          setRows([]);
          setSummary(null);
          return;
        }
        const res = await api.maicEndUsers({ limit: 200, q: tim || undefined });
        // `null` = MAIC trả lỗi (thường là token chưa được bật vai trò đại lý).
        // Phân biệt với "bật rồi nhưng chưa có ai" để thông báo nói đúng chuyện.
        if (!res) {
          setRows([]);
          setSummary(null);
          setEnabled(false);
          return;
        }
        setRows(res.endUsers);
        setSummary(res.summary);
      } catch (e) {
        message.error((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [message],
  );

  useEffect(() => {
    void load();
  }, [load]);

  async function hanhDong(
    userId: string,
    fn: () => Promise<unknown>,
    xong: string,
  ): Promise<void> {
    setBusy(userId);
    try {
      await fn();
      message.success(xong);
      await load(q);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function moLichSu(r: MaicEndUser): Promise<void> {
    setOpenFor(r);
    setRunsLoading(true);
    try {
      const res = await api.maicEndUserRuns(r.externalId, { limit: 50 });
      setRuns(res?.runs ?? []);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setRunsLoading(false);
    }
  }

  const columns: ColumnsType<MaicEndUser> = [
    {
      title: "Người dùng",
      key: "user",
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <Text strong>{r.label || "—"}</Text>
          <Text type="secondary" style={{ fontSize: 11, fontFamily: "monospace" }}>
            {r.externalId}
          </Text>
        </Space>
      ),
    },
    {
      title: "Gói",
      dataIndex: "plan",
      key: "plan",
      width: 110,
      render: (v: string | null) =>
        v ? <Tag bordered={false}>{v}</Tag> : <Text type="secondary">—</Text>,
    },
    {
      title: "Đã dùng chu kỳ này",
      key: "usage",
      width: 220,
      sorter: (a, b) => a.usage.costUsd - b.usage.costUsd,
      render: (_, r) => (
        <Space direction="vertical" size={2} style={{ width: "100%" }}>
          <Text style={{ fontFamily: "monospace", fontSize: 12 }}>
            {usd(r.usage.costUsd)}
            {r.monthlyBudgetUsd > 0 && (
              <Text type="secondary"> / {usd(r.monthlyBudgetUsd)}</Text>
            )}
          </Text>
          {/* Trần 0 = không giới hạn. Vẽ thanh 0% ở đó sẽ đọc thành "còn nguyên",
              trong khi thực ra chẳng có trần nào để mà còn. */}
          {r.percentUsed === null ? (
            <Text type="secondary" style={{ fontSize: 11 }}>
              không giới hạn
            </Text>
          ) : (
            <Progress
              percent={Math.min(100, r.percentUsed)}
              size="small"
              status={mucDo(r.percentUsed)}
              format={() => `${r.percentUsed}%`}
            />
          )}
        </Space>
      ),
    },
    {
      title: "Lượt",
      key: "runs",
      width: 110,
      sorter: (a, b) => a.usage.runs - b.usage.runs,
      render: (_, r) => (
        <Space size={4}>
          <Text style={{ fontFamily: "monospace" }}>{r.usage.runs}</Text>
          {r.running > 0 && (
            <Tag color="processing" bordered={false}>
              {r.running} đang chạy
            </Tag>
          )}
        </Space>
      ),
    },
    {
      title: "Chu kỳ từ",
      dataIndex: "periodStart",
      key: "periodStart",
      width: 150,
      render: (v: string) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {formatDate(v)}
        </Text>
      ),
    },
    {
      title: "Trạng thái",
      key: "blocked",
      width: 110,
      render: (_, r) =>
        r.blocked ? (
          <Tag color="error" bordered={false}>
            đang khoá
          </Tag>
        ) : (
          <Tag color="success" bordered={false}>
            bình thường
          </Tag>
        ),
    },
    {
      title: "",
      key: "actions",
      width: 240,
      render: (_, r) => (
        <Space size={4}>
          <Tooltip title="Xem lượt chạy MAIC của người này">
            <Button
              size="small"
              icon={<HistoryOutlined />}
              onClick={() => void moLichSu(r)}
            />
          </Tooltip>
          <Tooltip title="Đẩy lại gói + trần hiện tại sang MAIC">
            <Button
              size="small"
              icon={<SyncOutlined />}
              loading={busy === r.externalId}
              onClick={() =>
                void hanhDong(
                  r.externalId,
                  () => api.maicSyncUser(r.externalId),
                  "Đã đồng bộ sang MAIC",
                )
              }
            />
          </Tooltip>
          <Popconfirm
            title="Mở chu kỳ mới?"
            description="Mức dùng của chu kỳ hiện tại sẽ thôi được tính vào trần. Lượt chạy cũ vẫn còn."
            onConfirm={() =>
              void hanhDong(
                r.externalId,
                () => api.maicResetUsage(r.externalId),
                "Đã mở chu kỳ mới",
              )
            }
          >
            <Button size="small">Mở chu kỳ</Button>
          </Popconfirm>
          {r.blocked ? (
            <Button
              size="small"
              icon={<CheckCircleOutlined />}
              onClick={() =>
                void hanhDong(
                  r.externalId,
                  () => api.maicSetBlocked(r.externalId, false),
                  "Đã mở khoá",
                )
              }
            >
              Mở khoá
            </Button>
          ) : (
            <Popconfirm
              title="Khoá người này?"
              description="Mọi lời gọi MAIC của họ sẽ bị từ chối cho tới khi mở lại."
              onConfirm={() =>
                void hanhDong(
                  r.externalId,
                  () => api.maicSetBlocked(r.externalId, true),
                  "Đã khoá",
                )
              }
            >
              <Button size="small" danger icon={<StopOutlined />}>
                Khoá
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const runColumns: ColumnsType<MaicRunRow> = [
    { title: "Mã", dataIndex: "id", key: "id", width: 170, render: (v: string) => <Text style={{ fontFamily: "monospace", fontSize: 11 }}>{v}</Text> },
    { title: "Loại", dataIndex: "kind", key: "kind", width: 70 },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      width: 110,
      render: (v: string) => (
        <Tag color={v === "succeeded" ? "success" : v === "failed" ? "error" : "default"} bordered={false}>
          {v}
        </Tag>
      ),
    },
    { title: "Chi phí", dataIndex: "costUsd", key: "costUsd", width: 100, render: (v: number | null) => <Text style={{ fontFamily: "monospace", fontSize: 12 }}>{usd(v)}</Text> },
    { title: "Lúc", dataIndex: "createdAt", key: "createdAt", width: 150, render: (v: string) => <Text type="secondary" style={{ fontSize: 12 }}>{formatDate(v)}</Text> },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <div>
        <Title level={3} style={{ margin: 0 }}>
          MAIC — hạn mức theo người dùng
        </Title>
        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
          Larkwave bán gói, MAIC chạy máy phía sau. Mỗi lượt gọi được quy về đúng người và
          MAIC tự chặn khi họ cạn trần — hàng rào thứ hai, nằm ngoài cơ sở dữ liệu của ta.
        </Paragraph>
      </div>

      {enabled === false && (
        <Alert
          type="warning"
          showIcon
          message="Lớp đại lý chưa bật"
          description={
            <>
              Hoặc <code>MAIC_URL</code>/<code>MAIC_TOKEN</code> chưa được đặt, hoặc token của
              chúng ta chưa được người vận hành MAIC nâng lên vai trò <b>đại lý</b> ở màn quản
              trị MAIC (tab Token → “Nâng thành đại lý”). Sản phẩm vẫn chạy bình thường, chỉ là
              chưa quy được chi phí về từng người.
            </>
          }
        />
      )}

      {summary && (
        <Row gutter={16}>
          <Col span={6}>
            <Card size="small">
              <Statistic title="Người dùng MAIC biết" value={summary.endUsers} />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic
                title="Đang bị khoá"
                value={summary.blocked}
                valueStyle={summary.blocked > 0 ? { color: ERR } : undefined}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic title="Tổng lượt chạy" value={summary.totalRuns} />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic title="Tổng chi phí" value={usd(summary.totalCostUsd)} />
            </Card>
          </Col>
        </Row>
      )}

      <Space>
        <Input.Search
          placeholder="Tìm theo mã hoặc nhãn"
          allowClear
          style={{ width: 280 }}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onSearch={(v) => void load(v)}
        />
        <Button icon={<ReloadOutlined />} onClick={() => void load(q)}>
          Tải lại
        </Button>
        <Popconfirm
          title="Đẩy lại trần cho mọi tài khoản?"
          description="Chạy sau khi đổi danh mục gói, khi mọi trần đều thay đổi cùng lúc."
          onConfirm={async () => {
            try {
              const r = await api.maicSyncAll(500);
              message.success(`Đã đồng bộ ${r.synced}, hỏng ${r.failed}`);
              await load(q);
            } catch (e) {
              message.error((e as Error).message);
            }
          }}
        >
          <Button icon={<SyncOutlined />}>Đồng bộ tất cả</Button>
        </Popconfirm>
      </Space>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={rows}
        loading={loading}
        size="small"
        pagination={{ pageSize: 20, showSizeChanger: false }}
        locale={{
          emptyText: enabled
            ? "MAIC chưa ghi nhận người dùng nào — sẽ có ngay khi ai đó dùng tính năng AI."
            : "Chưa bật lớp đại lý.",
        }}
      />

      <Drawer
        width={760}
        open={!!openFor}
        onClose={() => setOpenFor(null)}
        title={
          openFor
            ? `Lượt chạy MAIC — ${openFor.label || openFor.externalId}`
            : ""
        }
      >
        <Paragraph type="secondary">
          Sổ cái đối chiếu khi có tranh cãi về một khoản. Mỗi dòng là một lượt chạy thật
          MAIC đã quy về tài khoản này.
        </Paragraph>
        <Table
          rowKey="id"
          columns={runColumns}
          dataSource={runs}
          loading={runsLoading}
          size="small"
          pagination={{ pageSize: 15, showSizeChanger: false }}
        />
      </Drawer>
    </Space>
  );
}
