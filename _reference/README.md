# Toolswave App Builder

Hệ thống agents: **nhập một prompt → tự tạo app → xem preview → deploy/chia sẻ**, kèm CMS để sửa cấu hình & prompt mẫu.

## Có gì trong này

```
MASTER-PROMPT.md          # System prompt cho orchestrator (token dạng biến)
.env.example              # Khai báo biến bí mật — copy thành .env rồi điền
config/pipeline.default.json  # Cấu hình mặc định (CMS sửa được, ghi ra pipeline.json)
server/                   # Orchestrator: API + pipeline 6 giai đoạn + gọi Claude
public/index.html         # CMS: tạo app, theo dõi pipeline, sửa cấu hình
deploy/                   # GitLab CI, script tạo user 'app' quyền giới hạn
```

## Chạy thử (2 phút)

```bash
cp .env.example .env        # rồi điền ANTHROPIC_API_KEY (tối thiểu)
npm install
npm start                   # mở http://localhost:8080
```

Mở CMS → tab **Tạo app** → nhập mô tả → bấm **Tạo app**. Pipeline 6 giai đoạn chạy realtime trên rail. Tab **Cấu hình** để sửa track/prompt/giới hạn (lưu vào `config/pipeline.json`).

## Hệ thống làm gì ở mỗi giai đoạn

1. **Phân loại** — Claude xác định web / mobile / extension.
2. **Spec** — sinh đặc tả ngắn.
3. **Sinh code** — sinh code v0 (chỉ tính năng cốt lõi).
4. **Build** — *(điểm cần nối runner thật)* chạy build trên server qua Tailscale, user `app`.
5. **Preview** — web: Cloudflare Pages preview; mobile: Expo Go QR.
6. **Deploy** — web: subdomain `{slug}.toolswave.net`; mobile: EAS; extension: ZIP + hướng dẫn.

## Phần cần nối với hạ tầng thật (đã để sẵn chỗ)

`server/pipeline.js` giai đoạn 4–6 hiện trả trạng thái mô phỏng để chạy thông end-to-end. Để deploy thật:

- **Web:** đẩy code app sinh ra lên GitLab (group `toolswave`), GitLab CI (`deploy/.gitlab-ci.yml`) tự build + `wrangler pages deploy` + gắn subdomain qua Cloudflare API.
- **Server:** chạy `deploy/provision-app-user.sh` một lần để tạo user `app` quyền giới hạn (không sudo, dải port riêng, không đụng dịch vụ dev khác).
- **Mobile:** thêm bước `eas build` trong pipeline.

## Về token (quan trọng)

- Mọi token nạp từ `.env`. Đổi token chỉ sửa `.env`, không sửa code hay prompt.
- Lên production: chuyển secret sang **GitLab CI/CD Variables** (Masked + Protected), `.env` chỉ dùng ở máy chạy orchestrator.
- `.env` đã được `.gitignore` — không bao giờ commit.
