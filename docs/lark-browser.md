# Trình duyệt Lark (desktop)

> **Cập nhật 10/2026 (hợp nhất):** "Lark × Agents" và "Tạo workflow" là MỘT agent, MỘT danh sách hội thoại,
> hai bố cục. Lark × Agents = hội thoại trước, khung Lark là ngăn phụ bên phải (nút "Khung Lark", mặc định
> đóng, tự mở khi AI thao tác). Mục "Tạo workflow" ở thanh bên = khung Lark lớn, hội thoại gắn trái (mở rộng /
> thu nhỏ / dải 48px, kéo đổi bề rộng, nhớ riêng máy — `larkLayout.ts`). Khung Lark: `LarkFramePane.tsx`
> (dải tối giản + dải "AI đang thao tác"); lớp nổi chỉ giấu native view khi đè lên khung (`overlayHitsPane`).
>
> **Cập nhật 09/10/2026:** màn "Trình duyệt Lark" riêng đã gỡ. Trang Lark giờ gắn cạnh hội thoại trong Lark × Agents → **Tạo workflow** (`packages/ui/src/components/lark/LarkWorkflowStudio.tsx`, máy trạng thái `larkDock.ts`). Panel "Mẫu — làm một lần, dùng lại" và nút "Nâng cao" cũng đã gỡ; mã mẫu chỉ còn là tool dự phòng `lark_ui_template_list/apply`. API nội bộ: xem `docs/lark-web-api.md`.

Màn **Lark → Trình duyệt Lark** hiện chính trang Lark web mà mọi tính năng nền đang dùng (Đồng bộ
Bitable, đọc workflow, AI điều khiển Lark) — cùng `webContents`, cùng partition
`persist:tw-lark-web-<tài khoản>`, nên không có lần đăng nhập thứ hai.

## Kiến trúc

- `main/runtime/lark/larkHost.ts` — trang Lark nằm trong một `WebContentsView`, có ba chỗ đặt:
  **embedded** (màn Trình duyệt Lark, nằm trên cùng, đúng ô giữ chỗ); **parked** (cũng trong cửa
  sổ chính nhưng bị đẩy qua góc dưới-phải, chỉ chồng lên 1px — đây là trạng thái "ẩn" bình thường);
  **host** (cửa sổ riêng: popup đăng nhập, hoặc khi không có cửa sổ chính). Đã đo: một view nằm
  trong cửa sổ chưa từng hiện thì KHÔNG có bề mặt vẽ (`capturePage` báo "Current display surface
  not available", `visibilityState='hidden'`, rAF đứng). View nằm hẳn ngoài cửa sổ cũng bị coi là
  hidden. Chồng 1px thì `visible`, rAF chạy, chụp được đủ trang. Rời màn thì view về chỗ parked,
  không huỷ: phiên vẫn chạy, automation vẫn chạy. Đăng nhập lại lúc màn đang mở thì hiện ngay trong
  app.
- `main/runtime/lark/larkCdp.ts` — bộ điều khiển CDP qua `webContents.debugger.attach('1.3')`.
  **Không mở cổng remote-debugging**: một cổng không xác thực sẽ cho mọi tiến trình trên máy lái
  phiên Lark của người dùng.
  - snapshot: `Accessibility.getFullAXTree` cho từng frame. Iframe khác origin (Base nhúng) đi qua
    `Target.setAutoAttach({flatten:true})`, thành các phiên con. Cây được rút gọn bằng
    `compactAxTree` (larkUiCore.ts) thành dạng aria của Playwright. `ref` ổn định, khoá theo
    phiên + `backendDOMNodeId`.
  - act: `DOM.scrollIntoViewIfNeeded` rồi `DOM.getContentQuads` (cộng thêm độ lệch khung của OOPIF),
    rồi hit-test bằng `DOM.getNodeForLocation`: bị che thì `obscured`, không bấm. Sau đó mới
    `Input.dispatchMouseEvent` thật. Gõ chữ bằng `Input.insertText`, phím bằng `Input.dispatchKeyEvent`.
  - drag (`lark_ui_drag`): nhấn, nhích qua ngưỡng kéo, di nhiều bước, lên đích rồi thả
    (`dragSequence`). Bấm Dừng giữa chừng thì chuột về lại điểm đầu rồi nhả.
  - wait: theo `text`, `role`/`name` (`Accessibility.queryAXTree`) hoặc `network_idle`.
  - sự thật từ mạng: mọi request ghi automation/workflow kèm phản hồi (`Network.getResponseBody`)
    → `saves` / `lark_ui_saved` (workflowID, code, status). Lần lưu hợp lệ cuối cùng là nguồn của mẫu.
  - Gắn debugger thất bại (vd DevTools đang mở trên trang đó) thì quay về bộ điều khiển
    executeJavaScript cũ (`driver: 'legacy'`).
- `main/runtime/lark/larkTemplates.ts` — **Làm mẫu một lần → dùng lại**. Người dùng dựng tay một
  automation trong màn này và bấm Lưu trong Lark. App bắt được body Lark gửi đi rồi bấm "Lưu thành
  mẫu". Mọi id bảng/cột/view/option/người/nhóm trong body thành biến `{{tbl_1}}`… Khi dùng lại: điền
  biến, tạo vỏ mới, rồi POST đúng khuôn Lark với `status: 0` (bản nháp **tắt**). Mẫu lưu theo tài khoản
  ở `userData/lark-ui-templates-<scope>.json`. Tool: `lark_ui_template_list`,
  `lark_ui_template_apply` (gated).

## Chốt an toàn (bắt buộc, có kiểm trong `test/larkUiDriver.cjs`)

| Chốt | Nơi |
|---|---|
| Không bấm Bật / Kích hoạt / Xuất bản / Xoá / Gỡ / Chạy thử (VI/EN/ZH), mọi `switch`, "OK/Xác nhận/确定" trong hộp thoại xoá/bật | `classifySensitive` |
| Chỉ chạy trên host Lark/Feishu (trang gốc **và** khung chứa phần tử; `lark_ui_open` + ô địa chỉ cũng vậy) | `isLarkHost` |
| Tối đa 80 thao tác mỗi lượt (`lark_ui_open` reset) | `ActionBudget` |
| Nút **Dừng**: mọi `lark_ui_*` trả `stopped-by-user`; không mở lại được trong 20s | `LarkCdpDriver.stop` |
| Fail-closed: ref lạ, không tính được hộp, điểm bấm bị che → từ chối | `preflight` / `hitsTarget` |
| Agent không có `force` | `uiAct` |

## Chế độ ẩn cho dev (`LARKWAVE_HIDDEN=1`)

Chỉ có tác dụng khi chạy dev (`NODE_ENV !== 'production'`). Cửa sổ Lark, popup SSO, cửa sổ đăng
nhập tài khoản và OAuth Lark không bao giờ hiện (`show:false`). Cửa sổ chính thì vẫn phải được
"show" — cửa sổ chưa từng hiện thì các view con không vẽ (xem trên) — nhưng ở dạng hoàn toàn trong
suốt (`opacity 0`), không nhận chuột, không nhận focus, không có mục ở taskbar, đẩy ra ngoài màn
hình (`showInactive`). DevTools không mở, macOS ẩn luôn biểu tượng ở Dock. Đã đo được: trang Lark
parked là `visible` và `capturePage` trả về đủ khung hình.

```sh
pkill -f "nextron-dev.js --renderer-port 8892"; pkill -f "remote-debugging-port=9342"; pkill -f "next dev -p 8892"
cd apps/desktop
env -u ELECTRON_RUN_AS_NODE LARKWAVE_HIDDEN=1 npx nextron dev --renderer-port 8892 \
  --electron-options="--remote-debugging-port=9342"
# lái / chụp qua CDP: http://127.0.0.1:9342/json (cổng này CHỈ có ở dev; bản cài không có)
```

Chú ý: nextron dev luôn tự thêm `--remote-debugging-port` (mặc định 5858) — đó là cổng của bản dev,
không phải của driver (driver dùng `webContents.debugger`). Làm xong thì `pkill` như dòng đầu.

## Kiểm thật với phiên Lark của người dùng (chưa làm)

Xem báo cáo bàn giao. Tóm tắt: đăng nhập trong màn, xem pill trạng thái, chuyển màn rồi quay lại
(phiên không mất). Nhờ AI dựng một Tự động hoá → xem dải "AI đang thao tác", bấm Dừng thử. Dựng tay
một automation rồi "Lưu thành mẫu" → "Tạo bản nháp" sang bảng khác. Thử nối hai nút Quy trình bằng
kéo-thả.
