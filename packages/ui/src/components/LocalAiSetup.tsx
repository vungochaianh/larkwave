'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Progress, Tag, Typography } from 'antd';
import { CheckCircleFilled, CloudDownloadOutlined, DesktopOutlined, ThunderboltOutlined } from '@ant-design/icons';
import type { LocalAiStatus, RuntimeAdapter } from '@larkwave/core';
import { BRAND, OK, V } from '../theme';
import { useI18n } from '../i18n';
import { ClaudeConnect } from './ClaudeConnect';

const { Text, Paragraph } = Typography;

/** Phát khi người dùng cài / tải / chọn AI trên máy — khung chat nghe để làm mới chip nguồn chạy. */
export const LOCAL_AI_CHANGED_EVENT = 'larkwave:local-ai-changed';

/** Mô hình gợi ý theo RAM máy: cái lớn nhất mà máy chạy mượt. */
export function suggestedModel(st: Pick<LocalAiStatus, 'recommended' | 'ramGb'>): string | undefined {
  const fit = st.recommended.filter((m) => !m.minRamGb || m.minRamGb <= st.ramGb);
  return (fit[fit.length - 1] ?? st.recommended[0])?.id;
}

/**
 * Màn "Cài AI" (0.1.24) — người dùng TỰ cài AI ngay trong app, chạy trên máy của họ:
 *   1. AI miễn phí trên máy: app tải Ollama + một mô hình mở, không cần tài khoản, chạy offline.
 *   2. Claude (mạnh nhất): cài một bấm bằng trình cài chính thức của Anthropic, rồi đăng nhập tài khoản Claude.
 * Phần 1 chỉ hiện khi lõi có kênh (`runtime.localAiStatus`) — giao diện code-push vẫn chạy trên lõi cũ.
 */
export function LocalAiSetup({ runtime, onUsed, showClaude = true }: { runtime: RuntimeAdapter; onUsed?: () => void; showClaude?: boolean }) {
  const { t } = useI18n();
  const [st, setSt] = useState<LocalAiStatus | null>(null);
  const [err, setErr] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busyRef = useRef<LocalAiStatus['busy']>(undefined);
  const supported = !!runtime.localAiStatus;

  const refresh = useCallback(async () => {
    if (!runtime.localAiStatus) return null;
    const s = await runtime.localAiStatus().catch((e) => {
      setErr((e as Error)?.message || String(e));
      return null;
    });
    if (s) setSt(s);
    return s;
  }, [runtime]);

  // Đang tải nền → hỏi lại mỗi giây để vẽ tiến độ; xong thì dừng.
  useEffect(() => {
    let alive = true;
    const loop = async () => {
      const was = !!busyRef.current;
      const s = await refresh();
      if (!alive) return;
      busyRef.current = s?.busy;
      if (was && !s?.busy) window.dispatchEvent(new Event(LOCAL_AI_CHANGED_EVENT));
      timer.current = setTimeout(loop, s?.busy ? 1000 : 5000);
    };
    void loop();
    return () => {
      alive = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [refresh]);

  const act = async (fn: () => Promise<LocalAiStatus> | undefined) => {
    setErr('');
    try {
      const s = await fn();
      if (s) setSt(s);
      // Khung chat đang mở cần biết ngay (chip nguồn chạy, cảnh báo "AI trên máy chưa sẵn sàng").
      window.dispatchEvent(new Event(LOCAL_AI_CHANGED_EVENT));
    } catch (e) {
      setErr((e as Error)?.message || String(e));
    }
  };

  const busy = st?.busy;
  const have = new Set(st?.models.map((m) => m.id) ?? []);
  const suggest = st ? suggestedModel(st) : undefined;

  return (
    <div data-testid="ai-setup" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {supported && (
        <div data-testid="ai-setup-local" style={{ border: `1px solid ${V.border}`, borderRadius: 12, padding: 16, background: V.surface }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <DesktopOutlined style={{ fontSize: 20, color: BRAND }} />
            <Text strong style={{ fontSize: 15 }}>{t('ui.aiSetup.localTitle', 'AI miễn phí trên máy')}</Text>
            <Tag color="green" style={{ marginLeft: 'auto' }}>{t('ui.aiSetup.free', 'Miễn phí · không cần tài khoản')}</Tag>
          </div>
          <Paragraph type="secondary" style={{ marginBottom: 10, fontSize: 13 }}>
            {t('ui.aiSetup.localDesc', 'Larkwave tự tải Ollama và một mô hình AI mở về máy bạn. Dữ liệu không rời máy, chạy được khi không có mạng. Chậm hơn và kém hơn Claude với việc phức tạp — hợp để hỏi đáp, tóm tắt, xuất bảng.')}
          </Paragraph>

          {busy && (
            <div data-testid="ai-setup-progress" style={{ marginBottom: 10 }}>
              <Text style={{ fontSize: 13 }}>{busy.text}</Text>
              <Progress percent={busy.pct} size="small" status="active" strokeColor={BRAND} />
            </div>
          )}

          {st && !st.installed && !busy && (
            <Button type="primary" size="large" icon={<CloudDownloadOutlined />} disabled={!st.supported} onClick={() => void act(() => runtime.localAiInstall?.())} data-testid="ai-setup-install">
              {t('ui.aiSetup.install', 'Cài AI miễn phí (Ollama · ~180 MB)')}
            </Button>
          )}

          {st && st.installed && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Text type="secondary" style={{ fontSize: 12.5 }}>
                {st.running ? <><CheckCircleFilled style={{ color: OK }} /> {st.external ? t('ui.aiSetup.runningExt', 'Đang dùng Ollama có sẵn trên máy') : t('ui.aiSetup.running', 'AI trên máy đang chạy')}{st.version ? ` · v${st.version}` : ''}</> : t('ui.aiSetup.starting', 'Đang khởi động AI trên máy…')}
                {` · RAM ${st.ramGb} GB`}
              </Text>
              {st.recommended.map((m) => {
                const got = have.has(m.id);
                const active = st.activeModel === m.id;
                const tooBig = !!m.minRamGb && m.minRamGb > st.ramGb;
                return (
                  <div key={m.id} data-testid={`ai-model-${m.id}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10, border: `1px solid ${active ? BRAND : V.borderSub}`, background: active ? `${BRAND}10` : 'transparent' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13.5 }}>
                        {m.label} {m.id === suggest && !got && <Tag color="purple" style={{ marginLeft: 4 }}>{t('ui.aiSetup.suggest', 'Gợi ý cho máy này')}</Tag>}
                      </div>
                      <Text type="secondary" style={{ fontSize: 12 }}>{m.id} · {m.sizeGb} GB{tooBig ? ` · ${t('ui.aiSetup.tooBig', 'máy hơi yếu cho mô hình này')}` : ''}</Text>
                    </div>
                    {active ? (
                      <Tag color="green" icon={<CheckCircleFilled />}>{t('ui.aiSetup.inUse', 'Đang dùng')}</Tag>
                    ) : got ? (
                      <Button size="small" type="primary" icon={<ThunderboltOutlined />} onClick={() => void act(async () => { const s = await runtime.localAiUse!(m.id); onUsed?.(); return s; })}>
                        {t('ui.aiSetup.use', 'Dùng cho Lark × Agents')}
                      </Button>
                    ) : (
                      <Button size="small" icon={<CloudDownloadOutlined />} disabled={!!busy || !st.running} onClick={() => void act(() => runtime.localAiPull?.(m.id))}>
                        {t('ui.aiSetup.pull', 'Tải')} {m.sizeGb} GB
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {(err || st?.error) && <Alert style={{ marginTop: 10 }} type="error" showIcon message={err || st?.error} />}
        </div>
      )}

      {showClaude && runtime.claude && (
        <div data-testid="ai-setup-claude" style={{ border: `1px solid ${V.border}`, borderRadius: 12, padding: 16, background: V.surface }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <ThunderboltOutlined style={{ fontSize: 20, color: BRAND }} />
            <Text strong style={{ fontSize: 15 }}>{t('ui.aiSetup.claudeTitle', 'Claude — mạnh nhất')}</Text>
            <Tag style={{ marginLeft: 'auto' }}>{t('ui.aiSetup.claudeNeed', 'Cần tài khoản Claude')}</Tag>
          </div>
          <ClaudeConnect embedded onReady={() => undefined} />
        </div>
      )}
    </div>
  );
}
