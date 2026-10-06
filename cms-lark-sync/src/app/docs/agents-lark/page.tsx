'use client'

import { Card, Typography, Table, Tag, Alert, Collapse, Divider, Steps } from 'antd'
import {
  RobotOutlined, ThunderboltOutlined, CustomerServiceOutlined,
  ToolOutlined, DashboardOutlined, DeploymentUnitOutlined,
  BulbOutlined, ApiOutlined, DatabaseOutlined,
} from '@ant-design/icons'
import useLang from '@/store/language'

const { Title, Paragraph, Text } = Typography

const i = {
  vi: {
    title: 'Hệ thống Lark Agents — Đặc tả nghiệp vụ',
    desc: 'Tài liệu đặc tả kỹ thuật cho hệ sinh thái 3 Lark Agents + Admin Dashboard, bao gồm kiến trúc, AI learning loop, và deployment.',
    arch: 'Kiến trúc tổng quan',
    archDesc: 'Hệ thống gồm 3 agent Python/FastAPI độc lập, mỗi agent có SQLite riêng, giao tiếp qua Lark API. Admin Dashboard tổng hợp dữ liệu từ tất cả agents.',
    agents: 'Các Agents',
    ba: 'Agent BA Tracker',
    baDesc: 'Theo dõi thay đổi trên Lark Wiki/Base. Khi phát hiện thay đổi → AI phân tích → gửi card xác nhận → user confirm/giải thích → tự động cập nhật wiki changelog.',
    engineer: 'Agent Lark Engineer',
    engineerDesc: 'Kỹ thuật viên Lark Base: nhận yêu cầu bằng ngôn ngữ tự nhiên → AI tạo execution plan → thực thi tự động (thêm field, formula, table, diagnose).',
    cskh: 'Agent CSKH',
    cskhDesc: 'Chăm sóc khách hàng: phân tích tính cách (MBTI/DISC) từ lịch sử chat, tra cứu sản phẩm 1688/Taobao, gợi ý kịch bản lifecycle.',
    learning: 'AI Learning Loop',
    learningDesc: 'Tất cả agents sử dụng cùng pattern: Ollama (local, miễn phí) làm primary → Claude API làm fallback khi confidence thấp. Mỗi lần Claude được gọi, kết quả được lưu vào bảng ai_learnings và inject vào prompt lần sau dưới dạng few-shot examples.',
    admin: 'Admin Dashboard',
    adminDesc: 'Gồm api-agents-admin (FastAPI backend) và cms-agents-admin (Next.js frontend). Hiển thị health status, Docker logs/stats, AI learnings, và agent data cho tất cả agents.',
    deploy: 'Deployment',
    deployDesc: 'Tất cả deploy qua GitLab CI/CD. Mỗi push lên main tự động test + build Docker image. Deploy manual trigger.',
    portMap: 'Port Mapping',
    endpoints: 'API Endpoints',
  },
  en: {
    title: 'Lark Agents System — Technical Specification',
    desc: 'Technical documentation for the 3 Lark Agents ecosystem + Admin Dashboard, including architecture, AI learning loop, and deployment.',
    arch: 'Architecture Overview',
    archDesc: 'The system consists of 3 independent Python/FastAPI agents, each with its own SQLite database, communicating via Lark API. The Admin Dashboard aggregates data from all agents.',
    agents: 'Agents',
    ba: 'BA Tracker Agent',
    baDesc: 'Monitors changes on Lark Wiki/Base. On change detection → AI analysis → sends confirmation card → user confirms/explains → auto-updates wiki changelog.',
    engineer: 'Lark Engineer Agent',
    engineerDesc: 'Lark Base engineer: receives natural language instructions → AI creates execution plan → auto-executes (add fields, formulas, tables, diagnose).',
    cskh: 'CSKH Agent (Customer Care)',
    cskhDesc: 'Customer care: personality analysis (MBTI/DISC) from chat history, product search on 1688/Taobao, lifecycle script suggestions.',
    learning: 'AI Learning Loop',
    learningDesc: 'All agents use the same pattern: Ollama (local, free) as primary → Claude API as fallback when confidence is low. Each time Claude is called, the result is saved to ai_learnings table and injected into the next prompt as few-shot examples.',
    admin: 'Admin Dashboard',
    adminDesc: 'Consists of api-agents-admin (FastAPI backend) and cms-agents-admin (Next.js frontend). Shows health status, Docker logs/stats, AI learnings, and agent data for all agents.',
    deploy: 'Deployment',
    deployDesc: 'All deployments via GitLab CI/CD. Each push to main auto-runs test + build Docker image. Deploy requires manual trigger.',
    portMap: 'Port Mapping',
    endpoints: 'API Endpoints',
  },
}

const portData = [
  { service: 'Agent BA Tracker', internal: 8001, external: 6003, domain: 'agent-lark-ba.toolswave.net', container: 'agentlarkba' },
  { service: 'Agent Engineer', internal: 8002, external: 6005, domain: 'agent-lark-engineer.toolswave.net', container: 'agentlarkengineer' },
  { service: 'Agent CSKH', internal: 8003, external: 6006, domain: 'agent-lark-cskh.toolswave.net', container: 'agentlarkcskh' },
  { service: 'Admin API', internal: 8080, external: 6004, domain: 'agents-lark.toolswave.net', container: 'agentslarkadmin' },
  { service: 'Admin CMS', internal: 3000, external: 6007, domain: 'cms-agents.toolswave.net', container: 'cmsagentsadmin' },
  { service: 'Invoice Agent', internal: 8000, external: 6002, domain: 'agents-lark-webhooks.toolswave.net', container: 'agentslarkwebhooks' },
]

const portColumns = [
  { title: 'Service', dataIndex: 'service', key: 'service' },
  { title: 'Internal Port', dataIndex: 'internal', key: 'internal' },
  { title: 'External Port', dataIndex: 'external', key: 'external' },
  { title: 'Domain', dataIndex: 'domain', key: 'domain', render: (d: string) => <Text code style={{ fontSize: 11 }}>{d}</Text> },
  { title: 'Container', dataIndex: 'container', key: 'container', render: (c: string) => <Tag>{c}</Tag> },
]

const baEndpoints = [
  { method: 'POST', path: '/webhook/doc-changed', desc: 'Trigger khi doc/wiki thay doi' },
  { method: 'POST', path: '/webhook/base-changed', desc: 'Trigger khi base schema thay doi' },
  { method: 'POST', path: '/webhook/manual', desc: 'Trigger thu cong (synchronous)' },
  { method: 'POST', path: '/webhook/lark-event', desc: 'Lark Event Subscription handler' },
  { method: 'GET', path: '/callback/confirm', desc: 'User bam "Dung roi" → update wiki' },
  { method: 'GET', path: '/form/{change_id}', desc: 'Form giai thich thay doi' },
  { method: 'POST', path: '/form/{change_id}', desc: 'Submit form giai thich' },
  { method: 'GET', path: '/changes', desc: 'List cac thay doi gan day' },
  { method: 'GET', path: '/wiki-spaces', desc: 'List wiki spaces do agent quan ly' },
  { method: 'GET', path: '/learnings', desc: 'List AI learnings' },
]

const engEndpoints = [
  { method: 'POST', path: '/task', desc: 'Submit task — AI plan + execute' },
  { method: 'POST', path: '/task/plan-only', desc: 'AI plan only, no execute' },
  { method: 'GET', path: '/task/{task_id}', desc: 'Get task status/detail' },
  { method: 'GET', path: '/tasks', desc: 'List all tasks' },
  { method: 'GET', path: '/tasks/stats', desc: 'Task execution statistics' },
  { method: 'GET', path: '/base/{app_token}/schema', desc: 'Get Lark Base schema (JSON)' },
  { method: 'GET', path: '/base/{app_token}/schema/yaml', desc: 'Get schema (YAML)' },
  { method: 'POST', path: '/base/{app_token}/diagnose', desc: 'Run base diagnostics' },
  { method: 'GET', path: '/learnings', desc: 'List AI learnings' },
]

const cskhEndpoints = [
  { method: 'POST', path: '/search/product', desc: 'Tra cuu san pham 1688/Taobao' },
  { method: 'POST', path: '/quote', desc: 'Tao bao gia nhanh' },
  { method: 'GET', path: '/customers', desc: 'List khach hang' },
  { method: 'POST', path: '/customer', desc: 'Tao/cap nhat khach hang' },
  { method: 'POST', path: '/customer/{id}/analyze', desc: 'Phan tich MBTI/DISC' },
  { method: 'POST', path: '/customer/{id}/lifecycle', desc: 'Goi y cham soc lifecycle' },
  { method: 'GET', path: '/learnings', desc: 'List AI learnings' },
]

const endpointColumns = [
  { title: 'Method', dataIndex: 'method', key: 'method', width: 80, render: (m: string) => <Tag color={m === 'GET' ? 'green' : 'blue'}>{m}</Tag> },
  { title: 'Path', dataIndex: 'path', key: 'path', render: (p: string) => <Text code style={{ fontSize: 12 }}>{p}</Text> },
  { title: 'Description', dataIndex: 'desc', key: 'desc' },
]

export default function AgentsLarkPage() {
  const { lang } = useLang()
  const t = i[lang] || i.vi

  const learningSteps = [
    { title: 'User trigger', description: 'Webhook / manual / Lark event' },
    { title: 'Ollama (local)', description: 'Free, fast — check confidence' },
    { title: 'Confidence check', description: '>= threshold → use result' },
    { title: 'Claude fallback', description: 'If low confidence → call Claude API' },
    { title: 'Save learning', description: 'Store Ollama vs Claude answers in SQLite' },
    { title: 'Few-shot inject', description: 'Next time: inject past learnings into prompt' },
  ]

  return (
    <div style={{ maxWidth: 1000 }}>
      <Title level={2}><RobotOutlined /> {t.title}</Title>
      <Paragraph type="secondary">{t.desc}</Paragraph>

      <Alert
        type="info"
        showIcon
        message="Server: deveris@100.100.164.92 — Deploy via GitLab CI/CD"
        style={{ marginBottom: 24 }}
      />

      {/* Architecture */}
      <Card title={<><DeploymentUnitOutlined /> {t.arch}</>} style={{ marginBottom: 20 }}>
        <Paragraph>{t.archDesc}</Paragraph>
        <pre style={{ background: 'var(--bg-tertiary, #f5f5f5)', padding: 16, borderRadius: 8, fontSize: 13, overflow: 'auto' }}>
{`Lark Suite
  ├── Event Subscription → agent-lark-ba (:8001)   → SQLite (snapshots, changes, learnings, wiki_spaces)
  ├── Event Subscription → agent-lark-engineer (:8002) → SQLite (tasks, learnings)
  ├── Event Subscription → agent-lark-cskh (:8003)  → SQLite (customers, search_history, learnings)
  └── Bot Webhook ← agents send cards/messages

Admin Dashboard
  ├── api-agents-admin (:8080) → aggregates health/logs/stats/learnings from all agents
  └── cms-agents-admin (:3000) → Next.js frontend

AI Providers
  ├── Ollama (local, primary) — llama3
  └── Claude API (fallback) — claude-sonnet-4-20250514`}
        </pre>
      </Card>

      {/* Port Mapping */}
      <Card title={<><ApiOutlined /> {t.portMap}</>} style={{ marginBottom: 20 }}>
        <Table dataSource={portData} columns={portColumns} pagination={false} size="small" rowKey="container" />
      </Card>

      <Divider />

      {/* Agent BA */}
      <Card title={<><ThunderboltOutlined style={{ color: '#6366f1' }} /> {t.ba}</>} style={{ marginBottom: 20, borderLeft: '3px solid #6366f1' }}>
        <Paragraph>{t.baDesc}</Paragraph>
        <Paragraph strong>Lark App: lark_business_analyst</Paragraph>
        <Paragraph type="secondary">
          Flow: Lark trigger → doc doc wiki → so sanh snapshot → AI phan tich (Ollama→Claude)
          → gui card xac nhan → user confirm/form → tu dong tao wiki space + ghi changelog
        </Paragraph>
        <Paragraph strong>Dynamic Wiki: Moi base/context duoc phan tich → agent tu tao wiki space rieng → luu mapping trong SQLite</Paragraph>
        <Collapse ghost items={[{
          key: 'ba-endpoints',
          label: <Text strong>{t.endpoints}</Text>,
          children: <Table dataSource={baEndpoints} columns={endpointColumns} pagination={false} size="small" rowKey="path" />,
        }]} />
      </Card>

      {/* Agent Engineer */}
      <Card title={<><ToolOutlined style={{ color: '#ef4444' }} /> {t.engineer}</>} style={{ marginBottom: 20, borderLeft: '3px solid #ef4444' }}>
        <Paragraph>{t.engineerDesc}</Paragraph>
        <Paragraph strong>Lark App: lark_engineer</Paragraph>
        <Paragraph type="secondary">
          Flow: User gui yeu cau → AI classify complexity (keywords) → Ollama (simple) / Claude (complex)
          → tao execution plan → execute tren Lark Base API → luu task history + learning
        </Paragraph>
        <Paragraph strong>Task Intelligence: Past tasks + error patterns duoc inject vao prompt de AI hoc tu kinh nghiem</Paragraph>
        <Collapse ghost items={[{
          key: 'eng-endpoints',
          label: <Text strong>{t.endpoints}</Text>,
          children: <Table dataSource={engEndpoints} columns={endpointColumns} pagination={false} size="small" rowKey="path" />,
        }]} />
      </Card>

      {/* Agent CSKH */}
      <Card title={<><CustomerServiceOutlined style={{ color: '#3b82f6' }} /> {t.cskh}</>} style={{ marginBottom: 20, borderLeft: '3px solid #3b82f6' }}>
        <Paragraph>{t.cskhDesc}</Paragraph>
        <Paragraph type="secondary">
          3 AI modules: personality.py (MBTI/DISC), product_search.py (1688/Taobao + AI lookup),
          lifecycle.py (before/during/after cham soc). Tat ca co few-shot + Claude fallback.
        </Paragraph>
        <Collapse ghost items={[{
          key: 'cskh-endpoints',
          label: <Text strong>{t.endpoints}</Text>,
          children: <Table dataSource={cskhEndpoints} columns={endpointColumns} pagination={false} size="small" rowKey="path" />,
        }]} />
      </Card>

      <Divider />

      {/* Learning Loop */}
      <Card title={<><BulbOutlined /> {t.learning}</>} style={{ marginBottom: 20 }}>
        <Paragraph>{t.learningDesc}</Paragraph>
        <Steps direction="vertical" size="small" current={-1} items={learningSteps} style={{ marginTop: 16 }} />

        <Divider dashed />

        <Title level={5}><DatabaseOutlined /> ai_learnings Table Schema</Title>
        <pre style={{ background: 'var(--bg-tertiary, #f5f5f5)', padding: 16, borderRadius: 8, fontSize: 12 }}>
{`-- Agent BA: diff_type, ollama_answer, claude_answer, user_correction
-- Agent Engineer: instruction_type, ollama_answer, claude_answer, task_id
-- Agent CSKH: context_type (personality|product_lookup|lifecycle|translation),
--             ollama_answer, claude_answer, confidence, model_used

CREATE TABLE ai_learnings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  context_type TEXT,     -- loai AI call
  ollama_answer TEXT,    -- Ollama tra loi gi (thuong sai)
  claude_answer TEXT,    -- Claude tra loi gi (dung hon)
  user_correction TEXT,  -- User sua lai (neu co)
  confidence REAL,       -- Do tu tin
  model_used TEXT,       -- ollama | claude
  created_at TEXT
);`}
        </pre>
      </Card>

      {/* Admin Dashboard */}
      <Card title={<><DashboardOutlined /> {t.admin}</>} style={{ marginBottom: 20 }}>
        <Paragraph>{t.adminDesc}</Paragraph>
        <Table
          dataSource={[
            { feature: 'Health check', desc: 'Ping /health cua moi agent', status: 'OK' },
            { feature: 'Docker logs', desc: 'Lay container logs (timestamps, tail)', status: 'OK' },
            { feature: 'Docker stats', desc: 'CPU, Memory, Network I/O, PIDs', status: 'OK' },
            { feature: 'AI Learnings', desc: 'Hien thi ai_learnings tu moi agent', status: 'OK' },
            { feature: 'Agent data', desc: '/changes, /tasks, /customers, /wiki-spaces', status: 'OK' },
            { feature: 'Restart', desc: 'docker restart container', status: 'OK' },
          ]}
          columns={[
            { title: 'Feature', dataIndex: 'feature', key: 'feature' },
            { title: 'Description', dataIndex: 'desc', key: 'desc' },
            { title: 'Status', dataIndex: 'status', key: 'status', render: (s: string) => <Tag color="green">{s}</Tag> },
          ]}
          pagination={false} size="small" rowKey="feature"
        />
      </Card>

      {/* Deployment */}
      <Card title={<><DeploymentUnitOutlined /> {t.deploy}</>} style={{ marginBottom: 20 }}>
        <Paragraph>{t.deployDesc}</Paragraph>
        <Paragraph type="secondary">
          GitLab CI/CD Variables can thiet: BA_LARK_APP_ID, BA_LARK_APP_SECRET, BA_LARK_BOT_WEBHOOK_URL,
          ENG_LARK_APP_ID, ENG_LARK_APP_SECRET, ENG_LARK_BOT_WEBHOOK_URL,
          CSKH_LARK_APP_ID, CSKH_LARK_APP_SECRET, CSKH_LARK_BOT_WEBHOOK_URL,
          AGENTS_ANTHROPIC_API_KEY, ADMIN_PASSWORD
        </Paragraph>
        <pre style={{ background: 'var(--bg-tertiary, #f5f5f5)', padding: 16, borderRadius: 8, fontSize: 12 }}>
{`# Pipeline flow (moi agent):
push main → test (py_compile) → build (docker build) → deploy (manual trigger)

# Deploy co rollback tu dong:
1. Tag current image as :previous
2. Build new image
3. docker run with --env-file
4. Health check (30s timeout)
5. If fail → rollback to :previous`}
        </pre>
      </Card>
    </div>
  )
}
