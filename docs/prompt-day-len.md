# Prompt bàn giao — đẩy lớp đại lý MAIC lên production

Dán nguyên phần trong khung dưới cho phiên làm việc ở `/Users/deveris/app`.

---

```
Bạn đang ở /Users/deveris/app (monorepo Toolswave App Builder). Việc của phiên
này: commit, push, rồi deploy phần tích hợp MAIC vừa được viết xong. Viết mọi
thứ bằng tiếng Việt.

## Đã có gì trong cây làm việc

Một lớp "đại lý" nối Toolswave với MAIC (cổng chạy Claude Code theo token, mã
nguồn ở /Users/deveris/app/maic-workspace). Trước đây cả Toolswave đi qua MỘT
token MAIC dùng chung nên MAIC không biết ai đang tiêu bao nhiêu, và hạn mức
per-user chỉ tồn tại trong DB của ta — mất ngay khi một đường code quên gọi
assertMaicAllowed.

Giờ mỗi lời gọi khai `endUser` là ai, MAIC tự chặn khi người đó cạn trần, và có
màn quản trị để xem/khoá/mở. Chi tiết đầy đủ: docs/maic-reseller.md.

Tệp mới:
  apps/api/src/maic/maic-admin.service.ts      client cho /v1/end-users
  apps/api/src/maic/maic-admin.controller.ts   GET/POST /v1/admin/maic/*
  apps/web/src/app/admin/maic/page.tsx         màn "MAIC — hạn mức"
  docs/maic-reseller.md
  docs/prompt-day-len.md                       (chính tệp này)

Tệp sửa: maic.service.ts, maic-usage.service.ts, maic.module.ts,
codegen.service.ts, pipeline.service.ts, agent.service.ts, scheduled/,
suggestions/, server-deploy/, makeblog/, video/, picture/, payments.service.ts,
me.service.ts, users.service.ts, apps/web/src/lib/api.ts, AdminShell.tsx.

## Tình trạng cây — đọc kỹ trước khi commit

- Nhánh `main`, đi trước `origin/main` 125 commit.
- ~90 tệp chưa commit. PHẦN LỚN KHÔNG PHẢI CỦA LỚP ĐẠI LÝ: đó là việc đang dở
  của chủ dự án (Video Studio, Picture, MakeBlog, Telegram delivery, Categories,
  và +228 dòng model Prisma mới).
- Hai phần KHÔNG tách sạch được theo tệp: apps/web/src/lib/api.ts có 406 dòng
  thêm mà chỉ ~45 là của lớp đại lý. Muốn tách phải `git add -p` từng hunk.
  ĐỪNG cố tách trừ khi chủ dự án yêu cầu — commit chung một lần là trung thực
  hơn một commit sai tên.

## Đã kiểm chứng (03/09/2026, chạy thật tại chỗ)

Đúng chuỗi lệnh của job `build` trong .gitlab-ci.yml, tất cả xanh:
  pnpm --filter @larkwave/shared build
  pnpm --filter @larkwave/core build
  pnpm --filter api exec prisma generate
  pnpm --filter api build
  pnpm --filter web build          → có /admin/maic trong bảng route
  pnpm --filter api test -- --passWithNoTests
Và `npx tsc --noEmit` sạch ở cả apps/api lẫn apps/web.

Chạy lại nếu bạn có sửa thêm. Không sửa gì thì không cần chạy lại.

## Việc cần làm

1. `git status --short` — đọc qua một lượt, đối chiếu với phần "tình trạng cây"
   ở trên. Nếu thấy tệp lạ không thuộc hai nhóm đã kể thì HỎI chủ dự án trước.

2. Commit:
     git add -A
     git commit -m "MAIC: hạn mức theo từng người dùng + màn quản trị, kèm việc đang dở"

3. HỎI chủ dự án xác nhận rồi mới:
     git push origin main
   Đẩy 126 commit. CI chạy build + test. KHÔNG deploy — job `deploy` là
   `when: manual`, phải bấm nút trong GitLab.

4. Đợi pipeline xanh. Hỏng thì đọc log, sửa, commit tiếp — đừng ép đẩy.

5. HỎI chủ dự án lần nữa rồi mới bảo họ bấm deploy:
   GitLab → toolswave/app → Build → Pipelines → pipeline mới nhất → ▶ ở job
   `deploy`. Bạn không tự bấm được và cũng không nên tìm cách bấm hộ.

6. Sau khi deploy xong, xác minh:
     ssh root@100.100.164.92 'systemctl is-active toolswave-api toolswave-web'
     curl -s -o /dev/null -w '%{http_code}\n' https://apia.toolswave.net/v1/health
   rồi mở https://app.toolswave.net/admin/maic bằng trình duyệt thật.
   Đúng thì thấy bảng người dùng kèm phần trăm đã tiêu.

## Những thứ ĐỪNG làm

- Đừng viết lại lịch sử (rebase/amend/force-push). 125 commit kia là việc thật
  của chủ dự án.
- Đừng sửa .env trên production trừ khi được bảo. Nó bị rsync loại trừ nên
  deploy không đụng tới.
- VPS 100.100.164.92 đang chạy hơn 50 container của dự án khác. Không bao giờ
  `docker system prune`, không `docker stop` theo tên chung.
- Đừng gửi SIGHUP cho cloudflared — bản đang chạy coi đó là lệnh thoát và sẽ
  làm sập 66 hostname. Nạp lại cấu hình thì `systemctl restart cloudflared`.

## Bối cảnh production (đã kiểm, không cần đổi gì)

- Toolswave chạy trên CHÍNH VPS 100.100.164.92, thư mục /home/app/toolswave,
  hai service systemd `toolswave-api` + `toolswave-web`, cả hai đang active.
- .env production đã có MAIC_URL=http://127.0.0.1:5201 và MAIC_TOKEN.
- Token đó là `toolswave-codegen` bên MAIC, ĐÃ được nâng vai trò `reseller`.
  Không còn bước tay nào. Nếu về sau phát token MAIC mới thì phải nâng lại ở
  cmsmaic.toolswave.net → Token → "Nâng thành đại lý".
- deploy chạy `prisma db push` (không dùng migrations). Schema chỉ thêm
  (+228/−0) nên không đụng dữ liệu cũ; nếu có thay đổi phá huỷ thì lệnh sẽ gãy
  chứ không âm thầm xoá, vì không có cờ --accept-data-loss.

## Một điều đáng nêu với chủ dự án sau khi deploy

MAIC_USD_PER_MTOK không có trong .env production nên đang lấy mặc định 10 trong
code. Số này quy hạn mức token của gói sang trần USD đẩy sang MAIC: gói Miễn phí
3 Mtok → trần $30/chu kỳ, Pro 100 Mtok → $1000. Nếu lệch thực tế thì thêm vào
.env, `systemctl restart toolswave-api`, rồi bấm "Đồng bộ tất cả" ở màn
/admin/maic. Đây là trần của hàng rào thứ hai, không phải thứ người dùng nhìn
thấy — họ vẫn chỉ thấy phần trăm như cũ.

Lần đầu mở /admin/maic bảng sẽ gần như trống. Đó là đúng: MAIC chỉ biết một
người sau khi họ dùng tính năng AI lần đầu. Muốn nạp sẵn thì bấm "Đồng bộ tất cả".

## Xong thì

Báo lên Telegram group "Đầu tư REAL", topic "code vibe cùng gãy vai":
  node /Users/deveris/website-workspace/than-so-hoc/tools/bao-tin.mjs "<nội dung HTML>"
Giọng marketing, nói cái người dùng thấy được, không nêu tên công nghệ.
```
