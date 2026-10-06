# Ký và notarize bản macOS

> **Larkwave:** tài liệu này kế thừa từ Toolswave (trước khi tách). Những phần nói về dựng app
> (codegen, build, deploy app, cửa hàng, blog…) KHÔNG còn áp dụng — xem [TACH-APP.md](TACH-APP.md).

## Hiện trạng — không hỏng, nhưng vướng

Bản `.dmg` cài được và dùng được, **sau khi người dùng tự cho phép** ở lần mở đầu. Đây là trạng
thái đã kéo dài qua nhiều bản, không phải lỗi mới.

Công cụ của Apple nói chính xác vướng ở đâu:

```
$ syspolicy_check distribution /Applications/Toolswave.app
Notary Ticket Missing — Severity: Fatal
```

Đúng **một** lỗi chặn: chưa notarize. Người dùng thấy *"Apple không kiểm tra được phần mềm này có
mã độc hay không"*, rồi vào **Cài đặt hệ thống → Quyền riêng tư & Bảo mật → Vẫn mở** là chạy. Từ
macOS 15 Apple đã bỏ đường tắt chuột phải → Mở, nên không còn cách nào nhanh hơn.

Notarize sẽ bỏ hẳn bước đó. Đây là việc **đáng làm khi thuận tiện**, không phải việc khẩn.

### Ad-hoc so với chứng chỉ phát triển

Đo bằng `syspolicy_check`, hai cách ký cho ra cùng một lỗi chặn:

| cách ký | Fatal | Warning |
|---|---|---|
| ad-hoc (mặc định của dự án) | thiếu notarization | "ad-hoc không hợp để phân phối" |
| `Apple Development` | thiếu notarization | — |

Cái thêm của ad-hoc chỉ là Warning, **không đổi thao tác người dùng phải làm**. Nên chứng chỉ phát
triển không giúp gì cả — nó chỉ thêm một chứng chỉ cá nhân, có hạn dùng, vào thứ đem phát cho người
khác. Dự án chốt dùng ad-hoc cho tới khi có Developer ID thật.

### Vì sao máy dựng không thấy vướng

Máy dựng đang **tắt Gatekeeper** (`spctl --status` → `assessments disabled`), nên mở bản nào cũng
trơn. Nơi duy nhất vấn đề không lộ ra lại chính là nơi dựng ra nó — đó là lý do phải hỏi
`syspolicy_check` chứ không tin vào "máy tôi mở được".

## Cần gì để sửa dứt điểm

Ba thứ, theo thứ tự. Chỉ thiếu một là vô nghĩa.

### 1. Tài khoản Apple Developer Program — 99 USD/năm

Bắt buộc. Tài khoản miễn phí **chỉ** cấp chứng chỉ `Apple Development` (loại đang dùng), và loại đó
không được phép dùng để phân phối, cũng không notarize được.

Đăng ký: https://developer.apple.com/programs/ — cá nhân thì cần Apple ID + thẻ thanh toán; tổ chức
thì cần mã D-U-N-S và duyệt lâu hơn.

### 2. Chứng chỉ `Developer ID Application`

Sau khi có tài khoản trả phí:

1. https://developer.apple.com/account/resources/certificates → **+**
2. Chọn **Developer ID Application** (KHÔNG phải "Mac Development", KHÔNG phải "Mac App
   Distribution" — cái đó chỉ dùng cho App Store)
3. Tạo CSR bằng *Keychain Access → Certificate Assistant → Request a Certificate From a Certificate
   Authority*, chọn "Saved to disk"
4. Tải chứng chỉ về, nháy đúp để nạp vào Keychain

Kiểm:

```bash
security find-identity -v -p codesigning
# phải thấy một dòng "Developer ID Application: … (TEAMID)"
```

### 3. Mật khẩu riêng cho ứng dụng, để notarize

1. https://account.apple.com → **Đăng nhập & Bảo mật** → *Mật khẩu dành riêng cho ứng dụng*
2. Tạo một cái, đặt tên "toolswave-notarize"
3. Lưu vào `.env`:

```bash
APPLE_ID=vungochaianh.ainow@gmail.com
APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
APPLE_TEAM_ID=Q9P8VFMVPN
```

> `.env` đã nằm trong `.gitignore`. Đừng commit ba dòng này.

## Bật lên khi đã có đủ

Trong `apps/desktop/electron-builder.yml`, đổi khối `mac:`:

```yaml
mac:
  identity: Developer ID Application: <TÊN CỦA BẠN> (Q9P8VFMVPN)
  notarize:
    teamId: Q9P8VFMVPN
  hardenedRuntime: true
```

Rồi dựng như bình thường. electron-builder tự đọc `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` từ môi
trường, gửi lên Apple, chờ duyệt (thường 2–15 phút) và tự đóng vé vào `.app`.

Kiểm trước khi phát hành:

```bash
node scripts/check-dist-mac.mjs
# phải thấy: ✓ ký bằng Developer ID / ✓ chữ ký nguyên vẹn / ✓ Apple: phân phối được
```

## Cho tới khi đó

Phát hành vẫn chạy bình thường — không có cửa sau nào phải gõ thêm. `scripts/check-dist-mac.mjs`
chạy tự động trong `push-installers.mjs` và:

* **nhắc** khi thiếu notarization (trạng thái hiện tại, đã biết),
* **chặn** khi chữ ký hỏng, hoặc khi bản dựng bị ký bằng chứng chỉ `Apple Development` — tức là
  builder lại tự nhặt chứng chỉ trong keychain.

Cố ý phân biệt như vậy: một cổng lúc nào cũng đỏ sẽ bị bỏ qua theo thói quen, và đến lúc có sai
lệch thật thì không ai còn đọc nó nữa.

## Hai cái bẫy đã dính

**Chữ ký từng phụ thuộc vào biến môi trường người gõ lệnh phải nhớ.** `afterPack.cjs` ký ad-hoc,
rồi electron-builder ký đè nếu tìm thấy chứng chỉ trong keychain. Cách chặn duy nhất là
`CSC_IDENTITY_AUTO_DISCOVERY=false`, mà tài liệu ghi còn lệnh thì người ta gõ tay. Quên một lần ở
bản **1.0.310** là ra một bản cài ký bằng chứng chỉ phát triển. Nay đã ghim `identity: null` ngay
trong `electron-builder.yml` — không còn phụ thuộc vào ai nhớ gì.

**`codesign -dvvv` in ra stderr, không phải stdout.** Bản đầu của `check-dist-mac.mjs` chỉ đọc
stdout nên báo "không có chữ ký" cho một app ký đầy đủ — đúng thứ nó sinh ra để phát hiện.

## Vì sao vẫn phải ký ad-hoc

Ký ad-hoc (`codesign --sign -`) giải quyết một chuyện hẹp nhưng bắt buộc: nhị phân arm64 **chưa ký**
thì không chạy nổi, và macOS báo *"app bị hỏng, hãy chuyển vào Thùng rác"* — thông báo tệ nhất, vì
nó không chỉ ra đường nào đi tiếp. Ad-hoc đổi nó thành *"chưa xác minh được nhà phát triển"*, tức là
người dùng còn có cách mở.

Nó không thay được notarization, và cũng không nhằm thay.
