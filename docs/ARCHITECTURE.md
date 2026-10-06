# Architecture

## Surfaces & routing

One NestJS API (`apia`) and one Next.js app serving two host-routed surfaces
(`app` = builder, `aapp` = admin). Public ingress is the server's existing
Cloudflare Tunnel; each hostname maps to a local port:

```
app.toolswave.net  ─┐
aapp.toolswave.net ─┼─ Cloudflare Tunnel ─┬─ :4100  Next.js (proxy.ts host-routes app vs /admin)
apia.toolswave.net ─┘                     └─ :4101  NestJS API (/v1)
                                              :5433  Postgres (isolated container, localhost-only)
```

Next 16 renamed the middleware convention to `src/proxy.ts`: if `Host` starts
with `aapp` it rewrites to `/admin/*` (admin role required); otherwise the
builder surface. Missing `tw_token` cookie on a protected route → redirect
`/login`.

## Data model (Prisma / PostgreSQL)

```
User 1─* App 1─* Build 1─0..1 Deployment
User 1─* Build
AuditLog (actor, action, target, meta)
Setting (singleton: editable PlatformConfig)
```

- **User**: email, passwordHash (bcrypt), role `admin|user`, status. Seeded admin from `ADMIN_EMAIL/ADMIN_PASSWORD`.
- **App**: owner, unique `slug` (= Cloudflare Pages project + subdomain), track, status `draft|building|live|failed|archived`, `currentUrl`/`currentDeploymentId`.
- **Build**: a pipeline run — prompt, track, status, `stages` (Json), `spec`, `files` (Json), `logs` (Json), `result`, `usage`, error.
- **Deployment**: per successful build — url, pagesProject, status `live|superseded|failed`. New deploy supersedes the previous.

Enum string values are lowercase and identical across Prisma ↔ API ↔ shared
types ↔ UI, so entities cross every boundary with no mapping layer
([packages/shared/src/index.ts](../packages/shared/src/index.ts)).

## API (NestJS)

Global: Helmet, CORS allowlist, `ThrottlerGuard`, `ValidationPipe(whitelist,transform)`,
`JwtAuthGuard` (Bearer, `@Public()` opt-out) + `RolesGuard` (`@Roles('admin')`).

Modules: `auth` (register/login/me), `users` (admin CRUD), `apps` (CRUD + builds/deployments),
`builds` (create→enqueue, list, detail, **SSE** `/builds/:id/stream`, cancel), `deployments`,
`settings` (config get/put), `audit`, `health`. Engine: `anthropic`, `codegen` (+scaffold merge),
`cloudflare-pages` (wrangler), `build-runner`, `qr`, `gitlab`. `pipeline` orchestrates; `events`
is the in-process SSE bus.

## Pipeline & SSE

`PipelineService` runs stages, persisting `Build` after each and publishing
`SseEvent`s (`snapshot|log|stage|status|result|done|error`) via `EventsService`.
A concurrency gate honours `MAX_CONCURRENT_JOBS`. Web track: build runner does
`npm install` + `vite build`; on failure it asks Claude to fix and retries up to
`MAX_FIX_ATTEMPTS`, then `wrangler pages deploy` → public `*.pages.dev`. The SSE
client uses **fetch streaming** (not EventSource) so it can send the Bearer header.

## Codegen reliability

Generated web files are merged over a known-good Vite scaffold
([apps/api/src/engine/scaffold.ts](../apps/api/src/engine/scaffold.ts)): a valid
`package.json` (build = `vite build`, never `tsc`), `vite.config.ts`, `index.html`,
entry + styles are guaranteed even if the model omits one — so a deploy never
fails on a missing config file.

## Known capability limits (credential scopes)

- Cloudflare token: Pages create+deploy ✅, DNS-write ❌ (use the tunnel cert), Tunnel API ❌ (reuse existing tunnel).
- GitLab token is a *deploy token* — no API; per-app repo push + project creation need a `glpat-` api token. The `gitlab` service degrades gracefully.
