"use client";

import {
  DeleteOutlined,
  EyeOutlined,
  FlagOutlined,
  LinkOutlined,
  ReloadOutlined,
  StopOutlined,
  UndoOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import {
  App,
  Button,
  Card,
  Descriptions,
  Drawer,
  Input,
  Modal,
  Popconfirm,
  Segmented,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import type { App as AppEntity } from "@larkwave/shared";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { AppStatusTag, TrackTag } from "@/components/StatusTags";
import { V, ERR } from "@larkwave/ui";

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

type TabKey = "all" | "flagged" | "suspended";

const TAB_OPTIONS: { label: string; value: TabKey }[] = [
  { label: "Tất cả", value: "all" },
  { label: "Cần xem xét", value: "flagged" },
  { label: "Đang tạm ngưng", value: "suspended" },
];

function FlagTag({ flagged }: { flagged?: boolean }) {
  if (!flagged) return <Text type="secondary">—</Text>;
  return (
    <Tag color="error" bordered={false} icon={<FlagOutlined />}>
      Vi phạm
    </Tag>
  );
}

function ModerationInner() {
  const { message } = App.useApp();
  const router = useRouter();
  const params = useSearchParams();

  const initialTab = (params.get("tab") as TabKey) || "all";
  const [tab, setTab] = useState<TabKey>(
    ["all", "flagged", "suspended"].includes(initialTab) ? initialTab : "all",
  );
  const [items, setItems] = useState<AppEntity[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  // drawer state
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<AppEntity | null>(null);
  // Live-preview iframe loading state. X-Frame-Options/CSP refusals never fire
  // onLoad, so a timeout fallback clears the spinner instead of hanging forever.
  const [frameLoading, setFrameLoading] = useState(true);
  useEffect(() => {
    if (!current?.currentUrl) return;
    setFrameLoading(true);
    const t = setTimeout(() => setFrameLoading(false), 6000);
    return () => clearTimeout(t);
  }, [current?.currentUrl]);

  // suspend modal state
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [acting, setActing] = useState(false);

  const queryFor = useCallback(
    (t: TabKey, p: number, search: string) => ({
      page: p,
      pageSize: 12,
      q: search || undefined,
      flagged: t === "flagged" ? true : undefined,
      status: t === "suspended" ? "suspended" : undefined,
    }),
    [],
  );

  const load = useCallback(
    async (t: TabKey, p = 1, search = "") => {
      setLoading(true);
      try {
        const res = await api.adminApps(queryFor(t, p, search));
        setItems(res.items);
        setTotal(res.total);
      } catch (e) {
        message.error((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [message, queryFor],
  );

  useEffect(() => {
    void load(tab, 1, q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const changeTab = (t: TabKey) => {
    setTab(t);
    setPage(1);
    router.replace(`/admin/moderation?tab=${t}`);
  };

  const refreshCurrent = useCallback(
    (updated: AppEntity) => {
      setCurrent(updated);
      void load(tab, page, q);
    },
    [load, tab, page, q],
  );

  const openDrawer = (a: AppEntity) => {
    setCurrent(a);
    setOpen(true);
  };

  // ── actions ──
  const doSuspend = async () => {
    if (!current) return;
    const r = reason.trim();
    if (r.length < 1) {
      message.warning("Vui lòng nhập lý do tạm ngưng");
      return;
    }
    setActing(true);
    try {
      const updated = await api.suspendApp(current.id, r);
      message.success(
        `Đã tạm ngưng "${updated.name}" — app đã được gỡ khỏi tên miền công khai`,
      );
      setSuspendOpen(false);
      setReason("");
      refreshCurrent(updated);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setActing(false);
    }
  };

  const doUnsuspend = async (a: AppEntity) => {
    setActing(true);
    try {
      const updated = await api.unsuspendApp(a.id);
      message.success(`Đã khôi phục "${updated.name}"`);
      refreshCurrent(updated);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setActing(false);
    }
  };

  const doDelete = async (a: AppEntity) => {
    setActing(true);
    try {
      await api.deleteApp(a.id);
      message.success(`Đã gỡ vĩnh viễn "${a.name}"`);
      setOpen(false);
      setCurrent(null);
      void load(tab, page, q);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setActing(false);
    }
  };

  const columns: ColumnsType<AppEntity> = useMemo(
    () => [
      {
        title: "App",
        dataIndex: "name",
        key: "name",
        render: (_, r) => (
          <Space direction="vertical" size={0}>
            <Space size={6}>
              <Text strong>{r.name}</Text>
              {r.flagged ? (
                <Tooltip title="Khớp từ khoá cấm">
                  <FlagOutlined style={{ color: ERR }} />
                </Tooltip>
              ) : null}
            </Space>
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
        width: 92,
        render: (_, r) => <TrackTag track={r.track} />,
      },
      {
        title: "Trạng thái",
        dataIndex: "status",
        key: "status",
        width: 120,
        render: (_, r) => <AppStatusTag status={r.status} />,
      },
      {
        title: "Cờ vi phạm",
        dataIndex: "flagged",
        key: "flagged",
        width: 120,
        render: (_, r) => <FlagTag flagged={r.flagged} />,
      },
      {
        title: "Liên kết",
        dataIndex: "currentUrl",
        key: "currentUrl",
        width: 90,
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
        width: 150,
        render: (v) => <Text type="secondary">{formatDate(v)}</Text>,
      },
      {
        title: "",
        key: "actions",
        width: 90,
        render: (_, r) => (
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => openDrawer(r)}
          >
            Xem
          </Button>
        ),
      },
    ],
    [],
  );

  const isSuspended = current?.status === "suspended";

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
            Kiểm duyệt App
          </Title>
          <Text type="secondary">
            Rà soát, tạm ngưng hoặc gỡ các app vi phạm. Mọi thao tác đều được ghi
            nhật ký.
          </Text>
        </div>
        <Space wrap>
          <Input.Search
            placeholder="Tìm tên / slug…"
            allowClear
            style={{ width: 240 }}
            onSearch={(v) => {
              setQ(v);
              setPage(1);
              void load(tab, 1, v);
            }}
          />
          <Button
            icon={<ReloadOutlined />}
            onClick={() => load(tab, page, q)}
            loading={loading}
          />
        </Space>
      </div>

      <Segmented<TabKey>
        value={tab}
        onChange={(v) => changeTab(v)}
        options={TAB_OPTIONS}
      />

      <Card styles={{ body: { padding: 0 } }}>
        <Table<AppEntity>
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={items}
          pagination={{
            current: page,
            pageSize: 12,
            total,
            showSizeChanger: false,
            onChange: (p) => {
              setPage(p);
              void load(tab, p, q);
            },
          }}
        />
      </Card>

      {/* Detail / preview drawer */}
      <Drawer
        title={current ? `Kiểm duyệt · ${current.name}` : "Kiểm duyệt"}
        width={Math.min(880, typeof window !== "undefined" ? window.innerWidth - 40 : 880)}
        open={open}
        onClose={() => setOpen(false)}
        destroyOnClose
        extra={
          current?.currentUrl ? (
            <Button
              icon={<LinkOutlined />}
              href={current.currentUrl}
              target="_blank"
              rel="noreferrer"
            >
              Mở tab mới
            </Button>
          ) : null
        }
      >
        {current ? (
          <Space direction="vertical" size="large" style={{ width: "100%" }}>
            {isSuspended && current.suspendReason ? (
              <Card
                size="small"
                styles={{ body: { padding: 12 } }}
                style={{
                  border: `1px solid ${ERR}3d`,
                  background: `${ERR}14`,
                }}
              >
                <Space align="start" size={8}>
                  <WarningOutlined style={{ color: ERR, marginTop: 3 }} />
                  <div>
                    <Text strong style={{ color: ERR }}>
                      Đang tạm ngưng
                    </Text>
                    <Paragraph style={{ margin: 0 }} type="secondary">
                      Lý do: {current.suspendReason}
                    </Paragraph>
                  </div>
                </Space>
              </Card>
            ) : null}

            {/* Live preview */}
            <div>
              <Text type="secondary" style={{ fontSize: 12.5, fontWeight: 600 }}>
                Xem trước trực tiếp
              </Text>
              <div
                style={{
                  position: "relative",
                  marginTop: 8,
                  borderRadius: 12,
                  overflow: "hidden",
                  border: `1px solid ${V.border}`,
                  background: V.layer,
                  height: 420,
                }}
              >
                {current.currentUrl ? (
                  <>
                    <iframe
                      key={current.currentUrl}
                      src={current.currentUrl}
                      title={`preview-${current.slug}`}
                      sandbox="allow-scripts allow-same-origin allow-forms"
                      referrerPolicy="no-referrer"
                      onLoad={() => setFrameLoading(false)}
                      style={{ width: "100%", height: "100%", border: "none" }}
                    />
                    {frameLoading ? (
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          background: V.layer,
                        }}
                      >
                        <Spin />
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div
                    style={{
                      height: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: V.textFaint,
                    }}
                  >
                    {isSuspended
                      ? "App đã bị gỡ khỏi tên miền — không có bản xem trước"
                      : "App chưa có bản deploy công khai"}
                  </div>
                )}
              </div>
            </div>

            {/* Meta */}
            <Descriptions
              size="small"
              column={1}
              bordered
              styles={{ label: { width: 150 } }}
              items={[
                {
                  key: "owner",
                  label: "Chủ sở hữu",
                  children: current.owner?.email ?? current.ownerId,
                },
                {
                  key: "status",
                  label: "Trạng thái",
                  children: <AppStatusTag status={current.status} />,
                },
                {
                  key: "track",
                  label: "Loại",
                  children: <TrackTag track={current.track} />,
                },
                {
                  key: "flagged",
                  label: "Cờ vi phạm",
                  children: <FlagTag flagged={current.flagged} />,
                },
                {
                  key: "url",
                  label: "URL",
                  children: current.currentUrl ? (
                    <a href={current.currentUrl} target="_blank" rel="noreferrer">
                      {current.currentUrl}
                    </a>
                  ) : (
                    "—"
                  ),
                },
                {
                  key: "desc",
                  label: "Mô tả / prompt",
                  children: current.description || "—",
                },
                {
                  key: "updated",
                  label: "Cập nhật",
                  children: formatDate(current.updatedAt),
                },
              ]}
            />

            {/* Moderation actions */}
            <Card
              size="small"
              title="Hành động kiểm duyệt"
              styles={{ body: { padding: 16 } }}
            >
              <Space wrap>
                {isSuspended ? (
                  <Button
                    type="primary"
                    icon={<UndoOutlined />}
                    loading={acting}
                    onClick={() => doUnsuspend(current)}
                  >
                    Khôi phục
                  </Button>
                ) : (
                  <Button
                    danger
                    icon={<StopOutlined />}
                    onClick={() => {
                      setReason("");
                      setSuspendOpen(true);
                    }}
                  >
                    Tạm ngưng
                  </Button>
                )}
                <Popconfirm
                  title="Gỡ vĩnh viễn app này?"
                  description="Xoá Pages project + DNS + repo. Không thể hoàn tác."
                  okText="Gỡ vĩnh viễn"
                  okButtonProps={{ danger: true, loading: acting }}
                  cancelText="Huỷ"
                  onConfirm={() => doDelete(current)}
                >
                  <Button danger type="text" icon={<DeleteOutlined />}>
                    Gỡ vĩnh viễn
                  </Button>
                </Popconfirm>
              </Space>
              <Paragraph
                type="secondary"
                style={{ margin: "12px 0 0", fontSize: 12 }}
              >
                Tạm ngưng sẽ gỡ <Text code>{current.slug}.toolswave.net</Text>{" "}
                khỏi mạng và đánh dấu các deployment đang chạy là “bị thay thế”.
                Hành động được ghi vào nhật ký quản trị.
              </Paragraph>
            </Card>
          </Space>
        ) : null}
      </Drawer>

      {/* Suspend reason modal */}
      <Modal
        title="Tạm ngưng app"
        open={suspendOpen}
        onCancel={() => setSuspendOpen(false)}
        onOk={doSuspend}
        okText="Tạm ngưng"
        okButtonProps={{ danger: true, loading: acting }}
        cancelText="Huỷ"
        destroyOnClose
      >
        <Paragraph type="secondary" style={{ marginTop: 4 }}>
          App <Text strong>{current?.name}</Text> sẽ bị gỡ khỏi tên miền công
          khai ngay lập tức. Nhập lý do (hiển thị nội bộ &amp; ghi nhật ký).
        </Paragraph>
        <TextArea
          autoFocus
          rows={4}
          maxLength={500}
          showCount
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="VD: Nội dung cờ bạc / lừa đảo, vi phạm chính sách nền tảng…"
        />
      </Modal>
    </Space>
  );
}

export default function AdminModerationPage() {
  return (
    <Suspense fallback={null}>
      <ModerationInner />
    </Suspense>
  );
}
