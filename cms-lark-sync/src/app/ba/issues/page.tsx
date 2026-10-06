'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Card, Table, Tag, Space, Typography, Input, Button, Modal, Select, Row, Col,
  Statistic, message, Popconfirm, Form, Radio, Tooltip, Badge,
} from 'antd';
import {
  SyncOutlined, CheckCircleOutlined, ExclamationCircleOutlined,
  SearchOutlined, FilterOutlined, ClockCircleOutlined,
  BugOutlined, WarningOutlined, InfoCircleOutlined,
} from '@ant-design/icons';
import { api } from '@/lib/api';

const { Text, Title } = Typography;
const { TextArea } = Input;

interface Issue {
  _id: string;
  scanId: string;
  baseId: string;
  baseName: string;
  groupName: string;
  itemName: string;
  severity: 'critical' | 'high' | 'medium';
  category: string;
  description: string;
  fields: string[];
  suggestion: string;
  status: 'open' | 'resolved' | 'wont_fix' | 'in_progress';
  resolvedAt: string | null;
  resolvedBy: string;
  resolution: string;
  fingerprint: string;
  firstSeenAt: string;
  lastSeenAt: string;
  scanCount: number;
  createdAt: string;
  updatedAt: string;
}

interface Stats {
  total: number;
  severity: Record<string, number>;
  status: Record<string, number>;
  bases: { _id: string; count: number; open: number }[];
}

const SEVERITY_CONFIG: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  critical: { color: 'red', icon: <BugOutlined />, label: 'Critical' },
  high: { color: 'orange', icon: <WarningOutlined />, label: 'High' },
  medium: { color: 'gold', icon: <InfoCircleOutlined />, label: 'Medium' },
};

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  open: { color: 'red', label: 'Open' },
  in_progress: { color: 'blue', label: 'Fixing' },
  resolved: { color: 'green', label: 'Resolved' },
  wont_fix: { color: 'default', label: "Won't Fix" },
};

const CATEGORY_LABELS: Record<string, string> = {
  wrong_type_number: 'Text → Number',
  wrong_type_lookup: 'Text → Lookup',
  select_no_options: 'Select thiếu options',
  lookup_no_target: 'Lookup chưa trỏ bảng',
  missing_audit: 'Thiếu audit fields',
  duplicate_field: 'Field trùng lặp',
  no_views: 'Thiếu views',
  empty_workflow: 'Workflow trống',
};

const RESOLUTION_PRESETS = [
  'Đã đổi field type',
  'Đã thêm options',
  'Đã cấu hình lookup',
  'Đã thêm audit fields',
  'Đã xóa/đổi tên field trùng',
  'Đã tạo views',
  'Đã thêm workflow nodes',
];

export default function BAIssuesPage() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

  // Filters
  const [filterSeverity, setFilterSeverity] = useState<string | undefined>();
  const [filterStatus, setFilterStatus] = useState<string>('open');
  const [filterBase, setFilterBase] = useState<string | undefined>();
  const [filterCategory, setFilterCategory] = useState<string | undefined>();
  const [search, setSearch] = useState('');

  // Resolve modal
  const [resolveModal, setResolveModal] = useState<{ visible: boolean; issue: Issue | null; bulk: boolean }>({ visible: false, issue: null, bulk: false });
  const [resolveForm] = Form.useForm();

  const fetchIssues = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { limit: '500' };
      if (filterSeverity) params.severity = filterSeverity;
      if (filterStatus) params.status = filterStatus;
      if (filterBase) params.baseName = filterBase;
      if (filterCategory) params.category = filterCategory;
      if (search) params.search = search;

      const { data: res } = await api.get('/analyst-issues', { params });
      setIssues(res.data || []);
    } catch {
      message.error('Lỗi tải danh sách issues');
    } finally {
      setLoading(false);
    }
  }, [filterSeverity, filterStatus, filterBase, filterCategory, search]);

  const fetchStats = useCallback(async () => {
    try {
      const { data: res } = await api.get('/analyst-issues/stats');
      setStats(res.data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchIssues(); fetchStats(); }, [fetchIssues, fetchStats]);

  const handleScan = async () => {
    setScanning(true);
    try {
      const { data: res } = await api.post('/analyst-issues/scan');
      const d = res.data;
      message.success(`Quét xong: ${d.total} vấn đề (${d.created} mới, ${d.updated} cập nhật, ${d.autoResolved} auto-resolved)`);
      fetchIssues();
      fetchStats();
    } catch {
      message.error('Lỗi quét issues');
    } finally {
      setScanning(false);
    }
  };

  const handleResolve = async () => {
    try {
      const values = await resolveForm.validateFields();
      const resolution = values.preset === 'custom' ? values.customResolution : values.preset;

      if (resolveModal.bulk) {
        await api.put('/analyst-issues/bulk-resolve', {
          ids: selectedRowKeys,
          resolution,
          resolvedBy: values.resolvedBy || '',
        });
        message.success(`Đã resolve ${selectedRowKeys.length} issues`);
        setSelectedRowKeys([]);
      } else if (resolveModal.issue) {
        await api.put(`/analyst-issues/${resolveModal.issue._id}/resolve`, {
          resolution,
          resolvedBy: values.resolvedBy || '',
        });
        message.success('Đã resolve issue');
      }

      setResolveModal({ visible: false, issue: null, bulk: false });
      resolveForm.resetFields();
      fetchIssues();
      fetchStats();
    } catch { /* validation error */ }
  };

  const handleStatusChange = async (issue: Issue, status: string) => {
    try {
      await api.put(`/analyst-issues/${issue._id}/status`, { status });
      message.success('Đã cập nhật trạng thái');
      fetchIssues();
      fetchStats();
    } catch {
      message.error('Lỗi cập nhật');
    }
  };

  // Group issues by base for summary
  const baseNames = useMemo(() => {
    const names = new Set(issues.map(i => i.baseName));
    return [...names].sort();
  }, [issues]);

  const allBaseNames = useMemo(() => {
    if (!stats?.bases) return [];
    return stats.bases.map(b => b._id).sort();
  }, [stats]);

  const columns = [
    {
      title: 'Mức độ',
      dataIndex: 'severity',
      key: 'severity',
      width: 100,
      render: (s: string) => {
        const cfg = SEVERITY_CONFIG[s];
        return <Tag color={cfg?.color} icon={cfg?.icon}>{cfg?.label}</Tag>;
      },
      sorter: (a: Issue, b: Issue) => {
        const order = { critical: 0, high: 1, medium: 2 };
        return (order[a.severity] || 0) - (order[b.severity] || 0);
      },
    },
    {
      title: 'Base',
      dataIndex: 'baseName',
      key: 'baseName',
      width: 180,
      render: (name: string) => <Text strong style={{ fontSize: 13 }}>{name}</Text>,
    },
    {
      title: 'Bảng / Item',
      dataIndex: 'itemName',
      key: 'itemName',
      width: 180,
    },
    {
      title: 'Loại',
      dataIndex: 'category',
      key: 'category',
      width: 150,
      render: (c: string) => <Tag>{CATEGORY_LABELS[c] || c}</Tag>,
    },
    {
      title: 'Mô tả',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (desc: string, record: Issue) => (
        <div>
          <div style={{ fontSize: 13 }}>{desc}</div>
          {record.suggestion && <Text type="secondary" style={{ fontSize: 12 }}>{record.suggestion}</Text>}
        </div>
      ),
    },
    {
      title: 'Lần quét',
      dataIndex: 'scanCount',
      key: 'scanCount',
      width: 80,
      align: 'center' as const,
      render: (count: number) => count > 1
        ? <Tooltip title={`Phát hiện trong ${count} lần quét`}><Badge count={count} style={{ backgroundColor: count > 3 ? '#ff4d4f' : '#faad14' }} /></Tooltip>
        : <Text type="secondary">1</Text>,
      sorter: (a: Issue, b: Issue) => a.scanCount - b.scanCount,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (s: string, record: Issue) => {
        const cfg = STATUS_CONFIG[s];
        return (
          <Tooltip title={record.resolution || undefined}>
            <Tag color={cfg?.color}>{cfg?.label}</Tag>
          </Tooltip>
        );
      },
    },
    {
      title: '',
      key: 'actions',
      width: 200,
      render: (_: unknown, record: Issue) => (
        <Space size="small">
          {record.status === 'open' && (
            <>
              <Button
                size="small"
                type="primary"
                icon={<CheckCircleOutlined />}
                onClick={() => {
                  setResolveModal({ visible: true, issue: record, bulk: false });
                  resolveForm.resetFields();
                }}
              >
                Resolve
              </Button>
              <Button
                size="small"
                onClick={() => handleStatusChange(record, 'in_progress')}
              >
                Fixing
              </Button>
            </>
          )}
          {record.status === 'in_progress' && (
            <Button
              size="small"
              type="primary"
              icon={<CheckCircleOutlined />}
              onClick={() => {
                setResolveModal({ visible: true, issue: record, bulk: false });
                resolveForm.resetFields();
              }}
            >
              Resolve
            </Button>
          )}
          {(record.status === 'resolved' || record.status === 'wont_fix') && (
            <Button size="small" onClick={() => handleStatusChange(record, 'open')}>
              Reopen
            </Button>
          )}
          {record.status === 'open' && (
            <Popconfirm title="Đánh dấu Won't Fix?" onConfirm={() => handleStatusChange(record, 'wont_fix')}>
              <Button size="small" type="text" style={{ color: 'var(--text-tertiary)' }}>Skip</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <Title level={4} style={{ margin: 0 }}>BA Issues Tracker</Title>
        <Button
          type="primary"
          icon={<SyncOutlined spin={scanning} />}
          loading={scanning}
          onClick={handleScan}
        >
          Quét lại
        </Button>
      </div>

      {/* Stats */}
      {stats && (
        <Row gutter={16} style={{ marginBottom: 20 }}>
          <Col span={4}>
            <Card size="small">
              <Statistic title="Tổng" value={stats.total} />
            </Card>
          </Col>
          <Col span={4}>
            <Card size="small">
              <Statistic title="Open" value={stats.status?.open || 0} valueStyle={{ color: '#ff4d4f' }} />
            </Card>
          </Col>
          <Col span={4}>
            <Card size="small">
              <Statistic title="Critical" value={stats.severity?.critical || 0} valueStyle={{ color: '#ff4d4f' }} prefix={<BugOutlined />} />
            </Card>
          </Col>
          <Col span={4}>
            <Card size="small">
              <Statistic title="High" value={stats.severity?.high || 0} valueStyle={{ color: '#fa8c16' }} prefix={<WarningOutlined />} />
            </Card>
          </Col>
          <Col span={4}>
            <Card size="small">
              <Statistic title="Medium" value={stats.severity?.medium || 0} valueStyle={{ color: '#faad14' }} prefix={<InfoCircleOutlined />} />
            </Card>
          </Col>
          <Col span={4}>
            <Card size="small">
              <Statistic title="Resolved" value={stats.status?.resolved || 0} valueStyle={{ color: '#52c41a' }} prefix={<CheckCircleOutlined />} />
            </Card>
          </Col>
        </Row>
      )}

      {/* Filters */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Select
            placeholder="Severity"
            allowClear
            style={{ width: 130 }}
            value={filterSeverity}
            onChange={setFilterSeverity}
            options={[
              { value: 'critical', label: 'Critical' },
              { value: 'high', label: 'High' },
              { value: 'medium', label: 'Medium' },
            ]}
          />
          <Select
            placeholder="Status"
            allowClear
            style={{ width: 130 }}
            value={filterStatus}
            onChange={(v) => setFilterStatus(v || '')}
            options={[
              { value: 'open', label: 'Open' },
              { value: 'in_progress', label: 'Fixing' },
              { value: 'resolved', label: 'Resolved' },
              { value: 'wont_fix', label: "Won't Fix" },
            ]}
          />
          <Select
            placeholder="Base"
            allowClear
            showSearch
            style={{ width: 200 }}
            value={filterBase}
            onChange={setFilterBase}
            options={allBaseNames.map(b => ({ value: b, label: b }))}
          />
          <Select
            placeholder="Loại vấn đề"
            allowClear
            style={{ width: 180 }}
            value={filterCategory}
            onChange={setFilterCategory}
            options={Object.entries(CATEGORY_LABELS).map(([k, v]) => ({ value: k, label: v }))}
          />
          <Input
            placeholder="Tìm kiếm..."
            prefix={<SearchOutlined />}
            allowClear
            style={{ width: 200 }}
            value={search}
            onChange={e => setSearch(e.target.value)}
            onPressEnter={() => fetchIssues()}
          />
          <Button icon={<FilterOutlined />} onClick={() => { setFilterSeverity(undefined); setFilterStatus(''); setFilterBase(undefined); setFilterCategory(undefined); setSearch(''); }}>
            Reset
          </Button>
        </Space>
      </Card>

      {/* Bulk actions */}
      {selectedRowKeys.length > 0 && (
        <Card size="small" style={{ marginBottom: 16, borderColor: 'var(--accent-color)' }}>
          <Space>
            <Text>{selectedRowKeys.length} đã chọn</Text>
            <Button
              type="primary"
              size="small"
              icon={<CheckCircleOutlined />}
              onClick={() => {
                setResolveModal({ visible: true, issue: null, bulk: true });
                resolveForm.resetFields();
              }}
            >
              Bulk Resolve
            </Button>
            <Button size="small" onClick={() => setSelectedRowKeys([])}>Bỏ chọn</Button>
          </Space>
        </Card>
      )}

      {/* Issues table */}
      <Table
        dataSource={issues}
        columns={columns}
        rowKey="_id"
        loading={loading}
        size="small"
        pagination={{ pageSize: 50, showSizeChanger: true, showTotal: (total) => `${total} vấn đề` }}
        rowSelection={{
          selectedRowKeys,
          onChange: setSelectedRowKeys,
        }}
        expandable={{
          expandedRowRender: (record) => (
            <div style={{ padding: '8px 16px' }}>
              <Row gutter={16}>
                <Col span={12}>
                  <div style={{ marginBottom: 8 }}>
                    <Text type="secondary">Fields liên quan: </Text>
                    {record.fields.length > 0
                      ? record.fields.map(f => <Tag key={f} style={{ marginBottom: 4 }}>{f}</Tag>)
                      : <Text type="secondary">—</Text>}
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <Text type="secondary">Gợi ý: </Text>
                    <Text>{record.suggestion || '—'}</Text>
                  </div>
                  <div>
                    <Text type="secondary">Group: </Text>
                    <Text>{record.groupName || '—'}</Text>
                  </div>
                </Col>
                <Col span={12}>
                  <div style={{ marginBottom: 8 }}>
                    <Text type="secondary">Phát hiện lần đầu: </Text>
                    <Text>{new Date(record.firstSeenAt).toLocaleString('vi-VN')}</Text>
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <Text type="secondary">Lần quét gần nhất: </Text>
                    <Text>{new Date(record.lastSeenAt).toLocaleString('vi-VN')}</Text>
                  </div>
                  {record.resolution && (
                    <div style={{ marginBottom: 8 }}>
                      <Text type="secondary">Cách sửa: </Text>
                      <Text>{record.resolution}</Text>
                      {record.resolvedBy && <Text type="secondary"> — bởi {record.resolvedBy}</Text>}
                    </div>
                  )}
                  <div>
                    <Text type="secondary">Số lần quét phát hiện: </Text>
                    <Text strong>{record.scanCount}</Text>
                  </div>
                </Col>
              </Row>
            </div>
          ),
        }}
      />

      {/* Resolve modal */}
      <Modal
        title={resolveModal.bulk ? `Resolve ${selectedRowKeys.length} issues` : 'Resolve Issue'}
        open={resolveModal.visible}
        onOk={handleResolve}
        onCancel={() => { setResolveModal({ visible: false, issue: null, bulk: false }); resolveForm.resetFields(); }}
        okText="Resolve"
      >
        {resolveModal.issue && (
          <div style={{ marginBottom: 16, padding: 12, background: 'var(--bg-secondary)', borderRadius: 8 }}>
            <Tag color={SEVERITY_CONFIG[resolveModal.issue.severity]?.color}>
              {resolveModal.issue.severity.toUpperCase()}
            </Tag>
            <Text strong>{resolveModal.issue.itemName}</Text>
            <div style={{ marginTop: 4, fontSize: 13 }}>{resolveModal.issue.description}</div>
          </div>
        )}
        <Form form={resolveForm} layout="vertical">
          <Form.Item name="preset" label="Đã sửa như thế nào?" rules={[{ required: true, message: 'Chọn cách sửa' }]}>
            <Radio.Group>
              <Space direction="vertical">
                {RESOLUTION_PRESETS.map(p => (
                  <Radio key={p} value={p}>{p}</Radio>
                ))}
                <Radio value="custom">Khác...</Radio>
              </Space>
            </Radio.Group>
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, curr) => prev.preset !== curr.preset}>
            {({ getFieldValue }) =>
              getFieldValue('preset') === 'custom' ? (
                <Form.Item name="customResolution" label="Mô tả cách sửa" rules={[{ required: true, message: 'Nhập mô tả' }]}>
                  <TextArea rows={3} placeholder="Mô tả chi tiết cách bạn đã sửa vấn đề này..." />
                </Form.Item>
              ) : null
            }
          </Form.Item>
          <Form.Item name="resolvedBy" label="Người sửa">
            <Input placeholder="Tên người sửa (tuỳ chọn)" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
