"use client";

import { DeleteOutlined, LinkOutlined, ReloadOutlined } from "@ant-design/icons";
import {
  App,
  Button,
  Input,
  Space,
  Table,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { App as AppEntity } from "@larkwave/shared";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { AppStatusTag, TrackTag } from "@/components/StatusTags";

const { Title, Text } = Typography;

export default function AdminAppsPage() {
  const { message, modal } = App.useApp();
  const [items, setItems] = useState<AppEntity[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (p = 1, search = "") => {
      setLoading(true);
      try {
        const res = await api.listApps({ page: p, pageSize: 15, q: search });
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
    void load(1, "");
  }, [load]);

  const remove = (a: AppEntity) => {
    modal.confirm({
      title: "Xoá app?",
      content: `Xoá "${a.name}"? Hành động không thể hoàn tác.`,
      okText: "Xoá",
      okButtonProps: { danger: true },
      cancelText: "Huỷ",
      onOk: async () => {
        try {
          await api.deleteApp(a.id);
          message.success("Đã xoá app");
          void load(page, q);
        } catch (e) {
          message.error((e as Error).message);
        }
      },
    });
  };

  const columns: ColumnsType<AppEntity> = [
    {
      title: "App",
      dataIndex: "name",
      key: "name",
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <Text strong>{r.name}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {r.slug}
          </Text>
        </Space>
      ),
    },
    {
      title: "Chủ sở hữu",
      dataIndex: ["owner", "email"],
      key: "owner",
      render: (_, r) => (
        <Text type="secondary">{r.owner?.email ?? r.ownerId}</Text>
      ),
    },
    {
      title: "Loại",
      dataIndex: "track",
      key: "track",
      width: 100,
      render: (_, r) => <TrackTag track={r.track} />,
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      width: 130,
      render: (_, r) => <AppStatusTag status={r.status} />,
    },
    {
      title: "Liên kết",
      dataIndex: "currentUrl",
      key: "currentUrl",
      render: (_, r) =>
        r.currentUrl ? (
          <Button
            type="link"
            size="small"
            icon={<LinkOutlined />}
            href={r.currentUrl}
            target="_blank"
          >
            Mở
          </Button>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: "Cập nhật",
      dataIndex: "updatedAt",
      key: "updatedAt",
      width: 160,
      render: (v) => <Text type="secondary">{formatDate(v)}</Text>,
    },
    {
      title: "",
      key: "actions",
      width: 60,
      render: (_, r) => (
        <Button
          size="small"
          danger
          aria-label="Xoá app"
          icon={<DeleteOutlined />}
          onClick={() => remove(r)}
        />
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
            Tất cả apps
          </Title>
          <Text type="secondary">
            Mọi app trên nền tảng. Kiểm duyệt &amp; tạm ngưng tại{" "}
            <Link href="/admin/moderation">Kiểm duyệt</Link>.
          </Text>
        </div>
        <Space>
          <Input.Search
            placeholder="Tìm theo tên…"
            allowClear
            style={{ width: 240 }}
            onSearch={(v) => {
              setQ(v);
              setPage(1);
              void load(1, v);
            }}
          />
          <Button icon={<ReloadOutlined />} onClick={() => load(page, q)} />
        </Space>
      </div>

      <Table<AppEntity>
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={items}
        scroll={{ x: 820 }}
        pagination={{
          current: page,
          pageSize: 15,
          total,
          showSizeChanger: false,
          onChange: (p) => {
            setPage(p);
            void load(p, q);
          },
        }}
      />
    </Space>
  );
}
