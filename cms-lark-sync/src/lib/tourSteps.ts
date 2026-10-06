export interface TourStep {
  title: { vi: string; en: string }
  description: { vi: string; en: string }
  target?: string
  placement?: 'left' | 'right' | 'top' | 'bottom' | 'center' | 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight'
  /** Action before showing this step (e.g., click a button to open modal) */
  beforeStep?: () => (() => void) | void
  stepDelay?: number
}

// ── Helper: programmatically click a button to open modal/drawer ────────────
function clickSelector(selector: string): (() => void) | void {
  const el = document.querySelector(selector) as HTMLElement
  if (el) el.click()
  // Return cleanup: close any opened modal/drawer
  return () => {
    // Close by pressing Escape or clicking the mask
    const closeBtn = document.querySelector('.ant-modal-close, .ant-drawer-close') as HTMLElement
    if (closeBtn) closeBtn.click()
  }
}

// ── Tour Steps per Page ─────────────────────────────────────────────────────

export const tourSteps: Record<string, TourStep[]> = {

  // ═══════════════════════════════════════════════════════════════════════════
  // LARK ACCOUNTS
  // ═══════════════════════════════════════════════════════════════════════════
  'lark-accounts': [
    {
      title: { vi: 'Quản lý Tài khoản Lark', en: 'Lark Account Management' },
      description: {
        vi: 'Đây là trang quản lý các ứng dụng Lark đã đăng ký. Mỗi tài khoản chứa App ID và App Secret để kết nối API.',
        en: 'This page manages your registered Lark applications. Each account stores App ID and App Secret for API connections.',
      },
    },
    {
      title: { vi: 'Nút thêm tài khoản', en: 'Add Account Button' },
      description: {
        vi: 'Nhấn nút này để mở form tạo tài khoản Lark mới. Bạn cần App ID và App Secret từ Lark Developer Console.',
        en: 'Click this button to open the form for creating a new Lark account. You need the App ID and App Secret from Lark Developer Console.',
      },
      target: '.ant-btn-primary',
    },
    {
      title: { vi: 'Bảng tài khoản', en: 'Accounts Table' },
      description: {
        vi: 'Danh sách tất cả tài khoản Lark. Mỗi hàng hiển thị: tên, App ID, domain (larksuite/feishu), trạng thái, token. Nhấn vào các nút bên phải để thao tác.',
        en: 'List of all Lark accounts. Each row shows: name, App ID, domain (larksuite/feishu), status, token. Click action buttons on the right to manage.',
      },
      target: '.ant-table',
    },
    {
      title: { vi: 'Thao tác với tài khoản', en: 'Account Actions' },
      description: {
        vi: 'Mỗi tài khoản có các nút: Fetch Token (lấy token mới), Sửa, Đặt mặc định, Xoá. Token sẽ tự động được cache và refresh.',
        en: 'Each account has buttons: Fetch Token (get new token), Edit, Set Default, Delete. Tokens are automatically cached and refreshed.',
      },
      target: '.ant-table-row',
    },
    {
      title: { vi: 'Form tạo/sửa tài khoản', en: 'Create/Edit Account Form' },
      description: {
        vi: 'Khi mở form, điền: Tên hiển thị, App ID (cli_xxx), App Secret, Domain (larksuite.com hoặc feishu.cn), Loại app (Custom hoặc Marketplace).',
        en: 'When the form opens, fill in: Display Name, App ID (cli_xxx), App Secret, Domain (larksuite.com or feishu.cn), App Type (Custom or Marketplace).',
      },
      beforeStep: () => clickSelector('.ant-btn-primary'),
      target: '.ant-modal-content',
      stepDelay: 500,
    },
    {
      title: { vi: 'Lưu tài khoản', en: 'Save Account' },
      description: {
        vi: 'Sau khi điền đầy đủ thông tin, nhấn "OK" hoặc "Lưu" để tạo tài khoản. Hệ thống sẽ tự động fetch tenant token.',
        en: 'After filling in all fields, click "OK" or "Save" to create the account. The system will automatically fetch the tenant token.',
      },
      target: '.ant-modal-footer .ant-btn-primary',
    },
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // AI AGENT
  // ═══════════════════════════════════════════════════════════════════════════
  'ai-agent': [
    {
      title: { vi: 'Trang AI Agent', en: 'AI Agent Page' },
      description: {
        vi: 'Đây là trung tâm quản lý AI Agent. Bạn có thể tạo, cấu hình, huấn luyện và triển khai các bot AI cho Lark và các nền tảng khác.',
        en: 'This is the AI Agent management center. You can create, configure, train, and deploy AI bots for Lark and other platforms.',
      },
    },
    {
      title: { vi: 'Danh sách Agent', en: 'Agent List' },
      description: {
        vi: 'Sidebar bên trái hiển thị tất cả agent. Mỗi agent có tên, mô tả, số tài liệu KB. Nhấn vào agent để chọn và quản lý.',
        en: 'The left sidebar shows all agents. Each agent has a name, description, KB document count. Click an agent to select and manage it.',
      },
    },
    {
      title: { vi: 'Chat thử nghiệm', en: 'Test Chat' },
      description: {
        vi: 'Gửi tin nhắn để thử nghiệm agent. Agent trả lời dựa trên System Prompt + Knowledge Base (RAG). Nếu Q&A khớp score ≥ 12, AI trả lời chính xác mà không cần gọi LLM.',
        en: 'Send messages to test the agent. Responses use System Prompt + Knowledge Base (RAG). If Q&A match score ≥ 12, AI returns exact answer without calling LLM.',
      },
    },
    {
      title: { vi: 'Cấu hình Agent', en: 'Agent Configuration' },
      description: {
        vi: 'Cấu hình: Tên, Mô tả, System Prompt (vai trò + quy tắc), Provider (Anthropic/OpenAI/Groq), Model, Lark Account để kết nối bot.',
        en: 'Configure: Name, Description, System Prompt (role + rules), Provider (Anthropic/OpenAI/Groq), Model, Lark Account for bot connection.',
      },
    },
    {
      title: { vi: 'Knowledge Base', en: 'Knowledge Base' },
      description: {
        vi: 'Thêm tài liệu làm ngữ cảnh cho AI: từ Lark Doc, Wiki, Bitable, upload file (txt/md/csv/json), hoặc nhập thủ công. Tài liệu cần được gán cho agent qua knowledgeIds.',
        en: 'Add documents as AI context: from Lark Doc, Wiki, Bitable, file upload (txt/md/csv/json), or manual input. Documents must be linked to agent via knowledgeIds.',
      },
    },
    {
      title: { vi: 'Huấn luyện Q&A', en: 'Q&A Training' },
      description: {
        vi: 'Thêm cặp Câu hỏi → Trả lời. Khi người dùng hỏi câu tương tự (score ≥ 12), bot trả lời chính xác mà KHÔNG gọi AI. Đây là cách nhanh nhất để cải thiện chất lượng.',
        en: 'Add Question → Answer pairs. When users ask similar questions (score ≥ 12), the bot returns the exact answer WITHOUT calling AI. This is the fastest way to improve quality.',
      },
    },
    {
      title: { vi: 'Webhook Token', en: 'Webhook Token' },
      description: {
        vi: 'Mỗi agent có webhook token duy nhất. Copy URL webhook và dán vào Lark App > Event Subscriptions. URL: /api/ai-agents/webhook/{token}',
        en: 'Each agent has a unique webhook token. Copy the webhook URL and paste into Lark App > Event Subscriptions. URL: /api/ai-agents/webhook/{token}',
      },
    },
    {
      title: { vi: 'Lệnh Bot', en: 'Bot Commands' },
      description: {
        vi: 'Người dùng có thể gửi lệnh trong chat:\n• !help — Hiện hướng dẫn\n• !qa Câu hỏi | Trả lời — Thêm Q&A\n• !learn Tiêu đề | Nội dung — Thêm kiến thức\n• !reset — Xoá lịch sử\n• !feedback Nội dung — Gửi phản hồi',
        en: 'Users can send commands in chat:\n• !help — Show guide\n• !qa Question | Answer — Add Q&A\n• !learn Title | Content — Add knowledge\n• !reset — Clear history\n• !feedback Content — Send feedback',
      },
    },
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // BASE DESIGNER
  // ═══════════════════════════════════════════════════════════════════════════
  'base-designer': [
    {
      title: { vi: 'Thiết kế Lark Base', en: 'Lark Base Designer' },
      description: {
        vi: 'Công cụ thiết kế và chỉnh sửa cấu trúc Lark Bitable. Xem, sửa fields, types, options của bảng hiện có.',
        en: 'Tool for designing and editing Lark Bitable structure. View, edit fields, types, and options of existing tables.',
      },
    },
    {
      title: { vi: 'Chọn Base', en: 'Select Base' },
      description: {
        vi: 'Chọn từ danh sách bases bên trái, hoặc dán URL Lark Bitable vào ô tìm kiếm. Hệ thống sẽ tải toàn bộ tables và fields.',
        en: 'Select from the bases list on the left, or paste a Lark Bitable URL into the search box. The system loads all tables and fields.',
      },
    },
    {
      title: { vi: 'Danh sách Tables', en: 'Tables List' },
      description: {
        vi: 'Sau khi chọn base, tất cả tables hiện ra. Nhấn vào table để xem danh sách fields. Table đang active sẽ được highlight.',
        en: 'After selecting a base, all tables appear. Click a table to see its fields. The active table is highlighted.',
      },
    },
    {
      title: { vi: 'Chỉnh sửa Fields', en: 'Edit Fields' },
      description: {
        vi: 'Xem và chỉnh sửa fields: tên, type (Text/Number/Date/Select/...), options, mô tả. Fields bị thay đổi sẽ được đánh dấu vàng.',
        en: 'View and edit fields: name, type (Text/Number/Date/Select/...), options, description. Modified fields are highlighted in yellow.',
      },
    },
    {
      title: { vi: 'AI Panel', en: 'AI Panel' },
      description: {
        vi: 'Sử dụng AI để phân tích và gợi ý cải thiện schema. AI có thể thêm fields, tối ưu types, và tạo relations giữa các tables.',
        en: 'Use AI to analyze and suggest schema improvements. AI can add fields, optimize types, and create relations between tables.',
      },
    },
    {
      title: { vi: 'Lưu thay đổi (Ctrl+S)', en: 'Save Changes (Ctrl+S)' },
      description: {
        vi: 'Khi có thay đổi, thanh lưu xuất hiện trên cùng. Nhấn "Lưu" hoặc Ctrl+S để áp dụng schema lên Lark. Thao tác này non-destructive — chỉ thêm/sửa, không xoá.',
        en: 'When changes exist, a save bar appears at the top. Click "Save" or Ctrl+S to apply schema to Lark. This is non-destructive — only adds/modifies, never deletes.',
      },
    },
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // COMPOSE NEW
  // ═══════════════════════════════════════════════════════════════════════════
  'compose-new': [
    {
      title: { vi: 'Tạo Base mới với AI', en: 'Create New Base with AI' },
      description: {
        vi: 'Mô tả yêu cầu bằng ngôn ngữ tự nhiên, AI sẽ tạo cấu trúc Bitable hoàn chỉnh: tables, fields, relations, workflows, sample data.',
        en: 'Describe requirements in natural language, AI generates complete Bitable structure: tables, fields, relations, workflows, sample data.',
      },
    },
    {
      title: { vi: 'Nhập mô tả', en: 'Enter Description' },
      description: {
        vi: 'Mô tả chi tiết cấu trúc dữ liệu. VD: "Hệ thống quản lý nhân sự: bảng nhân viên (tên, phòng ban, chức vụ, lương), bảng phòng ban, bảng chấm công..."',
        en: 'Describe the data structure in detail. E.g., "HR management system: employee table (name, department, position, salary), department table, attendance table..."',
      },
    },
    {
      title: { vi: 'Chọn AI model', en: 'Select AI Model' },
      description: {
        vi: 'Chọn model AI phù hợp. Claude Sonnet 4.6 cho cân bằng chất lượng/tốc độ, Claude Opus cho kết quả tốt nhất, GPT-4o cho chi phí thấp.',
        en: 'Select the right AI model. Claude Sonnet 4.6 for quality/speed balance, Claude Opus for best results, GPT-4o for lower cost.',
      },
      target: '.ant-select',
    },
    {
      title: { vi: 'Tạo Schema', en: 'Generate Schema' },
      description: {
        vi: 'Nhấn "Tạo" để AI bắt đầu tạo schema. Kết quả hiển thị dạng streaming — bạn có thể xem từng phần xuất hiện dần.',
        en: 'Click "Generate" to start. Results display via streaming — you can see each section appear progressively.',
      },
      target: '.ant-btn-primary',
    },
    {
      title: { vi: 'Kết quả: Tables & Fields', en: 'Results: Tables & Fields' },
      description: {
        vi: 'Xem kết quả: danh sách tables, fields (tên, type, mô tả), relations, workflows. Có thể copy JSON schema hoặc push trực tiếp lên Lark.',
        en: 'View results: tables list, fields (name, type, description), relations, workflows. You can copy JSON schema or push directly to Lark.',
      },
    },
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // SYNC BITABLE
  // ═══════════════════════════════════════════════════════════════════════════
  'sync-bitable': [
    {
      title: { vi: 'Quản lý Bitable Sync', en: 'Bitable Sync Management' },
      description: {
        vi: 'Quản lý các job đồng bộ Lark Bitable. Hệ thống poll trực tiếp qua tenant_access_token, hỗ trợ 3 chế độ: Read Only, Mirror, và Connector.',
        en: 'Manage Lark Bitable sync jobs. The system polls directly via tenant_access_token, supporting 3 modes: Read Only, Mirror, and Connector.',
      },
    },
    {
      title: { vi: 'Nút Refresh & New Sync', en: 'Refresh & New Sync Buttons' },
      description: {
        vi: '"Refresh" tải lại danh sách job. "New Sync" mở form tạo job mới. Mỗi job có tên duy nhất và cấu hình riêng.',
        en: '"Refresh" reloads the job list. "New Sync" opens the create form. Each job has a unique name and its own configuration.',
      },
      target: '.ant-btn-primary',
    },
    {
      title: { vi: 'Tìm kiếm', en: 'Search' },
      description: {
        vi: 'Tìm job theo tên. Nhập từ khoá và Enter để lọc. Xoá ô tìm kiếm để hiện tất cả.',
        en: 'Search jobs by name. Enter keywords and press Enter to filter. Clear the search box to show all.',
      },
      target: '.ant-input-search',
    },
    {
      title: { vi: 'Bảng Sync Jobs', en: 'Sync Jobs Table' },
      description: {
        vi: '7 cột: Tên (kèm mode tag), Target (appToken/tableId), Interval, Trạng thái (enabled/running), Sync cuối, Số lần sync, Thao tác.',
        en: '7 columns: Name (with mode tag), Target (appToken/tableId), Interval, Status (enabled/running), Last Sync, Sync Count, Actions.',
      },
      target: '.ant-table',
    },
    {
      title: { vi: 'Nút thao tác', en: 'Action Buttons' },
      description: {
        vi: '6 nút mỗi hàng:\n⚡ Execute — chạy sync ngay\n🔌 Toggle — bật/tắt job\n👁 Snapshot — xem dữ liệu hiện tại\n📜 History — lịch sử sync\n✏️ Edit — chỉnh sửa cấu hình\n🗑 Delete — xoá job',
        en: '6 buttons per row:\n⚡ Execute — run sync now\n🔌 Toggle — enable/disable job\n👁 Snapshot — view current data\n📜 History — sync history\n✏️ Edit — edit configuration\n🗑 Delete — delete job',
      },
      target: '.ant-table-row',
    },
    {
      title: { vi: 'Form tạo/sửa Job', en: 'Create/Edit Job Form' },
      description: {
        vi: 'Mở form cấu hình sync job. Gồm các phần: Thông tin cơ bản, Tài khoản Lark, Chế độ sync, Nguồn/Đích, Lịch trình, Webhook, Thông báo.',
        en: 'Open the sync job configuration form. Sections: Basic Info, Lark Account, Sync Mode, Source/Destination, Schedule, Webhook, Notifications.',
      },
      beforeStep: () => clickSelector('.ant-btn-primary'),
      target: '.ant-drawer-content',
      stepDelay: 500,
    },
    {
      title: { vi: 'Chế độ Sync', en: 'Sync Mode' },
      description: {
        vi: '• Read Only: chỉ theo dõi thay đổi, không ghi\n• Mirror: đọc nguồn → ghi đích (two-way sync)\n• Connector: trigger Lark internal sync (cần cookies browser)',
        en: '• Read Only: monitor changes only, no writes\n• Mirror: read source → write destination (two-way sync)\n• Connector: trigger Lark internal sync (requires browser cookies)',
      },
      target: '.ant-drawer-content .ant-select',
    },
    {
      title: { vi: 'URL Resolver', en: 'URL Resolver' },
      description: {
        vi: 'Dán URL Lark Bitable vào đây và nhấn "Resolve". Hệ thống tự trích xuất appToken, tableId, viewId. Hỗ trợ cả URL wiki.',
        en: 'Paste Lark Bitable URL here and click "Resolve". The system automatically extracts appToken, tableId, viewId. Supports wiki URLs too.',
      },
      target: '.ant-drawer-content .ant-input-search',
    },
    {
      title: { vi: 'Lịch trình tự động', en: 'Auto Schedule' },
      description: {
        vi: 'Cấu hình giờ chạy (mặc định 6:00-20:00) và ngày trong tuần (mặc định Thứ 2-7). Ngoài khoảng thời gian này, job tạm dừng tự động.',
        en: 'Configure active hours (default 6:00 AM - 8:00 PM) and days of week (default Mon-Sat). Outside this schedule, the job pauses automatically.',
      },
      target: '.ant-drawer-content .ant-card',
    },
    {
      title: { vi: 'Thông báo', en: 'Notifications' },
      description: {
        vi: 'Bật thông báo khi có record mới, thay đổi, hoặc xoá. Chọn kênh: Telegram và/hoặc Lark. Cần cấu hình bot ở trang Notifications.',
        en: 'Enable notifications for new, updated, or deleted records. Select channels: Telegram and/or Lark. Bot must be configured on the Notifications page.',
      },
      target: '.ant-drawer-content .ant-switch',
    },
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // SYNC NOTIFICATIONS
  // ═══════════════════════════════════════════════════════════════════════════
  'sync-notify': [
    {
      title: { vi: 'Cấu hình Thông báo', en: 'Notification Configuration' },
      description: {
        vi: 'Thiết lập kênh thông báo cho hệ thống: Telegram Bot, Lark Custom Bot, Lark Webhook. Dùng để nhận thông báo khi có sự kiện đồng bộ.',
        en: 'Set up notification channels: Telegram Bot, Lark Custom Bot, Lark Webhook. Used to receive alerts when sync events occur.',
      },
    },
    {
      title: { vi: 'Telegram Bot', en: 'Telegram Bot' },
      description: {
        vi: 'Thêm Telegram Bot: cần Bot Token (từ @BotFather) và Chat ID (hoặc Group ID). Nhấn "Test" để gửi tin nhắn thử.',
        en: 'Add Telegram Bot: need Bot Token (from @BotFather) and Chat ID (or Group ID). Click "Test" to send a test message.',
      },
      target: '.ant-card',
    },
    {
      title: { vi: 'Lark Custom Bot', en: 'Lark Custom Bot' },
      description: {
        vi: 'Thêm Lark Custom Bot webhook URL. Tạo bot trong group chat Lark → copy webhook URL → dán vào đây.',
        en: 'Add Lark Custom Bot webhook URL. Create a bot in a Lark group chat → copy webhook URL → paste here.',
      },
    },
    {
      title: { vi: 'Lark Webhook (Bitable)', en: 'Lark Webhook (Bitable)' },
      description: {
        vi: 'Cấu hình Lark Bitable Automation webhook. Event sẽ được gửi đến endpoint webhook khi record thay đổi.',
        en: 'Configure Lark Bitable Automation webhooks. Events are sent to the webhook endpoint when records change.',
      },
    },
    {
      title: { vi: 'Lưu cấu hình', en: 'Save Configuration' },
      description: {
        vi: 'Nhấn "Lưu" để lưu tất cả cấu hình thông báo. Thay đổi có hiệu lực ngay lập tức.',
        en: 'Click "Save" to save all notification settings. Changes take effect immediately.',
      },
      target: '.ant-btn-primary',
    },
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // SETTINGS - AI KEYS
  // ═══════════════════════════════════════════════════════════════════════════
  'settings-ai': [
    {
      title: { vi: 'Quản lý AI API Keys', en: 'AI API Keys Management' },
      description: {
        vi: 'Cấu hình API keys cho các nhà cung cấp AI. Hỗ trợ: Anthropic (Claude), OpenAI (GPT), Google (Gemini), Groq, Mistral, và custom endpoint.',
        en: 'Configure API keys for AI providers. Supports: Anthropic (Claude), OpenAI (GPT), Google (Gemini), Groq, Mistral, and custom endpoints.',
      },
    },
    {
      title: { vi: 'Config mặc định', en: 'Default Config' },
      description: {
        vi: 'Card trên cùng hiển thị config đang được đặt làm mặc định. Config này sẽ được dùng cho tất cả AI Agent không có config riêng.',
        en: 'The top card shows the current default config. This config is used for all AI Agents that don\'t have their own specific config.',
      },
      target: '.ant-card',
    },
    {
      title: { vi: 'Thêm AI Config', en: 'Add AI Config' },
      description: {
        vi: 'Nhấn "Thêm" để tạo config mới. Chọn Provider, nhập API Key, chọn Model mặc định, cấu hình pricing để theo dõi chi phí.',
        en: 'Click "Add" to create a new config. Select Provider, enter API Key, choose default Model, configure pricing for cost tracking.',
      },
      target: '.ant-btn-primary',
    },
    {
      title: { vi: 'Form cấu hình AI', en: 'AI Config Form' },
      description: {
        vi: 'Điền: Provider (Anthropic/OpenAI/...), API Key (sẽ được mã hoá), Model (claude-sonnet/gpt-4o/...), và giá token (input/output per 1M).',
        en: 'Fill in: Provider (Anthropic/OpenAI/...), API Key (will be masked), Model (claude-sonnet/gpt-4o/...), and token pricing (input/output per 1M).',
      },
      beforeStep: () => clickSelector('.ant-btn-primary'),
      target: '.ant-modal-content',
      stepDelay: 500,
    },
    {
      title: { vi: 'Kiểm tra kết nối', en: 'Test Connection' },
      description: {
        vi: 'Nhấn "Test" trên mỗi config để kiểm tra API key có hoạt động. Hệ thống gọi API thử và xác nhận kết quả. Nếu lỗi, kiểm tra lại key hoặc quota.',
        en: 'Click "Test" on each config to verify the API key works. The system makes a test call and confirms. If error, check key or quota.',
      },
    },
    {
      title: { vi: 'Đặt mặc định / Xoá', en: 'Set Default / Delete' },
      description: {
        vi: 'Nhấn ⭐ để đặt config làm mặc định. Nhấn 🗑 để xoá. Chỉ có 1 config mặc định tại 1 thời điểm.',
        en: 'Click ⭐ to set as default. Click 🗑 to delete. Only one config can be default at a time.',
      },
    },
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // SETTINGS - USERS
  // ═══════════════════════════════════════════════════════════════════════════
  'settings-users': [
    {
      title: { vi: 'Quản lý Người dùng', en: 'User Management' },
      description: {
        vi: 'Quản lý tài khoản đăng nhập CMS. Thêm, sửa, xoá người dùng. Mật khẩu được mã hoá bcrypt an toàn.',
        en: 'Manage CMS login accounts. Add, edit, delete users. Passwords are securely encrypted with bcrypt.',
      },
    },
    {
      title: { vi: 'Thêm người dùng', en: 'Add User' },
      description: {
        vi: 'Nhấn "Thêm" để tạo tài khoản mới. Cần: Email (duy nhất), Mật khẩu, Tên hiển thị, Trạng thái (active/inactive).',
        en: 'Click "Add" to create a new account. Required: Email (unique), Password, Display Name, Status (active/inactive).',
      },
      target: '.ant-btn-primary',
    },
    {
      title: { vi: 'Form tạo người dùng', en: 'Create User Form' },
      description: {
        vi: 'Điền thông tin: Email (dùng để đăng nhập), Mật khẩu (tối thiểu 6 ký tự), Tên, Ghi chú. Trạng thái "inactive" sẽ không cho đăng nhập.',
        en: 'Fill in: Email (used for login), Password (min 6 chars), Name, Notes. Status "inactive" prevents login.',
      },
      beforeStep: () => clickSelector('.ant-btn-primary'),
      target: '.ant-modal-content',
      stepDelay: 500,
    },
    {
      title: { vi: 'Bảng người dùng', en: 'Users Table' },
      description: {
        vi: 'Danh sách tất cả người dùng. Hiển thị: Avatar, Tên, Email, Trạng thái, Đăng nhập cuối. Nhấn nút bên phải để sửa/xoá.',
        en: 'List of all users. Shows: Avatar, Name, Email, Status, Last Login. Click action buttons on the right to edit/delete.',
      },
      target: '.ant-table',
    },
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // DEV - API EXPLORER
  // ═══════════════════════════════════════════════════════════════════════════
  'dev-api': [
    {
      title: { vi: 'API Explorer', en: 'API Explorer' },
      description: {
        vi: 'Xem và thử nghiệm tất cả API endpoints. Chọn nhóm API, xem endpoint details, gửi request thử và xem response.',
        en: 'View and test all API endpoints. Select an API group, see endpoint details, send test requests and view responses.',
      },
    },
    {
      title: { vi: 'Nhóm API', en: 'API Groups' },
      description: {
        vi: 'Sidebar bên trái liệt kê các nhóm: Lark OAuth, Bitable, Docs, Users, Jobs, AI Agent, Knowledge, AI Config... Nhấn để lọc endpoints.',
        en: 'Left sidebar lists groups: Lark OAuth, Bitable, Docs, Users, Jobs, AI Agent, Knowledge, AI Config... Click to filter endpoints.',
      },
    },
    {
      title: { vi: 'Endpoint Card', en: 'Endpoint Card' },
      description: {
        vi: 'Mỗi endpoint hiển thị: Method badge (GET/POST/PUT/DELETE), Path, Mô tả. Nhấn "Try it" để mở panel thử nghiệm.',
        en: 'Each endpoint shows: Method badge (GET/POST/PUT/DELETE), Path, Description. Click "Try it" to open the test panel.',
      },
    },
    {
      title: { vi: 'Try It Panel', en: 'Try It Panel' },
      description: {
        vi: 'Nhập parameters, headers, body JSON rồi nhấn "Send". Response hiển thị bên dưới với syntax highlighting. Hỗ trợ copy response.',
        en: 'Enter parameters, headers, body JSON then click "Send". Response displays below with syntax highlighting. Supports copy response.',
      },
    },
    {
      title: { vi: 'Authentication', en: 'Authentication' },
      description: {
        vi: 'Cấu hình global headers ở card trên cùng. Nhập Bearer Token hoặc API key để xác thực cho tất cả requests.',
        en: 'Configure global headers in the top card. Enter Bearer Token or API key to authenticate all requests.',
      },
      target: '.ant-card',
    },
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // CHATBOT
  // ═══════════════════════════════════════════════════════════════════════════
  'chatbot': [
    {
      title: { vi: 'Chat Bot Demo', en: 'Chat Bot Demo' },
      description: {
        vi: 'Thử nghiệm chat trực tiếp với AI. Giao diện chat với streaming response, hỗ trợ markdown, code blocks.',
        en: 'Test chat directly with AI. Chat interface with streaming response, supports markdown, code blocks.',
      },
    },
    {
      title: { vi: 'Nhập tin nhắn', en: 'Enter Message' },
      description: {
        vi: 'Nhập câu hỏi hoặc yêu cầu. AI sẽ trả lời dựa trên cấu hình AI Config hiện tại. Response hiển thị dạng streaming.',
        en: 'Enter a question or request. AI responds based on the current AI Config. Response displays via streaming.',
      },
      target: '.ant-input',
    },
    {
      title: { vi: 'Kết quả', en: 'Results' },
      description: {
        vi: 'Kết quả hiển thị bên dưới: text, bảng dữ liệu, diagrams, workflows, automations, sample data. Có thể copy hoặc export.',
        en: 'Results display below: text, data tables, diagrams, workflows, automations, sample data. Can copy or export.',
      },
    },
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // DOCS PAGES (single overview step each)
  // ═══════════════════════════════════════════════════════════════════════════
  'docs-sync': [
    {
      title: { vi: 'Tài liệu Bitable Sync', en: 'Bitable Sync Documentation' },
      description: {
        vi: 'Hướng dẫn chi tiết: cách hoạt động polling, API reference, so sánh với cách cũ (CurlJob), webhook payload, xử lý lỗi.',
        en: 'Detailed guide: how polling works, API reference, comparison with old approach (CurlJob), webhook payloads, error handling.',
      },
    },
  ],
  'docs-agent-guide': [
    {
      title: { vi: 'Hướng dẫn AI Agent', en: 'AI Agent Guide' },
      description: {
        vi: 'Tài liệu bảo trì: kiến trúc hệ thống, tạo agent A→Z, logic training, RAG algorithm, webhook flow, LLM/NLP roadmap.',
        en: 'Maintenance docs: system architecture, create agent A→Z, training logic, RAG algorithm, webhook flow, LLM/NLP roadmap.',
      },
    },
  ],
  'docs-platform-guide': [
    {
      title: { vi: 'Hướng dẫn đa nền tảng', en: 'Multi-Platform Guide' },
      description: {
        vi: 'Hướng dẫn tích hợp AI Agent với: Lark (live), Telegram, Slack, Zalo, WhatsApp, LINE. Kèm business scenarios và development roadmap.',
        en: 'Guide for integrating AI Agent with: Lark (live), Telegram, Slack, Zalo, WhatsApp, LINE. Includes business scenarios and development roadmap.',
      },
    },
  ],
  'docs-changelog': [
    {
      title: { vi: 'Nhật ký cập nhật', en: 'Changelog' },
      description: {
        vi: 'Lịch sử thay đổi, tính năng mới, bug fixes, và lộ trình phát triển của hệ thống CMS Hoa Nam.',
        en: 'Change history, new features, bug fixes, and development roadmap of the CMS Hoa Nam system.',
      },
    },
  ],

  'docs-demo-guide': [
    {
      title: { vi: 'Hướng dẫn Demo Products', en: 'Demo Products Guide' },
      description: {
        vi: 'Tài liệu chi tiết cho 5 sản phẩm demo: cách sử dụng, API, kiến trúc, và hướng dẫn mở rộng phát triển.',
        en: 'Detailed documentation for 5 demo products: usage, API, architecture, and extension development guide.',
      },
    },
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // DEMO PAGES
  // ═══════════════════════════════════════════════════════════════════════════
  'demo-ai-tools': [
    {
      title: { vi: 'Công cụ AI Văn bản', en: 'AI Text Tools' },
      description: {
        vi: 'Bộ công cụ xử lý văn bản bằng AI: Tóm tắt, Dịch thuật, Viết lại, Kiểm tra ngữ pháp. Chọn tab để chuyển đổi công cụ.',
        en: 'AI-powered text processing tools: Summarize, Translate, Rewrite, Grammar Check. Switch tabs to change tools.',
      },
    },
    {
      title: { vi: 'Chọn công cụ', en: 'Select Tool' },
      description: {
        vi: '4 công cụ: Tóm tắt (rút gọn văn bản), Dịch thuật (VI/EN/JP/KR/ZH/FR), Viết lại (đổi giọng văn), Kiểm tra ngữ pháp.',
        en: '4 tools: Summarize (condense text), Translate (VI/EN/JP/KR/ZH/FR), Rewrite (change tone), Grammar Check.',
      },
      target: '.ant-tabs-nav',
    },
    {
      title: { vi: 'Nhập văn bản', en: 'Enter Text' },
      description: {
        vi: 'Dán hoặc nhập văn bản cần xử lý vào ô bên trái. Số từ hiển thị trên thanh tiêu đề.',
        en: 'Paste or type the text to process in the left box. Word count is shown in the title bar.',
      },
    },
    {
      title: { vi: 'Tuỳ chọn & Xử lý', en: 'Options & Process' },
      description: {
        vi: 'Chọn tuỳ chọn (ngôn ngữ dịch, giọng văn, số câu...) rồi nhấn "Xử lý". Kết quả streaming real-time bên phải. Nhấn "Hoán đổi" để dùng kết quả làm đầu vào mới.',
        en: 'Select options (target language, tone, sentence count...) then click "Process". Results stream in real-time on the right. Click "Swap" to use output as new input.',
      },
    },
  ],

  'demo-image-analyzer': [
    {
      title: { vi: 'Phân tích Hình ảnh AI', en: 'AI Image Analyzer' },
      description: {
        vi: 'Tải ảnh lên và AI sẽ phân tích: mô tả chi tiết, trích xuất văn bản (OCR), trích xuất dữ liệu, nhận diện đối tượng.',
        en: 'Upload an image and AI will analyze it: detailed description, text extraction (OCR), data extraction, object identification.',
      },
    },
    {
      title: { vi: 'Tải ảnh lên', en: 'Upload Image' },
      description: {
        vi: 'Kéo thả hoặc nhấn để chọn ảnh (PNG, JPG, WEBP, GIF). Ảnh hiển thị preview sau khi tải.',
        en: 'Drag & drop or click to select an image (PNG, JPG, WEBP, GIF). Preview displays after upload.',
      },
      target: '.ant-upload',
    },
    {
      title: { vi: 'Chọn chế độ phân tích', en: 'Select Analysis Mode' },
      description: {
        vi: '4 chế độ: Mô tả (AI mô tả ảnh), OCR (trích xuất text), Dữ liệu (trích xuất bảng/form), Đối tượng (nhận diện vật thể).',
        en: '4 modes: Describe (AI describes image), OCR (extract text), Data (extract tables/forms), Objects (identify items).',
      },
      target: '.ant-radio-group',
    },
    {
      title: { vi: 'Kết quả', en: 'Results' },
      description: {
        vi: 'Kết quả phân tích hiển thị bên phải với streaming. Nhấn "Copy" để sao chép. Hỗ trợ cả Anthropic Claude và OpenAI GPT-4V.',
        en: 'Analysis results display on the right with streaming. Click "Copy" to copy. Supports both Anthropic Claude and OpenAI GPT-4V.',
      },
    },
  ],

  'demo-knowledge-qa': [
    {
      title: { vi: 'Hỏi đáp Knowledge Base', en: 'Knowledge Base Q&A' },
      description: {
        vi: 'Demo RAG (Retrieval Augmented Generation): chọn AI Agent, hỏi câu hỏi, xem AI trả lời dựa trên knowledge base đã cấu hình.',
        en: 'RAG (Retrieval Augmented Generation) demo: select an AI Agent, ask questions, see AI respond based on configured knowledge base.',
      },
    },
    {
      title: { vi: 'Chọn AI Agent', en: 'Select AI Agent' },
      description: {
        vi: 'Chọn agent từ dropdown. Mỗi agent có knowledge base riêng (Lark Docs, Wiki, Bitable, Q&A). Số tài liệu hiển thị cạnh tên.',
        en: 'Select an agent from the dropdown. Each agent has its own knowledge base (Lark Docs, Wiki, Bitable, Q&A). Document count shown next to name.',
      },
      target: '.ant-select',
    },
    {
      title: { vi: 'Chat & RAG', en: 'Chat & RAG' },
      description: {
        vi: 'Gửi câu hỏi trong chat. AI tìm tài liệu liên quan từ KB, đưa vào ngữ cảnh, rồi trả lời. Nếu Q&A khớp score ≥ 12, trả lời chính xác mà không gọi LLM.',
        en: 'Send questions in chat. AI finds relevant docs from KB, adds to context, then responds. If Q&A match score ≥ 12, returns exact answer without calling LLM.',
      },
    },
    {
      title: { vi: 'Thông tin Agent & KB', en: 'Agent Info & KB' },
      description: {
        vi: 'Sidebar bên phải hiển thị: thông tin agent, danh sách tài liệu trong knowledge base, và gợi ý câu hỏi mẫu.',
        en: 'Right sidebar shows: agent info, knowledge base document list, and suggested sample questions.',
      },
    },
  ],

  'demo-webhook-tester': [
    {
      title: { vi: 'Webhook Tester', en: 'Webhook Tester' },
      description: {
        vi: 'Công cụ gửi HTTP request đến webhook endpoints. Hỗ trợ preset cho Lark Custom Bot, Telegram Bot, và generic webhook.',
        en: 'Tool for sending HTTP requests to webhook endpoints. Includes presets for Lark Custom Bot, Telegram Bot, and generic webhooks.',
      },
    },
    {
      title: { vi: 'Preset Templates', en: 'Preset Templates' },
      description: {
        vi: 'Nhấn nút preset để tự động điền URL, headers, body theo template. Có sẵn: Lark Bot, Telegram Bot, Generic Webhook.',
        en: 'Click preset buttons to auto-fill URL, headers, body from templates. Available: Lark Bot, Telegram Bot, Generic Webhook.',
      },
    },
    {
      title: { vi: 'Gửi Request', en: 'Send Request' },
      description: {
        vi: 'Chọn method (GET/POST/PUT/DELETE), nhập URL, tuỳ chỉnh headers và body, rồi nhấn "Gửi". Response hiển thị bên phải.',
        en: 'Select method (GET/POST/PUT/DELETE), enter URL, customize headers and body, then click "Send". Response shows on the right.',
      },
    },
    {
      title: { vi: 'Lịch sử Request', en: 'Request History' },
      description: {
        vi: 'Lưu tối đa 20 request gần nhất. Nhấn vào lịch sử để tự động điền lại URL, method, body. Hiển thị status code và thời gian phản hồi.',
        en: 'Saves up to 20 recent requests. Click history to auto-fill URL, method, body. Shows status code and response time.',
      },
    },
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // SETTINGS - CREDITS / AI USAGE DASHBOARD
  // ═══════════════════════════════════════════════════════════════════════════
  'settings-credits': [
    {
      target: '[data-tour="credits-header"]',
      title: { vi: 'AI Usage Dashboard', en: 'AI Usage Dashboard' },
      description: {
        vi: 'Trang tong quan theo doi chi phi va luong su dung AI cua tat ca provider. Du lieu tu he thong noi bo (moi lan goi AI deu duoc ghi nhan token va tinh chi phi).',
        en: 'Overview page tracking AI costs and usage across all providers. Data comes from internal tracking (every AI call logs tokens and cost).',
      },
    },
    {
      target: '[data-tour="credits-summary"]',
      title: { vi: 'Thong ke tong quat', en: 'Summary Statistics' },
      description: {
        vi: '4 the thong ke: Tong chi phi AI (tat ca thoi gian), Chi phi thang nay, Tong tokens da dung, So du credit con lai. Du lieu cap nhat realtime moi khi AI duoc goi.',
        en: '4 stat cards: Total AI cost (all time), This month cost, Total tokens used, Remaining credit balance. Updates in real-time on every AI call.',
      },
      placement: 'bottom',
    },
    {
      target: '[data-tour="credits-chart"]',
      title: { vi: 'Bieu do chi phi theo thang', en: 'Monthly Cost Chart' },
      description: {
        vi: 'Bieu do thanh hien thi chi phi (mau tim) va so tien da nap (mau xanh) trong 6 thang gan nhat. Hover vao cot de xem chi tiet.',
        en: 'Bar chart showing cost (purple) and deposits (green) for the last 6 months. Hover bars for details.',
      },
      placement: 'bottom',
    },
    {
      target: '[data-tour="credits-table"]',
      title: { vi: 'Danh sach AI Provider', en: 'AI Provider List' },
      description: {
        vi: 'Bang hien thi tat ca AI provider da cau hinh: chi phi, tokens, so du credit. Nhan "Xem" de mo chi tiet va lich su giao dich cua provider do.',
        en: 'Table showing all configured AI providers: cost, tokens, credit balance. Click "View" to see detailed stats and transaction history.',
      },
      placement: 'top',
    },
    {
      target: '[data-tour="credits-cost"]',
      title: { vi: 'Chi phi tich luy', en: 'Accumulated Cost' },
      description: {
        vi: 'Tong chi phi AI da su dung, tinh tu gia token (Input Price/M va Output Price/M) x so token thuc te. Cap nhat sau moi lan goi AI.',
        en: 'Total AI cost calculated from token pricing (Input/Output Price per 1M tokens) x actual tokens. Updated after every AI call.',
      },
    },
    {
      target: '[data-tour="credits-balance"]',
      title: { vi: 'So du credit', en: 'Credit Balance' },
      description: {
        vi: 'So tien con lai trong tai khoan credit (neu da nap). Khi bat "Block on Zero" o trang Settings > AI, he thong se chan goi AI khi het so du.',
        en: 'Remaining credit balance (if deposited). When "Block on Zero" is enabled in Settings > AI, the system blocks AI calls when balance reaches 0.',
      },
    },
    {
      target: '[data-tour="credits-detail-btn"]',
      title: { vi: 'Xem chi tiet provider', en: 'View Provider Details' },
      description: {
        vi: 'Mo panel chi tiet voi 2 tab: "Thong ke" (chi phi, tokens, credit, du lieu tu provider API) va "Lich su" (bang giao dich co loc theo loai va ngay).',
        en: 'Opens detail panel with 2 tabs: "Stats" (cost, tokens, credit, provider API data) and "History" (transaction table with type and date filters).',
      },
    },
  ],
}
