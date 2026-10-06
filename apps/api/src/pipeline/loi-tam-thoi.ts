/**
 * Lỗi này có TẠM THỜI không — tức chạy lại y hệt thì có cơ hội chạy được?
 *
 * Vì sao nó là một hàm có tên, có bài kiểm, thay vì một biểu thức nằm giữa thân hàm: câu trả lời
 * của nó quyết định hai thứ người dùng nhìn thấy ngay — giao diện có mời bấm "Tạo lại" không, và
 * hệ có tự chạy lại một lượt không. Trả lời sai theo hướng "vĩnh viễn" là người dùng nhìn một
 * build chết vì hạ tầng mà tưởng yêu cầu của mình hỏng, rồi sửa đi sửa lại một thứ vốn không sai.
 *
 * Nó đã trả lời sai BA LẦN, mỗi lần vì một câu chữ mới mà mẫu cũ không lường:
 *
 *   1. "Trợ lý AI đang hết lượt dùng chung (allowed_warning)…" — MAIC hết hạn ngạch. Câu đó không
 *      chứa "hạn ngạch", "rate", "429" hay mã 5xx nào. Sửa bằng cách tin KIỂU lỗi
 *      (ServiceUnavailableException) thay vì đoán lại bằng chữ.
 *   2. "fetch failed" — lỗi mạng thô của Node, không khớp mẫu nào.
 *   3. "terminated" — đo ngày 23/09/2026: hai site của một bộ site chết sau ~9 phút, usage ghi 0
 *      token dù nhật ký cho thấy đã viết hàng chục tệp. Không mời "Tạo lại", không tự chạy
 *      lại, và hai site còn lại của bộ thì bị `releaseSuite` đánh hỏng kèm "Hãy chạy lại site
 *      đó trước, rồi dựng lại các site này" — kẹt trong vòng đó.
 *
 *      Bản đầu của chú thích này ghi "MAIC giết lượt chạy ở phía nó" — SAI, và đáng ghi lại vì
 *      nó là một phỏng đoán được viết như một sự thật. Hỏi thật GET /v1/runs/:id thì MAIC trả
 *      `succeeded` cho chính những lượt đó, kèm 51404 và 44801 token đầu ra. "terminated" là
 *      message của undici khi thân phản hồi bị cắt — lỗi Ở PHÍA CHÚNG TA đọc, không phải trạng
 *      thái của lượt chạy. Chỗ sửa thật nại ở `MaicService.doiKetCucCuaRun`; dòng ở đây chỉ là
 *      lưới đỡ cuối, cho những đường còn lọt ra chuỗi đó.
 *
 * Ba lần đều cùng một hình dạng: mẫu chỉ biết những chữ đã gặp. Nên chỗ này được kiểm bằng CHÍNH
 * ba câu đã xảy ra thật, và mỗi lần gặp câu mới thì thêm một dòng kiểm chứ không sửa thầm.
 */
export function loiTamThoi(why: string): boolean {
  return (
    // Hạn mức / quá giờ — chờ rồi chạy lại là được.
    //
    // `\b5\d\d\b` chứ không phải `5dd`: bản trước viết `5dd` — một mẫu CHẾT, chỉ khớp đúng ba
    // ký tự “5dd” và không bao giờ khớp một mã 5xx nào. Đó là lần thứ hai một dấu `\` bị ăn mất
    // trong tệp này mà trình biên dịch không hề báo gì: biểu thức vẫn đúng cú pháp, chỉ là vô nghĩa.
    /hạn ngạch|hết lượt|rate|timeout|quá thời gian|429|\b5\d\d\b/i.test(why) ||
    // Mạng đứt giữa chừng.
    /fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|network|other side closed/i.test(
      why,
    ) ||
    // Lượt chạy bị GIẾT ở phía nhà cung cấp. Ranh giới từ là bắt buộc: "unterminated JSON" là lỗi
    // cắt giữa chừng do vượt trần token — chạy lại y hệt thì vượt tiếp, nên nó KHÔNG tạm thời.
    //
    // KHÔNG có `cancelled` ở đây: nó có thể là người dùng tự huỷ, mà tự chạy lại một thứ người ta
    // vừa dừng là làm ngược ý họ.
    /\bterminated\b|\binterrupted\b|\baborted\b/i.test(why)
  );
}
