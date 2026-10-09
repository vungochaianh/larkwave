'use client';
import { useEffect, useState } from 'react';
import { Alert, Checkbox, Modal, Radio, Typography } from 'antd';
import { WarningFilled } from '@ant-design/icons';
import { describeWorkflowSteps, type WorkflowDesignLine } from '@larkwave/core';
import { V, WARN } from '../../theme';
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

  const wf = pending && WORKFLOW_TOOLS.has(pending.name) ? workflowView(pending.input) : null;

  return (
    <Modal
      open={!!pending}
      width={wf ? 640 : undefined}
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
          {wf ? (
            <WorkflowDesign view={wf} raw={safeJson(pending.input)} />
          ) : (
            <pre style={preStyle}>{safeJson(pending.input)}</pre>
          )}
          {/* Thiết kế workflow nào cũng phải được duyệt tận mắt — không cho "lần sau khỏi hỏi". */}
          {!wf && <div style={{ marginTop: 12 }}>
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
          </div>}
        </>
      )}
    </Modal>
  );
}

const preStyle: React.CSSProperties = {
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
};

/** Tool tạo/sửa workflow Lark (Open API v3) — hộp xác nhận vẽ THIẾT KẾ thay vì JSON. */
const WORKFLOW_TOOLS = new Set(['bitable_workflow_create', 'bitable_workflow_update']);

interface WorkflowView {
  update: boolean;
  title: string;
  workflowId?: string;
  lines: WorkflowDesignLine[];
  stepCount: number;
}

function workflowView(input: unknown): WorkflowView | null {
  const i = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  let steps: unknown = i.steps;
  if (typeof steps === 'string') {
    try {
      steps = JSON.parse(steps);
    } catch {
      return null;
    }
  }
  if (steps && typeof steps === 'object' && !Array.isArray(steps) && Array.isArray((steps as { steps?: unknown }).steps))
    steps = (steps as { steps: unknown[] }).steps;
  if (!Array.isArray(steps)) return null;
  return {
    update: i.workflow_id !== undefined,
    title: typeof i.title === 'string' ? i.title : '',
    workflowId: typeof i.workflow_id === 'string' ? i.workflow_id : undefined,
    lines: describeWorkflowSteps(steps),
    stepCount: steps.length,
  };
}

const KIND_ICON: Record<WorkflowDesignLine['kind'], string> = {
  trigger: '⚡',
  action: '▸',
  branch: '◆',
  loop: '↻',
  edge: '',
  note: '',
};

function WorkflowDesign({ view, raw }: { view: WorkflowView; raw: string }) {
  const { t } = useI18n();
  const [showRaw, setShowRaw] = useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div>
        <Text strong style={{ fontSize: 15 }}>{view.title || t('chat.wfUntitled', '(chưa đặt tên)')}</Text>
        <Text style={{ color: V.textSub, fontSize: 12, marginLeft: 8 }}>
          {view.stepCount} {t('chat.wfSteps', 'bước')}
          {view.update && view.workflowId ? ` · ${view.workflowId}` : ''}
        </Text>
      </div>
      <Alert
        type={view.update ? 'warning' : 'info'}
        showIcon
        style={{ padding: '6px 10px' }}
        message={
          view.update
            ? t('chat.wfUpdateNote', 'Thay TOÀN BỘ các bước của workflow này bằng thiết kế dưới đây. Trạng thái bật/tắt giữ nguyên (TẮT).')
            : t('chat.wfCreateNote', 'Workflow được tạo ở trạng thái TẮT. Bạn mở Lark kiểm tra rồi tự bật.')
        }
      />
      <div
        style={{
          padding: '8px 10px',
          background: V.surfaceAlt,
          border: `1px solid ${V.border}`,
          borderRadius: 8,
          maxHeight: 300,
          overflow: 'auto',
          fontSize: 13,
          lineHeight: 1.55,
        }}
      >
        {view.lines.map((l, k) => (
          <div
            key={k}
            style={{
              paddingLeft: l.depth * 16,
              color: l.kind === 'edge' ? V.textSub : l.kind === 'note' ? WARN : V.text,
              fontWeight: l.kind === 'trigger' ? 600 : l.kind === 'edge' ? 500 : 400,
              fontSize: l.kind === 'edge' ? 12 : 13,
              wordBreak: 'break-word',
            }}
          >
            {KIND_ICON[l.kind] ? <span style={{ marginRight: 6 }}>{KIND_ICON[l.kind]}</span> : null}
            {l.text}
          </div>
        ))}
      </div>
      <div>
        <a onClick={() => setShowRaw((v) => !v)} style={{ fontSize: 12 }}>
          {showRaw ? t('chat.wfHideJson', 'Ẩn JSON gốc') : t('chat.wfShowJson', 'Xem JSON gốc')}
        </a>
        {showRaw && <pre style={{ ...preStyle, marginTop: 6 }}>{raw}</pre>}
      </div>
    </div>
  );
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}
