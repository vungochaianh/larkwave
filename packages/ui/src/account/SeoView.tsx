'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  App,
  Button,
  Card,
  Input,
  Skeleton,
  Space,
  Switch,
  Typography,
} from 'antd';
import {
  CheckCircleFilled,
  CloseCircleFilled,
  ExportOutlined,
  ReloadOutlined,
  RocketOutlined,
} from '@ant-design/icons';
import type { ReactNode } from 'react';
import { apiFetch } from './api';
import { CARD_SHADOW } from '../theme';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

/* ───────────────────────── local types ───────────────────────── */
interface AppSeo {
  enabled?: boolean;
  title?: string;
  description?: string;
  keywords?: string;
  ogImage?: string;
  index?: boolean;
  sitemap?: boolean;
  robots?: boolean;
  aiDiscovery?: boolean;
}
interface AppWithSeo {
  id: string;
  name: string;
  description?: string | null;
  seo?: AppSeo | null;
}

/** One on/off feature row (title · description · switch) — Base44-style. */
function ToggleRow({
  title,
  desc,
  checked,
  onChange,
}: {
  title: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 16,
        padding: '14px 16px',
        border: '1px solid #ECEDF3',
        borderRadius: 12,
        background: '#fff',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <Text strong style={{ fontSize: 13.5 }}>
          {title}
        </Text>
        <Text type="secondary" style={{ fontSize: 12.5, display: 'block', lineHeight: 1.5 }}>
          {desc}
        </Text>
      </div>
      <Switch checked={checked} onChange={onChange} />
    </div>
  );
}

/** Native desktop port of the web app builder's per-app SEO/GEO config panel. */
export function SeoView({ appId }: { appId: string }) {
  const { message } = App.useApp();

  const [app, setApp] = useState<AppWithSeo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [enabled, setEnabled] = useState(true);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [keywords, setKeywords] = useState('');
  const [ogImage, setOgImage] = useState('');
  const [index, setIndex] = useState(true);
  const [sitemap, setSitemap] = useState(true);
  const [robots, setRobots] = useState(true);
  const [aiDiscovery, setAiDiscovery] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<AppWithSeo>(`/apps/${appId}`);
      const seo: AppSeo = data.seo ?? {};
      setApp(data);
      setEnabled(seo.enabled !== false);
      setTitle(seo.title ?? '');
      setDescription(seo.description ?? '');
      setKeywords(seo.keywords ?? '');
      setOgImage(seo.ogImage ?? '');
      setIndex(seo.index !== false);
      setSitemap(seo.sitemap !== false);
      setRobots(seo.robots !== false);
      setAiDiscovery(seo.aiDiscovery !== false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [appId]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      await apiFetch<AppWithSeo>(`/apps/${appId}/seo`, {
        method: 'PUT',
        body: {
          enabled,
          title: title.trim(),
          description: description.trim(),
          keywords: keywords.trim(),
          ogImage: ogImage.trim(),
          index,
          sitemap,
          robots,
          aiDiscovery,
        } satisfies AppSeo,
      });
      message.success('Đã lưu cấu hình SEO. Bấm “Triển khai lại” để áp dụng lên trang đã deploy.');
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // Live SEO checklist (the "scan"), computed from the effective config.
  const effTitle = (title || app?.name || '').trim();
  const effDesc = (description || app?.description || '').trim();
  const checks: { ok: boolean; label: string }[] = [
    { ok: effTitle.length >= 10 && effTitle.length <= 60, label: `Tiêu đề ${effTitle.length} ký tự (tốt nhất 10–60)` },
    { ok: effDesc.length >= 50 && effDesc.length <= 160, label: `Mô tả ${effDesc.length} ký tự (tốt nhất 50–160)` },
    { ok: !!ogImage.trim(), label: 'Ảnh chia sẻ mạng xã hội (OG image)' },
    { ok: index, label: 'Cho phép công cụ tìm kiếm lập chỉ mục' },
    { ok: sitemap, label: 'Tạo sitemap.xml' },
    { ok: robots, label: 'Tạo robots.txt' },
    { ok: aiDiscovery, label: 'AI Assistant Discovery (JSON-LD)' },
  ];
  const passed = checks.filter((c) => c.ok).length;

  const field = (label: string, node: ReactNode, hint?: string) => (
    <div>
      <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 6 }}>
        {label}
      </Text>
      {node}
      {hint && (
        <Text type="secondary" style={{ fontSize: 11.5, display: 'block', marginTop: 4 }}>
          {hint}
        </Text>
      )}
    </div>
  );

  const header = (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
      <div style={{ minWidth: 0 }}>
        <Title level={3} style={{ margin: 0 }}>
          <RocketOutlined style={{ color: '#6C5CE7', marginInlineEnd: 8 }} />
          SEO &amp; AI Discovery
        </Title>
        <Text type="secondary">
          Cải thiện cách app xuất hiện trên kết quả tìm kiếm và câu trả lời của AI. Lưu cấu hình rồi bấm “Triển khai
          lại” để áp dụng vào trang đã deploy.
        </Text>
      </div>
      <Space>
        <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
          Tải lại
        </Button>
        <Button
          icon={<ExportOutlined />}
          onClick={() => window.open(`https://toolswave.net/apps/${appId}`, '_blank')}
        >
          Mở console web
        </Button>
      </Space>
    </div>
  );

  if (loading && !app) {
    return (
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {header}
        <Card style={{ boxShadow: CARD_SHADOW, borderRadius: 14 }}>
          <Skeleton active paragraph={{ rows: 6 }} />
        </Card>
      </Space>
    );
  }

  if (error && !app) {
    return (
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {header}
        <Card style={{ boxShadow: CARD_SHADOW, borderRadius: 14 }}>
          <Space direction="vertical" align="center" style={{ width: '100%', padding: '24px 0' }}>
            <Text type="danger">Không tải được cấu hình SEO: {error}</Text>
            <Button type="primary" icon={<ReloadOutlined />} onClick={() => void load()}>
              Thử lại
            </Button>
          </Space>
        </Card>
      </Space>
    );
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {header}

      {/* Master toggle */}
      <Card style={{ boxShadow: CARD_SHADOW, borderRadius: 14 }} styles={{ body: { padding: 16 } }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <Text strong>Bật SEO cho app này</Text>
            <Text type="secondary" style={{ fontSize: 12.5, display: 'block' }}>
              Chèn thẻ meta/Open Graph + sitemap/robots khi deploy.
            </Text>
          </div>
          <Switch checked={enabled} onChange={setEnabled} />
        </div>
      </Card>

      {/* Scan / checklist */}
      <Card style={{ boxShadow: CARD_SHADOW, borderRadius: 14 }} styles={{ body: { padding: 16 } }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <Text strong>
            Kiểm tra SEO · {passed}/{checks.length} đạt
          </Text>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {checks.map((c) => (
            <div key={c.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {c.ok ? (
                <CheckCircleFilled style={{ color: '#16B98D' }} />
              ) : (
                <CloseCircleFilled style={{ color: '#D0D5DD' }} />
              )}
              <Text style={{ fontSize: 13, color: c.ok ? '#1E2230' : '#6B7280' }}>{c.label}</Text>
            </div>
          ))}
        </div>
      </Card>

      {/* Meta tags */}
      <Card
        title="Thẻ Meta"
        style={{ boxShadow: CARD_SHADOW, borderRadius: 14, opacity: enabled ? 1 : 0.55 }}
        styles={{ body: { padding: 16, display: 'flex', flexDirection: 'column', gap: 14 } }}
      >
        {field(
          'Tiêu đề trang (title)',
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={app?.name}
            maxLength={70}
            disabled={!enabled}
          />,
          'Hiển thị trên tab trình duyệt + kết quả tìm kiếm. Bỏ trống = dùng tên app.',
        )}
        {field(
          'Mô tả (meta description)',
          <TextArea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={app?.description || 'Mô tả ngắn gọn về app…'}
            autoSize={{ minRows: 2, maxRows: 4 }}
            maxLength={200}
            disabled={!enabled}
          />,
          'Đoạn tóm tắt dưới tiêu đề trên Google.',
        )}
        {field(
          'Từ khoá (keywords)',
          <Input
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="vd: quản lý kho, wms, tồn kho"
            disabled={!enabled}
          />,
          'Ngăn cách bằng dấu phẩy.',
        )}
        {field(
          'Ảnh chia sẻ (OG image URL)',
          <Input
            value={ogImage}
            onChange={(e) => setOgImage(e.target.value)}
            placeholder="https://…/cover.png"
            disabled={!enabled}
          />,
          'Ảnh hiện khi chia sẻ link lên Facebook/Zalo/Twitter.',
        )}
      </Card>

      {/* Feature toggles (Base44-style) */}
      <Card
        title="Tự động tạo"
        style={{ boxShadow: CARD_SHADOW, borderRadius: 14, opacity: enabled ? 1 : 0.55 }}
        styles={{ body: { padding: 16, display: 'flex', flexDirection: 'column', gap: 10 } }}
      >
        <ToggleRow
          title="Cho phép lập chỉ mục"
          desc="Cho phép Google và các công cụ tìm kiếm hiển thị app. Tắt = noindex."
          checked={index}
          onChange={setIndex}
        />
        <ToggleRow
          title="AI Assistant Discovery"
          desc="Chèn JSON-LD giúp các trợ lý AI hiểu và gợi ý app của bạn."
          checked={aiDiscovery}
          onChange={setAiDiscovery}
        />
        <ToggleRow
          title="Tạo robots.txt"
          desc="Hướng dẫn bot tìm kiếm được/không được thu thập trang."
          checked={robots}
          onChange={setRobots}
        />
        <ToggleRow
          title="Tạo sitemap.xml"
          desc="Liệt kê trang cho công cụ tìm kiếm lập chỉ mục nhanh hơn."
          checked={sitemap}
          onChange={setSitemap}
        />
      </Card>

      <Paragraph type="secondary" style={{ margin: 0 }}>
        Sau khi lưu, vào tab “Triển khai” để deploy lại và áp dụng cấu hình SEO mới.
      </Paragraph>

      <div style={{ display: 'flex', gap: 10 }}>
        <Button type="primary" icon={<RocketOutlined />} loading={saving} onClick={save}>
          Lưu cấu hình SEO
        </Button>
      </div>
    </Space>
  );
}
