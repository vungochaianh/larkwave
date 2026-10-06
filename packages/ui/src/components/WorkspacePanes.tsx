'use client';
import { useEffect, useRef, useState } from 'react';
import { Button, Dropdown, Modal, Segmented, Tag } from 'antd';
import type { MenuProps } from 'antd';
import { PlusOutlined, CloseOutlined, ClusterOutlined } from '@ant-design/icons';
import type { RunnerPromptPreview, AppServiceInfo } from '@larkwave/core';
import { PreviewPane } from './PreviewPane';
import { CodeView } from './CodeView';
import { DatabaseView } from './DatabaseView';
import { PromptInspector, type PromptOverrides } from './PromptInspector';
import { ApiTesterPane } from './ApiTesterPane';
import { RunningPreviews } from './RunningPreviews';
import { useRuntime } from '../RuntimeProvider';
import { V } from '../theme';

type PaneType = 'preview' | 'code' | 'db' | 'prompt' | 'api';
interface Pane {
  id: string;
  type: PaneType;
  /** For a preview pane: pin to a specific service (home/cms/api) instead of route-inferred. */
  service?: string;
}

const PANE_OPTS = [
  { label: 'Trang', value: 'preview' },
  { label: 'Mã nguồn', value: 'code' },
  { label: 'CSDL', value: 'db' },
  { label: 'API', value: 'api' },
  { label: 'Prompt', value: 'prompt' },
];

/**
 * The workspace canvas — up to 4 PANES open at once (1×N / 2×2 grid that FILLS the frame height),
 * each independently a preview route, the source code, or the database. Multiple preview panes
 * share the SINGLE dev server (per appId) but can show different routes.
 */
export function WorkspacePanes({
  appId,
  refreshKey,
  onFix,
  busy,
  onEditEnv,
  runnerLabel,
  promptPreview,
  promptPreviewLoading,
  promptDraftHint,
  promptOverrides,
  onPromptOverridesChange,
  onRefreshPromptPreview,
  onCodeSaved,
}: {
  appId: string;
  refreshKey?: number;
  onFix?: (errorMessage: string) => void;
  busy?: boolean;
  onEditEnv?: () => void;
  runnerLabel?: string;
  promptPreview?: RunnerPromptPreview | null;
  promptPreviewLoading?: boolean;
  promptDraftHint?: string;
  promptOverrides?: PromptOverrides;
  onPromptOverridesChange?: (o: PromptOverrides) => void;
  onRefreshPromptPreview?: () => void;
  onCodeSaved?: () => void;
}) {
  const runtime = useRuntime();
  const [panes, setPanes] = useState<Pane[]>([{ id: 'p0', type: 'preview' }]);
  const [services, setServices] = useState<AppServiceInfo[]>([]);
  const [portsOpen, setPortsOpen] = useState(false);
  const seq = useRef(1);

  // Declared services (home/cms/api) — drives the "Thêm ô → chọn site" menu. Side-effect-free.
  useEffect(() => {
    let alive = true;
    runtime
      .appServices?.(appId)
      .then((s) => alive && setServices(Array.isArray(s) ? s : []))
      .catch(() => alive && setServices([]));
    return () => {
      alive = false;
    };
  }, [appId, runtime, refreshKey]);

  const add = (type: PaneType = 'preview', service?: string) =>
    setPanes((p) => (p.length >= 4 ? p : [...p, { id: `p${seq.current++}`, type, service }]));
  const remove = (id: string) => setPanes((p) => (p.length <= 1 ? p : p.filter((x) => x.id !== id)));
  const setType = (id: string, type: PaneType) => setPanes((p) => p.map((x) => (x.id === id ? { ...x, type, service: undefined } : x)));
  const cols = panes.length === 1 ? 1 : 2;
  const rows = panes.length > 2 ? 2 : 1;

  // "Thêm ô" menu — pane types; a multi-service app also lets a preview pane pin a specific site.
  const multi = services.length > 1;
  const addItems: MenuProps['items'] = [
    multi
      ? {
          key: 'preview',
          label: 'Trang (chọn site)',
          children: [
            { key: 'preview:auto', label: 'Tự động (theo route)' },
            ...services.map((s) => ({ key: `preview:${s.name}`, label: `Site — ${s.name}` })),
          ],
        }
      : { key: 'preview:auto', label: 'Trang' },
    { key: 'api:auto', label: 'API (test/call)' },
    { key: 'code:auto', label: 'Mã nguồn' },
    { key: 'db:auto', label: 'CSDL' },
    { key: 'prompt:auto', label: 'Prompt' },
  ];
  const onAdd: MenuProps['onClick'] = ({ key }) => {
    const [type, svc] = String(key).split(':');
    add(type as PaneType, svc && svc !== 'auto' ? svc : undefined);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <Dropdown menu={{ items: addItems, onClick: onAdd }} trigger={['click']} disabled={panes.length >= 4}>
          <Button size="small" icon={<PlusOutlined />} disabled={panes.length >= 4}>
            Thêm ô ({panes.length}/4)
          </Button>
        </Dropdown>
        <span style={{ fontSize: 12, color: V.textSub }}>Mở nhiều trang / mã nguồn / CSDL / API cùng lúc.</span>
        <div style={{ flex: 1 }} />
        <Button size="small" icon={<ClusterOutlined />} onClick={() => setPortsOpen(true)}>
          Cổng đang chạy
        </Button>
      </div>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
          gap: 12,
        }}
      >
        {panes.map((pane) => (
          <div
            key={pane.id}
            style={{
              border: `1px solid ${V.border}`,
              borderRadius: 12,
              overflow: 'hidden',
              background: V.surface,
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                height: 36,
                padding: '0 8px',
                borderBottom: `1px solid ${V.borderSub}`,
                background: V.surfaceAlt,
                flexShrink: 0,
              }}
            >
              <Segmented size="small" value={pane.type} onChange={(t) => setType(pane.id, t as PaneType)} options={PANE_OPTS} />
              {pane.type === 'preview' && pane.service && (
                <Tag color="purple" style={{ margin: 0 }}>ghim: {pane.service}</Tag>
              )}
              <div style={{ flex: 1 }} />
              {panes.length > 1 && (
                <Button size="small" type="text" icon={<CloseOutlined />} title="Đóng ô" onClick={() => remove(pane.id)} />
              )}
            </div>
            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', padding: pane.type === 'preview' || pane.type === 'api' ? 0 : 10 }}>
              {pane.type === 'preview' && (
                <PreviewPane appId={appId} refreshKey={refreshKey} onFix={onFix} busy={busy} onEditEnv={onEditEnv} runnerLabel={runnerLabel} service={pane.service} />
              )}
              {pane.type === 'api' && <ApiTesterPane appId={appId} refreshKey={refreshKey} />}
              {pane.type === 'code' && <CodeView appId={appId} refreshKey={refreshKey} onSaved={onCodeSaved} />}
              {pane.type === 'db' && <DatabaseView appId={appId} refreshKey={refreshKey} />}
              {pane.type === 'prompt' && (
                <PromptInspector
                  appId={appId}
                  preview={promptPreview ?? null}
                  loading={promptPreviewLoading}
                  draftHint={promptDraftHint}
                  overrides={promptOverrides ?? {}}
                  onOverridesChange={onPromptOverridesChange ?? (() => {})}
                  onRefresh={onRefreshPromptPreview}
                />
              )}
            </div>
          </div>
        ))}
      </div>
      <Modal open={portsOpen} onCancel={() => setPortsOpen(false)} footer={null} width={640} title="Cổng / site đang chạy (mọi app)" destroyOnClose>
        <RunningPreviews currentAppId={appId} />
      </Modal>
    </div>
  );
}
