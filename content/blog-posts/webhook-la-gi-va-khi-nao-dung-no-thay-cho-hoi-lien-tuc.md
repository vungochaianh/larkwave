slug: webhook-la-gi-va-khi-nao-dung-no-thay-cho-hoi-lien-tuc
title: Webhook là gì và khi nào dùng nó thay cho hỏi liên tục
excerpt: Webhook là cách để hệ thống khác báo cho bạn ngay khi có chuyện, thay vì bạn phải hỏi lại mỗi phút. Khi nào nên dùng, và bốn điều phải làm đúng nếu không muốn mất dữ liệu.
tags: webhook, tích hợp thời gian thực, api
topic: Webhook là gì và khi nào dùng nó thay cho hỏi liên tục
---
Bạn cần biết ngay khi khách chuyển khoản. Có hai cách. Cách thứ nhất: cứ mỗi phút hỏi ngân hàng "có giao dịch mới chưa?". Cách thứ hai: đưa ngân hàng một địa chỉ và nói "có gì thì gọi tôi".

Cách thứ hai là **webhook**. Nó đảo ngược chiều gọi, và chỉ riêng việc đảo chiều đó đã đổi hẳn chi phí lẫn độ trễ của hệ thống.

## Hỏi liên tục và chờ được gọi

**Hỏi liên tục** (polling) là bạn chủ động gọi API của bên kia theo chu kỳ. Dễ làm, dễ hiểu, và hoạt động ở mọi nơi.

Nhược điểm hiện ra khi tính toán một chút. Hỏi mỗi phút nghĩa là **1.440 lượt gọi mỗi ngày**, trong đó gần như toàn bộ trả về "không có gì mới". Bạn trả tiền băng thông và giới hạn số lần gọi cho những câu trả lời rỗng. Và độ trễ tệ nhất vẫn là một phút — khách đã chuyển tiền xong 59 giây mà đơn vẫn treo.

**Webhook** đảo lại: bên kia giữ một địa chỉ của bạn, và khi có sự kiện thì họ gửi một yêu cầu tới đó. Không có lượt gọi rỗng nào, và độ trễ tính bằng giây.

## Khi nào dùng cái nào

Dùng **webhook** khi sự kiện **thưa và cần biết ngay**: tiền về, đơn giao xong, tin nhắn mới, bản dựng chạy xong.

Dùng **hỏi liên tục** khi:

- Bên kia **không hỗ trợ webhook** — vẫn là lý do phổ biến nhất.
- Bạn cần **đồng bộ toàn bộ**, không phải từng sự kiện. Ví dụ mỗi đêm kéo về toàn bộ bảng giá.
- Hệ thống của bạn **không có địa chỉ công khai** để bên kia gọi tới.

Thực tế nhiều hệ thống dùng cả hai: webhook cho tức thời, cộng một lượt đồng bộ định kỳ để vá những sự kiện lọt lưới. Đây không phải thừa — xem phần dưới.

## Bốn điều phải làm đúng

Webhook nghe đơn giản đến mức người ta hay bỏ qua bốn chuyện dưới đây, rồi mất dữ liệu.

### 1. Xác minh người gửi

Địa chỉ webhook của bạn nằm công khai trên internet. Bất kỳ ai cũng gửi được vào đó một yêu cầu giả "đơn hàng đã thanh toán".

Mọi dịch vụ nghiêm túc đều ký yêu cầu bằng một khoá bí mật, thường ở phần đầu yêu cầu. **Luôn kiểm chữ ký trước khi tin bất cứ dữ liệu nào.** Bỏ bước này là mở cửa cho người ta tự đánh dấu đơn của mình đã trả tiền.

### 2. Chịu được nhận trùng

Bên gửi không nhận được phản hồi trong vài giây sẽ **gửi lại**. Mạng chập chờn một nhịp là bạn nhận cùng một sự kiện hai lần.

Nếu xử lý ngây thơ, khách chuyển một lần mà đơn ghi nhận hai lần. Cách chữa: mỗi sự kiện có một mã riêng, **lưu lại mã đã xử lý**, gặp lại thì bỏ qua. Đây là yêu cầu bắt buộc, không phải tối ưu.

### 3. Trả lời nhanh, xử lý sau

Bên gửi thường chỉ chờ vài giây. Nếu bạn nhận webhook rồi ngồi gửi email, cập nhật kho, gọi thêm ba API khác — quá thời gian chờ, bên kia coi như thất bại và gửi lại.

Cách đúng: nhận, kiểm chữ ký, **ghi vào hàng đợi, trả về 200 ngay**, rồi xử lý ở tiến trình riêng.

### 4. Ghi log mọi thứ nhận được

Kể cả yêu cầu không khớp đơn nào, kể cả yêu cầu sai chữ ký. Khi có tranh chấp "tôi đã chuyển tiền rồi", log là thứ duy nhất trả lời được.

## Vì sao vẫn nên có một lượt đồng bộ định kỳ

Webhook có thể mất. Máy chủ bạn đang khởi động lại đúng lúc sự kiện tới, bên gửi thử lại vài lần rồi bỏ cuộc, hoặc có lúc họ gặp sự cố và không gửi gì cả.

Một lượt đối chiếu mỗi đêm — kéo về danh sách giao dịch trong ngày và so với những gì đã ghi nhận — bắt được đúng những trường hợp đó. Chi phí thấp, và nó là khác biệt giữa "gần như luôn đúng" với "luôn đúng".

## Dựng phần nhận webhook

Điểm vướng thực tế: webhook cần một **địa chỉ công khai chạy liên tục**. Máy tính cá nhân của bạn không làm được việc đó, và đây là chỗ nhiều dự án nhỏ bế tắc.

Nếu **thuê người làm**, hãy nêu rõ bốn điều ở trên trong yêu cầu — đặc biệt là chống nhận trùng, vì đó là thứ hay bị bỏ sót nhất và hậu quả là tiền bạc.

Với **công cụ kéo - thả**, phần nhận webhook thường không có, hoặc phải mua tiện ích bên thứ ba.

Nếu dựng bằng [Toolswave](/create-website), bạn mô tả bằng tiếng Việt kiểu *"làm website bán hàng có giỏ hàng, thanh toán chuyển khoản, và một địa chỉ nhận thông báo từ ngân hàng để tự đánh dấu đơn đã trả tiền"*. Hệ thống sinh mã, dựng cơ sở dữ liệu và API thật rồi deploy ra link công khai chạy liên tục — nên phần "có một địa chỉ để bên kia gọi tới" đã sẵn sàng. Nhớ nêu luôn yêu cầu kiểm chữ ký và chống nhận trùng trong mô tả: Toolswave dựng đúng thứ bạn nói, nên điều bạn không nêu thì nó không tự thêm. Có gói miễn phí, không cần thẻ tín dụng.

## Tóm lại

Webhook thay câu hỏi "có gì mới không?" lặp lại 1.440 lần mỗi ngày bằng một lời nhắn đúng lúc. Nó nhanh hơn và rẻ hơn, nhưng đổi lại bạn phải tự lo bốn thứ: xác minh người gửi, chịu được nhận trùng, trả lời nhanh rồi xử lý sau, và ghi log đầy đủ.

Bốn thứ đó không phải phần nâng cao. Thiếu bất kỳ cái nào, webhook sẽ chạy đúng trong lúc thử và sai vào lúc có tiền thật đi qua.
