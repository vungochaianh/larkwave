# AI Providers, Auto-Router & Cost (Thu–Chi) — Setup Guide

This file documents how Toolswave talks to AI providers, how it auto-picks the
cheapest capable model, and how to read the revenue/cost report. Edit the values
in the **server `.env`** (NOT in source code, NOT in git).

> **Easiest way (recommended): the CMS.** Go to **Admin → AI** (`/admin/ai`) →
> "AI Providers & Logic" panel → paste the **OpenAI / Grok** key → Save. Keys are
> **AES-encrypted** in the DB and take effect immediately (no SSH, no redeploy).
> The app reads **CMS key first, then the env var** as fallback.
>
> Server `.env` path (the fallback method): `/home/app/toolswave/.env` on the deploy
> host. The deploy (`deploy/ci-deploy.sh`) **excludes `.env`** from rsync, so it is
> managed only on the server. After editing it: `systemctl restart toolswave-api`.
>
> **Anthropic key stays in `.env`** (`ANTHROPIC_API_KEY`, required) — only the
> optional OpenAI/Grok keys can be set from the CMS.

### 🔁 Rotating / changing a key (do this for any leaked key)
1. Revoke the old key at the provider console (OpenAI / xAI / Anthropic).
2. Create a new key.
3. Paste the new key in **Admin → AI** (overwrites the old one) — OR update `.env` + restart.
4. Done — the next AI call uses the new key. (Leave the CMS field blank to fall back to env.)

---

## 1. Environment variables

| Var | Required? | Default | What it is |
|-----|-----------|---------|-----------|
| `ANTHROPIC_API_KEY` | ✅ **required** | — | Claude key — the main codegen brain. (`sk-ant-…`) |
| `ANTHROPIC_MODEL` | optional | `claude-opus-4-8` | Fallback model id when none is passed. |
| `OPENAI_API_KEY` | optional | _(empty → inert)_ | OpenAI **project** key (`sk-proj-…`). Failover/aux only. |
| `OPENAI_MODEL` | optional | `gpt-4o-mini` | OpenAI model used for failover. |
| `GROK_API_KEY` | optional | _(empty → inert)_ | xAI Grok key. Failover (OpenAI-compatible API). |
| `GROK_MODEL` | optional | `grok-2-1212` | Grok model used for failover. |

Each optional provider is **fully inert** until its key is set — nothing breaks
if you leave them blank.

### Example `.env` block

```dotenv
# --- AI providers ---
ANTHROPIC_API_KEY=sk-ant-xxxxxxxx        # required
ANTHROPIC_MODEL=claude-opus-4-8

# Optional secondary providers (failover rotation). Leave blank to disable.
OPENAI_API_KEY=                          # sk-proj-...  (PROJECT key only!)
OPENAI_MODEL=gpt-4o-mini

GROK_API_KEY=                            # xAI key from https://console.x.ai
GROK_MODEL=grok-2-1212
```

---

## 2. How to get each key

### OpenAI (`OPENAI_API_KEY`)
1. https://platform.openai.com/api-keys → **Create new secret key**.
2. Choose a **Project key** (`sk-proj-…`). **Never** an Admin key (`sk-admin-…`).
3. (Optional) restrict it to one project + set a low monthly spend limit.
4. Paste into `.env` as `OPENAI_API_KEY=` → restart the API.

### xAI Grok (`GROK_API_KEY`)
1. https://console.x.ai → **API Keys** → create a key.
2. Top up a little credit (xAI is pay-as-you-go).
3. Paste into `.env` as `GROK_API_KEY=` → restart the API.
4. Pick a model in `GROK_MODEL` (`grok-2-1212` is cheap; `grok-4` is stronger).

### ⚠️ Anthropic "management key" (the screen you saw) — usually NOT needed
That screen creates an **org management key** (manage API keys, billing, members…).
The **app does NOT need it** — codegen runs on the normal `ANTHROPIC_API_KEY`.

Only create one if you later want to pull **real Anthropic billing** into the
thu-chi report. If so, grant **least privilege**:

| Endpoint Group | Access | Why |
|---|---|---|
| **Billing** | **Read** | read actual spend |
| Everything else (API Keys, Audit Logs, Models, Files, …) | **No access** | not needed |

Add IP allow-listing if possible. Store it as a SEPARATE env var (don't reuse the
codegen key). Until then, the report's computed cost (below) is the source of truth.

---

## 3. Auto-Router (model selection)

Users pick a **tier**, not a raw model:

- **🤖 Tự động** (default, 1 credit) — a cheap **Haiku** evaluator reads the prompt
  and picks **Haiku** (simple: landing/static/no-backend) or **Sonnet**
  (complex: DB/auth/many screens). Conservative → defaults to Sonnet when unsure.
- **💎 Opus** (5 credits) — explicit premium. **Never auto-selected.**

Failover rotation for the router call (resilience): **Anthropic Haiku → OpenAI →
Grok** (whichever keys are set). The chosen model + reason is logged in the build
conversation ("🤖 Tự động chọn …").

**Where to tune it:**
- Router prompt / Haiku-vs-Sonnet rule: `apps/api/src/engine/codegen.service.ts` → `recommendModel()`.
- Which stages use the cheap aux model: `apps/api/src/pipeline/pipeline.service.ts` → `AUX_MODEL` (intake + spec run on Haiku).
- Build-fix loop stops early when a fix doesn't change the error (saves codegen): same file → `errorSignature()`.

> Codegen itself is **not** routed to OpenAI/Grok yet — their tool-use/prompt
> behaviour differs from Claude and would need separate tuning. They're wired as
> router/aux failover for now. (Cross-provider codegen = a future opt-in.)

---

## 4. Thu–Chi (revenue / cost) report

Admin page: **`/admin/reports`** (API: `GET /v1/admin/reports?period=today|7d|30d|all`).

- **Thu (revenue)** = sum of **paid** `Payment.amountVnd`.
- **Chi (cost)** = sum of `Build.usage.usd` across builds (every LLM call —
  codegen, blueprint, spec, intake, the router, and any OpenAI/Grok failover —
  is priced and accumulated here), broken down by model + a daily series.
- **Lợi nhuận** = Thu − Chi.

**Accuracy note:** `usd` is **computed** (tokens × public list price), so it is a
slightly **conservative estimate** — it does not subtract the prompt-caching
discount, so your real Anthropic invoice is usually a bit lower. Treat it as a
safe ceiling. Prices live in `apps/api/src/engine/anthropic.service.ts` (`PRICING`)
and `apps/api/src/engine/openai.service.ts` (`PRICING`) — update them if the
providers change their rates.

---

## 5. Security checklist

- ❌ Never commit keys to git. They live only in the server `.env`.
- ❌ Never paste keys into chat / screenshots / tickets. If you do → **revoke + rotate**.
- ✅ Use OpenAI **project** keys, not admin keys.
- ✅ Set per-key spend limits on each provider's console.
- ✅ Rotate keys periodically; revoke unused ones.

---

## 6. Roadmap (cost + quality)

1. ✅ Auto-router (Haiku/Sonnet) — done.
2. ⏳ **Template/scaffold reuse** — common app types (landing, todo, blog, shop,
   CRUD-dashboard) start from a vetted template; AI only customizes the diff →
   far fewer tokens, faster, more reliable. _(in progress)_
3. ⏳ **Static pre-deploy check** (typecheck/lint generated code locally) → catch
   errors before deploy → fewer failed builds (= fewer wasted tokens).
4. 🔭 Cross-provider codegen + real-billing pull (management key) — later.
