'use client'

import React from 'react'
import { Card, Typography, Tag, Space, Button } from 'antd'
import { SafetyOutlined, DownloadOutlined, PrinterOutlined } from '@ant-design/icons'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const { Title, Text } = Typography

const MD_CONTENT = `
## 1. Tổng quan

### Bài toán
Lark Base (gói hiện tại) giới hạn **20,000 records per table**. Dữ liệu cũ chiếm slot, làm chậm hệ thống. Cần cơ chế tự động di rời records cũ sang base archive.

### Giới hạn Lark Base (gói hiện tại)

| Giới hạn | Giá trị |
|----------|---------|
| Records per table | **20,000** |
| Bảng per base | 100 (tổng bảng + dashboard + tài liệu = 300) |
| Thư mục per base | 100 |
| Trường per bảng | 300 |
| Views per bảng | 200 |
| Điều kiện nhóm per view | 3 |
| Điều kiện lọc per view | 50 |
| Đính kèm per bảng | 20,000 |
| Đính kèm per ô | 100 |
| Kích thước đính kèm | Max 2 GB/file |
| Import file | Max 20 MB (.base, .xlsx, .csv) |
| Copy hàng cùng lúc | 20,000 |
| Chỉnh sửa đồng thời | 200 người |
| Xem đồng thời | 5,000 người |

### Giải pháp

\`\`\`
Bảng A1 (Base A) — records có backup_status = "backup-042026"
    │
    │ Automation cuối tháng (API)
    ▼
Bảng A-A1-042026 (Base A') — archive
    • Copy records qua API
    • Cùng folder → cùng quyền
    • Xoá records cũ khỏi A1
\`\`\`

---

## 2. Cột \`backup_status\` (Formula)

### Công thức mặc định (theo tháng)

\`\`\`
IF([Ngày tạo] = "", "", CONCAT("backup-", TEXT([Ngày tạo], "MMYYYY")))
\`\`\`

→ Record 15/04/2026 → \`backup-042026\`

### Tuỳ chỉnh chu kỳ

| Chu kỳ | Formula | Output |
|--------|---------|--------|
| **Tháng** | \`CONCAT("backup-", TEXT([Ngày tạo], "MMYYYY"))\` | \`backup-042026\` |
| **Quý** | \`CONCAT("backup-Q", TEXT(CEILING(MONTH([Ngày tạo])/3,1)), TEXT([Ngày tạo], "YYYY"))\` | \`backup-Q22026\` |
| **Tuần** | \`CONCAT("backup-W", TEXT(WEEKNUM([Ngày tạo]), "00"), TEXT([Ngày tạo], "YYYY"))\` | \`backup-W182026\` |

### Tại sao Formula thay vì cột ngày?

- **Máy hiểu:** filter exact text \`backup-042026\` thay vì date range
- **Người hiểu:** "backup-042026" = rõ ràng cần backup
- **Tuỳ chỉnh:** đổi formula = đổi chu kỳ, không đổi automation
- **Nhiều cột ngày:** Formula quyết định dùng ngày nào

---

## 3. API đã kiểm nghiệm trong codebase

### 3.1. Tạo Base ✅

\`\`\`http
POST /open-apis/bitable/v1/apps
Authorization: Bearer {user_access_token}
Body: { "name": "Archive — Base A" }
→ { "app": { "app_token": "xxx", "url": "..." } }
\`\`\`

**File:** \`api-lark-all/routes/lark.route.js\` → \`POST /bases\`

### 3.2. Tạo Table + Fields ✅

\`\`\`http
POST /open-apis/bitable/v1/apps/{app_token}/tables/batch_create
Body: { "tables": [{ "name": "A-A1-042026" }] }
\`\`\`

**Giới hạn:** Max 3 tables/request. Auto-tạo primary "Title" field.

**File:** \`lark.route.js\` → \`POST /bases/build-from-schema\` — tạo base + tables + fields 1 call.

### 3.3. Search records theo backup_status ✅

\`\`\`http
POST /open-apis/bitable/v1/apps/{app_token}/tables/{table_id}/records/search
Body: {
  "filter": {
    "conjunction": "and",
    "conditions": [{
      "field_name": "backup_status",
      "operator": "is",
      "value": ["backup-042026"]
    }]
  },
  "page_size": 500
}
\`\`\`

**File:** \`lark.route.js\` → \`POST /records/search\` — hỗ trợ \`fetchAll: true\` auto-pagination.

### 3.4. Batch Create (copy sang archive) ✅

\`\`\`http
POST /open-apis/bitable/v1/apps/{app_token}/tables/{table_id}/records/batch_create
Body: { "records": [{ "fields": {...} }, ...] }
\`\`\`

**Giới hạn:** Max **1000 records/request**. Cần loop nếu nhiều hơn.

### 3.5. Batch Delete ✅

\`\`\`http
POST /open-apis/bitable/v1/apps/{app_token}/tables/{table_id}/records/batch_delete
Body: { "records": ["recXXX", "recYYY"] }
\`\`\`

**Giới hạn:** Max **500 records/request**.

### 3.6. Schema Patch (tạo fields cho archive table) ✅

\`\`\`http
POST /bases/patch-schema
\`\`\`

**File:** \`lark.route.js\` → non-destructive schema updates. Thêm fields mới, không xoá cũ.

### 3.7. Permission — Clone quyền tự động ⚠️

#### Cách 1: Cùng folder (đơn giản nhất) ✅
- Lark Base kế thừa quyền từ **folder cha**
- Tạo archive base **cùng folder** với base gốc → tất cả users có quyền gốc **tự động** có quyền archive
- **Không cần code gì thêm**

#### Cách 2: Clone permission qua API (chính xác hơn)

**Bước 1 — Lấy danh sách members của base gốc:**
\`\`\`http
GET /open-apis/drive/v1/permissions/{source_app_token}/members
Authorization: Bearer {tenant_access_token}
Query: type=bitable
\`\`\`

**Bước 2 — Gán quyền cho archive base:**
\`\`\`http
POST /open-apis/drive/v1/permissions/{archive_app_token}/members
Authorization: Bearer {tenant_access_token}
Body: {
  "member_type": "userid",
  "member_id": "ou_xxx",
  "perm": "full_access",
  "type": "bitable"
}
\`\`\`

**Perm levels:** \`full_access\` (đọc+sửa), \`view\` (chỉ xem)

#### Cách 3: Inherit từ shared folder + downgrade quyền
- Archive base tạo cùng folder → user có full access
- Gọi API update permission → downgrade thành \`view\` only
- → User xem được archive nhưng **không sửa được** (bảo vệ data backup)

#### ⚠️ Vấn đề: Quyền nâng cao per-table trong Lark Base

Lark Base hỗ trợ **phân quyền cấp bảng** (Advanced Permissions):
- User A: chỉ xem bảng X, sửa được bảng Y
- User B: xem tất cả, không sửa
- Mỗi bảng có quyền riêng: \`manage\`, \`edit\`, \`view\`, \`none\`

**Vấn đề khi backup:**
- Base gốc có 5 bảng, mỗi bảng quyền khác nhau per user
- Archive base mới → **mất hết cấu hình per-table permission**
- Cách 1 (cùng folder) chỉ cho base-level, KHÔNG per-table

#### Giải pháp cho per-table permission

**API Lark Base Role & Permission (nâng cao):**

\`\`\`http
# 1. Lấy danh sách roles trong base gốc
GET /open-apis/bitable/v1/apps/{app_token}/roles
→ { "roles": [{ "role_id": "xxx", "role_name": "Phòng XNK", "table_perm": {...} }] }

# 2. Lấy chi tiết quyền per table của 1 role
GET /open-apis/bitable/v1/apps/{app_token}/roles/{role_id}
→ {
    "role": {
      "table_roles": [
        { "table_id": "tblXXX", "table_perm": { "read": true, "write": true, "manage": false } },
        { "table_id": "tblYYY", "table_perm": { "read": true, "write": false, "manage": false } }
      ],
      "block_roles": [...],
      "members": [{ "member_id": "ou_xxx", "member_type": "user" }]
    }
  }

# 3. Tạo role tương tự trong archive base
POST /open-apis/bitable/v1/apps/{archive_app_token}/roles
Body: { "role_name": "Phòng XNK" }

# 4. Gán quyền per table cho role
PUT /open-apis/bitable/v1/apps/{archive_app_token}/roles/{new_role_id}
Body: {
  "table_roles": [
    { "table_id": "tblArchiveXXX", "table_perm": { "read": true, "write": false } }
  ]
}

# 5. Gán members vào role
POST /open-apis/bitable/v1/apps/{archive_app_token}/roles/{new_role_id}/members
Body: { "member_list": [{ "member_id": "ou_xxx", "member_type": "user" }] }
\`\`\`

#### Flow clone per-table permission

\`\`\`
STEP 3.5: Clone permissions
    │
    │  a. GET /roles từ base gốc → danh sách roles
    │  b. Với mỗi role:
    │     │  GET role detail → table_perm + members
    │     │  POST tạo role mới trong archive base
    │     │  Map table_id gốc → table_id archive
    │     │  PUT gán table_perm (downgrade write → read cho archive)
    │     │  POST gán members
    │  c. Done
    │
    ▼
STEP 4: Copy records...
\`\`\`

#### Mapping table ID

Vì archive tạo table mới → table_id khác base gốc. Cần mapping:

| Base gốc | Archive |
|----------|---------|
| tblXXX (A1 - Vận Đơn) | tblAAA (A1-042026) |
| tblYYY (A2 - Chi Tiết) | tblBBB (A2-042026) |

Mapping này lưu trong **Archive Index** để dùng cho:
- Clone permission
- Tìm kiếm cross-base
- Tổng kết dashboard

#### Recommendation

| Tình huống | Cách | Per-table? |
|-----------|------|-----------|
| Cùng team, quyền đồng nhất | Cách 1 — cùng folder | ❌ Base-level only |
| Quyền nâng cao per-table | **Clone roles API** | ✅ |
| Archive chỉ đọc | Clone roles + downgrade \`write→false\` | ✅ |

#### Lưu ý API

- Permission & Role API cần **tenant_access_token** (app-level)
- Scopes cần: \`bitable:app\`, \`bitable:app:readonly\`, \`drive:permission\`
- Rate limit: 5 req/s
- Roles API chỉ có trên Lark Base **nâng cao** (Advanced Permissions enabled)

---

## 4. Flow chi tiết

### 4.1. Automation flow

\`\`\`
TRIGGER: Cron ngày 1 hàng tháng (hoặc thủ công)
    ▼
STEP 1: target = "backup-{tháng trước MMYYYY}"
    ▼
STEP 2: Với mỗi bảng cần backup:
    │   POST /records/search { backup_status = target }
    │   → count records
    │   → Nếu 0 → skip
    ▼
STEP 3: Tạo/mở archive base (cùng folder)
    │   POST /bases hoặc dùng app_token đã có
    │   POST /tables/batch_create { name: "A1-042026" }
    │   POST /bases/patch-schema (copy fields)
    ▼
STEP 4: Copy records (loop 1000/batch)
    │   search page 1 → batch_create → next page
    │   Verify: count_created == count_searched
    ▼
STEP 5: Delete từ bảng gốc (loop 500/batch)
    │   batch_delete record IDs
    │   Verify: records gone
    ▼
STEP 6: Log + Notify
    │   Insert vào MongoDB (backup_logs)
    │   POST Lark webhook notification
    └── Done
\`\`\`

### 4.2. Giới hạn API cần tuân thủ

| API | Giới hạn | Xử lý |
|-----|----------|-------|
| Search | 500 records/page | Auto-pagination (\`page_token\`) |
| Batch create | 1000/request | Loop chunks |
| Batch delete | 500/request | Loop chunks |
| Create table | 3 tables/request | Loop batches |
| Rate limit | 5 req/s | Delay 200ms giữa requests |
| Records per table | **20,000** | Monitor trước khi backup |

### 4.3. Error handling

| Error | Xử lý |
|-------|-------|
| Network timeout | Retry 3 lần, delay exponential |
| Partial copy (copy xong, chưa delete) | OK — chạy lại sẽ skip records đã copy |
| Partial delete | Checkpoint: log record IDs đã copy → delete phần còn lại |
| Archive base full (20k) | Tạo base mới: "Archive-2", "Archive-3" |
| Rate limit (429) | Wait 1s → retry |

---

## 5. Bảng chu kỳ backup

| Bảng | Records/tháng | Chu kỳ | Formula |
|------|--------------|--------|---------|
| Vận Đơn Nhập | ~500 | Tháng | \`backup-MMYYYY\` |
| Chi Tiết Vận Đơn | ~800 | Tuần | \`backup-WWYYYY\` |
| Khai Báo Hàng Hoá | ~300 | Tháng | \`backup-MMYYYY\` |
| Thống kê hàng kho | ~50 | Quý | \`backup-QQYYYY\` |
| Nhật Kí Xe | ~1200 | Tuần | \`backup-WWYYYY\` |
| Chi Phí Tại Kho | ~200 | Tháng | \`backup-MMYYYY\` |
| Phân Hồ Sơ | ~400 | Tháng | \`backup-MMYYYY\` |

**Ước tính:** ~3,500 records/tháng cần backup → ~15 phút chạy automation.

---

## 6. Vấn đề Lookup khi xoá records

### ⚠️ Rủi ro
Bảng B lookup tới bảng A record X → X bị xoá → lookup **broken**.

### 3 giải pháp

| # | Cách | Ưu | Nhược |
|---|------|-----|-------|
| 1 | **Soft delete** — \`is_archived = true\`, filter ẩn | Lookup hoạt động | Records vẫn chiếm slot |
| 2 | **Hard delete** — xoá hẳn | Sạch, giải phóng slot | Lookup broken |
| 3 | **Copy value** — copy giá trị lookup sang text trước khi xoá | Giữ data hiển thị | Mất liên kết |

### Recommendation

- Bảng **có lookup từ bảng khác** → **Soft delete** (option 1)
- Bảng **standalone** (không ai lookup tới) → **Hard delete** (option 2)
- Bảng **quan trọng** → **Copy value + Hard delete** (option 3)

Xác định bảng nào có lookup: dùng trang \`/ba/analyst\` → graph view → xem connections.

---

## 7. Tìm kiếm dữ liệu cũ

### Bảng Archive Index (trong base gốc)

| Trường | Loại | Mô tả |
|--------|------|-------|
| source_table | Text | Tên bảng gốc |
| period | Text | \`042026\` |
| record_count | Number | Số records |
| archive_base | URL | Link mở archive |
| archived_at | Date | Ngày backup |
| archive_table | Text | Tên table archive |

### Flow tìm kiếm

\`\`\`
User cần tìm vận đơn tháng 4
    ▼
Mở Archive Index → filter: source_table = "Vận Đơn Nhập", period = "042026"
    ▼
Click link → mở archive base → tìm record
\`\`\`

### Quyền hạn
- Archive base tạo **cùng folder** → user có quyền base gốc tự động có quyền archive
- Không cần config thêm

---

## 8. API endpoints cần xây dựng

| Endpoint | Method | Mô tả |
|----------|--------|-------|
| \`/api/backup/config\` | GET | Cấu hình backup tất cả bases |
| \`/api/backup/config/:baseId\` | PUT | Cấu hình per base (chu kỳ, bảng, mode) |
| \`/api/backup/run/:baseId\` | POST | Chạy backup thủ công |
| \`/api/backup/run-all\` | POST | Chạy backup tất cả |
| \`/api/backup/logs\` | GET | Lịch sử backup |
| \`/api/backup/logs/:baseId\` | GET | Lịch sử per base |
| \`/api/backup/status\` | GET | Trạng thái tất cả bases |
| \`/api/backup/schedule\` | GET/PUT | Cấu hình cron |
| \`/api/backup/dry-run/:baseId\` | POST | Preview — không xoá, chỉ đếm |

---

## 9. Lộ trình triển khai

### Phase 1: Chuẩn bị (2 ngày)

| Task | Chi tiết |
|------|---------|
| Thêm cột formula | \`backup_status\` cho tất cả bảng cần backup |
| Test formula | Verify output đúng format |
| Tạo folder Archive | Trong Lark Drive, cùng workspace |
| Xác định lookup | Dùng \`/ba/analyst\` graph xem bảng nào có/không có lookup |
| Phân loại bảng | Soft delete vs Hard delete |

### Phase 2: Backend API (3 ngày)

| Task | Chi tiết |
|------|---------|
| Model BackupConfig | MongoDB: baseId, tables[], mode, schedule |
| Model BackupLog | MongoDB: baseId, period, records, status, errors |
| \`POST /backup/run/:baseId\` | Core logic: search → create → copy → delete |
| \`POST /backup/dry-run\` | Preview mode — đếm records, không xoá |
| Error handling | Retry, checkpoint, rate limit |
| Lark notification | Webhook kết quả |

### Phase 3: Frontend (2 ngày)

| Task | Chi tiết |
|------|---------|
| Trang \`/backup\` | Dashboard: config per base, run manual, logs |
| Cấu hình per table | Chu kỳ, mode (soft/hard), enable/disable |
| Log viewer | Timeline backup history |
| Dry-run UI | Preview trước khi chạy thật |

### Phase 4: Automation (1 ngày)

| Task | Chi tiết |
|------|---------|
| Cron job | Ngày 1 hàng tháng, 2:00 AM |
| Monitor | Alert nếu backup fail |
| Archive Index | Auto-update bảng Index sau backup |

### Phase 5: Testing (3 ngày)

| Test | Chi tiết |
|------|---------|
| Unit | Copy 10 records → verify |
| Scale | Copy 5000 records → verify timing |
| Edge | Empty table, >20k records, network error |
| Lookup | Verify soft delete không break lookup |
| Permission | Verify archive base cùng quyền |
| Dry-run | Verify count chính xác |
| Idempotent | Chạy 2 lần → không duplicate |

### Timeline tổng

\`\`\`
Tuần 1: Phase 1 + Phase 2 (chuẩn bị + API)
Tuần 2: Phase 3 + Phase 4 (frontend + automation)
Tuần 3: Phase 5 (testing toàn diện)
\`\`\`

**Tổng: ~11 ngày, 3 tuần.**

---

## 10. Tổng kết chung — Dữ liệu sau backup

### Vấn đề
Records di chuyển sang archive base → bảng gốc mất data → **tổng kết, báo cáo, dashboard sai số**.

### Giải pháp: Bảng Tổng Kết Archive

Mỗi bảng gốc có thêm 1 bảng **\`{TênBảng}_summary\`** chứa tổng kết per period:

| Trường | Loại | VD |
|--------|------|-----|
| period | Text | \`042026\` |
| source_table | Text | \`Vận Đơn Nhập\` |
| total_records | Number | 500 |
| sum_values | Number | 150,000,000 (tổng giá trị) |
| metrics | Text (JSON) | \`{"tongKien": 1200, "tongKG": 45000}\` |
| archive_link | URL | Link đến archive base |
| archived_at | Date | 2026-05-01 |

### Flow tổng kết

\`\`\`
Trước khi xoá records khỏi bảng gốc:
    ▼
STEP 4.5: Tính tổng kết
    │   SUM, COUNT, AVG các cột quan trọng
    │   Lưu vào bảng {Table}_summary
    ▼
STEP 5: Xoá records
\`\`\`

### Dashboard hiện tại + Archive

\`\`\`
Dashboard "Báo Cáo Vận Đơn"
├── Tháng 5/2026: 320 records (LIVE — từ bảng gốc)
├── Tháng 4/2026: 500 records (ARCHIVED — từ summary)
│   ├── Tổng kiện: 1,200
│   ├── Tổng KG: 45,000
│   └── [Xem chi tiết] → link archive base
├── Tháng 3/2026: 480 records (ARCHIVED)
└── ...
\`\`\`

**Kết quả:** Dashboard luôn hiện đúng tổng kết — live data + archived summary.

---

## 11. Tìm kiếm dữ liệu cũ — Cross-base Search

### 11.1. Archive Index (trong base gốc)

| Trường | Loại | Mô tả |
|--------|------|-------|
| archive_id | AutoNumber | ID tự tăng |
| source_table | Text | Bảng gốc |
| period | Text | \`042026\` |
| record_count | Number | Số records |
| archive_app_token | Text | App token archive base |
| archive_table_id | Text | Table ID trong archive |
| archive_url | URL | Link mở trực tiếp |
| search_keywords | Text | Keywords cho search |

### 11.2. API Tìm kiếm cross-base

\`\`\`http
POST /api/backup/search
Body: {
  "query": "VD001",
  "source_table": "Vận Đơn Nhập",
  "period": "042026"       // optional
}

Response: {
  "results": [
    {
      "period": "042026",
      "archive_base": "Archive — KhoTQ",
      "archive_table": "VanDon-042026",
      "records": [
        { "record_id": "recXXX", "fields": { "Mã Vận Đơn": "VD001", ... } }
      ],
      "url": "https://..."
    }
  ]
}
\`\`\`

### 11.3. Flow tìm kiếm

\`\`\`
User nhập "VD001" vào ô tìm kiếm
    ▼
API tra Archive Index → tìm period chứa VD001
    ▼
API gọi Lark search trên archive base/table
    ▼
Trả kết quả + link mở trực tiếp
\`\`\`

---

## 12. API cho N8N Integration

### 12.1. Webhook endpoints (N8N gọi)

| Endpoint | Method | Trigger | Mô tả |
|----------|--------|---------|-------|
| \`/api/backup/webhook/run\` | POST | N8N Schedule | Chạy backup cho 1 hoặc nhiều bases |
| \`/api/backup/webhook/status\` | GET | N8N HTTP Request | Check trạng thái backup |
| \`/api/backup/webhook/search\` | POST | N8N HTTP Request | Tìm kiếm cross-base |

### 12.2. N8N Workflow: Backup tự động

\`\`\`
[Cron Trigger]           → mỗi ngày 1, 2:00 AM
    ▼
[HTTP Request]           → GET /api/backup/config
    ▼                      lấy danh sách bases cần backup
[Loop]                   → với mỗi base
    ▼
[HTTP Request]           → POST /api/backup/dry-run/:baseId
    ▼                      đếm records cần backup
[IF]                     → count > 0?
    ▼ Yes
[HTTP Request]           → POST /api/backup/run/:baseId
    ▼                      chạy backup thật
[Lark Bot]               → POST message kết quả
    ▼
[HTTP Request]           → POST /api/backup/webhook/status
                           cập nhật trạng thái
\`\`\`

### 12.3. N8N Workflow: Tìm kiếm archive

\`\`\`
[Webhook Trigger]        → user gửi request tìm kiếm
    ▼
[HTTP Request]           → POST /api/backup/search
    ▼                      { query: "VD001", source_table: "..." }
[IF]                     → có kết quả?
    ▼ Yes
[Lark Bot]               → gửi kết quả + link archive cho user
\`\`\`

### 12.4. API Request/Response format cho N8N

**Chạy backup:**
\`\`\`json
// Request
POST /api/backup/webhook/run
Headers: { "X-API-Key": "your-key" }
Body: {
  "base_ids": ["base1", "base2"],
  "mode": "hard_delete",
  "dry_run": false,
  "notify_channel": "lark_group_id"
}

// Response
{
  "success": true,
  "results": [
    {
      "base_id": "base1",
      "base_name": "HN - Kho TQ",
      "tables_processed": 5,
      "records_archived": 1500,
      "records_deleted": 1500,
      "archive_base": "Archive — HN Kho TQ",
      "duration_ms": 45000,
      "errors": []
    }
  ]
}
\`\`\`

**Tìm kiếm:**
\`\`\`json
// Request
POST /api/backup/webhook/search
Body: {
  "query": "VD001",
  "source_table": "Vận Đơn Nhập",
  "max_results": 10
}

// Response
{
  "success": true,
  "total": 1,
  "results": [{
    "period": "042026",
    "archive_url": "https://...",
    "record": { "Mã Vận Đơn": "VD001", "Ngày tạo": "2026-04-15", ... }
  }]
}
\`\`\`

---

## 13. Tóm tắt

| Câu hỏi | Trả lời |
|---------|---------|
| Giới hạn records? | **20,000 per table** (gói hiện tại) |
| Tạo base/table qua API? | ✅ Đã implement |
| Copy records? | ✅ Search → Batch create (1000/req) |
| Xoá records? | ✅ Batch delete (500/req) |
| Giữ permission? | ✅ 3 cách: cùng folder / clone API / folder + downgrade |
| Tổng kết sau backup? | ✅ Bảng summary per period |
| Tìm kiếm data cũ? | ✅ Archive Index + API search |
| Lookup bị broken? | ⚠️ Soft delete cho bảng có lookup |
| N8N integration? | ✅ Webhook endpoints |
| Tự động? | ✅ Cron + N8N workflow |
| Xuất PDF? | ✅ Nút "Xuất PDF" trên trang này |
`

const MD_STYLE = `
.backup-md { color: var(--text-color); font-size: 14px; line-height: 1.8; }
.backup-md h2 { font-size: 1.35em; font-weight: 700; margin: 28px 0 12px; border-bottom: 2px solid var(--accent-color); padding-bottom: 6px; color: var(--accent-color); }
.backup-md h3 { font-size: 1.1em; font-weight: 600; margin: 18px 0 8px; }
.backup-md p { margin: 6px 0; }
.backup-md table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 13px; display: block; overflow-x: auto; }
.backup-md th { background: var(--bg-tertiary); font-weight: 600; text-align: left; padding: 6px 10px; border: 1px solid var(--border-color); }
.backup-md td { padding: 5px 10px; border: 1px solid var(--border-color); }
.backup-md code { background: var(--bg-tertiary); padding: 1px 5px; border-radius: 3px; font-size: 0.88em; }
.backup-md pre { background: var(--bg-tertiary); padding: 12px; border-radius: 6px; overflow-x: auto; margin: 10px 0; border: 1px solid var(--border-color); font-size: 12px; }
.backup-md pre code { background: none; padding: 0; }
.backup-md blockquote { border-left: 3px solid var(--accent-color); margin: 10px 0; padding: 6px 14px; background: var(--bg-tertiary); border-radius: 0 4px 4px 0; }
.backup-md ul, .backup-md ol { padding-left: 20px; }
.backup-md li { margin: 3px 0; }
.backup-md hr { border: none; border-top: 1px solid var(--border-color); margin: 24px 0; }
.backup-md strong { font-weight: 600; }
`

export default function BackupStrategyPage() {
  const headings = MD_CONTENT.split('\n')
    .filter(l => /^#{2,3}\s/.test(l))
    .map((l, i) => ({
      level: l.match(/^(#+)/)?.[1].length || 2,
      text: l.replace(/^#+\s*/, '').replace(/`/g, ''),
      id: `s-${i}`,
    }))

  const handlePrint = () => {
    const title = 'Backup Strategy — Lark Base'
    const css = `body{font-family:-apple-system,system-ui,sans-serif;max-width:900px;margin:0 auto;padding:24px;font-size:14px;line-height:1.8;color:#333}
h1{font-size:1.6em;border-bottom:2px solid #333;padding-bottom:8px}
h2{font-size:1.3em;color:#6366f1;border-bottom:1px solid #ddd;padding-bottom:4px;margin-top:32px}
h3{font-size:1.1em;color:#333;margin-top:20px}
table{border-collapse:collapse;width:100%;margin:12px 0;font-size:13px}
th{background:#f5f5f5;font-weight:600;text-align:left}th,td{border:1px solid #ddd;padding:6px 10px}
code{background:#f0f0f0;padding:1px 5px;border-radius:3px;font-size:0.9em}
pre{background:#f5f5f5;padding:12px;border-radius:6px;overflow-x:auto;font-size:12px}
pre code{background:none}
blockquote{border-left:3px solid #6366f1;margin:12px 0;padding:8px 14px;background:#f8f8ff}
hr{border:none;border-top:1px solid #eee;margin:24px 0}
@media print{body{font-size:12px;padding:0}}`
    const md = `# ${title}\n\n_Cập nhật: ${new Date().toLocaleDateString('vi')} · Gói Lark hiện tại: 20,000 records/table_\n\n---\n${MD_CONTENT}`
    const w = window.open('', '_blank')
    if (!w) { return }
    w.document.write([
      '<!DOCTYPE html><html><head><meta charset="utf-8">',
      '<title>', title, '</title>',
      '<style>', css, '</style>',
      '<script src="https://cdn.jsdelivr.net/npm/marked@12/marked.min.js"></', 'script>',
      '</head><body><div id="r"></div><script>',
      'document.getElementById("r").innerHTML=marked.parse(', JSON.stringify(md), ');',
      'setTimeout(function(){window.print()},800);',
      '</', 'script></body></html>',
    ].join(''))
    w.document.close()
  }

  return (
    <div style={{ padding: '0 8px' }}>
      <style>{MD_STYLE}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>
            <SafetyOutlined style={{ marginRight: 8, color: 'var(--accent-color)' }} />
            Backup Strategy — Lark Base
          </Title>
          <Space style={{ marginTop: 6 }}>
            <Tag color="blue">Tính năng mới</Tag>
            <Tag color="purple">Lark API</Tag>
            <Tag color="orange">Automation</Tag>
            <Tag color="red">20,000 records/table</Tag>
            <Tag>v1.0 · 2026-05</Tag>
          </Space>
        </div>
        <Button icon={<DownloadOutlined />} onClick={handlePrint}>Xuất PDF</Button>
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        {/* TOC */}
        <Card size="small" style={{ width: 220, flexShrink: 0, position: 'sticky', top: 16 }}
          styles={{ body: { padding: '8px 10px', maxHeight: 'calc(100vh - 120px)', overflow: 'auto' } }}>
          <Text strong style={{ fontSize: 12, color: 'var(--accent-color)', display: 'block', marginBottom: 6 }}>Mục lục</Text>
          {headings.map((h, i) => (
            <a key={i} href={`#${h.id}`}
              style={{ fontSize: 11, color: h.level === 2 ? 'var(--text-color)' : 'var(--text-secondary)',
                fontWeight: h.level === 2 ? 600 : 400,
                textDecoration: 'none', display: 'block',
                paddingLeft: (h.level - 2) * 12, lineHeight: '22px',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              onClick={e => { e.preventDefault(); document.getElementById(h.id)?.scrollIntoView({ behavior: 'smooth' }); }}>
              {h.text}
            </a>
          ))}
        </Card>

        {/* Content */}
        <Card style={{ flex: 1, minWidth: 0 }} styles={{ body: { padding: '16px 24px', maxHeight: 'calc(100vh - 120px)', overflow: 'auto' } }}>
          <div className="backup-md">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
              h2: ({ children, ...p }) => { const idx = headings.findIndex(h => h.text === String(children).replace(/`/g, '')); return <h2 id={idx >= 0 ? headings[idx].id : undefined} {...p}>{children}</h2>; },
              h3: ({ children, ...p }) => { const idx = headings.findIndex(h => h.text === String(children).replace(/`/g, '')); return <h3 id={idx >= 0 ? headings[idx].id : undefined} {...p}>{children}</h3>; },
            }}>{MD_CONTENT}</ReactMarkdown>
          </div>
        </Card>
      </div>
    </div>
  )
}
