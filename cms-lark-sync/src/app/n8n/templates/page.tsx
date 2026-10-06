'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Card, Button, Modal, Input, Select, Tag, Space, Typography, message,
  Popconfirm, Row, Col, Tabs, Table, InputNumber,
  Divider, Tooltip, Empty, Spin, Badge,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  UploadOutlined, ReloadOutlined, DeleteOutlined,
  FileExcelOutlined, DownloadOutlined, EditOutlined,
  InboxOutlined, SaveOutlined, FilePdfOutlined,
  CloudSyncOutlined, CalendarOutlined, DatabaseOutlined,
  FileOutlined, AppstoreOutlined,
} from '@ant-design/icons';
import {
  listTemplates, updateTemplate, deleteTemplate,
  downloadTemplateUrlSync, downloadTemplatePdfUrl, templateId,
  seedHoadonTemplate,
  type Template, type Sheet, type Column,
} from '@/lib/n8nApi';
import TemplateWizardModal from './TemplateWizardModal';

const { Title, Text, Paragraph } = Typography;

const formatDate = (d: string) =>
  new Date(d).toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

const formatRelativeDate = (d: string) => {
  const now = new Date();
  const date = new Date(d);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'Vừa xong';
  if (diffMin < 60) return `${diffMin} phút trước`;
  if (diffHour < 24) return `${diffHour} giờ trước`;
  if (diffDay < 7) return `${diffDay} ngày trước`;
  return formatDate(d);
};

const storageConfig: Record<string, { color: string; label: string; icon: string }> = {
  synced: { color: 'var(--success)', label: 'Synced', icon: '✓' },
  gridfs: { color: 'var(--info)', label: 'GridFS', icon: '☁' },
  disk: { color: 'var(--warning)', label: 'Disk', icon: '💾' },
  missing: { color: 'var(--error)', label: 'Missing', icon: '✗' },
};

// ─── Main ──────────────────────────────────────────────────────────────

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardEditId, setWizardEditId] = useState<string>('');
  const [wizardEditName, setWizardEditName] = useState<string>('');
  const [wizardCreateBlank, setWizardCreateBlank] = useState(false);
  const [editTemplate, setEditTemplate] = useState<Template | null>(null);
  const [editSheets, setEditSheets] = useState<Sheet[]>([]);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setTemplates(await listTemplates()); } catch { message.error('Failed to load'); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openEdit = (t: Template) => {
    const s = t.parsed?.sheets || t.parsed_sheets || [];
    setEditTemplate(t);
    setEditName(t.name);
    setEditDesc(t.description || '');
    setEditSheets(JSON.parse(JSON.stringify(s)));
  };

  const handleSave = async () => {
    if (!editTemplate) return;
    setSaving(true);
    try {
      await updateTemplate(templateId(editTemplate), { name: editName, description: editDesc, parsed_sheets: editSheets } as Partial<Template>);
      message.success('Saved');
      setEditTemplate(null);
      load();
    } catch (e: unknown) { if (e instanceof Error) message.error(e.message); }
    setSaving(false);
  };

  const updateCol = (si: number, ci: number, field: string, value: unknown) => {
    const next = [...editSheets];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (next[si].columns[ci] as any)[field] = value;
    setEditSheets(next);
  };

  const updateSheet = (si: number, field: 'header_row' | 'data_start_row', value: number) => {
    const next = [...editSheets];
    next[si][field] = value;
    setEditSheets(next);
  };

  const removeCol = (si: number, ci: number) => {
    const next = [...editSheets];
    next[si].columns.splice(ci, 1);
    setEditSheets(next);
  };

  const sheetCount = (t: Template) => (t.parsed?.sheets || t.parsed_sheets || []).length;

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  const openWizardEdit = (t: Template) => {
    setWizardEditId(templateId(t));
    setWizardEditName(t.name);
    setWizardOpen(true);
  };

  // ─── Template Card ──────────────────────────────────────────────

  const renderTemplateCard = (t: Template) => {
    const id = templateId(t);
    const sheets = sheetCount(t);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const storage = (t as any).storage || 'disk';
    const sc = storageConfig[storage] || storageConfig.disk;

    return (
      <Col xs={24} sm={12} lg={8} xl={6} key={id}>
        <Card
          hoverable
          style={{
            background: 'var(--bg-secondary)',
            borderColor: 'var(--border-color)',
            borderRadius: 12,
            overflow: 'hidden',
            height: '100%',
          }}
          styles={{
            body: { padding: 0, display: 'flex', flexDirection: 'column', height: '100%' },
          }}
        >
          {/* Header with icon */}
          <div style={{
            padding: '20px 20px 12px',
            background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(139, 92, 246, 0.04) 100%)',
            borderBottom: '1px solid var(--border-color)',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 10,
                background: 'linear-gradient(135deg, #16a34a, #15803d)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <FileExcelOutlined style={{ fontSize: 22, color: '#fff' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Text strong style={{
                  fontSize: 15, color: 'var(--foreground)',
                  display: 'block', lineHeight: 1.3,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }} title={t.name}>
                  {t.name}
                </Text>
                <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                  <Tag style={{ fontSize: 10, margin: 0, borderRadius: 4 }} color="blue">
                    {sheets} sheet{sheets !== 1 ? 's' : ''}
                  </Tag>
                  <Tag style={{
                    fontSize: 10, margin: 0, borderRadius: 4,
                    color: sc.color, borderColor: sc.color,
                    background: `${sc.color}10`,
                  }}>
                    {sc.icon} {sc.label}
                  </Tag>
                </div>
              </div>
            </div>
          </div>

          {/* Body */}
          <div style={{ padding: '12px 20px', flex: 1 }}>
            {t.description ? (
              <Text style={{
                color: 'var(--text-secondary)', fontSize: 12,
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                overflow: 'hidden', lineHeight: 1.5,
              }}>
                {t.description}
              </Text>
            ) : (
              <Text style={{ color: 'var(--text-tertiary)', fontSize: 12, fontStyle: 'italic' }}>
                Chưa có mô tả
              </Text>
            )}

            {/* Meta info */}
            <div style={{ marginTop: 10, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {t.file_size > 0 && (
                <Text style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>
                  <DatabaseOutlined style={{ marginRight: 3 }} />
                  {formatFileSize(t.file_size)}
                </Text>
              )}
              {t.original_filename && (
                <Tooltip title={t.original_filename}>
                  <Text style={{
                    color: 'var(--text-tertiary)', fontSize: 11,
                    maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    <FileOutlined style={{ marginRight: 3 }} />
                    {t.original_filename}
                  </Text>
                </Tooltip>
              )}
            </div>
          </div>

          {/* Footer with actions */}
          <div style={{
            padding: '10px 20px 14px',
            borderTop: '1px solid var(--border-color)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <Text style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>
              <CalendarOutlined style={{ marginRight: 4 }} />
              {t.created_at ? formatRelativeDate(t.created_at) : '-'}
            </Text>
            <Space size={4}>
              <Tooltip title="Edit & Map">
                <Button size="small" type="primary" ghost icon={<EditOutlined />}
                  onClick={() => openWizardEdit(t)}>
                  Edit
                </Button>
              </Tooltip>
              <Tooltip title="Download Excel">
                <Button size="small" icon={<FileExcelOutlined />}
                  href={downloadTemplateUrlSync(id)} target="_blank" />
              </Tooltip>
              <Tooltip title="Download PDF">
                <Button size="small" icon={<FilePdfOutlined />}
                  href={downloadTemplatePdfUrl(id)} target="_blank" />
              </Tooltip>
              <Popconfirm title="Xóa template này?" onConfirm={() => { deleteTemplate(id).then(load); }}>
                <Button size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            </Space>
          </div>
        </Card>
      </Col>
    );
  };

  return (
    <div>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 24, flexWrap: 'wrap', gap: 12,
      }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>
            <AppstoreOutlined style={{ marginRight: 8, color: 'var(--accent-color, #6366f1)' }} />
            Template Library
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Upload, view, and edit Excel templates
          </Text>
        </div>
        <Space wrap>
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Refresh</Button>
          <Button icon={<CloudSyncOutlined />} onClick={async () => {
            try {
              const { authHeaders: getHeaders } = await import('@/lib/n8nApi');
              const headers = await getHeaders();
              const apiBase = process.env.NEXT_PUBLIC_API_BASE || '';
              const res = await fetch(`${apiBase}/api/n8n/templates/sync-gridfs`, { method: 'POST', headers });
              const data = await res.json();
              message.success(data.message || 'Synced');
              load();
            } catch { message.error('Sync failed'); }
          }}>
            Sync GridFS
          </Button>
          <Button type="primary" icon={<UploadOutlined />}
            onClick={() => { setWizardEditId(''); setWizardEditName(''); setWizardCreateBlank(false); setWizardOpen(true); }}
            style={{ borderRadius: 8 }}>
            Upload Template
          </Button>
          <Button icon={<FileExcelOutlined />}
            onClick={() => { setWizardEditId(''); setWizardEditName(''); setWizardCreateBlank(true); setWizardOpen(true); }}
            style={{ borderRadius: 8 }}>
            Create Blank
          </Button>
        </Space>
      </div>

      {/* Template Cards Grid */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Spin size="large" />
        </div>
      ) : templates.length === 0 ? (
        <Card style={{
          background: 'var(--bg-secondary)', borderColor: 'var(--border-color)',
          borderRadius: 12, textAlign: 'center', padding: '40px 0',
        }}>
          <Empty
            image={<InboxOutlined style={{ fontSize: 56, color: 'var(--text-tertiary)' }} />}
            description={
              <Text style={{ color: 'var(--text-secondary)' }}>
                Chưa có template nào
              </Text>
            }
          >
            <Button type="primary" icon={<UploadOutlined />}
              onClick={() => { setWizardEditId(''); setWizardEditName(''); setWizardCreateBlank(false); setWizardOpen(true); }}>
              Upload Template
            </Button>
          </Empty>
        </Card>
      ) : (
        <Row gutter={[16, 16]}>
          {templates.map(renderTemplateCard)}
        </Row>
      )}

      {/* Upload & Map Wizard */}
      <TemplateWizardModal
        open={wizardOpen}
        onClose={() => { setWizardOpen(false); setWizardEditId(''); setWizardEditName(''); setWizardCreateBlank(false); }}
        onSuccess={load}
        editTemplateId={wizardEditId}
        editTemplateName={wizardEditName}
        createBlank={wizardCreateBlank}
      />

      {/* Edit Structure */}
      <Modal
        title={editTemplate ? `Edit: ${editTemplate.name}` : ''} open={!!editTemplate}
        onCancel={() => setEditTemplate(null)} width={900}
        footer={[
          <Button key="c" onClick={() => setEditTemplate(null)}>Cancel</Button>,
          <Button key="s" type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving}>Save</Button>,
        ]}
      >
        {editTemplate && (<>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={12}><label style={{ fontSize: 12, opacity: 0.7 }}>Name</label><Input value={editName} onChange={e => setEditName(e.target.value)} /></Col>
            <Col span={12}><label style={{ fontSize: 12, opacity: 0.7 }}>Description</label><Input value={editDesc} onChange={e => setEditDesc(e.target.value)} /></Col>
          </Row>
          <Divider style={{ margin: '12px 0' }} />
          <Tabs items={editSheets.map((sheet, si) => {
            const cols = sheet.columns || [];
            const directCount = cols.filter((c: Column) => !c.has_formula).length;
            const formulaCount = cols.filter((c: Column) => c.has_formula).length;
            return {
              key: sheet.name,
              label: <span>{sheet.name} <Tag style={{ fontSize: 10 }}>{cols.length}</Tag></span>,
              children: (<div>
                <Row gutter={16} style={{ marginBottom: 12 }}>
                  <Col span={6}><label style={{ fontSize: 12, opacity: 0.7 }}>Header Row</label><InputNumber min={1} max={50} value={sheet.header_row} onChange={v => updateSheet(si, 'header_row', v || 1)} style={{ width: '100%' }} size="small" /></Col>
                  <Col span={6}><label style={{ fontSize: 12, opacity: 0.7 }}>Data Start Row</label><InputNumber min={1} max={100} value={sheet.data_start_row} onChange={v => updateSheet(si, 'data_start_row', v || 2)} style={{ width: '100%' }} size="small" /></Col>
                  <Col span={12} style={{ display: 'flex', alignItems: 'flex-end', gap: 8, paddingBottom: 4 }}>
                    <Tag color="green" style={{ fontSize: 11 }}>Direct: {directCount}</Tag>
                    <Tag color="orange" style={{ fontSize: 11 }}>Formula: {formulaCount}</Tag>
                    <Text type="secondary" style={{ fontSize: 11 }}>Toggle &quot;Type&quot; to mark columns for mapping</Text>
                  </Col>
                </Row>
                <Table dataSource={cols.map((c: Column, i: number) => ({ ...c, _idx: i }))} rowKey="_idx" pagination={false} size="small" scroll={{ y: 400 }} columns={[
                  { title: 'Col', dataIndex: 'letter', width: 50, render: (v: string, r: Column & { _idx: number }) => <Tag color={r.has_formula ? 'orange' : 'green'} style={{ fontFamily: 'monospace' }}>{v}</Tag> },
                  { title: 'Group', dataIndex: 'group', width: 100, render: (v: string) => v ? <Tag color="default" style={{ fontSize: 10 }}>{v}</Tag> : null },
                  { title: 'Header', dataIndex: 'header', render: (_: string, r: Column & { _idx: number }) => <Input size="small" value={r.header} onChange={e => updateCol(si, r._idx, 'header', e.target.value)} /> },
                  { title: 'Type', width: 110, render: (_: unknown, r: Column & { _idx: number }) => (
                    <Select size="small" style={{ width: '100%' }} value={r.has_formula ? 'formula' : 'direct'}
                      onChange={v => { updateCol(si, r._idx, 'has_formula', v === 'formula'); if (v !== 'formula') updateCol(si, r._idx, 'formula_pattern', ''); }}
                      options={[
                        { value: 'direct', label: <span style={{ color: 'var(--success)' }}>Direct</span> },
                        { value: 'formula', label: <span style={{ color: 'var(--warning)' }}>Formula</span> },
                      ]}
                    />
                  )},
                  { title: 'Formula Pattern', dataIndex: 'formula_pattern', width: 180, render: (v: string, r: Column & { _idx: number }) => r.has_formula ? <Input size="small" value={v || ''} placeholder="=formula..." onChange={e => updateCol(si, r._idx, 'formula_pattern', e.target.value)} style={{ fontSize: 11, fontFamily: 'monospace' }} /> : <Text type="secondary" style={{ fontSize: 10 }}>— maps from Lark</Text> },
                  { title: '', width: 36, render: (_: unknown, r: Column & { _idx: number }) => <Popconfirm title="Remove?" onConfirm={() => removeCol(si, r._idx)}><Button type="text" size="small" danger icon={<DeleteOutlined />} /></Popconfirm> },
                ]} />
              </div>),
            };
          })} />
        </>)}
      </Modal>
    </div>
  );
}
