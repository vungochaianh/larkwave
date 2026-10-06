/**
 * Tên thư mục an toàn từ tên dự án. MỘT bản duy nhất.
 *
 * Trước đây có hai bản chép tay: localAdapter cắt 30 ký tự rồi bỏ gạch ngang thừa, promptCompose
 * cắt 40 và KHÔNG bỏ gạch ngang. Với dự án nhiều service, prompt gửi cho AI nói thư mục tên
 * `<40-ky-tu>` trong khi trên đĩa là `<30-ky-tu>` — AI ghi file vào thư mục không tồn tại và bản
 * dựng hỏng. Hai file cùng nằm trong runtime/ nên không có lý do gì để nhân bản.
 */
export function slugName(name?: string): string {
  const s = (name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30)
    .replace(/-+$/g, ''); // không kết thúc bằng gạch ngang lơ lửng sau khi cắt độ dài
  return s || 'du-an';
}
