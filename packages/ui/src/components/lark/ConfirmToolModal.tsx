'use client';
import { Modal, Typography } from 'antd';
import { WarningFilled } from '@ant-design/icons';
import { V } from '../../theme';
import { useI18n } from '../../i18n';

const { Text, Paragraph } = Typography;

export interface PendingConfirm {
  callId: string;
  name: string;
  input: unknown;
}

/**
 * Blocks the agent loop until the user approves a destructive Lark write
 * (create/update/delete record, send message). The agent in the main process is
 * literally paused awaiting `larkConfirmTool(callId, …)`.
 */
export function ConfirmToolModal({
  pending,
  onDecide,
}: {
  pending: PendingConfirm | null;
  onDecide: (callId: string, decision: 'allow' | 'deny') => void;
}) {
  const { t } = useI18n();
  return (
    <Modal
      open={!!pending}
      title={
        <span>
          <WarningFilled style={{ color: '#F59E0B', marginRight: 8 }} />
          {t('chat.confirmWriteTitle', 'Xác nhận thao tác ghi lên Lark')}
        </span>
      }
      okText={t('chat.allow', 'Cho phép')}
      cancelText={t('chat.deny', 'Từ chối')}
      okButtonProps={{ danger: true }}
      onOk={() => pending && onDecide(pending.callId, 'allow')}
      onCancel={() => pending && onDecide(pending.callId, 'deny')}
      maskClosable={false}
      keyboard={false}
    >
      {pending && (
        <>
          <Paragraph style={{ marginBottom: 8 }}>
            {t('chat.claudeWantsToRun', 'Claude muốn chạy:')} <Text code>{pending.name}</Text>
          </Paragraph>
          <pre
            style={{
              margin: 0,
              padding: '8px 10px',
              background: V.surfaceAlt,
              border: `1px solid ${V.border}`,
              borderRadius: 8,
              maxHeight: 240,
              overflow: 'auto',
              fontSize: 12,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {safeJson(pending.input)}
          </pre>
        </>
      )}
    </Modal>
  );
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}
