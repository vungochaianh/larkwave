import { loiTamThoi } from './loi-tam-thoi';

/**
 * Ba câu đã gây sự cố THẬT trên production, mỗi câu một lần, mỗi lần vì mẫu cũ không lường. Bài
 * kiểm này giữ chúng lại để lần thứ tư không phải trả giá bằng một người dùng nữa.
 */
describe('loiTamThoi', () => {
  it('nhận ra lượt chạy bị giết ở phía MAIC — sự cố 23/09/2026', () => {
    // Hai site của một bộ site chết với đúng chữ này, usage 0 token. Bị đóng dấu vĩnh viễn nên
    // không có nút "Tạo lại", và các site phụ thuộc kẹt luôn.
    expect(loiTamThoi('terminated')).toBe(true);
    expect(loiTamThoi('Sinh code thất bại: terminated')).toBe(true);
    expect(loiTamThoi('interrupted')).toBe(true);
    expect(loiTamThoi('aborted')).toBe(true);
  });

  it('nhận ra lỗi mạng thô của Node — sự cố 23/09/2026', () => {
    expect(loiTamThoi('fetch failed')).toBe(true);
    expect(loiTamThoi('socket hang up')).toBe(true);
    expect(loiTamThoi('ECONNRESET')).toBe(true);
  });

  it('nhận ra hết hạn ngạch / quá giờ', () => {
    expect(loiTamThoi('Trợ lý AI đang hết lượt dùng chung (allowed_warning)')).toBe(true);
    expect(loiTamThoi('rate limit')).toBe(true);
    expect(loiTamThoi('429 Too Many Requests')).toBe(true);
    expect(loiTamThoi('quá thời gian')).toBe(true);
  });

  it('nhận ra mã 5xx của cổng MAIC — mẫu cũ `5dd` không bao giờ khớp', () => {
    expect(loiTamThoi('MAIC ask 502: bad gateway')).toBe(true);
    expect(loiTamThoi('MAIC runs 503: upstream unavailable')).toBe(true);
    // Ranh giới từ: một con số có “5xx” NẠM GIỮA không phải mã trạng thái.
    expect(loiTamThoi('cổng 15000 không mở')).toBe(false);
  });

  it('nhận ra lượt chạy bị ngắt vì maic-api khởi động lại — đo 23/09/2026', () => {
    // Câu NÀY mới là câu người dùng thấy sau khi runAgent biết hỏi lại MAIC thay vì ném
    // “terminated”. Nó phải được coi là tạm thời — chạy lại là được, và lỗi không thuộc về họ.
    expect(
      loiTamThoi(
        'MAIC codegen interrupted: Tiến trình maic-api khởi động lại khi lượt chạy chưa xong',
      ),
    ).toBe(true);
  });

  it('KHÔNG nhận nhầm lỗi vượt trần token — chạy lại y hệt thì vượt tiếp', () => {
    // "unterminated" chứa nguyên chữ "terminated" bên trong. Thiếu ranh giới từ là biến một lỗi
    // vĩnh viễn thành một vòng tự chạy lại đốt hạn mức của chính người dùng.
    expect(loiTamThoi('unterminated string in tool JSON')).toBe(false);
    expect(loiTamThoi('vượt trần 32000 token đầu ra')).toBe(false);
  });

  it('KHÔNG nhận người dùng tự huỷ là tạm thời', () => {
    // Tự chạy lại một thứ người ta vừa dừng là làm ngược ý họ.
    expect(loiTamThoi('cancelled by user')).toBe(false);
    expect(loiTamThoi('Người dùng đã huỷ')).toBe(false);
  });

  it('KHÔNG nhận lỗi của chính yêu cầu người dùng', () => {
    expect(loiTamThoi('Khoá API AI không hợp lệ')).toBe(false);
    expect(loiTamThoi('build thất bại: TypeScript error in src/App.tsx')).toBe(false);
  });
});
