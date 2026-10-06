"use client";

import {
  EditOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  GiftOutlined,
  LinkOutlined,
  PlusOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import {
  Alert,
  App,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Segmented,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { STORE_KINDS } from "@larkwave/shared";
import { api, APP_BASE_URL } from "@/lib/api";
import { formatVnd } from "@/lib/billing";
import { formatDate } from "@/lib/format";
import { CARD_SHADOW } from "@/lib/theme";
import StoreGrantModal from "@/components/admin/StoreGrantModal";
import {
  KIND_LABEL,
  KIND_ON_STOREFRONT,
  STATUS_META,
  type AdminStoreRow,
  type ListingStatus,
  type StoreKind,
} from "./_types";

const { Title, Text } = Typography;

/** Bộ lọc gom vào MỘT state để hiệu ứng nạp lại chỉ có một phụ thuộc, không phải bốn. */
interface Filters {
  status: ListingStatus | "all";
  kind?: StoreKind;
  q?: string;
  category?: string;
}

const PAGE_SIZE = 20;

/**
 * Gợi ý slug từ tên, soi theo `AdminStoreService.normalizeSlug` của máy chủ.
 *
 * Cố ý KHÔNG dùng `slugify` của gói dùng chung: hàm đó cắt ở 40 ký tự và rơi về chuỗi "app" khi
 * rỗng, vì nó sinh tên miền con cho Cloudflare Pages. Slug cửa hàng là một đường dẫn (trần 120
 * ký tự) và một cái tên "app" lặng lẽ thay cho tên thật là thứ chỉ bị phát hiện sau khi trang đã
 * lên Google. Đây chỉ là GỢI Ý — máy chủ vẫn chuẩn hoá lại lần nữa, nên hai bên lệch nhau vài ký
 * tự cũng không sinh ra slug sai.
 */
function goiYSlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120)
    .replace(/-+$/g, "");
}

/**
 * DANH SÁCH SẢN PHẨM của cửa hàng (giai đoạn 2).
 *
 * Bảng này đọc thẳng bảng `Listing` của hệ này, không đi qua portal. Ba việc làm ở đây mỗi ngày:
 * tìm một món, gỡ nó xuống hoặc trả nó lên, và cấp một món cho khách vừa chuyển khoản. Mọi thứ
 * còn lại (đặc tả, SEO, đường giao hàng) nằm ở trang chi tiết — nhét hết vào một bảng thì hai ô
 * mà chủ yêu cầu đích danh sẽ chìm nghỉm giữa hai mươi cột.
 *
 * Máy chủ sắp theo `updatedAt` giảm dần, không theo `sortOrder`: đây là bảng LÀM VIỆC, thứ vừa
 * sửa phải nằm trên đầu. `sortOrder` là thứ tự bày hàng cho khách, việc của trang công khai.
 */
export default function AdminStorePage() {
  const { message } = App.useApp();
  const router = useRouter();

  const [items, setItems] = useState<AdminStoreRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>({ status: "all" });

  const [creating, setCreating] = useState(false);
  const [grantFor, setGrantFor] = useState<AdminStoreRow | null>(null);
  const [grantOpen, setGrantOpen] = useState(false);

  const load = useCallback(
    async (p: number, f: Filters) => {
      setLoading(true);
      try {
        const res = await api.adminStoreListings({
          page: p,
          pageSize: PAGE_SIZE,
          kind: f.kind,
          status: f.status === "all" ? undefined : f.status,
          q: f.q || undefined,
          category: f.category || undefined,
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
    void load(1, filters);
  }, [load, filters]);

  /**
   * Ẩn/hiện. Đi qua tuyến `…/status` riêng chứ không qua bản sửa chung, vì đây là thao tác duy
   * nhất ở trang quản trị có hậu quả nhìn thấy ngay trên trang công khai — tách ra thì nhật ký
   * có một dòng đọc được ("ai gỡ món này xuống lúc mấy giờ").
   */
  const doiTrangThai = async (row: AdminStoreRow, next: ListingStatus) => {
    try {
      await api.adminSetStoreListingStatus(row.id, next);
      message.success(
        next === "active"
          ? `Đã trả "${row.name}" lên mặt tiền.`
          : `Đã gỡ "${row.name}" khỏi mặt tiền. Đơn cũ vẫn giữ nguyên tên và giá.`,
      );
      void load(page, filters);
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const columns: ColumnsType<AdminStoreRow> = [
    {
      title: "Sản phẩm",
      key: "name",
      render: (_, r) => (
        <div style={{ minWidth: 0 }}>
          <Link href={`/admin/store/${r.id}`} style={{ fontWeight: 600 }}>
            {r.name}
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Text type="secondary" style={{ fontSize: 12.5 }}>
              /store/{r.kind}/{r.slug}
            </Text>
            {r.hasDelivery && (
              <Tooltip title="Món này đã có đường giao hàng (link tải / repo). Nội dung chỉ xem được ở thẻ Giao hàng, và mỗi lượt xem đều vào nhật ký.">
                <Tag bordered={false} color="geekblue" style={{ marginInlineEnd: 0 }}>
                  có đường giao
                </Tag>
              </Tooltip>
            )}
            {r.legacyId && (
              <Tooltip title={`Nhập từ hệ B, id cũ ${r.legacyId}`}>
                <Tag bordered={false} style={{ marginInlineEnd: 0 }}>
                  nhập
                </Tag>
              </Tooltip>
            )}
          </div>
        </div>
      ),
    },
    {
      title: "Loại",
      dataIndex: "kind",
      width: 160,
      render: (k: StoreKind) => (
        <Space size={4} direction="vertical">
          <Tag bordered={false} color="purple" style={{ marginInlineEnd: 0 }}>
            {KIND_LABEL[k] ?? k}
          </Tag>
          {!KIND_ON_STOREFRONT.includes(k) && (
            <Tooltip title="Mặt tiền /store hiện chỉ bày mã nguồn. Loại này quản lý được ở đây nhưng khách chưa thấy — xem giai đoạn 4/5 của kế hoạch.">
              <Text type="secondary" style={{ fontSize: 11.5 }}>
                chưa lên mặt tiền
              </Text>
            </Tooltip>
          )}
        </Space>
      ),
    },
    {
      title: "Giá",
      dataIndex: "priceVnd",
      width: 150,
      align: "right",
      render: (_, r) => (
        <div>
          <Text strong>{formatVnd(r.priceVnd)}</Text>
          {!!r.compareAtVnd && r.compareAtVnd > r.priceVnd && (
            <div>
              <Text delete type="secondary" style={{ fontSize: 12 }}>
                {formatVnd(r.compareAtVnd)}
              </Text>
            </div>
          )}
        </div>
      ),
    },
    {
      title: "Đã bán",
      dataIndex: "totalSold",
      width: 90,
      align: "right",
      render: (v: number) => (v > 0 ? v : <Text type="secondary">—</Text>),
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      width: 120,
      render: (s: ListingStatus) => (
        <Tooltip title={STATUS_META[s]?.hint}>
          <Tag color={STATUS_META[s]?.color ?? "default"} bordered={false}>
            {STATUS_META[s]?.label ?? s}
          </Tag>
        </Tooltip>
      ),
    },
    {
      title: "Cập nhật",
      dataIndex: "updatedAt",
      width: 140,
      render: (d: string) => (
        <Text type="secondary" style={{ fontSize: 12.5 }}>
          {formatDate(d)}
        </Text>
      ),
    },
    {
      title: "",
      key: "actions",
      width: 220,
      render: (_, r) => (
        <Space size={4}>
          <Button size="small" icon={<EditOutlined />} onClick={() => router.push(`/admin/store/${r.id}`)}>
            Sửa
          </Button>
          <Tooltip title="Cấp món này cho một khách">
            <Button
              size="small"
              icon={<GiftOutlined />}
              onClick={() => {
                setGrantFor(r);
                setGrantOpen(true);
              }}
              aria-label={`Cấp ${r.name} cho khách`}
            />
          </Tooltip>
          {r.status === "active" ? (
            <Popconfirm
              title="Gỡ món này khỏi mặt tiền?"
              description="Đơn hàng cũ vẫn đọc được tên và giá — ẩn không phải là xoá."
              okText="Ẩn"
              cancelText="Không"
              onConfirm={() => void doiTrangThai(r, "hidden")}
            >
              <Tooltip title="Ẩn khỏi /store">
                <Button size="small" type="text" icon={<EyeInvisibleOutlined />} aria-label="Ẩn" />
              </Tooltip>
            </Popconfirm>
          ) : (
            <Tooltip title="Trả lên /store">
              <Button
                size="small"
                type="text"
                icon={<EyeOutlined />}
                onClick={() => void doiTrangThai(r, "active")}
                aria-label="Hiện"
              />
            </Tooltip>
          )}
          {r.status === "active" && KIND_ON_STOREFRONT.includes(r.kind) && (
            <Tooltip title="Mở trang bán công khai">
              <Button
                size="small"
                type="text"
                icon={<LinkOutlined />}
                href={`${APP_BASE_URL}/store/${r.kind}/${r.slug}`}
                target="_blank"
                aria-label="Xem trang bán"
              />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" size={18} style={{ width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>
            Cửa hàng
          </Title>
          <Text type="secondary">
            Danh mục hàng bán của hệ này — giá, đặc tả, SEO và quyền của khách.
          </Text>
        </div>
        <Space style={{ marginLeft: "auto" }} wrap>
          <Button icon={<ReloadOutlined />} onClick={() => void load(page, filters)}>
            Tải lại
          </Button>
          <Button
            icon={<GiftOutlined />}
            onClick={() => {
              setGrantFor(null);
              setGrantOpen(true);
            }}
          >
            Cấp dự án
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
            Tạo món
          </Button>
        </Space>
      </div>

      {/* Nói thật về độ trễ: trang bán đệm danh mục ~30 giây khi đọc từ bảng này. Không có dòng
          này thì mỗi lần sửa giá rồi F5 trang công khai mà thấy giá cũ, người ta sẽ nghĩ nút Lưu
          hỏng và bấm thêm vài lần nữa. */}
      <Alert
        type="info"
        showIcon
        message="Sửa ở đây đổi dữ liệu của hệ này, không đổi dữ liệu portal."
        description="Trang bán công khai đệm danh mục khoảng 30 giây, nên thay đổi không hiện ngay lập tức. Món nào chưa có trong bảng này thì /store vẫn đọc tạm từ portal (giai đoạn 1)."
      />

      <Card style={{ boxShadow: CARD_SHADOW }} styles={{ body: { padding: 16 } }}>
        <Space wrap size={10} style={{ marginBottom: 14, width: "100%" }}>
          <Segmented
            value={filters.status}
            onChange={(v) => setFilters((f) => ({ ...f, status: v as Filters["status"] }))}
            options={[
              { label: "Tất cả", value: "all" },
              { label: "Đang bán", value: "active" },
              { label: "Đã ẩn", value: "hidden" },
              { label: "Hết hàng", value: "sold_out" },
            ]}
          />
          <Select
            allowClear
            placeholder="Mọi loại hàng"
            style={{ width: 190 }}
            value={filters.kind}
            onChange={(v) => setFilters((f) => ({ ...f, kind: v }))}
            options={STORE_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))}
          />
          {/* Tìm kiếm là FORM GỬI ĐI, không phải gõ-tới-đâu-gọi-tới-đó: mỗi phím một truy vấn
              `contains` không chỉ mục trên hơn 500 dòng là thứ chạy được hôm nay và đắt dần. */}
          <Input.Search
            allowClear
            placeholder="Tìm theo tên hoặc slug…"
            style={{ width: 260 }}
            defaultValue={filters.q}
            onSearch={(v) => setFilters((f) => ({ ...f, q: v.trim() || undefined }))}
          />
          <Input
            allowClear
            placeholder="Chuyên mục (khớp đúng tên)"
            style={{ width: 220 }}
            defaultValue={filters.category}
            onPressEnter={(e) =>
              setFilters((f) => ({
                ...f,
                category: (e.target as HTMLInputElement).value.trim() || undefined,
              }))
            }
            onBlur={(e) =>
              setFilters((f) => ({ ...f, category: e.target.value.trim() || undefined }))
            }
          />
        </Space>

        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={items}
          pagination={{
            current: page,
            pageSize: PAGE_SIZE,
            total,
            showSizeChanger: false,
            showTotal: (t) => `${t} món`,
            onChange: (p) => void load(p, filters),
          }}
          scroll={{ x: 980 }}
        />
      </Card>

      <CreateListingModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(id) => {
          setCreating(false);
          // Đẩy thẳng sang trang chi tiết: một món vừa tạo còn thiếu đặc tả, SEO và đường giao
          // hàng, và chỗ điền chúng là trang kia. Để người dùng tự tìm đường quay lại là cách
          // sinh ra những món nửa vời nằm im trong danh mục.
          router.push(`/admin/store/${id}`);
        }}
      />

      <StoreGrantModal
        open={grantOpen}
        onClose={() => setGrantOpen(false)}
        listing={grantFor}
      />
    </Space>
  );
}

interface CreateValues {
  kind: StoreKind;
  name: string;
  slug: string;
  priceVnd: number;
  category?: string;
  descriptionShort?: string;
}

/**
 * TẠO MÓN BẰNG TAY.
 *
 * Phần lớn danh mục do script nhập từ hệ B đổ vào; chỗ này dành cho `service` (làm theo yêu cầu)
 * và các món `app` của giai đoạn 4 — những thứ không có nguồn nào khác. Cố tình chỉ hỏi năm ô:
 * một món mới chưa bán được gì cho tới khi có đặc tả và đường giao hàng, mà hai thứ đó thuộc về
 * trang chi tiết. Hỏi hết ở đây chỉ tạo ra một biểu mẫu dài mà ai cũng bỏ dở giữa chừng.
 */
function CreateListingModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<CreateValues>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) form.resetFields();
  }, [open, form]);

  const submit = async () => {
    let v: CreateValues;
    try {
      v = await form.validateFields();
    } catch {
      return;
    }
    setSaving(true);
    try {
      const created = await api.adminCreateStoreListing({
        kind: v.kind,
        name: v.name.trim(),
        slug: v.slug.trim(),
        priceVnd: Math.max(0, Math.round(v.priceVnd ?? 0)),
        category: v.category?.trim() || undefined,
        descriptionShort: v.descriptionShort?.trim() || undefined,
        // Món mới luôn ở trạng thái ẩn. Một món chưa có đặc tả, chưa có ảnh, chưa có đường giao
        // hàng mà đã nằm trên mặt tiền là một trang bán trống dẫn khách vào ngõ cụt — và Google
        // đọc được nó trước khi ai kịp sửa.
        status: "hidden",
      });
      message.success(`Đã tạo "${created.name}" ở trạng thái ẩn.`);
      onCreated(created.id);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Tạo món bán"
      open={open}
      onCancel={onClose}
      destroyOnHidden
      okText="Tạo"
      cancelText="Huỷ"
      confirmLoading={saving}
      onOk={() => void submit()}
      width={560}
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{ kind: "sourcecode" as StoreKind, priceVnd: 0 }}
      >
        <Form.Item
          name="kind"
          label="Loại hàng"
          extra="Không sửa được sau khi tạo: đổi loại là đổi cả đường dẫn công khai lẫn cách giao hàng."
          rules={[{ required: true, message: "Chọn loại hàng" }]}
        >
          <Select options={STORE_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))} />
        </Form.Item>

        <Form.Item
          name="name"
          label="Tên sản phẩm"
          rules={[{ required: true, message: "Nhập tên sản phẩm" }]}
        >
          <Input
            placeholder="Ví dụ: Website bán hàng Next.js + Prisma"
            onBlur={(e) => {
              // Gợi ý slug khi ô còn trống. Không ghi đè slug người ta đã gõ — slug là URL, và
              // một URL tự đổi dưới tay người dùng là chuyện không được phép xảy ra.
              const cur = form.getFieldValue("slug");
              if (!cur) form.setFieldsValue({ slug: goiYSlug(e.target.value) });
            }}
          />
        </Form.Item>

        <Form.Item
          name="slug"
          label="Slug (đường dẫn)"
          extra="Duy nhất theo từng loại hàng. Máy chủ chuẩn hoá lại (bỏ dấu, thường hoá, thay khoảng trắng bằng dấu gạch)."
          rules={[{ required: true, message: "Nhập slug" }]}
        >
          <Input placeholder="website-ban-hang-nextjs" />
        </Form.Item>

        <Form.Item
          name="priceVnd"
          label="Giá (VNĐ)"
          extra="Số nguyên đồng. Giá 0 hợp lệ — dùng cho hàng tặng kèm."
          rules={[{ required: true, message: "Nhập giá" }]}
        >
          <InputNumber<number>
            min={0}
            step={100_000}
            style={{ width: "100%" }}
            formatter={(v) => `${v ?? ""}`.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}
            parser={(v) => Number((v ?? "").replace(/[^\d]/g, ""))}
          />
        </Form.Item>

        <Form.Item name="category" label="Chuyên mục">
          <Input placeholder="Thương mại điện tử" />
        </Form.Item>

        <Form.Item name="descriptionShort" label="Mô tả ngắn">
          <Input.TextArea rows={2} maxLength={500} showCount placeholder="Một-hai câu hiện trên thẻ sản phẩm." />
        </Form.Item>
      </Form>
    </Modal>
  );
}
