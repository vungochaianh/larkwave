import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';

export interface AppTemplate {
  id: string;
  title: string;
  description: string;
  category: string;
  track: 'web' | 'mobile' | 'extension';
  accent: string;
  prompt: string;
}

const TEMPLATES: AppTemplate[] = [
  {
    id: 'task-board',
    title: 'Quản lý công việc (Kanban)',
    description: 'Bảng Kanban kéo-thả với các cột Cần làm / Đang làm / Xong, thêm/sửa/xoá task.',
    category: 'Tasks & Workflows',
    track: 'web',
    accent: '#3FB8A0',
    prompt:
      'Tạo web quản lý công việc dạng Kanban: 3 cột (Cần làm, Đang làm, Hoàn thành), thêm/sửa/xoá thẻ công việc, kéo thả giữa các cột, lưu localStorage, giao diện đẹp hiện đại, responsive.',
  },
  {
    id: 'landing',
    title: 'Landing page sản phẩm',
    description: 'Trang giới thiệu sản phẩm: hero, tính năng, bảng giá, form đăng ký.',
    category: 'Content & Sites',
    track: 'web',
    accent: '#F2A23C',
    prompt:
      'Tạo một landing page hiện đại cho một sản phẩm SaaS: hero với CTA, phần tính năng (3 cột icon), bảng giá 3 gói, lời chứng thực, và form đăng ký nhận tin. Gradient đẹp, responsive.',
  },
  {
    id: 'crm',
    title: 'CRM khách hàng đơn giản',
    description: 'Danh sách khách hàng, thêm/sửa, trạng thái phễu bán hàng, tìm kiếm.',
    category: 'CRM & Sales',
    track: 'web',
    accent: '#6C8CFF',
    prompt:
      'Tạo web CRM đơn giản: danh sách khách hàng (tên, email, công ty, trạng thái: Mới/Đang chăm/Đã chốt), thêm/sửa/xoá, tìm kiếm và lọc theo trạng thái, thống kê nhanh, lưu localStorage, responsive.',
  },
  {
    id: 'invoice',
    title: 'Tạo hoá đơn',
    description: 'Nhập sản phẩm, số lượng, tự tính tổng + thuế, in/xuất hoá đơn.',
    category: 'Finance',
    track: 'web',
    accent: '#3FB8A0',
    prompt:
      'Tạo web tạo hoá đơn: nhập thông tin người bán/người mua, thêm dòng sản phẩm (tên, số lượng, đơn giá), tự tính thành tiền + thuế VAT + tổng cộng, nút in hoá đơn, giao diện sạch sẽ.',
  },
  {
    id: 'booking',
    title: 'Đặt lịch hẹn',
    description: 'Chọn dịch vụ, chọn ngày/giờ trống, xác nhận đặt lịch.',
    category: 'Booking',
    track: 'web',
    accent: '#E5634D',
    prompt:
      'Tạo web đặt lịch hẹn: chọn dịch vụ, chọn ngày trên lịch, chọn khung giờ còn trống, nhập tên/sđt, xác nhận đặt lịch, hiển thị danh sách lịch đã đặt, lưu localStorage, responsive.',
  },
  {
    id: 'quiz',
    title: 'Trắc nghiệm / Quiz',
    description: 'Bộ câu hỏi trắc nghiệm, chấm điểm, hiển thị kết quả.',
    category: 'Education',
    track: 'web',
    accent: '#F2A23C',
    prompt:
      'Tạo web làm bài trắc nghiệm: hiển thị từng câu hỏi nhiều lựa chọn, đếm giờ, chấm điểm cuối bài, hiển thị đáp án đúng/sai và điểm số, làm lại. Giao diện vui mắt, responsive.',
  },
  {
    id: 'portfolio',
    title: 'Portfolio cá nhân',
    description: 'Trang portfolio: giới thiệu, dự án, kỹ năng, liên hệ.',
    category: 'Content & Sites',
    track: 'web',
    accent: '#6C8CFF',
    prompt:
      'Tạo trang portfolio cá nhân đẹp: phần giới thiệu bản thân + ảnh đại diện, lưới dự án (ảnh + mô tả + link), danh sách kỹ năng dạng thanh tiến độ, phần liên hệ. Dark theme sang trọng, responsive.',
  },
  {
    id: 'expense',
    title: 'Quản lý chi tiêu',
    description: 'Ghi thu/chi theo danh mục, biểu đồ, số dư.',
    category: 'Finance',
    track: 'web',
    accent: '#3FB8A0',
    prompt:
      'Tạo web quản lý chi tiêu cá nhân: thêm khoản thu/chi (số tiền, danh mục, ghi chú, ngày), tổng thu/chi/số dư, biểu đồ tròn theo danh mục, danh sách giao dịch, lưu localStorage, responsive.',
  },
  {
    id: 'chrome-ext',
    title: 'Chrome Extension đếm giờ',
    description: 'Tiện ích Pomodoro đếm ngược thời gian tập trung.',
    category: 'Tasks & Workflows',
    track: 'extension',
    accent: '#E5634D',
    prompt:
      'Tạo một Chrome Extension Pomodoro: popup có đồng hồ đếm ngược 25 phút, nút Start/Pause/Reset, chuyển sang nghỉ 5 phút, thông báo khi hết giờ. Manifest V3.',
  },
  {
    id: 'game-2048',
    title: 'Game 2048',
    description: 'Trò chơi xếp số 2048 chơi bằng phím mũi tên, tính điểm, lưu điểm cao.',
    category: 'Trò chơi',
    track: 'web',
    accent: '#EDC22E',
    prompt:
      'Tạo game 2048 chạy trên web: lưới 4x4, điều khiển bằng phím mũi tên (và vuốt trên mobile), gộp ô cùng số, hiệu ứng chuyển động mượt, hiển thị điểm hiện tại + điểm cao (lưu localStorage), nút Chơi lại, giao diện đẹp hiện đại, responsive.',
  },
  {
    id: 'game-memory',
    title: 'Game lật thẻ trí nhớ',
    description: 'Trò chơi lật thẻ tìm cặp giống nhau, đếm số lượt và thời gian.',
    category: 'Trò chơi',
    track: 'web',
    accent: '#7C6CF0',
    prompt:
      'Tạo game lật thẻ trí nhớ (memory match): lưới thẻ úp, lật 2 thẻ tìm cặp trùng, đếm số lượt lật và thời gian, chọn độ khó (4x4 / 6x6), hiệu ứng lật thẻ 3D, thông báo khi thắng, nút chơi lại. Giao diện vui mắt, responsive.',
  },
  {
    id: 'game-snake',
    title: 'Game rắn săn mồi',
    description: 'Rắn săn mồi cổ điển trên canvas, tăng tốc theo điểm, lưu điểm cao.',
    category: 'Trò chơi',
    track: 'web',
    accent: '#16B98D',
    prompt:
      'Tạo game rắn săn mồi (Snake) bằng HTML canvas: điều khiển bằng phím mũi tên/WASD và vuốt trên mobile, ăn mồi để dài ra và tăng điểm, tốc độ tăng dần, kết thúc khi đâm tường/thân, hiển thị điểm + điểm cao (localStorage), nút chơi lại. Giao diện gọn đẹp, responsive.',
  },
  {
    id: 'ext-price-tracker',
    title: 'Extension theo dõi giá',
    description: 'Tiện ích Chrome lưu sản phẩm và nhắc khi giá thay đổi.',
    category: 'Tiện ích mở rộng',
    track: 'extension',
    accent: '#4FB6FF',
    prompt:
      'Tạo Chrome Extension (Manifest V3) theo dõi giá: nút "Lưu trang này" lấy tiêu đề + giá hiện trên trang (content script), lưu danh sách sản phẩm vào chrome.storage, popup hiển thị danh sách đã lưu với giá, nút mở lại trang và xoá. Giao diện popup gọn đẹp.',
  },
  {
    id: 'ext-quick-notes',
    title: 'Extension ghi chú nhanh',
    description: 'Tiện ích Chrome ghi chú nhanh trong popup, lưu tự động.',
    category: 'Tiện ích mở rộng',
    track: 'extension',
    accent: '#F59E0B',
    prompt:
      'Tạo Chrome Extension (Manifest V3) ghi chú nhanh: popup có ô nhập ghi chú tự lưu vào chrome.storage, danh sách ghi chú kèm thời gian, nút ghim/xoá, tìm kiếm nhanh, nút sao chép. Giao diện tối giản, dễ dùng.',
  },
];

@Controller('templates')
export class TemplatesController {
  /** Public catalog of starter templates. */
  @Public()
  @Get()
  list(): AppTemplate[] {
    return TEMPLATES;
  }
}
