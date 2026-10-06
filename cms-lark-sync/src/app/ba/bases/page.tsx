'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Card, Table, Button, Modal, Form, Input, Select, Space, Typography,
  Tag, Popconfirm, message, Descriptions, Collapse, Row, Col, TimePicker,
  Switch, Radio, Progress, notification, Upload,
} from 'antd';
import type { TableRowSelection } from 'antd/es/table/interface';
import {
  PlusOutlined, ReloadOutlined, DeleteOutlined, EditOutlined,
  DatabaseOutlined, SearchOutlined, EyeOutlined,
  FieldNumberOutlined, LinkOutlined, FunctionOutlined, DownloadOutlined,
  ThunderboltOutlined, CheckCircleOutlined, CloseCircleOutlined,
  LoadingOutlined, ClockCircleOutlined, ClearOutlined, PictureOutlined, FolderOutlined,
  UploadOutlined, ApartmentOutlined, DiffOutlined,
} from '@ant-design/icons';
import LarkWorkflowBuilder from '@/components/LarkWorkflowBuilder';
import {
  listBases, createBase, updateBase, deleteBase, fetchBaseSchema, triggerAnalysis,
  listLarkApps,
  type BaseReg, type BaseRegCreate, type LarkApp, type SchemaPreview, type AnalysisConfig,
} from '@/lib/baApi';
// heic2any uses `window` at module level — must be dynamically imported
// import heic2any from 'heic2any';

const { Title, Text } = Typography;

/** Read a blob as dataUrl with error handling */
function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = (e) => resolve(e.target?.result as string);
    r.onerror = () => reject(new Error('Không thể đọc file'));
    r.readAsDataURL(blob);
  });
}

/** Convert HEIC/HEIF to JPEG if needed, returns { blob, dataUrl, convertedFile } */
async function convertHeicIfNeeded(file: File): Promise<{ blob: Blob; dataUrl: string; file: File }> {
  const isHeic = /\.(heic|heif)$/i.test(file.name) ||
    file.type === 'image/heic' || file.type === 'image/heif' ||
    (!file.type && /\.(heic|heif)$/i.test(file.name));

  if (isHeic) {
    const heic2any = (await import('heic2any')).default;
    const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 });
    const jpegBlob = Array.isArray(converted) ? converted[0] : converted;
    const newName = file.name.replace(/\.(heic|heif)$/i, '.jpg');
    const jpegFile = new File([jpegBlob], newName, { type: 'image/jpeg' });
    const dataUrl = await readAsDataUrl(jpegBlob);
    return { blob: jpegBlob, dataUrl, file: jpegFile };
  }

  const dataUrl = await readAsDataUrl(file);
  return { blob: file, dataUrl, file };
}

/** Generate a URL-safe slug from text */
function toSlug(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove diacritics
    .replace(/đ/g, 'd').replace(/Đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'image';
}

/** Make slug unique within existing slugs */
function uniqueSlug(base: string, existing: string[]): string {
  if (!existing.includes(base)) return base;
  let i = 2;
  while (existing.includes(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

const FIELD_TYPE_COLORS: Record<string, string> = {
  Text: 'blue', Number: 'green', SingleSelect: 'orange', MultiSelect: 'orange',
  DateTime: 'purple', Checkbox: 'cyan', Person: 'magenta', Phone: 'blue',
  URL: 'geekblue', Attachment: 'volcano', SingleLink: 'gold', Lookup: 'lime',
  Formula: 'red', DuplexLink: 'gold', Location: 'purple', GroupChat: 'magenta',
  CreatedTime: 'default', ModifiedTime: 'default', CreatedBy: 'default',
  ModifiedBy: 'default', AutoNumber: 'default',
};

const SCHEDULE_PRESETS = [
  { label: 'Disabled', value: '' },
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Every 6 hours', value: '0 */6 * * *' },
  { label: 'Daily at 2:00 AM', value: '0 2 * * *' },
  { label: 'Daily at 8:00 AM', value: '0 8 * * *' },
  { label: 'Mon-Fri at 8:00 AM', value: '0 8 * * 1-5' },
  { label: 'Weekly (Sunday 2 AM)', value: '0 2 * * 0' },
  { label: 'Monthly (1st, 2 AM)', value: '0 2 1 * *' },
];

function describeSchedule(cron: string): string {
  if (!cron) return 'Manual only';
  const preset = SCHEDULE_PRESETS.find(p => p.value === cron);
  if (preset) return preset.label;
  return `Custom: ${cron}`;
}

export default function BasesPage() {
  const [bases, setBases] = useState<BaseReg[]>([]);
  const [larkApps, setLarkApps] = useState<LarkApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingBase, setEditingBase] = useState<BaseReg | null>(null);
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [preview, setPreview] = useState<SchemaPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [analyzeOpen, setAnalyzeOpen] = useState(false);
  const [analyzeBase, setAnalyzeBase] = useState<BaseReg | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchResults, setBatchResults] = useState<Map<string, { status: 'pending' | 'loading' | 'done' | 'error'; schema?: SchemaPreview & { cached?: boolean }; error?: string }>>(new Map());
  const [batchFetching, setBatchFetching] = useState(false);
  // Shared image type for workflow/automation screenshots
  type ScreenshotImage = {
    label: string;
    slug: string;               // unique within group, used for file naming
    description?: string;       // optional description
    dataUrl: string;            // local preview
    uploadedUrl?: string;       // server URL after upload
    docId?: string;             // ba_documents ID
    annotations?: Array<{ x: number; y: number; text: string }>;
  };
  type ScreenshotGroup = { name: string; images: ScreenshotImage[] };

  // Workflow screenshots — grouped by workflow name, uploaded to server
  const [workflowGroups, setWorkflowGroups] = useState<ScreenshotGroup[]>([]);
  const [newGroupName, setNewGroupName] = useState('');
  const [annotatingImage, setAnnotatingImage] = useState<{ gi: number; ii: number } | null>(null);
  const [pendingPin, setPendingPin] = useState<{ x: number; y: number } | null>(null);
  const [pinText, setPinText] = useState('');
  // Automation screenshots — same pattern as workflows
  const [automationGroups, setAutomationGroups] = useState<ScreenshotGroup[]>([]);
  const [newAutoGroupName, setNewAutoGroupName] = useState('');
  const [annotatingAutoImage, setAnnotatingAutoImage] = useState<{ gi: number; ii: number } | null>(null);
  const [pendingAutoPin, setPendingAutoPin] = useState<{ x: number; y: number } | null>(null);
  const [autoPinText, setAutoPinText] = useState('');
  // Custom tables added by user — persisted in localStorage
  const [customTables, setCustomTables] = useState<Array<{ table_id: string; name: string; description: string }>>([]);
  const [addingTable, setAddingTable] = useState(false);
  const [newTableName, setNewTableName] = useState('');
  const [newTableDesc, setNewTableDesc] = useState('');
  const [editingTableId, setEditingTableId] = useState<string | null>(null);
  const [editTableName, setEditTableName] = useState('');
  // Edited original table names — persisted (keyed by table_id)
  const [editedTables, setEditedTables] = useState<Record<string, { name?: string; note?: string }>>({});
  // Custom fields added by user (per table) — persisted in localStorage
  const [customFields, setCustomFields] = useState<Record<string, Array<{ field_name: string; type_name: string; description: string }>>>({});
  // Edited original fields — persisted in localStorage (keyed by table_id:field_id)
  const [editedFields, setEditedFields] = useState<Record<string, { description?: string; note?: string }>>({});
  const [addingFieldTable, setAddingFieldTable] = useState<string | null>(null);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState('Text');
  const [newFieldDesc, setNewFieldDesc] = useState('');
  const [editingFieldKey, setEditingFieldKey] = useState<string | null>(null);
  const [editFieldNote, setEditFieldNote] = useState('');
  // Track current preview base for localStorage key
  const currentPreviewAppToken = useRef<string>('');
  // Activity history log (persisted globally in localStorage)
  const [activityLog, setActivityLog] = useState<Array<{
    id: string;
    time: string;
    base_name: string;
    base_id: string;
    action: string; // 'fetch_schema' | 'refresh_schema' | 'add_table' | 'add_field' | 'edit_table' | 'edit_field' | 'add_workflow' | 'add_automation' | 'analyze' | 'export'
    detail?: string;
  }>>([]);
  const batchNotifKey = useRef('batch-schema-fetch');
  const [form] = Form.useForm();
  const [editForm] = Form.useForm();
  const [analyzeForm] = Form.useForm();

  // ─── localStorage persistence for custom/edited fields ──────────────
  const _storageKey = (appToken: string, suffix: string) => `ba_bases_${appToken}_${suffix}`;

  const loadFieldsFromStorage = useCallback((appToken: string) => {
    try {
      const ct = localStorage.getItem(_storageKey(appToken, 'customTables'));
      const et = localStorage.getItem(_storageKey(appToken, 'editedTables'));
      const cf = localStorage.getItem(_storageKey(appToken, 'customFields'));
      const ef = localStorage.getItem(_storageKey(appToken, 'editedFields'));
      const wg = localStorage.getItem(_storageKey(appToken, 'workflowGroups'));
      const ag = localStorage.getItem(_storageKey(appToken, 'automationGroups'));
      if (ct) setCustomTables(JSON.parse(ct)); else setCustomTables([]);
      if (et) setEditedTables(JSON.parse(et)); else setEditedTables({});
      if (cf) setCustomFields(JSON.parse(cf)); else setCustomFields({});
      if (ef) setEditedFields(JSON.parse(ef)); else setEditedFields({});
      if (wg) setWorkflowGroups(JSON.parse(wg)); else setWorkflowGroups([]);
      if (ag) setAutomationGroups(JSON.parse(ag)); else setAutomationGroups([]);
    } catch { /* ignore parse errors */ }
  }, []);

  const _saveToStorage = useCallback((appToken: string, key: string, data: unknown) => {
    try { localStorage.setItem(_storageKey(appToken, key), JSON.stringify(data)); } catch { /* */ }
  }, []);

  // Auto-save all persisted state when changed
  useEffect(() => {
    if (currentPreviewAppToken.current) _saveToStorage(currentPreviewAppToken.current, 'customTables', customTables);
  }, [customTables, _saveToStorage]);

  useEffect(() => {
    if (currentPreviewAppToken.current) _saveToStorage(currentPreviewAppToken.current, 'editedTables', editedTables);
  }, [editedTables, _saveToStorage]);

  useEffect(() => {
    if (currentPreviewAppToken.current) _saveToStorage(currentPreviewAppToken.current, 'customFields', customFields);
  }, [customFields, _saveToStorage]);

  useEffect(() => {
    if (currentPreviewAppToken.current) _saveToStorage(currentPreviewAppToken.current, 'editedFields', editedFields);
  }, [editedFields, _saveToStorage]);

  useEffect(() => {
    if (currentPreviewAppToken.current) _saveToStorage(currentPreviewAppToken.current, 'workflowGroups', workflowGroups.map(g => ({ ...g, images: g.images.map(img => ({ ...img, dataUrl: '' })) })));
  }, [workflowGroups, _saveToStorage]);

  useEffect(() => {
    if (currentPreviewAppToken.current) _saveToStorage(currentPreviewAppToken.current, 'automationGroups', automationGroups.map(g => ({ ...g, images: g.images.map(img => ({ ...img, dataUrl: '' })) })));
  }, [automationGroups, _saveToStorage]);

  // ─── Activity log ─────────────────────────────────────────────────────
  useEffect(() => {
    try {
      const stored = localStorage.getItem('ba_bases_activity_log');
      if (stored) setActivityLog(JSON.parse(stored));
    } catch { /* */ }
  }, []);

  const pushActivity = useCallback((base_name: string, base_id: string, action: string, detail?: string) => {
    setActivityLog(prev => {
      const entry = { id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, time: new Date().toISOString(), base_name, base_id, action, detail };
      const updated = [entry, ...prev].slice(0, 100); // keep last 100
      try { localStorage.setItem('ba_bases_activity_log', JSON.stringify(updated)); } catch { /* */ }
      return updated;
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [b, apps] = await Promise.all([
        listBases().catch(() => []),
        listLarkApps().catch(() => []),
      ]);
      setBases(b);
      setLarkApps(apps);
    } catch {
      message.error('Failed to load');
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      await createBase(values as BaseRegCreate);
      message.success('Base registered');
      setCreateOpen(false);
      form.resetFields();
      load();
    } catch (e: unknown) {
      if (e instanceof Error) message.error(e.message);
    }
    setSaving(false);
  };

  const handleEdit = async () => {
    if (!editingBase) return;
    try {
      const values = await editForm.validateFields();
      setSaving(true);
      await updateBase(editingBase._id, values);
      message.success('Base updated');
      setEditOpen(false);
      load();
    } catch (e: unknown) {
      if (e instanceof Error) message.error(e.message);
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteBase(id);
      message.success('Deleted');
      load();
    } catch {
      message.error('Delete failed');
    }
  };

  const handleFetchSchema = async (base: BaseReg, refresh = false) => {
    setPreviewLoading(true);
    setPreviewOpen(true);
    if (refresh) setPreview(null);
    // Load persisted custom/edited fields from localStorage (survives refresh)
    currentPreviewAppToken.current = base.app_token;
    loadFieldsFromStorage(base.app_token);
    try {
      const schema = await fetchBaseSchema(base._id, refresh);
      setPreview(schema);
      pushActivity(base.name, base._id, refresh ? 'refresh_schema' : 'fetch_schema',
        `${schema.tables_count} tables, ${schema.fields_count} fields${schema.cached ? ' (cached)' : ''}`);
      message.success(
        schema.cached
          ? `Loaded from cache (${schema.tables_count} tables)`
          : `Fetched ${schema.tables_count} tables, ${schema.fields_count} fields`
      );
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : 'Failed to fetch schema');
      setPreviewOpen(false);
      setWorkflowGroups([]);
    }
    setPreviewLoading(false);
  };

  // ─── Batch fetch with concurrency control ────────────────────────────
  const handleBatchFetch = async (refresh = false, overrideIds?: string[]) => {
    const ids = overrideIds || selectedIds;
    if (ids.length === 0) return;
    setBatchFetching(true);

    // Initialize all selected as pending
    const initial = new Map<string, { status: 'pending' | 'loading' | 'done' | 'error'; schema?: SchemaPreview & { cached?: boolean }; error?: string }>();
    ids.forEach(id => initial.set(id, { status: 'pending' }));
    setBatchResults(new Map(initial));

    const total = ids.length;
    let completed = 0;
    const results = new Map(initial);

    const updateNotification = () => {
      const entries = Array.from(results.entries());
      const desc = (
        <div style={{ maxHeight: 300, overflow: 'auto', fontSize: 12 }}>
          <Progress
            percent={Math.round((completed / total) * 100)}
            size="small"
            status={completed < total ? 'active' : 'normal'}
            style={{ marginBottom: 8 }}
          />
          {entries.map(([id, r]) => {
            const base = bases.find(b => b._id === id);
            const name = base?.name || id.slice(0, 8);
            return (
              <div key={id} style={{ marginBottom: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                {r.status === 'done' && <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 13 }} />}
                {r.status === 'error' && <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 13 }} />}
                {r.status === 'loading' && <LoadingOutlined style={{ color: '#1677ff', fontSize: 13 }} />}
                {r.status === 'pending' && <ClockCircleOutlined style={{ color: 'var(--text-tertiary)', fontSize: 13 }} />}
                <span style={{ fontWeight: r.status === 'loading' ? 600 : 400 }}>{name}</span>
                {r.status === 'done' && r.schema && (
                  <span style={{ color: 'var(--text-secondary)' }}>
                    {' '}&mdash; {r.schema.tables_count} tables, {r.schema.fields_count} fields
                    {(r.schema.automations_count || r.schema.workflows_count) ? `, ${r.schema.automations_count || r.schema.workflows_count} automations` : ''}
                  </span>
                )}
                {r.status === 'error' && (
                  <span style={{ color: '#ff4d4f' }}> &mdash; {r.error}</span>
                )}
              </div>
            );
          })}
        </div>
      );
      notification.open({
        key: batchNotifKey.current,
        message: `Fetching Schemas (${completed}/${total})`,
        description: desc,
        duration: 0,
        placement: 'bottomRight',
      });
    };

    updateNotification();

    // Process with max 3 concurrent
    const queue = [...ids];
    const MAX_CONCURRENT = 3;

    const processOne = async (id: string) => {
      results.set(id, { status: 'loading' });
      setBatchResults(new Map(results));
      updateNotification();
      try {
        const schema = await fetchBaseSchema(id, refresh);
        results.set(id, { status: 'done', schema });
      } catch (e: unknown) {
        results.set(id, { status: 'error', error: e instanceof Error ? e.message : 'Failed' });
      }
      completed++;
      setBatchResults(new Map(results));
      updateNotification();
    };

    // Semaphore-based concurrency
    const executing = new Set<Promise<void>>();
    for (const id of queue) {
      const p = processOne(id).then(() => { executing.delete(p); });
      executing.add(p);
      if (executing.size >= MAX_CONCURRENT) {
        await Promise.race(executing);
      }
    }
    await Promise.all(executing);

    setBatchFetching(false);
    const doneCount = Array.from(results.values()).filter(r => r.status === 'done').length;
    const errCount = Array.from(results.values()).filter(r => r.status === 'error').length;
    notification.open({
      key: batchNotifKey.current,
      message: `Batch Complete: ${doneCount} done, ${errCount} errors`,
      description: (
        <div style={{ fontSize: 12 }}>
          <Progress percent={100} size="small" status={errCount > 0 ? 'exception' : 'success'} />
          {Array.from(results.entries()).map(([id, r]) => {
            const base = bases.find(b => b._id === id);
            const name = base?.name || id.slice(0, 8);
            return (
              <div key={id} style={{ marginBottom: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                {r.status === 'done' && <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 13 }} />}
                {r.status === 'error' && <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 13 }} />}
                <span>{name}</span>
                {r.status === 'done' && r.schema && (
                  <span style={{ color: 'var(--text-secondary)' }}>
                    {' '}&mdash; {r.schema.tables_count} tables, {r.schema.fields_count} fields
                  </span>
                )}
                {r.status === 'error' && (
                  <span style={{ color: '#ff4d4f' }}> &mdash; {r.error}</span>
                )}
              </div>
            );
          })}
          <Space style={{ marginTop: 8 }}>
            <Button size="small" type="primary" onClick={() => {
              const doneItems = Array.from(results.entries()).filter(([, r]) => r.status === 'done' && r.schema);
              doneItems.forEach(([id, r]) => {
                const base = bases.find(b => b._id === id);
                const name = base?.name || id;
                const clean = _cleanRawSchema(r.schema!);
                const json = JSON.stringify(clean, null, 2);
                const blob = new Blob([json], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `schema_${name.replace(/[^\w\u00C0-\u024F\u1E00-\u1EFF-]/g, '_')}_${new Date().toISOString().slice(0, 10)}.json`;
                a.click();
                URL.revokeObjectURL(url);
              });
              message.success(`Downloaded ${doneItems.length} schemas`);
            }}>
              Download All JSON
            </Button>
            <Button size="small" onClick={() => {
              const doneItems = Array.from(results.entries()).filter(([, r]) => r.status === 'done' && r.schema);
              doneItems.forEach(([id, r]) => {
                const base = bases.find(b => b._id === id);
                if (!base || !r.schema) return;
                const clean = _cleanRawSchema(r.schema);
                const prompt = _buildPromptV3(base.name, id, clean);
                const blob = new Blob([prompt], { type: 'text/markdown;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `prompt_${base.name.replace(/[^\w\u00C0-\u024F\u1E00-\u1EFF-]/g, '_')}_${new Date().toISOString().slice(0, 10)}.md`;
                a.click();
                URL.revokeObjectURL(url);
              });
              message.success(`Downloaded ${doneItems.length} prompts`);
            }}>
              Download All Prompts
            </Button>
          </Space>
        </div>
      ),
      duration: 8,
      placement: 'bottomRight',
    });
    setSelectedIds([]);
  };

  const openAnalyzeForm = (base: BaseReg) => {
    setAnalyzeBase(base);
    analyzeForm.setFieldsValue({
      ai_provider: 'auto',
      ai_model: '',
      include_sample_data: true,
    });
    setAnalyzeOpen(true);
  };

  const handleTriggerAnalysis = async () => {
    if (!analyzeBase) return;
    setAnalyzing(true);
    try {
      const values = analyzeForm.getFieldsValue();
      const config: AnalysisConfig = {
        ai_provider: values.ai_provider,
        ai_model: values.ai_model || undefined,
        include_sample_data: values.include_sample_data,
      };
      const result = await triggerAnalysis(analyzeBase._id, config);
      if (result.status === 'failed') {
        message.error(result.error || 'Agent unreachable');
      } else {
        pushActivity(analyzeBase.name, analyzeBase._id, 'analyze', `Provider: ${config.ai_provider || 'auto'}`);
        message.success('Analysis started! Check Analyses page.');
      }
      setAnalyzeOpen(false);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : 'Failed to trigger');
    }
    setAnalyzing(false);
  };

  /** Clean a raw schema from backend — strip internal IDs, property blobs, keep only schema metadata */
  const _cleanRawSchema = (raw: SchemaPreview) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cleanField = (f: any) => {
      const entry: Record<string, unknown> = {
        field_name: f.field_name,
        type: f.type,
        type_name: f.type_name || f.type,
      };
      if (f.is_primary) entry.is_primary = true;
      if (f.formula) entry.formula = f.formula;
      if (f.description) entry.description = f.description;
      if (Array.isArray(f.options) && f.options.length > 0) entry.options = f.options.slice(0, 50);
      return entry;
    };
    return {
      app_token: raw.app_token,
      tables_count: raw.tables_count,
      fields_count: raw.fields_count,
      tables: (raw.tables || []).map(t => ({
        name: t.name,
        fields: ((t.fields || []) as Record<string, unknown>[]).map(cleanField),
        ...(t.views && t.views.length > 0 ? { views: t.views.map(v => ({ name: v.view_name, type: v.view_type })) } : {}),
      })),
      ...(raw.external_tables && raw.external_tables.length > 0 ? {
        external_tables: raw.external_tables.map(ext => ({
          name: ext.name,
          is_synced: true,
          linked_from: ext.linked_from_tables || [],
          fields: ((ext.fields || []) as Record<string, unknown>[]).map(cleanField),
        })),
      } : {}),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      relationships: ((raw.relationships || []) as any[]).map(r => ({
        from: `${r.from_table_name || ''}.${r.from_field || ''}`,
        to: r.to_table_name || '',
        type: r.link_type || '',
      })),
      ...((raw.automations || raw.workflows || []).length > 0 ? {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        workflows: (raw.automations || raw.workflows || []).map((w: any) => ({
          title: w.title,
          status: w.status,
          ...(w.trigger_type ? { trigger_type: w.trigger_type } : {}),
          ...(w.trigger_table_name ? { trigger_table: w.trigger_table_name } : {}),
          ...(w.actions && w.actions.length > 0 ? { actions: w.actions } : {}),
        })),
      } : {}),
    };
  };

  /** Generate prompt following PROMPT_TEMPLATE.md v3.0 format */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const _buildPromptV3 = (baseName: string, baseId: string, schemaJson: any) => {
    const today = new Date().toISOString().slice(0, 10);
    const json = JSON.stringify(schemaJson, null, 2);
    const wfList = (schemaJson.workflows || []).length > 0
      ? (schemaJson.workflows as { title: string; status: string }[]).map(w => `- ${w.title} (${w.status})`).join('\n')
      : '- Không có workflow/automation nào được phát hiện';
    const extList = (schemaJson.external_tables || []).length > 0
      ? (schemaJson.external_tables as { name: string; linked_from?: string[] }[]).map(t => `- ${t.name}${t.linked_from?.length ? ` (linked from: ${t.linked_from.join(', ')})` : ''}`).join('\n')
      : '';
    const baseSlug = baseName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

    return `Bạn là chuyên gia phân tích hệ thống (System Analyst) chuyên về Lark Base / Airtable.
Tôi cung cấp schema JSON của Lark Base app "${baseName}".

Hãy phân tích TOÀN DIỆN và tạo bộ tài liệu đặc tả, tổ chức theo cấu trúc folder:

\`\`\`
${baseName}/
├── README.md
├── spec/
│   ├── 01-executive-summary.md    # Tổng quan, thống kê, kiến trúc, module map
│   ├── 02-module-details.md       # Chi tiết từng module: bảng, trường, PK, Link/Lookup/Formula
│   ├── 03-erd-relationships.md    # 100% SingleLink/DuplexLink, bảng nguồn/đích, bảng hub
│   ├── 04-business-flows.md       # Luồng nghiệp vụ chính (input→process→output)
│   ├── 05-field-statistics.md     # Thống kê loại trường, top Lookup/Formula, trường bất thường
│   ├── 06-issues-and-fixes.md     # Lỗi BUG/ARCH/PROC, mức P0-P3, đề xuất sửa
│   ├── 07-upgrade-roadmap.md      # Lộ trình 3 giai đoạn
│   └── appendix-glossary.md       # Bảng thuật ngữ viết tắt
├── diagrams/
│   ├── 01-system-architecture.md  # Kiến trúc tổng thể
│   ├── 02-erd-full.md             # ERD toàn bộ (erDiagram)
│   ├── 03-erd-[module].md         # ERD module phức tạp nhất
│   ├── 04-dataflow-level0.md      # DFD tổng quan
│   ├── 05-dataflow-[core].md      # DFD luồng nghiệp vụ chính
│   ├── 0x-workflow-[name].md      # State/Flow diagram cho từng workflow
│   ├── 1x-sequence-[name].md      # Sequence diagram cho quy trình E2E
│   └── xx-module-dependency.md    # Dependency graph
├── operations/
│   ├── 01-operations-overview.md   # Tổng quan + scorecard
│   ├── 02-buttons.md               # Phân tích Button (type 3001)
│   ├── 03-approvals.md             # Phân tích Approval (type 24) + Gap
│   ├── 04-formula-logic.md         # Logic Formula chi tiết theo nhóm
│   ├── 05-lookup-chains.md         # Chuỗi Lookup & Data Pipeline
│   ├── 06-automations.md           # Automation triggers + workflows thực tế
│   ├── 07-input-output-points.md   # Điểm nhập/xuất + critical fields
│   ├── 08-integration-matrix.md    # Ma trận tích hợp giữa module
│   └── 09-risk-assessment.md       # Rủi ro + risk matrix
└── ban-pho-thong/
    ├── 00-gioi-thieu.md
    ├── 01-huong-dan-nhanh.md
    ├── 02-cac-module-chinh.md
    ├── 03-luong-cong-viec.md
    ├── 04-cac-bang-quan-trong.md
    ├── 05-moi-quan-he-du-lieu.md
    └── 06-tu-dien-thuat-ngu.md
\`\`\`

### THÔNG TIN BỔ SUNG TỪ LARK API:

**Workflows/Automations thực tế:**
${wfList}
→ Phân tích chi tiết trong operations/06-automations.md
→ Tạo diagram Mermaid (stateDiagram hoặc flowchart) cho MỖI workflow trong diagrams/
${extList ? `
**Bảng đồng bộ từ Base khác (External/Synced tables):**
${extList}
→ Phân tích ảnh hưởng cross-base, data dependency trong spec/03-erd-relationships.md
` : ''}
### YÊU CẦU CHẤT LƯỢNG:
- Mỗi file tập trung 1 chủ đề, KHÔNG gộp
- Diagrams dùng Mermaid (render trên GitHub, mermaid.live, VS Code)
- Mỗi lỗi: vị trí cụ thể + ảnh hưởng + đề xuất + mức P0-P3
- Bảng markdown cho dữ liệu có cấu trúc
- Ngôn ngữ: Tiếng Việt
- README.md chứa mục lục + quick links
- Ban phổ thông: giải thích cho người không kỹ thuật (quản lý, nhân viên)
- Workflow diagrams: Mermaid stateDiagram hoặc flowchart cho TỪNG workflow
  bao gồm trigger, conditions, actions, notifications

### QUY ƯỚC FIELD TYPE:
| Type | Tên | Type | Tên |
|------|-----|------|-----|
| 1 | Text | 13 | Phone |
| 2 | Number | 15 | URL |
| 3 | SingleSelect | 17 | Attachment |
| 4 | MultiSelect | 18 | **SingleLink** |
| 5 | DateTime | 19 | **Lookup** |
| 7 | Checkbox | 20 | **Formula** |
| 11 | Person | 21 | **DuplexLink** |
| 22 | Location | 24 | Approval |
| 1001 | CreatedTime | 1003 | CreatedBy |
| 1002 | ModifiedTime | 1004 | ModifiedBy |
| 1005 | AutoNumber | 3001 | Button |

---

### SCHEMA JSON:

\`\`\`json
${json}
\`\`\`

---

### SAU KHI PHÂN TÍCH XONG — PUSH LÊN API:

Đẩy kết quả lên **https://cms-agents.toolswave.net/ba/docs** (base "${baseName}"):

\`\`\`bash
API="https://agents-lark.toolswave.net/api/ba/documents/batch-upload"
BASE_ID="${baseId}"

curl -X POST "$API" \\
  -H "Content-Type: application/json" \\
  -d '{
    "base_id": "'$BASE_ID'",
    "contributor": "claude-cli",
    "tags": ["spec", "diagram", "operations"],
    "auto_commit": true,
    "commit_message": "Phân tích đặc tả ${baseName} — ${today}",
    "documents": [
      { "folder": "spec", "filename": "01-executive-summary.md", "content": "..." },
      { "folder": "diagrams", "filename": "02-erd-full.md", "content": "..." }
    ]
  }'
\`\`\`

> **base_id:** \`${baseId}\`
> **Base name:** \`${baseName}\`
> **Xem kết quả:** https://cms-agents.toolswave.net/ba/docs?base=${baseSlug}
`;
  };

  const _buildCleanSchema = () => {
    if (!preview) return null;
    /** Map fields to clean schema-only format — NO values, NO internal IDs */
    const mapFields = (fields: Record<string, unknown>[], tableId?: string) =>
      fields.map((f) => {
        const entry: Record<string, unknown> = {
          field_name: f.field_name,
          type: f.type,
          type_name: f.type_name,
        };
        if (f.is_primary) entry.is_primary = true;
        if (f.formula) entry.formula = f.formula;
        if (f.description) entry.description = f.description;
        // Only include select options (not raw property blob)
        if (Array.isArray(f.options) && (f.options as string[]).length > 0) {
          entry.options = (f.options as string[]).slice(0, 50); // cap at 50
        }
        // Include edited notes
        const editKey = tableId ? `${tableId}:${f.field_id}` : '';
        const edited = editKey ? editedFields[editKey] : undefined;
        if (edited?.note) entry.note = edited.note;
        if (edited) entry._edited = true;
        return entry;
      });

    const totalCustomFields = Object.values(customFields).reduce((n, arr) => n + arr.length, 0);
    return {
      app_token: preview.app_token,
      tables_count: preview.tables_count + customTables.length,
      fields_count: preview.fields_count + totalCustomFields,
      tables: [
        // Lark tables (with edited names)
        ...(preview.tables || []).map((t: Record<string, unknown>) => {
          const tableId = (t as { table_id: string }).table_id;
          const extras = customFields[tableId] || [];
          const baseFields = mapFields((t.fields || []) as Record<string, unknown>[], tableId);
          const extraFields = extras.map(f => ({
            field_name: f.field_name,
            type_name: f.type_name,
            ...(f.description ? { description: f.description } : {}),
            _custom: true,
          }));
          const editedName = editedTables[tableId]?.name;
          const result: Record<string, unknown> = {
            name: editedName || t.name,
            ...(editedName ? { original_name: t.name, _edited: true } : {}),
            fields: [...baseFields, ...extraFields],
          };
          if (editedTables[tableId]?.note) result.note = editedTables[tableId].note;
          if (Array.isArray(t.views) && (t.views as unknown[]).length > 0) {
            result.views = (t.views as Array<{ view_name: string; view_type: string }>).map(v => ({
              name: v.view_name, type: v.view_type,
            }));
          }
          return result;
        }),
        // Custom tables
        ...customTables.map(ct => {
          const extras = customFields[ct.table_id] || [];
          return {
            name: ct.name,
            _custom: true,
            ...(ct.description ? { description: ct.description } : {}),
            fields: extras.map(f => ({
              field_name: f.field_name,
              type_name: f.type_name,
              ...(f.description ? { description: f.description } : {}),
              _custom: true,
            })),
          };
        }),
      ],
      ...(preview.external_tables && preview.external_tables.length > 0 ? {
        external_tables: preview.external_tables.map(ext => ({
          name: ext.name,
          is_synced: true,
          linked_from: ext.linked_from_tables || [],
          fields: mapFields(ext.fields as Record<string, unknown>[]),
        })),
      } : {}),
      relationships: ((preview.relationships || []) as Array<{ from_table_name?: string; from_field?: string; to_table_name?: string; link_type?: string }>).map((r) => ({
        from: `${r.from_table_name}.${r.from_field}`,
        to: r.to_table_name,
        type: r.link_type,
      })),
      ...(preview.workflows && preview.workflows.length > 0 ? {
        workflows: preview.workflows.map(w => ({
          title: w.title,
          status: w.status,
        })),
      } : {}),
    };
  };

  const handleExportSchema = () => {
    const schemaOnly = _buildCleanSchema();
    if (!schemaOnly) return;
    const json = JSON.stringify(schemaOnly, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `schema_${schemaOnly.app_token}_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    message.success('Schema exported');
  };

  const handleExportPrompt = () => {
    const schemaOnly = _buildCleanSchema();
    if (!schemaOnly) return;
    const matchBase = bases.find(b => b.app_token === preview?.app_token);
    const baseName = matchBase?.name || 'Lark Base';
    const baseId = matchBase?._id || '';
    const today = new Date().toISOString().slice(0, 10);

    const prompt = _buildPromptV3(baseName, baseId, schemaOnly);
    /* OLD INLINE PROMPT REPLACED BY _buildPromptV3 — keeping structure below for reference
    const _unused_prompt = `Bạn là chuyên gia phân tích hệ thống (System Analyst) chuyên về Lark Base / Airtable.
Tôi cung cấp schema JSON của Lark Base app "${baseName}".

Hãy phân tích TOÀN DIỆN và tạo bộ tài liệu đặc tả, tổ chức theo cấu trúc folder:

\`\`\`
${baseName}/
├── README.md
├── spec/
│   ├── 01-executive-summary.md    # Tổng quan, thống kê, kiến trúc, module map
│   ├── 02-module-details.md       # Chi tiết từng module: bảng, trường, PK, Link/Lookup/Formula
│   ├── 03-erd-relationships.md    # 100% SingleLink/DuplexLink, bảng nguồn/đích, bảng hub
│   ├── 04-business-flows.md       # Luồng nghiệp vụ chính (input→process→output)
│   ├── 05-field-statistics.md     # Thống kê loại trường, top Lookup/Formula, trường bất thường
│   ├── 06-issues-and-fixes.md     # Lỗi BUG/ARCH/PROC, mức P0-P3, đề xuất sửa
│   ├── 07-upgrade-roadmap.md      # Lộ trình 3 giai đoạn
│   └── appendix-glossary.md       # Bảng thuật ngữ viết tắt
├── diagrams/
│   ├── 01-system-architecture.md  # Kiến trúc tổng thể
│   ├── 02-erd-full.md             # ERD toàn bộ (erDiagram)
│   ├── 03-erd-[module].md         # ERD module phức tạp nhất
│   ├── 04-dataflow-level0.md      # DFD tổng quan
│   ├── 05-dataflow-[core].md      # DFD luồng nghiệp vụ chính
│   ├── 0x-workflow-[name].md      # State/Flow diagram cho từng workflow${schemaOnly.workflows ? `
│   │                                # Workflows: ${schemaOnly.workflows.map((w: { title: string }) => w.title).join(', ')}` : ''}
│   ├── 1x-sequence-[name].md      # Sequence diagram cho quy trình E2E
│   └── xx-module-dependency.md    # Dependency graph
├── operations/
│   ├── 01-operations-overview.md   # Tổng quan + scorecard
│   ├── 02-buttons.md               # Phân tích Button (type 3001)
│   ├── 03-approvals.md             # Phân tích Approval (type 24) + Gap
│   ├── 04-formula-logic.md         # Logic Formula chi tiết theo nhóm
│   ├── 05-lookup-chains.md         # Chuỗi Lookup & Data Pipeline
│   ├── 06-automations.md           # Automation triggers + workflows thực tế
│   ├── 07-input-output-points.md   # Điểm nhập/xuất + critical fields
│   ├── 08-integration-matrix.md    # Ma trận tích hợp giữa module
│   └── 09-risk-assessment.md       # Rủi ro + risk matrix
└── ban-pho-thong/                  # Bản giải thích dành cho người không kỹ thuật
    ├── 00-gioi-thieu.md
    ├── 01-huong-dan-nhanh.md
    ├── 02-cac-module-chinh.md
    ├── 03-luong-cong-viec.md
    ├── 04-cac-bang-quan-trong.md
    ├── 05-moi-quan-he-du-lieu.md
    └── 06-tu-dien-thuat-ngu.md
\`\`\`

### THÔNG TIN BỔ SUNG TỪ LARK API:
${schemaOnly.workflows ? `
**Workflows/Automations thực tế (${schemaOnly.workflows.length}):**
${schemaOnly.workflows.map((w: { title: string; status: string }) => `- ${w.title} (${w.status})`).join('\n')}
→ Phân tích chi tiết trong operations/06-automations.md, tạo diagram cho mỗi workflow trong diagrams/
` : '- Không có workflow/automation nào được phát hiện'}
${schemaOnly.external_tables ? `
**Bảng đồng bộ từ Base khác (${schemaOnly.external_tables.length}):**
${schemaOnly.external_tables.map((t: { name: string; linked_from?: string[] }) => `- ${t.name}${t.linked_from?.length ? ` (linked from: ${t.linked_from.join(', ')})` : ''}`).join('\n')}
→ Phân tích ảnh hưởng cross-base trong spec/03-erd-relationships.md
` : ''}
### YÊU CẦU CHẤT LƯỢNG:
- Mỗi file tập trung 1 chủ đề, KHÔNG gộp
- Diagrams dùng Mermaid (render trên GitHub, mermaid.live, VS Code)
- Mỗi lỗi: vị trí cụ thể + ảnh hưởng + đề xuất + mức P0-P3
- Bảng markdown cho dữ liệu có cấu trúc
- Ngôn ngữ: Tiếng Việt
- README.md chứa mục lục + quick links
- Ban phổ thông: giải thích cho người không kỹ thuật (quản lý, nhân viên)

${(() => {
  // Load workflow builder data from localStorage
  const wfKey = _storageKey(preview?.app_token || '', 'workflowNodes');
  const autoKey = _storageKey(preview?.app_token || '', 'automationNodes');
  type WfNode = { id: string; data: Record<string, unknown>; position?: { y: number }; type?: string };
  type WfEdge = { source: string; target: string; sourceHandle?: string };
  type WfSaved = { name: string; nodes: WfNode[]; edges: WfEdge[] };
  let wfData: WfSaved[] = [];
  let autoData: WfSaved[] = [];
  try { const raw = localStorage.getItem(wfKey); if (raw) wfData = JSON.parse(raw); } catch {}
  try { const raw = localStorage.getItem(autoKey); if (raw) autoData = JSON.parse(raw); } catch {}

  const triggerLabels: Record<string, string> = { record_created: 'Khi tạo bản ghi', record_updated: 'Khi có cập nhật bản ghi', field_changed: 'Khi trường thay đổi', record_deleted: 'Khi xóa bản ghi', schedule: 'Theo lịch trình', button_click: 'Khi nhấn nút' };
  const actionLabels: Record<string, string> = { update_record: 'Cập nhật bản ghi', create_record: 'Thêm bản ghi', find_and_update: 'Tìm & cập nhật', send_notification: 'Gửi thông báo', call_webhook: 'Gọi webhook', copy_record: 'Sao chép', lock_record: 'Khóa' };
  const opLabels: Record<string, string> = { eq: 'là', neq: 'không là', contains: 'chứa', gt: '>', gte: '≥', lt: '<', lte: '≤', is_empty: 'trống', is_not_empty: 'không trống', in: 'thuộc', is_true: 'có', is_false: 'không', before: 'trước', after: 'sau', is_today: 'hôm nay' };

  function exportWf(wf: WfSaved, category: string) {
    const lines: string[] = [];
    const sorted = [...wf.nodes].sort((a, b) => (a.position?.y || 0) - (b.position?.y || 0));
    for (const node of sorted) {
      const d = node.data;
      const nt = d.nodeType || node.type;
      if (nt === 'trigger') {
        lines.push('**Trigger:** ' + (triggerLabels[d.triggerType as string || ''] || d.triggerType || '?'));
        if (d.tableName) lines.push('  Bảng: ' + d.tableName);
        if (d.watchFields && (d.watchFields as string[]).length) lines.push('  Trường: ' + (d.watchFields as string[]).join(', '));
      } else if (nt === 'condition') {
        const op = opLabels[d.conditionOp as string || 'eq'] || d.conditionOp || '';
        lines.push('**Điều kiện:** ' + (d.conditionField || '?') + ' ' + op + ' ' + (d.conditionValue || ''));
        if (d.extraConditions && (d.extraConditions as Array<{field:string;op:string;value:string}>).length) {
          for (const ec of d.extraConditions as Array<{field:string;op:string;value:string}>) {
            lines.push('  ' + (d.conditionLogic || 'AND') + ' ' + ec.field + ' ' + (opLabels[ec.op] || ec.op) + ' ' + ec.value);
          }
        }
      } else if (nt === 'action') {
        lines.push('**Hành động:** ' + (actionLabels[d.actionType as string || ''] || d.actionType || '?'));
        if (d.targetTable) lines.push('  Bảng: ' + d.targetTable);
        const fms = ((d.fieldMappings || []) as Array<{field:string;value:string;checked:boolean}>).filter(f => f.checked);
        if (fms.length) for (const fm of fms) lines.push('  - ' + fm.field + ' ← ' + fm.value);
      } else if (nt === 'delay') {
        lines.push('**Chờ:** ' + (d.delayMinutes || 0) + ' phút');
      } else if (nt === 'notification') {
        lines.push('**Thông báo:** qua ' + (d.channel || '?'));
        if (d.template) lines.push('  "' + d.template + '"');
      }
      if (d.label) lines.push('  Tên: ' + d.label);
      if (d.description) lines.push('  Ghi chú: ' + d.description);
    }
    // Edges
    if (wf.edges.length > 0) {
      lines.push('**Luồng:**');
      for (const e of wf.edges) {
        const src = wf.nodes.find(n => n.id === e.source);
        const tgt = wf.nodes.find(n => n.id === e.target);
        const branch = e.sourceHandle === 'yes' ? ' (Yes)' : e.sourceHandle === 'no' ? ' (No)' : '';
        lines.push('- ' + (src?.data?.label || '?') + branch + ' → ' + (tgt?.data?.label || '?'));
      }
    }
    return lines.join('\n');
  }

  let result = '';
  if (wfData.length > 0) {
    result += '\n### WORKFLOWS (Quy trình làm việc) — ' + wfData.length + ' workflows:\n\n';
    result += '**Yêu cầu:** Tạo Mermaid flowchart cho mỗi workflow trong diagrams/\n\n';
    result += wfData.map((wf, i) => '#### Workflow ' + (i + 1) + ': ' + wf.name + ' (' + wf.nodes.length + ' nodes)\n\n' + exportWf(wf, 'workflow')).join('\n\n');
    result += '\n';
  }
  if (autoData.length > 0) {
    result += '\n### AUTOMATIONS (Tự động hóa) — ' + autoData.length + ' automations:\n\n';
    result += '**Yêu cầu:** Phân tích trigger, conditions, actions. Tạo Mermaid flowchart.\n\n';
    result += autoData.map((wf, i) => '#### Automation ' + (i + 1) + ': ' + wf.name + ' (' + wf.nodes.length + ' nodes)\n\n' + exportWf(wf, 'automation')).join('\n\n');
    result += '\n';
  }
  if (!result) result = '- Chưa có workflow/automation nào được thiết kế trong builder\n';
  return result;
})()}
${customTables.length > 0 ? `
### CUSTOM TABLES (Bảng bổ sung bởi người dùng):

${customTables.map(ct => {
  const fields = customFields[ct.table_id] || [];
  return '**' + ct.name + '**' + (ct.description ? ' — ' + ct.description : '') + '\n' +
    (fields.length > 0 ? fields.map(f => '- ' + f.field_name + ' (' + f.type_name + ')' + (f.description ? ' — ' + f.description : '')).join('\n') : '- (chưa có fields)');
}).join('\n\n')}
` : ''}
${Object.keys(editedTables).length > 0 ? `
### EDITED TABLES (Bảng đã sửa tên/ghi chú):

${Object.entries(editedTables).map(([tableId, edit]) => {
  const table = preview?.tables.find(t => t.table_id === tableId);
  const originalName = table?.name || tableId;
  return '- ' + (edit.name || originalName) + (edit.name ? ' (gốc: ' + originalName + ')' : '') + (edit.note ? ' — ' + edit.note : '');
}).join('\n')}
` : ''}
${Object.keys(customFields).length > 0 ? `
### CUSTOM FIELDS (Bổ sung bởi người dùng):

Các fields dưới đây được thêm thủ công để bổ sung thông tin cho phân tích:

${Object.entries(customFields).filter(([, fields]) => fields.length > 0).map(([tableId, fields]) => {
  const table = preview?.tables.find(t => t.table_id === tableId);
  const ct = customTables.find(c => c.table_id === tableId);
  const tableName = editedTables[tableId]?.name || table?.name || ct?.name || tableId;
  return '**' + tableName + ':**\n' + fields.map(f => '- ' + f.field_name + ' (' + f.type_name + ')' + (f.description ? ' — ' + f.description : '')).join('\n');
}).join('\n\n')}
` : ''}
${Object.keys(editedFields).length > 0 ? `
### EDITED FIELDS (Ghi chú bổ sung cho fields có sẵn):

Người dùng đã thêm ghi chú cho các fields sau:

${(() => {
  const byTable: Record<string, Array<{ field: string; note: string }>> = {};
  Object.entries(editedFields).forEach(([key, val]) => {
    if (!val.note) return;
    const [tableId, fieldId] = key.split(':');
    const table = preview?.tables.find(t => t.table_id === tableId);
    const tableName = table?.name || tableId;
    const field = table ? (table.fields as Record<string, unknown>[]).find(f => (f as { field_id: string }).field_id === fieldId) : null;
    const fieldName = field ? (field as { field_name: string }).field_name : fieldId;
    if (!byTable[tableName]) byTable[tableName] = [];
    byTable[tableName].push({ field: fieldName, note: val.note });
  });
  return Object.entries(byTable).map(([tableName, items]) =>
    '**' + tableName + ':**\n' + items.map(i => '- ' + i.field + ': ' + i.note).join('\n')
  ).join('\n\n');
})()}
` : ''}
### QUY ƯỚC FIELD TYPE:
| Type | Tên | Type | Tên |
|------|-----|------|-----|
| 1 | Text | 13 | Phone |
| 2 | Number | 15 | URL |
| 3 | SingleSelect | 17 | Attachment |
| 4 | MultiSelect | 18 | **SingleLink** |
| 5 | DateTime | 19 | **Lookup** |
| 7 | Checkbox | 20 | **Formula** |
| 11 | Person | 21 | **DuplexLink** |
| 22 | Location | 24 | Approval |
| 1001 | CreatedTime | 1003 | CreatedBy |
| 1002 | ModifiedTime | 1004 | ModifiedBy |
| 1005 | AutoNumber | 3001 | Button |

---

### SCHEMA JSON:

\`\`\`json
${json}
\`\`\`

---

### SAU KHI PHÂN TÍCH XONG — PUSH LÊN API:

Đẩy kết quả lên **https://cms-agents.toolswave.net/ba/docs** (base "${baseName}"):

\`\`\`bash
# API endpoint
API="https://agents-lark.toolswave.net/api/ba/documents/batch-upload"
BASE_ID="${baseId}"

# Batch upload tất cả files cùng lúc
curl -X POST "$API" \\
  -H "Content-Type: application/json" \\
  -d '{
    "base_id": "'$BASE_ID'",
    "contributor": "claude-cli",
    "tags": ["spec", "diagram", "operations"],
    "auto_commit": true,
    "commit_message": "Phân tích đặc tả ${baseName} — ${today}",
    "documents": [
      {
        "folder": "spec",
        "filename": "01-executive-summary.md",
        "content": "... nội dung file ..."
      },
      {
        "folder": "diagrams",
        "filename": "02-erd-full.md",
        "content": "... nội dung file ..."
      }
    ]
  }'
\`\`\`

Hoặc nếu dùng Claude Code CLI:

\`\`\`bash
cd lark_schema_analystic
./push_to_api.sh "${baseId}" "./${baseName}" "claude-cli" "spec,diagram,operations"
\`\`\`

> **base_id:** \`${baseId}\`
> **Base name:** \`${baseName}\`
OLD PROMPT END */

    const blob = new Blob([prompt], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prompt_${baseName.replace(/[^\w\u00C0-\u024F\u1E00-\u1EFF-]/g, '_')}_${today}.md`;
    a.click();
    URL.revokeObjectURL(url);
    pushActivity(baseName, baseId, 'export', `Prompt exported`);
    message.success('Prompt exported — paste vào Claude để phân tích');
  };

  /** Export Prompt loại 2: So sánh với phiên bản trước & yêu cầu cập nhật */
  const handleExportUpdatePrompt = () => {
    const schemaOnly = _buildCleanSchema();
    if (!schemaOnly) return;
    const matchBase = bases.find(b => b.app_token === preview?.app_token);
    const baseName = matchBase?.name || 'Lark Base';
    const baseId = matchBase?._id || '';
    const today = new Date().toISOString().slice(0, 10);
    const json = JSON.stringify(schemaOnly, null, 2);

    const prompt = `Bạn là chuyên gia phân tích hệ thống (System Analyst) chuyên về Lark Base / Airtable.

## NHIỆM VỤ: CẬP NHẬT & SO SÁNH TÀI LIỆU ĐẶC TẢ

Tôi đã phân tích Base "${baseName}" trước đó và có bộ tài liệu đặc tả hoàn chỉnh.
Bây giờ tôi cung cấp **schema JSON mới nhất** — hãy:

### 1. SO SÁNH VỚI PHIÊN BẢN TRƯỚC:
- Liệt kê **tất cả thay đổi** so với lần phân tích trước:
  - Bảng mới thêm / bị xóa
  - Trường mới thêm / bị xóa / đổi tên / đổi type
  - Relationship mới / bị xóa
  - Workflow/Automation mới / thay đổi / bị xóa
  - View mới / thay đổi
- Đánh giá **mức ảnh hưởng** của mỗi thay đổi (Breaking / Non-breaking / Enhancement)

### 2. CẬP NHẬT TÀI LIỆU:
- Chỉ cập nhật **các file bị ảnh hưởng** — KHÔNG viết lại toàn bộ
- Mỗi file cập nhật: ghi rõ phần nào thay đổi, phần nào giữ nguyên
- Thêm section "Changelog" ở cuối mỗi file được cập nhật:
  \`\`\`
  ## Changelog
  - [${today}] Thêm bảng X, cập nhật relationship Y→Z
  \`\`\`

### 3. BÁO CÁO THAY ĐỔI (tạo file mới):
Tạo file \`spec/changelog-${today}.md\` chứa:
- Tổng quan thay đổi (summary)
- Chi tiết từng thay đổi (bảng, trường, relationship, workflow)
- Impact assessment
- Khuyến nghị (nếu có breaking change)

### 4. CẤU TRÚC OUTPUT:
\`\`\`
${baseName}/
├── spec/changelog-${today}.md     # BÁO CÁO THAY ĐỔI (file mới)
├── spec/01-executive-summary.md   # Cập nhật nếu có thay đổi lớn
├── spec/02-module-details.md      # Cập nhật modules bị ảnh hưởng
├── spec/03-erd-relationships.md   # Cập nhật nếu relationship thay đổi
├── spec/05-field-statistics.md    # Cập nhật thống kê
├── diagrams/02-erd-full.md        # Cập nhật ERD nếu cần
├── operations/06-automations.md   # Cập nhật nếu workflow thay đổi
└── ... (chỉ file bị ảnh hưởng)
\`\`\`

### QUY TẮC:
- **KHÔNG viết lại file không bị ảnh hưởng** — chỉ liệt kê "không thay đổi"
- Nếu KHÔNG có thay đổi nào → chỉ tạo report xác nhận "schema không đổi"
- Ngôn ngữ: Tiếng Việt
- Diagrams: Mermaid

---

### SCHEMA JSON MỚI NHẤT (${today}):

\`\`\`json
${json}
\`\`\`

---

### SAU KHI PHÂN TÍCH XONG — PUSH LÊN API:

Đẩy kết quả cập nhật lên **https://cms-agents.toolswave.net/ba/docs** (base "${baseName}"):

\`\`\`bash
API="https://agents-lark.toolswave.net/api/ba/documents/batch-upload"
BASE_ID="${baseId}"

curl -X POST "$API" \\
  -H "Content-Type: application/json" \\
  -d '{
    "base_id": "'$BASE_ID'",
    "contributor": "claude-cli",
    "tags": ["update", "${today}"],
    "auto_commit": true,
    "commit_message": "Cập nhật đặc tả ${baseName} — ${today}",
    "documents": [
      {
        "folder": "spec",
        "filename": "changelog-${today}.md",
        "content": "... báo cáo thay đổi ..."
      },
      {
        "folder": "spec",
        "filename": "01-executive-summary.md",
        "content": "... nội dung cập nhật ..."
      }
    ]
  }'
\`\`\`

> **base_id:** \`${baseId}\`
> **Base name:** \`${baseName}\`
> **Xem kết quả:** https://cms-agents.toolswave.net/ba/docs?base=${(() => { const slug = baseName.toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); return slug; })()}
`;

    const blob = new Blob([prompt], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prompt_update_${baseName.replace(/[^\w\u00C0-\u024F\u1E00-\u1EFF-]/g, '_')}_${today}.md`;
    a.click();
    URL.revokeObjectURL(url);
    pushActivity(baseName, baseId, 'export', `Update prompt exported`);
    message.success('Update prompt exported — paste vào Claude cùng tài liệu cũ');
  };

  const openEdit = (base: BaseReg) => {
    setEditingBase(base);
    editForm.setFieldsValue({
      name: base.name,
      app_token: base.app_token,
      lark_app_config_id: base.lark_app_config_id || undefined,
      description: base.description,
      schedule: base.schedule || '',
      webhook_url: base.webhook_url || '',
      notify_on_complete: base.notify_on_complete !== false,
      notify_on_fail: base.notify_on_fail !== false,
      notify_template: base.notify_template || '',
      wiki_space_id: base.wiki_space_id || '',
      wiki_doc_token: base.wiki_doc_token || '',
      wiki_auto_publish: base.wiki_auto_publish || false,
    });
    setEditOpen(true);
  };

  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      render: (v: string) => <Text strong style={{ color: 'var(--foreground)' }}>{v}</Text>,
    },
    {
      title: 'App Token',
      dataIndex: 'app_token',
      responsive: ['md'] as ('md')[],
      render: (v: string) => <Text style={{ fontSize: 12, color: 'var(--text-secondary)' }} copyable>{v}</Text>,
    },
    {
      title: 'Tables',
      dataIndex: 'tables_count',
      width: 70,
      render: (v: number) => v || '-',
    },
    {
      title: 'Fields',
      dataIndex: 'fields_count',
      width: 70,
      responsive: ['md'] as ('md')[],
      render: (v: number) => v || '-',
    },
    {
      title: 'Schedule',
      dataIndex: 'schedule',
      width: 140,
      responsive: ['lg'] as ('lg')[],
      render: (v: string) => (
        <Text style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
          {describeSchedule(v)}
        </Text>
      ),
    },
    {
      title: 'Last Analysis',
      dataIndex: 'last_analysis_at',
      width: 140,
      responsive: ['lg'] as ('lg')[],
      render: (v: string | null) => (
        <Text style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          {v ? new Date(v).toLocaleString('vi-VN') : 'Never'}
        </Text>
      ),
    },
    {
      title: 'Actions',
      width: 240,
      render: (_: unknown, record: BaseReg) => {
        const hasAnalysis = !!record.last_analysis_at;
        return (
          <Space size="small" wrap>
            <Button size="small" icon={<SearchOutlined />} onClick={() => handleFetchSchema(record)}>
              Schema
            </Button>
            {hasAnalysis ? (
              <Button size="small" type="default" icon={<EyeOutlined />} onClick={() => {
                window.location.href = `/ba/analyses?base_id=${record._id}`;
              }}>
                View
              </Button>
            ) : null}
            <Button size="small" type="primary" icon={<ThunderboltOutlined />} onClick={() => openAnalyzeForm(record)}>
              {hasAnalysis ? 'Re-analyze' : 'Analyze'}
            </Button>
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)} />
            <Popconfirm title="Delete this base?" onConfirm={() => handleDelete(record._id)}>
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

  const FormFields = ({ formInstance }: { formInstance: ReturnType<typeof Form.useForm>[0] }) => {
    const selectedApp = Form.useWatch('lark_app_config_id', formInstance);
    return (
      <>
        <Form.Item name="name" label="Name" rules={[{ required: true }]}>
          <Input placeholder="e.g., Main Business Base" />
        </Form.Item>
        <Form.Item name="app_token" label="App Token" rules={[{ required: true }]}>
          <Input placeholder="Lark Base app_token" />
        </Form.Item>
        <Form.Item name="lark_app_config_id" label="Lark App">
          <Select allowClear placeholder="Select Lark App">
            {larkApps.map(a => (
              <Select.Option key={a._id} value={a._id}>{a.name} ({a.lark_app_id})</Select.Option>
            ))}
          </Select>
        </Form.Item>
        {!selectedApp && (
          <>
            <Form.Item name="lark_app_id" label="Lark App ID" rules={[{ required: true, message: 'Select a Lark App or enter ID' }]}>
              <Input placeholder="cli_xxx" />
            </Form.Item>
            <Form.Item name="lark_app_secret" label="Lark App Secret" rules={[{ required: true, message: 'Enter secret' }]}>
              <Input.Password placeholder="App secret" />
            </Form.Item>
          </>
        )}
        <Form.Item name="description" label="Description">
          <Input.TextArea rows={2} placeholder="Optional description" />
        </Form.Item>
        <Form.Item name="schedule" label="Auto Analysis Schedule">
          <Select placeholder="Select frequency" allowClear>
            {SCHEDULE_PRESETS.map(p => (
              <Select.Option key={p.value} value={p.value}>
                {p.label}{p.value ? ` (${p.value})` : ''}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>
        <Form.Item name="webhook_url" label="Webhook URL (Notification)">
          <Input placeholder="https://open.larksuite.com/open-apis/bot/v2/hook/..." allowClear />
        </Form.Item>
        <Row gutter={12}>
          <Col span={12}>
            <Form.Item name="notify_on_complete" label="Notify on Complete" valuePropName="checked">
              <Switch defaultChecked />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="notify_on_fail" label="Notify on Fail" valuePropName="checked">
              <Switch defaultChecked />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item
          name="notify_template"
          label="Custom Message Template"
          extra="Variables: {base_name} {tables_count} {fields_count} {duration} {summary} {analyzed} {cached} {error}"
        >
          <Input.TextArea rows={2} placeholder="vd: **{base_name}** done! {tables_count} tables in {duration}" />
        </Form.Item>
        <Form.Item name="wiki_space_id" label="Wiki Space ID">
          <Input placeholder="Lark Wiki Space ID (auto-create nếu để trống)" allowClear />
        </Form.Item>
        <Form.Item name="wiki_doc_token" label="Wiki Doc Token">
          <Input placeholder="Target doc token (auto-create nếu để trống)" allowClear />
        </Form.Item>
        <Form.Item name="wiki_auto_publish" label="Auto-publish to Wiki" valuePropName="checked">
          <Switch />
        </Form.Item>
      </>
    );
  };

  // Schema preview: field columns
  const fieldColumns = [
    {
      title: 'Field',
      dataIndex: 'field_name',
      render: (v: string, r: Record<string, unknown>) => (
        <Space size={4}>
          <Text strong={r.is_primary as boolean} style={{ color: 'var(--foreground)', fontSize: 13 }}>
            {r.is_primary ? '🔑 ' : ''}{v}
          </Text>
          {Boolean(r._isCustom) && <Tag color="cyan" style={{ fontSize: 9, lineHeight: '14px', padding: '0 4px', margin: 0 }}>custom</Tag>}
          {Boolean(r._tableId) && editedFields[`${r._tableId as string}:${r.field_id as string}`] && (
            <Tag color="geekblue" style={{ fontSize: 9, lineHeight: '14px', padding: '0 4px', margin: 0 }}>edited</Tag>
          )}
        </Space>
      ),
    },
    {
      title: 'Type',
      dataIndex: 'type_name',
      width: 120,
      render: (v: string) => <Tag color={FIELD_TYPE_COLORS[v] || 'default'}>{v}</Tag>,
    },
    {
      title: 'Details',
      width: 260,
      render: (_: unknown, r: Record<string, unknown>) => {
        const fieldKey = (r._tableId && r.field_id) ? `${r._tableId}:${r.field_id}` : '';
        const edited = fieldKey ? editedFields[fieldKey] : undefined;
        const parts: string[] = [];
        if (r.formula) parts.push(`= ${(r.formula as string).slice(0, 60)}`);
        if (r.options && Array.isArray(r.options) && (r.options as string[]).length > 0)
          parts.push((r.options as string[]).slice(0, 5).join(', '));
        const prop = r.property as Record<string, unknown> | undefined;
        if (prop?.table_id) parts.push(`→ linked table`);
        if (r.description) parts.push(r.description as string);
        if (edited?.note) parts.push(edited.note);

        // Inline edit mode
        if (editingFieldKey === fieldKey && fieldKey) {
          return (
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <Input size="small" placeholder="Ghi chú..." value={editFieldNote}
                onChange={e => setEditFieldNote(e.target.value)} autoFocus style={{ fontSize: 11, flex: 1 }}
                onPressEnter={() => {
                  if (editFieldNote.trim()) {
                    setEditedFields(prev => ({ ...prev, [fieldKey]: { ...prev[fieldKey], note: editFieldNote.trim() } }));
                  } else {
                    setEditedFields(prev => { const n = { ...prev }; delete n[fieldKey]; return n; });
                  }
                  setEditingFieldKey(null); setEditFieldNote('');
                }} />
              <Button size="small" type="primary" style={{ fontSize: 10, padding: '0 6px' }} onClick={() => {
                if (editFieldNote.trim()) {
                  setEditedFields(prev => ({ ...prev, [fieldKey]: { ...prev[fieldKey], note: editFieldNote.trim() } }));
                } else {
                  setEditedFields(prev => { const n = { ...prev }; delete n[fieldKey]; return n; });
                }
                setEditingFieldKey(null); setEditFieldNote('');
              }}>OK</Button>
              <Button size="small" style={{ fontSize: 10, padding: '0 4px' }} onClick={() => { setEditingFieldKey(null); setEditFieldNote(''); }}>✕</Button>
            </div>
          );
        }

        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Text style={{ fontSize: 11, color: parts.length > 0 ? 'var(--text-secondary)' : 'var(--text-tertiary)', flex: 1 }}>
              {parts.filter(Boolean).length > 0 ? parts.filter(Boolean).join(' | ') : '-'}
            </Text>
            {fieldKey && !r._isCustom && (
              <Button size="small" type="text" style={{ fontSize: 10, padding: '0 3px', color: 'var(--text-tertiary)' }}
                onClick={() => { setEditingFieldKey(fieldKey); setEditFieldNote(edited?.note || ''); }}>
                ✏️
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <Title level={3} style={{ color: 'var(--foreground)', margin: 0 }}>
          <DatabaseOutlined /> Registered Bases
        </Title>
        <Space wrap>
          <Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setCreateOpen(true); }}>
            Register Base
          </Button>
        </Space>
      </div>

      <Card style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }} styles={{ body: { padding: 0 } }}>
        <Table
          dataSource={bases}
          columns={columns}
          rowKey="_id"
          loading={loading}
          pagination={false}
          size="small"
          scroll={{ x: 600 }}
          rowSelection={{
            selectedRowKeys: selectedIds,
            onChange: (keys) => setSelectedIds(keys as string[]),
          }}
        />
      </Card>

      {/* Activity History — schema fetches, edits, exports */}
      {activityLog.length > 0 && (
        <Card
          size="small"
          style={{ marginTop: 16, background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
          title={
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Space>
                <ClockCircleOutlined />
                <span style={{ fontSize: 13, fontWeight: 600 }}>Lịch sử hoạt động ({activityLog.length})</span>
              </Space>
              <Button size="small" type="text" danger onClick={() => { setActivityLog([]); localStorage.removeItem('ba_bases_activity_log'); }}>
                Xóa lịch sử
              </Button>
            </div>
          }
        >
          <div style={{ maxHeight: 260, overflow: 'auto' }}>
            {activityLog.slice(0, 50).map(entry => {
              const actionLabels: Record<string, { label: string; color: string }> = {
                fetch_schema: { label: 'Fetch Schema', color: 'blue' },
                refresh_schema: { label: 'Refresh Schema', color: 'cyan' },
                analyze: { label: 'Analyze', color: 'purple' },
                export: { label: 'Export', color: 'green' },
                add_table: { label: 'Thêm bảng', color: 'orange' },
                add_field: { label: 'Thêm field', color: 'orange' },
                edit_table: { label: 'Sửa bảng', color: 'geekblue' },
                edit_field: { label: 'Sửa field', color: 'geekblue' },
                add_workflow: { label: 'Thêm workflow', color: 'gold' },
                add_automation: { label: 'Thêm automation', color: 'gold' },
              };
              const info = actionLabels[entry.action] || { label: entry.action, color: 'default' };
              const timeStr = new Date(entry.time).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
              return (
                <div key={entry.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: '1px solid var(--border-color)' }}>
                  <Text style={{ fontSize: 11, color: 'var(--text-tertiary)', minWidth: 90, whiteSpace: 'nowrap' }}>{timeStr}</Text>
                  <Tag color={info.color} style={{ fontSize: 10, margin: 0 }}>{info.label}</Tag>
                  <Text style={{ fontSize: 12, color: 'var(--foreground)', fontWeight: 500 }}>{entry.base_name}</Text>
                  {entry.detail && <Text style={{ fontSize: 11, color: 'var(--text-secondary)' }}>— {entry.detail}</Text>}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Floating action bar for batch operations */}
      {selectedIds.length > 0 && (
        <div style={{
          position: 'fixed',
          bottom: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 100,
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: 12,
          padding: '10px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
        }}>
          <Text style={{ color: 'var(--foreground)', fontWeight: 600, fontSize: 13 }}>
            {selectedIds.length} selected
          </Text>
          <Button
            type="primary"
            icon={<SearchOutlined />}
            loading={batchFetching}
            onClick={() => handleBatchFetch(false)}
          >
            Fetch Schema ({selectedIds.length})
          </Button>
          <Button
            icon={<ReloadOutlined />}
            loading={batchFetching}
            onClick={() => handleBatchFetch(true)}
          >
            Refresh from Lark
          </Button>
          <Button
            icon={<ClearOutlined />}
            onClick={() => setSelectedIds([])}
          >
            Clear
          </Button>
          {Array.from(batchResults.values()).some(r => r.status === 'done') && (
            <Button size="small" icon={<DownloadOutlined />} onClick={() => {
              const doneItems = Array.from(batchResults.entries()).filter(([, r]) => r.status === 'done' && r.schema);
              doneItems.forEach(([id, r]) => {
                const base = bases.find(b => b._id === id);
                const name = base?.name || id;
                const clean = _cleanRawSchema(r.schema!);
                const json = JSON.stringify(clean, null, 2);
                const blob = new Blob([json], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = `schema_${name.replace(/[^\w\u00C0-\u024F\u1E00-\u1EFF-]/g, '_')}.json`; a.click();
                URL.revokeObjectURL(url);
              });
              message.success(`Downloaded ${doneItems.length} schemas`);
            }}>
              Download ({Array.from(batchResults.values()).filter(r => r.status === 'done').length})
            </Button>
          )}
        </div>
      )}

      {/* Batch results — collapsible panels below the table */}
      {batchResults.size > 0 && (
        <Card
          style={{ marginTop: 16, background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
          title={
            <Space>
              <DatabaseOutlined />
              <span>Batch Schema Results ({Array.from(batchResults.values()).filter(r => r.status === 'done').length}/{batchResults.size})</span>
              <Button size="small" type="text" onClick={() => setBatchResults(new Map())} icon={<ClearOutlined />}>
                Clear Results
              </Button>
            </Space>
          }
          size="small"
        >
          <Collapse
            size="small"
            items={Array.from(batchResults.entries())
              .filter(([, r]) => r.status === 'done' || r.status === 'error')
              .map(([id, r]) => {
                const base = bases.find(b => b._id === id);
                const name = base?.name || id.slice(0, 8);
                const s = r.schema;
                return {
                  key: id,
                  label: (
                    <Space>
                      {r.status === 'done' ? (
                        <CheckCircleOutlined style={{ color: '#52c41a' }} />
                      ) : (
                        <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
                      )}
                      <Text strong style={{ color: 'var(--foreground)' }}>{name}</Text>
                      {s && (
                        <>
                          <Tag>{s.tables_count} tables</Tag>
                          <Tag color="blue">{s.fields_count} fields</Tag>
                          {(s.automations_count || s.workflows_count) ? <Tag color="purple">{s.automations_count || s.workflows_count} automations</Tag> : null}
                          {s.external_tables_count ? <Tag color="orange">{s.external_tables_count} synced</Tag> : null}
                          {(s.relationships as unknown[])?.length ? <Tag color="gold">{(s.relationships as unknown[]).length} rels</Tag> : null}
                        </>
                      )}
                      {r.status === 'error' && <Tag color="red">{r.error}</Tag>}
                    </Space>
                  ),
                  children: r.status === 'error' ? (
                    <Text style={{ color: '#ff4d4f' }}>Error: {r.error}</Text>
                  ) : s ? (
                    <div>
                      {/* Relationships */}
                      {s.relationships && (s.relationships as Record<string, string>[]).length > 0 && (
                        <Card size="small" style={{ marginBottom: 8, background: 'var(--bg-tertiary)', borderColor: 'var(--border-color)' }}>
                          <Text strong style={{ color: 'var(--foreground)', fontSize: 13 }}>
                            <LinkOutlined /> Relationships
                          </Text>
                          <div style={{ marginTop: 6 }}>
                            {(s.relationships as Record<string, string>[]).map((rel, i) => (
                              <Tag key={i} color="gold" style={{ marginBottom: 4 }}>
                                {rel.from_table_name || '?'}.{rel.from_field || '?'} {rel.link_type === 'duplex' ? '\u2194' : '\u2192'} {rel.to_table_name || '?'}
                              </Tag>
                            ))}
                          </div>
                        </Card>
                      )}
                      {/* Automations */}
                      {(s.automations || s.workflows || []).length > 0 && (
                        <Card size="small" style={{ marginBottom: 8, background: 'var(--bg-tertiary)', borderColor: 'var(--border-color)' }}>
                          <Text strong style={{ color: 'var(--foreground)', fontSize: 13 }}>
                            <ThunderboltOutlined /> Automations ({(s.automations || s.workflows || []).length})
                          </Text>
                          <div style={{ marginTop: 6 }}>
                            {(s.automations || s.workflows || []).map((w, i) => (
                              <Tag key={i} color={w.status === 'Enable' ? 'green' : 'default'} style={{ marginBottom: 4 }}>
                                {w.title} {w.status === 'Enable' ? '\u2713' : `(${w.status})`}
                              </Tag>
                            ))}
                          </div>
                        </Card>
                      )}
                      {/* External tables */}
                      {s.external_tables && s.external_tables.length > 0 && (
                        <Card size="small" style={{ marginBottom: 8, background: 'var(--bg-tertiary)', borderColor: 'var(--border-color)' }}>
                          <Text strong style={{ color: 'var(--foreground)', fontSize: 13 }}>
                            <DatabaseOutlined /> Synced/External ({s.external_tables.length})
                          </Text>
                          <div style={{ marginTop: 6 }}>
                            {s.external_tables.map((ext, i) => (
                              <Tag key={i} color="purple" style={{ marginBottom: 4 }}>
                                {ext.name} ({ext.fields_count || 0} fields)
                              </Tag>
                            ))}
                          </div>
                        </Card>
                      )}
                      {/* Tables */}
                      <Collapse
                        size="small"
                        items={s.tables.map(t => ({
                          key: t.table_id,
                          label: (
                            <Space>
                              <Text strong style={{ color: 'var(--foreground)' }}>{t.name}</Text>
                              <Tag>{((t.fields as unknown[]) || []).length} fields</Tag>
                              {t.views && t.views.length > 0 && <Tag color="blue">{t.views.length} views</Tag>}
                            </Space>
                          ),
                          children: (
                            <div>
                              {t.views && t.views.length > 0 && (
                                <div style={{ marginBottom: 8 }}>
                                  <Text style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Views: </Text>
                                  {t.views.map((v, vi) => (
                                    <Tag key={vi} color={v.view_type === 'form' ? 'orange' : v.view_type === 'gantt' ? 'purple' : 'default'} style={{ fontSize: 11 }}>
                                      {v.view_name} ({v.view_type})
                                    </Tag>
                                  ))}
                                </div>
                              )}
                              <Table
                                dataSource={(t.fields as Record<string, unknown>[]) || []}
                                columns={fieldColumns}
                                rowKey="field_id"
                                pagination={false}
                                size="small"
                                showHeader={true}
                              />
                            </div>
                          ),
                        }))}
                      />
                    </div>
                  ) : null,
                };
              })
            }
          />
        </Card>
      )}

      {/* Create Modal */}
      <Modal
        title="Register Lark Base"
        open={createOpen}
        onOk={handleCreate}
        onCancel={() => setCreateOpen(false)}
        confirmLoading={saving}
        width="95vw"
        style={{ maxWidth: 550 }}
      >
        <Form form={form} layout="vertical" size="small">
          <FormFields formInstance={form} />
        </Form>
      </Modal>

      {/* Edit Modal */}
      <Modal
        title="Edit Base"
        open={editOpen}
        onOk={handleEdit}
        onCancel={() => setEditOpen(false)}
        confirmLoading={saving}
        width="95vw"
        style={{ maxWidth: 550 }}
      >
        <Form form={editForm} layout="vertical" size="small">
          <FormFields formInstance={editForm} />
        </Form>
      </Modal>

      {/* Analyze Config Modal */}
      <Modal
        title={<><ThunderboltOutlined style={{ color: '#6366f1' }} /> Analyze: {analyzeBase?.name}</>}
        open={analyzeOpen}
        onCancel={() => setAnalyzeOpen(false)}
        onOk={handleTriggerAnalysis}
        okText="Start Analysis"
        okButtonProps={{ loading: analyzing, icon: <ThunderboltOutlined /> }}
        width={480}
      >
        <Form form={analyzeForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="ai_provider" label="AI Provider">
            <Radio.Group optionType="button" buttonStyle="solid">
              <Radio.Button value="auto">
                Auto (Ollama → Claude)
              </Radio.Button>
              <Radio.Button value="ollama">
                Ollama (Free)
              </Radio.Button>
              <Radio.Button value="claude">
                Claude (Paid)
              </Radio.Button>
            </Radio.Group>
          </Form.Item>
          <Form.Item
            name="ai_model"
            label="Model Override"
            extra="Để trống = dùng model mặc định của provider"
          >
            <Input placeholder="vd: llama3, claude-sonnet-4-20250514" allowClear />
          </Form.Item>
          <Form.Item name="include_sample_data" label="Include Sample Data" valuePropName="checked">
            <Switch checkedChildren="Yes" unCheckedChildren="No" />
          </Form.Item>
          <div style={{ padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
            <strong>Auto:</strong> Ollama phân tích trước (miễn phí, đã tích lũy knowledge). Nếu confidence thấp → fallback sang Claude.<br />
            <strong>Ollama:</strong> Chỉ dùng Ollama — nhanh, miễn phí, phù hợp khi đã train đủ.<br />
            <strong>Claude:</strong> Chỉ dùng Claude — chính xác nhất, tốn credit.
          </div>
        </Form>
      </Modal>

      {/* Schema Preview Modal — Full Detail */}
      <Modal
        title={preview ? `Schema: ${preview.tables_count} tables${preview.external_tables_count ? ` + ${preview.external_tables_count} synced` : ''}, ${preview.fields_count} fields${(preview.automations_count || preview.workflows_count) ? `, ${preview.automations_count || preview.workflows_count} automations` : ''}` : 'Schema Preview'}
        open={previewOpen}
        onCancel={() => { setPreviewOpen(false); setWorkflowGroups([]); setAutomationGroups([]); setCustomTables([]); setEditedTables({}); setCustomFields({}); setEditedFields({}); currentPreviewAppToken.current = ''; }}
        footer={preview ? (
          <Space>
            <Text style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
              {preview.relationships?.length || 0} relationships
              {(preview.automations_count || preview.workflows_count) ? ` · ${preview.automations_count || preview.workflows_count} automations` : ''}
              {preview.external_tables_count ? ` · ${preview.external_tables_count} synced` : ''}
              {(preview as SchemaPreview & { cached?: boolean }).cached ? ' (cached)' : ''}
            </Text>
            <Button icon={<DownloadOutlined />} onClick={handleExportSchema}>
              Export JSON
            </Button>
            <Button icon={<FunctionOutlined />} onClick={handleExportPrompt} type="primary" ghost>
              Prompt (Full)
            </Button>
            <Button icon={<DiffOutlined />} onClick={handleExportUpdatePrompt} style={{ borderColor: 'var(--warning)', color: 'var(--warning)' }}>
              Prompt (Update)
            </Button>
            <Button icon={<ReloadOutlined />} onClick={() => {
              const base = bases.find(b => b.app_token === preview.app_token);
              if (base) handleFetchSchema(base, true);
            }} loading={previewLoading}>
              Refresh from Lark
            </Button>
            <Button onClick={() => { setPreviewOpen(false); setWorkflowGroups([]); setAutomationGroups([]); setCustomTables([]); setEditedTables({}); setCustomFields({}); setEditedFields({}); currentPreviewAppToken.current = ''; }}>Close</Button>
          </Space>
        ) : null}
        width="95vw"
        style={{ maxWidth: 900 }}
      >
        {previewLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Text style={{ color: 'var(--text-secondary)' }}>Fetching schema from Lark API...</Text>
          </div>
        ) : preview ? (
          <div style={{ maxHeight: '70vh', overflow: 'auto' }}>
            {/* Relationships summary */}
            {preview.relationships && (preview.relationships as Record<string, string>[]).length > 0 && (
              <Card size="small" style={{ marginBottom: 12, background: 'var(--bg-tertiary)', borderColor: 'var(--border-color)' }}>
                <Text strong style={{ color: 'var(--foreground)', fontSize: 13 }}>
                  <LinkOutlined /> Relationships
                </Text>
                <div style={{ marginTop: 8 }}>
                  {(preview.relationships as Record<string, string>[]).map((r, i) => (
                    <Tag key={i} color="gold" style={{ marginBottom: 4 }}>
                      {r.from_table_name || '?'}.{r.from_field || '?'} {r.link_type === 'duplex' ? '↔' : '→'} {r.to_table_name || '?'}
                    </Tag>
                  ))}
                </div>
              </Card>
            )}

            {/* Automations (Lark API only returns automations, NOT process workflows) */}
            {(preview.automations || preview.workflows || []).length > 0 && (
              <Card size="small" style={{ marginBottom: 12, background: 'var(--bg-tertiary)', borderColor: 'var(--border-color)' }}>
                <Text strong style={{ color: 'var(--foreground)', fontSize: 13, display: 'block', marginBottom: 8 }}>
                  <ThunderboltOutlined /> Automations ({(preview.automations || preview.workflows || []).length})
                </Text>
                <Collapse
                  size="small"
                  ghost
                  items={(preview.automations || preview.workflows || []).map((w: Record<string, unknown>, i: number) => ({
                    key: String(i),
                    label: (
                      <Space size={4}>
                        <Tag color={w.status === 'Enable' ? 'green' : 'default'} style={{ marginRight: 0 }}>
                          {w.status === 'Enable' ? '✓' : '✗'}
                        </Tag>
                        <Text style={{ fontSize: 13, color: 'var(--foreground)' }}>{w.title as string}</Text>
                        {Boolean(w.trigger_table_name) && (
                          <Text style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                            → {w.trigger_table_name as string}
                          </Text>
                        )}
                      </Space>
                    ),
                    children: (
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        {Boolean(w.trigger_type) && <div><strong>Trigger:</strong> {w.trigger_type as string}</div>}
                        {Boolean(w.trigger_table_name) && <div><strong>Table:</strong> {w.trigger_table_name as string}</div>}
                        {Array.isArray(w.actions) && (w.actions as Array<Record<string, unknown>>).length > 0 && (
                          <div style={{ marginTop: 4 }}>
                            <strong>Actions:</strong>
                            <ul style={{ margin: '4px 0', paddingLeft: 20 }}>
                              {(w.actions as Array<Record<string, unknown>>).map((a, j) => (
                                <li key={j}>{a.type as string || a.action_type as string || JSON.stringify(a)}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {!w.trigger_type && !w.actions && (
                          <Text style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                            Chi tiết không khả dụng — Lark API giới hạn
                          </Text>
                        )}
                      </div>
                    ),
                  }))}
                />
              </Card>
            )}
            {/* Automation permission error */}
            {(preview.automations_error || preview.workflows_error) && (
              <Card size="small" style={{ marginBottom: 12, background: 'var(--bg-tertiary)', borderColor: '#faad14' }}>
                <Text style={{ color: '#faad14', fontSize: 12 }}>
                  <ThunderboltOutlined /> Automations: {preview.automations_error || preview.workflows_error}
                </Text>
              </Card>
            )}

            {/* Workflow Builder — visual node-based (replaces screenshot approach) */}
            <Card size="small" style={{ marginBottom: 12, background: 'var(--bg-tertiary)', borderColor: 'var(--border-color)' }}>
              <Text strong style={{ color: 'var(--foreground)', fontSize: 13, display: 'block', marginBottom: 8 }}>
                <ApartmentOutlined /> Workflow Builder
              </Text>
              <LarkWorkflowBuilder
                appToken={preview?.app_token || ''}
                baseName={bases.find(b => b.app_token === preview?.app_token)?.name || ''}
                tables={(preview?.tables || []).map(t => ({
                  table_id: t.table_id,
                  name: t.name,
                  fields: (t.fields || []).map((f: any) => ({
                    field_id: (f.field_id || f.fieldId || '') as string,
                    field_name: (f.field_name || f.name || '') as string,
                    type_name: (f.type_name || f.typeName || 'Text') as string,
                  })),
                }))}
                storageKey={_storageKey(currentPreviewAppToken.current || preview?.app_token || '', 'workflowNodes')}
                category="workflow"
              />
            </Card>

            {/* Automation Builder — visual node-based */}
            <Card size="small" style={{ marginBottom: 12, background: 'var(--bg-tertiary)', borderColor: 'var(--border-color)' }}>
              <Text strong style={{ color: 'var(--foreground)', fontSize: 13, display: 'block', marginBottom: 8 }}>
                <ThunderboltOutlined /> Automation Builder
              </Text>
              <LarkWorkflowBuilder
                appToken={preview?.app_token || ''}
                baseName={bases.find(b => b.app_token === preview?.app_token)?.name || ''}
                tables={(preview?.tables || []).map(t => ({
                  table_id: t.table_id,
                  name: t.name,
                  fields: (t.fields || []).map((f: any) => ({
                    field_id: (f.field_id || f.fieldId || '') as string,
                    field_name: (f.field_name || f.name || '') as string,
                    type_name: (f.type_name || f.typeName || 'Text') as string,
                  })),
                }))}
                storageKey={_storageKey(currentPreviewAppToken.current || preview?.app_token || '', 'automationNodes')}
                category="automation"
              />
            </Card>


            {/* External/Synced tables */}
            {preview.external_tables && preview.external_tables.length > 0 && (
              <Card size="small" style={{ marginBottom: 12, background: 'var(--bg-tertiary)', borderColor: 'var(--border-color)' }}>
                <Text strong style={{ color: 'var(--foreground)', fontSize: 13 }}>
                  <DatabaseOutlined /> Synced/External Tables ({preview.external_tables.length})
                </Text>
                <div style={{ marginTop: 8 }}>
                  {preview.external_tables.map((ext, i) => (
                    <Tag key={i} color="purple" style={{ marginBottom: 4 }}>
                      {ext.name} ({ext.fields_count || 0} fields)
                      {ext.linked_from_tables?.length ? ` ← ${ext.linked_from_tables.join(', ')}` : ''}
                    </Tag>
                  ))}
                </div>
              </Card>
            )}

            {/* Tables with expandable fields + views + add fields + custom tables */}
            {(() => {
              // Merge Lark tables + custom tables
              const larkTables = preview.tables.map(t => ({
                table_id: t.table_id,
                name: editedTables[t.table_id]?.name || t.name,
                originalName: t.name,
                fields: t.fields as Record<string, unknown>[],
                views: t.views,
                _isCustom: false,
                _isRenamed: !!editedTables[t.table_id]?.name,
                _note: editedTables[t.table_id]?.note,
              }));
              const customTableItems = customTables.map(ct => ({
                table_id: ct.table_id,
                name: ct.name,
                originalName: ct.name,
                fields: [] as Record<string, unknown>[],
                views: undefined as typeof preview.tables[0]['views'] | undefined,
                _isCustom: true,
                _isRenamed: false,
                _note: ct.description,
              }));
              const allTables = [...larkTables, ...customTableItems];

              return (
                <>
                <Collapse
                  size="small"
                  items={allTables.map(t => {
                    const extras = customFields[t.table_id] || [];
                    const allFields = [
                      ...t.fields.map(f => ({ ...f, _tableId: t.table_id })),
                      ...extras.map((f, i) => ({
                        field_id: `custom_${t.table_id}_${i}_${f.field_name}`,
                        field_name: f.field_name,
                        type_name: f.type_name,
                        description: f.description,
                        is_primary: false,
                        _isCustom: true,
                        _customIdx: i,
                        _tableId: t.table_id,
                      })),
                    ];
                    return {
                      key: t.table_id,
                      label: (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          {/* Inline rename for tables */}
                          {editingTableId === t.table_id ? (
                            <Space size={4}>
                              <Input size="small" value={editTableName} onChange={e => setEditTableName(e.target.value)}
                                style={{ width: 180, fontWeight: 600 }} autoFocus
                                onClick={e => e.stopPropagation()}
                                onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setEditingTableId(null); } }}
                                onPressEnter={() => {
                                  if (editTableName.trim()) {
                                    if (t._isCustom) {
                                      setCustomTables(prev => prev.map(ct => ct.table_id === t.table_id ? { ...ct, name: editTableName.trim() } : ct));
                                    } else {
                                      setEditedTables(prev => ({ ...prev, [t.table_id]: { ...prev[t.table_id], name: editTableName.trim() } }));
                                    }
                                  }
                                  setEditingTableId(null);
                                }} />
                              <Button size="small" type="primary" style={{ fontSize: 10, padding: '0 6px' }} onClick={(e) => {
                                e.stopPropagation();
                                if (editTableName.trim()) {
                                  if (t._isCustom) {
                                    setCustomTables(prev => prev.map(ct => ct.table_id === t.table_id ? { ...ct, name: editTableName.trim() } : ct));
                                  } else {
                                    setEditedTables(prev => ({ ...prev, [t.table_id]: { ...prev[t.table_id], name: editTableName.trim() } }));
                                  }
                                }
                                setEditingTableId(null);
                              }}>OK</Button>
                              <Button size="small" style={{ fontSize: 10, padding: '0 4px' }} onClick={(e) => { e.stopPropagation(); setEditingTableId(null); }}>✕</Button>
                            </Space>
                          ) : (
                            <Space size={4}>
                              <Text strong style={{ color: 'var(--foreground)' }}>
                                {t.name}
                              </Text>
                              {t._isRenamed && (
                                <Text style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>({t.originalName})</Text>
                              )}
                              <Button size="small" type="text" style={{ fontSize: 10, padding: '0 3px', color: 'var(--text-tertiary)' }}
                                onClick={(e) => { e.stopPropagation(); setEditingTableId(t.table_id); setEditTableName(t.name); }}>
                                ✏️
                              </Button>
                            </Space>
                          )}
                          <Tag>{t.fields.length}{extras.length > 0 ? `+${extras.length}` : ''} fields</Tag>
                          {t.views && t.views.length > 0 && (
                            <Tag color="blue">{t.views.length} views</Tag>
                          )}
                          {t._isCustom && <Tag color="cyan" style={{ fontSize: 9, lineHeight: '14px', padding: '0 4px' }}>custom</Tag>}
                          {t._isRenamed && <Tag color="geekblue" style={{ fontSize: 9, lineHeight: '14px', padding: '0 4px' }}>edited</Tag>}
                          {t._note && <Text style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{t._note}</Text>}
                          {/* Delete custom table */}
                          {t._isCustom && (
                            <Popconfirm title={`Xóa bảng "${t.name}"?`} onConfirm={(e) => {
                              e?.stopPropagation();
                              setCustomTables(prev => prev.filter(ct => ct.table_id !== t.table_id));
                              setCustomFields(prev => { const n = { ...prev }; delete n[t.table_id]; return n; });
                            }}>
                              <Button size="small" type="text" danger style={{ fontSize: 10, padding: '0 3px' }}
                                onClick={e => e.stopPropagation()}>✕</Button>
                            </Popconfirm>
                          )}
                          {/* Reset edited table name */}
                          {t._isRenamed && (
                            <Button size="small" type="text" style={{ fontSize: 10, padding: '0 3px', color: 'var(--text-tertiary)' }}
                              title="Reset tên gốc"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditedTables(prev => { const n = { ...prev }; delete n[t.table_id]; return n; });
                              }}>↩</Button>
                          )}
                        </div>
                      ),
                      children: (
                        <div>
                          {t.views && t.views.length > 0 && (
                            <div style={{ marginBottom: 8 }}>
                              <Text style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Views: </Text>
                              {t.views.map((v, i) => (
                                <Tag key={i} color={v.view_type === 'form' ? 'orange' : v.view_type === 'gantt' ? 'purple' : 'default'} style={{ fontSize: 11 }}>
                                  {v.view_name} ({v.view_type})
                                </Tag>
                              ))}
                            </div>
                          )}
                          <Table
                            dataSource={allFields}
                            columns={[
                              ...fieldColumns,
                              {
                                title: '',
                                width: 40,
                                render: (_: unknown, r: Record<string, unknown>) => r._isCustom ? (
                                  <Button size="small" type="text" danger style={{ fontSize: 10, padding: 0 }}
                                    onClick={() => {
                                      const idx = typeof r._customIdx === 'number' ? r._customIdx : extras.findIndex(f => f.field_name === r.field_name && f.type_name === r.type_name);
                                      if (idx >= 0) setCustomFields(prev => ({ ...prev, [t.table_id]: (prev[t.table_id] || []).filter((_, i) => i !== idx) }));
                                    }}>✕</Button>
                                ) : null,
                              },
                            ]}
                            rowKey="field_id"
                            pagination={false}
                            size="small"
                            showHeader={true}
                            rowClassName={(r: Record<string, unknown>) => r._isCustom ? 'custom-field-row' : ''}
                          />
                          {/* Add field form */}
                          {addingFieldTable === t.table_id ? (
                            <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                              <Input size="small" placeholder="Tên field" value={newFieldName} onChange={e => setNewFieldName(e.target.value)} style={{ width: 160 }} />
                              <Select size="small" value={newFieldType} onChange={v => setNewFieldType(v)} style={{ width: 120 }}>
                                {Object.keys(FIELD_TYPE_COLORS).map(ft => (
                                  <Select.Option key={ft} value={ft}>{ft}</Select.Option>
                                ))}
                              </Select>
                              <Input size="small" placeholder="Mô tả (tùy chọn)" value={newFieldDesc} onChange={e => setNewFieldDesc(e.target.value)} style={{ width: 200 }} />
                              <Button size="small" type="primary" disabled={!newFieldName.trim()} onClick={() => {
                                if (!newFieldName.trim()) return;
                                setCustomFields(prev => ({
                                  ...prev,
                                  [t.table_id]: [...(prev[t.table_id] || []), { field_name: newFieldName.trim(), type_name: newFieldType, description: newFieldDesc.trim() }],
                                }));
                                setNewFieldName(''); setNewFieldType('Text'); setNewFieldDesc('');
                              }}>Thêm</Button>
                              <Button size="small" onClick={() => { setAddingFieldTable(null); setNewFieldName(''); setNewFieldDesc(''); }}>Hủy</Button>
                            </div>
                          ) : (
                            <Button size="small" type="dashed" icon={<PlusOutlined />} style={{ marginTop: 8 }}
                              onClick={() => { setAddingFieldTable(t.table_id); setNewFieldName(''); setNewFieldType('Text'); setNewFieldDesc(''); }}>
                              Thêm field
                            </Button>
                          )}
                        </div>
                      ),
                    };
                  })}
                  defaultActiveKey={allTables.length <= 5 ? allTables.map(t => t.table_id) : []}
                />

                {/* Add new table */}
                {addingTable ? (
                  <div style={{ display: 'flex', gap: 6, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Input size="small" placeholder="Tên bảng" value={newTableName} onChange={e => setNewTableName(e.target.value)}
                      style={{ width: 200 }} autoFocus
                      onPressEnter={() => {
                        if (!newTableName.trim()) return;
                        const id = `custom_table_${Date.now()}`;
                        setCustomTables(prev => [...prev, { table_id: id, name: newTableName.trim(), description: newTableDesc.trim() }]);
                        setNewTableName(''); setNewTableDesc(''); setAddingTable(false);
                      }} />
                    <Input size="small" placeholder="Mô tả (tùy chọn)" value={newTableDesc} onChange={e => setNewTableDesc(e.target.value)} style={{ width: 240 }} />
                    <Button size="small" type="primary" disabled={!newTableName.trim()} onClick={() => {
                      const id = `custom_table_${Date.now()}`;
                      setCustomTables(prev => [...prev, { table_id: id, name: newTableName.trim(), description: newTableDesc.trim() }]);
                      setNewTableName(''); setNewTableDesc(''); setAddingTable(false);
                    }}>Thêm bảng</Button>
                    <Button size="small" onClick={() => { setAddingTable(false); setNewTableName(''); setNewTableDesc(''); }}>Hủy</Button>
                  </div>
                ) : (
                  <Button size="small" type="dashed" icon={<PlusOutlined />} style={{ marginTop: 10 }}
                    onClick={() => { setAddingTable(true); setNewTableName(''); setNewTableDesc(''); }}>
                    Thêm bảng mới
                  </Button>
                )}
                </>
              );
            })()}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
