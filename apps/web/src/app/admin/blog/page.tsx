"use client";

import {
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  PlusOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import {
  App,
  Button,
  Card,
  Drawer,
  Form,
  Input,
  Popconfirm,
  Segmented,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import type { BlogPost, BlogPostStatus, CreateBlogPostRequest } from "@larkwave/shared";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { APP_BASE_URL } from "@/lib/api";
import { CARD_SHADOW } from "@/lib/theme";
import BlogMarkdown from "@/components/BlogMarkdown";
import { V } from "@larkwave/ui";

const { Title, Text } = Typography;
const { TextArea } = Input;

type EditorValues = {
  title: string;
  slug?: string;
  excerpt?: string;
  content: string;
  coverImage?: string;
  tags?: string[];
  status: BlogPostStatus;
  featured?: boolean;
  authorName?: string;
  seoTitle?: string;
  seoDescription?: string;
};

const STATUS_TAG: Record<BlogPostStatus, { color: string; label: string }> = {
  draft: { color: "default", label: "Bản nháp" },
  published: { color: "success", label: "Đã đăng" },
};

export default function AdminBlogPage() {
  const { message } = App.useApp();
  const [items, setItems] = useState<BlogPost[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<"all" | BlogPostStatus>("all");
  const [loading, setLoading] = useState(true);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<BlogPost | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<EditorValues>();
  const contentPreview = Form.useWatch("content", form) ?? "";

  const load = useCallback(
    async (p = 1, status: "all" | BlogPostStatus = "all") => {
      setLoading(true);
      try {
        const res = await api.adminBlogPosts({
          page: p,
          pageSize: 20,
          status: status === "all" ? undefined : status,
        });
        setItems(res.items);
        setTotal(res.total);
        setPage(res.page);
      } catch (e) {
        message.error((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [message],
  );

  useEffect(() => {
    void load(1, statusFilter);
  }, [load, statusFilter]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ status: "draft", content: "", title: "", featured: false, tags: [] });
    setOpen(true);
  };

  const openEdit = async (row: BlogPost) => {
    try {
      // Fetch the full record (list already carries everything, but stay consistent).
      const full = await api.adminBlogPost(row.id);
      setEditing(full);
      form.setFieldsValue({
        title: full.title,
        slug: full.slug,
        excerpt: full.excerpt ?? undefined,
        content: full.content,
        coverImage: full.coverImage ?? undefined,
        tags: full.tags,
        status: full.status,
        featured: full.featured,
        authorName: full.authorName ?? undefined,
        seoTitle: full.seoTitle ?? undefined,
        seoDescription: full.seoDescription ?? undefined,
      });
      setOpen(true);
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const submit = async () => {
    let values: EditorValues;
    try {
      values = await form.validateFields();
    } catch {
      return; // validation errors shown inline
    }
    setSaving(true);
    try {
      const payload: CreateBlogPostRequest = {
        title: values.title.trim(),
        slug: values.slug?.trim() || undefined,
        excerpt: values.excerpt?.trim() || undefined,
        content: values.content ?? "",
        coverImage: values.coverImage?.trim() || undefined,
        tags: values.tags ?? [],
        status: values.status,
        featured: !!values.featured,
        authorName: values.authorName?.trim() || undefined,
        seoTitle: values.seoTitle?.trim() || undefined,
        seoDescription: values.seoDescription?.trim() || undefined,
      };
      if (editing) {
        await api.updateBlogPost(editing.id, payload);
        message.success("Đã lưu bài viết.");
      } else {
        await api.createBlogPost(payload);
        message.success("Đã tạo bài viết.");
      }
      setOpen(false);
      void load(editing ? page : 1, statusFilter);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const togglePublish = async (row: BlogPost) => {
    try {
      const next: BlogPostStatus = row.status === "published" ? "draft" : "published";
      await api.updateBlogPost(row.id, { status: next });
      message.success(next === "published" ? "Đã đăng bài." : "Đã chuyển về nháp.");
      void load(page, statusFilter);
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const remove = async (row: BlogPost) => {
    try {
      await api.deleteBlogPost(row.id);
      message.success("Đã xoá bài viết.");
      void load(page, statusFilter);
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const columns: ColumnsType<BlogPost> = [
    {
      title: "Tiêu đề",
      dataIndex: "title",
      render: (_, r) => (
        <div style={{ minWidth: 0 }}>
          <Text strong ellipsis style={{ display: "block" }}>
            {r.title}
            {r.featured && (
              <Tag color="purple" bordered={false} style={{ marginLeft: 8 }}>
                Nổi bật
              </Tag>
            )}
          </Text>
          <Text type="secondary" style={{ fontSize: 12.5 }}>
            /blog/{r.slug}
          </Text>
        </div>
      ),
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      width: 120,
      render: (s: BlogPostStatus) => (
        <Tag color={STATUS_TAG[s].color} bordered={false}>
          {STATUS_TAG[s].label}
        </Tag>
      ),
    },
    { title: "Tác giả", dataIndex: "authorName", width: 160, render: (a: string | null) => a || "—" },
    { title: "Lượt xem", dataIndex: "views", width: 100, align: "right" },
    {
      title: "Cập nhật",
      dataIndex: "updatedAt",
      width: 130,
      render: (d: string) => <Text type="secondary" style={{ fontSize: 12.5 }}>{formatDate(d)}</Text>,
    },
    {
      title: "",
      key: "actions",
      width: 220,
      render: (_, r) => (
        <Space size={4}>
          <Button size="small" icon={<EditOutlined />} onClick={() => void openEdit(r)}>
            Sửa
          </Button>
          <Button size="small" onClick={() => void togglePublish(r)}>
            {r.status === "published" ? "Ẩn" : "Đăng"}
          </Button>
          {r.status === "published" && (
            <Button
              size="small"
              type="text"
              icon={<EyeOutlined />}
              href={`${APP_BASE_URL}/blog/${r.slug}`}
              target="_blank"
              aria-label="Xem bài viết"
            />
          )}
          <Popconfirm
            title="Xoá bài viết này?"
            okText="Xoá"
            cancelText="Không"
            okButtonProps={{ danger: true }}
            onConfirm={() => void remove(r)}
          >
            <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label="Xoá" />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" size={18} style={{ width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>
            Blog
          </Title>
          <Text type="secondary">Soạn, đăng và quản lý bài viết hiển thị ở /blog.</Text>
        </div>
        <Space style={{ marginLeft: "auto" }}>
          <Button icon={<ReloadOutlined />} onClick={() => void load(page, statusFilter)}>
            Tải lại
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Tạo bài viết
          </Button>
        </Space>
      </div>

      <Card style={{ boxShadow: CARD_SHADOW }} styles={{ body: { padding: 16 } }}>
        <Segmented
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as "all" | BlogPostStatus)}
          options={[
            { label: "Tất cả", value: "all" },
            { label: "Đã đăng", value: "published" },
            { label: "Bản nháp", value: "draft" },
          ]}
          style={{ marginBottom: 14 }}
        />
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={items}
          pagination={{
            current: page,
            pageSize: 20,
            total,
            onChange: (p) => void load(p, statusFilter),
            showSizeChanger: false,
          }}
          scroll={{ x: 800 }}
        />
      </Card>

      <Drawer
        title={editing ? "Sửa bài viết" : "Tạo bài viết"}
        width={Math.min(880, typeof window !== "undefined" ? window.innerWidth - 40 : 880)}
        open={open}
        onClose={() => setOpen(false)}
        destroyOnClose
        extra={
          <Space>
            <Button onClick={() => setOpen(false)}>Huỷ</Button>
            <Button type="primary" loading={saving} onClick={() => void submit()}>
              Lưu
            </Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical" initialValues={{ status: "draft", featured: false }}>
          <Form.Item
            name="title"
            label="Tiêu đề"
            rules={[{ required: true, message: "Nhập tiêu đề" }]}
          >
            <Input placeholder="Ví dụ: Tạo CRM trong 10 phút bằng AI" />
          </Form.Item>

          <Space style={{ width: "100%" }} size={12} align="start">
            <Form.Item name="slug" label="Slug (đường dẫn)" style={{ flex: 1, minWidth: 0 }} extra="Bỏ trống để tự tạo từ tiêu đề.">
              <Input placeholder="tao-crm-bang-ai" addonBefore="/blog/" />
            </Form.Item>
            <Form.Item name="status" label="Trạng thái">
              <Select
                style={{ width: 150 }}
                options={[
                  { label: "Bản nháp", value: "draft" },
                  { label: "Đã đăng", value: "published" },
                ]}
              />
            </Form.Item>
          </Space>

          <Form.Item name="excerpt" label="Tóm tắt" extra="Hiển thị trên thẻ bài viết + mô tả SEO mặc định.">
            <TextArea rows={2} maxLength={300} showCount placeholder="Một-hai câu giới thiệu nội dung bài viết…" />
          </Form.Item>

          <Form.Item name="coverImage" label="Ảnh bìa (URL)">
            <Input placeholder="https://… (tuỳ chọn)" />
          </Form.Item>

          <Form.Item name="tags" label="Thẻ / chủ đề">
            <Select mode="tags" tokenSeparators={[","]} placeholder="Hướng dẫn, Mẹo, Case study…" open={false} />
          </Form.Item>

          <Form.Item
            name="content"
            label="Nội dung (Markdown)"
            rules={[{ required: true, message: "Nhập nội dung" }]}
          >
            <TextArea
              rows={14}
              placeholder={"# Tiêu đề phụ\n\nNội dung bài viết, hỗ trợ **đậm**, *nghiêng*, `code`, [link](https://…), danh sách - , > trích dẫn, ```khối code``` và ảnh ![alt](url)."}
              style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 13.5 }}
            />
          </Form.Item>

          {contentPreview.trim() && (
            <Card
              size="small"
              title="Xem trước"
              style={{ marginBottom: 18, background: `${V.surfaceAlt}` }}
              styles={{ body: { maxHeight: 360, overflowY: "auto" } }}
            >
              <BlogMarkdown content={contentPreview} />
            </Card>
          )}

          <Form.Item name="featured" label="Nổi bật trên trang chủ" valuePropName="checked">
            <Switch />
          </Form.Item>

          <Form.Item name="authorName" label="Tên tác giả" extra="Bỏ trống để dùng email của bạn.">
            <Input placeholder="Larkwave" />
          </Form.Item>

          <Title level={5} style={{ marginTop: 8 }}>
            SEO (tuỳ chọn)
          </Title>
          <Form.Item name="seoTitle" label="Tiêu đề SEO">
            <Input placeholder="Mặc định = tiêu đề bài viết" />
          </Form.Item>
          <Form.Item name="seoDescription" label="Mô tả SEO">
            <TextArea rows={2} maxLength={300} showCount placeholder="Mặc định = tóm tắt" />
          </Form.Item>
        </Form>
      </Drawer>
    </Space>
  );
}
