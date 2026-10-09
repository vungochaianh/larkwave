# API nội bộ của Lark web (dùng cho "Tạo workflow")

Đo trên tenant thật (`*.sg.larksuite.com`) ngày 09/10/2026, qua CDP Network trên trang Lark đã đăng nhập
trong app (chế độ ẩn `LARKWAVE_HIDDEN=1`). Code: `apps/desktop/main/runtime/lark/larkWebApi.ts`
(parser, có fixture ở `apps/desktop/test/fixtures/lark-web`), `larkWebSession.ts` (gọi),
`webAutomation.ts` (chuyển thiết kế), `tools/larkWeb.ts` (tool cho agent).

## Cách gọi

Mọi request chạy **trong trang Lark** (`webContents.executeJavaScript`), cùng origin với tenant, có
`credentials: 'include'`. Header bắt buộc: `x-csrftoken` = giá trị cookie `_csrf_token` (đã
`decodeURIComponent`). Gắn cho **mọi** phương thức, kể cả GET:

| Thiếu csrf | Kết quả |
|---|---|
| GET `/space/api/explorer/recent/list/` | HTTP 500 |
| POST `/space/api/bitable/:token/tablesv3/` | HTTP 403 `csrf token error` |

Trang phải đang ở đúng origin của tenant (vd `https://lsgav2gopb4m.sg.larksuite.com`). Nếu không,
`webJson()` đưa trang về `/drive/home/` trước. `executeJavaScript` có thể treo khi trang đang chuyển
hướng, nên luôn có hạn giờ (25 giây).

Response chung có dạng `{ code, msg, data }`. `code === 0` là thành công.

## 1. Danh sách Base

`GET /space/api/explorer/recent/list/?length=50&thumbnail_width=1028&thumbnail_height=1028&thumbnail_policy=4&obj_type=8&type_opt=1&rank=6&thumbnail_mode=0[&last_label=…]`

Bộ tham số này chép từ request của chính trang Drive.

```json
{ "code": 0, "data": {
  "entities": { "nodes": { "<token>": { "type": 8, "name": "Base Test", "obj_token": "<token>", "url": "https://…/base/<token>", "edit_time": 1791514924, "open_time": …, "owner_id": "…", "extra": {} } }, "users": {} },
  "node_list": ["<token>", …], "has_more": true, "last_label": "1791256250|7642566917424729821", "total": 0 } }
```

- Phân trang: gửi lại `last_label` cho tới khi `has_more = false`. Tenant thật có 3 trang, ra
  62 Base không trùng nhau.
- `obj_type=8` (bitable) **trả cả Base nằm trong Wiki**. Một Base trong Wiki là nút có `type: 16`, với
  `extra.wiki_subtype = 8`, `extra.wiki_sub_token` = **app_token thật** và `obj_token` = token nút
  wiki. Các nút wiki loại khác cũng xuất hiện, vd `wiki_subtype 22` là docx. Phải lọc chúng ra.
- Thử `obj_type=16` thì ra trùng với kết quả trên, nên không cần gọi.

**Base cũ chưa mở gần đây** (ô tìm kiếm của Drive):
`GET /space/api/search/refine_search/?query=<q>&offset=0&count=50&obj_types=8`
trả về `data.tokens[]` (đã xếp thứ tự) và `data.entities.objs[token] = { token, type, title, url, edit_time, wiki_infos }`.
Trường `title` có thẻ `<em>` bọc phần khớp, cần bỏ đi. Base trong Wiki thì `url` rỗng và link nằm ở
`wiki_infos[0].wiki_url`.

## 2. Cấu trúc Base

`GET /space/api/v1/bitable/:token/clientvars?tableID=<tbl>&viewID=&recordLimit=3&ondemandLimit=3&needBase=true&viewLazyLoad=true&ondemandVer=2&openType=0&noMissCS=true&optimizationFlag=1&removeFmlExtra=true`

Đây là request đầu tiên trang Base gửi. Hai trường `data.base` và `data.table` là **JSON nén gzip rồi
mã base64** (bắt đầu bằng `H4sI`). Giải bằng `zlib.gunzipSync`, trong trang thì dùng `DecompressionStream`.

- `base` = `{ token, name, timezone, isBaseManager, blocks: [id…], blockInfos: { id: { name, blockType?, blockToken? } }, trashBlockMap }`
  - Bảng là các id dạng `tbl…` không có `blockType`.
  - **Khối Quy trình/Workflow** có `blockType: 86`, và `blockToken` chính là `workflowID`.
  - Bỏ các id nằm trong `trashBlockMap`.
- `table` = `{ meta: { id, recordsNum }, views, viewMap, fieldMap, primaryKey, recordMap }`
  - `fieldMap[fld] = { name, type, fieldUIType, property: { options: [{ id, name, color }], tableId (liên kết) } }`.
    Mã `type` trùng với Open API (1 văn bản, 3 chọn một, 4 chọn nhiều, 5 ngày, 11 người, 18 liên kết…).
  - `recordMap[rec][fld] = { value, modifiedTime, modifiedUser }`. Chữ có dạng `[{ type: 'text', text }]`,
    lựa chọn là id `opt…`, ngày là số mili giây.
- Mỗi bảng gọi một lần với `tableID` tương ứng và `recordLimit` nhỏ, chỉ cần GET. Trang Lark tự dùng
  `POST /space/api/bitable/:token/tablesv3/` với body `{ tableIDList, tablePartitionFlagList: [0], … }`:
  endpoint này trả cấu trúc của nhiều bảng một lần (cũng nén gzip) nhưng không kèm bản ghi, và cần csrf.

## 3. Automation và Workflow đang có

- **Automation** (Trung tâm tự động hoá): `GET /space/api/bitable/:token/automation/list` trả về
  `data.workflowList[] = { workflowID, status (1 = bật, 0 = tắt), source (1001), draft, extra, nodeSchema: null, createTime, updateTime }`.
  Lưu ý `draft` và `extra` là **chuỗi JSON**.
  - `draft = { title, steps: [{ id: 'trig…'|'act…', type, data, stepTitle, next: [{ ids: [...] }] }] }`.
    Bảng được viết là `ref_<tbl>`, cột là `ref_<tbl>_<fld>`.
  - `extra = { TableMap: { ref_<tbl>: { TableID, FieldMap: { ref_<tbl>_<fld>: fld }, ViewMap } }, BlockMap, BtnTrigger }`.
- **Workflow dạng khối** (blockType 86): `GET /space/api/bitable/:token/workflow/detail?workflowID=<blockToken>&bizType=2`
  trả về `data.workflow = { draft, extra, nodeSchema, status, source: 2003 }`.
- Không tồn tại `/workflow/list`: gọi vào là 404.
- Cấu hình loại bước: `GET /space/api/bitable/:token/workflow/configs?bizType=2`.

## 4. Tạo automation (ghi)

Phần này đọc từ chính mã trình soạn của Lark (bundle `vb_31004…chunk.js` / `vb_5665…`, class request
manager). Chưa bắt được request thật vì Base "Larkwave Test" chưa có lúc đo.

| Việc | Request |
|---|---|
| Tạo | `POST /space/api/bitable/automation/create` với body `{ token, draft, extra, triggerName, status, [flowSchema, nodeSchema], [source] }` |
| Sửa | `POST /space/api/bitable/automation/update` với body `{ token, workflowID, draft, extra, triggerName, status, … }` |
| Xoá | `POST /space/api/bitable/automation/delete` với body `{ token, workflowID }` (Larkwave không dùng) |
| Danh sách v2 | `POST /space/api/bitable/automation/list/v2` |

- `status`: `0` là tắt, `1` là bật (enum `SD`).
- Trình soạn **chỉ tính và gửi `flowSchema`/`nodeSchema` khi BẬT**. Khi tắt, body chỉ có `draft` + `extra`.
  Lỗi cũ 800004006 ("flow schema is invalid") đến từ việc tự dựng `nodeSchema` để bật, nên bản nháp
  ở trạng thái TẮT không gặp lỗi này.
- `triggerName` theo bảng `_n` của Lark: AddRecord → `addRecord`, hoặc `addRecordV2` nếu cờ
  `ccm.bitable.automation_add_record_v2` bật (mặc định tắt); SetRecord → `setRecord`;
  ChangeRecord → `changeRecord`; Timer → `cron`; Button → `button`/`buttonField`;
  Reminder → `datetimeField`; LarkMessage → `larkMessage`.
- `source`: trình soạn Automation không gửi trường này (server tự gán 1001). Khối Workflow gửi
  `workflow_block` tới `/space/api/bitable/:token/workflow/create`. Muốn tạo khối Workflow mới thì phải
  thêm block qua changeset cộng tác, nên Larkwave **không** tạo khối Workflow qua API.
- Response trả về `data.workflowID`. Sau khi tạo, đọc lại bằng `automation/list` để kiểm.

Larkwave chỉ gọi `automation/create` với `status: 0`. Không có đường nào gửi `status: 1`, và có test
`test/larkWeb.cjs` khoá điều này.

## 5. Open API v3 qua phiên web

- Gọi `/open-apis/base/v3/…` trên origin tenant: HTTP 404, vì gateway web không có route này.
- Gọi `https://open.larksuite.com/open-apis/…` từ trang: bị CORS chặn (`Failed to fetch`). Kể cả khi
  không bị chặn, endpoint này vẫn cần bearer (tenant_access_token hoặc user_access_token).

Kết luận: Open API v3 chỉ dùng được khi người dùng đã kết nối custom app. Trong chế độ Tạo workflow,
đường này là **phụ**: chỉ có trong bộ tool (`bitable_workflow_create`) khi đã có client.

## 6. Ba đường tạo, theo thứ tự ưu tiên

1. **Tạo thẳng qua phiên web**, tool `lark_web_create_automation`. Agent dựng `steps` theo chuẩn v3 và
   được kiểm bằng `validateWorkflowBody` với hồ sơ Base quét từ web. Sau đó `v3ToInternal` chuyển sang
   draft/extra nội bộ, rồi gửi `automation/create` với status 0 và đọc lại.
   - Chỉ hỗ trợ những khuôn đã thấy trong dữ liệu thật: `AddRecordTrigger`, `SetRecordTrigger` (lọc theo
     lựa chọn), `LarkMessageAction` (gửi người dùng nội bộ hoặc "tôi"; tiêu đề; nội dung gồm chữ và ref
     cột của trigger; nút mở bản ghi).
   - Phần **ref cột trong nội dung tin nhắn** dựng theo khuôn `leftValue` của IfElseBranch thật. Phần này
     chưa đối chiếu với một lần lưu thật của trình soạn: cần kiểm khi có "Larkwave Test".
2. **Lái trình soạn Lark** bằng `lark_ui_*` (CDP), trong khung Chromium gắn cạnh hội thoại. Dùng cho mọi
   loại bước chưa hỗ trợ ở đường 1 (rẽ nhánh, nhóm chat, cập nhật bản ghi…). Kết quả được xác nhận bằng
   request lưu mà CDP bắt được (`lark_ui_saved`).
3. **Open API v3** (`bitable_workflow_create`): chỉ khi đã kết nối custom app.
