/**
 * Lark Sync Helper — Background Service Worker (MV3)
 *
 * Receives captured data from content script (fetch/XHR interception).
 * Enriches with FULL cookies via chrome.cookies API (includes httpOnly + parent domain).
 * Extracts CSRF token from cookies if not found in headers.
 */

const LARK_DOMAINS = ['larksuite.com', 'feishu.cn']
const MAX_CAPTURES = 50

// ─── Tab URL tracking ─────────────────────────────────────────────────

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!changeInfo.url) return
  const url = changeInfo.url
  if (!LARK_DOMAINS.some(d => url.includes(d))) return

  const parsed = _parseLarkUrl(url)
  if (parsed.appToken) {
    chrome.storage.local.set({
      currentPage: {
        ...parsed,
        url,
        tabId,
        timestamp: Date.now(),
      }
    })
  }
})

// ─── Messages from popup / content scripts ────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'getCaptures') {
    chrome.storage.local.get(['captures', 'currentPage'], (result) => {
      sendResponse({
        captures: result.captures || [],
        currentPage: result.currentPage || null,
      })
    })
    return true
  }

  if (msg.action === 'clearCaptures') {
    chrome.storage.local.set({ captures: [] }, () => {
      chrome.action.setBadgeText({ text: '' })
      sendResponse({ ok: true })
    })
    return true
  }

  if (msg.action === 'deleteCapture') {
    chrome.storage.local.get(['captures'], (result) => {
      const captures = (result.captures || []).filter((_, i) => i !== msg.index)
      chrome.storage.local.set({ captures }, () => {
        chrome.action.setBadgeText({ text: captures.length ? String(captures.length) : '' })
        sendResponse({ ok: true })
      })
    })
    return true
  }

  if (msg.action === 'pageInfo') {
    chrome.storage.local.set({
      currentPage: { ...msg.data, timestamp: Date.now() }
    })
  }

  if (msg.action === 'fetchCapture') {
    _enrichAndSave(msg.data)
  }
})

// ─── Enrich capture with full cookies + CSRF ──────────────────────────

async function _enrichAndSave(capture) {
  const domain = capture.domain
  if (!domain) {
    _saveCapture(capture)
    return
  }

  try {
    // Use URL parameter (not domain) to get ALL cookies that would be sent
    // to this URL — includes parent domain cookies like .larksuite.com
    const fullUrl = `https://${domain}/`
    const cookies = await chrome.cookies.getAll({ url: fullUrl })

    if (cookies && cookies.length > 0) {
      // Build cookie string: "name=value; name2=value2"
      capture.cookies = cookies.map(c => `${c.name}=${c.value}`).join('; ')
      capture.cookieCount = cookies.length

      // Extract CSRF token from cookies if not found in headers
      if (!capture.csrfToken) {
        for (const c of cookies) {
          const name = c.name.toLowerCase()
          if (name.includes('csrf') || name.includes('xsrf')) {
            capture.csrfToken = c.value
            capture.csrfSource = `cookie:${c.name}`
            break
          }
        }
      }

      // Also look for session-related cookies to verify we got them
      const sessionCookies = cookies.filter(c =>
        c.name.toLowerCase().includes('session') ||
        c.name.toLowerCase().includes('passport') ||
        c.name.toLowerCase().includes('token') ||
        c.httpOnly
      )
      capture.hasSessionCookies = sessionCookies.length > 0
      capture.httpOnlyCount = cookies.filter(c => c.httpOnly).length
    }
  } catch (e) {
    console.warn('Failed to get cookies via API:', e)
  }

  _saveCapture(capture)
}

// ─── Helpers ──────────────────────────────────────────────────────────

async function _saveCapture(capture) {
  const result = await chrome.storage.local.get(['captures'])
  const captures = result.captures || []

  // Dedup: skip if identical URL + docToken within 2 seconds
  const recent = captures[0]
  if (recent &&
      recent.url === capture.url &&
      recent.docToken === capture.docToken &&
      (capture.timestamp - recent.timestamp) < 2000) {
    return
  }

  captures.unshift(capture)
  if (captures.length > MAX_CAPTURES) captures.length = MAX_CAPTURES

  await chrome.storage.local.set({ captures })

  chrome.action.setBadgeText({ text: String(captures.length) })
  chrome.action.setBadgeBackgroundColor({ color: '#6366f1' })

  if (capture.type === 'connector') {
    const detail = capture.cookieCount
      ? `${capture.cookieCount} cookies (${capture.httpOnlyCount || 0} httpOnly)`
      : 'no cookies'
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'Lark Sync Helper',
      message: `Captured connector/sync — ${detail}`,
    })
  }
}

function _parseLarkUrl(url) {
  const out = { appToken: '', tableId: '', viewId: '', type: '' }

  const baseMatch = url.match(/\/base\/([A-Za-z0-9]+)/)
  if (baseMatch) { out.appToken = baseMatch[1]; out.type = 'base' }

  const wikiMatch = url.match(/\/wiki\/([A-Za-z0-9]+)/)
  if (wikiMatch) { out.appToken = wikiMatch[1]; out.type = 'wiki' }

  try {
    const u = new URL(url)
    out.tableId = u.searchParams.get('table') || ''
    out.viewId = u.searchParams.get('view') || ''
  } catch { /* ignore */ }

  return out
}
