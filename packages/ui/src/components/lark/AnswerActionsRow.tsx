'use client';
import { Button, Space, Tooltip } from 'antd';
import { ThunderboltOutlined } from '@ant-design/icons';
import { BRAND, V } from '../../theme';
import type { LarkChatMode } from '@larkwave/core';
import { extractChoices, needsExecuteMode } from './answerActions';

/**
 * Hàng nút ngay dưới câu trả lời của trợ lý.
 *
 * Hai việc người dùng đang phải làm bằng tay, và cả hai đều là việc máy biết trước:
 *   • Trợ lý hỏi "(a) … hay (b) …?" — người dùng phải gõ lại lựa chọn. Nay bấm một nút là gửi.
 *   • Trợ lý nói "tôi đang ở chế độ Hỏi đáp (chỉ đọc), bạn bật chế độ Thực thi" — người dùng phải
 *     đi tìm cái công tắc nằm tận dưới khung soạn, ở một chỗ chẳng liên quan gì tới câu vừa đọc.
 *     Nay nút chuyển nằm ngay cạnh câu nói ra vấn đề.
 *
 * Luật nền của phần nhận diện (xem answerActions.ts): THÀ BỎ SÓT CÒN HƠN BẮT NHẦM — một nút hiện
 * sai chỗ sẽ gửi đi câu người dùng không hề định gửi.
 */
export function AnswerActionsRow({
  text,
  show,
  mode,
  tr,
  onPick,
  onSwitchExecute,
}: {
  text: string;
  show: boolean;
  mode: LarkChatMode;
  tr: (key: string, fallback: string) => string;
  onPick: (text: string) => void;
  onSwitchExecute: () => void;
}) {
  if (!show) return null;
  const choices = extractChoices(text);
  // Đang ở Thực thi rồi mà vẫn mời bật Thực thi thì vô nghĩa — nên hỏi cả chế độ HIỆN TẠI.
  const wantExecute = mode === 'ask' && needsExecuteMode(text);
  if (!choices.length && !wantExecute) return null;

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${V.borderSub}` }}>
      <Space size={[8, 8]} wrap>
        {wantExecute && (
          <Tooltip
            title={tr(
              'chat.switchExecuteTip',
              'Chuyển sang chế độ Thực thi để trợ lý được ghi dữ liệu. Mỗi thao tác ghi vẫn hỏi xác nhận, trừ khi bạn đã bật chạy tự động.',
            )}
          >
            <Button type="primary" size="small" icon={<ThunderboltOutlined />} onClick={onSwitchExecute}>
              {tr('chat.switchExecute', 'Chuyển sang Thực thi')}
            </Button>
          </Tooltip>
        )}
        {choices.map((c) => (
          <Tooltip key={c.key} title={c.text}>
            <Button
              size="small"
              onClick={() => onPick(c.text)}
              style={{ maxWidth: 340, borderColor: BRAND, color: BRAND }}
            >
              {/* Nhãn cắt ngắn cho vừa hàng; nội dung đầy đủ nằm ở tooltip và ở câu gửi đi. */}
              <span style={{ display: 'inline-block', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'bottom' }}>
                {c.key}) {c.text}
              </span>
            </Button>
          </Tooltip>
        ))}
      </Space>
    </div>
  );
}
