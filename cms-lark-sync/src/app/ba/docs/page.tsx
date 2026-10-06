'use client';

import React, { Suspense, useEffect, useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Card, Button, Select, Space, Typography, Empty, Tag, Tabs, message,
  Upload, Popconfirm, Modal, Input, Tree, Badge, Drawer, Tooltip, Segmented, Timeline,
} from 'antd';
import type { DataNode } from 'antd/es/tree';
import {
  FileSearchOutlined, ReloadOutlined, DownloadOutlined,
  HistoryOutlined, CopyOutlined, UploadOutlined,
  DeleteOutlined, FileTextOutlined, FileExcelOutlined,
  FilePdfOutlined, FolderOutlined, DatabaseOutlined, PictureOutlined,
  EditOutlined, SaveOutlined, CloseOutlined, CommentOutlined, EyeOutlined,
  CheckOutlined, SendOutlined, UserOutlined, InboxOutlined, PlusOutlined, MergeCellsOutlined,
  BarChartOutlined, LinkOutlined, CloudUploadOutlined,
} from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  listBases, listDocuments, uploadDocument, deleteDocument, getDocument, getDocumentDownloadUrl,
  getDocumentDiff, saveDocumentEdit, listDocumentVersions, listAnnotations,
  createAnnotation, addAnnotationReply, resolveAnnotation, deleteAnnotation,
  renameDocument, createCommit, listCommits,
  getRenderedImage, uploadRenderedSvg, pushDocToLark,
  type BaseReg, type BADocument, type BAAnnotation, type StagedChange, type BACommit,
} from '@/lib/baApi';

const { Title, Text } = Typography;

// ═══ Constants ═══

const EXT_ICONS: Record<string, React.ReactNode> = {
  '.md': <FileTextOutlined style={{ color: '#6366f1' }} />,
  '.txt': <FileTextOutlined style={{ color: '#8b8b8b' }} />,
  '.json': <FileTextOutlined style={{ color: '#f59e0b' }} />,
  '.csv': <FileTextOutlined style={{ color: '#14b8a6' }} />,
  '.pdf': <FilePdfOutlined style={{ color: '#ef4444' }} />,
  '.docx': <FileExcelOutlined style={{ color: '#3b82f6' }} />,
  '.xlsx': <FileExcelOutlined style={{ color: '#22c55e' }} />,
  '.xls': <FileExcelOutlined style={{ color: '#22c55e' }} />,
  '.puml': <PictureOutlined style={{ color: '#22c55e' }} />,
  '.plantuml': <PictureOutlined style={{ color: '#22c55e' }} />,
};

const TEXT_EXTS = ['.md', '.txt', '.json', '.puml', '.plantuml', '.csv'];

function toSlug(name: string) { return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

// ═══ File tree builder ═══

function buildTree(docs: BADocument[], onFolderAction?: (folder: string, action: 'rename' | 'delete') => void): DataNode[] {
  const grouped: Record<string, BADocument[]> = { '': [] };
  for (const d of docs) { const f = d.folder || ''; if (!grouped[f]) grouped[f] = []; grouped[f].push(d); }
  for (const k of Object.keys(grouped)) grouped[k].sort((a, b) => a.filename.localeCompare(b.filename));

  const mkFile = (f: BADocument): DataNode => ({
    key: f.id || f._id,
    title: (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 13 }}>{EXT_ICONS[f.file_ext] || <FileTextOutlined />}</span>
        <span style={{ fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.filename}</span>
        {f.version > 1 && <Tag color="blue" style={{ fontSize: 9, margin: 0, lineHeight: '16px' }}>v{f.version}</Tag>}
        {f.diff_summary && <Tag color="orange" style={{ fontSize: 9, margin: 0, lineHeight: '16px' }}>{f.diff_summary}</Tag>}
      </div>
    ),
    isLeaf: true,
  });

  const nodes: DataNode[] = (grouped[''] || []).map(mkFile);
  for (const folder of Object.keys(grouped).filter(Boolean).sort()) {
    nodes.push({
      key: `folder:${folder}`,
      title: (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Space size={4}>
            <FolderOutlined style={{ color: '#f59e0b' }} />
            <span style={{ fontWeight: 600, fontSize: 12 }}>{folder.replace(/\/$/, '')}</span>
            <Tag style={{ fontSize: 9, margin: 0 }}>{grouped[folder].length}</Tag>
          </Space>
          {onFolderAction && (
            <Space size={0} onClick={e => e.stopPropagation()}>
              <Button type="text" size="small" icon={<EditOutlined style={{ fontSize: 10 }} />}
                onClick={() => onFolderAction(folder, 'rename')} />
              <Button type="text" size="small" danger icon={<DeleteOutlined style={{ fontSize: 10 }} />}
                onClick={() => onFolderAction(folder, 'delete')} />
            </Space>
          )}
        </div>
      ),
      children: grouped[folder].map(mkFile),
    });
  }
  return nodes;
}

// ═══ Markdown styles ═══

const MD_STYLES = `
.md-render { color: var(--text-color); font-size: 14px; line-height: 1.8; }
.md-render h1 { font-size: 1.5em; font-weight: 700; margin: 20px 0 10px; border-bottom: 1px solid var(--border-color); padding-bottom: 6px; }
.md-render h2 { font-size: 1.3em; font-weight: 600; margin: 18px 0 8px; border-bottom: 1px solid var(--border-color); padding-bottom: 4px; }
.md-render h3 { font-size: 1.1em; font-weight: 600; margin: 14px 0 6px; color: var(--accent-color); }
.md-render p { margin: 6px 0; }
.md-render ul, .md-render ol { margin: 6px 0; padding-left: 20px; }
.md-render li { margin: 3px 0; }
.md-render code { background: var(--bg-tertiary); padding: 1px 5px; border-radius: 3px; font-size: 0.88em; }
.md-render pre { background: var(--bg-tertiary); padding: 12px; border-radius: 6px; overflow-x: auto; margin: 10px 0; border: 1px solid var(--border-color); }
.md-render pre code { background: none; padding: 0; }
.md-render table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 13px; display: block; overflow-x: auto; }
.md-render th { background: var(--bg-tertiary); font-weight: 600; text-align: left; padding: 6px 10px; border: 1px solid var(--border-color); }
.md-render td { padding: 5px 10px; border: 1px solid var(--border-color); }
.md-render blockquote { border-left: 3px solid var(--accent-color); margin: 10px 0; padding: 6px 14px; background: var(--bg-tertiary); border-radius: 0 4px 4px 0; }
.md-render a { color: var(--accent-color); }
.md-render hr { border: none; border-top: 1px solid var(--border-color); margin: 14px 0; }
`;

// ═══ Main Page ═══

// ═══ Overview Tab — load & render all doc contents ═══

function OverviewTab({ documents, baseName, openDoc }: { documents: BADocument[]; baseName: string; openDoc: (id: string) => void }) {
  const allDocs = useMemo(() => documents
    .filter(d => ['.md', '.txt', '.puml', '.plantuml', '.json', '.csv'].includes(d.file_ext))
    .sort((a, b) => {
      const fa = a.folder || '', fb = b.folder || '';
      if (fa !== fb) return fa.localeCompare(fb);
      // README first in each folder
      if (a.filename.toLowerCase().startsWith('readme')) return -1;
      if (b.filename.toLowerCase().startsWith('readme')) return 1;
      return a.filename.localeCompare(b.filename);
    }), [documents]);
  const [contents, setContents] = useState<Record<string, string>>({});
  const [pumlImages, setPumlImages] = useState<Record<string, string>>({});
  const [loadingAll, setLoadingAll] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [tocOpen, setTocOpen] = useState(true);
  const [lastHash, setLastHash] = useState('');

  // Hash to detect changes
  const docHash = useMemo(() => allDocs.map(d => `${d.id || d._id}:${d.version}`).join(','), [allDocs]);

  const loadAll = useCallback(async () => {
    setLoadingAll(true);
    const cMap: Record<string, string> = {};
    const pMap: Record<string, string> = {};
    for (const d of allDocs) {
      const id = d.id || d._id;
      try {
        const full = await getDocument(id);
        cMap[id] = full.text_content || '';
        // Render puml
        if (['.puml', '.plantuml'].includes(d.file_ext)) {
          // Try cache first
          try {
            const cached = await getRenderedImage(id);
            if (cached?.image_base64) { pMap[id] = cached.image_base64; continue; }
          } catch {}
          // Render
          try {
            const encoded = btoa(unescape(encodeURIComponent(full.text_content || '')));
            const res = await fetch(`https://kroki.io/plantuml/svg/${encoded}`);
            if (res.ok) {
              const svg = await res.text();
              pMap[id] = svg;
              uploadRenderedSvg(id, svg).catch(() => {});
            }
          } catch {}
        }
      } catch { cMap[id] = '_Không load được_'; }
    }
    setContents(cMap);
    setPumlImages(pMap);
    setLoaded(true);
    setLastHash(docHash);
    setLoadingAll(false);
  }, [allDocs, docHash]);

  // Auto-load on mount or when docs change
  useEffect(() => { if (allDocs.length > 0 && (!loaded || docHash !== lastHash)) loadAll(); }, [allDocs.length, docHash, lastHash, loaded, loadAll]);

  const mergedMarkdown = useMemo(() => {
    if (!loaded) return '';
    return allDocs.filter(d => ['.md', '.txt'].includes(d.file_ext)).map(d => {
      const folder = d.folder ? `${d.folder.replace(/\/$/, '')} / ` : '';
      return `## ${folder}${d.filename}\n\n${contents[d.id || d._id] || '_Trống_'}`;
    }).join('\n\n---\n\n');
  }, [allDocs, contents, loaded]);

  // TOC grouped by folder
  const tocGroups = useMemo(() => {
    const groups: Record<string, BADocument[]> = { '': [] };
    for (const d of allDocs) { const f = d.folder || ''; if (!groups[f]) groups[f] = []; groups[f].push(d); }
    return groups;
  }, [allDocs]);

  if (allDocs.length === 0) return <Card size="small"><Empty description="Không có file" /></Card>;

  return (
    <Card size="small">
      <Space style={{ marginBottom: 12 }}>
        <Button size="small" icon={<ReloadOutlined />} onClick={loadAll} loading={loadingAll}>Reload</Button>
        {loaded && (
          <>
            <Button size="small" icon={<CopyOutlined />} onClick={() => {
              navigator.clipboard.writeText(`# ${baseName} — Overview\n\n${mergedMarkdown}`);
              message.success(`Copied`);
            }}>Copy All</Button>
            <Button size="small" icon={<DownloadOutlined />} onClick={() => {
              const filename = `${baseName.replace(/[^a-zA-Z0-9\u00C0-\u1EF9 _-]/g, '').trim()} — Overview`;
              const md = `# ${filename}\n\n_${allDocs.length} documents · ${new Date().toLocaleDateString('vi')}_\n\n---\n\n${mergedMarkdown}`;
              const w = window.open('', '_blank');
              if (!w) { message.error('Popup bị chặn — cho phép popup cho trang này'); return; }
              const css = [
                'body{font-family:-apple-system,system-ui,sans-serif;max-width:900px;margin:0 auto;padding:24px;font-size:14px;line-height:1.8;color:#333}',
                'h1{font-size:1.6em;border-bottom:2px solid #333;padding-bottom:8px}',
                'h2{font-size:1.3em;color:#6366f1;border-bottom:1px solid #ddd;padding-bottom:4px;margin-top:32px}',
                'h3{font-size:1.1em;color:#333;margin-top:20px}',
                'table{border-collapse:collapse;width:100%;margin:12px 0;font-size:13px}',
                'th{background:#f5f5f5;font-weight:600;text-align:left}th,td{border:1px solid #ddd;padding:6px 10px}',
                'code{background:#f0f0f0;padding:1px 5px;border-radius:3px;font-size:0.9em}',
                'pre{background:#f5f5f5;padding:12px;border-radius:6px;overflow-x:auto;font-size:12px}',
                'pre code{background:none}',
                'blockquote{border-left:3px solid #6366f1;margin:12px 0;padding:8px 14px;background:#f8f8ff}',
                'hr{border:none;border-top:1px solid #eee;margin:24px 0}a{color:#6366f1}img{max-width:100%}',
                '@media print{body{font-size:12px;padding:0}}',
              ].join('');
              w.document.write([
                '<!DOCTYPE html><html><head><meta charset="utf-8">',
                '<title>', filename, '</title>',
                '<style>', css, '</style>',
                '<script src="https://cdn.jsdelivr.net/npm/marked@12/marked.min.js"></', 'script>',
                '</head><body>',
                '<div id="r"></div>',
                '<script>',
                'document.getElementById("r").innerHTML=marked.parse(', JSON.stringify(md), ');',
                'setTimeout(function(){window.print()},800);',
                '</', 'script>',
                '</body></html>',
              ].join(''));
              w.document.close();
            }}>Xuất PDF</Button>
          </>
        )}
        <Text type="secondary" style={{ fontSize: 11 }}>{allDocs.length} files</Text>
      </Space>

      {/* Content */}
      {loadingAll ? <Card loading /> : !loaded ? null : (
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          {/* TOC sidebar — sticky, with headings from content */}
          <div style={{
            width: tocOpen ? 220 : 0, flexShrink: 0, position: 'sticky', top: 8,
            transition: 'width 0.2s', overflow: 'hidden',
          }}>
            <div style={{ width: 220, maxHeight: 'calc(100vh - 200px)', overflow: 'auto',
              border: '1px solid var(--border-color)', borderRadius: 6, background: 'var(--bg-color)', padding: '6px 8px' }}>
              <Text strong style={{ fontSize: 11, display: 'block', marginBottom: 6, color: 'var(--accent-color)' }}>
                Mục lục ({allDocs.length} files)
              </Text>
              {allDocs.map(d => {
                const id = d.id || d._id;
                const content = contents[id] || '';
                const headings = d.file_ext === '.md'
                  ? content.split('\n').filter(l => /^#{1,3}\s/.test(l)).map(l => ({
                      level: l.match(/^(#+)/)?.[1].length || 1,
                      text: l.replace(/^#+\s*/, ''),
                    }))
                  : [];
                return (
                  <div key={id} style={{ marginBottom: 6 }}>
                    {/* File = h1 level */}
                    <a href={`#doc-${id}`}
                      style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-color)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4, padding: '2px 0' }}
                      onClick={e => { e.preventDefault(); document.getElementById(`doc-${id}`)?.scrollIntoView({ behavior: 'smooth' }); }}>
                      <span style={{ fontSize: 10 }}>{EXT_ICONS[d.file_ext] || <FileTextOutlined />}</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.filename}</span>
                    </a>
                    {/* Internal headings */}
                    {headings.slice(0, 15).map((h, hi) => (
                      <a key={hi} href={`#doc-${id}-h${hi}`}
                        style={{ fontSize: 10, color: 'var(--text-tertiary)', textDecoration: 'none', display: 'block', paddingLeft: 8 + (h.level - 1) * 8, lineHeight: '18px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        onClick={e => { e.preventDefault(); document.getElementById(`doc-${id}-h${hi}`)?.scrollIntoView({ behavior: 'smooth' }); }}>
                        {h.text}
                      </a>
                    ))}
                    {headings.length > 15 && <Text type="secondary" style={{ fontSize: 9, paddingLeft: 16 }}>+{headings.length - 15}</Text>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Toggle TOC button */}
          <Button type="text" size="small"
            onClick={() => setTocOpen(v => !v)}
            style={{ position: 'sticky', top: 8, flexShrink: 0, fontSize: 11, padding: '2px 4px', zIndex: 1 }}>
            {tocOpen ? '◀' : '▶'}
          </Button>

          {/* Documents */}
          <div className="md-render" style={{ flex: 1, minWidth: 0, maxHeight: 'calc(100vh - 200px)', overflow: 'auto' }}>
            {allDocs.map(d => {
              const id = d.id || d._id;
              const content = contents[id];
              const svg = pumlImages[id];
              const isPuml = ['.puml', '.plantuml'].includes(d.file_ext);
              return (
                <div key={id} id={`doc-${id}`} style={{ marginBottom: 16 }}>
                  {/* Collapsible doc header */}
                  <details open>
                    <summary style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                      borderBottom: '2px solid var(--accent-color)', paddingBottom: 6, marginBottom: 10, listStyle: 'none' }}>
                      <span style={{ fontSize: 14 }}>{EXT_ICONS[d.file_ext] || <FileTextOutlined />}</span>
                      {d.folder && <Tag color="orange" style={{ fontSize: 10 }}>{d.folder.replace(/\/$/, '')}</Tag>}
                      <Text strong style={{ fontSize: 14, cursor: 'pointer', color: 'var(--accent-color)' }}
                        onClick={(e) => { e.preventDefault(); openDoc(id); }}>{d.filename}</Text>
                      {d.version > 1 && <Tag color="blue" style={{ fontSize: 9 }}>v{d.version}</Tag>}
                      {isPuml && <Tag color="green" style={{ fontSize: 9 }}>diagram</Tag>}
                      <Text type="secondary" style={{ fontSize: 11, marginLeft: 'auto' }}>{(d.file_size / 1024).toFixed(1)}KB</Text>
                    </summary>
                    <div style={{ paddingTop: 8 }}>
                      {isPuml && svg ? (
                        <div dangerouslySetInnerHTML={{ __html: svg }}
                          style={{ background: '#fff', padding: 12, borderRadius: 6, border: '1px solid var(--border-color)', overflow: 'auto' }} />
                      ) : isPuml && content ? (
                        <pre style={{ background: 'var(--bg-tertiary)', padding: 10, borderRadius: 6, fontSize: 12, whiteSpace: 'pre-wrap' }}>{content}</pre>
                      ) : content ? (
                        d.file_ext === '.md' ? (() => {
                          let hIdx = 0;
                          return (
                            <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                              h1: ({ children, ...p }) => <h1 id={`doc-${id}-h${hIdx++}`} {...p}>{children}</h1>,
                              h2: ({ children, ...p }) => <h2 id={`doc-${id}-h${hIdx++}`} {...p}>{children}</h2>,
                              h3: ({ children, ...p }) => <h3 id={`doc-${id}-h${hIdx++}`} {...p}>{children}</h3>,
                            }}>{content}</ReactMarkdown>
                          );
                        })() : (
                          <pre style={{ background: 'var(--bg-tertiary)', padding: 10, borderRadius: 6, fontSize: 12, whiteSpace: 'pre-wrap', maxHeight: 500, overflow: 'auto' }}>{content}</pre>
                        )
                      ) : (
                        <Text type="secondary" italic>Trống</Text>
                      )}
                    </div>
                  </details>
                  <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '12px 0' }} />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}

// ═══ Stats Tab ═══

function StatsTab({ documents, commits, annotations }: {
  documents: BADocument[];
  commits: BACommit[];
  annotations: BAAnnotation[];
}) {
  const stats = useMemo(() => {
    const totalSize = documents.reduce((s, d) => s + (d.file_size || 0), 0);
    const totalVersions = documents.reduce((s, d) => s + (d.version || 1), 0);

    // By extension
    const byExt: Record<string, { count: number; size: number }> = {};
    for (const d of documents) {
      const ext = d.file_ext || '(none)';
      if (!byExt[ext]) byExt[ext] = { count: 0, size: 0 };
      byExt[ext].count++;
      byExt[ext].size += d.file_size || 0;
    }

    // By folder
    const byFolder: Record<string, { count: number; size: number }> = {};
    for (const d of documents) {
      const folder = d.folder || '(root)';
      if (!byFolder[folder]) byFolder[folder] = { count: 0, size: 0 };
      byFolder[folder].count++;
      byFolder[folder].size += d.file_size || 0;
    }

    // By author
    const byAuthor: Record<string, number> = {};
    for (const d of documents) {
      const author = d.author || '(unknown)';
      byAuthor[author] = (byAuthor[author] || 0) + 1;
    }

    // Multi-version docs
    const multiVersion = documents.filter(d => d.version > 1).sort((a, b) => b.version - a.version);

    // Recent docs (last 7 days)
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recentDocs = documents.filter(d => new Date(d.uploaded_at).getTime() > weekAgo);

    // Annotations
    const openNotes = annotations.filter(a => a.status === 'open').length;
    const resolvedNotes = annotations.filter(a => a.status === 'resolved').length;

    return { totalSize, totalVersions, byExt, byFolder, byAuthor, multiVersion, recentDocs, openNotes, resolvedNotes };
  }, [documents, commits, annotations]);

  if (documents.length === 0) return <Card size="small"><Empty description="Không có dữ liệu" /></Card>;

  const fmtSize = (bytes: number) => bytes < 1024 ? `${bytes}B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)}KB` : `${(bytes / 1024 / 1024).toFixed(1)}MB`;

  const statCard = (label: string, value: string | number, color: string, sub?: string) => (
    <div style={{ background: 'var(--bg-tertiary)', borderRadius: 8, padding: '12px 16px', borderLeft: `4px solid ${color}`, flex: '1 1 140px', minWidth: 140 }}>
      <Text style={{ fontSize: 22, fontWeight: 700, color, display: 'block', lineHeight: 1.2 }}>{value}</Text>
      <Text style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</Text>
      {sub && <Text style={{ fontSize: 10, color: 'var(--text-tertiary)', display: 'block' }}>{sub}</Text>}
    </div>
  );

  const extColors: Record<string, string> = { '.md': '#6366f1', '.txt': '#8b8b8b', '.json': '#f59e0b', '.csv': '#14b8a6', '.pdf': '#ef4444', '.docx': '#3b82f6', '.xlsx': '#22c55e', '.puml': '#22c55e', '.plantuml': '#22c55e' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Summary cards */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {statCard('Files', documents.length, '#6366f1', `${Object.keys(stats.byFolder).length} folders`)}
        {statCard('Tổng dung lượng', fmtSize(stats.totalSize), '#14b8a6', `TB: ${fmtSize(documents.length > 0 ? stats.totalSize / documents.length : 0)}/file`)}
        {statCard('Tổng versions', stats.totalVersions, '#f59e0b', `${stats.multiVersion.length} files có nhiều phiên bản`)}
        {statCard('Commits', commits.length, '#8b5cf6', commits.length > 0 ? `Gần nhất: ${new Date(commits[0]?.created_at).toLocaleDateString('vi')}` : undefined)}
        {statCard('Ghi chú', `${stats.openNotes} mở`, '#ec4899', `${stats.resolvedNotes} đã giải quyết`)}
        {statCard('7 ngày qua', `${stats.recentDocs.length} thay đổi`, '#22c55e')}
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {/* By extension */}
        <Card size="small" title={<Text strong style={{ fontSize: 13 }}>Theo loại file</Text>} style={{ flex: '1 1 280px' }}>
          {Object.entries(stats.byExt).sort((a, b) => b[1].count - a[1].count).map(([ext, data]) => {
            const pct = (data.count / documents.length * 100).toFixed(0);
            return (
              <div key={ext} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ width: 20, textAlign: 'center' }}>{EXT_ICONS[ext] || <FileTextOutlined />}</span>
                <Text style={{ fontSize: 12, width: 60 }}>{ext}</Text>
                <div style={{ flex: 1, height: 18, background: 'var(--bg-tertiary)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: extColors[ext] || '#6366f1', borderRadius: 4, minWidth: 2 }} />
                </div>
                <Text style={{ fontSize: 11, width: 30, textAlign: 'right' }}>{data.count}</Text>
                <Text type="secondary" style={{ fontSize: 10, width: 50, textAlign: 'right' }}>{fmtSize(data.size)}</Text>
              </div>
            );
          })}
        </Card>

        {/* By folder */}
        <Card size="small" title={<Text strong style={{ fontSize: 13 }}>Theo thư mục</Text>} style={{ flex: '1 1 280px' }}>
          {Object.entries(stats.byFolder).sort((a, b) => b[1].count - a[1].count).map(([folder, data]) => {
            const pct = (data.count / documents.length * 100).toFixed(0);
            return (
              <div key={folder} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <FolderOutlined style={{ color: '#f59e0b', fontSize: 12 }} />
                <Text style={{ fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {folder === '(root)' ? <em style={{ color: 'var(--text-tertiary)' }}>(root)</em> : folder.replace(/\/$/, '')}
                </Text>
                <div style={{ width: 80, height: 18, background: 'var(--bg-tertiary)', borderRadius: 4, overflow: 'hidden', flexShrink: 0 }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: '#f59e0b', borderRadius: 4, minWidth: 2 }} />
                </div>
                <Text style={{ fontSize: 11, width: 30, textAlign: 'right' }}>{data.count}</Text>
                <Text type="secondary" style={{ fontSize: 10, width: 50, textAlign: 'right' }}>{fmtSize(data.size)}</Text>
              </div>
            );
          })}
        </Card>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {/* By author */}
        {Object.keys(stats.byAuthor).length > 0 && (
          <Card size="small" title={<Text strong style={{ fontSize: 13 }}>Theo tác giả</Text>} style={{ flex: '1 1 240px' }}>
            {Object.entries(stats.byAuthor).sort((a, b) => b[1] - a[1]).map(([author, count]) => (
              <div key={author} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <UserOutlined style={{ fontSize: 11, color: 'var(--text-tertiary)' }} />
                <Text style={{ fontSize: 12, flex: 1 }}>{author}</Text>
                <Tag style={{ fontSize: 10, margin: 0 }}>{count}</Tag>
              </div>
            ))}
          </Card>
        )}

        {/* Multi-version files */}
        {stats.multiVersion.length > 0 && (
          <Card size="small" title={<Text strong style={{ fontSize: 13 }}>Files nhiều phiên bản</Text>} style={{ flex: '1 1 300px' }}>
            {stats.multiVersion.slice(0, 10).map(d => (
              <div key={d.id || d._id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 12 }}>{EXT_ICONS[d.file_ext] || <FileTextOutlined />}</span>
                <Text style={{ fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {d.folder ? `${d.folder}` : ''}{d.filename}
                </Text>
                <Tag color="blue" style={{ fontSize: 10, margin: 0 }}>v{d.version}</Tag>
                <Text type="secondary" style={{ fontSize: 10 }}>{fmtSize(d.file_size)}</Text>
              </div>
            ))}
            {stats.multiVersion.length > 10 && <Text type="secondary" style={{ fontSize: 10 }}>+{stats.multiVersion.length - 10} files khác</Text>}
          </Card>
        )}

        {/* Recent commits */}
        {commits.length > 0 && (
          <Card size="small" title={<Text strong style={{ fontSize: 13 }}>Commits gần đây</Text>} style={{ flex: '1 1 300px' }}>
            {commits.slice(0, 8).map(c => (
              <div key={c.id || c._id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, padding: '4px 0', borderBottom: '1px solid var(--border-color)' }}>
                <InboxOutlined style={{ fontSize: 11, color: '#8b5cf6' }} />
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <Text style={{ fontSize: 12, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.message}</Text>
                  <Text type="secondary" style={{ fontSize: 10 }}>{c.author} · {new Date(c.created_at).toLocaleDateString('vi')} · {c.files_changed} files</Text>
                </div>
              </div>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}

// ═══ Lark Doc URLs (đã sync từ schema) ═══

const LARK_DOC_URLS: Record<string, string> = {
  // v3 — Lark token bases (latest professional docs)
  '69f980c84518aa495b8fc076': 'https://www.larksuite.com/docx/KosRd4P9So81sJxs9OmlVQ3Ogyh',  // 2.3 KT
  '69f97fbb4518aa495b8fc075': 'https://www.larksuite.com/docx/UWdOdHrCSo75PoxT7jfloUC4gGb',  // HN Kho
  '69f97eb64518aa495b8fc074': 'https://www.larksuite.com/docx/HBjRdSwUzoIGWCxGbYSlQvzsgpe',  // Order
  '69f97e454518aa495b8fc073': 'https://www.larksuite.com/docx/VIgOdgrgUoARx3xFJtqlL1E1gLc',  // TTQT
  '69f97dae4518aa495b8fc072': 'https://www.larksuite.com/docx/NOszdh52sovUJaxuoJ1lHZxHg4P',  // 2.5 XNK
  '69f97ce44518aa495b8fc071': 'https://www.larksuite.com/docx/EbJudFcBiookWzxM0WglbRK2gom',  // 2.4 XNK
  '69f97bd94518aa495b8fc070': 'https://www.larksuite.com/docx/BgDZdxxctoVzCixJvvKl6zVng4d',  // 2.3 XNK
  '69f97b424518aa495b8fc06f': 'https://www.larksuite.com/docx/XENEd1BuZowzu2xw4dvl8G3LgJp',  // 2.2 XNK
  '69f97abe4518aa495b8fc06e': 'https://www.larksuite.com/docx/S6dNdVxyBoZfppxXAnSlM9vngLe',  // 2.1 XNK
  '69f519d6b8274f639beadfcc': 'https://www.larksuite.com/docx/X21cdNlHJoxZXVxzNCClJW3VgAf',  // HOA NAM

  // Slug bases (cũ — link cùng Lark doc theo tên)
  '6a02097921a5627d454855a6': 'https://www.larksuite.com/docx/S6dNdVxyBoZfppxXAnSlM9vngLe',  // 2.1 XNK
  '6a02065521a5627d4548553a': 'https://www.larksuite.com/docx/VIgOdgrgUoARx3xFJtqlL1E1gLc',  // TTQT
  '6a02065521a5627d45485539': 'https://www.larksuite.com/docx/HBjRdSwUzoIGWCxGbYSlQvzsgpe',  // Order
  '6a02065521a5627d45485538': 'https://www.larksuite.com/docx/NOszdh52sovUJaxuoJ1lHZxHg4P',  // 2.5 XNK
  '6a02065421a5627d45485537': 'https://www.larksuite.com/docx/EbJudFcBiookWzxM0WglbRK2gom',  // 2.4 XNK
  '6a02065421a5627d45485536': 'https://www.larksuite.com/docx/BgDZdxxctoVzCixJvvKl6zVng4d',  // 2.3 XNK
  '6a02065421a5627d45485535': 'https://www.larksuite.com/docx/KosRd4P9So81sJxs9OmlVQ3Ogyh',  // 2.3 KT
  '6a02065421a5627d45485534': 'https://www.larksuite.com/docx/XENEd1BuZowzu2xw4dvl8G3LgJp',  // 2.2 XNK
  '6a02064b21a5627d45485533': 'https://www.larksuite.com/docx/X21cdNlHJoxZXVxzNCClJW3VgAf',  // HOA NAM
};

// ═══ Main Page ═══

function DocsPage() {
  // Data
  const [bases, setBases] = useState<BaseReg[]>([]);
  const [selectedBase, setSelectedBase] = useState('');
  const [documents, setDocuments] = useState<BADocument[]>([]);
  const [loading, setLoading] = useState(false);

  // File preview
  const [activeDoc, setActiveDoc] = useState<BADocument | null>(null);
  const [docLoading, setDocLoading] = useState(false);

  // Edit
  const [editMode, setEditMode] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [author, setAuthor] = useState('');
  const [pushingLark, setPushingLark] = useState<string | null>(null);
  const [larkDocUrls, setLarkDocUrls] = useState<Record<string, string>>({});
  const [syncingLark, setSyncingLark] = useState(false);

  // Upload
  const [uploading, setUploading] = useState(false);
  const [uploadFolder, setUploadFolder] = useState('');

  // History
  const [versions, setVersions] = useState<BADocument[]>([]);
  const [diffLines, setDiffLines] = useState<string[] | null>(null);

  // Annotations
  const [annotations, setAnnotations] = useState<BAAnnotation[]>([]);
  const [annotationDrawer, setAnnotationDrawer] = useState(false);
  const [annotationFilter, setAnnotationFilter] = useState('all');
  const [selectedText, setSelectedText] = useState<{ quote: string; prefix: string; suffix: string } | null>(null);
  const [annotationText, setAnnotationText] = useState('');
  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({});

  // Commits
  const [commits, setCommits] = useState<BACommit[]>([]);
  const [stagedChanges, setStagedChanges] = useState<StagedChange[]>([]);
  const [commitModal, setCommitModal] = useState(false);
  const [commitMsg, setCommitMsg] = useState('');
  const [committing, setCommitting] = useState(false);

  // Rename
  const [renameModal, setRenameModal] = useState(false);
  const [renameDoc, setRenameDoc] = useState<BADocument | null>(null);
  const [renameFilename, setRenameFilename] = useState('');
  const [renameFolder, setRenameFolder] = useState('');

  const [activeTab, setActiveTab] = useState('viewer');
  const [treeExpandedKeys, setTreeExpandedKeys] = useState<string[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [pumlSvg, setPumlSvg] = useState<string | null>(null);
  const [pumlRendering, setPumlRendering] = useState(false);
  const searchParams = useSearchParams();

  // ── Load ──

  useEffect(() => { listBases().then(setBases).catch(() => message.error('Không tải được bases')); }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') setAuthor(localStorage.getItem('ba_author') || '');
  }, []);

  useEffect(() => {
    if (bases.length === 0) return;
    const slug = searchParams.get('base');
    if (slug && !selectedBase) {
      const match = bases.find(b => toSlug(b.name) === slug);
      if (match) { setSelectedBase(match._id); loadDocs(match._id); }
    } else if (bases.length === 1 && !selectedBase) {
      setSelectedBase(bases[0]._id); loadDocs(bases[0]._id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bases, searchParams]);

  const loadDocs = useCallback(async (baseId: string) => {
    if (!baseId) return [];
    setLoading(true);
    try {
      const docs = await listDocuments(baseId);
      setDocuments(docs);
      setTreeExpandedKeys([...new Set(docs.map(d => d.folder).filter(Boolean).map(f => `folder:${f}`))]);
      listCommits(baseId).then(r => setCommits(r.commits)).catch(() => {});
      // Open file from URL
      const fileParam = searchParams.get('file');
      if (fileParam) {
        const match = docs.find(d => `${d.folder || ''}${d.filename}` === fileParam || `${d.folder || ''}/${d.filename}` === fileParam);
        if (match) openDoc(match.id || match._id);
      }
      return docs;
    } catch { message.error('Load failed'); }
    finally { setLoading(false); }
    return [];
  }, [searchParams]);

  // ── Document operations ──

  const renderPuml = useCallback(async (doc: BADocument) => {
    const docId = doc.id || doc._id;
    // Try cached first
    try {
      const cached = await getRenderedImage(docId);
      if (cached?.image_base64) { setPumlSvg(cached.image_base64); return; }
    } catch {}
    // Render via kroki
    setPumlRendering(true);
    try {
      const encoded = btoa(unescape(encodeURIComponent(doc.text_content || '')));
      const res = await fetch(`https://kroki.io/plantuml/svg/${encoded}`);
      if (res.ok) {
        const svg = await res.text();
        setPumlSvg(svg);
        // Cache
        uploadRenderedSvg(docId, svg).catch(() => {});
      }
    } catch { message.error('Render PlantUML thất bại'); }
    setPumlRendering(false);
  }, []);

  const openDoc = useCallback(async (docId: string) => {
    setDocLoading(true);
    setEditMode(false);
    setDiffLines(null);
    setSelectedText(null);
    setPumlSvg(null);
    try {
      const doc = await getDocument(docId);
      setActiveDoc(doc);
      setActiveTab('viewer');
      // Auto-render PlantUML
      if (['.puml', '.plantuml'].includes(doc.file_ext || '')) renderPuml(doc);
      // Load versions + annotations
      if (doc.filename) {
        listDocumentVersions(selectedBase, doc.folder || '', doc.filename).then(setVersions).catch(() => {});
        listAnnotations(selectedBase, doc.folder || '', doc.filename).then(setAnnotations).catch(() => {});
      }
      // Update URL
      const base = bases.find(b => b._id === selectedBase);
      if (base) {
        const path = doc.folder ? `${doc.folder}${doc.filename}` : doc.filename;
        window.history.replaceState(null, '', `/ba/docs?base=${toSlug(base.name)}&file=${encodeURIComponent(path)}`);
      }
    } catch { message.error('Không mở được file'); }
    finally { setDocLoading(false); }
  }, [selectedBase, bases]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const result = await uploadDocument(file, selectedBase, uploadFolder);
      message.success(`${file.name} v${result.version}${result.diff_summary ? ` — ${result.diff_summary}` : ''}`);
      loadDocs(selectedBase);
    } catch (e) { message.error(e instanceof Error ? e.message : 'Upload failed'); }
    finally { setUploading(false); }
  };

  const handleSave = async () => {
    if (!activeDoc) return;
    setSaving(true);
    try {
      await saveDocumentEdit(activeDoc.id || activeDoc._id, editContent, author);
      if (author) localStorage.setItem('ba_author', author);
      message.success('Đã lưu');
      setEditMode(false);
      // Reload
      openDoc(activeDoc.id || activeDoc._id);
      loadDocs(selectedBase);
    } catch (e) { message.error(e instanceof Error ? e.message : 'Lưu thất bại'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (docId: string) => {
    await deleteDocument(docId);
    message.success('Đã xoá');
    if (activeDoc && (activeDoc.id || activeDoc._id) === docId) setActiveDoc(null);
    loadDocs(selectedBase);
  };

  const handleDiff = async (docId: string) => {
    try {
      const { lines } = await getDocumentDiff(docId);
      setDiffLines(lines || []);
    } catch { message.error('Diff failed'); }
  };

  const handleRename = async () => {
    if (!renameDoc) return;
    try {
      await renameDocument(renameDoc.id || renameDoc._id, renameFilename, renameFolder);
      message.success('Đã đổi tên');
      setRenameModal(false);
      loadDocs(selectedBase);
      if (activeDoc && (activeDoc.id || activeDoc._id) === (renameDoc.id || renameDoc._id)) {
        openDoc(renameDoc.id || renameDoc._id);
      }
    } catch (e) { message.error(e instanceof Error ? e.message : 'Rename failed'); }
  };

  const handleCommit = async () => {
    if (!selectedBase || !commitMsg.trim() || stagedChanges.length === 0) return;
    setCommitting(true);
    try {
      await createCommit(selectedBase, commitMsg, author, stagedChanges);
      message.success('Commit created');
      setStagedChanges([]);
      setCommitMsg('');
      setCommitModal(false);
      loadDocs(selectedBase);
    } catch (e) { message.error(e instanceof Error ? e.message : 'Commit failed'); }
    finally { setCommitting(false); }
  };

  // Annotations
  const handleCreateAnnotation = async () => {
    if (!activeDoc || !selectedText || !annotationText.trim()) return;
    try {
      await createAnnotation({
        doc_id: activeDoc.id || activeDoc._id, base_id: selectedBase,
        folder: activeDoc.folder || '', filename: activeDoc.filename,
        quote: selectedText.quote, prefix: selectedText.prefix, suffix: selectedText.suffix,
        author, content: annotationText,
      });
      message.success('Đã thêm ghi chú');
      setSelectedText(null);
      setAnnotationText('');
      listAnnotations(selectedBase, activeDoc.folder || '', activeDoc.filename).then(setAnnotations).catch(() => {});
    } catch { message.error('Thêm ghi chú thất bại'); }
  };

  const handleTextSelect = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) return;
    const quote = sel.toString().trim();
    const range = sel.getRangeAt(0);
    const fullText = activeDoc?.text_content || '';
    const idx = fullText.indexOf(quote);
    setSelectedText({
      quote,
      prefix: idx > 0 ? fullText.slice(Math.max(0, idx - 50), idx) : '',
      suffix: fullText.slice(idx + quote.length, idx + quote.length + 50),
    });
  };

  // Folder actions
  const handleFolderAction = useCallback(async (folder: string, action: 'rename' | 'delete') => {
    const folderDocs = documents.filter(d => d.folder === folder);
    if (action === 'rename') {
      const newName = prompt('Tên folder mới:', folder.replace(/\/$/, ''));
      if (!newName?.trim()) return;
      const target = newName.trim().endsWith('/') ? newName.trim() : newName.trim() + '/';
      for (const doc of folderDocs) { try { await renameDocument(doc.id || doc._id, doc.filename, target); } catch {} }
      message.success(`Đã đổi tên → "${target}"`);
      loadDocs(selectedBase);
    } else {
      Modal.confirm({
        title: `Xoá folder "${folder}"?`,
        content: `${folderDocs.length} files sẽ bị xoá.`,
        okText: 'Xoá', okButtonProps: { danger: true },
        onOk: async () => {
          for (const doc of folderDocs) { try { await deleteDocument(doc.id || doc._id); } catch {} }
          message.success('Đã xoá folder');
          loadDocs(selectedBase);
        },
      });
    }
  }, [documents, selectedBase, loadDocs]);

  // ── Derived ──

  const treeData = useMemo(() => buildTree(documents, handleFolderAction), [documents, handleFolderAction]);
  const folders = useMemo(() => [...new Set(documents.map(d => d.folder).filter(Boolean))], [documents]);
  const baseName = useMemo(() => bases.find(b => b._id === selectedBase)?.name || '', [bases, selectedBase]);
  const isMd = activeDoc?.file_ext === '.md';
  const isPuml = activeDoc && ['.puml', '.plantuml'].includes(activeDoc.file_ext || '');
  const isText = activeDoc ? TEXT_EXTS.includes(activeDoc.file_ext) : false;
  const openCount = annotations.filter(a => a.status === 'open').length;

  // ── Render ──

  return (
    <div style={{ padding: '16px 24px' }}>
      <style>{MD_STYLES}</style>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FileSearchOutlined style={{ fontSize: 18, color: 'var(--accent-color)' }} />
          <Text strong style={{ fontSize: 17, cursor: selectedBase ? 'pointer' : 'default' }}
            onClick={() => { if (selectedBase) { setSelectedBase(''); setActiveDoc(null); setDocuments([]); window.history.replaceState(null, '', '/ba/docs'); } }}>
            Documents
          </Text>
          {selectedBase && (
            <>
              <Text type="secondary">/</Text>
              <Tag color="blue" style={{ cursor: 'pointer', margin: 0 }}
                onClick={() => { setActiveDoc(null); setEditMode(false); setDiffLines(null);
                  window.history.replaceState(null, '', `/ba/docs?base=${toSlug(baseName)}`); }}>
                {baseName}
              </Tag>
              {LARK_DOC_URLS[selectedBase] && (
                <Button
                  size="small"
                  type="link"
                  icon={<LinkOutlined />}
                  href={LARK_DOC_URLS[selectedBase]}
                  target="_blank"
                  style={{ padding: '0 4px', fontSize: 12, color: 'var(--accent-color)' }}
                >
                  Xem trên Lark
                </Button>
              )}
              <Button
                size="small"
                icon={<CloudUploadOutlined />}
                loading={syncingLark}
                onClick={async () => {
                  setSyncingLark(true);
                  try {
                    // Find matching analyst base + BA base + Lark account
                    const selectedBaseObj = bases.find(b => b._id === selectedBase);
                    const baBaseId = selectedBase;
                    // Get analyst base by name match
                    const apiBase = process.env.NEXT_PUBLIC_API_BASE || 'https://apihoanam.toolswave.net/api';
                    const abRes = await fetch(`${apiBase}/analyst-bases`);
                    const abData = await abRes.json();
                    const analystBases = abData.data || [];
                    const matchedAnalyst = analystBases.find((ab: { name: string }) =>
                      ab.name.toLowerCase().includes(baseName.toLowerCase().slice(0, 10)) ||
                      baseName.toLowerCase().includes(ab.name.toLowerCase().slice(0, 10))
                    );

                    if (!matchedAnalyst) {
                      message.error('Không tìm thấy Analyst base tương ứng');
                      setSyncingLark(false);
                      return;
                    }

                    // Use default Lark account (Phương)
                    const accountId = selectedBaseObj?.lark_app_config_id || '69c2c6cd745557e717225e9f';

                    const r = await fetch(`${apiBase}/analyst-bases/${matchedAnalyst._id}/sync-to-lark`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ accountId, baBaseId }),
                    });
                    const data = await r.json();
                    if (data.success) {
                      message.success(`Đã đồng bộ lên Lark! ${data.data?.insertedCount || 0} blocks`);
                      if (data.data?.url) window.open(data.data.url, '_blank');
                    } else {
                      message.error(data.error || 'Lỗi đồng bộ Lark');
                    }
                  } catch (e: unknown) {
                    message.error(e instanceof Error ? e.message : 'Lỗi đồng bộ');
                  } finally {
                    setSyncingLark(false);
                  }
                }}
              >
                Đồng bộ lên Lark
              </Button>
            </>
          )}
          {activeDoc && (
            <>
              {activeDoc.folder && (
                <>
                  <Text type="secondary">/</Text>
                  <Tag color="orange" style={{ cursor: 'pointer', margin: 0 }}
                    onClick={() => { setActiveDoc(null); setEditMode(false); setDiffLines(null);
                      window.history.replaceState(null, '', `/ba/docs?base=${toSlug(baseName)}`); }}>
                    {activeDoc.folder.replace(/\/$/, '')}
                  </Tag>
                </>
              )}
              <Text type="secondary">/</Text>
              <Tag color="green" style={{ margin: 0 }}>{activeDoc.filename}</Tag>
              {activeDoc.version > 1 && <Tag style={{ margin: 0, fontSize: 10 }}>v{activeDoc.version}</Tag>}
            </>
          )}
        </div>
        <Space size={4}>
          {selectedBase && (
            <>
              <Input size="small" placeholder="Folder" style={{ width: 120 }} value={uploadFolder}
                onChange={e => setUploadFolder(e.target.value)} prefix={<FolderOutlined />} allowClear />
              <Upload accept=".md,.txt,.docx,.xlsx,.xls,.pdf,.csv,.json,.puml,.plantuml"
                showUploadList={false} beforeUpload={f => { handleUpload(f as unknown as File); return false; }}>
                <Button size="small" icon={<UploadOutlined />} loading={uploading}>Upload</Button>
              </Upload>
              <Button size="small" icon={<ReloadOutlined />} onClick={() => loadDocs(selectedBase)} />
            </>
          )}
          {stagedChanges.length > 0 && (
            <Badge count={stagedChanges.length} size="small">
              <Button size="small" type="primary" icon={<InboxOutlined />} onClick={() => setCommitModal(true)}>Commit</Button>
            </Badge>
          )}
        </Space>
      </div>

      {/* Base selection */}
      {!selectedBase ? (
        <div>
          <Text type="secondary" style={{ marginBottom: 12, display: 'block' }}>Chọn base:</Text>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
            {bases.map((b, i) => {
              const colors = ['#6366f1', '#ec4899', '#14b8a6', '#f59e0b', '#8b5cf6', '#ef4444'];
              const c = colors[i % colors.length];
              return (
                <Card key={b._id} hoverable size="small"
                  onClick={() => { setSelectedBase(b._id); loadDocs(b._id); window.history.replaceState(null, '', `/ba/docs?base=${toSlug(b.name)}`); }}
                  style={{ cursor: 'pointer', borderLeft: `4px solid ${c}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Text strong style={{ fontSize: 13 }}>{b.name}</Text>
                    <DatabaseOutlined style={{ color: c }} />
                  </div>
                  <Space style={{ marginTop: 6 }} wrap>
                    <Tag color="blue">{b.tables_count || 0} tables</Tag>
                    <Tag color="purple">{b.fields_count || 0} fields</Tag>
                    {LARK_DOC_URLS[b._id] && (
                      <a href={LARK_DOC_URLS[b._id]} target="_blank" rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        style={{ fontSize: 12, color: 'var(--accent-color)' }}>
                        <LinkOutlined /> Xem trên Lark
                      </a>
                    )}
                  </Space>
                </Card>
              );
            })}
          </div>
        </div>
      ) : loading ? (
        <Card loading />
      ) : (
        <div style={{ display: 'flex', gap: 0, alignItems: 'flex-start' }}>
          {/* Sidebar toggle */}
          <div
            onClick={() => setSidebarOpen(v => !v)}
            style={{
              writingMode: 'vertical-rl', cursor: 'pointer', padding: '10px 3px',
              background: 'var(--accent-color)', color: '#fff', borderRadius: '6px 0 0 6px',
              fontSize: 10, fontWeight: 600, userSelect: 'none', flexShrink: 0, marginTop: 8,
            }}>
            {sidebarOpen ? '◀ Files' : `▶ ${documents.length}`}
          </div>
          {/* Sidebar */}
          <Card size="small" style={{
            width: sidebarOpen ? 260 : 0, flexShrink: 0, borderTop: '3px solid var(--accent-color)',
            overflow: 'hidden', transition: 'width 0.2s', borderRadius: '0 6px 6px 0',
            marginRight: sidebarOpen ? 16 : 0,
          }}
            styles={{ body: { padding: sidebarOpen ? '8px 10px' : 0 } }}>
            <div style={{ width: 240, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <Space size={4}>
                <FolderOutlined style={{ color: 'var(--accent-color)' }} />
                <Text strong style={{ fontSize: 12 }}>Files</Text>
                <Tag color="blue" style={{ margin: 0, fontSize: 9 }}>{documents.length}</Tag>
              </Space>
              <Space size={2}>
                <Tooltip title="Tạo file">
                  <Button type="text" size="small" icon={<PlusOutlined style={{ fontSize: 11 }} />}
                    onClick={() => {
                      Modal.confirm({
                        title: 'Tạo file mới',
                        content: (
                          <div>
                            <Input id="_nf_folder" placeholder="Folder (specs/)" style={{ marginBottom: 8 }} defaultValue={uploadFolder} />
                            <Input id="_nf_name" placeholder="Tên file (README.md)" />
                          </div>
                        ),
                        onOk: async () => {
                          const folder = (document.getElementById('_nf_folder') as HTMLInputElement)?.value || '';
                          const name = (document.getElementById('_nf_name') as HTMLInputElement)?.value?.trim();
                          if (!name) { message.warning('Nhập tên file'); return Promise.reject(); }
                          await uploadDocument(new File([''], name), selectedBase, folder);
                          message.success(`Đã tạo ${folder}${name}`);
                          loadDocs(selectedBase);
                        },
                      });
                    }} />
                </Tooltip>
              </Space>
            </div>
            {documents.length > 0 ? (<>
              <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                <Button type="link" size="small" style={{ fontSize: 10, padding: 0 }}
                  onClick={() => setTreeExpandedKeys(folders.map(f => `folder:${f}`))}>Mở tất cả</Button>
                <Button type="link" size="small" style={{ fontSize: 10, padding: 0 }}
                  onClick={() => setTreeExpandedKeys([])}>Đóng tất cả</Button>
              </div>
              <Tree treeData={treeData} showLine draggable={{ icon: false }}
                expandedKeys={treeExpandedKeys}
                onExpand={keys => setTreeExpandedKeys(keys as string[])}
                selectedKeys={activeDoc ? [activeDoc.id || activeDoc._id] : []}
                onSelect={keys => { const k = keys[0] as string; if (k && !k.startsWith('folder:')) openDoc(k); }}
                onDrop={async info => {
                  const dragKey = info.dragNode.key as string;
                  if (dragKey.startsWith('folder:')) return;
                  const doc = documents.find(d => (d.id || d._id) === dragKey);
                  if (!doc) return;
                  const dropKey = info.node.key as string;
                  const targetFolder = dropKey.startsWith('folder:') ? dropKey.replace('folder:', '')
                    : (documents.find(d => (d.id || d._id) === dropKey)?.folder || '');
                  if (targetFolder === (doc.folder || '')) return;
                  await renameDocument(doc.id || doc._id, doc.filename, targetFolder);
                  message.success(`→ ${targetFolder || '(root)'}`);
                  loadDocs(selectedBase);
                }}
                onRightClick={({ node }) => {
                  const key = node.key as string;
                  if (key.startsWith('folder:')) return;
                  const doc = documents.find(d => (d.id || d._id) === key);
                  if (!doc) return;
                  Modal.info({
                    title: doc.filename,
                    content: (
                      <Space direction="vertical" style={{ width: '100%', marginTop: 8 }}>
                        <Button block onClick={() => { Modal.destroyAll(); setRenameDoc(doc); setRenameFilename(doc.filename); setRenameFolder(doc.folder || ''); setRenameModal(true); }}>
                          <EditOutlined /> Đổi tên / Di chuyển
                        </Button>
                        <Popconfirm title="Xoá?" onConfirm={() => { Modal.destroyAll(); handleDelete(doc.id || doc._id); }}>
                          <Button block danger><DeleteOutlined /> Xoá</Button>
                        </Popconfirm>
                      </Space>
                    ),
                    okButtonProps: { style: { display: 'none' } },
                  });
                }}
                style={{ fontSize: 12 }}
              />
            </>) : (
              <Empty description="Chưa có file" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: 20 }} />
            )}
          </Card>

          {/* Content */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <Tabs activeKey={activeTab} onChange={setActiveTab} size="small" items={[
              // ── Viewer ──
              {
                key: 'viewer',
                label: <Space size={4}><EditOutlined />{activeDoc ? activeDoc.filename : 'Viewer'}{editMode && <Tag color="warning" style={{ fontSize: 9, margin: 0 }}>Edit</Tag>}</Space>,
                children: docLoading ? <Card loading /> : !activeDoc ? (
                  <Card><Empty description="Chọn file từ sidebar" /></Card>
                ) : (
                  <Card size="small">
                    {/* Info bar */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, padding: '4px 8px', background: 'var(--bg-tertiary)', borderRadius: 4 }}>
                      <Space size={6}>
                        <Tag color="blue">{activeDoc.file_ext}</Tag>
                        <Text style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{(activeDoc.file_size / 1024).toFixed(1)}KB</Text>
                        {activeDoc.version > 1 && <Tag color="purple">v{activeDoc.version}</Tag>}
                        {activeDoc.author && <Tag icon={<UserOutlined />}>{activeDoc.author}</Tag>}
                        {activeDoc.uploaded_at && <Text style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{new Date(activeDoc.uploaded_at).toLocaleDateString('vi')}</Text>}
                      </Space>
                      <Input size="small" placeholder="Tên" value={author} style={{ width: 100 }}
                        onChange={e => { setAuthor(e.target.value); localStorage.setItem('ba_author', e.target.value); }}
                        prefix={<UserOutlined />} />
                    </div>
                    {/* Actions */}
                    <Space style={{ marginBottom: 10 }} wrap>
                      {!editMode && isText && <Button size="small" icon={<EditOutlined />} onClick={() => { setEditMode(true); setEditContent(activeDoc.text_content || ''); }}>Sửa</Button>}
                      {editMode && <Button size="small" type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSave}>Lưu</Button>}
                      {editMode && <Button size="small" icon={<CloseOutlined />} onClick={() => setEditMode(false)}>Huỷ</Button>}
                      <Badge count={openCount} size="small" offset={[-2, 0]}>
                        <Button size="small" icon={<CommentOutlined />} onClick={() => setAnnotationDrawer(true)}>Notes</Button>
                      </Badge>
                      {isText && <Button size="small" icon={<CopyOutlined />} onClick={() => navigator.clipboard.writeText(activeDoc.text_content || '').then(() => message.success('Copied'))} />}
                      <Button size="small" icon={<DownloadOutlined />} href={getDocumentDownloadUrl(activeDoc.id || activeDoc._id)} target="_blank" />
                      {/* Lark link hiện ở header base, không per-file */}
                      <Button size="small" icon={<EditOutlined />} onClick={() => { setRenameDoc(activeDoc); setRenameFilename(activeDoc.filename); setRenameFolder(activeDoc.folder || ''); setRenameModal(true); }}>Rename</Button>
                      {activeDoc.version > 1 && <Button size="small" onClick={() => handleDiff(activeDoc.id || activeDoc._id)}>Diff</Button>}
                      <Popconfirm title="Xoá file này?" onConfirm={() => handleDelete(activeDoc.id || activeDoc._id)}>
                        <Button size="small" danger icon={<DeleteOutlined />} />
                      </Popconfirm>
                    </Space>
                    {/* Content */}
                    {editMode ? (
                      <Input.TextArea value={editContent} onChange={e => setEditContent(e.target.value)}
                        autoSize={{ minRows: 15, maxRows: 40 }} style={{ fontFamily: 'monospace', fontSize: 12 }} />
                    ) : diffLines ? (
                      <pre style={{ background: 'var(--bg-tertiary)', padding: 12, borderRadius: 6, fontSize: 12, maxHeight: 600, overflow: 'auto' }}>
                        {diffLines.map((l, i) => (
                          <div key={i} style={{ color: l.startsWith('+') ? '#22c55e' : l.startsWith('-') ? '#ef4444' : l.startsWith('@') ? '#6366f1' : 'inherit' }}>{l}</div>
                        ))}
                      </pre>
                    ) : isPuml ? (
                      <div>
                        <Space style={{ marginBottom: 8 }}>
                          <Button size="small" loading={pumlRendering} onClick={() => activeDoc && renderPuml(activeDoc)}>
                            <EyeOutlined /> Re-render
                          </Button>
                        </Space>
                        {pumlSvg ? (
                          <div dangerouslySetInnerHTML={{ __html: pumlSvg }}
                            style={{ background: '#fff', padding: 12, borderRadius: 6, border: '1px solid var(--border-color)', overflow: 'auto', maxHeight: 'calc(100vh - 350px)' }} />
                        ) : pumlRendering ? (
                          <Card loading />
                        ) : (
                          <pre style={{ background: 'var(--bg-tertiary)', padding: 12, borderRadius: 6, fontSize: 12, maxHeight: 400, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
                            {activeDoc.text_content}
                          </pre>
                        )}
                      </div>
                    ) : isMd ? (
                      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                        {/* MD TOC */}
                        {(() => {
                          const headings = (activeDoc.text_content || '').split('\n')
                            .filter(l => /^#{1,4}\s/.test(l))
                            .map((l, i) => {
                              const level = l.match(/^(#+)/)?.[1].length || 1;
                              const text = l.replace(/^#+\s*/, '');
                              return { level, text, id: `h-${i}` };
                            });
                          if (headings.length < 3) return null;
                          return (
                            <details open style={{ width: 180, flexShrink: 0, position: 'sticky', top: 0 }}>
                              <summary style={{ fontSize: 11, fontWeight: 600, cursor: 'pointer', marginBottom: 4, color: 'var(--accent-color)' }}>
                                Mục lục ({headings.length})
                              </summary>
                              <div style={{ maxHeight: 'calc(100vh - 380px)', overflow: 'auto', borderLeft: '2px solid var(--border-color)', paddingLeft: 6 }}>
                                {headings.map((h, i) => (
                                  <div key={i} style={{ paddingLeft: (h.level - 1) * 10, lineHeight: '20px' }}>
                                    <a href={`#${h.id}`} style={{ fontSize: 11, color: 'var(--text-secondary)', textDecoration: 'none', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                      onClick={e => { e.preventDefault(); document.getElementById(h.id)?.scrollIntoView({ behavior: 'smooth' }); }}>
                                      {h.text}
                                    </a>
                                  </div>
                                ))}
                              </div>
                            </details>
                          );
                        })()}
                        <div className="md-render" onMouseUp={handleTextSelect}
                          style={{ flex: 1, minWidth: 0, maxHeight: 'calc(100vh - 300px)', overflow: 'auto', padding: '0 4px' }}>
                          <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                            h1: ({ children, ...p }) => { const idx = (activeDoc.text_content || '').split('\n').filter(l => /^#\s/.test(l)).findIndex(l => l.includes(String(children))); return <h1 id={`h-${idx >= 0 ? idx : 0}`} {...p}>{children}</h1>; },
                            h2: ({ children, ...p }) => { const all = (activeDoc.text_content || '').split('\n').filter(l => /^#{1,2}\s/.test(l)); const idx = all.findIndex(l => l.replace(/^#+\s*/, '') === String(children)); return <h2 id={idx >= 0 ? `h-${idx}` : undefined} {...p}>{children}</h2>; },
                            h3: ({ children, ...p }) => { const all = (activeDoc.text_content || '').split('\n').filter(l => /^#{1,3}\s/.test(l)); const idx = all.findIndex(l => l.replace(/^#+\s*/, '') === String(children)); return <h3 id={idx >= 0 ? `h-${idx}` : undefined} {...p}>{children}</h3>; },
                          }}>{activeDoc.text_content || ''}</ReactMarkdown>
                        </div>
                      </div>
                    ) : isText ? (
                      <pre onMouseUp={handleTextSelect}
                        style={{ background: 'var(--bg-tertiary)', padding: 12, borderRadius: 6, fontSize: 12, maxHeight: 'calc(100vh - 300px)', overflow: 'auto', whiteSpace: 'pre-wrap' }}>
                        {activeDoc.text_content}
                      </pre>
                    ) : (
                      <Empty description="File binary — download để xem" />
                    )}
                    {/* Annotation popup */}
                    {selectedText && (
                      <Card size="small" style={{ marginTop: 8, borderColor: 'var(--accent-color)' }}>
                        <Text type="secondary" style={{ fontSize: 11 }}>Ghi chú cho: <em>"{selectedText.quote.slice(0, 60)}..."</em></Text>
                        <Input.TextArea rows={2} value={annotationText} onChange={e => setAnnotationText(e.target.value)}
                          placeholder="Nội dung ghi chú..." style={{ marginTop: 4 }} />
                        <Space style={{ marginTop: 6 }}>
                          <Button size="small" type="primary" icon={<SendOutlined />} onClick={handleCreateAnnotation}
                            disabled={!annotationText.trim()}>Thêm</Button>
                          <Button size="small" onClick={() => setSelectedText(null)}>Huỷ</Button>
                        </Space>
                      </Card>
                    )}
                  </Card>
                ),
              },
              // ── History ──
              {
                key: 'history',
                label: <Space size={4}><HistoryOutlined />History{versions.length > 1 && <Tag style={{ fontSize: 9, margin: 0 }}>{versions.length}</Tag>}</Space>,
                children: (
                  <Card size="small">
                    {versions.length === 0 ? <Empty description="Chọn file để xem lịch sử" /> : (
                      <Timeline items={versions.map(v => ({
                        color: v.edit_source === 'inline_edit' ? 'blue' : 'green',
                        children: (
                          <div style={{ cursor: 'pointer' }} onClick={() => openDoc(v.id || v._id)}>
                            <Space>
                              <Tag color={v.edit_source === 'inline_edit' ? 'blue' : 'green'}>v{v.version}</Tag>
                              {v.diff_summary && <Tag color="orange">{v.diff_summary}</Tag>}
                              {v.author && <Text style={{ fontSize: 11 }}>{v.author}</Text>}
                            </Space>
                            <div><Text type="secondary" style={{ fontSize: 11 }}>{new Date(v.uploaded_at).toLocaleString('vi')}</Text></div>
                          </div>
                        ),
                      }))} />
                    )}
                  </Card>
                ),
              },
              // ── Commits ──
              {
                key: 'commits',
                label: <Space size={4}><InboxOutlined />Commits{commits.length > 0 && <Tag style={{ fontSize: 9, margin: 0 }}>{commits.length}</Tag>}</Space>,
                children: (
                  <Card size="small">
                    {commits.length === 0 ? <Empty description="Chưa có commit" /> : (
                      <Timeline items={commits.map(c => ({
                        children: (
                          <div>
                            <Text strong style={{ fontSize: 13 }}>{c.message}</Text>
                            <div>
                              <Space size={4}>
                                {c.author && <Tag icon={<UserOutlined />}>{c.author}</Tag>}
                                <Text type="secondary" style={{ fontSize: 11 }}>{new Date(c.created_at).toLocaleString('vi')}</Text>
                                <Tag>{c.files_changed} files</Tag>
                              </Space>
                            </div>
                            <div style={{ marginTop: 4 }}>
                              {(c.changes || []).map((ch, i) => (
                                <Tag key={i} color={ch.action === 'edit' ? 'blue' : ch.action === 'create' ? 'green' : ch.action === 'delete' ? 'red' : 'orange'}
                                  style={{ fontSize: 10, marginBottom: 2 }}>
                                  {ch.action}: {ch.folder || ''}{ch.filename}{ch.diff_summary ? ` (${ch.diff_summary})` : ''}
                                </Tag>
                              ))}
                            </div>
                          </div>
                        ),
                      }))} />
                    )}
                  </Card>
                ),
              },
              // ── Overview — merge all docs ──
              {
                key: 'overview',
                label: <Space size={4}><MergeCellsOutlined />Overview</Space>,
                children: <OverviewTab documents={documents} baseName={baseName} openDoc={openDoc} />,
              },
              // ── Stats ──
              {
                key: 'stats',
                label: <Space size={4}><BarChartOutlined />Stats</Space>,
                children: <StatsTab documents={documents} commits={commits} annotations={annotations} />,
              },
            ]} />
          </div>
        </div>
      )}

      {/* Rename modal */}
      <Modal open={renameModal} title="Đổi tên / Di chuyển" destroyOnClose
        onCancel={() => setRenameModal(false)} onOk={handleRename} okText="Lưu">
        <Input value={renameFilename} onChange={e => setRenameFilename(e.target.value)}
          placeholder="Tên file" style={{ marginBottom: 8 }} addonBefore="File" />
        <Input value={renameFolder} onChange={e => setRenameFolder(e.target.value)}
          placeholder="(root)" addonBefore="Folder" />
      </Modal>

      {/* Commit modal */}
      <Modal open={commitModal} title={`Commit (${stagedChanges.length} changes)`} destroyOnClose
        onCancel={() => setCommitModal(false)} onOk={handleCommit} okText="Commit"
        confirmLoading={committing} okButtonProps={{ disabled: !commitMsg.trim() }}>
        <Input placeholder="Commit message..." value={commitMsg}
          onChange={e => setCommitMsg(e.target.value)} style={{ marginBottom: 8 }} />
        {stagedChanges.map((ch, i) => (
          <Tag key={i} closable onClose={() => setStagedChanges(prev => prev.filter((_, j) => j !== i))}
            color={ch.action === 'edit' ? 'blue' : ch.action === 'create' ? 'green' : 'red'}
            style={{ marginBottom: 4 }}>
            {ch.action}: {ch.folder}{ch.filename}
          </Tag>
        ))}
      </Modal>

      {/* Annotations drawer */}
      <Drawer open={annotationDrawer} onClose={() => setAnnotationDrawer(false)}
        title={<Space>Notes <Badge count={openCount} size="small" /></Space>} width={360}>
        <Segmented block size="small" value={annotationFilter}
          onChange={v => { setAnnotationFilter(v as string);
            if (activeDoc) listAnnotations(selectedBase, activeDoc.folder || '', activeDoc.filename, v as string).then(setAnnotations).catch(() => {});
          }}
          options={[{ label: 'All', value: 'all' }, { label: 'Open', value: 'open' }, { label: 'Resolved', value: 'resolved' }]}
          style={{ marginBottom: 12 }} />
        {annotations.length === 0 ? <Empty description="Chưa có ghi chú" image={Empty.PRESENTED_IMAGE_SIMPLE} /> :
          annotations.map(a => (
            <Card key={a._id} size="small" style={{ marginBottom: 8,
              borderLeft: `3px solid ${a.status === 'resolved' ? '#22c55e' : 'var(--accent-color)'}` }}>
              {a.quote && <Text style={{ fontSize: 11, background: 'var(--bg-tertiary)', padding: '2px 4px', borderRadius: 2 }} italic>"{a.quote.slice(0, 80)}"</Text>}
              <div style={{ margin: '4px 0' }}>{a.content}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text type="secondary" style={{ fontSize: 10 }}>{a.author} · {new Date(a.created_at).toLocaleDateString('vi')}</Text>
                <Space size={2}>
                  <Button type="text" size="small" icon={<CheckOutlined />} style={{ color: a.status === 'resolved' ? '#22c55e' : undefined }}
                    onClick={() => resolveAnnotation(a._id, a.status !== 'resolved', author).then(() =>
                      listAnnotations(selectedBase, activeDoc?.folder || '', activeDoc?.filename || '', annotationFilter).then(setAnnotations))} />
                  <Popconfirm title="Xoá?" onConfirm={() => deleteAnnotation(a._id).then(() =>
                    listAnnotations(selectedBase, activeDoc?.folder || '', activeDoc?.filename || '', annotationFilter).then(setAnnotations))}>
                    <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </Space>
              </div>
              {/* Replies */}
              {a.replies?.map(r => (
                <div key={r.reply_id} style={{ marginTop: 4, paddingLeft: 8, borderLeft: '2px solid var(--border-color)' }}>
                  <Text style={{ fontSize: 12 }}>{r.content}</Text>
                  <div><Text type="secondary" style={{ fontSize: 10 }}>{r.author} · {new Date(r.created_at).toLocaleDateString('vi')}</Text></div>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                <Input size="small" placeholder="Reply..." value={replyTexts[a._id] || ''}
                  onChange={e => setReplyTexts(prev => ({ ...prev, [a._id]: e.target.value }))}
                  onPressEnter={async () => {
                    const txt = replyTexts[a._id]?.trim();
                    if (!txt) return;
                    await addAnnotationReply(a._id, author, txt);
                    setReplyTexts(prev => ({ ...prev, [a._id]: '' }));
                    listAnnotations(selectedBase, activeDoc?.folder || '', activeDoc?.filename || '', annotationFilter).then(setAnnotations);
                  }} />
                <Button size="small" icon={<SendOutlined />} onClick={async () => {
                  const txt = replyTexts[a._id]?.trim();
                  if (!txt) return;
                  await addAnnotationReply(a._id, author, txt);
                  setReplyTexts(prev => ({ ...prev, [a._id]: '' }));
                  listAnnotations(selectedBase, activeDoc?.folder || '', activeDoc?.filename || '', annotationFilter).then(setAnnotations);
                }} />
              </div>
            </Card>
          ))}
      </Drawer>
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={<Card loading style={{ margin: 24 }} />}><DocsPage /></Suspense>;
}
