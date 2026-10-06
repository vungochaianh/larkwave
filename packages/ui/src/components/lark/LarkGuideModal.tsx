'use client';
import { Modal, Typography } from 'antd';
import { V } from '../../theme';
import { useI18n } from '../../i18n';

const { Title, Text, Paragraph } = Typography;

/**
 * "Hướng dẫn sử dụng" (HDSD) for Lark × Agents — a plain-language tour of what the
 * assistant can actually do, grouped by area. Opened from the button next to "Cài đặt".
 * Pure content (no runtime calls) so it works connected or not.
 */
export function LarkGuideModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const SECTIONS: { icon: string; title: string; items: string[] }[] = [
    {
      icon: '🗂️',
      title: t('chat.guideSec1Title', 'Dữ liệu Base (Bitable)'),
      items: [
        t('chat.guideSec1Item1', 'Hỏi đáp dữ liệu: "bảng X có bao nhiêu bản ghi?", "liệt kê các cột", "tìm khách hàng ở Hà Nội", "doanh thu tháng này"…'),
        t('chat.guideSec1Item2', 'Tạo/sửa cấu trúc: tạo bảng mới, thêm/sửa/xoá cột, tạo view Kanban làm pipeline/giai đoạn.'),
        t('chat.guideSec1Item3', 'Nhập & chỉnh dữ liệu: thêm bản ghi, cập nhật/xoá hàng loạt, nhập dữ liệu mẫu để minh hoạ.'),
        t('chat.guideSec1Item4', 'Phân quyền: xem các vai trò + quyền theo bảng/bản ghi/cột, xem thành viên, tạo/sửa/xoá vai trò, thêm/gỡ thành viên.'),
        t('chat.guideSec1Item5', 'Đánh giá & thiết kế: chấm điểm thiết kế base, đề xuất rồi (sau khi bạn duyệt) tạo các bảng/cột còn thiếu.'),
      ],
    },
    {
      icon: '💬',
      title: t('chat.guideSec2Title', 'Ngoài Base'),
      items: [
        t('chat.guideSec2Item1', 'Tin nhắn: gửi tin cho người/nhóm, đọc lại hội thoại nhóm, tra open_id từ email/điện thoại.'),
        t('chat.guideSec2Item2', 'Tài liệu & kho: đọc Docx, Wiki; đọc/ghi Bảng tính (Sheets); liệt kê file trên Drive.'),
        t('chat.guideSec2Item3', 'Lịch & danh bạ: xem/tạo sự kiện lịch, tra cứu người trong danh bạ.'),
      ],
    },
    {
      icon: '⚙️',
      title: t('chat.guideSec3Title', 'Tự động hoá & mở rộng'),
      items: [
        t('chat.guideSec3Item1', 'Tự động hoá (Larkwave): khi bản ghi khớp điều kiện → tự gửi tin nhắn / cập nhật bản ghi / gọi webhook (tab "Tự động hoá" trong Cài đặt).'),
        t('chat.guideSec3Item2', 'Bot Lark: nhận và trả lời tin nhắn ngay trong Lark (cần cấu hình webhook + tunnel).'),
        t('chat.guideSec3Item3', 'Plugin: bổ sung công cụ/biểu mẫu qua manifest (tab Plugin).'),
      ],
    },
    {
      icon: '🧰',
      title: t('chat.guideSec4Title', 'Tiện ích trong khung chat'),
      items: [
        t('chat.guideSec4Item1', '⚡ Hỏi nhanh: các nút bấm-một-cái; bấm ℹ️ để xem mỗi nút làm gì; "＋ Thêm" để tự tạo câu hỏi hay dùng.'),
        t('chat.guideSec4Item2', '📝 Tóm tắt hội thoại: tóm tắt nhanh những gì đã trao đổi.'),
        t('chat.guideSec4Item3', '🚀 Dựng app từ phân tích: lấy cấu trúc + dữ liệu Base để dựng một app full-stack.'),
        t('chat.guideSec4Item4', '🔗 Chia sẻ hội thoại ra một link web công khai.'),
        t('chat.guideSec4Item5', 'Chọn AI: Claude / Grok / Gemini / Codex — chạy qua CLI trên máy hoặc "API trực tiếp" (dán API key, không cần cài CLI).'),
      ],
    },
    {
      icon: '💡',
      title: t('chat.guideSec5Title', 'Mẹo dùng hiệu quả'),
      items: [
        t('chat.guideSec5Item1', 'Hai chế độ: "Hỏi đáp" (chỉ đọc) và "Thực thi" (được ghi — xác nhận từng thao tác, hoặc bật "Tự động duyệt").'),
        t('chat.guideSec5Item2', 'Gắn Base cho hội thoại (thanh "Base áp dụng") để khỏi phải dán lại app_token mỗi lần.'),
        t('chat.guideSec5Item3', 'Đăng nhập tài khoản Lark (QR) rồi bấm "Tự động nạp Base" để quét toàn bộ Base (kể cả trong Wiki).'),
        t('chat.guideSec5Item4', 'Khi cần một việc app chưa làm được: bấm nút Góp ý (🐛 góc dưới phải) → "Yêu cầu tính năng".'),
      ],
    },
  ];
  return (
    <Modal
      open={open}
      onCancel={onClose}
      onOk={onClose}
      okText={t('chat.gotIt', 'Đã hiểu')}
      cancelButtonProps={{ style: { display: 'none' } }}
      width={620}
      title={t('chat.guideTitle', 'Hướng dẫn sử dụng Lark × Agents')}
      styles={{ body: { maxHeight: '72vh', overflowY: 'auto' } }}
    >
      <Paragraph type="secondary" style={{ fontSize: 13 }}>
        {t('chat.guideIntro1', 'Trợ lý giúp bạn ')}<Text strong>{t('chat.guideIntroStrong', 'hỏi đáp và tuỳ chỉnh')}</Text>
        {t('chat.guideIntro2', ' dữ liệu Lark bằng AI ngay trên máy. Cứ mô tả việc cần làm bằng lời — trợ lý sẽ gọi đúng công cụ rồi tóm tắt kết quả. Dưới đây là những việc làm được:')}
      </Paragraph>
      {SECTIONS.map((s) => (
        <div key={s.title} style={{ marginTop: 14 }}>
          <Title level={5} style={{ margin: '0 0 6px' }}>
            {s.icon} {s.title}
          </Title>
          <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 5 }}>
            {s.items.map((it, i) => (
              <li key={i} style={{ fontSize: 13, lineHeight: 1.5, color: V.textSub }}>
                {it}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </Modal>
  );
}
