# Bản dịch bài blog

Mỗi file là bản dịch của MỘT bài, đặt tên `_<mã ngôn ngữ>_<slug>.md`, trong đó `<slug>` khớp với
slug của bài gốc trên site.

    _en_cach-tao-website-ban-hang-online-khong-can-biet-lap-trinh.md

Bốn dòng đầu khai tiêu đề và mô tả, một dòng `---`, rồi phần thân Markdown:

    title: ...
    excerpt: ...
    seoTitle: ...          ≤ 60 ký tự
    seoDescription: ...    ≤ 155 ký tự
    ---
    # Thân bài...

Đẩy lên site:

    node scripts/blog-push-translation.mjs --dir content/blog-translations/en --locale en

## Vì sao giữ bản dịch trong repo

Bản dịch nằm ở cột `i18n` trong cơ sở dữ liệu, mà cơ sở dữ liệu thì chỉ có một bản. Giữ thêm bản
gốc ở đây để: sửa lại một câu thì sửa file rồi đẩy lại, không phải vào trang quản trị gõ tay; và
nếu có sự cố dữ liệu thì dựng lại được toàn bộ phần dịch bằng một lệnh.

## Hai điều phải giữ khi dịch

**GIỮ NGUYÊN CẤU TRÚC MARKDOWN.** Mục lục của trang bài dựng từ các đề mục và neo lấy theo thứ tự
đề mục — đảo hay gộp đề mục là mục lục bản dịch trỏ sai chỗ. Giữ nguyên cả đường dẫn ảnh và link.

**GIỮ NGUYÊN TÊN RIÊNG.** Toolswave, Lark, Cloudflare, Next.js không dịch.
