'use client';

import React, { useEffect, useState, useCallback, useMemo, memo } from 'react';
import {
  Card, Tree, Tag, Space, Typography, Input, Button, Modal, Form, Select, Switch, Collapse, Drawer, Timeline,
  Row, Col, Segmented, message, Popconfirm, Empty, Dropdown, Tabs, Tooltip,
} from 'antd';
import type { DataNode } from 'antd/es/tree';
import {
  DatabaseOutlined, SyncOutlined, EyeOutlined, ThunderboltOutlined,
  SettingOutlined, BarChartOutlined, CopyOutlined,
  CloudDownloadOutlined, CloudUploadOutlined, DeleteOutlined,
  SearchOutlined, ExportOutlined, MoreOutlined,
  PlusOutlined, EditOutlined, FileTextOutlined, ClockCircleOutlined, ExclamationCircleOutlined, CheckCircleOutlined, ApartmentOutlined, FileSearchOutlined, HistoryOutlined, SaveOutlined, FolderOutlined,
  QuestionCircleOutlined, CameraOutlined, PieChartOutlined,
} from '@ant-design/icons';
import { api } from '@/lib/api';
import { listBases as listBaBases } from '@/lib/baApi';
import '@xyflow/react/dist/style.css';
import { Position, MarkerType } from '@xyflow/react';
import { toPng } from 'html-to-image';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const { Text } = Typography;
const { Search } = Input;

// ═══ Sortable wrapper ═══

function SortableItem({ id, children }: { id: string; children: (handle: React.ReactNode, style: React.CSSProperties, setRef: (el: HTMLElement | null) => void, listeners: Record<string, unknown>) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative' as const,
  };
  const handle = (
    <span {...attributes} {...listeners} style={{ cursor: 'grab', color: 'var(--text-tertiary)', fontSize: 12, flexShrink: 0, touchAction: 'none' }}>⠿</span>
  );
  return <>{children(handle, style, setNodeRef, listeners as Record<string, unknown>)}</>;
}

// ═══ Relationship Graph — Class Diagram style ═══

const ReactFlowLazy = React.lazy(() => import('@xyflow/react').then(m => ({ default: m.ReactFlow })));

function RelationshipGraph({ bases, activeBaseId, onSelectBase }: { bases: AnalystBase[]; activeBaseId: string; onSelectBase: (id: string) => void }) {
  const [viewAll, setViewAll] = useState(false);
  const [exporting, setExporting] = useState(false);
  const graphRef = React.useRef<HTMLDivElement>(null);
  const activeBase = bases.find(b => b._id === activeBaseId);

  // Include base, base-sync, workflow, automation items
  const GRAPH_TYPES = ['base', 'base-sync', 'workflow', 'workflow-stop', 'automation', 'automation-stop'];
  const items = viewAll
    ? bases.flatMap(b => b.groups.flatMap(g => g.items.filter(it => GRAPH_TYPES.includes(it.type)).map(it => ({ ...it, _baseName: b.name, _baseId: b._id }))))
    : (activeBase ? activeBase.groups.flatMap(g => g.items.filter(it => GRAPH_TYPES.includes(it.type)).map(it => ({ ...it, _baseName: activeBase.name, _baseId: activeBase._id }))) : []);

  // Build nodes
  const BASE_COLORS = ['#6366f1', '#ec4899', '#14b8a6', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#84cc16'];
  const baseNames = [...new Set(items.map(it => (it as { _baseName: string })._baseName))];
  const ftIcons: Record<string, string> = { text: 'T', number: '#', date: 'D', singleSelect: '◉', multiSelect: '≡', lookup: '→', formula: 'fx', user: '👤', link: '⇄', attachment: '📎', checkbox: '☑', autoNumber: '⊕' };

  // Layout config
  const NODE_W = viewAll ? 240 : 300;
  const GAP_X = viewAll ? 100 : 80;
  const GAP_Y = 30;
  const MAX_FIELDS = 999; // show all fields
  const LINE_H = 18;
  const HEADER_H = 55; // title + separator
  const cols = viewAll ? Math.max(baseNames.length, 1) : Math.max(2, Math.ceil(Math.sqrt(items.length)));

  // Pre-calculate node heights
  const getNodeH = (item: BaseItem) => {
    const isWfAuto = item.type.startsWith('workflow') || item.type.startsWith('automation');
    if (isWfAuto) {
      const steps = item.type.startsWith('workflow') ? (item.workflowNodes?.length || 0) : (item.automationSteps?.length || 0);
      return HEADER_H + Math.min(steps, 6) * LINE_H + 12;
    }
    const fc = Math.min(item.fields?.length || 0, MAX_FIELDS);
    const hasMore = (item.fields?.length || 0) > MAX_FIELDS;
    return HEADER_H + fc * LINE_H + (hasMore ? LINE_H : 0) + 12;
  };

  // Track cumulative Y per column
  const colY: number[] = new Array(Math.max(cols, baseNames.length)).fill(0);
  if (viewAll) colY.fill(60); // space for header nodes

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const headerNodes: any[] = [];
  if (viewAll) {
    baseNames.forEach((bn, bi) => {
      const color = BASE_COLORS[bi % BASE_COLORS.length];
      const count = items.filter(it => (it as { _baseName: string })._baseName === bn).length;
      headerNodes.push({
        id: `header::${bn}`,
        position: { x: bi * (NODE_W + GAP_X), y: 0 },
        data: { label: `${bn}\n(${count} tables)` },
        style: {
          width: NODE_W, padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700,
          background: color + '15', border: `2px solid ${color}`, color, textAlign: 'center',
        },
        type: 'default', selectable: false, draggable: false,
      });
    });
  }

  const rfNodesWithLabel = items.map((item) => {
    const baseName = (item as { _baseName: string })._baseName;
    const baseIdx = baseNames.indexOf(baseName);
    const baseColor = BASE_COLORS[baseIdx % BASE_COLORS.length];
    const nodeH = getNodeH(item);

    // Determine column
    let col: number;
    if (viewAll) {
      col = baseIdx;
    } else {
      // Place in column with smallest Y (balanced layout)
      col = colY.slice(0, cols).indexOf(Math.min(...colY.slice(0, cols)));
    }

    const x = col * (NODE_W + GAP_X);
    const y = colY[col];
    colY[col] += nodeH + GAP_Y; // advance Y for next node in this column

    const isWfAuto = item.type.startsWith('workflow') || item.type.startsWith('automation');
    const borderColor = viewAll ? baseColor : (
      item.type === 'base-sync' ? '#fa8c16' :
      item.type.startsWith('workflow') ? '#8b5cf6' :
      item.type.startsWith('automation') ? '#10b981' :
      '#6366f1'
    );

    // Build label
    let label: string;
    if (isWfAuto) {
      const icon = item.type.startsWith('workflow') ? '⚡' : '⚙';
      const steps = item.type.startsWith('workflow')
        ? (item.workflowNodes || []).slice(0, 6).map(n => `  ${n.nodeType === 'trigger' ? '▶' : n.nodeType === 'condition' ? '◆' : '●'} ${n.label || n.nodeType}`).join('\n')
        : (item.automationSteps || []).slice(0, 6).map(s => `  ${s.stepType === 'trigger' ? '▶' : s.stepType === 'condition' ? '◆' : '●'} ${s.label || s.stepType}`).join('\n');
      label = `${icon} ${item.name} [${item.type}]${steps ? '\n' + '─'.repeat(20) + '\n' + steps : ''}`;
    } else {
      const fc = Math.min(item.fields?.length || 0, MAX_FIELDS);
      const fieldsPreview = (item.fields || []).slice(0, MAX_FIELDS).map(f => `${ftIcons[f.fieldType] || '·'} ${f.name}`).join('\n');
      const extra = (item.fields?.length || 0) > MAX_FIELDS ? `\n  +${(item.fields?.length || 0) - MAX_FIELDS} more` : '';
      label = `${item.name} [${item.type}]${fc > 0 ? '\n' + '─'.repeat(20) + '\n' + fieldsPreview + extra : ''}`;
    }

    return {
      id: `${baseName}::${item.name}`,
      position: { x, y },
      data: { label },
      style: {
        width: NODE_W, minHeight: nodeH, padding: '6px 10px', borderRadius: 6,
        fontSize: 11, overflow: 'visible', lineHeight: '1.5',
        background: 'var(--bg-color)', border: `2px solid ${borderColor}`,
        whiteSpace: 'pre-wrap', textAlign: 'left' as const,
      },
      type: 'default',
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    };
  });

  const allNodes = [...headerNodes, ...rfNodesWithLabel];

  // Edges: lookup + sync references
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rfEdges: any[] = [];
  const edgeSet = new Set<string>();
  for (const item of items) {
    const srcBase = (item as { _baseName: string })._baseName;
    const srcId = `${srcBase}::${item.name}`;
    for (const f of (item.fields || [])) {
      if (f.lookupTable) {
        // Find target — same base first, then cross-base
        const target = items.find(it => it.name === f.lookupTable);
        if (target) {
          const tgtBase = (target as { _baseName: string })._baseName;
          const tgtId = `${tgtBase}::${target.name}`;
          const key = `${srcId}-${tgtId}-${f.name}`;
          if (!edgeSet.has(key)) {
            edgeSet.add(key);
            const isCross = srcBase !== tgtBase;
            rfEdges.push({
              id: key, source: srcId, target: tgtId,
              label: viewAll ? '' : f.name, type: 'smoothstep',
              style: { stroke: isCross ? '#ec4899' : '#6366f1', strokeWidth: isCross ? 2 : 1.5 },
              markerEnd: { type: MarkerType.ArrowClosed, color: isCross ? '#ec4899' : '#6366f1' },
            });
          }
        }
      }
    }
    // Sync source
    if (item.type === 'base-sync' && item.syncSource) {
      const target = items.find(it => item.syncSource?.includes(it.name));
      if (target) {
        const tgtBase = (target as { _baseName: string })._baseName;
        const tgtId = `${tgtBase}::${target.name}`;
        const key = `sync-${srcId}-${tgtId}`;
        if (!edgeSet.has(key)) {
          edgeSet.add(key);
          rfEdges.push({
            id: key, source: tgtId, target: srcId,
            label: viewAll ? '' : 'sync', type: 'smoothstep', animated: true,
            style: { stroke: '#fa8c16', strokeWidth: 2 },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#fa8c16' },
          });
        }
      }
    }

    // Workflow → table links (via triggerField, conditionField referencing table names)
    if (item.type.startsWith('workflow') && item.workflowNodes) {
      for (const node of item.workflowNodes) {
        const refs = [node.triggerField, node.conditionField, node.actionConfig].filter(Boolean);
        for (const ref of refs) {
          const target = items.find(it => (it.type === 'base' || it.type === 'base-sync') && ref.includes(it.name));
          if (target) {
            const tgtBase = (target as { _baseName: string })._baseName;
            const tgtId = `${tgtBase}::${target.name}`;
            const key = `wf-${srcId}-${tgtId}`;
            if (!edgeSet.has(key)) {
              edgeSet.add(key);
              rfEdges.push({
                id: key, source: srcId, target: tgtId,
                label: viewAll ? '' : node.label || 'workflow', type: 'smoothstep',
                style: { stroke: '#8b5cf6', strokeWidth: 1.5, strokeDasharray: '6 3' },
                markerEnd: { type: MarkerType.ArrowClosed, color: '#8b5cf6' },
              });
            }
          }
        }
      }
      // Also link workflow to any table whose name appears in the workflow item name/note
      const baseItems = items.filter(it => it.type === 'base' || it.type === 'base-sync');
      for (const tbl of baseItems) {
        if (item.name.includes(tbl.name) || (item.note && item.note.includes(tbl.name))) {
          const tgtBase = (tbl as { _baseName: string })._baseName;
          const tgtId = `${tgtBase}::${tbl.name}`;
          const key = `wf-name-${srcId}-${tgtId}`;
          if (!edgeSet.has(key)) {
            edgeSet.add(key);
            rfEdges.push({
              id: key, source: srcId, target: tgtId,
              label: '', type: 'smoothstep',
              style: { stroke: '#8b5cf6', strokeWidth: 1.5, strokeDasharray: '6 3' },
              markerEnd: { type: MarkerType.ArrowClosed, color: '#8b5cf6' },
            });
          }
        }
      }
    }

    // Automation → table links
    if (item.type.startsWith('automation') && item.automationSteps) {
      for (const step of item.automationSteps) {
        const refs = [step.triggerField, step.conditionField, step.actionConfig].filter(Boolean);
        for (const ref of refs) {
          const target = items.find(it => (it.type === 'base' || it.type === 'base-sync') && ref.includes(it.name));
          if (target) {
            const tgtBase = (target as { _baseName: string })._baseName;
            const tgtId = `${tgtBase}::${target.name}`;
            const key = `auto-${srcId}-${tgtId}`;
            if (!edgeSet.has(key)) {
              edgeSet.add(key);
              rfEdges.push({
                id: key, source: srcId, target: tgtId,
                label: viewAll ? '' : step.label || 'auto', type: 'smoothstep',
                style: { stroke: '#10b981', strokeWidth: 1.5, strokeDasharray: '4 4' },
                markerEnd: { type: MarkerType.ArrowClosed, color: '#10b981' },
              });
            }
          }
        }
      }
      // Also link automation to any table whose name appears in the item name/note
      const baseItems = items.filter(it => it.type === 'base' || it.type === 'base-sync');
      for (const tbl of baseItems) {
        if (item.name.includes(tbl.name) || (item.note && item.note.includes(tbl.name))) {
          const tgtBase = (tbl as { _baseName: string })._baseName;
          const tgtId = `${tgtBase}::${tbl.name}`;
          const key = `auto-name-${srcId}-${tgtId}`;
          if (!edgeSet.has(key)) {
            edgeSet.add(key);
            rfEdges.push({
              id: key, source: srcId, target: tgtId,
              label: '', type: 'smoothstep',
              style: { stroke: '#10b981', strokeWidth: 1.5, strokeDasharray: '4 4' },
              markerEnd: { type: MarkerType.ArrowClosed, color: '#10b981' },
            });
          }
        }
      }
    }
  }

  const handleExportImage = async () => {
    const el = graphRef.current?.querySelector('.react-flow') as HTMLElement;
    if (!el) { message.warning('Không tìm thấy biểu đồ'); return; }
    setExporting(true);
    try {
      const dataUrl = await toPng(el, {
        backgroundColor: '#ffffff',
        pixelRatio: 3,
        filter: (node) => {
          // Hide controls/minimap from export
          if (node?.classList?.contains('react-flow__controls') || node?.classList?.contains('react-flow__minimap')) return false;
          return true;
        },
      });
      const link = document.createElement('a');
      link.download = `analyst-diagram-${activeBase?.name || 'all'}-${new Date().toISOString().slice(0, 10)}.png`;
      link.href = dataUrl;
      link.click();
      message.success('Đã export hình ảnh');
    } catch (err) {
      message.error('Export thất bại: ' + (err instanceof Error ? err.message : 'lỗi'));
    }
    setExporting(false);
  };

  if (items.length === 0) return <Empty description="Chọn base có tables để xem diagram" />;

  return (
    <div ref={graphRef} style={{ height: 'calc(100vh - 160px)', border: '1px solid var(--border-color)', borderRadius: 8, overflow: 'hidden', position: 'relative' }}>
      <React.Suspense fallback={<Card loading style={{ height: 'calc(100vh - 160px)' }} />}>
        <ReactFlowLazy
          nodes={allNodes}
          edges={rfEdges}
          fitView
          fitViewOptions={{ padding: 0.15, maxZoom: 1.5 }}
          minZoom={0.05}
          maxZoom={3}
          nodesDraggable={false}
          panOnDrag
          panOnScroll
          zoomOnScroll
          selectionOnDrag={false}
          style={{ background: 'var(--bg-secondary)', fontFamily: 'monospace', whiteSpace: 'pre-wrap', width: '100%', height: '100%' } as React.CSSProperties}
        />
      </React.Suspense>
      <div style={{ position: 'absolute', top: 8, left: 8, display: 'flex', gap: 4, flexWrap: 'wrap', maxWidth: '70%' }}>
        <Button size="small" type={viewAll ? 'primary' : 'default'}
          onClick={() => setViewAll(true)} style={{ fontSize: 11, fontWeight: viewAll ? 700 : 400 }}>
          Tất cả
        </Button>
        {bases.map(b => (
          <Button key={b._id} size="small" type={!viewAll && b._id === activeBaseId ? 'primary' : 'default'}
            onClick={() => { setViewAll(false); onSelectBase(b._id); }} style={{ fontSize: 11 }}>
            {b.name.length > 12 ? b.name.slice(0, 12) + '…' : b.name}
          </Button>
        ))}
      </div>
      <div style={{ position: 'absolute', top: 8, right: 8 }}>
        <Button size="small" icon={<CameraOutlined />} loading={exporting}
          onClick={handleExportImage} style={{ fontSize: 11 }}>
          Export ảnh
        </Button>
      </div>
      <div style={{ position: 'absolute', bottom: 8, left: 8, display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-tertiary)', background: 'rgba(0,0,0,0.03)', padding: '2px 8px', borderRadius: 4 }}>
        <span style={{ color: '#6366f1' }}>■ base</span>
        <span style={{ color: '#fa8c16' }}>■ sync</span>
        <span style={{ color: '#8b5cf6' }}>■ workflow</span>
        <span style={{ color: '#10b981' }}>■ automation</span>
        <span style={{ color: '#6366f1' }}>→ lookup</span>
        <span style={{ color: '#8b5cf6' }}>⇢ workflow</span>
        <span style={{ color: '#10b981' }}>⇢ automation</span>
        {viewAll && <span style={{ color: '#ec4899' }}>→ cross-base</span>}
        <span>{items.length} items · {rfEdges.length} links</span>
      </div>
    </div>
  );
}

// ═══ Bulk Paste Input ═══

function BulkPasteInput({ onValues }: { onValues: (vals: string[]) => void }) {
  const [show, setShow] = useState(false);
  const [parsed, setParsed] = useState<string[]>([]);
  const ref = React.useRef<HTMLTextAreaElement>(null);

  const parseText = () => {
    const text = ref.current?.value || '';
    if (!text) { setParsed([]); return; }
    setParsed([...new Set(text.split(/[\r\n\t,;、]+/).map(s => s.trim()).filter(Boolean))]);
  };

  const handleConfirm = () => {
    if (parsed.length > 0) onValues(parsed);
    if (ref.current) ref.current.value = '';
    setParsed([]);
    setShow(false);
  };

  if (!show) {
    return (
      <Button size="small" type="link" style={{ fontSize: 11, padding: 0, marginTop: 2 }}
        onClick={() => { setShow(true); setParsed([]); }}>
        Dán nhanh nhiều giá trị
      </Button>
    );
  }

  return (
    <div style={{ marginTop: 4, border: '1px solid var(--border-color)', borderRadius: 6, padding: 8, background: 'var(--bg-secondary)' }}>
      <textarea
        ref={ref}
        autoFocus
        rows={3}
        placeholder={'Paste hoặc gõ giá trị vào đây\nMỗi dòng 1 giá trị, hoặc phân cách bằng dấu phẩy'}
        style={{
          fontSize: 12, width: '100%', padding: '6px 8px', fontFamily: 'inherit',
          border: '1px solid var(--border-color)', borderRadius: 4,
          background: 'var(--bg-color)', color: 'var(--text-color)', resize: 'vertical',
        }}
        onInput={parseText}
        onPaste={() => setTimeout(parseText, 0)}
      />
      {parsed.length > 0 && (
        <div style={{ marginTop: 6 }}>
          <Text type="secondary" style={{ fontSize: 11 }}>Xem trước ({parsed.length} giá trị):</Text>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
            {parsed.map((v, i) => <Tag key={i} style={{ fontSize: 11, margin: 0 }}>{v}</Tag>)}
          </div>
        </div>
      )}
      <Space size={8} style={{ marginTop: 8 }}>
        <Button size="small" type="primary" disabled={parsed.length === 0} onClick={handleConfirm}>
          Thêm {parsed.length} giá trị
        </Button>
        <Button size="small" onClick={() => { if (ref.current) ref.current.value = ''; setParsed([]); setShow(false); }}>Huỷ</Button>
      </Space>
    </div>
  );
}

// ═══ Item Edit Modal (isolated to prevent parent re-renders) ═══

function ItemEditModal({
  open, editingItem, allFieldTypes: parentFieldTypes, siblingItems, onSave, onCancel,
}: {
  open: boolean;
  editingItem: { groupIdx: number; itemIdx: number; item: BaseItem } | null;
  allFieldTypes: string[];
  siblingItems: { name: string; fields: string[]; fullFields: Field[] }[];
  onSave: (item: Partial<BaseItem>) => Promise<void>;
  onCancel: () => void;
}) {
  const [form] = Form.useForm();
  const [fields, setFields] = useState<Field[]>([]);
  const [views, setViews] = useState<View[]>([]);
  const [wfNodes, setWfNodes] = useState<WorkflowNode[]>([]);
  const [autoSteps, setAutoSteps] = useState<AutomationStep[]>([]);
  const [dashWidgets, setDashWidgets] = useState<DashboardWidget[]>([]);
  const [saving, setSaving] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');
  const [customTypes, setCustomTypes] = useState<string[]>([]);

  const watchedType = Form.useWatch('type', form);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor));

  // Sync form when editingItem changes
  useEffect(() => {
    if (open) {
      if (editingItem) {
        const it = editingItem.item;
        form.setFieldsValue({
          name: it.name, type: it.type, note: it.note || '', description: it.description || '',
          syncSource: it.syncSource || '', syncMode: it.syncMode || 'readonly',
          syncType: it.syncType || 'lark', syncInterval: it.syncInterval || '',
        });
        setFields(it.fields?.map(f => ({ ...f })) || []);
        setViews(it.views?.map(v => ({ ...v })) || []);
        setWfNodes(it.workflowNodes?.map(n => ({ ...n })) || []);
        setAutoSteps(it.automationSteps?.map(s => ({ ...s })) || []);
        setDashWidgets(it.dashboardWidgets?.map(w => ({ ...w })) || []);
      } else {
        form.setFieldsValue({ name: '', type: 'base', note: '', description: '', syncSource: '', syncMode: 'readonly', syncType: 'lark', syncInterval: '' });
        setFields([]); setViews([]); setWfNodes([]); setAutoSteps([]); setDashWidgets([]);
      }
      setNewTypeName('');
    }
  }, [open, editingItem, form]);

  const allTypes = useMemo(() => {
    const set = new Set([...parentFieldTypes, ...customTypes]);
    fields.forEach(f => { if (f.fieldType) set.add(f.fieldType); });
    return [...set].sort();
  }, [parentFieldTypes, customTypes, fields]);

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      const isBase = values.type === 'base' || values.type === 'base-sync';
      const isWf = values.type === 'workflow' || values.type === 'workflow-stop';
      const isAuto = values.type === 'automation' || values.type === 'automation-stop';
      const isDash = values.type === 'dashboard' || values.type === 'form-analytics';
      await onSave({
        name: values.name, type: values.type, note: values.note || '', description: values.description || '',
        status: editingItem?.item.status || 'none',
        fields: isBase ? fields : [], views: isBase ? views : [],
        syncSource: values.type === 'base-sync' ? (values.syncSource || '') : '',
        syncMode: values.type === 'base-sync' ? (values.syncMode || 'readonly') : 'readonly',
        syncType: values.type === 'base-sync' ? (values.syncType || 'lark') : 'lark',
        syncInterval: values.type === 'base-sync' ? (values.syncInterval || '') : '',
        workflowNodes: isWf ? wfNodes : [],
        automationSteps: isAuto ? autoSteps : [],
        dashboardWidgets: isDash ? dashWidgets : [],
      });
    } catch (e: unknown) {
      if (e instanceof Error) message.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const addCustomType = () => {
    const val = newTypeName.trim();
    if (!val) return;
    if (!allTypes.includes(val)) {
      setCustomTypes(prev => [...prev, val]);
      message.success(`Đã thêm loại "${val}"`);
    } else {
      message.info(`Loại "${val}" đã tồn tại`);
    }
    setNewTypeName('');
  };

  return (
    <Modal
      open={open}
      title={editingItem ? 'Sửa Item' : 'Thêm Item mới'}
      onCancel={onCancel}
      onOk={handleOk}
      okText={editingItem ? 'Cập nhật' : 'Thêm'}
      confirmLoading={saving}
      width={680}
      destroyOnClose
    >
      <Form form={form} layout="vertical" style={{ marginBottom: 0 }}>
        <Row gutter={12}>
          <Col span={14}>
            <Form.Item name="name" label="Tên" rules={[{ required: true, message: 'Nhập tên' }]} style={{ marginBottom: 12 }}>
              <Input placeholder="VD: 3.1 Phân Hồ Sơ" />
            </Form.Item>
          </Col>
          <Col span={10}>
            <Form.Item name="type" label="Loại" rules={[{ required: true }]} style={{ marginBottom: 12 }}>
              <Select>
                {ITEM_TYPES.map(t => (
                  <Select.Option key={t} value={t}>
                    <Space size={4}>{TYPE_ICONS[t]} <Tag color={TYPE_COLORS[t] || 'default'} style={{ fontSize: 10 }}>{t}</Tag></Space>
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="note" label="Ghi chú ngắn" style={{ marginBottom: 8 }}>
          <Input placeholder="Mô tả ngắn 1 dòng..." />
        </Form.Item>
        <Form.Item name="description" label="Mô tả chi tiết" style={{ marginBottom: 8 }}>
          <Input.TextArea placeholder="Mô tả chi tiết về mục đích, cách sử dụng, lưu ý..." autoSize={{ minRows: 2, maxRows: 6 }} />
        </Form.Item>
        {/* Sync config for base-sync */}
        {watchedType === 'base-sync' && (
          <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 8, marginTop: 4, marginBottom: 4 }}>
            <Form.Item name="syncSource" label="Nguồn sync (1 chiều)" style={{ marginBottom: 8 }}>
              <Input size="small" placeholder="VD: HOA NAM Ver 1.1 > 4.1 DSKH và Công nợ" />
            </Form.Item>
            <Row gutter={12}>
              <Col span={8}>
                <Form.Item name="syncMode" label="Chế độ" style={{ marginBottom: 8 }}>
                  <Segmented size="small" block options={[
                    { label: 'Chỉ đọc', value: 'readonly' },
                    { label: 'Đọc + Ghi', value: 'readwrite' },
                  ]} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="syncType" label="Loại sync" style={{ marginBottom: 8 }}>
                  <Select size="small">
                    <Select.Option value="lark">Lark (tự động 1h)</Select.Option>
                    <Select.Option value="api">API (tự động)</Select.Option>
                    <Select.Option value="manual">Thủ công</Select.Option>
                  </Select>
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item noStyle shouldUpdate={(prev, cur) => prev.syncType !== cur.syncType}>
                  {({ getFieldValue }) => {
                    const st = getFieldValue('syncType');
                    if (st === 'api') return (
                      <Form.Item name="syncInterval" label="Chu kỳ" style={{ marginBottom: 8 }}>
                        <Input size="small" placeholder="VD: 5m, 30m, 2h, realtime" />
                      </Form.Item>
                    );
                    if (st === 'manual') return (
                      <Form.Item label="Chu kỳ" style={{ marginBottom: 8 }}>
                        <Text type="secondary" style={{ fontSize: 12 }}>Khi người dùng bấm sync</Text>
                      </Form.Item>
                    );
                    return (
                      <Form.Item label="Chu kỳ" style={{ marginBottom: 8 }}>
                        <Text type="secondary" style={{ fontSize: 12 }}>Tự động mỗi 1 giờ</Text>
                      </Form.Item>
                    );
                  }}
                </Form.Item>
              </Col>
            </Row>
            <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: -4, marginBottom: 4 }}>
              Sync 1 chiều — dữ liệu từ nguồn, không ảnh hưởng base gốc.
              {form.getFieldValue('syncMode') === 'readwrite' && ' Chế độ Đọc+Ghi: có thể thêm cột riêng, chỉ hiện tại base-sync này.'}
            </Text>
          </div>
        )}
      </Form>

      {(watchedType === 'base' || watchedType === 'base-sync') && (
        <Collapse
          size="small"
          style={{ marginTop: 8, border: 'none', background: 'transparent' }}
          items={[
            {
              key: 'fields',
              label: <Space><FileTextOutlined /><Text strong style={{ fontSize: 13 }}>Cấu trúc trường</Text><Tag style={{ fontSize: 10 }}>{fields.length}</Tag></Space>,
              children: (<div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 10 }}>
            <Input size="small" placeholder="Nhập loại trường mới (VD: richText, createdBy...)"
              value={newTypeName} onChange={e => setNewTypeName(e.target.value)} onPressEnter={addCustomType} style={{ flex: 1 }} />
            <Button size="small" type="primary" icon={<PlusOutlined />} onClick={addCustomType}
              disabled={!newTypeName.trim()}>Thêm loại</Button>
          </div>
          {fields.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--text-tertiary)', fontSize: 13 }}>
              Chưa có trường nào — bấm "Thêm trường" để bắt đầu
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter}
              onDragEnd={(e: DragEndEvent) => {
                const { active, over } = e;
                if (over && active.id !== over.id) {
                  const oldIdx = fields.findIndex((_, i) => `field-${i}` === active.id);
                  const newIdx = fields.findIndex((_, i) => `field-${i}` === over.id);
                  if (oldIdx !== -1 && newIdx !== -1) setFields(prev => arrayMove(prev, oldIdx, newIdx));
                }
              }}>
            <SortableContext items={fields.map((_, i) => `field-${i}`)} strategy={verticalListSortingStrategy}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', gap: 8, padding: '0 4px' }}>
                <div style={{ width: 16 }} />
                <Text type="secondary" style={{ fontSize: 11, width: '33%' }}>Tên trường</Text>
                <Text type="secondary" style={{ fontSize: 11, width: '24%' }}>Loại</Text>
                <Text type="secondary" style={{ fontSize: 11, flex: 1 }}>Ghi chú</Text>
                <div style={{ width: 24 }} />
              </div>
              {fields.map((f, idx) => {
                const updF = (patch: Partial<Field>) => setFields(prev => prev.map((ff, i) => i === idx ? { ...ff, ...patch } : ff));
                const alwaysOptions = f.fieldType === 'singleSelect' || f.fieldType === 'multiSelect' || f.fieldType === 'user';
                const hasOptions = alwaysOptions || (f.options && f.options.length > 0);
                return (
                  <SortableItem key={`field-${idx}`} id={`field-${idx}`}>
                    {(handle, style, setRef) => (
                      <div ref={setRef} style={{ ...style, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          {handle}
                          {watchedType === 'base-sync' && (
                              <Tag color={f.isSynced ? 'blue' : 'orange'} style={{ cursor: 'pointer', fontSize: 9, margin: 0 }}
                                onClick={() => updF({ isSynced: !f.isSynced })}>
                                {f.isSynced ? 'Sync' : 'Riêng'}
                              </Tag>
                          )}
                          <Input size="small" value={f.name} placeholder="Tên" style={{ width: watchedType === 'base-sync' ? '28%' : '33%' }}
                            onChange={e => updF({ name: e.target.value })} />
                          <Select size="small" value={f.fieldType} style={{ width: '24%' }} showSearch
                            onChange={v => updF({ fieldType: v })}
                            filterOption={(input, option) => String(option?.value ?? '').toLowerCase().includes(input.toLowerCase())}
                            placeholder="Chọn loại">
                            {allTypes.map(ft => <Select.Option key={ft} value={ft}>{ft}</Select.Option>)}
                          </Select>
                          <Input size="small" value={f.note} placeholder="Ghi chú" style={{ flex: 1 }}
                            onChange={e => updF({ note: e.target.value })} />
                          <Button type="text" size="small" danger icon={<DeleteOutlined style={{ fontSize: 12 }} />}
                            onClick={() => setFields(prev => prev.filter((_, i) => i !== idx))} style={{ width: 24, padding: 0 }} />
                        </div>
                        {!alwaysOptions && !hasOptions && (
                          <div style={{ marginLeft: 24, paddingLeft: 8, marginTop: 2 }}>
                            <Button type="link" size="small" style={{ fontSize: 11, padding: 0, color: 'var(--text-tertiary)' }}
                              onClick={() => updF({ options: [''] })}>
                              + Giới hạn giá trị
                            </Button>
                          </div>
                        )}
                    {hasOptions && (
                          <div style={{ marginLeft: 24, paddingLeft: 8 }}>
                            {!alwaysOptions && (
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                <Text type="secondary" style={{ fontSize: 11 }}>Giá trị cho phép</Text>
                                <Button type="link" size="small" danger style={{ fontSize: 11, padding: 0 }}
                                  onClick={() => updF({ options: [], defaultValue: '' })}>Bỏ giới hạn</Button>
                              </div>
                            )}
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: (f.options?.length || 0) > 0 ? 4 : 0 }}>
                              {(f.options || []).map((opt, oi) => (
                                <Tag key={oi} closable onClose={() => updF({ options: f.options.filter((_, i) => i !== oi) })}
                                  style={{ fontSize: 11, margin: 0 }}>{opt}</Tag>
                              ))}
                            </div>
                            <Space.Compact size="small" style={{ width: '100%' }}>
                              <Input
                                size="small"
                                placeholder="Nhập giá trị..."
                                onPressEnter={e => {
                                  const val = (e.target as HTMLInputElement).value.trim();
                                  if (val) { updF({ options: [...(f.options || []), val] }); (e.target as HTMLInputElement).value = ''; }
                                }}
                              />
                              <Button size="small" icon={<PlusOutlined />}
                                onClick={e => {
                                  const input = (e.currentTarget as HTMLElement).parentElement?.querySelector('input');
                                  const val = input?.value?.trim();
                                  if (val && input) { updF({ options: [...(f.options || []), val] }); input.value = ''; }
                                }}>Thêm</Button>
                            </Space.Compact>
                            <BulkPasteInput onValues={vals => {
                              setFields(prev => {
                                const cur = prev[idx];
                                const existing = cur.options || [];
                                const unique = [...new Set(vals)].filter(v => !existing.includes(v));
                                if (unique.length > 0) {
                                  message.success(`Đã thêm ${unique.length} giá trị${vals.length > unique.length ? ` (bỏ ${vals.length - unique.length} trùng)` : ''}`);
                                  return prev.map((ff, i) => i === idx ? { ...ff, options: [...existing, ...unique] } : ff);
                                }
                                message.info('Tất cả giá trị đã tồn tại');
                                return prev;
                              });
                            }} />
                            {(f.options?.length || 0) > 0 && (
                              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
                                <Text type="secondary" style={{ fontSize: 11, flexShrink: 0 }}>Mặc định</Text>
                                <Select size="small" value={f.defaultValue || undefined}
                                  placeholder="Chọn giá trị mặc định"
                                  style={{ flex: 1 }}
                                  allowClear
                                  onChange={val => updF({ defaultValue: val || '' })}
                                  mode={f.fieldType === 'multiSelect' ? 'multiple' : undefined}
                                >
                                  {(f.options || []).map(opt => <Select.Option key={opt} value={opt}>{opt}</Select.Option>)}
                                </Select>
                              </div>
                            )}
                          </div>
                        )}
                        {/* Lookup / Reference */}
                        {(f.lookupTable || f.lookupField || f.fieldType === 'lookup' || f.fieldType === 'formula') ? (() => {
                          const tbl = siblingItems.find(s => s.name === f.lookupTable);
                          const tblFields = tbl?.fields || [];
                          const srcField = tbl?.fullFields.find(ff => ff.name === f.lookupField);
                          const fselLookup = (value: string | undefined, placeholder: string, opts: string[], onChange: (v: string) => void) =>
                            opts.length > 0 ? (
                              <Select size="small" value={value || undefined} placeholder={placeholder} style={{ flex: 1 }}
                                allowClear showSearch onChange={v => onChange(v || '')}
                                filterOption={(input, opt) => String(opt?.value ?? '').toLowerCase().includes(input.toLowerCase())}>
                                {opts.map(o => <Select.Option key={o} value={o}>{o}</Select.Option>)}
                              </Select>
                            ) : (
                              <Input size="small" value={value} placeholder={placeholder} style={{ flex: 1 }}
                                onChange={e => onChange(e.target.value)} />
                            );
                          const conds = f.lookupConditions || [];
                          const currentFieldNames = fields.filter(ff => ff.name && ff.name !== f.name).map(ff => ff.name);
                          return (
                          <div style={{ marginLeft: 24, paddingLeft: 8, marginTop: 4 }}>
                            {/* Tra cứu dữ liệu trong trường này */}
                            <Text type="secondary" style={{ fontSize: 11 }}>Tra cứu dữ liệu trong trường này</Text>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
                              {fselLookup(f.lookupTable, 'Chọn bảng', siblingItems.map(s => s.name), val => updF({ lookupTable: val, lookupField: '' }))}
                              {fselLookup(f.lookupField, 'Chọn trường', tblFields, val => updF({ lookupField: val }))}
                              {f.fieldType !== 'lookup' && f.fieldType !== 'formula' && (
                                <Button type="text" size="small" danger icon={<DeleteOutlined style={{ fontSize: 11 }} />}
                                  onClick={() => updF({ lookupTable: '', lookupField: '', lookupConditions: [], lookupDisplay: '' })} />
                              )}
                            </div>
                            {/* Preview trường nguồn */}
                            {srcField && (() => {
                              const effectiveType = f.lookupFormat || srcField.fieldType;
                              const isConverted = f.lookupFormat && f.lookupFormat !== srcField.fieldType;
                              return (
                              <div style={{ marginTop: 4, padding: '4px 8px', background: 'var(--bg-color)', borderRadius: 4, border: '1px dashed var(--border-color)' }}>
                                <Text type="secondary" style={{ fontSize: 11 }}>
                                  → <Text strong style={{ fontSize: 11 }}>{f.lookupField}</Text>
                                  <Tag color={isConverted ? 'warning' : 'default'} style={{ fontSize: 9, marginLeft: 4 }}>
                                    {isConverted ? `${srcField.fieldType} → ${effectiveType}` : effectiveType}
                                  </Tag>
                                  {f.lookupDisplay && f.lookupDisplay !== 'value' && (
                                    <Tag color="blue" style={{ fontSize: 9, marginLeft: 2 }}>{f.lookupDisplay}</Tag>
                                  )}
                                </Text>
                                {srcField.options && srcField.options.length > 0 && (
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 4 }}>
                                    {srcField.options.map((opt, oi) => (
                                      <Tag key={oi} color={srcField.defaultValue === opt ? 'blue' : 'default'}
                                        style={{ fontSize: 10, margin: 0 }}>{opt}</Tag>
                                    ))}
                                  </div>
                                )}
                              </div>
                              );
                            })()}
                            {/* Tham chiếu dữ liệu nếu */}
                            {f.lookupTable && (
                              <div style={{ marginTop: 8 }}>
                                <Text type="secondary" style={{ fontSize: 11 }}>Tham chiếu dữ liệu nếu</Text>
                                {conds.map((cond, ci) => (
                                  <div key={ci} style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 4 }}>
                                    {fselLookup(cond.sourceField, 'Trường bảng nguồn', tblFields, val => {
                                      const nc = [...conds]; nc[ci] = { ...nc[ci], sourceField: val }; updF({ lookupConditions: nc });
                                    })}
                                    <Select size="small" value={cond.operator} style={{ width: 90 }}
                                      onChange={val => { const nc = [...conds]; nc[ci] = { ...nc[ci], operator: val }; updF({ lookupConditions: nc }); }}>
                                      <Select.Option value="contains">chứa</Select.Option>
                                      <Select.Option value="is">là</Select.Option>
                                      <Select.Option value="isNot">không là</Select.Option>
                                      <Select.Option value="isEmpty">trống</Select.Option>
                                      <Select.Option value="isNotEmpty">có dữ liệu</Select.Option>
                                    </Select>
                                    {cond.operator !== 'isEmpty' && cond.operator !== 'isNotEmpty' && (
                                      fselLookup(cond.targetField, 'Trường hiện tại', currentFieldNames, val => {
                                        const nc = [...conds]; nc[ci] = { ...nc[ci], targetField: val }; updF({ lookupConditions: nc });
                                      })
                                    )}
                                    <Button type="text" size="small" danger icon={<DeleteOutlined style={{ fontSize: 11 }} />}
                                      onClick={() => updF({ lookupConditions: conds.filter((_, i) => i !== ci) })} />
                                  </div>
                                ))}
                                <Button type="link" size="small" icon={<PlusOutlined />} style={{ fontSize: 11, padding: 0, marginTop: 4 }}
                                  onClick={() => updF({ lookupConditions: [...conds, { sourceField: '', operator: 'contains', targetField: '' }] })}>
                                  Thêm điều kiện
                                </Button>
                              </div>
                            )}
                            {/* Hiển thị dưới dạng */}
                            {f.lookupTable && (
                              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 8 }}>
                                <div style={{ flex: 1 }}>
                                  <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>Hiển thị dữ liệu dưới dạng</Text>
                                  <Select size="small" value={f.lookupDisplay || 'value'} style={{ width: '100%' }}
                                    onChange={val => updF({ lookupDisplay: val })}>
                                    <Select.Option value="value">Giá trị</Select.Option>
                                    <Select.Option value="sum">Tổng</Select.Option>
                                    <Select.Option value="count">Số lượng</Select.Option>
                                    <Select.Option value="unique">Các giá trị duy nhất</Select.Option>
                                    <Select.Option value="countUnique">Đếm các giá trị duy nhất</Select.Option>
                                    <Select.Option value="avg">Trung bình</Select.Option>
                                    <Select.Option value="max">Tối đa</Select.Option>
                                    <Select.Option value="min">Tối thiểu</Select.Option>
                                  </Select>
                                </div>
                                <div style={{ flex: 1 }}>
                                  <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>
                                    Định dạng trường
                                    {srcField && !f.lookupFormat && <Tag style={{ fontSize: 9, marginLeft: 4 }}>{srcField.fieldType}</Tag>}
                                    {f.lookupFormat && f.lookupFormat !== (srcField?.fieldType || '') && (
                                      <span style={{ fontSize: 10, color: '#faad14', marginLeft: 4 }}>
                                        ({srcField?.fieldType} → {f.lookupFormat})
                                      </span>
                                    )}
                                  </Text>
                                  <Select size="small" value={f.lookupFormat || (srcField?.fieldType || '')} style={{ width: '100%' }}
                                    onChange={val => updF({ lookupFormat: val })}>
                                    <Select.Option value="text">Văn bản</Select.Option>
                                    <Select.Option value="number">Số</Select.Option>
                                    <Select.Option value="singleSelect">Một lựa chọn</Select.Option>
                                    <Select.Option value="multiSelect">Nhiều lựa chọn</Select.Option>
                                    <Select.Option value="date">Ngày</Select.Option>
                                    <Select.Option value="dateTime">Ngày giờ</Select.Option>
                                    <Select.Option value="checkbox">Checkbox</Select.Option>
                                    <Select.Option value="url">URL</Select.Option>
                                    <Select.Option value="user">Người</Select.Option>
                                  </Select>
                                </div>
                              </div>
                            )}
                          </div>
                          );
                        })() : (
                          <div style={{ marginLeft: 24, paddingLeft: 8, marginTop: 2 }}>
                            <Button type="link" size="small" style={{ fontSize: 11, padding: 0, color: 'var(--text-tertiary)' }}
                              onClick={() => updF({ lookupTable: ' ' })}>
                              + Tra cứu từ bảng khác
                            </Button>
                          </div>
                        )}
                        {/* Formula editor */}
                        {f.fieldType === 'formula' && (
                          <div style={{ marginLeft: 24, paddingLeft: 8, marginTop: 4 }}>
                            <Text type="secondary" style={{ fontSize: 11 }}>Công thức</Text>
                            <div style={{ marginTop: 4, border: '1px solid var(--border-color)', borderRadius: 6, overflow: 'hidden' }}>
                              {/* Function buttons */}
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, padding: '4px 6px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
                                {[
                                  { fn: 'IF(', tip: 'IF(điều_kiện, giá_trị_đúng, giá_trị_sai)' },
                                  { fn: 'SUM(', tip: 'SUM(trường)' },
                                  { fn: 'MAX(', tip: 'MAX(a, b)' },
                                  { fn: 'MIN(', tip: 'MIN(a, b)' },
                                  { fn: 'CONCAT(', tip: 'CONCAT(a, b) hoặc a & b' },
                                  { fn: 'LOOKUP(', tip: 'LOOKUP(trường_liên_kết)' },
                                  { fn: 'COUNTIF(', tip: 'COUNTIF(điều_kiện)' },
                                  { fn: 'ROUND(', tip: 'ROUND(số, chữ_số)' },
                                  { fn: 'ABS(', tip: 'ABS(số)' },
                                  { fn: 'NOW()', tip: 'Thời gian hiện tại' },
                                  { fn: 'TODAY()', tip: 'Ngày hiện tại' },
                                  { fn: 'YEAR(', tip: 'YEAR(ngày)' },
                                  { fn: 'MONTH(', tip: 'MONTH(ngày)' },
                                  { fn: 'DATEDIF(', tip: 'DATEDIF(bắt_đầu, kết_thúc, đơn_vị)' },
                                  { fn: 'DATEADD(', tip: 'DATEADD(ngày, số, đơn_vị)' },
                                  { fn: 'LEN(', tip: 'LEN(text)' },
                                  { fn: 'LEFT(', tip: 'LEFT(text, n)' },
                                  { fn: 'RIGHT(', tip: 'RIGHT(text, n)' },
                                ].map(b => (
                                    <Button key={b.fn} size="small" type="text" title={b.tip}
                                      style={{ fontSize: 10, padding: '0 4px', height: 20, fontFamily: 'monospace', color: '#6366f1' }}
                                      onClick={() => updF({ formula: (f.formula || '') + b.fn })}>
                                      {b.fn.replace('(', '')}
                                    </Button>
                                ))}
                              </div>
                              {/* Field reference buttons */}
                              {fields.some(ff => ff.name) && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, padding: '4px 6px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-color)' }}>
                                  <Text type="secondary" style={{ fontSize: 10, marginRight: 4 }}>Fields:</Text>
                                  {fields.filter(ff => ff.name && ff.name !== f.name).map(ff => ff.name).map((fn: string) => (
                                    <Button key={fn} size="small" type="text"
                                      style={{ fontSize: 10, padding: '0 4px', height: 20 }}
                                      onClick={() => updF({ formula: (f.formula || '') + `[${fn}]` })}>
                                      {fn}
                                    </Button>
                                  ))}
                                </div>
                              )}
                              {/* Formula input */}
                              <Input.TextArea
                                value={f.formula}
                                onChange={e => updF({ formula: e.target.value })}
                                placeholder="VD: IF([Giờ làm] >= 8, 1, [Giờ làm] / 8)"
                                autoSize={{ minRows: 2, maxRows: 6 }}
                                style={{ border: 'none', borderRadius: 0, fontFamily: 'monospace', fontSize: 12 }}
                              />
                            </div>
                            {/* Formula preview */}
                            {f.formula && (
                              <div style={{ marginTop: 4, padding: '6px 8px', background: 'var(--bg-color)', borderRadius: 4, border: '1px dashed var(--border-color)', lineHeight: 2 }}>
                                <Text type="secondary" style={{ fontSize: 10, display: 'block', marginBottom: 2 }}>Preview</Text>
                                <span style={{ fontSize: 12, fontFamily: 'monospace' }}>
                                  {f.formula.split(/(\[[^\]]+\])/).map((part, pi) => {
                                    if (part.startsWith('[') && part.endsWith(']')) {
                                      const fname = part.slice(1, -1);
                                      const srcField = fields.find(ff => ff.name === fname);
                                      const ftIcons: Record<string, string> = {
                                        text: 'A≡', number: '#', date: '📅', dateTime: '📅', singleSelect: '◉', multiSelect: '≡',
                                        checkbox: '☑', user: '👤', lookup: '🔗', formula: 'fx', link: '🔗', attachment: '📎',
                                        autoNumber: '#', url: '🌐', phone: '📞', email: '✉',
                                      };
                                      const icon = srcField ? (ftIcons[srcField.fieldType] || '▪') : '▪';
                                      return (
                                        <span key={pi} style={{
                                          display: 'inline-flex', alignItems: 'center', gap: 3,
                                          background: '#e8f5e9', color: '#2e7d32', borderRadius: 4,
                                          padding: '1px 6px', margin: '0 2px', fontSize: 11,
                                          border: '1px solid #c8e6c9', fontFamily: 'inherit',
                                        }}>
                                          <span style={{ fontSize: 10 }}>{icon}</span>
                                          {fname}
                                        </span>
                                      );
                                    }
                                    return <span key={pi}>{part}</span>;
                                  })}
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </SortableItem>
                );
              })}
            </div>
            </SortableContext>
            </DndContext>
          )}
          <Button block type="dashed" icon={<PlusOutlined />} size="small" style={{ marginTop: 8 }}
            onClick={() => setFields(prev => [...prev, { name: '', fieldType: 'text', note: '', options: [], defaultValue: '', isSynced: false, lookupTable: '', lookupField: '', lookupConditions: [], lookupDisplay: 'value', lookupFormat: '', formula: '' }])}>
            Thêm trường
          </Button>
              </div>),
            },
            {
              key: 'views',
              label: <Space><EyeOutlined /><Text strong style={{ fontSize: 13 }}>Views</Text><Tag style={{ fontSize: 10 }}>{views.length}</Tag></Space>,
              children: (<div>
            {views.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '12px 0', color: 'var(--text-tertiary)', fontSize: 13 }}>
                Chưa có view nào
              </div>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter}
                onDragEnd={(e: DragEndEvent) => {
                  const { active, over } = e;
                  if (over && active.id !== over.id) {
                    const oldIdx = views.findIndex((_, i) => `view-${i}` === active.id);
                    const newIdx = views.findIndex((_, i) => `view-${i}` === over.id);
                    if (oldIdx !== -1 && newIdx !== -1) setViews(prev => arrayMove(prev, oldIdx, newIdx));
                  }
                }}>
              <SortableContext items={views.map((_, i) => `view-${i}`)} strategy={verticalListSortingStrategy}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {views.map((v, idx) => {
                  const upd = (patch: Partial<View>) => setViews(prev => prev.map((vv, i) => i === idx ? { ...vv, ...patch } : vv));
                  const fieldNames = fields.map(f => f.name).filter(Boolean);
                  return (
                    <SortableItem key={`view-${idx}`} id={`view-${idx}`}>
                      {(handle, style, setRef) => (
                    <div ref={setRef} style={{ ...style, border: '1px solid var(--border-color)', borderRadius: 8, padding: '10px 12px', background: 'var(--bg-secondary)' }}>
                      {/* Header: drag + name + type + delete */}
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                        {handle}
                        <Input size="small" value={v.name} placeholder="Tên view" style={{ flex: 1 }}
                          onChange={e => upd({ name: e.target.value })} />
                        <Select size="small" value={v.viewType} style={{ width: 130 }}
                          onChange={val => upd({ viewType: val, formFields: val === 'form' && v.formFields.length === 0
                            ? fieldNames.map(fn => ({ fieldName: fn, label: '', required: false, description: '', refField: fn, hasCondition: false, conditions: [] }))
                            : v.formFields })}>
                          {VIEW_TYPES.map(vt => <Select.Option key={vt.value} value={vt.value}>{vt.label}</Select.Option>)}
                        </Select>
                        <Button type="text" size="small" danger icon={<DeleteOutlined style={{ fontSize: 12 }} />}
                          onClick={() => setViews(prev => prev.filter((_, i) => i !== idx))} />
                      </div>
                      <Input size="small" value={v.note} placeholder="Ghi chú / mô tả view..."
                        style={{ marginBottom: 8 }}
                        onChange={e => upd({ note: e.target.value })} />

                      {/* ── Config per view type (except form) ── */}
                      {v.viewType !== 'form' && (() => {
                        const hasFields = fieldNames.length > 0;
                        // Single field select — fallback to Input if no fields defined
                        const fsel = (value: string | undefined, placeholder: string, onChange: (val: string) => void) =>
                          hasFields ? (
                            <Select size="small" value={value || undefined} placeholder={placeholder}
                              style={{ flex: 1 }} onChange={onChange} allowClear showSearch
                              filterOption={(input, option) => String(option?.value ?? '').toLowerCase().includes(input.toLowerCase())}>
                              {fieldNames.map(fn => <Select.Option key={fn} value={fn}>{fn}</Select.Option>)}
                            </Select>
                          ) : (
                            <Input size="small" value={value} placeholder={placeholder} style={{ flex: 1 }}
                              onChange={e => onChange(e.target.value)} />
                          );
                        // Multi field select — fallback to tags Input
                        const fmulti = (value: string, placeholder: string, onChange: (val: string) => void) =>
                          hasFields ? (
                            <Select size="small" mode="multiple" value={value ? value.split(',').filter(Boolean) : []}
                              placeholder={placeholder} style={{ flex: 1 }}
                              onChange={vals => onChange(vals.join(','))}>
                              {fieldNames.map(fn => <Select.Option key={fn} value={fn}>{fn}</Select.Option>)}
                            </Select>
                          ) : (
                            <Select size="small" mode="tags" value={value ? value.split(',').filter(Boolean) : []}
                              placeholder={placeholder} style={{ flex: 1 }} open={false} suffixIcon={null}
                              onChange={vals => onChange(vals.join(','))} />
                          );
                        // Filter builder — structured [Field] [Operator] [Value]
                        const filters = v.filter ? (() => { try { return JSON.parse(v.filter) as { field: string; op: string; val: string }[]; } catch { return null; } })() : null;
                        const isStructuredFilter = Array.isArray(filters);
                        const setFilters = (f: { field: string; op: string; val: string }[]) => upd({ filter: JSON.stringify(f) });
                        const initFilter = () => setFilters([{ field: '', op: 'is', val: '' }]);

                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {/* Type-specific key fields */}
                            {v.viewType === 'kanban' && (
                              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                <Text type="secondary" style={{ fontSize: 11, width: 70, flexShrink: 0 }}>Nhóm cột</Text>
                                {fsel(v.kanbanField, 'Chọn trường (singleSelect)', val => upd({ kanbanField: val }))}
                              </div>
                            )}
                            {v.viewType === 'calendar' && (
                              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                <Text type="secondary" style={{ fontSize: 11, width: 70, flexShrink: 0 }}>Trường ngày</Text>
                                {fsel(v.calendarField, 'Chọn trường date', val => upd({ calendarField: val }))}
                              </div>
                            )}
                            {v.viewType === 'gantt' && (
                              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                <Text type="secondary" style={{ fontSize: 11, width: 70, flexShrink: 0 }}>Ngày BĐ</Text>
                                {fsel(v.ganttStartField, 'Trường bắt đầu', val => upd({ ganttStartField: val }))}
                                <Text type="secondary" style={{ fontSize: 11, flexShrink: 0 }}>→</Text>
                                {fsel(v.ganttEndField, 'Trường kết thúc', val => upd({ ganttEndField: val }))}
                              </div>
                            )}
                            {v.viewType === 'gallery' && (
                              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                <Text type="secondary" style={{ fontSize: 11, width: 70, flexShrink: 0 }}>Ảnh bìa</Text>
                                {fsel(v.galleryField, 'Trường attachment', val => upd({ galleryField: val }))}
                              </div>
                            )}
                            {/* Common: group by + sort */}
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                              <Text type="secondary" style={{ fontSize: 11, width: 70, flexShrink: 0 }}>Nhóm theo</Text>
                              {fsel(v.groupBy, 'Chọn trường', val => upd({ groupBy: val }))}
                              <Text type="secondary" style={{ fontSize: 11, flexShrink: 0 }}>Sắp xếp</Text>
                              {fsel(v.sort, 'Chọn trường', val => upd({ sort: val }))}
                            </div>
                            {/* Hidden fields — multi-select */}
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                              <Text type="secondary" style={{ fontSize: 11, width: 70, flexShrink: 0 }}>Trường ẩn</Text>
                              {fmulti(v.hiddenFields, 'Chọn trường cần ẩn', val => upd({ hiddenFields: val }))}
                            </div>
                            {/* Filter — structured builder */}
                            <div>
                              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: isStructuredFilter ? 4 : 0 }}>
                                <Text type="secondary" style={{ fontSize: 11, width: 70, flexShrink: 0 }}>Bộ lọc</Text>
                                {!isStructuredFilter ? (
                                  <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={initFilter} style={{ flex: 1 }}>
                                    Thêm điều kiện lọc
                                  </Button>
                                ) : (
                                  <Button size="small" type="link" danger style={{ fontSize: 11, padding: 0 }}
                                    onClick={() => upd({ filter: '' })}>Xoá tất cả</Button>
                                )}
                              </div>
                              {isStructuredFilter && filters.map((fl, fi) => {
                                const srcField = fields.find(f => f.name === fl.field);
                                const srcOpts = srcField?.options || [];
                                const noVal = fl.op === 'isEmpty' || fl.op === 'isNotEmpty';
                                return (
                                  <div key={fi} style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 4, marginLeft: 76 }}>
                                    {fsel(fl.field, 'Trường', val => { const nf = [...filters]; nf[fi] = { ...nf[fi], field: val }; setFilters(nf); })}
                                    <Select size="small" value={fl.op} style={{ width: 110 }}
                                      onChange={val => { const nf = [...filters]; nf[fi] = { ...nf[fi], op: val }; setFilters(nf); }}>
                                      {CONDITION_OPERATORS.map(op => <Select.Option key={op.value} value={op.value}>{op.label}</Select.Option>)}
                                    </Select>
                                    {!noVal && (
                                      srcOpts.length > 0 ? (
                                        <Select size="small" value={fl.val || undefined} placeholder="Giá trị" style={{ flex: 1 }}
                                          onChange={val => { const nf = [...filters]; nf[fi] = { ...nf[fi], val }; setFilters(nf); }} allowClear>
                                          {srcOpts.map(o => <Select.Option key={o} value={o}>{o}</Select.Option>)}
                                        </Select>
                                      ) : (
                                        <Input size="small" value={fl.val} placeholder="Giá trị" style={{ flex: 1 }}
                                          onChange={e => { const nf = [...filters]; nf[fi] = { ...nf[fi], val: e.target.value }; setFilters(nf); }} />
                                      )
                                    )}
                                    <Button type="text" size="small" danger icon={<DeleteOutlined style={{ fontSize: 11 }} />}
                                      onClick={() => { const nf = filters.filter((_, i) => i !== fi); setFilters(nf.length ? nf : []); if (!nf.length) upd({ filter: '' }); }} />
                                  </div>
                                );
                              })}
                              {isStructuredFilter && (
                                <Button type="link" size="small" icon={<PlusOutlined />} style={{ fontSize: 11, padding: 0, marginLeft: 76 }}
                                  onClick={() => setFilters([...filters, { field: '', op: 'is', val: '' }])}>
                                  Thêm điều kiện
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })()}

                      {/* ── Form: field list with required + description ── */}
                      {v.viewType === 'form' && (
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <Text type="secondary" style={{ fontSize: 11 }}>Các trường trong form</Text>
                            <Space size={4}>
                              {fieldNames.length > 0 && v.formFields.length === 0 && (
                                <Button size="small" type="link" style={{ fontSize: 11, padding: 0 }}
                                  onClick={() => upd({ formFields: fieldNames.map(fn => ({ fieldName: fn, label: '', required: false, description: '', refField: fn, hasCondition: false, conditions: [] })) })}>
                                  Tải từ Fields
                                </Button>
                              )}
                            </Space>
                          </div>
                          {v.formFields.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '8px 0', color: 'var(--text-tertiary)', fontSize: 12 }}>
                              Chưa có trường — bấm "Tải từ Fields" hoặc "Thêm"
                            </div>
                          ) : (
                            <DndContext sensors={sensors} collisionDetection={closestCenter}
                              onDragEnd={(e: DragEndEvent) => {
                                const { active, over } = e;
                                if (over && active.id !== over.id) {
                                  const oldIdx = v.formFields.findIndex((_, i) => `ff-${idx}-${i}` === active.id);
                                  const newIdx = v.formFields.findIndex((_, i) => `ff-${idx}-${i}` === over.id);
                                  if (oldIdx !== -1 && newIdx !== -1) upd({ formFields: arrayMove(v.formFields, oldIdx, newIdx) });
                                }
                              }}>
                            <SortableContext items={v.formFields.map((_, i) => `ff-${idx}-${i}`)} strategy={verticalListSortingStrategy}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {v.formFields.map((ff, fi) => {
                                const updFF = (patch: Partial<FormField>) =>
                                  upd({ formFields: v.formFields.map((f, i) => i === fi ? { ...f, ...patch } : f) });
                                return (
                                  <SortableItem key={`ff-${idx}-${fi}`} id={`ff-${idx}-${fi}`}>
                                    {(handle, style, setRef) => (
                                  <div ref={setRef} style={{ ...style, border: '1px solid var(--border-color)', borderRadius: 6, padding: '6px 8px', background: 'var(--bg-color)' }}>
                                    {/* Row 1: drag + label + required + delete */}
                                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                      {handle}
                                      <Input size="small" value={ff.label || ff.fieldName} placeholder="Label hiển thị"
                                        style={{ flex: 1, fontWeight: 600 }}
                                        onChange={e => updFF({ label: e.target.value })} />
                                      <Space size={4}>
                                        <Switch size="small" checked={ff.required} onChange={val => updFF({ required: val })} />
                                        <Text style={{ fontSize: 11, color: ff.required ? 'var(--accent-color)' : 'var(--text-tertiary)' }}>
                                          {ff.required ? 'Bắt buộc' : 'Tuỳ chọn'}
                                        </Text>
                                      </Space>
                                      <Button type="text" size="small" danger icon={<DeleteOutlined style={{ fontSize: 11 }} />}
                                        onClick={() => upd({ formFields: v.formFields.filter((_, i) => i !== fi) })} />
                                    </div>
                                    {/* Row 2: description */}
                                    <Input size="small" value={ff.description} placeholder="Mô tả / hướng dẫn điền" style={{ marginTop: 4 }}
                                      onChange={e => updFF({ description: e.target.value })} />
                                    {/* Row 3: ref field (tham chiếu) */}
                                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
                                      <Text type="secondary" style={{ fontSize: 11, flexShrink: 0 }}>Tham chiếu</Text>
                                      {fieldNames.length > 0 ? (
                                        <Select size="small" value={ff.refField || ff.fieldName || undefined} placeholder="Chọn field gốc"
                                          style={{ flex: 1 }} allowClear showSearch
                                          onChange={val => updFF({ refField: val || '' })}
                                          filterOption={(input, option) => String(option?.value ?? '').toLowerCase().includes(input.toLowerCase())}>
                                          {fieldNames.map(fn => <Select.Option key={fn} value={fn}>{fn}</Select.Option>)}
                                        </Select>
                                      ) : (
                                        <Input size="small" value={ff.refField || ff.fieldName} placeholder="Tên field gốc" style={{ flex: 1 }}
                                          onChange={e => updFF({ refField: e.target.value })} />
                                      )}
                                      {(() => {
                                        const ref = ff.refField || ff.fieldName;
                                        const srcField = fields.find(f => f.name === ref);
                                        if (!srcField) return null;
                                        return <Tag style={{ fontSize: 9, margin: 0 }}>{srcField.fieldType}</Tag>;
                                      })()}
                                    </div>
                                    {/* Condition builder */}
                                    <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                                      <Switch size="small" checked={ff.hasCondition}
                                        onChange={val => updFF({ hasCondition: val, conditions: val && !(ff.conditions?.length) ? [{ field: '', operator: 'is', value: '' }] : (ff.conditions || []) })} />
                                      <Text style={{ fontSize: 11, color: ff.hasCondition ? 'var(--text-color)' : 'var(--text-tertiary)' }}>
                                        Đặt điều kiện hiển thị
                                      </Text>
                                    </div>
                                    {ff.hasCondition && (
                                      <div style={{ marginTop: 4, paddingLeft: 4 }}>
                                        {(ff.conditions || []).map((cond, ci) => {
                                          const updCond = (patch: Partial<Condition>) =>
                                            updFF({ conditions: (ff.conditions || []).map((c, i) => i === ci ? { ...c, ...patch } : c) });
                                          // Collect options for value dropdown from the selected field
                                          const srcField = fields.find(f => f.name === cond.field);
                                          const srcOptions = srcField?.options || [];
                                          const noValue = cond.operator === 'isEmpty' || cond.operator === 'isNotEmpty';
                                          return (
                                            <div key={ci} style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 4 }}>
                                              {fieldNames.length > 0 ? (
                                                <Select size="small" value={cond.field || undefined} placeholder="Trường" style={{ width: '35%' }}
                                                  onChange={val => updCond({ field: val })} showSearch
                                                  filterOption={(input, option) => String(option?.value ?? '').toLowerCase().includes(input.toLowerCase())}>
                                                  {fieldNames.map(fn => <Select.Option key={fn} value={fn}>{fn}</Select.Option>)}
                                                </Select>
                                              ) : (
                                                <Input size="small" value={cond.field} placeholder="Trường" style={{ width: '35%' }}
                                                  onChange={e => updCond({ field: e.target.value })} />
                                              )}
                                              <Select size="small" value={cond.operator} style={{ width: '25%' }}
                                                onChange={val => updCond({ operator: val })}>
                                                {CONDITION_OPERATORS.map(op => <Select.Option key={op.value} value={op.value}>{op.label}</Select.Option>)}
                                              </Select>
                                              {!noValue && (
                                                srcOptions.length > 0 ? (
                                                  <Select size="small" value={cond.value || undefined} placeholder="Giá trị" style={{ flex: 1 }}
                                                    onChange={val => updCond({ value: val })} allowClear>
                                                    {srcOptions.map(opt => <Select.Option key={opt} value={opt}>{opt}</Select.Option>)}
                                                  </Select>
                                                ) : (
                                                  <Input size="small" value={cond.value} placeholder="Giá trị" style={{ flex: 1 }}
                                                    onChange={e => updCond({ value: e.target.value })} />
                                                )
                                              )}
                                              <Button type="text" size="small" danger icon={<DeleteOutlined style={{ fontSize: 11 }} />}
                                                onClick={() => updFF({ conditions: (ff.conditions || []).filter((_, i) => i !== ci) })} />
                                            </div>
                                          );
                                        })}
                                        <Button type="link" size="small" icon={<PlusOutlined />} style={{ fontSize: 11, padding: 0 }}
                                          onClick={() => updFF({ conditions: [...(ff.conditions || []), { field: '', operator: 'is', value: '' }] })}>
                                          Thêm điều kiện
                                        </Button>
                                      </div>
                                    )}
                                  </div>
                                    )}
                                  </SortableItem>
                                );
                              })}
                            </div>
                            </SortableContext>
                            </DndContext>
                          )}
                          <Button block type="dashed" icon={<PlusOutlined />} size="small" style={{ marginTop: 6 }}
                            onClick={() => upd({ formFields: [...v.formFields, { fieldName: '', label: '', required: false, description: '', refField: '', hasCondition: false, conditions: [] }] })}>
                            Thêm trường vào form
                          </Button>
                        </div>
                      )}

                    </div>
                      )}
                    </SortableItem>
                  );
                })}
              </div>
              </SortableContext>
              </DndContext>
            )}
          <Button block type="dashed" icon={<PlusOutlined />} size="small" style={{ marginTop: 8 }}
            onClick={() => setViews(prev => [...prev, emptyView()])}>
            Thêm view
          </Button>
              </div>),
            },
          ]}
        />
      )}

      {/* ═══ Workflow Visual Builder ═══ */}
      {(watchedType === 'workflow' || watchedType === 'workflow-stop') && (
        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 12, marginTop: 8 }}>
          <Text strong style={{ fontSize: 13 }}><ThunderboltOutlined /> Flow ({wfNodes.length} bước)</Text>
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
            {wfNodes.map((node, ni) => {
              const updNode = (patch: Partial<WorkflowNode>) => setWfNodes(prev => prev.map((n, i) => i === ni ? { ...n, ...patch } : n));
              const colors = { trigger: '#6366f1', condition: '#f59e0b', action: '#10b981' };
              const labels = { trigger: 'Trigger', condition: 'Điều kiện', action: 'Hành động' };
              const refFields = siblingItems.length > 0 ? siblingItems.flatMap(s => s.fields) : fields.map(f => f.name).filter(Boolean);
              return (
                <React.Fragment key={node.id}>
                  {ni > 0 && <div style={{ width: 2, height: 20, background: 'var(--border-color)' }} />}
                  <div style={{
                    border: `2px solid ${colors[node.nodeType]}`, borderRadius: 10, padding: '10px 14px',
                    width: '100%', background: 'var(--bg-secondary)', position: 'relative',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <Space size={4}>
                        <Tag color={colors[node.nodeType]} style={{ fontSize: 10 }}>{labels[node.nodeType]}</Tag>
                        <Input size="small" value={node.label} placeholder="Tên bước"
                          style={{ width: 200 }} onChange={e => updNode({ label: e.target.value })} />
                      </Space>
                      <Space size={2}>
                        <Select size="small" value={node.nodeType} style={{ width: 100 }}
                          onChange={v => updNode({ nodeType: v as WorkflowNode['nodeType'] })}>
                          <Select.Option value="trigger">Trigger</Select.Option>
                          <Select.Option value="condition">Điều kiện</Select.Option>
                          <Select.Option value="action">Hành động</Select.Option>
                        </Select>
                        <Button type="text" size="small" danger icon={<DeleteOutlined style={{ fontSize: 11 }} />}
                          onClick={() => setWfNodes(prev => prev.filter((_, i) => i !== ni))} />
                      </Space>
                    </div>
                    {/* Trigger config */}
                    {node.nodeType === 'trigger' && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <Select size="small" value={node.triggerType || undefined} placeholder="Loại trigger" style={{ width: '40%' }}
                          onChange={v => updNode({ triggerType: v })}>
                          {TRIGGER_TYPES.map(t => <Select.Option key={t.value} value={t.value}>{t.label}</Select.Option>)}
                        </Select>
                        {refFields.length > 0 ? (
                          <Select size="small" value={node.triggerField || undefined} placeholder="Trường" style={{ flex: 1 }}
                            onChange={v => updNode({ triggerField: v })} allowClear showSearch
                            filterOption={(input, opt) => String(opt?.value ?? '').toLowerCase().includes(input.toLowerCase())}>
                            {refFields.map(fn => <Select.Option key={fn} value={fn}>{fn}</Select.Option>)}
                          </Select>
                        ) : (
                          <Input size="small" value={node.triggerField} placeholder="Trường" style={{ flex: 1 }}
                            onChange={e => updNode({ triggerField: e.target.value })} />
                        )}
                        <Input size="small" value={node.triggerValue} placeholder="Giá trị" style={{ flex: 1 }}
                          onChange={e => updNode({ triggerValue: e.target.value })} />
                      </div>
                    )}
                    {/* Condition config */}
                    {node.nodeType === 'condition' && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        {refFields.length > 0 ? (
                          <Select size="small" value={node.conditionField || undefined} placeholder="Trường" style={{ flex: 1 }}
                            onChange={v => updNode({ conditionField: v })} allowClear showSearch
                            filterOption={(input, opt) => String(opt?.value ?? '').toLowerCase().includes(input.toLowerCase())}>
                            {refFields.map(fn => <Select.Option key={fn} value={fn}>{fn}</Select.Option>)}
                          </Select>
                        ) : (
                          <Input size="small" value={node.conditionField} placeholder="Trường" style={{ flex: 1 }}
                            onChange={e => updNode({ conditionField: e.target.value })} />
                        )}
                        <Select size="small" value={node.conditionOp} style={{ width: 100 }}
                          onChange={v => updNode({ conditionOp: v })}>
                          {CONDITION_OPERATORS.map(op => <Select.Option key={op.value} value={op.value}>{op.label}</Select.Option>)}
                        </Select>
                        <Input size="small" value={node.conditionValue} placeholder="Giá trị" style={{ flex: 1 }}
                          onChange={e => updNode({ conditionValue: e.target.value })} />
                      </div>
                    )}
                    {/* Action config */}
                    {node.nodeType === 'action' && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <Select size="small" value={node.actionType || undefined} placeholder="Loại hành động" style={{ width: '40%' }}
                          onChange={v => updNode({ actionType: v })}>
                          {ACTION_TYPES.map(a => <Select.Option key={a.value} value={a.value}>{a.label}</Select.Option>)}
                        </Select>
                        <Input size="small" value={node.actionConfig} placeholder="Chi tiết (kênh, nội dung...)" style={{ flex: 1 }}
                          onChange={e => updNode({ actionConfig: e.target.value })} />
                      </div>
                    )}
                  </div>
                </React.Fragment>
              );
            })}
            {wfNodes.length > 0 && <div style={{ width: 2, height: 20, background: 'var(--border-color)' }} />}
            <Dropdown menu={{
              items: [
                { key: 'trigger', icon: <ThunderboltOutlined />, label: 'Trigger', onClick: () => setWfNodes(prev => [...prev, { id: `wf-${Date.now()}`, nodeType: 'trigger', label: '', triggerType: '', triggerField: '', triggerValue: '', conditionField: '', conditionOp: 'is', conditionValue: '', actionType: '', actionConfig: '', order: prev.length, parentId: '', branch: '' }]) },
                { key: 'condition', icon: <SearchOutlined />, label: 'Điều kiện', onClick: () => setWfNodes(prev => [...prev, { id: `wf-${Date.now()}`, nodeType: 'condition', label: '', triggerType: '', triggerField: '', triggerValue: '', conditionField: '', conditionOp: 'is', conditionValue: '', actionType: '', actionConfig: '', order: prev.length, parentId: '', branch: '' }]) },
                { key: 'action', icon: <SettingOutlined />, label: 'Hành động', onClick: () => setWfNodes(prev => [...prev, { id: `wf-${Date.now()}`, nodeType: 'action', label: '', triggerType: '', triggerField: '', triggerValue: '', conditionField: '', conditionOp: 'is', conditionValue: '', actionType: '', actionConfig: '', order: prev.length, parentId: '', branch: '' }]) },
              ],
            }} trigger={['click']}>
              <Button type="dashed" icon={<PlusOutlined />} style={{ width: '100%' }}>Thêm bước</Button>
            </Dropdown>
          </div>
        </div>
      )}

      {/* ═══ Dashboard / Form-Analytics Widgets ═══ */}
      {(watchedType === 'dashboard' || watchedType === 'form-analytics') && (
        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 12, marginTop: 8 }}>
          <Text strong style={{ fontSize: 13 }}><BarChartOutlined /> Widgets ({dashWidgets.length})</Text>
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {dashWidgets.map((widget, wi) => {
              const updW = (patch: Partial<DashboardWidget>) => setDashWidgets(prev => prev.map((w, i) => i === wi ? { ...w, ...patch } : w));
              const isWordCloud = widget.chartType === 'wordCloud';
              const isPieOrDonut = widget.chartType === 'pie' || widget.chartType === 'donut';
              const isNumber = widget.chartType === 'number';
              const refFields = siblingItems.length > 0 ? siblingItems.flatMap(s => s.fields) : [];
              const refTables = siblingItems.length > 0 ? siblingItems.map(s => s.name) : [];
              return (
                <div key={widget.id} style={{
                  border: '1px solid var(--border-color)', borderRadius: 8, padding: '10px 12px',
                  background: 'var(--bg-secondary)',
                }}>
                  {/* Header */}
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 14, flexShrink: 0 }}>{CHART_TYPE_ICONS[widget.chartType] || '▪'}</span>
                    <Input size="small" value={widget.title} placeholder="Tiêu đề widget"
                      style={{ flex: 1, fontWeight: 600 }}
                      onChange={e => updW({ title: e.target.value })} />
                    <Select size="small" value={widget.chartType} style={{ width: 140 }}
                      onChange={v => updW({ chartType: v })}>
                      {CHART_TYPES.map(ct => (
                        <Select.Option key={ct.value} value={ct.value}>
                          <Space size={4}>{CHART_TYPE_ICONS[ct.value]} {ct.label}</Space>
                        </Select.Option>
                      ))}
                    </Select>
                    <Button type="text" size="small" danger icon={<DeleteOutlined style={{ fontSize: 11 }} />}
                      onClick={() => setDashWidgets(prev => prev.filter((_, i) => i !== wi))} />
                  </div>

                  {/* Data source & field */}
                  <Row gutter={8} style={{ marginBottom: 6 }}>
                    <Col span={12}>
                      <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 2 }}>Nguồn dữ liệu</Text>
                      {refTables.length > 0 ? (
                        <Select size="small" value={widget.dataSource || undefined} placeholder="Chọn bảng"
                          style={{ width: '100%' }} allowClear showSearch
                          onChange={v => updW({ dataSource: v || '' })}
                          filterOption={(input, opt) => String(opt?.value ?? '').toLowerCase().includes(input.toLowerCase())}>
                          {refTables.map(t => <Select.Option key={t} value={t}>{t}</Select.Option>)}
                        </Select>
                      ) : (
                        <Input size="small" value={widget.dataSource} placeholder="Tên bảng nguồn"
                          onChange={e => updW({ dataSource: e.target.value })} />
                      )}
                    </Col>
                    <Col span={12}>
                      <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 2 }}>
                        {isWordCloud ? 'Trường từ khóa' : 'Trường dữ liệu'}
                      </Text>
                      {refFields.length > 0 ? (
                        <Select size="small" value={widget.fieldName || undefined} placeholder="Chọn trường"
                          style={{ width: '100%' }} allowClear showSearch
                          onChange={v => updW({ fieldName: v || '' })}
                          filterOption={(input, opt) => String(opt?.value ?? '').toLowerCase().includes(input.toLowerCase())}>
                          {refFields.map(f => <Select.Option key={f} value={f}>{f}</Select.Option>)}
                        </Select>
                      ) : (
                        <Input size="small" value={widget.fieldName} placeholder="Tên trường"
                          onChange={e => updW({ fieldName: e.target.value })} />
                      )}
                    </Col>
                  </Row>

                  {/* Pie/Donut options */}
                  {isPieOrDonut && (
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 6 }}>
                      <Space size={6}>
                        <Switch size="small" checked={widget.showLegend} onChange={v => updW({ showLegend: v })} />
                        <Text style={{ fontSize: 11 }}>Chú thích</Text>
                      </Space>
                      <Space size={6}>
                        <Switch size="small" checked={widget.showDataLabel} onChange={v => updW({ showDataLabel: v })} />
                        <Text style={{ fontSize: 11 }}>Nhãn dữ liệu</Text>
                      </Space>
                      <div style={{ flex: 1 }}>
                        <Select size="small" value={widget.sortBy || 'label'} style={{ width: '100%' }}
                          onChange={v => updW({ sortBy: v })}>
                          <Select.Option value="label">Sắp xếp: Lát</Select.Option>
                          <Select.Option value="value">Sắp xếp: Giá trị lát</Select.Option>
                          <Select.Option value="recordOrder">Sắp xếp: Thứ tự bản ghi</Select.Option>
                        </Select>
                      </div>
                    </div>
                  )}

                  {/* Number stat options */}
                  {isNumber && (
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 6 }}>
                      <Space size={6}>
                        <Switch size="small" checked={widget.showTrend} onChange={v => updW({ showTrend: v })} />
                        <Text style={{ fontSize: 11 }}>Thay đổi theo thời gian</Text>
                      </Space>
                      <Text type="secondary" style={{ fontSize: 11 }}>Phân tích: Số lượng bản ghi</Text>
                    </div>
                  )}

                  {/* Word cloud options */}
                  {isWordCloud && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <Row gutter={8}>
                        <Col span={8}>
                          <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 2 }}>Hình dạng</Text>
                          <Select size="small" value={widget.shape || 'cloud'} style={{ width: '100%' }}
                            onChange={v => updW({ shape: v })}>
                            {WORD_CLOUD_SHAPES.map(s => <Select.Option key={s.value} value={s.value}>{s.label}</Select.Option>)}
                          </Select>
                        </Col>
                        <Col span={8}>
                          <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 2 }}>Chủ đề</Text>
                          <Select size="small" value={widget.theme || 'default'} style={{ width: '100%' }}
                            onChange={v => updW({ theme: v })}>
                            <Select.Option value="default">Mặc định</Select.Option>
                            <Select.Option value="warm">Ấm</Select.Option>
                            <Select.Option value="cool">Lạnh</Select.Option>
                            <Select.Option value="monochrome">Đơn sắc</Select.Option>
                          </Select>
                        </Col>
                        <Col span={8}>
                          <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 2 }}>Phân đoạn</Text>
                          <Select size="small" value={widget.segmentMode || 'auto'} style={{ width: '100%' }}
                            onChange={v => updW({ segmentMode: v })}>
                            <Select.Option value="auto">Tự động phân đoạn</Select.Option>
                            <Select.Option value="custom">Tần suất tùy chỉnh</Select.Option>
                          </Select>
                        </Col>
                      </Row>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        <Space size={6}>
                          <Switch size="small" checked={widget.hideIrrelevant} onChange={v => updW({ hideIrrelevant: v })} />
                          <Text style={{ fontSize: 11 }}>Ẩn các từ không liên quan</Text>
                        </Space>
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Text type="secondary" style={{ fontSize: 11, flexShrink: 0 }}>Số lượng từ khóa</Text>
                          <Input size="small" type="number" value={widget.maxKeywords || 50}
                            style={{ width: 70 }} min={1} max={200}
                            onChange={e => updW({ maxKeywords: Number(e.target.value) || 50 })} />
                        </div>
                      </div>
                      <div>
                        <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 2 }}>Các từ bị loại trừ (phân cách bằng dấu cách)</Text>
                        <Input size="small" value={widget.excludeWords} placeholder="VD: và của là để cho"
                          onChange={e => updW({ excludeWords: e.target.value })} />
                      </div>
                    </div>
                  )}

                  {/* Note */}
                  <Input size="small" value={widget.note} placeholder="Ghi chú widget..."
                    style={{ marginTop: 6 }}
                    onChange={e => updW({ note: e.target.value })} />
                </div>
              );
            })}
            <Dropdown menu={{
              items: CHART_TYPES.map(ct => ({
                key: ct.value,
                icon: <span>{CHART_TYPE_ICONS[ct.value]}</span>,
                label: ct.label,
                onClick: () => setDashWidgets(prev => [...prev, {
                  id: `dw-${Date.now()}`, title: '', chartType: ct.value,
                  dataSource: '', fieldName: '', theme: 'default',
                  showLegend: true, showDataLabel: true, sortBy: 'label',
                  shape: 'cloud', maxKeywords: 50, excludeWords: '',
                  hideIrrelevant: true, segmentMode: 'auto',
                  showTrend: false, note: '',
                }]),
              })),
            }} trigger={['click']}>
              <Button block type="dashed" icon={<PlusOutlined />} size="small">Thêm widget</Button>
            </Dropdown>
          </div>
        </div>
      )}

      {/* ═══ Automation Steps Editor ═══ */}
      {(watchedType === 'automation' || watchedType === 'automation-stop') && (
        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 12, marginTop: 8 }}>
          <Text strong style={{ fontSize: 13 }}><SettingOutlined /> Steps ({autoSteps.length})</Text>
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <DndContext sensors={sensors} collisionDetection={closestCenter}
              onDragEnd={(e: DragEndEvent) => {
                const { active, over } = e;
                if (over && active.id !== over.id) {
                  const oldIdx = autoSteps.findIndex(s => `auto-${s.id}` === active.id);
                  const newIdx = autoSteps.findIndex(s => `auto-${s.id}` === over.id);
                  if (oldIdx !== -1 && newIdx !== -1) setAutoSteps(prev => arrayMove(prev, oldIdx, newIdx));
                }
              }}>
              <SortableContext items={autoSteps.map(s => `auto-${s.id}`)} strategy={verticalListSortingStrategy}>
                {autoSteps.map((step, si) => {
                  const updStep = (patch: Partial<AutomationStep>) => setAutoSteps(prev => prev.map((s, i) => i === si ? { ...s, ...patch } : s));
                  const refFields = siblingItems.length > 0 ? siblingItems.flatMap(s => s.fields) : fields.map(f => f.name).filter(Boolean);
                  const colors = { trigger: '#6366f1', condition: '#f59e0b', action: '#10b981' };
                  return (
                    <SortableItem key={`auto-${step.id}`} id={`auto-${step.id}`}>
                      {(handle, style, setRef) => (
                        <div ref={setRef} style={{ ...style, border: '1px solid var(--border-color)', borderRadius: 8, padding: '8px 10px', background: 'var(--bg-secondary)' }}>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                            {handle}
                            <Tag style={{ fontSize: 10 }}>Step {si + 1}</Tag>
                            <Select size="small" value={step.stepType} style={{ width: 100 }}
                              onChange={v => updStep({ stepType: v as AutomationStep['stepType'] })}>
                              <Select.Option value="trigger"><Tag color={colors.trigger} style={{ fontSize: 10 }}>Trigger</Tag></Select.Option>
                              <Select.Option value="condition"><Tag color={colors.condition} style={{ fontSize: 10 }}>Điều kiện</Tag></Select.Option>
                              <Select.Option value="action"><Tag color={colors.action} style={{ fontSize: 10 }}>Hành động</Tag></Select.Option>
                            </Select>
                            <Input size="small" value={step.label} placeholder="Tên step" style={{ flex: 1 }}
                              onChange={e => updStep({ label: e.target.value })} />
                            <Button type="text" size="small" danger icon={<DeleteOutlined style={{ fontSize: 11 }} />}
                              onClick={() => setAutoSteps(prev => prev.filter((_, i) => i !== si))} />
                          </div>
                          {step.stepType === 'trigger' && (
                            <div style={{ display: 'flex', gap: 6 }}>
                              <Select size="small" value={step.triggerType || undefined} placeholder="Loại" style={{ width: '40%' }}
                                onChange={v => updStep({ triggerType: v })}>
                                {TRIGGER_TYPES.map(t => <Select.Option key={t.value} value={t.value}>{t.label}</Select.Option>)}
                              </Select>
                              {refFields.length > 0 ? (
                                <Select size="small" value={step.triggerField || undefined} placeholder="Trường" style={{ flex: 1 }}
                                  onChange={v => updStep({ triggerField: v })} allowClear showSearch
                                  filterOption={(input, opt) => String(opt?.value ?? '').toLowerCase().includes(input.toLowerCase())}>
                                  {refFields.map(fn => <Select.Option key={fn} value={fn}>{fn}</Select.Option>)}
                                </Select>
                              ) : (
                                <Input size="small" value={step.triggerField} placeholder="Trường" style={{ flex: 1 }}
                                  onChange={e => updStep({ triggerField: e.target.value })} />
                              )}
                              <Input size="small" value={step.triggerValue} placeholder="Giá trị" style={{ flex: 1 }}
                                onChange={e => updStep({ triggerValue: e.target.value })} />
                            </div>
                          )}
                          {step.stepType === 'condition' && (
                            <div style={{ display: 'flex', gap: 6 }}>
                              {refFields.length > 0 ? (
                                <Select size="small" value={step.conditionField || undefined} placeholder="Trường" style={{ flex: 1 }}
                                  onChange={v => updStep({ conditionField: v })} allowClear showSearch
                                  filterOption={(input, opt) => String(opt?.value ?? '').toLowerCase().includes(input.toLowerCase())}>
                                  {refFields.map(fn => <Select.Option key={fn} value={fn}>{fn}</Select.Option>)}
                                </Select>
                              ) : (
                                <Input size="small" value={step.conditionField} placeholder="Trường" style={{ flex: 1 }}
                                  onChange={e => updStep({ conditionField: e.target.value })} />
                              )}
                              <Select size="small" value={step.conditionOp} style={{ width: 100 }}
                                onChange={v => updStep({ conditionOp: v })}>
                                {CONDITION_OPERATORS.map(op => <Select.Option key={op.value} value={op.value}>{op.label}</Select.Option>)}
                              </Select>
                              <Input size="small" value={step.conditionValue} placeholder="Giá trị" style={{ flex: 1 }}
                                onChange={e => updStep({ conditionValue: e.target.value })} />
                            </div>
                          )}
                          {step.stepType === 'action' && (
                            <div style={{ display: 'flex', gap: 6 }}>
                              <Select size="small" value={step.actionType || undefined} placeholder="Loại" style={{ width: '40%' }}
                                onChange={v => updStep({ actionType: v })}>
                                {ACTION_TYPES.map(a => <Select.Option key={a.value} value={a.value}>{a.label}</Select.Option>)}
                              </Select>
                              <Input size="small" value={step.actionConfig} placeholder="Chi tiết" style={{ flex: 1 }}
                                onChange={e => updStep({ actionConfig: e.target.value })} />
                            </div>
                          )}
                        </div>
                      )}
                    </SortableItem>
                  );
                })}
              </SortableContext>
            </DndContext>
            <Dropdown menu={{
              items: [
                { key: 'trigger', label: 'Trigger', onClick: () => setAutoSteps(prev => [...prev, { id: `auto-${Date.now()}`, stepType: 'trigger', label: '', triggerType: '', triggerField: '', triggerValue: '', conditionField: '', conditionOp: 'is', conditionValue: '', actionType: '', actionConfig: '', order: prev.length }]) },
                { key: 'condition', label: 'Điều kiện', onClick: () => setAutoSteps(prev => [...prev, { id: `auto-${Date.now()}`, stepType: 'condition', label: '', triggerType: '', triggerField: '', triggerValue: '', conditionField: '', conditionOp: 'is', conditionValue: '', actionType: '', actionConfig: '', order: prev.length }]) },
                { key: 'action', label: 'Hành động', onClick: () => setAutoSteps(prev => [...prev, { id: `auto-${Date.now()}`, stepType: 'action', label: '', triggerType: '', triggerField: '', triggerValue: '', conditionField: '', conditionOp: 'is', conditionValue: '', actionType: '', actionConfig: '', order: prev.length }]) },
              ],
            }} trigger={['click']}>
              <Button block type="dashed" icon={<PlusOutlined />} size="small">Thêm step</Button>
            </Dropdown>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ═══ Types ═══

interface Field {
  _id?: string;
  name: string;
  fieldType: string;
  note: string;
  options: string[];
  defaultValue: string;
  isSynced: boolean;
  lookupTable: string;
  lookupField: string;
  lookupConditions: { sourceField: string; operator: string; targetField: string }[];
  lookupDisplay: string;
  lookupFormat: string;
  formula: string;
}

interface WorkflowNode {
  id: string;
  nodeType: 'trigger' | 'condition' | 'action';
  label: string;
  triggerType: string;
  triggerField: string;
  triggerValue: string;
  conditionField: string;
  conditionOp: string;
  conditionValue: string;
  actionType: string;
  actionConfig: string;
  order: number;
  parentId: string;
  branch: string;
}

interface AutomationStep {
  id: string;
  stepType: 'trigger' | 'condition' | 'action';
  label: string;
  triggerType: string;
  triggerField: string;
  triggerValue: string;
  conditionField: string;
  conditionOp: string;
  conditionValue: string;
  actionType: string;
  actionConfig: string;
  order: number;
}

interface DashboardWidget {
  id: string;
  title: string;
  chartType: string;
  dataSource: string;
  fieldName: string;
  theme: string;
  showLegend: boolean;
  showDataLabel: boolean;
  sortBy: string;
  shape: string;
  maxKeywords: number;
  excludeWords: string;
  hideIrrelevant: boolean;
  segmentMode: string;
  showTrend: boolean;
  note: string;
}

interface Condition {
  _id?: string;
  field: string;
  operator: string;
  value: string;
}

interface FormField {
  _id?: string;
  fieldName: string;
  label: string;
  required: boolean;
  description: string;
  refField: string;
  hasCondition: boolean;
  conditions: Condition[];
}

interface View {
  _id?: string;
  name: string;
  viewType: string;
  note: string;
  filter: string;
  groupBy: string;
  sort: string;
  hiddenFields: string;
  kanbanField: string;
  calendarField: string;
  ganttStartField: string;
  ganttEndField: string;
  galleryField: string;
  formFields: FormField[];
}

interface BaseItem {
  _id?: string;
  name: string;
  type: string;
  order: number;
  status: string;
  note: string;
  description: string;
  fields: Field[];
  views: View[];
  syncSource: string;
  syncMode: 'readonly' | 'readwrite';
  syncType: 'lark' | 'api' | 'manual';
  syncInterval: string;
  workflowNodes: WorkflowNode[];
  automationSteps: AutomationStep[];
  dashboardWidgets: DashboardWidget[];
}

interface BaseGroup {
  _id?: string;
  name: string;
  order: number;
  status: string;
  items: BaseItem[];
}

interface AnalystBase {
  _id: string;
  name: string;
  order: number;
  groups: BaseGroup[];
}

const ROOT_GROUP_NAME = '__root__';

// ═══ Constants ═══

const ITEM_TYPES = [
  'base', 'base-sync', 'view', 'form-analytics', 'workflow', 'workflow-stop',
  'automation', 'automation-stop', 'dashboard',
];

const VIEW_TYPES = [
  { value: 'grid', label: 'Dạng lưới' },
  { value: 'kanban', label: 'Kanban' },
  { value: 'calendar', label: 'Lịch' },
  { value: 'gantt', label: 'Gantt' },
  { value: 'gallery', label: 'Thư viện' },
  { value: 'form', label: 'Biểu mẫu' },
];

const VIEW_TYPE_LABELS: Record<string, string> = {
  grid: 'Lưới', kanban: 'Kanban', calendar: 'Lịch',
  gantt: 'Gantt', gallery: 'Thư viện', form: 'Biểu mẫu',
};

const VIEW_TYPE_COLORS: Record<string, string> = {
  grid: 'blue', kanban: 'purple', calendar: 'green',
  gantt: 'orange', gallery: 'magenta', form: 'geekblue',
};

const FIELD_TYPES = [
  'text', 'number', 'date', 'dateTime', 'singleSelect', 'multiSelect',
  'checkbox', 'user', 'lookup', 'formula', 'link', 'attachment',
  'autoNumber', 'url', 'phone', 'email', 'barcode', 'currency',
  'progress', 'rating', 'location',
];

const TYPE_COLORS: Record<string, string> = {
  'base': 'blue', 'base-sync': 'orange', 'view': 'cyan',
  'form-analytics': 'volcano', 'workflow': 'purple', 'workflow-stop': 'red',
  'automation': 'green', 'automation-stop': 'red', 'dashboard': 'geekblue',
};

const TYPE_ICONS: Record<string, React.ReactNode> = {
  'base': <DatabaseOutlined />, 'base-sync': <SyncOutlined />,
  'view': <EyeOutlined />, 'form-analytics': <BarChartOutlined />,
  'workflow': <ThunderboltOutlined />,
  'workflow-stop': <ThunderboltOutlined />, 'automation': <SettingOutlined />,
  'automation-stop': <SettingOutlined />, 'dashboard': <BarChartOutlined />,
};

const CHART_TYPES = [
  { value: 'number', label: 'Số liệu' },
  { value: 'pie', label: 'Biểu đồ tròn' },
  { value: 'donut', label: 'Biểu đồ donut' },
  { value: 'wordCloud', label: 'Đám mây từ' },
  { value: 'bar', label: 'Biểu đồ cột' },
  { value: 'line', label: 'Biểu đồ đường' },
];

const CHART_TYPE_ICONS: Record<string, string> = {
  number: '#', pie: '◔', donut: '◎', wordCloud: '☁', bar: '▥', line: '📈',
};

const WORD_CLOUD_SHAPES = [
  { value: 'cloud', label: 'Đám mây' },
  { value: 'circle', label: 'Hình tròn' },
  { value: 'square', label: 'Hình vuông' },
  { value: 'heart', label: 'Trái tim' },
  { value: 'star', label: 'Ngôi sao' },
];

const CONDITION_OPERATORS = [
  { value: 'is', label: 'là' },
  { value: 'isNot', label: 'không là' },
  { value: 'contains', label: 'chứa' },
  { value: 'notContains', label: 'không chứa' },
  { value: 'isEmpty', label: 'trống' },
  { value: 'isNotEmpty', label: 'không trống' },
];

const TRIGGER_TYPES = [
  { value: 'recordChanged', label: 'Khi bản ghi thay đổi' },
  { value: 'recordCreated', label: 'Khi tạo bản ghi mới' },
  { value: 'scheduled', label: 'Theo lịch' },
  { value: 'button', label: 'Nút bấm' },
];
const ACTION_TYPES = [
  { value: 'sendMessage', label: 'Gửi tin nhắn' },
  { value: 'updateField', label: 'Cập nhật trường' },
  { value: 'createRecord', label: 'Tạo bản ghi' },
  { value: 'webhook', label: 'Gọi webhook' },
  { value: 'notify', label: 'Gửi thông báo' },
];

const ANALYSIS_STATUSES = [
  { value: 'none', label: 'Chưa phân tích', color: 'default' },
  { value: 'analyzing', label: 'Đang phân tích', color: 'processing' },
  { value: 'done', label: 'Đã phân tích', color: 'success' },
  { value: 'needUpdate', label: 'Cần cập nhật', color: 'warning' },
];

const STATUS_ICONS: Record<string, React.ReactNode> = {
  none: <ClockCircleOutlined style={{ color: 'var(--text-tertiary)' }} />,
  analyzing: <SyncOutlined style={{ color: '#1677ff' }} />,
  done: <CheckCircleOutlined style={{ color: '#52c41a' }} />,
  needUpdate: <ExclamationCircleOutlined style={{ color: '#faad14' }} />,
};

const CHECKLIST_KEY = 'default';

function emptyView(viewType = 'grid'): View {
  return { name: '', viewType, note: '', filter: '', groupBy: '', sort: '', hiddenFields: '',
    kanbanField: '', calendarField: '', ganttStartField: '', ganttEndField: '', galleryField: '', formFields: [] };
}

// ═══ Stats helper ═══

function computeStats(groups: BaseGroup[]) {
  const items = groups.flatMap(g => g.items);
  const types: Record<string, number> = {};
  items.forEach(i => { const t = i.type.replace('-stop', ''); types[t] = (types[t] || 0) + 1; });
  return {
    total: items.length,
    bases: types['base'] || 0,
    synced: types['base-sync'] || 0,
    views: types['view'] || 0,
    workflows: (types['workflow'] || 0),
    automations: (types['automation'] || 0),
    dashboards: (types['dashboard'] || 0) + (types['form-analytics'] || 0),
  };
}

// ═══ Memoized Tree (prevents re-render when modal state changes) ═══

const AnalystTree = memo(function AnalystTree({
  groups, activeBaseName, checkedKeys, filterType, searchText,
  onToggleCheck, onOpenItem, onOpenGroup, onDeleteGroup, onDeleteItem, onCopyItem,
  onStatusChange, onMoveItem,
}: {
  groups: BaseGroup[];
  activeBaseName: string;
  checkedKeys: Set<string>;
  filterType: string;
  searchText: string;
  onToggleCheck: (key: string) => void;
  onOpenItem: (groupIdx: number, itemIdx?: number) => void;
  onOpenGroup: (groupIdx?: number) => void;
  onDeleteGroup: (groupIdx: number) => void;
  onDeleteItem: (groupIdx: number, itemIdx: number) => void;
  onCopyItem: (name: string) => void;
  onStatusChange: (groupIdx: number, itemIdx: number | null, status: string) => void;
  onMoveItem: (fromGroupIdx: number, itemIdx: number, toGroupIdx: number) => void;
}) {
  const treeData = useMemo((): DataNode[] => {
    const nodes: DataNode[] = [];

    // Render __root__ items at top level (ungrouped)
    const rootGroup = groups.find(g => g.name === ROOT_GROUP_NAME);
    const rootGroupIdx = groups.findIndex(g => g.name === ROOT_GROUP_NAME);
    if (rootGroup && rootGroupIdx >= 0) {
      let rootItems = rootGroup.items.map((item, idx) => ({ ...item, _itemIdx: idx }));
      if (filterType !== 'all') rootItems = rootItems.filter(i => i.type.startsWith(filterType));
      if (searchText) { const q = searchText.toLowerCase(); rootItems = rootItems.filter(i => i.name.toLowerCase().includes(q)); }
      rootItems.forEach((item) => {
        const itemKey = `${activeBaseName}::${item.name}::__root__`;
        const realGroups = groups.filter(g => g.name !== ROOT_GROUP_NAME);
        nodes.push({
          title: (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, paddingRight: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                <Dropdown menu={{ items: ANALYSIS_STATUSES.map(s => ({
                  key: s.value, icon: STATUS_ICONS[s.value], label: s.label,
                  onClick: () => onStatusChange(rootGroupIdx, item._itemIdx, s.value),
                })) }} trigger={['click']}>
                  <span onClick={e => e.stopPropagation()} style={{ cursor: 'pointer', fontSize: 14, flexShrink: 0 }}>
                    {STATUS_ICONS[item.status || 'none']}
                  </span>
                </Dropdown>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{TYPE_ICONS[item.type]}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                {item.note && <Text type="secondary" style={{ fontSize: 11, flexShrink: 0 }}>— {item.note}</Text>}
                <Tag color="default" style={{ fontSize: 9, margin: 0, lineHeight: '16px', fontStyle: 'italic' }}>ungrouped</Tag>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                <Tag color={TYPE_COLORS[item.type] || 'default'} style={{ fontSize: 9, margin: 0, lineHeight: '16px' }}>{item.type}</Tag>
                {realGroups.length > 0 && (
                  <Dropdown menu={{
                    items: realGroups.map((g, gIdx) => {
                      const actualIdx = groups.findIndex(gr => gr === g);
                      return { key: String(actualIdx), label: `→ ${g.name}`, onClick: () => onMoveItem(rootGroupIdx, item._itemIdx, actualIdx) };
                    }),
                  }} trigger={['click']}>
                    <Tooltip title="Chuyển vào group">
                      <Button type="text" size="small" icon={<FolderOutlined style={{ fontSize: 11 }} />}
                        onClick={(e) => e.stopPropagation()} />
                    </Tooltip>
                  </Dropdown>
                )}
                <Button type="text" size="small" icon={<EditOutlined style={{ fontSize: 11 }} />}
                  onClick={(e) => { e.stopPropagation(); onOpenItem(rootGroupIdx, item._itemIdx); }} />
                <Popconfirm title="Xoá?" onConfirm={() => onDeleteItem(rootGroupIdx, item._itemIdx)}>
                  <Button type="text" size="small" danger icon={<DeleteOutlined style={{ fontSize: 11 }} />}
                    onClick={(e) => e.stopPropagation()} />
                </Popconfirm>
              </div>
            </div>
          ),
          key: itemKey,
          isLeaf: true,
        });
      });
    }

    // Render normal groups (skip __root__)
    groups.forEach((group, groupIdx) => {
      if (group.name === ROOT_GROUP_NAME) return;

      let items = group.items.map((item, idx) => ({ ...item, _itemIdx: idx }));
      if (filterType !== 'all') items = items.filter(i => i.type.startsWith(filterType));
      if (searchText) { const q = searchText.toLowerCase(); items = items.filter(i => i.name.toLowerCase().includes(q)); }
      if (items.length === 0 && searchText) return;

      nodes.push({
        title: (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingRight: 4 }}>
            <Space size={6}>
              <Dropdown menu={{ items: ANALYSIS_STATUSES.map(s => ({
                key: s.value, icon: STATUS_ICONS[s.value], label: s.label,
                onClick: () => onStatusChange(groupIdx, null, s.value),
              })) }} trigger={['click']}>
                <span onClick={e => e.stopPropagation()} style={{ cursor: 'pointer', fontSize: 14, flexShrink: 0 }}>
                  {STATUS_ICONS[group.status || 'none']}
                </span>
              </Dropdown>
              <Text strong style={{ fontSize: 13 }}>{group.name} <Text type="secondary" style={{ fontSize: 11 }}>({group.items.length})</Text></Text>
            </Space>
            <Space size={2}>
              <Tooltip title="Thêm item vào group">
                <Button type="primary" size="small" icon={<PlusOutlined />}
                  style={{ fontSize: 11, height: 22, padding: '0 6px' }}
                  onClick={(e) => { e.stopPropagation(); onOpenItem(groupIdx); }}>
                  Thêm
                </Button>
              </Tooltip>
              <Tooltip title="Sửa group">
                <Button type="text" size="small" icon={<EditOutlined />} style={{ fontSize: 11 }}
                  onClick={(e) => { e.stopPropagation(); onOpenGroup(groupIdx); }} />
              </Tooltip>
              <Popconfirm title="Xoá group này?" onConfirm={() => onDeleteGroup(groupIdx)}>
                <Button type="text" size="small" danger icon={<DeleteOutlined />} style={{ fontSize: 11 }}
                  onClick={(e) => e.stopPropagation()} />
              </Popconfirm>
            </Space>
          </div>
        ),
        key: `group::${groupIdx}::${group.name}`,
        selectable: false,
        children: items.map((item) => {
          const itemKey = `${activeBaseName}::${item.name}::${group.name}`;
          const hasFields = item.fields && item.fields.length > 0;
          const hasViews = item.views && item.views.length > 0;
          const itemStatus = ANALYSIS_STATUSES.find(s => s.value === (item.status || 'none')) || ANALYSIS_STATUSES[0];
          return {
            title: (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, paddingRight: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                  <Dropdown menu={{ items: ANALYSIS_STATUSES.map(s => ({
                    key: s.value, icon: STATUS_ICONS[s.value], label: s.label,
                    onClick: () => onStatusChange(groupIdx, item._itemIdx, s.value),
                  })) }} trigger={['click']}>
                    <span onClick={e => e.stopPropagation()} style={{ cursor: 'pointer', fontSize: 14, flexShrink: 0 }}>
                      {STATUS_ICONS[item.status || 'none']}
                    </span>
                  </Dropdown>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{TYPE_ICONS[item.type]}</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                  {item.note && <Text type="secondary" style={{ fontSize: 11, flexShrink: 0 }}>— {item.note}</Text>}
                  {hasFields && <Tag color="default" style={{ fontSize: 9, margin: 0, lineHeight: '16px' }}>{item.fields.length}F</Tag>}
                  {hasViews && <Tag color="cyan" style={{ fontSize: 9, margin: 0, lineHeight: '16px' }}>{item.views.length}V</Tag>}
                  {item.syncSource && <Tag color="orange" style={{ fontSize: 9, margin: 0, lineHeight: '16px' }}>{item.syncSource}</Tag>}
                  {item.workflowNodes && item.workflowNodes.length > 0 && <Tag color="purple" style={{ fontSize: 9, margin: 0, lineHeight: '16px' }}>{item.workflowNodes.length} nodes</Tag>}
                  {item.automationSteps && item.automationSteps.length > 0 && <Tag color="green" style={{ fontSize: 9, margin: 0, lineHeight: '16px' }}>{item.automationSteps.length} steps</Tag>}
                  {item.dashboardWidgets && item.dashboardWidgets.length > 0 && <Tag color="volcano" style={{ fontSize: 9, margin: 0, lineHeight: '16px' }}>{item.dashboardWidgets.length} widgets</Tag>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                  <Tag color={TYPE_COLORS[item.type] || 'default'} style={{ fontSize: 9, margin: 0, lineHeight: '16px' }}>{item.type}</Tag>
                  <Dropdown menu={{
                    items: [
                      { key: 'root', label: '↑ Đưa ra ngoài (ungrouped)', onClick: () => onMoveItem(groupIdx, item._itemIdx, rootGroupIdx) },
                      ...groups.filter(g => g.name !== ROOT_GROUP_NAME && g !== group).map((g) => {
                        const targetIdx = groups.findIndex(gr => gr === g);
                        return { key: String(targetIdx), label: `→ ${g.name}`, onClick: () => onMoveItem(groupIdx, item._itemIdx, targetIdx) };
                      }),
                    ],
                  }} trigger={['click']}>
                    <Tooltip title="Chuyển group">
                      <Button type="text" size="small" icon={<FolderOutlined style={{ fontSize: 11 }} />}
                        onClick={(e) => e.stopPropagation()} />
                    </Tooltip>
                  </Dropdown>
                  <Button type="text" size="small" icon={<EditOutlined style={{ fontSize: 11 }} />}
                    onClick={(e) => { e.stopPropagation(); onOpenItem(groupIdx, item._itemIdx); }} />
                  <Popconfirm title="Xoá?" onConfirm={() => onDeleteItem(groupIdx, item._itemIdx)}>
                    <Button type="text" size="small" danger icon={<DeleteOutlined style={{ fontSize: 11 }} />}
                      onClick={(e) => e.stopPropagation()} />
                  </Popconfirm>
                </div>
              </div>
            ),
            key: itemKey,
            isLeaf: !hasViews,
            children: hasViews ? item.views.map((vi, vi_idx) => ({
              title: (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, paddingRight: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                    <EyeOutlined style={{ fontSize: 12, color: 'var(--text-secondary)' }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>
                      {vi.name || VIEW_TYPE_LABELS[vi.viewType] || vi.viewType}
                    </span>
                    <Tag color={VIEW_TYPE_COLORS[vi.viewType] || 'cyan'} style={{ fontSize: 9, margin: 0, lineHeight: '16px' }}>
                      {VIEW_TYPE_LABELS[vi.viewType] || vi.viewType}
                    </Tag>
                    {vi.filter && <Tag style={{ fontSize: 9, margin: 0, lineHeight: '16px', background: '#f0f0f0', color: '#666' }}>filtered</Tag>}
                    {vi.groupBy && <Tag style={{ fontSize: 9, margin: 0, lineHeight: '16px', background: '#f0f0f0', color: '#666' }}>grouped</Tag>}
                    {vi.sort && <Tag style={{ fontSize: 9, margin: 0, lineHeight: '16px', background: '#f0f0f0', color: '#666' }}>sorted</Tag>}
                    {vi.viewType === 'form' && vi.formFields?.length > 0 && (
                      <Tag style={{ fontSize: 9, margin: 0, lineHeight: '16px', background: '#f0f0f0', color: '#666' }}>{vi.formFields.length} fields</Tag>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                    <Tooltip title="Sửa view (trong item modal)">
                      <Button type="text" size="small" icon={<EditOutlined style={{ fontSize: 10 }} />}
                        onClick={(e) => { e.stopPropagation(); onOpenItem(groupIdx, item._itemIdx); }} />
                    </Tooltip>
                  </div>
                </div>
              ),
              key: `${itemKey}::view::${vi_idx}::${vi.name || vi.viewType}`,
              isLeaf: true,
            })) : undefined,
          };
        }),
      });
    });

    return nodes;
  }, [groups, activeBaseName, checkedKeys, filterType, searchText, onOpenItem, onOpenGroup, onDeleteGroup, onDeleteItem, onToggleCheck, onStatusChange, onMoveItem]);

  if (treeData.length === 0) {
    return <Empty description="Không có items" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: 40 }} />;
  }

  return (
    <Tree
      treeData={treeData}
      defaultExpandAll
      blockNode
      showLine={{ showLeafIcon: false }}
      style={{ fontSize: 13 }}
    />
  );
});

// ═══ Page Component ═══

export default function AnalystPage() {
  const [bases, setBases] = useState<AnalystBase[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeBaseId, setActiveBaseId] = useState<string>('');
  const [checkedKeys, setCheckedKeys] = useState<Set<string>>(new Set());
  const [searchText, setSearchText] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [syncing, setSyncing] = useState(false);
  const [showGraph, setShowGraph] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [commits, setCommits] = useState<{ _id: string; message: string; author: string; createdAt: string; changes: { action: string; target: string; detail: string }[]; stats: { groups: number; items: number; fields: number } }[]>([]);
  const [diffData, setDiffData] = useState<{ hasChanges: boolean; changes: { action: string; target: string; detail: string }[]; lastCommit: { message: string; author: string; createdAt: string } | null } | null>(null);
  const [commitMsg, setCommitMsg] = useState('');
  const [committing, setCommitting] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [expandedCommit, setExpandedCommit] = useState<{ id: string; detail: any[] } | null>(null);

  // Modal states
  const [baseModalOpen, setBaseModalOpen] = useState(false);
  const [editingBase, setEditingBase] = useState<AnalystBase | null>(null);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<{ groupIdx: number; group: BaseGroup } | null>(null);
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<{ groupIdx: number; itemIdx: number; item: BaseItem } | null>(null);
  const [addItemGroupIdx, setAddItemGroupIdx] = useState(-1);
  const [saving, setSaving] = useState(false);

  const [baseForm] = Form.useForm();
  const [groupForm] = Form.useForm();

  // ── Load data ──

  const loadBases = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const { data: res } = await api.get('/analyst-bases');
      if (res.success) {
        if (res.data.length === 0) {
          await api.post('/analyst-bases/seed');
          const { data: res2 } = await api.get('/analyst-bases');
          if (res2.success) {
            setBases(res2.data);
            if (res2.data.length > 0) setActiveBaseId(res2.data[0]._id);
          }
        } else {
          setBases(res.data);
          if (!activeBaseId && res.data.length > 0) setActiveBaseId(res.data[0]._id);
        }
      }
    } catch {
      message.warning('Không kết nối được API');
    }
    if (showLoading) setLoading(false);
  }, []);

  useEffect(() => { loadBases(); }, [loadBases]);

  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        const saved = localStorage.getItem('lark_analyst_checked');
        if (saved) setCheckedKeys(new Set(JSON.parse(saved)));
      }
    } catch {}
    pullFromDB(true);
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('lark_analyst_checked', JSON.stringify([...checkedKeys]));
    }
  }, [checkedKeys]);

  const activeBase = useMemo(() => bases.find(b => b._id === activeBaseId), [bases, activeBaseId]);
  const currentGroups = useMemo(() => {
    const groups = activeBase?.groups || [];
    // Ensure __root__ group exists for ungrouped items
    if (!groups.find(g => g.name === ROOT_GROUP_NAME)) {
      return [{ name: ROOT_GROUP_NAME, order: -1, status: 'none', items: [] } as BaseGroup, ...groups];
    }
    // Always put __root__ first
    const root = groups.find(g => g.name === ROOT_GROUP_NAME)!;
    const rest = groups.filter(g => g.name !== ROOT_GROUP_NAME);
    return [root, ...rest];
  }, [activeBase?.groups]);
  const stats = useMemo(() => computeStats(currentGroups), [currentGroups]);

  // ── DB Sync (checklist) ──

  const pushToDB = useCallback(async () => {
    setSyncing(true);
    try {
      await api.put(`/analyst-checklist/${CHECKLIST_KEY}`, { checkedItems: [...checkedKeys], activeBase: activeBase?.name || '' });
      message.success(`Đã push ${checkedKeys.size} items`);
    } catch { message.warning('Không kết nối được API'); }
    setSyncing(false);
  }, [checkedKeys, activeBase]);

  const pullFromDB = useCallback(async (silent = false) => {
    setSyncing(true);
    try {
      const { data: res } = await api.get(`/analyst-checklist/${CHECKLIST_KEY}`);
      if (res.success && res.data?.checkedItems) {
        setCheckedKeys(prev => { const next = new Set(prev); res.data.checkedItems.forEach((k: string) => next.add(k)); return next; });
        if (!silent) message.success(`Pulled ${res.data.checkedItems.length} items`);
      }
    } catch { if (!silent) message.warning('Không kết nối được API'); }
    setSyncing(false);
  }, []);


  const exportJSON = useCallback(() => {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), checkedItems: [...checkedKeys], activeBase: activeBase?.name || '' }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `analyst-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    URL.revokeObjectURL(url);
  }, [checkedKeys, activeBase]);

  const exportAllSchema = useCallback(() => {
    const exportData = {
      exportedAt: new Date().toISOString(),
      totalBases: bases.length,
      bases: bases.map(b => ({
        name: b.name,
        order: b.order,
        groups: (b.groups || []).map(g => ({
          name: g.name,
          order: g.order,
          status: g.status,
          items: (g.items || []).map(it => ({
            name: it.name,
            type: it.type,
            status: it.status,
            note: it.note,
            description: it.description,
            fields: (it.fields || []).map(f => ({
              name: f.name,
              fieldType: f.fieldType,
              note: f.note,
              options: f.options,
              lookupTable: f.lookupTable,
              lookupField: f.lookupField,
              formula: f.formula,
              isSynced: f.isSynced,
            })),
            views: (it.views || []).map(v => ({
              name: v.name,
              viewType: v.viewType,
              note: v.note,
              filter: v.filter,
              kanbanField: v.kanbanField,
            })),
            workflowNodes: (it.workflowNodes || []).map(n => ({
              id: n.id,
              nodeType: n.nodeType,
              label: n.label,
              triggerType: n.triggerType,
              actionType: n.actionType,
            })),
            syncSource: it.syncSource,
            syncMode: it.syncMode,
          })),
        })),
      })),
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json; charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analyst-all-schema-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    message.success(`Đã export ${bases.length} bases`);
  }, [bases]);

  const exportActiveBaseSchema = useCallback(() => {
    if (!activeBase) return;
    const exportData = {
      exportedAt: new Date().toISOString(),
      base: {
        name: activeBase.name,
        order: activeBase.order,
        groups: (activeBase.groups || []).map(g => ({
          name: g.name,
          order: g.order,
          status: g.status,
          items: (g.items || []).map(it => ({
            name: it.name,
            type: it.type,
            status: it.status,
            note: it.note,
            description: it.description,
            fields: it.fields || [],
            views: it.views || [],
            workflowNodes: it.workflowNodes || [],
            automationSteps: it.automationSteps || [],
            dashboardWidgets: it.dashboardWidgets || [],
            syncSource: it.syncSource,
            syncMode: it.syncMode,
          })),
        })),
      },
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json; charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = activeBase.name.replace(/[^a-zA-Z0-9\u00C0-\u1EF9 _-]/g, '').trim();
    a.download = `${safeName}-schema-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    message.success(`Đã export schema "${activeBase.name}"`);
  }, [activeBase]);

  // ═══ CRUD: Bases ═══

  const openBaseModal = (base?: AnalystBase) => {
    setEditingBase(base || null);
    baseForm.setFieldsValue(base ? { name: base.name } : { name: '' });
    setBaseModalOpen(true);
  };

  const handleBaseSave = async () => {
    try {
      const values = await baseForm.validateFields();
      setSaving(true);
      if (editingBase) {
        await api.put(`/analyst-bases/${editingBase._id}`, { name: values.name });
      } else {
        await api.post('/analyst-bases', { name: values.name, order: bases.length });
      }
      message.success(editingBase ? 'Đã cập nhật' : 'Đã tạo base mới');
      setBaseModalOpen(false);
      await loadBases(false);
    } catch (e: unknown) { if (e instanceof Error) message.error(e.message); }
    finally { setSaving(false); }
  };

  const handleBaseDelete = async (id: string) => {
    try {
      await api.delete(`/analyst-bases/${id}`);
      if (activeBaseId === id) {
        const remaining = bases.filter(b => b._id !== id);
        setActiveBaseId(remaining.length > 0 ? remaining[0]._id : '');
      }
      await loadBases(false);
      message.success('Đã xoá');
    } catch { message.error('Xoá thất bại'); }
  };

  // ═══ CRUD: Groups ═══

  const saveCurrentBase = async (groups: BaseGroup[]) => {
    if (!activeBase) return;
    try {
      const { data: res } = await api.put(`/analyst-bases/${activeBase._id}`, { groups });
      if (res.success) setBases(prev => prev.map(b => b._id === activeBase._id ? { ...b, groups: res.data.groups } : b));
    } catch { message.error('Lưu thất bại'); }
  };

  const openGroupModal = (groupIdx?: number) => {
    if (groupIdx !== undefined) {
      const group = currentGroups[groupIdx];
      setEditingGroup({ groupIdx, group });
      groupForm.setFieldsValue({ name: group.name });
    } else {
      setEditingGroup(null);
      groupForm.setFieldsValue({ name: '' });
    }
    setGroupModalOpen(true);
  };

  const handleGroupSave = async () => {
    try {
      const values = await groupForm.validateFields();
      setSaving(true);
      const newGroups = [...currentGroups];
      if (editingGroup) {
        newGroups[editingGroup.groupIdx] = { ...newGroups[editingGroup.groupIdx], name: values.name };
      } else {
        newGroups.push({ name: values.name, order: newGroups.length, status: 'none', items: [] });
      }
      await saveCurrentBase(newGroups);
      message.success(editingGroup ? 'Đã cập nhật group' : 'Đã thêm group');
      setGroupModalOpen(false);
    } catch (e: unknown) { if (e instanceof Error) message.error(e.message); }
    finally { setSaving(false); }
  };

  const handleGroupDelete = async (groupIdx: number) => {
    if (currentGroups[groupIdx]?.name === ROOT_GROUP_NAME) return;
    const newGroups = currentGroups.filter((_, i) => i !== groupIdx);
    await saveCurrentBase(newGroups);
    message.success('Đã xoá group');
  };

  // ═══ CRUD: Items ═══

  const openItemModal = (groupIdx: number, itemIdx?: number) => {
    setAddItemGroupIdx(groupIdx);
    if (itemIdx !== undefined) {
      const item = currentGroups[groupIdx].items[itemIdx];
      setEditingItem({ groupIdx, itemIdx, item });
    } else {
      setEditingItem(null);
    }
    setItemModalOpen(true);
  };

  const handleItemSave = async (data: Partial<BaseItem>) => {
    const newGroups = currentGroups.map(g => ({ ...g, items: [...g.items] }));
    const itemData = {
      ...data, order: 0,
      syncSource: data.syncSource || '', syncMode: data.syncMode || 'readonly',
      syncType: data.syncType || 'lark', syncInterval: data.syncInterval || '',
      workflowNodes: data.workflowNodes || [], automationSteps: data.automationSteps || [],
      dashboardWidgets: data.dashboardWidgets || [],
    } as BaseItem;
    if (editingItem) {
      itemData.order = editingItem.item.order;
      newGroups[editingItem.groupIdx].items[editingItem.itemIdx] = itemData;
    } else {
      itemData.order = newGroups[addItemGroupIdx].items.length;
      newGroups[addItemGroupIdx].items.push(itemData);
    }
    await saveCurrentBase(newGroups);
    message.success(editingItem ? 'Đã cập nhật' : 'Đã thêm item');
    setItemModalOpen(false);
  };

  const handleItemDelete = async (groupIdx: number, itemIdx: number) => {
    const newGroups = currentGroups.map(g => ({ ...g, items: [...g.items] }));
    newGroups[groupIdx].items.splice(itemIdx, 1);
    await saveCurrentBase(newGroups);
    message.success('Đã xoá item');
  };

  // Collect all known field types for the item modal
  const allFieldTypes = useMemo(() => {
    const set = new Set(FIELD_TYPES);
    for (const b of bases) for (const g of b.groups) for (const it of g.items) for (const f of it.fields) if (f.fieldType) set.add(f.fieldType);
    return [...set].sort();
  }, [bases]);

  // ── Filtered items ──

  const filteredItems = useMemo(() => {
    let items = currentGroups.flatMap(g => g.items);
    if (filterType !== 'all') items = items.filter(i => i.type.startsWith(filterType));
    if (searchText) { const q = searchText.toLowerCase(); items = items.filter(i => i.name.toLowerCase().includes(q)); }
    return items;
  }, [currentGroups, filterType, searchText]);

  // ── Stable callbacks for tree (memoized to prevent tree re-render) ──
  const stableToggleCheck = useCallback((key: string) => {
    setCheckedKeys(prev => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  }, []);
  const stableOpenItem = useCallback((groupIdx: number, itemIdx?: number) => openItemModal(groupIdx, itemIdx), [currentGroups]);
  const stableOpenGroup = useCallback((groupIdx?: number) => openGroupModal(groupIdx), [currentGroups]);
  const stableDeleteGroup = useCallback((groupIdx: number) => handleGroupDelete(groupIdx), [currentGroups, activeBase]);
  const stableDeleteItem = useCallback((groupIdx: number, itemIdx: number) => handleItemDelete(groupIdx, itemIdx), [currentGroups, activeBase]);
  const stableCopyItem = useCallback((name: string) => { navigator.clipboard.writeText(name); message.success(`Copied: ${name}`); }, []);
  const stableStatusChange = useCallback(async (groupIdx: number, itemIdx: number | null, status: string) => {
    if (!activeBase) return;
    const newGroups = currentGroups.map(g => ({ ...g, items: [...g.items] }));
    if (itemIdx === null) {
      newGroups[groupIdx] = { ...newGroups[groupIdx], status };
    } else {
      newGroups[groupIdx].items[itemIdx] = { ...newGroups[groupIdx].items[itemIdx], status };
    }
    await saveCurrentBase(newGroups);
  }, [currentGroups, activeBase]);

  const stableMoveItem = useCallback(async (fromGroupIdx: number, itemIdx: number, toGroupIdx: number) => {
    if (!activeBase || fromGroupIdx === toGroupIdx) return;
    const newGroups = currentGroups.map(g => ({ ...g, items: [...g.items] }));
    const [movedItem] = newGroups[fromGroupIdx].items.splice(itemIdx, 1);
    movedItem.order = newGroups[toGroupIdx].items.length;
    newGroups[toGroupIdx].items.push(movedItem);
    await saveCurrentBase(newGroups);
    const toName = newGroups[toGroupIdx].name === ROOT_GROUP_NAME ? 'ungrouped' : newGroups[toGroupIdx].name;
    message.success(`Đã chuyển "${movedItem.name}" → ${toName}`);
  }, [currentGroups, activeBase]);

  // ── Inline stats summary ──
  const statsSummary = useMemo(() => {
    const parts: string[] = [];
    if (stats.bases) parts.push(`${stats.bases} tables`);
    if (stats.synced) parts.push(`${stats.synced} synced`);
    if (stats.views) parts.push(`${stats.views} views`);
    if (stats.workflows) parts.push(`${stats.workflows} workflows`);
    if (stats.automations) parts.push(`${stats.automations} automations`);
    if (stats.dashboards) parts.push(`${stats.dashboards} analytics`);
    return `${stats.total} items — ${parts.join(', ')}`;
  }, [stats]);

  // ── Global stats across all bases ──
  const globalStats = useMemo(() => {
    let totalItems = 0, totalFields = 0, totalViews = 0, totalWf = 0, totalAuto = 0, totalDash = 0;
    let totalBases = 0, totalSynced = 0, totalGroups = 0;
    const statusCounts: Record<string, number> = { none: 0, analyzing: 0, done: 0, needUpdate: 0 };
    for (const base of bases) {
      for (const g of (base.groups || [])) {
        if (g.name !== ROOT_GROUP_NAME) totalGroups++;
        for (const it of g.items) {
          totalItems++;
          const t = it.type.replace('-stop', '');
          if (t === 'base') { totalBases++; totalFields += it.fields?.length || 0; totalViews += it.views?.length || 0; }
          if (t === 'base-sync') { totalSynced++; totalFields += it.fields?.length || 0; totalViews += it.views?.length || 0; }
          if (t === 'workflow') totalWf++;
          if (t === 'automation') totalAuto++;
          if (t === 'dashboard' || t === 'form-analytics') totalDash++;
          if (it.status && statusCounts[it.status] !== undefined) statusCounts[it.status]++;
        }
      }
    }
    return { totalItems, totalFields, totalViews, totalWf, totalAuto, totalDash, totalBases, totalSynced, totalGroups, statusCounts, basesCount: bases.length };
  }, [bases]);

  // ── Tab items for base selector ──
  const tabItems = useMemo(() => {
    return bases.map(base => {
      const s = computeStats(base.groups);
      return {
        key: base._id,
        label: (
          <span style={{ fontSize: 13 }}>
            {base.name}
            <Text type="secondary" style={{ fontSize: 11, marginLeft: 6 }}>{s.total}</Text>
          </span>
        ),
      };
    });
  }, [bases]);

  if (loading) return <Card loading style={{ margin: 24 }} />;

  return (
    <div style={{ padding: '16px 24px' }}>
      {/* ── Header bar ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Text strong style={{ fontSize: 18 }}><DatabaseOutlined /> Analyst Manual</Text>
          {checkedKeys.size > 0 && (
            <Tag color="processing">{checkedKeys.size} checked</Tag>
          )}
        </div>
        <Space size={4}>
          <Button icon={<PieChartOutlined />} onClick={() => setShowStats(v => !v)} size="small"
            type={showStats ? 'primary' : 'default'} />
          <Button icon={<ApartmentOutlined />} onClick={() => setShowGraph(v => !v)} size="small"
            type={showGraph ? 'primary' : 'default'} />
          <Button icon={<HistoryOutlined />} size="small"
            onClick={async () => {
                setShowHistory(true);
                if (activeBase) {
                  try {
                    const [{ data: c }, { data: d }] = await Promise.all([
                      api.get(`/analyst-bases/${activeBase._id}/commits`),
                      api.get(`/analyst-bases/${activeBase._id}/diff`),
                    ]);
                    if (c.success) setCommits(c.data);
                    if (d.success) setDiffData(d.data);
                  } catch {}
                }
              }} />
          <Button icon={<PlusOutlined />} onClick={() => openBaseModal()} size="small" />
          <Dropdown menu={{
            items: [
              { key: 'pull', icon: <CloudDownloadOutlined />, label: 'Pull từ DB', onClick: () => pullFromDB() },
              { key: 'push', icon: <CloudUploadOutlined />, label: 'Push lên DB', onClick: pushToDB },
              { type: 'divider' },
              { key: 'export-all', icon: <ExportOutlined />, label: 'Export toàn bộ Schema (JSON)', onClick: exportAllSchema },
              { key: 'export-active', icon: <ExportOutlined />, label: `Export "${activeBase?.name || 'base'}" (JSON)`, disabled: !activeBase, onClick: exportActiveBaseSchema },
              { key: 'export-checked', icon: <ExportOutlined />, label: 'Export checked items', onClick: exportJSON, disabled: checkedKeys.size === 0 },
              { type: 'divider' },
              { key: 'copy', icon: <CopyOutlined />, label: 'Copy checked', disabled: checkedKeys.size === 0, onClick: () => {
                const lines = [...checkedKeys].map(k => { const [, n, g] = k.split('::'); return `${n} — ${g}`; });
                navigator.clipboard.writeText(lines.join('\n')); message.success(`Copied ${lines.length} items`);
              }},
              { type: 'divider' },
              { key: 'clear', icon: <DeleteOutlined />, label: 'Xoá tất cả checked', danger: true, disabled: checkedKeys.size === 0,
                onClick: () => { setCheckedKeys(new Set()); message.info('Đã xoá'); }},
            ],
          }} trigger={['click']}>
            <Button icon={<MoreOutlined />} size="small" loading={syncing} />
          </Dropdown>
          <Button icon={<QuestionCircleOutlined />} size="small" type="text"
            onClick={() => setShowInfo(true)} style={{ color: 'var(--text-tertiary)' }} />
        </Space>
      </div>

      {/* ── Base tabs ── */}
      <Tabs
        activeKey={activeBaseId}
        onChange={setActiveBaseId}
        items={tabItems}
        size="small"
        type="card"
        style={{ marginBottom: 0 }}
        tabBarExtraContent={activeBase && (
          <Space size={4} style={{ marginRight: 8 }}>
              <Button type="text" size="small" icon={<FileSearchOutlined />}
                onClick={async () => {
                  if (!activeBase) return;
                  try {
                    const baBases = await listBaBases();
                    const matched = baBases.find(b => activeBase.name.includes(b.name) || b.name.includes(activeBase.name));
                    if (!matched) {
                      message.warning('Không tìm thấy base tương ứng trong BA Docs. Hãy tạo base trước tại /ba/bases');
                      return;
                    }
                    Modal.confirm({
                      title: `Sinh đặc tả cho "${activeBase.name}"`,
                      content: (
                        <div>
                          <p>Push 5 files markdown vào BA Docs:</p>
                          <ul style={{ fontSize: 12 }}>
                            <li><code>specs/README.md</code> — Tổng quan</li>
                            <li><code>specs/fields.md</code> — Cấu trúc trường</li>
                            <li><code>specs/views.md</code> — Views config</li>
                            <li><code>specs/workflows.md</code> — Workflows & Automations</li>
                            <li><code>specs/relationships.md</code> — Mối liên kết</li>
                          </ul>
                          <p>Target: <strong>{matched.name}</strong> ({matched._id})</p>
                        </div>
                      ),
                      okText: 'Sinh đặc tả',
                      onOk: async () => {
                        try {
                          const { data: res } = await api.post(`/analyst-bases/${activeBase._id}/generate-docs`, {
                            targetBaseId: matched._id,
                            author: 'Analyst',
                          });
                          if (res.success) {
                            message.success(`Đã sinh ${res.data.filesCreated} files → BA Docs`);
                            window.open(`/ba/docs?base=${encodeURIComponent(matched.name)}`, '_blank');
                          }
                        } catch (err) { message.error('Sinh đặc tả thất bại: ' + (err instanceof Error ? err.message : 'lỗi')); }
                      },
                    });
                  } catch { message.error('Không tải được danh sách BA Bases'); }
                }} />
              <Button type="text" size="small" icon={<CloudUploadOutlined />}
                onClick={() => {
                const input = document.createElement('input');
                input.type = 'file'; input.accept = '.json';
                input.onchange = async (e) => {
                  const file = (e.target as HTMLInputElement).files?.[0];
                  if (!file) return;
                  try {
                    const text = await file.text();
                    const schema = JSON.parse(text);
                    const { data: res } = await api.post(`/analyst-bases/${activeBase._id}/import-schema`, { schema });
                    if (res.success) {
                      message.success(`Imported ${res.data.imported} fields từ ${res.data.tablesProcessed} tables`);
                      await loadBases(false);
                    }
                  } catch (err) { message.error('Import thất bại: ' + (err instanceof Error ? err.message : 'lỗi')); }
                };
                input.click();
              }} />
              <Button type="text" size="small" icon={<ExportOutlined />}
                onClick={exportActiveBaseSchema} />
              <Button type="text" size="small" icon={<EditOutlined />}
                onClick={() => openBaseModal(activeBase)} />
            <Popconfirm title={`Xoá "${activeBase.name}"?`} onConfirm={() => handleBaseDelete(activeBase._id)}>
                <Button type="text" size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space>
        )}
      />

      {/* ── Toolbar: search + filter (hidden when graph shown) ── */}
      {!showGraph && (
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '10px 0', gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
            <Search
              placeholder="Tìm kiếm..."
              allowClear
              size="small"
              style={{ maxWidth: 260 }}
              prefix={<SearchOutlined />}
              onChange={(e) => setSearchText(e.target.value)}
            />
            <Segmented
              size="small"
              value={filterType}
              onChange={(v) => setFilterType(v as string)}
              options={[
                { label: 'All', value: 'all' },
                { label: 'Base', value: 'base' },
                { label: 'Sync', value: 'base-sync' },
                { label: 'View', value: 'view' },
                { label: 'Analytics', value: 'form-analytics' },
                { label: 'WF', value: 'workflow' },
                { label: 'Auto', value: 'automation' },
              ]}
            />
          </div>
          <Text type="secondary" style={{ fontSize: 12, flexShrink: 0 }}>{statsSummary}</Text>
        </div>
      )}

      {/* ── Stats overview ── */}
      {showStats && (
        <div style={{ marginBottom: 16 }}>
          <Card size="small" title={<><PieChartOutlined /> Thống kê tổng quan</>}
            extra={<Button size="small" type="text" onClick={() => setShowStats(false)}>Đóng</Button>}>
            <Row gutter={[12, 12]}>
              {[
                { label: 'Bases', value: globalStats.basesCount, color: '#6366f1', icon: <DatabaseOutlined /> },
                { label: 'Tables', value: globalStats.totalBases, color: '#1677ff', icon: <DatabaseOutlined /> },
                { label: 'Synced', value: globalStats.totalSynced, color: '#fa8c16', icon: <SyncOutlined /> },
                { label: 'Fields', value: globalStats.totalFields, color: '#52c41a', icon: <FileTextOutlined /> },
                { label: 'Views', value: globalStats.totalViews, color: '#13c2c2', icon: <EyeOutlined /> },
                { label: 'Workflows', value: globalStats.totalWf, color: '#8b5cf6', icon: <ThunderboltOutlined /> },
                { label: 'Automations', value: globalStats.totalAuto, color: '#10b981', icon: <SettingOutlined /> },
                { label: 'Analytics', value: globalStats.totalDash, color: '#ef4444', icon: <BarChartOutlined /> },
                { label: 'Groups', value: globalStats.totalGroups, color: '#f59e0b', icon: <FolderOutlined /> },
                { label: 'Tổng items', value: globalStats.totalItems, color: '#6366f1', icon: <DatabaseOutlined /> },
              ].map((s, i) => (
                <Col key={i} xs={12} sm={8} md={6} lg={4}>
                  <div style={{
                    padding: '10px 14px', borderRadius: 8,
                    border: '1px solid var(--border-color)', background: 'var(--bg-secondary)',
                    display: 'flex', alignItems: 'center', gap: 10,
                  }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: s.color + '15', color: s.color, fontSize: 16,
                    }}>{s.icon}</div>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: s.color, lineHeight: 1.2 }}>{s.value}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{s.label}</div>
                    </div>
                  </div>
                </Col>
              ))}
            </Row>
            {/* Per-base breakdown */}
            <div style={{ marginTop: 12 }}>
              <Text strong style={{ fontSize: 12 }}>Theo từng base:</Text>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
                {bases.map(base => {
                  const s = computeStats(base.groups);
                  return (
                    <div key={base._id} style={{
                      padding: '6px 12px', borderRadius: 6, fontSize: 11,
                      border: '1px solid var(--border-color)', background: base._id === activeBaseId ? 'var(--accent-color)10' : 'var(--bg-color)',
                      cursor: 'pointer',
                    }} onClick={() => setActiveBaseId(base._id)}>
                      <div style={{ fontWeight: 600, marginBottom: 2 }}>{base.name}</div>
                      <Space size={4} wrap>
                        {s.bases > 0 && <Tag color="blue" style={{ fontSize: 9, margin: 0 }}>{s.bases} tbl</Tag>}
                        {s.synced > 0 && <Tag color="orange" style={{ fontSize: 9, margin: 0 }}>{s.synced} sync</Tag>}
                        {s.views > 0 && <Tag color="cyan" style={{ fontSize: 9, margin: 0 }}>{s.views} view</Tag>}
                        {s.workflows > 0 && <Tag color="purple" style={{ fontSize: 9, margin: 0 }}>{s.workflows} wf</Tag>}
                        {s.automations > 0 && <Tag color="green" style={{ fontSize: 9, margin: 0 }}>{s.automations} auto</Tag>}
                      </Space>
                    </div>
                  );
                })}
              </div>
            </div>
            {/* Status distribution */}
            <div style={{ marginTop: 12 }}>
              <Text strong style={{ fontSize: 12 }}>Trạng thái phân tích:</Text>
              <div style={{ display: 'flex', gap: 16, marginTop: 6 }}>
                {ANALYSIS_STATUSES.map(s => (
                  <div key={s.value} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {STATUS_ICONS[s.value]}
                    <span style={{ fontSize: 12 }}>{s.label}: <strong>{globalStats.statusCounts[s.value] || 0}</strong></span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* ── Graph view ── */}
      {showGraph && (
        <div style={{ marginBottom: 16, position: 'relative' }}>
          <RelationshipGraph bases={bases} activeBaseId={activeBaseId} onSelectBase={(id) => setActiveBaseId(id)} />
        </div>
      )}

      {/* ── Main: Tree ── */}
      {!showGraph && <Card
        size="small"
        styles={{ body: { padding: '4px 0', maxHeight: 'calc(100vh - 240px)', overflow: 'auto' } }}
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text strong style={{ fontSize: 13 }}>{activeBase?.name || '—'} <Text type="secondary">({filteredItems.length})</Text></Text>
            <Space size={6}>
              <Dropdown menu={{
                items: [
                  { key: 'root', label: '＋ Thêm item (ungrouped)', style: { fontWeight: 600 },
                    onClick: () => {
                      const rootIdx = currentGroups.findIndex(g => g.name === ROOT_GROUP_NAME);
                      if (rootIdx >= 0) openItemModal(rootIdx);
                    }
                  },
                  { type: 'divider' as const },
                  ...currentGroups.filter(g => g.name !== ROOT_GROUP_NAME).map((g, i) => {
                    const actualIdx = currentGroups.findIndex(gr => gr === g);
                    return { key: String(i), label: `→ Thêm vào "${g.name}"`, onClick: () => openItemModal(actualIdx) };
                  }),
                ],
              }} trigger={['click']}>
                <Button size="small" type="primary" icon={<PlusOutlined />}>Item</Button>
              </Dropdown>
              <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={() => openGroupModal()}>Group</Button>
            </Space>
          </div>
        }
      >
        {!activeBase ? (
          <Empty description="Chọn hoặc tạo base" style={{ padding: 40 }} />
        ) : (
          <AnalystTree
            groups={currentGroups}
            activeBaseName={activeBase.name}
            checkedKeys={checkedKeys}
            filterType={filterType}
            searchText={searchText}
            onToggleCheck={stableToggleCheck}
            onOpenItem={stableOpenItem}
            onOpenGroup={stableOpenGroup}
            onDeleteGroup={stableDeleteGroup}
            onDeleteItem={stableDeleteItem}
            onCopyItem={stableCopyItem}
            onStatusChange={stableStatusChange}
            onMoveItem={stableMoveItem}
          />
        )}
      </Card>}

      {/* ═══ Modals ═══ */}

      {/* Base modal */}
      <Modal
        open={baseModalOpen}
        title={editingBase ? 'Sửa Base' : 'Thêm Base mới'}
        onCancel={() => { setBaseModalOpen(false); baseForm.resetFields(); }}
        onOk={handleBaseSave}
        okText={editingBase ? 'Cập nhật' : 'Tạo'}
        confirmLoading={saving}
        width={400}
        destroyOnClose
      >
        <Form form={baseForm} layout="vertical">
          <Form.Item name="name" label="Tên Base" rules={[{ required: true, message: 'Nhập tên base' }]}>
            <Input placeholder="VD: HN - Kho Trung Quốc" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Group modal */}
      <Modal
        open={groupModalOpen}
        title={editingGroup ? 'Sửa Group' : 'Thêm Group mới'}
        onCancel={() => { setGroupModalOpen(false); groupForm.resetFields(); }}
        onOk={handleGroupSave}
        okText={editingGroup ? 'Cập nhật' : 'Thêm'}
        confirmLoading={saving}
        width={400}
        destroyOnClose
      >
        <Form form={groupForm} layout="vertical">
          <Form.Item name="name" label="Tên Group" rules={[{ required: true, message: 'Nhập tên group' }]}>
            <Input placeholder="VD: 2. Look Up Dữ Liệu" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Item modal — isolated component to prevent parent re-renders */}
      <ItemEditModal
        open={itemModalOpen}
        editingItem={editingItem}
        allFieldTypes={allFieldTypes}
        siblingItems={(() => {
          const gIdx = editingItem?.groupIdx ?? addItemGroupIdx;
          const group = currentGroups[gIdx];
          if (!group) return [];
          return group.items
            .filter(it => it.type === 'base' || it.type === 'base-sync')
            .map(it => ({ name: it.name, fields: (it.fields || []).map(f => f.name).filter(Boolean), fullFields: it.fields || [] }));
        })()}
        onSave={handleItemSave}
        onCancel={() => setItemModalOpen(false)}
      />

      {/* ── Info modal ── */}
      <Modal
        open={showInfo}
        title={<><QuestionCircleOutlined /> Hướng dẫn Analyst Manual</>}
        onCancel={() => setShowInfo(false)}
        footer={null}
        width={600}
      >
        <div style={{ fontSize: 13, lineHeight: 1.8 }}>
          <Text strong style={{ fontSize: 14, display: 'block', marginBottom: 8 }}>Thanh công cụ chính</Text>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
            {[
              { icon: <PieChartOutlined />, label: 'Thống kê', desc: 'Xem thống kê tổng quan tất cả bases: số tables, fields, views, workflows, automations, trạng thái phân tích' },
              { icon: <ApartmentOutlined />, label: 'Biểu đồ quan hệ', desc: 'Hiển thị biểu đồ quan hệ giữa các bảng, workflows, automations. Hỗ trợ export hình ảnh PNG chất lượng cao' },
              { icon: <HistoryOutlined />, label: 'Lịch sử', desc: 'Xem lịch sử thay đổi (commits & diff), revert về phiên bản trước' },
              { icon: <PlusOutlined />, label: 'Thêm base', desc: 'Tạo một base mới để phân tích' },
              { icon: <MoreOutlined />, label: 'Tuỳ chọn', desc: 'Pull/Push DB, Export schema JSON (toàn bộ hoặc từng base), Copy checked items, Xoá checked' },
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '6px 10px', borderRadius: 6, background: 'var(--bg-secondary)' }}>
                <span style={{ fontSize: 16, color: 'var(--accent-color)', flexShrink: 0, marginTop: 2 }}>{item.icon}</span>
                <div><Text strong>{item.label}</Text> — {item.desc}</div>
              </div>
            ))}
          </div>

          <Text strong style={{ fontSize: 14, display: 'block', marginBottom: 8 }}>Nút trên thanh Tab base</Text>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
            {[
              { icon: <FileSearchOutlined />, label: 'Sinh đặc tả', desc: 'Push 5 files markdown (tổng quan, fields, views, workflows, relationships) vào BA Docs' },
              { icon: <CloudUploadOutlined />, label: 'Import schema', desc: 'Import cấu trúc từ file JSON vào base hiện tại' },
              { icon: <ExportOutlined />, label: 'Export schema', desc: 'Export schema base hiện tại ra file JSON' },
              { icon: <EditOutlined />, label: 'Sửa base', desc: 'Đổi tên, thứ tự base' },
              { icon: <DeleteOutlined style={{ color: '#ff4d4f' }} />, label: 'Xoá base', desc: 'Xoá base (yêu cầu xác nhận)' },
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '6px 10px', borderRadius: 6, background: 'var(--bg-secondary)' }}>
                <span style={{ fontSize: 16, color: 'var(--accent-color)', flexShrink: 0, marginTop: 2 }}>{item.icon}</span>
                <div><Text strong>{item.label}</Text> — {item.desc}</div>
              </div>
            ))}
          </div>

          <Text strong style={{ fontSize: 14, display: 'block', marginBottom: 8 }}>Loại items</Text>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            {[
              { type: 'base', desc: 'Bảng dữ liệu chính' },
              { type: 'base-sync', desc: 'Bảng đồng bộ (1 chiều)' },
              { type: 'view', desc: 'View hiển thị' },
              { type: 'form-analytics', desc: 'Biểu mẫu / Phân tích' },
              { type: 'workflow', desc: 'Quy trình tự động' },
              { type: 'automation', desc: 'Tự động hoá' },
              { type: 'dashboard', desc: 'Bảng tổng hợp' },
            ].map((item) => (
              <div key={item.type} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 6, background: 'var(--bg-secondary)', fontSize: 12 }}>
                <span>{TYPE_ICONS[item.type]}</span>
                <Tag color={TYPE_COLORS[item.type]} style={{ fontSize: 10, margin: 0 }}>{item.type}</Tag>
                <span>{item.desc}</span>
              </div>
            ))}
          </div>

          <Text strong style={{ fontSize: 14, display: 'block', marginBottom: 8 }}>Trạng thái phân tích</Text>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {ANALYSIS_STATUSES.map(s => (
              <div key={s.value} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 6, background: 'var(--bg-secondary)', fontSize: 12 }}>
                {STATUS_ICONS[s.value]} <Tag color={s.color} style={{ fontSize: 10, margin: 0 }}>{s.label}</Tag>
              </div>
            ))}
          </div>

          <Text strong style={{ fontSize: 14, display: 'block', marginBottom: 8, marginTop: 16 }}>Biểu đồ quan hệ — Chú thích</Text>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 12 }}>
            <span><span style={{ color: '#6366f1' }}>■</span> Base table</span>
            <span><span style={{ color: '#fa8c16' }}>■</span> Synced table</span>
            <span><span style={{ color: '#8b5cf6' }}>■</span> Workflow</span>
            <span><span style={{ color: '#10b981' }}>■</span> Automation</span>
            <span><span style={{ color: '#6366f1' }}>→</span> Lookup link</span>
            <span><span style={{ color: '#ec4899' }}>→</span> Cross-base link</span>
            <span><span style={{ color: '#fa8c16' }}>→</span> Sync link</span>
            <span><span style={{ color: '#8b5cf6' }}>⇢</span> Workflow → table</span>
            <span><span style={{ color: '#10b981' }}>⇢</span> Automation → table</span>
          </div>
        </div>
      </Modal>

      {/* History drawer */}
      <Drawer open={showHistory} onClose={() => setShowHistory(false)}
        title={<Space><HistoryOutlined /> Commits — {activeBase?.name || ''}</Space>} width={440}>

        {/* ── Uncommitted changes ── */}
        {diffData && (
          <Card size="small" style={{
            marginBottom: 16,
            borderLeft: `3px solid ${diffData.hasChanges ? 'var(--accent-color)' : '#52c41a'}`,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <Text strong style={{ fontSize: 13 }}>
                {diffData.hasChanges ? `${diffData.changes.length} thay đổi chưa commit` : 'Đã đồng bộ'}
              </Text>
              {diffData.hasChanges && (
                <Space size={4}>
                  <Tag color="green">{diffData.changes.filter(c => c.action === 'add').length} thêm</Tag>
                  <Tag color="blue">{diffData.changes.filter(c => c.action === 'edit').length} sửa</Tag>
                  <Tag color="red">{diffData.changes.filter(c => c.action === 'delete').length} xoá</Tag>
                </Space>
              )}
            </div>
            {diffData.lastCommit && (
              <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 6 }}>
                So với: "{diffData.lastCommit.message}" · {new Date(diffData.lastCommit.createdAt).toLocaleDateString('vi')}
              </Text>
            )}
            {!diffData.lastCommit && diffData.hasChanges && (
              <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 6 }}>Chưa có commit nào — đây sẽ là commit đầu tiên</Text>
            )}
            {diffData.hasChanges && (
              <>
                <div style={{ maxHeight: 200, overflow: 'auto', marginBottom: 8, padding: '6px 0' }}>
                  {diffData.changes.map((ch, i) => {
                    const isGroup = ch.target.startsWith('group:');
                    return (
                      <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginBottom: 3, fontSize: 12 }}>
                        <span style={{
                          width: 16, textAlign: 'center', fontWeight: 700, flexShrink: 0,
                          color: ch.action === 'add' ? '#52c41a' : ch.action === 'delete' ? '#ff4d4f' : '#1677ff',
                        }}>
                          {ch.action === 'add' ? '+' : ch.action === 'delete' ? '−' : '~'}
                        </span>
                        <span style={{ fontWeight: isGroup ? 600 : 400 }}>{ch.detail}</span>
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <Input size="small" placeholder="Commit message..." value={commitMsg}
                    onChange={e => setCommitMsg(e.target.value)} style={{ flex: 1 }}
                    onPressEnter={async () => {
                      if (!activeBase || !commitMsg.trim()) return;
                      setCommitting(true);
                      try {
                        await api.post(`/analyst-bases/${activeBase._id}/commit`, { message: commitMsg, author: '' });
                        message.success('Committed');
                        setCommitMsg('');
                        const [{ data: c }, { data: d }] = await Promise.all([
                          api.get(`/analyst-bases/${activeBase._id}/commits`),
                          api.get(`/analyst-bases/${activeBase._id}/diff`),
                        ]);
                        if (c.success) setCommits(c.data);
                        if (d.success) setDiffData(d.data);
                      } catch { message.error('Commit failed'); }
                      setCommitting(false);
                    }} />
                  <Button size="small" type="primary" icon={<SaveOutlined />} loading={committing}
                    disabled={!commitMsg.trim()}
                    onClick={async () => {
                      if (!activeBase || !commitMsg.trim()) return;
                      setCommitting(true);
                      try {
                        await api.post(`/analyst-bases/${activeBase._id}/commit`, { message: commitMsg, author: '' });
                        message.success('Committed');
                        setCommitMsg('');
                        const [{ data: c }, { data: d }] = await Promise.all([
                          api.get(`/analyst-bases/${activeBase._id}/commits`),
                          api.get(`/analyst-bases/${activeBase._id}/diff`),
                        ]);
                        if (c.success) setCommits(c.data);
                        if (d.success) setDiffData(d.data);
                      } catch { message.error('Commit failed'); }
                      setCommitting(false);
                    }}>Commit</Button>
                </div>
              </>
            )}
          </Card>
        )}

        {/* ── Commit log ── */}
        <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>
          <HistoryOutlined /> Lịch sử ({commits.length} commits)
        </Text>
        {commits.length === 0 ? (
          <Empty description="Chưa có commit" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {commits.map((c, ci) => {
              const isExpanded = expandedCommit?.id === c._id;
              return (
              <div key={c._id} style={{ display: 'flex', gap: 10 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 20 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: ci === 0 ? 'var(--accent-color)' : 'var(--border-color)', border: '2px solid var(--bg-color)', flexShrink: 0 }} />
                  {ci < commits.length - 1 && <div style={{ width: 2, flex: 1, background: 'var(--border-color)' }} />}
                </div>
                <div style={{ flex: 1, paddingBottom: 14 }}>
                  {/* Header — clickable */}
                  <div style={{ cursor: 'pointer' }} onClick={async () => {
                    if (isExpanded) { setExpandedCommit(null); return; }
                    try {
                      const { data: res } = await api.get(`/analyst-bases/commits/${c._id}`);
                      if (res.success) setExpandedCommit({ id: c._id, detail: res.data.detailedDiff || [] });
                    } catch {}
                  }}>
                    <Text strong style={{ fontSize: 13 }}>{c.message} <Text type="secondary" style={{ fontSize: 10, fontWeight: 400 }}>{isExpanded ? '▼' : '▸'}</Text></Text>
                  </div>
                  <Space size={4} wrap style={{ marginTop: 2 }}>
                    <Text type="secondary" style={{ fontSize: 11 }}>{new Date(c.createdAt).toLocaleString('vi')}</Text>
                    {c.author && <Tag style={{ fontSize: 9, margin: 0 }}>{c.author}</Tag>}
                    <Tag color="blue" style={{ fontSize: 9, margin: 0 }}>{c.stats.groups}G {c.stats.items}I {c.stats.fields}F</Tag>
                    <Tag style={{ fontSize: 9, margin: 0 }}>{c.changes.length} changes</Tag>
                  </Space>

                  {/* Summary (always visible) */}
                  {!isExpanded && c.changes.length > 0 && (
                    <div style={{ marginTop: 3 }}>
                      {c.changes.slice(0, 3).map((ch, i) => (
                        <span key={i} style={{ fontSize: 10, marginRight: 6, color: ch.action === 'add' ? '#52c41a' : ch.action === 'delete' ? '#ff4d4f' : '#1677ff' }}>
                          {ch.action === 'add' ? '+' : ch.action === 'delete' ? '−' : '~'}{ch.detail.slice(0, 30)}
                        </span>
                      ))}
                      {c.changes.length > 3 && <Text type="secondary" style={{ fontSize: 10 }}>+{c.changes.length - 3}</Text>}
                    </div>
                  )}

                  {/* Expanded detail */}
                  {isExpanded && expandedCommit && (
                    <div style={{ marginTop: 8, border: '1px solid var(--border-color)', borderRadius: 6, overflow: 'hidden' }}>
                      {/* Detailed diff */}
                      <div style={{ maxHeight: 400, overflow: 'auto', padding: 8, fontSize: 12, fontFamily: 'monospace', background: 'var(--bg-tertiary)' }}>
                        {expandedCommit.detail.map((d: { type: string; action: string; name: string; group?: string; itemType?: string; field?: string; from?: string; to?: string; fields?: { name: string; fieldType: string }[]; changes?: { field: string; from: string; to: string }[]; addedFields?: { name: string; fieldType: string }[]; removedFields?: { name: string; fieldType: string }[]; changedFields?: { name: string; changes: { prop: string; from: string; to: string }[] }[] }, di: number) => {
                          if (d.type === 'group') {
                            return (
                              <div key={di} style={{ marginBottom: 6 }}>
                                <span style={{ color: d.action === 'add' ? '#52c41a' : d.action === 'delete' ? '#ff4d4f' : '#1677ff', fontWeight: 700 }}>
                                  {d.action === 'add' ? '+ ' : d.action === 'delete' ? '- ' : '~ '}
                                </span>
                                <span style={{ fontWeight: 700 }}>Group: {d.name}</span>
                                {d.field && <span style={{ color: 'var(--text-tertiary)' }}> ({d.field}: {d.from} → {d.to})</span>}
                              </div>
                            );
                          }
                          // Item
                          return (
                            <div key={di} style={{ marginBottom: 6, paddingLeft: 12 }}>
                              <div>
                                <span style={{ color: d.action === 'add' ? '#52c41a' : d.action === 'delete' ? '#ff4d4f' : '#1677ff', fontWeight: 700 }}>
                                  {d.action === 'add' ? '+ ' : d.action === 'delete' ? '- ' : '~ '}
                                </span>
                                <span style={{ fontWeight: 600 }}>{d.name}</span>
                                {d.itemType && <span style={{ color: 'var(--text-tertiary)' }}> [{d.itemType}]</span>}
                              </div>
                              {/* Added fields */}
                              {d.addedFields?.map((f, fi) => (
                                <div key={`a${fi}`} style={{ paddingLeft: 16, color: '#52c41a' }}>+ {f.name} ({f.fieldType})</div>
                              ))}
                              {/* Removed fields */}
                              {d.removedFields?.map((f, fi) => (
                                <div key={`r${fi}`} style={{ paddingLeft: 16, color: '#ff4d4f' }}>- {f.name} ({f.fieldType})</div>
                              ))}
                              {/* Changed fields */}
                              {d.changedFields?.map((f, fi) => (
                                <div key={`c${fi}`} style={{ paddingLeft: 16, color: '#1677ff' }}>
                                  ~ {f.name}: {f.changes.map(ch => `${ch.prop}: "${ch.from}" → "${ch.to}"`).join(', ')}
                                </div>
                              ))}
                              {/* Item-level changes */}
                              {d.changes?.map((ch, chi) => (
                                <div key={`ch${chi}`} style={{ paddingLeft: 16, color: '#f59e0b' }}>
                                  ~ {ch.field}: "{ch.from}" → "{ch.to}"
                                </div>
                              ))}
                              {/* New item fields list */}
                              {d.action === 'add' && d.fields && d.fields.length > 0 && (
                                <div style={{ paddingLeft: 16, color: 'var(--text-tertiary)' }}>
                                  {d.fields.slice(0, 5).map((f, fi) => <span key={fi}>{f.name} ({f.fieldType}){fi < Math.min(d.fields!.length, 5) - 1 ? ', ' : ''}</span>)}
                                  {d.fields.length > 5 && <span> +{d.fields.length - 5}</span>}
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {expandedCommit.detail.length === 0 && <Text type="secondary">Không có chi tiết</Text>}
                      </div>
                      {/* Revert button */}
                      <div style={{ padding: '6px 8px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end' }}>
                        <Popconfirm title="Revert về commit này? State hiện tại sẽ được lưu tự động." onConfirm={async () => {
                          if (!activeBase) return;
                          try {
                            await api.post(`/analyst-bases/${activeBase._id}/revert/${c._id}`, {});
                            message.success('Đã revert');
                            await loadBases(false);
                            const [{ data: cc }, { data: dd }] = await Promise.all([
                              api.get(`/analyst-bases/${activeBase._id}/commits`),
                              api.get(`/analyst-bases/${activeBase._id}/diff`),
                            ]);
                            if (cc.success) setCommits(cc.data);
                            if (dd.success) setDiffData(dd.data);
                            setExpandedCommit(null);
                          } catch { message.error('Revert failed'); }
                        }}>
                          <Button size="small" danger>Revert về commit này</Button>
                        </Popconfirm>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              );
            })}
          </div>
        )}
      </Drawer>
    </div>
  );
}
