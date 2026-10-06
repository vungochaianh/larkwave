'use client';
import { Button } from 'antd';
import { ToolOutlined, CheckCircleFilled, ExclamationCircleFilled, LoadingOutlined, ArrowRightOutlined, ClockCircleOutlined } from '@ant-design/icons';
import type { AppSummary } from '@larkwave/core';
import { V, CARD_SHADOW } from '../theme';
import { AppThumb } from './AppThumb';
import { enqueueFix, useFixQueue, type FixPhase } from '../fixQueue';

const ERR = '#EF4444';
const OK = '#16B98D';
const WARN = '#F59E0B';

function hostOf(url?: string): string {
  if (!url) return '';
  try { return new URL(url).host; } catch { return ''; }
}

/**
 * The error-apps block in "Cần xử lý": each failed app has a QUICK-FIX (diagnose-and-fix build,
 * in place, no redirect). Clicking several ENQUEUES them (see fixQueue) — they run one at a time as
 * the shared AI lock frees, so a 2nd/3rd app now works (queued) instead of silently failing. The
 * queue is global, so the header "AI đang chạy" indicator shows what's running + waiting too.
 */
export function AttentionApps({ apps, onOpen }: { apps: AppSummary[]; onOpen?: (a: AppSummary) => void }) {
  const queue = useFixQueue();
  const phaseOf = (id: string): FixPhase | undefined => queue.find((i) => i.appId === id)?.phase;
  const noteOf = (id: string) => queue.find((i) => i.appId === id)?.note;
  const active = queue.filter((i) => i.phase === 'running' || i.phase === 'queued').length;

  return (
    <div>
      {active > 1 && (
        <div style={{ fontSize: 11.5, color: V.textFaint, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
          <ClockCircleOutlined /> Đang sửa lần lượt {active} app (AI chạy một phiên tại một thời điểm) — xem tiến trình ở góc phải trên.
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px,1fr))', gap: 12 }}>
        {apps.map((app) => {
          const ph = phaseOf(app.id);
          return (
            <div key={app.id} style={{ borderRadius: 14, overflow: 'hidden', border: `1px solid ${V.border}`, background: V.surface, boxShadow: CARD_SHADOW }}>
              <div style={{ position: 'relative' }}>
                <AppThumb src={undefined} name={app.name} seed={app.id} host={hostOf(app.url)} height={104} compact />
                <span style={{ position: 'absolute', top: 8, right: 8, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, color: '#fff', background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: ph === 'done' ? OK : ph === 'running' ? WARN : ph === 'queued' ? V.textFaint : ERR }} />
                  {ph === 'done' ? 'Đã sửa' : ph === 'running' ? 'Đang sửa' : ph === 'queued' ? 'Chờ' : 'Lỗi'}
                </span>
              </div>
              <div style={{ padding: '10px 12px' }}>
                <div style={{ fontWeight: 600, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{app.name}</div>
                {ph === 'running' ? (
                  <div style={{ fontSize: 11.5, color: WARN, marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}><LoadingOutlined /> {noteOf(app.id) || 'Đang sửa…'}</div>
                ) : ph === 'queued' ? (
                  <div style={{ fontSize: 11.5, color: V.textFaint, marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}><ClockCircleOutlined /> Đang chờ tới lượt…</div>
                ) : ph === 'done' ? (
                  <div style={{ fontSize: 11.5, color: OK, marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}><CheckCircleFilled /> AI đã sửa xong</div>
                ) : ph === 'error' ? (
                  <div style={{ fontSize: 11.5, color: ERR, marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}><ExclamationCircleFilled /> Chưa sửa được</div>
                ) : (
                  <div style={{ fontSize: 11.5, color: V.textFaint, marginTop: 2 }}>Nhờ AI chẩn đoán &amp; sửa nhanh</div>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <Button type="primary" size="small" icon={ph === 'running' ? <LoadingOutlined /> : <ToolOutlined />} loading={ph === 'running'} disabled={ph === 'queued'} onClick={() => enqueueFix(app.id, app.name)} style={{ flex: 1 }}>
                    {ph === 'done' ? 'Sửa lại' : ph === 'queued' ? 'Trong hàng đợi' : ph === 'running' ? 'Đang sửa' : 'Sửa nhanh'}
                  </Button>
                  <Button size="small" icon={<ArrowRightOutlined />} onClick={() => onOpen?.(app)}>Mở</Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
