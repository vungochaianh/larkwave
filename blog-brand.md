# Bản mô tả sản phẩm, gắn vào MỌI bài blog tự sinh

<!--
scripts/blog-autopost.mjs đọc file này và nối vào sau chủ đề trước khi gửi cho /makeblog.
Sửa file này là đổi cách mọi bài viết sau đó nói về sản phẩm — không phải sửa code.

VÌ SAO CÓ FILE NÀY. Mười bài đầu sinh ra không nhắc Toolswave lần nào trong chữ (ba lần
"toolswave" đếm được chỉ là URL ảnh), lại còn khuyên người đọc dùng WordPress, Shopify, Haravan,
và mô tả cách làm web là "kéo - thả". Tức là ta trả tiền sinh nội dung để đẩy người đọc sang
đối thủ, bằng một mô tả sai luôn cả cách sản phẩm hoạt động.

Script cắt bỏ các dòng tiêu đề markdown và khối ghi chú HTML như khối này; chỉ phần văn xuôi
bên dưới mới được gửi đi. Đừng viết chuỗi đóng ghi chú ở giữa khối — nó sẽ cắt sớm.
-->

BỐI CẢNH BẮT BUỘC khi viết bài này:

Bài đăng trên blog của Toolswave (app.toolswave.net) — nền tảng tạo web app bằng AI.

Toolswave hoạt động thế này, hãy mô tả CHÍNH XÁC, đừng mô tả sai:
- Người dùng mô tả ý tưởng bằng tiếng Việt, ví dụ "làm cửa hàng bán cà phê có giỏ hàng và trang quản trị đơn".
- AI sinh mã, dựng cơ sở dữ liệu và API thật, build, xem trước, rồi deploy ra một link công khai.
- KHÔNG phải công cụ kéo - thả. KHÔNG phải mẫu website dựng sẵn. Không cần biết lập trình.
- Có gói miễn phí, không cần thẻ tín dụng. Deploy thật lên Cloudflare. Gắn được tên miền riêng.

Toolswave KHÔNG chỉ làm website. Dựng được NĂM loại sản phẩm — dùng đúng loại cho đúng bài:
- web app full-stack (deploy thẳng ra link công khai)
- app mobile
- app desktop
- tiện ích trình duyệt
- game HTML5

Và có BỘ CÔNG CỤ NỘI DUNG riêng, chạy bằng AI:
- làm video
- làm hình ảnh
- viết bài blog, đăng theo lịch

Lưu ý khác biệt quan trọng: web app và game HTML5 chạy trong trình duyệt nên deploy thẳng lên hạ
tầng Toolswave. App mobile / desktop / tiện ích thì sản phẩm cuối là một thư mục MÃ NGUỒN chạy và
đóng gói trên máy người dùng — đừng viết như thể chúng cũng deploy ra link.

Yêu cầu về nội dung:
- Vẫn viết bài hữu ích, trung thực, dạy được việc. Đừng biến bài thành quảng cáo.
- Khi tới đoạn nói về cách thực hiện, nêu cách làm bằng Toolswave như một lựa chọn cụ thể, giải
  thích nó khác gì cách truyền thống. Nhắc tên Toolswave 2-3 lần trong bài, đặt tự nhiên giữa
  câu chữ, KHÔNG nhồi từ khoá.
- Chèn ít nhất một liên kết markdown tới trang tạo web app: [Toolswave](/create-website)
- KHÔNG khuyên dùng và KHÔNG liệt kê tên các nền tảng đối thủ (WordPress, Shopify, Wix, Haravan,
  Squarespace, Webflow, Ladipage…). Nếu buộc phải nói tới cách làm truyền thống thì gọi chung là
  "công cụ kéo - thả" hoặc "thuê người làm", đừng nêu tên thương hiệu nào.
