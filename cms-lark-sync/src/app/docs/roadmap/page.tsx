'use client'

/**
 * /docs/roadmap — v3.x development roadmap.
 *
 * Visualizes the 14 phases from the plan file as a timeline with status badges,
 * priority stars, time estimates, tech stack, and deliverables. Lets the team
 * see what's planned, in-progress, and done at a glance.
 */

import React from 'react'
import Link from 'next/link'
import {
  Alert, Badge, Card, Col, Progress, Row, Space, Table, Tag, Timeline, Tooltip, Typography,
} from 'antd'
import {
  RocketOutlined, CheckCircleTwoTone, ClockCircleOutlined, ExperimentOutlined,
  CloudOutlined, ThunderboltOutlined, ToolOutlined, TeamOutlined, LockOutlined,
  DollarOutlined, BarChartOutlined, SafetyOutlined, AppstoreOutlined,
  CodeSandboxOutlined, CloudServerOutlined, AlertOutlined, DatabaseOutlined,
  StarFilled,
} from '@ant-design/icons'

const { Title, Paragraph, Text } = Typography

type PhaseStatus = 'done' | 'in-progress' | 'planned'

type Phase = {
  id: number
  icon: React.ReactNode
  title: string
  goal: string
  weeks: string
  priority: number  // 1-5 stars
  status: PhaseStatus
  tech: string[]
  deliverables: string[]
  successCriteria: string
  color: string
}

const PHASES: Phase[] = [
  {
    id: 1,
    icon: <DatabaseOutlined />,
    title: 'Vector RAG & Semantic Knowledge',
    goal: 'Thay keyword score bằng hybrid search (vector + BM25) để agent hiểu câu hỏi semantic.',
    weeks: '2-3 tuần',
    priority: 5,
    status: 'planned',
    tech: ['MongoDB Atlas Vector Search', 'text-embedding-004 (free)', 'BGE-M3', 'Cohere Rerank'],
    deliverables: [
      'modules/knowledge/services/embeddings.js — provider abstraction',
      'AgentKnowledge.embedding field + backfill migration',
      'hybridSearch(query, agentId, {k, alpha})',
      'UI: knowledge page hiển thị trạng thái indexed',
    ],
    successCriteria: 'Câu hỏi "có chính sách nghỉ phép không?" match knowledge "quy định ngày nghỉ hằng năm" (keyword không match nhưng semantic gần).',
    color: '#7C3AED',
  },
  {
    id: 2,
    icon: <CloudOutlined />,
    title: 'Google Cloud — Vertex AI',
    goal: 'Thêm Vertex AI: Gemini, Claude on GCP, Llama via Model Garden. Tận dụng $300 free credit GCP.',
    weeks: '1-2 tuần',
    priority: 5,
    status: 'planned',
    tech: ['Vertex AI SDK', 'GCP service account', 'Gemini 2.5 Pro/Flash', 'Claude via Vertex', 'Llama Model Garden'],
    deliverables: [
      'utils/vertexAuth.js — service account JWT flow',
      'buildVertexOptions(cfg) helper',
      'AIConfig form: gcpProjectId, gcpLocation, serviceAccountJson',
      'Model presets: 11 models từ Gemini đến Imagen',
    ],
    successCriteria: 'Tạo AIConfig provider=vertex, test pass, streaming chat OK qua Gemini 2.5 Flash.',
    color: '#4285F4',
  },
  {
    id: 3,
    icon: <RocketOutlined />,
    title: 'Alibaba Bailian — Qwen family',
    goal: 'Qwen2.5/3.0 tiếng Việt xuất sắc, free tier lớn, latency SEA thấp.',
    weeks: '1 tuần',
    priority: 4,
    status: 'planned',
    tech: ['DashScope (OpenAI-compatible)', 'Qwen-Max/Plus/Turbo', 'Qwen-Coder', 'Qwen-VL', 'Qwen-Math'],
    deliverables: [
      'Thêm alibaba vào PROVIDER_BASE_URLS',
      'Preset 12 Qwen models',
      'Vietnamese benchmark page so với Gemini/Claude',
    ],
    successCriteria: 'Agent dùng Qwen2.5-Max trả lời tiếng Việt natural không cần tối ưu prompt.',
    color: '#DD3333',
  },
  {
    id: 4,
    icon: <ThunderboltOutlined />,
    title: 'Free-tier aggregator (Cerebras, Together, Fireworks)',
    goal: 'Router tự động pick provider rẻ/nhanh nhất. Cerebras ~2000 tok/s, 1M tokens/day free.',
    weeks: '1 tuần',
    priority: 4,
    status: 'planned',
    tech: ['Cerebras Cloud', 'Together AI', 'Fireworks AI', 'Replicate'],
    deliverables: [
      'services/providerRouter.js — pickProvider({task, maxCost, minTps})',
      'AIConfig.routingPolicy field',
      'CMS: /settings/routing — so sánh providers',
      'Metrics collector: provider × latency × cost',
    ],
    successCriteria: 'Câu hỏi đơn giản → Cerebras (free + fast). Câu hỏi phức tạp → Claude/Gemini Pro.',
    color: '#F55036',
  },
  {
    id: 5,
    icon: <ToolOutlined />,
    title: 'Tool/Function Calling & Agent Orchestration',
    goal: 'Agent không chỉ chat mà còn gọi được HTTP, DB, Lark Bitable, web search, code interpreter.',
    weeks: '3-4 tuần',
    priority: 5,
    status: 'planned',
    tech: ['OpenAI function calling', 'Tavily/Brave/Serper', 'vm2 sandbox', 'Lark Client', 'OpenAPI auto-gen'],
    deliverables: [
      'modules/tools/models/Tool.model.js',
      'toolExecutor với timeout + retry + permission',
      '6 built-in tools: web_search, http, mongo, lark, file, code',
      'Custom tool registration từ OpenAPI spec',
      'Agent chain: sequential, parallel fan-out, conditional',
    ],
    successCriteria: '"Doanh thu tháng 3" → agent gọi lark_bitable_read → filter → trả về con số đúng.',
    color: '#FA8C16',
  },
  {
    id: 6,
    icon: <TeamOutlined />,
    title: 'Multi-tenancy & Workspace system',
    goal: 'Chuyển từ single-user sang multi-tenant, chuẩn bị SaaS.',
    weeks: '3-4 tuần',
    priority: 4,
    status: 'planned',
    tech: ['Workspace + Member models', 'workspaceId scoping', 'middleware', 'Resource quotas'],
    deliverables: [
      'Workspace + WorkspaceMember models',
      'workspaceId vào 8+ models existing',
      'middleware.withWorkspace',
      'UI: workspace switcher, /settings/workspace, invites',
      'Migration script: gán data cũ vào default workspace',
    ],
    successCriteria: '2 workspaces, knowledge tách biệt — agent WS A không thấy knowledge WS B.',
    color: '#1890FF',
  },
  {
    id: 7,
    icon: <LockOutlined />,
    title: 'Authentication hardening (OAuth, SSO, 2FA, API keys)',
    goal: 'Replace localStorage + bcrypt bằng enterprise-grade auth.',
    weeks: '2 tuần',
    priority: 4,
    status: 'planned',
    tech: ['Auth.js / Clerk / Supabase Auth', 'OAuth: Google/MS/Lark/GitHub', 'JWT RS256', 'TOTP 2FA'],
    deliverables: [
      'Replace login flow với session + refresh token',
      'requireAuth middleware',
      '/settings/security: change password, 2FA, API keys, sessions',
      'Email flows via Resend/SendGrid',
    ],
    successCriteria: 'Login qua Google SSO + 2FA prompt. Không còn password trong localStorage.',
    color: '#52C41A',
  },
  {
    id: 8,
    icon: <DollarOutlined />,
    title: 'Payment layer & real-money credit top-up',
    goal: 'Monetize hệ thống — top-up credit bằng tiền thật.',
    weeks: '3 tuần',
    priority: 3,
    status: 'planned',
    tech: ['Stripe', 'MoMo', 'ZaloPay', 'VNPay', 'PayOS'],
    deliverables: [
      'Invoice model + WorkspaceBalance',
      'Webhook handlers per provider với signature verify',
      'Auto-deduct khi recordUsage fire',
      '/billing page với top-up form + history + invoice PDF',
    ],
    successCriteria: 'Top-up $10 qua MoMo → balance tăng → chat → balance trừ đúng.',
    color: '#FAAD14',
  },
  {
    id: 9,
    icon: <BarChartOutlined />,
    title: 'Observability stack (OpenTelemetry + Grafana)',
    goal: 'Thấy được cái gì đang diễn ra ở production. Không còn docker logs mò mẫm.',
    weeks: '2 tuần',
    priority: 4,
    status: 'planned',
    tech: ['OpenTelemetry Node SDK', 'Grafana + Tempo + Loki + Mimir', 'Prometheus', 'Pino JSON logs'],
    deliverables: [
      'config/otel.js với OTLP exporter',
      'Custom LLM spans với {provider, model, tokens, cost, agent_id}',
      '4 Grafana dashboards: API, LLM, Cost by WS, Error Budget',
      'Alertmanager rules: error rate > 1%, p99 > 5s, daily cost > $X',
    ],
    successCriteria: 'Mở Grafana → thấy real-time traffic → click trace → full chain + LLM span + cost.',
    color: '#EB2F96',
  },
  {
    id: 10,
    icon: <SafetyOutlined />,
    title: 'Data privacy, safety & AI moderation',
    goal: 'Bảo vệ data + chặn AI abuse (jailbreak, PII leak, prompt injection).',
    weeks: '2 tuần',
    priority: 4,
    status: 'planned',
    tech: ['AES-GCM encryption', 'GCP KMS', 'Lakera Guard', 'llm-guard', 'Pino redaction'],
    deliverables: [
      'AIConfig.apiKey + Bot.credentials encrypted at rest',
      'Pino redact: email/phone/card/SSN',
      'Input + output moderation layer',
      'AuditLog model + GDPR export/delete',
      'Rate limit per workspace (Redis-backed)',
    ],
    successCriteria: '0 PII leak trong log 24h, 100% secrets encrypted ở DB.',
    color: '#13C2C2',
  },
  {
    id: 11,
    icon: <AppstoreOutlined />,
    title: 'Agent marketplace & template library',
    goal: 'Tạo agent nhanh từ template thay vì build từ đầu.',
    weeks: '2-3 tuần',
    priority: 3,
    status: 'planned',
    tech: ['AgentTemplate model', 'Clone-to-workspace', 'Categories'],
    deliverables: [
      'AgentTemplate với category, rating, installCount',
      '5 templates mặc định: HR, Sales, Code Review, VN Tutor, Bitable Analyzer',
      '/marketplace page với search + filter',
      'User publish flow (optional, review)',
    ],
    successCriteria: '1 click tạo "HR Assistant" từ template, chat thử OK ngay.',
    color: '#9254DE',
  },
  {
    id: 12,
    icon: <ExperimentOutlined />,
    title: 'Fine-tuning pipeline (custom models)',
    goal: 'Train custom model từ conversation logs + knowledge base của workspace.',
    weeks: '3-4 tuần',
    priority: 3,
    status: 'planned',
    tech: ['OpenAI FT', 'Vertex AI tuning', 'Together/Fireworks', 'Ollama + unsloth (local)'],
    deliverables: [
      'FineTuneJob model',
      'Training data collector (upvote-based)',
      'Provider-specific FT pipeline',
      'A/B test base vs fine-tuned',
    ],
    successCriteria: 'FT từ 100 conversations, 1 tiếng → model mới handle câu hỏi công ty tốt hơn base.',
    color: '#36CFC9',
  },
  {
    id: 13,
    icon: <CloudServerOutlined />,
    title: 'Horizontal scaling & Kubernetes',
    goal: 'Scale ra nhiều server, chuẩn bị cho growth. Prerequisite: Giai đoạn 6 + 9 xong.',
    weeks: '4-6 tuần',
    priority: 2,
    status: 'planned',
    tech: ['Redis cluster', 'BullMQ', 'K8s / GKE Autopilot', 'NGINX Ingress', 'MongoDB Atlas M10+'],
    deliverables: [
      'Stateless: BotSession + webhook dedup → Redis',
      'Worker processes: modules/workers/*',
      'Helm chart hoa-nam',
      'HPA scale theo CPU/queue depth',
    ],
    successCriteria: 'Kill 1 pod → traffic route sang pod khác → 0 downtime. kubectl get pods → 3 healthy.',
    color: '#F5222D',
  },
  {
    id: 14,
    icon: <AlertOutlined />,
    title: 'Disaster recovery, backup, compliance',
    goal: 'Survive disaster — hardware fail, accidental delete, ransomware, provider outage.',
    weeks: '2 tuần',
    priority: 4,
    status: 'planned',
    tech: ['mongodump', 'GCS/S3/R2', 'Weekly restore drill', 'SOC 2 checklist', 'PDPD VN'],
    deliverables: [
      'Daily encrypted backup → cloud storage (retention 30 ngày + EOM)',
      'Cross-region replication',
      '4 runbooks: db-down, provider-outage, ddos, data-leak',
      'SOC 2 Type 1 gap analysis',
      'Annual pentest (Nuclei/ZAP)',
    ],
    successCriteria: '1 button → DB restore từ backup hôm qua trong < 15 phút.',
    color: '#FA541C',
  },
]

const STATUS_META: Record<PhaseStatus, { label: string; color: string; dot: React.ReactNode }> = {
  done:          { label: 'Hoàn thành', color: 'success', dot: <CheckCircleTwoTone twoToneColor="#52c41a" /> },
  'in-progress': { label: 'Đang làm',   color: 'processing', dot: <ClockCircleOutlined style={{ color: '#1890FF' }} /> },
  planned:       { label: 'Kế hoạch',   color: 'default', dot: <ClockCircleOutlined style={{ color: 'var(--text-tertiary)' }} /> },
}

function PriorityStars({ count }: { count: number }) {
  return (
    <Space size={0}>
      {Array.from({ length: 5 }).map((_, i) => (
        <StarFilled key={i} style={{ color: i < count ? '#FAAD14' : 'var(--border-color)', fontSize: 12 }} />
      ))}
    </Space>
  )
}

export default function RoadmapPage() {
  const doneCount    = PHASES.filter(p => p.status === 'done').length
  const inProgressCount = PHASES.filter(p => p.status === 'in-progress').length
  const totalCount   = PHASES.length
  const progressPct  = Math.round((doneCount / totalCount) * 100)

  return (
    <div className="p-4 space-y-4">
      <div>
        <Title level={3} className="!mb-0">
          <RocketOutlined className="mr-2" />
          Lộ trình phát triển v3.x
        </Title>
        <Paragraph type="secondary" className="!mb-0">
          14 giai đoạn để đưa Hoa Nam Workspace từ feature-rich lên enterprise-ready.
          Mỗi giai đoạn là 1 epic độc lập — có thể skip hoặc đảo thứ tự theo ưu tiên thực tế.
        </Paragraph>
      </div>

      <Row gutter={12}>
        <Col span={6}>
          <Card size="small">
            <Text type="secondary">Tiến độ tổng thể</Text>
            <Progress percent={progressPct} status={progressPct === 100 ? 'success' : 'active'} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Text type="secondary">Tổng giai đoạn</Text>
            <Title level={3} className="!mt-1 !mb-0">{totalCount}</Title>
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Text type="secondary">Hoàn thành</Text>
            <Title level={3} className="!mt-1 !mb-0" style={{ color: '#52c41a' }}>{doneCount}</Title>
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Text type="secondary">Đang làm</Text>
            <Title level={3} className="!mt-1 !mb-0" style={{ color: '#1890FF' }}>{inProgressCount}</Title>
          </Card>
        </Col>
      </Row>

      <Alert
        type="info"
        showIcon
        message="Sprint 30 ngày đầu — khuyến nghị"
        description={
          <ul className="!mb-0 !pl-5">
            <li><b>Tuần 1-2</b>: Giai đoạn 2 — Google Vertex AI. ROI cao nhất, $300 free credit + free tier Gemini 2.5 Flash.</li>
            <li><b>Tuần 3</b>: Giai đoạn 3 — Alibaba Bailian. Qwen tiếng Việt xuất sắc, 1 tuần vì OpenAI-compatible.</li>
            <li><b>Tuần 4</b>: Giai đoạn 1 (phần đầu) — Vector RAG. Dùng text-embedding-004 free từ Google (sprint 1 đã có).</li>
          </ul>
        }
      />

      <Card>
        <Timeline
          mode="left"
          items={PHASES.map(phase => ({
            dot: <span style={{ fontSize: 18, color: phase.color }}>{phase.icon}</span>,
            color: phase.color,
            children: (
              <Card
                size="small"
                style={{ marginBottom: 12, borderLeft: `3px solid ${phase.color}` }}
                title={
                  <Space>
                    <Text strong style={{ fontSize: 15 }}>
                      Giai đoạn {phase.id} — {phase.title}
                    </Text>
                    <Badge status={STATUS_META[phase.status].color as 'success'|'processing'|'default'|'error'|'warning'} text={STATUS_META[phase.status].label} />
                  </Space>
                }
                extra={
                  <Space>
                    <Tooltip title="Độ ưu tiên">
                      <PriorityStars count={phase.priority} />
                    </Tooltip>
                    <Tag icon={<ClockCircleOutlined />}>{phase.weeks}</Tag>
                  </Space>
                }
              >
                <Paragraph style={{ marginBottom: 8 }}>
                  <Text strong>Mục tiêu: </Text>{phase.goal}
                </Paragraph>
                <div className="mb-2">
                  <Text strong>Tech: </Text>
                  <Space size={4} wrap>
                    {phase.tech.map(t => <Tag key={t} color={phase.color} style={{ marginInlineEnd: 0 }}>{t}</Tag>)}
                  </Space>
                </div>
                <div className="mb-2">
                  <Text strong>Deliverables:</Text>
                  <ul className="!mb-0 !pl-5" style={{ fontSize: 13 }}>
                    {phase.deliverables.map((d, i) => (
                      <li key={i}><Text>{d}</Text></li>
                    ))}
                  </ul>
                </div>
                <Alert
                  type="success"
                  showIcon
                  className="mt-2"
                  message={<Text style={{ fontSize: 12 }}><b>Success: </b>{phase.successCriteria}</Text>}
                />
              </Card>
            ),
          }))}
        />
      </Card>

      <Card title="Lộ trình 6 tháng đề xuất" size="small">
        <Table
          rowKey="month"
          size="small"
          pagination={false}
          dataSource={[
            { month: 'M1', phases: 'Giai đoạn 2 + 3 + 1 (foundation)', outcome: '6 providers mới, semantic search' },
            { month: 'M2', phases: 'Giai đoạn 4 + 5 (phần 1)',          outcome: 'Router + built-in tools' },
            { month: 'M3', phases: 'Giai đoạn 5 (phần 2) + 9',          outcome: 'Custom tools + orchestration + metrics' },
            { month: 'M4', phases: 'Giai đoạn 6 + 7',                   outcome: 'SaaS-ready (multi-tenant + SSO)' },
            { month: 'M5', phases: 'Giai đoạn 8 + 10',                  outcome: 'Monetize + production-safe' },
            { month: 'M6', phases: 'Giai đoạn 11 + 14',                 outcome: 'Launch-ready (marketplace + backup)' },
          ]}
          columns={[
            { title: 'Tháng', dataIndex: 'month', width: 80, render: v => <Tag color="blue">{v}</Tag> },
            { title: 'Giai đoạn chính', dataIndex: 'phases' },
            { title: 'Outcome', dataIndex: 'outcome' },
          ]}
        />
        <Paragraph type="secondary" className="!mt-3 !mb-0 text-xs">
          Giai đoạn 12 (fine-tune) + 13 (K8s scaling) để Q4 2026 khi đã có users thật.
        </Paragraph>
      </Card>

      <Card title="Chuẩn bị trước: cấu hình API keys" size="small">
        <Paragraph>
          Bạn có thể <b>add keys ngay bây giờ</b> cho các providers và integrations mới,
          kể cả khi backend chưa wire hoàn chỉnh. UI đã scaffold sẵn 2 trang:
        </Paragraph>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Link href="/settings/ai">
            <Tag color="blue" icon={<CloudOutlined />}>/settings/ai</Tag>
            <Text> — LLM providers (Vertex AI, Alibaba, Cerebras, Together, Fireworks, Replicate)</Text>
          </Link>
          <Link href="/settings/integrations">
            <Tag color="purple" icon={<CodeSandboxOutlined />}>/settings/integrations</Tag>
            <Text> — Tools + Email + Payment + Monitoring + Safety + Storage</Text>
          </Link>
        </Space>
      </Card>
    </div>
  )
}
