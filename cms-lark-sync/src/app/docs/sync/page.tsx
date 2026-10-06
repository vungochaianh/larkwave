'use client'

import { Card, Divider, Typography, Table, Tag, Alert, Collapse } from 'antd'
import {
  SyncOutlined,
  ThunderboltOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ApiOutlined,
} from '@ant-design/icons'
import TourGuide from '@/components/TourGuide'
import { tourSteps } from '@/lib/tourSteps'

const { Title, Paragraph, Text } = Typography

export default function DocsSyncPage() {
  return (
    <div className="space-y-3">
      <Title level={3}>
        <SyncOutlined className="mr-2" />
        Bitable Sync — Documentation
      </Title>

      <Alert
        type="info"
        showIcon
        className=""
        message="Tính năng mới"
        description="Bitable Sync thay thế cách tiếp cận cũ (gọi Lark Sync Table API qua CurlJob). Tính năng mới poll trực tiếp Bitable records qua tenant_access_token, không phụ thuộc session."
      />

      {/* ── Vấn đề cũ ──────────────────────────────────────────────────────── */}
      <Card className="">
        <Title level={4}>
          <WarningOutlined className="mr-2 text-yellow-500" />
          Vấn đề với cách cũ
        </Title>
        <Paragraph>
          Lark Bitable có tính năng <Text strong>Sync Table</Text> (bảng đồng bộ) cho phép
          đồng bộ dữ liệu từ nguồn bên ngoài. Tuy nhiên:
        </Paragraph>
        <ul className="list-disc ml-6 space-y-1">
          <li>Sync tự động của Lark giới hạn <Text strong>tối thiểu 1 tiếng</Text> mỗi lần</li>
          <li>
            Workaround cũ: dùng <Text code>CurlJob</Text> để gọi Lark sync API mỗi 1 phút
          </li>
          <li>
            <Text type="danger">Không còn hoạt động</Text>: Lark sync API giờ lưu dữ liệu theo
            <Text strong> session</Text> — mỗi lần gọi API tạo session riêng, dữ liệu không persist
          </li>
        </ul>
      </Card>

      {/* ── Giải pháp mới ───────────────────────────────────────────────────── */}
      <Card className="">
        <Title level={4}>
          <CheckCircleOutlined className="mr-2 text-green-500" />
          Giải pháp mới: Direct Polling
        </Title>
        <Paragraph>
          Thay vì trigger sync của Lark, ta <Text strong>poll trực tiếp records</Text> từ Bitable
          bằng Lark REST API:
        </Paragraph>

        <Table
          size="small"
          pagination={false}
          bordered
          dataSource={[
            { key: '1', feature: 'Authentication', old: 'Session-based (browser cookie)', new: 'tenant_access_token (app-level)' },
            { key: '2', feature: 'Interval tối thiểu', old: '1 tiếng (Lark limit)', new: '10 giây (configurable)' },
            { key: '3', feature: 'Phụ thuộc session', old: 'Có — mỗi call = session mới', new: 'Không — dùng app credential' },
            { key: '4', feature: 'Phát hiện thay đổi', old: 'Không', new: 'Có — so sánh MD5 hash của fields' },
            { key: '5', feature: 'Webhook callback', old: 'Không', new: 'Có — POST changes tới URL tùy chọn' },
            { key: '6', feature: 'Thông báo', old: 'Chỉ qua CurlJob notify', new: 'Telegram + Lark Bot trực tiếp' },
          ]}
          columns={[
            { title: '', dataIndex: 'feature', width: 180, render: (v) => <Text strong>{v}</Text> },
            { title: 'Cách cũ (CurlJob + Sync API)', dataIndex: 'old', render: (v) => <Text type="secondary">{v}</Text> },
            { title: 'Cách mới (Bitable Sync)', dataIndex: 'new', render: (v) => <Text type="success">{v}</Text> },
          ]}
        />
      </Card>

      {/* ── Cách sử dụng ────────────────────────────────────────────────────── */}
      <Card className="">
        <Title level={4}>
          <ThunderboltOutlined className="mr-2 text-blue-500" />
          Cách sử dụng
        </Title>

        <Collapse
          defaultActiveKey={['1', '2', '3', '4']}
          items={[
            {
              key: '1',
              label: 'Bước 1: Chuẩn bị Lark App',
              children: (
                <div>
                  <Paragraph>
                    Đảm bảo Lark App của bạn đã có quyền <Text code>bitable:app</Text> và{' '}
                    <Text code>drive:drive:readonly</Text>.
                  </Paragraph>
                  <Paragraph>
                    Biến môi trường cần thiết trên server:
                  </Paragraph>
                  <pre className="bg-neutral-100 dark:bg-neutral-800 p-3 rounded text-sm overflow-x-auto">
{`LARK_APP_ID=cli_xxxxxxxxxxxxx
LARK_APP_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx`}
                  </pre>
                  <Paragraph className="mt-2">
                    Server sẽ tự động lấy và cache <Text code>tenant_access_token</Text>.
                  </Paragraph>
                </div>
              ),
            },
            {
              key: '2',
              label: 'Bước 2: Paste URL — Hỗ trợ cả Base URL và Wiki URL',
              children: (
                <div>
                  <Paragraph>
                    Khi tạo sync job, bạn chỉ cần <Text strong>paste URL của Bitable</Text> vào
                    ô "Paste Lark URL" rồi nhấn <Tag color="blue">Resolve</Tag>.
                    Hệ thống tự động nhận diện và trích xuất App Token.
                  </Paragraph>

                  <Paragraph className="mt-3"><Text strong>Trường hợp 1: Base URL (trực tiếp)</Text></Paragraph>
                  <pre className="bg-neutral-100 dark:bg-neutral-800 p-3 rounded text-sm overflow-x-auto">
{`https://xxx.larksuite.com/base/bascnXXXXXXXX?table=tblXXXXXXXX&view=vewXXXXXXXX
                              ^^^^^^^^^^^^^^^^       ^^^^^^^^^^^^^^       ^^^^^^^^^^^^^^
                              App Token              Table ID             View ID`}
                  </pre>

                  <Paragraph className="mt-3"><Text strong>Trường hợp 2: Wiki URL (Bitable nằm trong Wiki/Knowledge Base)</Text></Paragraph>
                  <pre className="bg-neutral-100 dark:bg-neutral-800 p-3 rounded text-sm overflow-x-auto">
{`https://xxx.larksuite.com/wiki/wikcnXXXXXXXX?table=tblXXXXXXXX
                              ^^^^^^^^^^^^^^^^
                              Wiki Token (sẽ được resolve → App Token)`}
                  </pre>
                  <Paragraph className="mt-2">
                    Khi URL là wiki, hệ thống gọi <Text code>GET /wiki/v2/spaces/get_node</Text> để
                    resolve <Text code>wiki_token → obj_token</Text> (chính là App Token của Bitable).
                  </Paragraph>

                  <Alert
                    type="warning"
                    showIcon
                    className="mt-3"
                    message="Lưu ý cho Wiki URL"
                    description={
                      <ul className="list-disc ml-4 mt-1 space-y-1">
                        <li>Hệ thống sẽ thử dùng <Text strong>user token</Text> (nếu đã đăng nhập Lark) trước, rồi <Text strong>tenant token</Text></li>
                        <li>Nếu cả hai đều không có quyền, hệ thống sẽ hướng dẫn cách lấy App Token thủ công</li>
                        <li>Để resolve tự động: Lark App cần quyền <Text code>wiki:wiki:readonly</Text> hoặc bạn cần đăng nhập Lark ở trang <Text strong>Lark Accounts</Text></li>
                        <li><Text strong>Cách thủ công:</Text> Mở Bitable trong Wiki → nhấn "..." → "Open in new tab" → URL mới sẽ có dạng <Text code>/base/bascnXXX</Text></li>
                      </ul>
                    }
                  />

                  <Paragraph className="mt-3">
                    <Text strong>Nếu không muốn dùng URL:</Text> bạn cũng có thể nhập thủ công
                    App Token, Table ID, View ID vào các ô bên dưới.
                  </Paragraph>
                </div>
              ),
            },
            {
              key: '3',
              label: 'Bước 3: Tạo Sync Job',
              children: (
                <div>
                  <Paragraph>
                    Vào <Text strong>Sync &gt; Bitable Sync</Text>, nhấn{' '}
                    <Tag color="blue">New Sync</Tag> và điền:
                  </Paragraph>
                  <ul className="list-disc ml-6 space-y-1">
                    <li><Text strong>Name</Text>: tên mô tả (e.g. "Inventory 1-min sync")</li>
                    <li><Text strong>App Token</Text>: <Text code>bascnXXXXXXXX</Text></li>
                    <li><Text strong>Table ID</Text>: <Text code>tblXXXXXXXX</Text></li>
                    <li><Text strong>View ID</Text>: (tùy chọn) chỉ sync records trong view này</li>
                    <li><Text strong>Interval</Text>: 60 giây (= 1 phút). Tối thiểu 10 giây</li>
                    <li><Text strong>Webhook URL</Text>: (tùy chọn) POST changes tới URL này</li>
                  </ul>
                </div>
              ),
            },
            {
              key: '4',
              label: 'Bước 4: Theo dõi & quản lý',
              children: (
                <div>
                  <Paragraph>Trên trang Bitable Sync bạn có thể:</Paragraph>
                  <ul className="list-disc ml-6 space-y-1">
                    <li><ThunderboltOutlined /> <Text strong>Sync now</Text> — chạy sync ngay lập tức</li>
                    <li><Text strong>Toggle ON/OFF</Text> — bật/tắt sync tự động</li>
                    <li><Text strong>View Snapshot</Text> — xem trạng thái snapshot hiện tại</li>
                    <li><Text strong>Edit</Text> — thay đổi cấu hình (interval, webhook, etc.)</li>
                  </ul>
                  <Paragraph className="mt-2">
                    Mỗi lần sync, hệ thống sẽ hiển thị:
                  </Paragraph>
                  <ul className="list-disc ml-6 space-y-1">
                    <li><Text type="success">+N</Text> records mới được thêm</li>
                    <li><Text type="warning">~N</Text> records đã thay đổi</li>
                    <li><Text type="danger">-N</Text> records đã bị xóa</li>
                  </ul>
                </div>
              ),
            },
          ]}
        />
      </Card>

      {/* ── API Reference ───────────────────────────────────────────────────── */}
      <Card className="">
        <Title level={4}>
          <ApiOutlined className="mr-2" />
          API Reference
        </Title>

        <Table
          size="small"
          pagination={false}
          bordered
          dataSource={[
            { key: '1', method: 'GET', path: '/api/bitable-sync', desc: 'List all sync jobs' },
            { key: '2', method: 'POST', path: '/api/bitable-sync', desc: 'Create sync job' },
            { key: '3', method: 'GET', path: '/api/bitable-sync/:id', desc: 'Get sync job details' },
            { key: '4', method: 'PUT', path: '/api/bitable-sync/:id', desc: 'Update sync job' },
            { key: '5', method: 'DELETE', path: '/api/bitable-sync/:id', desc: 'Delete sync job' },
            { key: '6', method: 'PATCH', path: '/api/bitable-sync/:id/toggle', desc: 'Toggle enabled/disabled' },
            { key: '7', method: 'POST', path: '/api/bitable-sync/:id/execute', desc: 'Manual sync trigger' },
            { key: '8', method: 'GET', path: '/api/bitable-sync/:id/snapshot', desc: 'View latest snapshot' },
          ]}
          columns={[
            {
              title: 'Method',
              dataIndex: 'method',
              width: 80,
              render: (v) => {
                const color = v === 'GET' ? 'green' : v === 'POST' ? 'blue' : v === 'PUT' ? 'orange' : v === 'DELETE' ? 'red' : 'purple'
                return <Tag color={color}>{v}</Tag>
              },
            },
            { title: 'Path', dataIndex: 'path', render: (v) => <Text code>{v}</Text> },
            { title: 'Description', dataIndex: 'desc' },
          ]}
        />
      </Card>

      {/* ── Webhook Payload ──────────────────────────────────────────────────── */}
      <Card className="">
        <Title level={4}>Webhook Payload Format</Title>
        <Paragraph>
          Khi có thay đổi và webhook URL được cấu hình, hệ thống sẽ POST JSON:
        </Paragraph>
        <pre className="bg-neutral-100 dark:bg-neutral-800 p-3 rounded text-sm overflow-x-auto">
{`{
  "syncName": "Inventory Sync",
  "appToken": "bascnXXXXXXXX",
  "tableId": "tblXXXXXXXX",
  "timestamp": "2026-03-24T10:00:00.000Z",
  "stats": {
    "total": 150,
    "added": 3,
    "updated": 5,
    "deleted": 1
  },
  "changes": {
    "added": [
      { "record_id": "recXXX", "fields": { "Name": "...", ... } }
    ],
    "updated": [
      { "record_id": "recYYY", "fields": { "Name": "...", ... } }
    ],
    "deletedIds": ["recZZZ"]
  }
}`}
        </pre>
      </Card>

      {/* ── Cơ chế hoạt động ─────────────────────────────────────────────────── */}
      <Card className="">
        <Title level={4}>
          <ClockCircleOutlined className="mr-2" />
          Cơ chế hoạt động
        </Title>
        <ol className="list-decimal ml-6 space-y-2">
          <li>
            Server lấy <Text code>tenant_access_token</Text> từ Lark (tự động refresh, cache 2 giờ)
          </li>
          <li>
            Gọi <Text code>GET /bitable/v1/apps/:appToken/tables/:tableId/records</Text> để lấy
            toàn bộ records (auto-paginate, 500 records/page)
          </li>
          <li>
            Tạo <Text strong>snapshot</Text> mới: map mỗi <Text code>record_id</Text> với MD5 hash
            của <Text code>fields</Text>
          </li>
          <li>
            So sánh snapshot mới với snapshot cũ trong MongoDB:
            <ul className="list-disc ml-6 mt-1">
              <li><Text type="success">Added</Text>: record_id có trong new nhưng không có trong old</li>
              <li><Text type="warning">Updated</Text>: record_id có trong cả hai nhưng hash khác</li>
              <li><Text type="danger">Deleted</Text>: record_id có trong old nhưng không có trong new</li>
            </ul>
          </li>
          <li>Lưu snapshot mới vào MongoDB</li>
          <li>Nếu có thay đổi: gửi webhook + thông báo (nếu được cấu hình)</li>
        </ol>
      </Card>

      {/* ── Lưu ý ───────────────────────────────────────────────────────────── */}
      <Card className="">
        <Title level={4}>
          <WarningOutlined className="mr-2 text-yellow-500" />
          Lưu ý quan trọng
        </Title>
        <ul className="list-disc ml-6 space-y-2">
          <li>
            <Text strong>Rate limit</Text>: Lark API giới hạn ~100 requests/phút cho mỗi app.
            Nếu bạn có nhiều sync job chạy cùng lúc, đặt interval ≥ 60s.
          </li>
          <li>
            <Text strong>Bảng lớn</Text>: Nếu bảng có &gt;10,000 records, mỗi lần sync sẽ fetch
            nhiều pages. Cân nhắc dùng View ID để giới hạn scope.
          </li>
          <li>
            <Text strong>tenant_access_token</Text> chỉ truy cập được bảng mà Lark App có quyền.
            Đảm bảo app đã được thêm vào base (Base Settings → Add App).
          </li>
          <li>
            Snapshot được lưu trong MongoDB collection <Text code>bitable_syncs</Text>,
            field <Text code>_snapshot</Text>. Với bảng rất lớn, document này có thể chiếm
            nhiều dung lượng.
          </li>
        </ul>
      </Card>
      <TourGuide pageKey="docs-sync" steps={tourSteps['docs-sync']} />
    </div>
  )
}
