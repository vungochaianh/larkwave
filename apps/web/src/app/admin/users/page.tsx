"use client";

import {
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  GiftOutlined,
  LoginOutlined,
  PlusOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import Link from "next/link";
import {
  App,
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import type { Role, User, UserStatus } from "@larkwave/shared";
import { api, APP_BASE_URL } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { RoleTag, UserStatusTag } from "@/components/StatusTags";

const { Title, Text } = Typography;

/** Grantable plans (matches the backend PLAN_IDS + labels). */
const PLAN_OPTIONS = [
  { value: "free", label: "Miễn phí" },
  { value: "starter", label: "Khởi đầu" },
  { value: "pro", label: "Chuyên nghiệp" },
  { value: "enterprise", label: "Doanh nghiệp" },
];
const planLabel = (p?: string) => PLAN_OPTIONS.find((o) => o.value === p)?.label ?? p ?? "—";

export default function AdminUsersPage() {
  const { message, modal } = App.useApp();
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const [grantOpen, setGrantOpen] = useState(false);
  const [grantUser, setGrantUser] = useState<User | null>(null);
  const [granting, setGranting] = useState(false);
  const [grantForm] = Form.useForm();

  const load = useCallback(
    async (p = 1) => {
      setLoading(true);
      try {
        const res = await api.listUsers({ page: p, pageSize: 15 });
        setUsers(res.items);
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

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ role: "user" });
    setOpen(true);
  };

  const openEdit = (u: User) => {
    setEditing(u);
    form.resetFields();
    form.setFieldsValue({
      name: u.name,
      role: u.role,
      status: u.status,
      password: "",
    });
    setOpen(true);
  };

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      if (editing) {
        await api.updateUser(editing.id, {
          name: values.name,
          role: values.role as Role,
          status: values.status as UserStatus,
          ...(values.password ? { password: values.password } : {}),
        });
        message.success("Đã cập nhật người dùng");
      } else {
        await api.createUser({
          email: values.email,
          password: values.password,
          name: values.name,
          role: values.role as Role,
        });
        message.success("Đã tạo người dùng");
      }
      setOpen(false);
      void load(page);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // Open the user's builder session (toolswave.net) in a new tab to inspect
  // their conversations / builds. Mints an impersonation token (admin-only, audited).
  const impersonate = (u: User) => {
    modal.confirm({
      title: "Vào tài khoản người dùng?",
      content: `Mở phiên của ${u.email} ở toolswave.net (tab mới) để xem hội thoại, app & chẩn đoán lỗi. Hành động này được ghi log.`,
      okText: "Vào tài khoản",
      cancelText: "Huỷ",
      onOk: async () => {
        try {
          const res = await api.impersonateUser(u.id);
          const url = `${APP_BASE_URL}/auth/callback?token=${encodeURIComponent(
            res.token,
          )}&imp=1&next=${encodeURIComponent("/apps")}`;
          window.open(url, "_blank", "noopener,noreferrer");
          message.success(`Đang mở phiên của ${u.email}…`);
        } catch (e) {
          message.error((e as Error).message);
        }
      },
    });
  };

  const remove = (u: User) => {
    modal.confirm({
      title: "Xoá người dùng?",
      content: `Bạn chắc chắn muốn xoá ${u.email}? Hành động không thể hoàn tác.`,
      okText: "Xoá",
      okButtonProps: { danger: true },
      cancelText: "Huỷ",
      onOk: async () => {
        try {
          await api.deleteUser(u.id);
          message.success("Đã xoá người dùng");
          void load(page);
        } catch (e) {
          message.error((e as Error).message);
        }
      },
    });
  };

  // Kích hoạt / tặng gói: grants the plan (fresh credit window like a paid one). A paid grant
  // fires a "🎁 được tặng gói" notification to the user (server-side).
  const openGrant = (u: User) => {
    setGrantUser(u);
    grantForm.resetFields();
    grantForm.setFieldsValue({
      plan: u.plan && u.plan !== "free" ? u.plan : "pro",
      months: 1,
      resetQuota: true,
    });
    setGrantOpen(true);
  };

  const submitGrant = async () => {
    if (!grantUser) return;
    const values = await grantForm.validateFields();
    setGranting(true);
    try {
      await api.setUserPlan(grantUser.id, {
        plan: values.plan,
        months: values.months ?? 1,
        resetQuota: values.resetQuota ?? true,
      });
      message.success(
        values.plan === "free"
          ? `Đã đặt gói của ${grantUser.email} về Miễn phí`
          : `Đã kích hoạt gói ${planLabel(values.plan)} cho ${grantUser.email} — đã gửi thông báo tặng.`,
      );
      setGrantOpen(false);
      void load(page);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setGranting(false);
    }
  };

  const columns: ColumnsType<User> = [
    {
      title: "Người dùng",
      dataIndex: "email",
      key: "email",
      render: (_, r) => (
        <Link href={`/admin/users/${r.id}`}>
          <Space direction="vertical" size={0}>
            <Text strong>{r.name || "—"}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {r.email}
            </Text>
          </Space>
        </Link>
      ),
    },
    {
      title: "Vai trò",
      dataIndex: "role",
      key: "role",
      width: 130,
      render: (_, r) => <RoleTag role={r.role} />,
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      width: 130,
      render: (_, r) => <UserStatusTag status={r.status} />,
    },
    {
      title: "Gói",
      dataIndex: "plan",
      key: "plan",
      width: 130,
      render: (_, r) => (
        <Tag color={r.plan && r.plan !== "free" ? "gold" : "default"} bordered={false}>
          {planLabel(r.plan)}
        </Tag>
      ),
    },
    {
      title: "Apps",
      dataIndex: "appsCount",
      key: "appsCount",
      width: 80,
      render: (v?: number) => <Tag bordered={false}>{v ?? 0}</Tag>,
    },
    {
      title: "Tạo lúc",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 160,
      render: (v) => <Text type="secondary">{formatDate(v)}</Text>,
    },
    {
      title: "",
      key: "actions",
      width: 196,
      render: (_, r) => (
        <Space>
          <Tooltip title="Chi tiết & hỗ trợ (hội thoại, build, lỗi)">
            <Link href={`/admin/users/${r.id}`}>
              <Button size="small" aria-label="Chi tiết người dùng" icon={<EyeOutlined />} />
            </Link>
          </Tooltip>
          <Tooltip title="Kích hoạt / tặng gói">
            <Button
              size="small"
              aria-label="Kích hoạt gói"
              icon={<GiftOutlined />}
              onClick={() => openGrant(r)}
            />
          </Tooltip>
          <Tooltip title="Vào tài khoản (xem hội thoại & chẩn đoán)">
            <Button
              size="small"
              aria-label="Vào tài khoản"
              icon={<LoginOutlined />}
              onClick={() => impersonate(r)}
            />
          </Tooltip>
          <Tooltip title="Sửa">
            <Button
              size="small"
              aria-label="Sửa người dùng"
              icon={<EditOutlined />}
              onClick={() => openEdit(r)}
            />
          </Tooltip>
          <Tooltip title="Xoá">
            <Button
              size="small"
              danger
              aria-label="Xoá người dùng"
              icon={<DeleteOutlined />}
              onClick={() => remove(r)}
            />
          </Tooltip>
        </Space>
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
        }}
      >
        <Title level={3} style={{ margin: 0 }}>
          Người dùng
        </Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => load(page)} />
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Thêm người dùng
          </Button>
        </Space>
      </div>

      <Table<User>
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={users}
        scroll={{ x: 980 }}
        pagination={{
          current: page,
          pageSize: 15,
          total,
          showSizeChanger: false,
          onChange: (p) => {
            setPage(p);
            void load(p);
          },
        }}
      />

      <Modal
        title={editing ? "Sửa người dùng" : "Thêm người dùng"}
        open={open}
        onOk={submit}
        confirmLoading={saving}
        onCancel={() => setOpen(false)}
        okText={editing ? "Lưu" : "Tạo"}
        cancelText="Huỷ"
        destroyOnClose
      >
        <Form form={form} layout="vertical" requiredMark={false}>
          {!editing && (
            <Form.Item
              name="email"
              label="Email"
              rules={[
                { required: true, message: "Nhập email" },
                { type: "email", message: "Email không hợp lệ" },
              ]}
            >
              <Input placeholder="nguoidung@email.com" />
            </Form.Item>
          )}
          <Form.Item name="name" label="Tên">
            <Input placeholder="Tên hiển thị" />
          </Form.Item>
          <Form.Item
            name="password"
            label={editing ? "Mật khẩu mới (để trống nếu không đổi)" : "Mật khẩu"}
            rules={
              editing
                ? [{ min: 8, message: "Tối thiểu 8 ký tự" }]
                : [
                    { required: true, message: "Nhập mật khẩu" },
                    { min: 8, message: "Tối thiểu 8 ký tự" },
                  ]
            }
          >
            <Input.Password placeholder="••••••••" autoComplete="new-password" />
          </Form.Item>
          <Form.Item name="role" label="Vai trò" rules={[{ required: true }]}>
            <Select
              options={[
                { value: "user", label: "Người dùng" },
                { value: "admin", label: "Quản trị" },
              ]}
            />
          </Form.Item>
          {editing && (
            <Form.Item name="status" label="Trạng thái">
              <Select
                options={[
                  { value: "active", label: "Hoạt động" },
                  { value: "suspended", label: "Tạm khoá" },
                ]}
              />
            </Form.Item>
          )}
        </Form>
      </Modal>

      <Modal
        title={grantUser ? `Kích hoạt gói — ${grantUser.email}` : "Kích hoạt gói"}
        open={grantOpen}
        onOk={submitGrant}
        confirmLoading={granting}
        onCancel={() => setGrantOpen(false)}
        okText="Kích hoạt"
        cancelText="Huỷ"
        destroyOnClose
      >
        <Form form={grantForm} layout="vertical" requiredMark={false}>
          <Form.Item name="plan" label="Gói" rules={[{ required: true, message: "Chọn gói" }]}>
            <Select options={PLAN_OPTIONS} />
          </Form.Item>
          <Form.Item name="months" label="Số tháng" tooltip="Chu kỳ hạn mức (1–24 tháng)">
            <InputNumber min={1} max={24} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="resetQuota" label="Đặt lại hạn mức đã dùng về 0" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Text type="secondary" style={{ fontSize: 12.5 }}>
            Gói trả phí sẽ gửi ngay thông báo “🎁 Bạn được tặng gói …” tới người dùng.
          </Text>
        </Form>
      </Modal>
    </Space>
  );
}
