'use client'

import React, { useState } from 'react'
import {
  Badge, Button, Card, Col, Divider, Row, Steps, Tag,
  Timeline, Tooltip, Typography,
} from 'antd'
import {
  ApiOutlined, ArrowRightOutlined, BookOutlined,
  CheckCircleOutlined, ClockCircleOutlined, DatabaseOutlined,
  EditOutlined, FileTextOutlined, KeyOutlined, PlayCircleOutlined,
  RobotOutlined, SafetyOutlined, SendOutlined, SettingOutlined,
  SyncOutlined, TeamOutlined, ThunderboltOutlined, UserOutlined,
} from '@ant-design/icons'
import Link from 'next/link'
import useLang from '@/store/language'

const { Title, Text, Paragraph } = Typography

// ─── Data ─────────────────────────────────────────────────────────────────────

interface Feature {
  id: string
  icon: React.ReactNode
  color: string
  label: { vi: string; en: string }
  tagline: { vi: string; en: string }
  description: { vi: string; en: string }
  bullets: { vi: string[]; en: string[] }
  steps?: { vi: string[]; en: string[] }
  link?: string
  apiGroup?: string
  badge?: string
}

const FEATURES: Feature[] = [
  {
    id: 'lark-oauth',
    icon: <KeyOutlined />,
    color: '#0081FF',
    label:   { vi: 'Lark OAuth & Auth',        en: 'Lark OAuth & Auth' },
    tagline: { vi: 'Đăng nhập bằng tài khoản Lark một chạm', en: 'One-click login with Lark account' },
    description: {
      vi: 'Hỗ trợ OAuth 2-bước với Lark: lấy user token, tenant token và thông tin người dùng. Tương thích cả Lark Suite (quốc tế) và Feishu (Trung Quốc).',
      en: 'Full 2-step Lark OAuth: user token, tenant token and profile info. Compatible with both Lark Suite (international) and Feishu (China).',
    },
    bullets: {
      vi: ['Xây dựng OAuth URL với scopes tuỳ chỉnh', 'Đổi auth code → user access token', 'Lấy & cache tenant token', 'Lấy thông tin profile người dùng'],
      en: ['Build OAuth URL with custom scopes', 'Exchange auth code → user access token', 'Fetch & cache tenant token', 'Retrieve user profile information'],
    },
    link: '/lark/accounts',
  },
  {
    id: 'lark-bitable',
    icon: <DatabaseOutlined />,
    color: '#00B96B',
    label:   { vi: 'Lark Bitable Manager', en: 'Lark Bitable Manager' },
    tagline: { vi: 'Đọc, tạo và cập nhật cơ sở dữ liệu Bitable', en: 'Read, create and update Bitable databases' },
    description: {
      vi: 'API đầy đủ cho Lark Bitable: liệt kê bases, tables, fields; đọc records tự động phân trang; tạo base mới; batch update fields; import schema từ JSON.',
      en: 'Complete Lark Bitable API: list bases, tables, fields; auto-paginate records; create new bases; batch update fields; import schema from JSON.',
    },
    bullets: {
      vi: ['Liệt kê tất cả Bitable bases & tables', 'Đọc toàn bộ records (auto-paginate)', 'Tạo base mới từ schema JSON', 'Batch update fields (tên, mô tả, kiểu)', 'Insert sample records', 'Patch schema an toàn (không xoá data)'],
      en: ['List all Bitable bases & tables', 'Read all records (auto-paginate)', 'Create new base from JSON schema', 'Batch update fields (name, description, type)', 'Insert sample records', 'Safe schema patch (no data loss)'],
    },
    link: '/lark/base-designer',
  },
  {
    id: 'extract-ai',
    icon: <ThunderboltOutlined />,
    color: '#7C3AED',
    label:   { vi: 'Extract & AI Schema Designer', en: 'Extract & AI Schema Designer' },
    tagline: { vi: 'AI phân tích và cải thiện schema Bitable real-time', en: 'AI analyses and improves Bitable schema in real-time' },
    description: {
      vi: 'Tích hợp AI (Claude/GPT) trực tiếp vào quy trình thiết kế schema. Streaming real-time, đề xuất đổi tên field, thêm mô tả, tạo tài liệu SCHEMA_DOCS tự động.',
      en: 'AI (Claude/GPT) integrated directly into the schema design workflow. Real-time streaming, field rename suggestions, description generation, auto SCHEMA_DOCS.',
    },
    bullets: {
      vi: [
        'Load schema từ Bitable chỉ 1 click',
        'Chat với AI để cải thiện schema (streaming UTF-8)',
        'Lịch sử hội thoại lưu vào MongoDB',
        'Gợi ý follow-up sau mỗi câu trả lời',
        'Import schema vào Base hiện có hoặc tạo Base mới',
        'Tạo tài liệu SCHEMA_DOCS bằng AI',
        'Tải về file .md',
      ],
      en: [
        'Load schema from Bitable in 1 click',
        'Chat with AI to improve schema (UTF-8 streaming)',
        'Conversation history saved to MongoDB',
        'Follow-up suggestions after each AI reply',
        'Import schema to existing or new Base',
        'Generate SCHEMA_DOCS documentation with AI',
        'Download .md file',
      ],
    },
    link: '/lark/base-designer/extract',
    badge: 'AI Powered',
  },
  {
    id: 'ai-agent',
    icon: <RobotOutlined />,
    color: '#6366F1',
    label:   { vi: 'AI Agent Builder', en: 'AI Agent Builder' },
    tagline: { vi: 'Xây dựng AI Agent với RAG và triển khai lên Lark Bot', en: 'Build AI Agents with RAG and deploy to Lark Bot' },
    description: {
      vi: 'Tạo AI Agent với knowledge base riêng (RAG), test chat streaming, triển khai webhook cho Lark Bot. Hỗ trợ Anthropic, OpenAI và Groq.',
      en: 'Create AI Agents with private knowledge base (RAG), test streaming chat, deploy webhook for Lark Bot. Supports Anthropic, OpenAI and Groq.',
    },
    bullets: {
      vi: [
        'CRUD AI Agents với system prompt tuỳ chỉnh',
        'Knowledge Base: index từ Lark Doc, Wiki, Bitable hoặc nhập thủ công',
        'RAG keyword scoring để tìm context phù hợp',
        'Chat streaming (Anthropic/OpenAI/Groq)',
        'Webhook endpoint cho Lark Bot',
        'Tự động reply trong group Lark',
        'Thống kê số lần chat và lần cuối sử dụng',
      ],
      en: [
        'CRUD AI Agents with custom system prompt',
        'Knowledge Base: index from Lark Doc, Wiki, Bitable or manual entry',
        'RAG keyword scoring for relevant context',
        'Streaming chat (Anthropic/OpenAI/Groq)',
        'Webhook endpoint for Lark Bot',
        'Auto-reply in Lark groups',
        'Chat count and last-used statistics',
      ],
    },
    link: '/lark/agent',
    badge: 'New',
  },
  {
    id: 'jobs',
    icon: <ClockCircleOutlined />,
    color: '#EB2F96',
    label:   { vi: 'Curl Job Scheduler', en: 'Curl Job Scheduler' },
    tagline: { vi: 'Lên lịch chạy API/curl định kỳ tự động', en: 'Schedule API/curl calls to run automatically on a timer' },
    description: {
      vi: 'Lên lịch và quản lý các job curl/API chạy theo interval thời gian. Theo dõi lịch sử thực thi, xem thống kê thành công/thất bại.',
      en: 'Schedule and manage curl/API jobs running on time intervals. Track execution history, view success/failure statistics.',
    },
    bullets: {
      vi: ['Tạo job với bất kỳ curl command', 'Chạy theo interval (phút)', 'Toggle bật/tắt không cần xoá', 'Chạy thủ công ngay lập tức', 'Xem log chi tiết từng lần chạy', 'Thống kê tỷ lệ thành công & thời gian TB'],
      en: ['Create jobs with any curl command', 'Run on interval (minutes)', 'Toggle on/off without deleting', 'Run immediately on demand', 'View detailed log per execution', 'Success rate & avg execution time stats'],
    },
    link: '/sync/jobs',
  },
  {
    id: 'notify',
    icon: <SendOutlined />,
    color: '#F5222D',
    label:   { vi: 'Notification System', en: 'Notification System' },
    tagline: { vi: 'Gửi thông báo qua Telegram và Lark Bot', en: 'Send notifications via Telegram and Lark Bot' },
    description: {
      vi: 'Cấu hình nhiều Telegram bot và Lark webhook. Gửi thông báo tự động khi có sự kiện từ Lark Automation hoặc các job.',
      en: 'Configure multiple Telegram bots and Lark webhooks. Send automatic notifications on Lark Automation events or job completions.',
    },
    bullets: {
      vi: ['Nhiều Telegram bot + Lark webhook', 'Webhook entries với filter event', 'Template tin nhắn tuỳ chỉnh', 'Test gửi thông báo ngay', 'Lark card message với màu & nút hành động'],
      en: ['Multiple Telegram bots + Lark webhooks', 'Webhook entries with event filters', 'Custom message templates', 'Test send notifications instantly', 'Lark card messages with colors & action buttons'],
    },
    link: '/sync/notify',
  },
  {
    id: 'lark-accounts',
    icon: <SafetyOutlined />,
    color: '#13C2C2',
    label:   { vi: 'Multi-Account Lark', en: 'Multi-Account Lark' },
    tagline: { vi: 'Quản lý nhiều Lark App credentials', en: 'Manage multiple Lark App credentials' },
    description: {
      vi: 'Lưu trữ và quản lý nhiều Lark App credentials. Lấy tenant token tự động, đặt app mặc định. Phù hợp cho tổ chức có nhiều Lark app.',
      en: 'Store and manage multiple Lark App credentials. Auto-fetch tenant tokens, set default app. Ideal for organizations with multiple Lark apps.',
    },
    bullets: {
      vi: ['CRUD credentials (App ID, Secret)', 'Fetch & cache tenant access token', 'Đặt app mặc định cho toàn hệ thống', 'Mask secrets trong response', 'Tìm kiếm theo tên / appId'],
      en: ['CRUD credentials (App ID, Secret)', 'Fetch & cache tenant access token', 'Set default app system-wide', 'Mask secrets in responses', 'Search by name / appId'],
    },
    link: '/lark/accounts',
  },
  {
    id: 'ai-config',
    icon: <ThunderboltOutlined />,
    color: '#531DAB',
    label:   { vi: 'AI Provider Config', en: 'AI Provider Config' },
    tagline: { vi: 'Quản lý API keys cho Anthropic, OpenAI, Groq', en: 'Manage API keys for Anthropic, OpenAI, Groq' },
    description: {
      vi: 'Cấu hình và lưu trữ API keys cho các AI provider. Test kết nối ngay trong UI. Theo dõi chi phí (token usage × price per M).',
      en: 'Configure and store API keys for AI providers. Test connectivity directly in UI. Track costs (token usage × price per M).',
    },
    bullets: {
      vi: ['Hỗ trợ: Anthropic, OpenAI, Groq, Mistral, custom', 'Test kết nối API key ngay', 'Preset pricing cho mỗi provider', 'Đặt config mặc định', 'Mask API key trong tất cả response'],
      en: ['Supports: Anthropic, OpenAI, Groq, Mistral, custom', 'Test API key connectivity instantly', 'Pricing presets per provider', 'Set default config', 'Mask API keys in all responses'],
    },
    link: '/settings/ai',
  },
  {
    id: 'system-users',
    icon: <UserOutlined />,
    color: '#7CB305',
    label:   { vi: 'CMS Users', en: 'CMS Users' },
    tagline: { vi: 'Quản lý tài khoản đăng nhập CMS', en: 'Manage CMS login accounts' },
    description: {
      vi: 'Tạo và quản lý tài khoản đăng nhập cho CMS. Xác thực email + password. Hỗ trợ multi-user.',
      en: 'Create and manage login accounts for the CMS. Email + password authentication. Multi-user support.',
    },
    bullets: {
      vi: ['CRUD tài khoản người dùng', 'Đăng nhập xác thực email/password', 'Trạng thái active/inactive', 'Tìm kiếm theo tên & email'],
      en: ['CRUD user accounts', 'Email/password login authentication', 'Active/inactive status', 'Search by name & email'],
    },
    link: '/settings/users',
  },
  {
    id: 'lark-docs',
    icon: <FileTextOutlined />,
    color: '#722ED1',
    label:   { vi: 'Lark Docs', en: 'Lark Docs' },
    tagline: { vi: 'Tạo tài liệu Lark từ Markdown', en: 'Create Lark Docs from Markdown content' },
    description: {
      vi: 'Tạo Lark Doc trực tiếp từ Markdown content. Hỗ trợ heading, bullet list, code blocks và paragraph. Lưu vào folder tuỳ chọn.',
      en: 'Create Lark Docs directly from Markdown content. Supports headings, bullet lists, code blocks and paragraphs. Save to any folder.',
    },
    bullets: {
      vi: ['Chuyển đổi Markdown → Lark blocks', 'Hỗ trợ H1/H2/H3, lists, code', 'Lưu vào folder bất kỳ', 'Trả về document ID + URL'],
      en: ['Convert Markdown → Lark blocks', 'Supports H1/H2/H3, lists, code', 'Save to any folder', 'Returns document ID + URL'],
    },
  },
]

// ─── Architecture diagram ─────────────────────────────────────────────────────

function ArchDiagram({ lang }: { lang: 'vi' | 'en' }) {
  const nodes = [
    { label: 'cms-lark-sync', sub: lang === 'vi' ? 'Next.js 15 Frontend' : 'Next.js 15 Frontend', color: '#6366F1' },
    { label: 'api-lark-all',  sub: lang === 'vi' ? 'Express.js Backend' : 'Express.js Backend',  color: '#00B96B' },
    { label: 'MongoDB',       sub: lang === 'vi' ? 'Lưu trữ dữ liệu'   : 'Data Storage',        color: '#EB2F96' },
    { label: 'Lark API',      sub: lang === 'vi' ? 'Bitable / Doc / Bot' : 'Bitable / Doc / Bot', color: '#0081FF' },
    { label: 'AI Providers',  sub: 'Anthropic / OpenAI / Groq',                                   color: '#531DAB' },
  ]

  return (
    <div style={{ overflowX: 'auto', padding: '8px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, minWidth: 600 }}>
        {nodes.map((n, i) => (
          <React.Fragment key={n.label}>
            <div style={{
              background: `${n.color}15`,
              border: `1.5px solid ${n.color}55`,
              borderRadius: 10,
              padding: '12px 18px',
              textAlign: 'center',
              minWidth: 130,
              flexShrink: 0,
            }}>
              <div style={{ fontWeight: 700, color: n.color, fontSize: 13 }}>{n.label}</div>
              <div style={{ fontSize: 11, color: 'var(--text-color)', opacity: 0.7, marginTop: 2 }}>{n.sub}</div>
            </div>
            {i < nodes.length - 1 && (
              <div style={{ display: 'flex', alignItems: 'center', padding: '0 6px' }}>
                <div style={{ height: 1.5, width: 24, background: '#ccc' }} />
                <ArrowRightOutlined style={{ color: '#ccc', fontSize: 12 }} />
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  )
}

// ─── Feature card ─────────────────────────────────────────────────────────────

function FeatureCard({ f, lang }: { f: Feature; lang: 'vi' | 'en' }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <Card
      hoverable
      style={{ borderRadius: 14, height: '100%', border: `1px solid ${f.color}33` }}
      bodyStyle={{ padding: '20px', height: '100%', display: 'flex', flexDirection: 'column' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12,
          background: `${f.color}18`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22, color: f.color, flexShrink: 0,
        }}>
          {f.icon}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text strong style={{ fontSize: 15 }}>{f.label[lang]}</Text>
            {f.badge && <Tag color={f.badge === 'New' ? 'green' : 'purple'} style={{ fontSize: 10 }}>{f.badge}</Tag>}
          </div>
          <Text type="secondary" style={{ fontSize: 12 }}>{f.tagline[lang]}</Text>
        </div>
      </div>

      <Paragraph style={{ fontSize: 13, color: 'var(--text-color)', marginBottom: 12 }}>
        {f.description[lang]}
      </Paragraph>

      <ul style={{ paddingLeft: 16, margin: 0, flex: 1 }}>
        {(expanded ? f.bullets[lang] : f.bullets[lang].slice(0, 4)).map((b, i) => (
          <li key={i} style={{ fontSize: 13, marginBottom: 4, color: 'var(--text-color)' }}>
            <CheckCircleOutlined style={{ color: f.color, marginRight: 6 }} />
            {b}
          </li>
        ))}
      </ul>

      {f.bullets[lang].length > 4 && (
        <Button
          type="link"
          size="small"
          onClick={() => setExpanded(e => !e)}
          style={{ alignSelf: 'flex-start', padding: 0, marginTop: 6 }}
        >
          {expanded
            ? (lang === 'vi' ? 'Ẩn bớt' : 'Show less')
            : `+${f.bullets[lang].length - 4} ${lang === 'vi' ? 'tính năng khác' : 'more'}`}
        </Button>
      )}

      <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
        {f.link && (
          <Link href={f.link}>
            <Button size="small" type="primary" ghost style={{ borderColor: f.color, color: f.color }}>
              {lang === 'vi' ? 'Mở trang' : 'Open page'}
            </Button>
          </Link>
        )}
        <Link href={`/dev/api`}>
          <Button size="small" icon={<ApiOutlined />}>
            {lang === 'vi' ? 'Xem API' : 'API Docs'}
          </Button>
        </Link>
      </div>
    </Card>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function FeaturesPage() {
  const { lang } = useLang()

  const tr = {
    title:    lang === 'vi' ? 'Tổng quan tính năng'               : 'Features Overview',
    subtitle: lang === 'vi' ? 'Toàn bộ tính năng của hệ thống Hoa Nam Workspace' : 'All features of the Hoa Nam Workspace system',
    arch:     lang === 'vi' ? 'Kiến trúc hệ thống'               : 'System Architecture',
    archDesc: lang === 'vi'
      ? 'Hai ứng dụng hoạt động cùng nhau: CMS frontend (Next.js) giao tiếp với backend API (Express.js), kết nối MongoDB, Lark API và AI providers.'
      : 'Two apps working together: CMS frontend (Next.js) communicates with backend API (Express.js), connecting MongoDB, Lark API and AI providers.',
    features: lang === 'vi' ? 'Tính năng chính'                  : 'Core Features',
    stack:    lang === 'vi' ? 'Tech Stack'                        : 'Tech Stack',
    api:      lang === 'vi' ? 'Khám phá API'                      : 'Explore APIs',
    apiDesc:  lang === 'vi' ? 'Test trực tiếp các API endpoints trong trình duyệt' : 'Test API endpoints directly in your browser',
  }

  const stack = [
    { label: 'Next.js 15',     color: '#000', desc: 'App Router + Server Components' },
    { label: 'Ant Design v5',  color: '#0081FF', desc: 'UI Component Library' },
    { label: 'Zustand',        color: '#764ABC', desc: 'State Management' },
    { label: 'Tailwind v4',    color: '#38BDF8', desc: 'Utility CSS' },
    { label: 'Express.js',     color: '#00B96B', desc: 'REST API Backend' },
    { label: 'MongoDB',        color: '#00ED64', desc: 'Database (Mongoose)' },
    { label: 'Anthropic SDK',  color: '#CC6633', desc: 'Claude AI Integration' },
    { label: 'Lark Open API',  color: '#0081FF', desc: 'Bitable / Doc / Bot' },
  ]

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <Title level={3} style={{ margin: 0 }}>
          <PlayCircleOutlined style={{ color: '#6366f1', marginRight: 10 }} />
          {tr.title}
        </Title>
        <Text type="secondary">{tr.subtitle}</Text>
      </div>

      {/* Architecture */}
      <Card
        style={{ marginBottom: 32, borderRadius: 14 }}
        title={<span><SettingOutlined style={{ marginRight: 8 }} />{tr.arch}</span>}
      >
        <Paragraph type="secondary" style={{ marginBottom: 16 }}>{tr.archDesc}</Paragraph>
        <ArchDiagram lang={lang} />
      </Card>

      {/* Tech stack */}
      <Card
        style={{ marginBottom: 32, borderRadius: 14 }}
        title={<span>🛠 {tr.stack}</span>}
        bodyStyle={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}
      >
        {stack.map(s => (
          <div key={s.label} style={{
            padding: '8px 14px',
            borderRadius: 8,
            border: `1.5px solid ${s.color}44`,
            background: `${s.color}0d`,
          }}>
            <Text strong style={{ color: s.color, fontSize: 13 }}>{s.label}</Text>
            <div style={{ fontSize: 11, color: 'var(--text-color)', opacity: 0.7 }}>{s.desc}</div>
          </div>
        ))}
      </Card>

      {/* Features grid */}
      <div style={{ marginBottom: 12 }}>
        <Title level={5} style={{ margin: 0 }}>{tr.features}</Title>
        <Text type="secondary">
          {lang === 'vi' ? `${FEATURES.length} nhóm tính năng` : `${FEATURES.length} feature groups`}
        </Text>
      </div>
      <Row gutter={[16, 16]} style={{ marginBottom: 32 }}>
        {FEATURES.map(f => (
          <Col key={f.id} xs={24} sm={12} lg={8}>
            <FeatureCard f={f} lang={lang} />
          </Col>
        ))}
      </Row>

      {/* API Explorer CTA */}
      <Card
        style={{
          borderRadius: 14,
          background: 'linear-gradient(135deg, var(--accent-light), var(--primary-light))',
          border: '1px solid var(--border-color)',
        }}
        bodyStyle={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}
      >
        <ApiOutlined style={{ fontSize: 40, color: '#6366f1' }} />
        <div style={{ flex: 1 }}>
          <Title level={5} style={{ margin: 0 }}>{tr.api}</Title>
          <Text type="secondary">{tr.apiDesc}</Text>
        </div>
        <Link href="/dev/api">
          <Button type="primary" size="large" icon={<ApiOutlined />} style={{ background: '#6366f1', border: 'none' }}>
            {lang === 'vi' ? 'Mở API Explorer' : 'Open API Explorer'}
          </Button>
        </Link>
      </Card>
    </div>
  )
}
