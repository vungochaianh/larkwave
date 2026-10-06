slug: bao-mat-phan-mem-cho-nguoi-khong-chuyen-bay-dieu-toi-thieu
title: Bảo mật phần mềm cho người không chuyên: bảy điều tối thiểu
excerpt: Bảy việc bảo mật cơ bản mà chủ doanh nghiệp nhỏ tự kiểm được, không cần biết kỹ thuật sâu — và lý do vì sao phần lớn sự cố đến từ những chỗ rất đơn giản.
tags: bảo mật, an toàn dữ liệu, khái niệm cơ bản
topic: Bảo mật phần mềm cho người không chuyên: bảy điều tối thiểu
---
Phần lớn sự cố dữ liệu ở doanh nghiệp nhỏ không đến từ kỹ thuật tấn công tinh vi. Nó đến từ một mật khẩu dùng chung cho cả công ty, một trang quản trị không yêu cầu đăng nhập, hoặc một nhân viên nghỉ việc mà tài khoản vẫn còn nguyên quyền.

Bảy điều dưới đây không cần bạn biết lập trình. Chúng là những câu hỏi bạn tự kiểm được, hoặc hỏi người làm phần mềm cho bạn.

## 1. Mỗi người một tài khoản

Dùng chung một tài khoản quản trị là sai lầm phổ biến nhất, vì nó phá huỷ mọi khả năng truy vết. Khi có chuyện — đơn hàng bị sửa, dữ liệu biến mất — bạn không biết ai làm.

Việc cần làm: mỗi nhân viên một tài khoản riêng, và **xoá quyền ngay hôm cuối cùng họ làm việc**, không phải "để hôm nào rảnh".

## 2. Phân quyền theo việc, không theo lòng tin

Nhân viên bán hàng cần xem đơn, không cần xoá đơn. Kế toán cần xem doanh thu, không cần sửa giá sản phẩm.

Nguyên tắc là **quyền tối thiểu đủ làm việc**. Đây không phải chuyện nghi ngờ ai — nó là chuyện giới hạn thiệt hại khi một tài khoản bị chiếm, và giảm khả năng bấm nhầm.

## 3. Bật xác thực hai lớp cho những chỗ quan trọng

Email, tài khoản quản trị tên miền, tài khoản ngân hàng, và trang quản trị phần mềm. Mật khẩu có thể bị lộ mà bạn không hề biết; lớp thứ hai chặn được gần hết các trường hợp đó.

Chỗ quan trọng nhất và hay bị quên: **email**. Ai chiếm được email của bạn thì đặt lại được mật khẩu của mọi thứ khác.

## 4. Trang quản trị phải có cửa

Nghe hiển nhiên, nhưng vẫn xảy ra: một trang quản trị chỉ "khó đoán địa chỉ" chứ không thật sự yêu cầu đăng nhập. Địa chỉ khó đoán không phải là bảo mật — nó rò ra qua lịch sử trình duyệt, qua link chia sẻ, qua log.

Tự kiểm: mở trang quản trị bằng cửa sổ ẩn danh. Nếu vào được mà không phải đăng nhập, đó là lỗ hổng.

## 5. Dữ liệu khách hàng: chỉ thu thứ bạn dùng

Mỗi trường dữ liệu bạn lưu là một thứ bạn phải bảo vệ. Hỏi ngày sinh khách hàng để làm gì nếu không bao giờ dùng tới?

Và với thứ buộc phải lưu — số điện thoại, địa chỉ — hãy **che bớt khi hiển thị** ở những màn hình không cần đầy đủ. Trang tra cứu đơn cho khách chỉ cần hiện `09****789` là đủ.

## 6. Mật khẩu không bao giờ được lưu dạng chữ thường

Đây là câu hỏi bạn nên hỏi người làm phần mềm: *mật khẩu người dùng lưu thế nào?* Câu trả lời đúng là "băm bằng thuật toán chuyên dụng". Câu trả lời sai là bất cứ thứ gì cho phép đọc lại được mật khẩu gốc.

Dấu hiệu nhận biết dễ nhất: nếu hệ thống có thể **gửi lại cho bạn mật khẩu cũ** qua email, nghĩa là nó đang lưu ở dạng đọc được. Hệ thống làm đúng chỉ cho bạn **đặt mật khẩu mới**.

## 7. Cập nhật và sao lưu là một phần của bảo mật

Phần lớn vụ xâm nhập tự động khai thác lỗ hổng đã có bản vá từ lâu. Không cập nhật là để cửa mở.

Và sao lưu là tấm lưới cuối cùng: khi mọi thứ khác hỏng, bản sao lưu là thứ đưa bạn trở lại. Nhớ hai điều — bản sao phải nằm **tách khỏi máy chủ đang chạy**, và phải **thử khôi phục ít nhất một lần**. Bản sao lưu chưa từng thử khôi phục là bản sao lưu chưa tồn tại.

## Ai chịu trách nhiệm phần nào

Nếu **thuê người làm**, hãy đưa bảy điều trên vào yêu cầu ngay từ đầu, và yêu cầu bàn giao quyền quản trị hạ tầng khi thanh toán xong. Rất nhiều trường hợp "mất website" thực chất là mất quyền truy cập, không phải bị tấn công.

Nếu dùng **công cụ kéo - thả**, phần hạ tầng do bên cung cấp lo, nhưng phần phân quyền và dữ liệu khách hàng vẫn là của bạn.

Khi dựng bằng [Toolswave](/create-website), bạn mô tả ý tưởng bằng tiếng Việt và hệ thống sinh mã, dựng cơ sở dữ liệu cùng API thật rồi deploy lên hạ tầng Cloudflare — nên phần HTTPS và vá hệ điều hành không còn là việc của bạn. Nhưng hãy nêu rõ yêu cầu bảo mật ngay trong mô tả: *"trang quản trị phải đăng nhập mới vào được"*, *"nhân viên chỉ xem được đơn của mình"*. Toolswave dựng đúng thứ bạn mô tả, nên điều bạn không nói ra thì nó không tự thêm vào. Có gói miễn phí, không cần thẻ tín dụng.

## Tự kiểm trong 15 phút

1. Mở trang quản trị bằng cửa sổ ẩn danh — có chặn không?
2. Liệt kê tài khoản đang có quyền quản trị — còn ai đã nghỉ việc không?
3. Email chính đã bật xác thực hai lớp chưa?
4. Thử chức năng quên mật khẩu — hệ thống gửi lại mật khẩu cũ hay bắt đặt mới?
5. Bản sao lưu gần nhất là khi nào, và nó nằm ở đâu?

Năm câu này phát hiện được phần lớn vấn đề thật, và không câu nào cần kiến thức kỹ thuật.

## Tóm lại

Bảo mật cho doanh nghiệp nhỏ không phải là mua thiết bị đắt tiền. Nó là vài thói quen: mỗi người một tài khoản, quyền vừa đủ, hai lớp xác thực ở chỗ quan trọng, và một bản sao lưu đã thử khôi phục.

Làm được chừng đó, bạn đã đứng trên phần lớn các doanh nghiệp cùng quy mô.
