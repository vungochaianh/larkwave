'use client'

import { Card, Collapse, Divider, Table, Tag, Typography, Alert, Tabs } from 'antd'
import {
  ApiOutlined,
  BulbOutlined,
  CloudSyncOutlined,
  DatabaseOutlined,
  FilterOutlined,
  FormOutlined,
  RocketOutlined,
  SearchOutlined,
  SwapOutlined,
  ThunderboltOutlined,
  ToolOutlined,
} from '@ant-design/icons'
import TourGuide from '@/components/TourGuide'
import { tourSteps } from '@/lib/tourSteps'

const { Title, Paragraph, Text } = Typography

export default function BitableIdeasPage() {
  return (
    <div className="space-y-3">
      <Title level={3}>
        <BulbOutlined className="mr-2" />
        Lark Bitable — API Reference & Ideas
      </Title>

      <Alert
        type="info"
        showIcon
        className=""
        message="Tài liệu tổng hợp từ Lark Open Platform API"
        description="Trang này tổng hợp các khả năng API của Lark Bitable, ý tưởng ứng dụng, và hướng dẫn sử dụng cho dự án CMS Hoa Nam."
      />

      <Tabs
        defaultActiveKey="ideas"
        items={[
          {
            key: 'ideas',
            label: (
              <span><RocketOutlined className="mr-1" />Ideas & Use Cases</span>
            ),
            children: <IdeasTab />,
          },
          {
            key: 'api',
            label: (
              <span><ApiOutlined className="mr-1" />API Reference</span>
            ),
            children: <ApiTab />,
          },
          {
            key: 'guides',
            label: (
              <span><ToolOutlined className="mr-1" />Hướng dẫn thực hành</span>
            ),
            children: <GuidesTab />,
          },
          {
            key: 'limits',
            label: (
              <span><ThunderboltOutlined className="mr-1" />Limits & Tips</span>
            ),
            children: <LimitsTab />,
          },
        ]}
      />
      <TourGuide pageKey="docs-sync" steps={tourSteps['docs-sync']} />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tab 1: Ideas & Use Cases
// ═══════════════════════════════════════════════════════════════════════════════

function IdeasTab() {
  return (
    <div className="space-y-4">
      <Card>
        <Title level={4}>
          <SearchOutlined className="mr-2 text-blue-500" />
          1. Smart Search & Filter trên CMS
        </Title>
        <Paragraph>
          Thay vì chỉ list tất cả records, dùng <Text code>POST /records/search</Text> API mới
          (thay thế GET /records đã deprecated) với khả năng:
        </Paragraph>
        <ul className="list-disc ml-6 space-y-1">
          <li><Text strong>Filter nâng cao</Text>: kết hợp AND/OR, operators: is, isNot, contains, isEmpty, isGreater, isLess...</li>
          <li><Text strong>Sort đa field</Text>: sắp xếp theo nhiều cột cùng lúc</li>
          <li><Text strong>Field selection</Text>: chỉ lấy các cột cần thiết (tối đa 200 fields)</li>
          <li><Text strong>Auto pagination</Text>: tự động phân trang với page_token</li>
        </ul>
        <Paragraph className="mt-2">
          <Text type="success">Ứng dụng:</Text> Xây trang tìm kiếm cho nhân viên lookup hồ sơ,
          tra cứu đơn hàng, filter theo trạng thái/ngày tháng — trực tiếp từ CMS mà không cần mở Lark.
        </Paragraph>
      </Card>

      <Card>
        <Title level={4}>
          <SwapOutlined className="mr-2 text-green-500" />
          2. Batch Import / Export dữ liệu
        </Title>
        <Paragraph>
          Lark hỗ trợ batch operations cực mạnh:
        </Paragraph>
        <ul className="list-disc ml-6 space-y-1">
          <li><Text code>batch_create</Text>: tạo tối đa <Text strong>1,000 records/lần</Text> (50 req/s)</li>
          <li><Text code>batch_update</Text>: cập nhật tối đa <Text strong>1,000 records/lần</Text> (50 req/s)</li>
          <li><Text code>batch_delete</Text>: xoá hàng loạt records</li>
        </ul>
        <Paragraph className="mt-2">
          <Text type="success">Ứng dụng:</Text>
        </Paragraph>
        <ul className="list-disc ml-6 space-y-1">
          <li>Import dữ liệu từ Excel/CSV vào Bitable qua CMS</li>
          <li>Sync dữ liệu từ hệ thống khác (ERP, WMS) vào Lark mỗi ngày</li>
          <li>Export dữ liệu Bitable ra JSON/CSV để backup hoặc báo cáo</li>
          <li>Đồng bộ 2 chiều: CMS ↔ Lark Bitable</li>
        </ul>
      </Card>

      <Card>
        <Title level={4}>
          <CloudSyncOutlined className="mr-2 text-purple-500" />
          3. Two-way Sync (Đồng bộ 2 chiều)
        </Title>
        <Paragraph>
          Kết hợp Bitable Sync (đọc từ Lark) + Batch Update (ghi vào Lark) để tạo đồng bộ 2 chiều:
        </Paragraph>
        <ol className="list-decimal ml-6 space-y-1">
          <li>Bitable Sync đọc records từ Lark → lưu snapshot vào MongoDB</li>
          <li>CMS user chỉnh sửa dữ liệu trên web</li>
          <li>CMS ghi ngược thay đổi vào Lark bằng batch_update</li>
          <li>Phát hiện conflict: nếu Lark record đã bị sửa kể từ lần sync cuối → cảnh báo</li>
        </ol>
        <Paragraph className="mt-2">
          <Text type="success">Ứng dụng:</Text> Nhân viên dùng CMS để cập nhật hồ sơ, số liệu →
          tự động phản ánh trên Lark Bitable. Quản lý vẫn xem được trên Lark như bình thường.
        </Paragraph>
      </Card>

      <Card>
        <Title level={4}>
          <FormOutlined className="mr-2 text-orange-500" />
          4. Custom Forms → Bitable
        </Title>
        <Paragraph>
          Thay vì dùng Lark Form (giao diện giới hạn), tạo form custom trên CMS:
        </Paragraph>
        <ul className="list-disc ml-6 space-y-1">
          <li>Thiết kế form UI với Ant Design (validation, conditional fields, file upload)</li>
          <li>Submit → <Text code>POST /records</Text> tạo record trực tiếp vào Bitable</li>
          <li>Upload file → <Text code>POST /media/upload_all</Text> → lấy file_token → gắn vào record</li>
          <li>Share link form cho đối tác/khách hàng — không cần tài khoản Lark</li>
        </ul>
        <Paragraph className="mt-2">
          <Text type="success">Ứng dụng:</Text> Form đăng ký nhà cung cấp, form báo cáo sự cố,
          form yêu cầu xuất hàng — dữ liệu tự động vào Bitable để team xử lý.
        </Paragraph>
      </Card>

      <Card>
        <Title level={4}>
          <FilterOutlined className="mr-2 text-cyan-500" />
          5. Dashboard & Reporting trên CMS
        </Title>
        <Paragraph>
          Dùng Search API + filter để build dashboard trực tiếp trên CMS:
        </Paragraph>
        <ul className="list-disc ml-6 space-y-1">
          <li>Tổng hợp số liệu từ nhiều bảng Bitable khác nhau</li>
          <li>Charts (Ant Design Charts) hiển thị trends, so sánh</li>
          <li>Filter theo ngày, phòng ban, trạng thái — realtime</li>
          <li>Auto-refresh mỗi phút (Bitable Sync)</li>
        </ul>
      </Card>

      <Card>
        <Title level={4}>
          <DatabaseOutlined className="mr-2 text-red-500" />
          6. Cross-table Operations
        </Title>
        <Paragraph>
          Lark Bitable hỗ trợ link records giữa các bảng. Qua API:
        </Paragraph>
        <ul className="list-disc ml-6 space-y-1">
          <li>Đọc linked records: field type "single_link" / "duplex_link" trả về <Text code>link_record_ids</Text></li>
          <li>Tạo links: ghi <Text code>{`{"link_record_ids": ["recXXX"]}`}</Text> vào field</li>
          <li>Lookup qua links: fetch record A → lấy link IDs → fetch records từ bảng B</li>
        </ul>
        <Paragraph className="mt-2">
          <Text type="success">Ứng dụng:</Text> Build view tổng hợp thông tin từ nhiều bảng
          (VD: Nhân viên + Phòng ban + Chấm công) trên một trang CMS.
        </Paragraph>
      </Card>

      <Card>
        <Title level={4}>
          <ThunderboltOutlined className="mr-2 text-yellow-500" />
          7. Webhook → Auto-process
        </Title>
        <Paragraph>
          Kết hợp Lark Base Automation (webhook) + CMS processing:
        </Paragraph>
        <ol className="list-decimal ml-6 space-y-1">
          <li>Cấu hình Lark Base Automation: khi record thay đổi → gửi HTTP Request tới CMS webhook</li>
          <li>CMS nhận webhook → process (validate, enrich, transform)</li>
          <li>CMS ghi kết quả ngược lại Lark bằng <Text code>batch_update</Text></li>
          <li>Thông báo kết quả qua Telegram/Lark Bot</li>
        </ol>
        <Paragraph className="mt-2">
          <Text type="success">Ứng dụng:</Text> Khi nhân viên nhập đơn hàng mới vào Lark →
          CMS tự động tính giá, kiểm kho, gán mã tracking, ghi ngược lại Lark.
        </Paragraph>
      </Card>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tab 2: API Reference
// ═══════════════════════════════════════════════════════════════════════════════

function ApiTab() {
  const endpoints = [
    // Records
    { group: 'Records', method: 'POST', path: '/records/search', desc: 'Search records (filter, sort, field select)', rate: '20/s', note: 'Thay thế GET /records (deprecated)' },
    { group: 'Records', method: 'GET', path: '/records', desc: 'List records (deprecated)', rate: '20/s', note: 'Dùng search thay thế' },
    { group: 'Records', method: 'GET', path: '/records/:record_id', desc: 'Get single record', rate: '20/s', note: '' },
    { group: 'Records', method: 'POST', path: '/records', desc: 'Create single record', rate: '50/s', note: '' },
    { group: 'Records', method: 'POST', path: '/records/batch_create', desc: 'Create max 1000 records', rate: '50/s', note: 'Idempotent với client_token' },
    { group: 'Records', method: 'PUT', path: '/records/:record_id', desc: 'Update single record', rate: '50/s', note: '' },
    { group: 'Records', method: 'POST', path: '/records/batch_update', desc: 'Update max 1000 records', rate: '50/s', note: 'Cần record_id' },
    { group: 'Records', method: 'DELETE', path: '/records/:record_id', desc: 'Delete single record', rate: '50/s', note: '' },
    { group: 'Records', method: 'POST', path: '/records/batch_delete', desc: 'Delete max 1000 records', rate: '50/s', note: '' },
    // Tables
    { group: 'Tables', method: 'GET', path: '/tables', desc: 'List tables in a base', rate: '20/s', note: '' },
    { group: 'Tables', method: 'POST', path: '/tables', desc: 'Create table', rate: '10/s', note: '' },
    { group: 'Tables', method: 'POST', path: '/tables/batch_create', desc: 'Create multiple tables', rate: '10/s', note: '' },
    { group: 'Tables', method: 'DELETE', path: '/tables/:table_id', desc: 'Delete table', rate: '10/s', note: '' },
    // Fields
    { group: 'Fields', method: 'GET', path: '/tables/:table_id/fields', desc: 'List fields', rate: '20/s', note: '' },
    { group: 'Fields', method: 'POST', path: '/tables/:table_id/fields', desc: 'Create field', rate: '10/s', note: 'Max 300 fields/table' },
    { group: 'Fields', method: 'PUT', path: '/tables/:table_id/fields/:field_id', desc: 'Update field', rate: '10/s', note: '' },
    { group: 'Fields', method: 'DELETE', path: '/tables/:table_id/fields/:field_id', desc: 'Delete field', rate: '10/s', note: '' },
    // Views
    { group: 'Views', method: 'GET', path: '/tables/:table_id/views', desc: 'List views', rate: '20/s', note: '' },
    { group: 'Views', method: 'POST', path: '/tables/:table_id/views', desc: 'Create view', rate: '10/s', note: 'Max 200 views/table' },
    { group: 'Views', method: 'PATCH', path: '/tables/:table_id/views/:view_id', desc: 'Update view', rate: '10/s', note: '' },
    // App
    { group: 'Base (App)', method: 'POST', path: '/', desc: 'Create new base', rate: '10/s', note: '' },
    { group: 'Base (App)', method: 'POST', path: '/:app_token/copy', desc: 'Copy base', rate: '10/s', note: '' },
    { group: 'Base (App)', method: 'GET', path: '/:app_token', desc: 'Get base metadata', rate: '20/s', note: '' },
    // Roles
    { group: 'Permissions', method: 'GET', path: '/:app_token/roles', desc: 'List custom roles', rate: '10/s', note: 'Max 30 roles' },
    { group: 'Permissions', method: 'POST', path: '/:app_token/roles', desc: 'Create role', rate: '10/s', note: '' },
    { group: 'Permissions', method: 'POST', path: '/:app_token/roles/:role_id/members', desc: 'Add members to role', rate: '10/s', note: 'Max 200 members/role' },
  ]

  return (
    <div className="space-y-4">
      <Alert
        type="warning"
        showIcon
        className="mb-3"
        message="Base path cho tất cả endpoints"
        description={
          <Text code className="text-sm">
            https://open.larksuite.com/open-apis/bitable/v1/apps/:app_token/tables/:table_id
          </Text>
        }
      />

      <Table
        size="small"
        pagination={false}
        bordered
        dataSource={endpoints.map((e, i) => ({ ...e, key: i }))}
        columns={[
          {
            title: 'Group',
            dataIndex: 'group',
            width: 110,
            render: (v, _, idx) => {
              const prev = idx > 0 ? endpoints[idx - 1].group : ''
              return v !== prev ? <Text strong>{v}</Text> : ''
            },
            onCell: (_, idx) => {
              const cur = endpoints[idx!].group
              const prev = idx! > 0 ? endpoints[idx! - 1].group : ''
              if (cur !== prev) {
                let span = 1
                for (let i = idx! + 1; i < endpoints.length && endpoints[i].group === cur; i++) span++
                return { rowSpan: span }
              }
              return { rowSpan: 0 }
            },
          },
          {
            title: 'Method',
            dataIndex: 'method',
            width: 70,
            render: (v) => {
              const c = ({ GET: 'green', POST: 'blue', PUT: 'orange', PATCH: 'purple', DELETE: 'red' } as Record<string, string>)[v] || 'default'
              return <Tag color={c} className="text-xs">{v}</Tag>
            },
          },
          { title: 'Path', dataIndex: 'path', render: (v) => <Text code className="text-xs">{v}</Text> },
          { title: 'Description', dataIndex: 'desc', className: 'text-xs' },
          { title: 'Rate', dataIndex: 'rate', width: 60, className: 'text-xs font-mono' },
          { title: 'Note', dataIndex: 'note', className: 'text-xs text-neutral-400' },
        ]}
      />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tab 3: Guides
// ═══════════════════════════════════════════════════════════════════════════════

function GuidesTab() {
  return (
    <div className="space-y-4">
      <Collapse
        defaultActiveKey={['search', 'batch', 'fieldtypes']}
        items={[
          {
            key: 'search',
            label: '1. Search Records — Filter & Sort',
            children: (
              <div>
                <Paragraph>
                  <Text code>POST /bitable/v1/apps/:app_token/tables/:table_id/records/search</Text>
                </Paragraph>
                <Paragraph>Request body:</Paragraph>
                <pre className="bg-neutral-100 dark:bg-neutral-800 p-3 rounded text-xs overflow-x-auto">
{`{
  "view_id": "vewXXXXXXXX",       // optional — ignored if filter/sort provided
  "field_names": ["Name", "Status", "Date"],  // max 200 fields
  "sort": [
    { "field_name": "Date", "desc": true },
    { "field_name": "Name", "desc": false }
  ],
  "filter": {
    "conjunction": "and",           // "and" | "or"
    "conditions": [
      {
        "field_name": "Status",
        "operator": "is",           // see operator table below
        "value": ["Active"]
      },
      {
        "field_name": "Amount",
        "operator": "isGreater",
        "value": ["10000"]          // always string array!
      }
    ]
  },
  "automatic_fields": true,        // include created_time, modified_time, etc.
  "page_size": 500                  // max 500
}`}
                </pre>

                <Paragraph className="mt-3"><Text strong>Filter Operators:</Text></Paragraph>
                <Table
                  size="small"
                  pagination={false}
                  bordered
                  dataSource={[
                    { key: '1', op: 'is', desc: 'Bằng', types: 'Tất cả' },
                    { key: '2', op: 'isNot', desc: 'Khác', types: 'Tất cả trừ Date' },
                    { key: '3', op: 'contains', desc: 'Chứa', types: 'Text, Select' },
                    { key: '4', op: 'doesNotContain', desc: 'Không chứa', types: 'Text, Select' },
                    { key: '5', op: 'isEmpty', desc: 'Trống', types: 'Tất cả' },
                    { key: '6', op: 'isNotEmpty', desc: 'Không trống', types: 'Tất cả' },
                    { key: '7', op: 'isGreater', desc: 'Lớn hơn', types: 'Number, Date' },
                    { key: '8', op: 'isGreaterEqual', desc: 'Lớn hơn hoặc bằng', types: 'Number' },
                    { key: '9', op: 'isLess', desc: 'Nhỏ hơn', types: 'Number, Date' },
                    { key: '10', op: 'isLessEqual', desc: 'Nhỏ hơn hoặc bằng', types: 'Number' },
                  ]}
                  columns={[
                    { title: 'Operator', dataIndex: 'op', render: (v) => <Text code>{v}</Text>, width: 150 },
                    { title: 'Mô tả', dataIndex: 'desc' },
                    { title: 'Field types', dataIndex: 'types' },
                  ]}
                />
              </div>
            ),
          },
          {
            key: 'batch',
            label: '2. Batch Create / Update — Import dữ liệu',
            children: (
              <div>
                <Paragraph>
                  <Text strong>Batch Create</Text> (tối đa 1,000 records/lần, 50 req/s):
                </Paragraph>
                <pre className="bg-neutral-100 dark:bg-neutral-800 p-3 rounded text-xs overflow-x-auto">
{`POST /bitable/v1/apps/:app_token/tables/:table_id/records/batch_create

{
  "records": [
    {
      "fields": {
        "Name": "Nguyen Van A",
        "Status": "Active",
        "Amount": 50000,
        "Date": 1711929600000,         // timestamp milliseconds
        "Tags": ["VIP", "Export"],       // multi-select
        "Checkbox": true,
        "Link": {
          "text": "Website",
          "link": "https://example.com"
        }
      }
    },
    {
      "fields": {
        "Name": "Tran Thi B",
        "Status": "Pending",
        "Amount": 30000
      }
    }
  ]
}`}
                </pre>

                <Paragraph className="mt-3">
                  <Text strong>Batch Update</Text> (cần record_id):
                </Paragraph>
                <pre className="bg-neutral-100 dark:bg-neutral-800 p-3 rounded text-xs overflow-x-auto">
{`POST /bitable/v1/apps/:app_token/tables/:table_id/records/batch_update

{
  "records": [
    {
      "record_id": "recABC123",
      "fields": {
        "Status": "Completed",
        "Amount": 55000
      }
    },
    {
      "record_id": "recDEF456",
      "fields": {
        "Status": "Cancelled"
      }
    }
  ]
}`}
                </pre>

                <Alert
                  type="warning"
                  showIcon
                  className="mt-3"
                  message="Lưu ý quan trọng"
                  description={
                    <ul className="list-disc ml-4 space-y-1">
                      <li>Batch operations là all-or-nothing — 1 record lỗi = cả batch fail</li>
                      <li>Tránh concurrent writes vào cùng 1 table — dễ conflict (error 1254291)</li>
                      <li>Dùng <Text code>client_token</Text> (UUID v4) cho batch_create để idempotent</li>
                      <li>Synced tables (bảng đồng bộ) <Text strong>không hỗ trợ</Text> ghi/update records</li>
                    </ul>
                  }
                />
              </div>
            ),
          },
          {
            key: 'fieldtypes',
            label: '3. Field Types — Format dữ liệu khi ghi',
            children: (
              <div>
                <Table
                  size="small"
                  pagination={false}
                  bordered
                  dataSource={[
                    { key: '1', type: 'Text', code: '1', format: '"Hello World"', note: 'String hoặc rich text array' },
                    { key: '2', type: 'Number', code: '2', format: '12345.67', note: 'Number (not string)' },
                    { key: '3', type: 'Single Select', code: '3', format: '"Option A"', note: 'Tên option (tự tạo nếu chưa có)' },
                    { key: '4', type: 'Multi Select', code: '4', format: '["A", "B"]', note: 'Array of strings' },
                    { key: '5', type: 'Date', code: '5', format: '1711929600000', note: 'Timestamp milliseconds' },
                    { key: '6', type: 'Checkbox', code: '7', format: 'true / false', note: 'Boolean' },
                    { key: '7', type: 'Person', code: '11', format: '[{"id": "ou_xxx"}]', note: 'Array of open_id objects' },
                    { key: '8', type: 'Phone', code: '13', format: '"0335824450"', note: 'String' },
                    { key: '9', type: 'URL', code: '15', format: '{"text":"...", "link":"..."}', note: 'Object with text + link' },
                    { key: '10', type: 'Attachment', code: '17', format: '[{"file_token":"..."}]', note: 'Upload file trước, lấy token' },
                    { key: '11', type: 'Single Link', code: '18', format: '{"link_record_ids":["recXXX"]}', note: 'Liên kết bảng khác' },
                    { key: '12', type: 'Duplex Link', code: '21', format: '{"link_record_ids":["recXXX"]}', note: 'Liên kết 2 chiều' },
                    { key: '13', type: 'Location', code: '22', format: '{"location":"lng,lat", ...}', note: 'Object với name, address, location' },
                    { key: '14', type: 'Currency', code: '21', format: '1500.50', note: 'Number' },
                    { key: '15', type: 'Rating', code: '23', format: '4', note: 'Integer 1-5' },
                    { key: '16', type: 'Progress', code: '22', format: '0.75', note: 'Float 0-1' },
                  ]}
                  columns={[
                    { title: 'Type', dataIndex: 'type', width: 120, render: (v) => <Text strong>{v}</Text> },
                    { title: 'Code', dataIndex: 'code', width: 50, render: (v) => <Text code className="text-xs">{v}</Text> },
                    { title: 'Write Format', dataIndex: 'format', render: (v) => <Text code className="text-xs">{v}</Text> },
                    { title: 'Note', dataIndex: 'note', className: 'text-xs' },
                  ]}
                />
              </div>
            ),
          },
          {
            key: 'auth',
            label: '4. Authentication — tenant vs user token',
            children: (
              <div>
                <Table
                  size="small"
                  pagination={false}
                  bordered
                  dataSource={[
                    { key: '1', feature: 'Cách lấy', tenant: 'POST /auth/v3/tenant_access_token/internal', user: 'OAuth 2.0 flow' },
                    { key: '2', feature: 'Thời hạn', tenant: '~2 giờ (auto refresh)', user: '~2 giờ (cần re-login)' },
                    { key: '3', feature: 'Scope', tenant: 'App-level — truy cập mọi base app được thêm vào', user: 'User-level — truy cập base user có quyền' },
                    { key: '4', feature: 'Dùng cho', tenant: 'Server-side automation, scheduled sync', user: 'User-initiated actions (browse, edit)' },
                    { key: '5', feature: 'Yêu cầu', tenant: 'App phải được Add vào Base', user: 'User phải có quyền trên Base' },
                  ]}
                  columns={[
                    { title: '', dataIndex: 'feature', width: 120, render: (v) => <Text strong>{v}</Text> },
                    { title: 'tenant_access_token', dataIndex: 'tenant' },
                    { title: 'user_access_token', dataIndex: 'user' },
                  ]}
                />
              </div>
            ),
          },
        ]}
      />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tab 4: Limits & Tips
// ═══════════════════════════════════════════════════════════════════════════════

function LimitsTab() {
  return (
    <div className="space-y-4">
      <Card title="Rate Limits">
        <Table
          size="small"
          pagination={false}
          bordered
          dataSource={[
            { key: '1', op: 'Search / List records', rate: '20 req/s', note: '' },
            { key: '2', op: 'Create / Update / Delete records', rate: '50 req/s', note: '' },
            { key: '3', op: 'Batch operations (create/update/delete)', rate: '50 req/s', note: 'Max 1,000 records/batch' },
            { key: '4', op: 'Field CRUD', rate: '10 req/s', note: '' },
            { key: '5', op: 'Table / View CRUD', rate: '10 req/s', note: '' },
          ]}
          columns={[
            { title: 'Operation', dataIndex: 'op' },
            { title: 'Rate Limit', dataIndex: 'rate', width: 120 },
            { title: 'Note', dataIndex: 'note' },
          ]}
        />
      </Card>

      <Card title="Resource Limits">
        <Table
          size="small"
          pagination={false}
          bordered
          dataSource={[
            { key: '1', resource: 'Records / table', limit: '20,000', note: 'Synced tables có thể khác' },
            { key: '2', resource: 'Fields / table', limit: '300', note: 'Formula fields max 100' },
            { key: '3', resource: 'Views / table', limit: '200', note: '' },
            { key: '4', resource: 'Tables + Dashboards / base', limit: '100', note: '' },
            { key: '5', resource: 'Custom roles / base', limit: '30', note: '' },
            { key: '6', resource: 'Members / role', limit: '200', note: '' },
            { key: '7', resource: 'Records per search/list', limit: '500 / page', note: '' },
            { key: '8', resource: 'Records per batch op', limit: '1,000', note: '' },
            { key: '9', resource: 'Field select per search', limit: '200 fields', note: '' },
            { key: '10', resource: 'Sort conditions', limit: '100', note: '' },
          ]}
          columns={[
            { title: 'Resource', dataIndex: 'resource' },
            { title: 'Limit', dataIndex: 'limit', width: 120, render: (v) => <Text strong>{v}</Text> },
            { title: 'Note', dataIndex: 'note', className: 'text-xs text-neutral-400' },
          ]}
        />
      </Card>

      <Card title="Common Error Codes">
        <Table
          size="small"
          pagination={false}
          bordered
          dataSource={[
            { key: '1', code: '1254302', name: 'RolePermNotAllow', fix: 'Thêm App vào Base: Base Settings → Add App' },
            { key: '2', code: '1254001', name: 'AppTokenNotFound', fix: 'Kiểm tra app_token có đúng không' },
            { key: '3', code: '1254004', name: 'TableNotFound', fix: 'Kiểm tra table_id' },
            { key: '4', code: '1254043', name: 'RecordNotFound', fix: 'record_id không tồn tại' },
            { key: '5', code: '1254045', name: 'FieldNotFound', fix: 'Tên field sai hoặc không có quyền' },
            { key: '6', code: '1254104', name: 'BatchSizeExceeded', fix: 'Giảm xuống ≤ 1,000 records' },
            { key: '7', code: '1254291', name: 'WriteConflict', fix: 'Giảm concurrent writes, thêm delay' },
            { key: '8', code: '1254015', name: 'FieldTypeMismatch', fix: 'Format dữ liệu sai type' },
            { key: '9', code: '99991668', name: 'TokenInvalid', fix: 'Refresh token' },
            { key: '10', code: '1254607', name: 'Timeout', fix: 'Retry — server xử lý chậm' },
          ]}
          columns={[
            { title: 'Code', dataIndex: 'code', width: 90, render: (v) => <Text code className="text-xs">{v}</Text> },
            { title: 'Name', dataIndex: 'name', width: 160 },
            { title: 'Cách fix', dataIndex: 'fix' },
          ]}
        />
      </Card>

      <Card title="Tips thực hành">
        <ul className="list-disc ml-6 space-y-2">
          <li>
            <Text strong>Dùng Search thay List:</Text> GET /records đã deprecated.
            POST /records/search mạnh hơn nhiều (filter, sort, field select).
          </li>
          <li>
            <Text strong>Batch thay single:</Text> Thay vì 100 lần POST /records,
            gom lại 1 lần POST /records/batch_create — nhanh hơn 50x.
          </li>
          <li>
            <Text strong>Field names chính xác:</Text> Lark phân biệt hoa/thường
            và khoảng trắng. "Tên NV" ≠ "Tên nv" ≠ "TênNV".
          </li>
          <li>
            <Text strong>Date là timestamp:</Text> Luôn dùng milliseconds (VD: 1711929600000),
            không dùng string "2024-03-25".
          </li>
          <li>
            <Text strong>Value luôn là string array trong filter:</Text>{' '}
            <Text code>{`"value": ["10000"]`}</Text> — dù là number cũng wrap trong string array.
          </li>
          <li>
            <Text strong>Concurrent write:</Text> Chỉ nên 1 write operation cùng lúc cho 1 table.
            Nếu cần batch, xếp hàng tuần tự.
          </li>
          <li>
            <Text strong>client_token cho idempotent:</Text> Truyền UUID v4 trong batch_create
            để tránh tạo duplicate khi retry.
          </li>
        </ul>
      </Card>
    </div>
  )
}
