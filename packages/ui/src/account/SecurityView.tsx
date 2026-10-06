'use client';
import { useCallback, useEffect, useState } from 'react';
import { App, Alert, Button, Card, Input, Skeleton, Typography } from 'antd';
import {
  DeleteOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  LockOutlined,
  PlusOutlined,
  ReloadOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import { apiFetch } from './api';
import { CARD_SHADOW } from '../theme';

const { Title, Text, Paragraph } = Typography;

/* ───────────────────────── local types ───────────────────────── */
interface Secret {
  key: string;
  value: string;
}
interface SecretsResponse {
  secrets: Secret[];
}
interface AppInfo {
  backendKind?: string;
}

const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

/**
 * Native desktop port of the web builder's Security panel — app secrets /
 * environment variables editor. Values are decrypted server-side for the owner.
 */
export function SecurityView({ appId }: { appId: string }) {
  const { message } = App.useApp();
  const [rows, setRows] = useState<Secret[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reveal, setReveal] = useState<Record<number, boolean>>({});
  const [isFullstack, setIsFullstack] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [res, app] = await Promise.all([
        apiFetch<SecretsResponse>(`/apps/${appId}/secrets`),
        apiFetch<AppInfo>(`/apps/${appId}`).catch(() => null),
      ]);
      setRows(res.secrets ?? []);
      if (app) setIsFullstack(app.backendKind === 'fullstack');
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [appId, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const setRow = (i: number, patch: Partial<Secret>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, { key: '', value: '' }]);
  const delRow = (i: number) => {
    setRows((rs) => rs.filter((_, idx) => idx !== i));
    setReveal((s) => {
      const next: Record<number, boolean> = {};
      Object.keys(s).forEach((k) => {
        const idx = Number(k);
        if (idx < i) next[idx] = s[idx];
        else if (idx > i) next[idx - 1] = s[idx];
      });
      return next;
    });
  };

  const invalid = rows.some((r) => r.key.trim() && !KEY_RE.test(r.key.trim()));

  const save = async () => {
    if (invalid) {
      message.error('Tên biến không hợp lệ (chỉ chữ/số/_, bắt đầu bằng chữ hoặc _).');
      return;
    }
    setSaving(true);
    try {
      const secrets = rows
        .filter((r) => r.key.trim())
        .map((r) => ({ key: r.key.trim(), value: r.value }));
      const res = await apiFetch<SecretsResponse>(`/apps/${appId}/secrets`, {
        method: 'PUT',
        body: { secrets },
      });
      setRows(res.secrets ?? []);
      setReveal({});
      message.success('Đã lưu secrets. Bấm “Triển khai lại” để nạp vào app.');
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', maxWidth: 1040, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>
            <LockOutlined style={{ color: '#6C5CE7', marginInlineEnd: 8 }} />
            Biến môi trường &amp; Secrets
          </Title>
          <Paragraph type="secondary" style={{ margin: '4px 0 0', maxWidth: 760 }}>
            Biến môi trường &amp; secrets cho app. Được mã hoá khi lưu và nạp vào Cloudflare Pages khi
            deploy — backend (Functions) đọc qua <Text code>env.TÊN_BIẾN</Text>. KHÔNG để lộ ra
            frontend.
          </Paragraph>
        </div>
        <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
          Tải lại
        </Button>
      </div>

      {!loading && !isFullstack && (
        <Alert
          type="info"
          message="App này hiện là tĩnh (chưa có backend). Secrets chỉ có tác dụng khi app có backend (Functions). Bạn vẫn có thể đặt trước để dùng khi nâng cấp full-stack."
          banner
        />
      )}

      <Card style={{ boxShadow: CARD_SHADOW, borderRadius: 14 }} styles={{ body: { padding: 16 } }}>
        {loading ? (
          <Skeleton active paragraph={{ rows: 3 }} />
        ) : rows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <LockOutlined style={{ fontSize: 26, color: '#9AA3B5' }} />
            <Paragraph type="secondary" style={{ margin: '8px 0 14px' }}>
              Chưa có secret nào. Thêm biến môi trường đầu tiên.
            </Paragraph>
            <Button icon={<PlusOutlined />} onClick={addRow}>
              Thêm biến
            </Button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {rows.map((r, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Input
                  placeholder="TÊN_BIẾN"
                  value={r.key}
                  onChange={(e) => setRow(i, { key: e.target.value })}
                  style={{ flex: '0 0 38%', fontFamily: 'monospace' }}
                  status={r.key.trim() && !KEY_RE.test(r.key.trim()) ? 'error' : undefined}
                  autoComplete="off"
                  data-1p-ignore=""
                  data-lpignore="true"
                  data-form-type="other"
                />
                <Input
                  placeholder="giá trị"
                  type={reveal[i] ? 'text' : 'password'}
                  value={r.value}
                  onChange={(e) => setRow(i, { value: e.target.value })}
                  style={{ flex: 1 }}
                  autoComplete="off"
                  data-1p-ignore=""
                  data-lpignore="true"
                  data-form-type="other"
                  suffix={
                    <span
                      style={{ cursor: 'pointer', color: '#9AA3B5' }}
                      onClick={() => setReveal((s) => ({ ...s, [i]: !s[i] }))}
                    >
                      {reveal[i] ? <EyeInvisibleOutlined /> : <EyeOutlined />}
                    </span>
                  }
                />
                <Button type="text" danger icon={<DeleteOutlined />} onClick={() => delRow(i)} />
              </div>
            ))}
            <div>
              <Button icon={<PlusOutlined />} onClick={addRow} type="dashed" block>
                Thêm biến
              </Button>
            </div>
          </div>
        )}
      </Card>

      <div>
        <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={save} disabled={loading}>
          Lưu secrets
        </Button>
      </div>
    </div>
  );
}
