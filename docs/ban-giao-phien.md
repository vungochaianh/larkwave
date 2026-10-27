# Bàn giao phiên — Larkwave

**Chốt ngày 27/10/2026 ở bản 0.1.22.** Larkwave đã *tạm nghiệm thu và đóng gói*; trọng tâm công
việc chuyển sang Appwave. Tệp này để mở lại phiên ở đây mà không phải đọc lại cả lịch sử.

> Đây là tài liệu **trạng thái**, không phải nhật ký. Sửa tại chỗ khi trạng thái đổi, đừng cộng dồn.
> Quy trình bàn giao Mac ↔ Windows nằm ở skill `ban-giao` (`.claude/skills/ban-giao`), khác tệp này.

---

## 1. Đang đứng ở đâu

| | |
|---|---|
| Bản đang phát hành | **0.1.22** (.dmg + code-push), live tại `https://toolswave.net/larkwave` |
| Commit cuối | "0.1.22: trang đăng nhập Zalo vẫn kẹt…" (xem `git log -1`) |
| Cây làm việc | sạch |
| Remote `origin` | **CHƯA CÓ** — mã chỉ nằm trên máy Mac này. Đừng tự tạo remote; hỏi người dùng đặt ở đâu. |
| Test | 546 bài qua (`bash apps/desktop/test/run.sh`) |

## 2. Mở lại phiên thì chạy gì trước

```bash
node scripts/handoff.mjs                                                   # đo, đừng nhớ
pnpm --filter @larkwave/shared build && pnpm --filter @larkwave/core build # LUÔN trước desktop
bash apps/desktop/test/run.sh
```

Chạy app để kiểm thì **không bật cửa sổ** — lệnh đầy đủ ở [CLAUDE.md](../CLAUDE.md) § Lệnh.

## 3. Tuần 12–18/10 đã làm gì (0.1.4 → 0.1.20, 47 commit)

| Mảng | Bản | Tóm tắt |
|---|---|---|
| Gemini CLI chạy lượt Lark | 0.1.4 | qua cầu MCP Lark như Claude; bỏ cờ `--yolo` |
| API key `sk-ant-usr-…` | — | nhận key Console cấp từ 10/2026; "HTTP 400" đổi thành câu nói đúng nguyên nhân |
| Zalo & Gmail cho kỹ năng | 0.1.5 | agent không tự thao tác, chỉ đi qua kỹ năng (`connectorGate`) |
| Chế độ Tự động + bỏ trần gửi | 0.1.6 | Tự động = mọi thao tác trừ xoá; trần gửi thành cảnh báo; lịch gửi được + `maxRuns` + giờ VN mỗi lượt |
| **Đọc tin Zalo cũ** | 0.1.7→0.1.20 | mảng lớn nhất — xem mục 4 và 5 |

14 trong 17 bản rơi vào riêng ngày 18/10 và đều phục vụ mục cuối.

## 4. Bản đồ tệp phần đọc tin Zalo

| Tệp | Giữ việc gì |
|---|---|
| [`connectors/zalo/zaloWeb.ts`](../apps/desktop/main/runtime/connectors/zalo/zaloWeb.ts) | cửa sổ Zalo Web nhúng: mở/ẩn/đóng, dò đăng nhập, mở nhóm bằng click chuột thật, cuộn theo đợt, trích nội dung, xuất cookie + imei |
| [`connectors/zalo/zaloService.ts`](../apps/desktop/main/runtime/connectors/zalo/zaloService.ts) | `webOpen/webRead/webStatus…`, `adoptWebSession()` (gộp phiên cho zca), `fetchHistory`, `search`, `read` |
| [`connectors/zalo/zaloStore.ts`](../apps/desktop/main/runtime/connectors/zalo/zaloStore.ts) | cài đặt giữ tin + sổ tin mã hoá trên đĩa + cookie cửa sổ (hết hạn 30 ngày) |
| [`connectors/zalo/messages.ts`](../apps/desktop/main/runtime/connectors/zalo/messages.ts) | sổ tin: đọc theo khoảng, tìm, cắt theo hạn giữ, snapshot |
| [`connectors/zalo/session.ts`](../apps/desktop/main/runtime/connectors/zalo/session.ts) | zca-js: lịch sử nhóm qua kho cloud (`getrecentv2`), lấy tin cũ hơn |
| [`lark/tools/connectors.ts`](../apps/desktop/main/runtime/lark/tools/connectors.ts) | công cụ agent: `zalo_web_open`, `zalo_web_read`, `zalo_search_messages`, `zalo_sync` |
| [`core/src/chatTurn.ts`](../packages/core/src/chatTurn.ts) | `waitingOnUser()` + loại ngày tháng khỏi nhận diện tiến độ — chống vòng lặp "Tự chạy tiếp" |
| [`ui/.../ZaloSyncPanel.tsx`](../packages/ui/src/components/ZaloSyncPanel.tsx) | thẻ trong Cài đặt: trạng thái, nút cửa sổ, nút gộp phiên, hỏi đáp |
| [`skills/builtinSkills.ts`](../apps/desktop/main/runtime/skills/builtinSkills.ts) | `lw-zalo-doc-tin`, `lw-zalo-dong-bo` |
| [`test/zaloSync.cjs`](../apps/desktop/test/zaloSync.cjs) | kiểm sổ tin + lưu đĩa, dữ liệu giả, không chạm mạng |

## 5. CÒN TREO — cần tài khoản Zalo thật mới kết luận được

- [ ] **Đọc nhóm cả tháng trên 0.1.20.** Bản này sửa gốc "cuộn tới nơi mà đọc rỗng" (bỏ `innerText`)
      nhưng **chưa chạy trên tài khoản thật**. Phép thử: nhờ trợ lý "tóm tắt nhóm Đầu tư AI tháng 10".
- [ ] **Gộp phiên để GỬI tin** — nút "Bật gửi tin bằng phiên này" trong Cài đặt. Kết quả cuối biết
      được là *trước* 0.1.11 ("Đăng nhập thất bại (13 cookie; thấy: zpsid, zpw_sek, __zi)"), tức là
      chưa tính bản sửa imei. Dòng **"imei cửa sổ: có / KHÔNG tìm thấy"** trong câu kết quả là chỗ rẽ:
      - *có* → đường gộp hiện tại đúng hướng, sửa tiếp phần còn lại;
      - *KHÔNG tìm thấy* → bỏ gộp, chuyển sang cho **chính cửa sổ Zalo Web tự gửi tin**.
- [ ] **Mốc ngày Zalo Web chịu nạp.** Zalo chỉ nạp lịch sử tới một ngày rồi hiện "tìm tin nhắn trước
      ngày…". Đây là **giới hạn phía Zalo, không sửa được từ app**; 0.1.18 báo thật mốc đó thay vì im
      lặng. Đừng nhận nhầm thành lỗi của mình (đã nhận nhầm một lần, mất mấy bản).
- [ ] **Appwave thiếu bản vá `ooxml` mà Larkwave có.** Bản ở đây hiện công thức cho ô `<f>` chưa có
      `<v>` (tệp tự dựng, chưa ai mở bằng Excel), nếu không cột kiểu "Thành tiền" trông như mất dữ
      liệu. Lệch này bị bản sao `apps/api` đông lạnh che suốt, chỉ lộ ra khi gỡ nó (19/10/2026).
      Toolswave đã dừng nên không chép về đó nữa; còn lại một câu hỏi: có chép 6 dòng sang
      `appwave/apps/desktop/main/runtime/chat/ooxml.ts` không. **Chưa chép.**

## 6. CẤM — không mở lại

**Giải mã CSDL Zalo trên điện thoại** (`.db.crypt`, đường `pull_mobile`). Bộ lọc an toàn chặn, hai
lần. Đã gỡ `mobileSync.ts`, `syncReader.ts`, `vendor.d.ts` và bỏ phụ thuộc `sql.js`, `xz-decompress`.
Không viết lại dưới bất kỳ tên nào. Đường thay thế đã chọn và đã dựng: **cửa sổ Zalo Web**.

## 7. Bẫy đã trả giá bằng nhiều bản phát hành

- **"Script failed to execute" là câu DUY NHẤT** Electron trả về cho mọi thất bại của script trong
  trang — nó *che* lỗi thật. `runJs()` trong `zaloWeb.ts` đã bọc mọi script để luôn trả `{ok,error}`
  thay vì ném. **Đừng gỡ lớp bọc đó.** Gặp lỗi mờ ở chỗ khác: làm cho nó nói ra lỗi thật trước, rồi
  mới sửa — đoán rồi phát hành thử là cái giá của 13 bản trong một ngày.
- **`innerText` ép trình duyệt tính lại bố cục** của toàn bộ hội thoại → chết trên nhóm cả tháng.
  Dùng `textContent` từng hàng. Áp dụng cho mọi script đọc trang, không riêng Zalo.
- **Trang đăng nhập Zalo (id.zalo.me) kẹt mãi nếu `POST /account/logininfo` hỏng/treo, HOẶC trả HTTP 200
  mà `error_code` ≠ 0, hoặc trả HTML** (proxy/tường lửa): chỉ còn logo + "Tiếng Việt / English", không QR,
  Zalo không tự thử lại. `checkLogin()` trong `zaloWeb.ts` đi thang cứu `LOGIN_STEPS` (tải lại → XOÁ SẠCH
  partition như máy mới → tải lại bỏ bộ đệm), rồi hỏi lại logininfo lấy lý do thật (`LOGIN_INFO_PROBE`), báo
  `loginStuck` + dải báo có nút "Thử lại" ngay trên trang. Đừng gỡ bộ canh đó.
  - 0.1.21 hụt ở máy người dùng vì **`webContents.executeJavaScript` CHỜ `did-stop-loading`** khi trang còn
    request treo (Google Analytics, font…) ⇒ script dò không bao giờ chạy ⇒ không tự cứu. Script canh phải
    chạy bằng `mainFrame.executeJavaScript` (`runJs(expr, true)` / `runJsCapped`).
  - Bậc xoá sạch đi ngang chat.zalo.me: đừng xoá bộ đếm chỉ vì rời id.zalo.me, kẻo thang cứu lặp vô tận.
- **chat.zalo.me khi CHƯA đăng nhập đứng yên 2–7 giây rồi mới chuyển sang id.zalo.me.** Đừng kết luận
  "đã đăng nhập" theo URL: `loginState()` chờ thấy ô tìm cột trái, hoặc 12 giây không bị chuyển (0.1.21).
- **Zalo chỉ cho MỘT phiên web một lúc.** Phiên QR của zca và cửa sổ Zalo Web đá nhau. Đó là lý do
  0.1.9 gộp về một đăng nhập. Đừng dựng lại hai đường song song.
- **`dist:mac` gói core từ `dist/`**, không từ `src`, và không tự dựng lại. Không build shared + core
  trước ⇒ core cũ ⇒ app trắng màn hình lúc khởi động, mà lúc dựng **không báo lỗi nào**.
- **Máy chủ chạy hai tiến trình web**, mỗi tiến trình một bộ đệm, `/api/apps-release/larkwave` đệm
  300 giây. Gọi trang **8 lần** liền, cả 8 ra bản mới thì mới coi là phát hành xong.
- **Bash kế thừa `ELECTRON_RUN_AS_NODE=1` từ VS Code** → app Electron chết lặng mã 0. Mọi lệnh chạm
  Electron phải có `env -u ELECTRON_RUN_AS_NODE`.

## 8. Phát hành lại

Quy trình đầy đủ ở [CLAUDE.md](../CLAUDE.md) § Phát hành. Tóm tắt chỗ dễ sai:

- Chỉ đổi giao diện → `push-renderer.mjs --min-main 0.1.0` (code-push, không cần bản cài mới).
  Giao diện mới **phải chạy được trên lõi 0.1.0**; gọi IPC mới thì phải dò xem lõi có kênh đó không.
- Đổi main process / IPC → bản cài mới: tăng `version`, thêm mục `changelog.ts`, dựng shared + core,
  `dist:mac`, rồi `check-dist-mac.mjs` → `boot-smoke.mjs` (≥150 kênh) → `connectors-smoke.mjs` (cần
  mạng, kiểm zca-js/nodemailer/imapflow trên đúng bản đã gom) → `push-installers.mjs` →
  `push-renderer.mjs --min-main 0.1.0 --main-change`.
