/**
 * Lark OAuth helpers — redirect URI construction, state CSRF, token expiry.
 *
 * Lark OAuth callback URL format (from official docs):
 *   https://{redirect_url}?code=1yxlUSU8Rf+7B32HY3HR7g&state={state}
 *
 * IMPORTANT: The `code` value can contain literal `+` characters.
 * NEVER parse it with URLSearchParams / useSearchParams — they decode `+` as
 * a space, corrupting the code and causing token exchange to fail.
 * Use `getRawParam` (in the callback page) with `decodeURIComponent` instead.
 *
 * The redirect URI MUST:
 *   1. Point exactly to /lark/oauth/callback on this Next.js app
 *   2. Be registered EXACTLY in Lark Developer Console → Security Settings → Redirect URLs
 *   3. Use NEXT_PUBLIC_APP_URL (set in .env) so it is known at build time
 */

const CALLBACK_PATH = '/lark/oauth/callback'
const STATE_KEY     = 'lark_oauth_state'

// ── Scope system ──────────────────────────────────────────────────────────────
//
// Scopes are grouped by feature area. Compose presets from groups so it is
// easy to understand what each preset covers and to extend it later.
//
// Rule of thumb:
//   • bitable  — minimum viable (just Base Designer)
//   • standard — everything the app currently uses (DEFAULT)
//   • extended — add when you build calendar / docs / messaging features
//
// Lark rejects the authorization request if the total scope list is too long,
// so only request what you actually need.
// ─────────────────────────────────────────────────────────────────────────────

/** Named groups of scopes, each mapping to a product area. */
export const SCOPE_GROUPS = {
  /** User identity — always included so we get name, avatar, openId after login. */
  identity: [
    'contact:user.base:readonly',    // name, avatar, mobile
    'contact:user.id:readonly',      // openId / userId
  ],

  /**
   * Bitable (Base) — full CRUD on bases, tables, fields and records.
   * `bitable:app` is a "super-scope" that covers read + write on all Bitable
   * resources, so individual base:* scopes are not needed alongside it.
   * `drive:drive:readonly` is required to list the user's Bitable files.
   */
  bitable: [
    'drive:drive:readonly',
    'bitable:app',
  ],

  /**
   * Contact & directory — org structure, users, departments.
   * Used by: contact-scopes page, users-mapping page, contact-user page.
   */
  contact: [
    'contact:contact.base:readonly',
    'contact:user.employee_id:readonly',
    'contact:user.employee:readonly',
    'contact:user.phone:readonly',
    'contact:user.email:readonly',
    'contact:department.base:readonly',
    'contact:department.organize:readonly',
  ],

  /**
   * Messaging — send bot messages, read chats.
   * Enable when building Zalo/IM notification features.
   */
  messaging: [
    'im:message:send_as_bot',
    'im:message:readonly',
    'im:chat:readonly',
  ],

  /**
   * Docs (legacy v1 — wiki / sheets).
   * Use `docx` group for the modern DocX API (/docx/v1/).
   */
  docs: [
    'docs:document.content:read',
    'docs:document.media:download',
    'docs:document.media:upload',
  ],

  /**
   * DocX — modern document API (/docx/v1/documents).
   * Required by the AI Base Designer "Push to Lark Doc" feature.
   * Scopes must also be enabled in Lark Developer Console → Permissions.
   *
   * Official reference:
   *   https://open.larksuite.com/document/server-docs/docs/docx-v1/document/create
   */
  docx: [
    'docx:document',           // read documents
    'docx:document:create',    // create new documents
  ],

  /**
   * Calendar — read events and free-busy.
   * Enable when building scheduling features.
   */
  calendar: [
    'calendar:calendar:read',
    'calendar:calendar.event:read',
    'calendar:calendar.free_busy:read',
  ],
} as const

/** Available preset names. */
export type ScopePreset = 'bitable' | 'standard' | 'extended'

/**
 * Presets compose scope groups.
 *
 * | Preset   | Groups included                            | Use case                        |
 * |----------|--------------------------------------------|---------------------------------|
 * | bitable  | identity + bitable                         | Base Designer only              |
 * | standard | identity + bitable + contact               | Full app (DEFAULT)              |
 * | extended | standard + messaging + docs + calendar     | When those features are built   |
 */
export const SCOPE_PRESETS: Record<ScopePreset, readonly string[]> = {
  bitable: [
    ...SCOPE_GROUPS.identity,
    ...SCOPE_GROUPS.bitable,
  ],

  standard: [
    ...SCOPE_GROUPS.identity,
    ...SCOPE_GROUPS.bitable,
    ...SCOPE_GROUPS.contact,
    ...SCOPE_GROUPS.docx,       // DocX required for "Push to Lark Doc" feature
  ],

  extended: [
    ...SCOPE_GROUPS.identity,
    ...SCOPE_GROUPS.bitable,
    ...SCOPE_GROUPS.contact,
    ...SCOPE_GROUPS.docx,
    ...SCOPE_GROUPS.messaging,
    ...SCOPE_GROUPS.docs,
    ...SCOPE_GROUPS.calendar,
  ],
}

/**
 * Build a deduplicated, space-separated scope string from a preset plus any
 * extra scopes you want to add without switching to a larger preset.
 *
 * @example
 *   buildScopeString('standard')
 *   buildScopeString('standard', ['wiki:wiki:readonly'])
 */
export function buildScopeString(
  preset: ScopePreset = 'standard',
  extra: string[] = [],
): string {
  const unique = Array.from(new Set([...SCOPE_PRESETS[preset], ...extra]))
  return unique.join(' ')
}

// ── URL / session helpers ──────────────────────────────────────────────────────

/**
 * Returns the base origin of this app.
 * NEXT_PUBLIC_APP_URL is always set in .env / .env.local and is the source
 * of truth. Falls back to window.location.origin for environments without it.
 */
export function getAppOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ||
    (typeof window !== 'undefined' ? window.location.origin : '')
  )
}

/**
 * The full OAuth redirect URI — must be registered in Lark Developer Console.
 * Examples:
 *   local:      http://localhost:3001/lark/oauth/callback
 *   production: https://cms.toolswave.net/lark/oauth/callback
 */
export function getLarkRedirectUri(): string {
  return `${getAppOrigin()}${CALLBACK_PATH}`
}

/**
 * Build the Lark OAuth authorization URL.
 *
 * Uses encodeURIComponent (not URLSearchParams) to percent-encode parameters
 * so `+` is always encoded as `%2B`, never as a literal `+` that could be
 * misinterpreted on either side.
 *
 * Also generates a random `state` nonce for CSRF protection and stores it in
 * localStorage so the callback page can verify it.
 *
 * @param appId   Lark app_id from Developer Console
 * @param preset  Scope preset to request (default: 'standard')
 * @param extra   Additional scopes beyond the preset
 *
 * Authorization URL format (authen/v1/authorize supports `scope`):
 *   https://open.larksuite.com/open-apis/authen/v1/authorize
 *     ?app_id={app_id}
 *     &redirect_uri={encoded_redirect_uri}
 *     &scope={space-separated scopes}
 *     &state={nonce}
 */
export function buildLarkOAuthUrl(
  appId: string,
  preset: ScopePreset = 'standard',
  extra: string[] = [],
): string {
  const state       = crypto.randomUUID()
  const redirectUri = getLarkRedirectUri()
  const scope       = buildScopeString(preset, extra)

  localStorage.setItem(STATE_KEY, state)

  const qs = [
    `app_id=${encodeURIComponent(appId)}`,
    `redirect_uri=${encodeURIComponent(redirectUri)}`,
    `scope=${encodeURIComponent(scope)}`,
    `state=${encodeURIComponent(state)}`,
  ].join('&')

  return `https://open.larksuite.com/open-apis/authen/v1/authorize?${qs}`
}

/**
 * Validate the `state` returned by Lark in the callback (CSRF check).
 * Always clears the stored state after checking — one-time use.
 *
 * @param returnedState  The `state` value parsed from the callback URL
 *                       (must be parsed with getRawParam, not URLSearchParams)
 */
export function validateOAuthState(returnedState: string | null): boolean {
  const stored = localStorage.getItem(STATE_KEY)
  localStorage.removeItem(STATE_KEY) // always clear — even on mismatch
  if (!stored || !returnedState) return false
  return stored === returnedState
}

/**
 * Check whether the stored Lark user token is still valid (not expired).
 * Returns false if the token is missing or within 60 seconds of expiry.
 */
export function isLarkTokenValid(): boolean {
  const token     = localStorage.getItem('lark_user_token')
  const expiresAt = localStorage.getItem('lark_token_expires_at')
  if (!token) return false
  if (!expiresAt) return true // no expiry stored → assume valid
  return Date.now() < Number(expiresAt) - 60_000 // 60-second safety buffer
}

/**
 * Clear all Lark OAuth session data from localStorage.
 */
export function clearLarkSession(): void {
  localStorage.removeItem('lark_user_token')
  localStorage.removeItem('lark_user_name')
  localStorage.removeItem('lark_user_avatar')
  localStorage.removeItem('lark_token_expires_at')
  localStorage.removeItem(STATE_KEY)
}
