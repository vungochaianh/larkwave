'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Card, Button, Modal, Form, Input, Select, Tag, Space, Typography, message,
  Popconfirm, Table, Empty, Row, Col, Divider, Alert, Badge, Tooltip, Progress,
} from 'antd';
import {
  PlusOutlined, ReloadOutlined, DeleteOutlined, EditOutlined,
  SwapOutlined, ArrowRightOutlined, SaveOutlined, ThunderboltOutlined,
  CheckCircleOutlined, CloseCircleOutlined, LoadingOutlined,
} from '@ant-design/icons';
import {
  listMappings, createMapping, updateMapping, deleteMapping,
  listConnections, listTemplates,
  type Mapping, type MappingCreate, type FieldMap,
  type Connection, type Template, type LarkField, type Column, type Sheet,
} from '@/lib/n8nApi';

const { Title, Text } = Typography;

import { autoMatchFields, type MappingRow } from '@/lib/fieldMatching';

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

const MAP_TYPES = [
  { value: 'direct', label: 'Direct Value' },
  { value: 'formula', label: 'Formula (keep from template)' },
  { value: 'expression', label: 'Custom Expression' },
  { value: 'static', label: 'Static Value' },
  { value: 'auto_increment', label: 'Auto Increment (1,2,3...)' },
];

// ─── Main ──────────────────────────────────────────────────────────────

export default function MappingsPage() {
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Mapping | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleteItems, setDeleteItems] = useState<DeleteProgress[]>([]);
  const [deleteRunning, setDeleteRunning] = useState(false);
  const cancelRef = useRef(false);

  const [selectedConnId, setSelectedConnId] = useState<string>('');
  const [selectedTemplId, setSelectedTemplId] = useState<string>('');
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [mappingName, setMappingName] = useState('');
  const [rows, setRows] = useState<MappingRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, c, t] = await Promise.all([listMappings(), listConnections(), listTemplates()]);
      setMappings(m);
      setConnections(c);
      setTemplates(t);
    } catch { message.error('Failed to load'); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const selectedConn = connections.find(c => (c._id || c.id) === selectedConnId);
  const selectedTempl = templates.find(t => (t._id || t.id) === selectedTemplId);
  const sheets = selectedTempl?.parsed?.sheets || selectedTempl?.parsed_sheets || [];
  const currentSheet = sheets.find((s: Sheet) => s.name === selectedSheet);
  const larkFields: LarkField[] = selectedConn?.cached_fields || [];
  const excelColumns: Column[] = currentSheet?.columns || [];

  const openCreate = () => {
    setEditing(null);
    setMappingName('');
    setSelectedConnId('');
    setSelectedTemplId('');
    setSelectedSheet('');
    setRows([]);
    setModalOpen(true);
  };

  const openEdit = (m: Mapping) => {
    setEditing(m);
    setMappingName(m.name);
    setSelectedConnId(m.connection_id);
    setSelectedTemplId(m.template_id);
    setSelectedSheet(m.target_sheet);
    setRows((m.field_maps || []).map((fm: FieldMap, i: number) => ({
      key: `${i}`, ...fm,
    })));
    setModalOpen(true);
  };

  const handleAutoMatch = () => {
    if (larkFields.length === 0 || excelColumns.length === 0) {
      message.warning('Select connection and template/sheet first');
      return;
    }
    // Auto-match direct value columns
    const directCols = excelColumns.filter((c: Column) => !c.has_formula);
    const matched = autoMatchFields(larkFields, directCols);

    // Add formula columns as display-only rows
    const formulaRows: MappingRow[] = excelColumns
      .filter((c: Column) => c.has_formula)
      .map((c, i) => ({
        key: `formula_${i}`,
        lark_field: '',
        excel_column: c.letter,
        excel_header: c.header,
        map_type: 'formula',
        expression: c.formula_pattern || 'Auto-calculated',
        scope: 'row',
      }));

    // Auto-increment for STT (column A if exists)
    const sttCol = excelColumns.find((c: Column) => c.header === 'STT' || c.header === 'stt');
    const autoRows: MappingRow[] = sttCol ? [{
      key: 'auto_stt',
      lark_field: '',
      excel_column: sttCol.letter,
      excel_header: 'STT',
      map_type: 'auto_increment',
      expression: null,
      scope: 'row',
    }] : [];

    // Remove STT from matched if it was auto-matched
    const filteredMatched = matched.filter(r => r.excel_column !== sttCol?.letter);

    const allRows = [...autoRows, ...filteredMatched, ...formulaRows];
    // Sort by column letter
    allRows.sort((a, b) => a.excel_column.localeCompare(b.excel_column, undefined, { numeric: true }));

    setRows(allRows);
    message.success(`${filteredMatched.length} direct mapped + ${formulaRows.length} formulas + ${autoRows.length} auto`);
  };

  const addRow = () => {
    setRows(prev => [...prev, {
      key: `${Date.now()}`, lark_field: '', excel_column: '', excel_header: '',
      map_type: 'direct', expression: null, scope: 'row',
    }]);
  };

  const removeRow = (key: string) => setRows(prev => prev.filter(r => r.key !== key));

  const updateRow = (key: string, field: keyof MappingRow, value: string) => {
    setRows(prev => prev.map(r => {
      if (r.key !== key) return r;
      const updated = { ...r, [field]: value };
      if (field === 'excel_column') {
        const col = excelColumns.find((c: Column) => c.letter === value);
        if (col) {
          updated.excel_header = col.header;
          if (col.has_formula) updated.map_type = 'formula';
        }
      }
      return updated;
    }));
  };

  const handleSave = async () => {
    if (!mappingName.trim()) { message.error('Name required'); return; }
    if (!selectedConnId || !selectedTemplId || !selectedSheet) { message.error('Select connection, template, and sheet'); return; }

    const fieldMaps: FieldMap[] = rows
      .filter(r => r.lark_field || r.map_type === 'formula' || r.map_type === 'auto_increment' || r.map_type === 'static')
      .filter(r => r.excel_column)
      .map(r => ({
        lark_field: r.lark_field, excel_column: r.excel_column, excel_header: r.excel_header,
        map_type: r.map_type, expression: r.expression, scope: r.scope,
      }));

    try {
      if (editing) {
        await updateMapping(editing._id, {
          name: mappingName, connection_id: selectedConnId,
          template_id: selectedTemplId, target_sheet: selectedSheet, field_maps: fieldMaps,
        });
        message.success('Updated');
      } else {
        await createMapping({
          name: mappingName, connection_id: selectedConnId,
          template_id: selectedTemplId, target_sheet: selectedSheet, field_maps: fieldMaps,
        } as MappingCreate);
        message.success('Created');
      }
      setModalOpen(false);
      load();
    } catch (e: unknown) { if (e instanceof Error) message.error(e.message); }
  };

  const handleDelete = async (id: string) => {
    try { await deleteMapping(id); message.success('Deleted'); load(); }
    catch { message.error('Failed'); }
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
        await deleteMapping(items[i].id);
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
      const m = mappings.find(m => getId(m) === key);
      return { name: m?.name || String(key), id: String(key) };
    });
    runBulkDelete(items);
  };

  const handleDeleteAll = () => {
    const items = mappings.map(m => ({ name: m.name, id: getId(m) }));
    runBulkDelete(items);
  };

  const getId = (obj: { _id?: string; id?: string }) => obj._id || obj.id || '';
  const getConnName = (id: string) => connections.find(c => getId(c) === id)?.name || id;
  const getTemplName = (id: string) => templates.find(t => getId(t) === id)?.name || id;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <Title level={3} style={{ margin: 0 }}><SwapOutlined /> Field Mappings</Title>
        <Space wrap>
          {selectedKeys.length > 0 && (
            <Button danger icon={<DeleteOutlined />} onClick={handleBulkDelete}>
              Delete Selected ({selectedKeys.length})
            </Button>
          )}
          <Popconfirm title={`Delete all ${mappings.length} mappings?`} onConfirm={handleDeleteAll} disabled={mappings.length === 0}>
            <Button danger icon={<DeleteOutlined />} disabled={mappings.length === 0}>Delete All</Button>
          </Popconfirm>
          <Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>New Mapping</Button>
        </Space>
      </div>

      <Card styles={{ body: { padding: 0 } }}>
        <Table
          dataSource={mappings} columns={[
            { title: 'Name', dataIndex: 'name', render: (v: string) => <Text strong>{v}</Text> },
            { title: 'Connection', dataIndex: 'connection_id', responsive: ['md'] as ('md')[], render: (v: string) => <Tag color="blue">{getConnName(v)}</Tag> },
            { title: 'Template', dataIndex: 'template_id', responsive: ['md'] as ('md')[], render: (v: string) => <Tag color="green">{getTemplName(v)}</Tag> },
            { title: 'Sheet', dataIndex: 'target_sheet', responsive: ['sm'] as ('sm')[], render: (v: string) => <Tag>{v}</Tag> },
            { title: 'Fields', dataIndex: 'field_maps', width: 70, render: (v: FieldMap[]) => <Badge count={v?.length || 0} color="var(--accent-color, #6366f1)" /> },
            { title: 'Created', dataIndex: 'created_at', width: 140, responsive: ['md'] as ('md')[], render: (v: string) => <Text style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{v ? formatDate(v) : '-'}</Text> },
            { title: '', width: 80, render: (_: unknown, r: Mapping) => (
              <Space size={4}>
                <Button size="small" type="text" icon={<EditOutlined />} onClick={() => openEdit(r)} />
                <Popconfirm title="Delete?" onConfirm={() => handleDelete(getId(r))}><Button size="small" type="text" danger icon={<DeleteOutlined />} /></Popconfirm>
              </Space>
            )},
          ]}
          rowKey={(r) => getId(r)}
          rowSelection={{ selectedRowKeys: selectedKeys, onChange: setSelectedKeys }}
          loading={loading} pagination={false} size="small"
          scroll={{ x: 600 }}
          locale={{ emptyText: <Empty description="No mappings" /> }}
        />
      </Card>

      {/* Editor Modal */}
      <Modal
        title={editing ? `Edit: ${editing.name}` : 'New Field Mapping'}
        open={modalOpen} onOk={handleSave} onCancel={() => setModalOpen(false)}
        okText={<><SaveOutlined /> Save</>} width={1000}
        styles={{ body: { maxHeight: '78vh', overflowY: 'auto' } }}
      >
        {/* Step 1 */}
        <Text strong style={{ display: 'block', marginBottom: 8 }}>Step 1: Source & Target</Text>
        <Row gutter={12}>
          <Col xs={24} sm={6}>
            <Text type="secondary" style={{ fontSize: 12 }}>Name</Text>
            <Input size="small" value={mappingName} onChange={e => setMappingName(e.target.value)} placeholder="Invoice Mapping" style={{ marginTop: 2 }} />
          </Col>
          <Col xs={24} sm={6}>
            <Text type="secondary" style={{ fontSize: 12 }}>Connection (Source)</Text>
            <Select size="small" style={{ width: '100%', marginTop: 2 }} value={selectedConnId || undefined}
              onChange={setSelectedConnId} placeholder="Select" showSearch optionFilterProp="label"
              options={connections.map(c => ({ value: getId(c), label: `${c.name} (${c.cached_fields?.length || 0} fields)` }))}
            />
          </Col>
          <Col xs={24} sm={6}>
            <Text type="secondary" style={{ fontSize: 12 }}>Template (Target)</Text>
            <Select size="small" style={{ width: '100%', marginTop: 2 }} value={selectedTemplId || undefined}
              onChange={v => { setSelectedTemplId(v); setSelectedSheet(''); }} placeholder="Select" showSearch optionFilterProp="label"
              options={templates.map(t => ({ value: getId(t), label: t.name }))}
            />
          </Col>
          <Col xs={24} sm={6}>
            <Text type="secondary" style={{ fontSize: 12 }}>Target Sheet</Text>
            <Select size="small" style={{ width: '100%', marginTop: 2 }} value={selectedSheet || undefined}
              onChange={setSelectedSheet} placeholder="Select"
              options={sheets.map((s: Sheet) => ({ value: s.name, label: `${s.name} (${s.columns?.length || 0} cols)` }))}
            />
          </Col>
        </Row>

        <Divider style={{ margin: '14px 0' }} />

        {/* Step 2 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <Text strong>Step 2: Map Fields</Text>
          <Space>
            <Tooltip title="Auto-match fields by name similarity (Vietnamese + English)">
              <Button size="small" type="primary" ghost icon={<ThunderboltOutlined />} onClick={handleAutoMatch}
                disabled={larkFields.length === 0 || excelColumns.length === 0}
              >
                Auto Match
              </Button>
            </Tooltip>
            <Button size="small" icon={<PlusOutlined />} onClick={addRow}>Add Row</Button>
          </Space>
        </div>

        {larkFields.length > 0 && excelColumns.length > 0 && rows.length === 0 && (
          <Alert
            message="Click 'Auto Match' to auto-map fields by name similarity, or 'Add Row' to map manually."
            type="info" showIcon style={{ marginBottom: 12 }}
          />
        )}

        {rows.length > 0 && (
          <>
            <Row gutter={8} style={{ marginBottom: 6, padding: '0 4px' }}>
              <Col span={8}><Text type="secondary" style={{ fontSize: 11 }}>Excel Column (Target)</Text></Col>
              <Col span={1} />
              <Col span={9}><Text type="secondary" style={{ fontSize: 11 }}>Lark Field (Source)</Text></Col>
              <Col span={3}><Text type="secondary" style={{ fontSize: 11 }}>Type</Text></Col>
              <Col span={2}><Text type="secondary" style={{ fontSize: 11 }}>Match</Text></Col>
              <Col span={1} />
            </Row>

            {rows.map(row => {
              const isFormula = row.map_type === 'formula';
              const isAuto = row.map_type === 'auto_increment';
              return (
                <Row key={row.key} gutter={8} style={{ marginBottom: 4, padding: '2px 4px', borderRadius: 4, background: isFormula ? 'rgba(245,158,11,0.06)' : undefined }} align="middle">
                  <Col span={8}>
                    <Select size="small" style={{ width: '100%' }} value={row.excel_column || undefined}
                      onChange={v => updateRow(row.key, 'excel_column', v)} placeholder="Excel column" showSearch optionFilterProp="label"
                      options={excelColumns.map((c: Column) => ({
                        value: c.letter,
                        label: `${c.letter} — ${c.group ? `[${c.group}] ` : ''}${c.header}${c.has_formula ? ' ⚡' : ''}`,
                        disabled: c.has_formula,
                      }))}
                    />
                  </Col>
                  <Col span={1} style={{ textAlign: 'center' }}>
                    <ArrowRightOutlined style={{ color: '#6366f1', fontSize: 11 }} />
                  </Col>
                  <Col span={9}>
                    {isFormula ? (
                      <Text type="secondary" style={{ fontSize: 11 }}>{row.expression || 'Auto-calculated'}</Text>
                    ) : isAuto ? (
                      <Text type="secondary" style={{ fontSize: 11 }}>1, 2, 3... (auto)</Text>
                    ) : (
                      <Select size="small" style={{ width: '100%' }} value={row.lark_field || undefined}
                        onChange={v => updateRow(row.key, 'lark_field', v)} placeholder="Lark field" showSearch optionFilterProp="label"
                        options={larkFields.map((f: LarkField) => ({
                          value: f.field_name,
                          label: `${f.field_name} (${f.type_name || f.type || '?'})`,
                        }))}
                      />
                    )}
                  </Col>
                  <Col span={3}>
                    <Tag color={isFormula ? 'orange' : isAuto ? 'purple' : 'blue'} style={{ fontSize: 10 }}>
                      {isFormula ? 'Formula' : isAuto ? 'Auto #' : 'Direct'}
                    </Tag>
                  </Col>
                  <Col span={2} style={{ textAlign: 'center' }}>
                    {row.confidence !== undefined && (
                      <Tag color={row.confidence >= 80 ? 'green' : row.confidence >= 50 ? 'orange' : 'default'}
                        style={{ fontSize: 10 }}>{row.confidence}%</Tag>
                    )}
                  </Col>
                  <Col span={1}>
                    {!isFormula && (
                      <Button size="small" danger type="text" icon={<DeleteOutlined />} onClick={() => removeRow(row.key)} />
                    )}
                  </Col>
                </Row>
              );
            })}
          </>
        )}

        {rows.length === 0 && larkFields.length === 0 && (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={<Text type="secondary" style={{ fontSize: 12 }}>Select connection and template first</Text>}
            style={{ margin: '16px 0' }} />
        )}
      </Modal>

      {/* ── Delete Progress Modal ── */}
      <Modal
        title={<span><DeleteOutlined style={{ color: 'var(--error)', marginRight: 8 }} />Deleting Mappings</span>}
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
    </div>
  );
}
