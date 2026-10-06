'use client'

import { Card, Divider, Typography, Table, Tag, Alert, Collapse, Steps } from 'antd'
import {
  RobotOutlined,
  KeyOutlined,
  DatabaseOutlined,
  LinkOutlined,
  MessageOutlined,
  BulbOutlined,
  SettingOutlined,
  BookOutlined,
  ThunderboltOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import TourGuide from '@/components/TourGuide'
import { tourSteps } from '@/lib/tourSteps'

const { Title, Paragraph, Text } = Typography

export default function DocsAgentGuidePage() {
  return (
    <div className="space-y-3">
      <Title level={3}>
        <RobotOutlined className="mr-2" />
        AI Agent & Lark Bot — Maintenance Guide
      </Title>

      <Alert
        type="info"
        showIcon
        className=""
        message="Complete Guide"
        description="This document covers the full lifecycle of creating, training, deploying, and maintaining an AI Agent integrated with Lark Bot. It includes API logic, RAG architecture, knowledge training, and LLM/NLP considerations."
      />

      {/* ── 1. Architecture Overview ─────────────────────────────────────────── */}
      <Card className="">
        <Title level={4}>
          <BulbOutlined className="mr-2" />
          1. Architecture Overview
        </Title>
        <Paragraph>
          The system consists of two apps working together:
        </Paragraph>
        <Paragraph>
          <Text strong>api-lark-all</Text> (Express.js + MongoDB) — Backend API handling all business logic:
          AI Agent CRUD, RAG-based chat, Lark webhook processing, knowledge indexing.
        </Paragraph>
        <Paragraph>
          <Text strong>cms-lark-sync</Text> (Next.js 15) — Frontend CMS dashboard for management UI,
          proxying API calls, and providing streaming chat interface.
        </Paragraph>
        <pre className="bg-gray-100 dark:bg-gray-800 p-4 rounded text-xs overflow-x-auto">{`User in Lark  ──>  Lark Bot App  ──>  Webhook URL
                                           │
                              api-lark-all/ai-agents/webhook/:token
                                           │
                                   Find agent by token
                                           │
                              RAG: keyword search on Knowledge Base
                                           │
                              Q&A match? (score >= 12) ──> Direct answer (bypass AI)
                                           │ no
                              Build context (docs + Q&A hints)
                                           │
                              Call LLM (Anthropic/OpenAI/Groq/Mistral/Google)
                                           │
                              Send reply via Lark Message API
                                           │
                              User receives answer`}</pre>
      </Card>

      {/* ── 2. Create AI Agent (Full Flow) ───────────────────────────────────── */}
      <Card className="">
        <Title level={4}>
          <SettingOutlined className="mr-2" />
          2. Create AI Agent — Full Flow
        </Title>

        <Steps
          direction="vertical"
          size="small"
          current={-1}
          items={[
            {
              title: 'Step 1: Configure AI Key',
              description: (
                <Paragraph className="mt-1 mb-0">
                  Go to <Text code>Settings &gt; AI API Keys</Text>. Create a config with provider
                  (Anthropic/OpenAI/Groq/Mistral/Google), API key, and model.
                  Mark as <Tag color="blue">Default</Tag> if desired.
                  <br />
                  <Text type="secondary">
                    API: <Text code>POST /api/ai-configs</Text> — supports presets with pricing for cost tracking.
                  </Text>
                </Paragraph>
              ),
            },
            {
              title: 'Step 2: Create Lark Bot App',
              description: (
                <Paragraph className="mt-1 mb-0">
                  In <Text code>Lark Developer Console</Text>: Create Custom App, add permissions
                  (<Text code>im:message:receive_v1</Text>, <Text code>im:message</Text>,
                  <Text code>im:chat</Text>). Copy App ID + App Secret.
                </Paragraph>
              ),
            },
            {
              title: 'Step 3: Register Lark Account in CMS',
              description: (
                <Paragraph className="mt-1 mb-0">
                  Go to <Text code>Lark Integration &gt; Lark Accounts</Text>. Add the App ID,
                  App Secret. Supports both <Text code>larksuite.com</Text> (global)
                  and <Text code>feishu.cn</Text> (China).
                  <br />
                  <Text type="secondary">
                    API: <Text code>POST /api/lark-accounts</Text> — auto-caches tenant token with refresh.
                  </Text>
                </Paragraph>
              ),
            },
            {
              title: 'Step 4: Create AI Agent',
              description: (
                <Paragraph className="mt-1 mb-0">
                  Go to <Text code>AI Agent</Text> page. Fill: name, system prompt,
                  welcome message, select provider/model, link Lark Account.
                  A <Tag color="green">webhookToken</Tag> is auto-generated.
                  <br />
                  <Text type="secondary">
                    API: <Text code>POST /api/ai-agents</Text> — default provider: anthropic, model: claude-sonnet-4-6.
                  </Text>
                </Paragraph>
              ),
            },
            {
              title: 'Step 5: Add Knowledge Base',
              description: (
                <Paragraph className="mt-1 mb-0">
                  In Knowledge tab: index from Lark Doc, Wiki, Bitable, or upload files (txt/md/csv/json).
                  Link knowledge items to agent via <Text code>knowledgeIds</Text>.
                  <br />
                  <Text type="secondary">
                    APIs: <Text code>POST /api/agent-knowledge/index-doc</Text>,
                    <Text code>/index-wiki-node</Text>, <Text code>/index-bitable</Text>,
                    <Text code>/index-batch</Text>, <Text code>/upload</Text>
                  </Text>
                </Paragraph>
              ),
            },
            {
              title: 'Step 6: Configure Webhook in Lark',
              description: (
                <Paragraph className="mt-1 mb-0">
                  In Lark App &gt; Event Subscriptions: set Request URL to
                  <Text code className="ml-1">https://your-domain/api/ai-agents/webhook/[TOKEN]</Text>.
                  Add event <Text code>im.message.receive_v1</Text>. Enable Bot tab.
                  Lark sends challenge — system auto-responds.
                </Paragraph>
              ),
            },
            {
              title: 'Step 7: Publish & Test',
              description: (
                <Paragraph className="mt-1 mb-0">
                  Publish the Lark app (or just Enable for internal use). Test via CMS Chat tab
                  or message the bot directly in Lark. Bot replies within 3-10 seconds.
                </Paragraph>
              ),
            },
          ]}
        />
      </Card>

      {/* ── 3. AI Knowledge Training Logic ───────────────────────────────────── */}
      <Card className="">
        <Title level={4}>
          <DatabaseOutlined className="mr-2" />
          3. AI Knowledge Training Logic
        </Title>

        <Title level={5}>3.1 Knowledge Sources</Title>
        <Table
          size="small"
          pagination={false}
          className=""
          dataSource={[
            { key: '1', source: 'Lark Doc (DocX)', api: 'POST /index-doc', desc: 'Parses DocX blocks (headings, text, tables, code, quotes) to markdown' },
            { key: '2', source: 'Lark Wiki Node', api: 'POST /index-wiki-node', desc: 'Fetches wiki content via objToken/nodeToken, supports legacy doc v2' },
            { key: '3', source: 'Lark Bitable', api: 'POST /index-bitable', desc: 'Paginates all records, extracts field values (users, dates, links, options)' },
            { key: '4', source: 'File Upload', api: 'POST /upload', desc: 'Supports txt, md, json, csv files up to 10MB' },
            { key: '5', source: 'Manual Entry', api: 'POST /', desc: 'Direct text/markdown input' },
            { key: '6', source: 'Q&A Training', api: 'POST /from-qa', desc: 'Question-answer pairs with bidirectional matching' },
            { key: '7', source: 'Lark Bot !learn', api: 'via webhook', desc: 'Users teach bot inline: !learn <title> | <content>' },
          ]}
          columns={[
            { title: 'Source', dataIndex: 'source', width: 150 },
            { title: 'API', dataIndex: 'api', width: 180, render: (v: string) => <Text code>{v}</Text> },
            { title: 'Description', dataIndex: 'desc' },
          ]}
        />

        <Title level={5}>3.2 RAG Retrieval Algorithm</Title>
        <Paragraph>
          The system uses <Text strong>keyword-based relevance scoring</Text> (not vector embeddings):
        </Paragraph>
        <pre className="bg-gray-100 dark:bg-gray-800 p-4 rounded text-xs overflow-x-auto">{`scoreRelevance(item, query):
  - Splits query into words (length > 1)
  - Counts regex matches across title + summary + content
  - Returns total match count (higher = more relevant)

scoreQA(item, query):
  - Bidirectional word matching (question-only, NOT answer)
  - Forward: % of stored-Q words in user query
  - Backward: % of user query words in stored-Q
  - Score = (fwd + bwd) / 2 * 20  →  range 0–20
  - >= 12: HIGH confidence → bypass AI, return exact answer
  - >= 6:  MODERATE → inject as strong hint, still call LLM
  - < 6:   No special handling`}</pre>

        <Title level={5}>3.3 Context Building (buildContext)</Title>
        <Paragraph>
          When processing a chat message:
        </Paragraph>
        <Collapse
          size="small"
          className=""
          items={[
            {
              key: '1',
              label: 'Step 1: Q&A Priority Check',
              children: (
                <Paragraph>
                  Filter all knowledge items where <Text code>metadata.type === &apos;qa&apos;</Text>.
                  Score each against the query using <Text code>scoreRelevance</Text>.
                  Top 3 matches with score &gt; 0 are injected as mandatory Q&A examples.
                  The AI is instructed: <Text italic>&quot;Answer exactly per the sample Q&A. May rephrase naturally but do not change content.&quot;</Text>
                </Paragraph>
              ),
            },
            {
              key: '2',
              label: 'Step 2: Document Index',
              children: (
                <Paragraph>
                  A full list of all knowledge items (with sync status) is always included so the AI knows
                  what documents exist. Format: numbered list with source type and title.
                </Paragraph>
              ),
            },
            {
              key: '3',
              label: 'Step 3: Keyword-matched Document Injection',
              children: (
                <Paragraph>
                  Non-Q&A items are scored by <Text code>scoreRelevance</Text>. Top 5 matches are injected
                  (max <Text code>3,000 chars/item</Text>, <Text code>12,000 chars total</Text>).
                  If no keyword match, the 3 most recently updated docs are used as fallback.
                </Paragraph>
              ),
            },
            {
              key: '4',
              label: 'Step 4: System Prompt Assembly',
              children: (
                <Paragraph>
                  Final prompt = Q&A prefix (if moderate match) + agent system prompt + RAG context.
                  For moderate Q&A matches, a one-shot example (Q→A) is prepended to the message history.
                  Message history is capped at last 8 messages.
                </Paragraph>
              ),
            },
          ]}
        />

        <Title level={5}>3.4 Re-sync from Lark Sources</Title>
        <Paragraph>
          <Text code>POST /api/agent-knowledge/re-sync/:id</Text> — Re-fetches content from the original
          Lark source (Doc, Wiki, or Bitable). Manual items cannot be re-synced.
          Status transitions: <Tag>syncing</Tag> → <Tag color="green">ok</Tag> or <Tag color="red">error</Tag>.
        </Paragraph>
        <Alert
          type="warning"
          showIcon
          className="mb-2"
          message="Currently manual re-sync only. Auto re-index on schedule is planned but not yet implemented."
        />
      </Card>

      {/* ── 4. API Logic Deep Dive ───────────────────────────────────────────── */}
      <Card className="">
        <Title level={4}>
          <ThunderboltOutlined className="mr-2" />
          4. API Logic — All Routes
        </Title>

        <Title level={5}>4.1 AI Agent Routes (<Text code>aiAgent.route.js</Text>)</Title>
        <Table
          size="small"
          pagination={false}
          className=""
          dataSource={[
            { key: '1', method: 'GET', path: '/api/ai-agents', desc: 'List all agents (sorted by createdAt desc, populated knowledge)' },
            { key: '2', method: 'GET', path: '/api/ai-agents/:id', desc: 'Get single agent with populated knowledge metadata' },
            { key: '3', method: 'POST', path: '/api/ai-agents', desc: 'Create agent (auto-generates webhookToken via crypto.randomBytes)' },
            { key: '4', method: 'PUT', path: '/api/ai-agents/:id', desc: 'Update agent fields (partial update pattern)' },
            { key: '5', method: 'DELETE', path: '/api/ai-agents/:id', desc: 'Delete agent' },
            { key: '6', method: 'POST', path: '/api/ai-agents/:id/regen-token', desc: 'Regenerate webhook token (invalidates old URL)' },
            { key: '7', method: 'POST', path: '/api/ai-agents/:id/chat', desc: 'Streaming RAG chat: Q&A bypass → context build → LLM stream → SSE' },
            { key: '8', method: 'POST', path: '/api/ai-agents/:id/train', desc: 'Add Q&A training pair, auto-link to agent knowledgeIds' },
            { key: '9', method: 'POST', path: '/webhook/:webhookToken', desc: 'Lark Bot webhook: url_verification, message handling, !learn cmd' },
          ]}
          columns={[
            { title: 'Method', dataIndex: 'method', width: 70, render: (v: string) => <Tag color={v === 'GET' ? 'blue' : v === 'POST' ? 'green' : v === 'PUT' ? 'orange' : 'red'}>{v}</Tag> },
            { title: 'Path', dataIndex: 'path', width: 280, render: (v: string) => <Text code>{v}</Text> },
            { title: 'Description', dataIndex: 'desc' },
          ]}
        />

        <Title level={5}>4.2 Agent Knowledge Routes (<Text code>agentKnowledge.route.js</Text>)</Title>
        <Table
          size="small"
          pagination={false}
          className=""
          dataSource={[
            { key: '1', method: 'GET', path: '/api/agent-knowledge', desc: 'List knowledge items (filter by sourceType, search by keyword relevance)' },
            { key: '2', method: 'GET', path: '/api/agent-knowledge/:id', desc: 'Get single item with full content' },
            { key: '3', method: 'POST', path: '/api/agent-knowledge', desc: 'Create manual knowledge item' },
            { key: '4', method: 'POST', path: '/api/agent-knowledge/from-qa', desc: 'Create Q&A pair (stores question + answer in metadata)' },
            { key: '5', method: 'POST', path: '/api/agent-knowledge/upload', desc: 'Upload file as knowledge (multer, 10MB limit)' },
            { key: '6', method: 'PUT', path: '/api/agent-knowledge/:id', desc: 'Update item (supports Q&A field rebuild)' },
            { key: '7', method: 'DELETE', path: '/api/agent-knowledge/:id', desc: 'Delete knowledge item' },
            { key: '8', method: 'POST', path: '/api/agent-knowledge/re-sync/:id', desc: 'Re-fetch from Lark source (requires userToken)' },
            { key: '9', method: 'POST', path: '/api/agent-knowledge/index-doc', desc: 'Index Lark Doc (DocX blocks → markdown)' },
            { key: '10', method: 'POST', path: '/api/agent-knowledge/index-wiki-node', desc: 'Index Wiki node (tries DocX then legacy Doc v2)' },
            { key: '11', method: 'POST', path: '/api/agent-knowledge/index-bitable', desc: 'Index Bitable table (paginate records, extract field values)' },
            { key: '12', method: 'POST', path: '/api/agent-knowledge/index-batch', desc: 'Batch index multiple sources in one request' },
          ]}
          columns={[
            { title: 'Method', dataIndex: 'method', width: 70, render: (v: string) => <Tag color={v === 'GET' ? 'blue' : v === 'POST' ? 'green' : v === 'PUT' ? 'orange' : 'red'}>{v}</Tag> },
            { title: 'Path', dataIndex: 'path', width: 310, render: (v: string) => <Text code>{v}</Text> },
            { title: 'Description', dataIndex: 'desc' },
          ]}
        />

        <Title level={5}>4.3 AI Config Routes (<Text code>aiConfig.route.js</Text>)</Title>
        <Paragraph>
          Manages multi-provider AI credentials. Supports: <Tag>anthropic</Tag> <Tag>openai</Tag> <Tag>google</Tag> <Tag>groq</Tag> <Tag>mistral</Tag> <Tag color="lime">nvidia</Tag> <Tag color="magenta">ollama</Tag> <Tag>custom</Tag>.
          Features: pricing presets per model, API key masking, connectivity testing, default config selection.
        </Paragraph>

        <Title level={5}>4.4 Core Lark Routes (<Text code>lark.route.js</Text>)</Title>
        <Paragraph>
          OAuth 2-step authentication, tenant token management, user/department queries,
          Bitable CRUD (bases, tables, fields, records with pagination).
          Mount: <Text code>/api-base/lark/v2</Text>
        </Paragraph>

        <Title level={5}>4.5 Lark Webhook (<Text code>larkWebhook.route.js</Text>)</Title>
        <Paragraph>
          Receives Lark Bitable Automation events. Features: lenient JSON parsing for malformed payloads,
          event matching with config caching (60s TTL), dispatch to registered handlers.
        </Paragraph>

        <Title level={5}>4.6 Lark Designer (<Text code>larkDesigner.route.js</Text>)</Title>
        <Paragraph>
          Batch insert records, apply AI-improved schema (non-destructive patch),
          create Lark Docs from markdown, send Custom Bot webhook notifications.
        </Paragraph>
      </Card>

      {/* ── 5. Lark Bot Webhook Logic ────────────────────────────────────────── */}
      <Card className="">
        <Title level={4}>
          <MessageOutlined className="mr-2" />
          5. Lark Bot Webhook — Deep Dive
        </Title>

        <Paragraph>
          Endpoint: <Text code>POST /api/ai-agents/webhook/:webhookToken</Text>
        </Paragraph>

        <Title level={5}>5.1 Request Flow</Title>
        <pre className="bg-gray-100 dark:bg-gray-800 p-4 rounded text-xs overflow-x-auto">{`1. Lark sends event to webhook URL
2. If type === 'url_verification' → return { challenge } (handshake)
3. Find agent by webhookToken (must be active)
4. If event is not text message → return { msg: 'ok' } (ignore)
5. ACK immediately: res.json({ msg: 'ok' }) ← Lark requires within 3 seconds
6. Parse message content (JSON.parse or fallback)
7. Check for !learn / !hoc command → create knowledge + notify
8. Load knowledge items (linked + unlinked Q&A for this agent)
9. Build RAG context
10. Resolve AI config (agent-specific or default)
11. Call LLM (non-streaming for webhook, streaming for CMS chat)
12. Send reply via Lark Message API (tenant_access_token)
13. Update agent stats (fire-and-forget)`}</pre>

        <Title level={5}>5.2 Lark Credentials Resolution</Title>
        <Paragraph>
          Priority: <Text code>agent.larkAccountId</Text> (from LarkAccount model) →
          <Text code>agent.larkAppId + larkAppSecret</Text> (direct fields).
          Tenant token is fetched fresh each time via
          <Text code className="ml-1">POST /auth/v3/tenant_access_token/internal</Text>.
        </Paragraph>

        <Title level={5}>5.3 !learn Command</Title>
        <Paragraph>
          Syntax: <Text code>!learn &lt;title&gt; | &lt;content&gt;</Text> (also <Text code>!hoc</Text> in Vietnamese).
          Creates a manual knowledge item tagged <Text code>training, lark-bot</Text>,
          auto-links to agent&apos;s <Text code>knowledgeIds</Text>, and confirms via Lark message.
        </Paragraph>
      </Card>

      {/* ── 6. CMS Frontend Logic ────────────────────────────────────────────── */}
      <Card className="">
        <Title level={4}>
          <BookOutlined className="mr-2" />
          6. CMS Frontend Pages
        </Title>

        <Title level={5}>6.1 AI Agent Page (<Text code>/lark/agent</Text>)</Title>
        <Paragraph>
          4-tab interface: <Tag>Manage</Tag> <Tag>Test Chat</Tag> <Tag>Knowledge</Tag> <Tag>Training</Tag>.
          Streaming chat uses SSE with provider-specific parsing (Anthropic SSE events, OpenAI chunked SSE).
        </Paragraph>

        <Title level={5}>6.2 AI Settings (<Text code>/settings/ai</Text>)</Title>
        <Paragraph>
          Manage AI provider configs. Test API key connectivity. View pricing presets.
          Set default config for all agents.
        </Paragraph>

        <Title level={5}>6.3 Streaming Implementation</Title>
        <Paragraph>
          File: <Text code>src/lib/aiProvider.ts</Text>. Unified provider abstraction with:
        </Paragraph>
        <ul>
          <li>Anthropic: SSE parsing (<Text code>event: content_block_delta</Text>)</li>
          <li>OpenAI: Chunked SSE (<Text code>data: {'{...}'}</Text>)</li>
          <li>Gemini: Full response (no streaming)</li>
          <li>Error sentinel: <Text code>\x00ERR:</Text> prefix for mid-stream errors</li>
        </ul>
      </Card>

      {/* ── 7. LLM & NLP Considerations ──────────────────────────────────────── */}
      <Card className="">
        <Title level={4}>
          <BulbOutlined className="mr-2" />
          7. LLM & NLP — Current State & Recommendations
        </Title>

        <Title level={5}>7.1 Current LLM Integration</Title>
        <Paragraph>
          Multi-provider support via direct SDK calls:
        </Paragraph>
        <Table
          size="small"
          pagination={false}
          className=""
          dataSource={[
            { key: '1', provider: 'Anthropic', models: 'claude-opus-4-6, claude-sonnet-4-6, claude-haiku-4-5', sdk: '@anthropic-ai/sdk' },
            { key: '2', provider: 'OpenAI', models: 'gpt-4o, gpt-4.1-mini, o3', sdk: 'openai' },
            { key: '3', provider: 'Google', models: 'gemini-2.5-flash, gemini-2.0-flash', sdk: 'openai (compat)' },
            { key: '4', provider: 'Groq', models: 'llama-3.3-70b, qwen-qwq-32b', sdk: 'openai (compat)' },
            { key: '5', provider: 'Mistral', models: 'mistral-large, mistral-small', sdk: 'openai (compat)' },
            { key: '6', provider: 'NVIDIA NIM', models: 'llama-3.3-70b, deepseek-r1, qwen2.5-72b (FREE tier)', sdk: 'openai (compat)' },
            { key: '7', provider: 'Ollama', models: 'llama3.3:70b, qwen2.5:72b, llava:13b (self-hosted, FREE)', sdk: 'openai (compat)' },
          ]}
          columns={[
            { title: 'Provider', dataIndex: 'provider', width: 100 },
            { title: 'Models', dataIndex: 'models' },
            { title: 'SDK', dataIndex: 'sdk', width: 130 },
          ]}
        />

        <Title level={5}>7.2 NLP Gaps & Recommendations</Title>
        <Alert
          type="warning"
          showIcon
          className=""
          message="Current RAG uses keyword matching only — no semantic/vector search"
        />

        <Collapse
          size="small"
          className=""
          items={[
            {
              key: '1',
              label: 'Upgrade: Vector Embeddings for Semantic Search',
              children: (
                <Paragraph>
                  <Text strong>Problem:</Text> Keyword matching misses semantically similar queries
                  (e.g., &quot;salary&quot; vs &quot;compensation&quot;).
                  <br /><br />
                  <Text strong>Solution:</Text> Add embedding generation on knowledge ingest using
                  OpenAI <Text code>text-embedding-3-small</Text> or Anthropic embeddings.
                  Store vectors in MongoDB Atlas Vector Search or a dedicated vector DB (Pinecone, Qdrant).
                  <br /><br />
                  <Text strong>Impact:</Text> Dramatically improves retrieval quality. Recommended as the
                  #1 improvement for production use.
                </Paragraph>
              ),
            },
            {
              key: '2',
              label: 'Upgrade: Function Calling / Tool Use',
              children: (
                <Paragraph>
                  <Text strong>Problem:</Text> Agent can only answer from static knowledge — cannot
                  perform actions or query live data.
                  <br /><br />
                  <Text strong>Solution:</Text> Implement Anthropic <Text code>tool_use</Text> or
                  OpenAI <Text code>function_calling</Text>. Define tools like &quot;search_bitable&quot;,
                  &quot;create_record&quot;, &quot;lookup_employee&quot;.
                  <br /><br />
                  <Text strong>Impact:</Text> Transforms the bot from Q&A into an action-capable assistant.
                </Paragraph>
              ),
            },
            {
              key: '3',
              label: 'Upgrade: Auto Re-index Knowledge',
              children: (
                <Paragraph>
                  <Text strong>Problem:</Text> Knowledge goes stale — manual re-sync required.
                  <br /><br />
                  <Text strong>Solution:</Text> Add a cron job (node-cron or external scheduler) that
                  iterates non-manual knowledge items and re-syncs from Lark daily.
                  Store <Text code>lastSyncedAt</Text> and only re-sync if source is newer.
                  <br /><br />
                  <Text strong>Impact:</Text> Knowledge stays fresh without manual intervention.
                </Paragraph>
              ),
            },
            {
              key: '4',
              label: 'Upgrade: Token Usage & Cost Tracking',
              children: (
                <Paragraph>
                  <Text strong>Problem:</Text> AIConfig has cost fields but they are never updated.
                  <br /><br />
                  <Text strong>Solution:</Text> After each LLM call, extract token counts from response
                  metadata (<Text code>usage.input_tokens</Text>, <Text code>usage.output_tokens</Text>)
                  and increment AIConfig counters. Add a dashboard widget showing spend per agent/provider.
                </Paragraph>
              ),
            },
            {
              key: '5',
              label: 'Upgrade: Intent Classification & Entity Extraction',
              children: (
                <Paragraph>
                  <Text strong>Problem:</Text> All queries go through the same RAG pipeline — no routing by intent.
                  <br /><br />
                  <Text strong>Solution:</Text> Add a lightweight classification step before RAG.
                  Use the LLM itself with a structured output schema to classify intent
                  (e.g., &quot;policy_question&quot;, &quot;leave_request&quot;, &quot;general_chat&quot;, &quot;escalation&quot;).
                  Route to different knowledge subsets or actions accordingly.
                </Paragraph>
              ),
            },
          ]}
        />

        <Title level={5}>7.3 Priority Roadmap</Title>
        <Table
          size="small"
          pagination={false}
          dataSource={[
            { key: '1', priority: 'P0', item: 'Vector embeddings + semantic search', effort: 'Medium', impact: 'High' },
            { key: '2', priority: 'P0', item: 'Auto re-index knowledge (cron)', effort: 'Low', impact: 'High' },
            { key: '3', priority: 'P1', item: 'Token usage & cost tracking', effort: 'Low', impact: 'Medium' },
            { key: '4', priority: 'P1', item: 'Function calling / tool use', effort: 'Medium', impact: 'High' },
            { key: '5', priority: 'P2', item: 'Intent classification & routing', effort: 'Medium', impact: 'Medium' },
            { key: '6', priority: 'P2', item: 'Conversation memory (cross-session)', effort: 'Medium', impact: 'Medium' },
            { key: '7', priority: 'P3', item: 'Multi-agent orchestration', effort: 'High', impact: 'Medium' },
          ]}
          columns={[
            { title: 'Priority', dataIndex: 'priority', width: 70, render: (v: string) => <Tag color={v === 'P0' ? 'red' : v === 'P1' ? 'orange' : v === 'P2' ? 'blue' : 'default'}>{v}</Tag> },
            { title: 'Item', dataIndex: 'item' },
            { title: 'Effort', dataIndex: 'effort', width: 80 },
            { title: 'Impact', dataIndex: 'impact', width: 80 },
          ]}
        />
      </Card>

      {/* ── 8. Maintenance Checklist ─────────────────────────────────────────── */}
      <Card className="">
        <Title level={4}>
          <WarningOutlined className="mr-2" />
          8. Maintenance Checklist
        </Title>

        <Title level={5}>Daily</Title>
        <ul>
          <li>Check MongoDB connection and disk usage</li>
          <li>Verify Lark webhook is responding (check agent stats.lastChatAt)</li>
          <li>Review API error logs for failed LLM calls</li>
        </ul>

        <Title level={5}>Weekly</Title>
        <ul>
          <li>Re-sync knowledge items from Lark sources (especially active Bitable tables)</li>
          <li>Review Q&A training pairs — remove duplicates or incorrect entries</li>
          <li>Check AI API key validity and remaining credits</li>
        </ul>

        <Title level={5}>Monthly</Title>
        <ul>
          <li>Audit agent system prompts — update for policy changes</li>
          <li>Review knowledge base coverage — add new documents</li>
          <li>Check Lark App permissions and version status</li>
          <li>Rotate webhook tokens if security concerns arise</li>
        </ul>

        <Divider />

        <Title level={5}>Troubleshooting</Title>
        <Table
          size="small"
          pagination={false}
          dataSource={[
            { key: '1', issue: 'Bot not responding', fix: 'Check: webhook URL correct? Agent isActive? AI config has valid API key? Lark app published?' },
            { key: '2', issue: 'Wrong answers', fix: 'Review knowledge base: re-sync stale docs, add Q&A training pairs for specific questions' },
            { key: '3', issue: 'Slow responses', fix: 'Check LLM provider latency. Consider switching to faster model (Haiku/GPT-4o-mini). Reduce context size.' },
            { key: '4', issue: '3s timeout in Lark', fix: 'System already ACKs immediately. If reply never arrives: check AI config, server logs, network.' },
            { key: '5', issue: 'Knowledge not updating', fix: 'Manual re-sync required. Go to Knowledge tab → click re-sync button. Ensure userToken is valid.' },
            { key: '6', issue: 'Webhook verification fails', fix: 'Ensure server is publicly accessible. Check url_verification handler returns { challenge }.' },
          ]}
          columns={[
            { title: 'Issue', dataIndex: 'issue', width: 180 },
            { title: 'Fix', dataIndex: 'fix' },
          ]}
        />
      </Card>

      {/* ── 9. File Structure Reference ──────────────────────────────────────── */}
      <Card className="">
        <Title level={4}>
          <KeyOutlined className="mr-2" />
          9. Key Files Reference
        </Title>
        <pre className="bg-gray-100 dark:bg-gray-800 p-4 rounded text-xs overflow-x-auto">{`api-lark-all/
├── models/
│   ├── AIAgent.model.js          ← Agent schema (name, prompt, knowledge, webhook, lark creds)
│   ├── AgentKnowledge.model.js   ← Knowledge items (source, content, sync status, metadata)
│   ├── AIConfig.js               ← Provider credentials + pricing + cost tracking
│   ├── LarkAccount.js            ← Multi-account Lark app management
│   ├── ChatConversation.model.js ← Persistent chat with images + sharing
│   └── ChatGroup/ChatLog/...     ← Group chat, message logs
├── routes/
│   ├── aiAgent.route.js          ← CRUD + streaming chat + webhook + training
│   ├── agentKnowledge.route.js   ← Knowledge CRUD + Lark indexing + re-sync + scoring
│   ├── aiConfig.route.js         ← Provider config management + presets + testing
│   ├── aiDesigner.route.js       ← AI-powered Bitable schema generation
│   ├── lark.route.js             ← Core Lark API (OAuth, Bitable, users)
│   ├── larkWebhook.route.js      ← Bitable Automation webhook events
│   ├── larkDesigner.route.js     ← Bitable operations (insert, patch, push-doc)
│   ├── larkAccounts.route.js     ← Multi-account CRUD
│   └── chatConversation.route.js ← Chat with vision, streaming, sharing
├── services/
│   ├── larkClient.js             ← Lark SDK client initialization
│   ├── openai.service.js         ← OpenAI API wrapper (legacy)
│   └── larkBitable.service.js    ← Bitable operations
├── prompts/
│   ├── buildSystemPrompt.js      ← AI system prompt builder for schema design
│   └── larkBlueprint.prompt.js   ← Blueprint generation prompt
└── config/
    ├── openai.js                 ← OpenAI client config
    └── mongo.js                  ← MongoDB connection

cms-lark-sync/src/
├── app/
│   ├── lark/agent/page.tsx       ← AI Agent management (4 tabs)
│   ├── lark/agent/ChatPanel.tsx  ← Streaming chat component
│   ├── settings/ai/page.tsx      ← AI config management
│   ├── docs/agent-guide/page.tsx ← This documentation page
│   └── docs/sync|bitable-ideas|base-extensions/
├── lib/
│   ├── aiProvider.ts             ← Unified LLM provider abstraction (streaming)
│   ├── aiConfig.ts               ← Client-side AI config (localStorage)
│   ├── apiDefs.ts                ← API endpoint definitions (for API Explorer)
│   ├── i18n.ts                   ← Vietnamese + English translations
│   └── larkOAuth.ts              ← OAuth config
└── store/
    ├── lark.ts                   ← Lark state management
    └── language|theme|staff|user.ts`}</pre>
      </Card>
      <TourGuide pageKey="docs-agent-guide" steps={tourSteps['docs-agent-guide']} />
    </div>
  )
}
