'use client';
import { useCallback, useEffect, useState } from 'react';
import { Modal, List, Progress, Alert, Tag, Button, Space, Typography, QRCode, Empty } from 'antd';
import {
  CheckCircleFilled,
  LoadingOutlined,
  MinusCircleOutlined,
  MobileOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import type { AppSummary } from '@larkwave/core';
import { useRuntime } from '../RuntimeProvider';
import { useAccountAuth } from '../account/auth';

const { Text, Paragraph } = Typography;
const REMOTE_URL = 'https://toolswave.net/remote/agent';

type Phase = 'loading' | 'uploading' | 'done' | 'empty' | 'not-ready' | 'server' | 'timeout' | 'error';
// syncApps currently resolves { ok, count }; a newer native build also carries `reason`
// ('auth' | 'timeout' | 'error') so we can show the RIGHT message instead of conflating
// not-signed-in / network-stall / 5xx. Read it opportunistically; fall back when absent.
type SyncResult = { ok: boolean; count: number; reason?: 'auth' | 'timeout' | 'error' };

const running = (a: AppSummary) => a.status === 'ready' || a.status === 'live';

/**
 * A real progress modal for "Đồng bộ lên điện thoại" — replaces the fleeting toast.
 * Shows: which local apps are being pushed, a progress bar, an in-modal status message,
 * and (on success) a QR + link to open /remote/agent on the phone. Self-driving: it runs
 * the sync whenever it opens; "Đồng bộ lại" re-runs it. The upload itself is one atomic
 * POST, so on success every listed app is marked ✓ and the header shows the server count.
 */
export function SyncToPhoneModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const runtime = useRuntime();
  const { user: acct } = useAccountAuth();
  const acctEmail = acct?.email;
  const [phase, setPhase] = useState<Phase>('loading');
  const [list, setList] = useState<AppSummary[]>([]);
  const [count, setCount] = useState(0);
  const [err, setErr] = useState('');

  const run = useCallback(async () => {
    if (!runtime.agent?.syncApps) return;
    setPhase('loading');
    setErr('');
    setCount(0);
    // 1. show which apps live on this machine (same source the server uploads)
    let localApps: AppSummary[] = [];
    try {
      localApps = (await runtime.listApps?.()) ?? [];
    } catch {
      localApps = [];
    }
    setList(localApps);
    setPhase('uploading');
    // 2. push — guaranteed to resolve within 25s even if the IPC/listApps hangs
    try {
      const r = (await Promise.race([
        runtime.agent.syncApps(),
        new Promise<SyncResult>((_, rej) => setTimeout(() => rej(new Error('__timeout__')), 25000)),
      ])) as SyncResult;
      if (r.ok && r.count > 0) {
        setCount(r.count);
        setPhase('done');
      } else if (r.ok) {
        setPhase('empty');
      } else if (r.reason === 'timeout') {
        setPhase('timeout');
      } else if (r.reason === 'error') {
        setPhase('server');
      } else {
        // reason unknown (older native) → could be not-connected, not-signed-in, network, or 5xx
        setPhase('not-ready');
      }
    } catch (e) {
      if ((e as Error).message === '__timeout__') setPhase('timeout');
      else {
        setErr((e as Error).message);
        setPhase('error');
      }
    }
  }, [runtime]);

  useEffect(() => {
    if (open) void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const busy = phase === 'loading' || phase === 'uploading';
  const percent = phase === 'loading' ? 25 : phase === 'uploading' ? 65 : 100;
  const progressStatus: 'active' | 'success' | 'exception' | 'normal' =
    phase === 'done' ? 'success'
      : phase === 'not-ready' || phase === 'timeout' || phase === 'error' || phase === 'server' ? 'exception'
        : phase === 'empty' ? 'normal'
          : 'active';

  const alert = (() => {
    switch (phase) {
      case 'loading':
        return { type: 'info' as const, msg: 'Đang lấy danh sách app trên máy…' };
      case 'uploading':
        return { type: 'info' as const, msg: `Đang đẩy ${list.length} app lên server…` };
      case 'done':
        return { type: 'success' as const, msg: `Đã đồng bộ ${count} app lên điện thoại.` };
      case 'empty':
        return { type: 'warning' as const, msg: 'Chưa có app nào trên máy để đồng bộ. Hãy tạo hoặc nhập một dự án trước, rồi bấm "Đồng bộ lại".' };
      case 'not-ready':
        return {
          type: 'warning' as const,
          msg: 'Chưa đồng bộ được. Kiểm tra: (1) đã BẬT "Điều khiển từ xa" (thẻ xanh "Đã kết nối") + đăng nhập chưa; (2) mạng có ổn không. Rồi bấm "Đồng bộ lại".',
        };
      case 'server':
        return { type: 'error' as const, msg: 'Máy chủ trả lỗi khi đồng bộ. Thử lại sau ít phút.' };
      case 'timeout':
        return { type: 'error' as const, msg: 'Quá thời gian đồng bộ (mạng chậm hoặc chưa đăng nhập). Kiểm tra kết nối rồi thử lại.' };
      case 'error':
        return { type: 'error' as const, msg: err || 'Đồng bộ thất bại.' };
    }
  })();

  const itemIcon = (phase === 'done')
    ? <CheckCircleFilled style={{ color: '#16B98D', fontSize: 18 }} />
    : busy
      ? <LoadingOutlined style={{ color: '#6C5CE7', fontSize: 16 }} />
      : <MinusCircleOutlined style={{ color: '#C0C4CC', fontSize: 16 }} />;

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={
        <Space>
          <MobileOutlined style={{ color: '#6C5CE7' }} />
          <span>Đồng bộ lên điện thoại</span>
        </Space>
      }
      width={600}
      footer={[
        <Button key="retry" icon={<ReloadOutlined />} onClick={() => void run()} loading={busy}>
          Đồng bộ lại
        </Button>,
        <Button key="close" type="primary" onClick={onClose}>
          Đóng
        </Button>,
      ]}
    >
      <Progress percent={percent} status={progressStatus} showInfo={false} style={{ marginBottom: 12 }} />
      {alert && <Alert type={alert.type} message={alert.msg} showIcon style={{ marginBottom: 12 }} />}
      {acctEmail && (
        // Per-account isolation: apps only appear on the phone if it's signed into the SAME
        // account. Surfacing the email here prevents the "synced N but phone shows 0" confusion.
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message={
            <span>
              Đồng bộ dưới tài khoản <Text strong copyable={{ text: acctEmail }}>{acctEmail}</Text>. Trên điện thoại
              phải đăng nhập <Text strong>đúng tài khoản này</Text> mới thấy các app.
            </span>
          }
        />
      )}

      {list.length > 0 && phase !== 'empty' && (
        <List
          size="small"
          header={
            <Text type="secondary" style={{ fontSize: 12 }}>
              {phase === 'done' ? `${count} app đã lên điện thoại` : `${list.length} app trên máy`}
            </Text>
          }
          style={{ maxHeight: 240, overflowY: 'auto', border: '1px solid #ECEDF3', borderRadius: 8 }}
          dataSource={list}
          renderItem={(a) => (
            <List.Item style={{ padding: '8px 12px' }}>
              <Space style={{ flex: 1, minWidth: 0 }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 300 }}>
                  {a.name || a.id}
                </span>
                <Tag color={running(a) ? 'green' : 'default'} style={{ marginInlineEnd: 0 }}>
                  {a.status || '—'}
                </Tag>
              </Space>
              {itemIcon}
            </List.Item>
          )}
        />
      )}

      {phase === 'empty' && (
        <Empty description="Chưa có app nào trên máy" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      )}

      {phase === 'done' && (
        <div style={{ marginTop: 14, display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* White box so the QR always scans (incl. dark theme); flexShrink:0 so it never co lại. */}
          <div
            style={{
              flexShrink: 0,
              background: '#fff',
              padding: 10,
              borderRadius: 12,
              lineHeight: 0,
              boxShadow: '0 1px 6px rgba(0,0,0,0.12)',
            }}
          >
            <QRCode value={REMOTE_URL} size={168} bordered={false} />
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <Paragraph style={{ margin: 0 }}>
              Trên điện thoại mở <Text strong>toolswave.net/remote/agent</Text> (quét mã bên trái),
              chọn app ở ô <Text strong>"App trên máy"</Text> rồi gửi yêu cầu — máy sẽ sửa đúng app đó.
            </Paragraph>
            <Text copyable={{ text: REMOTE_URL }} type="secondary" style={{ fontSize: 12, marginTop: 8, display: 'inline-block' }}>
              toolswave.net/remote/agent
            </Text>
          </div>
        </div>
      )}
    </Modal>
  );
}
