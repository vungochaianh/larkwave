'use client';
import { useEffect, useMemo, useState } from 'react';
import { Button, Input, Select, Space, Spin, Tag, Typography } from 'antd';
import { SendOutlined, ReloadOutlined, ApiOutlined } from '@ant-design/icons';
import type { ApiRoute, ApiResponse } from '@larkwave/core';
import { useRuntime } from '../RuntimeProvider';
import { V } from '../theme';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const METHOD_COLOR: Record<string, string> = { GET: 'green', POST: 'blue', PUT: 'gold', PATCH: 'purple', DELETE: 'red' };

const monoArea: React.CSSProperties = {
  width: '100%',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 11.5,
  lineHeight: 1.5,
  padding: 8,
  border: `1px solid ${V.border}`,
  borderRadius: 8,
  resize: 'vertical',
  background: V.surfaceAlt,
  color: V.text,
};

/** Swagger-like tester: list the app's API endpoints, build a request, send it (via the main-process
 *  proxy → no CORS, reaches 127.0.0.1:<apiPort>), and show the response. */
export function ApiTesterPane({ appId, refreshKey }: { appId: string; refreshKey?: number }) {
  const runtime = useRuntime();
  const [routes, setRoutes] = useState<ApiRoute[]>([]);
  const [loadingRoutes, setLoadingRoutes] = useState(true);
  const [method, setMethod] = useState('GET');
  const [path, setPath] = useState('/api/health');
  const [body, setBody] = useState('');
  const [headers, setHeaders] = useState('{\n  "Content-Type": "application/json"\n}');
  const [sending, setSending] = useState(false);
  const [res, setRes] = useState<ApiResponse | null>(null);

  // Make sure the app's services (incl. api) are running so requests can reach them (idempotent).
  useEffect(() => {
    void runtime.preview?.(appId, 'desktop').catch(() => undefined);
  }, [appId, runtime]);

  useEffect(() => {
    let alive = true;
    setLoadingRoutes(true);
    runtime
      .apiRoutes?.(appId)
      .then((r) => alive && setRoutes(Array.isArray(r) ? r : []))
      .catch(() => alive && setRoutes([]))
      .finally(() => alive && setLoadingRoutes(false));
    return () => {
      alive = false;
    };
  }, [appId, runtime, refreshKey]);

  const send = async () => {
    setSending(true);
    setRes(null);
    let hdrs: Record<string, string> = {};
    try {
      hdrs = headers.trim() ? JSON.parse(headers) : {};
    } catch {
      /* bad JSON headers → send none */
    }
    try {
      const r = await runtime.apiRequest?.(appId, {
        method,
        path,
        headers: hdrs,
        body: method === 'GET' || method === 'HEAD' ? undefined : body,
      });
      setRes(r ?? null);
    } finally {
      setSending(false);
    }
  };

  const prettyBody = useMemo(() => {
    if (!res) return '';
    try {
      return JSON.stringify(JSON.parse(res.body), null, 2);
    } catch {
      return res.body;
    }
  }, [res]);

  const noBody = method === 'GET' || method === 'HEAD';

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0 }}>
      {/* Endpoints rail */}
      <div style={{ width: 210, flexShrink: 0, borderRight: `1px solid ${V.border}`, overflowY: 'auto', background: V.surface, padding: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <ApiOutlined style={{ color: V.textSub }} />
          <Typography.Text strong style={{ fontSize: 12 }}>Endpoints</Typography.Text>
          <div style={{ flex: 1 }} />
          <Button
            size="small"
            type="text"
            icon={<ReloadOutlined />}
            onClick={() => {
              setLoadingRoutes(true);
              runtime.apiRoutes?.(appId).then((r) => setRoutes(Array.isArray(r) ? r : [])).catch(() => setRoutes([])).finally(() => setLoadingRoutes(false));
            }}
          />
        </div>
        {loadingRoutes ? (
          <Spin size="small" />
        ) : routes.length === 0 ? (
          <Typography.Text type="secondary" style={{ fontSize: 11.5 }}>Chưa dò được endpoint — gõ path tay bên phải.</Typography.Text>
        ) : (
          routes.map((r) => (
            <Button
              key={r.method + r.path}
              size="small"
              type="text"
              block
              style={{ textAlign: 'left', height: 'auto', padding: '3px 6px', whiteSpace: 'normal' }}
              onClick={() => {
                setMethod(r.method);
                setPath(r.path);
              }}
            >
              <Tag color={METHOD_COLOR[r.method] || 'default'} style={{ margin: 0, marginRight: 6, fontSize: 10 }}>{r.method}</Tag>
              <span style={{ fontSize: 11.5 }}>{r.path}</span>
            </Button>
          ))
        )}
      </div>

      {/* Request builder + response */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0, padding: 10, gap: 8 }}>
        <Space.Compact style={{ width: '100%' }}>
          <Select value={method} onChange={setMethod} style={{ width: 104 }} options={METHODS.map((m) => ({ value: m, label: m }))} />
          <Input value={path} onChange={(e) => setPath(e.target.value)} placeholder="/api/…" onPressEnter={() => void send()} />
          <Button type="primary" icon={<SendOutlined />} loading={sending} onClick={() => void send()}>
            Gửi
          </Button>
        </Space.Compact>
        {!noBody && (
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 2 }}>Body (JSON)</Typography.Text>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder='{ "key": "value" }' spellCheck={false} style={{ ...monoArea, minHeight: 64 }} />
          </div>
        )}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', border: `1px solid ${V.border}`, borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ padding: '6px 10px', borderBottom: `1px solid ${V.borderSub}`, background: V.surfaceAlt, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {!res ? (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>Chưa gửi request.</Typography.Text>
            ) : res.error ? (
              <Typography.Text type="danger" style={{ fontSize: 12 }}>{res.error}</Typography.Text>
            ) : (
              <>
                <Tag color={res.ok ? 'green' : 'red'} style={{ margin: 0 }}>{res.status} {res.statusText}</Tag>
                <Typography.Text type="secondary" style={{ fontSize: 11.5 }}>{res.timeMs} ms · {res.body.length} bytes</Typography.Text>
              </>
            )}
          </div>
          <pre style={{ flex: 1, margin: 0, overflow: 'auto', padding: 10, fontSize: 11.5, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: V.text, whiteSpace: 'pre-wrap' }}>
            {prettyBody}
          </pre>
        </div>
      </div>
    </div>
  );
}
