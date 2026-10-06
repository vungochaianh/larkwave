"use client";

import {
  ArrowLeftOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  FileTextOutlined,
  GiftOutlined,
  GlobalOutlined,
  LinkOutlined,
  LockOutlined,
  ProfileOutlined,
  ReloadOutlined,
  SaveOutlined,
} from "@ant-design/icons";
import {
  Alert,
  App,
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Result,
  Select,
  Skeleton,
  Space,
  Switch,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, APP_BASE_URL } from "@/lib/api";
import { formatVnd } from "@/lib/billing";
import { formatDate } from "@/lib/format";
import { CARD_SHADOW } from "@/lib/theme";
import MarkdownLite from "@/components/MarkdownLite";
import StoreGrantModal from "@/components/admin/StoreGrantModal";
import { V } from "@larkwave/ui";
import {
  KIND_LABEL,
  KIND_ON_STOREFRONT,
  STATUS_META,
  type AdminStoreDelivery,
  type AdminStoreListing,
} from "../_types";

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

const MONO = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 13.5 };

/**
 * SỬA MỘT SẢN PHẨM của cửa hàng.
 *
 * Chia thành các thẻ thay vì một biểu mẫu dài, vì hai lý do khác nhau và cả hai đều thật:
 *
 *  1. Chủ yêu cầu đích danh hai thứ — TÀI LIỆU (đặc tả + yêu cầu trước khi chạy) và SEO. Chúng
 *     phải tìm thấy trong một cái liếc mắt, không phải sau khi cuộn qua hai mươi ô khác.
 *  2. Mỗi thẻ LƯU RIÊNG phần của nó, và máy chủ nhận `PATCH` đúng nghĩa (trường không gửi = để
 *     yên). Nghĩa là hai người cùng sửa một món ở hai thẻ khác nhau không ghi đè lên nhau — thứ
 *     một biểu mẫu chung "gửi tất cả mọi thứ" không bao giờ làm được.
 *
 * Thẻ "Giao hàng" là ngoại lệ: nó đọc/ghi qua tuyến RIÊNG (`…/delivery`), nội dung nằm trong cột
 * đã mã hoá AES-256-GCM, và MỖI LƯỢT ĐỌC ĐỀU VÀO NHẬT KÝ. Vì vậy nó chỉ gọi khi người dùng thật
 * sự mở thẻ đó — nạp sẵn kèm trang sẽ biến dòng nhật ký "ai đã xem link tải" thành một bộ đếm
 * lượt mở trang vô nghĩa.
 */
export default function AdminStoreListingPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { message } = App.useApp();

  const [row, setRow] = useState<AdminStoreListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState<string | null>(null);
  const [tab, setTab] = useState("co-ban");
  const [grantOpen, setGrantOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRow(await api.adminStoreListing(id));
      setFailed(null);
    } catch (e) {
      setFailed((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const doiTrangThai = async () => {
    if (!row) return;
    const next = row.status === "active" ? "hidden" : "active";
    try {
      await api.adminSetStoreListingStatus(row.id, next);
      // Tuyến status trả về DÒNG RÚT GỌN (không có description/detail/seo), nên không gán thẳng
      // vào state đang giữ bản đầy đủ — vá đúng một trường và để mọi thứ khác yên.
      setRow((r) => (r ? { ...r, status: next } : r));
      message.success(next === "active" ? "Đã trả lên mặt tiền." : "Đã gỡ khỏi mặt tiền.");
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  if (loading && !row) return <Skeleton active paragraph={{ rows: 8 }} />;
  if (failed && !row) {
    return (
      <Result
        status="error"
        title="Không mở được món hàng này"
        subTitle={failed}
        extra={
          <Space>
            <Button onClick={() => void load()}>Thử lại</Button>
            <Link href="/admin/store">
              <Button type="primary">Về danh mục</Button>
            </Link>
          </Space>
        }
      />
    );
  }
  if (!row) return null;

  const meta = STATUS_META[row.status];
  const onStorefront = KIND_ON_STOREFRONT.includes(row.kind);

  return (
    <Space direction="vertical" size={18} style={{ width: "100%" }}>
      <div>
        <Link href="/admin/store">
          <Button type="text" size="small" icon={<ArrowLeftOutlined />} style={{ paddingInline: 4 }}>
            Danh mục
          </Button>
        </Link>
      </div>

      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <Space size={8} wrap align="center">
            <Title level={3} style={{ margin: 0 }}>
              {row.name}
            </Title>
            <Tag color="purple" bordered={false}>
              {KIND_LABEL[row.kind] ?? row.kind}
            </Tag>
            <Tooltip title={meta?.hint}>
              <Tag color={meta?.color ?? "default"} bordered={false}>
                {meta?.label ?? row.status}
              </Tag>
            </Tooltip>
          </Space>
          <div>
            <Text type="secondary" style={{ fontSize: 12.5 }}>
              /store/{row.kind}/{row.slug} · {formatVnd(row.priceVnd)} · đã bán {row.totalSold}
            </Text>
          </div>
        </div>
        <Space style={{ marginLeft: "auto" }} wrap>
          <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
            Tải lại
          </Button>
          <Button icon={<GiftOutlined />} onClick={() => setGrantOpen(true)}>
            Cấp cho khách
          </Button>
          <Button
            icon={row.status === "active" ? <EyeInvisibleOutlined /> : <EyeOutlined />}
            onClick={() => void doiTrangThai()}
          >
            {row.status === "active" ? "Ẩn khỏi /store" : "Trả lên /store"}
          </Button>
          {row.status === "active" && onStorefront && (
            <Button
              icon={<LinkOutlined />}
              href={`${APP_BASE_URL}/store/${row.kind}/${row.slug}`}
              target="_blank"
            >
              Xem trang bán
            </Button>
          )}
        </Space>
      </div>

      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          {
            key: "co-ban",
            label: (
              <span>
                <ProfileOutlined /> Cơ bản
              </span>
            ),
            children: <KhoiCoBan row={row} onSaved={setRow} />,
          },
          {
            key: "tai-lieu",
            label: (
              <span>
                <FileTextOutlined /> Tài liệu
              </span>
            ),
            children: <KhoiTaiLieu row={row} onSaved={setRow} />,
          },
          {
            key: "seo",
            label: (
              <span>
                <GlobalOutlined /> SEO
              </span>
            ),
            children: <KhoiSeo row={row} onSaved={setRow} />,
          },
          {
            key: "giao-hang",
            label: (
              <span>
                <LockOutlined /> Giao hàng
              </span>
            ),
            children: <KhoiGiaoHang listingId={row.id} active={tab === "giao-hang"} />,
          },
          {
            key: "noi-bo",
            label: "Nội bộ",
            children: <KhoiNoiBo row={row} onSaved={setRow} />,
          },
        ]}
      />

      <StoreGrantModal
        open={grantOpen}
        onClose={() => setGrantOpen(false)}
        listing={{ id: row.id, name: row.name, kind: row.kind }}
      />
    </Space>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Thẻ 1 — Cơ bản
// ─────────────────────────────────────────────────────────────────────────────

interface CoBanValues {
  name: string;
  slug: string;
  descriptionShort: string;
  description: string;
  thumbnailUrl: string;
  gallery: string[];
  priceVnd: number;
  compareAtVnd: number;
  category: string;
  sortOrder: number;
}

function KhoiCoBan({
  row,
  onSaved,
}: {
  row: AdminStoreListing;
  onSaved: (r: AdminStoreListing) => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<CoBanValues>();
  const [saving, setSaving] = useState(false);

  const save = async () => {
    let v: CoBanValues;
    try {
      v = await form.validateFields();
    } catch {
      return;
    }
    setSaving(true);
    try {
      // CHUỖI RỖNG là tín hiệu "xoá trắng", KHÔNG phải `null`: máy chủ gọi thẳng `.trim()` trên
      // mọi giá trị khác `undefined`, nên một `null` gửi lên là một cú 500 giữa lúc đang lưu.
      // Lý do đầy đủ nằm trong `AdminStoreListingInput` (_types.ts).
      const saved = await api.adminUpdateStoreListing(row.id, {
        name: v.name.trim(),
        slug: v.slug.trim(),
        descriptionShort: (v.descriptionShort ?? "").trim(),
        description: v.description ?? "",
        thumbnailUrl: (v.thumbnailUrl ?? "").trim(),
        gallery: v.gallery ?? [],
        priceVnd: Math.max(0, Math.round(v.priceVnd ?? 0)),
        // 0 = bỏ khuyến mãi (máy chủ đọc qua `|| null`).
        compareAtVnd: Math.max(0, Math.round(v.compareAtVnd ?? 0)),
        category: (v.category ?? "").trim(),
        sortOrder: Math.round(v.sortOrder ?? 0),
      });
      onSaved(saved);
      message.success("Đã lưu.");
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card style={{ boxShadow: CARD_SHADOW }}>
      <Form<CoBanValues>
        form={form}
        layout="vertical"
        initialValues={{
          name: row.name,
          slug: row.slug,
          descriptionShort: row.descriptionShort ?? "",
          description: row.description ?? "",
          thumbnailUrl: row.thumbnailUrl ?? "",
          gallery: row.gallery,
          priceVnd: row.priceVnd,
          compareAtVnd: row.compareAtVnd ?? 0,
          category: row.category ?? "",
          sortOrder: row.sortOrder,
        }}
      >
        <Form.Item name="name" label="Tên sản phẩm" rules={[{ required: true, message: "Nhập tên" }]}>
          <Input />
        </Form.Item>

        <Form.Item
          name="slug"
          label="Slug (đường dẫn)"
          rules={[{ required: true, message: "Nhập slug" }]}
          extra="ĐỔI SLUG LÀ ĐỔI URL ĐANG CHẠY THẬT. Link cũ chết và trang mất vị trí trên Google cho tới khi có chuyển hướng — chỉ sửa khi buộc phải sửa."
        >
          <Input addonBefore={`/store/${row.kind}/`} />
        </Form.Item>

        <Space size={12} align="start" wrap style={{ width: "100%" }}>
          <Form.Item name="priceVnd" label="Giá (VNĐ)" rules={[{ required: true, message: "Nhập giá" }]}>
            <InputNumber<number>
              min={0}
              step={100_000}
              style={{ width: 200 }}
              formatter={(v) => `${v ?? ""}`.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}
              parser={(v) => Number((v ?? "").replace(/[^\d]/g, ""))}
            />
          </Form.Item>
          <Form.Item name="compareAtVnd" label="Giá gạch ngang" extra="Để 0 = không khuyến mãi.">
            <InputNumber<number>
              min={0}
              step={100_000}
              style={{ width: 200 }}
              formatter={(v) => `${v ?? ""}`.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}
              parser={(v) => Number((v ?? "").replace(/[^\d]/g, ""))}
            />
          </Form.Item>
          <Form.Item name="category" label="Chuyên mục">
            <Input style={{ width: 230 }} placeholder="Thương mại điện tử" />
          </Form.Item>
          <Form.Item
            name="sortOrder"
            label="Thứ tự bày"
            extra="Số nhỏ đứng trước, trong cùng một loại hàng."
          >
            <InputNumber style={{ width: 130 }} />
          </Form.Item>
        </Space>

        <Form.Item
          name="descriptionShort"
          label="Mô tả ngắn"
          extra="Hiện trên thẻ sản phẩm ở /store và là mô tả SEO mặc định."
        >
          <TextArea rows={2} maxLength={500} showCount />
        </Form.Item>

        <Form.Item name="description" label="Mô tả đầy đủ" extra="Chỉ hiện ở trang chi tiết.">
          <TextArea rows={8} />
        </Form.Item>

        <Form.Item name="thumbnailUrl" label="Ảnh đại diện (URL)">
          <Input placeholder="https://… hoặc đường dẫn tương đối của portal" />
        </Form.Item>

        <Form.Item
          name="gallery"
          label="Thư viện ảnh"
          extra="Gõ từng URL rồi Enter. Máy chủ giữ tối đa 24 ảnh."
        >
          <Select mode="tags" open={false} tokenSeparators={[","]} placeholder="https://…" />
        </Form.Item>

        <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => void save()}>
          Lưu phần cơ bản
        </Button>
      </Form>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Thẻ 2 — Tài liệu (thứ chủ yêu cầu đích danh)
// ─────────────────────────────────────────────────────────────────────────────

interface TaiLieuValues {
  specDocument: string;
  prerequisites: string;
  languages: string[];
  version: string;
}

function KhoiTaiLieu({
  row,
  onSaved,
}: {
  row: AdminStoreListing;
  onSaved: (r: AdminStoreListing) => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<TaiLieuValues>();
  const [saving, setSaving] = useState(false);
  const spec = Form.useWatch("specDocument", form) ?? "";

  const save = async () => {
    const v = form.getFieldsValue();
    setSaving(true);
    try {
      // Chỉ gửi `detail`. Máy chủ GỘP theo từng khoá, nên những khoá không có mặt ở biểu mẫu này
      // (`fileType`, `inventoryType`, `availableCount` — do bản nhập từ hệ B dựng ra) vẫn còn
      // nguyên. Đó là lý do ở đây không gửi cả khối `detail` chụp từ `row`: chụp lại rồi gửi
      // ngược lên là cách vô tình ghi đè thứ vừa đổi ở một phiên khác.
      const saved = await api.adminUpdateStoreListing(row.id, {
        detail: {
          specDocument: v.specDocument ?? "",
          prerequisites: (v.prerequisites ?? "").trim(),
          languages: v.languages ?? [],
          version: (v.version ?? "").trim(),
        },
      });
      onSaved(saved);
      message.success("Đã lưu tài liệu.");
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Alert
        type="warning"
        showIcon
        message="Mọi thứ trong thẻ này là NỘI DUNG CÔNG KHAI."
        description="Khối `detail` đi thẳng ra API công khai của cửa hàng. Link tải, file ZIP và id repo GitLab KHÔNG được đặt ở đây — máy chủ từ chối thẳng nếu thấy chúng. Chỗ của chúng là thẻ Giao hàng (mã hoá, chỉ quản trị đọc được)."
      />

      <Form<TaiLieuValues>
        form={form}
        layout="vertical"
        initialValues={{
          specDocument: row.detail?.specDocument ?? "",
          prerequisites: row.detail?.prerequisites ?? "",
          languages: row.detail?.languages ?? [],
          version: row.detail?.version ?? "",
        }}
      >
        <Card
          title="Tài liệu đặc tả"
          style={{ boxShadow: CARD_SHADOW }}
          extra={
            <Text type="secondary" style={{ fontSize: 12.5 }}>
              Markdown nhẹ: **đậm**, `code`, gạch đầu dòng
            </Text>
          }
        >
          <Form.Item
            name="specDocument"
            extra="Đây là thứ người mua đọc trước khi xuống tiền: chạy bằng gì, gồm những màn nào, cái gì có và cái gì không. Trần 200.000 ký tự."
          >
            <TextArea rows={18} style={MONO} placeholder={"## Bộ này gồm gì\n\n- Trang quản trị, trang bán hàng, thanh toán\n\n## Chạy thử\n\n1. `pnpm i`\n2. `pnpm dev`"} />
          </Form.Item>

          {spec.trim() && (
            <Card
              size="small"
              title="Xem trước — đúng cách trang bán sẽ hiện"
              style={{ background: V.surfaceAlt, marginBottom: 16 }}
              styles={{ body: { maxHeight: 340, overflowY: "auto" } }}
            >
              <MarkdownLite text={spec} />
            </Card>
          )}

          <Form.Item
            name="prerequisites"
            label="Cần chuẩn bị trước khi chạy"
            extra="Node bản nào, cần tài khoản dịch vụ nào, có cần tên miền riêng không. Im lặng ở đây là nguồn của phần lớn phiếu hỗ trợ sau khi bán."
          >
            <TextArea rows={4} style={MONO} placeholder={"- Node 20+\n- Tài khoản Cloudflare (gói miễn phí là đủ)\n- Khoá API SePay nếu muốn bật thanh toán"} />
          </Form.Item>
        </Card>

        <Card title="Thông tin kỹ thuật" style={{ boxShadow: CARD_SHADOW, marginTop: 16 }}>
          <Form.Item
            name="languages"
            label="Công nghệ"
            extra="Bộ lọc chính của khách ở /store — 'có cái nào chạy Next.js + Prisma không' là câu hỏi thật. Gõ từng cái rồi Enter."
          >
            <Select mode="tags" open={false} tokenSeparators={[","]} placeholder="Next.js, Prisma, PostgreSQL" />
          </Form.Item>
          <Form.Item name="version" label="Phiên bản đang bán">
            <Input style={{ maxWidth: 260 }} placeholder="v2.1" />
          </Form.Item>
          <Text type="secondary" style={{ fontSize: 12.5 }}>
            Những khoá khác của món này (loại tệp, loại tồn kho, số suất còn lại) do bản nhập và
            kho hàng giữ — lưu ở đây không đụng tới chúng.
          </Text>
        </Card>

        <Button
          type="primary"
          icon={<SaveOutlined />}
          loading={saving}
          onClick={() => void save()}
          style={{ marginTop: 16 }}
        >
          Lưu tài liệu
        </Button>
      </Form>
    </Space>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Thẻ 3 — SEO (thứ chủ yêu cầu đích danh)
// ─────────────────────────────────────────────────────────────────────────────

interface SeoValues {
  enabled: boolean;
  title: string;
  description: string;
  keywords: string;
  ogImage: string;
  index: boolean;
  sitemap: boolean;
  robots: boolean;
  aiDiscovery: boolean;
}

function KhoiSeo({
  row,
  onSaved,
}: {
  row: AdminStoreListing;
  onSaved: (r: AdminStoreListing) => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<SeoValues>();
  const [saving, setSaving] = useState(false);
  const seo = row.seo ?? {};

  const save = async () => {
    const v = form.getFieldsValue();
    setSaving(true);
    try {
      // `seo` THAY CẢ KHỐI (khác `detail`), nên biểu mẫu này phải gửi ĐỦ mọi công tắc. Gộp từng
      // khoá sẽ khiến "tắt sitemap" không bao giờ tắt được vì giá trị cũ còn nằm đó — đó là lý
      // do máy chủ chọn thay khối, và cái giá là chỗ này không được phép gửi thiếu.
      const saved = await api.adminUpdateStoreListing(row.id, {
        seo: {
          enabled: v.enabled,
          title: (v.title ?? "").trim(),
          description: (v.description ?? "").trim(),
          keywords: (v.keywords ?? "").trim(),
          ogImage: (v.ogImage ?? "").trim(),
          index: v.index,
          sitemap: v.sitemap,
          robots: v.robots,
          aiDiscovery: v.aiDiscovery,
        },
      });
      onSaved(saved);
      message.success("Đã lưu SEO.");
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card style={{ boxShadow: CARD_SHADOW }}>
      <Form<SeoValues>
        form={form}
        layout="vertical"
        initialValues={{
          // Mặc định BẬT, giống hệt `cleanSeo` của máy chủ. Hai bên hiểu mặc định khác nhau thì
          // sẽ có ngày giao diện hiện "đang bật" trong khi trang bán mang thẻ noindex.
          enabled: seo.enabled !== false,
          title: seo.title ?? "",
          description: seo.description ?? "",
          keywords: seo.keywords ?? "",
          ogImage: seo.ogImage ?? "",
          index: seo.index !== false,
          sitemap: seo.sitemap !== false,
          robots: seo.robots !== false,
          aiDiscovery: seo.aiDiscovery !== false,
        }}
      >
        <Form.Item
          name="title"
          label="Tiêu đề SEO"
          extra={`Bỏ trống = dùng tên sản phẩm ("${row.name}").`}
        >
          <Input maxLength={200} showCount placeholder={row.name} />
        </Form.Item>

        <Form.Item
          name="description"
          label="Mô tả SEO"
          extra="Bỏ trống = dùng mô tả ngắn. Đây là dòng hiện dưới tiêu đề trên Google."
        >
          <TextArea rows={3} maxLength={500} showCount placeholder={row.descriptionShort ?? ""} />
        </Form.Item>

        <Form.Item name="keywords" label="Từ khoá" extra="Ngăn nhau bằng dấu phẩy.">
          <Input maxLength={300} placeholder="mã nguồn website bán hàng, next.js, source code" />
        </Form.Item>

        <Form.Item
          name="ogImage"
          label="Ảnh chia sẻ (OG image)"
          extra="Địa chỉ ĐẦY ĐỦ. Đây là tấm ảnh hiện khi ai đó dán link lên Facebook/Zalo — bỏ trống thì mạng xã hội tự chọn, và thường chọn sai."
        >
          <Input placeholder="https://toolswave.net/og/…png" />
        </Form.Item>

        <Space size={28} wrap style={{ marginBottom: 8 }}>
          <Form.Item name="enabled" label="Bật SEO" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="index" label="Cho phép lập chỉ mục" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="sitemap" label="Có trong sitemap" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="robots" label="robots.txt" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="aiDiscovery" label="Cho trợ lý AI đọc hiểu" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Space>

        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="Lưu SEO là ghi lại CẢ KHỐI."
          description="Khác thẻ Tài liệu (gộp theo từng khoá), khối SEO được thay nguyên vẹn mỗi lần lưu — nếu không thì một công tắc vừa tắt sẽ bị giá trị cũ bật lại."
        />

        <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => void save()}>
          Lưu SEO
        </Button>
      </Form>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Thẻ 4 — Giao hàng (tuyến riêng, mã hoá, ghi nhật ký cả lượt đọc)
// ─────────────────────────────────────────────────────────────────────────────

interface GiaoHangValues {
  driveLink: string;
  zipFileUrl: string;
  gitlabRepoId: string;
}

function KhoiGiaoHang({ listingId, active }: { listingId: string; active: boolean }) {
  const { message } = App.useApp();
  const [form] = Form.useForm<GiaoHangValues>();
  const [saving, setSaving] = useState(false);
  /**
   * `null` = chưa đọc. Biểu mẫu chỉ được VẼ RA sau khi có dữ liệu, và nhận giá trị qua
   * `initialValues` chứ không qua `setFieldsValue`.
   *
   * Không phải chuyện thẩm mỹ: `Card loading` thay toàn bộ phần con bằng khung xương, nên trong
   * lúc chờ thì `<Form>` chưa gắn vào đâu cả. Gọi `setFieldsValue` lên một biểu mẫu chưa gắn là
   * dựa vào thứ tự trộn nội bộ của rc-field-form để giá trị sống sót qua lần gắn sau đó — nó
   * đang đúng, nhưng "đang đúng nhờ chi tiết cài đặt của thư viện" là thứ vỡ ở một bản nâng cấp
   * nào đó và vỡ im lặng: ô link tải hiện ra trống trơn, người dùng tưởng món chưa có đường giao
   * rồi lưu đè lên bằng rỗng.
   */
  const [data, setData] = useState<AdminStoreDelivery | null>(null);

  // Chỉ gọi khi thẻ này thật sự được mở, và chỉ MỘT LẦN cho mỗi lần mở trang: mỗi lượt đọc là
  // một dòng nhật ký, và một bộ đếm tăng vì người dùng bấm qua bấm lại thì không trả lời được
  // câu hỏi "ai đã xem link tải của món này".
  useEffect(() => {
    if (!active || data) return;
    let huy = false;
    api
      .adminStoreDelivery(listingId)
      .then((d: AdminStoreDelivery) => {
        if (!huy) setData(d);
      })
      .catch((e: Error) => {
        if (!huy) message.error(e.message);
      });
    return () => {
      huy = true;
    };
  }, [active, data, listingId, message]);

  const save = async () => {
    const v = form.getFieldsValue();
    setSaving(true);
    try {
      // PUT THAY CẢ KHỐI: ba trường này mô tả MỘT cách giao, và gộp từng khoá sẽ khiến việc gỡ
      // một link chết trở nên bất khả. Xoá sạch cả ba = cột về `null`.
      const d = await api.adminSetStoreDelivery(listingId, {
        driveLink: (v.driveLink ?? "").trim() || undefined,
        zipFileUrl: (v.zipFileUrl ?? "").trim() || undefined,
        gitlabRepoId: (v.gitlabRepoId ?? "").trim() || undefined,
      });
      // Máy chủ cắt khoảng trắng và quy rỗng về `null`, nên viết lại đúng thứ nó vừa ghi thay vì
      // giữ bản người dùng gõ — hai bên lệch nhau một dấu cách là đủ để lần lưu sau trông như có
      // thay đổi trong khi không có gì đổi. Biểu mẫu ĐÃ gắn ở thời điểm này nên `setFieldsValue`
      // là đúng chỗ (khác lúc nạp lần đầu, xem chú thích của `data`).
      setData(d);
      form.setFieldsValue({
        driveLink: d.driveLink ?? "",
        zipFileUrl: d.zipFileUrl ?? "",
        gitlabRepoId: d.gitlabRepoId ?? "",
      });
      message.success("Đã lưu đường giao hàng.");
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Alert
        type="error"
        showIcon
        message="Nội dung nhạy cảm — mỗi lượt mở thẻ này ghi một dòng nhật ký."
        description="Ba trường dưới đây nằm trong cột đã mã hoá AES-256-GCM và không bao giờ đi ra API công khai. Đây đúng là chỗ đã rò ra ngoài bên portal hôm 23/09 và vừa được bịt — đừng chép chúng sang mô tả, đặc tả hay ghi chú."
      />
      <Card style={{ boxShadow: CARD_SHADOW }} loading={!data}>
        <Form<GiaoHangValues>
          form={form}
          layout="vertical"
          initialValues={{
            driveLink: data?.driveLink ?? "",
            zipFileUrl: data?.zipFileUrl ?? "",
            gitlabRepoId: data?.gitlabRepoId ?? "",
          }}
        >
          <Form.Item
            name="driveLink"
            label="Link Google Drive"
            extra="Cách hệ B giao tài liệu và một phần mã nguồn."
          >
            <Input style={MONO} placeholder="https://drive.google.com/…" />
          </Form.Item>
          <Form.Item name="zipFileUrl" label="File ZIP">
            <Input style={MONO} placeholder="https://…/source.zip" />
          </Form.Item>
          <Form.Item
            name="gitlabRepoId"
            label="Id repo GitLab"
            extra="Dùng để mời người mua vào repo sau khi thanh toán."
          >
            <Input style={MONO} placeholder="1234" />
          </Form.Item>

          <Space wrap>
            <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => void save()}>
              Lưu đường giao hàng
            </Button>
            <Text type="secondary" style={{ fontSize: 12.5 }}>
              Để trống cả ba rồi lưu = xoá sạch đường giao hàng của món này.
            </Text>
          </Space>
        </Form>
      </Card>
    </Space>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Thẻ 5 — Nội bộ
// ─────────────────────────────────────────────────────────────────────────────

interface NoiBoValues {
  notesInternal: string;
  appId: string;
  buildId: string;
}

function KhoiNoiBo({
  row,
  onSaved,
}: {
  row: AdminStoreListing;
  onSaved: (r: AdminStoreListing) => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<NoiBoValues>();
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const v = form.getFieldsValue();
    setSaving(true);
    try {
      const saved = await api.adminUpdateStoreListing(row.id, {
        notesInternal: (v.notesInternal ?? "").trim(),
        appId: (v.appId ?? "").trim(),
        buildId: (v.buildId ?? "").trim(),
      });
      onSaved(saved);
      message.success("Đã lưu.");
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card style={{ boxShadow: CARD_SHADOW }}>
        <Form<NoiBoValues>
          form={form}
          layout="vertical"
          initialValues={{
            notesInternal: row.notesInternal ?? "",
            appId: row.appId ?? "",
            buildId: row.buildId ?? "",
          }}
        >
          <Form.Item
            name="notesInternal"
            label="Ghi chú nội bộ"
            extra="Không bao giờ ra API công khai, kể cả khi món đang bán. Chỗ để ghi giá vốn, đầu mối liên hệ, thứ đã hứa với khách."
          >
            <TextArea rows={6} maxLength={10_000} showCount />
          </Form.Item>

          <Space size={12} wrap align="start">
            <Form.Item
              name="appId"
              label="App của nền tảng"
              extra="Chỉ với hàng loại app/tool. Để trống = gỡ liên kết."
            >
              <Input style={{ ...MONO, width: 280 }} placeholder="cmf…" />
            </Form.Item>
            <Form.Item
              name="buildId"
              label="Bản build đóng băng"
              extra="Bản được bán — người mua hôm nay và tháng sau nhận cùng một thứ."
            >
              <Input style={{ ...MONO, width: 280 }} placeholder="cmf…" />
            </Form.Item>
          </Space>

          <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => void save()}>
            Lưu ghi chú
          </Button>
        </Form>
      </Card>

      <Card title="Máy chủ giữ — chỉ đọc" style={{ boxShadow: CARD_SHADOW }}>
        <Descriptions
          size="small"
          column={1}
          bordered
          styles={{ label: { width: 190 } }}
          items={[
            { key: "id", label: "Id", children: <Text code copyable>{row.id}</Text> },
            {
              key: "legacy",
              label: "Id bên hệ B",
              children: row.legacyId ? (
                <Text code>{row.legacyId}</Text>
              ) : (
                <Text type="secondary">— (dòng này gõ tay, không phải nhập từ hệ B)</Text>
              ),
            },
            {
              key: "sold",
              label: "Đã bán",
              children: `${row.totalSold} lượt (máy chủ tự đếm theo đơn đã trả tiền)`,
            },
            {
              key: "inv",
              label: "Tồn kho còn bán được",
              children:
                row.kind === "software" ? (
                  `${row.availableInventory} suất`
                ) : (
                  <Text type="secondary">
                    không áp dụng — loại hàng này bán bản sao, không có khái niệm hết hàng
                  </Text>
                ),
            },
            { key: "created", label: "Tạo lúc", children: formatDate(row.createdAt) },
            { key: "updated", label: "Sửa lần cuối", children: formatDate(row.updatedAt) },
          ]}
        />
        <Paragraph type="secondary" style={{ fontSize: 12.5, marginTop: 12, marginBottom: 0 }}>
          Không có nút xoá, và đó là chủ ý. Xoá một món sẽ gỡ luôn liên kết từ đơn đã bán và từ
          quyền của người đã mua — tức lấy lại thứ khách đã trả tiền mà không ai ra lệnh đó. Gỡ
          hàng khỏi mặt tiền là đổi trạng thái sang &ldquo;ẩn&rdquo;.
        </Paragraph>
      </Card>
    </Space>
  );
}
