'use client'

import { Card, Divider, Typography, Table, Tag, Alert, Collapse, Steps, Tabs } from 'antd'
import {
  RobotOutlined,
  GlobalOutlined,
  ApiOutlined,
  ThunderboltOutlined,
  BulbOutlined,
  SettingOutlined,
  BookOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  SendOutlined,
  DatabaseOutlined,
  BranchesOutlined,
  CodeOutlined,
} from '@ant-design/icons'
import TourGuide from '@/components/TourGuide'
import { tourSteps } from '@/lib/tourSteps'

const { Title, Paragraph, Text } = Typography

export default function DocsPlatformGuidePage() {
  return (
    <div className="space-y-3">
      <Title level={3}>
        <GlobalOutlined className="mr-2" />
        Multi-Platform AI Agent — Development & Integration Guide
      </Title>

      <Alert
        type="info"
        showIcon
        className=""
        message="Proactive Architecture"
        description="This guide covers how to integrate the AI Agent system with multiple platforms beyond Lark — including Telegram, Slack, Zalo, WhatsApp, LINE, and custom webhooks. It includes business scenarios, training best practices, and a development roadmap."
      />

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* SECTION 1: Multi-Channel Architecture                                  */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}

      <Card className="">
        <Title level={4}>
          <BranchesOutlined className="mr-2" />
          1. Multi-Channel Architecture
        </Title>

        <Title level={5}>1.1 Channel Adapter Pattern</Title>
        <Paragraph>
          The system uses a <Text strong>Channel Adapter pattern</Text> to decouple AI Agent logic from
          platform-specific messaging. Each channel implements the same interface:
        </Paragraph>

        <pre className="bg-gray-100 dark:bg-gray-800 p-4 rounded text-xs overflow-x-auto">{`┌─────────────────────────────────────────────────────────────┐
│                     AI Agent Core                            │
│                                                              │
│  ┌──────────┐  ┌────────────┐  ┌──────────┐  ┌──────────┐  │
│  │ Knowledge │  │ RAG Engine │  │ LLM Call │  │  Q&A     │  │
│  │   Base    │  │ (scoring)  │  │ (multi-  │  │ Training │  │
│  │           │  │            │  │ provider)│  │          │  │
│  └──────────┘  └────────────┘  └──────────┘  └──────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Conversation Memory (BotSession)         │   │
│  └──────────────────────────────────────────────────────┘   │
│                          ▲                                   │
│                          │                                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Channel Adapter Interface                 │   │
│  │  parseEvent() │ sendMessage() │ sendTyping()          │   │
│  └──────────┬──────────┬──────────┬──────────┬──────┘   │
└─────────────┼──────────┼──────────┼──────────┼──────────┘
              │          │          │          │
        ┌─────┴──┐ ┌─────┴──┐ ┌─────┴──┐ ┌─────┴──┐
        │  Lark  │ │Telegram│ │ Slack  │ │  Zalo  │  ...
        │Adapter │ │Adapter │ │Adapter │ │Adapter │
        └────────┘ └────────┘ └────────┘ └────────┘`}</pre>

        <Title level={5}>1.2 Webhook Endpoints</Title>
        <Table
          size="small"
          pagination={false}
          className=""
          dataSource={[
            { key: '1', endpoint: 'POST /api/ai-agents/webhook/:token', desc: 'Legacy Lark-only webhook (backward compatible)', status: 'Live' },
            { key: '2', endpoint: 'POST /api/ai-agents/channel/lark/webhook/:token', desc: 'Lark via multi-channel router', status: 'Live' },
            { key: '3', endpoint: 'POST /api/ai-agents/channel/telegram/webhook/:token', desc: 'Telegram Bot webhook', status: 'Ready' },
            { key: '4', endpoint: 'POST /api/ai-agents/channel/slack/webhook/:token', desc: 'Slack Events API webhook', status: 'Ready' },
            { key: '5', endpoint: 'POST /api/ai-agents/channel/zalo/webhook/:token', desc: 'Zalo OA webhook', status: 'Ready' },
          ]}
          columns={[
            { title: 'Endpoint', dataIndex: 'endpoint', render: (v: string) => <Text code>{v}</Text> },
            { title: 'Description', dataIndex: 'desc' },
            { title: 'Status', dataIndex: 'status', width: 80, render: (v: string) => <Tag color={v === 'Live' ? 'green' : 'blue'}>{v}</Tag> },
          ]}
        />

        <Title level={5}>1.3 Conversation Memory (BotSession)</Title>
        <Paragraph>
          Each channel + chatId combination gets a persistent session with message history.
          This gives the bot multi-turn context (up to 20 messages, auto-trimmed).
          Sessions auto-expire after 2 hours of inactivity via MongoDB TTL index.
        </Paragraph>
        <pre className="bg-gray-100 dark:bg-gray-800 p-4 rounded text-xs overflow-x-auto">{`BotSession {
  channel:  'lark' | 'telegram' | 'slack' | 'zalo' | ...
  chatId:   '<platform-specific chat ID>'
  agentId:  ObjectId (which AI Agent)
  senderId: '<platform-specific user ID>'
  messages: [{ role, content, timestamp }]  // max 20, FIFO
  lastActiveAt: Date  // TTL: auto-delete after 2h inactivity
}`}</pre>

        <Title level={5}>1.4 Event Deduplication</Title>
        <Paragraph>
          Platforms (especially Lark) can send duplicate webhook events. The system uses an
          in-memory cache (Map) tracking <Text code>messageId</Text> for 5 minutes.
          Max 5000 entries with automatic cleanup.
        </Paragraph>
      </Card>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* SECTION 2: Platform Integration Guides                                 */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}

      <Card className="">
        <Title level={4}>
          <GlobalOutlined className="mr-2" />
          2. Platform Integration Guides
        </Title>

        <Tabs
          size="small"
          items={[
            {
              key: 'lark',
              label: '🔷 Lark (Live)',
              children: (
                <div>
                  <Alert type="success" showIcon message="Fully implemented and production-ready" className="mb-3" />
                  <Title level={5}>Setup</Title>
                  <Paragraph>See <Text strong>AI Agent Guide</Text> in Document menu for full A→Z setup.</Paragraph>
                  <Title level={5}>Key Details</Title>
                  <ul>
                    <li>Webhook: <Text code>POST /api/ai-agents/webhook/:token</Text></li>
                    <li>Auth: App ID + App Secret → tenant_access_token</li>
                    <li>Events: <Text code>im.message.receive_v1</Text></li>
                    <li>Message format: JSON <Text code>{'{\"text\": \"...\"}'}</Text></li>
                    <li>Constraint: Must ACK within 3 seconds (system handles this)</li>
                    <li>Supports: text only (voice/file/image ignored)</li>
                    <li>Token caching: uses LarkAccount cached tenantToken with auto-refresh</li>
                  </ul>
                </div>
              ),
            },
            {
              key: 'telegram',
              label: '🔵 Telegram',
              children: (
                <div>
                  <Alert type="info" showIcon message="Adapter ready — needs bot token configuration" className="mb-3" />

                  <Title level={5}>Setup Steps</Title>
                  <Steps direction="vertical" size="small" current={-1} items={[
                    { title: 'Create Telegram Bot', description: 'Message @BotFather on Telegram → /newbot → get Bot Token' },
                    { title: 'Configure Agent', description: 'PUT /api/ai-agents/:id with channels: { telegram: { botToken: "..." } }' },
                    { title: 'Register Webhook', description: (<span>Call Telegram API: <Text code>POST https://api.telegram.org/bot&lt;TOKEN&gt;/setWebhook</Text> with <Text code>url: https://your-domain/api/ai-agents/channel/telegram/webhook/&lt;AGENT_TOKEN&gt;</Text></span>) },
                    { title: 'Test', description: 'Message your bot on Telegram → should get AI response' },
                  ]} />

                  <Title level={5}>Telegram-Specific Features</Title>
                  <ul>
                    <li>Typing indicator: sends <Text code>typing</Text> action before AI response</li>
                    <li>Markdown support: responses sent with <Text code>parse_mode: Markdown</Text></li>
                    <li>Group chat: strip @bot mention prefix</li>
                    <li>Message types: text only (images, stickers, etc. ignored)</li>
                  </ul>

                  <Title level={5}>Business Scenarios</Title>
                  <ul>
                    <li><Text strong>Customer Support Bot</Text>: Public-facing FAQ bot for customers who prefer Telegram</li>
                    <li><Text strong>Order Status Bot</Text>: Customers check order/delivery status via Telegram</li>
                    <li><Text strong>Internal Alerts</Text>: Send system notifications to Telegram groups</li>
                  </ul>
                </div>
              ),
            },
            {
              key: 'slack',
              label: '🟣 Slack',
              children: (
                <div>
                  <Alert type="info" showIcon message="Adapter ready — needs Slack App configuration" className="mb-3" />

                  <Title level={5}>Setup Steps</Title>
                  <Steps direction="vertical" size="small" current={-1} items={[
                    { title: 'Create Slack App', description: (<span>Go to <Text code>api.slack.com/apps</Text> → Create New App → From Manifest</span>) },
                    { title: 'Add Bot Scopes', description: (<span>OAuth & Permissions → Bot Token Scopes: <Text code>chat:write</Text>, <Text code>im:history</Text>, <Text code>app_mentions:read</Text></span>) },
                    { title: 'Enable Events', description: (<span>Event Subscriptions → Request URL: <Text code>https://your-domain/api/ai-agents/channel/slack/webhook/&lt;TOKEN&gt;</Text></span>) },
                    { title: 'Subscribe to Events', description: (<span>Bot Events: <Text code>message.im</Text> (DMs), <Text code>app_mention</Text> (channel mentions)</span>) },
                    { title: 'Install to Workspace', description: 'Install App → Copy Bot Token → Configure agent channels.slack.botToken' },
                  ]} />

                  <Title level={5}>Slack-Specific Features</Title>
                  <ul>
                    <li>URL verification: handles Slack challenge handshake</li>
                    <li>@mention stripping: removes &lt;@UXXXXXX&gt; prefix from messages</li>
                    <li>Supports both DMs and channel mentions</li>
                    <li>Event dedup via Slack event <Text code>ts</Text> (timestamp)</li>
                  </ul>

                  <Title level={5}>Business Scenarios</Title>
                  <ul>
                    <li><Text strong>Engineering Helpdesk</Text>: Internal teams ask about systems, deployments, runbooks</li>
                    <li><Text strong>HR Bot</Text>: Employees ask about policies, benefits, leave in Slack channels</li>
                    <li><Text strong>Sales Playbook Bot</Text>: Sales team asks about pricing, competitor comparisons</li>
                    <li><Text strong>Onboarding Bot</Text>: New hires get answers about company processes</li>
                  </ul>
                </div>
              ),
            },
            {
              key: 'zalo',
              label: '🟢 Zalo',
              children: (
                <div>
                  <Alert type="info" showIcon message="Adapter ready — needs Zalo OA access token" className="mb-3" />

                  <Title level={5}>Setup Steps</Title>
                  <Steps direction="vertical" size="small" current={-1} items={[
                    { title: 'Create Zalo OA', description: 'Register Official Account at oa.zalo.me' },
                    { title: 'Create Zalo App', description: (<span>Go to <Text code>developers.zalo.me</Text> → Create App → Get App ID + Secret</span>) },
                    { title: 'Get Access Token', description: 'OAuth flow or use Zalo API Explorer to get OA access token' },
                    { title: 'Configure Webhook', description: (<span>App Settings → Webhook → URL: <Text code>https://your-domain/api/ai-agents/channel/zalo/webhook/&lt;TOKEN&gt;</Text></span>) },
                    { title: 'Configure Agent', description: 'PUT /api/ai-agents/:id with channels: { zalo: { accessToken: "..." } }' },
                  ]} />

                  <Title level={5}>Business Scenarios (Vietnam Market)</Title>
                  <ul>
                    <li><Text strong>Customer Service OA</Text>: Vietnamese customers get instant support via Zalo (most popular messaging app in Vietnam)</li>
                    <li><Text strong>E-commerce Bot</Text>: Product inquiries, order tracking, return policies</li>
                    <li><Text strong>Healthcare Bot</Text>: Appointment booking, health info, clinic hours</li>
                    <li><Text strong>Real Estate Bot</Text>: Property listings, price inquiries, viewing schedules</li>
                  </ul>
                </div>
              ),
            },
            {
              key: 'whatsapp',
              label: '🟩 WhatsApp',
              children: (
                <div>
                  <Alert type="warning" showIcon message="Adapter not yet implemented — architecture guide below" className="mb-3" />

                  <Title level={5}>Implementation Guide</Title>
                  <Paragraph>
                    WhatsApp Business API requires a Meta Business Account and approved phone number.
                    Two options:
                  </Paragraph>
                  <ul>
                    <li><Text strong>WhatsApp Cloud API</Text> (recommended): Free, hosted by Meta. Webhook-based.</li>
                    <li><Text strong>WhatsApp Business API (BSP)</Text>: Third-party hosting (Twilio, MessageBird).</li>
                  </ul>

                  <Title level={5}>Adapter Implementation</Title>
                  <pre className="bg-gray-100 dark:bg-gray-800 p-3 rounded text-xs">{`class WhatsAppAdapter extends BaseChannelAdapter {
  parseEvent(body) {
    // body.entry[0].changes[0].value.messages[0]
    const msg = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]
    return {
      type: 'message',
      chatId: msg?.from,        // phone number
      text: msg?.text?.body,
      messageId: msg?.id,
    }
  }

  async sendMessage(agent, chatId, text) {
    // POST https://graph.facebook.com/v18.0/{phone-number-id}/messages
    // Auth: Bearer <WHATSAPP_TOKEN>
    // Body: { messaging_product: 'whatsapp', to: chatId, text: { body: text } }
  }
}`}</pre>

                  <Title level={5}>Business Scenarios</Title>
                  <ul>
                    <li><Text strong>International Customer Support</Text>: WhatsApp is dominant in SEA, LATAM, India</li>
                    <li><Text strong>Appointment Reminders</Text>: Healthcare, beauty, services industries</li>
                    <li><Text strong>Delivery Updates</Text>: Logistics and e-commerce notifications</li>
                  </ul>
                </div>
              ),
            },
            {
              key: 'line',
              label: '🟢 LINE',
              children: (
                <div>
                  <Alert type="warning" showIcon message="Adapter not yet implemented — architecture guide below" className="mb-3" />

                  <Title level={5}>Implementation Guide</Title>
                  <Paragraph>
                    LINE Messaging API. Dominant in Japan, Taiwan, Thailand.
                  </Paragraph>

                  <Title level={5}>Adapter Implementation</Title>
                  <pre className="bg-gray-100 dark:bg-gray-800 p-3 rounded text-xs">{`class LINEAdapter extends BaseChannelAdapter {
  parseEvent(body) {
    // body.events[0] — webhook event
    const evt = body.events?.[0]
    return {
      type: 'message',
      chatId: evt?.source?.userId || evt?.source?.groupId,
      text: evt?.message?.text,
      messageId: evt?.message?.id,
    }
  }

  async sendMessage(agent, chatId, text) {
    // POST https://api.line.me/v2/bot/message/push
    // Auth: Bearer <CHANNEL_ACCESS_TOKEN>
    // Body: { to: chatId, messages: [{ type: 'text', text }] }
  }
}`}</pre>

                  <Title level={5}>Business Scenarios</Title>
                  <ul>
                    <li><Text strong>Retail/F&B Bot</Text>: Menu inquiries, loyalty programs, promotions</li>
                    <li><Text strong>Tourism Bot</Text>: Travel info, booking assistance (Japan/Taiwan market)</li>
                    <li><Text strong>Banking Bot</Text>: Account info, branch locator, FAQ</li>
                  </ul>
                </div>
              ),
            },
            {
              key: 'custom',
              label: '🔧 Custom Webhook',
              children: (
                <div>
                  <Alert type="info" showIcon message="Use the multi-channel endpoint with a custom adapter" className="mb-3" />

                  <Title level={5}>Creating a Custom Adapter</Title>
                  <pre className="bg-gray-100 dark:bg-gray-800 p-3 rounded text-xs">{`// services/channelAdapter.js — add your adapter

class MyAppAdapter extends BaseChannelAdapter {
  constructor() { super('myapp') }

  parseEvent(body, agent) {
    return {
      type: 'message',
      chatId: body.conversation_id,
      senderId: body.user_id,
      senderName: body.user_name,
      text: body.message,
      messageType: 'text',
      messageId: body.id,
      raw: body,
    }
  }

  async sendMessage(agent, chatId, text) {
    const cfg = agent.channels?.myapp
    await axios.post(cfg.webhookUrl, { chatId, text }, {
      headers: { Authorization: \`Bearer \${cfg.apiKey}\` }
    })
  }
}

// Register: ADAPTERS.myapp = new MyAppAdapter()`}</pre>

                  <Title level={5}>Use Cases for Custom Webhooks</Title>
                  <ul>
                    <li><Text strong>Internal Mobile App</Text>: Embed AI chat in company app</li>
                    <li><Text strong>Website Widget</Text>: Customer-facing chat widget</li>
                    <li><Text strong>IoT Dashboard</Text>: Voice-to-text from smart devices</li>
                    <li><Text strong>Email Bot</Text>: Parse incoming emails → AI response → send reply</li>
                  </ul>
                </div>
              ),
            },
          ]}
        />
      </Card>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* SECTION 3: Bot Commands & Training                                     */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}

      <Card className="">
        <Title level={4}>
          <SendOutlined className="mr-2" />
          3. Bot Commands & Training (All Channels)
        </Title>

        <Paragraph>
          These commands work on <Text strong>all channels</Text> (Lark, Telegram, Slack, Zalo, etc.):
        </Paragraph>

        <Table
          size="small"
          pagination={false}
          className=""
          dataSource={[
            { key: '1', cmd: '!help', alias: '!trợ giúp', desc: 'Show available commands' },
            { key: '2', cmd: '!learn <title> | <content>', alias: '!học', desc: 'Teach bot a new document/knowledge item. Creates a manual knowledge entry and auto-links to agent.' },
            { key: '3', cmd: '!qa <question> | <answer>', alias: '!hỏi', desc: 'Add a Q&A training pair with bidirectional matching. High-confidence matches bypass AI.' },
            { key: '4', cmd: '!reset', alias: '!xoá, !clear', desc: 'Clear conversation history — start a fresh session.' },
            { key: '5', cmd: '!feedback <text>', alias: '!phản hồi', desc: 'Submit feedback about response quality. Stored in knowledge base for review.' },
            { key: '6', cmd: '!status', alias: '!info', desc: 'Show agent info: name, knowledge count, Q&A count, total chats.' },
          ]}
          columns={[
            { title: 'Command', dataIndex: 'cmd', width: 280, render: (v: string) => <Text code>{v}</Text> },
            { title: 'Alias', dataIndex: 'alias', width: 120 },
            { title: 'Description', dataIndex: 'desc' },
          ]}
        />

        <Title level={5}>3.1 Training Best Practices</Title>
        <Collapse
          size="small"
          className=""
          items={[
            {
              key: '1',
              label: 'Q&A Training: When and How',
              children: (
                <div>
                  <Paragraph>
                    Q&A pairs are the <Text strong>fastest way to improve response accuracy</Text>.
                    When a user reports a wrong answer:
                  </Paragraph>
                  <ol>
                    <li>Note the exact question the user asked</li>
                    <li>Write the correct answer</li>
                    <li>Add via CMS Training tab, API, or bot command: <Text code>!qa Question | Answer</Text></li>
                    <li>Test immediately — high-confidence matches (score ≥ 12) bypass AI entirely</li>
                  </ol>
                  <Alert type="info" showIcon className="mb-2" message="Tip: For questions with multiple phrasings, add multiple Q&A pairs with different question variants but the same answer." />
                </div>
              ),
            },
            {
              key: '2',
              label: 'Bulk Training via API',
              children: (
                <div>
                  <Paragraph>
                    Use <Text code>POST /api/ai-agents/:id/train-bulk</Text> to add many Q&A pairs at once:
                  </Paragraph>
                  <pre className="bg-gray-100 dark:bg-gray-800 p-3 rounded text-xs">{`POST /api/ai-agents/:id/train-bulk
{
  "pairs": [
    { "question": "Nghỉ phép bao nhiêu ngày?", "answer": "12 ngày/năm theo luật lao động" },
    { "question": "How many leave days?", "answer": "12 days/year per labor law" },
    { "question": "Chính sách làm việc từ xa?", "answer": "Nhân viên có thể WFH 2 ngày/tuần..." }
  ]
}`}</pre>
                </div>
              ),
            },
            {
              key: '3',
              label: 'Knowledge Base Organization',
              children: (
                <div>
                  <ul>
                    <li><Text strong>One topic per document</Text>: &quot;Leave Policy&quot; is better than &quot;HR Policies&quot; (too broad)</li>
                    <li><Text strong>Use descriptive titles</Text>: Titles are weighted heavily in keyword matching</li>
                    <li><Text strong>Keep content concise</Text>: RAG injects max 3000 chars per item — put key info first</li>
                    <li><Text strong>Re-sync regularly</Text>: Bitable data changes frequently — re-sync weekly</li>
                    <li><Text strong>Tag consistently</Text>: Use tags for filtering and organization</li>
                    <li><Text strong>Review feedback</Text>: Check <Text code>GET /api/ai-agents/:id/feedback</Text> regularly</li>
                  </ul>
                </div>
              ),
            },
            {
              key: '4',
              label: 'System Prompt Engineering',
              children: (
                <div>
                  <Paragraph>The system prompt defines the agent&apos;s personality and behavior. Tips:</Paragraph>
                  <pre className="bg-gray-100 dark:bg-gray-800 p-3 rounded text-xs">{`// Good system prompt example:
Bạn là trợ lý HR của công ty Hoa Nam. Quy tắc:
1. Trả lời bằng tiếng Việt, ngắn gọn, chuyên nghiệp
2. Chỉ trả lời câu hỏi về nhân sự, chính sách, quy trình
3. Nếu không chắc chắn, nói "Tôi sẽ chuyển câu hỏi này cho phòng HR"
4. Không bịa thông tin - chỉ dùng kiến thức từ Knowledge Base
5. Khi trích dẫn chính sách, ghi rõ nguồn tài liệu`}</pre>
                  <Alert type="warning" showIcon className="mt-2" message="Do NOT put sensitive data (passwords, API keys) in the system prompt — it's sent to the LLM provider." />
                </div>
              ),
            },
          ]}
        />
      </Card>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* SECTION 4: Business Scenarios                                          */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}

      <Card className="">
        <Title level={4}>
          <BulbOutlined className="mr-2" />
          4. Business Scenarios & Use Cases
        </Title>

        <Tabs
          size="small"
          items={[
            {
              key: 'hr',
              label: 'HR & People',
              children: (
                <div>
                  <Title level={5}>HR Support Bot</Title>
                  <Table size="small" pagination={false} className="mb-3" dataSource={[
                    { key: '1', scenario: 'Leave policy inquiries', knowledge: 'Leave policy doc from Lark', channels: 'Lark, Slack' },
                    { key: '2', scenario: 'Onboarding guide', knowledge: 'Onboarding checklist (Bitable)', channels: 'Lark, Telegram' },
                    { key: '3', scenario: 'Benefits FAQ', knowledge: 'Benefits handbook (Doc)', channels: 'All' },
                    { key: '4', scenario: 'Payroll questions', knowledge: 'Payroll FAQ (Q&A pairs)', channels: 'Lark (internal)' },
                    { key: '5', scenario: 'Performance review process', knowledge: 'Review guidelines (Wiki)', channels: 'Slack, Lark' },
                  ]} columns={[
                    { title: 'Scenario', dataIndex: 'scenario' },
                    { title: 'Knowledge Source', dataIndex: 'knowledge' },
                    { title: 'Best Channels', dataIndex: 'channels' },
                  ]} />
                </div>
              ),
            },
            {
              key: 'sales',
              label: 'Sales & CRM',
              children: (
                <div>
                  <Title level={5}>Sales Assistant Bot</Title>
                  <Table size="small" pagination={false} className="mb-3" dataSource={[
                    { key: '1', scenario: 'Product pricing lookup', knowledge: 'Price list (Bitable)', channels: 'Lark, Slack, Telegram' },
                    { key: '2', scenario: 'Competitor comparison', knowledge: 'Competitor analysis docs', channels: 'Lark (internal)' },
                    { key: '3', scenario: 'Sales playbook', knowledge: 'Sales process docs', channels: 'Slack' },
                    { key: '4', scenario: 'Customer FAQ', knowledge: 'Customer FAQ (Q&A pairs)', channels: 'Zalo, WhatsApp, LINE' },
                    { key: '5', scenario: 'Quote generation', knowledge: 'Product catalog + pricing rules', channels: 'Lark' },
                  ]} columns={[
                    { title: 'Scenario', dataIndex: 'scenario' },
                    { title: 'Knowledge Source', dataIndex: 'knowledge' },
                    { title: 'Best Channels', dataIndex: 'channels' },
                  ]} />
                  <Alert type="info" showIcon message="Future: With function calling, the bot can directly query CRM data, create quotes, and update deal stages." />
                </div>
              ),
            },
            {
              key: 'support',
              label: 'Customer Support',
              children: (
                <div>
                  <Title level={5}>Customer Support Bot</Title>
                  <Table size="small" pagination={false} className="mb-3" dataSource={[
                    { key: '1', scenario: 'Product usage help', knowledge: 'User manual, How-to guides', channels: 'Zalo, WhatsApp, Website' },
                    { key: '2', scenario: 'Troubleshooting', knowledge: 'Known issues (Bitable), Fix guides', channels: 'All' },
                    { key: '3', scenario: 'Order status', knowledge: 'Order tracking (future: function calling)', channels: 'Zalo, LINE, WhatsApp' },
                    { key: '4', scenario: 'Return/refund policy', knowledge: 'Return policy doc + Q&A pairs', channels: 'All' },
                    { key: '5', scenario: 'Escalation to human', knowledge: 'Escalation rules (system prompt)', channels: 'All' },
                  ]} columns={[
                    { title: 'Scenario', dataIndex: 'scenario' },
                    { title: 'Knowledge Source', dataIndex: 'knowledge' },
                    { title: 'Best Channels', dataIndex: 'channels' },
                  ]} />
                </div>
              ),
            },
            {
              key: 'it',
              label: 'IT & Engineering',
              children: (
                <div>
                  <Title level={5}>IT Helpdesk Bot</Title>
                  <Table size="small" pagination={false} className="mb-3" dataSource={[
                    { key: '1', scenario: 'VPN/WiFi setup', knowledge: 'IT setup guides (Wiki)', channels: 'Lark, Slack' },
                    { key: '2', scenario: 'Software access requests', knowledge: 'Software catalog + process docs', channels: 'Lark, Slack' },
                    { key: '3', scenario: 'Incident runbooks', knowledge: 'Runbook library (Docs)', channels: 'Slack' },
                    { key: '4', scenario: 'API documentation', knowledge: 'API specs (auto-indexed from Docs)', channels: 'Slack, Lark' },
                    { key: '5', scenario: 'Deploy status', knowledge: 'Future: function calling to CI/CD', channels: 'Slack' },
                  ]} columns={[
                    { title: 'Scenario', dataIndex: 'scenario' },
                    { title: 'Knowledge Source', dataIndex: 'knowledge' },
                    { title: 'Best Channels', dataIndex: 'channels' },
                  ]} />
                </div>
              ),
            },
            {
              key: 'education',
              label: 'Education & Training',
              children: (
                <div>
                  <Title level={5}>Training & Learning Bot</Title>
                  <Table size="small" pagination={false} className="mb-3" dataSource={[
                    { key: '1', scenario: 'Course Q&A', knowledge: 'Course materials (Docs, PDFs)', channels: 'Telegram, Zalo' },
                    { key: '2', scenario: 'Quiz/Assessment', knowledge: 'Question banks (Q&A pairs)', channels: 'All' },
                    { key: '3', scenario: 'Study assistant', knowledge: 'Textbook summaries', channels: 'Telegram, LINE' },
                    { key: '4', scenario: 'Compliance training', knowledge: 'Compliance docs, regulations', channels: 'Lark, Slack' },
                    { key: '5', scenario: 'Language learning', knowledge: 'Vocabulary, grammar rules', channels: 'Telegram, LINE' },
                  ]} columns={[
                    { title: 'Scenario', dataIndex: 'scenario' },
                    { title: 'Knowledge Source', dataIndex: 'knowledge' },
                    { title: 'Best Channels', dataIndex: 'channels' },
                  ]} />
                </div>
              ),
            },
          ]}
        />
      </Card>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* SECTION 5: RAG Improvements & NLP Roadmap                              */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}

      <Card className="">
        <Title level={4}>
          <ThunderboltOutlined className="mr-2" />
          5. Code Improvements Made
        </Title>

        <Table
          size="small"
          pagination={false}
          className=""
          dataSource={[
            { key: '1', area: 'RAG Scoring', before: 'buildContext used scoreRelevance for Q&A items', after: 'Now uses scoreQA (bidirectional question matching) — much more accurate', impact: 'High' },
            { key: '2', area: 'Conversation Memory', before: 'Lark Bot had no memory — each message independent', after: 'BotSession stores 20 messages per chat, auto-expires after 2h', impact: 'High' },
            { key: '3', area: 'Event Deduplication', before: 'No dedup — duplicate Lark events processed twice', after: 'In-memory Map cache with 5min TTL, max 5000 entries', impact: 'Medium' },
            { key: '4', area: 'Multi-Channel', before: 'Lark-only, hardcoded webhook logic', after: 'Channel Adapter pattern: Lark/Telegram/Slack/Zalo/Custom', impact: 'High' },
            { key: '5', area: 'Bot Commands', before: 'Only !learn', after: 'Added: !qa, !reset, !feedback, !status, !help', impact: 'Medium' },
            { key: '6', area: 'Q&A Training', before: '!learn only created knowledge doc, not Q&A pair', after: '!qa creates proper Q&A with question/answer metadata', impact: 'High' },
            { key: '7', area: 'Agent Cleanup', before: 'Delete agent left orphaned knowledge and sessions', after: 'Delete now cleans up Q&A, feedback, and sessions', impact: 'Medium' },
            { key: '8', area: 'Token Tracking', before: 'AIConfig cost fields never updated', after: 'Token usage tracked on every LLM call (streaming + non-streaming)', impact: 'Medium' },
            { key: '9', area: 'Bulk Training', before: 'Only single Q&A pair at a time', after: 'POST /train-bulk accepts array of pairs', impact: 'Medium' },
            { key: '10', area: 'Token Caching', before: 'Fresh Lark tenant token every message', after: 'Uses LarkAccount cached token with auto-refresh', impact: 'Low' },
          ]}
          columns={[
            { title: 'Area', dataIndex: 'area', width: 150 },
            { title: 'Before', dataIndex: 'before' },
            { title: 'After', dataIndex: 'after' },
            { title: 'Impact', dataIndex: 'impact', width: 70, render: (v: string) => <Tag color={v === 'High' ? 'red' : v === 'Medium' ? 'orange' : 'blue'}>{v}</Tag> },
          ]}
        />
      </Card>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* SECTION 6: Development Roadmap                                         */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}

      <Card className="">
        <Title level={4}>
          <ClockCircleOutlined className="mr-2" />
          6. Development Roadmap
        </Title>

        <Title level={5}>Phase 1: Foundation (Current)</Title>
        <ul>
          <li><CheckCircleOutlined className="text-green-500 mr-1" /> Multi-channel adapter architecture</li>
          <li><CheckCircleOutlined className="text-green-500 mr-1" /> Conversation memory (BotSession)</li>
          <li><CheckCircleOutlined className="text-green-500 mr-1" /> Event deduplication</li>
          <li><CheckCircleOutlined className="text-green-500 mr-1" /> Enhanced bot commands (!qa, !reset, !feedback, !status)</li>
          <li><CheckCircleOutlined className="text-green-500 mr-1" /> Token usage tracking</li>
          <li><CheckCircleOutlined className="text-green-500 mr-1" /> Bulk Q&A training API</li>
        </ul>

        <Title level={5}>Phase 2: Semantic Intelligence</Title>
        <ul>
          <li><ClockCircleOutlined className="text-orange-500 mr-1" /> Vector embeddings (OpenAI/Voyage) + MongoDB Atlas Vector Search</li>
          <li><ClockCircleOutlined className="text-orange-500 mr-1" /> Hybrid retrieval: keyword + semantic (reciprocal rank fusion)</li>
          <li><ClockCircleOutlined className="text-orange-500 mr-1" /> Auto re-index knowledge (daily cron)</li>
          <li><ClockCircleOutlined className="text-orange-500 mr-1" /> Chunk-level indexing (split large docs into semantic chunks)</li>
        </ul>

        <Title level={5}>Phase 3: Action Capabilities</Title>
        <ul>
          <li><ClockCircleOutlined className="text-orange-500 mr-1" /> Function calling / tool use (Anthropic tool_use, OpenAI function_calling)</li>
          <li><ClockCircleOutlined className="text-orange-500 mr-1" /> Built-in tools: search_bitable, create_record, lookup_user, send_notification</li>
          <li><ClockCircleOutlined className="text-orange-500 mr-1" /> Custom tool definitions per agent (admin-configurable)</li>
          <li><ClockCircleOutlined className="text-orange-500 mr-1" /> Approval workflows (agent proposes action → human confirms)</li>
        </ul>

        <Title level={5}>Phase 4: Enterprise Features</Title>
        <ul>
          <li><ClockCircleOutlined className="text-orange-500 mr-1" /> Multi-agent orchestration (router agent → specialist agents)</li>
          <li><ClockCircleOutlined className="text-orange-500 mr-1" /> Role-based access control (who can train, who can chat)</li>
          <li><ClockCircleOutlined className="text-orange-500 mr-1" /> Analytics dashboard (usage, cost, satisfaction, response quality)</li>
          <li><ClockCircleOutlined className="text-orange-500 mr-1" /> A/B testing (compare system prompts, models, knowledge sets)</li>
          <li><ClockCircleOutlined className="text-orange-500 mr-1" /> Audit logging (who said what, which knowledge was used)</li>
          <li><ClockCircleOutlined className="text-orange-500 mr-1" /> PII detection and masking</li>
        </ul>

        <Title level={5}>Phase 5: Platform Expansion</Title>
        <ul>
          <li><ClockCircleOutlined className="text-orange-500 mr-1" /> WhatsApp Business API integration</li>
          <li><ClockCircleOutlined className="text-orange-500 mr-1" /> LINE Messaging API integration</li>
          <li><ClockCircleOutlined className="text-orange-500 mr-1" /> Facebook Messenger integration</li>
          <li><ClockCircleOutlined className="text-orange-500 mr-1" /> Email channel (receive → AI → reply)</li>
          <li><ClockCircleOutlined className="text-orange-500 mr-1" /> Voice channel (speech-to-text → AI → text-to-speech)</li>
          <li><ClockCircleOutlined className="text-orange-500 mr-1" /> Embeddable web widget SDK</li>
        </ul>
      </Card>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* SECTION 7: File Reference                                              */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}

      <Card className="">
        <Title level={4}>
          <CodeOutlined className="mr-2" />
          7. New & Modified Files Reference
        </Title>
        <pre className="bg-gray-100 dark:bg-gray-800 p-4 rounded text-xs overflow-x-auto">{`NEW FILES:
─────────
api-lark-all/
├── models/BotSession.model.js        ← Conversation memory (TTL 2h, max 20 msgs)
├── services/channelAdapter.js        ← Multi-channel abstraction (Lark/Telegram/Slack/Zalo)

cms-lark-sync/src/app/docs/
├── agent-guide/page.tsx              ← AI Agent maintenance guide
├── platform-guide/page.tsx           ← This multi-platform development guide

docs/
├── MAINTENANCE_GUIDE.md              ← Comprehensive markdown maintenance doc

MODIFIED FILES:
──────────────
api-lark-all/
├── models/AIAgent.model.js           ← Added: channels field (multi-platform config)
├── routes/aiAgent.route.js           ← Major rewrite:
│   ├── Fixed: buildContext uses scoreQA for Q&A items
│   ├── Added: BotSession conversation memory
│   ├── Added: event deduplication (in-memory Map)
│   ├── Added: multi-channel webhook endpoint
│   ├── Added: bot commands (!qa, !reset, !feedback, !status, !help)
│   ├── Added: agent delete cleanup (knowledge, sessions)
│   ├── Added: token usage tracking
│   ├── Added: bulk training endpoint (/train-bulk)
│   ├── Added: session list endpoint (/:id/sessions)
│   ├── Added: feedback list endpoint (/:id/feedback)
│   └── Refactored: extracted loadKnowledgeItems, callLLM, handleBotCommand

cms-lark-sync/src/
├── app/layout.tsx                    ← Moved /docs/* to new "Document" menu group
├── lib/i18n.ts                       ← Added: docs, docsAgent, docsGuide translations`}</pre>
      </Card>
      <TourGuide pageKey="docs-platform-guide" steps={tourSteps['docs-platform-guide']} />
    </div>
  )
}
