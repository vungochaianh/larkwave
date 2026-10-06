'use client';
import { Steps, Tag, Typography, Progress } from 'antd';
import type { BuildEvent } from '@larkwave/core';
import { V } from '../theme';
import { useI18n } from '../i18n';

const { Text } = Typography;

/**
 * Renders a streamed build identically on web + desktop. Tool calls (Ghi/Sửa/Đọc/Chạy…) stream as a
 * single LIVE "đang làm" line + a files/ops counter so a long build visibly progresses (instead of
 * collapsing ten identical "🔧 Write" rows into one that looks frozen); lifecycle milestones
 * (Khởi động Claude, 🔁 Hoàn thiện app, …) still show as steps.
 */
export function BuildProgress({ events }: { events: BuildEvent[] }) {
  const { t } = useI18n();
  const lifecycle = new Map<string, 'running' | 'done' | 'error'>(); // milestone stages (non-tool)
  let currentAction = '';
  let toolCount = 0;
  const filesWritten = new Set<string>();
  let ratio = 0;
  let status = '';
  const logs: { level: string; message: string }[] = [];
  let result: { appId: string; previewUrl?: string } | undefined;

  for (const e of events) {
    if (e.type === 'stage') {
      if (e.name.startsWith('🔧')) {
        // A tool call → the live line + counters, NOT a step row (kills the collapse).
        if (e.state === 'running') {
          currentAction = e.name.replace(/^🔧\s*/, '');
          toolCount++;
          const m = currentAction.match(/^(?:Ghi|Sửa)\s+(.+)$/); // count unique files written/edited
          if (m) filesWritten.add(m[1]);
        }
      } else {
        lifecycle.set(e.name, e.state);
        if (e.state === 'running') currentAction = e.name;
      }
    } else if (e.type === 'file') {
      // The direct-API runner streams file writes as type:'file' — surface them too.
      currentAction = `${t('ui.build.write', 'Ghi')} ${e.path}`;
      filesWritten.add(e.path);
      toolCount++;
    } else if (e.type === 'progress') ratio = e.ratio;
    else if (e.type === 'status') status = e.status;
    else if (e.type === 'log') logs.push({ level: e.level, message: e.message });
    else if (e.type === 'error') logs.push({ level: 'error', message: e.message });
    else if (e.type === 'result') result = { appId: e.appId, previewUrl: e.previewUrl };
  }

  const done = status === 'succeeded' || status === 'failed';
  const stageItems = [...lifecycle.entries()].map(([name, state]) => ({
    title: name,
    status: state === 'done' ? ('finish' as const) : state === 'error' ? ('error' as const) : ('process' as const),
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {status && (
        <Tag color={status === 'succeeded' ? 'green' : status === 'failed' ? 'red' : 'blue'}>{status}</Tag>
      )}
      {ratio > 0 && ratio < 1 && <Progress percent={Math.round(ratio * 100)} size="small" />}
      {/* Live heartbeat: what the agent is doing RIGHT NOW + how much it has written so far. */}
      {!done && (currentAction || toolCount > 0) && (
        <div style={{ fontSize: 13, color: V.text, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {currentAction && <span>⏳ {currentAction}</span>}
          {toolCount > 0 && (
            <span style={{ color: V.textFaint, fontSize: 12 }}>
              · {filesWritten.size} {t('ui.build.files', 'tệp')} · {toolCount} {t('ui.build.ops', 'thao tác')}
            </span>
          )}
        </div>
      )}
      {stageItems.length > 0 && <Steps size="small" direction="vertical" items={stageItems} />}
      <div style={{ maxHeight: 220, overflow: 'auto', fontFamily: 'monospace', fontSize: 12 }}>
        {logs.slice(-200).map((l, i) => (
          <div key={i} style={{ color: l.level === 'error' ? '#d4380d' : l.level === 'warn' ? '#d48806' : V.textSub }}>
            {l.message}
          </div>
        ))}
      </div>
      {result?.previewUrl && (
        <Text>
          Preview: <a href={result.previewUrl}>{result.previewUrl}</a>
        </Text>
      )}
    </div>
  );
}
