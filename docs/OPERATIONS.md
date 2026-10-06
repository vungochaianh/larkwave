# Operations runbook

> **Larkwave:** tài liệu này kế thừa từ Toolswave (trước khi tách). Những phần nói về dựng app
> (codegen, build, deploy app, cửa hàng, blog…) KHÔNG còn áp dụng — xem [TACH-APP.md](TACH-APP.md).

Server `100.100.164.92` (Tailscale, Ubuntu 24.04). Everything runs as the
unprivileged `app` user under `/home/app/toolswave`. Nothing here touches the
other services already on the box.

## First-time provisioning

```bash
# as root on the server
TW_DB_PASSWORD=<strong>  bash deploy/provision.sh     # app user + dirs + isolated Postgres (127.0.0.1:5433)
cp deploy/.env.production.example /home/app/toolswave/.env   # fill real secrets, chmod 600
# install systemd units
cp deploy/systemd/toolswave-*.service /etc/systemd/system/ && systemctl daemon-reload
```

## Build / release

```bash
# as app, from /home/app/toolswave
bash deploy/deploy.sh           # pnpm install, build shared+api(+web), prisma db push, seed
# as root
systemctl enable --now toolswave-api toolswave-web
```

Redeploy after a code change: `rsync` (or `git pull`) → `deploy.sh` → `systemctl restart toolswave-api toolswave-web`.
(`deploy/ci-deploy.sh` does this from GitLab CI.)

## Domains (Cloudflare Tunnel)

The 3 hostnames are added to the existing tunnel `toolswave`
(`e0cbd60e-…`). See [../deploy/cloudflared-ingress.md](../deploy/cloudflared-ingress.md).
DNS routes are created with the account cert at `/home/deveris/.cloudflared/cert.pem`
(NOT the API token, which lacks DNS-write). After editing
`/etc/cloudflared/config.yml`, the tunnel must reload — the cleanest is a host
reboot or `systemctl restart cloudflared` (brief reconnect for ALL tunnel
hostnames). To avoid touching the shared tunnel, run a **dedicated** second
cloudflared for these 3 hostnames (see "Dedicated tunnel" below).

## Dedicated tunnel (isolated, no impact on others)

```bash
export TUNNEL_ORIGIN_CERT=/home/deveris/.cloudflared/cert.pem
cloudflared tunnel create toolswave-app                       # -> creds json + tunnel id
# /etc/cloudflared-app/config.yml: tunnel + credentials-file + ingress (apia/app/aapp -> 4101/4100) + 404
cloudflared tunnel route dns <new-id> apia.toolswave.net      # repoint the 3 CNAMEs
cloudflared tunnel route dns <new-id> app.toolswave.net
cloudflared tunnel route dns <new-id> aapp.toolswave.net
# systemd unit running: cloudflared --config /etc/cloudflared-app/config.yml tunnel run
```

## Health & logs

```bash
curl -s https://apia.toolswave.net/v1/health
journalctl -u toolswave-api -f
journalctl -u toolswave-web -f
docker logs tw-postgres
```

## Admin login

`ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env`. Manage users/apps/builds/
deployments/config at `https://aapp.toolswave.net`.

## ⚠️ Rotate secrets

Every token pasted into chat is compromised — rotate Anthropic, Cloudflare (token
+ R2), GitLab, Tailscale, and the server password. Update `.env` (and GitLab CI
variables) with the new values; no code changes needed.

## Backups

`docker exec tw-postgres pg_dump -U toolswave toolswave > backup.sql`
(volume `tw-pgdata`). Generated-app artefacts live under `.artifacts/`.
