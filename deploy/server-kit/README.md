# Server-Deploy Kit — deploy a full-stack project like velvel

Cloudflare Pages (Toolswave's default) only runs **static web + Pages Functions + D1**.
A **full-stack system** (Next.js SSR + Node/Python backend + a database) must run as
**containers on a real server**, exposed via **nginx + a Cloudflare tunnel** at
subdomains. This kit is the repeatable, generalised version of exactly what
`velvel-workspace` does (live at `velvel/cmsvelvel/apivelvel/agentvelvel.toolswave.net`).

Copy this `server-kit/` folder into any full-stack project, fill in the config, and
run `bash server-kit/deploy.sh` from the project root.

## What it does

```
your project (docker-compose.yml + services)
        │  server-kit/deploy.sh
        ▼
  rsync → server  →  docker compose build & up -d  →  nginx vhost per subdomain
                                                   →  cloudflared tunnel route dns
                                                   →  reload nginx
        ▼
  https://<sub>.toolswave.net  →  nginx :80  →  127.0.0.1:<port>  →  container
```

## Prerequisites (on the server — already true for `100.100.164.92`)

- Docker + Docker Compose, nginx (owns :80), cloudflared with a tunnel.
- An existing Cloudflare tunnel whose ingress forwards unmatched hostnames to
  `http://localhost:80` (nginx). The `toolswave` tunnel already does this — that's
  why velvel's subdomains resolve. New subdomains only need a DNS route (step 4)
  + an nginx vhost; you do NOT re-touch the tunnel config.
- SSH access to the server.

## Use it (per project)

1. **Copy** this folder into your project as `server-kit/`, and put a
   `docker-compose.yml` at the project root (see `docker-compose.example.yml`).
2. **Pick a free host-port range.** The shared server already uses many ports
   (3xxx/5xxx/6xxx/7xxx/9xxx). Choose an unused block (e.g. `92xx`) for your
   services' published ports — see `deploy.config.example.sh`. The script checks
   for clashes before starting.
3. **Configure:** `cp server-kit/deploy.config.example.sh deploy.config.sh` and edit
   `SERVER`, `REMOTE_DIR`, `PROJECT`, `TUNNEL_ID`, and the `ROUTES` (subdomain→port).
4. **Secrets:** put real env files next to each backend service (e.g.
   `api/.env`) — they are NOT committed; `deploy.sh` rsyncs them up.
5. **Deploy:** `bash server-kit/deploy.sh`

Re-running is idempotent (rebuilds, recreates vhosts, re-routes DNS).

## Notes / safety

- Each project uses its own `PROJECT` compose name + its own port block → it does
  **not** affect other developers' containers/ports on the shared server.
- `cloudflared tunnel route dns` uses the server's tunnel cert, so it works even
  when a Cloudflare API token lacks DNS-write permission.
- For a dynamic Next.js frontend, set `NEXT_PUBLIC_API_URL` (in compose env) to the
  backend's public subdomain so the browser reaches the API.

## Where this is going

This is the manual, reusable form. The same flow can become a one-click
**"Deploy lên Server (Docker)"** target inside Toolswave (auto port allocation +
nginx + tunnel route per app) — this kit is the reference implementation for it.
