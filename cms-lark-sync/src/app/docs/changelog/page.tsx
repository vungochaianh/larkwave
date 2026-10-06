'use client'

import { Card, Divider, Typography, Table, Tag, Alert, Timeline, Badge } from 'antd'
import {
  RocketOutlined,
  BranchesOutlined,
  BugOutlined,
  ThunderboltOutlined,
  BookOutlined,
  GlobalOutlined,
  RobotOutlined,
  DatabaseOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  SendOutlined,
} from '@ant-design/icons'
import useLang from '@/store/language'
import { t } from '@/lib/i18n'
import TourGuide from '@/components/TourGuide'
import { tourSteps } from '@/lib/tourSteps'

const { Title, Paragraph, Text } = Typography

const i = {
  vi: {
    title: 'Nhật ký cập nhật',
    subtitle: 'Lịch sử thay đổi, tính năng mới, và lộ trình phát triển',
    latest: 'Phiên bản mới nhất',

    // v2.7.8
    v278title: 'v2.7.8 — 10 Logistics Agents + Docs Pages + Deep Implement',
    v278date: '19/04/2026',
    v278desc: 'Thêm 10 agent logistics chuyên ngành (tracking, container, hải quan, kho, 1688/Taobao crawler, nhà cung cấp, báo giá, giám sát giá, chứng từ). Tạo trang Docs trong Admin Dashboard. Chuẩn hoá shared_learning.py cho tất cả agents. Deep implement 10 skeleton agents với business logic thực.',
    v278changes: [
      { type: 'new', text: '10 agent logistics mới: logistics-tracker (end-to-end TQ→VN), container (lifecycle management), customs (hải quan + HS code), warehouse (nhập/xuất kho), 1688-crawler, taobao-crawler, supplier (NCC Trung Quốc), quote-builder (báo giá chuyên nghiệp), price-monitor (giám sát giá), document (chứng từ nhập khẩu).' },
      { type: 'new', text: 'cms-agents-admin: trang /docs — index grid + /docs/agents/[name] với 3 tab (Configuration, Testing, Roadmap) cho tất cả 39 agents.' },
      { type: 'new', text: 'cms-agents-admin: sidebar tổ chức lại thành submenu groups (Core Agents, Logistics, Business) thay vì flat menu 20+ items.' },
      { type: 'new', text: 'shared_learning.py v2: portable module (db param), domain-based learning, trust score (+0.1/-0.15), get_domain_examples, get_learning_metrics.' },
      { type: 'new', text: 'Deep implement 10 skeleton agents: inventory (!stock), finance (!finance), CRM (!crm), reminder (!remind), translator (!translate), approval (!approve), HR (!hr), scheduler (!book), onboarding (!onboard), shipping (!track).' },
      { type: 'improve', text: 'Tier B agents (10): tách inline smart_ai() 50 dòng → import từ shared_learning.py module chuẩn.' },
      { type: 'new', text: 'Đăng ký 10 logistics agents: agents.ts (39 entries), layout.tsx (submenu), config.py (39 AGENTS), db.py (39 SEED_EXTRA).' },
    ],

    // v2.7.7
    v277title: 'v2.7.7 — Tài liệu Free Chatbot & Agents v2 Roadmap',
    v277date: '12/04/2026',
    v277desc: 'Viết hướng dẫn chi tiết xây dựng chatbot miễn phí với Ollama (self-hosted) và NVIDIA NIM (free tier). Deploy lên Telegram + Lark. Bao gồm roadmap Agents v2 với nhiều loại agent mới.',
    v277changes: [
      { type: 'doc', text: 'cms-lark-sync/docs/free-chatbot-guide.md — hướng dẫn toàn diện 11 phần: kiến trúc, cài đặt Ollama/NVIDIA NIM, tạo Telegram/Lark bot, cấu hình AIConfig, train knowledge base, deploy, custom commands, troubleshooting.' },
      { type: 'doc', text: 'Agents v2 Roadmap: 6 loại agent mới (Chat, Task, Workflow, RAG, Code, Multi-Agent), giao diện mới với /agents routes, API v2 endpoints, và danh sách tính năng dự kiến (templates, flow builder, analytics, A/B testing, human handoff, web embed).' },
      { type: 'doc', text: 'Bảng so sánh model miễn phí: Ollama (llama3.1:8b, qwen2.5:7b, llama3.3:70b) vs NVIDIA NIM (llama-3.3-70b, deepseek-r1, qwen2.5-72b) với yêu cầu RAM/VRAM và đánh giá chất lượng.' },
    ],

    // v2.7.6
    v276title: 'v2.7.6 — CI/CD pipeline hardening & stable deploy',
    v276date: '11/04/2026',
    v276desc: 'Viết lại pipeline GitLab CI/CD để deploy ổn định: secrets dùng CI variables làm source of truth, health check post-deploy, auto rollback khi fail, smoke test public URL. Fix bug import-time throw trong openai.service.js.',
    v276changes: [
      { type: 'fix', text: 'services/openai.service.js — lazy-init OpenAI client qua getClient() thay vì throw Error("Missing OPENAI_API_KEY") tại top-level import. Bug này đã khiến production crash loop toàn bộ API khi env var bị thiếu.' },
      { type: 'fix', text: '/health endpoint (server.js) — trả HTTP 503 khi mongoose.connection.readyState !== 1. Trước đây luôn trả 200 + body degraded, khiến mọi curl -f / Docker HEALTHCHECK / CI smoke test đều silent pass dù DB đã die.' },
      { type: 'new', text: '.gitlab-ci.yml deploy:api + deploy:cms — viết lại hoàn toàn với 3 bước: (1) regenerate ~/env/*.env từ GitLab CI variables qua ssh heredoc với positional args (tránh leak vào command line), (2) tag apihoanam:previous rồi docker load :latest rồi restart, (3) curl localhost:6000/health poll 45s.' },
      { type: 'new', text: 'Auto rollback: nếu health check timeout, deploy script tự docker tag apihoanam:previous → apihoanam:latest, restart container, và fail pipeline job với exit 1. Production stays on last-known-good version.' },
      { type: 'new', text: 'Public smoke test: CI runner tự curl -sf https://apihoanam.toolswave.net/health với 5 retries sau khi SSH deploy xong, để verify nginx layer cũng OK chứ không chỉ container internal.' },
      { type: 'new', text: 'Nginx upstream cache auto-clear: deploy script chạy sudo -n nginx -s reload ở cuối (yêu cầu passwordless sudoers rule một lần). Loại bỏ tình trạng nginx vẫn trả 502 sau khi container đã recover.' },
      { type: 'new', text: 'Dockerfile HEALTHCHECK directive: wget /health mỗi 30s. Giờ docker ps hiển thị (healthy)/(unhealthy) trong Status column — immediate visibility khi debug, không cần parse log.' },
      { type: 'new', text: 'Docs DEPLOY.md — section "Deploy chuẩn — GitLab CI/CD pipeline" mới ở đầu, gồm flow diagram, danh sách 14 CI variables phải set, server bootstrap commands (passwordless nginx sudo, ~/env dir), debug playbook bảng triệu chứng → fix, chaos test instructions để verify rollback.' },
      { type: 'improve', text: 'Source of truth cho secrets chuyển từ ~/env/apihoanam.env trên server (dễ bị wipe, 21 bytes thay vì đầy đủ 11 keys) sang GitLab CI/CD Variables. Server file giờ chỉ là cache được overwrite mỗi deploy.' },
      { type: 'improve', text: 'SSH command injection hardening: env generation dùng bash -s -- "$VAR1" "$VAR2" ... positional args thay vì nội suy biến trực tiếp vào heredoc, tránh giá trị có ký tự đặc biệt break script.' },
    ],

    // v2.7.5
    v275title: 'v2.7.5 — Multi-bot Management + Logical Modules Split',
    v275date: '11/04/2026',
    v275desc: 'Thêm hệ thống quản lý đa bot (Lark/Telegram/Slack/Zalo) với custom commands từ DB, live chat test, matrix view. Bắt đầu tách AI system thành modules/ theo pattern "logical microservices".',
    v275changes: [
      { type: 'new', text: 'Model Bot + BotCommand: mỗi bot = 1 instance (platform + credentials riêng) link tới 1 AI agent. Nhiều bot có thể share cùng 1 agent (ví dụ: prod + staging Telegram bot).' },
      { type: 'new', text: 'Unified webhook POST /api/bots/:botId/webhook — tự động resolve bot → credentials → platform → agent, gọi processChannelWebhook() đã có sẵn. Tương thích cả 4 platform qua channelAdapter.' },
      { type: 'new', text: 'Custom commands từ DB: BotCommand với 4 triggerType (prefix/exact/contains/regex) + 4 responseType (text template / llm-prompt override / reset session / no-op). Template variables {{text}}, {{senderName}}, {{chatId}}, {{botName}}.' },
      { type: 'new', text: 'Commands có 2 scope: bot-scoped (chỉ cho 1 bot cụ thể) hoặc agent-scoped (shared giữa tất cả bot của agent). Bot-scoped override agent-scoped override built-in (!learn, !qa, !help, !reset, !feedback, !status).' },
      { type: 'new', text: 'Trang /bots — Dashboard: list bots, filter theo platform/status, stats messages + errors, toggle active, copy webhook URL. Form create/edit với platform-specific credential fields (telegram token / lark app ID+secret / slack / zalo).' },
      { type: 'new', text: 'Trang /bots/[id] — Detail: webhook URL alert với copy button, descriptions (info + stats), commands table, drawer live chat test (dry-run mode: chỉ chạy dispatcher, không gọi LLM hay gửi thật ra platform).' },
      { type: 'new', text: 'Trang /bots/commands — Matrix 2D: rows=commands, cols=bots. Cell hiển thị trạng thái (shared 👥 / bot-scoped ✓ / —). Click để move command giữa các bot. Toggle enabled inline.' },
      { type: 'new', text: 'Telegram webhook wire: sử dụng TelegramAdapter đã có sẵn trong services/channelAdapter.js (parseEvent/sendMessage/sendTyping). User chỉ cần copy webhook URL từ bot detail page paste vào @BotFather.' },
      { type: 'new', text: 'Simulate endpoint POST /api/bots/:id/simulate — test command dispatcher mà không chạy LLM hay gửi message thật. Trả về matched/source (custom/builtin/llm-fallback)/reply/action để debug command patterns.' },
      { type: 'new', text: 'modules/bots/ + modules/config-credits/ — bắt đầu logical split của AI system: structure mới cho 2 modules (bots = new code, config-credits = physical move của aiConfig/aiCredit routes). Mỗi module có index.js export mount() helper. Còn lại ai-chat/knowledge/lark sẽ move dần trong các phiên sau.' },
      { type: 'improve', text: 'handleBotCommand trong aiAgent.route.js: gọi dispatchCustomCommand() trước khi check built-ins, cho phép admin override default commands. processChannelWebhook() nhận optional { preloadedAgent, bot } để hỗ trợ bot-scoped credentials.' },
      { type: 'improve', text: 'Bot stats tracking: inc totalMessages/errorCount trên mỗi webhook, ghi lastError + lastErrorAt khi LLM/adapter fail. Dashboard hiển thị stats real-time.' },
    ],

    // v2.7.4
    v274title: 'v2.7.4 — AI Agent miễn phí với NVIDIA NIM + Ollama',
    v274date: '10/04/2026',
    v274desc: 'Thêm 2 AI provider miễn phí: NVIDIA NIM (free tier cloud) và Ollama (self-hosted). Dọn dẹp 7 bản sao PROVIDER_BASE_URLS trùng lặp thành 1 shared util.',
    v274changes: [
      { type: 'new', text: 'Thêm provider nvidia (NVIDIA NIM, free tier): Llama 3.3 70B, DeepSeek R1, Qwen 2.5 72B, Nemotron 70B. Base URL mặc định https://integrate.api.nvidia.com/v1.' },
      { type: 'new', text: 'Thêm provider ollama (self-hosted, unlimited free): Llama 3.3/3.1, Qwen 2.5, Mixtral, DeepSeek R1, Gemma 2, Phi 4, LLaVA vision. Default http://ollama:11434/v1.' },
      { type: 'new', text: 'Docker Compose: thêm service ollama vào stack api-lark-all với volume persistent, port localhost-only 11434, chuẩn bị cho server production 64GB RAM.' },
      { type: 'new', text: 'Shared util utils/aiProviders.js — centralize PROVIDER_BASE_URLS, ALLOWED_PROVIDER_HOSTS, buildOpenAIOptions(cfg) cho 6 call sites backend. Ollama empty-apiKey được xử lý tự động.' },
      { type: 'new', text: 'CMS aiProvider.ts refactor: factor openaiChat/openaiChatStream thành openaiCompatibleChat(Stream) dùng chung cho openai/nvidia/ollama (1 implementation, 3 providers).' },
      { type: 'new', text: 'Settings → AI: dropdown provider thêm nvidia (lime) + ollama (magenta) icon, tooltip base URL hướng dẫn docker/local dev.' },
      { type: 'new', text: 'Docs DEPLOY.md: section "Ollama setup trên server" với hướng dẫn ollama pull cho Llama 70B/Qwen 72B/LLaVA, note về CPU-only vs GPU.' },
      { type: 'improve', text: 'JSON mode safety: thêm ollama vào exception list cùng google (nhiều model Ollama reject response_format strict json_object).' },
      { type: 'improve', text: 'AIConfig enum: mở rộng từ 6 → 8 providers (openai, anthropic, google, groq, mistral, nvidia, ollama, custom).' },
    ],

    // v2.7.3
    v273title: 'v2.7.3 — Deep Audit Base Designer & Agent + CI/CD',
    v273date: '28/03/2026',
    v273desc: 'Audit sâu logic Base Designer và AI Agent. Sửa token tracking, Q&A prompt, agent delete cleanup. Thêm CI/CD pipeline và docs.',
    v273changes: [
      { type: 'new', text: 'CI/CD Pipeline: thêm .gitlab-ci.yml cho cả api-lark-all và cms-lark-sync (3 stages: Test → Build → Deploy manual).' },
      { type: 'new', text: 'Trang docs CI/CD (/docs/cicd) — hướng dẫn chi tiết cấu hình GitLab CI/CD, SSH key, variables, deploy thủ công (song ngữ VI/EN).' },
      { type: 'fix', text: 'AI Agent: sửa Q&A hint prompt — đổi từ "BẮT BUỘC" sang "ƯU TIÊN CAO" và đặt cuối system prompt (recency bias) thay vì đầu.' },
      { type: 'fix', text: 'AI Agent: sửa Anthropic streaming token tracking — đợi message_delta event cho output tokens thay vì track giữa stream.' },
      { type: 'fix', text: 'AI Agent: cải thiện agent delete — xoá sạch conversations, groups, bot sessions, và manual knowledge items không dùng chung.' },
      { type: 'fix', text: 'Base Designer compose: sửa empty error message khi stream fail (throw new Error("") → error message có HTTP status).' },
      { type: 'fix', text: 'Knowledge: thêm truncated flag vào metadata khi nội dung vượt 150K ký tự (trước đây cắt im lặng).' },
      { type: 'doc', text: 'Menu: thêm link CI/CD Pipeline vào sidebar Docs.' },
      { type: 'doc', text: 'i18n: thêm docsCICD label (VI/EN).' },
    ],

    // v2.7.2
    v272title: 'v2.7.2 — Kiểm tra bảo trì & Bảo mật toàn diện',
    v272date: '28/03/2026',
    v272desc: 'Audit toàn bộ CMS + API: bổ sung token tracking cho Base Designer, bảo mật endpoint, xoá sạch hardcoded colors còn sót.',
    v272changes: [
      { type: 'new', text: 'Token tracking cho tất cả 11 AI Designer endpoints (compose, design, docs, enhance, extract, improve, sample-data, schema-docs, understand) — ghi nhận input/output tokens và trừ credit.' },
      { type: 'new', text: 'Credit pre-check cho AI Agent /chat endpoint và tất cả AI Designer routes — chặn gọi khi blockOnZero và hết số dư.' },
      { type: 'fix', text: 'Bảo mật: endpoint /ai-configs/:id/resolve chỉ cho phép truy cập từ localhost hoặc internal origin (chặn truy cập từ bên ngoài).' },
      { type: 'fix', text: 'Share page (/share/[token]) — thay 20+ hardcoded colors bằng CSS variables, hỗ trợ dark mode hoàn chỉnh.' },
      { type: 'check', text: 'Audit CMS: kiểm tra 42 pages, 29 components, 8 stores — TypeScript pass 0 lỗi, không còn critical bugs.' },
      { type: 'check', text: 'Audit API: kiểm tra 20 route files, 18 models, 13 services — tất cả syntax valid, response envelope chuẩn.' },
    ],

    // v2.7.1
    v271title: 'v2.7.1 — Gộp Layout & Xoá sạch Hardcoded Colors',
    v271date: '27/03/2026',
    v271desc: 'Gộp sidebar Agent vào layout chính, xoá 70+ hardcoded hex colors, thay hover effects bằng CSS classes, thêm .claude pro structure.',
    v271changes: [
      { type: 'new', text: 'Gộp sidebar Agent vào layout chính — xoá layout chồng layout, Agent page dùng URL query params (?tab=agents|knowledge|training|test|deploy).' },
      { type: 'new', text: 'Menu AI Agent mở rộng thành 5 sub-menu trong sidebar chính (Quản lý, Knowledge, Huấn luyện, Chat, Deploy).' },
      { type: 'new', text: '.claude pro structure — CLAUDE.md, 8 rules, 3 commands (/deploy, /fix-issue, /review), 3 agents, 3 skills.' },
      { type: 'fix', text: 'Xoá sạch 70+ hardcoded hex colors — tất cả dùng CSS variables từ globals.css (hỗ trợ dark mode hoàn chỉnh).' },
      { type: 'fix', text: 'Xoá tất cả 15 inline onMouseEnter/onMouseLeave — thay bằng 5 CSS classes (:hover) trong ChatPanel.' },
      { type: 'fix', text: 'Layout.tsx: thay #141414/#DD3333 bằng var(--bg-color)/var(--primary-color).' },
      { type: 'fix', text: 'ChatPanel full height — bỏ borderRadius/shadow, sidebar dùng var(--bg-color), ConvRow dùng left accent border.' },
      { type: 'doc', text: 'i18n: thêm 5 menu labels mới cho Agent sub-tabs (agentList, agentKnowledge, agentTraining, agentChat, agentDeploy).' },
    ],

    // v2.7.0
    v270title: 'v2.7.0 — Cải thiện Prompt Builder, Credit & Chat',
    v270date: '27/03/2026',
    v270desc: 'Nâng cấp logic AI chat, cải thiện trang credits, thêm suggestion chips, sửa bitable sync schedule.',
    v270changes: [
      { type: 'new', text: 'AI Usage Dashboard (/settings/credits) — thống kê chi phí, tokens, biểu đồ SVG theo tháng (6 tháng), lọc theo ngày/loại, dữ liệu từ provider API (OpenAI/Anthropic).' },
      { type: 'new', text: 'API: GET /ai-credits/monthly — tổng hợp chi phí/nạp theo tháng. GET /ai-configs/:id/provider-usage — lấy usage từ OpenAI/Anthropic API.' },
      { type: 'new', text: 'Tour Guide cho trang AI Usage Dashboard — 7 bước hướng dẫn chi tiết (song ngữ VI/EN).' },
      { type: 'new', text: 'Chat suggestions — gợi ý khi bắt đầu chat và follow-up sau khi AI trả lời (phân tích nội dung để gợi ý).' },
      { type: 'new', text: 'Bitable Sync: thêm ignoreSchedule toggle — cho phép job chạy 24/7 bỏ qua lịch trình (hữu ích cho dev/test).' },
      { type: 'fix', text: 'Credit pre-check trước khi gọi LLM — trả về HTTP 402 INSUFFICIENT_CREDIT khi blockOnZero và hết số dư.' },
      { type: 'fix', text: 'Frontend kiểm tra res.ok trước khi đọc stream — hiển thị thông báo lỗi rõ ràng thay vì hiện raw error.' },
      { type: 'fix', text: 'Conversation history tăng 12 → 20 turns, strip imageData từ older messages để tiết kiệm tokens.' },
      { type: 'fix', text: 'Knowledge items lọc theo syncStatus — chỉ đưa items với status "ok" vào RAG context.' },
      { type: 'fix', text: 'System prompt sắp xếp lại: base prompt → context → Q&A hints (tận dụng recency bias của LLM).' },
      { type: 'fix', text: 'Bitable Sync label tiếng Việt — sửa dấu tiếng Việt cho schedule form.' },
      { type: 'model', text: 'BitableSync model: thêm ignoreSchedule boolean field.' },
    ],

    // v2.6
    v26title: 'v2.6.0 — Production Stability & AI Credit Management',
    v26date: '27/03/2026',
    v26desc: 'Ổn định production: tracking token đầy đủ, Google/Mistral hỗ trợ, streaming timeout, trang quản lý AI Credit.',
    v26changes: [
      { type: 'new', text: 'Trang quản lý AI Credit (/settings/credits) — xem số dư, nạp tiền, lịch sử giao dịch, toggle blockOnZero cho mỗi AI Config.' },
      { type: 'new', text: 'API: PATCH /api/ai-credits/:configId/settings — cấu hình blockOnZero và alertThreshold.' },
      { type: 'new', text: 'Settings > AI: cột Credit hiển thị số dư + toggle blockOnZero inline, nút Nạp tiền trực tiếp.' },
      { type: 'fix', text: 'Token tracking trong chatConversation.route.js streaming — cả Anthropic (message_start/message_delta) lẫn OpenAI (stream_options.include_usage). Trước đó token không được ghi nhận.' },
      { type: 'fix', text: 'Google Gemini: thêm default base URL https://generativelanguage.googleapis.com/v1beta/openai cho OpenAI SDK (tất cả 4 routes).' },
      { type: 'fix', text: 'Mistral: thêm default base URL https://api.mistral.ai/v1 (tất cả 4 routes).' },
      { type: 'fix', text: 'Streaming timeout 60s (AbortController) trong chatConversation.route.js và aiAgent /:id/chat — không còn bị treo khi LLM không phản hồi.' },
      { type: 'fix', text: 'Credit pre-check trong webhook: chặn gọi LLM khi blockOnZero=true và balance ≤ 0, gửi thông báo tiếng Việt cho người dùng.' },
      { type: 'fix', text: 'Image Analyzer (/demo/image-analyzer): dùng /api/demo/vision proxy — không còn lộ API key Anthropic/OpenAI ra browser.' },
      { type: 'fix', text: 'OpenAI streaming trong aiAgent /:id/chat: thêm stream_options.include_usage và trackTokenUsage — token giờ được ghi nhận đầy đủ.' },
    ],

    // v2.5
    v25title: 'v2.5.0 — Demo Products & Documentation',
    v25date: '27/03/2026',
    v25desc: 'Thêm 4 sản phẩm demo mới, tạo nhóm "Demo Products" trong sidebar, tài liệu hướng dẫn demo chi tiết.',
    v25changes: [
      { type: 'new', text: 'AI Text Tools (/demo/ai-tools) — Tóm tắt, Dịch thuật (6 ngôn ngữ), Viết lại (5 giọng), Kiểm tra ngữ pháp. Streaming real-time.' },
      { type: 'new', text: 'Image Analyzer (/demo/image-analyzer) — Tải ảnh + 4 chế độ: Mô tả, OCR, Trích xuất dữ liệu, Nhận diện đối tượng. Hỗ trợ Anthropic Vision + OpenAI GPT-4V.' },
      { type: 'new', text: 'Knowledge Q&A (/demo/knowledge-qa) — Demo RAG: chọn AI Agent, hỏi đáp với streaming, sidebar hiển thị KB docs + gợi ý câu hỏi.' },
      { type: 'new', text: 'Webhook Tester (/demo/webhook-tester) — HTTP request builder với preset Lark/Telegram/Generic, headers/body editor, response viewer, lịch sử 20 request.' },
      { type: 'new', text: 'Nhóm "Sản phẩm Demo" trong sidebar — gom Chat Bot + 4 demo mới thành 1 group.' },
      { type: 'new', text: 'Trang hướng dẫn Demo (/docs/demo-guide) — tài liệu chi tiết cho mỗi demo product.' },
      { type: 'doc', text: 'Tour steps cho 4 demo pages mới (16 bước, song ngữ VI+EN).' },
      { type: 'doc', text: 'i18n: thêm 5 keys mới cho menu Demo (demo, demoAiTools, demoImageAnalyzer, demoKnowledgeQA, demoWebhookTester).' },
      { type: 'fix', text: 'OAuth redirect: thêm /lark/oauth và /share/ vào noLayoutPaths — tránh render sidebar khi callback.' },
      { type: 'fix', text: 'Sửa 6 trang dùng fragment <> → <div> wrapper — tránh hydration errors.' },
      { type: 'fix', text: 'TypeScript: sửa 7 lỗi (BitableSyncJob.schedule type, TourGuide placement, target cast).' },
      { type: 'fix', text: 'Schedule mặc định: 6h-20h, Thứ 2-7 (trước đó 0h-24h, tất cả ngày). API migrate-schedule.' },
    ],

    // v2.4
    v24title: 'v2.4.0 — Tour Guide, Schedule Config, UI Polish',
    v24date: '27/03/2026',
    v24desc: 'Tour Guide chi tiết cho 16 trang, lịch trình tự động cho Bitable Sync, sửa dark mode, chuẩn hoá spacing.',
    v24changes: [
      { type: 'new', text: 'Tour Guide chi tiết: 5-11 bước hướng dẫn cho mỗi trang chính (tổng 80+ bước)' },
      { type: 'new', text: 'Bitable Sync Schedule: cấu hình giờ chạy (VD: 8h-18h) và ngày trong tuần' },
      { type: 'new', text: 'API: GET /api/bitable-sync/:id/schedule-status — kiểm tra job có trong lịch trình không' },
      { type: 'new', text: 'Executor: isWithinSchedule() hỗ trợ timezone (Asia/Ho_Chi_Minh) và overnight ranges' },
      { type: 'fix', text: 'Dark mode: sửa base-designer (bg-orange-50, bg-blue-50, bg-green-50 → CSS vars)' },
      { type: 'fix', text: 'Dark mode: sửa dev/api METHOD_BG colors → CSS vars (success/info/warning/error-bg)' },
      { type: 'fix', text: 'Dark mode: sửa dev/features gradient và border colors → CSS vars' },
      { type: 'fix', text: 'Dark mode: sửa settings/ai bg-neutral-100 → var(--bg-secondary)' },
      { type: 'fix', text: 'UI Spacing: xoá max-width và mx-auto constraint trên 9 trang — content full width' },
      { type: 'fix', text: 'Base Designer tách ra thành group menu riêng (không còn nested trong Lark Integration)' },
      { type: 'fix', text: 'Docs layout: full width với space-y-3, xoá mb-4 trùng lặp' },
      { type: 'model', text: 'BitableSync model: thêm schedule { activeHoursStart, activeHoursEnd, activeDays, timezone }' },
    ],

    // v2.3
    v23title: 'v2.3.0 — Cải thiện UI/UX & Bảo mật API',
    v23date: '26/03/2026',
    v23desc: 'Nâng cấp toàn diện: sửa dark mode, thêm animation, cải thiện bảo mật API, chuẩn hoá theme.',
    v23changes: [
      { type: 'new', text: 'CSS variables toàn diện: 50+ biến theme (màu, shadow, chat, code, note, trạng thái)' },
      { type: 'new', text: 'Animations: page fade-in, stagger list items, skeleton shimmer, typing indicator, pulse dot' },
      { type: 'new', text: 'Card hover effects: elevation + shadow transition trên tất cả Ant Design Card' },
      { type: 'new', text: 'Button press effect: scale(0.97) khi nhấn, brightness hover trên primary' },
      { type: 'new', text: 'Input focus glow: accent color ring khi focus, smooth transition' },
      { type: 'new', text: 'Modal slide-in animation, Drawer smooth entrance' },
      { type: 'new', text: 'Utility classes: .theme-code, .theme-quote, .theme-note, .chat-bubble-*, .surface-elevated, .gradient-text' },
      { type: 'new', text: 'Print styles: ẩn sidebar khi in' },
      { type: 'new', text: 'Focus-visible accessibility: outline ring cho keyboard navigation' },
      { type: 'fix', text: 'Sửa 80+ hardcoded hex colors trong Agent Page — dark mode giờ hoạt động hoàn hảo' },
      { type: 'fix', text: 'Sửa 50+ hardcoded hex colors trong ChatPanel — toàn bộ dùng CSS variables' },
      { type: 'fix', text: 'Sửa avatar color trong Settings/Users — dùng var(--avatar-bg)' },
      { type: 'fix', text: 'API: Password hashing chuyển từ SHA256 sang bcrypt (10 rounds) + auto-migrate legacy' },
      { type: 'fix', text: 'API: Escape RegExp user input trong system users search (ngăn ReDoS)' },
      { type: 'fix', text: 'API: parseInt validation trong jobs.js và bitableSync.route.js (ngăn NaN)' },
      { type: 'fix', text: 'API: Thêm outer try-catch cho agentKnowledge POST /re-sync/:id' },
      { type: 'model', text: 'Ant Design theme config nâng cấp: component-level tokens cho Card, Menu, Button, Table' },
    ],

    // v2.2
    v22title: 'v2.2.0 — Kiểm tra logic & Hoàn thiện giao diện',
    v22date: '26/03/2026',
    v22desc: 'Kiểm tra toàn bộ logic api-lark-all và cms-lark-sync, sửa lỗi, cập nhật giao diện sidebar.',
    v22changes: [
      { type: 'fix', text: 'Thêm icon cho menu Automation API (ThunderboltOutlined)' },
      { type: 'fix', text: 'Thêm icon cho menu Jobs đang chạy (ClockCircleOutlined)' },
      { type: 'fix', text: 'Thêm icon cho menu Lịch sử đồng bộ (HistoryOutlined)' },
      { type: 'fix', text: 'Thêm import ClockCircleOutlined, HistoryOutlined, ThunderboltOutlined vào layout' },
      { type: 'doc', text: 'Tạo trang Nhật ký cập nhật (/docs/changelog) — trang này' },
      { type: 'doc', text: 'Cập nhật i18n cho tất cả menu mới (VI + EN)' },
      { type: 'check', text: 'Kiểm tra logic toàn bộ api-lark-all — tất cả route, model, service — không có lỗi' },
      { type: 'check', text: 'Kiểm tra logic toàn bộ cms-lark-sync — layout, menu, translations — đã sửa lỗi icon' },
    ],

    // v2.1
    v21title: 'v2.1.0 — Multi-Channel AI Agent & Training Improvements',
    v21date: '25/03/2026',
    v21desc: 'Nâng cấp lớn: hỗ trợ đa nền tảng, cải thiện logic training, conversation memory.',
    v21changes: [
      { type: 'new', text: 'BotSession model — conversation memory cho bot (tối đa 20 tin nhắn, TTL 2 giờ)' },
      { type: 'new', text: 'Channel Adapter — abstraction layer cho Lark, Telegram, Slack, Zalo (mở rộng)' },
      { type: 'new', text: 'Multi-channel webhook: POST /api/ai-agents/channel/:channel/webhook/:token' },
      { type: 'new', text: 'Bot commands: !qa, !reset, !feedback, !status, !help (hoạt động trên mọi nền tảng)' },
      { type: 'new', text: 'Bulk training API: POST /api/ai-agents/:id/train-bulk' },
      { type: 'new', text: 'Session list endpoint: GET /api/ai-agents/:id/sessions' },
      { type: 'new', text: 'Feedback list endpoint: GET /api/ai-agents/:id/feedback' },
      { type: 'fix', text: 'buildContext sử dụng scoreQA cho Q&A items (trước đó dùng scoreRelevance — kém chính xác)' },
      { type: 'fix', text: 'Event deduplication — ngăn xử lý trùng lặp Lark webhook events' },
      { type: 'fix', text: 'Agent delete cleanup — xoá knowledge/Q&A/session mồ côi khi xoá agent' },
      { type: 'fix', text: 'Token usage tracking — cập nhật AIConfig.totalInputTokens/totalOutputTokens mỗi lần gọi LLM' },
      { type: 'fix', text: 'Lark token caching — sử dụng LarkAccount cached token thay vì fetch mới mỗi tin nhắn' },
      { type: 'model', text: 'AIAgent model: thêm field channels cho cấu hình đa nền tảng' },
    ],

    // v2.0
    v20title: 'v2.0.0 — Sidebar "Document" Group & Documentation',
    v20date: '25/03/2026',
    v20desc: 'Tách nhóm Document ra khỏi Sync, tạo tài liệu bảo trì toàn diện.',
    v20changes: [
      { type: 'new', text: 'Nhóm menu "Tài liệu" (Document) mới trong sidebar — tách khỏi "Sync Integration"' },
      { type: 'new', text: 'Trang /docs/agent-guide — Hướng dẫn bảo trì AI Agent (architecture, training, API, LLM/NLP)' },
      { type: 'new', text: 'Trang /docs/platform-guide — Hướng dẫn phát triển đa nền tảng (Lark/Telegram/Slack/Zalo/WhatsApp/LINE)' },
      { type: 'new', text: 'docs/MAINTENANCE_GUIDE.md — Tài liệu bảo trì markdown chi tiết (12 phần)' },
      { type: 'doc', text: 'Cập nhật i18n — thêm keys: docs, docsAgent, docsGuide' },
      { type: 'doc', text: 'getOpenKeys() cập nhật: /docs → mở nhóm docs (trước đó mở nhóm sync)' },
    ],

    // Roadmap
    roadmapTitle: 'Lộ trình phát triển',
    roadmapPhases: [
      { phase: 'Phase 1 (Done)', items: ['Multi-channel adapter', 'Conversation memory', 'Event dedup', 'Bot commands', 'Token tracking', 'AI Credit management', 'Google/Mistral support', 'Streaming timeout'], status: 'done' },
      { phase: 'Phase 2 (Next)', items: ['Vector embeddings + semantic search', 'Hybrid retrieval (keyword + semantic)', 'Auto re-index knowledge (cron)', 'Chunk-level indexing'], status: 'next' },
      { phase: 'Phase 3', items: ['Function calling / tool use', 'Built-in tools: search_bitable, create_record', 'Custom tool definitions per agent', 'Approval workflows'], status: 'planned' },
      { phase: 'Phase 4', items: ['Multi-agent orchestration', 'RBAC (role-based access)', 'Analytics dashboard', 'A/B testing', 'Audit logging'], status: 'planned' },
      { phase: 'Phase 5', items: ['WhatsApp Business API', 'LINE Messaging API', 'Facebook Messenger', 'Email channel', 'Voice channel', 'Embeddable web widget'], status: 'planned' },
    ],

    typeLabels: { new: 'Mới', fix: 'Sửa', doc: 'Docs', model: 'Model', check: 'Kiểm tra', improve: 'Cải thiện' },
  },
  en: {
    title: 'Changelog',
    subtitle: 'Change history, new features, and development roadmap',
    latest: 'Latest version',

    // v2.7.8
    v278title: 'v2.7.8 — 10 Logistics Agents + Docs Pages + Deep Implement',
    v278date: '2026-04-19',
    v278desc: 'Added 10 logistics-specific agents (tracking, container, customs, warehouse, 1688/Taobao crawlers, supplier mgmt, quote builder, price monitor, documents). Created Docs pages in Admin Dashboard. Standardized shared_learning.py across all agents. Deep-implemented 10 skeleton agents with real business logic.',
    v278changes: [
      { type: 'new', text: '10 new logistics agents: logistics-tracker (end-to-end China→Vietnam), container (lifecycle mgmt), customs (HS code + duty calc), warehouse (inbound/outbound), 1688-crawler, taobao-crawler, supplier (Chinese supplier DB), quote-builder (professional quotes), price-monitor (price alerts), document (import docs mgmt).' },
      { type: 'new', text: 'cms-agents-admin: /docs pages — index grid + /docs/agents/[name] with 3 tabs (Configuration, Testing, Roadmap) for all 39 agents.' },
      { type: 'new', text: 'cms-agents-admin: sidebar reorganized into submenu groups (Core Agents, Logistics, Business) instead of flat 20+ item menu.' },
      { type: 'new', text: 'shared_learning.py v2: portable module (db as param), domain-based learning, trust score update (+0.1/-0.15), get_domain_examples, get_learning_metrics.' },
      { type: 'new', text: 'Deep-implemented 10 skeleton agents: inventory (!stock), finance (!finance), CRM (!crm), reminder (!remind), translator (!translate), approval (!approve), HR (!hr), scheduler (!book), onboarding (!onboard), shipping (!track).' },
      { type: 'improve', text: 'Tier B agents (10): extracted inline 50-line smart_ai() into standardized shared_learning.py imports.' },
      { type: 'new', text: 'Registered 10 logistics agents: agents.ts (39 entries), layout.tsx (submenu), config.py (39 AGENTS), db.py (39 SEED_EXTRA).' },
    ],

    // v2.7.7
    v277title: 'v2.7.7 — Free Chatbot Guide & Agents v2 Roadmap',
    v277date: '2026-04-12',
    v277desc: 'Comprehensive guide for building free chatbots with Ollama (self-hosted) and NVIDIA NIM (free tier). Deploy to Telegram + Lark. Includes Agents v2 roadmap with multiple new agent types.',
    v277changes: [
      { type: 'doc', text: 'cms-lark-sync/docs/free-chatbot-guide.md — 11-section guide: architecture, Ollama/NVIDIA NIM setup, Telegram/Lark bot creation, AIConfig configuration, knowledge training, deploy, custom commands, troubleshooting.' },
      { type: 'doc', text: 'Agents v2 Roadmap: 6 new agent types (Chat, Task, Workflow, RAG, Code, Multi-Agent), new UI at /agents routes, v2 API endpoints, and planned features (templates, flow builder, analytics, A/B testing, human handoff, web embed).' },
      { type: 'doc', text: 'Free model comparison table: Ollama (llama3.1:8b, qwen2.5:7b, llama3.3:70b) vs NVIDIA NIM (llama-3.3-70b, deepseek-r1, qwen2.5-72b) with RAM/VRAM requirements and quality ratings.' },
    ],

    // v2.7.6
    v276title: 'v2.7.6 — CI/CD pipeline hardening & stable deploy',
    v276date: '2026-04-11',
    v276desc: 'Rewrote the GitLab CI/CD pipeline for stable deploys: secrets via CI variables as the source of truth, post-deploy health check, auto rollback on failure, and a public URL smoke test. Also fixed the import-time throw in openai.service.js.',
    v276changes: [
      { type: 'fix', text: 'services/openai.service.js — lazy-init the OpenAI client through getClient() instead of throwing Error("Missing OPENAI_API_KEY") at top-level import. That bug had taken the entire API into a crash loop whenever the env var was missing.' },
      { type: 'fix', text: '/health endpoint (server.js) — now returns HTTP 503 when mongoose.connection.readyState !== 1. Previously it always returned 200 with a degraded body, so curl -f / Docker HEALTHCHECK / CI smoke tests silently passed even when the DB was down.' },
      { type: 'new', text: '.gitlab-ci.yml deploy:api + deploy:cms — full rewrite with 3 steps: (1) regenerate ~/env/*.env from GitLab CI variables via an ssh heredoc with positional args (avoids leaking values into the command line), (2) tag apihoanam:previous then docker load :latest and restart, (3) curl localhost:6000/health for up to 45s.' },
      { type: 'new', text: 'Auto rollback: if the health check times out, the deploy script re-tags apihoanam:previous → apihoanam:latest, restarts the container, and fails the pipeline job with exit 1. Production stays on the last-known-good version.' },
      { type: 'new', text: 'Public smoke test: the CI runner curls https://apihoanam.toolswave.net/health with 5 retries after the SSH deploy finishes, verifying the nginx layer as well as the container internals.' },
      { type: 'new', text: 'Automatic nginx upstream cache reload: the deploy script runs sudo -n nginx -s reload at the end (requires a one-time passwordless sudoers rule). Eliminates the "container is fine but nginx still serves 502" failure mode we hit today.' },
      { type: 'new', text: 'Dockerfile HEALTHCHECK directive: wget /health every 30s. docker ps now shows (healthy)/(unhealthy) in the Status column — immediate visibility when debugging, no need to grep logs.' },
      { type: 'new', text: 'Docs DEPLOY.md — new "Deploy chuẩn — GitLab CI/CD pipeline" section at the top, with a flow diagram, the 14 CI variables that must be set, server bootstrap commands (passwordless nginx sudo, ~/env dir), a debug playbook mapping symptoms to fixes, and chaos test instructions to verify rollback works.' },
      { type: 'improve', text: 'Source of truth for secrets moved from ~/env/apihoanam.env on the server (which was easily wiped — today we found it containing only 21 bytes instead of the full 11 keys) to GitLab CI/CD Variables. The server file is now just a cache overwritten on every deploy.' },
      { type: 'improve', text: 'SSH command injection hardening: env generation uses bash -s -- "$VAR1" "$VAR2" ... positional args rather than interpolating values directly into the heredoc, so values containing special characters cannot break the script.' },
    ],

    // v2.7.5
    v275title: 'v2.7.5 — Multi-bot Management + Logical Modules Split',
    v275date: '2026-04-11',
    v275desc: 'Added multi-bot management system (Lark/Telegram/Slack/Zalo) with DB-driven custom commands, live chat test, matrix view. Began splitting the AI system into modules/ under the "logical microservices" pattern.',
    v275changes: [
      { type: 'new', text: 'Bot + BotCommand models: each Bot is one instance (platform + own credentials) linked to one AIAgent. Multiple bots can share the same agent (e.g. prod + staging Telegram bots).' },
      { type: 'new', text: 'Unified webhook POST /api/bots/:botId/webhook — resolves bot → credentials → platform → agent, then calls the existing processChannelWebhook() pipeline. Works for all 4 platforms via channelAdapter.' },
      { type: 'new', text: 'DB-driven custom commands: BotCommand supports 4 trigger types (prefix/exact/contains/regex) + 4 response types (text template / llm-prompt override / reset session / no-op). Template variables {{text}}, {{senderName}}, {{chatId}}, {{botName}}.' },
      { type: 'new', text: 'Commands have 2 scopes: bot-scoped (single bot only) or agent-scoped (shared across all bots of that agent). Precedence: bot-scoped > agent-scoped > built-ins (!learn, !qa, !help, !reset, !feedback, !status).' },
      { type: 'new', text: '/bots dashboard page: list bots, filter by platform/status, stats (messages + errors), toggle active, copy webhook URL. Create/edit modal with platform-specific credential fields.' },
      { type: 'new', text: '/bots/[id] detail page: webhook URL alert with copy button, info + stats descriptions, commands table, live chat test drawer (dry-run mode: runs the dispatcher only, no LLM call, no real platform send).' },
      { type: 'new', text: '/bots/commands matrix page: 2D grid (rows=commands, cols=bots). Cell shows shared 👥 / bot-scoped ✓ / —. Click to move a command between bots. Inline toggle enabled.' },
      { type: 'new', text: 'Telegram webhook wiring: uses the existing TelegramAdapter in services/channelAdapter.js (parseEvent/sendMessage/sendTyping). Users simply copy the webhook URL from the bot detail page and paste it into @BotFather.' },
      { type: 'new', text: 'Simulate endpoint POST /api/bots/:id/simulate — test command dispatching without calling the LLM or sending to the real platform. Returns matched/source/reply/action for debugging command patterns.' },
      { type: 'new', text: 'modules/bots/ + modules/config-credits/ — started logical split of the AI backend: new structure for two modules (bots = all new code, config-credits = physical move of aiConfig + aiCredit routes). Each module exposes an index.js mount() helper. Remaining ai-chat/knowledge/lark modules will be migrated incrementally.' },
      { type: 'improve', text: 'handleBotCommand in aiAgent.route.js now calls dispatchCustomCommand() before checking built-ins, letting admins override defaults. processChannelWebhook() accepts optional { preloadedAgent, bot } to support bot-scoped credentials.' },
      { type: 'improve', text: 'Bot stats tracking: inc totalMessages/errorCount per webhook, stores lastError + lastErrorAt when the LLM or adapter fails. Dashboard displays stats in real time.' },
    ],

    // v2.7.4
    v274title: 'v2.7.4 — Free AI Agents with NVIDIA NIM + Ollama',
    v274date: '2026-04-10',
    v274desc: 'Added 2 free AI providers: NVIDIA NIM (cloud free tier) and Ollama (self-hosted). Consolidated 7 duplicated PROVIDER_BASE_URLS maps into 1 shared util.',
    v274changes: [
      { type: 'new', text: 'New provider nvidia (NVIDIA NIM free tier): Llama 3.3 70B, DeepSeek R1, Qwen 2.5 72B, Nemotron 70B. Default base URL https://integrate.api.nvidia.com/v1.' },
      { type: 'new', text: 'New provider ollama (self-hosted, unlimited free): Llama 3.3/3.1, Qwen 2.5, Mixtral, DeepSeek R1, Gemma 2, Phi 4, LLaVA vision. Default http://ollama:11434/v1.' },
      { type: 'new', text: 'Docker Compose: added ollama service to api-lark-all stack with persistent volume, localhost-only port 11434, ready for 64GB RAM production server.' },
      { type: 'new', text: 'Shared util utils/aiProviders.js — centralizes PROVIDER_BASE_URLS, ALLOWED_PROVIDER_HOSTS, buildOpenAIOptions(cfg) across 6 backend call sites. Handles Ollama empty-apiKey transparently.' },
      { type: 'new', text: 'CMS aiProvider.ts refactor: factored openaiChat/openaiChatStream into openaiCompatibleChat(Stream) shared between openai/nvidia/ollama (1 impl, 3 providers).' },
      { type: 'new', text: 'Settings → AI dropdown now includes nvidia (lime) + ollama (magenta) with icons and a base URL tooltip for docker/local dev.' },
      { type: 'new', text: 'Docs DEPLOY.md: added "Ollama setup on server" section with ollama pull commands for Llama 70B/Qwen 72B/LLaVA and notes on CPU-only vs GPU.' },
      { type: 'improve', text: 'JSON mode safety: added ollama to the exception list alongside google (many local Ollama models reject strict response_format json_object).' },
      { type: 'improve', text: 'AIConfig enum: extended from 6 to 8 providers (openai, anthropic, google, groq, mistral, nvidia, ollama, custom).' },
    ],

    // v2.7.3
    v273title: 'v2.7.3 — Deep Audit Base Designer & Agent + CI/CD',
    v273date: '2026-03-28',
    v273desc: 'Deep logic audit of Base Designer and AI Agent. Fixed token tracking, Q&A prompt, agent delete cleanup. Added CI/CD pipeline and docs.',
    v273changes: [
      { type: 'new', text: 'CI/CD Pipeline: added .gitlab-ci.yml for both api-lark-all and cms-lark-sync (3 stages: Test → Build → Deploy manual).' },
      { type: 'new', text: 'CI/CD docs page (/docs/cicd) — detailed GitLab CI/CD setup guide with SSH keys, variables, manual deploy (bilingual VI/EN).' },
      { type: 'fix', text: 'AI Agent: Q&A hint prompt changed from "BẮT BUỘC" (forced) to "ƯU TIÊN CAO" (high priority), placed at end of system prompt for recency bias.' },
      { type: 'fix', text: 'AI Agent: Anthropic streaming token tracking — waits for message_delta event for output tokens instead of tracking mid-stream.' },
      { type: 'fix', text: 'AI Agent: improved agent delete — cleans up conversations, groups, bot sessions, and unshared manual knowledge items.' },
      { type: 'fix', text: 'Base Designer compose: fixed empty error message on stream fail (throw new Error("") → includes HTTP status).' },
      { type: 'fix', text: 'Knowledge: added truncated flag to metadata when content exceeds 150K chars (was silently truncated).' },
      { type: 'doc', text: 'Menu: added CI/CD Pipeline link to Docs sidebar.' },
      { type: 'doc', text: 'i18n: added docsCICD label (VI/EN).' },
    ],

    // v2.7.2
    v272title: 'v2.7.2 — Full Audit & Security Hardening',
    v272date: '2026-03-28',
    v272desc: 'Full CMS + API audit: token tracking for Base Designer, endpoint security, remaining hardcoded colors cleanup.',
    v272changes: [
      { type: 'new', text: 'Token tracking for all 11 AI Designer endpoints (compose, design, docs, enhance, extract, improve, sample-data, schema-docs, understand) — records tokens and deducts credit.' },
      { type: 'new', text: 'Credit pre-check for AI Agent /chat endpoint and all AI Designer routes — blocks when blockOnZero and zero balance.' },
      { type: 'fix', text: 'Security: /ai-configs/:id/resolve endpoint restricted to localhost/internal origin only (blocks external access).' },
      { type: 'fix', text: 'Share page (/share/[token]) — replaced 20+ hardcoded colors with CSS variables, full dark mode support.' },
      { type: 'check', text: 'CMS audit: 42 pages, 29 components, 8 stores — TypeScript passes with 0 errors, no critical bugs.' },
      { type: 'check', text: 'API audit: 20 route files, 18 models, 13 services — all syntax valid, consistent response envelopes.' },
    ],

    // v2.7.1
    v271title: 'v2.7.1 — Layout Merge & Hardcoded Colors Cleanup',
    v271date: '2026-03-27',
    v271desc: 'Merged Agent sidebar into main layout, removed 70+ hardcoded hex colors, replaced hover effects with CSS classes, added .claude pro structure.',
    v271changes: [
      { type: 'new', text: 'Merged Agent sidebar into main layout — eliminated layout-within-layout, Agent page uses URL query params (?tab=agents|knowledge|training|test|deploy).' },
      { type: 'new', text: 'AI Agent menu expanded to 5 sub-items in main sidebar (Manage, Knowledge, Training, Chat, Deploy).' },
      { type: 'new', text: '.claude pro structure — CLAUDE.md, 8 rules, 3 commands, 3 agents, 3 skills for AI-assisted development.' },
      { type: 'fix', text: 'Removed 70+ hardcoded hex colors — all replaced with CSS variables from globals.css (full dark mode support).' },
      { type: 'fix', text: 'Removed all 15 inline onMouseEnter/onMouseLeave — replaced with 5 CSS :hover classes in ChatPanel.' },
      { type: 'fix', text: 'Layout.tsx: replaced #141414/#DD3333 with var(--bg-color)/var(--primary-color).' },
      { type: 'fix', text: 'ChatPanel full height — removed border-radius/shadow, sidebar uses var(--bg-color), ConvRow uses left accent border.' },
      { type: 'doc', text: 'i18n: added 5 new menu labels for Agent sub-tabs (agentList, agentKnowledge, agentTraining, agentChat, agentDeploy).' },
    ],

    // v2.7.0
    v270title: 'v2.7.0 — Prompt Builder, Credits & Chat Improvements',
    v270date: '2026-03-27',
    v270desc: 'Improved AI chat logic, professional credits dashboard, suggestion chips, bitable sync schedule fix.',
    v270changes: [
      { type: 'new', text: 'AI Usage Dashboard (/settings/credits) — cost stats, tokens, SVG monthly chart (6mo), date/type filters, provider API data (OpenAI/Anthropic).' },
      { type: 'new', text: 'API: GET /ai-credits/monthly — monthly cost/deposit aggregation. GET /ai-configs/:id/provider-usage — fetch from OpenAI/Anthropic API.' },
      { type: 'new', text: 'Tour Guide for AI Usage Dashboard — 7-step guided tour (bilingual VI/EN).' },
      { type: 'new', text: 'Chat suggestions — starter chips on new conversation + AI-analyzed follow-up suggestions after response.' },
      { type: 'new', text: 'Bitable Sync: ignoreSchedule toggle — allows jobs to run 24/7 bypassing schedule (useful for dev/test).' },
      { type: 'fix', text: 'Credit pre-check before LLM calls — returns HTTP 402 INSUFFICIENT_CREDIT when blockOnZero and zero balance.' },
      { type: 'fix', text: 'Frontend checks res.ok before reading stream — shows clear error message instead of raw error body.' },
      { type: 'fix', text: 'Conversation history increased 12 → 20 turns, strips imageData from older messages to save tokens.' },
      { type: 'fix', text: 'Knowledge items filtered by syncStatus — only "ok" items included in RAG context.' },
      { type: 'fix', text: 'System prompt reordered: base prompt → context → Q&A hints (leverages LLM recency bias).' },
      { type: 'fix', text: 'Bitable Sync Vietnamese labels — fixed diacritics on schedule form labels.' },
      { type: 'model', text: 'BitableSync model: added ignoreSchedule boolean field.' },
    ],

    // v2.6
    v26title: 'v2.6.0 — Production Stability & AI Credit Management',
    v26date: '2026-03-27',
    v26desc: 'Production stability: full token tracking, Google/Mistral support, streaming timeout, AI Credit management page.',
    v26changes: [
      { type: 'new', text: 'AI Credit management page (/settings/credits) — view balance, deposit funds, transaction history, toggle blockOnZero per AI Config.' },
      { type: 'new', text: 'API: PATCH /api/ai-credits/:configId/settings — configure blockOnZero and alertThreshold.' },
      { type: 'new', text: 'Settings > AI: Credit column shows balance + inline blockOnZero toggle, Deposit button per row.' },
      { type: 'fix', text: 'Token tracking in chatConversation.route.js streaming — both Anthropic (message_start/message_delta) and OpenAI (stream_options.include_usage). Previously tokens were never recorded.' },
      { type: 'fix', text: 'Google Gemini: added default base URL https://generativelanguage.googleapis.com/v1beta/openai for OpenAI SDK (all 4 routes).' },
      { type: 'fix', text: 'Mistral: added default base URL https://api.mistral.ai/v1 (all 4 routes).' },
      { type: 'fix', text: 'Streaming timeout 60s (AbortController) in chatConversation.route.js and aiAgent /:id/chat — no more hanging when LLM is unresponsive.' },
      { type: 'fix', text: 'Credit pre-check in webhook: blocks LLM call when blockOnZero=true and balance ≤ 0, sends Vietnamese notification to user.' },
      { type: 'fix', text: 'Image Analyzer (/demo/image-analyzer): now uses /api/demo/vision proxy — API key no longer exposed to browser.' },
      { type: 'fix', text: 'OpenAI streaming in aiAgent /:id/chat: added stream_options.include_usage and trackTokenUsage — tokens now fully recorded.' },
    ],

    // v2.5
    v25title: 'v2.5.0 — Demo Products & Documentation',
    v25date: '2026-03-27',
    v25desc: 'Added 4 new demo products, created "Demo Products" sidebar group, detailed demo documentation.',
    v25changes: [
      { type: 'new', text: 'AI Text Tools (/demo/ai-tools) — Summarize, Translate (6 languages), Rewrite (5 tones), Grammar Check. Real-time streaming.' },
      { type: 'new', text: 'Image Analyzer (/demo/image-analyzer) — Upload image + 4 modes: Describe, OCR, Extract Data, Identify Objects. Anthropic Vision + OpenAI GPT-4V.' },
      { type: 'new', text: 'Knowledge Q&A (/demo/knowledge-qa) — RAG demo: select AI Agent, Q&A with streaming, sidebar shows KB docs + suggested questions.' },
      { type: 'new', text: 'Webhook Tester (/demo/webhook-tester) — HTTP request builder with Lark/Telegram/Generic presets, headers/body editor, response viewer, 20-request history.' },
      { type: 'new', text: '"Demo Products" sidebar group — combined Chat Bot + 4 new demos into one group.' },
      { type: 'new', text: 'Demo Guide page (/docs/demo-guide) — detailed documentation for each demo product.' },
      { type: 'doc', text: 'Tour steps for 4 new demo pages (16 steps, bilingual VI+EN).' },
      { type: 'doc', text: 'i18n: added 5 new menu keys (demo, demoAiTools, demoImageAnalyzer, demoKnowledgeQA, demoWebhookTester).' },
      { type: 'fix', text: 'OAuth redirect: added /lark/oauth and /share/ to noLayoutPaths — prevents sidebar render during callback.' },
      { type: 'fix', text: 'Fixed 6 pages using fragment <> → <div> wrapper — prevents hydration errors.' },
      { type: 'fix', text: 'TypeScript: fixed 7 errors (BitableSyncJob.schedule type, TourGuide placement, target cast).' },
      { type: 'fix', text: 'Schedule defaults: 6AM-8PM, Mon-Sat (was 0-24h, all days). Added migrate-schedule API.' },
    ],

    // v2.4
    v24title: 'v2.4.0 — Tour Guide, Schedule Config, UI Polish',
    v24date: '2026-03-27',
    v24desc: 'Detailed Tour Guide for 16 pages, auto-schedule for Bitable Sync, dark mode fixes, spacing standardization.',
    v24changes: [
      { type: 'new', text: 'Detailed Tour Guide: 5-11 steps per major page (80+ total steps across all pages)' },
      { type: 'new', text: 'Bitable Sync Schedule: configure active hours (e.g., 8AM-6PM) and days of week' },
      { type: 'new', text: 'API: GET /api/bitable-sync/:id/schedule-status — check if job is within active schedule' },
      { type: 'new', text: 'Executor: isWithinSchedule() with timezone support (Asia/Ho_Chi_Minh) and overnight ranges' },
      { type: 'fix', text: 'Dark mode: fixed base-designer (bg-orange-50, bg-blue-50, bg-green-50 → CSS vars)' },
      { type: 'fix', text: 'Dark mode: fixed dev/api METHOD_BG colors → CSS vars (success/info/warning/error-bg)' },
      { type: 'fix', text: 'Dark mode: fixed dev/features gradient and border colors → CSS vars' },
      { type: 'fix', text: 'Dark mode: fixed settings/ai bg-neutral-100 → var(--bg-secondary)' },
      { type: 'fix', text: 'UI Spacing: removed max-width and mx-auto constraints on 9 pages — full width content' },
      { type: 'fix', text: 'Base Designer moved to its own top-level menu group (no longer nested in Lark Integration)' },
      { type: 'fix', text: 'Docs layout: full width with space-y-3, removed duplicate mb-4' },
      { type: 'model', text: 'BitableSync model: added schedule { activeHoursStart, activeHoursEnd, activeDays, timezone }' },
    ],

    // v2.3
    v23title: 'v2.3.0 — UI/UX Enhancement & API Security',
    v23date: '2026-03-26',
    v23desc: 'Major upgrade: dark mode fix, animations, API security improvements, theme standardization.',
    v23changes: [
      { type: 'new', text: 'Comprehensive CSS variables: 50+ theme vars (colors, shadows, chat, code, notes, status)' },
      { type: 'new', text: 'Animations: page fade-in, stagger list items, skeleton shimmer, typing indicator, pulse dot' },
      { type: 'new', text: 'Card hover effects: elevation + shadow transition on all Ant Design Cards' },
      { type: 'new', text: 'Button press effect: scale(0.97) on click, brightness hover on primary buttons' },
      { type: 'new', text: 'Input focus glow: accent color ring on focus with smooth transition' },
      { type: 'new', text: 'Modal slide-in animation, Drawer smooth entrance' },
      { type: 'new', text: 'Utility classes: .theme-code, .theme-quote, .theme-note, .chat-bubble-*, .surface-elevated, .gradient-text' },
      { type: 'new', text: 'Print styles: hide sidebar when printing' },
      { type: 'new', text: 'Focus-visible accessibility: outline ring for keyboard navigation' },
      { type: 'fix', text: 'Fixed 80+ hardcoded hex colors in Agent Page — dark mode now works perfectly' },
      { type: 'fix', text: 'Fixed 50+ hardcoded hex colors in ChatPanel — all use CSS variables' },
      { type: 'fix', text: 'Fixed avatar color in Settings/Users — uses var(--avatar-bg)' },
      { type: 'fix', text: 'API: Password hashing migrated from SHA256 to bcrypt (10 rounds) + auto-migrate legacy' },
      { type: 'fix', text: 'API: Escaped RegExp user input in system users search (prevents ReDoS)' },
      { type: 'fix', text: 'API: parseInt validation in jobs.js and bitableSync.route.js (prevents NaN)' },
      { type: 'fix', text: 'API: Added outer try-catch for agentKnowledge POST /re-sync/:id' },
      { type: 'model', text: 'Ant Design theme config upgraded: component-level tokens for Card, Menu, Button, Table' },
    ],

    // v2.2
    v22title: 'v2.2.0 — Logic Audit & UI Polish',
    v22date: '2026-03-26',
    v22desc: 'Full audit of api-lark-all and cms-lark-sync logic, bug fixes, sidebar UI improvements.',
    v22changes: [
      { type: 'fix', text: 'Added icon for Automation API menu item (ThunderboltOutlined)' },
      { type: 'fix', text: 'Added icon for Running Jobs menu item (ClockCircleOutlined)' },
      { type: 'fix', text: 'Added icon for Sync History menu item (HistoryOutlined)' },
      { type: 'fix', text: 'Added missing imports: ClockCircleOutlined, HistoryOutlined, ThunderboltOutlined' },
      { type: 'doc', text: 'Created Changelog page (/docs/changelog) — this page' },
      { type: 'doc', text: 'Updated i18n for all new menu items (VI + EN)' },
      { type: 'check', text: 'Audited all api-lark-all logic — all routes, models, services pass' },
      { type: 'check', text: 'Audited all cms-lark-sync logic — layout, menu, translations — fixed icon issues' },
    ],

    // v2.1
    v21title: 'v2.1.0 — Multi-Channel AI Agent & Training Improvements',
    v21date: '2026-03-25',
    v21desc: 'Major upgrade: multi-platform support, improved training logic, conversation memory.',
    v21changes: [
      { type: 'new', text: 'BotSession model — conversation memory for bots (max 20 messages, 2h TTL)' },
      { type: 'new', text: 'Channel Adapter — abstraction layer for Lark, Telegram, Slack, Zalo (extensible)' },
      { type: 'new', text: 'Multi-channel webhook: POST /api/ai-agents/channel/:channel/webhook/:token' },
      { type: 'new', text: 'Bot commands: !qa, !reset, !feedback, !status, !help (works on all channels)' },
      { type: 'new', text: 'Bulk training API: POST /api/ai-agents/:id/train-bulk' },
      { type: 'new', text: 'Session list endpoint: GET /api/ai-agents/:id/sessions' },
      { type: 'new', text: 'Feedback list endpoint: GET /api/ai-agents/:id/feedback' },
      { type: 'fix', text: 'buildContext now uses scoreQA for Q&A items (was using scoreRelevance — less accurate)' },
      { type: 'fix', text: 'Event deduplication — prevents processing duplicate Lark webhook events' },
      { type: 'fix', text: 'Agent delete cleanup — removes orphaned knowledge/Q&A/sessions when deleting agent' },
      { type: 'fix', text: 'Token usage tracking — updates AIConfig.totalInputTokens/totalOutputTokens per LLM call' },
      { type: 'fix', text: 'Lark token caching — uses LarkAccount cached token instead of fetching fresh each message' },
      { type: 'model', text: 'AIAgent model: added channels field for multi-platform configuration' },
    ],

    // v2.0
    v20title: 'v2.0.0 — Sidebar "Document" Group & Documentation',
    v20date: '2026-03-25',
    v20desc: 'Separated Document group from Sync, created comprehensive maintenance documentation.',
    v20changes: [
      { type: 'new', text: 'New "Document" menu group in sidebar — separated from "Sync Integration"' },
      { type: 'new', text: '/docs/agent-guide page — AI Agent maintenance guide (architecture, training, API, LLM/NLP)' },
      { type: 'new', text: '/docs/platform-guide page — Multi-platform development guide (Lark/Telegram/Slack/Zalo/WhatsApp/LINE)' },
      { type: 'new', text: 'docs/MAINTENANCE_GUIDE.md — Comprehensive markdown maintenance doc (12 sections)' },
      { type: 'doc', text: 'Updated i18n — added keys: docs, docsAgent, docsGuide' },
      { type: 'doc', text: 'getOpenKeys() updated: /docs → opens docs group (was opening sync group)' },
    ],

    // Roadmap
    roadmapTitle: 'Development Roadmap',
    roadmapPhases: [
      { phase: 'Phase 1 (Done)', items: ['Multi-channel adapter', 'Conversation memory', 'Event dedup', 'Bot commands', 'Token tracking', 'AI Credit management', 'Google/Mistral support', 'Streaming timeout'], status: 'done' },
      { phase: 'Phase 2 (Next)', items: ['Vector embeddings + semantic search', 'Hybrid retrieval (keyword + semantic)', 'Auto re-index knowledge (cron)', 'Chunk-level indexing'], status: 'next' },
      { phase: 'Phase 3', items: ['Function calling / tool use', 'Built-in tools: search_bitable, create_record', 'Custom tool definitions per agent', 'Approval workflows'], status: 'planned' },
      { phase: 'Phase 4', items: ['Multi-agent orchestration', 'RBAC (role-based access)', 'Analytics dashboard', 'A/B testing', 'Audit logging'], status: 'planned' },
      { phase: 'Phase 5', items: ['WhatsApp Business API', 'LINE Messaging API', 'Facebook Messenger', 'Email channel', 'Voice channel', 'Embeddable web widget'], status: 'planned' },
    ],

    typeLabels: { new: 'New', fix: 'Fix', doc: 'Docs', model: 'Model', check: 'Audit', improve: 'Improve' },
  },
}

type ChangeItem = { type: string; text: string }
type PhaseItem = { phase: string; items: string[]; status: string }

function typeColor(type: string) {
  switch (type) {
    case 'new':   return 'green'
    case 'fix':   return 'orange'
    case 'doc':   return 'blue'
    case 'model': return 'purple'
    case 'check': return 'cyan'
    default:      return 'default'
  }
}

function VersionCard({ title, date, desc, changes, typeLabels }: {
  title: string; date: string; desc: string; changes: ChangeItem[];
  typeLabels: Record<string, string>
}) {
  return (
    <Card className="">
      <div className="flex items-center justify-between mb-2">
        <Title level={4} className="!mb-0">{title}</Title>
        <Tag icon={<ClockCircleOutlined />}>{date}</Tag>
      </div>
      <Paragraph type="secondary">{desc}</Paragraph>
      <Divider className="!my-3" />
      <div className="space-y-2">
        {changes.map((c, i) => (
          <div key={i} className="flex items-start gap-2">
            <Tag color={typeColor(c.type)} className="flex-shrink-0 !mt-0.5">
              {typeLabels[c.type] || c.type}
            </Tag>
            <span className="text-sm">{c.text}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}

export default function DocsChangelogPage() {
  const { lang } = useLang()
  const c = i[lang] || i.vi

  return (
    <div className="space-y-3">
      <Title level={3}>
        <RocketOutlined className="mr-2" />
        {c.title}
      </Title>
      <Paragraph type="secondary">{c.subtitle}</Paragraph>

      <Divider />

      {/* v2.7.8 */}
      <Badge.Ribbon text={c.latest} color="red">
        <VersionCard
          title={c.v278title} date={c.v278date}
          desc={c.v278desc} changes={c.v278changes}
          typeLabels={c.typeLabels}
        />
      </Badge.Ribbon>

      {/* v2.7.7 */}
      <VersionCard
        title={c.v277title} date={c.v277date}
        desc={c.v277desc} changes={c.v277changes}
        typeLabels={c.typeLabels}
      />

      {/* v2.7.6 */}
      <VersionCard
        title={c.v276title} date={c.v276date}
        desc={c.v276desc} changes={c.v276changes}
        typeLabels={c.typeLabels}
      />

      {/* v2.7.5 */}
      <VersionCard
        title={c.v275title} date={c.v275date}
        desc={c.v275desc} changes={c.v275changes}
        typeLabels={c.typeLabels}
      />

      {/* v2.7.4 */}
      <VersionCard
        title={c.v274title} date={c.v274date}
        desc={c.v274desc} changes={c.v274changes}
        typeLabels={c.typeLabels}
      />

      {/* v2.7.3 */}
      <VersionCard
        title={c.v273title} date={c.v273date}
        desc={c.v273desc} changes={c.v273changes}
        typeLabels={c.typeLabels}
      />

      {/* v2.7.2 */}
      <VersionCard
        title={c.v272title} date={c.v272date}
        desc={c.v272desc} changes={c.v272changes}
        typeLabels={c.typeLabels}
      />

      {/* v2.7.1 */}
      <VersionCard
        title={c.v271title} date={c.v271date}
        desc={c.v271desc} changes={c.v271changes}
        typeLabels={c.typeLabels}
      />

      {/* v2.7.0 */}
      <VersionCard
        title={c.v270title} date={c.v270date}
        desc={c.v270desc} changes={c.v270changes}
        typeLabels={c.typeLabels}
      />

      {/* v2.6 */}
      <VersionCard
        title={c.v26title} date={c.v26date}
        desc={c.v26desc} changes={c.v26changes}
        typeLabels={c.typeLabels}
      />

      {/* v2.5 */}
      <VersionCard
        title={c.v25title} date={c.v25date}
        desc={c.v25desc} changes={c.v25changes}
        typeLabels={c.typeLabels}
      />

      {/* v2.4 */}
      <VersionCard
        title={c.v24title} date={c.v24date}
        desc={c.v24desc} changes={c.v24changes}
        typeLabels={c.typeLabels}
      />

      {/* v2.3 */}
      <VersionCard
        title={c.v23title} date={c.v23date}
        desc={c.v23desc} changes={c.v23changes}
        typeLabels={c.typeLabels}
      />

      {/* v2.2 */}
      <VersionCard
        title={c.v22title} date={c.v22date}
        desc={c.v22desc} changes={c.v22changes}
        typeLabels={c.typeLabels}
      />

      {/* v2.1 */}
      <VersionCard
        title={c.v21title} date={c.v21date}
        desc={c.v21desc} changes={c.v21changes}
        typeLabels={c.typeLabels}
      />

      {/* v2.0 */}
      <VersionCard
        title={c.v20title} date={c.v20date}
        desc={c.v20desc} changes={c.v20changes}
        typeLabels={c.typeLabels}
      />

      {/* Roadmap */}
      <Card className="">
        <Title level={4}>
          <BranchesOutlined className="mr-2" />
          {c.roadmapTitle}
        </Title>
        <Divider className="!my-3" />
        <Timeline
          items={c.roadmapPhases.map((p: PhaseItem) => ({
            color: p.status === 'done' ? 'green' : p.status === 'next' ? 'blue' : 'gray',
            dot: p.status === 'done'
              ? <CheckCircleOutlined className="text-green-500" />
              : p.status === 'next'
                ? <ThunderboltOutlined className="text-blue-500" />
                : <ClockCircleOutlined className="text-gray-400" />,
            children: (
              <div>
                <Text strong>{p.phase}</Text>
                <ul className="mt-1 mb-3 list-disc ml-5">
                  {p.items.map((item: string, i: number) => (
                    <li key={i} className="text-sm">{item}</li>
                  ))}
                </ul>
              </div>
            ),
          }))}
        />
      </Card>
      <TourGuide pageKey="docs-changelog" steps={tourSteps['docs-changelog']} />
    </div>
  )
}
