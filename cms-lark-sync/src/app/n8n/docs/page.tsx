'use client';

import React from 'react';
import { Typography, Card, Divider, Tag, Alert, Steps, Table } from 'antd';
import {
  BookOutlined, LinkOutlined, FileExcelOutlined, ThunderboltOutlined,
  ApiOutlined, PlayCircleOutlined, SettingOutlined, CheckCircleOutlined,
  FilePdfOutlined, CalculatorOutlined, FormatPainterOutlined,
} from '@ant-design/icons';

const { Title, Text, Paragraph } = Typography;

const code = (text: string) => (
  <code style={{ background: 'var(--bg-tertiary)', padding: '1px 6px', borderRadius: 3, fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>{text}</code>
);

const WEBHOOK_BASE = process.env.NEXT_PUBLIC_WEBHOOK_BASE || 'https://agents-lark-webhooks.toolswave.net';

export default function DocsPage() {
  return (
    <div>
      <Title level={3} style={{ color: 'var(--foreground)' }}>
        <BookOutlined /> N8N Webhooks — Documentation
      </Title>
      <Text type="secondary">Hướng dẫn sử dụng hệ thống tự động fill Excel / PDF từ Lark Base</Text>

      {/* ─── Overview ─── */}
      <Card style={{ marginTop: 16, background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
        <Title level={4} style={{ color: 'var(--foreground)', marginTop: 0 }}>Tổng quan</Title>
        <Paragraph style={{ color: 'var(--text-color)' }}>
          Hệ thống N8N Webhooks tự động hóa quy trình: khi dữ liệu thay đổi trong Lark Base,
          hệ thống sẽ lấy dữ liệu, điền vào template Excel, tính toán footer, xuất PDF, và gửi kết quả qua Lark.
        </Paragraph>
        <div style={{ background: 'var(--bg-tertiary)', padding: 16, borderRadius: 8, fontFamily: 'monospace', fontSize: 12, lineHeight: 2, color: 'var(--text-color)' }}>
          <div>Lark Base thay đổi</div>
          <div>&nbsp;&nbsp;{'→'} Lark Automation gửi webhook</div>
          <div>&nbsp;&nbsp;{'→'} Pipeline nhận event, lấy dữ liệu từ Lark API</div>
          <div>&nbsp;&nbsp;{'→'} Điền vào Excel template (header + data rows + footer formulas)</div>
          <div>&nbsp;&nbsp;{'→'} Tính SUMIFS / SUM footer, format %, số tiền bằng chữ</div>
          <div>&nbsp;&nbsp;{'→'} Xuất PDF (nếu bật Include PDF)</div>
          <div>&nbsp;&nbsp;{'→'} Gửi card + link download qua Lark Webhook</div>
          <div>&nbsp;&nbsp;{'→'} Trả response JSON (download_url, pdf_download_url) cho Lark Base</div>
        </div>
      </Card>

      {/* ─── Architecture ─── */}
      <Card style={{ marginTop: 16, background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
        <Title level={4} style={{ color: 'var(--foreground)', marginTop: 0 }}>Kiến trúc hệ thống</Title>
        <Table
          size="small"
          pagination={false}
          dataSource={[
            { key: '1', component: 'Lark Apps', desc: 'Lưu Lark App credentials (app_id, app_secret) dùng chung cho nhiều connections', icon: <SettingOutlined /> },
            { key: '2', component: 'Connections', desc: 'Kết nối Lark Base (app_token, table_id) + cache danh sách fields', icon: <LinkOutlined /> },
            { key: '3', component: 'Templates', desc: 'Upload + edit file Excel template — chỉnh trực tiếp trong trình duyệt', icon: <FileExcelOutlined /> },
            { key: '4', component: 'Mappings', desc: 'Ánh xạ Lark fields → Excel cells (direct, formula, expression, static)', icon: <SettingOutlined /> },
            { key: '5', component: 'Rules', desc: 'Cấu hình trigger, filter, output — mỗi rule = 1 webhook endpoint', icon: <ThunderboltOutlined /> },
            { key: '6', component: 'Executions', desc: 'Lịch sử chạy: thời gian, số records, trạng thái, link download', icon: <PlayCircleOutlined /> },
            { key: '7', component: 'Files', desc: 'Quản lý file output (Excel, PDF, debug) — download, xóa', icon: <FilePdfOutlined /> },
          ]}
          columns={[
            { title: '', dataIndex: 'icon', width: 40, render: (v: React.ReactNode) => <span style={{ color: 'var(--accent-color)' }}>{v}</span> },
            { title: 'Thành phần', dataIndex: 'component', width: 120, render: (v: string) => <Text strong style={{ color: 'var(--foreground)' }}>{v}</Text> },
            { title: 'Mô tả', dataIndex: 'desc', render: (v: string) => <Text style={{ color: 'var(--text-color)' }}>{v}</Text> },
          ]}
        />
      </Card>

      {/* ─── Quick Start ─── */}
      <Card style={{ marginTop: 16, background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
        <Title level={4} style={{ color: 'var(--foreground)', marginTop: 0 }}>
          <CheckCircleOutlined /> Hướng dẫn nhanh — 5 bước
        </Title>

        <Steps
          direction="vertical"
          size="small"
          current={-1}
          items={[
            {
              title: <Text strong style={{ color: 'var(--foreground)' }}>Tạo Connection</Text>,
              description: (
                <div style={{ color: 'var(--text-color)', paddingBottom: 12 }}>
                  <Paragraph style={{ color: 'var(--text-color)', marginBottom: 4 }}>
                    Vào <Tag color="blue">Connections</Tag> {'→'} Add Connection:
                  </Paragraph>
                  <ul style={{ margin: '4px 0', paddingLeft: 20, fontSize: 13 }}>
                    <li><strong>Lark App</strong>: chọn từ Lark Apps (shared) hoặc nhập trực tiếp App ID + Secret</li>
                    <li><strong>App Token</strong>: mở Lark Base {'→'} URL dạng {code('base/XXX')} {'→'} XXX</li>
                    <li><strong>Table ID</strong>: mở table {'→'} URL chứa {code('table/YYY')} {'→'} YYY</li>
                  </ul>
                  <Paragraph style={{ color: 'var(--text-color)', marginBottom: 0 }}>
                    Nhấn <strong>Test Connection</strong> để verify và cache fields. Nhấn <strong>Refresh</strong> khi thêm field mới.
                  </Paragraph>
                </div>
              ),
            },
            {
              title: <Text strong style={{ color: 'var(--foreground)' }}>Upload Template + Map Fields</Text>,
              description: (
                <div style={{ color: 'var(--text-color)', paddingBottom: 12 }}>
                  <Paragraph style={{ color: 'var(--text-color)', marginBottom: 4 }}>
                    Vào <Tag color="blue">Templates</Tag> {'→'} Upload {'→'} chọn file .xlsx {'→'} Edit & Map:
                  </Paragraph>
                  <ol style={{ margin: '4px 0', paddingLeft: 20, fontSize: 13 }}>
                    <li>Chọn <strong>Connection</strong> (để lấy danh sách Lark fields)</li>
                    <li>Click vào ô trong Excel {'→'} nhấn <strong>Map Cell</strong> (góc phải)</li>
                    <li>Chọn Lark field + loại mapping (xem chi tiết bên dưới)</li>
                    <li>Nhấn <strong>Auto Match</strong> để tự động match theo header</li>
                  </ol>
                </div>
              ),
            },
            {
              title: <Text strong style={{ color: 'var(--foreground)' }}>Cấu hình Footer Formulas</Text>,
              description: (
                <div style={{ color: 'var(--text-color)', paddingBottom: 12 }}>
                  <Paragraph style={{ color: 'var(--text-color)', marginBottom: 4 }}>
                    Cho từng ô footer (KCT, 0%, 5%, 8%, 10%, Tổng cộng):
                  </Paragraph>
                  <ol style={{ margin: '4px 0', paddingLeft: 20, fontSize: 13 }}>
                    <li>Click vào ô footer {'→'} Map Cell {'→'} chọn tab <strong>Formula</strong></li>
                    <li>Chọn <strong>Single</strong> (KHÔNG phải Repeat)</li>
                    <li>Nhập công thức với placeholders (xem bảng công thức bên dưới)</li>
                    <li>Lặp lại cho từng dòng footer - mỗi dòng 1 mapping riêng</li>
                  </ol>
                </div>
              ),
            },
            {
              title: <Text strong style={{ color: 'var(--foreground)' }}>Tạo Rule + Test</Text>,
              description: (
                <div style={{ color: 'var(--text-color)', paddingBottom: 12 }}>
                  <Paragraph style={{ color: 'var(--text-color)', marginBottom: 4 }}>
                    Trong bước <strong>Save & Test</strong> của Template wizard, hoặc vào <Tag color="blue">Rules</Tag>:
                  </Paragraph>
                  <ol style={{ margin: '4px 0', paddingLeft: 20, fontSize: 13 }}>
                    <li>Chọn <strong>Group By Field</strong> (field nhóm records, VD: Mã KB)</li>
                    <li>Chọn <strong>Output</strong>: Lark Webhook hoặc Download only</li>
                    <li>Bật <strong>Include PDF</strong> nếu muốn xuất cả PDF</li>
                    <li>Chọn format download: <strong>Excel / PDF / Both</strong></li>
                    <li>Nhập test value {'→'} Run Test</li>
                  </ol>
                </div>
              ),
            },
            {
              title: <Text strong style={{ color: 'var(--foreground)' }}>Cấu hình Lark Automation</Text>,
              description: (
                <div style={{ color: 'var(--text-color)', paddingBottom: 12 }}>
                  <Paragraph style={{ color: 'var(--text-color)', marginBottom: 4 }}>
                    Trong Lark Base {'→'} Automation {'→'} tạo mới:
                  </Paragraph>
                  <ol style={{ margin: '4px 0', paddingLeft: 20, fontSize: 13 }}>
                    <li><strong>Trigger</strong>: &quot;When record is updated&quot;</li>
                    <li><strong>Action</strong>: &quot;Send HTTP Request&quot; {'→'} POST</li>
                    <li><strong>URL</strong>: copy <strong>Sync URL</strong> từ nút Config trên Rules page</li>
                    <li><strong>Body</strong>: copy JSON từ nút Config (tự generate theo rule)</li>
                  </ol>
                  <Alert type="info" showIcon style={{ marginTop: 8 }}
                    message="Dùng Sync URL (có ?mode=sync) để Lark Base nhận response chứa download_url ngay lập tức." />
                </div>
              ),
            },
          ]}
        />
      </Card>

      {/* ─── Map Types ─── */}
      <Card style={{ marginTop: 16, background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
        <Title level={4} style={{ color: 'var(--foreground)', marginTop: 0 }}>
          <FormatPainterOutlined /> Các loại Mapping
        </Title>

        <Divider plain style={{ margin: '8px 0', fontSize: 12, color: 'var(--text-tertiary)' }}>Scope (phạm vi)</Divider>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <Card size="small" style={{ flex: 1, minWidth: 250, background: 'var(--bg-tertiary)', borderColor: 'var(--border-color)' }}>
            <Tag color="blue">Single (Header)</Tag>
            <Paragraph style={{ color: 'var(--text-color)', fontSize: 12, marginTop: 4, marginBottom: 0 }}>
              Ghi 1 lần tại ô cố định. Dùng cho: tên KH, MST, địa chỉ, ngày, footer formulas.
              <br />Lấy giá trị từ record đầu tiên.
            </Paragraph>
          </Card>
          <Card size="small" style={{ flex: 1, minWidth: 250, background: 'var(--bg-tertiary)', borderColor: 'var(--border-color)' }}>
            <Tag color="green">Repeat {'↓'} (Data rows)</Tag>
            <Paragraph style={{ color: 'var(--text-color)', fontSize: 12, marginTop: 4, marginBottom: 0 }}>
              Lặp cho mỗi record (mỗi dòng data). Dùng cho: STT, tên hàng, số lượng, đơn giá.
              <br />Anchor = dòng data đầu tiên.
            </Paragraph>
          </Card>
        </div>

        <Divider plain style={{ margin: '8px 0', fontSize: 12, color: 'var(--text-tertiary)' }}>Map types</Divider>
        <Table
          size="small"
          pagination={false}
          dataSource={[
            { key: '1', type: 'Lark Field', tag: 'blue', desc: 'Lấy giá trị trực tiếp từ Lark field', example: 'Field "Tên sản phẩm" → ghi vào cột B' },
            { key: '2', type: 'Formula', tag: 'orange', desc: 'Công thức Excel với placeholders', example: '=SUMIFS($F${start}:$F${end},$G${start}:$G${end},$C{row})' },
            { key: '3', type: 'Lark Expression', tag: 'purple', desc: 'Tính toán Python với giá trị Lark fields', example: 'so_tien_bang_chu({value}) hoặc {Số lượng} * {Đơn giá}' },
            { key: '4', type: 'Static', tag: 'default', desc: 'Giá trị cố định', example: '"VNĐ", "0", "-"' },
          ]}
          columns={[
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            { title: 'Type', dataIndex: 'type', width: 130, render: (v: string, r: any) => <Tag color={r.tag}>{v}</Tag> },
            { title: 'Mô tả', dataIndex: 'desc', width: 250 },
            { title: 'Ví dụ', dataIndex: 'example', render: (v: string) => <Text code style={{ fontSize: 11 }}>{v}</Text> },
          ]}
        />

        <Divider plain style={{ margin: '12px 0', fontSize: 12, color: 'var(--text-tertiary)' }}>Tuỳ chọn bổ sung</Divider>
        <Table
          size="small"
          pagination={false}
          dataSource={[
            { key: '1', option: 'default_value', desc: 'Giá trị mặc định khi ô trống', example: '"-" hoặc "0" hoặc "N/A"' },
            { key: '2', option: 'number_format', desc: 'Format hiển thị Excel', example: '"0%" (0.08→8%), "#,##0" (1000→1,000)' },
          ]}
          columns={[
            { title: 'Option', dataIndex: 'option', width: 150, render: (v: string) => <Text code>{v}</Text> },
            { title: 'Mô tả', dataIndex: 'desc', width: 250 },
            { title: 'Ví dụ', dataIndex: 'example', render: (v: string) => <Text code style={{ fontSize: 11 }}>{v}</Text> },
          ]}
        />
        <Paragraph style={{ color: 'var(--text-secondary)', fontSize: 11, marginTop: 8 }}>
          Lưu ý: {code('number_format')} chỉ thay đổi cách hiển thị, giá trị thực không đổi. VD: 0.08 với format &quot;0%&quot; hiển thị là 8% nhưng SUMIFS vẫn so sánh đúng.
        </Paragraph>
      </Card>

      {/* ─── Formula Placeholders ─── */}
      <Card style={{ marginTop: 16, background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
        <Title level={4} style={{ color: 'var(--foreground)', marginTop: 0 }}>
          <CalculatorOutlined /> Formula Placeholders
        </Title>
        <Paragraph style={{ color: 'var(--text-color)' }}>
          Trong map type <Tag color="orange">Formula</Tag>, dùng các placeholder sau. Hệ thống tự thay bằng giá trị thực khi fill.
        </Paragraph>
        <Table
          size="small"
          pagination={false}
          dataSource={[
            { key: '1', ph: '{row}', desc: 'Số dòng hiện tại', example: '=$D{row}+$F{row} → =$D21+$F21' },
            { key: '2', ph: '{row-N}', desc: 'Dòng hiện tại trừ N', example: '=SUM($D{row-5}:$D{row-1}) → =SUM($D21:$D25)' },
            { key: '3', ph: '{row+N}', desc: 'Dòng hiện tại cộng N', example: '=$A{row+1} → =$A22' },
            { key: '4', ph: '{start}', desc: 'Dòng data đầu tiên', example: '=SUM($F${start}:$F${end}) → =SUM($F$19:$F$23)' },
            { key: '5', ph: '{end}', desc: 'Dòng data cuối cùng', example: '=SUMIFS($F${start}:$F${end},...) → range tự co giãn' },
            { key: '6', ph: '{count}', desc: 'Tổng số records', example: 'Ít dùng' },
          ]}
          columns={[
            { title: 'Placeholder', dataIndex: 'ph', width: 120, render: (v: string) => <Text code style={{ color: 'var(--warning)' }}>{v}</Text> },
            { title: 'Mô tả', dataIndex: 'desc', width: 200 },
            { title: 'Ví dụ', dataIndex: 'example', render: (v: string) => <Text style={{ fontSize: 12, color: 'var(--text-color)' }}>{v}</Text> },
          ]}
        />
        <Alert type="info" showIcon style={{ marginTop: 12 }}
          message="Formulas được tính toán trực tiếp bằng Python (không phụ thuộc Excel evaluate). Hỗ trợ: SUMIFS, SUM, cộng/trừ cells." />
      </Card>

      {/* ─── Footer Formula Examples ─── */}
      <Card style={{ marginTop: 16, background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
        <Title level={4} style={{ color: 'var(--foreground)', marginTop: 0 }}>
          Ví dụ: Footer tổng hợp theo thuế suất
        </Title>
        <Paragraph style={{ color: 'var(--text-color)' }}>
          Bảng kê hoá đơn có footer nhóm theo thuế suất (KCT, 0%, 5%, 8%, 10%). Mỗi dòng footer cần 3 mapping <strong>Single + Formula</strong>:
        </Paragraph>

        <Title level={5} style={{ color: 'var(--foreground)' }}>Dòng KCT / 0% / 5% / 8% / 10% (giống nhau, chỉ khác anchor_row)</Title>
        <Table
          size="small"
          pagination={false}
          dataSource={[
            { key: '1', col: 'D', name: 'Tổng tiền chưa thuế', formula: '=SUMIFS($F${start}:$F${end},$G${start}:$G${end},$C{row})' },
            { key: '2', col: 'F', name: 'Tổng tiền thuế', formula: '=SUMIFS($H${start}:$H${end},$G${start}:$G${end},$C{row})' },
            { key: '3', col: 'H', name: 'Tổng tiền thanh toán', formula: '=$D{row}+$F{row}' },
          ]}
          columns={[
            { title: 'Cột', dataIndex: 'col', width: 60, render: (v: string) => <Tag color="orange">{v}</Tag> },
            { title: 'Nội dung', dataIndex: 'name', width: 200 },
            { title: 'Formula', dataIndex: 'formula', render: (v: string) => <Text code style={{ fontSize: 11 }}>{v}</Text> },
          ]}
        />
        <Paragraph style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 8 }}>
          {code('$C{row}')} = ô label cùng dòng (VD: &quot;KCT&quot;, &quot;8%&quot;). SUMIFS tự match giá trị tại cột G (% VAT) với label.
        </Paragraph>

        <Title level={5} style={{ color: 'var(--foreground)' }}>Dòng Tổng cộng</Title>
        <Table
          size="small"
          pagination={false}
          dataSource={[
            { key: '1', col: 'D', formula: '=SUM($D{row-5}:$D{row-1})' },
            { key: '2', col: 'F', formula: '=SUM($F{row-5}:$F{row-1})' },
            { key: '3', col: 'H', formula: '=$D{row}+$F{row}' },
          ]}
          columns={[
            { title: 'Cột', dataIndex: 'col', width: 60, render: (v: string) => <Tag color="orange">{v}</Tag> },
            { title: 'Formula', dataIndex: 'formula', render: (v: string) => <Text code style={{ fontSize: 11 }}>{v}</Text> },
          ]}
        />
        <Paragraph style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 8 }}>
          {code('{row-5}')} = 5 dòng phía trên (KCT). {code('{row-1}')} = dòng ngay trên (10%). SUM cộng tất cả dòng thuế suất.
        </Paragraph>

        <Title level={5} style={{ color: 'var(--foreground)' }}>Số tiền viết bằng chữ</Title>
        <Paragraph style={{ color: 'var(--text-color)' }}>
          Dùng <Tag color="purple">Lark Expression</Tag> + <strong>Single</strong>:
        </Paragraph>
        <div style={{ background: 'var(--bg-tertiary)', padding: 12, borderRadius: 6, fontFamily: 'monospace', fontSize: 12, color: 'var(--text-color)' }}>
          so_tien_bang_chu({'{Tổng tiền thanh toán}'})
        </div>
        <Paragraph style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 4 }}>
          Kết quả: &quot;Bảy triệu không trăm lẻ năm nghìn chín trăm tám mươi ba đồng&quot;
        </Paragraph>
      </Card>

      {/* ─── Output & Response ─── */}
      <Card style={{ marginTop: 16, background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
        <Title level={4} style={{ color: 'var(--foreground)', marginTop: 0 }}>
          <ApiOutlined /> Output & Response cho Lark
        </Title>

        <Title level={5} style={{ color: 'var(--foreground)' }}>Output Types</Title>
        <Table
          size="small"
          pagination={false}
          dataSource={[
            { key: '1', type: 'Lark Webhook', desc: 'Gửi card Lark + link download vào group chat. Response cũng trả download_url.', need_url: 'Cần Webhook URL' },
            { key: '2', type: 'Download only', desc: 'Chỉ trả download_url trong response. KHÔNG gửi card vào chat.', need_url: 'Không cần URL' },
          ]}
          columns={[
            { title: 'Type', dataIndex: 'type', width: 140, render: (v: string) => <Tag color={v.includes('Webhook') ? 'orange' : 'default'}>{v}</Tag> },
            { title: 'Mô tả', dataIndex: 'desc' },
            { title: '', dataIndex: 'need_url', width: 130, render: (v: string) => <Text type="secondary" style={{ fontSize: 11 }}>{v}</Text> },
          ]}
        />

        <Title level={5} style={{ color: 'var(--foreground)' }}>Include PDF</Title>
        <Paragraph style={{ color: 'var(--text-color)' }}>
          Bật <strong>Include PDF</strong> trong Output settings {'→'} hệ thống xuất cả PDF (qua LibreOffice).
          Lark card sẽ có 2 nút: <Tag color="blue">Download Excel</Tag> <Tag>Download PDF</Tag>
        </Paragraph>

        <Title level={5} style={{ color: 'var(--foreground)' }}>Response JSON</Title>
        <Paragraph style={{ color: 'var(--text-color)' }}>
          Cả 2 output types đều trả response JSON. Lark Base automation nhận response này để dùng cho bước tiếp:
        </Paragraph>
        <div style={{ background: 'var(--bg-tertiary)', padding: 12, borderRadius: 6, fontFamily: 'monospace', fontSize: 12, color: 'var(--text-color)' }}>
          {'{'}<br />
          &nbsp;&nbsp;&quot;success&quot;: true,<br />
          &nbsp;&nbsp;&quot;download_url&quot;: &quot;https://.../*.xlsx&quot;,<br />
          &nbsp;&nbsp;<span style={{ color: 'var(--accent-color)' }}>&quot;pdf_download_url&quot;: &quot;https://.../*.pdf&quot;,</span><br />
          &nbsp;&nbsp;&quot;records_count&quot;: 5,<br />
          &nbsp;&nbsp;&quot;duration_ms&quot;: 1234<br />
          {'}'}
        </div>
        <Paragraph style={{ color: 'var(--text-secondary)', fontSize: 11, marginTop: 4 }}>
          {code('pdf_download_url')} chỉ có khi bật Include PDF.
        </Paragraph>

        <Title level={5} style={{ color: 'var(--foreground)' }}>Custom Response</Title>
        <Paragraph style={{ color: 'var(--text-color)' }}>
          Bật <strong>Custom Response</strong> trong Output settings để tuỳ chỉnh response trả về cho Lark Base.
          Dùng các template variables:
        </Paragraph>
        <Table
          size="small"
          pagination={false}
          dataSource={[
            { key: '1', variable: '{{download_url}}', desc: 'Link download Excel' },
            { key: '2', variable: '{{pdf_download_url}}', desc: 'Link download PDF' },
            { key: '3', variable: '{{group_key}}', desc: 'Group key (VD: mã khai báo)' },
            { key: '4', variable: '{{rule_name}}', desc: 'Tên rule' },
            { key: '5', variable: '{{rule_id}}', desc: 'ID rule' },
          ]}
          columns={[
            { title: 'Variable', dataIndex: 'variable', width: 200, render: (v: string) => <Text code>{v}</Text> },
            { title: 'Mô tả', dataIndex: 'desc' },
          ]}
        />
        <Paragraph style={{ color: 'var(--text-color)', fontSize: 12, marginTop: 8 }}>
          Ví dụ Custom Response:
        </Paragraph>
        <div style={{ background: 'var(--bg-tertiary)', padding: 12, borderRadius: 6, fontFamily: 'monospace', fontSize: 12, color: 'var(--text-color)' }}>
          {'{'}<br />
          &nbsp;&nbsp;&quot;status&quot;: &quot;completed&quot;,<br />
          &nbsp;&nbsp;&quot;invoice&quot;: &quot;{'{{group_key}}'}&quot;,<br />
          &nbsp;&nbsp;&quot;excel&quot;: &quot;{'{{download_url}}'}&quot;,<br />
          &nbsp;&nbsp;&quot;pdf&quot;: &quot;{'{{pdf_download_url}}'}&quot;<br />
          {'}'}
        </div>
      </Card>

      {/* ─── Webhook URLs ─── */}
      <Card style={{ marginTop: 16, background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
        <Title level={4} style={{ color: 'var(--foreground)', marginTop: 0 }}>
          <ApiOutlined /> Webhook URLs
        </Title>
        <Table
          size="small"
          pagination={false}
          dataSource={[
            { key: '1', mode: 'Sync', url: `${WEBHOOK_BASE}/webhook/n8n/{rule_id}?mode=sync`, desc: 'Chạy ngay, trả response với download_url. Dùng cho Lark Automation.', rec: 'Khuyên dùng' },
            { key: '2', mode: 'Async', url: `${WEBHOOK_BASE}/webhook/n8n/{rule_id}`, desc: 'Debounce + chạy nền. Gom nhiều trigger cùng group.', rec: '' },
            { key: '3', mode: 'Test', url: `${WEBHOOK_BASE}/webhook/n8n/{rule_id}/sync`, desc: 'Test trực tiếp, clear cache. Dùng bởi nút Test trên CMS.', rec: '' },
          ]}
          columns={[
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            { title: 'Mode', dataIndex: 'mode', width: 80, render: (v: string, r: any) => <><Tag color={v === 'Sync' ? 'green' : 'default'}>{v}</Tag>{r.rec && <Tag color="green" style={{ fontSize: 9 }}>{r.rec}</Tag>}</> },
            { title: 'URL', dataIndex: 'url', render: (v: string) => <Text code style={{ fontSize: 10, wordBreak: 'break-all' }}>{v}</Text> },
            { title: 'Mô tả', dataIndex: 'desc', width: 280 },
          ]}
        />

        <Alert type="info" showIcon style={{ marginTop: 12 }}
          message="Lark Automation gửi đến Webhook URL (Sync hoặc Async), KHÔNG phải Lark Bot Webhook URL."
          description="Lark Bot Webhook URL chỉ để nhận card thông báo. Body JSON gửi đến Webhook URL của hệ thống." />
      </Card>

      {/* ─── Trigger & Filter ─── */}
      <Card style={{ marginTop: 16, background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
        <Title level={4} style={{ color: 'var(--foreground)', marginTop: 0 }}>
          <ThunderboltOutlined /> Trigger, Filter & Debounce
        </Title>
        <Table
          size="small"
          pagination={false}
          dataSource={[
            { key: '1', feature: 'Group By Field', desc: 'Nhóm records theo field (VD: Mã KB). Mỗi group = 1 file Excel.', where: 'Rule' },
            { key: '2', feature: 'Filter Field/Value', desc: 'Chỉ chạy khi field = giá trị cụ thể. Chống Lookup cascade.', where: 'Rule' },
            { key: '3', feature: 'Debounce', desc: 'Gom triggers cùng group trong N giây rồi chạy 1 lần (mặc định 5s).', where: 'Rule' },
            { key: '4', feature: 'Dedup', desc: 'Tự skip nếu cùng rule+group đã chạy thành công trong 10 phút.', where: 'System' },
          ]}
          columns={[
            { title: 'Feature', dataIndex: 'feature', width: 160, render: (v: string) => <Text strong style={{ color: 'var(--foreground)' }}>{v}</Text> },
            { title: 'Mô tả', dataIndex: 'desc' },
            { title: 'Cấu hình tại', dataIndex: 'where', width: 80, render: (v: string) => <Tag>{v}</Tag> },
          ]}
        />
      </Card>

      {/* ─── Debug ─── */}
      <Card style={{ marginTop: 16, background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
        <Title level={4} style={{ color: 'var(--foreground)', marginTop: 0 }}>Debug & Troubleshooting</Title>

        <Title level={5} style={{ color: 'var(--foreground)' }}>Debug file</Title>
        <Paragraph style={{ color: 'var(--text-color)' }}>
          Mỗi lần chạy, hệ thống tạo file {code('*_debug.json')} cạnh file Excel output.
          Download từ trang <Tag color="blue">Files</Tag> hoặc trực tiếp:
        </Paragraph>
        <div style={{ background: 'var(--bg-tertiary)', padding: 8, borderRadius: 6, fontFamily: 'monospace', fontSize: 11, color: 'var(--text-color)' }}>
          {WEBHOOK_BASE}/download/N8N_xxx_debug.json
        </div>
        <Paragraph style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 4 }}>
          Chứa: mỗi cell được ghi {'→'} type, template gốc, formula đã resolve, giá trị tính toán.
        </Paragraph>

        <Title level={5} style={{ color: 'var(--foreground)' }}>Lỗi thường gặp</Title>
        <Table
          size="small"
          pagination={false}
          dataSource={[
            { key: '1', error: 'No records found', fix: 'Kiểm tra group_by_field đúng tên, thử group key khác' },
            { key: '2', error: 'Footer trống (0)', fix: 'Kiểm tra SUMIFS: cột criteria (G) và label (C) phải match type (text vs number)' },
            { key: '3', error: 'Cột % hiện số thập phân', fix: 'Thêm number_format: "0%" cho mapping cột đó' },
            { key: '4', error: 'Ô trống thay vì "-"', fix: 'Thêm default_value: "-" cho mapping đó' },
            { key: '5', error: 'Formula click mới ra đúng', fix: 'Đã fix — formulas giờ được tính bằng Python, ghi số thực' },
            { key: '6', error: 'Cell stale khi edit mapping', fix: 'Đã fix — click ô khác sẽ reset state popover' },
            { key: '7', error: 'Lookup cascade trigger', fix: 'Thêm filter_field/value trên rule + trigger_value trong webhook body' },
          ]}
          columns={[
            { title: 'Lỗi', dataIndex: 'error', width: 240, render: (v: string) => <Text style={{ color: 'var(--error)', fontSize: 12 }}>{v}</Text> },
            { title: 'Cách fix', dataIndex: 'fix' },
          ]}
        />
      </Card>

      {/* ─── Lark Field Types ─── */}
      <Card style={{ marginTop: 16, background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
        <Title level={4} style={{ color: 'var(--foreground)', marginTop: 0 }}>Lark Field Types</Title>
        <Table
          size="small"
          pagination={false}
          dataSource={[
            { key: '1', type: 'Text', handling: 'Lấy text trực tiếp' },
            { key: '2', type: 'Number / Formula', handling: 'Lấy số. Nested {"type":2, "value":[N]} tự extract' },
            { key: '3', type: 'DateTime', handling: 'Timestamp ms → dd/mm/yyyy' },
            { key: '4', type: 'SingleSelect', handling: 'Lấy option text' },
            { key: '5', type: 'Checkbox', handling: 'True → 1, False → 0' },
            { key: '6', type: 'Lookup', handling: 'Extract giá trị, join nhiều items bằng dấu phẩy' },
            { key: '7', type: 'Person / User', handling: 'Lấy tên người' },
            { key: '8', type: 'URL / Link', handling: 'Lấy link text' },
          ]}
          columns={[
            { title: 'Lark Type', dataIndex: 'type', width: 150, render: (v: string) => <Tag>{v}</Tag> },
            { title: 'Cách xử lý', dataIndex: 'handling' },
          ]}
        />
      </Card>

      <div style={{ height: 40 }} />
    </div>
  );
}
