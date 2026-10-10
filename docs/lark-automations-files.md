# Tự động hoá đọc tệp → ghi Lark (không người trông)

Ca thật của người dùng: "automation trong Larkwave yêu cầu agent đọc file rồi chạy tự động, lần sau tự ghi tiếp".
Trước đây một lịch "Chạy AI agent" không có chỗ để đặt tệp đầu vào, chạy lần hai là nhân đôi dòng trong Base, và
ở chế độ thực thi nó tự duyệt MỌI thao tác ghi (kể cả xoá, ghi đè, gửi tin) vì không ai ngồi bấm "Cho phép".

Mã: `apps/desktop/main/runtime/lark/` — `automationFiles.ts` (thư mục), `unattendedPolicy.ts` (luật duyệt),
`upsertPlan.ts` (ghi theo khoá), `autoRunRecorder.ts` (biên bản), `larkService.runAutomationAgent` (một lần chạy),
`automationEngine.ts` (lịch), `headlessRunner.ts` (máy chạy hộ). Giao diện: `packages/ui/src/components/lark/
AutomationFiles.tsx` + `AutomationsPanel.tsx`. Kiểm: `apps/desktop/test/autoFiles.cjs`.

## 1. Thư mục riêng của mỗi quy tắc

```
userData/lark/automations/<id quy tắc>/
  inputs/            "Tệp nguồn" người dùng thêm (nút "Thêm tệp nguồn" — chép vào, không ghi đè tệp khác cùng tên)
  sources/<nguồn>/   tệp tải TƯƠI từ Lark mỗi lần chạy (xoá sạch rồi tải lại)
  outputs/<YYYYMMDD-HHmmss>/   tệp lần chạy đó dựng ra; giữ N lần gần nhất (mặc định 10), lần không ra tệp thì không giữ thư mục
  .extract/          chữ trích từ Excel/Word để agent Read (Read không mở được tệp ZIP nhị phân)
  state.json         sha256 của tệp ĐÃ xử lý (tối đa 5 000)
```

Nguồn Lark (`files.sources`, mỗi lần chạy tải mới):

| Loại | Nhập | Cách tải |
|---|---|---|
| Tệp Drive | link `…/file/<token>` | phiên web `webDownload` (Open API `drive/v1/files/<token>/download` khi chỉ có custom app) |
| Lark Sheets | link `…/sheets/<token>` | phiên web: đọc MỌI sheet (≤ 20 000 dòng × 200 cột) → dựng `.xlsx` |
| Ô đính kèm Base | link `…/base/<token>?table=…` + TÊN cột (+ bản ghi tuỳ chọn) | phiên web: đọc đủ bản ghi → tải từng tệp (≤ 50) với `extra.bitablePerm` |

Lỗi tải một nguồn không chặn cả lần chạy — ghi vào `report.sourceErrors` và báo trong lịch sử.

**"Chỉ xử lý tệp mới"** (`files.onlyNewFiles`): so theo NỘI DUNG (sha256) — đổi tên không thành mới, sửa nội dung
thì có. Chỉ lần chạy THÀNH CÔNG mới đánh dấu tệp đã xử lý (hết giờ/hỏng ⇒ lần sau xử lý lại). Không có tệp mới mà
quy tắc làm việc theo tệp ⇒ KHÔNG chạy agent (không tốn lượt AI), lịch sử ghi "Không có tệp mới". Nút "đặt lại" ở
màn sửa quy tắc xoá `state.json`.

## 2. Lượt chạy dùng bộ công cụ như chat

`runScheduledAgentTurn(…, ctx)` với ngữ cảnh tự động hoá:

- Bộ công cụ HỢP NHẤT (`agentTools`): phiên Lark web khi còn sống; + Open API khi có custom app. Chưa có custom app
  vẫn chạy được (trước đây ném "Chưa kết nối Lark"). Bỏ: `schedule_agent_job`, `create_skill`, `update_skill`,
  `skill_save`, `lark_ui_*` (`excludedFromUnattended` — lượt không người trông không cầm công cụ tạo ra chính loại
  lượt đó, xem memory lark-tran-thoi-gian-co-suong).
- Ngữ cảnh tệp theo lượt (`withTurnFiles`): ghi vào `outputs/<lần>`, đọc trong thư mục quy tắc. Bộ phân giải
  đường dẫn (`filePaths`) từ chối thư mục của quy tắc khác / ngoài máy.
- Prompt hợp nhất như chat + khối `buildUnattendedBlock` (thư mục, tệp đầu vào, quyền đã cấp/chưa cấp, luật chống
  trùng, mẫu báo cáo) + kỹ năng của người dùng (`collectSkillsPrompt`).
- Trần giờ 900 s, cắt THẬT bằng `AbortSignal` (giữ nguyên).
- `ask_user` → câu trả lời "không có ai để hỏi" (giữ nguyên).

## 3. Luật duyệt không người trông (`unattendedPolicy.ts`)

| Loại | Ví dụ | Chạy khi |
|---|---|---|
| cộng thêm | thêm bản ghi mới, đính tệp GHI THÊM, tải lên Drive, nhập thành Sheet/Doc, thêm bảng/cột, `send_file` lên Drive/Bitable | luôn (như công tắc "Tự động") |
| ghi đè | sửa bản ghi, ghi theo khoá có dòng phải sửa, ghi vùng Sheet có sẵn, đổi cột/Base, chuyển tệp | quyền **Ghi đè ô / sửa bản ghi có sẵn** |
| thay tệp | `lark_web_attach_file` `replace:true` | quyền **Đính thay tệp** (KHÔNG nằm trong quyền ghi đè) |
| gửi | tin nhắn, `send_file` vào chat, tạo nhóm, mời lịch | quyền **Gửi tin nhắn / gửi tệp vào nhóm** |
| xoá | mọi tool `*delete*`/`*remove*` | quyền **Xoá bản ghi / bảng / cột** |
| không bao giờ | phân quyền Base, sửa/dựng workflow qua giao diện, tạo lịch/kỹ năng, `lark_ui_*` | không ô nào cấp được |

Bị từ chối ⇒ công cụ trả "bị từ chối", agent được dặn không thử lại, và biên bản ghi `skipped` kèm lý do ("cần quyền
… trong mục Quyền khi chạy tự động"). Ô "Gửi báo cáo vào nhóm (chat_id)" của quy tắc là do động cơ gửi sau khi chạy
(người dùng đã đặt rõ nhóm nhận) — cần custom app.

**Quy tắc cũ** (không có trường `permissions`) ở chế độ thực thi: giữ sự cho phép cũ (người dùng từng đồng ý "agent
được thêm/sửa/xoá… không hỏi xác nhận") để lịch đang chạy không hỏng ngầm; màn sửa hiện các ô đã tích + ghi chú,
lưu lại là chỉ còn đúng các quyền đã tích. Quy tắc mới (kể cả do agent tạo bằng `schedule_agent_job`) mặc định
không cấp gì.

## 4. Chạy lặp lại không tạo trùng

- **Ghi theo khoá** — `lark_web_write_records` (phiên web, Open API dự phòng) và `bitable_batch_create_records`
  (Open API, có trên máy chạy hộ) nhận `match_by: ["Mã đơn"]`. `upsertPlan.planUpsert`: khoá chưa có → thêm; khoá
  có, ô giống hệt → không đổi; khoá có, ô khác → SỬA đúng các ô đó; khoá rỗng / trùng trong dữ liệu vào / nhiều bản
  ghi cùng khoá → không ghi dòng đó, báo `rejected`. Khoá chuẩn hoá: bỏ khoảng trắng thừa, không phân biệt hoa
  thường, `12.0 ≡ 12`, nhưng `"001"` giữ là chữ.
- Cờ cộng thêm ĐỘNG (`LarkToolDef.additiveCheck`, chạy ở cả 3 đường thực thi): kế hoạch không có dòng nào phải sửa
  ⇒ cộng thêm (tự duyệt / không cần quyền); có ⇒ ghi đè (chat: hỏi kèm xem trước "N mới · M sửa · K không đổi";
  tự động: cần quyền ghi đè). Kiểm lỗi ⇒ coi như ghi đè (nghi ngờ thì hỏi).
- Đọc lại: dòng mới + dòng sửa đều đọc lại từng ô từ máy chủ (`verified`).
- "Chỉ xử lý tệp mới" ở mục 1.

## 5. Biên bản mỗi lần chạy

`LarkAutomationRun.report` (`autoRunRecorder.ts` bọc từng công cụ, chỉ ghi lần THÀNH CÔNG):

- `inputs` (tên, số dòng với xlsx/csv, từ inputs/ hay sources/), `skippedInputs`, `sourceErrors`
- `read` (bảng + số dòng, tệp đính kèm, tệp cục bộ)
- `written` (bảng/ô, số dòng mới / sửa / không đổi / thao tác, link, `verified`)
- `verify` (số lần đọc lại khớp / lệch), `skipped` (thao tác bị bỏ qua + lý do), `outputs` (tệp kết quả)

Lịch sử chạy (màn Tự động hoá) có nút "Biên bản": đầy đủ các mục trên, link mở bằng trình duyệt, tệp kết quả là
thẻ tệp (Mở / Lưu về / Đưa lên Lark — IPC mở tệp nhận `lark/automations`). Lần chạy HỎNG cũng có biên bản và chỉ
ghi một dòng lịch sử.

## 6. Nơi chạy: app desktop hay máy chạy hộ

- `runOn: 'desktop'` ("Chỉ trên máy này"): máy chạy hộ (`env:'hosted'`) bỏ qua; app desktop chạy KỂ CẢ khi không
  giữ quyền chạy lịch (VM đã bỏ qua nên không chạy trùng).
- Máy chạy hộ không có phiên Lark web và không thấy thư mục trên máy người dùng (chỉ Open API). Màn sửa quy tắc cảnh
  báo khi đã bật "chạy hộ" mà việc dùng tệp/nguồn/phiên web (`needsDesktop`) và chưa chọn "Chỉ trên máy này".
- Máy chạy hộ dùng cùng luật duyệt + biên bản + thư mục `automations/<id>/outputs/<lần>` (dưới thư mục làm việc
  của nó). Bundle vẫn sạch electron (`cd tw-lark-runner && npm run build`).
- Lưu ý: lịch tạo ở Larkwave hiện CHƯA lên ô sao lưu mà máy chạy hộ đọc (xem migrate-from-toolswave.md) — phần VM
  có hiệu lực khi đồng bộ sao lưu theo `slot` được bật.
