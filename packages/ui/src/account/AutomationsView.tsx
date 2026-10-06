'use client';
/**
 * Native desktop port of the web App Builder's AutomationsPanel — scheduled
 * automations (cron-like tasks) that periodically call a path on the user's
 * own deployed app (e.g. `/api/cron/digest`). Self-contained: talks to the
 * App Builder API via the generic `apiFetch` helper.
 *
 * APIs:
 *   GET    /apps/:id/automations            -> Automation[]
 *   POST   /apps/:id/automations {body}     -> Automation
 *   PUT    /apps/:id/automations/:autoId {} -> Automation
 *   POST   /apps/:id/automations/:autoId/run-> Automation
 *   DELETE /apps/:id/automations/:autoId    -> { ok: true }
 */
import { useCallback, useEffect, useState } from 'react';
import {
  App,
  Alert,
  Button,
  Card,
  Empty,
  Input,
  Modal,
  Select,
  Skeleton,
  Switch,
  Tag,
  Typography,
} from 'antd';
import {
  ClockCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { apiFetch, fromNow } from './api';
import { CARD_SHADOW } from '../theme';

const { Text, Paragraph } = Typography;

/* ───────────────────────── local types ───────────────────────── */
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface Automation {
  id: string;
  name: string;
  enabled: boolean;
  intervalMinutes: number;
  method: HttpMethod;
  path: string;
  body?: string | null;
  lastRunAt?: string | null;
  lastStatus?: number | null;
  lastError?: string | null;
}

interface UpsertAutomationRequest {
  name: string;
  enabled?: boolean;
  intervalMinutes: number;
  method: HttpMethod;
  path: string;
  body?: string | null;
}

/** Minimal app shape — we only need currentUrl to show the "not deployed" hint. */
interface AppLite {
  id: string;
  currentUrl?: string | null;
}

/* ───────────────────────── constants ───────────────────────── */
const INTERVALS: { value: number; label: string }[] = [
  { value: 15, label: 'Mỗi 15 phút' },
  { value: 60, label: 'Mỗi giờ' },
  { value: 360, label: 'Mỗi 6 giờ' },
  { value: 1440, label: 'Hàng ngày' },
  { value: 10080, label: 'Hàng tuần' },
];
const intervalLabel = (m: number) => INTERVALS.find((i) => i.value === m)?.label ?? `Mỗi ${m} phút`;
const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

function statusTag(a: Automation) {
  if (!a.lastRunAt)
    return (
      <Tag bordered={false} color="default">
        Chưa chạy
      </Tag>
    );
  const s = a.lastStatus ?? 0;
  if (s >= 200 && s < 400)
    return (
      <Tag bordered={false} color="success">
        OK {s}
      </Tag>
    );
  return (
    <Tag bordered={false} color="error">
      {s || 'Lỗi'}
    </Tag>
  );
}

/** Strip an Automation to the upsert payload (for toggle updates). */
function toDto(a: Automation): UpsertAutomationRequest {
  return {
    name: a.name,
    enabled: a.enabled,
    intervalMinutes: a.intervalMinutes,
    method: a.method,
    path: a.path,
    body: a.body,
  };
}

/* ───────────────────────── main view ───────────────────────── */
export function AutomationsView({ appId }: { appId: string }) {
  const { message, modal } = App.useApp();
  const [items, setItems] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUrl, setCurrentUrl] = useState<string | null | undefined>(undefined);
  const [editing, setEditing] = useState<Automation | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, app] = await Promise.all([
        apiFetch<Automation[]>(`/apps/${appId}/automations`),
        apiFetch<AppLite>(`/apps/${appId}`).catch(() => null),
      ]);
      setItems(list);
      setCurrentUrl(app?.currentUrl ?? null);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [appId, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (a: Automation, enabled: boolean) => {
    try {
      const updated = await apiFetch<Automation>(`/apps/${appId}/automations/${a.id}`, {
        method: 'PUT',
        body: { ...toDto(a), enabled },
      });
      setItems((xs) => xs.map((x) => (x.id === a.id ? updated : x)));
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const runNow = async (a: Automation) => {
    setBusy(a.id);
    try {
      const updated = await apiFetch<Automation>(`/apps/${appId}/automations/${a.id}/run`, {
        method: 'POST',
      });
      setItems((xs) => xs.map((x) => (x.id === a.id ? updated : x)));
      message.success(`Đã chạy "${a.name}" → ${updated.lastStatus || updated.lastError || '?'}`);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const del = (a: Automation) =>
    modal.confirm({
      title: 'Xoá tác vụ',
      content: `Xoá "${a.name}"?`,
      okText: 'Xoá',
      okButtonProps: { danger: true },
      cancelText: 'Huỷ',
      onOk: async () => {
        try {
          await apiFetch<{ ok: true }>(`/apps/${appId}/automations/${a.id}`, { method: 'DELETE' });
          setItems((xs) => xs.filter((x) => x.id !== a.id));
        } catch (e) {
          message.error((e as Error).message);
        }
      },
    });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', maxWidth: 1120, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Paragraph type="secondary" style={{ margin: 0, flex: 1, minWidth: 240 }}>
          Tác vụ định kỳ — hệ thống tự gọi một đường dẫn trên chính app của bạn theo lịch (vd{' '}
          <Text code>/api/cron/...</Text>). Lý tưởng cho gửi báo cáo, dọn dữ liệu, đồng bộ…
        </Paragraph>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
          Thêm tác vụ
        </Button>
      </div>

      {currentUrl === null && (
        <Alert
          banner
          type="info"
          message="App chưa được deploy — tác vụ sẽ chỉ chạy sau khi app có URL công khai."
        />
      )}

      {loading ? (
        <Card style={{ boxShadow: CARD_SHADOW, borderRadius: 14 }}>
          <Skeleton active paragraph={{ rows: 3 }} />
        </Card>
      ) : items.length === 0 ? (
        <Card style={{ boxShadow: CARD_SHADOW, borderRadius: 14 }}>
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có tác vụ nào.">
            <Button icon={<PlusOutlined />} onClick={() => setCreating(true)}>
              Tạo tác vụ đầu tiên
            </Button>
          </Empty>
        </Card>
      ) : (
        items.map((a) => (
          <Card key={a.id} style={{ boxShadow: CARD_SHADOW, borderRadius: 14 }} styles={{ body: { padding: 16 } }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Text strong>{a.name}</Text>
                  {statusTag(a)}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                  <Tag bordered={false} icon={<ClockCircleOutlined />} color="purple">
                    {intervalLabel(a.intervalMinutes)}
                  </Tag>
                  <Text code style={{ fontSize: 12 }}>
                    {a.method} {a.path}
                  </Text>
                </div>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 6 }}>
                  {a.lastRunAt ? `Chạy lần cuối ${fromNow(a.lastRunAt)}` : 'Chưa chạy'}
                  {a.lastError ? ` · ${a.lastError}` : ''}
                </Text>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Switch size="small" checked={a.enabled} onChange={(v) => void toggle(a, v)} />
                <Button
                  type="text"
                  size="small"
                  icon={<PlayCircleOutlined />}
                  loading={busy === a.id}
                  onClick={() => void runNow(a)}
                  title="Chạy ngay"
                />
                <Button type="text" size="small" icon={<EditOutlined />} onClick={() => setEditing(a)} title="Sửa" />
                <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => del(a)} title="Xoá" />
              </div>
            </div>
          </Card>
        ))
      )}

      {(creating || editing) && (
        <AutomationModal
          appId={appId}
          initial={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={(saved) => {
            setItems((xs) => {
              const idx = xs.findIndex((x) => x.id === saved.id);
              return idx >= 0 ? xs.map((x) => (x.id === saved.id ? saved : x)) : [...xs, saved];
            });
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

/* ───────────────────────── create / edit modal ───────────────────────── */
function AutomationModal({
  appId,
  initial,
  onClose,
  onSaved,
}: {
  appId: string;
  initial: Automation | null;
  onClose: () => void;
  onSaved: (a: Automation) => void;
}) {
  const { message } = App.useApp();
  const [name, setName] = useState(initial?.name ?? '');
  const [intervalMinutes, setIntervalMinutes] = useState(initial?.intervalMinutes ?? 1440);
  const [method, setMethod] = useState<HttpMethod>(initial?.method ?? 'GET');
  const [path, setPath] = useState(initial?.path ?? '/');
  const [body, setBody] = useState(initial?.body ?? '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) {
      message.warning('Nhập tên tác vụ.');
      return;
    }
    setSaving(true);
    try {
      const payload: UpsertAutomationRequest = {
        name: name.trim(),
        intervalMinutes,
        method,
        path: path.trim() || '/',
        body: method === 'GET' ? null : (body ?? '').trim() || null,
      };
      const saved = initial
        ? await apiFetch<Automation>(`/apps/${appId}/automations/${initial.id}`, {
            method: 'PUT',
            body: { ...payload, enabled: initial.enabled },
          })
        : await apiFetch<Automation>(`/apps/${appId}/automations`, { method: 'POST', body: payload });
      onSaved(saved);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title={
        <span>
          <ThunderboltOutlined style={{ color: '#6C5CE7', marginInlineEnd: 8 }} />
          {initial ? 'Sửa tác vụ' : 'Tác vụ mới'}
        </span>
      }
      onCancel={onClose}
      onOk={() => void save()}
      okText="Lưu"
      cancelText="Huỷ"
      confirmLoading={saving}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
        <div>
          <Text strong style={{ fontSize: 13 }}>Tên</Text>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="vd: Gửi báo cáo ngày" maxLength={80} />
        </div>
        <div>
          <Text strong style={{ fontSize: 13 }}>Lịch chạy</Text>
          <Select value={intervalMinutes} onChange={setIntervalMinutes} options={INTERVALS} style={{ width: '100%' }} />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: '0 0 120px' }}>
            <Text strong style={{ fontSize: 13 }}>Method</Text>
            <Select
              value={method}
              onChange={setMethod}
              style={{ width: '100%' }}
              options={METHODS.map((m) => ({ value: m, label: m }))}
            />
          </div>
          <div style={{ flex: 1 }}>
            <Text strong style={{ fontSize: 13 }}>Đường dẫn (trên app của bạn)</Text>
            <Input value={path} onChange={(e) => setPath(e.target.value)} placeholder="/api/cron/digest" addonBefore="…app-url" />
          </div>
        </div>
        {method !== 'GET' && (
          <div>
            <Text strong style={{ fontSize: 13 }}>Body (JSON, tuỳ chọn)</Text>
            <Input.TextArea
              value={body ?? ''}
              onChange={(e) => setBody(e.target.value)}
              autoSize={{ minRows: 2, maxRows: 5 }}
              placeholder='{"key":"value"}'
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
