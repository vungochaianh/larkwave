'use client';
import { useEffect, useMemo, useState } from 'react';
import { App, Button, Collapse, Empty, Segmented, Spin, Tag, Typography } from 'antd';
import { CopyOutlined, ReloadOutlined } from '@ant-design/icons';
import type { RunnerPromptPreview } from '@larkwave/core';
import { useRuntime } from '../RuntimeProvider';
import { V } from '../theme';

const { Text } = Typography;

export type PromptOverrides = {
  system?: string;
  user?: string;
  full?: string;
};

/**
 * Live inspector for the exact prompt Larkwave sends to the desktop CLI runner.
 * Sections are editable; overrides are passed back to createBuild on send.
 */
export function PromptInspector({
  appId,
  preview,
  loading,
  draftHint,
  overrides,
  onOverridesChange,
  onRefresh,
}: {
  appId?: string;
  preview: RunnerPromptPreview | null;
  loading?: boolean;
  /** Shown when preview is empty — e.g. "tiệm bánh mì" from the chat box. */
  draftHint?: string;
  overrides: PromptOverrides;
  onOverridesChange: (next: PromptOverrides) => void;
  onRefresh?: () => void;
}) {
  const { message } = App.useApp();
  const runtime = useRuntime();
  const [tab, setTab] = useState<'full' | 'parts'>('full');
  // The FULL prompt actually sent on the last build (from .toolswave/last-prompt-audit.txt) — shown
  // when nothing is being drafted, so the tab is meaningful on open instead of a bare placeholder.
  const [lastPrompt, setLastPrompt] = useState('');
  useEffect(() => {
    if (preview || !appId || !runtime.appLastPrompt) return;
    let alive = true;
    void runtime
      .appLastPrompt(appId)
      .then((t) => alive && setLastPrompt(t || ''))
      .catch(() => alive && setLastPrompt(''));
    return () => {
      alive = false;
    };
  }, [appId, preview, runtime]);

  const dirty = !!(overrides.system !== undefined || overrides.user !== undefined || overrides.full !== undefined);

  const systemVal = overrides.system ?? preview?.sections.system ?? '';
  const userVal = overrides.user ?? preview?.sections.user ?? '';
  const fullVal = overrides.full ?? preview?.fullText ?? '';

  const deliveryLabel = useMemo(() => {
    if (!preview) return '';
    return preview.delivery === 'append-system-prompt'
      ? 'Claude: --append-system-prompt + user message'
      : `Gộp 1 file → ${preview.promptFileName}`;
  }, [preview]);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      message.success('Đã sao chép prompt');
    } catch {
      message.error('Không sao chép được');
    }
  };

  const reset = () => onOverridesChange({});

  const patch = (key: keyof PromptOverrides, value: string, base: string) => {
    const next = { ...overrides };
    if (value === base) delete next[key];
    else next[key] = value;
    onOverridesChange(next);
  };

  if (loading && !preview) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 120 }}>
        <Spin tip="Đang tổng hợp prompt…" />
      </div>
    );
  }

  if (!preview) {
    // Have a real last-sent prompt on disk → show it (read-only) instead of an empty placeholder.
    if (lastPrompt) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%', minHeight: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Tag color="purple">Prompt đã gửi gần nhất</Tag>
            <Text type="secondary" style={{ fontSize: 11.5 }}>
              Toàn bộ prompt đã gửi tới CLI ở lần dựng/sửa trước. Gõ yêu cầu MỚI ở khung chat để xem prompt của lần tới.
            </Text>
            <div style={{ flex: 1 }} />
            <Button size="small" icon={<CopyOutlined />} onClick={() => void copy(lastPrompt)}>
              Sao chép
            </Button>
          </div>
          <textarea
            readOnly
            value={lastPrompt}
            spellCheck={false}
            style={{
              flex: 1,
              minHeight: 160,
              width: '100%',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 11.5,
              lineHeight: 1.55,
              padding: 10,
              border: `1px solid ${V.border}`,
              borderRadius: 8,
              resize: 'none',
              background: V.surfaceAlt,
              color: V.text,
            }}
          />
        </div>
      );
    }
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={
          draftHint
            ? `Nhập "${draftHint}" ở khung chat rồi xem prompt tổng hợp tại đây.`
            : 'Chưa dựng lần nào. Gõ yêu cầu ở khung chat để xem prompt sẽ gửi tới CLI (prompt của lần dựng gần nhất cũng sẽ hiện ở đây).'
        }
      />
    );
  }

  const areaStyle: React.CSSProperties = {
    width: '100%',
    minHeight: 120,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: 11.5,
    lineHeight: 1.55,
    padding: 10,
    border: `1px solid ${V.border}`,
    borderRadius: 8,
    resize: 'vertical',
    background: V.surfaceAlt,
    color: V.text,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%', minHeight: 0 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <Tag color="purple">{preview.runnerLabel}</Tag>
        {preview.model && <Tag>{preview.model}</Tag>}
        <Tag>{preview.mode}</Tag>
        {dirty && <Tag color="orange">Đã chỉnh</Tag>}
        <div style={{ flex: 1 }} />
        {onRefresh && (
          <Button size="small" icon={<ReloadOutlined />} onClick={onRefresh}>
            Làm mới
          </Button>
        )}
        <Button size="small" icon={<CopyOutlined />} onClick={() => void copy(fullVal)}>
          Sao chép
        </Button>
        {dirty && (
          <Button size="small" onClick={reset}>
            Khôi phục
          </Button>
        )}
      </div>
      <Text type="secondary" style={{ fontSize: 11.5, display: 'block' }}>
        {deliveryLabel}
        <span style={{ margin: '0 6px' }}>·</span>
        <code style={{ fontSize: 11 }}>{preview.cwd}</code>
      </Text>
      <Segmented
        size="small"
        value={tab}
        onChange={(v) => setTab(v as 'full' | 'parts')}
        options={[
          { label: 'Prompt đầy đủ', value: 'full' },
          { label: 'Tách phần', value: 'parts' },
        ]}
      />
      {tab === 'full' ? (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <Text type="secondary" style={{ fontSize: 11.5, marginBottom: 6 }}>
            Đây là nội dung chính xác ghi vào <code>{preview.promptFileName}</code> (hoặc user message với Claude).
          </Text>
          <textarea
            style={{ ...areaStyle, flex: 1 }}
            value={fullVal}
            onChange={(e) => patch('full', e.target.value, preview.fullText)}
            spellCheck={false}
          />
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          <Collapse
            size="small"
            defaultActiveKey={['user', 'system', ...(preview.sections.scopeBackstop ? ['scope'] : [])]}
            items={[
              ...(preview.sections.scopeBackstop
                ? [
                    {
                      key: 'scope',
                      label: 'Giới hạn phạm vi (scope backstop)',
                      children: (
                        <pre style={{ margin: 0, fontSize: 11.5, whiteSpace: 'pre-wrap', color: V.text }}>
                          {preview.sections.scopeBackstop}
                        </pre>
                      ),
                    },
                  ]
                : []),
              {
                key: 'system',
                label: 'System / hướng dẫn kỹ thuật',
                children: (
                  <textarea
                    style={areaStyle}
                    value={systemVal}
                    onChange={(e) => patch('system', e.target.value, preview.sections.system)}
                    spellCheck={false}
                  />
                ),
              },
              {
                key: 'user',
                label: 'User — yêu cầu + tùy chọn composer',
                children: (
                  <textarea
                    style={areaStyle}
                    value={userVal}
                    onChange={(e) => patch('user', e.target.value, preview.sections.user)}
                    spellCheck={false}
                  />
                ),
              },
            ]}
          />
        </div>
      )}
      {loading && (
        <Text type="secondary" style={{ fontSize: 11 }}>
          <Spin size="small" /> Đang cập nhật…
        </Text>
      )}
    </div>
  );
}