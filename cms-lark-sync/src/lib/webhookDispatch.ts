/**
 * Webhook dispatch engine — shared by /api/lark/webhook and /api/lark/webhook-test.
 *
 * Key design:
 *   • Multiple independent WebhookEntry items, each with its own token + routing.
 *   • Incoming requests are matched to an entry by secretToken.
 *   • Backward-compatible: single larkBaseWebhook still works.
 *   • 60 s in-process config cache (stale-while-revalidate).
 *   • 50-event ring buffer for the UI debug panel.
 */

import { classifyBody, normalizeValue, stripHtml, type MediaItem, type NormalizedField } from './fieldNormalizer'

const BACKEND_API =
  process.env.NEXT_PUBLIC_API_BASE || 'https://apihoanam.toolswave.net/api'

// ── Types ──────────────────────────────────────────────────────────────────────

export type TelegramCfg = {
  enabled:  boolean
  botToken: string
  chatId:   string
}

export type LarkBotCfg = {
  enabled:    boolean
  webhookUrl: string
}

export type WebhookEntry = {
  id:              string
  name:            string
  enabled:         boolean
  secretToken:     string
  notifyTelegram:  boolean
  notifyLark:      boolean
  messageTemplate: string
}

export type NotifyConfig = {
  telegram?:         TelegramCfg
  lark?:             LarkBotCfg
  larkBaseWebhook?:  WebhookEntry   // legacy single entry
  larkBaseWebhooks?: WebhookEntry[] // multiple entries
}

export type WebhookEvent = {
  id:           string
  receivedAt:   string
  table:        string
  event:        string
  fieldCount:   number
  webhookName:  string   // which webhook entry matched
  body:         Record<string, any>
  dispatched?:  { telegram: boolean; lark: boolean }
  error?:       string
}

export type DispatchResult = {
  telegram: boolean
  lark:     boolean
  errors:   string[]
}

// ── In-process config cache ────────────────────────────────────────────────────

let _cfg: NotifyConfig | null = null
let _cfgAt = 0
const CFG_TTL = 60_000

export async function loadConfig(): Promise<NotifyConfig | null> {
  if (_cfg && Date.now() - _cfgAt < CFG_TTL) return _cfg
  try {
    const res = await fetch(`${BACKEND_API}/notify/config`, {
      cache:  'no-store',
      signal: AbortSignal.timeout(4_000),
    })
    if (res.ok) {
      const json = await res.json()
      _cfg  = json?.data ?? json
      _cfgAt = Date.now()
    }
  } catch { /* keep stale */ }
  return _cfg
}

export function injectConfig(cfg: NotifyConfig): void {
  _cfg   = cfg
  _cfgAt = Date.now()
}

export function getCacheStatus() {
  return { ready: !!_cfg, ageSeconds: _cfgAt ? Math.round((Date.now() - _cfgAt) / 1_000) : null }
}

// ── Webhook entry matching ─────────────────────────────────────────────────────
//
// Resolution order:
//   1. Search larkBaseWebhooks[] (new multi-entry array)
//   2. Fall back to larkBaseWebhook (legacy single entry)
//
// Token matching rules:
//   • Request has token  → find entry where secretToken === token
//   • Request has no token → find first enabled entry with no secretToken (open endpoint)

export function findMatchingWebhook(
  cfg:   NotifyConfig | null,
  token: string | null,
): WebhookEntry | null {
  if (!cfg) return null

  const all: WebhookEntry[] = [
    ...(cfg.larkBaseWebhooks ?? []),
    ...(cfg.larkBaseWebhook ? [cfg.larkBaseWebhook] : []),
  ]

  if (token) {
    return all.find(w => w.enabled && w.secretToken === token) ?? null
  } else {
    // No token in request — match first open (no-token) endpoint
    return all.find(w => w.enabled && !w.secretToken) ?? null
  }
}

/** Return all enabled webhook entries (for the test route to pick from). */
export function getEnabledWebhooks(cfg: NotifyConfig | null): WebhookEntry[] {
  if (!cfg) return []
  return [
    ...(cfg.larkBaseWebhooks ?? []).filter(w => w.enabled),
    ...(cfg.larkBaseWebhook?.enabled ? [cfg.larkBaseWebhook] : []),
  ]
}

// ── Event ring buffer ──────────────────────────────────────────────────────────

export const webhookEvents: WebhookEvent[] = []
const MAX_EVENTS = 50

export function pushEvent(ev: WebhookEvent): void {
  webhookEvents.unshift(ev)
  if (webhookEvents.length > MAX_EVENTS) webhookEvents.length = MAX_EVENTS
}

// ── Lenient body parser ────────────────────────────────────────────────────────
//
// Lark Automation may send JSON with unquoted / unescaped field values
// (e.g. AI text inserted directly into the body template).
// This function tries multiple strategies before giving up.

export function parseWebhookBody(raw: string): Record<string, any> {
  if (!raw?.trim()) return {};

  // 1. Standard JSON — fast path
  try { return JSON.parse(raw); } catch { /* fall through */ }

  // 2. Quote unquoted string values and retry
  try {
    const fixed = raw.replace(
      /("(?:[^"\\]|\\.)*"\s*:\s*)(?!["\[\]{}\-\d]|true\b|false\b|null\b)([^,}\]\n]+?)(\s*[,}\]])/g,
      (_, prefix, val, tail) => {
        const safe = val.trim().replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        return `${prefix}"${safe}"${tail}`;
      },
    );
    if (fixed !== raw) return JSON.parse(fixed);
  } catch { /* fall through */ }

  // 3. Regex extraction — pull recognisable key-value pairs
  const result: Record<string, any> = {};
  for (const [, k, v] of raw.matchAll(/"([^"]+)"\s*:\s*"((?:[^"\\]|\\.)*)"/g))
    result[k] = v.replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\t/g, '\t');
  for (const [, k, v] of raw.matchAll(/"([^"]+)"\s*:\s*(-?\d+(?:\.\d+)?)\b/g))
    if (!(k in result)) result[k] = Number(v);
  for (const [, k, v] of raw.matchAll(/"([^"]+)"\s*:\s*(true|false|null)\b/g))
    if (!(k in result)) result[k] = JSON.parse(v);
  for (const [, k, v] of raw.matchAll(/"([^"]+)"\s*:\s*([^",\[\]{}\n][^,}\]\n]*)/g))
    if (!(k in result)) result[k] = v.trim();

  if (Object.keys(result).length > 0) return result;

  // 4. Last resort
  return { _raw: raw.slice(0, 2000), _parseError: true };
}

// ── Message builders ───────────────────────────────────────────────────────────
// classifyBody and normalizeValue are imported from fieldNormalizer.ts

function applyTemplate(tpl: string, data: Record<string, any>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const v = data[key]
    if (v == null) return `{{${key}}}`
    const { display } = normalizeValue(key, v)
    return display || `{{${key}}}`
  })
}

function buildTelegramText(body: Record<string, any>, ts: string): string {
  const table = body.table ?? body.tableName ?? 'Lark Base'
  const event = String(body.event ?? 'webhook')
  const icon  = event.includes('created') ? '🟢'
              : event.includes('deleted')  ? '🔴'
              : event.includes('updated')  ? '🟡' : '🔵'

  const { textFields, mediaItems } = classifyBody(body)
  const lines: string[] = [`${icon} *${table}* — ${event}`, `🕐 ${ts}`, '']
  for (const f of textFields) {
    const safeVal = f.value.replace(/([_*[\]()~`>#+=|{}.!\\-])/g, '\\$1')
    lines.push(`• *${f.label}*: ${safeVal}`)
  }
  for (const m of mediaItems) {
    if (m.type === 'file') lines.push(`📎 *${m.key}*: ${m.url}`)
  }
  const text = lines.join('\n')
  return text.length <= 4096 ? text : text.slice(0, 4090) + '\n…'
}

function eventColor(event = ''): 'green' | 'red' | 'orange' | 'blue' {
  if (event.includes('created')) return 'green'
  if (event.includes('deleted')) return 'red'
  if (event.includes('updated')) return 'orange'
  return 'blue'
}

function buildLarkCard(body: Record<string, any>, ts: string): object {
  const table = body.table ?? body.tableName ?? 'Lark Base'
  const event = String(body.event ?? 'webhook')

  const { textFields, mediaItems } = classifyBody(body)
  const elements: any[] = [{ tag: 'div', text: { tag: 'lark_md', content: `🕐 ${ts}` } }]

  if (textFields.length > 0) {
    elements.push({ tag: 'hr' })

    const shortFields = textFields.filter(f => !f.hasMedia && f.value.length <= 80 && !f.value.includes('\n'))
    const longFields  = textFields.filter(f =>  f.hasMedia || f.value.length  > 80 ||  f.value.includes('\n'))

    for (let i = 0; i < shortFields.length; i += 2) {
      const cols: any[] = [{
        tag: 'column', width: 'auto',
        elements: [{ tag: 'div', text: { tag: 'lark_md', content: `**${shortFields[i].label}**\n${shortFields[i].value}` } }],
      }]
      if (shortFields[i + 1]) cols.push({
        tag: 'column', width: 'auto',
        elements: [{ tag: 'div', text: { tag: 'lark_md', content: `**${shortFields[i + 1].label}**\n${shortFields[i + 1].value}` } }],
      })
      elements.push({ tag: 'column_set', flex_mode: 'none', columns: cols })
    }

    for (const f of longFields) {
      const content = f.fullValue ?? f.value
      elements.push({ tag: 'div', text: { tag: 'lark_md', content: `**${f.label}**\n${content}` } })
    }
  }

  if (mediaItems.length > 0) {
    elements.push({ tag: 'hr' })
    const mediaLines = mediaItems.map(m => {
      const icon  = m.type === 'image' ? '🖼' : m.type === 'video' ? '🎬' : '📎'
      const label = m.type === 'image' ? 'ảnh' : m.type === 'video' ? 'video' : 'file'
      return `${icon} **${m.key}**: [Xem ${label}](${m.url})`
    })
    elements.push({ tag: 'div', text: { tag: 'lark_md', content: mediaLines.join('\n') } })
    const actions = mediaItems.map(m => ({
      tag: 'button',
      text: { tag: 'plain_text', content: `${m.type === 'image' ? '🖼' : m.type === 'video' ? '🎬' : '📎'} ${m.key}` },
      type: 'default', url: m.url,
    }))
    if (actions.length) elements.push({ tag: 'action', actions })
  }

  return {
    msg_type: 'interactive',
    card: {
      config:  { wide_screen_mode: true },
      header:  { title: { tag: 'plain_text', content: `${table} — ${event}` }, template: eventColor(event) },
      elements,
    },
  }
}

// ── Channel dispatchers ────────────────────────────────────────────────────────

async function sendTelegram(
  botToken: string,
  chatId:   string,
  text:     string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res  = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
      signal:  AbortSignal.timeout(8_000),
    })
    const json = await res.json().catch(() => ({}))
    if (json.ok === false) return { ok: false, error: json.description ?? `HTTP ${res.status}` }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Network error' }
  }
}

async function sendTelegramMedia(
  botToken: string,
  chatId:   string,
  item:     MediaItem,
): Promise<{ ok: boolean; error?: string }> {
  const method  = item.type === 'video' ? 'sendVideo' : 'sendPhoto'
  const fileKey = item.type === 'video' ? 'video'     : 'photo'
  try {
    const res  = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ chat_id: chatId, [fileKey]: item.url, caption: `📎 ${item.key}` }),
      signal:  AbortSignal.timeout(15_000),
    })
    const json = await res.json().catch(() => ({}))
    // Fallback: Telegram couldn't fetch the URL — send as plain link
    if (json.ok === false) {
      const icon = item.type === 'video' ? '🎬' : '🖼'
      return sendTelegram(botToken, chatId, `${icon} *${item.key}*: ${item.url}`)
    }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Network error' }
  }
}

async function sendLarkCard(
  webhookUrl: string,
  card:       object,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res  = await fetch(webhookUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(card),
      signal:  AbortSignal.timeout(8_000),
    })
    const json = await res.json().catch(() => ({}))
    if (json?.code !== undefined && json.code !== 0) {
      return { ok: false, error: json.msg ?? `Lark code ${json.code}` }
    }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Network error' }
  }
}

// ── Public dispatch function ───────────────────────────────────────────────────

/**
 * Run the full notification dispatch for a received webhook.
 *
 * @param body         — parsed request body from Lark automation
 * @param cfg          — full notify config (provides Telegram + Lark Bot credentials)
 * @param webhookEntry — the matched WebhookEntry (owns template + channel routing)
 * @param ts           — pre-formatted timestamp string
 */
export async function runDispatch(
  body:         Record<string, any>,
  cfg:          NotifyConfig,
  webhookEntry: WebhookEntry,
  ts:           string,
): Promise<DispatchResult> {
  const out: DispatchResult = { telegram: false, lark: false, errors: [] }
  if (!webhookEntry.enabled) return out

  const text = webhookEntry.messageTemplate?.trim()
    ? applyTemplate(webhookEntry.messageTemplate, { ...body, timestamp: ts })
    : buildTelegramText(body, ts)
  const card = buildLarkCard(body, ts)

  const tgReady = webhookEntry.notifyTelegram
    && !!cfg.telegram?.enabled && !!cfg.telegram.botToken && !!cfg.telegram.chatId
  const lkReady = webhookEntry.notifyLark
    && !!cfg.lark?.enabled && !!cfg.lark.webhookUrl

  const [tg, lk] = await Promise.all([
    tgReady ? sendTelegram(cfg.telegram!.botToken, cfg.telegram!.chatId, text)
            : Promise.resolve({ ok: false as const, error: 'not configured' }),
    lkReady ? sendLarkCard(cfg.lark!.webhookUrl, card)
            : Promise.resolve({ ok: false as const, error: 'not configured' }),
  ])

  out.telegram = tg.ok
  out.lark     = lk.ok
  if (!tg.ok && webhookEntry.notifyTelegram && tgReady) out.errors.push(`Telegram: ${tg.error}`)
  if (!lk.ok && webhookEntry.notifyLark     && lkReady) out.errors.push(`Lark: ${lk.error}`)

  // Send media (images/videos) to Telegram after the text message
  if (tg.ok && tgReady && !webhookEntry.messageTemplate?.trim()) {
    const { mediaItems } = classifyBody(body)
    for (const item of mediaItems) {
      if (item.type === 'image' || item.type === 'video') {
        await sendTelegramMedia(cfg.telegram!.botToken, cfg.telegram!.chatId, item)
      }
    }
  }

  return out
}
