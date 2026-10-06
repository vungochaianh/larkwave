slug: api-la-gi-va-vi-sao-phan-mem-nao-cung-can-toi-no
title: API là gì và vì sao phần mềm nào cũng cần tới nó
excerpt: API là cách hai phần mềm nói chuyện với nhau. Bài này giải thích bằng ví dụ đời thường, chỉ ra chỗ người mới hay hiểu sai, và khi nào bạn thật sự cần quan tâm.
tags: api, tích hợp hệ thống, khái niệm cơ bản
topic: API là gì và vì sao phần mềm nào cũng cần tới nó
---
Bạn mở ứng dụng ngân hàng, thấy số dư hiện lên sau nửa giây. Điện thoại của bạn không hề lưu số dư đó — nó vừa **hỏi** máy chủ ngân hàng và nhận về câu trả lời. Cái cách hỏi-đáp có quy tắc đó chính là API.

Từ viết tắt này xuất hiện trong mọi báo giá phần mềm, mọi cuộc họp kỹ thuật, và thường không ai dừng lại giải thích. Bài này giải thích đúng phần bạn cần hiểu để ra quyết định, không phải để đi code.

## Một định nghĩa dùng được

**API** là một bản hợp đồng giữa hai phần mềm: bên A hỏi theo đúng khuôn này, bên B sẽ trả lời theo đúng khuôn kia.

Cách ví von sát nhất là **thực đơn trong quán ăn**. Bạn không đi vào bếp và tự nấu. Bạn nhìn thực đơn, gọi món theo đúng tên ghi trên đó, và bếp đưa ra món ăn. Thực đơn quy định bạn gọi được gì và phải gọi thế nào — nhưng nó giấu hoàn toàn chuyện bếp nấu ra sao.

Ba điều rút ra từ ví von đó, và cả ba đều quan trọng thật:

- **Bạn chỉ gọi được thứ có trên thực đơn.** Một API cho phép làm đúng những việc nó công bố, không hơn.
- **Bạn không cần biết bếp hoạt động thế nào.** Đó là cái lợi lớn nhất: phần mềm bên kia đổi cách làm bên trong mà không ảnh hưởng tới bạn, miễn là thực đơn giữ nguyên.
- **Thực đơn đổi thì bạn phải đổi theo.** Đây là chỗ đau nhất trong thực tế, nói kỹ ở phần dưới.

## Nó trông như thế nào

Phần lớn API ngày nay là **API web**: một bên gửi yêu cầu qua đường truyền internet, bên kia trả về dữ liệu, thường ở dạng JSON — một định dạng chữ mà cả người lẫn máy đều đọc được.

Một yêu cầu điển hình gồm bốn phần:

1. **Địa chỉ**: `https://api.example.com/v1/orders/1042`
2. **Động tác**: `GET` (lấy về), `POST` (tạo mới), `PATCH` (sửa), `DELETE` (xoá)
3. **Giấy tờ tuỳ thân**: một khoá hoặc mã thông báo chứng minh bạn được phép hỏi
4. **Dữ liệu kèm theo**: khi tạo mới hoặc sửa

Và câu trả lời gồm một **mã trạng thái** (200 là xong, 404 là không tìm thấy, 401 là chưa được phép, 500 là bên kia hỏng) cùng phần dữ liệu. Chỉ cần nhớ chừng đó là đọc hiểu được hầu hết tài liệu API.

## Vì sao phần mềm nào cũng đụng tới API

Ngay cả một website bán hàng nhỏ cũng thường gọi ra ngoài ở vài chỗ:

- **Thanh toán** — hỏi ngân hàng hoặc cổng thanh toán xem tiền đã về chưa
- **Vận chuyển** — lấy phí ship theo địa chỉ, tra trạng thái đơn
- **Gửi tin** — email xác nhận, tin nhắn nhắc lịch
- **Đăng nhập bằng tài khoản có sẵn** — hỏi bên thứ ba xem người này có đúng là họ không

Và quan trọng hơn: **chính phần mềm của bạn cũng có API bên trong**. Trang web bạn nhìn thấy (phần giao diện) hỏi phần máy chủ để lấy danh sách sản phẩm, gửi đơn hàng lên, cập nhật trạng thái. Đó cũng là API, chỉ là hai bên đều thuộc về bạn.

Đây là chỗ phân biệt rất thật giữa hai loại sản phẩm: một trang giới thiệu tĩnh không cần API vì nội dung đã nằm sẵn trong trang. Nhưng bất cứ thứ gì **ghi nhớ dữ liệu** — giỏ hàng, lịch hẹn, tài khoản người dùng — đều phải có API để đọc và ghi vào kho dữ liệu.

## Ba chỗ người mới hay hiểu sai

### "Có API là tự động tích hợp được"

Không. Hai hệ thống đều có API vẫn cần ai đó viết phần nối giữa chúng, vì tên gọi và cấu trúc dữ liệu hai bên gần như không bao giờ trùng nhau. Bên này gọi khách hàng là `customer`, bên kia gọi là `partner_id`. Phần dịch qua lại đó là công việc thật, có chi phí thật.

### "API công khai thì ai cũng gọi được"

Công khai nghĩa là *có tài liệu để dùng*, không có nghĩa là *không cần xin phép*. Gần như mọi API đều đòi khoá truy cập, giới hạn số lần gọi mỗi phút, và có thể thu phí theo lượng.

### "Nối xong là xong"

Đây là hiểu sai tốn kém nhất. API của bên thứ ba **có phiên bản và có ngày khai tử**. Bên kia nâng cấp, phiên bản cũ ngừng chạy, và phần tích hợp của bạn hỏng vào một ngày bạn không hề động tới dòng mã nào. Hãy coi mỗi tích hợp là một thứ phải bảo trì, không phải một việc làm một lần.

## Khi bạn tự dựng phần mềm thì sao

Nếu bạn thuê người làm, hãy hỏi thẳng hai câu trước khi ký: *phần mềm này có API để về sau nối với hệ thống khác không?* và *tôi có tài liệu mô tả nó không?* Thiếu hai thứ đó, mọi tích hợp sau này đều bắt đầu bằng việc đọc lại mã nguồn.

Nếu bạn dùng **công cụ kéo - thả**, phần API thường bị giấu đi — tiện lúc đầu, nhưng đến lúc cần nối với phần mềm kế toán hay kho vận thì bạn không có chỗ để cắm vào.

Một hướng khác là mô tả thứ mình cần bằng tiếng Việt và để AI dựng. Trên [Toolswave](/create-website), bạn gõ đại ý *"làm cửa hàng bán cà phê có giỏ hàng và trang quản trị đơn"*, và hệ thống sinh mã, **dựng cơ sở dữ liệu cùng API thật**, build, cho xem trước rồi deploy ra một link công khai. Điểm đáng nói với chủ đề bài này: API không phải thứ bán thêm, nó là một phần của sản phẩm ngay từ đầu — nên khi bạn cần nối sang nơi khác, đã có sẵn chỗ để nối. Toolswave có gói miễn phí, không cần thẻ tín dụng, và gắn được tên miền riêng.

Cần nói rõ để không ai kỳ vọng sai: có API không có nghĩa là mọi tích hợp thành miễn phí. Nối với cổng thanh toán vẫn cần giấy phép kinh doanh, nối với đơn vị vận chuyển vẫn cần hợp đồng. API chỉ bỏ đi phần kỹ thuật, không bỏ được phần thủ tục.

## Tóm lại

API là cách hai phần mềm nói chuyện với nhau theo một bản hợp đồng đã thoả thuận. Bạn không cần biết viết API, nhưng nên biết ba điều: phần mềm của bạn **có** API hay không, ai **giữ tài liệu** của nó, và **chuyện gì xảy ra khi bên kia đổi phiên bản**.

Ba câu hỏi đó, hỏi trước khi làm thì rẻ. Hỏi sau khi tích hợp hỏng thì đắt.
