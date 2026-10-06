'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Empty,
  Image,
  Input,
  Modal,
  Select,
  Spin,
  Tag,
  Tooltip,
  message,
  Progress,
} from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  FileExcelOutlined,
  FileImageOutlined,
  SearchOutlined,
  EditOutlined,
  EyeOutlined,
  ReloadOutlined,
} from '@ant-design/icons';

// ── Types ────────────────────────────────────────────────────────────────────

interface OcrItem {
  file: string;
  type: 'image' | 'xlsx';
  status: string;
  text: string;
  lines?: number;
  avg_confidence?: number;
  sheets?: number;
  total_rows?: number;
}

type ReviewStatus = 'pending' | 'approved' | 'needs-fix' | 'rejected';

interface ReviewState {
  status: ReviewStatus;
  note: string;
  correctedText?: string;
  category?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<ReviewStatus, { color: string; label: string; icon: React.ReactNode }> = {
  pending:     { color: 'default',    label: 'Pending',    icon: null },
  approved:    { color: 'success',    label: 'Approved',   icon: <CheckCircleOutlined /> },
  'needs-fix': { color: 'warning',    label: 'Needs Fix',  icon: <ExclamationCircleOutlined /> },
  rejected:    { color: 'error',      label: 'Rejected',   icon: <CloseCircleOutlined /> },
};

const CATEGORY_CONFIG: Record<string, { color: string; label: string }> = {
  'screenshot-table': { color: '#52c41a', label: '📊 Screenshot bảng' },
  'screenshot-text':  { color: '#1677ff', label: '📱 Screenshot text' },
  'document-table':   { color: '#13c2c2', label: '📄 Chứng từ bảng' },
  'clear-text':       { color: '#722ed1', label: '✨ Chữ rõ nét' },
  'blurry-text':      { color: '#fa8c16', label: '🌫️ Ảnh mờ' },
  'handwritten':      { color: '#eb2f96', label: '✍️ Chữ viết tay' },
  'low-quality':      { color: '#f5222d', label: '⚠️ Chất lượng thấp' },
  'blank-or-unreadable': { color: '#8c8c8c', label: '❌ Trống/không đọc được' },
  'ai-processed':       { color: '#722ed1', label: '🤖 AI đã đọc lại' },
};

function getReviewStatus(state: Record<string, ReviewState>, file: string): ReviewStatus {
  return state[file]?.status || 'pending';
}

// ── Component ────────────────────────────────────────────────────────────────

export default function OcrReviewPage() {
  const [items, setItems] = useState<OcrItem[]>([]);
  const [reviewState, setReviewState] = useState<Record<string, ReviewState>>({});
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [filterStatus, setFilterStatus] = useState<ReviewStatus | 'all'>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [editedText, setEditedText] = useState('');
  const [fixNote, setFixNote] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [fixModalOpen, setFixModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reOcring, setReOcring] = useState(false);
  const [reOcrStep, setReOcrStep] = useState('');

  // ── Load data ──────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ocr-results');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success) {
        setItems(json.data);
        setReviewState(json.state || {});
      } else {
        message.error(json.error || 'Failed to load');
      }
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : 'Failed to load OCR results');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Select first item when data loads ──────────────────────────────────────

  useEffect(() => {
    if (items.length > 0 && !selectedFile) {
      setSelectedFile(items[0].file);
    }
  }, [items, selectedFile]);

  // ── Update edited text when selection changes ──────────────────────────────

  useEffect(() => {
    if (selectedFile) {
      const corrected = reviewState[selectedFile]?.correctedText;
      const original = items.find(i => i.file === selectedFile)?.text || '';
      setEditedText(corrected ?? original);
    }
  }, [selectedFile, items, reviewState]);

  // ── Filtered list ──────────────────────────────────────────────────────────

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      if (searchText && !item.file.toLowerCase().includes(searchText.toLowerCase())) return false;
      if (filterStatus !== 'all' && getReviewStatus(reviewState, item.file) !== filterStatus) return false;
      if (filterCategory !== 'all' && (reviewState[item.file]?.category || '') !== filterCategory) return false;
      return true;
    });
  }, [items, searchText, filterStatus, filterCategory, reviewState]);

  // ── Stats ──────────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const total = items.length;
    let reviewed = 0;
    let approved = 0;
    let needsFix = 0;
    let rejected = 0;
    for (const item of items) {
      const s = getReviewStatus(reviewState, item.file);
      if (s !== 'pending') reviewed++;
      if (s === 'approved') approved++;
      if (s === 'needs-fix') needsFix++;
      if (s === 'rejected') rejected++;
    }
    const accuracy = reviewed > 0 ? Math.round((approved / reviewed) * 100) : 0;
    return { total, reviewed, approved, needsFix, rejected, accuracy };
  }, [items, reviewState]);

  // ── Save review ────────────────────────────────────────────────────────────

  const saveReview = useCallback(async (file: string, status: ReviewStatus, note = '', correctedText?: string) => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = { file, status, note };
      if (correctedText !== undefined) body.correctedText = correctedText;
      const res = await fetch('/api/ocr-results', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success) {
        setReviewState(prev => ({ ...prev, [file]: json.data }));
        message.success(`${file}: ${STATUS_CONFIG[status].label}`);
      } else {
        message.error(json.error);
      }
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, []);

  const handleApprove = () => {
    if (!selectedFile) return;
    const item = items.find(i => i.file === selectedFile);
    const original = item?.text || '';
    const corrected = editedText !== original ? editedText : undefined;
    saveReview(selectedFile, 'approved', '', corrected);
  };

  const handleNeedsFix = () => {
    if (!selectedFile) return;
    setFixNote(reviewState[selectedFile]?.note || '');
    setFixModalOpen(true);
  };

  const handleReject = () => {
    if (!selectedFile) return;
    saveReview(selectedFile, 'rejected');
  };

  const handleReOcr = async () => {
    if (!selectedFile) return;
    setReOcring(true);
    setReOcrStep('📤 Đang upload ảnh lên Claude Vision...');
    try {
      await new Promise(r => setTimeout(r, 300));
      setReOcrStep('🧠 Claude đang phân tích ảnh...');
      const res = await fetch('/api/ocr-results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: selectedFile }),
      });
      setReOcrStep('📝 Đang xử lý kết quả...');
      const json = await res.json();
      if (json.success) {
        setEditedText(json.text);
        setItems(prev => prev.map(i => i.file === selectedFile
          ? { ...i, text: json.text, lines: json.lines, avg_confidence: 0.95 }
          : i));
        setReviewState(prev => ({
          ...prev,
          [selectedFile]: { ...prev[selectedFile], correctedText: json.text, category: 'ai-processed', note: (prev[selectedFile]?.note || '') + '\n[Re-OCR by Claude Vision]' },
        }));
        setReOcrStep('');
        message.success(`Re-OCR thành công! ${json.lines} dòng đọc được`);
      } else {
        setReOcrStep('');
        message.error(json.error || 'Re-OCR failed');
      }
    } catch (e: unknown) {
      setReOcrStep('');
      message.error(e instanceof Error ? e.message : 'Re-OCR failed');
    } finally {
      setReOcring(false);
    }
  };

  const confirmNeedsFix = () => {
    if (!selectedFile) return;
    const item = items.find(i => i.file === selectedFile);
    const original = item?.text || '';
    const corrected = editedText !== original ? editedText : undefined;
    saveReview(selectedFile, 'needs-fix', fixNote, corrected);
    setFixModalOpen(false);
  };

  // Navigate to next pending
  const goNextPending = () => {
    const idx = items.findIndex(i => i.file === selectedFile);
    for (let offset = 1; offset < items.length; offset++) {
      const next = items[(idx + offset) % items.length];
      if (getReviewStatus(reviewState, next.file) === 'pending') {
        setSelectedFile(next.file);
        return;
      }
    }
    message.info('No more pending items');
  };

  // ── Selected item ──────────────────────────────────────────────────────────

  const selectedItem = useMemo(() => items.find(i => i.file === selectedFile), [items, selectedFile]);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <Spin size="large" tip="Loading OCR results..." />
      </div>
    );
  }

  if (items.length === 0) {
    return <Empty description="No OCR results found" />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: 'calc(100vh - 100px)' }}>
      {/* ── Stats Bar ──────────────────────────────────────────────── */}
      <Card
        size="small"
        styles={{ body: { padding: '8px 16px' } }}
        style={{ background: 'var(--bg-color)', border: '1px solid var(--border-color)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--text-color)', fontWeight: 600, fontSize: 15 }}>
            OCR Review
          </span>
          <Tag>{stats.reviewed}/{stats.total} reviewed</Tag>
          <Tag color="success">{stats.approved} approved</Tag>
          <Tag color="warning">{stats.needsFix} needs-fix</Tag>
          <Tag color="error">{stats.rejected} rejected</Tag>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 180 }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
              Accuracy: {stats.accuracy}%
            </span>
            <Progress
              percent={stats.accuracy}
              size="small"
              showInfo={false}
              strokeColor="var(--accent-color)"
              style={{ width: 100, margin: 0 }}
            />
          </div>
          <Button
            size="small"
            icon={<ReloadOutlined />}
            onClick={loadData}
          >
            Reload
          </Button>
        </div>
      </Card>

      {/* ── Main split view ────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 0, flex: 1, minHeight: 0 }}>

        {/* ── Sidebar toggle ── */}
        <div
          onClick={() => setSidebarOpen(v => !v)}
          style={{
            width: 24, flexShrink: 0, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
            borderRadius: sidebarOpen ? '8px 0 0 8px' : 8,
            color: 'var(--text-tertiary)', fontSize: 12, userSelect: 'none',
            writingMode: sidebarOpen ? undefined : 'vertical-rl',
          }}
          title={sidebarOpen ? 'Ẩn danh sách' : 'Hiện danh sách'}
        >
          {sidebarOpen ? '◀' : '▶ Files'}
        </div>

        {/* ── Left: File List ──────────────────────────────────────── */}
        <div style={{
          width: sidebarOpen ? 300 : 0,
          minWidth: 0,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-color)',
          borderTop: '1px solid var(--border-color)',
          borderBottom: '1px solid var(--border-color)',
          overflow: 'hidden',
          transition: 'width 0.2s',
        }}>
          {/* Filters */}
          <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <Input
                size="small"
                placeholder="Search filename..."
                prefix={<SearchOutlined style={{ color: 'var(--text-tertiary)' }} />}
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                allowClear
                style={{ flex: 1 }}
              />
              <Select
                size="small"
                value={filterStatus}
                onChange={setFilterStatus}
                style={{ width: 110 }}
                options={[
                  { value: 'all', label: 'All' },
                  { value: 'pending', label: 'Pending' },
                  { value: 'approved', label: 'Approved' },
                  { value: 'needs-fix', label: 'Needs Fix' },
                  { value: 'rejected', label: 'Rejected' },
                ]}
              />
            </div>
            <Select
              size="small"
              value={filterCategory}
              onChange={setFilterCategory}
              style={{ width: '100%' }}
              options={[
                { value: 'all', label: '📁 Tất cả loại ảnh' },
                ...Object.entries(CATEGORY_CONFIG).map(([k, v]) => ({ value: k, label: v.label })),
              ]}
            />
          </div>
          <div style={{ fontSize: 11, padding: '4px 10px', color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border-color)' }}>
            {filteredItems.length} files
          </div>

          {/* File list */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {filteredItems.map(item => {
              const rs = getReviewStatus(reviewState, item.file);
              const cfg = STATUS_CONFIG[rs];
              const isSelected = item.file === selectedFile;
              return (
                <div
                  key={item.file}
                  onClick={() => setSelectedFile(item.file)}
                  style={{
                    padding: '8px 10px',
                    cursor: 'pointer',
                    borderBottom: '1px solid var(--border-color)',
                    background: isSelected ? 'var(--accent-color)' : 'transparent',
                    color: isSelected ? '#fff' : 'var(--text-color)',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => {
                    if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--bg-secondary)';
                  }}
                  onMouseLeave={e => {
                    if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {item.type === 'image'
                      ? <FileImageOutlined style={{ fontSize: 14, color: isSelected ? '#fff' : 'var(--accent-color)' }} />
                      : <FileExcelOutlined style={{ fontSize: 14, color: isSelected ? '#fff' : '#52c41a' }} />
                    }
                    <span style={{
                      flex: 1,
                      fontSize: 12,
                      fontWeight: 500,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {item.file}
                    </span>
                    <Tag
                      color={isSelected ? undefined : cfg.color}
                      style={{
                        fontSize: 10,
                        lineHeight: '16px',
                        padding: '0 4px',
                        margin: 0,
                        ...(isSelected ? { background: 'rgba(255,255,255,0.25)', color: '#fff', border: 'none' } : {}),
                      }}
                    >
                      {cfg.label}
                    </Tag>
                  </div>
                  <div style={{ display: 'flex', gap: 6, fontSize: 10, marginTop: 3, opacity: 0.7, alignItems: 'center', flexWrap: 'wrap' }}>
                    {item.type === 'image' && item.lines != null && (
                      <span>{item.lines} lines</span>
                    )}
                    {item.type === 'xlsx' && item.total_rows != null && (
                      <span>{item.total_rows} rows</span>
                    )}
                    <span>{item.text.length} chars</span>
                    {reviewState[item.file]?.category && (() => {
                      const cat = reviewState[item.file].category!;
                      const catCfg = CATEGORY_CONFIG[cat];
                      return catCfg ? (
                        <span style={{ color: isSelected ? '#fff' : catCfg.color, fontWeight: 600 }}>
                          {catCfg.label}
                        </span>
                      ) : null;
                    })()}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Right: Detail View ───────────────────────────────────── */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-color)',
          border: '1px solid var(--border-color)',
          borderRadius: '0 8px 8px 0',
          overflow: 'hidden',
          minWidth: 0,
        }}>
          {!selectedItem ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
              <Empty description="Select a file to review" />
            </div>
          ) : (
            <>
              {/* Header */}
              <div style={{
                padding: '8px 16px',
                borderBottom: '1px solid var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                flexShrink: 0,
                background: 'var(--bg-secondary)',
              }}>
                {selectedItem.type === 'image'
                  ? <FileImageOutlined style={{ fontSize: 16, color: 'var(--accent-color)' }} />
                  : <FileExcelOutlined style={{ fontSize: 16, color: '#52c41a' }} />
                }
                <span style={{ fontWeight: 600, color: 'var(--text-color)', fontSize: 14, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {selectedItem.file}
                </span>
                {reviewState[selectedItem.file]?.category && (() => {
                  const cat = reviewState[selectedItem.file].category!;
                  const catCfg = CATEGORY_CONFIG[cat];
                  return catCfg ? <Tag style={{ fontSize: 10, margin: 0, color: catCfg.color, borderColor: catCfg.color }}>{catCfg.label}</Tag> : null;
                })()}
                <Select
                  size="small"
                  value={reviewState[selectedItem.file]?.category || 'auto'}
                  style={{ width: 160, fontSize: 10 }}
                  onChange={v => {
                    fetch('/api/ocr-results', {
                      method: 'PUT', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ file: selectedItem.file, category: v }),
                    }).then(r => r.json()).then(d => {
                      if (d.success) setReviewState(prev => ({ ...prev, [selectedItem.file]: { ...prev[selectedItem.file], ...d.data } }));
                    });
                  }}
                  options={Object.entries(CATEGORY_CONFIG).map(([k, v]) => ({ value: k, label: v.label }))}
                />
                <Tag color={STATUS_CONFIG[getReviewStatus(reviewState, selectedItem.file)].color}>
                  {STATUS_CONFIG[getReviewStatus(reviewState, selectedItem.file)].label}
                </Tag>
              </div>

              {/* Content area */}
              <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                {selectedItem.type === 'image' ? (
                  <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
                    {/* Left: Image preview — Ant Design Image with built-in zoom/pan */}
                    <div style={{
                      flex: 1, minWidth: 0, borderRight: '1px solid var(--border-color)',
                      background: 'var(--bg-tertiary)', overflow: 'auto',
                      display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 8,
                    }}>
                      <Image
                        src={`/api/ocr-images?file=${encodeURIComponent(selectedItem.file)}`}
                        alt={selectedItem.file}
                        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 4 }}
                        preview={{
                          toolbarRender: (_, { transform: { scale }, actions }) => (
                            <div style={{ display: 'flex', gap: 8 }}>
                              <Button onClick={actions.onZoomOut} style={{ color: '#fff' }}>🔍−</Button>
                              <span style={{ color: '#fff', lineHeight: '32px' }}>{Math.round(scale * 100)}%</span>
                              <Button onClick={actions.onZoomIn} style={{ color: '#fff' }}>🔍+</Button>
                              <Button onClick={actions.onRotateRight} style={{ color: '#fff' }}>↻</Button>
                              <Button onClick={actions.onFlipX} style={{ color: '#fff' }}>↔</Button>
                              <Button onClick={actions.onReset} style={{ color: '#fff' }}>Reset</Button>
                            </div>
                          ),
                        }}
                      />
                    </div>
                    {/* Right: OCR text — formatted view + edit toggle */}
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                      <div style={{
                        padding: '4px 8px', borderBottom: '1px solid var(--border-color)',
                        display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-secondary)', flexShrink: 0,
                      }}>
                        <EditOutlined style={{ color: 'var(--text-secondary)', fontSize: 12 }} />
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>OCR Result</span>
                        {selectedItem.avg_confidence != null && (
                          <Tag style={{ fontSize: 10 }}>Conf: {(selectedItem.avg_confidence * 100).toFixed(0)}%</Tag>
                        )}
                        <Tag style={{ fontSize: 10 }}>{editedText.split('\n').filter(Boolean).length} lines</Tag>
                        <div style={{ flex: 1 }} />
                        <Button size="small" type={editedText !== (items.find(i => i.file === selectedFile)?.text || '') ? 'primary' : 'default'}
                          onClick={() => setEditedText(items.find(i => i.file === selectedFile)?.text || '')}>
                          Reset
                        </Button>
                      </div>
                      <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
                        {/* Detect if text has pipe-separated table format */}
                        {editedText.includes(' | ') ? (
                          <div>
                            {editedText.split(/\n(?=\[Sheet:|$)/).filter(Boolean).map((block, bi) => {
                              const lines = block.split('\n').filter(l => l.trim());
                              const sheetMatch = lines[0]?.match(/^\[Sheet: (.+)\]$/);
                              const dataLines = sheetMatch ? lines.slice(1) : lines;
                              const hasPipe = dataLines.some(l => l.includes(' | '));
                              return (
                                <div key={bi} style={{ marginBottom: 12 }}>
                                  {sheetMatch && (
                                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-color)', marginBottom: 4 }}>
                                      📊 {sheetMatch[1]}
                                    </div>
                                  )}
                                  {hasPipe ? (
                                    <div style={{ overflow: 'auto', border: '1px solid var(--border-color)', borderRadius: 6 }}>
                                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                                        <tbody>
                                          {dataLines.map((row, ri) => (
                                            <tr key={ri} style={{ background: ri === 0 ? 'var(--bg-secondary)' : ri % 2 === 0 ? 'var(--bg-color)' : 'transparent' }}>
                                              <td style={{ padding: '3px 6px', borderBottom: '1px solid var(--border-color)', color: 'var(--text-tertiary)', fontSize: 10, width: 28, textAlign: 'right' }}>{ri + 1}</td>
                                              {row.split(' | ').map((cell, ci) => (
                                                <td key={ci} style={{
                                                  padding: '4px 8px', borderBottom: '1px solid var(--border-color)', borderLeft: '1px solid var(--border-color)',
                                                  color: 'var(--text-color)', fontSize: 11, fontWeight: ri === 0 ? 600 : 400,
                                                  maxWidth: 300, wordBreak: 'break-word',
                                                }} title={cell}>{cell}</td>
                                              ))}
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  ) : (
                                    <pre style={{ margin: 0, fontSize: 11, color: 'var(--text-color)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.6 }}>{dataLines.join('\n')}</pre>
                                  )}
                                </div>
                              );
                            })}
                            {/* Editable fallback */}
                            <div style={{ marginTop: 12, borderTop: '1px solid var(--border-color)', paddingTop: 8 }}>
                              <details>
                                <summary style={{ fontSize: 11, color: 'var(--text-tertiary)', cursor: 'pointer' }}>✏️ Edit raw text</summary>
                                <Input.TextArea
                                  value={editedText}
                                  onChange={e => setEditedText(e.target.value)}
                                  style={{ marginTop: 6, fontFamily: 'monospace', fontSize: 11, background: 'var(--bg-secondary)', color: 'var(--text-color)', border: '1px solid var(--border-color)' }}
                                  autoSize={{ minRows: 6, maxRows: 20 }}
                                />
                              </details>
                            </div>
                          </div>
                        ) : (
                          /* Plain text — clean readable format */
                          <div>
                            <pre style={{
                              margin: 0, fontSize: 12, color: 'var(--text-color)',
                              whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.8,
                              fontFamily: 'inherit',
                            }}>{editedText}</pre>
                            <div style={{ marginTop: 12, borderTop: '1px solid var(--border-color)', paddingTop: 8 }}>
                              <details>
                                <summary style={{ fontSize: 11, color: 'var(--text-tertiary)', cursor: 'pointer' }}>✏️ Edit raw text</summary>
                                <Input.TextArea
                                  value={editedText}
                                  onChange={e => setEditedText(e.target.value)}
                                  style={{ marginTop: 6, fontFamily: 'monospace', fontSize: 11, background: 'var(--bg-secondary)', color: 'var(--text-color)', border: '1px solid var(--border-color)' }}
                                  autoSize={{ minRows: 6, maxRows: 20 }}
                                />
                              </details>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  /* XLSX/DOCS: split view — parsed table left, OCR text right */
                  <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
                    {/* Left: Rendered table view */}
                    <div style={{ flex: 3, minWidth: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border-color)' }}>
                      <div style={{
                        padding: '6px 12px', borderBottom: '1px solid var(--border-color)',
                        display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-secondary)', flexShrink: 0,
                      }}>
                        <FileExcelOutlined style={{ color: '#52c41a' }} />
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Data View</span>
                        {selectedItem.sheets != null && <Tag style={{ fontSize: 10 }}>{selectedItem.sheets} sheets</Tag>}
                        {selectedItem.total_rows != null && <Tag style={{ fontSize: 10 }}>{selectedItem.total_rows} rows</Tag>}
                      </div>
                      <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
                        {selectedItem.text.split(/\n\[Sheet: /).map((sheetBlock, si) => {
                          const match = si === 0 && !sheetBlock.startsWith('[Sheet:')
                            ? null
                            : sheetBlock.match(/^([^\]]+)\]\n?([\s\S]*)$/);
                          const sheetName = match ? match[1] : (si === 0 ? 'Data' : `Sheet ${si}`);
                          const content = match ? match[2] : sheetBlock;
                          const rows = content.split('\n').filter(r => r.trim());
                          if (rows.length === 0) return null;
                          // Detect header row to figure out column count
                          const headerCells = rows[0]?.split(' | ') || [];
                          const colCount = headerCells.length;
                          // Find "Tên hàng" or description-like column index (usually col 1 or 2, longest text)
                          const descColIdx = headerCells.findIndex(h => /tên hàng|mô tả|description|nội dung/i.test(h));
                          // Last non-empty column is often "notes/review"
                          const lastColIdx = colCount - 1;
                          const hasNoteCol = lastColIdx > 3;
                          return (
                            <div key={si} style={{ marginBottom: 16 }}>
                              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-color)', marginBottom: 6 }}>
                                📊 {sheetName} ({rows.length - 1} rows)
                              </div>
                              <div style={{ overflow: 'auto', border: '1px solid var(--border-color)', borderRadius: 6 }}>
                                <table style={{ borderCollapse: 'collapse', fontSize: 11, width: '100%', tableLayout: 'fixed' as const }}>
                                  <tbody>
                                    {rows.map((row, ri) => {
                                      const cells = row.split(' | ');
                                      const isHeader = ri === 0;
                                      // Detect if last cell has review note (not just "OK" or empty)
                                      const lastCell = cells[cells.length - 1]?.trim() || '';
                                      const isNoteHighlight = !isHeader && hasNoteCol && lastCell && lastCell !== 'OK' && lastCell.length > 2;
                                      return (
                                        <tr key={ri} style={{
                                          background: isHeader ? 'var(--bg-secondary)'
                                            : isNoteHighlight ? 'rgba(250, 173, 20, 0.08)'
                                            : ri % 2 === 0 ? 'var(--bg-color)' : 'transparent',
                                        }}>
                                          <td style={{
                                            padding: '4px 6px', borderBottom: '1px solid var(--border-color)',
                                            color: 'var(--text-tertiary)', fontSize: 10, width: 28, textAlign: 'right',
                                            position: 'sticky', left: 0, background: 'inherit', zIndex: 1,
                                          }}>{isHeader ? '#' : ri}</td>
                                          {cells.map((cell, ci) => {
                                            const isDescCol = ci === descColIdx;
                                            const isLastCol = ci === lastColIdx && hasNoteCol;
                                            const isOk = !isHeader && isLastCol && cell.trim() === 'OK';
                                            const isNote = !isHeader && isLastCol && !isOk && cell.trim().length > 2;
                                            return (
                                              <td key={ci} style={{
                                                padding: '4px 8px',
                                                borderBottom: '1px solid var(--border-color)',
                                                borderLeft: '1px solid var(--border-color)',
                                                color: isOk ? '#52c41a' : isNote ? '#fa8c16' : 'var(--text-color)',
                                                fontWeight: isHeader ? 700 : isNote ? 600 : 400,
                                                fontSize: isHeader ? 11 : 11,
                                                whiteSpace: 'normal',
                                                wordBreak: 'break-word',
                                                minWidth: ci === 0 ? 30 : undefined,
                                                verticalAlign: 'top',
                                                ...(isNote ? { background: 'rgba(250, 173, 20, 0.06)' } : {}),
                                                ...(isHeader ? { position: 'sticky' as const, top: 0, background: 'var(--bg-secondary)', zIndex: 1 } : {}),
                                              }}>
                                                {isOk ? <span>✅ OK</span> : cell}
                                              </td>
                                            );
                                          })}
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    {/* Right: Preview + edit */}
                    <div style={{ flex: 2, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                      <div style={{
                        padding: '4px 8px', borderBottom: '1px solid var(--border-color)',
                        display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-secondary)', flexShrink: 0,
                      }}>
                        <EyeOutlined style={{ color: 'var(--text-secondary)', fontSize: 12 }} />
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Preview</span>
                        <Tag style={{ fontSize: 10, marginLeft: 'auto' }}>{editedText.length} chars</Tag>
                      </div>
                      <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
                        {/* Render pipe-separated text as table */}
                        {editedText.split(/\n(?=\[Sheet:)/).filter(Boolean).map((block, bi) => {
                          const lines = block.split('\n').filter(l => l.trim());
                          const sheetMatch = lines[0]?.match(/^\[Sheet: (.+)\]$/);
                          const dataLines = sheetMatch ? lines.slice(1) : lines;
                          const hasPipe = dataLines.some(l => l.includes(' | '));
                          if (!hasPipe && dataLines.length === 0) return null;
                          const headerCells = dataLines[0]?.split(' | ') || [];
                          const colCount = headerCells.length;
                          const descIdx = headerCells.findIndex(h => /tên hàng|mô tả|description/i.test(h));
                          const lastIdx = colCount - 1;
                          const hasNotes = lastIdx > 3;
                          return (
                            <div key={bi} style={{ marginBottom: 16 }}>
                              {sheetMatch && (
                                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-color)', marginBottom: 4 }}>
                                  📊 {sheetMatch[1]}
                                </div>
                              )}
                              {hasPipe ? (
                                <div style={{ overflow: 'auto', border: '1px solid var(--border-color)', borderRadius: 6 }}>
                                  <table style={{ borderCollapse: 'collapse', fontSize: 11, width: '100%', tableLayout: 'fixed' as const }}>
                                    <tbody>
                                      {dataLines.map((row, ri) => {
                                        const cells = row.split(' | ');
                                        const isHeader = ri === 0;
                                        const lastCell = cells[cells.length - 1]?.trim() || '';
                                        const isOk = !isHeader && hasNotes && lastCell === 'OK';
                                        const isNote = !isHeader && hasNotes && !isOk && lastCell.length > 2;
                                        return (
                                          <tr key={ri} style={{
                                            background: isHeader ? 'var(--bg-secondary)' : isNote ? 'rgba(250,173,20,0.08)' : ri % 2 === 0 ? 'var(--bg-color)' : 'transparent',
                                          }}>
                                            {cells.map((cell, ci) => {
                                              const isDesc = ci === descIdx;
                                              const isLast = ci === lastIdx && hasNotes;
                                              return (
                                                <td key={ci} style={{
                                                  padding: '3px 6px', borderBottom: '1px solid var(--border-color)',
                                                  borderLeft: ci > 0 ? '1px solid var(--border-color)' : undefined,
                                                  fontWeight: isHeader ? 700 : isNote && isLast ? 600 : 400,
                                                  color: isOk && isLast ? '#52c41a' : isNote && isLast ? '#fa8c16' : 'var(--text-color)',
                                                  whiteSpace: 'normal',
                                                  wordBreak: 'break-word',
                                                  verticalAlign: 'top', fontSize: 11,
                                                }}>{isOk && isLast ? '✅' : cell}</td>
                                              );
                                            })}
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              ) : (
                                <pre style={{ margin: 0, fontSize: 11, color: 'var(--text-color)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.6 }}>
                                  {dataLines.join('\n')}
                                </pre>
                              )}
                            </div>
                          );
                        })}
                        {/* Edit toggle */}
                        <details style={{ marginTop: 12, borderTop: '1px solid var(--border-color)', paddingTop: 8 }}>
                          <summary style={{ fontSize: 11, color: 'var(--text-tertiary)', cursor: 'pointer' }}>✏️ Edit raw text</summary>
                          <Input.TextArea
                            value={editedText}
                            onChange={e => setEditedText(e.target.value)}
                            style={{ marginTop: 6, fontFamily: 'monospace', fontSize: 11, background: 'var(--bg-secondary)', color: 'var(--text-color)', border: '1px solid var(--border-color)' }}
                            autoSize={{ minRows: 8, maxRows: 30 }}
                          />
                        </details>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Correction note display */}
              {reviewState[selectedItem.file]?.note && (
                <div style={{
                  padding: '6px 16px',
                  background: 'rgba(250, 173, 20, 0.08)',
                  borderTop: '1px solid var(--border-color)',
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                }}>
                  <ExclamationCircleOutlined style={{ marginRight: 6, color: '#faad14' }} />
                  Note: {reviewState[selectedItem.file].note}
                </div>
              )}

              {/* Re-OCR progress */}
              {reOcring && reOcrStep && (
                <div style={{
                  padding: '8px 16px', borderTop: '1px solid var(--border-color)',
                  background: 'rgba(114, 46, 209, 0.08)', display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <Spin size="small" />
                  <span style={{ fontSize: 13, color: 'var(--accent-color)', fontWeight: 600 }}>{reOcrStep}</span>
                </div>
              )}

              {/* Action buttons */}
              <div style={{
                padding: '10px 16px',
                borderTop: '1px solid var(--border-color)',
                display: 'flex',
                gap: 8,
                flexShrink: 0,
                background: 'var(--bg-secondary)',
              }}>
                <Button
                  type="primary"
                  icon={<CheckCircleOutlined />}
                  onClick={handleApprove}
                  loading={saving}
                  style={{ background: '#52c41a', borderColor: '#52c41a' }}
                >
                  Approve
                </Button>
                <Button
                  icon={<ExclamationCircleOutlined />}
                  onClick={handleNeedsFix}
                  loading={saving}
                  style={{ color: '#fa8c16', borderColor: '#fa8c16' }}
                >
                  Needs Fix
                </Button>
                <Button
                  danger
                  icon={<CloseCircleOutlined />}
                  onClick={handleReject}
                  loading={saving}
                >
                  Reject
                </Button>
                <div style={{ flex: 1 }} />
                {selectedItem.type === 'image' && (
                  <Button
                    type="primary"
                    icon={<EyeOutlined />}
                    onClick={handleReOcr}
                    loading={reOcring}
                    style={{ background: 'var(--accent-color)', borderColor: 'var(--accent-color)' }}
                  >
                    {reOcring ? 'Đang đọc lại...' : '🤖 Re-OCR (Claude Vision)'}
                  </Button>
                )}
                <Button onClick={goNextPending}>
                  Next Pending
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Needs Fix Modal ──────────────────────────────────────── */}
      <Modal
        title="What needs fixing?"
        open={fixModalOpen}
        onOk={confirmNeedsFix}
        onCancel={() => setFixModalOpen(false)}
        okText="Save"
        cancelText="Cancel"
      >
        <Input.TextArea
          value={fixNote}
          onChange={e => setFixNote(e.target.value)}
          placeholder="Describe what is wrong with the OCR result..."
          rows={4}
          style={{ marginTop: 8 }}
        />
      </Modal>
    </div>
  );
}
