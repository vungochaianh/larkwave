/**
 * fieldNormalizer.ts — mirror of api-lark-all/services/fieldNormalizer.js
 *
 * Converts every Lark Base field type into a normalised shape:
 *   { display: string, mediaItems: MediaItem[] }
 */

export type MediaItem = { key: string; url: string; type: 'image' | 'video' | 'file' }
export type NormalizedField = { label: string; value: string; fullValue?: string; hasMedia: boolean }
export type ClassifiedBody  = { textFields: NormalizedField[]; mediaItems: MediaItem[] }

// ── Helpers ────────────────────────────────────────────────────────────────────

const IMAGE_EXT = new Set(['jpg','jpeg','png','gif','webp','bmp','svg','heic','heif','avif'])
const VIDEO_EXT = new Set(['mp4','mov','avi','mkv','webm','m4v','flv','wmv','3gp'])
const DOC_EXT   = new Set(['pdf','doc','docx','xls','xlsx','ppt','pptx','txt','csv','zip','rar','7z'])

function mediaTypeByUrl(url: string): MediaItem['type'] | null {
  if (!/^https?:\/\//i.test(url)) return null
  const ext = url.split('?')[0].split('#')[0].toLowerCase().split('.').pop() ?? ''
  if (IMAGE_EXT.has(ext)) return 'image'
  if (VIDEO_EXT.has(ext)) return 'video'
  if (DOC_EXT.has(ext))   return 'file'
  return null
}

function mediaTypeByName(name?: string, mimeType?: string): MediaItem['type'] {
  const mime = String(mimeType ?? '').toLowerCase()
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('application/') || mime.startsWith('text/')) return 'file'
  const ext = String(name ?? '').split('.').pop()?.toLowerCase() ?? ''
  if (IMAGE_EXT.has(ext)) return 'image'
  if (VIDEO_EXT.has(ext)) return 'video'
  if (DOC_EXT.has(ext))   return 'file'
  return 'file'
}

export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function formatTimestamp(val: number): string {
  try { return new Date(val).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) }
  catch { return String(val) }
}

type NV = { display: string; mediaItems: MediaItem[] }

// ── Per-type normalisers ──────────────────────────────────────────────────────

function normalizeString(key: string, str: string): NV {
  // JSON array or object string → parse and re-normalise
  const trimmed = str.trim()
  if ((trimmed.startsWith('[') && trimmed.endsWith(']')) ||
      (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
    try { return normalizeValue(key, JSON.parse(trimmed)) } catch { /* not JSON */ }
  }
  if (/<[a-z][\s\S]*?>/i.test(str))
    return { display: stripHtml(str), mediaItems: [] }
  if (/^https?:\/\//i.test(str)) {
    const mt = mediaTypeByUrl(str)
    if (mt) return { display: str, mediaItems: [{ key, url: str, type: mt }] }
    return { display: str, mediaItems: [] }
  }
  if (/^\d{13}$/.test(str.trim()))
    return { display: formatTimestamp(Number(str)), mediaItems: [] }
  return { display: str, mediaItems: [] }
}

function normalizeNumber(key: string, num: number): NV {
  if (num > 1_000_000_000_000)
    return { display: formatTimestamp(num), mediaItems: [] }
  return { display: num.toLocaleString('vi-VN'), mediaItems: [] }
}

function normalizeBoolean(_key: string, bool: boolean): NV {
  return { display: bool ? '✅ Có' : '❌ Không', mediaItems: [] }
}

function normalizeRichTextArray(arr: any[]): string {
  return arr.map(item => {
    if (typeof item === 'string') return item
    if (typeof item?.text === 'string') return item.text
    return ''
  }).filter(Boolean).join('')
}

function normalizeAttachment(key: string, att: any): NV {
  const name = att.name ?? key
  const url  = att.url ?? att.tmp_url ?? att.download_url ?? null
  const mt   = url ? (mediaTypeByUrl(url) ?? mediaTypeByName(name, att.type))
                   : mediaTypeByName(name, att.type)
  if (url) return { display: name, mediaItems: [{ key: name, url, type: mt }] }
  return { display: `📎 ${name} [token: ${att.file_token ?? '?'}]`, mediaItems: [] }
}

function normalizePerson(obj: any): NV {
  const name = obj.name ?? obj.en_name ?? obj.email ?? obj.id ?? '?'
  return { display: name, mediaItems: [] }
}

function normalizeUrlObject(key: string, obj: any): NV {
  const url  = obj.link ?? obj.url ?? ''
  const text = obj.text ?? obj.title ?? url
  if (!url) return { display: text || JSON.stringify(obj), mediaItems: [] }
  const mt = mediaTypeByUrl(url)
  if (mt) return { display: text || url, mediaItems: [{ key, url, type: mt }] }
  return { display: text ? `${text} (${url})` : url, mediaItems: [] }
}

function normalizeLocation(obj: any): NV {
  const parts = [obj.full_address ?? obj.address, obj.name, obj.cityname, obj.pname].filter(Boolean)
  return { display: parts.join(', ') || JSON.stringify(obj), mediaItems: [] }
}

function normalizeGroupChat(obj: any): NV {
  return { display: obj.name ?? obj.chat_id ?? JSON.stringify(obj), mediaItems: [] }
}

// ── Main dispatcher ───────────────────────────────────────────────────────────

export function normalizeValue(key: string, value: unknown): NV {
  if (value == null)              return { display: '', mediaItems: [] }
  if (typeof value === 'boolean') return normalizeBoolean(key, value)
  if (typeof value === 'number')  return normalizeNumber(key, value)
  if (typeof value === 'string')  return normalizeString(key, value.trim())

  if (Array.isArray(value)) {
    if (value.length === 0) return { display: '', mediaItems: [] }
    const first = value[0]
    if (first != null && typeof first === 'object') {
      if ('text' in first)
        return normalizeString(key, normalizeRichTextArray(value))
      if ('file_token' in first || ('name' in first && ('size' in first || 'type' in first))) {
        const displayParts: string[] = [], media: MediaItem[] = []
        for (const att of value) {
          const n = normalizeAttachment(key, att)
          if (n.display) displayParts.push(n.display)
          media.push(...n.mediaItems)
        }
        return { display: displayParts.join('\n'), mediaItems: media }
      }
      if ('name' in first || 'id' in first) {
        const names = value.map(u => normalizePerson(u).display).filter(Boolean)
        return { display: names.join(', '), mediaItems: [] }
      }
    }
    // Generic array
    const parts: string[] = [], media: MediaItem[] = []
    for (const item of value) {
      const n = normalizeValue(key, item)
      if (n.display) parts.push(n.display)
      media.push(...n.mediaItems)
    }
    return { display: parts.join(', '), mediaItems: media }
  }

  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, any>
    if ('link' in obj || ('url' in obj && !('file_token' in obj)))
      return normalizeUrlObject(key, obj)
    if ('file_token' in obj || ('name' in obj && 'size' in obj))
      return normalizeAttachment(key, obj)
    if ('id' in obj && ('name' in obj || 'email' in obj))
      return normalizePerson(obj)
    if ('full_address' in obj || 'cityname' in obj || 'pname' in obj)
      return normalizeLocation(obj)
    if ('chat_id' in obj)
      return normalizeGroupChat(obj)
    if ('users' in obj && Array.isArray(obj.users))
      return normalizeValue(key, obj.users)
    const json = JSON.stringify(obj, null, 2)
    return { display: json.length > 500 ? json.slice(0, 497) + '...' : json, mediaItems: [] }
  }

  return { display: String(value), mediaItems: [] }
}

// ── Body classifier ───────────────────────────────────────────────────────────

const META_FIELDS = new Set(['table', 'tableName', 'event', 'timestamp', 'record_id'])
const MAX_FIELD_LEN = 800

export function classifyBody(body: Record<string, any>): ClassifiedBody {
  const textFields: NormalizedField[] = []
  const mediaItems: MediaItem[]       = []

  for (const [k, v] of Object.entries(body)) {
    if (META_FIELDS.has(k)) continue
    if (v == null || v === '' || (Array.isArray(v) && v.length === 0)) continue

    const { display, mediaItems: fieldMedia } = normalizeValue(k, v)
    mediaItems.push(...fieldMedia)

    if (!display && fieldMedia.length === 0) continue

    const truncated = display.length > MAX_FIELD_LEN
    textFields.push({
      label:     k,
      value:     truncated ? display.slice(0, MAX_FIELD_LEN - 3) + '...' : display,
      fullValue: truncated ? display : undefined,
      hasMedia:  fieldMedia.length > 0,
    })
  }

  return { textFields, mediaItems }
}
