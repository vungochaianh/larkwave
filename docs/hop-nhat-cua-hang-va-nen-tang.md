# Hợp nhất cửa hàng (hệ B) vào nền tảng (hệ A)

> Viết ngày 23/09/2026, sau lần hoán đổi tên miền 22/09. Đọc kèm
> [doi-ten-mien-ke-hoach.md](doi-ten-mien-ke-hoach.md) — phần "Thực tế" ở cuối file đó là danh
> sách những chỗ hạ tầng đã từng cắn, và chúng sẽ cắn lại ở việc này.
>
> **Trạng thái 24/09/2026:** ba quyết định ở §12 đã chốt · **giai đoạn 1 xong và đang chạy**
> (§13) · **giai đoạn 2 xong phần mã, chưa nhập dữ liệu, chưa deploy** (§14).

## 1. Đang có gì

Hai hệ, hai kho, hai cơ sở dữ liệu, chạy trên cùng một máy chủ, khác cổng.

| | Hệ A — `toolswave.net` | Hệ B — `app.toolswave.net` |
|---|---|---|
| Kho | `toolswave/app` | `toolswave/toolswave-workspace` |
| Vai trò | Nền tảng: prompt → app, deploy, blog, trợ lý, marketing | Cửa hàng: tài khoản phần mềm, tài liệu, mã nguồn, tool |
| Stack | NestJS + Prisma + Postgres · Next.js | Fastify + Prisma + Postgres · Next.js + CRM (Vite) |
| Người dùng | `User` — bcryptjs, JWT, OAuth Google/GitHub/GitLab | `User` — bcryptjs, JWT + `Session`, `OAuthAccount` |
| Tiền | SePay, `Payment.kind = plan \| storage` | SePay, `Order` + VietQR |
| Cách giao hàng | ZIP source · đồng bộ GitLab · deploy Cloudflare Pages · deploy lên VPS của khách | Lộ tài khoản/key · link tải · mời vào repo GitLab |
| Quản trị | `cms.toolswave.net` (cùng app Next, gate theo role) | `aapp.toolswave.net` (CRM Vite tĩnh) |
| Blog | `BlogPost` — chỗ thật | `BlogPost` — đã chuyển hướng sang hệ A |

Hai điều quyết định mức độ khó của việc này:

- **Hai hệ đã trùng công nghệ ở đúng những chỗ khó.** Cùng `bcryptjs` (hash mật khẩu bê nguyên
  sang được, người dùng không phải đặt lại), cùng SePay, cùng Prisma/Postgres, cùng Next.js.
  Gộp ở đây chủ yếu là **chuyển bảng và nối lại đường**, không phải viết lại.
- **Trang `/tools` của hệ B là dữ liệu giả.** 12 tool hard-code trong
  `portal/src/app/tools/page.tsx`, lời gọi `apiFetch` bị chú thích lại; bảng `tbl_tools` tồn tại
  nhưng trang không đọc. Nên "tool nhỏ lẻ" hiện **chưa tồn tại như sản phẩm** — đây là chỗ trống
  để lấp, không phải tài sản phải di dời.

## 2. Hợp nhất nghĩa là gì

Hôm nay hệ A và hệ B nhìn "app" bằng hai con mắt khác nhau:

- Hệ A: app là **thứ người dùng tự tạo ra** — có chủ, có lịch sử build, có link chạy thật.
- Hệ B: app là **thứ bán được** — có giá, có đơn, có trạng thái giao hàng.

Không có mâu thuẫn nào ở đây, chỉ thiếu một khái niệm nối hai bên. Bản thiết kế này đặt tên cho nó:

> **Món bán (`Listing`)** — một thứ có giá, có trang bán, có SEO.
> **Cách giao (`Fulfillment`)** — cái xảy ra sau khi khách trả tiền.

Mọi thứ đang bán ở hệ B, cộng với app do hệ A dựng ra, đều rơi gọn vào hai khái niệm đó. Đó là
toàn bộ nội dung của chữ "hợp nhất".

## 3. Quyết định nền: gộp về hệ A

**Hệ A là chỗ ở, hệ B teo dần về CRM + kế toán nội bộ.**

Vì sao không phải chiều ngược lại, và không phải "giữ hai hệ, bắc một cây cầu":

- Hệ A đã có sẵn những thứ đắt nhất của một cửa hàng: người dùng + OAuth, SePay có đối soát,
  gói/hạn mức, lưu trữ, tải lên, trang quản trị, blog, SEO đa ngôn ngữ. Hệ B có sáu bảng danh mục
  và một bảng đơn — phần nhỏ hơn hẳn.
- Phần "bàn giao app" — thứ mới cần làm — **chỉ hệ A làm được**, vì nó cần build, repo, deploy.
  Đặt cửa hàng ở nơi khác thì mỗi lần giao hàng lại phải gọi ngược về hệ A.
- Giữ hai hệ nghĩa là giữ hai bảng người dùng, hai lần đăng nhập, hai bộ OAuth redirect, hai
  blog. Ta đã trả giá cho đúng kiểu đó một lần rồi: bài blog nằm hai nơi, phải chắp middleware
  301/308 để che. Cây cầu nào cũng phải bảo trì, và nó không bao giờ ngắn đi.

Cái giá của quyết định này: một đợt chuyển dữ liệu người dùng + đơn hàng, và một đợt chuyển hướng
SEO nữa. Cả hai trả một lần cho xong, khác với chi phí cầu nối trả hàng tháng.

## 4. Mô hình dữ liệu mới trong hệ A

Sáu bảng thêm vào `apps/api/prisma/schema.prisma`. Tên bảng giữ tiếng Anh cho khớp phần còn lại
của schema.

```
Listing        món bán — một dòng cho mọi loại hàng
  kind         software | document | sourcecode | app | tool | service
  slug, name, descriptionShort, description, thumbnailUrl, gallery
  priceVnd, compareAtVnd, status(active|hidden|sold_out), categoryId, sortOrder
  seo Json                       — dùng lại cơ chế SEO/hreflang đã có
  detail Json                    — phần riêng của từng loại (xem §5)
  appId?                         — chỉ với kind=app|tool: trỏ về App của hệ A
  buildId?                       — bản build ĐÓNG BĂNG được bán (không phải "bản mới nhất")
  sellerId?                      — null = Toolswave bán; có giá trị = người dùng bán (xem §12)
  legacyId?                      — id cũ bên hệ B, để đối chiếu sau khi nhập

Inventory      chỉ dùng cho kind=software — mỗi dòng là một tài khoản/key
  listingId, dataEnc, status(available|reserved|sold), orderItemId?, soldAt

Order          đơn hàng — NHIỀU món một đơn (hệ B đang một món một đơn)
  code, userId, totalVnd, status(pending|paid|cancelled|refunded)
  paymentId?                     — trỏ sang Payment sẵn có của hệ A

OrderItem      một dòng hàng
  orderId, listingId, kind, nameSnapshot, priceVnd, qty

Fulfillment    việc giao món đó — một dòng cho mỗi OrderItem
  orderItemId, method (xem §5), status(pending|running|delivered|failed)
  payload Json                   — link tải, nội dung tài khoản, tên repo, URL app…
  steps Json                     — mốc tiến trình để khách tự xem, admin tự soi
  error?, deliveredAt?

Entitlement    quyền đã mua, tách khỏi đơn để kiểm tra cho rẻ
  userId, kind(tool_premium|app_license|subscription), listingId?, appId?
  grantedAt, expiresAt?          — null = vĩnh viễn
```

Ba lựa chọn đáng giải thích:

**Một bảng `Listing` cho mọi loại, thay vì bốn bảng như hệ B.** Trang cửa hàng, tìm kiếm, giỏ
hàng, SEO và quản trị đều muốn nhìn mọi món như nhau; bốn bảng nghĩa là bốn lần viết cùng một
đoạn mã. Phần khác nhau giữa các loại nằm trong `detail Json` — nó chỉ được đọc ở đúng hai chỗ:
trang chi tiết của loại đó và bộ giao hàng của loại đó.

**`Order` nhiều món.** Hệ B gắn `productType`/`productId` thẳng vào đơn nên một đơn chỉ mua được
một thứ. Khi bán app kèm tài liệu kèm gói hỗ trợ, đó là hạn chế thật. Nhập dữ liệu cũ vẫn dễ:
mỗi đơn cũ thành một `Order` có một `OrderItem`.

**`Inventory.dataEnc` mã hoá.** Hệ B lưu thông tin tài khoản và license key ở dạng chữ thường
trong `tbl_software_inventory.data`. Khi chuyển sang, mã hoá bằng đúng cơ chế đang dùng cho
`App.secretsEnc` (AES-256-GCM). Đây là thứ không nên "chuyển y nguyên rồi tính sau".

## 5. Sáu loại món và cách giao từng loại

| Loại | Nguồn gốc | `method` | Cái đã có để dùng lại |
|---|---|---|---|
| `software` | `tbl_software_accounts` + inventory | `reveal_secret` | — (viết mới, phần nhỏ nhất) |
| `document` | `tbl_documents` | `download` | `uploads` + `storage` của hệ A |
| `sourcecode` | `tbl_source_codes` | `git_invite` + `download` | `git.service.ts`, token GitLab của user |
| `app` | `App` của hệ A | `app_handover` | §6 |
| `tool` | `App` của hệ A, đã publish | `entitlement` | `/a/[slug]`, `App.published`, `plan` |
| `service` | mới (làm theo yêu cầu) | `manual` | trang admin + ghi chú |

Chỉ `software` là thật sự phải viết mới. Bốn loại còn lại nối vào đường đã có.

## 6. "Bàn giao app" — định nghĩa cho rõ

Đây là phần mới, và cũng là chỗ hai hệ gặp nhau. Bàn giao **không phải** đưa một file ZIP. Nó là
một pipeline sáu bước, đứng cạnh pipeline 6 giai đoạn đang có, dùng lại gần như toàn bộ hạ tầng:

1. **Đóng băng bản bán.** `Listing.buildId` ghim một build cụ thể. App gốc sau này sửa tiếp cũng
   không ảnh hưởng người đã mua — thứ họ mua là một bản xác định, không phải "bản mới nhất".
2. **Nhân bản sang tài khoản người mua.** Tạo `App` mới thuộc `ownerId` của người mua, chép
   `featureSpec`, `blueprint`, `seo`, `buildConfig`; `remixedFromId` trỏ về app gốc. Từ giây phút
   này người mua **sửa được bằng chat** như app tự dựng — đây là điểm bán hàng mạnh nhất mà một
   file ZIP không có.
3. **Mã nguồn.** ZIP tải về (đã có) + đẩy vào repo GitLab của người mua nếu họ đã nối tài khoản
   (đã có), hoặc mời họ vào repo của Toolswave theo đúng cách hệ B đang làm với `sourcecode`
   (`inviteToGitlab` trong `order.service.ts`).
4. **Chạy thật.** Deploy bản của người mua ra Cloudflare Pages dưới subdomain của họ (đã có), kèm
   D1 nếu app full-stack (đã có). Đơn hàng nào cho phép thì mở thêm **deploy lên VPS của khách** —
   `server-deploy.service.ts` đã làm được việc này, hiện chỉ giới hạn ở gói Pro.
5. **Bàn giao phần bí mật.** Biến môi trường, khoá API, `schema.sql` của D1, dữ liệu mẫu. Chuyển
   `secretsEnc` sang app mới và ghi rõ khoá nào là của Toolswave (khách phải thay) — chỗ này im
   lặng là hỏng.
6. **Giấy tờ.** Sinh `BAN-GIAO.md`: chạy thế nào, deploy thế nào, sửa ở đâu, trỏ tên miền ra sao,
   cái gì còn phụ thuộc Toolswave và cái gì không. Mẫu 6 phần của track `extension` đang có sẵn
   để bám theo.

Mỗi bước ghi một mốc vào `Fulfillment.steps`, hiện thành thanh tiến trình cho người mua và một
bảng cho admin. Bước nào hỏng thì dừng ở đó, không nuốt lỗi — kiểu thất bại tệ nhất là thất bại
báo thành công (`systemctl reload cloudflared` là bài học gần nhất).

**Hai chế độ bán, phải chọn trước khi viết mã:**

- *Bán nhiều lần* — mỗi người mua nhận một bản nhân bản, app gốc vẫn của Toolswave. Giống bán theme.
- *Bán đứt một lần* — chuyển `App.ownerId` sang người mua, gỡ listing, Toolswave không giữ bản
  chạy nào. Cần thêm nút "chuyển quyền sở hữu" và phải dọn cả `pagesProject`, subdomain, D1.

Chế độ nào cũng được, nhưng chúng khác nhau ở tầng dữ liệu nên không thể "làm rồi tính sau".

## 7. Tool nhỏ lẻ = app đã publish

Hệ B định nghĩa tool bằng một bảng riêng rồi không bao giờ đổ dữ liệu vào. Đề xuất bỏ hướng đó:

> Mỗi tool nhỏ là **một App thật trong hệ A**, do tài khoản Toolswave dựng bằng chính builder,
> `published = true`, có `Listing` với `kind = tool`.

Được ba thứ cùng lúc: tool có trang chạy thật ngay (`/a/[slug]` đã có), cửa hàng và builder dùng
chung một khái niệm App thay vì hai, và mỗi tool là một bản demo sống của sản phẩm chính — khách
dùng thử tool rồi thấy dòng "app này dựng bằng Toolswave, bạn cũng dựng được".

Tool trả phí không cần `Subscription` riêng: kiểm `Entitlement(kind=tool_premium)` hoặc `plan` của
người dùng. Đường công khai `toolswave.net/tools/<slug>` là một lớp mỏng trên trang app đã có.

## 8. Tài khoản, tiền, quyền

**Người dùng.** Cả hai hệ dùng `bcryptjs`, nên hash mang sang được và **không ai phải đặt lại mật
khẩu**. Quy tắc nhập:

- Trùng email → gộp vào tài khoản hệ A đang có; đơn hàng cũ gắn vào đó; giữ `legacyId`.
- Chỉ có ở hệ B → tạo `User` mới trong hệ A, giữ nguyên hash, `plan = free`.
- `OAuthAccount` của hệ B → hệ A lưu liên kết OAuth thẳng trên `User`; ánh xạ theo provider, xung
  đột thì ưu tiên bản hệ A và ghi log.
- `AdminUser` (bảng riêng của hệ B) → không nhập; cấp lại thủ công vài tài khoản admin.

**Tiền.** Cùng SePay, nên không đổi cổng. `Payment.kind` hiện là `plan | storage`; thêm `order` và
cho `settle()` biết: đơn nào được trả thì đánh dấu `Order.status = paid` rồi chạy `Fulfillment`.
Một cổng, một bộ đối soát, một chỗ xem doanh thu.

**Gói premium cũ của hệ B** (`premium_monthly`/`premium_yearly`) → chuyển thành `Entitlement`
`kind=tool_premium` với đúng `expiresAt` cũ. Không tự nâng họ lên gói trả phí của hệ A và cũng
không cắt sớm ngày nào — cả hai đều là quyết định thay khách hàng.

## 9. Tên miền, đường dẫn, SEO

Sau khi gộp, `toolswave.net` giữ tất cả:

```
/                    nền tảng (như hiện nay)
/store               cửa hàng — tất cả loại món
/store/software | documents | sourcecode | apps
/store/<slug>        trang bán một món
/tools               danh sách tool
/tools/<slug>        tool chạy được (lớp mỏng trên /a/[slug])
/blog, /explore, /pricing, /a/[slug], /u/[handle]   giữ nguyên
```

`app.toolswave.net` **không tắt**, chuyển thành trạm chuyển hướng 301 vĩnh viễn theo từng đường:
`/shop/software/*` → `/store/software/*`, `/shop/documents/*`, `/shop/sourcecode/*`, `/tools/*`,
`/blog/*` (đường này đã chuyển hướng sẵn). Sitemap mới, IndexNow lại toàn bộ, khai đổi địa chỉ
trong Search Console.

Thành thật về cái giá: đây là **lần đổi địa chỉ thứ hai trong vòng một tháng** đối với nội dung
của hệ B. Google cần vài tuần để ổn định lại. Không tránh được, ngoài việc làm sớm — số trang chỉ
tăng chứ không giảm.

## 10. Lộ trình — mỗi giai đoạn tự đứng được

Không làm một cú lớn. Mỗi giai đoạn dưới đây kết thúc ở một trạng thái chạy được, và dừng lại ở đó
cũng không sao.

**GĐ 1 — Cửa hàng xuất hiện trên toolswave.net (đọc thôi). — ĐÃ XONG 23/09/2026, xem §13.**
`/store` của hệ A đọc danh mục qua API hệ B (chỉ đọc). Chưa đụng cơ sở dữ liệu, chưa đụng đơn hàng.
Xong là khách đã thấy hàng ở đúng chỗ.

**GĐ 2 — Dữ liệu về hệ A.**
Thêm `Listing`/`Inventory`, viết script nhập từ Postgres hệ B (kèm mã hoá `dataEnc`), `/store` đổi
sang đọc dữ liệu của chính mình. Quản trị cửa hàng mọc trong `cms.toolswave.net`. Trang shop bên hệ
B chuyển sang chỉ đọc.

**GĐ 3 — Người dùng và đơn hàng.**
Nhập `User`, nhập lịch sử `Order` (chỉ đọc), mở `Order`/`OrderItem`/`Fulfillment` mới, thanh toán
chạy qua `Payment.kind=order` của hệ A. Bật `reveal_secret` + `download` + `git_invite`. Từ đây hệ
B không nhận đơn nữa.

**GĐ 4 — Bàn giao app.**
Dựng pipeline §6, thêm nút "Đăng bán" trên app, bán thử một hai app thật trước khi mở rộng. Giai
đoạn dài nhất và cũng là phần đáng làm nhất.

**GĐ 5 — Tool thật.**
Dựng 8–12 tool bằng chính builder, publish, gắn `Listing kind=tool`, mở `/tools`. Bỏ dữ liệu giả.

**GĐ 6 — Dọn.**
`app.toolswave.net` thành trạm 301. Hệ B còn lại CRM + kế toán (`Shareholder`, `Investment`,
`JournalEntry` — những thứ hệ A không có và chưa cần có). Quyết định port hay giữ riêng lúc đó, khi
đã nhẹ gánh.

## 11. Chỗ dễ sai

Sáu cái đầu là bài học đã trả tiền hôm 22/09, chép lại vì việc này chạm đúng những chỗ đó.

1. **Biến `NEXT_PUBLIC_*` / `VITE_*` nhúng lúc build.** Đổi `.env` rồi restart là không có tác
   dụng. Đổi → build lại → mới restart.
2. **`systemctl reload cloudflared` không làm gì** (ExecReload rỗng, vẫn báo thành công). Phải
   `restart`.
3. **nginx chọn khối theo `server_name`, không theo cổng.**
4. **`.next/cache/fetch-cache` sống qua restart và mỗi tiến trình giữ một bản.** Xoá ở cả thư mục
   build lẫn standalone, cho cả hai tiến trình.
5. **OAuth redirect URI phải khai trước.** Thêm đường mới, giữ đường cũ vài ngày.
6. **Đếm những gì mình đã sửa không bao giờ lộ ra thứ mình quên sửa.** Script nhập dữ liệu phải
   kiểm bằng cách đọc lại bản ghi đích, không bằng con số nó tự in ra.

Ba cái riêng của việc này:

7. **Khoá/tài khoản trong `Inventory` là dữ liệu sống của khách hàng.** Nhập sai một lần là bán
   nhầm hàng đã bán. Script nhập phải chạy được nhiều lần mà không nhân đôi (`legacyId` duy nhất).
8. **Gộp user trùng email có thể gộp nhầm hai người khác nhau.** Chỉ gộp tự động khi email đã xác
   minh ở hệ B (`emailVerified`); còn lại để admin duyệt tay.
9. **Bán app mà quên đóng băng build** thì người mua hôm nay và người mua tháng sau nhận hai thứ
   khác nhau, còn Toolswave thì không biết mình đã giao cái gì.

## 12. Ba quyết định đã chốt (23/09/2026)

1. **Chỉ Toolswave bán.** Không mở cho người dùng bán app của họ ở giai đoạn này — marketplace hai
   chiều kéo theo duyệt nội dung, chia doanh thu, rút tiền và thuế, lớn hơn hẳn phần còn lại cộng
   lại. Cột `Listing.sellerId` vẫn có trong thiết kế để mở sau mà không phải đổi schema.
2. **App bán NHIỀU LẦN.** Mỗi người mua nhận một bản nhân bản; app gốc vẫn thuộc Toolswave. Nghĩa
   là §6 đi nhánh "nhân bản", không có nút chuyển quyền sở hữu, và không phải dọn `pagesProject` /
   subdomain / D1 của bản gốc sau mỗi lần bán.
3. **Kế toán của hệ B để yên.** `Shareholder` / `Investment` / `JournalEntry` ở lại hệ B cùng CRM;
   xử lý sau, khi phần cửa hàng đã dọn xong.

## 13. Giai đoạn 1 — đã làm

Cửa hàng đã xuất hiện trên `toolswave.net/store`, **đọc danh mục từ portal**, chưa đụng cơ sở dữ
liệu và chưa nhận đơn.

**Bên API (`apps/api/src/store/`)** — `/v1/store/*`, công khai, không cần đăng nhập:

| Đường | Trả về |
|---|---|
| `GET /v1/store?limit=6` | mỗi loại hàng một nhóm + số món |
| `GET /v1/store/:kind` | danh sách, có `page`/`pageSize`/`search`/`category` |
| `GET /v1/store/:kind/:slug` | chi tiết một món |
| `GET /v1/store/categories?kind=` | chuyên mục + số món, đếm trên TOÀN danh mục |
| `GET /v1/store/slugs` | mọi slug đang bán — sitemap đọc |

Ba điều quan trọng nằm ở tầng này:

- **Web không gọi thẳng portal.** Hợp đồng `StoreListing` (trong `@larkwave/shared`) giữ nguyên
  khi dữ liệu dọn về đây ở giai đoạn 2 — lúc đó chỉ `store.service.ts` đổi, ba trang web đứng yên.
- **Cổng lọc dữ liệu nội bộ.** Portal để lộ `priceCost` (giá vốn) ngay trong `GET
  /api/shop/software` công khai, và `zipFileUrl` + `gitlabRepoId` trong chi tiết mã nguồn. Service
  chỉ chép ra đúng các trường của `StoreListing`, nên không có gì lọt kể cả khi portal thêm trường
  mới. Có test giữ luật này (`store.service.spec.ts`).

  **Đã bịt tại GỐC ngày 23/09/2026** — kho `toolswave-workspace`, commit `21d40d1`: tuyến công khai
  của portal dùng `select` tường minh, phân biệt `scope` public/admin (CRM vẫn đọc được giá vốn để
  tính biên lợi nhuận). Đo trên production sau khi triển khai: `priceCost` 3 → 0, `gitlabRepoId`
  1 → 0. Bộ lọc ở cổng này **giữ nguyên** dù gốc đã sạch: hai hệ phát hành độc lập nhau, và lớp thứ
  hai là thứ đứng vững khi lớp thứ nhất bị sửa nhầm về sau.
- **Portal chết thì cửa hàng không trắng.** Mỗi loại hàng đệm toàn bộ danh mục 5 phút; upstream
  hỏng thì trả bản cũ, chưa từng có dữ liệu mới trả rỗng.

**Bên web (`apps/web/src/app/store/`)** — ba trang server-render, song ngữ, có JSON-LD
(`CollectionPage` / `ItemList` / `Product`), canonical + hreflang, thêm vào `sitemap.ts` và thêm
mục "Cửa hàng" trên thanh điều hướng. Tìm kiếm là form GET thuần nên chạy cả khi JavaScript chưa
tải xong, và mỗi bộ lọc có URL riêng để chia sẻ.

**Nút "Mua" trỏ về portal** (`Listing.buyUrl`), kèm một dải nói rõ điều đó ở cả trang danh sách lẫn
trang chi tiết — portal vẫn là nơi duy nhất nhận đơn cho tới giai đoạn 3. Đổi đích chỉ sửa một hàm
trong service.

**Biến môi trường mới** (`apps/api/.env`):

```
PORTAL_API_BASE=https://apia.toolswave.net/api   # trên máy chủ thật nên đặt http://127.0.0.1:4001/api
PORTAL_PUBLIC_URL=https://app.toolswave.net      # đích của nút "Mua"
```

Hai hệ nằm **cùng một máy**, nên đi vòng qua Cloudflare rồi quay lại chỉ thêm độ trễ và thêm một
chỗ hỏng. Để `PORTAL_API_BASE` rỗng là tắt hẳn cửa hàng (API trả rỗng, không lỗi).

**Đo thật ngày 23/09/2026:** 322 tài khoản phần mềm · 5 tài liệu · 209 mã nguồn. Trần
`MAX_ITEMS = 500` mỗi loại vẫn còn chỗ, nhưng mã nguồn và phần mềm đang tiến về ngưỡng đó — chạm
trần là lúc dữ liệu đã nên nằm ở giai đoạn 2 chứ không phải lúc nâng trần.

**Cố ý CHƯA làm ở giai đoạn này:** giỏ hàng, thanh toán, tài khoản, lịch sử đơn, quản trị cửa hàng
trong `cms.toolswave.net`, và `/tools`. `/tools` vẫn 301 sang portal (xem `DUONG_HE_KIA` trong
`apps/web/src/proxy.ts`) cho tới giai đoạn 5.

## 14. Giai đoạn 2 — đã dựng xong phần mã (24/09/2026)

Sáu bảng, một script nhập, một mặt quản trị, và đường cấp dự án cho nhân viên bán hàng. Commit
`2deb167` (lược đồ) và `c14902b` (phần còn lại). **Chưa chạm cơ sở dữ liệu nào** — không
`db push`, không migrate, chưa nhập thật, chưa deploy.

### Ba chỗ kế hoạch còn thủng, đã chốt

Mục 4 viết ra trước khi có mã, nên nó bỏ quên ba thứ mà chỉ lúc dựng mới lộ:

1. **Đường giao hàng không có chỗ cất.** `driveLink` / `zipFileUrl` / `gitlabRepoId` là thứ mục 4
   không nhắc tới, và chỗ duy nhất "tiện" để nhét là `detail` — mà `detail` đi thẳng ra API công
   khai. Nhét vào đó là mở lại đúng lỗ rò vừa bịt bên portal hôm 23/09. Nay chúng nằm ở cột
   `Listing.deliveryEnc`, mã hoá AES-256-GCM, chỉ mặt quản trị đọc được.
2. **`slug` duy nhất toàn cục mâu thuẫn với đường dẫn đang chạy.** Nay `@@unique([kind, slug])`.
3. **`updatedAt` không giữ được ngày của nguồn.** Cột mang `@updatedAt` nên Prisma đặt lại ở mọi
   lượt ghi: sau một đợt nhập thì cả 209 dự án cùng mang một ngày, mục "Mới cập nhật" thành vô
   nghĩa và `lastmod` trong sitemap khai với máy tìm kiếm rằng toàn bộ danh mục vừa đổi cùng lúc.
   Nay có cột riêng `sourceUpdatedAt`, và mặt tiền đọc ngày của nguồn trước.

### Luật chọn nguồn — vì sao không cần deploy hai lần

`STORE_SOURCE=auto` (mặc định): có hàng trong `Listing` thì đọc bảng, chưa có thì đọc portal.
Đợt nhập dữ liệu **tự nó lật nguồn**, không có khoảnh khắc nào mặt tiền trắng ở giữa. Hai giá trị
ép tay là van khoá: `portal` để lùi ngay khi nhập hỏng (đổi một biến, khởi động lại — không phải
revert mã), `local` để soi nhánh mới trên máy chủ thật mà không bị portal đỡ hộ.

### Còn lại, và phải có người bấm

1. **`prisma db push`** trên máy chủ — sáu bảng mới, thuần THÊM, không đụng dữ liệu cũ.
2. **Chạy `scripts/store-import.mjs` trên máy chủ**, lượt đầu để nguyên chế độ xem trước. Con số
   đối chiếu kỳ vọng: 322 phần mềm · 5 tài liệu · 209 mã nguồn. Đọc bảng đối chiếu rồi mới thêm
   `--that-su-ghi`. Script cần `DATABASE_URL` (hệ A), `DATABASE_URL_HE_B`, `JWT_SECRET` và
   `PORTAL_PUBLIC_URL`; nó tự dừng nếu hai URL trỏ cùng một cơ sở dữ liệu.
3. **Deploy.** Bộ lọc quyền của phiên trợ lý chặn hẳn nhóm này ("Production Deploy"), nên một lần
   deploy production cần một con người bấm — kể cả khi mọi thứ khác đã tự động.

### Chưa làm, cố ý

Nhập **đơn hàng cũ và người dùng** của hệ B chưa nằm trong giai đoạn này. Hệ quả nhìn thấy được:
suất kho đã bán về đích mang `status='sold'` nhưng `orderItemId` rỗng — không ai bán lại được nó,
nhưng cũng chưa biết nó thuộc đơn nào. Lúc nhập đơn thì nối lại theo `Inventory.legacyId`.

Phần **nhân bản App vào tài khoản người mua** (mục 6 bước 2) cũng chưa làm: đường cấp dự án hiện
mới ghi nhận QUYỀN (`Entitlement`) chứ chưa dựng app cho khách. Đó là giai đoạn 4.
