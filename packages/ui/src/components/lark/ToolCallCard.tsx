'use client';
import { useState } from 'react';
import { Tag } from 'antd';
import { V } from '../../theme';
import { useI18n } from '../../i18n';
import {
  LoadingOutlined,
  CheckCircleFilled,
  CloseCircleFilled,
  StopOutlined,
  ToolOutlined,
  RightOutlined,
  DownOutlined,
} from '@ant-design/icons';

export type ToolStatus = 'pending' | 'ok' | 'error' | 'denied';

export interface ToolCallState {
  callId: string;
  name: string;
  input: unknown;
  gated: boolean;
  status: ToolStatus;
  summary?: string;
  /** Tóm kết quả để làm trí nhớ khi nối lại hội thoại (không hiển thị) — xem LarkChatEvent.tool_result.memo. */
  memo?: string;
  error?: string;
  /** Main phân loại: thất bại này đáng ngờ do ỨNG DỤNG hỏng (xem LarkChatEvent.tool_result). */
  suspectAppBug?: boolean;
  /** Tầng thất bại do main xếp: 'error' | 'blocked' | 'noise'. */
  tier?: 'error' | 'blocked' | 'noise';
}

const STATUS: Record<ToolStatus, { color: string; icon: React.ReactNode; label: string }> = {
  pending: { color: 'processing', icon: <LoadingOutlined />, label: 'đang chạy' },
  ok: { color: 'success', icon: <CheckCircleFilled />, label: 'xong' },
  error: { color: 'error', icon: <CloseCircleFilled />, label: 'lỗi' },
  denied: { color: 'default', icon: <StopOutlined />, label: 'đã từ chối' },
};

/** Keys whose value is a Base/secret identifier — masked in the displayed input so a
 *  screen-recording / screenshot never leaks the raw app_token, base_id, secret, etc. */
const SENSITIVE = /(app_?token|app_?secret|base_?id|access_?token|refresh_?token|api_?key|secret|password)/i;

function mask(s: string): string {
  return s ? '••••••' : s;
}

/** Deep-copy the tool input with sensitive values masked (privacy for screen capture). */
function redact(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(redact);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = SENSITIVE.test(k) && typeof val === 'string' ? mask(val) : redact(val);
    }
    return out;
  }
  return v;
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

/**
 * A compact card for one Claude → Lark tool call. Shows just the tool name + status by default;
 * click the header to EXPAND the input (with app_token / secrets masked). The result summary /
 * error stays visible so failures are never hidden behind the toggle.
 */
export function ToolCallCard({ call }: { call: ToolCallState }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  // Thất bại tầng 'blocked'/'noise' KHÔNG phải hỏng — hiện xám, đừng nhuộm đỏ. Đỏ dành cho thứ
  // người dùng thật sự cần nhìn; nhuộm đỏ mọi thứ thì màu đỏ mất nghĩa.
  const softTier = call.status === 'error' && call.tier && call.tier !== 'error' ? call.tier : null;
  const effective: ToolStatus = softTier ? 'denied' : call.status;
  const s = STATUS[effective];
  const statusLabel: Record<ToolStatus, string> = {
    pending: t('chat.toolPending', 'đang chạy'),
    ok: t('chat.toolDone', 'xong'),
    error: t('chat.toolError', 'lỗi'),
    denied: t('chat.toolDenied', 'đã từ chối'),
  };
  // Nhãn tính CÙNG CHỖ với `effective` — suy lại lần hai ở nơi render là cách hai nửa của một thẻ
  // bắt đầu nói ngược nhau.
  const label = softTier
    ? softTier === 'blocked'
      ? t('chat.toolBlocked', 'bị chặn')
      : t('chat.toolSkipped', 'bỏ qua')
    : statusLabel[call.status];
  return (
    <div
      style={{
        border: `1px solid ${V.border}`,
        borderRadius: 10,
        padding: '8px 10px',
        background: V.surfaceAlt,
        color: V.text,
        fontSize: 12.5,
      }}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') setOpen((o) => !o);
        }}
        style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}
      >
        <span style={{ color: V.textFaint, fontSize: 10, display: 'inline-flex' }}>
          {open ? <DownOutlined /> : <RightOutlined />}
        </span>
        <ToolOutlined style={{ color: '#6C5CE7', flex: '0 0 auto' }} />
        <span
          style={{
            fontWeight: 600,
            fontFamily: 'monospace',
            flex: '0 1 auto',
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {call.name}
        </span>
        {call.gated && (
          <Tag color="warning" style={{ marginInlineStart: 0, fontSize: 10.5, flex: '0 0 auto' }}>
            {t('chat.needsConfirm', 'cần xác nhận')}
          </Tag>
        )}
        <span style={{ flex: 1, minWidth: 4 }} />
        <Tag color={s.color} icon={s.icon} style={{ marginInlineEnd: 0, fontSize: 10.5 }}>
          {label}
        </Tag>
      </div>
      {open && (
        <pre
          style={{
            margin: '6px 0 0',
            padding: '6px 8px',
            background: V.surface,
            color: V.textSub,
            border: `1px solid ${V.borderSub}`,
            borderRadius: 8,
            maxHeight: 200,
            overflow: 'auto',
            fontSize: 11.5,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {safeJson(redact(call.input))}
        </pre>
      )}
      {call.status === 'ok' && call.summary && (
        <div style={{ marginTop: 4, color: '#16B98D', wordBreak: 'break-word' }}>→ {call.summary}</div>
      )}
      {call.status === 'error' && call.error && (
        // Màu theo TẦNG, không theo status: một `stale-ref` có chip xám "bỏ qua" mà dòng chữ đỏ
        // chói bên dưới là hai nửa của cùng một thẻ nói ngược nhau.
        <div style={{ marginTop: 4, color: softTier ? V.textSub : '#EF4444', wordBreak: 'break-word' }}>
          → {call.error}
        </div>
      )}
    </div>
  );
}

/** Có phải một thất bại THẬT không (tầng 'error'), hay chỉ bị chặn/bỏ qua (xám). */
function isRealError(c: ToolCallState): boolean {
  return c.status === 'error' && (c.tier ?? 'error') === 'error';
}

/**
 * Gộp MỘT CHUỖI tool-call liên tiếp vào một hàng thu gọn ("Đã dùng N công cụ"), bấm mới mở.
 *
 * Vì sao: một lượt agent thường gọi hàng loạt công cụ (vd nhiều `bitable_search_records`), mỗi thẻ
 * chiếm 1-2 dòng → kín cả màn hình, lấn mất câu trả lời. Mặc định thu gọn khi MỌI công cụ đã xong
 * êm; còn ĐANG CHẠY hoặc CÓ LỖI THẬT thì tự mở để người dùng thấy ngay (và để nút "nhảy tới công cụ
 * lỗi" ở băng lỗi vẫn tìm được phần tử trong DOM). Một công cụ lẻ thì render thẳng, không bọc nhóm.
 */
export function ToolCallGroup({ calls }: { calls: ToolCallState[] }) {
  const { t } = useI18n();
  const hasError = calls.some(isRealError);
  const hasPending = calls.some((c) => c.status === 'pending');
  // null = chưa người dùng động tới → theo mặc định suy ra (mở khi chạy/lỗi, gọn khi xong êm).
  const [override, setOverride] = useState<boolean | null>(null);
  const open = override !== null ? override : hasError || hasPending;

  // id bọc để băng lỗi (jumpToTool → getElementById(`tw-tool-<callId>`)) tìm được; vì nhóm có lỗi
  // luôn mở sẵn nên phần tử lỗi luôn có trong DOM khi cần nhảy tới.
  const wrap = (c: ToolCallState) => (
    <div key={c.callId} id={`tw-tool-${c.callId}`} style={{ borderRadius: 10 }}>
      <ToolCallCard call={c} />
    </div>
  );

  if (calls.length === 1) return wrap(calls[0]);

  const errN = calls.filter(isRealError).length;
  const statusTag = hasPending ? (
    <Tag color="processing" icon={<LoadingOutlined />} style={{ marginInlineEnd: 0, fontSize: 10.5 }}>
      {t('chat.toolPending', 'đang chạy')}
    </Tag>
  ) : errN ? (
    <Tag color="error" icon={<CloseCircleFilled />} style={{ marginInlineEnd: 0, fontSize: 10.5 }}>
      {t('chat.toolGroupErrN', '{n} lỗi', { n: errN })}
    </Tag>
  ) : (
    <Tag color="success" icon={<CheckCircleFilled />} style={{ marginInlineEnd: 0, fontSize: 10.5 }}>
      {t('chat.toolDone', 'xong')}
    </Tag>
  );

  return (
    <div
      style={{
        border: `1px solid ${V.border}`,
        borderRadius: 10,
        padding: '8px 10px',
        background: V.surfaceAlt,
        color: V.text,
        fontSize: 12.5,
      }}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOverride((o) => (o === null ? !(hasError || hasPending) : !o))}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') setOverride((o) => (o === null ? !(hasError || hasPending) : !o));
        }}
        style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}
      >
        <span style={{ color: V.textFaint, fontSize: 10, display: 'inline-flex' }}>
          {open ? <DownOutlined /> : <RightOutlined />}
        </span>
        <ToolOutlined style={{ color: '#6C5CE7', flex: '0 0 auto' }} />
        <span style={{ fontWeight: 600 }}>{t('chat.toolGroupCount', 'Đã dùng {n} công cụ', { n: calls.length })}</span>
        <span style={{ flex: 1, minWidth: 4 }} />
        {statusTag}
      </div>
      {open && <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>{calls.map(wrap)}</div>}
    </div>
  );
}
