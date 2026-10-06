'use client'

import { Card, Typography, Table, Tag, Alert, Tabs, Divider, Steps, Collapse } from 'antd'
import {
  ThunderboltOutlined,
  RobotOutlined,
  EditOutlined,
  CameraOutlined,
  DatabaseOutlined,
  ApiOutlined,
  CheckCircleOutlined,
  CodeOutlined,
  BulbOutlined,
} from '@ant-design/icons'
import useLang from '@/store/language'
import TourGuide from '@/components/TourGuide'
import { tourSteps } from '@/lib/tourSteps'

const { Title, Paragraph, Text } = Typography

const i = {
  vi: {
    title: 'Hướng dẫn Demo Products',
    subtitle: 'Tài liệu chi tiết cho 5 sản phẩm demo — cách sử dụng, API, kiến trúc, và phát triển mở rộng.',
    overview: 'Tổng quan',
    overviewDesc: 'CMS Hoa Nam cung cấp 5 sản phẩm demo minh hoạ các khả năng của hệ thống AI Agent, Lark Integration, và Multi-channel Bot.',
    prereq: 'Yêu cầu chung',
    prereqDesc: 'Tất cả demo đều cần có ít nhất 1 AI Config đã cấu hình (Settings → AI API Keys). Demo sử dụng config mặc định.',
    products: [
      {
        key: 'chatbot',
        icon: '🤖',
        name: 'Chat Bot',
        route: '/chatbot',
        desc: 'Tạo đặc tả hệ thống (spec) từ mô tả tự nhiên. AI sinh ra: metadata, tài liệu, bảng dữ liệu, workflows, diagrams, automations, sample data.',
        howTo: [
          'Nhập mô tả hệ thống cần thiết kế (VD: "Hệ thống quản lý nhân sự")',
          'Chọn ngôn ngữ đầu ra (VI/EN) và mức chi tiết (Basic/Standard/Detailed)',
          'Nhấn "Generate" — AI streaming kết quả theo từng phần',
          'Xem kết quả: Meta, Documents, Tables, Workflows, Diagrams, Automations, Sample Data',
        ],
        api: 'POST /api-openai/generate — gọi AI với system prompt chuyên biệt cho Lark Bitable schema',
        tech: 'PromptForm component → aiProvider.ts (streaming) → multi-view components (TablesView, WorkflowsView, DiagramsView...)',
      },
      {
        key: 'ai-tools',
        icon: '⚡',
        name: 'Công cụ AI Văn bản',
        route: '/demo/ai-tools',
        desc: '4 công cụ xử lý văn bản: Tóm tắt, Dịch thuật (6 ngôn ngữ), Viết lại (5 giọng văn), Kiểm tra ngữ pháp. Streaming real-time.',
        howTo: [
          'Chọn tab công cụ: Tóm tắt / Dịch thuật / Viết lại / Ngữ pháp',
          'Dán văn bản cần xử lý vào ô bên trái',
          'Chọn tuỳ chọn (ngôn ngữ đích, giọng văn, số câu...)',
          'Nhấn "Xử lý" — kết quả streaming bên phải',
          'Nhấn "Hoán đổi" để dùng kết quả làm đầu vào mới (chain processing)',
          'Nhấn "Copy" để sao chép kết quả',
        ],
        api: 'GET /api/ai-configs → lấy config mặc định → resolve API key → gọi trực tiếp Anthropic/OpenAI streaming API',
        tech: 'Fetch AI config → Direct browser API call (anthropic-dangerous-direct-browser-access) → SSE stream parsing',
      },
      {
        key: 'image',
        icon: '📷',
        name: 'Phân tích Hình ảnh',
        route: '/demo/image-analyzer',
        desc: 'Tải ảnh lên, AI phân tích với 4 chế độ: Mô tả chi tiết, Trích xuất văn bản (OCR), Trích xuất dữ liệu (bảng/form), Nhận diện đối tượng.',
        howTo: [
          'Kéo thả hoặc nhấn để tải ảnh lên (PNG/JPG/WEBP/GIF)',
          'Xem preview ảnh bên trái',
          'Chọn chế độ phân tích: Mô tả / OCR / Dữ liệu / Đối tượng',
          'Nhấn "Phân tích" — kết quả streaming bên phải',
          'Nhấn "Copy" để sao chép kết quả',
        ],
        api: 'Anthropic Messages API với image block (base64) hoặc OpenAI Chat API với image_url. Model cần hỗ trợ vision.',
        tech: 'FileReader → base64 encoding → Direct Anthropic/OpenAI Vision API call → SSE stream',
      },
      {
        key: 'knowledge',
        icon: '📚',
        name: 'Hỏi đáp Knowledge Base',
        route: '/demo/knowledge-qa',
        desc: 'Demo RAG (Retrieval Augmented Generation): chọn AI Agent, hỏi đáp với knowledge base, xem streaming response.',
        howTo: [
          'Chọn AI Agent từ dropdown (mỗi agent có KB riêng)',
          'Xem danh sách tài liệu KB ở sidebar phải',
          'Nhập câu hỏi và nhấn "Gửi"',
          'AI tìm tài liệu liên quan → đưa vào context → trả lời streaming',
          'Nếu Q&A score ≥ 12: trả lời chính xác mà không gọi LLM',
          'Nhấn gợi ý câu hỏi mẫu để bắt đầu nhanh',
        ],
        api: 'POST /api/ai-agents/:id/chat — body: { message, history[] }. Server-side RAG: load KB → scoreRelevance/scoreQA → buildContext → LLM stream',
        tech: 'Fetch API streaming (text/event-stream) → accumulate text → render real-time. Chat history maintained in state (last 8 messages).',
      },
      {
        key: 'webhook',
        icon: '🔗',
        name: 'Webhook Tester',
        route: '/demo/webhook-tester',
        desc: 'Công cụ gửi HTTP request đến webhook endpoints. Hỗ trợ preset cho Lark Bot, Telegram Bot, generic webhook.',
        howTo: [
          'Chọn preset template: Lark Custom Bot / Telegram Bot / Generic Webhook',
          'Nhập URL webhook (hoặc dùng URL từ preset)',
          'Tuỳ chỉnh method (GET/POST/PUT/DELETE), headers, body JSON',
          'Nhấn "Gửi" — response hiển thị bên phải (status code, body, thời gian)',
          'Xem lịch sử request bên dưới (lưu 20 request gần nhất)',
          'Nhấn vào lịch sử để tự động điền lại URL/method/body',
        ],
        api: 'Direct fetch() từ browser đến URL đích. Không qua backend — gửi trực tiếp.',
        tech: 'Browser fetch API → response parsing → JSON formatting → history in state (max 20)',
      },
    ],
    archTitle: 'Kiến trúc chung',
    archDesc: 'Tất cả demo sử dụng cùng hạ tầng AI config. Luồng hoạt động:',
    extendTitle: 'Mở rộng & Phát triển',
    extendItems: [
      'Thêm demo mới: tạo thư mục /demo/{name}/ với page.tsx, thêm vào layout.tsx menu + i18n',
      'Thêm AI tool: thêm entry vào TOOLS object trong ai-tools/page.tsx với prompt template',
      'Thêm image mode: thêm entry vào MODES array trong image-analyzer/page.tsx',
      'Tạo demo tái sử dụng: tách logic AI streaming thành hook useAIStream()',
      'Deploy demo riêng: các demo page độc lập, có thể extract thành micro-app',
    ],
  },
  en: {
    title: 'Demo Products Guide',
    subtitle: 'Detailed documentation for 5 demo products — usage, API, architecture, and extension guide.',
    overview: 'Overview',
    overviewDesc: 'CMS Hoa Nam provides 5 demo products showcasing the capabilities of the AI Agent system, Lark Integration, and Multi-channel Bot.',
    prereq: 'Prerequisites',
    prereqDesc: 'All demos require at least 1 configured AI Config (Settings → AI API Keys). Demos use the default config.',
    products: [
      {
        key: 'chatbot',
        icon: '🤖',
        name: 'Chat Bot',
        route: '/chatbot',
        desc: 'Generate system specifications from natural language descriptions. AI produces: metadata, documents, data tables, workflows, diagrams, automations, sample data.',
        howTo: [
          'Enter a system description (e.g., "HR management system")',
          'Select output language (VI/EN) and detail level (Basic/Standard/Detailed)',
          'Click "Generate" — AI streams results section by section',
          'View results: Meta, Documents, Tables, Workflows, Diagrams, Automations, Sample Data',
        ],
        api: 'POST /api-openai/generate — calls AI with specialized system prompt for Lark Bitable schema',
        tech: 'PromptForm component → aiProvider.ts (streaming) → multi-view components (TablesView, WorkflowsView, DiagramsView...)',
      },
      {
        key: 'ai-tools',
        icon: '⚡',
        name: 'AI Text Tools',
        route: '/demo/ai-tools',
        desc: '4 text processing tools: Summarize, Translate (6 languages), Rewrite (5 tones), Grammar Check. Real-time streaming.',
        howTo: [
          'Select tool tab: Summarize / Translate / Rewrite / Grammar',
          'Paste text to process in the left box',
          'Choose options (target language, tone, sentence count...)',
          'Click "Process" — results stream on the right',
          'Click "Swap" to use output as new input (chain processing)',
          'Click "Copy" to copy results',
        ],
        api: 'GET /api/ai-configs → get default config → resolve API key → call Anthropic/OpenAI streaming API directly',
        tech: 'Fetch AI config → Direct browser API call (anthropic-dangerous-direct-browser-access) → SSE stream parsing',
      },
      {
        key: 'image',
        icon: '📷',
        name: 'Image Analyzer',
        route: '/demo/image-analyzer',
        desc: 'Upload image, AI analyzes with 4 modes: Detailed Description, Text Extraction (OCR), Data Extraction (tables/forms), Object Identification.',
        howTo: [
          'Drag & drop or click to upload image (PNG/JPG/WEBP/GIF)',
          'Preview image on the left',
          'Select analysis mode: Describe / OCR / Data / Objects',
          'Click "Analyze" — results stream on the right',
          'Click "Copy" to copy results',
        ],
        api: 'Anthropic Messages API with image block (base64) or OpenAI Chat API with image_url. Model must support vision.',
        tech: 'FileReader → base64 encoding → Direct Anthropic/OpenAI Vision API call → SSE stream',
      },
      {
        key: 'knowledge',
        icon: '📚',
        name: 'Knowledge Q&A',
        route: '/demo/knowledge-qa',
        desc: 'RAG (Retrieval Augmented Generation) demo: select AI Agent, Q&A with knowledge base, see streaming responses.',
        howTo: [
          'Select AI Agent from dropdown (each agent has its own KB)',
          'View KB document list in right sidebar',
          'Enter question and click "Send"',
          'AI finds relevant docs → adds to context → streams response',
          'If Q&A score ≥ 12: returns exact answer without calling LLM',
          'Click suggested questions to start quickly',
        ],
        api: 'POST /api/ai-agents/:id/chat — body: { message, history[] }. Server-side RAG: load KB → scoreRelevance/scoreQA → buildContext → LLM stream',
        tech: 'Fetch API streaming (text/event-stream) → accumulate text → render real-time. Chat history maintained in state (last 8 messages).',
      },
      {
        key: 'webhook',
        icon: '🔗',
        name: 'Webhook Tester',
        route: '/demo/webhook-tester',
        desc: 'HTTP request builder for webhook endpoints. Includes presets for Lark Bot, Telegram Bot, generic webhooks.',
        howTo: [
          'Select preset template: Lark Custom Bot / Telegram Bot / Generic Webhook',
          'Enter webhook URL (or use URL from preset)',
          'Customize method (GET/POST/PUT/DELETE), headers, body JSON',
          'Click "Send" — response displays on the right (status code, body, duration)',
          'View request history below (saves 20 most recent)',
          'Click history item to auto-fill URL/method/body',
        ],
        api: 'Direct fetch() from browser to target URL. No backend proxy — sends directly.',
        tech: 'Browser fetch API → response parsing → JSON formatting → history in state (max 20)',
      },
    ],
    archTitle: 'Common Architecture',
    archDesc: 'All demos use the same AI config infrastructure. Workflow:',
    extendTitle: 'Extension & Development',
    extendItems: [
      'Add new demo: create /demo/{name}/ directory with page.tsx, add to layout.tsx menu + i18n',
      'Add AI tool: add entry to TOOLS object in ai-tools/page.tsx with prompt template',
      'Add image mode: add entry to MODES array in image-analyzer/page.tsx',
      'Create reusable demo: extract AI streaming logic into useAIStream() hook',
      'Deploy demo independently: demo pages are self-contained, can be extracted as micro-apps',
    ],
  },
}

type Product = typeof i.vi.products[0]

function ProductCard({ p, lang }: { p: Product; lang: string }) {
  return (
    <Card
      size="small"
      title={<span>{p.icon} {p.name} <Tag color="blue">{p.route}</Tag></span>}
    >
      <Paragraph>{p.desc}</Paragraph>

      <Divider style={{ margin: '12px 0' }} orientation="left">
        {lang === 'vi' ? 'Cách sử dụng' : 'How to Use'}
      </Divider>
      <Steps
        direction="vertical"
        size="small"
        current={-1}
        items={p.howTo.map((step, i) => ({
          title: <Text style={{ fontSize: 13 }}>{step}</Text>,
        }))}
      />

      <Collapse
        size="small"
        ghost
        style={{ marginTop: 12 }}
        items={[
          {
            key: 'api',
            label: <span><ApiOutlined className="mr-1" />{lang === 'vi' ? 'API sử dụng' : 'API Used'}</span>,
            children: <Text code style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>{p.api}</Text>,
          },
          {
            key: 'tech',
            label: <span><CodeOutlined className="mr-1" />{lang === 'vi' ? 'Chi tiết kỹ thuật' : 'Technical Details'}</span>,
            children: <Text style={{ fontSize: 12 }}>{p.tech}</Text>,
          },
        ]}
      />
    </Card>
  )
}

export default function DemoGuidePage() {
  const { lang } = useLang()
  const c = i[lang as 'vi' | 'en'] || i.vi

  return (
    <div className="space-y-3">
      <Title level={3}>
        <ThunderboltOutlined className="mr-2" />
        {c.title}
      </Title>
      <Paragraph type="secondary">{c.subtitle}</Paragraph>

      {/* Overview */}
      <Alert type="info" showIcon message={c.overview} description={c.overviewDesc} />

      <Alert type="warning" showIcon icon={<BulbOutlined />} message={c.prereq} description={c.prereqDesc} />

      {/* Product cards */}
      <Tabs
        size="small"
        items={c.products.map((p: Product) => ({
          key: p.key,
          label: <span>{p.icon} {p.name}</span>,
          children: <ProductCard p={p} lang={lang} />,
        }))}
      />

      {/* Architecture */}
      <Card size="small" title={<span><CodeOutlined className="mr-2" />{c.archTitle}</span>}>
        <Paragraph type="secondary">{c.archDesc}</Paragraph>
        <pre className="theme-code" style={{ fontSize: 12 }}>{`┌──────────────────┐     ┌─────────────────────┐     ┌────────────────┐
│   Demo Page      │────▶│   /api/ai-configs    │────▶│  AI Provider   │
│   (Browser)      │     │   (get default key)  │     │  (Anthropic/   │
│                  │     │                      │     │   OpenAI/Groq) │
│  ┌────────────┐  │     └─────────────────────┘     └────────────────┘
│  │ AI Tools   │──┼───────────────────────────────────▶ Direct API
│  │ Image AI   │──┼───────────────────────────────────▶ (streaming)
│  └────────────┘  │
│                  │     ┌─────────────────────┐
│  ┌────────────┐  │────▶│   /api/ai-agents     │────▶  Server-side
│  │ KB Q&A     │──┼────▶│   /:id/chat (RAG)    │────▶  LLM call
│  └────────────┘  │     └─────────────────────┘
│                  │
│  ┌────────────┐  │
│  │ Webhook    │──┼───────────────────────────────────▶ Direct fetch()
│  │ Tester     │──┼───────────────────────────────────▶ (to target URL)
│  └────────────┘  │
│                  │
│  ┌────────────┐  │     ┌─────────────────────┐
│  │ Chat Bot   │──┼────▶│   /api-openai/       │────▶  Server-side
│  │ (Spec Gen) │──┼────▶│   generate           │────▶  LLM call
│  └────────────┘  │     └─────────────────────┘
└──────────────────┘`}</pre>
      </Card>

      {/* Extension guide */}
      <Card size="small" title={<span><BulbOutlined className="mr-2" />{c.extendTitle}</span>}>
        <div className="space-y-2">
          {c.extendItems.map((item: string, i: number) => (
            <div key={i} className="flex items-start gap-2">
              <CheckCircleOutlined style={{ color: 'var(--accent-color)', marginTop: 4, flexShrink: 0 }} />
              <Text style={{ fontSize: 13 }}>{item}</Text>
            </div>
          ))}
        </div>

        <Divider style={{ margin: '16px 0' }} />

        <Paragraph type="secondary" style={{ fontSize: 12 }}>
          {lang === 'vi'
            ? 'File structure cho demo mới:'
            : 'File structure for new demo:'}
        </Paragraph>
        <pre className="theme-code" style={{ fontSize: 11 }}>{`cms-lark-sync/src/
├── app/demo/{name}/page.tsx    ← Demo page ('use client')
├── lib/i18n.ts                 ← Add menu key: demo{Name}
├── lib/tourSteps.ts            ← Add tour steps: 'demo-{name}'
└── app/layout.tsx              ← Add to 'demo' menu group children`}</pre>
      </Card>

      {/* Files reference */}
      <Card size="small" title={<span><DatabaseOutlined className="mr-2" />{lang === 'vi' ? 'Tham chiếu file' : 'File Reference'}</span>}>
        <Table
          size="small"
          pagination={false}
          dataSource={[
            { key: '1', file: '/app/chatbot/page.tsx', desc: lang === 'vi' ? 'Chat Bot spec generator' : 'Chat Bot spec generator' },
            { key: '2', file: '/app/demo/ai-tools/page.tsx', desc: lang === 'vi' ? '4 công cụ AI văn bản (Tóm tắt/Dịch/Viết lại/Ngữ pháp)' : '4 AI text tools (Summarize/Translate/Rewrite/Grammar)' },
            { key: '3', file: '/app/demo/image-analyzer/page.tsx', desc: lang === 'vi' ? 'Phân tích hình ảnh AI (4 chế độ)' : 'AI image analyzer (4 modes)' },
            { key: '4', file: '/app/demo/knowledge-qa/page.tsx', desc: lang === 'vi' ? 'Demo RAG hỏi đáp với AI Agent' : 'RAG Q&A demo with AI Agent' },
            { key: '5', file: '/app/demo/webhook-tester/page.tsx', desc: lang === 'vi' ? 'HTTP request builder & tester' : 'HTTP request builder & tester' },
            { key: '6', file: '/lib/tourSteps.ts', desc: lang === 'vi' ? 'Tour steps cho 4 demo (16 bước)' : 'Tour steps for 4 demos (16 steps)' },
            { key: '7', file: '/lib/i18n.ts', desc: lang === 'vi' ? '5 menu keys song ngữ' : '5 bilingual menu keys' },
          ]}
          columns={[
            { title: 'File', dataIndex: 'file', render: (v: string) => <Text code style={{ fontSize: 11 }}>{v}</Text> },
            { title: lang === 'vi' ? 'Mô tả' : 'Description', dataIndex: 'desc' },
          ]}
        />
      </Card>

      <TourGuide pageKey="docs-demo-guide" steps={tourSteps['docs-demo-guide'] || []} />
    </div>
  )
}
