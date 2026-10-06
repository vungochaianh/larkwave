slug: co-so-du-lieu-la-gi-chon-loai-nao-cho-phan-mem-cua-ban
title: Cơ sở dữ liệu là gì, chọn loại nào cho phần mềm của bạn
excerpt: Cơ sở dữ liệu là nơi phần mềm ghi nhớ mọi thứ. Bài này giải thích hai loại phổ biến, cách chọn cho đúng việc, và ba quyết định thiết kế sai là phải làm lại từ đầu.
tags: cơ sở dữ liệu, chọn công nghệ, khái niệm cơ bản
topic: Cơ sở dữ liệu là gì, chọn loại nào cho phần mềm của bạn
---
Tắt máy rồi bật lại, đơn hàng hôm qua vẫn còn. Đó là việc của cơ sở dữ liệu: **ghi nhớ**. Nghe đơn giản, nhưng đây là chỗ quyết định phần mềm của bạn chạy nhanh hay ì, mở rộng được hay phải viết lại.

Bài này không dạy bạn viết câu truy vấn. Nó giải thích đủ để bạn chọn đúng và đặt câu hỏi đúng cho người làm.

## Nó khác gì một file Excel

Nhiều người bắt đầu bằng bảng tính, và bảng tính hoàn toàn ổn khi chỉ có một người dùng. Nó gãy ở ba chỗ, và cả ba đều đến cùng lúc với sự phát triển:

- **Nhiều người sửa cùng lúc.** Hai nhân viên mở cùng một file, người lưu sau ghi đè người lưu trước. Cơ sở dữ liệu xử lý chuyện này bằng khoá và giao dịch.
- **Tìm trong lượng lớn.** Tìm một đơn giữa 50 dòng thì mắt thường làm được; giữa 50.000 dòng thì cần chỉ mục.
- **Ràng buộc.** Bảng tính cho bạn gõ "abc" vào ô số tiền. Cơ sở dữ liệu từ chối.

Tóm lại: bảng tính là nơi *chứa* dữ liệu, cơ sở dữ liệu là nơi *bảo vệ* dữ liệu.

## Hai loại bạn sẽ nghe nhắc tới

### Cơ sở dữ liệu quan hệ

Dữ liệu nằm trong các **bảng** có cột cố định, và các bảng nối với nhau bằng khoá. Đơn hàng nối tới khách hàng, chi tiết đơn nối tới sản phẩm.

Điểm mạnh là **tính nhất quán**: bạn khai "mỗi đơn phải thuộc về một khách có thật", và cơ sở dữ liệu không cho phép vi phạm. Với chuyện tiền bạc, tồn kho, chỗ ngồi — đây gần như luôn là lựa chọn đúng.

### Cơ sở dữ liệu phi quan hệ

Dữ liệu nằm ở dạng tài liệu tự do, mỗi bản ghi có thể có cấu trúc khác nhau. Linh hoạt khi cấu trúc chưa rõ hoặc thay đổi liên tục, và mở rộng theo chiều ngang dễ hơn.

Đổi lại, bạn tự chịu trách nhiệm giữ dữ liệu sạch, vì không có ai chặn bạn ghi một bản ghi thiếu trường.

### Chọn cái nào

Với **gần như mọi phần mềm kinh doanh vừa và nhỏ** — bán hàng, đặt lịch, quản lý kho, CRM — hãy chọn quan hệ. Dữ liệu của bạn vốn có quan hệ thật (đơn thuộc về khách, chi tiết thuộc về đơn), và bạn sẽ cần báo cáo tổng hợp.

Phi quan hệ hợp lý khi bạn lưu nhật ký sự kiện, dữ liệu cảm biến, hoặc nội dung mà mỗi bản ghi một kiểu. Đừng chọn nó chỉ vì nghe hiện đại hơn.

## Ba quyết định sai là phải làm lại

### 1. Không lưu giá tại thời điểm giao dịch

Đây là lỗi kinh điển. Bảng chi tiết đơn chỉ trỏ sang bảng sản phẩm để lấy giá. Tháng sau bạn tăng giá, và **mọi đơn cũ tự đội giá theo** — sổ sách sai toàn bộ, không có cách nào dựng lại.

Quy tắc: thứ gì là *sự thật tại một thời điểm* thì phải **chép lại**, không tham chiếu. Giá, tên sản phẩm lúc bán, địa chỉ giao lúc đặt.

### 2. Xoá thật thay vì đánh dấu

Xoá một sản phẩm đã từng được bán là làm hỏng mọi đơn hàng cũ trỏ tới nó. Hãy thêm một cột trạng thái và đánh dấu "ngừng bán". Nguyên tắc chung: dữ liệu có liên quan tới lịch sử thì không xoá, chỉ ẩn.

### 3. Nhét nhiều thứ vào một ô

Lưu địa chỉ thành một ô chữ dài, rồi sau này cần lọc theo tỉnh thành. Lưu danh sách sản phẩm trong đơn thành một dòng chữ, rồi cần đếm xem món nào bán chạy. Mỗi lần như vậy là một lần phải tách dữ liệu ra bằng tay.

Hỏi trước: **thứ này về sau có cần lọc, đếm hay sắp xếp không?** Có thì nó phải là một cột riêng, hoặc một bảng riêng.

## Ai lo phần này cho bạn

Nếu **thuê người làm**, hãy yêu cầu xem sơ đồ các bảng trước khi họ viết mã. Bạn không cần đọc được câu truy vấn, nhưng bạn đọc được tên bảng và tên cột — và bạn là người duy nhất biết nghiệp vụ có đúng thế không.

Nếu dùng **công cụ kéo - thả**, phần dữ liệu thường bị giới hạn trong khuôn có sẵn. Ổn cho danh sách đơn giản, vướng khi nghiệp vụ của bạn khác số đông.

Hướng thứ ba là mô tả bằng tiếng Việt cho AI dựng. Trên [Toolswave](/create-website), bạn gõ đại ý *"làm cửa hàng bán cà phê có giỏ hàng và trang quản trị đơn"*, và hệ thống **dựng cơ sở dữ liệu cùng API thật** rồi deploy ra link công khai. Điều đáng nói với chủ đề này: bạn nhận về một cơ sở dữ liệu quan hệ thật với các bảng và quan hệ rõ ràng, không phải một kho dữ liệu bị giấu sau giao diện — nên khi cần thêm một trường hay một bảng, chỉ việc mô tả tiếp. Toolswave có gói miễn phí, không cần thẻ tín dụng.

Dù đi đường nào, ba quyết định ở phần trên vẫn là của bạn. Hãy nói rõ trong mô tả: *"lưu giá tại thời điểm đặt hàng"*, *"sản phẩm ngừng bán thì ẩn chứ không xoá"*. Máy không tự biết nghiệp vụ của bạn cần gì.

## Vài việc nên làm sớm

- **Sao lưu định kỳ và thử khôi phục một lần.** Bản sao lưu chưa từng khôi phục thử là bản sao lưu chưa tồn tại.
- **Đánh chỉ mục cho cột hay tìm kiếm** — số điện thoại, mã đơn. Đây là khác biệt giữa tra cứu tức thì và chờ vài giây.
- **Đừng lưu mật khẩu dạng chữ thường.** Chỉ lưu bản băm, và đừng tự viết phần đó.

## Tóm lại

Cơ sở dữ liệu là nơi phần mềm ghi nhớ. Chọn quan hệ cho hầu hết việc kinh doanh, chép lại những sự thật tại thời điểm giao dịch, đừng xoá thứ có lịch sử, và tách riêng thứ về sau cần lọc.

Bốn điều đó quyết định phần mềm của bạn dùng được ba năm hay phải viết lại sau sáu tháng.
