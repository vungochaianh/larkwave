'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button, Checkbox, Divider, Drawer, Input, InputNumber, message, Modal,
  Popconfirm, Select, Space, Tag, Tooltip, Typography,
} from 'antd';
import {
  ApartmentOutlined, CopyOutlined, DeleteOutlined, ExportOutlined,
  MinusCircleOutlined, PlusOutlined, SaveOutlined,
} from '@ant-design/icons';
import {
  ReactFlow, Background, Controls, MiniMap,
  useNodesState, useEdgesState, addEdge,
  type Node, type Edge, type Connection, type NodeTypes, type NodeProps,
  Handle, Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

const { Text } = Typography;
const { TextArea } = Input;

// ── Types ────────────────────────────────────────────────────────────────────

type SchemaField = { field_id: string; field_name: string; type_name: string; type?: number; description?: string; options?: string[] };
type SchemaTable = { table_id: string; name: string; fields: SchemaField[] };

type WorkflowNodeData = {
  label: string;
  nodeType: 'trigger' | 'condition' | 'action' | 'delay' | 'notification';
  triggerType?: string;
  tableName?: string;
  watchFields?: string[];
  recordFilter?: string;
  schedule?: string;
  conditionField?: string;
  conditionFieldType?: string;
  conditionOp?: string;
  conditionValue?: string;
  conditionLogic?: 'AND' | 'OR';
  extraConditions?: { field: string; fieldType: string; op: string; value: string }[];
  actionType?: string;
  targetTable?: string;
  fieldMappings?: { field: string; value: string; checked: boolean }[];
  channel?: string;
  template?: string;
  delayMinutes?: number;
  description?: string;
  [key: string]: unknown;
};

type SavedWorkflow = {
  id: string; name: string;
  nodes: Node<WorkflowNodeData>[]; edges: Edge[];
  createdAt: string; updatedAt: string;
};

export type LarkWorkflowBuilderProps = {
  appToken: string; baseName: string;
  tables: SchemaTable[];
  storageKey: string;
  category: 'workflow' | 'automation';
};

// ── Field type icon mapping (Lark-style) ────────────────────────────────────

const FIELD_TYPE_ICON: Record<string, { icon: string; color: string }> = {
  Text:         { icon: 'A≡', color: '#3b82f6' },
  Number:       { icon: '#',  color: '#22c55e' },
  SingleSelect: { icon: '≡',  color: '#f59e0b' },
  MultiSelect:  { icon: '⊞',  color: '#f59e0b' },
  DateTime:     { icon: '◷',  color: '#8b5cf6' },
  Date:         { icon: '◷',  color: '#8b5cf6' },
  Checkbox:     { icon: '☑',  color: '#06b6d4' },
  Person:       { icon: '👤', color: '#ec4899' },
  Phone:        { icon: '☏',  color: '#3b82f6' },
  URL:          { icon: '🔗', color: '#6366f1' },
  Attachment:   { icon: '📎', color: '#f97316' },
  Formula:      { icon: 'fx', color: '#ef4444' },
  SingleLink:   { icon: '↗',  color: '#eab308' },
  DuplexLink:   { icon: '⇄',  color: '#eab308' },
  Lookup:       { icon: '⊕',  color: '#84cc16' },
  Location:     { icon: '📍', color: '#8b5cf6' },
  GroupChat:     { icon: '💬', color: '#ec4899' },
  CreatedTime:  { icon: '◷',  color: '#9ca3af' },
  ModifiedTime: { icon: '◷',  color: '#9ca3af' },
  CreatedBy:    { icon: '👤', color: '#9ca3af' },
  ModifiedBy:   { icon: '👤', color: '#9ca3af' },
  AutoNumber:   { icon: '⊕',  color: '#9ca3af' },
};

function FieldTypeIcon({ typeName, size = 16 }: { typeName: string; size?: number }) {
  const info = FIELD_TYPE_ICON[typeName] || { icon: '?', color: '#6b7280' };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: size + 4, height: size + 4, borderRadius: 4,
      fontSize: size * 0.7, fontWeight: 700, color: info.color,
      background: `${info.color}18`, flexShrink: 0,
    }}>
      {info.icon}
    </span>
  );
}

// ── Operators per field type ─────────────────────────────────────────────────

const OPS_BY_TYPE: Record<string, { value: string; label: string }[]> = {
  Text: [
    { value: 'eq', label: 'là' }, { value: 'neq', label: 'không là' },
    { value: 'contains', label: 'chứa' }, { value: 'not_contains', label: 'không chứa' },
    { value: 'starts_with', label: 'bắt đầu bằng' }, { value: 'ends_with', label: 'kết thúc bằng' },
    { value: 'is_empty', label: 'trống' }, { value: 'is_not_empty', label: 'không trống' },
  ],
  Number: [
    { value: 'eq', label: '=' }, { value: 'neq', label: '≠' },
    { value: 'gt', label: '>' }, { value: 'gte', label: '≥' },
    { value: 'lt', label: '<' }, { value: 'lte', label: '≤' },
    { value: 'between', label: 'trong khoảng' },
    { value: 'is_empty', label: 'trống' }, { value: 'is_not_empty', label: 'không trống' },
  ],
  SingleSelect: [
    { value: 'eq', label: 'là' }, { value: 'neq', label: 'không là' },
    { value: 'in', label: 'thuộc' }, { value: 'not_in', label: 'không thuộc' },
    { value: 'is_empty', label: 'trống' }, { value: 'is_not_empty', label: 'không trống' },
  ],
  MultiSelect: [
    { value: 'has_any', label: 'có bất kỳ' }, { value: 'has_all', label: 'có tất cả' },
    { value: 'is_empty', label: 'trống' }, { value: 'is_not_empty', label: 'không trống' },
  ],
  DateTime: [
    { value: 'eq', label: 'là' }, { value: 'before', label: 'trước' }, { value: 'after', label: 'sau' },
    { value: 'between', label: 'trong khoảng' }, { value: 'is_today', label: 'là hôm nay' },
    { value: 'is_empty', label: 'trống' }, { value: 'is_not_empty', label: 'không trống' },
  ],
  Date: [
    { value: 'eq', label: 'là' }, { value: 'before', label: 'trước' }, { value: 'after', label: 'sau' },
    { value: 'is_today', label: 'là hôm nay' },
    { value: 'is_empty', label: 'trống' }, { value: 'is_not_empty', label: 'không trống' },
  ],
  Checkbox: [
    { value: 'is_true', label: 'có' }, { value: 'is_false', label: 'không' },
  ],
  Person: [
    { value: 'eq', label: 'là' }, { value: 'is_current_user', label: 'là người hiện tại' },
    { value: 'is_empty', label: 'trống' }, { value: 'is_not_empty', label: 'không trống' },
  ],
  _default: [
    { value: 'eq', label: 'là' }, { value: 'neq', label: 'không là' },
    { value: 'is_empty', label: 'trống' }, { value: 'is_not_empty', label: 'không trống' },
  ],
};

const NO_VALUE_OPS = ['is_empty', 'is_not_empty', 'is_today', 'is_true', 'is_false', 'is_current_user'];

function getOpsForType(typeName: string) {
  return OPS_BY_TYPE[typeName] || OPS_BY_TYPE._default;
}

// ── Constants ────────────────────────────────────────────────────────────────

const TRIGGER_TYPES = [
  { value: 'record_created', label: 'Khi tạo bản ghi', icon: '＋', color: '#22c55e' },
  { value: 'record_updated', label: 'Khi có cập nhật bản ghi', icon: '✎', color: '#f59e0b' },
  { value: 'field_changed', label: 'Khi trường thay đổi', icon: '⟳', color: '#3b82f6' },
  { value: 'record_deleted', label: 'Khi xóa bản ghi', icon: '✕', color: '#ef4444' },
  { value: 'schedule', label: 'Theo lịch trình', icon: '◷', color: '#8b5cf6' },
  { value: 'button_click', label: 'Khi nhấn nút', icon: '▶', color: '#06b6d4' },
];

const ACTION_TYPES = [
  { value: 'update_record', label: 'Cập nhật bản ghi', icon: '✎', color: '#f59e0b' },
  { value: 'create_record', label: 'Thêm bản ghi', icon: '＋', color: '#22c55e' },
  { value: 'find_and_update', label: 'Tìm & cập nhật', icon: '⊕', color: '#3b82f6' },
  { value: 'send_notification', label: 'Gửi thông báo', icon: '✉', color: '#ec4899' },
  { value: 'call_webhook', label: 'Gọi webhook', icon: '↗', color: '#6366f1' },
  { value: 'copy_record', label: 'Sao chép bản ghi', icon: '⊡', color: '#06b6d4' },
  { value: 'lock_record', label: 'Khóa bản ghi', icon: '🔒', color: '#9ca3af' },
];

const CHANNEL_OPTIONS = [
  { value: 'lark_bot', label: 'Lark Bot' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'email', label: 'Email' },
  { value: 'webhook', label: 'Webhook' },
];

// ── Node style configs ───────────────────────────────────────────────────────

const NODE_STYLES = {
  trigger: { bg: '#f0fdf4', border: '#86efac', iconBg: '#22c55e', text: '#166534', label: '#15803d' },
  condition: { bg: '#fffbeb', border: '#fcd34d', iconBg: '#f59e0b', text: '#78350f', label: '#b45309' },
  action: { bg: '#eef2ff', border: '#a5b4fc', iconBg: '#6366f1', text: '#312e81', label: '#4338ca' },
  delay: { bg: '#eff6ff', border: '#93c5fd', iconBg: '#3b82f6', text: '#1e3a5f', label: '#2563eb' },
  notification: { bg: '#fdf2f8', border: '#f9a8d4', iconBg: '#ec4899', text: '#831843', label: '#be185d' },
};

const NODE_TYPE_LABELS = {
  trigger: 'Trigger', condition: 'Điều kiện', action: 'Hành động', delay: 'Chờ', notification: 'Thông báo',
};

const OP_LABELS: Record<string, string> = {
  eq: 'là', neq: 'không là', contains: 'chứa', not_contains: 'không chứa',
  starts_with: 'bắt đầu bằng', ends_with: 'kết thúc bằng',
  is_empty: 'trống', is_not_empty: 'không trống',
  gt: '>', gte: '≥', lt: '<', lte: '≤', between: 'trong khoảng',
  in: 'thuộc', not_in: 'không thuộc', has_any: 'có bất kỳ', has_all: 'có tất cả',
  before: 'trước', after: 'sau', is_today: 'là hôm nay',
  is_true: 'có', is_false: 'không', is_current_user: 'là người hiện tại',
};

// ── Custom Node Component (Lark-style) ───────────────────────────────────────

function LarkNode({ data }: { data: WorkflowNodeData }) {
  const nt = data.nodeType;
  const style = NODE_STYLES[nt] || NODE_STYLES.action;

  // Icon & subtitle
  let icon = '▶';
  let subtitle = '';

  if (nt === 'trigger') {
    const t = TRIGGER_TYPES.find(tt => tt.value === data.triggerType);
    icon = t?.icon || '⚡';
    subtitle = data.tableName ? `Bảng: ${data.tableName}` : '';
  } else if (nt === 'action') {
    const a = ACTION_TYPES.find(at => at.value === data.actionType);
    icon = a?.icon || '▶';
    subtitle = data.targetTable ? `Bảng: ${data.targetTable}` : '';
  } else if (nt === 'condition') {
    icon = '?';
    if (data.conditionField) {
      const op = OP_LABELS[data.conditionOp || 'eq'] || data.conditionOp || '';
      subtitle = `${data.conditionField} ${op} ${data.conditionValue || ''}`.trim();
    }
  } else if (nt === 'delay') {
    icon = '◷';
    subtitle = `${data.delayMinutes || 0} phút`;
  } else if (nt === 'notification') {
    icon = '✉';
    subtitle = data.channel || '';
  }

  // Count selected fields for action nodes
  const selectedFields = data.fieldMappings?.filter(f => f.checked)?.length || 0;

  return (
    <div style={{
      background: style.bg, border: `2px solid ${style.border}`,
      borderRadius: 12, minWidth: 220, maxWidth: 320, padding: 0,
      boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    }}>
      <Handle type="target" position={Position.Top}
        style={{ background: style.iconBg, width: 10, height: 10, border: '2px solid #fff' }} />

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px' }}>
        {/* Icon circle */}
        <div style={{
          width: 36, height: 36, borderRadius: 8, flexShrink: 0,
          background: style.iconBg, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18, fontWeight: 700,
        }}>
          {icon}
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: style.text, wordBreak: 'break-word', lineHeight: 1.3 }}>
            {data.label || '(chưa đặt tên)'}
          </div>
          {subtitle && (
            <div style={{ fontSize: 12, color: style.label, marginTop: 2, wordBreak: 'break-word' }}>
              {subtitle}
            </div>
          )}
          {selectedFields > 0 && (
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
              {selectedFields} trường được chọn
            </div>
          )}
          {data.description && (
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 3, fontStyle: 'italic' }}>
              {data.description}
            </div>
          )}
        </div>
      </div>

      {/* Condition Yes/No outputs */}
      {nt === 'condition' ? (
        <div style={{ position: 'relative' }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            padding: '4px 14px 8px', fontSize: 11, fontWeight: 600,
          }}>
            <span style={{ color: '#22c55e' }}>✓ Yes</span>
            <span style={{ color: '#ef4444' }}>✗ No</span>
          </div>
          <Handle type="source" position={Position.Bottom} id="yes"
            style={{ background: '#22c55e', width: 10, height: 10, left: '25%', border: '2px solid #fff' }} />
          <Handle type="source" position={Position.Bottom} id="no"
            style={{ background: '#ef4444', width: 10, height: 10, left: '75%', border: '2px solid #fff' }} />
        </div>
      ) : (
        <Handle type="source" position={Position.Bottom}
          style={{ background: style.iconBg, width: 10, height: 10, border: '2px solid #fff' }} />
      )}
    </div>
  );
}

// All node types use same component
function TriggerNode(p: NodeProps<Node<WorkflowNodeData>>) { return <LarkNode data={{ ...p.data, nodeType: 'trigger' }} />; }
function ConditionNode(p: NodeProps<Node<WorkflowNodeData>>) { return <LarkNode data={{ ...p.data, nodeType: 'condition' }} />; }
function ActionNode(p: NodeProps<Node<WorkflowNodeData>>) { return <LarkNode data={{ ...p.data, nodeType: 'action' }} />; }
function DelayNode(p: NodeProps<Node<WorkflowNodeData>>) { return <LarkNode data={{ ...p.data, nodeType: 'delay' }} />; }
function NotificationNode(p: NodeProps<Node<WorkflowNodeData>>) { return <LarkNode data={{ ...p.data, nodeType: 'notification' }} />; }

const nodeTypes: NodeTypes = {
  trigger: TriggerNode, condition: ConditionNode, action: ActionNode,
  delay: DelayNode, notification: NotificationNode,
};

// ── Export text builder ──────────────────────────────────────────────────────

function buildExportText(wf: SavedWorkflow, baseName: string, category: string): string {
  const lines: string[] = [];
  lines.push(`## ${category === 'workflow' ? 'Workflow' : 'Automation'}: ${wf.name}`);
  lines.push(`Base: ${baseName}`);
  lines.push('');

  const sorted = [...wf.nodes].sort((a, b) => (a.position?.y || 0) - (b.position?.y || 0));

  for (const node of sorted) {
    const d = node.data;
    const nt = d.nodeType || node.type;

    switch (nt) {
      case 'trigger': {
        const t = TRIGGER_TYPES.find(tt => tt.value === d.triggerType);
        lines.push(`### ${t?.label || d.triggerType || 'Trigger'}`);
        if (d.tableName) lines.push(`Bảng: ${d.tableName}`);
        if (d.triggerType === 'field_changed' && d.watchFields?.length) {
          lines.push(`Theo dõi: ${d.watchFields.join(', ')}`);
        }
        if (d.triggerType === 'schedule' && d.schedule) lines.push(`Lịch: ${d.schedule}`);
        break;
      }
      case 'condition': {
        lines.push('### Điều kiện');
        if (d.conditionField) {
          lines.push(`- ${d.conditionField} ${OP_LABELS[d.conditionOp || 'eq']} "${d.conditionValue || ''}"`);
        }
        if (d.extraConditions?.length) {
          for (const ec of d.extraConditions) {
            lines.push(`  ${d.conditionLogic || 'AND'} ${ec.field} ${OP_LABELS[ec.op] || ec.op} "${ec.value}"`);
          }
        }
        break;
      }
      case 'action': {
        const a = ACTION_TYPES.find(at => at.value === d.actionType);
        lines.push(`### ${a?.label || d.actionType || 'Hành động'}`);
        if (d.targetTable) lines.push(`Bảng: ${d.targetTable}`);
        const checked = d.fieldMappings?.filter(f => f.checked);
        if (checked?.length) {
          for (const fm of checked) lines.push(`  - ${fm.field} ← ${fm.value}`);
        }
        break;
      }
      case 'delay':
        lines.push(`### Chờ ${d.delayMinutes || 0} phút`);
        break;
      case 'notification':
        lines.push(`### Gửi thông báo qua ${d.channel || '?'}`);
        if (d.template) lines.push(`  "${d.template}"`);
        break;
    }
    if (d.label) lines.push(`Tên: ${d.label}`);
    if (d.description) lines.push(`Ghi chú: ${d.description}`);
    lines.push('');
  }

  if (wf.edges.length > 0) {
    lines.push('### Luồng');
    for (const e of wf.edges) {
      const src = wf.nodes.find(n => n.id === e.source);
      const tgt = wf.nodes.find(n => n.id === e.target);
      const branch = e.sourceHandle === 'yes' ? ' (Yes)' : e.sourceHandle === 'no' ? ' (No)' : '';
      lines.push(`- ${src?.data?.label || e.source}${branch} → ${tgt?.data?.label || e.target}`);
    }
  }

  return lines.join('\n');
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function LarkWorkflowBuilder({
  appToken, baseName, tables, storageKey, category,
}: LarkWorkflowBuilderProps) {
  const [workflows, setWorkflows] = useState<SavedWorkflow[]>([]);
  const [currentWf, setCurrentWf] = useState<SavedWorkflow | null>(null);
  const [wfName, setWfName] = useState('');
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<WorkflowNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [editingNode, setEditingNode] = useState<Node<WorkflowNodeData> | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newNodeType, setNewNodeType] = useState<string>('action');
  const [newNodeLabel, setNewNodeLabel] = useState('');
  const [exportText, setExportText] = useState('');
  const [exportModal, setExportModal] = useState(false);

  const tableNames = useMemo(() => tables.map(t => t.name), [tables]);
  const fieldsForTable = useCallback((tableName: string) => {
    const tbl = tables.find(t => t.name === tableName);
    return tbl?.fields || [];
  }, [tables]);

  // ── Persistence ────────────────────────────────────────────────────────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setWorkflows(JSON.parse(raw));
    } catch { /* ignore */ }
  }, [storageKey]);

  const persist = useCallback((wfs: SavedWorkflow[]) => {
    setWorkflows(wfs);
    try { localStorage.setItem(storageKey, JSON.stringify(wfs)); } catch { /* ignore */ }
  }, [storageKey]);

  // ── ReactFlow handlers ─────────────────────────────────────────────────────
  const onConnect = useCallback((params: Connection) => {
    const srcNode = nodes.find(n => n.id === params.source);
    const clr = srcNode ? NODE_STYLES[srcNode.data?.nodeType as keyof typeof NODE_STYLES]?.iconBg || '#6366f1' : '#6366f1';
    setEdges(eds => addEdge({
      ...params, animated: true,
      style: { stroke: clr, strokeWidth: 2 },
      label: params.sourceHandle === 'yes' ? 'Yes' : params.sourceHandle === 'no' ? 'No' : undefined,
    }, eds));
  }, [setEdges, nodes]);

  const onNodeDoubleClick = useCallback((_: React.MouseEvent, node: Node<WorkflowNodeData>) => {
    setEditingNode(node);
    setDrawerOpen(true);
  }, []);

  const updateNodeData = useCallback((patch: Partial<WorkflowNodeData>) => {
    if (!editingNode) return;
    const updated = { ...editingNode, data: { ...editingNode.data, ...patch } };
    setEditingNode(updated);
    setNodes(nds => nds.map(n => n.id === editingNode.id ? updated : n));
  }, [editingNode, setNodes]);

  const handleAddNode = useCallback(() => {
    if (!newNodeLabel.trim()) return;
    const id = `node_${Date.now()}`;
    const y = nodes.length > 0 ? Math.max(...nodes.map(n => n.position.y)) + 150 : 50;
    setNodes(nds => [...nds, {
      id, type: newNodeType, position: { x: 250, y },
      data: { label: newNodeLabel.trim(), nodeType: newNodeType as WorkflowNodeData['nodeType'] },
    }]);
    setAddModalOpen(false);
    setNewNodeLabel('');
  }, [newNodeLabel, newNodeType, nodes, setNodes]);

  const deleteNode = useCallback((nodeId: string) => {
    setNodes(nds => nds.filter(n => n.id !== nodeId));
    setEdges(eds => eds.filter(e => e.source !== nodeId && e.target !== nodeId));
    if (editingNode?.id === nodeId) { setEditingNode(null); setDrawerOpen(false); }
  }, [setNodes, setEdges, editingNode]);

  const saveWorkflow = useCallback(() => {
    const name = wfName.trim() || `${category === 'workflow' ? 'Workflow' : 'Automation'} ${workflows.length + 1}`;
    const now = new Date().toISOString();
    const snap = (n: Node<WorkflowNodeData>[]) => n.map(x => ({ id: x.id, type: x.type, position: x.position, data: x.data })) as Node<WorkflowNodeData>[];
    const snapE = (e: Edge[]) => e.map(x => ({ id: x.id, source: x.source, target: x.target, sourceHandle: x.sourceHandle })) as Edge[];

    if (currentWf) {
      const upd = { ...currentWf, name, nodes: snap(nodes), edges: snapE(edges), updatedAt: now };
      persist(workflows.map(w => w.id === currentWf.id ? upd : w));
      setCurrentWf(upd);
      message.success('Đã lưu');
    } else {
      const wf: SavedWorkflow = { id: `wf_${Date.now()}`, name, nodes: snap(nodes), edges: snapE(edges), createdAt: now, updatedAt: now };
      persist([...workflows, wf]);
      setCurrentWf(wf);
      setWfName(name);
      message.success('Đã tạo');
    }
  }, [wfName, currentWf, nodes, edges, workflows, persist, category]);

  const loadWorkflow = useCallback((wf: SavedWorkflow) => {
    setCurrentWf(wf); setWfName(wf.name); setNodes(wf.nodes || []); setEdges(wf.edges || []);
  }, [setNodes, setEdges]);

  const deleteWorkflow = useCallback((id: string) => {
    persist(workflows.filter(w => w.id !== id));
    if (currentWf?.id === id) { setCurrentWf(null); setWfName(''); setNodes([]); setEdges([]); }
    message.success('Đã xóa');
  }, [workflows, persist, currentWf, setNodes, setEdges]);

  const handleExport = useCallback((wf?: SavedWorkflow) => {
    const t = wf || { id: 'temp', name: wfName || 'Untitled', nodes, edges, createdAt: '', updatedAt: '' };
    setExportText(buildExportText(t, baseName, category));
    setExportModal(true);
  }, [wfName, nodes, edges, baseName, category]);

  const handleExportAll = useCallback(() => {
    setExportText(workflows.map(wf => buildExportText(wf, baseName, category)).join('\n\n---\n\n'));
    setExportModal(true);
  }, [workflows, baseName, category]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's' && nodes.length > 0) { e.preventDefault(); saveWorkflow(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saveWorkflow, nodes]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: '8px 8px 0 0',
        borderBottom: '1px solid var(--border-color)',
      }}>
        <Space size={8}>
          <Input size="small" placeholder={`Tên ${category}...`} value={wfName}
            onChange={e => setWfName(e.target.value)} style={{ width: 220 }} />
          <Tag color={currentWf ? 'green' : 'default'} style={{ fontSize: 10 }}>
            {currentWf ? 'Saved' : 'New'}
          </Tag>
        </Space>
        <Space size={4}>
          <Button size="small" icon={<PlusOutlined />} onClick={() => setAddModalOpen(true)}>Thêm node</Button>
          <Tooltip title="Ctrl+S">
            <Button size="small" type="primary" icon={<SaveOutlined />} onClick={saveWorkflow}
              disabled={nodes.length === 0}>Lưu</Button>
          </Tooltip>
          <Button size="small" icon={<ExportOutlined />} onClick={() => handleExport()}
            disabled={nodes.length === 0}>Export</Button>
          <Button size="small" onClick={() => { setCurrentWf(null); setWfName(''); setNodes([]); setEdges([]); }}>Mới</Button>
        </Space>
      </div>

      {/* Main */}
      <div style={{ display: 'flex', height: 520, border: '1px solid var(--border-color)', borderTop: 0, borderRadius: '0 0 8px 8px', overflow: 'hidden' }}>
        {/* Sidebar */}
        <div style={{ width: 180, background: 'var(--bg-tertiary)', borderRight: '1px solid var(--border-color)', overflowY: 'auto', padding: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text strong style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
              {category === 'workflow' ? 'WORKFLOWS' : 'AUTOMATIONS'} ({workflows.length})
            </Text>
            {workflows.length > 0 && (
              <Tooltip title="Export tất cả">
                <Button size="small" type="text" icon={<ExportOutlined />} onClick={handleExportAll} style={{ fontSize: 10 }} />
              </Tooltip>
            )}
          </div>
          {workflows.map(wf => (
            <div key={wf.id} onClick={() => loadWorkflow(wf)} style={{
              padding: '6px 8px', marginBottom: 4, borderRadius: 6, cursor: 'pointer',
              background: currentWf?.id === wf.id ? 'rgba(99,102,241,0.15)' : 'var(--bg-secondary)',
              border: `1px solid ${currentWf?.id === wf.id ? '#6366f1' : 'var(--border-color)'}`,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Text style={{ fontSize: 12, fontWeight: 600, wordBreak: 'break-word', flex: 1 }}>{wf.name}</Text>
                <Space size={2}>
                  <Button size="small" type="text" icon={<CopyOutlined />} style={{ fontSize: 10, padding: '0 2px' }}
                    onClick={e => { e.stopPropagation(); handleExport(wf); }} />
                  <Popconfirm title="Xóa?" onConfirm={() => deleteWorkflow(wf.id)}>
                    <Button size="small" type="text" danger icon={<DeleteOutlined />} style={{ fontSize: 10, padding: '0 2px' }}
                      onClick={e => e.stopPropagation()} />
                  </Popconfirm>
                </Space>
              </div>
              <Text style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                {wf.nodes?.length || 0} nodes · {new Date(wf.updatedAt).toLocaleDateString('vi')}
              </Text>
            </div>
          ))}
          {workflows.length === 0 && (
            <Text style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'block', textAlign: 'center', marginTop: 20 }}>
              Chưa có {category}
            </Text>
          )}
        </div>

        {/* Canvas */}
        <div style={{ flex: 1 }}>
          {nodes.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12 }}>
              <ApartmentOutlined style={{ fontSize: 40, opacity: 0.3, color: 'var(--text-tertiary)' }} />
              <Text type="secondary">Click &quot;Thêm node&quot; để bắt đầu</Text>
              <Text style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                Double-click node để sửa · Kéo thả để sắp xếp · Nối node bằng handle
              </Text>
            </div>
          ) : (
            <ReactFlow
              nodes={nodes} edges={edges}
              onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
              onConnect={onConnect} onNodeDoubleClick={onNodeDoubleClick}
              nodeTypes={nodeTypes} fitView
              style={{ background: 'var(--background)' }}
            >
              <Background color="var(--border-color)" gap={20} />
              <Controls />
              <MiniMap nodeColor="var(--accent)" style={{ background: 'var(--bg-tertiary)' }} />
            </ReactFlow>
          )}
        </div>
      </div>

      {/* Add Node Modal */}
      <Modal title="Thêm Node" open={addModalOpen} onOk={handleAddNode}
        onCancel={() => setAddModalOpen(false)} okText="Thêm" cancelText="Hủy" width={440}>
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <div>
            <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>Loại node</Text>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {[
                { value: 'trigger', label: 'Trigger', icon: '⚡', color: '#22c55e' },
                { value: 'condition', label: 'Điều kiện', icon: '?', color: '#f59e0b' },
                { value: 'action', label: 'Hành động', icon: '▶', color: '#6366f1' },
                { value: 'delay', label: 'Chờ', icon: '◷', color: '#3b82f6' },
                { value: 'notification', label: 'Thông báo', icon: '✉', color: '#ec4899' },
              ].map(opt => (
                <div key={opt.value} onClick={() => setNewNodeType(opt.value)} style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
                  borderRadius: 8, cursor: 'pointer',
                  background: newNodeType === opt.value ? `${opt.color}15` : 'var(--bg-tertiary)',
                  border: `2px solid ${newNodeType === opt.value ? opt.color : 'transparent'}`,
                }}>
                  <span style={{ fontSize: 16 }}>{opt.icon}</span>
                  <span style={{ fontSize: 13, fontWeight: newNodeType === opt.value ? 600 : 400 }}>{opt.label}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Tên</Text>
            <Input placeholder="VD: Khi có cập nhật bản ghi, Kiểm tra trạng thái..."
              value={newNodeLabel} onChange={e => setNewNodeLabel(e.target.value)}
              onPressEnter={handleAddNode} autoFocus />
          </div>
        </Space>
      </Modal>

      {/* ── Node Editor Drawer (Lark-style) ──────────────────────────────────── */}
      <Drawer
        title={editingNode?.data?.label || 'Chi tiết Node'}
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setEditingNode(null); }}
        width={400}
        extra={editingNode && (
          <Popconfirm title="Xóa node này?" onConfirm={() => deleteNode(editingNode.id)}>
            <Button danger size="small" icon={<DeleteOutlined />}>Xóa</Button>
          </Popconfirm>
        )}
      >
        {editingNode && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Name */}
            <Input value={editingNode.data?.label || ''} onChange={e => updateNodeData({ label: e.target.value })}
              placeholder="Tên node" style={{ fontWeight: 600, fontSize: 15 }} />

            {/* ── TRIGGER ─────────────────────────────────────────────────────── */}
            {editingNode.data?.nodeType === 'trigger' && (
              <>
                <Select value={editingNode.data?.triggerType} onChange={v => updateNodeData({ triggerType: v })}
                  style={{ width: '100%' }} placeholder="Chọn loại trigger">
                  {TRIGGER_TYPES.map(t => (
                    <Select.Option key={t.value} value={t.value}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 24, height: 24, borderRadius: 6, background: t.color, color: '#fff',
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700 }}>
                          {t.icon}
                        </span>
                        {t.label}
                      </span>
                    </Select.Option>
                  ))}
                </Select>

                <div>
                  <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 6 }}>Chọn bảng</Text>
                  <Select showSearch allowClear value={editingNode.data?.tableName || undefined}
                    onChange={v => updateNodeData({ tableName: v || '' })}
                    style={{ width: '100%' }} placeholder="Chọn bảng" optionFilterProp="label"
                    options={tableNames.map(t => ({ value: t, label: t }))} />
                  {tableNames.length === 0 && (
                    <Input placeholder="Nhập tên bảng (thủ công)" value={editingNode.data?.tableName || ''}
                      onChange={e => updateNodeData({ tableName: e.target.value })} style={{ marginTop: 4 }} />
                  )}
                </div>

                {(editingNode.data?.triggerType === 'field_changed' || editingNode.data?.triggerType === 'record_updated') && editingNode.data?.tableName && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <Text strong style={{ fontSize: 13 }}>Chọn trường</Text>
                      <Space size={8}>
                        <a style={{ fontSize: 12 }} onClick={() => {
                          const all = fieldsForTable(editingNode.data?.tableName || '').map(f => f.field_name);
                          updateNodeData({ watchFields: all });
                        }}>Chọn tất cả</a>
                        <a style={{ fontSize: 12 }} onClick={() => updateNodeData({ watchFields: [] })}>Bỏ chọn</a>
                      </Space>
                    </div>
                    <div style={{ maxHeight: 280, overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: 8 }}>
                      {fieldsForTable(editingNode.data?.tableName || '').map(f => {
                        const checked = (editingNode.data?.watchFields || []).includes(f.field_name);
                        return (
                          <div key={f.field_id} style={{
                            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
                            borderBottom: '1px solid var(--border-color)',
                            background: checked ? 'rgba(99,102,241,0.06)' : 'transparent',
                            cursor: 'pointer',
                          }} onClick={() => {
                            const wf = editingNode.data?.watchFields || [];
                            updateNodeData({ watchFields: checked ? wf.filter(x => x !== f.field_name) : [...wf, f.field_name] });
                          }}>
                            <Checkbox checked={checked} />
                            <FieldTypeIcon typeName={f.type_name} />
                            <Text style={{ fontSize: 13 }}>{f.field_name}</Text>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {editingNode.data?.triggerType === 'schedule' && (
                  <Input value={editingNode.data?.schedule || ''} onChange={e => updateNodeData({ schedule: e.target.value })}
                    placeholder="Cron: 0 9 * * 1-5" />
                )}
              </>
            )}

            {/* ── CONDITION ───────────────────────────────────────────────────── */}
            {editingNode.data?.nodeType === 'condition' && (
              <>
                {/* Field picker with type icons */}
                <div>
                  <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 6 }}>Chọn trường</Text>
                  <Select showSearch allowClear value={editingNode.data?.conditionField || undefined}
                    onChange={v => {
                      const f = tables.flatMap(t => t.fields).find(ff => ff.field_name === v);
                      updateNodeData({ conditionField: v || '', conditionFieldType: f?.type_name || '', conditionOp: 'eq', conditionValue: '' });
                    }}
                    style={{ width: '100%' }} placeholder="Chọn trường" optionFilterProp="label">
                    {tables.map(t => (
                      <Select.OptGroup key={t.table_id} label={t.name}>
                        {t.fields.map(f => (
                          <Select.Option key={`${t.table_id}.${f.field_id}`} value={f.field_name} label={f.field_name}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <FieldTypeIcon typeName={f.type_name} size={14} />
                              {f.field_name}
                            </span>
                          </Select.Option>
                        ))}
                      </Select.OptGroup>
                    ))}
                  </Select>
                  {tables.length === 0 && (
                    <Input placeholder="Nhập tên trường (thủ công)" value={editingNode.data?.conditionField || ''}
                      onChange={e => updateNodeData({ conditionField: e.target.value })} style={{ marginTop: 4 }} />
                  )}
                </div>

                {editingNode.data?.conditionField && (
                  <>
                    {/* Operator — based on field type */}
                    <div>
                      <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 6 }}>Thay đổi thành</Text>
                      <Select value={editingNode.data?.conditionOp || 'eq'}
                        onChange={v => updateNodeData({ conditionOp: v })} style={{ width: '100%' }}
                        options={getOpsForType(editingNode.data?.conditionFieldType || '')} />
                    </div>

                    {/* Value — smart based on type */}
                    {!NO_VALUE_OPS.includes(editingNode.data?.conditionOp || '') && (
                      <div>
                        {/* For Select types, show options as tags */}
                        {['SingleSelect', 'MultiSelect'].includes(editingNode.data?.conditionFieldType || '') ? (
                          <Select mode={editingNode.data?.conditionFieldType === 'MultiSelect' ? 'multiple' : undefined}
                            value={editingNode.data?.conditionValue || undefined}
                            onChange={v => updateNodeData({ conditionValue: Array.isArray(v) ? v.join(',') : v })}
                            style={{ width: '100%' }} placeholder="Chọn giá trị" allowClear
                            options={
                              // Try to get options from field definition
                              (() => {
                                const f = tables.flatMap(t => t.fields).find(ff => ff.field_name === editingNode.data?.conditionField);
                                if (f?.options?.length) return f.options.map(o => ({ value: o, label: o }));
                                // Fallback: allow free input
                                return undefined;
                              })()
                            }
                            {...((() => {
                              const f = tables.flatMap(t => t.fields).find(ff => ff.field_name === editingNode.data?.conditionField);
                              return !f?.options?.length ? { mode: 'tags' as const } : {};
                            })())}
                          />
                        ) : (
                          <Input value={editingNode.data?.conditionValue || ''}
                            onChange={e => updateNodeData({ conditionValue: e.target.value })}
                            placeholder="Giá trị" />
                        )}
                      </div>
                    )}
                  </>
                )}

                {/* Extra conditions */}
                <Divider style={{ margin: '4px 0' }} />
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <Text strong style={{ fontSize: 13 }}>Điều kiện thêm</Text>
                    <Select size="small" value={editingNode.data?.conditionLogic || 'AND'}
                      onChange={v => updateNodeData({ conditionLogic: v })} style={{ width: 90 }}
                      options={[{ value: 'AND', label: 'VÀ' }, { value: 'OR', label: 'HOẶC' }]} />
                  </div>
                  {(editingNode.data?.extraConditions || []).map((ec, i) => (
                    <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 6, alignItems: 'center' }}>
                      <Select showSearch size="small" placeholder="Trường" value={ec.field || undefined} style={{ flex: 2 }}
                        optionFilterProp="label"
                        onChange={v => {
                          const f = tables.flatMap(t => t.fields).find(ff => ff.field_name === v);
                          const extra = [...(editingNode.data?.extraConditions || [])];
                          extra[i] = { ...extra[i], field: v || '', fieldType: f?.type_name || '' };
                          updateNodeData({ extraConditions: extra });
                        }}>
                        {tables.flatMap(t => t.fields).map(f => (
                          <Select.Option key={f.field_id} value={f.field_name} label={f.field_name}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <FieldTypeIcon typeName={f.type_name} size={12} />
                              {f.field_name}
                            </span>
                          </Select.Option>
                        ))}
                      </Select>
                      <Select size="small" value={ec.op} style={{ width: 80 }}
                        options={getOpsForType(ec.fieldType || '')}
                        onChange={v => {
                          const extra = [...(editingNode.data?.extraConditions || [])];
                          extra[i] = { ...extra[i], op: v };
                          updateNodeData({ extraConditions: extra });
                        }} />
                      {!NO_VALUE_OPS.includes(ec.op) && (
                        <Input size="small" placeholder="Giá trị" value={ec.value} style={{ flex: 2 }}
                          onChange={e => {
                            const extra = [...(editingNode.data?.extraConditions || [])];
                            extra[i] = { ...extra[i], value: e.target.value };
                            updateNodeData({ extraConditions: extra });
                          }} />
                      )}
                      <Button size="small" type="text" danger icon={<MinusCircleOutlined />}
                        onClick={() => updateNodeData({ extraConditions: (editingNode.data?.extraConditions || []).filter((_, j) => j !== i) })} />
                    </div>
                  ))}
                  <Button size="small" type="dashed" icon={<PlusOutlined />} block
                    onClick={() => updateNodeData({ extraConditions: [...(editingNode.data?.extraConditions || []), { field: '', fieldType: '', op: 'eq', value: '' }] })}>
                    Thêm điều kiện
                  </Button>
                </div>
              </>
            )}

            {/* ── ACTION ──────────────────────────────────────────────────────── */}
            {editingNode.data?.nodeType === 'action' && (
              <>
                <Select value={editingNode.data?.actionType} onChange={v => updateNodeData({ actionType: v })}
                  style={{ width: '100%' }} placeholder="Chọn loại hành động">
                  {ACTION_TYPES.map(a => (
                    <Select.Option key={a.value} value={a.value}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 24, height: 24, borderRadius: 6, background: a.color, color: '#fff',
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700 }}>
                          {a.icon}
                        </span>
                        {a.label}
                      </span>
                    </Select.Option>
                  ))}
                </Select>

                <div>
                  <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 6 }}>Chọn bảng</Text>
                  <Select showSearch allowClear value={editingNode.data?.targetTable || undefined}
                    onChange={v => {
                      // Auto-populate field list when table changes
                      const fields = fieldsForTable(v || '');
                      const mappings = fields.map(f => ({
                        field: f.field_name, value: '', checked: false,
                      }));
                      updateNodeData({ targetTable: v || '', fieldMappings: mappings });
                    }}
                    style={{ width: '100%' }} placeholder="Chọn bảng" optionFilterProp="label"
                    options={tableNames.map(t => ({ value: t, label: t }))} />
                  {tableNames.length === 0 && (
                    <Input placeholder="Nhập tên bảng (thủ công)" value={editingNode.data?.targetTable || ''}
                      onChange={e => updateNodeData({ targetTable: e.target.value })} style={{ marginTop: 4 }} />
                  )}
                </div>

                {/* Field list with checkboxes + type icons (Lark-style) */}
                {editingNode.data?.targetTable && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <Text strong style={{ fontSize: 13 }}>Chọn trường</Text>
                      <Space size={8}>
                        <a style={{ fontSize: 12 }} onClick={() => {
                          const fms = (editingNode.data?.fieldMappings || []).map(f => ({ ...f, checked: true }));
                          updateNodeData({ fieldMappings: fms });
                        }}>Chọn tất cả</a>
                        <a style={{ fontSize: 12 }} onClick={() => {
                          const fms = (editingNode.data?.fieldMappings || []).map(f => ({ ...f, checked: false }));
                          updateNodeData({ fieldMappings: fms });
                        }}>Bỏ chọn</a>
                      </Space>
                    </div>
                    <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: 8 }}>
                      {(editingNode.data?.fieldMappings || []).map((fm, i) => {
                        const field = fieldsForTable(editingNode.data?.targetTable || '').find(f => f.field_name === fm.field);
                        const typeName = field?.type_name || 'Text';
                        return (
                          <div key={i} style={{
                            padding: '8px 12px', borderBottom: '1px solid var(--border-color)',
                            background: fm.checked ? 'rgba(99,102,241,0.06)' : 'transparent',
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                              onClick={() => {
                                const fms = [...(editingNode.data?.fieldMappings || [])];
                                fms[i] = { ...fms[i], checked: !fms[i].checked };
                                updateNodeData({ fieldMappings: fms });
                              }}>
                              <Checkbox checked={fm.checked} />
                              <FieldTypeIcon typeName={typeName} />
                              <Text style={{ fontSize: 13, flex: 1 }}>{fm.field}</Text>
                            </div>
                            {/* Value input when checked */}
                            {fm.checked && (
                              <div style={{ marginTop: 6, marginLeft: 30 }}>
                                <Input size="small" placeholder={`Giá trị cho ${fm.field} (hoặc {{Field}})`}
                                  value={fm.value}
                                  onChange={e => {
                                    const fms = [...(editingNode.data?.fieldMappings || [])];
                                    fms[i] = { ...fms[i], value: e.target.value };
                                    updateNodeData({ fieldMappings: fms });
                                  }} />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ── DELAY ───────────────────────────────────────────────────────── */}
            {editingNode.data?.nodeType === 'delay' && (
              <InputNumber value={editingNode.data?.delayMinutes || 0}
                onChange={v => updateNodeData({ delayMinutes: v || 0 })}
                min={0} addonAfter="phút" style={{ width: 200 }} />
            )}

            {/* ── NOTIFICATION ─────────────────────────────────────────────────── */}
            {editingNode.data?.nodeType === 'notification' && (
              <>
                <Select value={editingNode.data?.channel || undefined}
                  onChange={v => updateNodeData({ channel: v })} style={{ width: '100%' }}
                  options={CHANNEL_OPTIONS} placeholder="Chọn kênh" />
                <TextArea value={editingNode.data?.template || ''}
                  onChange={e => updateNodeData({ template: e.target.value })}
                  placeholder="Nội dung (dùng {{Field}} để chèn)" autoSize={{ minRows: 2, maxRows: 6 }} />
              </>
            )}

            {/* Description */}
            <Divider style={{ margin: '4px 0' }} />
            <TextArea value={editingNode.data?.description || ''}
              onChange={e => updateNodeData({ description: e.target.value })}
              placeholder="Ghi chú, mô tả thêm..." autoSize={{ minRows: 1, maxRows: 4 }} />
          </div>
        )}
      </Drawer>

      {/* Export Modal */}
      <Modal title="Export Text" open={exportModal} onCancel={() => setExportModal(false)} width={650}
        footer={<Space>
          <Button icon={<CopyOutlined />} onClick={() => { navigator.clipboard.writeText(exportText); message.success('Đã copy!'); }}>Copy</Button>
          <Button onClick={() => setExportModal(false)}>Đóng</Button>
        </Space>}>
        <TextArea value={exportText} readOnly autoSize={{ minRows: 10, maxRows: 30 }}
          style={{ fontFamily: 'monospace', fontSize: 13 }} />
      </Modal>
    </div>
  );
}
