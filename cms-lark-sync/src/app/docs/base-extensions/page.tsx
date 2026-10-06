'use client'

import { Card, Collapse, Divider, Table, Tag, Typography, Alert, Tabs, Steps } from 'antd'
import {
  ApiOutlined,
  CloudServerOutlined,
  CodeOutlined,
  DesktopOutlined,
  ExperimentOutlined,
  LaptopOutlined,
  LinkOutlined,
  RocketOutlined,
  ThunderboltOutlined,
  ToolOutlined,
} from '@ant-design/icons'
import TourGuide from '@/components/TourGuide'
import { tourSteps } from '@/lib/tourSteps'

const { Title, Paragraph, Text } = Typography

export default function BaseExtensionsPage() {
  return (
    <div className="space-y-3">
      <Title level={3}>
        <ExperimentOutlined className="mr-2" />
        Base Extensions — Development Guide
      </Title>

      <Alert
        type="info"
        showIcon
        className=""
        message="Base Extensions (Beta)"
        description="Base Extensions cho phép viết code custom chạy trực tiếp trong Lark Bitable. Hỗ trợ cả front-end script (tương tác UI) và server-side script (chạy nền, tự động hoá)."
      />

      <Tabs
        defaultActiveKey="overview"
        items={[
          {
            key: 'overview',
            label: <span><RocketOutlined className="mr-1" />Tổng quan</span>,
            children: <OverviewTab />,
          },
          {
            key: 'frontend',
            label: <span><DesktopOutlined className="mr-1" />Front-end Script</span>,
            children: <FrontendTab />,
          },
          {
            key: 'serverside',
            label: <span><CloudServerOutlined className="mr-1" />Server-side Script</span>,
            children: <ServersideTab />,
          },
          {
            key: 'ideas',
            label: <span><ThunderboltOutlined className="mr-1" />Ideas cho CMS</span>,
            children: <IdeasTab />,
          },
          {
            key: 'templates',
            label: <span><CodeOutlined className="mr-1" />Code Templates</span>,
            children: <TemplatesTab />,
          },
        ]}
      />
      <TourGuide pageKey="docs-sync" steps={tourSteps['docs-sync']} />
    </div>
  )
}

function OverviewTab() {
  return (
    <div className="space-y-4">
      <Card>
        <Title level={4}>Base Extensions là gì?</Title>
        <Paragraph>
          "Base Extensions" là khả năng mở rộng linh hoạt của Lark Bitable.
          User có thể viết code để implement custom functionalities, xây dựng hệ thống nghiệp vụ mạnh hơn.
        </Paragraph>

        <Title level={5}>Use cases phổ biến:</Title>
        <ul className="list-disc ml-6 space-y-2">
          <li>
            <Text strong>Batch Data Processing</Text>: Trích xuất dữ liệu cụ thể từ
            dữ liệu phi cấu trúc trong một field và sử dụng ở field khác
          </li>
          <li>
            <Text strong>Custom Functions</Text>: Viết functions riêng để tăng khả năng tính toán
          </li>
          <li>
            <Text strong>Data Synchronization</Text>: Đọc/ghi dữ liệu và kết nối với hệ thống bên thứ ba
          </li>
        </ul>
      </Card>

      <Card>
        <Title level={5}>Front-end Script vs Server-side Script</Title>
        <Table
          size="small"
          pagination={false}
          bordered
          dataSource={[
            { key: '1', feature: 'Đọc/ghi Base', frontend: 'YES', server: 'YES' },
            { key: '2', feature: 'Tương tác với user (UI)', frontend: 'YES', server: 'NO' },
            { key: '3', feature: 'Chạy sau khi đóng script/Base', frontend: 'NO', server: 'YES' },
            { key: '4', feature: 'Trigger bởi Automation', frontend: 'NO', server: 'YES' },
            { key: '5', feature: 'SDK', frontend: '@base-open/web-api', server: 'BaseOpenSDK (Node/Python)' },
          ]}
          columns={[
            { title: '', dataIndex: 'feature', width: 220, render: (v) => <Text strong>{v}</Text> },
            { title: 'Front-end Script', dataIndex: 'frontend', width: 150, render: (v) => <Tag color={v === 'YES' ? 'green' : 'red'}>{v}</Tag> },
            { title: 'Server-side Script', dataIndex: 'server', width: 150, render: (v) => <Tag color={v === 'YES' ? 'green' : 'red'}>{v}</Tag> },
          ]}
        />
      </Card>

      <Card>
        <Title level={5}>Hosting options</Title>
        <Table
          size="small"
          pagination={false}
          bordered
          dataSource={[
            { key: '1', option: 'Replit (default)', sleep: 'Có — sau thời gian không hoạt động', env: 'Không tách dev/prod', best: 'Dev & test' },
            { key: '2', option: 'Replit Deployment', sleep: 'Có — tuỳ plan', env: 'Tách dev/prod', best: 'Public services' },
            { key: '3', option: 'Base Hosting', sleep: 'Không bao giờ', env: 'Tách dev/prod, showcase', best: 'Public + muốn nhiều người dùng' },
            { key: '4', option: 'CMS Server (của ta)', sleep: 'Không', env: 'Kiểm soát hoàn toàn', best: 'Production, internal tools' },
          ]}
          columns={[
            { title: 'Option', dataIndex: 'option', width: 160, render: (v) => <Text strong>{v}</Text> },
            { title: 'Auto-sleep?', dataIndex: 'sleep' },
            { title: 'Environment', dataIndex: 'env' },
            { title: 'Best for', dataIndex: 'best' },
          ]}
        />
      </Card>

      <Card>
        <Title level={5}>Permissions & Security</Title>
        <ul className="list-disc ml-6 space-y-2">
          <li>
            <Text strong>Front-end extensions</Text>: quyền theo user đang chạy script.
            User không có quyền xem data → script cũng không xem được.
          </li>
          <li>
            <Text strong>Server-side extensions</Text>: dùng <Text code>personalBaseToken</Text>
            của document owner. Quyền tương đương "document owner" nhưng phải được owner cung cấp.
          </li>
        </ul>
      </Card>
    </div>
  )
}

function FrontendTab() {
  return (
    <div className="space-y-4">
      <Card>
        <Title level={5}>Templates có sẵn</Title>
        <ul className="list-disc ml-6 space-y-1">
          <li><Text code>HTML template</Text> — entry: <Text code>src/index.ts</Text></li>
          <li><Text code>React template</Text> — entry: <Text code>src/App.tsx</Text></li>
          <li><Text code>Vue template</Text> — entry: <Text code>src/App.vue</Text></li>
          <li><Text code>Next.js template</Text> — entry: <Text code>pages/index.tsx</Text> (front-end + server-side)</li>
        </ul>
      </Card>

      <Card>
        <Title level={5}>Các bước phát triển</Title>
        <Steps
          direction="vertical"
          size="small"
          current={-1}
          items={[
            { title: 'Fork template', description: 'Chọn template phù hợp → Fork vào Replit/GitHub' },
            { title: 'Run project', description: 'Click Run → copy preview URL' },
            { title: 'Mở Base', description: 'Tạo hoặc mở một Base bất kỳ trên Lark' },
            { title: 'Add script', description: 'Click "Base Extensions" (góc phải) → "+ Add Script" → paste preview URL → Confirm' },
            { title: 'Develop', description: 'Sửa code trong IDE → extension tự refresh trong Base' },
          ]}
        />
      </Card>

      <Card>
        <Title level={5}>Base JS SDK — Core APIs</Title>
        <pre className="bg-neutral-100 dark:bg-neutral-800 p-3 rounded text-xs overflow-x-auto">
{`import { bitable, IOpenSegmentType } from "@base-open/web-api";

// Lấy selection hiện tại
const selection = await bitable.base.getSelection();

// Lấy table
const table = await bitable.base.getTableById(selection.tableId);

// Lấy danh sách fields
const fieldMetaList = await table.getFieldMetaList();

// Lấy tất cả record IDs
const recordIdList = await table.getRecordIdList();

// Đọc giá trị cell
const cellValue = await table.getCellString(fieldId, recordId);

// Ghi giá trị cell
await table.setCellValue(fieldId, recordId, [{
  type: IOpenSegmentType.Text,
  text: "New value",
}]);

// Thêm record mới
await table.addRecord({
  fields: {
    "Name": "New Record",
    "Status": "Active",
  }
});`}
        </pre>
      </Card>
    </div>
  )
}

function ServersideTab() {
  return (
    <div className="space-y-4">
      <Card>
        <Title level={5}>Server-side Script — Điểm mạnh</Title>
        <ul className="list-disc ml-6 space-y-2">
          <li><Text strong>Chạy nền</Text>: tiếp tục chạy sau khi đóng Base/browser</li>
          <li><Text strong>Trigger bởi Automation</Text>: khi record thay đổi → Lark gọi HTTP Request tới server</li>
          <li><Text strong>Kết nối external systems</Text>: gọi API bên thứ ba, đồng bộ data</li>
          <li><Text strong>Xử lý nặng</Text>: batch processing, AI analysis</li>
        </ul>
      </Card>

      <Card>
        <Title level={5}>personalBaseToken</Title>
        <Paragraph>Server-side script dùng <Text code>personalBaseToken</Text> để xác thực:</Paragraph>
        <Steps
          direction="vertical"
          size="small"
          current={-1}
          items={[
            { title: 'Mở Base trên Lark' },
            { title: 'Click "Get Authorization Code" (góc phải trên)' },
            { title: 'Click "Enable Authorization Code" trong popup' },
            { title: 'Copy token → lưu vào Secrets/env vars (KHÔNG commit vào code!)' },
          ]}
        />
        <Alert
          type="warning"
          showIcon
          className="mt-3"
          message="Security"
          description="personalBaseToken có quyền tương đương document owner. Luôn lưu trong Secrets/env vars, không để trong source code."
        />
      </Card>

      <Card>
        <Title level={5}>Kết hợp với Automations</Title>
        <Paragraph>
          Đây là tính năng <Text strong>cực kỳ hữu ích</Text>: dùng Lark Base Automation
          để trigger server-side extension khi data thay đổi.
        </Paragraph>
        <Steps
          direction="vertical"
          size="small"
          current={-1}
          items={[
            { title: 'Tạo Automation trong Base', description: 'Trigger: "When record is created/updated/deleted"' },
            { title: 'Action: HTTP Request', description: 'Gọi server-side extension URL hoặc CMS API' },
            { title: 'Server xử lý', description: 'Nhận data → process → ghi kết quả ngược lại Base hoặc hệ thống khác' },
          ]}
        />
        <Paragraph className="mt-2">
          <Text type="success">Ưu điểm so với polling (Bitable Sync):</Text>
        </Paragraph>
        <ul className="list-disc ml-6 space-y-1">
          <li>Realtime — không cần đợi interval</li>
          <li>Tiết kiệm API quota — chỉ gọi khi có thay đổi thật</li>
          <li>Biết chính xác record nào thay đổi — không cần diff toàn bộ</li>
        </ul>
      </Card>

      <Card>
        <Title level={5}>Lấy appToken và table_id từ URL</Title>
        <pre className="bg-neutral-100 dark:bg-neutral-800 p-3 rounded text-xs overflow-x-auto">
{`https://xxx.larksuite.com/base/bascnXXXXXXXX?table=tblXXXXXXXX&view=vewXXXXXXXX
                              ^^^^^^^^^^^^^^^^       ^^^^^^^^^^^^^^       ^^^^^^^^^^^^^^
                              appToken               table_id             view_id`}
        </pre>
        <Paragraph className="mt-2">
          Với Wiki URL: dùng CMS Resolve URL (trang Bitable Sync → paste URL → Resolve).
        </Paragraph>
      </Card>
    </div>
  )
}

function IdeasTab() {
  return (
    <div className="space-y-4">
      <Alert
        type="success"
        showIcon
        className="mb-3"
        message="Ý tưởng kết hợp Base Extensions + CMS Hoa Nam"
      />

      <Card>
        <Title level={5}>
          <ThunderboltOutlined className="mr-2 text-yellow-500" />
          1. Realtime Sync thay cho Polling
        </Title>
        <Paragraph>
          <Text strong>Vấn đề hiện tại:</Text> Bitable Sync phải poll mỗi N giây, tốn API quota,
          có delay.
        </Paragraph>
        <Paragraph>
          <Text strong>Giải pháp với Extensions:</Text>
        </Paragraph>
        <ol className="list-decimal ml-6 space-y-1">
          <li>Tạo Automation trong Base: trigger khi record thay đổi</li>
          <li>Action: HTTP Request → gọi CMS webhook endpoint (<Text code>/api-base/lark/v2/webhook</Text>)</li>
          <li>CMS nhận event realtime → xử lý ngay lập tức</li>
          <li>Không cần polling, không tốn API quota cho việc check "có gì mới không"</li>
        </ol>
        <Paragraph className="mt-2">
          <Text type="secondary">Đã có sẵn: CMS đã có webhook receiver + dispatcher ở trang Sync → Notifications</Text>
        </Paragraph>
      </Card>

      <Card>
        <Title level={5}>
          <CodeOutlined className="mr-2 text-blue-500" />
          2. Front-end Extension: CMS Dashboard trong Base
        </Title>
        <Paragraph>
          Embed CMS dashboard trực tiếp vào Lark Base như một extension script.
          Nhân viên mở Base → thấy dashboard, charts, KPIs ngay trong Lark.
        </Paragraph>
        <ul className="list-disc ml-6 space-y-1">
          <li>Extension script load iframe/component từ CMS</li>
          <li>Dùng Base JS SDK đọc data từ Base hiện tại</li>
          <li>Hiển thị charts, summary, alerts</li>
          <li>Không cần mở trang CMS riêng</li>
        </ul>
      </Card>

      <Card>
        <Title level={5}>
          <ToolOutlined className="mr-2 text-green-500" />
          3. Data Processing Extension
        </Title>
        <Paragraph>
          Front-end script chạy trong Base để xử lý dữ liệu hàng loạt:
        </Paragraph>
        <ul className="list-disc ml-6 space-y-1">
          <li><Text strong>Find & Replace</Text>: tìm và thay thế text trong nhiều records</li>
          <li><Text strong>Data Cleanup</Text>: chuẩn hoá format (phone, email, tên), loại bỏ duplicate</li>
          <li><Text strong>Auto-fill</Text>: tự động điền field dựa trên logic (VD: tính giá từ số lượng × đơn giá)</li>
          <li><Text strong>Extract</Text>: trích xuất data từ text phi cấu trúc (VD: parse "17m TRẦN ALJ576" → loại xe, biển số, mã)</li>
        </ul>
      </Card>

      <Card>
        <Title level={5}>
          <LinkOutlined className="mr-2 text-purple-500" />
          4. Server-side: CMS API Bridge
        </Title>
        <Paragraph>
          Deploy server-side extension trên CMS server (Express) — Lark Automation gọi trực tiếp:
        </Paragraph>
        <pre className="bg-neutral-100 dark:bg-neutral-800 p-3 rounded text-xs overflow-x-auto">
{`// Trên CMS Express server — endpoint cho Base Extension
// Lark Automation → HTTP Request → gọi endpoint này

POST /api/base-extension/process

Request từ Lark Automation:
{
  "event": "record_created",
  "table": "Đơn hàng",
  "record": {
    "record_id": "recXXX",
    "fields": {
      "Mã đơn": "DH-2025-0001",
      "Số lượng": 100,
      "Đơn giá": 50000
    }
  }
}

Response:
{
  "success": true,
  "action": "updated",
  "fields_updated": {
    "Thành tiền": 5000000,
    "Trạng thái": "Đã xử lý"
  }
}`}
        </pre>
        <Paragraph className="mt-2">
          <Text type="success">Ưu điểm:</Text> Host trên chính server CMS → không sleep,
          kiểm soát hoàn toàn, kết nối trực tiếp MongoDB/services.
        </Paragraph>
      </Card>

      <Card>
        <Title level={5}>
          <LaptopOutlined className="mr-2 text-cyan-500" />
          5. External Form → Base
        </Title>
        <Paragraph>
          Tạo form trên CMS (public, không cần tài khoản Lark) → submit vào Bitable:
        </Paragraph>
        <ol className="list-decimal ml-6 space-y-1">
          <li>CMS render form với Ant Design (validation, file upload)</li>
          <li>User submit → CMS gọi <Text code>POST /records/batch-create</Text></li>
          <li>Record tạo trong Bitable → trigger Automation → thông báo team</li>
          <li>File upload → lưu S3/CDN → gắn link vào record</li>
        </ol>
        <Paragraph className="mt-2">
          <Text type="success">Use case:</Text> Form đăng ký nhà cung cấp, form báo cáo sự cố,
          form yêu cầu mua hàng — chia sẻ link cho đối tác bên ngoài.
        </Paragraph>
      </Card>
    </div>
  )
}

function TemplatesTab() {
  return (
    <div className="space-y-4">
      <Card>
        <Title level={5}>Template 1: Front-end Find & Replace</Title>
        <Paragraph>Script chạy trong Base, tìm và thay thế text:</Paragraph>
        <pre className="bg-neutral-100 dark:bg-neutral-800 p-3 rounded text-xs overflow-x-auto">
{`import { bitable, IOpenSegmentType } from "@base-open/web-api";

const findText = 'hi';
const replaceText = 'hello';

async function replace() {
  const selection = await bitable.base.getSelection();
  const table = await bitable.base.getTableById(selection?.tableId!);
  const fieldMetaList = await table.getFieldMetaList();

  // Tìm field "Multiline" hoặc "多行文本"
  const textField = fieldMetaList.find(
    ({ name }) => name === 'Multiline' || name === '多行文本'
  );

  const recordIdList = await table.getRecordIdList();
  let count = 0;

  for (const recordId of recordIdList) {
    const cellString = await table.getCellString(textField?.id!, recordId!);
    if (cellString?.includes(findText)) {
      const newText = cellString.replaceAll(findText, replaceText);
      await table.setCellValue(textField?.id!, recordId!, [{
        type: IOpenSegmentType.Text,
        text: newText,
      }]);
      count++;
    }
  }

  alert(\`Replaced in \${count} records\`);
}`}
        </pre>
      </Card>

      <Card>
        <Title level={5}>Template 2: Server-side → CMS API Bridge</Title>
        <Paragraph>Express endpoint nhận event từ Lark Automation, xử lý và ghi lại:</Paragraph>
        <pre className="bg-neutral-100 dark:bg-neutral-800 p-3 rounded text-xs overflow-x-auto">
{`// Route: POST /api/base-extension/process
// Nhận từ Lark Base Automation → HTTP Request action

import express from 'express';
import axios from 'axios';

const router = express.Router();
const LARK_BASE = 'https://open.larksuite.com/open-apis';

router.post('/process', async (req, res) => {
  try {
    const { appToken, tableId, recordId, personalBaseToken } = req.body;

    // 1. Đọc record hiện tại
    const record = await axios.get(
      \`\${LARK_BASE}/bitable/v1/apps/\${appToken}/tables/\${tableId}/records/\${recordId}\`,
      { headers: { Authorization: \`Bearer \${personalBaseToken}\` } }
    );

    const fields = record.data?.data?.record?.fields;

    // 2. Xử lý nghiệp vụ (ví dụ: tính thành tiền)
    const quantity = fields['Số lượng'] || 0;
    const unitPrice = fields['Đơn giá'] || 0;
    const total = quantity * unitPrice;

    // 3. Ghi kết quả ngược lại record
    await axios.put(
      \`\${LARK_BASE}/bitable/v1/apps/\${appToken}/tables/\${tableId}/records/\${recordId}\`,
      {
        fields: {
          'Thành tiền': total,
          'Trạng thái': 'Đã xử lý',
        }
      },
      { headers: { Authorization: \`Bearer \${personalBaseToken}\` } }
    );

    res.json({ success: true, total });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});`}
        </pre>
      </Card>

      <Card>
        <Title level={5}>Template 3: Data Extract (parse text phi cấu trúc)</Title>
        <Paragraph>
          Ví dụ từ dữ liệu thực: <Text code>"17m TRẦN ALJ576-D5R69-15/12/2025"</Text>
        </Paragraph>
        <pre className="bg-neutral-100 dark:bg-neutral-800 p-3 rounded text-xs overflow-x-auto">
{`import { bitable, IOpenSegmentType } from "@base-open/web-api";

// Parse "17m TRẦN ALJ576-D5R69-15/12/2025"
// → { loaiXe: "17m", hangXe: "TRẦN", bienSo: "ALJ576", maCode: "D5R69", ngay: "15/12/2025" }

function parseVehicleInfo(text: string) {
  const match = text.match(
    /^(\\d+[mM]\\w*)\\s+(\\S+)\\s+(\\w+)-(\\w+)-(\\d{1,2}\\/\\d{1,2}\\/\\d{4})$/
  );
  if (!match) return null;
  return {
    loaiXe: match[1],
    hangXe: match[2],
    bienSo: match[3],
    maCode: match[4],
    ngay: match[5],
  };
}

async function extractAll() {
  const selection = await bitable.base.getSelection();
  const table = await bitable.base.getTableById(selection?.tableId!);
  const fields = await table.getFieldMetaList();

  const sourceField = fields.find(f => f.name === 'Mã Tham Chiếu Biển Số Xe');
  if (!sourceField) { alert('Field not found'); return; }

  const recordIds = await table.getRecordIdList();
  let processed = 0;

  for (const recId of recordIds) {
    const cellStr = await table.getCellString(sourceField.id, recId!);
    if (!cellStr) continue;

    const parsed = parseVehicleInfo(cellStr);
    if (!parsed) continue;

    // Ghi vào các field riêng (nếu có)
    const updates: Record<string, any> = {};
    const loaiXeField = fields.find(f => f.name === 'Loại Xe');
    const bienSoField = fields.find(f => f.name === 'Biển Số');
    const ngayField = fields.find(f => f.name === 'Ngày');

    if (loaiXeField) {
      await table.setCellValue(loaiXeField.id, recId!, [{
        type: IOpenSegmentType.Text, text: parsed.loaiXe
      }]);
    }
    if (bienSoField) {
      await table.setCellValue(bienSoField.id, recId!, [{
        type: IOpenSegmentType.Text, text: parsed.bienSo
      }]);
    }
    processed++;
  }

  alert(\`Extracted \${processed} records\`);
}`}
        </pre>
      </Card>
    </div>
  )
}
