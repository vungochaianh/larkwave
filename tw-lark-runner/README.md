# tw-lark-runner

Chạy **lịch tự động hoá của Lark × Agents** 24/7 trên một VM, để chúng không chết khi bạn tắt app
Larkwave trên máy tính. Cùng vai với [`tw-cms-keeper`](../tw-cms-keeper) — chỉ khác việc nó gánh.

## Hai chế độ

| | khoá Lark nằm ở đâu | dựng cho ai |
|---|---|---|
| **mặc định** (`entry.ts`) | `.env` trên **máy của chính người dùng** | một người, VM của họ |
| **chạy hộ** (`MODE=hosted`) | **máy chủ Larkwave**, mã hoá trong `LarkHostedRunner` | nhiều người, Larkwave vận hành |

Chế độ chạy hộ là đánh đổi được chọn có ý thức, không phải tiện tay: runner chạy không người
trông nên máy chủ phải giải mã được khoá **mà không cần người dùng có mặt** — ai chiếm được máy
chủ *và* `LARK_CREDS_KEY` thì mint được tenant token cho mọi tenant đã bật. Đọc chú thích ở model
`LarkHostedRunner` trước khi đụng vào. Người dùng phải **tự bật** trong app; không bao giờ bật
sẵn, không suy ra từ việc họ đã kết nối Lark.

Cài chế độ chạy hộ (trên máy chủ):

```bash
# máy dev
cd tw-lark-runner && npm run build
scp dist/runner.js root@SERVER:/opt/tw-lark-hosted/dist/
scp systemd/tw-lark-hosted.service root@SERVER:/etc/systemd/system/

# trên máy chủ — .env chỉ cần LARK_RUNNER_SERVICE_KEY (TRÙNG với .env của API)
systemctl daemon-reload && systemctl enable --now tw-lark-hosted
```

## Vì sao cần

Lịch tự động hoá chạy **trên máy bạn**, bằng chính kết nối Lark của bạn. Đó không phải thiếu sót mà
là chủ ý: App Secret nằm trong keychain của máy, **không bao giờ** lên máy chủ Larkwave (xem chú
thích ở model `LarkGrant` trong schema — *"the server holds zero Lark key material, so a server
compromise cannot mint a Lark token"*). Đổi lại, tắt app là lịch dừng.

Service này giữ nguyên bất biến ấy: khoá vẫn nằm trên **máy của bạn** — chỉ là máy đó nay là cái VM
này, không phải Mac.

## Nó làm gì (và KHÔNG làm gì)

- Tải lịch từ bản sao lưu trên máy chủ (cùng nguồn với app desktop), làm mới mỗi 5 phút — bạn sửa
  lịch ở app, VM tự thấy.
- Tới giờ thì chạy: **MAIC nghĩ, VM này thực thi công cụ Lark**. Không cần cài Claude CLI trên VM.
- Ghi trạng thái (lần chạy cuối, lịch sử thực thi) ngược lên bản sao lưu, nên app desktop vẫn xem
  được lịch sử như thường.
- **Không** làm Đồng bộ Bitable (đó là `tw-cms-keeper`), **không** chạy các công cụ cần trình duyệt
  (`lark_ui_*`, tạo workflow) — VM headless không có trình duyệt.

## Chống chạy trùng

Nếu app desktop **và** VM cùng chạy, mỗi lịch sẽ chạy hai lần — với lịch ghi dữ liệu đó là hai bản
ghi trùng trong Base thật, lặp lại mỗi chu kỳ. Nên cả hai bên hỏi máy chủ trước mỗi lượt:

- Ai nhịp tim gần nhất trong 90 giây là chủ.
- **VM thắng desktop** — đây là nơi bạn cố ý đặt để chạy 24/7.
- Mất mạng ⇒ cứ chạy. Thà trùng một lúc còn hơn lịch đứng im vì một lời gọi phụ hỏng.

Khi VM đang giữ quyền, app desktop vẫn mở và dùng bình thường — chỉ phần chạy lịch là nhường.

## Cài (Ubuntu 22.04 / 24.04)

Đóng gói ở **máy dev** (nơi có mã nguồn Larkwave), rồi copy lên VM:

```bash
# máy dev
cd tw-lark-runner
npm install && npm run build      # → dist/runner.js (một file, không cần node_modules trên VM)
scp -r dist scripts systemd .env.example root@VM:/root/tw-lark-runner/

# trên VM
cd /root/tw-lark-runner
cp .env.example .env && nano .env  # điền LARK_APP_ID / LARK_APP_SECRET / LARKWAVE_TOKEN
sudo bash scripts/install-ubuntu.sh
```

Yêu cầu: Node ≥ 20 (script tự cài), ra Internet tới `*.larksuite.com` và `apia.toolswave.net`.

## Kiểm tra

```bash
journalctl -u tw-lark-runner -f
```

Chạy đúng thì thấy `đã tải N lịch (M đang bật)` rồi `đang chạy`. Nếu app desktop đang giữ quyền,
VM sẽ giành trong vòng một nhịp (≤10 giây) và desktop im ở lượt tick kế tiếp.

## Vì sao build từ nguồn, không chép mã sang đây

`larkClient`, `automationEngine` và `createToolBridge` chứa những luật **không được phép có hai
bản**: cách phân loại lỗi công cụ, luật chống trùng lịch, mốc sàn "đừng chạy ngay khi vừa tạo".
Chép sang đây là hai bản rồi trôi lệch — và bên trôi lệch lại đúng là bên chạy không ai trông.
`build.mjs` gói thẳng từ `apps/desktop/main/runtime/lark/`.

Bản dựng phải **tuyệt đối không chạm `electron`**; `build.mjs` có chốt chặn tự kiểm và sẽ hỏng ngay
lúc dựng nếu có. Gặp lỗi đó thì thủ phạm thường là một công cụ mới import `larkWebSession` /
`cmsSyncService` — thêm hoặc loại ở `tools/headless.ts` (KHÔNG lọc từ `tools/index.ts`: lọc sau khi
import thì file đó vẫn nằm trong cây phụ thuộc).
