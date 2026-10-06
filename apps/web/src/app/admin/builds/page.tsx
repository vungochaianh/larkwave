"use client";

import { ReloadOutlined } from "@ant-design/icons";
import {
  App,
  Button,
  Drawer,
  Select,
  Space,
  Table,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import type { Build, BuildStatus } from "@larkwave/shared";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import BuildDetail from "@/components/BuildDetail";
import { BuildStatusTag, TrackTag } from "@/components/StatusTags";

const { Title, Text } = Typography;

export default function AdminBuildsPage() {
  const { message } = App.useApp();
  const [items, setItems] = useState<Build[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<BuildStatus | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<Build | null>(null);

  const load = useCallback(
    async (p = 1, st = status) => {
      setLoading(true);
      try {
        const res = await api.listBuilds({
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

  const columns: ColumnsType<Build> = [
    {
      title: "Yêu cầu",
      dataIndex: "prompt",
      key: "prompt",
      ellipsis: true,
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      width: 150,
      render: (_, r) => <BuildStatusTag status={r.status} />,
    },
    {
      title: "Loại",
      dataIndex: "track",
      key: "track",
      width: 100,
      render: (_, r) => <TrackTag track={r.track} />,
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
          Tất cả builds
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
              { value: "queued", label: "Trong hàng đợi" },
              { value: "running", label: "Đang chạy" },
              { value: "succeeded", label: "Thành công" },
              { value: "failed", label: "Thất bại" },
              { value: "canceled", label: "Đã huỷ" },
            ]}
          />
          <Button icon={<ReloadOutlined />} onClick={() => load(page, status)} />
        </Space>
      </div>

      <Table<Build>
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={items}
        onRow={(r) => ({
          onClick: () => setActive(r),
          style: { cursor: "pointer" },
        })}
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

      <Drawer
        title="Chi tiết build"
        width={Math.min(720, typeof window !== "undefined" ? window.innerWidth - 40 : 720)}
        open={!!active}
        onClose={() => setActive(null)}
        destroyOnClose
      >
        {active && <BuildDetail buildId={active.id} track={active.track} />}
      </Drawer>
    </Space>
  );
}
