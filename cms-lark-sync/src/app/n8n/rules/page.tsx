'use client';

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  Card, Table, Button, Modal, Form, Input, InputNumber, Select, Tag, Space,
  Typography, message, Popconfirm, Switch, Steps, Row, Col, Divider, Alert, Progress,
} from 'antd';
import {
  PlusOutlined, ReloadOutlined, DeleteOutlined, EditOutlined,
  ThunderboltOutlined, LinkOutlined, FileExcelOutlined, ApiOutlined,
  CopyOutlined, PlayCircleOutlined,
  CheckCircleOutlined, CloseCircleOutlined, LoadingOutlined,
} from '@ant-design/icons';
import {
  listRules, createRule, updateRule, toggleRule, deleteRule,
  listConnections, listTemplates, listMappings,
  type Rule, type RuleCreate, type Connection, type Template, type Mapping, type LarkField,
} from '@/lib/n8nApi';

const { Title, Text } = Typography;

interface DeleteProgress {
  name: string;
  status: 'pending' | 'deleting' | 'done' | 'error';
  error?: string;
}

function formatDate(d: string) {
  try {
    return new Date(d).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return d; }
}

const TRIGGER_TYPES = [
  { value: 'record_change', label: 'Record Change' },
  { value: 'field_update', label: 'Field Update' },
  { value: 'new_record', label: 'New Record' },
  { value: 'manual', label: 'Manual' },
];

const OUTPUT_TYPES = [
  { value: 'lark_webhook', label: 'Lark Webhook + Response (gửi card + trả download_url)' },
  { value: 'download', label: 'Response only (chỉ trả link, không gửi card)' },
];

const FILTER_OPERATORS = [
  { value: 'is', label: 'là' },
  { value: 'isNot', label: 'không phải' },
  { value: 'contains', label: 'chứa' },
  { value: 'isEmpty', label: 'trống' },
  { value: 'isNotEmpty', label: 'không trống' },
];

export default function RulesPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Rule | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleteItems, setDeleteItems] = useState<DeleteProgress[]>([]);
  const [deleteRunning, setDeleteRunning] = useState(false);
  const cancelRef = useRef(false);
  const [form] = Form.useForm();

  // Watch form values for dynamic filtering
  const selectedConnectionId = Form.useWatch('connection_id', form);
  const selectedTemplateId = Form.useWatch('template_id', form);
  const customResponseEnabled = Form.useWatch(['output', 'custom_response_enabled'], form);

  // Derive Lark fields from selected connection
  const larkFields: LarkField[] = useMemo(() => {
    if (!selectedConnectionId) return [];
    const conn = connections.find(c => (c._id || c.id) === selectedConnectionId);
    return conn?.cached_fields || [];
  }, [selectedConnectionId, connections]);

  // Field options for trigger select dropdowns
  const fieldOptions = useMemo(() => {
    return larkFields.map(f => ({
      value: f.field_name,
      label: `${f.field_name} (${f.type_name || f.field_type_label || ''})`,
    }));
  }, [larkFields]);

  // Filter mappings by selected connection + template
  const filteredMappings = useMemo(() => {
    return mappings.filter(m => {
      if (selectedConnectionId && m.connection_id !== selectedConnectionId) return false;
      if (selectedTemplateId && m.template_id !== selectedTemplateId) return false;
      return true;
    });
  }, [mappings, selectedConnectionId, selectedTemplateId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, c, t, m] = await Promise.all([
        listRules(),
        listConnections(),
        listTemplates(),
        listMappings(),
      ]);
      setRules(r);
      setConnections(c);
      setTemplates(t);
      setMappings(m);
    } catch {
      message.error('Failed to load');
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const getConnName = (id: string) => connections.find(c => (c._id || c.id) === id)?.name || id;
  const getTemplName = (id: string) => templates.find(t => (t._id || t.id) === id)?.name || id;

  const WEBHOOK_BASE = process.env.NEXT_PUBLIC_WEBHOOK_BASE || 'https://agents-lark-webhooks.toolswave.net';

  const getWebhookUrl = (ruleId: string, sync = false) =>
    `${WEBHOOK_BASE}/webhook/n8n/${ruleId}${sync ? '?mode=sync' : ''}`;

  const copyWebhookUrl = (ruleId: string, sync = false) => {
    navigator.clipboard.writeText(getWebhookUrl(ruleId, sync));
    message.success(sync ? 'Sync URL copied (returns download_url)!' : 'Async URL copied!');
  };

  /** Generate Lark Automation body JSON for a rule */
  const buildLarkBody = (r: Rule) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body: Record<string, string> = {};
    const trigger = r.trigger || {};
    if (trigger.group_by_field) {
      body[trigger.group_by_field] = `{{${trigger.group_by_field}}}`;
    }
    if (trigger.filter_field && trigger.filter_field !== trigger.group_by_field) {
      body[trigger.filter_field] = `{{${trigger.filter_field}}}`;
    }
    if (trigger.filter_value_from_field && trigger.filter_value_from_field !== trigger.group_by_field && trigger.filter_value_from_field !== trigger.filter_field) {
      body[trigger.filter_value_from_field] = `{{${trigger.filter_value_from_field}}}`;
    }
    // Always include record_id for traceability
    body['record_id'] = '{{ID bản ghi}}';
    return JSON.stringify(body, null, 2);
  };

  const [larkConfigRule, setLarkConfigRule] = useState<Rule | null>(null);
  const [larkBodyText, setLarkBodyText] = useState('');
  const [larkBodySaving, setLarkBodySaving] = useState(false);

  const [testingRuleId, setTestingRuleId] = useState('');
  const [testModal, setTestModal] = useState<{ ruleId: string; groupField: string } | null>(null);
  const [testGroupKey, setTestGroupKey] = useState('');
  const [testDownloadFormat, setTestDownloadFormat] = useState<'excel' | 'pdf' | 'both'>('excel');

  const handleQuickTest = async () => {
    if (!testModal || !testGroupKey.trim()) return;
    setTestingRuleId(testModal.ruleId);
    try {
      const { authHeaders } = await import('@/lib/n8nApi');
      const headers = await authHeaders();
      const apiBase = process.env.NEXT_PUBLIC_API_BASE || '';
      const res = await fetch(`${apiBase}/api/n8n/rules/${testModal.ruleId}/test`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ group_key: testGroupKey }),
      });
      const data = await res.json();
      const result = data.data || data;
      if (result.success) {
        const filename = (result.excel_path || '').split('/').pop() || '';
        const pdfFilename = (result.pdf_path || '').split('/').pop() || '';
        const dlBase = result.download_base || WEBHOOK_BASE;
        message.success(`OK: ${result.records_count} records, ${result.duration_ms}ms`);

        if (testDownloadFormat === 'excel' || testDownloadFormat === 'both') {
          if (filename) window.open(`${dlBase}/download/${filename}`, '_blank');
        }
        if (testDownloadFormat === 'pdf' || testDownloadFormat === 'both') {
          if (pdfFilename) {
            window.open(`${dlBase}/download/${pdfFilename}`, '_blank');
          } else if (result.pdf_download_url) {
            window.open(result.pdf_download_url, '_blank');
          } else if (testDownloadFormat === 'pdf') {
            message.warning('PDF not available — enable "Include PDF" in rule output settings');
          }
        }
      } else {
        const debug = result._debug || data._debug;
        const dbField = debug?.group_by_field_in_db;
        const errMsg = result.detail || result.error || 'Test failed';
        message.error(dbField
          ? `${errMsg} [DB field: "${dbField}"]`
          : errMsg, 8);
      }
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Test error');
    }
    setTestingRuleId('');
    setTestModal(null);
  };

  const openCreate = () => {
    setEditing(null);
    setCurrentStep(0);
    form.resetFields();
    form.setFieldsValue({
      enabled: true,
      debounce_seconds: 5,
      trigger: { type: 'record_change', filter_field: '', filter_value: '', filters: [], group_by_field: '' },
      output: {
        type: 'lark_webhook',
        lark_webhook_url: '',
        include_pdf: false,
        custom_response_enabled: false,
        custom_response: '',
      },
    });
    setModalOpen(true);
  };

  const openEdit = (r: Rule) => {
    setEditing(r);
    setCurrentStep(0);
    form.setFieldsValue({
      name: r.name,
      connection_id: r.connection_id,
      template_id: r.template_id,
      mapping_id: r.mapping_id,
      debounce_seconds: r.debounce_seconds,
      enabled: r.enabled,
      trigger: { ...{ type: 'record_change', filter_field: '', filter_value: '', filters: [], group_by_field: '' }, ...r.trigger },
      output: {
        type: r.output?.type || 'lark_webhook',
        lark_webhook_url: r.output?.lark_webhook_url || '',
        include_pdf: r.output?.include_pdf || false,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        custom_response_enabled: (r.output as any)?.custom_response_enabled || false,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        custom_response: (r.output as any)?.custom_response || '',
      },
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const data: RuleCreate = {
        name: values.name,
        connection_id: values.connection_id,
        template_id: values.template_id,
        mapping_id: values.mapping_id || '',
        trigger: values.trigger,
        output: values.output,
        debounce_seconds: values.debounce_seconds || 5,
        enabled: values.enabled ?? true,
      };

      if (editing) {
        await updateRule(editing._id, data);
        message.success('Rule updated');
      } else {
        await createRule(data);
        message.success('Rule created');
      }
      setModalOpen(false);
      load();
    } catch (e: unknown) {
      if (e instanceof Error) message.error(e.message);
    }
  };

  const handleToggle = async (id: string) => {
    try {
      await toggleRule(id);
      message.success('Toggled');
      load();
    } catch {
      message.error('Toggle failed');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteRule(id);
      message.success('Rule deleted');
      load();
    } catch {
      message.error('Delete failed');
    }
  };

  const runBulkDelete = useCallback(async (items: { name: string; id: string }[]) => {
    cancelRef.current = false;
    const progress: DeleteProgress[] = items.map(i => ({ name: i.name, status: 'pending' }));
    setDeleteItems([...progress]);
    setDeleteModal(true);
    setDeleteRunning(true);

    for (let i = 0; i < items.length; i++) {
      if (cancelRef.current) break;
      progress[i].status = 'deleting';
      setDeleteItems([...progress]);
      try {
        await deleteRule(items[i].id);
        progress[i].status = 'done';
      } catch (e) {
        progress[i].status = 'error';
        progress[i].error = e instanceof Error ? e.message : 'Failed';
      }
      setDeleteItems([...progress]);
    }

    setDeleteRunning(false);
    setSelectedKeys([]);
    load();
  }, [load]);

  const handleBulkDelete = () => {
    const items = selectedKeys.map(key => {
      const r = rules.find(r => r._id === key);
      return { name: r?.name || String(key), id: String(key) };
    });
    runBulkDelete(items);
  };

  const handleDeleteAll = () => {
    const items = rules.map(r => ({ name: r.name, id: r._id }));
    runBulkDelete(items);
  };

  const columns = [
    {
      title: 'Rule',
      key: 'name',
      render: (_: unknown, r: Rule) => (
        <div>
          <Text strong style={{ color: 'var(--foreground)' }}>{r.name}</Text>
          <br />
          <Space size={4} style={{ marginTop: 2 }}>
            <Tag color="blue" style={{ fontSize: 10, margin: 0 }}>{getConnName(r.connection_id)}</Tag>
            <Tag color="green" style={{ fontSize: 10, margin: 0 }}>{getTemplName(r.template_id)}</Tag>
          </Space>
        </div>
      ),
    },
    {
      title: 'Trigger',
      key: 'trigger',
      responsive: ['sm'] as ('sm')[],
      render: (_: unknown, r: Rule) => (
        <Space direction="vertical" size={0}>
          <Tag color="purple">{r.trigger?.type || '-'}</Tag>
          {(r.trigger?.filters?.length || 0) > 0 && (
            <Text style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
              {r.trigger.filters.length} filter{r.trigger.filters.length > 1 ? 's' : ''}
            </Text>
          )}
          {!r.trigger?.filters?.length && r.trigger?.filter_field && (
            <Text style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
              {r.trigger.filter_field} = {r.trigger.filter_value}
            </Text>
          )}
          {r.trigger?.group_by_field && (
            <Text style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
              group: {r.trigger.group_by_field}
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: 'Output',
      key: 'output',
      responsive: ['md'] as ('md')[],
      render: (_: unknown, r: Rule) => (
        <Tag color={r.output?.type === 'lark_webhook' ? 'orange' : 'default'}>
          {r.output?.type || '-'}
        </Tag>
      ),
    },
    {
      title: 'Enabled',
      dataIndex: 'enabled',
      width: 80,
      render: (v: boolean, r: Rule) => (
        <Switch
          checked={v}
          size="small"
          onChange={() => handleToggle(r._id)}
        />
      ),
    },
    {
      title: 'Lark',
      key: 'webhook',
      width: 80,
      render: (_: unknown, r: Rule) => (
        <Button size="small" type="link" icon={<ApiOutlined />}
          onClick={() => {
            setLarkConfigRule(r);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const saved = (r as any).lark_body_template;
            setLarkBodyText(saved || buildLarkBody(r));
          }}
          style={{ fontSize: 10, padding: 0 }}>
          Config
        </Button>
      ),
    },
    {
      title: 'Created',
      dataIndex: 'created_at',
      width: 140,
      responsive: ['lg'] as ('lg')[],
      render: (v: string) => (
        <Text style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{v ? formatDate(v) : '-'}</Text>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 130,
      render: (_: unknown, r: Rule) => (
        <Space size={4}>
          <Button size="small" type="text" icon={<PlayCircleOutlined />}
            loading={testingRuleId === r._id}
            onClick={() => { setTestModal({ ruleId: r._id, groupField: r.trigger?.group_by_field || '' }); setTestGroupKey(''); setTestDownloadFormat('excel'); }}
            title="Quick Test" />
          <Button size="small" type="text" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          <Popconfirm title="Delete this rule?" onConfirm={() => handleDelete(r._id)}>
            <Button size="small" type="text" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const stepItems = [
    { title: 'Basic', icon: <FileExcelOutlined /> },
    { title: 'Trigger', icon: <ThunderboltOutlined /> },
    { title: 'Output', icon: <ApiOutlined /> },
  ];

  // Render ALL steps always (hidden via display:none when inactive).
  // This keeps all Form.Items mounted so Form.useWatch works across steps.
  const renderAllSteps = () => (
    <>
      {/* Step 0: Basic */}
      <div style={{ display: currentStep === 0 ? undefined : 'none' }}>
        <Form.Item name="name" label="Rule Name" rules={[{ required: true, message: 'Enter a rule name' }]}>
          <Input placeholder="e.g. Invoice Export Rule" />
        </Form.Item>

        <Divider plain style={{ margin: '12px 0', color: 'var(--text-tertiary)', fontSize: 12 }}>
          <LinkOutlined /> Data Sources
        </Divider>

        <Form.Item name="template_id" label="Excel Template" rules={[{ required: true, message: 'Select a template' }]}>
          <Select
            placeholder="Select template"
            showSearch
            optionFilterProp="label"
            options={templates.map(t => ({
              value: t._id || t.id,
              label: `${t.name} (${t.parsed?.sheets?.length || t.parsed_sheets?.length || 0} sheets)`,
            }))}
          />
        </Form.Item>

        <Form.Item name="connection_id" label="Lark Base Connection" rules={[{ required: true, message: 'Select a connection' }]}>
          <Select
            placeholder="Select connection"
            showSearch
            optionFilterProp="label"
            options={connections.map(c => ({
              value: c._id,
              label: `${c.name} (${c.cached_fields?.length || 0} fields)`,
            }))}
          />
        </Form.Item>

        <Form.Item
          name="mapping_id"
          label="Field Mapping"
          tooltip="Optional — link a mapping preset for this connection + template"
        >
          <Select
            placeholder={filteredMappings.length ? 'Select mapping (optional)' : 'No mappings for this combo'}
            allowClear
            options={filteredMappings.map(m => ({
              value: m._id,
              label: `${m.name} (${m.field_maps?.length || 0} fields)`,
            }))}
          />
        </Form.Item>

        <Row gutter={12}>
          <Col span={12}>
            <Form.Item name="debounce_seconds" label="Debounce (seconds)">
              <InputNumber min={0} max={300} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="enabled" label="Enabled" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Col>
        </Row>
      </div>

      {/* Step 1: Trigger */}
      <div style={{ display: currentStep === 1 ? undefined : 'none' }}>
        <Form.Item name={['trigger', 'type']} label="Trigger Type" rules={[{ required: true }]}>
          <Select options={TRIGGER_TYPES} />
        </Form.Item>

        {larkFields.length === 0 && selectedConnectionId && (
          <Alert
            type="warning"
            showIcon
            message="Connection has no cached fields. Go to Connections page to refresh fields."
            style={{ marginBottom: 16 }}
          />
        )}
        {!selectedConnectionId && (
          <Alert
            type="info"
            showIcon
            message="Select a connection in Basic step to populate field options."
            style={{ marginBottom: 16 }}
          />
        )}

        <Divider plain style={{ margin: '8px 0', color: 'var(--text-tertiary)', fontSize: 12 }}>
          Lọc bản ghi (AND — đáp ứng tất cả điều kiện)
        </Divider>

        <Form.List name={['trigger', 'filters']}>
          {(fields, { add, remove }) => (
            <>
              {fields.map(({ key, name }) => (
                <div key={key} style={{ marginBottom: 8, padding: '8px 10px', background: 'var(--bg-tertiary)', borderRadius: 6 }}>
                  <Row gutter={8} align="middle">
                    <Col span={8}>
                      <Form.Item name={[name, 'field']} noStyle>
                        <Select
                          placeholder="Chọn field..."
                          allowClear showSearch optionFilterProp="label"
                          options={fieldOptions}
                          size="small"
                        />
                      </Form.Item>
                    </Col>
                    <Col span={5}>
                      <Form.Item name={[name, 'operator']} noStyle initialValue="is">
                        <Select options={FILTER_OPERATORS} size="small" />
                      </Form.Item>
                    </Col>
                    <Col span={9}>
                      <Form.Item name={[name, 'value']} noStyle>
                        <Input placeholder="Giá trị cố định..." size="small" />
                      </Form.Item>
                    </Col>
                    <Col span={2}>
                      <Button size="small" danger type="text" icon={<DeleteOutlined />} onClick={() => remove(name)} />
                    </Col>
                  </Row>
                  <Row gutter={8} style={{ marginTop: 4 }}>
                    <Col span={8}>
                      <Text type="secondary" style={{ fontSize: 10 }}>hoặc lấy từ payload:</Text>
                    </Col>
                    <Col span={14}>
                      <Form.Item name={[name, 'value_from_field']} noStyle>
                        <Select
                          placeholder="Lấy giá trị từ payload field..."
                          allowClear showSearch optionFilterProp="label"
                          options={fieldOptions}
                          size="small"
                        />
                      </Form.Item>
                    </Col>
                  </Row>
                </div>
              ))}
              <Button type="dashed" size="small" onClick={() => add({ field: '', operator: 'is', value: '', value_from_field: '' })} icon={<PlusOutlined />} block>
                Thêm điều kiện lọc
              </Button>
              <Text type="secondary" style={{ fontSize: 10, display: 'block', marginTop: 4 }}>
                Giá trị cố định (text) hoặc từ payload (Lark truyền khi trigger). Nếu cả 2 đều có, payload được ưu tiên.
              </Text>
            </>
          )}
        </Form.List>

        <div style={{ height: 12 }} />

        <Form.Item
          name={['trigger', 'group_by_field']}
          label="Group By Field"
          tooltip="Which field in the webhook payload to use as group key for fetching records."
        >
          <Select
            placeholder={larkFields.length ? 'Select field or type...' : 'Select a connection first'}
            allowClear showSearch optionFilterProp="label"
            options={fieldOptions}
            disabled={larkFields.length === 0}
          />
        </Form.Item>
      </div>

      {/* Step 2: Output */}
      <div style={{ display: currentStep === 2 ? undefined : 'none' }}>
        <Form.Item name={['output', 'type']} label="Output Type" rules={[{ required: true }]}>
          <Select options={OUTPUT_TYPES} />
        </Form.Item>
        <Form.Item name={['output', 'lark_webhook_url']} label="Lark Webhook URL">
          <Input placeholder="https://open.larksuite.com/open-apis/bot/v2/hook/..." />
        </Form.Item>
        <Form.Item name={['output', 'include_pdf']} label="Include PDF" valuePropName="checked">
          <Switch />
        </Form.Item>

        <Divider plain style={{ margin: '16px 0 12px', color: 'var(--text-tertiary)', fontSize: 12 }}>
          Custom Response (for Lark triggers)
        </Divider>

        <Form.Item
          name={['output', 'custom_response_enabled']}
          label="Enable Custom Response"
          valuePropName="checked"
        >
          <Switch />
        </Form.Item>

        {customResponseEnabled && (
          <>
            <Form.Item
              name={['output', 'custom_response']}
              label="Response JSON Body"
              tooltip="This JSON will be returned in the webhook API response"
            >
              <Input.TextArea
                rows={5}
                placeholder={'{"status": "completed", "invoice_number": "{{group_key}}", "download_url": "{{download_url}}", "pdf_url": "{{pdf_download_url}}"}'}
                style={{ fontFamily: 'monospace', fontSize: 12 }}
              />
            </Form.Item>
            <Text
              style={{
                fontSize: 11,
                color: 'var(--text-tertiary)',
                display: 'block',
                marginTop: -16,
                marginBottom: 12,
              }}
            >
              Variables: {'{{group_key}}'}, {'{{download_url}}'} (Excel), {'{{pdf_download_url}}'} (PDF), {'{{rule_name}}'}
            </Text>
          </>
        )}
      </div>
    </>
  );

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <Title level={3} style={{ color: 'var(--foreground)', margin: 0 }}>
          <ThunderboltOutlined /> Webhook Rules
        </Title>
        <Space wrap>
          {selectedKeys.length > 0 && (
            <Button danger icon={<DeleteOutlined />} onClick={handleBulkDelete}>
              Delete Selected ({selectedKeys.length})
            </Button>
          )}
          <Popconfirm title={`Delete all ${rules.length} rules?`} onConfirm={handleDeleteAll} disabled={rules.length === 0}>
            <Button danger icon={<DeleteOutlined />} disabled={rules.length === 0}>Delete All</Button>
          </Popconfirm>
          <Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Create Rule
          </Button>
        </Space>
      </div>

      {/* Stats */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={8}>
          <Card size="small" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
            <Text style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'block' }}>Total</Text>
            <Text strong style={{ fontSize: 20, color: 'var(--foreground)' }}>{rules.length}</Text>
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
            <Text style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'block' }}>Active</Text>
            <Text strong style={{ fontSize: 20, color: 'var(--success)' }}>{rules.filter(r => r.enabled).length}</Text>
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
            <Text style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'block' }}>Disabled</Text>
            <Text strong style={{ fontSize: 20, color: 'var(--text-secondary)' }}>{rules.filter(r => !r.enabled).length}</Text>
          </Card>
        </Col>
      </Row>

      {/* Rules Table */}
      <Card
        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
        styles={{ body: { padding: 0 } }}
      >
        <Table
          dataSource={rules}
          columns={columns}
          rowKey="_id"
          rowSelection={{ selectedRowKeys: selectedKeys, onChange: setSelectedKeys }}
          loading={loading}
          pagination={false}
          size="small"
          scroll={{ x: 600 }}
        />
      </Card>

      {/* Create/Edit Modal — 3 Steps */}
      <Modal
        title={editing ? `Edit Rule: ${editing.name}` : 'Create Webhook Rule'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        width="95vw"
        style={{ maxWidth: 620 }}
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Button
              disabled={currentStep === 0}
              onClick={() => setCurrentStep(s => s - 1)}
            >
              Previous
            </Button>
            <Space>
              <Button onClick={() => setModalOpen(false)}>Cancel</Button>
              {currentStep < stepItems.length - 1 ? (
                <Button type="primary" onClick={() => setCurrentStep(s => s + 1)}>
                  Next
                </Button>
              ) : (
                <Button type="primary" onClick={handleSave}>
                  {editing ? 'Save' : 'Create'}
                </Button>
              )}
            </Space>
          </div>
        }
      >
        <Steps
          current={currentStep}
          items={stepItems}
          size="small"
          style={{ marginBottom: 24 }}
          onChange={setCurrentStep}
        />
        <Form form={form} layout="vertical" size="small">
          {renderAllSteps()}
        </Form>
      </Modal>

      {/* Quick Test Modal */}
      <Modal
        title="Quick Test Rule"
        open={!!testModal}
        onCancel={() => setTestModal(null)}
        onOk={handleQuickTest}
        okText="Run Test"
        okButtonProps={{ loading: !!testingRuleId, disabled: !testGroupKey.trim() }}
        width="95vw"
        style={{ maxWidth: 450 }}
      >
        {testModal && (
          <div>
            <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>
              {testModal.groupField ? `Value for "${testModal.groupField}"` : 'Group key'}
            </Text>
            <Input
              placeholder="e.g. TQ-KB-001768"
              value={testGroupKey}
              onChange={e => setTestGroupKey(e.target.value)}
              onPressEnter={handleQuickTest}
              autoFocus
            />
            <div style={{ marginTop: 12 }}>
              <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>
                Download format
              </Text>
              <Select
                value={testDownloadFormat}
                onChange={setTestDownloadFormat}
                size="small"
                style={{ width: '100%' }}
                options={[
                  { value: 'excel', label: 'Download Excel (.xlsx)' },
                  { value: 'pdf', label: 'Download PDF' },
                  { value: 'both', label: 'Both (Excel + PDF)' },
                ]}
              />
            </div>
            <div style={{ marginTop: 12, padding: 8, background: 'var(--bg-tertiary)', borderRadius: 4, fontSize: 10 }}>
              <Text type="secondary" style={{ fontSize: 10 }}>Webhook URL:</Text>
              <div style={{ fontFamily: 'monospace', fontSize: 10, wordBreak: 'break-all', marginTop: 2 }}>
                {getWebhookUrl(testModal.ruleId)}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Delete Progress Modal ── */}
      <Modal
        title={<span><DeleteOutlined style={{ color: 'var(--error)', marginRight: 8 }} />Deleting Rules</span>}
        open={deleteModal}
        onCancel={() => { if (!deleteRunning) setDeleteModal(false); }}
        closable={!deleteRunning}
        maskClosable={false}
        footer={
          deleteRunning ? (
            <Button danger onClick={() => { cancelRef.current = true; }}>Cancel</Button>
          ) : (
            <Button type="primary" onClick={() => setDeleteModal(false)}>Done</Button>
          )
        }
        width={500}
      >
        {(() => {
          const done = deleteItems.filter(i => i.status === 'done').length;
          const fail = deleteItems.filter(i => i.status === 'error').length;
          const tot = deleteItems.length;
          const pct = tot > 0 ? Math.round(((done + fail) / tot) * 100) : 0;
          return (
            <>
              <Progress
                percent={pct}
                status={deleteRunning ? 'active' : fail > 0 ? 'exception' : 'success'}
                format={() => `${done + fail} / ${tot}`}
                style={{ marginBottom: 12 }}
              />
              <div style={{ fontSize: 12, marginBottom: 8, color: 'var(--text-secondary)' }}>
                <Tag color="green">{done} done</Tag>
                {fail > 0 && <Tag color="red">{fail} failed</Tag>}
                {deleteRunning && <Tag color="blue">processing...</Tag>}
              </div>
              <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: 6 }}>
                {deleteItems.map((item, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                    borderBottom: i < deleteItems.length - 1 ? '1px solid var(--border-color)' : undefined,
                    background: item.status === 'deleting' ? 'var(--bg-tertiary)' : undefined,
                  }}>
                    {item.status === 'pending' && <span style={{ width: 16, textAlign: 'center', color: 'var(--text-tertiary)' }}>-</span>}
                    {item.status === 'deleting' && <LoadingOutlined style={{ color: 'var(--info)', fontSize: 14 }} />}
                    {item.status === 'done' && <CheckCircleOutlined style={{ color: 'var(--success)', fontSize: 14 }} />}
                    {item.status === 'error' && <CloseCircleOutlined style={{ color: 'var(--error)', fontSize: 14 }} />}
                    <Text style={{
                      fontSize: 11, flex: 1,
                      color: item.status === 'error' ? 'var(--error)' : undefined,
                      textDecoration: item.status === 'done' ? 'line-through' : undefined,
                      opacity: item.status === 'done' ? 0.5 : 1,
                    }}>
                      {item.name}
                    </Text>
                    {item.error && <Text type="danger" style={{ fontSize: 10 }}>{item.error}</Text>}
                  </div>
                ))}
              </div>
            </>
          );
        })()}
      </Modal>

      {/* Lark Automation Config Modal */}
      <Modal
        title={larkConfigRule ? `Lark Automation — ${larkConfigRule.name}` : 'Lark Config'}
        open={!!larkConfigRule}
        onCancel={() => setLarkConfigRule(null)}
        footer={<Button onClick={() => setLarkConfigRule(null)}>Close</Button>}
        width="95vw"
        style={{ maxWidth: 650 }}
      >
        {larkConfigRule && (() => {
          const syncUrl = getWebhookUrl(larkConfigRule._id, true);
          const asyncUrl = getWebhookUrl(larkConfigRule._id);
          const bodyJson = buildLarkBody(larkConfigRule);
          return (
            <div style={{ fontSize: 12 }}>
              <div style={{ marginBottom: 16 }}>
                <Text strong style={{ display: 'block', marginBottom: 4 }}>1. Webhook URL</Text>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <Text type="secondary" style={{ fontSize: 10 }}>Sync (trả download_url):</Text>
                    <Input size="small" readOnly value={syncUrl} style={{ fontFamily: 'monospace', fontSize: 11 }}
                      addonAfter={<CopyOutlined onClick={() => { navigator.clipboard.writeText(syncUrl); message.success('Copied!'); }} style={{ cursor: 'pointer' }} />} />
                  </div>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <Text type="secondary" style={{ fontSize: 10 }}>Async (debounce, chạy nền):</Text>
                    <Input size="small" readOnly value={asyncUrl} style={{ fontFamily: 'monospace', fontSize: 11 }}
                      addonAfter={<CopyOutlined onClick={() => { navigator.clipboard.writeText(asyncUrl); message.success('Copied!'); }} style={{ cursor: 'pointer' }} />} />
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <Text strong>2. Request Body (JSON) — chỉnh sửa tự do</Text>
                  <Space size={4}>
                    <Button size="small" onClick={() => setLarkBodyText(buildLarkBody(larkConfigRule))}>
                      Reset
                    </Button>
                    <Button size="small" icon={<CopyOutlined />} onClick={() => { navigator.clipboard.writeText(larkBodyText); message.success('Copied!'); }}>
                      Copy
                    </Button>
                    <Button size="small" type="primary" loading={larkBodySaving} onClick={async () => {
                      try {
                        JSON.parse(larkBodyText); // validate JSON
                      } catch { message.error('JSON không hợp lệ'); return; }
                      setLarkBodySaving(true);
                      try {
                        await updateRule(larkConfigRule._id, { lark_body_template: larkBodyText } as Partial<Rule>);
                        message.success('Saved!');
                      } catch { message.error('Save failed'); }
                      setLarkBodySaving(false);
                    }}>
                      Save
                    </Button>
                  </Space>
                </div>

                {/* Quick insert field buttons */}
                {larkFields.length > 0 && (
                  <div style={{ marginBottom: 6 }}>
                    <Text type="secondary" style={{ fontSize: 10 }}>Chèn field: </Text>
                    <Space size={2} wrap>
                      {larkFields.slice(0, 15).map(f => (
                        <Button key={f.field_name} size="small"
                          style={{ fontSize: 9, padding: '0 4px', height: 20 }}
                          onClick={() => {
                            try {
                              const obj = JSON.parse(larkBodyText);
                              obj[f.field_name] = `{{${f.field_name}}}`;
                              setLarkBodyText(JSON.stringify(obj, null, 2));
                            } catch {
                              // If not valid JSON, append as text
                              setLarkBodyText(prev => prev.replace(/\n}$/, `,\n  "${f.field_name}": "{{${f.field_name}}}"\n}`));
                            }
                          }}>
                          +{f.field_name.substring(0, 12)}
                        </Button>
                      ))}
                    </Space>
                  </div>
                )}

                <Input.TextArea
                  value={larkBodyText}
                  onChange={e => setLarkBodyText(e.target.value)}
                  autoSize={{ minRows: 4, maxRows: 12 }}
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 12,
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--foreground)',
                  }}
                />
                <Text type="secondary" style={{ fontSize: 10, display: 'block', marginTop: 4 }}>
                  {`{{field_name}}`} = Lark sẽ thay bằng giá trị thực. Thêm/bớt field tùy ý. Bấm Save để lưu template này vào rule.
                </Text>
              </div>

              <Divider style={{ margin: '12px 0', fontSize: 12 }}>Flow</Divider>
              <div style={{
                padding: 12, borderRadius: 6, fontSize: 11, lineHeight: 1.8,
                background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)',
                fontFamily: 'monospace', marginBottom: 16,
              }}>
                <div>1. <strong>Lark Base</strong> (button/automation)</div>
                <div style={{ paddingLeft: 16, color: 'var(--text-tertiary)' }}>↓ POST body JSON ở trên</div>
                <div>2. <Tag color="blue" style={{ margin: 0 }}>Webhook URL</Tag> <span style={{ color: 'var(--text-secondary)' }}>(URL ở mục 1)</span></div>
                <div style={{ paddingLeft: 16, color: 'var(--text-tertiary)' }}>↓ fetch records từ Lark Base → render Excel</div>
                <div>3. <strong>Response</strong> trả về cho Lark:</div>
                <pre style={{ margin: '2px 0 0 16px', fontSize: 10, color: 'var(--success)' }}>
{`{
  "success": true,
  "download_url": "https://.../*.xlsx",
  "pdf_download_url": "https://.../*.pdf",
  "records_count": 5
}`}</pre>
                <div style={{ paddingLeft: 16, fontSize: 9, color: 'var(--text-tertiary)' }}>
                  <code>pdf_download_url</code> chỉ có khi bật <b>Include PDF</b> trong Output.
                  Dùng <code>{'{{download_url}}'}</code> hoặc <code>{'{{pdf_download_url}}'}</code> trong Custom Response.
                </div>
                {larkConfigRule.output?.lark_webhook_url && (
                  <>
                    <div style={{ paddingLeft: 16, color: 'var(--text-tertiary)' }}>↓ đồng thời gửi card Lark</div>
                    <div>4. <Tag color="orange" style={{ margin: 0 }}>Lark Bot Webhook</Tag> <span style={{ color: 'var(--text-secondary)' }}>nhận card + link download</span></div>
                  </>
                )}
              </div>

              <Alert type="warning" showIcon style={{ fontSize: 11, marginBottom: 12 }}
                message="Lark Automation gửi đến Webhook URL (mục 1), KHÔNG gửi đến Lark Bot Webhook."
                description="Lark Bot Webhook chỉ để nhận card thông báo kết quả. Body JSON chỉ gửi đến Webhook URL của hệ thống." />

              <div style={{ marginBottom: 16 }}>
                <Text strong style={{ display: 'block', marginBottom: 4 }}>Cấu hình trong Lark Base Automation</Text>
                <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 2, fontSize: 12 }}>
                  <li>Lark Base → <strong>Automation</strong> → New</li>
                  <li>Trigger: &quot;When record is updated&quot; / Button</li>
                  <li>Action: <strong>Send HTTP Request</strong></li>
                  <li>Method: <Tag color="blue">POST</Tag></li>
                  <li>URL: <strong>copy Webhook URL mục 1</strong> (KHÔNG phải bot webhook)</li>
                  <li>Body: <strong>JSON</strong> → paste body mục 2</li>
                  <li>Thay <code>{`{{field}}`}</code> bằng biến Lark (chọn từ danh sách fields)</li>
                </ol>
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}
