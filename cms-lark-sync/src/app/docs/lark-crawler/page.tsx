'use client'

import { Card, Typography, Table, Tag, Alert, Collapse, Divider, Steps } from 'antd'
import {
  BugOutlined, RobotOutlined, ThunderboltOutlined, DatabaseOutlined,
  CloudSyncOutlined, SafetyOutlined, ApiOutlined, CodeOutlined,
  ScheduleOutlined, FileSearchOutlined, CheckCircleOutlined,
  WarningOutlined, ClockCircleOutlined, SyncOutlined,
} from '@ant-design/icons'
import useLang from '@/store/language'

const { Title, Paragraph, Text } = Typography

const i = {
  vi: {
    title: 'Lark Crawler — Tài liệu sử dụng',
    subtitle: 'Công cụ crawler dữ liệu từ Lark Base (automations, roles, forms) về hệ thống BA Analyst',
    overview: 'Tổng quan',
    overviewDesc: 'Lark Crawler là công cụ Playwright-based, mở Lark Base trong trình duyệt headless, chặn bắt các API response nội bộ của Lark để trích xuất dữ liệu mà Lark Open API không cung cấp: automation workflows (draft steps chi tiết), roles/permissions, form definitions, sidebar metadata.',
    whatCrawls: 'Dữ liệu crawler thu thập',
    architecture: 'Kiến trúc & luồng dữ liệu',
    archDesc: 'Lark Crawler hoạt động như một browser tự động: đăng nhập Lark → mở Base → chặn bắt JSON response → parse → lưu file → đẩy lên Analyst API.',
    setup: 'Cài đặt',
    usage: 'Cách sử dụng',
    commands: 'Các lệnh',
    loginStep: 'Đăng nhập Lark',
    loginDesc: 'Mở trình duyệt, đăng nhập thủ công. Session được lưu lại để các lần scan sau không cần đăng nhập lại.',
    scanStep: 'Scan một Base',
    scanDesc: 'Mở Base URL trong headless browser, tự động click tab Automations, chờ API response, parse và lưu kết quả.',
    pushStep: 'Scan + đẩy lên Analyst',
    pushDesc: 'Scan xong tự động đẩy dữ liệu workflow lên Analyst Base qua API. Cập nhật hoặc tạo mới workflow items.',
    results: 'Kết quả đầu ra',
    resultsDesc: 'Mỗi lần scan tạo 1 file JSON trong thư mục results/, đặt tên theo Base ID.',
    filtering: 'Bộ lọc tự động',
    filterDesc: 'Crawler tự động lọc bỏ các workflow có tên hệ thống/rác để đảm bảo dữ liệu sạch.',
    pushLogic: 'Logic đẩy lên Analyst',
    pushLogicDesc: 'Khi dùng flag --push, crawler sẽ gọi API để cập nhật Analyst Base.',
    integration: 'Tích hợp với BA Analyst',
    integrationDesc: 'Dữ liệu từ crawler được merge vào Analyst Base, kết hợp với dữ liệu sync-from-lark (fields, views, relationships) để tạo bức tranh toàn diện.',
    periodic: 'Kiểm tra định kỳ',
    periodicDesc: 'Quy trình kiểm tra định kỳ đảm bảo dữ liệu Analyst luôn cập nhật và chính xác.',
    faq: 'Hỏi đáp',
    agentBa: 'Tích hợp Agent BA',
    agentBaDesc: 'Agent Lark BA tự động phát hiện thay đổi trên Lark, phân tích bằng AI, và báo cáo qua Lark card.',
    troubleshoot: 'Xử lý sự cố',
  },
  en: {
    title: 'Lark Crawler — Usage Documentation',
    subtitle: 'Tool for crawling data from Lark Base (automations, roles, forms) into the BA Analyst system',
    overview: 'Overview',
    overviewDesc: 'Lark Crawler is a Playwright-based tool that opens Lark Base in a headless browser, intercepts internal API responses to extract data not available via Lark Open API: automation workflows (detailed draft steps), roles/permissions, form definitions, sidebar metadata.',
    whatCrawls: 'Data the crawler collects',
    architecture: 'Architecture & data flow',
    archDesc: 'Lark Crawler works as an automated browser: login to Lark → open Base → intercept JSON responses → parse → save file → push to Analyst API.',
    setup: 'Setup',
    usage: 'Usage',
    commands: 'Commands',
    loginStep: 'Login to Lark',
    loginDesc: 'Opens browser for manual login. Session is saved for subsequent scans without re-login.',
    scanStep: 'Scan a Base',
    scanDesc: 'Opens Base URL in headless browser, auto-clicks Automations tab, waits for API response, parses and saves results.',
    pushStep: 'Scan + push to Analyst',
    pushDesc: 'After scanning, automatically pushes workflow data to Analyst Base via API. Updates existing or creates new workflow items.',
    results: 'Output',
    resultsDesc: 'Each scan creates a JSON file in the results/ directory, named by Base ID.',
    filtering: 'Auto-filtering',
    filterDesc: 'The crawler auto-filters system/junk workflow names to ensure clean data.',
    pushLogic: 'Push logic to Analyst',
    pushLogicDesc: 'When using --push flag, the crawler calls the API to update the Analyst Base.',
    integration: 'Integration with BA Analyst',
    integrationDesc: 'Crawler data is merged into Analyst Base, combined with sync-from-lark data (fields, views, relationships) for a comprehensive picture.',
    periodic: 'Periodic checks',
    periodicDesc: 'Periodic check procedures ensure Analyst data stays current and accurate.',
    faq: 'FAQ',
    agentBa: 'Agent BA Integration',
    agentBaDesc: 'Agent Lark BA automatically detects changes on Lark, analyzes with AI, and reports via Lark card.',
    troubleshoot: 'Troubleshooting',
  },
}

const crawlData = [
  { data: 'Automations / Workflows', source: 'Internal API: automation/list', details: 'Tên, trạng thái (Enable/Disable), draft steps chi tiết (trigger, condition, action), table/field references', tag: 'primary' },
  { data: 'Roles & Permissions', source: 'Internal API: /role, /perm', details: 'Tên role, quyền theo bảng, danh sách thành viên', tag: 'info' },
  { data: 'Forms', source: 'Internal API: /form', details: 'Fields, cấu hình form, validation rules', tag: 'info' },
  { data: 'Sidebar Metadata', source: 'Internal API: /meta', details: 'Danh sách tables, blocks, cấu trúc sidebar', tag: 'info' },
]

const filterPatterns = [
  { pattern: 'Tự động hóa', reason: 'Tên mặc định của Lark khi tạo automation mới' },
  { pattern: 'Bảng điều khiển(...)', reason: 'Dashboard automation tự sinh' },
  { pattern: 'Quy trình làm việc N', reason: 'Tên mặc định "Quy trình làm việc 2", "Quy trình làm việc 3"...' },
  { pattern: 'Gửi tóm tắt bản ghi', reason: 'Automation hệ thống của Lark' },
  { pattern: 'Workflow #N', reason: 'Fallback name khi không parse được tên' },
  { pattern: 'Automation N', reason: 'Fallback name generic' },
]

const periodicChecks = [
  { task: 'Chạy sync-all-from-lark', frequency: 'Mỗi tuần hoặc khi có thay đổi lớn', command: 'POST /api/analyst-bases/sync-all-from-lark', note: 'Cập nhật fields, views, relationships từ Lark API' },
  { task: 'Chạy lark-crawler scan', frequency: 'Khi cần cập nhật automations/roles', command: 'node crawler.js scan <url> --push --analyst-id=<id>', note: 'Cập nhật workflow steps chi tiết' },
  { task: 'Chạy cleanup-all', frequency: 'Sau mỗi lần sync/crawl', command: 'POST /api/analyst-bases/cleanup-all', note: 'Xoá items thừa, trùng lặp, tên hệ thống' },
  { task: 'Generate docs', frequency: 'Sau khi data ổn định', command: 'POST /api/analyst-bases/:id/generate-docs', note: 'Sinh specs mới (README, fields, views, workflows, relationships, overview, dictionary)' },
  { task: 'Kiểm tra BA Docs', frequency: 'Sau generate-docs', command: 'Mở /ba/docs trên CMS', note: 'Review nội dung sinh tự động, bổ sung/sửa nếu cần' },
]

const faqItems = [
  {
    q: 'Session hết hạn, scan báo lỗi?',
    a: 'Chạy lại npm run login, đăng nhập lại Lark. Session được lưu trong thư mục .lark-session/ và tồn tại cho đến khi Lark yêu cầu đăng nhập lại (thường vài tuần).',
  },
  {
    q: 'Scan xong nhưng automations = 0?',
    a: 'Có thể Base không có automations, hoặc tab Automations chưa được click đúng. Kiểm tra file _raw_automations.json trong results/. Nếu file rỗng, thử tăng thời gian chờ hoặc kiểm tra quyền truy cập Base.',
  },
  {
    q: 'Làm sao biết analyst-id của một Base?',
    a: 'Mở /ba/analyst trên CMS, click vào Base cần lấy ID. URL sẽ chứa ID, hoặc gọi GET /api/analyst-bases để liệt kê tất cả.',
  },
  {
    q: '--push báo lỗi "No --analyst-id"?',
    a: 'Cần truyền đầy đủ: node crawler.js scan <url> --push --analyst-id=<mongo_id>. Lấy mongo_id từ API hoặc CMS.',
  },
  {
    q: 'Dữ liệu bị trùng sau khi crawl nhiều lần?',
    a: 'Chạy POST /api/analyst-bases/cleanup-all để xoá duplicates. Crawler có logic merge: nếu workflow đã tồn tại (cùng tên), chỉ cập nhật nodes và status, không tạo mới.',
  },
  {
    q: 'Sync-from-lark vs Lark Crawler khác nhau thế nào?',
    a: 'sync-from-lark dùng Lark Open API (chính thức) để lấy fields, views, relationships. Lark Crawler dùng browser automation để lấy automations/roles (dữ liệu Lark không cung cấp qua API). Cả hai bổ sung cho nhau.',
  },
  {
    q: 'Agent BA tự động báo cáo khi nào?',
    a: 'Agent BA (agent-lark-ba) lắng nghe webhook từ Lark. Khi có thay đổi trên Wiki hoặc Base, agent tự động phân tích bằng AI và gửi card thông báo lên group Lark kèm nút xác nhận.',
  },
]

export default function DocsLarkCrawlerPage() {
  const { lang } = useLang()
  const t = i[lang] || i.vi

  return (
    <div className="space-y-3">
      <Title level={3}>
        <BugOutlined className="mr-2" />
        {t.title}
      </Title>
      <Paragraph type="secondary">{t.subtitle}</Paragraph>

      {/* 1. Overview */}
      <Card>
        <Title level={4}><ThunderboltOutlined className="mr-2" />{t.overview}</Title>
        <Paragraph>{t.overviewDesc}</Paragraph>

        <Divider orientation="left">{t.whatCrawls}</Divider>
        <Table size="small" pagination={false}
          dataSource={crawlData.map((d, i) => ({ ...d, key: i }))}
          columns={[
            { title: lang === 'vi' ? 'Dữ liệu' : 'Data', dataIndex: 'data', width: 200, render: (v: string, r: { tag: string }) => <Text strong><Tag color={r.tag === 'primary' ? 'blue' : 'default'}>{v}</Tag></Text> },
            { title: lang === 'vi' ? 'Nguồn' : 'Source', dataIndex: 'source', width: 250, render: (v: string) => <Text code style={{ fontSize: 11 }}>{v}</Text> },
            { title: lang === 'vi' ? 'Chi tiết' : 'Details', dataIndex: 'details' },
          ]}
        />

        <Alert type="info" showIcon style={{ marginTop: 12 }}
          message={lang === 'vi'
            ? 'Lark Open API chỉ cung cấp danh sách workflow (tên, status). Lark Crawler bổ sung draft steps chi tiết (trigger type, table references, field mappings, conditions) mà API không có.'
            : 'Lark Open API only provides workflow list (name, status). Lark Crawler supplements with detailed draft steps (trigger type, table references, field mappings, conditions) not available via API.'
          }
        />
      </Card>

      {/* 2. Architecture */}
      <Card>
        <Title level={4}><CloudSyncOutlined className="mr-2" />{t.architecture}</Title>
        <Paragraph>{t.archDesc}</Paragraph>
        <pre style={{ background: 'var(--bg-tertiary)', padding: 16, borderRadius: 8, fontSize: 12, lineHeight: 1.8, overflow: 'auto' }}>
{`Lark Base (browser)
    |
    | Playwright headless browser
    | Intercept internal API responses
    v
[lark-crawler]  ──scan──>  results/<base_id>.json
    |
    | --push --analyst-id=<id>
    v
[api-lark-all]  POST /api/analyst-bases/:id  (update groups/items)
    |
    v
[MongoDB]  AnalystBase collection
    |
    v
[CMS]  /ba/analyst  ──>  Tree view, Graph view
       /ba/docs     ──>  Generated specs (README, fields, workflows...)

--- Song song ---

[Lark Open API]  ──sync-from-lark──>  fields, views, relationships
                                       (bo sung cho crawler data)

[Agent BA]  ──webhook──>  Phát hiện thay đổi -> AI phân tích
            ──card──>     Gửi báo cáo lên Lark group
            ──confirm──>  Cập nhật wiki tự động`}
        </pre>
      </Card>

      {/* 3. Setup */}
      <Card>
        <Title level={4}><CodeOutlined className="mr-2" />{t.setup}</Title>
        <Steps direction="vertical" size="small" current={-1} items={[
          {
            title: lang === 'vi' ? 'Cài đặt dependencies' : 'Install dependencies',
            description: (
              <pre style={{ background: 'var(--bg-tertiary)', padding: 8, borderRadius: 4, fontSize: 12 }}>
{`cd tools/lark-crawler
npm install          # cài playwright
npx playwright install chromium   # tải browser`}
              </pre>
            ),
          },
          {
            title: lang === 'vi' ? 'Đăng nhập Lark (lần đầu)' : 'Login to Lark (first time)',
            description: (
              <div>
                <pre style={{ background: 'var(--bg-tertiary)', padding: 8, borderRadius: 4, fontSize: 12 }}>npm run login</pre>
                <Paragraph style={{ marginTop: 8, fontSize: 13 }}>
                  {lang === 'vi'
                    ? 'Trình duyệt mở ra → đăng nhập tài khoản Lark có quyền truy cập Base → vào 1 Base bất kỳ → quay lại terminal bấm Enter. Session lưu trong .lark-session/.'
                    : 'Browser opens → login with Lark account that has Base access → enter any Base → return to terminal and press Enter. Session saved in .lark-session/.'}
                </Paragraph>
              </div>
            ),
          },
          {
            title: lang === 'vi' ? 'Cấu hình API (tuỳ chọn)' : 'Configure API (optional)',
            description: (
              <div>
                <Paragraph style={{ fontSize: 13 }}>
                  {lang === 'vi'
                    ? 'Mặc định crawler gọi API tại http://localhost:6100/api. Để trỏ sang server khác:'
                    : 'By default crawler calls API at http://localhost:6100/api. To point elsewhere:'}
                </Paragraph>
                <pre style={{ background: 'var(--bg-tertiary)', padding: 8, borderRadius: 4, fontSize: 12 }}>
{`export ANALYST_API=https://apihoanam.toolswave.net/api`}
                </pre>
              </div>
            ),
          },
        ]} />
      </Card>

      {/* 4. Usage */}
      <Card>
        <Title level={4}><ApiOutlined className="mr-2" />{t.usage}</Title>

        <Title level={5}>{lang === 'vi' ? 'Lệnh 1 — Scan một Base' : 'Command 1 — Scan a Base'}</Title>
        <pre style={{ background: 'var(--bg-tertiary)', padding: 12, borderRadius: 6, fontSize: 12 }}>
{`npm run scan -- <lark_base_url>

# Ví dụ:
npm run scan -- "https://www.larksuite.com/base/Bsk2bdfzRadWb2skngdlBGzigzi"`}
        </pre>
        <Paragraph style={{ fontSize: 13, marginTop: 8 }}>
          {lang === 'vi'
            ? 'Kết quả lưu tại results/<base_id>.json. Chứa automations, roles, forms, sidebar metadata.'
            : 'Results saved at results/<base_id>.json. Contains automations, roles, forms, sidebar metadata.'}
        </Paragraph>

        <Divider />

        <Title level={5}>{lang === 'vi' ? 'Lệnh 2 — Scan + đẩy lên Analyst' : 'Command 2 — Scan + push to Analyst'}</Title>
        <pre style={{ background: 'var(--bg-tertiary)', padding: 12, borderRadius: 6, fontSize: 12 }}>
{`npm run scan -- <lark_base_url> --push --analyst-id=<mongo_id>

# Ví dụ:
npm run scan -- "https://www.larksuite.com/base/Bsk2bdfz..." \\
  --push --analyst-id=6a0fd0261e47c445a91ad974`}
        </pre>
        <Paragraph style={{ fontSize: 13, marginTop: 8 }}>
          {lang === 'vi'
            ? 'Sau khi scan, tự động gọi PUT /api/analyst-bases/:id để cập nhật workflow items. Nếu workflow đã tồn tại (cùng tên) → cập nhật nodes và status. Nếu mới → thêm vào __root__ group.'
            : 'After scanning, auto-calls PUT /api/analyst-bases/:id to update workflow items. If workflow exists (same name) → updates nodes and status. If new → adds to __root__ group.'}
        </Paragraph>

        <Divider />

        <Title level={5}>{lang === 'vi' ? 'Lệnh 3 — Sync toàn bộ từ Lark API' : 'Command 3 — Sync all from Lark API'}</Title>
        <pre style={{ background: 'var(--bg-tertiary)', padding: 12, borderRadius: 6, fontSize: 12 }}>
{`# Trên CMS hoặc qua API:
POST https://apihoanam.toolswave.net/api/analyst-bases/sync-all-from-lark

# Hoặc cho 1 base cụ thể:
POST /api/analyst-bases/<analyst_id>/sync-from-lark
Body: { "baBaseId": "<ba_base_id>" }`}
        </pre>
        <Paragraph style={{ fontSize: 13, marginTop: 8 }}>
          {lang === 'vi'
            ? 'Sync fields, views, relationships từ Lark Open API (bổ sung cho dữ liệu crawler). Tự động merge: giữ lại fields thủ công, cập nhật fields từ Lark.'
            : 'Syncs fields, views, relationships from Lark Open API (complements crawler data). Auto-merges: keeps manual fields, updates Lark-synced fields.'}
        </Paragraph>
      </Card>

      {/* 5. Filtering */}
      <Card>
        <Title level={4}><SafetyOutlined className="mr-2" />{t.filtering}</Title>
        <Paragraph>{t.filterDesc}</Paragraph>
        <Table size="small" pagination={false}
          dataSource={filterPatterns.map((f, i) => ({ ...f, key: i }))}
          columns={[
            { title: 'Pattern', dataIndex: 'pattern', width: 250, render: (v: string) => <Text code>{v}</Text> },
            { title: lang === 'vi' ? 'Lý do lọc' : 'Filter reason', dataIndex: 'reason' },
          ]}
        />
        <Alert type="warning" showIcon style={{ marginTop: 12 }}
          message={lang === 'vi'
            ? 'Bộ lọc áp dụng cả ở crawler (khi capture) và ở API sync-from-lark (khi import). Sau khi sync/crawl, chạy POST /api/analyst-bases/cleanup-all để xoá thêm các items trùng lặp.'
            : 'Filters apply both at crawler (during capture) and at API sync-from-lark (during import). After sync/crawl, run POST /api/analyst-bases/cleanup-all to remove remaining duplicates.'}
        />
      </Card>

      {/* 6. Periodic checks */}
      <Card>
        <Title level={4}><ScheduleOutlined className="mr-2" />{t.periodic}</Title>
        <Paragraph>{t.periodicDesc}</Paragraph>
        <Table size="small" pagination={false}
          dataSource={periodicChecks.map((c, i) => ({ ...c, key: i }))}
          columns={[
            { title: lang === 'vi' ? 'Công việc' : 'Task', dataIndex: 'task', width: 200 },
            { title: lang === 'vi' ? 'Tần suất' : 'Frequency', dataIndex: 'frequency', width: 220, render: (v: string) => <Tag color="blue">{v}</Tag> },
            { title: lang === 'vi' ? 'Lệnh / Endpoint' : 'Command', dataIndex: 'command', render: (v: string) => <Text code style={{ fontSize: 11 }}>{v}</Text> },
            { title: lang === 'vi' ? 'Ghi chú' : 'Note', dataIndex: 'note' },
          ]}
        />

        <Divider orientation="left">{lang === 'vi' ? 'Quy trình kiểm tra đầy đủ' : 'Full check procedure'}</Divider>
        <Steps direction="vertical" size="small" current={-1} items={[
          { title: lang === 'vi' ? 'Sync fields/views từ Lark API' : 'Sync fields/views from Lark API', description: 'POST /api/analyst-bases/sync-all-from-lark', icon: <SyncOutlined /> },
          { title: lang === 'vi' ? 'Crawl automations (nếu có Base mới hoặc thay đổi workflow)' : 'Crawl automations (if new Base or workflow changes)', description: 'node crawler.js scan <url> --push --analyst-id=<id>', icon: <BugOutlined /> },
          { title: lang === 'vi' ? 'Cleanup dữ liệu thừa' : 'Cleanup stale data', description: 'POST /api/analyst-bases/cleanup-all', icon: <SafetyOutlined /> },
          { title: lang === 'vi' ? 'Kiểm tra trên CMS' : 'Verify on CMS', description: '/ba/analyst — xem tree view, kiểm tra items', icon: <FileSearchOutlined /> },
          { title: lang === 'vi' ? 'Generate docs (nếu muốn cập nhật specs)' : 'Generate docs (if specs update needed)', description: 'POST /api/analyst-bases/:id/generate-docs', icon: <DatabaseOutlined /> },
          { title: lang === 'vi' ? 'Review docs trên BA Docs' : 'Review docs on BA Docs', description: '/ba/docs — xem specs đã sinh, bổ sung nếu cần', icon: <CheckCircleOutlined /> },
        ]} />
      </Card>

      {/* 7. Agent BA Integration */}
      <Card>
        <Title level={4}><RobotOutlined className="mr-2" />{t.agentBa}</Title>
        <Paragraph>{t.agentBaDesc}</Paragraph>

        <Divider orientation="left">{lang === 'vi' ? 'Cách Agent BA hoạt động' : 'How Agent BA works'}</Divider>
        <pre style={{ background: 'var(--bg-tertiary)', padding: 16, borderRadius: 8, fontSize: 12, lineHeight: 1.8, overflow: 'auto' }}>
{`1. [Webhook]     Lark gui event khi doc/base thay doi
2. [Snapshot]    Agent doc trang hien tai, so sanh voi ban truoc
3. [AI]          Ollama phan tich diff (fallback Claude neu confidence < 0.7)
4. [Card]        Gui card len Lark group:
                   - Noi dung thay doi
                   - AI hieu gi
                   - Muc do tin cay (confidence %)
                   - Nut [Dung roi] / [Chua dung]
5. [Confirm]     User bam "Dung roi" -> agent cap nhat wiki tu dong
6. [Learning]    Luu ket qua de hoc cho lan sau (few-shot)`}
        </pre>

        <Divider orientation="left">{lang === 'vi' ? 'API Endpoints (Agent BA)' : 'API Endpoints (Agent BA)'}</Divider>
        <Table size="small" pagination={false}
          dataSource={[
            { method: 'POST', path: '/webhook/doc-changed', desc: lang === 'vi' ? 'Trigger khi doc/wiki thay đổi' : 'Trigger on doc/wiki change' },
            { method: 'POST', path: '/webhook/base-changed', desc: lang === 'vi' ? 'Trigger khi base schema thay đổi' : 'Trigger on base schema change' },
            { method: 'POST', path: '/webhook/manual', desc: lang === 'vi' ? 'Trigger thủ công' : 'Manual trigger' },
            { method: 'GET', path: '/changes', desc: lang === 'vi' ? 'Danh sách thay đổi gần đây' : 'Recent changes list' },
            { method: 'GET', path: '/metrics', desc: lang === 'vi' ? 'Thống kê agent (confidence, model used)' : 'Agent metrics' },
            { method: 'GET', path: '/wiki-spaces', desc: lang === 'vi' ? 'Danh sách wiki spaces agent quản lý' : 'Agent-managed wiki spaces' },
          ].map((e, i) => ({ ...e, key: i }))}
          columns={[
            { title: 'Method', dataIndex: 'method', width: 80, render: (v: string) => <Tag color={v === 'POST' ? 'green' : 'blue'}>{v}</Tag> },
            { title: 'Path', dataIndex: 'path', width: 250, render: (v: string) => <Text code>{v}</Text> },
            { title: lang === 'vi' ? 'Mô tả' : 'Description', dataIndex: 'desc' },
          ]}
        />

        <Divider orientation="left">{lang === 'vi' ? 'Báo cáo tự động' : 'Auto reporting'}</Divider>
        <Paragraph>
          {lang === 'vi'
            ? 'Agent BA gửi card thông báo lên Lark group mỗi khi phát hiện thay đổi. Card bao gồm: nội dung thay đổi, phân tích AI (mục đích, ảnh hưởng, cách sử dụng), confidence score, và nút xác nhận. Khi user xác nhận "Đúng rồi", agent tự động cập nhật changelog trên wiki space tương ứng.'
            : 'Agent BA sends notification cards to Lark group whenever a change is detected. Cards include: change content, AI analysis (purpose, impact, usage), confidence score, and confirmation buttons. When user confirms, agent auto-updates changelog on the corresponding wiki space.'}
        </Paragraph>
        <Alert type="success" showIcon style={{ marginTop: 8 }}
          message={lang === 'vi'
            ? 'Agent BA chạy song song với lark-crawler. Crawler lấy dữ liệu chủ động (on-demand), Agent BA phát hiện thay đổi thụ động (event-driven). Kết hợp cả hai đảm bảo dữ liệu luôn cập nhật.'
            : 'Agent BA runs in parallel with lark-crawler. Crawler pulls data actively (on-demand), Agent BA detects changes passively (event-driven). Combining both ensures data is always up-to-date.'}
        />
      </Card>

      {/* 8. FAQ */}
      <Card>
        <Title level={4}><WarningOutlined className="mr-2" />{t.faq}</Title>
        <Collapse items={faqItems.map((f, i) => ({
          key: String(i),
          label: <Text strong>{f.q}</Text>,
          children: <Paragraph>{f.a}</Paragraph>,
        }))} />
      </Card>

      {/* 9. File structure */}
      <Card>
        <Title level={4}><DatabaseOutlined className="mr-2" />{lang === 'vi' ? 'Cấu trúc thư mục' : 'Directory structure'}</Title>
        <pre style={{ background: 'var(--bg-tertiary)', padding: 16, borderRadius: 8, fontSize: 12, lineHeight: 1.6 }}>
{`tools/lark-crawler/
  crawler.js            # Source code chinh
  package.json          # Scripts: login, scan, scan-all
  .lark-session/        # Browser session (gitignored)
  results/              # Ket qua scan (gitignored)
    <base_id>.json      # Du lieu crawl cua tung base
    _raw_automations.json  # Raw API response (debug)

api-lark-all/
  routes/
    analystBase.route.js  # Endpoints: sync-from-lark, cleanup-all, generate-docs
  models/
    AnalystBase.model.js  # Schema: groups > items > fields/views/workflows

agent-lark-ba/
  app/
    webhook.py           # FastAPI endpoints
    pipeline.py          # 7-step analysis pipeline
    ai_analyzer.py       # Ollama -> Claude fallback
    lark_notify.py       # Card builder
    database.py          # SQLite schema`}
        </pre>
      </Card>
    </div>
  )
}
