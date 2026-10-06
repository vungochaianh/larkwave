'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Card, Button, Table, Space, Typography, Tag, message, Popconfirm,
  Row, Col, Statistic, Input, Tabs, DatePicker, Modal, Progress,
} from 'antd';
import {
  ReloadOutlined, DeleteOutlined, DownloadOutlined,
  FileExcelOutlined, FolderOutlined, SearchOutlined,
  ClearOutlined, CheckCircleOutlined, CloseCircleOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import { listTemplates, deleteTemplate, templateId, downloadTemplateUrlSync, type Template } from '@/lib/n8nApi';
import type { Dayjs } from 'dayjs';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const WEBHOOK_BASE = process.env.NEXT_PUBLIC_WEBHOOK_BASE || 'https://agents-lark-webhooks.toolswave.net';

interface OutputFile {
  name: string;
  size: number;
  created_at: string;
  download_url: string;
}

interface DeleteProgress {
  name: string;
  status: 'pending' | 'deleting' | 'done' | 'error';
  error?: string;
}

function formatSize(b: number) {
  if (!b) return '0 B';
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

function formatDate(d: string) {
  try {
    return new Date(d).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return d; }
}

export default function FilesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [outputFiles, setOutputFiles] = useState<OutputFile[]>([]);
  const [loadingTpl, setLoadingTpl] = useState(true);
  const [loadingOut, setLoadingOut] = useState(true);
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [selectedOutKeys, setSelectedOutKeys] = useState<string[]>([]);
  const [selectedTplKeys, setSelectedTplKeys] = useState<string[]>([]);

  // Delete progress modal
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleteItems, setDeleteItems] = useState<DeleteProgress[]>([]);
  const [deleteRunning, setDeleteRunning] = useState(false);
  const cancelRef = useRef(false);

  const loadTemplates = useCallback(async () => {
    setLoadingTpl(true);
    try { setTemplates(await listTemplates()); } catch { message.error('Failed to load templates'); }
    setLoadingTpl(false);
  }, []);

  const loadOutputFiles = useCallback(async () => {
    setLoadingOut(true);
    try {
      const res = await fetch(`${WEBHOOK_BASE}/api/files`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setOutputFiles(data.data || []);
    } catch { message.error('Failed to load output files'); }
    setLoadingOut(false);
  }, []);

  useEffect(() => { loadTemplates(); loadOutputFiles(); }, [loadTemplates, loadOutputFiles]);

  // ── Delete with progress modal ──
  const runDeleteWithProgress = useCallback(async (
    items: { name: string; id?: string }[],
    type: 'output' | 'template',
  ) => {
    cancelRef.current = false;
    const progress: DeleteProgress[] = items.map(i => ({ name: i.name, status: 'pending' }));
    setDeleteItems([...progress]);
    setDeleteModal(true);
    setDeleteRunning(true);

    let doneCount = 0;
    let failCount = 0;

    for (let i = 0; i < items.length; i++) {
      if (cancelRef.current) break;

      // Update current item to deleting
      progress[i].status = 'deleting';
      setDeleteItems([...progress]);

      try {
        if (type === 'output') {
          const res = await fetch(`${WEBHOOK_BASE}/api/files/${items[i].name}/delete`, { method: 'POST' });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
        } else {
          await deleteTemplate(items[i].id || items[i].name);
        }
        progress[i].status = 'done';
        doneCount++;
      } catch (e) {
        progress[i].status = 'error';
        progress[i].error = e instanceof Error ? e.message : 'Failed';
        failCount++;
      }
      setDeleteItems([...progress]);
    }

    setDeleteRunning(false);

    if (type === 'output') {
      setSelectedOutKeys([]);
      loadOutputFiles();
    } else {
      setSelectedTplKeys([]);
      loadTemplates();
    }
  }, [loadOutputFiles, loadTemplates]);

  // ── Handlers ──
  const handleBulkDeleteOutput = () => {
    const items = selectedOutKeys.map(name => ({ name }));
    runDeleteWithProgress(items, 'output');
  };

  const handleBulkDeleteTemplates = () => {
    const items = selectedTplKeys.map(id => {
      const t = templates.find(t => templateId(t) === id);
      return { name: t?.name || id, id };
    });
    runDeleteWithProgress(items, 'template');
  };

  const handleClearAllOutput = () => {
    const items = outputFiles.map(f => ({ name: f.name }));
    runDeleteWithProgress(items, 'output');
  };

  const handleClearAllTemplates = () => {
    const items = templates.map(t => ({ name: t.name, id: templateId(t) }));
    runDeleteWithProgress(items, 'template');
  };

  // ── Filter output files ──
  const filteredOutput = outputFiles.filter(f => {
    if (search && !f.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (dateRange && dateRange[0] && dateRange[1]) {
      const fileDate = new Date(f.created_at);
      if (fileDate < dateRange[0].startOf('day').toDate()) return false;
      if (fileDate > dateRange[1].endOf('day').toDate()) return false;
    }
    return true;
  });

  const totalTplSize = templates.reduce((s, t) => s + (t.file_size || 0), 0);
  const totalOutSize = outputFiles.reduce((s, f) => s + (f.size || 0), 0);
  const filteredOutSize = filteredOutput.reduce((s, f) => s + (f.size || 0), 0);

  // Progress stats
  const deleteDone = deleteItems.filter(i => i.status === 'done').length;
  const deleteFail = deleteItems.filter(i => i.status === 'error').length;
  const deleteTotal = deleteItems.length;
  const deletePercent = deleteTotal > 0 ? Math.round(((deleteDone + deleteFail) / deleteTotal) * 100) : 0;

  const templateColumns = [
    {
      title: 'Name', dataIndex: 'name', key: 'name',
      render: (name: string, t: Template) => (
        <div>
          <Text strong style={{ fontSize: 13 }}>{name}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 11 }}>{t.original_filename || t.filename || ''}</Text>
        </div>
      ),
    },
    { title: 'Size', dataIndex: 'file_size', key: 'size', width: 90, render: (v: number) => formatSize(v) },
    {
      title: 'Created', dataIndex: 'created_at', key: 'date', width: 140,
      render: (v: string) => <Text type="secondary" style={{ fontSize: 11 }}>{formatDate(v)}</Text>,
    },
    {
      title: '', key: 'actions', width: 80,
      render: (_: unknown, t: Template) => (
        <Space size={4}>
          <Button type="text" size="small" icon={<DownloadOutlined />}
            href={downloadTemplateUrlSync(templateId(t))} target="_blank" />
          <Popconfirm title="Delete?" onConfirm={() => runDeleteWithProgress([{ name: t.name, id: templateId(t) }], 'template')}>
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const outputColumns = [
    {
      title: 'Filename', dataIndex: 'name', key: 'name',
      render: (name: string) => (
        <Text style={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>{name}</Text>
      ),
    },
    { title: 'Size', dataIndex: 'size', key: 'size', width: 90, render: (v: number) => formatSize(v) },
    {
      title: 'Created', dataIndex: 'created_at', key: 'date', width: 140,
      sorter: (a: OutputFile, b: OutputFile) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      defaultSortOrder: 'descend' as const,
      render: (v: string) => <Text type="secondary" style={{ fontSize: 11 }}>{formatDate(v)}</Text>,
    },
    {
      title: '', key: 'actions', width: 80,
      render: (_: unknown, f: OutputFile) => (
        <Space size={4}>
          <Button type="text" size="small" icon={<DownloadOutlined />}
            href={`${WEBHOOK_BASE}${f.download_url}`} target="_blank" />
          <Popconfirm title="Delete?" onConfirm={() => runDeleteWithProgress([{ name: f.name }], 'output')}>
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}><FolderOutlined style={{ marginRight: 8 }} /> File Manager</Title>
          <Text type="secondary" style={{ fontSize: 13 }}>Manage template uploads and generated output files</Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={() => { loadTemplates(); loadOutputFiles(); }}
          loading={loadingTpl || loadingOut}>Refresh</Button>
      </div>

      <Row gutter={16} style={{ marginBottom: 20 }}>
        <Col span={6}>
          <Card size="small"><Statistic title="Templates" value={templates.length} prefix={<FileExcelOutlined />} /></Card>
        </Col>
        <Col span={6}>
          <Card size="small"><Statistic title="Template Size" value={formatSize(totalTplSize)} /></Card>
        </Col>
        <Col span={6}>
          <Card size="small"><Statistic title="Output Files" value={outputFiles.length} prefix={<FileExcelOutlined />} /></Card>
        </Col>
        <Col span={6}>
          <Card size="small"><Statistic title="Output Size" value={formatSize(totalOutSize)} /></Card>
        </Col>
      </Row>

      <Tabs items={[
        {
          key: 'output',
          label: <span><FileExcelOutlined /> Output Files <Tag style={{ fontSize: 10 }}>{outputFiles.length}</Tag></span>,
          children: (
            <>
              {/* Toolbar */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <Input prefix={<SearchOutlined />} placeholder="Search files..." value={search}
                  onChange={e => setSearch(e.target.value)} style={{ width: 220 }} size="small" allowClear />
                <RangePicker size="small" style={{ width: 240 }}
                  onChange={(dates) => setDateRange(dates as [Dayjs | null, Dayjs | null] | null)}
                  format="DD/MM/YYYY" placeholder={['From', 'To']} />
                {(search || dateRange) && (
                  <Tag color="blue" style={{ fontSize: 11 }}>{filteredOutput.length} / {outputFiles.length} files ({formatSize(filteredOutSize)})</Tag>
                )}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                  {selectedOutKeys.length > 0 && (
                    <Popconfirm title={`Delete ${selectedOutKeys.length} selected?`} onConfirm={handleBulkDeleteOutput}>
                      <Button size="small" danger icon={<DeleteOutlined />}>
                        Delete {selectedOutKeys.length}
                      </Button>
                    </Popconfirm>
                  )}
                  {outputFiles.length > 0 && (
                    <Popconfirm title={`Clear ALL ${outputFiles.length} output files?`} okText="Clear All" okButtonProps={{ danger: true }} onConfirm={handleClearAllOutput}>
                      <Button size="small" danger type="dashed" icon={<ClearOutlined />}>
                        Clear All
                      </Button>
                    </Popconfirm>
                  )}
                </div>
              </div>

              <Table
                dataSource={filteredOutput}
                columns={outputColumns}
                rowKey="name"
                loading={loadingOut}
                size="small"
                pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `${t} files` }}
                scroll={{ y: 500 }}
                rowSelection={{
                  selectedRowKeys: selectedOutKeys,
                  onChange: (keys) => setSelectedOutKeys(keys as string[]),
                }}
              />
            </>
          ),
        },
        {
          key: 'templates',
          label: <span><FileExcelOutlined /> Templates <Tag style={{ fontSize: 10 }}>{templates.length}</Tag></span>,
          children: (
            <>
              <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                {selectedTplKeys.length > 0 && (
                  <Popconfirm title={`Delete ${selectedTplKeys.length} selected?`} onConfirm={handleBulkDeleteTemplates}>
                    <Button size="small" danger icon={<DeleteOutlined />}>
                      Delete {selectedTplKeys.length}
                    </Button>
                  </Popconfirm>
                )}
                {templates.length > 0 && (
                  <Popconfirm title={`Clear ALL ${templates.length} templates?`} okText="Clear All" okButtonProps={{ danger: true }} onConfirm={handleClearAllTemplates}>
                    <Button size="small" danger type="dashed" icon={<ClearOutlined />}>
                      Clear All
                    </Button>
                  </Popconfirm>
                )}
              </div>
              <Table
                dataSource={templates}
                columns={templateColumns}
                rowKey={(t) => templateId(t)}
                loading={loadingTpl}
                size="small"
                pagination={false}
                scroll={{ y: 500 }}
                rowSelection={{
                  selectedRowKeys: selectedTplKeys,
                  onChange: (keys) => setSelectedTplKeys(keys as string[]),
                }}
              />
            </>
          ),
        },
      ]} />

      {/* ── Delete Progress Modal ── */}
      <Modal
        title={<span><DeleteOutlined style={{ color: 'var(--error)', marginRight: 8 }} />Deleting Files</span>}
        open={deleteModal}
        onCancel={() => { if (!deleteRunning) setDeleteModal(false); }}
        closable={!deleteRunning}
        maskClosable={false}
        footer={
          deleteRunning ? (
            <Button danger onClick={() => { cancelRef.current = true; }}>
              Cancel
            </Button>
          ) : (
            <Button type="primary" onClick={() => setDeleteModal(false)}>
              Done
            </Button>
          )
        }
        width={500}
      >
        <Progress
          percent={deletePercent}
          status={deleteRunning ? 'active' : deleteFail > 0 ? 'exception' : 'success'}
          format={() => `${deleteDone + deleteFail} / ${deleteTotal}`}
          style={{ marginBottom: 12 }}
        />

        <div style={{ fontSize: 12, marginBottom: 8, color: 'var(--text-secondary)' }}>
          <Tag color="green">{deleteDone} done</Tag>
          {deleteFail > 0 && <Tag color="red">{deleteFail} failed</Tag>}
          {deleteRunning && <Tag color="blue">processing...</Tag>}
        </div>

        <div style={{
          maxHeight: 300, overflowY: 'auto', border: '1px solid var(--border-color, #e2e8f0)',
          borderRadius: 6, padding: 0,
        }}>
          {deleteItems.map((item, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 10px',
              borderBottom: i < deleteItems.length - 1 ? '1px solid var(--border-color, #f1f5f9)' : undefined,
              background: item.status === 'deleting' ? 'var(--bg-tertiary, #fefce8)' : undefined,
            }}>
              {item.status === 'pending' && <span style={{ width: 16, textAlign: 'center', color: '#94a3b8' }}>-</span>}
              {item.status === 'deleting' && <LoadingOutlined style={{ color: 'var(--info)', fontSize: 14 }} />}
              {item.status === 'done' && <CheckCircleOutlined style={{ color: 'var(--success)', fontSize: 14 }} />}
              {item.status === 'error' && <CloseCircleOutlined style={{ color: 'var(--error)', fontSize: 14 }} />}

              <Text style={{
                fontSize: 11, fontFamily: "'JetBrains Mono', monospace", flex: 1,
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
      </Modal>
    </div>
  );
}
