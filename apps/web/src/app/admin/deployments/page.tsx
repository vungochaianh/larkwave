"use client";

import { ReloadOutlined } from "@ant-design/icons";
import { App, Button, Select, Space, Table, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import type { Deployment, DeploymentStatus } from "@larkwave/shared";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { DeploymentStatusTag } from "@/components/StatusTags";

const { Title, Text } = Typography;

export default function AdminDeploymentsPage() {
  const { message } = App.useApp();
  const [items, setItems] = useState<Deployment[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<DeploymentStatus | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (p = 1, st = status) => {
      setLoading(true);
      try {
        const res = await api.listDeployments({
          page: p,
          pageSize: 15,
          ...(st ? { status: st } : {}),
        });
        setItems(res.items);
        setTotal(res.total);
      } catch (e) {
        message.error((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [status, message],
  );

  useEffect(() => {
    void load(1, undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const columns: ColumnsType<Deployment> = [
    {
      title: "URL",
      dataIndex: "url",
      key: "url",
      ellipsis: true,
      render: (v: string) => (
        <a href={v} target="_blank" rel="noreferrer">
          {v}
        </a>
      ),
    },
    {
      title: "Project",
      dataIndex: "pagesProject",
      key: "pagesProject",
      width: 200,
      render: (v: string) => <Text type="secondary">{v}</Text>,
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      width: 140,
      render: (_, r) => <DeploymentStatusTag status={r.status} />,
    },
    {
      title: "Tạo lúc",
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
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <Title level={3} style={{ margin: 0 }}>
          Deployments
        </Title>
        <Space>
          <Select
            allowClear
            placeholder="Lọc trạng thái"
            style={{ width: 180 }}
            value={status}
            onChange={(v) => {
              setStatus(v);
              setPage(1);
              void load(1, v);
            }}
            options={[
              { value: "live", label: "Đang chạy" },
              { value: "superseded", label: "Đã thay thế" },
              { value: "failed", label: "Thất bại" },
            ]}
          />
          <Button icon={<ReloadOutlined />} onClick={() => load(page, status)} />
        </Space>
      </div>

      <Table<Deployment>
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={items}
        scroll={{ x: 720 }}
        pagination={{
          current: page,
          pageSize: 15,
          total,
          showSizeChanger: false,
          onChange: (p) => {
            setPage(p);
            void load(p, status);
          },
        }}
      />
    </Space>
  );
}
