slug: cloud-hay-may-chu-rieng-chon-the-nao-cho-dung-tui-tien
title: Cloud hay máy chủ riêng: chọn thế nào cho đúng túi tiền
excerpt: So sánh cloud và máy chủ riêng theo chi phí thật, gồm cả những khoản không nằm trên báo giá, và cách chọn dựa trên quy mô và khả năng vận hành của bạn.
tags: cloud, máy chủ, chi phí vận hành
topic: Cloud hay máy chủ riêng: chọn thế nào cho đúng túi tiền
---
Câu hỏi này thường được trả lời bằng cảm tính: cloud nghe hiện đại, máy chủ riêng nghe rẻ về lâu dài. Cả hai cảm giác đều đúng một phần và sai một phần, tuỳ vào một thứ ít ai tính: **ai sẽ vận hành nó lúc 2 giờ sáng**.

## Hai thứ này thật ra là gì

**Máy chủ riêng** (dedicated / VPS) là bạn thuê một máy, cài hệ điều hành, cài phần mềm, và mọi thứ chạy trên đó là việc của bạn. Trả tiền theo tháng, cố định, dùng hết hay không dùng cũng trả.

**Cloud** theo nghĩa hiện đại không chỉ là "máy chủ của người khác". Nó là một tập dịch vụ: nơi chạy mã, nơi chứa dữ liệu, mạng phân phối, chứng chỉ bảo mật — mỗi thứ tính tiền riêng theo mức dùng. Bạn không cài hệ điều hành, đổi lại bạn ít quyền can thiệp sâu hơn.

## Chi phí thật gồm những gì

Đây là chỗ mọi so sánh trên mạng đều thiếu. Giá thuê máy chỉ là một dòng trong hoá đơn.

### Khoản nằm trên báo giá

- Tiền thuê máy hoặc tiền dùng dịch vụ
- Băng thông vượt mức
- Sao lưu, nếu tính riêng

### Khoản không nằm trên báo giá

- **Thời gian cài đặt ban đầu.** Dựng một máy chủ chạy được cho production — tường lửa, chứng chỉ, tự khởi động lại, giám sát — mất vài ngày nếu bạn biết việc, vài tuần nếu chưa.
- **Vá bảo mật.** Hệ điều hành và thư viện ra bản vá liên tục. Không vá thì đến lúc bị lợi dụng; vá thì phải có người làm và phải thử lại sau mỗi lần vá.
- **Trực sự cố.** Máy chủ sập lúc nào không báo trước. Với máy chủ riêng, người trực là bạn.
- **Chi phí học.** Khoản này trả một lần nhưng rất lớn, và không ai ghi nó vào bảng so sánh.

Quy tắc thực tế: **nhân giá thuê máy với ba** để ra chi phí gần thật cho năm đầu, nếu bạn không có sẵn người vận hành.

## Chọn theo tình huống

### Nên dùng cloud khi

- Bạn **không có người chuyên trách hệ thống**. Đây là lý do quan trọng nhất và thường là lý do duy nhất cần thiết.
- Lưu lượng **lên xuống thất thường** — mùa cao điểm, đợt chạy quảng cáo. Trả theo mức dùng thì không phải nuôi công suất thừa quanh năm.
- Bạn cần **có mặt ở nhiều nơi**. Khách ở xa máy chủ thì khoảng cách vật lý là thứ không tối ưu nào bù được, và mạng phân phối giải quyết đúng chuyện đó.

### Nên dùng máy chủ riêng khi

- Tải **đều và dự đoán được**, chạy 24/7 ở mức ổn định. Lúc đó trả cố định rẻ hơn trả theo mức dùng.
- Bạn cần **kiểm soát sâu**: phần mềm đặc thù, cấu hình mạng riêng, hoặc ràng buộc pháp lý về nơi đặt dữ liệu.
- Bạn **đã có người vận hành**. Có sẵn người thì phần đắt nhất đã trả rồi.

### Cái bẫy phổ biến nhất

Thuê một máy chủ mạnh cho một website có vài trăm lượt truy cập mỗi ngày, rồi để nó chạy không suốt năm. Máy to không làm trang nhanh hơn nếu điểm nghẽn nằm ở ảnh chưa nén và truy vấn thiếu chỉ mục.

Hãy đo trước khi mua: trang đang chậm ở đâu, bao nhiêu người truy cập cùng lúc thật sự.

## Nếu bạn không muốn chọn

Với phần lớn dự án vừa và nhỏ, câu hỏi hay hơn là: *tôi có thể không phải quyết định chuyện này không?*

Khi dựng ứng dụng trên [Toolswave](/create-website), bạn mô tả ý tưởng bằng tiếng Việt và hệ thống sinh mã, dựng cơ sở dữ liệu cùng API thật, rồi **deploy thẳng lên hạ tầng Cloudflare**. Phần hạ tầng — nơi chạy, chứng chỉ HTTPS, phân phối toàn cầu — đã có sẵn, nên bạn không phải chọn máy chủ, không phải vá hệ điều hành, và không phải trực lúc nửa đêm. Có gói miễn phí không cần thẻ tín dụng, và gắn được tên miền riêng.

Cần nói cho sòng phẳng: cách này không hợp mọi trường hợp. Nếu bạn buộc phải đặt dữ liệu trong nước theo yêu cầu pháp lý, hoặc cần cài phần mềm chuyên dụng ở tầng hệ điều hành, thì máy chủ riêng vẫn là đáp án. Và lưu ý thêm: web app cùng game HTML5 chạy trong trình duyệt nên deploy thẳng được, còn app mobile, app desktop hay tiện ích trình duyệt thì sản phẩm cuối là **mã nguồn** bạn đóng gói trên máy mình — không có chuyện hạ tầng nào lo hộ phần đó.

## Bốn câu hỏi để tự quyết

1. Bạn có người biết cài tường lửa và đọc log hệ thống không? Không → cloud.
2. Lưu lượng có tăng giảm mạnh theo mùa không? Có → cloud.
3. Có ràng buộc pháp lý về nơi đặt dữ liệu không? Có → máy chủ riêng.
4. Chi phí một giờ website sập là bao nhiêu? Lớn → trả tiền cho thứ có người trực sẵn.

## Tóm lại

Đừng so sánh giá thuê máy. Hãy so sánh **tổng chi phí sở hữu**, trong đó khoản đắt nhất thường là thời gian con người, không phải phần cứng.

Nếu bạn phải tự hỏi "mình chọn cái nào", câu trả lời gần như luôn là cloud — vì chính câu hỏi đó cho thấy bạn chưa có người chuyên trách để vận hành một máy chủ riêng cho ra hồn.
