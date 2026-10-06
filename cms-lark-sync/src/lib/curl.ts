export type HeaderKV = { key: string; value: string }

export type CurlBuildInput = {
  method: string
  url: string
  headers: HeaderKV[]
  body?: string
  multiline?: boolean // default true — produces human-readable output
}

/**
 * Escape a string for POSIX single-quoted shell argument.
 * Works in bash, zsh, macOS Terminal, and Git Bash on Windows.
 * Strategy: end the single-quote, add escaped single-quote, restart single-quote.
 *   cat 'it'\''s'   →   it's
 */
function shellEscape(s: string): string {
  return `'${String(s).replace(/'/g, `'\\''`)}'`
}

/**
 * Build a portable, cross-platform curl command string.
 *
 * By default produces multiline output with backslash continuation for readability.
 * Set multiline=false to get a single-line command (for storage / programmatic use).
 *
 * Examples:
 *   curl 'https://api.example.com/resource' \
 *     -X POST \
 *     -H 'Content-Type: application/json' \
 *     -H 'Authorization: Bearer TOKEN' \
 *     --data-raw '{"field":"value"}'
 */
export function buildCurl(input: CurlBuildInput): string {
  const method = (input.method || 'GET').toUpperCase()
  const sep = input.multiline === false ? ' ' : ' \\\n  '

  const parts: string[] = [`curl ${shellEscape(input.url || '')}`]

  if (method !== 'GET') {
    parts.push(`-X ${method}`)
  }

  for (const h of input.headers || []) {
    if (!h.key?.trim()) continue
    parts.push(`-H ${shellEscape(`${h.key.trim()}: ${h.value ?? ''}`)}`)
  }

  const body = (input.body ?? '').trim()
  if (body) {
    // Ensure method is set to POST when body is present but no method was given
    if (method === 'GET') parts.splice(1, 0, '-X POST')
    parts.push(`--data-raw ${shellEscape(body)}`)
  }

  return parts.join(sep)
}

/**
 * Build a single-line curl suitable for storage in MongoDB (no backslash newlines).
 */
export function buildCurlOneLine(input: Omit<CurlBuildInput, 'multiline'>): string {
  return buildCurl({ ...input, multiline: false })
}

/**
 * Parse a curl command string back into its components.
 * Handles:
 *  - single-quoted and double-quoted URL/headers/body
 *  - backslash line continuations
 *  - -d / --data / --data-raw / --data-binary
 *  - --json flag (curl 7.82+)
 */
export function parseCurl(curlCommand: string): {
  method: string
  url: string
  headers: HeaderKV[]
  body: string
} {
  // Normalise: remove backslash-newlines and collapse whitespace
  const clean = curlCommand
    .replace(/\\\n/g, ' ')
    .replace(/\r/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  // ── URL ──────────────────────────────────────────────────────────────────
  let url = ''
  const urlMatch =
    clean.match(/curl\s+['"]([^'"]+)['"]/) ||
    clean.match(/curl\s+(https?:\/\/\S+)/) ||
    clean.match(/curl\s+(\S+)/)
  if (urlMatch) url = (urlMatch[1] || '').replace(/^['"]|['"]$/g, '')

  // ── METHOD ───────────────────────────────────────────────────────────────
  let method = 'GET'
  const methodMatch = clean.match(/-X\s+([A-Za-z]+)/i)
  if (methodMatch) method = methodMatch[1].toUpperCase()

  // ── HEADERS ──────────────────────────────────────────────────────────────
  const headers: HeaderKV[] = []
  const headerRegex = /-H\s+(?:'([^']+(?:'\\''[^']*)*)'|"([^"]+)")/g
  let hm: RegExpExecArray | null
  while ((hm = headerRegex.exec(clean)) !== null) {
    const raw = (hm[1] || hm[2] || '').replace(/'\\''/, "'") // unescape POSIX
    const idx = raw.indexOf(':')
    if (idx > -1) {
      headers.push({
        key: raw.slice(0, idx).trim(),
        value: raw.slice(idx + 1).trim(),
      })
    }
  }

  // ── BODY ─────────────────────────────────────────────────────────────────
  let body = ''
  const dataRegex =
    /(?:--data-raw|--data-binary|--data|--json|-d)\s+(?:'((?:[^'\\]|\\.)*)' |'([^']+)'|"([^"]+)"|(\S+))/
  const dataMatch = clean.match(dataRegex)
  if (dataMatch) {
    body = (dataMatch[1] ?? dataMatch[2] ?? dataMatch[3] ?? dataMatch[4] ?? '')
      .replace(/\\"/g, '"')
      .replace(/'\\''/, "'")
  }

  // If body is present and no method flag found, assume POST
  if (body.trim() && method === 'GET') method = 'POST'

  return { method, url, headers, body }
}

/**
 * Format a raw JSON string for display (pretty-print if valid JSON).
 */
export function prettyBody(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

/**
 * Copy text to clipboard (browser only, graceful no-op on failure).
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Fallback for older browsers
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      return true
    } catch {
      return false
    }
  }
}
