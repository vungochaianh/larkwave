'use client';

import React, { useEffect, useState } from 'react';
import {
  Card, Button, Modal, Form, Input, Tag, Space, Typography, message,
  Popconfirm, Row, Col, Table, Select,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  PlusOutlined, ReloadOutlined, DeleteOutlined,
  LinkOutlined, CheckCircleOutlined, SyncOutlined,
  ExperimentOutlined, EditOutlined,
} from '@ant-design/icons';
import {
  listConnections, createConnection, deleteConnection, testConnection, refreshFields,
  updateConnection, getConnection, listLarkApps, getLarkApp,
  type Connection, type ConnectionCreate, type LarkField, type LarkApp,
} from '@/lib/n8nApi';

const { Title, Text } = Typography;

const formatDate = (d: string) =>
  new Date(d).toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

export default function ConnectionsPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingConn, setEditingConn] = useState<Connection | null>(null);
  const [detailConn, setDetailConn] = useState<Connection | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; count: number } | null>(null);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [larkApps, setLarkApps] = useState<LarkApp[]>([]);
  const [createAppSelected, setCreateAppSelected] = useState<string>('');
  const [editAppSelected, setEditAppSelected] = useState<string>('');
  const [form] = Form.useForm();
  const [editForm] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const data = await listConnections();
      setConnections(data);
      if (detailConn) {
        const updated = data.find(c => c._id === detailConn._id);
        if (updated) setDetailConn(updated);
        else setDetailConn(null);
      }
    } catch {
      message.error('Failed to load connections');
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    listLarkApps().then(setLarkApps).catch(() => {});
  }, []);

  const handleLarkAppSelect = async (appId: string, formInstance: ReturnType<typeof Form.useForm>[0], setSelected: (v: string) => void) => {
    setSelected(appId);
    if (!appId) {
      formInstance.setFieldsValue({ lark_app_id: '', lark_app_secret: '' });
      return;
    }
    try {
      const app = await getLarkApp(appId, true);
      formInstance.setFieldsValue({
        lark_app_id: app.lark_app_id,
        lark_app_secret: app.lark_app_secret || '',
      });
    } catch {
      message.error('Failed to load Lark App details');
    }
  };

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      await createConnection(values as ConnectionCreate);
      message.success('Connection created');
      setModalOpen(false);
      form.resetFields();
      setTestResult(null);
      setCreateAppSelected('');
      load();
    } catch (e: unknown) {
      if (e instanceof Error) message.error(e.message);
    }
  };

  const handleTest = async () => {
    try {
      const values = await form.validateFields();
      setTesting(true);
      const result = await testConnection(values as ConnectionCreate);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const count = result.fields?.length || (result as any).field_count || 0;
      setTestResult({ success: true, count });
      message.success(`Connected! Found ${count} fields`);
    } catch (e: unknown) {
      setTestResult({ success: false, count: 0 });
      if (e instanceof Error) message.error(e.message);
    }
    setTesting(false);
  };

  const handleRefresh = async (conn: Connection) => {
    setRefreshingId(conn._id);
    try {
      const result = await refreshFields(conn._id);
      message.success(`Refreshed: ${result.fields?.length || 0} fields`);
      load();
    } catch {
      message.error('Refresh failed');
    }
    setRefreshingId(null);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteConnection(id);
      message.success('Connection deleted');
      if (detailConn?._id === id) setDetailConn(null);
      if (editingConn?._id === id) { setEditModalOpen(false); setEditingConn(null); }
      load();
    } catch {
      message.error('Delete failed');
    }
  };

  const openEdit = async (conn: Connection) => {
    setEditingConn(conn);
    setEditModalOpen(true);
    setEditAppSelected('');
    try {
      const full = await getConnection(conn._id, true);
      editForm.setFieldsValue({
        name: full.name,
        lark_app_id: full.lark_app_id,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        lark_app_secret: (full as any).lark_app_secret || '',
        app_token: full.app_token,
        table_id: full.table_id,
      });
    } catch {
      editForm.setFieldsValue({
        name: conn.name,
        lark_app_id: conn.lark_app_id,
        lark_app_secret: '',
        app_token: conn.app_token,
        table_id: conn.table_id,
      });
    }
  };

  const handleEditSave = async () => {
    if (!editingConn) return;
    try {
      const values = await editForm.validateFields();
      setSaving(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload: Record<string, any> = {
        name: values.name,
        lark_app_id: values.lark_app_id,
        app_token: values.app_token,
        table_id: values.table_id,
      };
      if (values.lark_app_secret && values.lark_app_secret.trim()) {
        payload.lark_app_secret = values.lark_app_secret;
      }
      await updateConnection(editingConn._id, payload);
      message.success('Connection updated');
      setEditModalOpen(false);
      setEditingConn(null);
      editForm.resetFields();
      load();
    } catch (e: unknown) {
      if (e instanceof Error) message.error(e.message);
    }
    setSaving(false);
  };

  const columns: ColumnsType<Connection> = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => (
        <Text strong style={{ color: 'var(--foreground)' }}>
          <LinkOutlined style={{ color: 'var(--accent)', marginRight: 6 }} />
          {name}
        </Text>
      ),
    },
    {
      title: 'App ID',
      dataIndex: 'lark_app_id',
      key: 'lark_app_id',
      responsive: ['sm'],
      render: (id: string) => (
        <Text style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-secondary)' }}>
          {id && id.length > 16 ? id.slice(0, 16) + '...' : id}
        </Text>
      ),
    },
    {
      title: 'Table ID',
      dataIndex: 'table_id',
      key: 'table_id',
      responsive: ['md'],
      render: (id: string) => (
        <Text style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-tertiary)' }}>
          {id && id.length > 16 ? id.slice(0, 16) + '...' : id}
        </Text>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      render: (status: string) => (
        <Tag color={status === 'active' ? 'green' : 'default'}>{status}</Tag>
      ),
    },
    {
      title: 'Fields',
      key: 'fields',
      width: 80,
      render: (_: unknown, record: Connection) => (
        <Tag color="blue">{record.cached_fields?.length || 0}</Tag>
      ),
    },
    {
      title: 'Created',
      dataIndex: 'created_at',
      key: 'created_at',
      responsive: ['lg'],
      width: 160,
      render: (d: string) => (
        <Text style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>{d ? formatDate(d) : '-'}</Text>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 180,
      render: (_: unknown, record: Connection) => (
        <Space size={4}>
          <Button size="small" icon={<EditOutlined />} onClick={(e) => { e.stopPropagation(); openEdit(record); }}>
            Edit
          </Button>
          <Button
            size="small"
            icon={<SyncOutlined spin={refreshingId === record._id} />}
            onClick={(e) => { e.stopPropagation(); handleRefresh(record); }}
            loading={refreshingId === record._id}
          >
            Refresh
          </Button>
          <Popconfirm
            title="Delete this connection?"
            onConfirm={(e) => { e?.stopPropagation(); handleDelete(record._id); }}
            onCancel={(e) => e?.stopPropagation()}
          >
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={(e) => e.stopPropagation()}
            />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const fieldColumns = [
    {
      title: 'Field Name',
      dataIndex: 'field_name',
      render: (v: string) => <Text style={{ color: 'var(--foreground)' }}>{v}</Text>,
    },
    {
      title: 'Field ID',
      dataIndex: 'field_id',
      render: (v: string) => <Text style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{v}</Text>,
    },
    {
      title: 'Type',
      dataIndex: 'type_name',
      render: (v: string, r: LarkField) => (
        <Tag color="blue">{v || r.type_name || `type_${r.type}`}</Tag>
      ),
    },
  ];

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <Title level={3} style={{ color: 'var(--foreground)', margin: 0 }}>
          <LinkOutlined /> Lark Base Connections
        </Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setModalOpen(true); setTestResult(null); form.resetFields(); }}>
            Add Connection
          </Button>
        </Space>
      </div>

      {/* Connections Table */}
      <Card
        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
        styles={{ body: { padding: 0 } }}
      >
        <Table<Connection>
          columns={columns}
          dataSource={connections}
          rowKey="_id"
          size="small"
          loading={loading}
          scroll={{ x: 600 }}
          pagination={false}
          onRow={(record) => ({
            onClick: () => setDetailConn(detailConn?._id === record._id ? null : record),
            style: {
              cursor: 'pointer',
              background: detailConn?._id === record._id ? 'var(--bg-tertiary)' : undefined,
            },
          })}
          locale={{
            emptyText: (
              <div style={{ padding: 32 }}>
                <LinkOutlined style={{ fontSize: 48, color: 'var(--text-tertiary)', display: 'block', marginBottom: 12 }} />
                <Text style={{ color: 'var(--text-secondary)' }}>No connections yet. Add your first Lark Base connection.</Text>
                <div style={{ marginTop: 12 }}>
                  <Button type="primary" icon={<PlusOutlined />} onClick={() => { setModalOpen(true); setTestResult(null); form.resetFields(); }}>
                    Add Connection
                  </Button>
                </div>
              </div>
            ),
          }}
        />
      </Card>

      {/* Fields detail */}
      {detailConn && (
        <Card
          title={
            <Space>
              <LinkOutlined style={{ color: 'var(--accent)' }} />
              <Text strong style={{ color: 'var(--foreground)' }}>{detailConn.name} - Cached Fields</Text>
            </Space>
          }
          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', marginTop: 16 }}
          styles={{ body: { padding: 0 } }}
          extra={
            <Button
              size="small"
              icon={<SyncOutlined />}
              onClick={() => handleRefresh(detailConn)}
              loading={refreshingId === detailConn._id}
            >
              Refresh Fields
            </Button>
          }
        >
          <Table
            dataSource={detailConn.cached_fields || []}
            columns={fieldColumns}
            rowKey="field_id"
            pagination={false}
            size="small"
            scroll={{ x: 400 }}
          />
        </Card>
      )}

      {/* Create Modal */}
      <Modal
        title="Add Lark Base Connection"
        open={modalOpen}
        onOk={handleCreate}
        onCancel={() => { setModalOpen(false); form.resetFields(); setTestResult(null); }}
        okText="Create"
        width="95vw"
        style={{ maxWidth: 550 }}
      >
        <Form form={form} layout="vertical" size="small">
          <Form.Item name="name" label="Connection Name" rules={[{ required: true }]}>
            <Input placeholder="My Lark Base" />
          </Form.Item>
          {larkApps.length > 0 && (
            <Form.Item label="Lark App Config">
              <Select
                value={createAppSelected || undefined}
                placeholder="Select a Lark App or enter manually"
                allowClear
                onChange={(v) => handleLarkAppSelect(v || '', form, setCreateAppSelected)}
                options={[
                  ...larkApps.map(a => ({ value: a._id, label: `${a.name} (${a.lark_app_id.slice(0, 10)}...)` })),
                ]}
              />
            </Form.Item>
          )}
          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item name="lark_app_id" label="Lark App ID" rules={[{ required: true }]}>
                <Input placeholder="cli_xxx" disabled={!!createAppSelected} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="lark_app_secret" label="Lark App Secret" rules={[{ required: true }]}>
                <Input.Password placeholder="***" disabled={!!createAppSelected} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item name="app_token" label="App Token" rules={[{ required: true }]}>
                <Input placeholder="bascnXXX" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="table_id" label="Table ID" rules={[{ required: true }]}>
                <Input placeholder="tblXXX" />
              </Form.Item>
            </Col>
          </Row>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
            <Button
              icon={<ExperimentOutlined />}
              onClick={handleTest}
              loading={testing}
            >
              Test Connection
            </Button>
            {testResult && (
              <Space>
                {testResult.success ? (
                  <>
                    <CheckCircleOutlined style={{ color: 'var(--success)' }} />
                    <Text style={{ color: 'var(--success)', fontSize: 12 }}>
                      Connected - {testResult.count} fields found
                    </Text>
                  </>
                ) : (
                  <Text style={{ color: 'var(--error)', fontSize: 12 }}>Connection failed</Text>
                )}
              </Space>
            )}
          </div>
        </Form>
      </Modal>

      {/* Edit Modal */}
      <Modal
        title={editingConn ? `Edit: ${editingConn.name}` : 'Edit Connection'}
        open={editModalOpen}
        onOk={handleEditSave}
        onCancel={() => { setEditModalOpen(false); setEditingConn(null); editForm.resetFields(); }}
        okText="Save"
        confirmLoading={saving}
        width="95vw"
        style={{ maxWidth: 550 }}
      >
        <Form form={editForm} layout="vertical" size="small">
          <Form.Item name="name" label="Connection Name" rules={[{ required: true }]}>
            <Input placeholder="My Lark Base" />
          </Form.Item>
          {larkApps.length > 0 && (
            <Form.Item label="Lark App Config">
              <Select
                value={editAppSelected || undefined}
                placeholder="Select a Lark App or enter manually"
                allowClear
                onChange={(v) => handleLarkAppSelect(v || '', editForm, setEditAppSelected)}
                options={[
                  ...larkApps.map(a => ({ value: a._id, label: `${a.name} (${a.lark_app_id.slice(0, 10)}...)` })),
                ]}
              />
            </Form.Item>
          )}
          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item name="lark_app_id" label="Lark App ID" rules={[{ required: true }]}>
                <Input placeholder="cli_xxx" disabled={!!editAppSelected} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item
                name="lark_app_secret"
                label="Lark App Secret"
                tooltip="Leave empty to keep existing secret"
              >
                <Input.Password placeholder="****  (leave empty to keep current)" disabled={!!editAppSelected} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item name="app_token" label="App Token" rules={[{ required: true }]}>
                <Input placeholder="bascnXXX" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="table_id" label="Table ID" rules={[{ required: true }]}>
                <Input placeholder="tblXXX" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}
