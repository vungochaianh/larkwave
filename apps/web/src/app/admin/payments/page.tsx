"use client";

import { CheckOutlined, ReloadOutlined, SyncOutlined } from "@ant-design/icons";
import {
  App,
  Button,
  Card,
  Popconfirm,
  Segmented,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import type { AdminPayment } from "@larkwave/shared";
import { api } from "@/lib/api";
import { formatVnd } from "@/lib/billing";
import { formatDate } from "@/lib/format";
import { CARD_SHADOW } from "@/lib/theme";

const { Title, Text } = Typography;

export default function AdminPaymentsPage() {
  const { message } = App.useApp();
  const [items, setItems] = useState<AdminPayment[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const sync = async () => {
    setSyncing(true);
    try {
      const r = await api.adminSyncPayments();
      message.success(
        `Đồng bộ SePay: kiểm tra ${r.checked} giao dịch, khớp & nâng gói ${r.matched}.`,
      );
      void load(page, status);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSyncing(false);
    }
  };

  const load = useCallback(
    async (p = 1, st = status) => {
      setLoading(true);
      try {
        const res = await api.adminListPayments({
          page: p,
          pageSize: 20,
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

  const confirm = async (id: string) => {
    setConfirming(id);
    try {
      const updated = await api.adminConfirmPayment(id);
      message.success(
        `Đã xác nhận & nâng gói ${updated.planLabel} cho ${updated.userEmail}`,
      );
      void load(page, status);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setConfirming(null);
    }
  };

  const columns: ColumnsType<AdminPayment> = [
    {
      title: "Ngày",
      dataIndex: "createdAt",
      width: 150,
      render: (v) => <Text type="secondary">{formatDate(v)}</Text>,
    },
    {
      title: "Người dùng",
      key: "user",
      render: (_, r) => (
        <div>
          <div>{r.userEmail}</div>
          {r.userName && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {r.userName}
            </Text>
          )}
        </div>
      ),
    },
    {
      title: "Gói",
      dataIndex: "planLabel",
      width: 130,
      render: (v) => (
        <Tag color="purple" bordered={false}>
          {v}
        </Tag>
      ),
    },
    {
      title: "Số tiền",
      dataIndex: "amountVnd",
      align: "right",
      width: 120,
      render: (v) => <Text strong>{formatVnd(v)}</Text>,
    },
    {
      title: "Mã",
      dataIndex: "code",
      width: 120,
      render: (v) => <Text code>{v}</Text>,
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      width: 130,
      render: (v) =>
        v === "paid" ? (
          <Tag color="success">Đã thanh toán</Tag>
        ) : (
          <Tag color="warning">Chờ</Tag>
        ),
    },
    {
      title: "",
      key: "action",
      width: 130,
      render: (_, r) =>
        r.status === "paid" ? null : (
          <Popconfirm
            title="Xác nhận đã nhận tiền?"
            description="Đánh dấu đã thanh toán + nâng gói cho người dùng."
            okText="Xác nhận"
            cancelText="Huỷ"
            onConfirm={() => void confirm(r.id)}
          >
            <Button
              type="primary"
              size="small"
              icon={<CheckOutlined />}
              loading={confirming === r.id}
            >
              Xác nhận
            </Button>
          </Popconfirm>
        ),
    },
  ];

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <Title level={3} style={{ margin: 0 }}>
            Thanh toán
          </Title>
          <Text type="secondary">
            Đối soát giao dịch · xác nhận thủ công khi SePay không tự khớp
          </Text>
        </div>
        <Space>
          <Segmented
            value={status}
            onChange={(v) => setStatus(v as string)}
            options={[
              { label: "Tất cả", value: "all" },
              { label: "Chờ", value: "pending" },
              { label: "Đã thanh toán", value: "paid" },
            ]}
          />
          <Button
            type="primary"
            icon={<SyncOutlined />}
            loading={syncing}
            onClick={() => void sync()}
          >
            Đồng bộ SePay
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => void load(page, status)}>
            Tải lại
          </Button>
        </Space>
      </div>
      <Card style={{ boxShadow: CARD_SHADOW }} styles={{ body: { padding: 0 } }}>
        <Table<AdminPayment>
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={items}
          pagination={{
            current: page,
            pageSize: 20,
            total,
            showSizeChanger: false,
            onChange: (p) => void load(p, status),
          }}
          scroll={{ x: 720 }}
        />
      </Card>
    </Space>
  );
}
