# Bán mã nguồn như một dịch vụ, không như một file

> Viết ngày 24/09/2026, trả lời câu hỏi "có logic hay tư duy sale nào đưa sản phẩm thành dịch vụ
> chung của Toolswave được không". Đọc kèm [hop-nhat-cua-hang-va-nen-tang.md](hop-nhat-cua-hang-va-nen-tang.md)
> — tài liệu đó nói HẠ TẦNG, tài liệu này nói BÁN THẾ NÀO.

## Câu một dòng

**Mã nguồn không phải sản phẩm. Nó là cửa vào.**

100.000đ không kiếm được tiền và không định kiếm. Nó mua ba thứ đáng giá hơn nhiều: một tài khoản
đang hoạt động, một dự án nằm sẵn trong tài khoản đó, và một lý do để người ta tiêu hạn mức.

## Vì sao Toolswave bán được thứ mà chợ mã nguồn không bán được

Một chợ mã nguồn giao được **file**. Toolswave giao được **một app đang chạy mà khách sửa tiếp
bằng chat**. Khác biệt đó không phải tính năng, nó là mô hình kinh doanh khác hẳn:

| | Chợ mã nguồn | Toolswave |
|---|---|---|
| Khách nhận | file zip | link chạy thật + repo + app trong tài khoản |
| Sau khi mua | hết quan hệ | bắt đầu quan hệ |
| Doanh thu | một lần | một lần + thuê bao + dịch vụ |
| Rào cản với khách | phải biết dựng | không cần biết gì |

Giá trị nằm ở chỗ: người mua mã nguồn **không mua code, họ mua một cái đang chạy**. Ai cũng biết
điều đó, nhưng chỉ nơi nào có sẵn hạ tầng build + deploy + sửa-bằng-chat mới giao được.

## Thang năm bậc

Mỗi bậc dùng lại đúng thứ hệ thống đã có — không bậc nào cần dựng hạ tầng mới.

| Bậc | Bán cái gì | Dùng lại cái gì | Trạng thái |
|---|---|---|---|
| 0 | Mã nguồn trần | ZIP, mời GitLab | đang bán |
| 1 | + **dựng chạy hộ**, có link thật | Cloudflare Pages + D1 + subdomain | hạ tầng đã có |
| 2 | + **dự án nằm trong tài khoản** | nhân bản thành App, sửa bằng chat | GĐ 2 đang dựng |
| 3 | + **chăm sóc/vận hành** theo tháng | hosting, tên miền, deploy lại | cần gói dịch vụ |
| 4 | **làm theo yêu cầu** từ một mã nguồn gần đúng | chính builder | cần quy trình |

### Bậc 1 — dựng chạy hộ

Cùng một sản phẩm, thêm một câu: *"mua xong có link chạy thật trong 15 phút, không cần cài gì"*.
Đây là bậc chuyển từ **bán file** sang **bán kết quả**, và nó không tốn thêm công: pipeline deploy
đã chạy hàng ngày cho app người dùng tự dựng.

Giá: gấp 3–5 lần bản trần. Người trả tiền cho bậc này là người **không muốn chạm vào terminal** —
đông hơn nhiều so với người đọc được `README`.

### Bậc 2 — dự án nằm trong tài khoản (bản lề)

Sau khi mua, dự án hiện trong "App của tôi" như app họ tự dựng: sửa bằng chat, build lại, xem log,
deploy lại, tải source, đồng bộ GitLab.

Đây là bậc quan trọng nhất, vì **sửa bằng chat thì tiêu hạn mức**. Một lần bán 100.000đ tự nhiên
dẫn tới một thuê bao, mà không cần bán thuê bao. Khách mua source vì cần một cái chạy được; họ ở
lại vì cái đó sửa được mà không phải thuê người.

Đây cũng chính là thứ "cấp dự án thẳng vào tài khoản" đang dựng ở GĐ 2: nhân viên chốt đơn qua
Zalo, mở CMS, chọn khách + chọn dự án, bấm cấp — dự án nằm trong tài khoản khách ngay.

### Bậc 3 — chăm sóc theo tháng

Hosting, tên miền, cập nhật bảo mật, sửa lỗi theo yêu cầu. Bán cho người đã ở bậc 2 và đã có thứ
để mất. Đây là doanh thu lặp lại đầu tiên **không phụ thuộc hạn mức AI**.

### Bậc 4 — làm theo yêu cầu

Khách chọn một mã nguồn *gần đúng* rồi trả thêm để sửa cho vừa. Nền tảng làm bằng chính builder,
nên biên lợi nhuận cao nhất thang.

Ở bậc này 209 dự án thôi làm kho hàng và bắt đầu làm **catalog ý tưởng**: nó không bán 100.000đ,
nó là thứ để nói "cái này gần giống cái anh cần, sửa ba chỗ là xong" — câu chốt đơn mạnh hơn mọi
bảng giá.

## Chỉ số phải nhìn

**KHÔNG phải doanh thu cửa hàng.** Doanh thu cửa hàng ở mức 100.000đ/đơn là tiếng ồn.

Chỉ số thật: **bao nhiêu phần trăm người mua mã nguồn có lượt build đầu tiên trong 7 ngày.**

- Cao → bậc 2 đang chạy, mã nguồn đang làm đúng việc của một cửa vào.
- Thấp → cửa hàng vẫn chỉ đang bán file, và mọi bậc phía trên đều không có ai để bán.

Chỉ số phụ: tỉ lệ người mua nâng gói trong 30 ngày, và số dự án được cấp tay bởi nhân viên
(đo xem kênh bán qua người có thật sự chạy không).

## Ba cái bẫy

1. **Giảm giá để bán được nhiều hơn.** Sai hướng. Giá đã gần như bằng không; vấn đề không nằm ở
   giá mà ở chỗ người mua không biết mua xong làm gì tiếp. Sửa bằng bậc 1–2, không bằng giảm giá.
2. **Bán mã nguồn cho lập trình viên.** Họ là nhóm ít cần Toolswave nhất — họ tự dựng được, và họ
   trả giá thấp nhất. Người trả tiền là chủ tiệm, chủ dịch vụ, người làm marketing: họ mua **một
   cái chạy được**, không mua code.
3. **Để mã nguồn nằm im trong cửa hàng.** Không có bậc 2 thì mỗi đơn là một lần chia tay. Cửa hàng
   lúc đó là chi phí vận hành, không phải kênh.
