'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Modal, Steps, Button, Input, Upload, Space, Typography, message, Tag,
  Row, Col, Select, Alert, Spin,
} from 'antd';
import {
  InboxOutlined, ThunderboltOutlined, CheckCircleOutlined, EyeOutlined,
  UploadOutlined, SaveOutlined, CloudUploadOutlined,
} from '@ant-design/icons';
import {
  uploadTemplate, deleteTemplate, createMapping, createRule, listConnections, sampleRecords, templateId,
  type Connection, type LarkField, type MappingCreate, type RuleCreate,
} from '@/lib/n8nApi';
import { colIndexToLetter } from '@/lib/fieldMatching';
import SpreadsheetEditor, { type FieldMapping } from './SpreadsheetEditor';

const { Text } = Typography;
const { Dragger } = Upload;

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  editTemplateId?: string;
  editTemplateName?: string;
  createBlank?: boolean;
}

export default function TemplateWizardModal({ open, onClose, onSuccess, editTemplateId, editTemplateName, createBlank }: Props) {
  const [step, setStep] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [parsing, setParsing] = useState(false);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  // Mapping
  const [connections, setConnections] = useState<Connection[]>([]);
  const [connLoading, setConnLoading] = useState(false);
  const [selectedConnId, setSelectedConnId] = useState('');
  const [mappingName, setMappingName] = useState('');
  const [activeSheet, setActiveSheet] = useState('');
  const [fieldMappings, setFieldMappings] = useState<FieldMapping[]>([]);

  // Preview
  const [sampleData, setSampleData] = useState<Record<string, unknown>[]>([]);
  const [loadingSamples, setLoadingSamples] = useState(false);

  const autoMatchRef = useRef<(() => void) | null>(null);
  const clearAllRef = useRef<(() => void) | null>(null);
  const saveSheetRef = useRef<(() => Promise<unknown[]>) | null>(null);
  const [savingTemplate, setSavingTemplate] = useState(false);

  // HTML Preview
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);

  // Pre-loaded Fortune Sheet data from MongoDB (bypasses xlsx re-parsing)
  const [storedSheets, setStoredSheets] = useState<unknown[] | undefined>(undefined);

  // Save + Test
  const [saving, setSaving] = useState(false);
  const [savedTemplateId, setSavedTemplateId] = useState('');
  const [savedMappingId, setSavedMappingId] = useState('');
  const [savedRuleId, setSavedRuleId] = useState('');
  const [savedGroupByField, setSavedGroupByField] = useState('');
  const [testGroupKey, setTestGroupKey] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; detail: string; downloadUrl?: string; pdfDownloadUrl?: string } | null>(null);
  const [testDownloadFormat, setTestDownloadFormat] = useState<'excel' | 'pdf' | 'both'>('excel');

  const selectedConn = connections.find(c => (c._id || c.id) === selectedConnId);
  const larkFields: LarkField[] = selectedConn?.cached_fields || [];

  // Load connections
  useEffect(() => {
    if (open && connections.length === 0) {
      setConnLoading(true);
      listConnections()
        .then(c => { setConnections(c); if (c.length === 1) setSelectedConnId(c[0]._id || c[0].id || ''); })
        .catch(() => {})
        .finally(() => setConnLoading(false));
    }
  }, [open, connections.length]);

  // Create Blank mode: generate empty xlsx and jump to editor
  useEffect(() => {
    if (!open || !createBlank || editTemplateId) return;
    (async () => {
      try {
        const XLSX = await import('xlsx');
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['']]), 'Sheet1');
        const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const blankFile = new File([blob], 'blank.xlsx');
        setFile(blankFile);
        setSheetNames(['Sheet1']);
        setActiveSheet('Sheet1');
        setName('New Template');
        setStep(1);
      } catch (e) {
        message.error(`Failed to create blank: ${e instanceof Error ? e.message : 'Unknown'}`);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, createBlank]);

  // Edit mode: load existing template
  useEffect(() => {
    if (!open || !editTemplateId) return;
    setName(editTemplateName || '');
    setStep(1);
    (async () => {
      setParsing(true);
      try {
        const { getTemplateSheets, downloadTemplateUrl, listMappings } = await import('@/lib/n8nApi');
        setSavedTemplateId(editTemplateId);

        // Load Fortune Sheet state from MongoDB (single source of truth)
        const sheets = await getTemplateSheets(editTemplateId);
        if (sheets && Array.isArray(sheets) && sheets.length > 0) {
          console.log('[Edit] Loaded Fortune Sheet data from MongoDB:', sheets.length, 'sheets');
          setStoredSheets(sheets);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const names = sheets.map((s: any) => s.name).filter(Boolean);
          setSheetNames(names);
          if (names.length > 0) setActiveSheet(names[0]);
        } else {
          // Fallback: download xlsx and parse (first open or legacy template)
          console.log('[Edit] No stored state, downloading xlsx for parse');
          const url = await downloadTemplateUrl(editTemplateId);
          const cacheBust = `${url.includes('?') ? '&' : '?'}_t=${Date.now()}`;
          const res = await fetch(url + cacheBust, { cache: 'no-store' });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const buffer = await res.arrayBuffer();
          const blob = new Blob([buffer]);
          setFile(new File([blob], `${editTemplateName || 'template'}.xlsx`));

          const XLSX = await import('xlsx');
          const wb = XLSX.read(buffer, { type: 'array' });
          setSheetNames(wb.SheetNames);
          if (wb.SheetNames.length > 0) setActiveSheet(wb.SheetNames[0]);
        }

        // Load existing mappings
        const allMappings = await listMappings();
        const tplMappings = allMappings.filter(m =>
          m.template_id === editTemplateId ||
          (!m.template_id && editTemplateName && m.name.startsWith(editTemplateName))
        );
        if (tplMappings.length > 0) {
          const existing = tplMappings[0];
          setMappingName(existing.name);
          if (existing.connection_id) setSelectedConnId(existing.connection_id);
          if (existing.target_sheet) setActiveSheet(existing.target_sheet);
          setSavedMappingId(existing._id);
          // Determine the sheet name for each mapping — use per-field target_sheet,
          // fall back to mapping-level target_sheet, then first sheet name
          const defaultSheet = existing.target_sheet || sheetNames[0] || '';
          const restored: FieldMapping[] = (existing.field_maps || []).map((fm) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const fmAny = fm as any;
            const colIdx = fm.excel_column ? fm.excel_column.split('').reduce((acc, ch) => acc * 26 + ch.charCodeAt(0) - 64, 0) - 1 : 0;
            const anchorRow = fmAny.anchor_row ? Number(fmAny.anchor_row) - 1 : 0;
            const mappingSheet = fmAny.target_sheet || defaultSheet;
            return {
              id: `${mappingSheet}:${anchorRow}:${colIdx}`,
              col: colIdx,
              row: anchorRow,
              lark_field: fm.lark_field, label: fm.excel_header,
              repeat: fm.scope === 'row',
              map_type: (fm.map_type as 'direct' | 'formula' | 'static') || 'direct',
              expression: fm.expression || undefined,
              sheet: mappingSheet,
            };
          });
          setFieldMappings(restored);
          message.info(`Loaded ${restored.length} mapped fields`);
        }

        // Load existing rule for this template
        const { listRules } = await import('@/lib/n8nApi');
        const allRules = await listRules();
        const tplRule = allRules.find(r => r.template_id === editTemplateId);
        if (tplRule) {
          setSavedRuleId(tplRule._id);
          const trigger = tplRule.trigger || {};
          if (trigger.group_by_field) setSavedGroupByField(trigger.group_by_field);
          const output = tplRule.output || {};
          if (output.lark_webhook_url) setWebhookUrl(output.lark_webhook_url);
        }
      } catch (e) {
        message.error(`Failed: ${e instanceof Error ? e.message : 'Unknown'}`);
      }
      setParsing(false);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editTemplateId]);

  // Parse uploaded file
  const handleFileSelect = useCallback(async (f: File) => {
    setFile(f);
    setParsing(true);
    try {
      const buffer = await f.arrayBuffer();
      const XLSX = await import('xlsx');
      const wb = XLSX.read(buffer, { type: 'array' });
      setSheetNames(wb.SheetNames);
      if (wb.SheetNames.length > 0) setActiveSheet(wb.SheetNames[0]);
      if (!name) setName(f.name.replace(/\.xlsx?$/i, ''));
    } catch (e) {
      message.error(`Parse failed: ${e instanceof Error ? e.message : 'Unknown'}`);
    }
    setParsing(false);
  }, [name]);

  /** Upload file immediately and save as template — no mapcells needed */
  const handleUploadAndSave = useCallback(async () => {
    if (!file) { message.warning('Chọn file trước'); return; }
    const tplName = name.trim() || file.name.replace(/\.xlsx?$/i, '');
    if (!tplName) { message.warning('Nhập tên template'); return; }

    setUploading(true);
    try {
      const tpl = await uploadTemplate(file, tplName, desc);
      const tId = templateId(tpl);
      if (tId) {
        setSavedTemplateId(tId);
        message.success('Template đã được lưu!');
        onSuccess(); // refresh list
        // Jump to editor
        setName(tplName);
        setMappingName(`${tplName} - ${activeSheet}`);
        setStep(1);
      } else {
        message.error('Upload thất bại');
      }
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Upload thất bại');
    }
    setUploading(false);
  }, [file, name, desc, activeSheet, onSuccess]);

  const fetchSamples = async () => {
    if (!selectedConnId) return;
    setLoadingSamples(true);
    try {
      setSampleData(await sampleRecords(selectedConnId, 5));
    } catch { message.error('Failed to fetch samples'); }
    setLoadingSamples(false);
  };

  // ─── Save Template ────────────────────────────────────────────

  /** Save: upload if new, then patch all edits (cells + styles + sheet deletions) */
  const handleSaveTemplate = async () => {
    if (!name.trim()) { message.warning('Enter a name first'); return; }
    setSavingTemplate(true);
    try {
      let tId = savedTemplateId || editTemplateId || '';

      // Upload original file if new template
      if (!tId && file) {
        const tpl = await uploadTemplate(file, name, desc);
        tId = templateId(tpl);
        if (tId) setSavedTemplateId(tId);
      }
      if (!tId) { message.warning('No file'); setSavingTemplate(false); return; }

      // Patch edits: cell values, styles, sheet deletions
      const { patchTemplateCells, updateTemplate } = await import('@/lib/n8nApi');

      if (saveSheetRef.current) {
        const sheetsData = await saveSheetRef.current();
        try { console.log('[handleSave] sheetsData:', JSON.stringify(sheetsData).substring(0, 500)); } catch { console.log('[handleSave] sheetsData: [non-serializable]'); }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const currentSheetNames = (sheetsData as any[]).map((s: any) => s.name).filter(Boolean);
        const deletedSheets = sheetNames.filter(sn => !currentSheetNames.includes(sn));

        const result = await patchTemplateCells(tId, sheetsData, deletedSheets);
        console.log('[handleSave] patch result:', result);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const r = result as any;
        message.success(`Saved: ${r.patched_cells || 0} cells, ${r.merged || 0} merges, ${r.borders || 0} borders`);

        // Update stored sheets so next edit session loads the saved state
        setStoredSheets(sheetsData as unknown[]);
      }

      await updateTemplate(tId, { name, description: desc } as Partial<import('@/lib/n8nApi').Template>);
      onSuccess();
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Save failed');
    }
    setSavingTemplate(false);
  };

  /** Re-upload: replace template file with a new Excel upload */
  const handleReupload = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xls';
    input.onchange = async (e) => {
      const f = (e.target as HTMLInputElement).files?.[0];
      if (!f) return;
      setSavingTemplate(true);
      try {
        const tId = savedTemplateId || editTemplateId || '';
        if (tId) {
          const tpl = await uploadTemplate(f, name || f.name.replace(/\.xlsx?$/i, ''), desc);
          const newId = templateId(tpl);
          if (newId) setSavedTemplateId(newId);
          try { await deleteTemplate(tId); } catch { /* ok */ }
        } else {
          const tpl = await uploadTemplate(f, name || f.name.replace(/\.xlsx?$/i, ''), desc);
          const newId = templateId(tpl);
          if (newId) setSavedTemplateId(newId);
        }
        // Reload in editor — clear stored sheets so it re-parses the new file
        setFile(f);
        setStoredSheets(undefined);
        handleFileSelect(f);
        message.success('File re-uploaded');
        onSuccess();
      } catch (e) {
        message.error(e instanceof Error ? e.message : 'Upload failed');
      }
      setSavingTemplate(false);
    };
    input.click();
  }, [savedTemplateId, editTemplateId, name, desc, onSuccess, handleFileSelect]);

  // ─── Save Mapping + Rule ──────────────────────────────────────

  const handleSave = async () => {
    if (!name.trim()) { message.warning('Name required'); return; }
    if (!selectedConnId) { message.warning('Select a connection'); return; }
    if (fieldMappings.length === 0) { message.warning('Map at least one field'); return; }

    setSaving(true);
    try {
      // 1. Ensure template exists (upload if new, don't touch if existing)
      let tId = savedTemplateId || editTemplateId || '';
      if (!tId && file) {
        const tpl = await uploadTemplate(file, name, desc);
        tId = templateId(tpl);
      }
      if (!tId) { message.error('Upload template first'); setSaving(false); return; }
      setSavedTemplateId(tId);

      // 1b. Also patch current cell edits before saving mapping
      if (saveSheetRef.current) {
        try {
          const { patchTemplateCells } = await import('@/lib/n8nApi');
          const sheetsData = await saveSheetRef.current();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const currentSheetNames = (sheetsData as any[]).map((s: any) => s.name).filter(Boolean);
          const deletedSheets = sheetNames.filter(sn => !currentSheetNames.includes(sn));
          await patchTemplateCells(tId, sheetsData, deletedSheets);
          setStoredSheets(sheetsData as unknown[]);
        } catch (e) {
          console.warn('[handleSave] patch cells failed (non-critical):', e);
        }
      }

      // 2. Create or update mapping
      const fmaps = fieldMappings.map(m => ({
        lark_field: m.lark_field,
        excel_column: colIndexToLetter(m.col),
        excel_header: m.label,
        map_type: m.map_type || 'direct',
        expression: m.expression || null,
        scope: m.repeat ? 'row' as const : 'header' as const,
        anchor_row: m.row + 1,
        target_sheet: m.sheet || activeSheet,
      }));

      const mName = mappingName || `${name} - ${activeSheet}`;
      let mId = savedMappingId;

      if (mId) {
        const { updateMapping } = await import('@/lib/n8nApi');
        await updateMapping(mId, {
          name: mName, connection_id: selectedConnId, template_id: tId,
          target_sheet: activeSheet, field_maps: fmaps,
        } as Partial<import('@/lib/n8nApi').Mapping>);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mapping: any = await createMapping({
          name: mName, connection_id: selectedConnId, template_id: tId,
          target_sheet: activeSheet, field_maps: fmaps,
        } as MappingCreate);
        mId = mapping?.data?._id || mapping?.data?.id || mapping?._id || mapping?.id || '';
      }
      setSavedMappingId(mId);

      // 3. Create or update rule
      const groupField = savedGroupByField || '';

      const ruleData = {
        name: mName, connection_id: selectedConnId, template_id: tId, mapping_id: mId,
        trigger: { type: 'record_change', filter_field: '', filter_value: '', group_by_field: groupField },
        output: { type: webhookUrl ? 'lark_webhook' : 'download', lark_webhook_url: webhookUrl, include_pdf: false },
        debounce_seconds: 5, enabled: true,
      };

      if (savedRuleId) {
        const { updateRule } = await import('@/lib/n8nApi');
        await updateRule(savedRuleId, ruleData as Partial<import('@/lib/n8nApi').Rule>);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rule: any = await createRule(ruleData as RuleCreate);
        setSavedRuleId(rule?.data?._id || rule?.data?.id || rule?._id || rule?.id || '');
      }

      message.success('Saved!');
      onSuccess();
      setStep(2);
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Save failed');
    }
    setSaving(false);
  };

  const handleTest = async () => {
    if (!savedRuleId) { message.warning('No rule — save first'); return; }
    if (!testGroupKey.trim()) { message.warning('Enter test value'); return; }

    setTesting(true);
    setTestResult(null);
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_BASE || '';
      const { authHeaders: getHeaders, updateRule } = await import('@/lib/n8nApi');

      const wantPdf = testDownloadFormat === 'pdf' || testDownloadFormat === 'both';
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await updateRule(savedRuleId, { output: { type: webhookUrl ? 'lark_webhook' : 'download', lark_webhook_url: webhookUrl, include_pdf: wantPdf } } as any);
      } catch { /* non-critical */ }

      const headers = await getHeaders();
      const res = await fetch(`${apiBase}/api/n8n/rules/${savedRuleId}/test`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ group_key: testGroupKey, webhook_url: webhookUrl }),
      });
      const data = await res.json();
      const result = data.data || data;

      if (result.success) {
        const filename = (result.excel_path || '').split('/').pop() || '';
        const pdfFilename = (result.pdf_path || '').split('/').pop() || '';
        const dlBase = result.download_base || '/wh';
        const excelUrl = filename ? `${dlBase}/download/${filename}` : undefined;
        const pdfUrl = pdfFilename ? `${dlBase}/download/${pdfFilename}` : result.pdf_download_url || undefined;

        setTestResult({ success: true, detail: `${result.records_count} records, ${result.duration_ms}ms`, downloadUrl: excelUrl, pdfDownloadUrl: pdfUrl });
      } else {
        setTestResult({ success: false, detail: result.detail || result.error || data.detail || data.error || 'Failed' });
      }
    } catch (e) {
      setTestResult({ success: false, detail: e instanceof Error ? e.message : 'Error' });
    }
    setTesting(false);
  };

  /** Preview: render original Excel as HTML using xlsx library */
  const handlePreview = async () => {
    if (!file) { message.warning('No file'); return; }
    try {
      const buffer = await file.arrayBuffer();
      const XLSX = await import('xlsx');
      const wb = XLSX.read(buffer, { type: 'array', cellStyles: true, cellDates: true });
      let html = '<style>table{border-collapse:collapse;font-family:Arial,sans-serif;font-size:12px}td,th{border:1px solid #ccc;padding:4px 8px;white-space:nowrap;max-width:250px;overflow:hidden;text-overflow:ellipsis}.sheet-tab{display:inline-block;padding:6px 16px;margin:2px;background:#f0f0f0;border:1px solid #ccc;border-radius:4px 4px 0 0;cursor:pointer;font-weight:bold}</style>';
      for (const sheetName of wb.SheetNames) {
        const ws = wb.Sheets[sheetName];
        const sheetHtml = XLSX.utils.sheet_to_html(ws, { header: '', footer: '' });
        html += `<div class="sheet-tab">${sheetName}</div>` + sheetHtml + '<br/>';
      }
      setPreviewHtml(html);
      setPreviewOpen(true);
    } catch {
      message.error('Preview failed');
    }
  };

  const handleReset = () => {
    setStep(0); setFile(null); setStoredSheets(undefined); setName(''); setDesc('');
    setSheetNames([]); setActiveSheet('');
    setSelectedConnId(''); setMappingName(''); setFieldMappings([]);
    setSampleData([]);
    setSavedTemplateId(''); setSavedMappingId(''); setSavedRuleId(''); setSavedGroupByField('');
    setTestGroupKey(''); setWebhookUrl(''); setTestResult(null);
    onClose();
  };

  // ─── Step 0: Upload ───────────────────────────────────────────

  const renderUpload = () => (
    <div>
      <Row gutter={24}>
        <Col span={14}>
          <Input placeholder="Tên template" value={name} onChange={e => setName(e.target.value)}
            style={{ marginBottom: 12 }} size="large" />
          <Input.TextArea placeholder="Mô tả (tùy chọn)" value={desc} onChange={e => setDesc(e.target.value)}
            rows={2} style={{ marginBottom: 12 }} />
          <Dragger accept=".xlsx,.xls" maxCount={1} showUploadList={false}
            beforeUpload={f => { handleFileSelect(f); return false; }}
            style={{ borderRadius: 12 }}>
            <p><InboxOutlined style={{ fontSize: 40, color: 'var(--accent-color, #6366f1)' }} /></p>
            <p style={{ fontSize: 13, margin: '8px 0 4px' }}>
              {file ? (
                <span style={{ color: 'var(--success, #16a34a)', fontWeight: 600 }}>
                  {file.name} ({(file.size / 1024).toFixed(1)} KB)
                </span>
              ) : (
                'Kéo thả hoặc click để chọn file .xlsx / .xls'
              )}
            </p>
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
              Hỗ trợ .xlsx và .xls
            </p>
          </Dragger>
        </Col>
        <Col span={10}>
          {parsing && <Spin tip="Đang đọc file..." style={{ display: 'block', marginTop: 60 }} />}
          {!parsing && sheetNames.length > 0 && (
            <div>
              <Text strong style={{ display: 'block', marginBottom: 8 }}>Sheets detected:</Text>
              {sheetNames.map(s => <Tag key={s} color="blue" style={{ margin: '4px 4px 0 0', borderRadius: 6 }}>{s}</Tag>)}

              <Alert
                type="info" showIcon
                style={{ marginTop: 16, borderRadius: 8 }}
                message="Upload & Save ngay"
                description="Click 'Upload & Save' để lưu template. Bạn có thể edit mapping sau."
              />
            </div>
          )}
        </Col>
      </Row>

      {/* Upload & Save button — saves immediately without requiring mapcells */}
      {file && sheetNames.length > 0 && (
        <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button
            type="primary" size="large" icon={<CloudUploadOutlined />}
            onClick={handleUploadAndSave} loading={uploading}
            style={{ borderRadius: 8, minWidth: 180 }}
          >
            Upload & Save
          </Button>
        </div>
      )}
    </div>
  );

  // ─── Step 1: Spreadsheet + Mapping ────────────────────────────

  const renderEditor = () => (
    <div>
      {/* Template name + description */}
      <Row gutter={8} style={{ marginBottom: 8 }} align="middle">
        <Col span={8}>
          <Input size="small" placeholder="Template name" value={name} onChange={e => setName(e.target.value)}
            addonBefore="Name" style={{ fontWeight: 600 }} />
        </Col>
        <Col span={8}>
          <Input size="small" placeholder="Description (optional)" value={desc} onChange={e => setDesc(e.target.value)}
            addonBefore="Desc" />
        </Col>
        <Col span={2}>
          <Button size="small" type="primary" onClick={handleSaveTemplate} loading={savingTemplate} icon={<SaveOutlined />} block>
            Save
          </Button>
        </Col>
        <Col span={2}>
          <Button size="small" onClick={handleReupload} icon={<UploadOutlined />} block title="Upload new Excel file">
            Re-upload
          </Button>
        </Col>
        <Col span={1}>
          <Button size="small" onClick={handlePreview} icon={<EyeOutlined />} title="Preview HTML (accurate styles)" />
        </Col>
        <Col span={3} style={{ textAlign: 'right' }}>
          <Tag color="blue">{fieldMappings.filter(m => !m.repeat && m.sheet === activeSheet).length} cells</Tag>
          <Tag color="green">{fieldMappings.filter(m => m.repeat && m.sheet === activeSheet).length} repeat↓</Tag>
          <Tag color="orange">{fieldMappings.filter(m => m.map_type === 'formula' && m.sheet === activeSheet).length} fx</Tag>
        </Col>
      </Row>

      {/* Connection + mapping controls */}
      <Row gutter={8} style={{ marginBottom: 8 }} align="middle">
        <Col span={6}>
          {connLoading ? <Spin size="small" /> : (
            <Select size="small" style={{ width: '100%' }} value={selectedConnId || undefined}
              onChange={setSelectedConnId} placeholder="Lark Connection"
              options={connections.map(c => ({ value: c._id || c.id, label: `${c.name} (${c.cached_fields?.length || 0})` }))} />
          )}
        </Col>
        <Col span={5}>
          <Input size="small" placeholder="Mapping name" value={mappingName} onChange={e => setMappingName(e.target.value)} />
        </Col>
        <Col span={3}>
          <Button size="small" type="primary" ghost icon={<ThunderboltOutlined />}
            onClick={() => autoMatchRef.current?.()} disabled={!larkFields.length}>
            Auto Match
          </Button>
        </Col>
        <Col span={2}>
          <Button size="small" icon={<EyeOutlined />} onClick={fetchSamples} loading={loadingSamples} disabled={!selectedConnId}>
            Samples
          </Button>
        </Col>
        <Col span={2}>
          {fieldMappings.length > 0 && (
            <Button size="small" danger onClick={() => clearAllRef.current?.()}>
              Clear All
            </Button>
          )}
        </Col>
      </Row>

      {!selectedConnId ? (
        <Alert type="info" showIcon message="Select a Lark connection, then click cells → 'Map Cell' to assign fields." style={{ marginBottom: 8 }} />
      ) : (
        <Alert type="info" showIcon message="Edit cells like Excel. Select a cell then click 'Map Cell' (top-right) to assign Lark fields." style={{ marginBottom: 8 }} />
      )}

      <SpreadsheetEditor
        file={file}
        initialSheets={storedSheets}
        larkFields={larkFields}
        mappings={fieldMappings}
        onMappingsChange={setFieldMappings}
        activeSheet={activeSheet}
        onActiveSheetChange={setActiveSheet}
        sampleData={sampleData}
        height={Math.max(window?.innerHeight ? window.innerHeight - 280 : 500, 400)}
        autoMatchRef={autoMatchRef}
        clearAllRef={clearAllRef}
        saveRef={saveSheetRef}
        templateName={name}
        templateId={savedTemplateId || editTemplateId}
      />
    </div>
  );

  // ─── Step 2: Test ─────────────────────────────────────────────

  const renderTest = () => (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      <Alert type="success" showIcon icon={<CheckCircleOutlined />}
        message="Template + Mapping + Rule saved!" description="Test with real Lark data."
        style={{ marginBottom: 20, borderRadius: 8 }} />

      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col span={12}>
          <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>Group by field</Text>
          <Select size="small" style={{ width: '100%' }} value={savedGroupByField || undefined}
            onChange={async (v) => {
              const val = v || '';
              setSavedGroupByField(val);
              if (savedRuleId) {
                try {
                  const { updateRule } = await import('@/lib/n8nApi');
                  await updateRule(savedRuleId, {
                    trigger: { type: 'record_change', filter_field: '', filter_value: '', group_by_field: val },
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  } as any);
                } catch { /* non-critical */ }
              }
            }} placeholder="Lark field" showSearch allowClear
            options={larkFields.map(f => ({ value: f.field_name, label: f.field_name }))} />
        </Col>
        <Col span={12}>
          <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>Webhook URL (optional)</Text>
          <Input size="small" placeholder="https://open.larksuite.com/..." value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)} />
        </Col>
      </Row>

      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col span={12}>
          <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>Test value for &quot;{savedGroupByField || '...'}&quot;</Text>
          <Input placeholder="e.g. TQ-KB-001768" value={testGroupKey} onChange={e => setTestGroupKey(e.target.value)} onPressEnter={handleTest} />
        </Col>
        <Col span={6}>
          <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>Download format</Text>
          <Select size="middle" style={{ width: '100%' }} value={testDownloadFormat} onChange={setTestDownloadFormat}
            options={[
              { value: 'excel', label: 'Excel (.xlsx)' },
              { value: 'pdf', label: 'PDF' },
              { value: 'both', label: 'Both' },
            ]} />
        </Col>
        <Col span={6} style={{ display: 'flex', alignItems: 'flex-end' }}>
          <Button type="primary" onClick={handleTest} loading={testing} icon={<ThunderboltOutlined />} block disabled={!testGroupKey.trim()}>Run Test</Button>
        </Col>
      </Row>

      {testResult && (
        <div style={{ padding: 16, borderRadius: 8, background: testResult.success ? 'var(--success-bg)' : 'var(--error-bg)', border: `1px solid ${testResult.success ? 'var(--success)' : 'var(--error)'}` }}>
          <Tag color={testResult.success ? 'success' : 'error'}>{testResult.success ? 'SUCCESS' : 'FAILED'}</Tag>
          <Text>{testResult.detail}</Text>
          {testResult.downloadUrl && (testDownloadFormat === 'excel' || testDownloadFormat === 'both') && (
            <Button type="primary" size="small" href={testResult.downloadUrl} target="_blank" style={{ marginLeft: 8 }}>Download Excel</Button>
          )}
          {testResult.pdfDownloadUrl && (testDownloadFormat === 'pdf' || testDownloadFormat === 'both') && (
            <Button size="small" href={testResult.pdfDownloadUrl} target="_blank" style={{ marginLeft: 8 }}>Download PDF</Button>
          )}
          {(testDownloadFormat === 'pdf' || testDownloadFormat === 'both') && !testResult.pdfDownloadUrl && testResult.success && (
            <Text type="warning" style={{ marginLeft: 8, fontSize: 11 }}>PDF not generated — check LibreOffice on server</Text>
          )}
        </div>
      )}
    </div>
  );

  // ─── Main ─────────────────────────────────────────────────────

  return (
    <>
      <Modal
        title={editTemplateId ? `Edit: ${editTemplateName || 'Template'}` : 'Upload & Map Template'}
        open={open} onCancel={handleReset}
        width={step === 1 ? '90vw' : 720}
        style={step === 1 ? { top: 20, maxWidth: 1600 } : undefined}
        maskClosable={false} destroyOnClose keyboard={false}
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Button disabled={step === 0 || step === 2} onClick={() => setStep(s => s - 1)}>Back</Button>
            <Space>
              {step === 2 ? (
                <Button type="primary" onClick={handleReset}>Done</Button>
              ) : (
                <>
                  <Button onClick={handleReset}>Cancel</Button>
                  {step === 0 ? (
                    <Button type="default" onClick={() => {
                      if (!file) { message.warning('Chọn file trước'); return; }
                      if (!name.trim()) { setName(file.name.replace(/\.xlsx?$/i, '')); }
                      setMappingName(`${name || file.name.replace(/\.xlsx?$/i, '')} - ${activeSheet}`);
                      setStep(1);
                    }}>Next — Edit & Map</Button>
                  ) : (
                    <Button type="primary" loading={saving} onClick={handleSave} icon={<CheckCircleOutlined />} disabled={fieldMappings.length === 0}>
                      Save & Test
                    </Button>
                  )}
                </>
              )}
            </Space>
          </div>
        }
      >
        <Steps current={step} size="small" style={{ marginBottom: 16 }}
          items={[{ title: 'Upload' }, { title: 'Edit & Map' }, { title: 'Test' }]} />
        {step === 0 && renderUpload()}
        {step === 1 && renderEditor()}
        {step === 2 && renderTest()}
      </Modal>

      {/* HTML Preview Modal */}
      <Modal
        title="Excel Preview (HTML)"
        open={previewOpen}
        onCancel={() => setPreviewOpen(false)}
        width="90vw"
        style={{ top: 20 }}
        footer={<Button onClick={() => setPreviewOpen(false)}>Close</Button>}
      >
        <div
          style={{ maxHeight: '80vh', overflow: 'auto', background: 'var(--bg-secondary)', padding: 8 }}
          dangerouslySetInnerHTML={{ __html: previewHtml }}
        />
      </Modal>
    </>
  );
}
