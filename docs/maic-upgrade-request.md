# Yêu cầu nâng cấp MAIC — để tích hợp codegen Toolswave

> Gửi: đội vận hành/phát triển MAIC.
> Từ: Toolswave (token `tich-hop-he-thong-ngoai`).
> Mục tiêu: dùng `POST /v1/runs` (agent sửa code nhiều bước) làm nền cho tính năng
> **codegen theo yêu cầu** của Toolswave. `/v1/ask` (chat) đã tích hợp tốt — phần này
> **không đề nghị đổi gì**.

---

## ✅ TRẠNG THÁI (xác minh 2026-08-25) — MAIC đã nâng cấp, còn 5 điểm cần chỉnh

MAIC đã triển khai gần hết yêu cầu bên dưới. Test thật với token `tich-hop-he-thong-ngoai`:

**Đã match (chạy được):**
- ✅ Workspace tạm trong `/v1/runs` (`workspace.files` / `tarballBase64` / `git`) + `returnFiles`.
- ✅ Lấy file ra: `GET /v1/runs/:id/files` + `/archive`.
- ✅ Project bền qua API: `POST /v1/projects` → **201** (trước 404), `GET /v1/projects` thấy `owned:true`.
- ✅ Schema SSE đầy đủ (bảng event) + `maic.finished` mang token + filesChanged.
- ✅ Token thật cho **runs**: `inputTokens/outputTokens/cacheReadTokens/cacheCreationTokens`.
- ✅ npm install + network trong run; giới hạn kích thước + TTL 24h + cô lập theo token.

**Đã fix (xác minh lại 2026-08-25, lần 2):**
1. ✅ **`/v1/ask` giờ trả token thật** — `inputTokens/outputTokens/cacheReadTokens/cacheCreationTokens` (test: keys đầy đủ). Toolswave đã đổi metering sang **token thật** (fallback costUsd chỉ khi thiếu).
2. ✅ **`DELETE /v1/projects/:id` → 200** `{"ok":true,"note":"Đã xoá cả bản ghi lẫn thư mục."}` (trước 400).
3. ✅ Doc `/v1/ask` hết trùng key `costUsd`.
4. ✅ Mục `/v1/runs` project bền đã thống nhất (tạo bằng API HOẶC admin).
5. ➕ Bonus: thêm luồng **git push** (`workspace.git.push` + SSE `maic.git_push` + trường `gitPush`) — đúng phương án git mình gợi ý.

**Còn lại (không chặn):**
- **Đồng thời `maxConcurrent=3`/token** — thấp cho quy mô nhiều user. Xin nâng khi lên production (config phía MAIC, không phải doc).

> Kết luận: spec **ĐÃ ĐỦ + ĐÃ XÁC MINH** để build cả Phase 1 (chat) chính xác lẫn Phase 2 (codegen qua workspace tạm / project bền / git).

---

## 1. Bối cảnh & mục tiêu

Toolswave là nền tảng "prompt → app": người dùng nhập một yêu cầu → hệ thống sinh
**một app hoàn chỉnh MỚI** (frontend + backend + DB + trang quản trị) → build →
**deploy ra Cloudflare Pages** → trả link công khai.

Đặc điểm quan trọng cho việc tích hợp:
- Mỗi app là **một bộ file mới, sinh theo yêu cầu** (không biết trước, không cố định).
- Số lượng lớn, đồng thời (nhiều user, nhiều app cùng lúc).
- **Bắt buộc lấy được file kết quả về** để Toolswave build + deploy trong pipeline
  riêng (Cloudflare). Commit tại chỗ trên VPS MAIC **không dùng được** cho luồng này.
- Có luồng **sửa lại app đã có** (iterate): người dùng chat tiếp để chỉnh app.

Chúng tôi muốn nâng codegen từ "một phát" (`/v1/ask` một lần) lên **agent thật**
(tự lập kế hoạch, sửa nhiều file, tự chạy/tự sửa lỗi) — đúng thứ `/v1/runs` làm.

---

## 2. Vướng mắc hiện tại (đã kiểm chứng thực tế)

`/v1/runs` hiện chỉ chạy trên **project có sẵn trên VPS MAIC**, và:

1. **Không có API tạo project.** Spec ghi "người vận hành tạo qua màn quản trị".
   Đã thử và đều thất bại:
   - `POST /v1/projects` → 404 *Không có route*
   - `POST/PUT /v1/projects/:name`, `/v1/projects/:name/files`, `/v1/projects/import`,
     `/v1/import`, `/v1/git`, `/v1/upload` → 404 *Không có route*
   - `POST /v1/runs` kèm `files` / `git` / `createProject:true` trong body → vẫn
     `404 Project "…" chưa được tạo`
   - `GET /v1/projects` với token của chúng tôi → `{"projects":[]}` (rỗng), dù
     `/v1/whoami` cho thấy `projects:["*"]`.

2. **Không có API đưa file VÀO / lấy file RA.** Không có cách nào để nạp bộ file app
   của Toolswave vào một project, cũng không có cách lấy file đã sửa ra. Repo sống
   trên máy MAIC; kết quả chỉ là commit tại chỗ.

→ **Hệ quả:** không thể dùng `/v1/runs` cho codegen theo yêu cầu — không tạo được
project cho từng app, và không lấy được file về để deploy.

---

## 3. Đề nghị nâng cấp (tối thiểu để dùng được)

Cần 3 khả năng, **tất cả qua API bằng token `maic_sk_*`** (không phải vào admin):

| # | Khả năng | Vì sao cần |
|---|---|---|
| A | **Tạo workspace/project qua API** (ưu tiên: workspace *tạm* theo từng run) | Mỗi app là một workspace mới; không thể tạo tay |
| B | **Đưa file VÀO** workspace (nạp bộ file nguồn ban đầu) | Agent cần có file để sửa (template / app hiện tại) |
| C | **Lấy file RA** sau khi run xong (toàn bộ file cuối, hoặc diff) | Để build + deploy trong pipeline Toolswave |

Kèm 1 việc nhỏ: **làm rõ hợp đồng run** (event SSE + số token) để đo hạn mức đúng.

---

## 4. Thiết kế API đề xuất (bản mẫu — để tham khảo khi implement)

Chúng tôi đề xuất **mô hình workspace tạm theo run** vì nó đơn giản nhất và khớp
codegen (mỗi app = một run độc lập). Kèm phương án **project bền** cho luồng iterate.

### 4.1 Phương án chính — workspace tạm, ngay trong `/v1/runs`

Cho phép `/v1/runs` nhận **file nguồn inline** và trả về **file kết quả**, không cần
project tạo trước:

```jsonc
// POST /v1/runs
{
  "prompt": "Sinh app quản lý công việc: React + API + SQLite…",
  "workspace": {                      // MỚI: nếu có, MAIC tạo workspace tạm từ đây
    "files": [                        //   (thay cho "project" bắt buộc)
      { "path": "package.json", "content": "…" },
      { "path": "src/App.tsx",   "content": "…" }
    ]
    // hoặc: "tarballBase64": "…"     //   (khi nhiều file / có file nhị phân)
    // hoặc: "git": { "url": "https://…", "ref": "main", "token": "…" }
  },
  "model": "claude-opus-5",
  "permissionMode": "bypassPermissions", // để agent chạy được npm install + build + test
  "timeoutSec": 1200,
  "returnFiles": "changed"           // MỚI: "changed" | "all" | "none"
}
```

```jsonc
// 202
{ "run": { "id": "run_XXXX", "status": "queued" }, "streamUrl": "/v1/runs/run_XXXX/events" }
```

Lấy kết quả (một trong hai):

```
GET /v1/runs/:id/files            → { "files": [ { "path": "...", "size": 1234, "changed": true } ] }
GET /v1/runs/:id/files?path=...   → nội dung 1 file (raw)
GET /v1/runs/:id/archive          → tải tarball/zip toàn bộ workspace cuối
```

> Với app lớn, `GET /v1/runs/:id/archive` (tarball) là đủ và gọn nhất — Toolswave
> tự giải nén vào pipeline build.

### 4.2 Phương án bền — project tạo bằng API (cho iterate)

Để hỗ trợ "sửa lại app đã có" qua nhiều lượt mà không nạp lại toàn bộ file:

```
POST   /v1/projects                 { "name"?: "...", "files"|"tarballBase64"|"git": … , "ephemeral": true, "ttlHours": 24 }
                                      → { "project": { "id": "prj_XXXX", "expiresAt": "…" } }
PUT    /v1/projects/:id/files        { "files": [ … ] }           // ghi/đè file
GET    /v1/projects/:id/files        → danh sách file
GET    /v1/projects/:id/archive      → tải toàn bộ
DELETE /v1/projects/:id              // dọn dẹp
```

Khi đó `/v1/runs` giữ nguyên (`{ "project": "prj_XXXX", "prompt": … }`).

### 4.3 Làm rõ hợp đồng `/v1/runs` (không phá tương thích)

1. **Event SSE**: xin tài liệu hoá schema từng dòng `data:` — các loại event
   (`log`, `tool_use`, `file_changed`, `usage`, `status`, `done`, `error`) + hình
   dạng payload. Toolswave cần map sang UI tiến trình build.
2. **Số token**: xin trả **`inputTokens` / `outputTokens`** trong kết quả run
   (`GET /v1/runs/:id`) — không chỉ `costUsd`. Hệ thống hạn mức của Toolswave tính
   theo **token thật**, nên cần con số token để trừ đúng % gói.
3. **Huỷ + timeout**: xác nhận `POST /v1/runs/:id/cancel` + `timeoutSec` áp dụng cho
   workspace tạm (để nút "Dừng" không để run treo tốn tài nguyên). (Spec đã có, chỉ
   xin xác nhận áp dụng cho luồng mới.)
4. **bash/network trong run**: xác nhận agent ở `bypassPermissions` **chạy được**
   `npm install` + build + test (có internet để cài dependency). Đây là điều kiện để
   agent tự kiểm chứng app trước khi trả file.

---

## 5. Luồng end-to-end Toolswave mong muốn

```
1. Toolswave (server) → POST /v1/runs { prompt, workspace.files: <template/app hiện tại>,
                                        permissionMode: bypassPermissions, returnFiles: "all" }
2. ← 202 { run.id, streamUrl }
3. Toolswave bám GET /v1/runs/:id/events (SSE) → đẩy tiến trình lên UI người dùng
4. Khi status = succeeded → GET /v1/runs/:id/archive → giải nén
5. Toolswave build + deploy Cloudflare (pipeline sẵn có) → trả link cho user
6. (iterate) lượt sau nạp lại app hiện tại như bước 1, hoặc dùng project bền (4.2)
```

---

## 6. Ràng buộc & bảo mật mong muốn

- **Cô lập theo token**: workspace/project của token này không đọc/ghi được của token
  khác (Toolswave sẽ dùng token riêng, không phải token `*` chung).
- **Ephemeral mặc định**: workspace tạm tự xoá sau khi tải kết quả hoặc sau TTL
  (vd 24h) để không phình đĩa VPS.
- **Giới hạn kích thước**: xin cho biết trần số file / dung lượng workspace / dung
  lượng tarball để chúng tôi cắt phù hợp.
- **Đồng thời**: hiện `maxConcurrent` = 3 cho token của chúng tôi. Cho codegen quy mô
  người dùng, xin trao đổi mức phù hợp (hoặc hàng đợi có nhìn thấy được).

---

## 7. Tiêu chí nghiệm thu (để Toolswave tích hợp xong)

- [ ] Tạo được workspace/run **bằng API** (không vào admin), nạp được bộ file nguồn.
- [ ] `GET /v1/runs/:id/archive` (hoặc `/files`) trả về **đúng bộ file sau khi agent sửa**.
- [ ] Agent `bypassPermissions` chạy được `npm install` + build (có network).
- [ ] `GET /v1/runs/:id` trả **`inputTokens`/`outputTokens`** (không chỉ `costUsd`).
- [ ] SSE có schema rõ ràng cho log/tiến trình/kết thúc; dòng tự đóng khi xong.
- [ ] `POST /v1/runs/:id/cancel` dừng được run trên workspace tạm.
- [ ] Cô lập theo token + workspace tạm tự dọn theo TTL.

---

## 8. Ghi chú

- Nếu MAIC ưu tiên **git** thay vì file inline/tarball: chúng tôi chấp nhận luồng
  "MAIC clone repo Toolswave cấp → agent sửa + push lên nhánh → Toolswave pull". Cần
  MAIC nhận `git: { url, ref, token }` ở `/v1/runs` và push kết quả lên nhánh chỉ định.
- Trước khi có bản nâng cấp này, Toolswave vẫn chạy codegen bằng đường nội bộ (một
  phát + pipeline hiện có); `/v1/ask` (chat) đã tích hợp và hoạt động tốt.
- Token nên phát **riêng cho Toolswave** (thu hồi độc lập), thay cho token `*` hiện tại.

---

## 9. YÊU CẦU MỚI (2026-08-26): Streaming cho `/v1/ask` (chat gõ dần như Claude)

**Bối cảnh:** Trang "Trợ lý AI" (web + desktop) đang dùng `/v1/ask` một-phát → người dùng
phải chờ **toàn bộ** câu trả lời rồi mới hiện ra một lúc. Muốn trải nghiệm **gõ dần
(token streaming)** như claude.ai / ChatGPT.

**Xin bổ sung chế độ streaming cho `/v1/ask`** (giữ nguyên đường một-phát cũ để tương thích):

- **Kích hoạt:** POST `/v1/ask` với body thêm `"stream": true` **và** header `Accept: text/event-stream`.
  (Nếu MAIC thích endpoint riêng `/v1/ask/stream` cũng được — báo lại để chúng tôi trỏ đúng.)
- **Đáp:** `Content-Type: text/event-stream`, mỗi sự kiện là 1 dòng `data: <json>` cách nhau bằng dòng trống:
  - `data: {"type":"delta","text":"<mảnh văn bản>"}` — từng mảnh token, phát liên tục.
  - `data: {"type":"done","sessionId":"...","inputTokens":N,"outputTokens":N,"cacheReadTokens":N,"cacheCreationTokens":N,"costUsd":N,"runId":"...","durationMs":N}` — sự kiện kết thúc (mang token thật để chúng tôi đo hạn mức, giống `/v1/ask` hiện tại).
  - `data: {"type":"error","message":"..."}` — lỗi; sau đó đóng luồng.
  - Đóng luồng khi xong (như SSE của `/v1/runs`).
- **Tham số:** giữ y hệt `/v1/ask` hiện tại — `prompt`, `systemPrompt`, `model`, `sessionId` (đa lượt),
  `jsonSchema`, `effort`, `timeoutSec`. Với `jsonSchema` thì có thể chỉ cần bắn `done` kèm `structured` (không cần delta).
- **Xác thực/hạn mức:** như cũ (Bearer token; token thật ở `done`).

**Phía Toolswave đã sẵn sàng (không cần chờ):** `MaicService.askStream()` đã được viết theo đúng
hợp đồng trên và **tự phát hiện** — nếu MAIC vẫn trả JSON một-phát (chưa bật streaming), nó gộp cả
câu thành 1 delta (hành vi như hiện tại); khi MAIC trả `text/event-stream`, nó parse delta và đẩy
gõ-dần lên UI **tự động**, không cần Toolswave đổi code. → Chỉ cần MAIC bật là chạy.

### 9.2 ✅ ĐÃ XONG (2026-08-29) — streaming `/v1/ask` chạy thật

MAIC đã bật SSE cho `/v1/ask` (commit MAIC `3e3ca80`). Xác minh lại **qua đúng tên miền công khai
`apia.toolswave.net`** (không phải gọi thẳng gateway):

```
[ 4.35s] mảnh chữ đầu tiên
[ 5.03s] ... 13 mảnh, kích thước + nhịp KHÔNG đều
[12.77s] mảnh cuối
[13.32s] done
```

Mảnh đầu ~4s, trải đều 8.4s ⇒ **token thật từ gateway** (không còn nhịp 16ms của đường phát-lại).
Cloudflare không gom đệm (đã có `X-Accel-Buffering: no`). **Toolswave không đổi dòng code nào** — đúng thiết kế forward-compatible của `askStream()`.

Ghi chú tương thích từ MAIC (đã nắm):
- Nhận cả `"stream": true` (body) lẫn `Accept: text/event-stream` (header). Đường một-phát cũ giữ nguyên.
- Có thêm event `{"type":"status","phase":"thinking"}` (phát 1 lần khi model lập dàn ý trước khi viết). `askStream()` của Toolswave **bỏ qua type lạ** an toàn; UI đã có sẵn chỉ báo "Đang suy nghĩ…" lấp khoảng lặng đó.
- Lưới an toàn của MAIC: nếu không rút được mảnh nào thì phát nguyên câu thành 1 delta trước `done`.
- `maxConcurrent` đã nâng lên **20/token** (20 agent / 24 hỏi-đáp song song); `GET /v1/whoami` trả cả queue để điều tiết nhịp gửi.

### 9.1 Xác minh 2026-08-29 — `/v1/ask` VẪN CHƯA stream (nhắc lại đề nghị) [ĐÃ GIẢI QUYẾT, xem §9.2]

Chạy 1 lượt chat hosted thật qua `app.toolswave.net/claude` và đo mốc thời gian từng mảnh về UI:

```
[12.67s] mảnh đầu tiên     ← chờ ~12.7s không có gì
[12.69s] ...               ← các mảnh cách nhau ĐÚNG 16ms
[13.23s] mảnh cuối → done  ← toàn bộ câu về trong ~0.5s
```

Các mảnh cách nhau **16ms** = đúng `sleep(16)` trong đoạn phát-lại phía Toolswave ⇒ **MAIC trả nguyên
câu 1 lần** (Content-Type KHÔNG phải `text/event-stream`), Toolswave chỉ "giả gõ" lại. Trải nghiệm:
người dùng chờ ~12s spinner rồi hiện hết một lúc — **chưa phải streaming thật**.

**Đề nghị (nhắc lại):** bật SSE cho `/v1/ask` theo đúng hợp đồng mục 9 ở trên.

**MAIC tự kiểm tra sau khi bật** (chạy trên máy MAIC hoặc bất kỳ máy nào có token):

```bash
curl -N -s "$MAIC_URL/v1/ask" \
  -H "Authorization: Bearer $MAIC_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{"prompt":"Đếm chậm từ 1 đến 20, mỗi số một dòng.","stream":true}'
```

**Đạt** khi: response header có `Content-Type: text/event-stream`; các dòng `data: {"type":"delta","text":"…"}`
**về rải rác theo thời gian model đang sinh** (mảnh đầu ~1–2s, KHÔNG dồn hết vào cuối); kết thúc bằng
`data: {"type":"done", …tokens…}`. **Chưa đạt** khi: trả `application/json` một cục, hoặc mọi `delta`
dồn về cùng lúc ở giây cuối.

> Ngay khi test trên "Đạt", trang Trợ lý AI của Toolswave sẽ gõ-dần token realtime **mà không cần đổi
> code** (đã xác nhận đường tiêu thụ SSE hoạt động — chỉ thiếu nguồn stream từ MAIC).
