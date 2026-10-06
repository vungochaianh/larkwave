"use client";

import { ReloadOutlined, ThunderboltOutlined } from "@ant-design/icons";
import {
  App,
  Button,
  Card,
  Empty,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import type { SuggestionRunEntry } from "@larkwave/shared";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { CARD_SHADOW } from "@/lib/theme";

const { Title, Text, Paragraph } = Typography;

const TRACK_COLOR: Record<string, string> = {
  web: "blue",
  mobile: "green",
  extension: "purple",
};

export default function AdminSuggestionsPage() {
  const { message } = App.useApp();
  const [items, setItems] = useState<SuggestionRunEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = useCallback(
    async (p = 1) => {
      setLoading(true);
      try {
        const res = await api.adminListSuggestionRuns({ page: p, pageSize: 20 });
        setItems(res.items);
        setTotal(res.total);
        setPage(p);
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

  const run = async () => {
    setRunning(true);
    try {
      const r = await api.adminRunSuggestions();
      message.success(`Đã tạo ${r.count} gợi ý mới.`);
      void load(1);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setRunning(false);
    }
  };

  const columns: ColumnsType<SuggestionRunEntry> = [
    {
      title: "Thời gian",
      dataIndex: "createdAt",
      width: 170,
      render: (v) => <Text type="secondary">{formatDate(v)}</Text>,
    },
    {
      title: "Số gợi ý",
      dataIndex: "count",
      width: 110,
      align: "center",
      render: (v) => (
        <Tag color="purple" bordered={false}>
          {v}
        </Tag>
      ),
    },
    {
      title: "Model",
      dataIndex: "model",
      width: 160,
      render: (v) => <Text code>{v}</Text>,
    },
    {
      title: "Gợi ý",
      key: "items",
      render: (_, r) => (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {r.items.map((s, i) => (
            <Tag
              key={`${r.id}-${i}`}
              color={s.track ? TRACK_COLOR[s.track] : "default"}
              bordered={false}
              title={s.prompt}
              style={{ marginInlineEnd: 0 }}
            >
              {s.label}
            </Tag>
          ))}
        </div>
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
            Gợi ý hằng ngày
          </Title>
          <Paragraph type="secondary" style={{ margin: 0, maxWidth: 640 }}>
            Bộ gợi ý ý tưởng app được Claude tạo tự động mỗi ngày và hiển thị trên
            trang chủ. Lần chạy mới nhất là bộ người dùng đang thấy.
          </Paragraph>
        </div>
        <Space>
          <Button
            type="primary"
            icon={<ThunderboltOutlined />}
            loading={running}
            onClick={() => void run()}
          >
            Tạo lại ngay
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => void load(page)}>
            Tải lại
          </Button>
        </Space>
      </div>
      <Card style={{ boxShadow: CARD_SHADOW }} styles={{ body: { padding: 0 } }}>
        <Table<SuggestionRunEntry>
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={items}
          locale={{
            emptyText: (
              <Empty description="Chưa có lần chạy nào — bấm “Tạo lại ngay”." />
            ),
          }}
          pagination={{
            current: page,
            pageSize: 20,
            total,
            showSizeChanger: false,
            onChange: (p) => void load(p),
          }}
          scroll={{ x: 720 }}
        />
      </Card>
    </Space>
  );
}
