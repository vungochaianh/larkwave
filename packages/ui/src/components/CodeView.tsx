'use client';
import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { App, Button, Empty, Spin, Tag, Typography } from 'antd';
import { FileOutlined, SaveOutlined, FolderFilled, FolderOpenFilled, CaretRightOutlined, CaretDownOutlined } from '@ant-design/icons';
import type { AppFile } from '@larkwave/core';
import { useRuntime } from '../RuntimeProvider';
import { V } from '../theme';

type TreeNode = { name: string; path: string; isFile: boolean; children: TreeNode[] };

/** Build a nested folder tree (VS Code-style) from the flat file path list. */
function buildTree(files: AppFile[]): TreeNode[] {
  const root: TreeNode = { name: '', path: '', isFile: false, children: [] };
  for (const f of files) {
    const parts = f.path.split('/').filter(Boolean);
    let node = root;
    let acc = '';
    parts.forEach((part, i) => {
      acc = acc ? `${acc}/${part}` : part;
      const isFile = i === parts.length - 1;
      let child = node.children.find((c) => c.name === part && c.isFile === isFile);
      if (!child) {
        child = { name: part, path: acc, isFile, children: [] };
        node.children.push(child);
      }
      node = child;
    });
  }
  const sort = (n: TreeNode) => {
    n.children.sort((a, b) => (a.isFile === b.isFile ? a.name.localeCompare(b.name) : a.isFile ? 1 : -1));
    n.children.forEach(sort);
  };
  sort(root);
  return root.children;
}

/** All folder paths in the tree (used to expand everything by default). */
function allFolderPaths(nodes: TreeNode[], out: string[] = []): string[] {
  for (const n of nodes) {
    if (!n.isFile) {
      out.push(n.path);
      allFolderPaths(n.children, out);
    }
  }
  return out;
}

/**
 * Source browser + EDITOR for a generated local app — file tree on the left, an editable
 * pane on the right. Edits save back to the local app files via runtime.writeAppFile, and
 * onSaved() lets the workspace reload the preview. On web (no writeAppFile) it stays
 * read-only, mirroring the website's Code section.
 */
export function CodeView({
  appId,
  refreshKey,
  onSaved,
}: {
  appId: string;
  refreshKey?: number;
  onSaved?: () => void;
}) {
  const runtime = useRuntime();
  const { message } = App.useApp();
  const [files, setFiles] = useState<AppFile[] | null>(null);
  const [active, setActive] = useState('');
  const [edited, setEdited] = useState<Record<string, string>>({}); // path -> new content (dirty)
  const [saving, setSaving] = useState(false);
  const canEdit = !!runtime.writeAppFile;
  const tree = useMemo(() => (files ? buildTree(files) : []), [files]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  useEffect(() => {
    // Expand every folder by default so the whole project is visible (VS Code-style tree).
    setExpanded(new Set(allFolderPaths(tree)));
  }, [tree]);
  const toggleFolder = (path: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      n.has(path) ? n.delete(path) : n.add(path);
      return n;
    });

  useEffect(() => {
    let dead = false;
    setFiles(null);
    setEdited({});
    Promise.resolve(runtime.appFiles?.(appId) ?? [])
      .then((f) => {
        if (dead) return;
        setFiles(f);
        setActive((cur) => (f.some((x) => x.path === cur) ? cur : f[0]?.path || ''));
      })
      .catch(() => !dead && setFiles([]));
    return () => {
      dead = true;
    };
  }, [appId, runtime, refreshKey]);

  const current = useMemo(() => files?.find((f) => f.path === active), [files, active]);
  const raw = current?.content ?? '';
  // Large/binary files are returned as placeholder strings by appFiles — don't let them be edited.
  const isReadOnly = !canEdit || raw.startsWith('// (file nhị phân)') || raw.startsWith('// (file lớn');
  const value = edited[active] ?? raw;
  const dirtyPaths = Object.keys(edited);

  const save = async () => {
    if (!canEdit || !dirtyPaths.length || saving) return;
    setSaving(true);
    try {
      for (const p of dirtyPaths) await runtime.writeAppFile!(appId, p, edited[p]);
      setFiles((fs) => (fs ? fs.map((f) => (edited[f.path] !== undefined ? { ...f, content: edited[f.path] } : f)) : fs));
      setEdited({});
      message.success(`Đã lưu ${dirtyPaths.length} file`);
      onSaved?.();
    } catch (e) {
      message.error((e as Error)?.message || 'Lưu thất bại.');
    } finally {
      setSaving(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      void save();
    }
  };

  if (files === null) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <Spin /> <div style={{ marginTop: 8, color: V.textSub }}>Đang đọc mã nguồn…</div>
      </div>
    );
  }
  if (!files.length) {
    return <Empty description="Chưa có file mã nguồn — hãy yêu cầu Claude tạo app trước." />;
  }

  const rowBase = {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    textAlign: 'left' as const,
    padding: '5px 12px 5px 0',
    border: 'none',
    cursor: 'pointer',
    fontSize: 12.5,
    color: V.text,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
  };
  const renderNodes = (nodes: TreeNode[], depth: number): ReactNode[] => {
    const rows: ReactNode[] = [];
    for (const node of nodes) {
      const pad = 8 + depth * 14;
      if (node.isFile) {
        const isActive = node.path === active;
        rows.push(
          <button
            key={node.path}
            type="button"
            onClick={() => setActive(node.path)}
            title={node.path}
            style={{ ...rowBase, paddingLeft: pad, borderLeft: isActive ? '3px solid #6C5CE7' : '3px solid transparent', background: isActive ? V.surface : 'transparent' }}
          >
            <FileOutlined style={{ marginRight: 6, color: V.textFaint, fontSize: 12 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{node.name}</span>
            {edited[node.path] !== undefined && <span style={{ marginLeft: 'auto', color: '#FAAD14', fontSize: 14, lineHeight: 1 }}>●</span>}
          </button>,
        );
      } else {
        const open = expanded.has(node.path);
        rows.push(
          <button key={node.path} type="button" onClick={() => toggleFolder(node.path)} style={{ ...rowBase, paddingLeft: pad, borderLeft: '3px solid transparent', background: 'transparent', fontWeight: 600 }}>
            {open ? <CaretDownOutlined style={{ fontSize: 10, marginRight: 3, color: V.textFaint }} /> : <CaretRightOutlined style={{ fontSize: 10, marginRight: 3, color: V.textFaint }} />}
            {open ? <FolderOpenFilled style={{ marginRight: 6, color: '#E8B339', fontSize: 13 }} /> : <FolderFilled style={{ marginRight: 6, color: '#E8B339', fontSize: 13 }} />}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{node.name}</span>
          </button>,
        );
        if (open) rows.push(...renderNodes(node.children, depth + 1));
      }
    }
    return rows;
  };

  return (
    <div style={{ border: `1px solid ${V.border}`, borderRadius: 10, overflow: 'hidden' }}>
      {/* Header: active file + dirty state + Save */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '7px 10px',
          borderBottom: `1px solid ${V.border}`,
          background: V.surfaceAlt,
        }}
      >
        <Typography.Text style={{ fontSize: 12.5, color: V.text, fontFamily: 'ui-monospace, Menlo, monospace' }}>
          {active || '—'}
        </Typography.Text>
        {edited[active] !== undefined && <Tag color="warning" style={{ fontSize: 10.5, lineHeight: '16px' }}>● đã sửa</Tag>}
        <span style={{ flex: 1 }} />
        {canEdit ? (
          <Button type="primary" size="small" icon={<SaveOutlined />} loading={saving} disabled={!dirtyPaths.length} onClick={save}>
            Lưu{dirtyPaths.length ? ` (${dirtyPaths.length})` : ''}
          </Button>
        ) : (
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>chỉ xem</Typography.Text>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', height: '60vh', minHeight: 400 }}>
        <div style={{ borderRight: `1px solid ${V.border}`, overflowY: 'auto', background: V.surfaceAlt, padding: '6px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 12px' }}>
            <Typography.Text style={{ fontSize: 11, fontWeight: 700, color: V.textFaint, flex: 1 }}>
              {files.length} FILE
            </Typography.Text>
            <button
              type="button"
              title={expanded.size ? 'Thu gọn tất cả' : 'Mở tất cả'}
              onClick={() => setExpanded(expanded.size ? new Set() : new Set(allFolderPaths(tree)))}
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: V.textFaint, fontSize: 11 }}
            >
              {expanded.size ? 'Thu gọn' : 'Mở hết'}
            </button>
          </div>
          {renderNodes(tree, 0)}
        </div>
        {isReadOnly ? (
          <div style={{ overflow: 'auto', background: V.codeBg }}>
            <pre
              style={{
                margin: 0,
                padding: 16,
                fontSize: 12.5,
                lineHeight: 1.6,
                color: V.codeText,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                whiteSpace: 'pre',
                tabSize: 2,
              }}
            >
              {value}
            </pre>
          </div>
        ) : (
          <textarea
            value={value}
            spellCheck={false}
            aria-label={active || 'Mã nguồn'}
            onKeyDown={onKeyDown}
            onChange={(e) => setEdited((m) => ({ ...m, [active]: e.target.value }))}
            style={{
              width: '100%',
              height: '100%',
              margin: 0,
              padding: 16,
              border: 'none',
              outline: 'none',
              resize: 'none',
              fontSize: 12.5,
              lineHeight: 1.6,
              color: V.codeText,
              background: V.codeBg,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              tabSize: 2,
              whiteSpace: 'pre',
              overflowWrap: 'normal',
              overflow: 'auto',
            }}
          />
        )}
      </div>
    </div>
  );
}
