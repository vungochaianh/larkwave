"use client";

import { ReloadOutlined } from "@ant-design/icons";
import { App, Button, Space, Table, Tag, Tooltip, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import type { AuditLogEntry } from "@larkwave/shared";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";

const { Title, Text } = Typography;

export default function AdminAuditPage() {
  const { message } = App.useApp();
  const [items, setItems] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (p = 1) => {
      setLoading(true);
      try {
        const res = await api.listAudit({ page: p, pageSize: 20 });
        setItems(res.items);
        setTotal(res.total);
      } catch (e) {
        message.error((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [message],
  );

  useEffect(() => {
    void load(1);
  }, [load]);

  const columns: ColumnsType<AuditLogEntry> = [
    {
      title: "Hành động",
      dataIndex: "action",
      key: "action",
      width: 200,
      render: (v: string) => (
        <Tag color="gold" bordered={false}>
          {v}
        </Tag>
      ),
    },
    {
      title: "Người thực hiện",
      dataIndex: "actorEmail",
      key: "actorEmail",
      render: (v: string | null) => (
        <Text type="secondary">{v ?? "hệ thống"}</Text>
      ),
    },
    {
      title: "Đối tượng",
      dataIndex: "target",
      key: "target",
      render: (v: string | null) =>
        v ? (
          <Tooltip title={v}>
            <Text
              type="secondary"
              style={{ fontFamily: "monospace", fontSize: 12 }}
            >
              {v.length > 24 ? `${v.slice(0, 24)}…` : v}
            </Text>
          </Tooltip>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: "Thời gian",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 170,
      render: (v) => <Text type="secondary">{formatDate(v)}</Text>,
    },
  ];

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Title level={3} style={{ margin: 0 }}>
          Nhật ký hoạt động
        </Title>
        <Button icon={<ReloadOutlined />} onClick={() => load(page)} />
      </div>

      <Table<AuditLogEntry>
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={items}
        pagination={{
          current: page,
          pageSize: 20,
          total,
          showSizeChanger: false,
          onChange: (p) => {
            setPage(p);
            void load(p);
          },
        }}
      />
    </Space>
  );
}
