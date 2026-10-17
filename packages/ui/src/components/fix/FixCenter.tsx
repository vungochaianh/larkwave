'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { App as AntApp, Button, Modal, Tag, Typography } from 'antd';
import { CheckCircleFilled, ExclamationCircleFilled, InfoCircleFilled, SafetyCertificateOutlined } from '@ant-design/icons';
import type { GmailConnectorAccount, RunnerStatusInfo, ZaloConnectorStatus } from '@larkwave/core';
import { useRuntime } from '../../RuntimeProvider';
import { ERR, OK, V, WARN } from '../../theme';
import { AgentGuideModal } from '../AgentGuideModal';
import { ClaudeConnect } from '../ClaudeConnect';
import { ClaudeKeyManager } from '../ClaudeKeyManager';
import { SkillConnectors } from '../SkillConnectors';
import { ZaloSyncPanel } from '../ZaloSyncPanel';
import { FIX_ISSUES_EVENT, OPEN_FIX_EVENT, healthIssues, openFix, type FixTarget, type HealthIssue, type OpenFixDetail } from './fixRules';

const { Text } = Typography;

/** Hỏi lại khi quay về cửa sổ — nhưng không dày hơn mức này (mỗi lần hỏi có gọi `claude --version`…). */
const RECHECK_MS = 10 * 60_000;

/**
 * Trung tâm "sửa nhanh" + trợ lý kiểm tra MIỄN PHÍ (luật cố định, không gọi AI). Mount MỘT lần trong
 * AppShell (bản desktop):
 *  - nghe `openFix(đích)` ở bất kỳ đâu → mở thẳng modal sửa (đăng nhập Claude, API key, quét QR Zalo,
 *    Gmail, cài/đăng nhập runner) — người dùng không phải lần vào Cài đặt;
 *  - kiểm lúc mở app + khi quay lại cửa sổ: lỗi CHẮC làm hỏng lượt chat (runner đang dùng chưa cài / chưa
 *    đăng nhập, chọn API mà chưa có key) → thông báo kèm "Sửa ngay". Zalo/Gmail là tuỳ chọn: không nhắc
 *    tự động — chỉ mở khi người dùng dùng tới (thẻ lỗi công cụ, lệnh /zalo-…, /gmail-…).
 */
export function FixCenter() {
  const runtime = useRuntime();
  const { notification } = AntApp.useApp();
  const [open, setOpen] = useState<OpenFixDetail | null>(null);
  const [issues, setIssues] = useState<HealthIssue[]>([]);
  const [runners, setRunners] = useState<RunnerStatusInfo[]>([]);
  const [checking, setChecking] = useState(false);
  const lastCheck = useRef(0);
  const notified = useRef(new Set<string>());

  const check = useCallback(async (): Promise<HealthIssue[]> => {
    setChecking(true);
    try {
      const [list, st, keys, zalo, gmail] = await Promise.all([
        runtime.runners?.list().catch(() => [] as RunnerStatusInfo[]) ?? Promise.resolve([] as RunnerStatusInfo[]),
        runtime.larkStatus?.().catch(() => null) ?? Promise.resolve(null),
        runtime.claude?.listKeys?.().catch(() => null) ?? Promise.resolve(null),
        runtime.connectorsCall ? (runtime.connectorsCall('zaloStatus') as Promise<ZaloConnectorStatus>).catch(() => null) : Promise.resolve(null),
        runtime.connectorsCall ? (runtime.connectorsCall('gmailList') as Promise<GmailConnectorAccount[]>).catch(() => null) : Promise.resolve(null),
      ]);
      setRunners(list || []);
      const found = healthIssues({
        runners: list || [],
        activeRunner: st?.defaultRunner || 'claude',
        runSource: st?.larkRunSource ?? (st?.apiMode ? 'api' : 'cli'),
        apiKeyReady: typeof st?.apiKeyReady === 'boolean' ? st.apiKeyReady : undefined,
        claudeKeys: keys,
        zalo: zalo ? { connected: zalo.accounts.some((a) => a.status === 'ready') } : null,
        gmail: gmail ? { connected: gmail.length > 0 } : null,
      });
      setIssues(found);
      window.dispatchEvent(new CustomEvent<number>(FIX_ISSUES_EVENT, { detail: found.filter((x) => x.level !== 'info').length }));
      lastCheck.current = Date.now();
      return found;
    } finally {
      setChecking(false);
    }
  }, [runtime]);

  // Thông báo cho lỗi CHẮC làm hỏng lượt chat — mỗi lỗi một lần mỗi phiên app.
  const announce = useCallback(
    (found: HealthIssue[]) => {
      for (const it of found.filter((x) => x.level === 'error')) {
        if (notified.current.has(it.id)) continue;
        notified.current.add(it.id);
        notification.warning({
          key: `fix:${it.id}`,
          message: it.title,
          description: it.detail,
          duration: 0,
          btn: (
            <span style={{ display: 'inline-flex', gap: 8 }}>
              <Button size="small" onClick={() => (notification.destroy(`fix:${it.id}`), openFix('checklist'))}>
                Xem tất cả
              </Button>
              {it.fix && (
                <Button type="primary" size="small" onClick={() => (notification.destroy(`fix:${it.id}`), openFix(it.fix!, it.title))}>
                  {it.fixLabel || 'Sửa ngay'}
                </Button>
              )}
            </span>
          ),
        });
      }
    },
    [notification],
  );

  useEffect(() => {
    const t = setTimeout(() => void check().then(announce).catch(() => undefined), 3500);
    const onFocus = () => {
      if (Date.now() - lastCheck.current > RECHECK_MS) void check().then(announce).catch(() => undefined);
    };
    const onOpen = (e: Event) => {
      const d = (e as CustomEvent<OpenFixDetail>).detail;
      if (d?.target) setOpen(d);
      if (d?.target === 'checklist' || d?.target?.startsWith('runner:')) void check();
    };
    window.addEventListener('focus', onFocus);
    window.addEventListener(OPEN_FIX_EVENT, onOpen);
    return () => {
      clearTimeout(t);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener(OPEN_FIX_EVENT, onOpen);
    };
  }, [check, announce]);

  const close = () => {
    setOpen(null);
    // Sửa xong thì kiểm lại; thông báo cũ của lỗi đã hết được gỡ.
    void check().then((found) => {
      for (const id of notified.current) {
        if (!found.some((f) => f.id === id)) {
          notification.destroy(`fix:${id}`);
          notified.current.delete(id);
        }
      }
    });
  };

  if (!open) return null;
  const target: FixTarget = open.target;

  // Runner (Gemini / Grok / Codex — hoặc Claude khi cần hướng dẫn CÀI) → modal hướng dẫn sẵn có.
  if (target.startsWith('runner:')) {
    const id = target.slice('runner:'.length);
    const r = runners.find((x) => x.id === id) ?? null;
    if (!r) return null; // danh sách runner đang tải — check() ở onOpen sẽ vẽ lại
    return <AgentGuideModal runtime={runtime} runner={r} onClose={close} onChanged={(list) => setRunners(list)} />;
  }

  const title =
    target === 'claude'
      ? 'Kết nối Claude'
      : target === 'claudeKeys'
        ? 'API key Claude'
        : target === 'zalo'
          ? 'Kết nối Zalo'
          : target === 'zaloSync' || target === 'zaloWeb'
            ? 'Đồng bộ tin Zalo'
            : target === 'gmail'
              ? 'Kết nối Gmail'
              : 'Kiểm tra sẵn sàng';

  return (
    <Modal open title={title} onCancel={close} footer={null} width={target === 'checklist' ? 560 : 640} destroyOnClose>
      {open.reason && target !== 'checklist' && (
        <div style={{ marginBottom: 12, fontSize: 13, color: V.textSub }}>{open.reason}</div>
      )}
      {target === 'claude' && <ClaudeConnect onReady={close} />}
      {target === 'claudeKeys' && <ClaudeKeyManager embedded onActiveChange={() => void check()} />}
      {target === 'zalo' && <SkillConnectors runtime={runtime} only="zalo" autoQr onConnected={() => setTimeout(close, 1200)} />}
      {target === 'gmail' && <SkillConnectors runtime={runtime} only="gmail" onConnected={() => setTimeout(close, 800)} />}
      {(target === 'zaloSync' || target === 'zaloWeb') && <ZaloSyncPanel runtime={runtime} embedded openWeb={target === 'zaloWeb'} />}
      {target === 'checklist' && <Checklist issues={issues} checking={checking} onRecheck={() => void check()} />}
    </Modal>
  );
}

function Checklist({ issues, checking, onRecheck }: { issues: HealthIssue[]; checking: boolean; onRecheck: () => void }) {
  const icon = (l: HealthIssue['level']) =>
    l === 'error' ? <ExclamationCircleFilled style={{ color: ERR }} /> : l === 'warn' ? <ExclamationCircleFilled style={{ color: WARN }} /> : <InfoCircleFilled style={{ color: V.textFaint }} />;
  const blocking = issues.filter((i) => i.level !== 'info');
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        {blocking.length ? (
          <Text>Có {blocking.length} việc cần sửa để Lark × Agents chạy trơn tru.</Text>
        ) : (
          <Text>
            <CheckCircleFilled style={{ color: OK }} /> Mọi thứ cần thiết đã sẵn sàng.
          </Text>
        )}
        <div style={{ flex: 1 }} />
        <Button size="small" icon={<SafetyCertificateOutlined />} loading={checking} onClick={onRecheck}>
          Kiểm lại
        </Button>
      </div>
      {issues.map((it) => (
        <div key={it.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 0', borderTop: `1px solid ${V.borderSub}` }}>
          <span style={{ marginTop: 2 }}>{icon(it.level)}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600 }}>
              {it.title} {it.level === 'info' && <Tag style={{ marginLeft: 4 }}>tuỳ chọn</Tag>}
            </div>
            {it.detail && <div style={{ fontSize: 12.5, color: V.textSub }}>{it.detail}</div>}
          </div>
          {it.fix && (
            <Button size="small" type={it.level === 'info' ? 'default' : 'primary'} onClick={() => openFix(it.fix!, it.title)}>
              {it.fixLabel || 'Sửa'}
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
