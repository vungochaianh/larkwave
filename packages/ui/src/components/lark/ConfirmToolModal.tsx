'use client';
import { useEffect, useState } from 'react';
import { Checkbox, Modal, Radio, Typography } from 'antd';
import { WarningFilled } from '@ant-design/icons';
import { V } from '../../theme';
import { useI18n } from '../../i18n';
import type { RememberScope } from './agentPrefs';

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
 *
 * "Lần sau khỏi hỏi": người dùng có thể đánh dấu tự duyệt công cụ này cho HỘI THOẠI này (hoặc SKILL
 * đang chạy, nếu lượt bắt đầu bằng một /lệnh). `remember` chỉ gửi kèm khi họ bấm Cho phép.
 */
export function ConfirmToolModal({
  pending,
  skillName,
  onDecide,
}: {
  pending: PendingConfirm | null;
  /** Tên skill đang chạy (nếu lượt này do một /lệnh mở ra) — bật lựa chọn nhớ theo skill. */
  skillName?: string | null;
  onDecide: (callId: string, decision: 'allow' | 'deny', remember?: RememberScope | null) => void;
}) {
  const { t } = useI18n();
  const [remember, setRemember] = useState(false);
  const [scope, setScope] = useState<RememberScope>('conversation');

  // Mỗi lần có yêu cầu xác nhận MỚI, bỏ dấu nhớ (tránh vô tình tự duyệt thứ khác).
  useEffect(() => {
    setRemember(false);
    setScope('conversation');
  }, [pending?.callId]);

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
      onOk={() => pending && onDecide(pending.callId, 'allow', remember ? scope : null)}
      onCancel={() => pending && onDecide(pending.callId, 'deny', null)}
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
          <div style={{ marginTop: 12 }}>
            <Checkbox checked={remember} onChange={(e) => setRemember(e.target.checked)}>
              {t('chat.rememberAllow', 'Lần sau tự chạy, đừng hỏi lại công cụ này')}
            </Checkbox>
            {remember && (
              <div style={{ marginTop: 8, marginLeft: 24 }}>
                <Radio.Group value={scope} onChange={(e) => setScope(e.target.value)} size="small">
                  <Radio value="conversation">{t('chat.rememberConv', 'Trong hội thoại này')}</Radio>
                  {skillName && (
                    <Radio value="skill">{t('chat.rememberSkill', 'Cho skill') + ` “${skillName}”`}</Radio>
                  )}
                </Radio.Group>
              </div>
            )}
          </div>
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
