'use client';
import { useEffect, useState } from 'react';
import { Modal, Typography, Input, Button } from 'antd';
import { QuestionCircleFilled } from '@ant-design/icons';
import { useI18n } from '../../i18n';

const { Paragraph } = Typography;

export interface PendingAsk {
  callId: string;
  question: string;
  choices?: string[];
}

/**
 * Claude is asking the user for help/clarification (which Base, a missing id, a decision, a
 * Lark permission/config it can't fix itself). The agent loop in the main process is PAUSED
 * awaiting `larkAnswerAsk(callId, answer)` — same blocking pattern as the gated-write
 * confirm. The user picks a suggested choice or types an answer; "Bỏ qua" sends a skip so
 * the agent never hangs.
 */
export function AskUserModal({
  pending,
  onAnswer,
}: {
  pending: PendingAsk | null;
  onAnswer: (callId: string, answer: string) => void;
}) {
  const { t } = useI18n();
  const [text, setText] = useState('');

  // Reset the input each time a new question appears.
  useEffect(() => {
    setText('');
  }, [pending?.callId]);

  return (
    <Modal
      open={!!pending}
      title={
        <span>
          <QuestionCircleFilled style={{ color: '#7A5AF8', marginRight: 8 }} />
          {t('chat.askTitle', 'Claude cần bạn hỗ trợ')}
        </span>
      }
      footer={null}
      // Mặc định 520px quá hẹp: câu hỏi ở đây thường có nhiều đoạn và danh sách đánh số.
      width={600}
      maskClosable={false}
      keyboard={false}
      closable={false}
    >
      {pending && (
        /*
         * ĐƯỜNG THOÁT PHẢI LUÔN THẤY ĐƯỢC.
         *
         * Hộp này cố ý không đóng được: `closable`, `maskClosable`, `keyboard` đều tắt, vì vòng lặp
         * agent ở tiến trình chính đang DỪNG chờ `larkAnswerAsk`. Lối ra duy nhất là các nút bên
         * trong. Mà câu hỏi VÀ danh sách lựa chọn đều do mô hình sinh ra, dài bao nhiêu cũng được —
         * đo thử thì ~30 dòng là hộp đã cao hơn màn hình 900px, và lúc đó cả "Gửi" lẫn "Bỏ qua" đều
         * nằm ngoài tầm với. Không còn gì bấm được: lượt chạy treo vĩnh viễn.
         *
         * Cách sửa KHÔNG phải là đặt trần `vh` cho từng khối — làm vậy là tự đoán một con số rồi hở
         * ở màn hình nhỏ hơn (antd còn đẩy hộp xuống 100px từ đỉnh nữa). Ở đây chia hai tầng: phần
         * do mô hình sinh ra thì CUỘN, phần người dùng cần bấm thì NẰM NGOÀI vùng cuộn. Đúng sai
         * không phụ thuộc vào kích thước màn hình nữa.
         */
        <div style={{ display: 'flex', flexDirection: 'column', maxHeight: '68vh' }}>
          <div style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto' }}>
            <Paragraph
              style={{
                marginBottom: 12,
                whiteSpace: 'pre-wrap',
                overflowWrap: 'anywhere',
              }}
            >
              {pending.question}
            </Paragraph>

            {pending.choices && pending.choices.length > 0 && (
              /*
               * Nhãn lựa chọn do MÔ HÌNH sinh ra nên dài bao nhiêu cũng có thể — thực tế đã thấy nhãn
               * dài gấp đôi bề ngang hộp thoại.
               *
               * `Button` của antd mặc định `white-space: nowrap` và cao cố định, nên một nhãn dài đẩy
               * nút rộng hơn cả hộp thoại và TRÀN RA NGOÀI. `Space wrap` không cứu được: nó chỉ xuống
               * dòng GIỮA các nút, còn một nút tự nó đã quá khổ thì vẫn tràn. Bỏ luôn `Space` để không
               * phải chen `maxWidth` qua lớp bọc `ant-space-item` mà nó tự sinh ra.
               */
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 8,
                  marginBottom: 12,
                }}
              >
                {pending.choices.map((c, i) => (
                  <Button
                    key={i}
                    onClick={() => onAnswer(pending.callId, c)}
                    style={{
                      whiteSpace: 'normal',
                      height: 'auto',
                      minHeight: 32,
                      maxWidth: '100%',
                      textAlign: 'left',
                      padding: '6px 12px',
                      lineHeight: 1.45,
                      // Một chuỗi dài không dấu cách (URL, id bảng) vẫn phải cắt được, nếu không nó
                      // lại đẩy rộng đúng như cũ.
                      overflowWrap: 'anywhere',
                    }}
                  >
                    {c}
                  </Button>
                ))}
            </div>
            )}

          </div>

          {/* Ngoài vùng cuộn — luôn bấm tới được. */}
          <div style={{ flex: '0 0 auto' }}>
          <Input.TextArea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('chat.askPlaceholder', 'Nhập câu trả lời cho Claude…')}
            autoSize={{ minRows: 2, maxRows: 6 }}
            onPressEnter={(e) => {
              if (!e.shiftKey && text.trim()) {
                e.preventDefault();
                onAnswer(pending.callId, text.trim());
              }
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
            <Button type="text" onClick={() => onAnswer(pending.callId, '[người dùng bỏ qua]')}>
              {t('chat.skip', 'Bỏ qua')}
            </Button>
            <Button type="primary" disabled={!text.trim()} onClick={() => onAnswer(pending.callId, text.trim())}>
              {t('chat.sendToClaude', 'Gửi cho Claude')}
            </Button>
          </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
