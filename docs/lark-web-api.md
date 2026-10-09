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
     lựa chọn), `LarkMessageAction` (người nhận: "tôi", id người dùng nội bộ, hoặc **cột Người của bản ghi
     trigger**; tiêu đề; nội dung gồm chữ và ref cột của trigger; nút mở bản ghi). Xem mục 7.
   - Nhiều automation một lần: `lark_web_create_automations` (tạo lần lượt, mục lỗi báo riêng, không
     dừng các mục khác).
2. **Lái trình soạn Lark** bằng `lark_ui_*` (CDP), trong khung Chromium gắn cạnh hội thoại. Dùng cho mọi
   loại bước chưa hỗ trợ ở đường 1 (rẽ nhánh, nhóm chat, cập nhật bản ghi…). Kết quả được xác nhận bằng
   request lưu mà CDP bắt được (`lark_ui_saved`).
3. **Open API v3** (`bitable_workflow_create`): chỉ khi đã kết nối custom app.

## 7. Người nhận là cột Người, và ref cột trong nội dung (đo 09/10/2026)

Đọc từ một automation THẬT đang chạy trên tenant (người nhận là một cột của bản ghi), rồi tạo thử
trong Base Test và mở lại trong trình soạn của Lark: ô "To" hiện `Record added in… › Sales phụ trách`.
Fixture: `apps/desktop/test/fixtures/lark-web/automation-person-field.json`.

```json
"persons": [{
  "fields": [{ "fieldId": "ref_<tbl>_<fld>", "type": 11 }],
  "id": "<trigId>-<tbl>-<fld>-<số ngẫu nhiên>",
  "stepId": "<trigId>", "stepNum": 1, "stepType": "AddRecordTrigger",
  "tableId": "ref_<tbl>", "tagType": "step", "type": "ref", "value": "step", "recordInfo": {}
}],
"groups": [ …bản sao y hệt persons… ]
```

- `groups` trong mọi bản Lark lưu đều là **bản sao của `persons`** (cả với người dùng lẫn cột).
- Ref cột trong `richTextContent` cùng khuôn đó, thêm `"extra": {}`; `value` là chữ `"step"` (không phải
  tên cột), đuôi `id` là số ngẫu nhiên (không phải mã kiểu cột).
- Kiểu cột nhận được làm người nhận: 11 Người, 1003 Người tạo, 1004 Người sửa, 19 Tra cứu.
- Thiết kế v3: `receiver: [{ "value_type": "ref", "value": "$.<trigger>.<fld…>" }]` (nhận cả khi bọc trong
  `value_type: "user"`). Nhóm chat vẫn chưa có khuôn → lái trình soạn.

## 8. Dựng cấu trúc Base (thêm bảng / cột / lựa chọn)

**Không có endpoint HTTP.** Bắt mạng khi thêm cột trên Lark web: trang gửi changeset cộng tác qua
websocket "frontier":
`{ type: "BITABLE_TABLE", data: { type: "USER_CHANGES", member_id, user_ticket, token: <tbl>, localRev, operations: "H4sI…" } }`
(`operations` giải ra `[{ command: "AddField", actions: [{ action: "data.addField", … }, { action: "data.setFieldAttr", … }] }]`).
Tự dựng lại đường này là phải giữ đúng `localRev`, `member_id`, `user_ticket` của chính trang — lệch là
`accept_commit_error_rev`. Larkwave KHÔNG làm vậy.

Thay vào đó gọi đúng **lớp lệnh** giao diện Lark gọi khi người dùng bấm (đo bằng cách bọc các hàm rồi
thao tác tay; trang tự lo phiên bản, đồng bộ, lưu):

```js
ctx = [...window.bitableConnectContexts].find(c => c.base.getToken() === token && c.base.isLoaded())
ctx.operate.baseOperate.addTable({ sourceTableId: null, parentId: null, exInfo: { contentCreation: false } })
  // → { result: 2, data: { tableId }, operation: { actions: [{ data: { snapshot: { recordMap: {5 dòng trống} } } }] } }
ctx.operate.baseOperate.setBlock({ id: tableId, name })                       // đổi tên bảng
ctx.operate.tableOperate.setField({ tableId, fieldId, data: { ...field, name } })  // đổi tên cột chính
ctx.operate.tableOperate.addField({ tableId, data: { type, name, property, fieldUIType, exInfo, defaultValueRule: null } })
  // → { result: 2, data: { fieldId } }
ctx.operate.tableOperate.addSelectFieldOption({ tableId, fieldId, names: [...] })
ctx.operate.tableOperate.delRecords({ tableId, recordIds })                    // CHỈ dòng trống addTable vừa sinh
```

`result`: 2 = thành công, 0 = không đổi gì, 1 = lỗi (`reason`). Trang phải đang mở đúng Base (tool tự
đưa khung Lark tới Base và chờ ngữ cảnh sẵn sàng). Khuôn `data` của từng loại cột (đã tạo thử đủ 10 loại
và đọc lại bằng clientvars):

| loại | type | fieldUIType | property |
|---|---|---|---|
| text | 1 | Text | null |
| number | 2 | Number | `{ formatter: "0" }` |
| single_select / multi_select | 3 / 4 | SingleSelect / MultiSelect | `{ options: [{ name, color, id: "opt…" }], optionsType: 0 }` |
| date | 5 | DateTime | `{ autoFill: false, dateFormat: "yyyy/MM/dd", timeFormat: "" }` |
| checkbox | 7 | Checkbox | null |
| person | 11 | User | `{ multiple: false }` |
| phone / url / attachment | 13 / 15 / 17 | Phone / Url / Attachment | null |

`exInfo` luôn là `{ disableCredential: true, colOrCustomRowType: "custom", customRows: 5 }`.

- Lark **tự thêm 5 dòng trống** khi tạo bảng (nằm trong snapshot của addTable). Tool chỉ xoá đúng các id
  đó và chỉ khi chúng vẫn trống hoàn toàn.
- **Đọc lại bị trễ**: clientvars đọc ngay sau khi trang lưu có thể chưa thấy cột mới (thấy sau vài giây).
  Tool đọc lại tối đa ~15 giây trước khi kết luận.
- Tool: `lark_web_add_table`, `lark_web_add_fields` (chỉ cộng thêm: cột trùng tên bỏ qua, không đổi kiểu,
  không xoá). Code: `baseStructure.ts`.

## 9. Duyệt thao tác ghi và hạn chờ của Claude CLI

- Màn Tạo workflow có công tắc **"Tự động (không hỏi lại)"** (mặc định BẬT, lưu riêng máy này ở
  `machine-prefs.json`). Khi BẬT, tool có cờ `additive` (tạo automation TẮT, thêm bảng/cột/lựa chọn, áp mẫu
  thành nháp) chạy không hỏi. Xoá / ghi đè / sửa cái đang có không bao giờ có cờ đó nên vẫn hỏi. Luật nằm
  ở một chỗ: `needsConfirmation` (larkToolExec.ts).
- Claude CLI 2.1.286, server MCP kiểu HTTP: mỗi POST bọc hạn **60 giây** (`AbortSignal`, lỗi "The operation
  timed out."), sau đó CLI gỡ luôn server ("MCP server "lark" is not connected"). Hạn đọc từ trường
  `timeout` của cấu hình server, rồi `MCP_TOOL_TIMEOUT`; hạn im lặng `CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT`
  (mặc định 5 phút). Larkwave đặt cả ba = 15 phút (dài hơn hạn chờ duyệt 10 phút của ta), và trả
  `tools/call` bằng SSE kèm `notifications/progress` mỗi 15 giây khi client nhận SSE.
- Đo lại: một lượt "Hỏi trước khi ghi" chờ 130 giây ở MỖI hộp xác nhận (2 hộp) rồi mới duyệt — cả hai
  thao tác chạy xong, không lỗi hạn giờ, không rớt kết nối.

## 10. Tự kiểm khung Lark

- Lớp chặn thu thập trong trang (`BLOCKING_COLLECT_JS`: dialog/alertdialog/modal/drawer/popover/toast
  đang hiện) rồi phân loại (`classifyBlocking`): `unsaved-record` ("You haven't submitted the record.
  Edits made will not be saved." [Back to Edit] [Exit]), `confirm-dialog`, `record-form` (ngăn kéo thêm
  bản ghi có nút Submit), `dialog`, `error-toast`, `panel`. Mọi kết quả `lark_ui_act`/`lark_ui_snapshot`
  kèm `blocking` khi có.
- `lark_ui_dismiss`: Escape trước; còn thì bấm nút có tên an toàn (Exit/Thoát/Cancel/Huỷ/Close/Đóng/取消…),
  không bao giờ Xoá/Bật/Lưu/Gửi/Xác nhận. Đo thật: form đã gõ → Escape → hiện hộp "chưa gửi" → Exit → sạch.
- `lark_ui_health`: URL, lớp chặn, số thao tác còn lại. Trần thao tác mỗi lượt: 200.
