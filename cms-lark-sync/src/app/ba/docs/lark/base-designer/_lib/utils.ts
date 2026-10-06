// ── Mermaid / UTF-8 utilities ──────────────────────────────────────────────

/** ASCII-safe identifier for Mermaid node IDs */
export function toMermaidId(name: string): string {
  return (
    name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/gi, 'd')
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .replace(/^(\d)/, '_$1') || '_'
  )
}

export function generateMermaid(schema: { tableId: string; name: string; fields: any[] }[]): string {
  const tableIdToName = Object.fromEntries(schema.map(t => [t.tableId, t.name]))
  const lines = ['classDiagram']
  for (const table of schema) {
    const id = toMermaidId(table.name)
    lines.push(`  class ${id}["${table.name}"] {`)
    for (const f of table.fields) {
      const fType = f.typeName ?? `type${f.type}`
      const primary = f.isPrimary ? ' <<PK>>' : ''
      lines.push(`    +${fType} ${f.name}${primary}`)
      if (f.options?.length) {
        lines.push(`    %% ${f.options.slice(0, 5).join(' | ')}${f.options.length > 5 ? ' …' : ''}`)
      }
    }
    lines.push('  }')
  }
  for (const table of schema) {
    const srcId = toMermaidId(table.name)
    for (const f of table.fields) {
      if (f.linkTableId && tableIdToName[f.linkTableId]) {
        const dstId = toMermaidId(tableIdToName[f.linkTableId])
        lines.push(`  ${srcId} --> ${dstId} : ${f.name}`)
      }
    }
  }
  return lines.join('\n')
}

/** UTF-8 safe base64 */
export function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str)
  let binary = ''
  bytes.forEach(b => { binary += String.fromCharCode(b) })
  return btoa(binary)
}

// ── Token / cost estimation ────────────────────────────────────────────────

export const PROVIDER_PRICING: Record<string, { input: number; output: number }> = {
  anthropic: { input: 3.0,  output: 15.0  },
  openai:    { input: 2.5,  output: 10.0  },
  google:    { input: 0.30, output: 2.50  },
  gemini:    { input: 1.25, output: 5.0   },
  groq:      { input: 0.59, output: 0.79  },
  mistral:   { input: 2.0,  output: 6.0   },
  nvidia:    { input: 0,    output: 0     },  // free tier
  ollama:    { input: 0,    output: 0     },  // self-hosted
}

export function countTokens(text: string): number {
  const viChars = (text.match(/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]/g) || []).length
  const ratio = text.length > 0 && viChars / text.length > 0.05 ? 2.2 : 3.8
  return Math.ceil(text.length / ratio)
}

// ── Safe stream reader ─────────────────────────────────────────────────────

/**
 * Read a streaming response body to completion, correctly handling UTF-8
 * multi-byte sequences that may be split across HTTP chunks.
 *
 * Uses a single persistent TextDecoder with { stream: true } so partial
 * multi-byte sequences are buffered between chunks, and calls the final
 * decoder.decode() flush to emit any held-back bytes.
 *
 * @param body  ReadableStream<Uint8Array> from fetch response
 * @param onChunk  optional callback called with each decoded chunk string
 * @returns full decoded string
 */
export async function readUtf8Stream(
  body: ReadableStream<Uint8Array>,
  onChunk?: (chunk: string, accumulated: string) => void,
): Promise<string> {
  const reader  = body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: false })
  const parts: string[] = []
  let accumulated = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = decoder.decode(value, { stream: true })
      parts.push(chunk)
      accumulated += chunk
      onChunk?.(chunk, accumulated)
    }
  } finally {
    reader.releaseLock()
  }
  // Final flush: emit any bytes held back waiting for multi-byte completion
  const flush = decoder.decode()
  if (flush) { parts.push(flush); accumulated += flush }
  return accumulated
}

// ── AI JSON repair utilities ───────────────────────────────────────────────

export const STREAM_ERROR_SENTINEL = '\x00ERR:'

export function closeUnclosed(text: string): string {
  const stack: string[] = []
  let inStr = false, esc = false
  for (const c of text) {
    if (esc)             { esc = false; continue }
    if (c === '\\' && inStr) { esc = true; continue }
    if (c === '"')       { inStr = !inStr; continue }
    if (inStr)           continue
    if (c === '{')       stack.push('}')
    else if (c === '[')  stack.push(']')
    else if (c === '}' || c === ']') { if (stack.length) stack.pop() }
  }
  if (!stack.length) return text
  let result = text.trimEnd().replace(/,\s*$/, '')
  if (inStr) result += '"'
  return result + stack.reverse().join('')
}

export function findClose(text: string, start: number): number {
  let depth = 0, inS = false, es = false
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (es)            { es = false; continue }
    if (c === '\\' && inS) { es = true; continue }
    if (c === '"')     { inS = !inS; continue }
    if (inS)           continue
    if (c === '{' || c === '[') depth++
    if (c === '}' || c === ']') { depth--; if (depth === 0) return i }
  }
  return -1
}

function extractValidFields(fieldsText: string): any[] {
  const fields: any[] = []
  let i = 0
  while (i < fieldsText.length) {
    const start = fieldsText.indexOf('{', i)
    if (start === -1) break
    const end = findClose(fieldsText, start)
    const slice = end === -1 ? closeUnclosed(fieldsText.slice(start)) : fieldsText.slice(start, end + 1)
    try {
      const f = JSON.parse(slice)
      if (f?.name && typeof f?.type === 'number') fields.push(f)
    } catch { /* skip */ }
    i = end === -1 ? fieldsText.length : end + 1
  }
  return fields
}

function extractValidTables(tablesText: string): any[] {
  const tables: any[] = []
  let i = 0
  while (i < tablesText.length) {
    const start = tablesText.indexOf('{', i)
    if (start === -1) break
    const end = findClose(tablesText, start)
    const slice = end === -1 ? closeUnclosed(tablesText.slice(start)) : tablesText.slice(start, end + 1)
    let pushed = false
    try {
      const t = JSON.parse(slice)
      if (t?.name && Array.isArray(t?.fields)) {
        t.fields = (t.fields as any[]).filter(f => f?.name && typeof f?.type === 'number')
        if (t.fields.length) { tables.push(t); pushed = true }
      }
    } catch { /* fall through */ }
    if (!pushed) {
      const tableName = slice.match(/"name"\s*:\s*"([^"]{1,60})"/)?.[1]
      if (tableName) {
        const fieldsIdx = slice.search(/"fields"\s*:\s*\[/)
        if (fieldsIdx !== -1) {
          const bracketPos = slice.indexOf('[', fieldsIdx) + 1
          const fields = extractValidFields(slice.slice(bracketPos))
          if (fields.length) tables.push({ name: tableName, fields })
        }
      }
    }
    i = end === -1 ? tablesText.length : end + 1
  }
  return tables
}

export function parseAISchema(raw: string): any | null {
  const strip = (s: string) => s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
  const tryParse = (s: string) => { try { return JSON.parse(s) } catch { return null } }
  let r = tryParse(raw);                   if (r) return r
  const stripped = strip(raw)
  r = tryParse(stripped);                  if (r) return r
  const firstBrace = stripped.indexOf('{')
  const lastClose  = firstBrace >= 0 ? findClose(stripped, firstBrace) : -1
  const block = firstBrace >= 0 && lastClose > firstBrace
    ? stripped.slice(firstBrace, lastClose + 1)
    : stripped.match(/\{[\s\S]*\}/)?.[0]
  if (block) { r = tryParse(block); if (r) return r }
  const closed = closeUnclosed(block ?? stripped)
  r = tryParse(closed);                    if (r) return r
  const baseName  = stripped.match(/"baseName"\s*:\s*"([^"]{1,100})"/)?.[1]
  const summary   = stripped.match(/"summary"\s*:\s*"([^"]{1,300})"/)?.[1]
  const tablesIdx = stripped.search(/"tables"\s*:\s*\[/)
  if (tablesIdx !== -1) {
    const afterBracket = stripped.slice(stripped.indexOf('[', tablesIdx) + 1)
    const tables = extractValidTables(afterBracket)
    if (tables.length > 0) return { baseName: baseName ?? 'New Base', summary: summary ?? '', tables }
  }
  return null
}

// ── Unicode / text helpers ─────────────────────────────────────────────────

/**
 * Decode raw \uXXXX escape sequences in a string.
 * Needed when AI returns JSON-encoded unicode that bypasses JSON.parse
 * (e.g. text content shown directly from stream before parsing).
 */
export function decodeUnicodeEscapes(str: string): string {
  return str.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16)),
  )
}

/**
 * Render a simple markdown string to an array of React-renderable segments.
 * Handles **bold**, *italic*, `code`, and line breaks.
 * Returns an array of { text, bold, italic, code, br } tokens.
 */
export type MarkdownToken =
  | { type: 'text'; value: string }
  | { type: 'bold'; value: string }
  | { type: 'italic'; value: string }
  | { type: 'code'; value: string }
  | { type: 'br' }

export function parseSimpleMarkdown(input: string): MarkdownToken[] {
  const tokens: MarkdownToken[] = []
  const lines = input.split('\n')
  lines.forEach((line, li) => {
    // Simple inline pass: **bold**, *italic*, `code`
    const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g
    let last = 0, m: RegExpExecArray | null
    while ((m = regex.exec(line)) !== null) {
      if (m.index > last) tokens.push({ type: 'text', value: line.slice(last, m.index) })
      if (m[0].startsWith('**'))  tokens.push({ type: 'bold',   value: m[2] })
      else if (m[0].startsWith('`')) tokens.push({ type: 'code', value: m[4] })
      else                        tokens.push({ type: 'italic', value: m[3] })
      last = m.index + m[0].length
    }
    if (last < line.length) tokens.push({ type: 'text', value: line.slice(last) })
    if (li < lines.length - 1) tokens.push({ type: 'br' })
  })
  return tokens
}

// ── AI log persistence ─────────────────────────────────────────────────────

export const AI_LOG_STORAGE_KEY = 'ai_debug_log'
export const AI_LOG_MAX_ENTRIES = 200

export function persistAILog(entries: any[]) {
  try {
    localStorage.setItem(AI_LOG_STORAGE_KEY, JSON.stringify(entries.slice(-AI_LOG_MAX_ENTRIES)))
  } catch { /* storage quota */ }
}
