'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, Segmented, Spin, Typography, Input, Space, Tag, Popover, Select, QRCode } from 'antd';
import {
  DesktopOutlined,
  MobileOutlined,
  ReloadOutlined,
  ExportOutlined,
  ToolOutlined,
  SettingOutlined,
  GlobalOutlined,
  CopyOutlined,
  ApiOutlined,
} from '@ant-design/icons';
import type { PreviewTarget, AppView } from '@larkwave/core';
import { useRuntime } from '../RuntimeProvider';
import { notifyAppsChanged } from '../appEvents';
import { BRAND, V } from '../theme';

const ROUTE_PRESETS: { label: string; path: string }[] = [
  { label: 'Trang chính', path: '' },
  { label: 'Quản trị (CMS)', path: '/admin' },
  { label: 'API', path: '/api' },
];

type Service = { name: string; url: string };

/** A multi-service app runs home/cms/api on DIFFERENT ports. Map a route to the service that
 *  actually serves it so the iframe hits the right port (before this, every route was appended to
 *  the home URL → /api/* and /admin 404'd). Falls back to the home/primary/first service. */
function serviceForPath(path: string, services: Service[]): Service | undefined {
  if (!services.length) return undefined;
  const find = (re: RegExp) => services.find((s) => re.test(s.name));
  if (/^\/api(\/|$)/i.test(path)) return find(/api/i) || services[0];
  if (/^\/(admin|cms)(\/|$)/i.test(path)) return find(/cms|admin/i) || find(/api/i) || services[0];
  return find(/home|web|primary|app|frontend/i) || services[0];
}

function svcColor(name: string): string {
  if (/api/i.test(name)) return 'geekblue';
  if (/cms|admin/i.test(name)) return 'gold';
  return 'green';
}

/**
 * Cover-screenshot throttle, keyed by appId and MODULE-LEVEL on purpose: WorkspacePanes can
 * mount up to 4 PreviewPanes on the SAME dev server, so a per-pane guard would still fire 4
 * concurrent captures of one app every time the panes reload. The entry is claimed
 * synchronously in the onLoad handler, before the settle timer starts, so the other panes in
 * the same frame see it and back off.
 */
const lastShotAt = new Map<string, { at: number; key: number }>();
/** Don't re-shoot the same build more than once every 2 minutes (a new build bumps `key`). */
const SHOT_TTL_MS = 120_000;
/** Let the app paint (fonts, first data fetch) before capturing. */
const SHOT_SETTLE_MS = 1200;

/**
 * Live local preview with a persistent routes rail — pages/CMS/API stay visible
 * even when the dev server is still starting or errored.
 */
export function PreviewPane({
  appId,
  refreshKey,
  onFix,
  busy,
  onEditEnv,
  runnerLabel = 'AI',
  service,
}: {
  appId: string;
  refreshKey?: number;
  onFix?: (errorMessage: string) => void;
  runnerLabel?: string;
  busy?: boolean;
  onEditEnv?: () => void;
  /** Pin this pane to a specific service (home/cms/api) instead of route-inferred. */
  service?: string;
}) {
  const runtime = useRuntime();
  const [target, setTarget] = useState<PreviewTarget>('desktop');
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [nonce, setNonce] = useState(0);
  const [routePath, setRoutePath] = useState('');
  const [addr, setAddr] = useState('');
  const [manifestViews, setManifestViews] = useState<AppView[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [kind, setKind] = useState<'web' | 'expo' | undefined>();
  const [expoUrl, setExpoUrl] = useState<string | undefined>();
  const autoPickedRef = useRef(false);
  // Mirror latest busy/url so the async preview effect can read them without re-subscribing.
  const busyRef = useRef(busy);
  const urlRef = useRef(url);
  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);
  useEffect(() => {
    urlRef.current = url;
  }, [url]);
  // First build still running → no package.json yet: show a building state (not the iframe/error).
  const building = busy && !url;

  useEffect(() => {
    setRoutePath('');
    setAddr('');
    autoPickedRef.current = false;
  }, [appId]);

  useEffect(() => {
    runtime
      .appViews?.(appId)
      .then((v) => setManifestViews(Array.isArray(v) ? v : []))
      .catch(() => setManifestViews([]));
  }, [appId, runtime, refreshKey]);

  const routes = manifestViews.length ? manifestViews : ROUTE_PRESETS;
  const hasManifest = manifestViews.length > 0;

  useEffect(() => {
    if (!autoPickedRef.current && routes.length > 0) {
      autoPickedRef.current = true;
      // A pinned pane opens that service's root (api→/api, cms→/admin); else the first route.
      const pinnedRoot = service ? (/api/i.test(service) ? '/api' : /cms|admin/i.test(service) ? '/admin' : '') : null;
      setRoutePath(pinnedRoot != null ? pinnedRoot : routes[0].path);
    }
  }, [routes, service]);

  const goPath = (raw: string) => {
    const p = raw.trim();
    const norm = p && !p.startsWith('/') ? `/${p}` : p;
    setRoutePath(norm);
  };
  // Typed address → navigate (external host is ignored; serviceForPath picks the base).
  const goAddr = (raw: string) => {
    let p = raw.trim();
    const m = /^https?:\/\/[^/]+(\/.*)?$/i.exec(p);
    if (m) p = m[1] || '/';
    goPath(p);
  };

  useEffect(() => {
    let dead = false;
    // While a build is running, DON'T attempt a preview:
    //  • first build → there's no package.json yet, so a preview would throw the scary
    //    "app chưa được tạo đầy đủ" error even though the build is progressing normally.
    //    Show a building placeholder and wait.
    //  • iterate → keep the already-running preview visible (don't blank it).
    // The build's finally() bumps previewKey (refreshKey) and flips busy→false, which
    // re-runs this effect and previews for real then.
    if (busyRef.current) {
      if (!urlRef.current) {
        setLoading(false);
        setErr('');
      }
      return () => {
        dead = true;
      };
    }
    setLoading(true);
    setErr('');
    setUrl('');
    runtime
      .preview(appId, 'desktop')
      .then((h) => {
        if (dead) return;
        setUrl(h.url);
        setServices(Array.isArray((h as { services?: Service[] }).services) ? ((h as { services?: Service[] }).services as Service[]) : []);
        const hk = h as { kind?: 'web' | 'expo'; expoUrl?: string };
        setKind(hk.kind);
        setExpoUrl(hk.expoUrl);
        if (hk.kind === 'expo') setTarget('mobile'); // phone-sized frame for a mobile app
      })
      .catch((e) => !dead && setErr((e as Error).message))
      .finally(() => !dead && setLoading(false));
    return () => {
      dead = true;
    };
    // busy is read via busyRef (latest value); the build's previewKey bump re-runs this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId, runtime, nonce, refreshKey]);

  // Opportunistic app-card cover: shoot the app's views once the iframe has settled.
  const shotTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (shotTimer.current) clearTimeout(shotTimer.current);
    },
    [],
  );
  const captureCover = () => {
    // Undefined on web and on an older installed main process → nothing to do.
    if (!runtime.captureAppScreenshot || busyRef.current) return;
    const key = refreshKey ?? 0;
    const prev = lastShotAt.get(appId);
    if (prev && prev.key === key && Date.now() - prev.at < SHOT_TTL_MS) return;
    lastShotAt.set(appId, { at: Date.now(), key }); // claim BEFORE the timer — see lastShotAt
    if (shotTimer.current) clearTimeout(shotTimer.current);
    shotTimer.current = setTimeout(() => {
      shotTimer.current = null;
      // `force` because we throttle above: main's own 60s guard would drop the post-build shot.
      void runtime
        .captureAppScreenshot?.(appId, { force: true })
        .then(() => notifyAppsChanged()) // repaint the app cards with the new cover
        .catch(() => {
          /* background work — a failed cover must never reach the user */
        });
    }, SHOT_SETTLE_MS);
  };

  const isMobile = target === 'mobile';
  // Pinned pane → always that service; else route-inferred (home/cms/api on different ports).
  const pinned = service ? services.find((s) => new RegExp(`^${service}$`, 'i').test(s.name)) : undefined;
  const activeService = pinned ?? serviceForPath(routePath, services);
  const baseUrl = activeService?.url || url;
  const iframeSrc = baseUrl ? baseUrl.replace(/\/$/, '') + routePath : '';
  // Keep the address bar mirroring the current URL (unless the user is editing it).
  useEffect(() => {
    setAddr(iframeSrc);
  }, [iframeSrc]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, gap: 0 }}>
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
          padding: '8px 10px',
          background: `linear-gradient(180deg, ${V.surfaceAlt} 0%, ${V.surface} 100%)`,
          borderBottom: `1px solid ${V.border}`,
          borderRadius: '10px 10px 0 0',
          flexShrink: 0,
        }}
      >
        <GlobalOutlined style={{ color: BRAND }} />
        <Typography.Text strong style={{ fontSize: 13, marginRight: 4 }}>
          Xem trước cục bộ
        </Typography.Text>
        {hasManifest && <Tag color="purple" style={{ margin: 0 }}>{manifestViews.length} mặt</Tag>}
        {building && <Tag icon={<SyncIcon />} color="processing" style={{ margin: 0 }}>Đang dựng app…</Tag>}
        {loading && !building && <Tag icon={<SyncIcon />} color="processing" style={{ margin: 0 }}>Đang khởi động</Tag>}
        {err && !loading && !building && <Tag color="error" style={{ margin: 0 }}>Lỗi preview</Tag>}
        {/* Address bar — editable; shows + navigates the current URL (copyable). */}
        <Input
          size="small"
          value={addr}
          placeholder="/đường-dẫn hoặc URL"
          prefix={<GlobalOutlined style={{ color: V.textFaint, fontSize: 11 }} />}
          onChange={(e) => setAddr(e.target.value)}
          onPressEnter={() => goAddr(addr)}
          onFocus={(e) => e.currentTarget.select()}
          suffix={
            iframeSrc ? (
              <CopyOutlined
                style={{ cursor: 'pointer', color: V.textFaint }}
                onClick={() => {
                  try {
                    navigator.clipboard?.writeText(iframeSrc);
                  } catch {
                    /* ignore */
                  }
                }}
              />
            ) : (
              <span />
            )
          }
          style={{ flex: 1, minWidth: 140, fontSize: 12 }}
        />
        {/* Route jump (replaces the old rail) */}
        <Select
          size="small"
          value={routes.some((r) => r.path === routePath) ? routePath : undefined}
          onChange={(v) => goPath(v)}
          placeholder="Trang…"
          showSearch
          optionFilterProp="label"
          popupMatchSelectWidth={false}
          style={{ minWidth: 130 }}
          options={routes.map((r) => ({ value: r.path, label: `${r.label}${r.path ? ` · ${r.path}` : ''}` }))}
        />
        {activeService && services.length > 1 && (
          <Tag color={svcColor(activeService.name)} style={{ margin: 0 }}>{service ? `ghim: ${activeService.name}` : activeService.name}</Tag>
        )}
        {/* Per-service ports (home / cms / api) */}
        <Popover
          trigger="click"
          title="Cổng dịch vụ (home / cms / api)"
          content={
            <div style={{ minWidth: 230 }}>
              {services.length ? (
                services.map((s) => (
                  <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                    <Tag color={svcColor(s.name)} style={{ margin: 0, minWidth: 46, textAlign: 'center' }}>{s.name}</Tag>
                    <Typography.Text copyable={{ text: s.url }} style={{ fontSize: 12 }}>
                      {s.url.replace(/^https?:\/\//, '')}
                    </Typography.Text>
                    <div style={{ flex: 1 }} />
                    <Button size="small" type="text" icon={<ExportOutlined />} onClick={() => runtime.openExternal?.(s.url)} />
                  </div>
                ))
              ) : (
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  Chưa có dịch vụ đang chạy — bấm chạy/khởi động preview trước.
                </Typography.Text>
              )}
            </div>
          }
        >
          <Button size="small" icon={<ApiOutlined />}>Cổng{services.length ? ` (${services.length})` : ''}</Button>
        </Popover>
        <Segmented
          size="small"
          value={target}
          onChange={(v) => setTarget(v as PreviewTarget)}
          options={[
            { value: 'desktop', label: <span><DesktopOutlined /> Desktop</span> as ReactNode },
            { value: 'mobile', label: <span><MobileOutlined /> Mobile</span> as ReactNode },
          ]}
        />
        <Button size="small" icon={<ReloadOutlined />} onClick={() => setNonce((n) => n + 1)} />
        {onEditEnv && (
          <Button size="small" icon={<SettingOutlined />} onClick={onEditEnv}>.env</Button>
        )}
        {iframeSrc && (
          <Button size="small" icon={<ExportOutlined />} onClick={() => runtime.openExternal?.(iframeSrc)} />
        )}
      </div>

      {/* Body: preview only (routes rail replaced by the toolbar address + route Select) */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 0, background: V.layer, borderRadius: '0 0 10px 10px', overflow: 'hidden' }}>

        {/* Preview canvas */}
        <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', alignItems: isMobile ? 'center' : 'stretch', justifyContent: 'center', padding: isMobile ? 14 : 10, overflow: 'auto' }}>
          {building && (
            <div style={{ textAlign: 'center', maxWidth: 420, padding: '0 16px' }}>
              <Spin size="large" />
              <div style={{ marginTop: 14, color: V.text, fontSize: 14, fontWeight: 600 }}>Đang dựng app…</div>
              <div style={{ marginTop: 6, color: V.textSub, fontSize: 12.5, lineHeight: 1.6 }}>
                {runnerLabel} đang tạo các file (package.json, mã nguồn, trang…). Xem tiến độ ở khung chat bên phải — preview sẽ tự chạy ngay khi dựng xong.
              </div>
            </div>
          )}
          {!building && loading && (
            <div style={{ textAlign: 'center' }}>
              <Spin size="large" />
              <div style={{ marginTop: 12, color: V.textSub, fontSize: 13 }}>Đang cài thư viện & khởi động preview…</div>
            </div>
          )}
          {!building && !loading && err && (
            <div style={{ textAlign: 'center', maxWidth: 420, padding: '0 16px' }}>
              <Typography.Text type="danger" style={{ display: 'block', marginBottom: 16, lineHeight: 1.6, fontSize: 13 }}>
                {err}
              </Typography.Text>
              <Space wrap>
                <Button icon={<ReloadOutlined />} onClick={() => setNonce((n) => n + 1)}>Thử lại</Button>
                {onEditEnv && <Button icon={<SettingOutlined />} onClick={onEditEnv}>Cấu hình .env</Button>}
                {onFix && (
                  <Button type="primary" icon={<ToolOutlined />} loading={busy} onClick={() => onFix(err)}>
                    Nhờ {runnerLabel} sửa
                  </Button>
                )}
              </Space>
            </div>
          )}
          {/* Mobile (Expo) app with no web URL → can't render in-frame: show Expo Go QR + guide. */}
          {!building && !loading && !err && kind === 'expo' && !url && (
            <div style={{ textAlign: 'center', maxWidth: 380, padding: '0 16px' }}>
              <MobileOutlined style={{ fontSize: 30, color: BRAND }} />
              <div style={{ marginTop: 8, fontWeight: 600, fontSize: 15, color: V.text }}>App di động (React Native / Expo)</div>
              <div style={{ marginTop: 6, color: V.textSub, fontSize: 12.5, lineHeight: 1.6 }}>
                App di động không hiển thị trong khung web — mở trực tiếp trên điện thoại bằng <b>Expo Go</b>.
              </div>
              {expoUrl ? (
                <div style={{ marginTop: 14 }}>
                  <div style={{ display: 'inline-block', background: '#fff', padding: 10, borderRadius: 12, boxShadow: '0 6px 20px rgba(17,24,39,0.10)' }}>
                    <QRCode value={expoUrl} size={168} bordered={false} />
                  </div>
                  <div style={{ marginTop: 10, fontSize: 11.5, color: V.textFaint, lineHeight: 1.6 }}>
                    Cài <b>Expo Go</b> (App Store / CH Play) → quét mã (điện thoại <b>cùng WiFi</b> với máy này).
                  </div>
                  {/* Desktop's ConfigProvider sets no locale → antd's built-in copy tooltip is English. */}
                  <Typography.Text copyable={{ text: expoUrl, tooltips: ['Sao chép', 'Đã sao chép'] }} style={{ fontSize: 11 }}>{expoUrl}</Typography.Text>
                </div>
              ) : (
                <div style={{ marginTop: 12, textAlign: 'left', fontSize: 12.5, color: V.textSub, lineHeight: 1.8, display: 'inline-block' }}>
                  <div>Chưa bắt được mã QR tự động — mở tay:</div>
                  <div>1. Cài <b>Expo Go</b> trên điện thoại (cùng WiFi).</div>
                  <div>2. Mở tab <b>Mã nguồn</b> hoặc terminal → chạy <code>npx expo start</code>.</div>
                  <div>3. Quét mã QR hiện ra bằng Expo Go.</div>
                  <div style={{ marginTop: 4 }}>Khác mạng WiFi → thêm <code>--tunnel</code>.</div>
                  <div style={{ marginTop: 10 }}>
                    <Button size="small" icon={<ReloadOutlined />} onClick={() => setNonce((n) => n + 1)}>Thử lại</Button>
                  </div>
                </div>
              )}
            </div>
          )}
          {!loading && url && (
            <iframe
              key={`${appId}-${target}-${nonce}-${baseUrl}-${routePath}`}
              src={iframeSrc}
              title="preview"
              onLoad={captureCover}
              style={{
                width: isMobile ? 390 : '100%',
                height: isMobile ? 700 : '100%',
                minHeight: isMobile ? 480 : 0,
                maxHeight: isMobile ? 720 : 'none',
                border: isMobile ? '10px solid #1F2937' : `1px solid ${V.border}`,
                borderRadius: isMobile ? 28 : 12,
                background: '#fff',
                boxShadow: '0 8px 32px rgba(17,24,39,0.08)',
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function SyncIcon() {
  return <ReloadOutlined spin />;
}