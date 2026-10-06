/**
 * Lark Sync Helper — Content Script (MAIN world)
 *
 * Intercepts ALL /space/api/ requests on Lark pages.
 * Captures full URL, headers, cookies, body.
 * Communicates with extension via window.postMessage → bridge.js.
 */

;(function () {
  'use strict'

  const MSG_PREFIX = '__LARK_SYNC_HELPER__'
  const CAPTURE_PATTERN = '/space/api/'

  function post(type, data) {
    window.postMessage({ source: MSG_PREFIX, type, data }, '*')
  }

  // ─── Classify request type from URL ─────────────────────────────────

  // Match EXACTLY /bitable/connector/sync (no trailing path)
  const CONNECTOR_SYNC_RE = /\/bitable\/connector\/sync(?:\?.*)?$/

  function isConnectorSync(url) {
    // Strip query string for path check
    const path = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0]
    return path.endsWith('/bitable/connector/sync')
  }

  function classifyUrl(url) {
    if (isConnectorSync(url)) return 'connector'
    if (url.includes('/connector/')) return 'other'
    if (url.includes('/record/')) return 'other'
    if (url.includes('/field/')) return 'other'
    if (url.includes('/view/')) return 'other'
    if (url.includes('/table/')) return 'other'
    return 'other'
  }

  // ─── Extract useful info from body ──────────────────────────────────

  function parseBody(bodyText) {
    if (!bodyText) return {}
    try {
      const obj = JSON.parse(bodyText)
      return {
        docToken: obj.token || '',
        tableIds: obj.tableID ? [obj.tableID] : (obj.table_id ? [obj.table_id] : []),
        bodyJson: obj,
      }
    } catch {
      return { bodyRaw: bodyText }
    }
  }

  // ─── Extract headers from init ──────────────────────────────────────

  function extractHeaders(initHeaders) {
    const headers = {}
    if (!initHeaders) return headers
    try {
      const h = initHeaders instanceof Headers ? initHeaders : new Headers(initHeaders)
      h.forEach((v, k) => { headers[k] = v })
    } catch {
      if (typeof initHeaders === 'object') {
        for (const [k, v] of Object.entries(initHeaders)) {
          headers[k] = v
        }
      }
    }
    return headers
  }

  // ─── Build capture object ───────────────────────────────────────────

  function buildCapture(url, method, headers, bodyText) {
    const type = classifyUrl(url)
    const bodyInfo = parseBody(bodyText)

    return {
      type,
      url,
      method: method || 'GET',
      domain: location.hostname,
      path: url.replace(/^https?:\/\/[^/]+/, ''),  // full path
      cookies: document.cookie || '',
      csrfToken: headers['x-csrftoken'] || headers['X-Csrftoken'] || '',
      hostId: headers['docs-host-id'] || headers['Docs-Host-Id'] || '',
      hostType: headers['docs-host-type'] || headers['Docs-Host-Type'] || 'Wiki',
      headers,
      body: bodyText || '',
      docToken: bodyInfo.docToken || '',
      tableIds: bodyInfo.tableIds || [],
      timestamp: Date.now(),
    }
  }

  // ─── Send page info ─────────────────────────────────────────────────

  function sendPageInfo() {
    const url = location.href
    const info = { url }

    const baseMatch = url.match(/\/base\/([A-Za-z0-9]+)/)
    if (baseMatch) { info.appToken = baseMatch[1]; info.type = 'base' }

    const wikiMatch = url.match(/\/wiki\/([A-Za-z0-9]+)/)
    if (wikiMatch) { info.wikiToken = wikiMatch[1]; info.type = 'wiki' }

    const params = new URLSearchParams(location.search)
    info.tableId = params.get('table') || ''
    info.viewId = params.get('view') || ''

    if (info.appToken || info.wikiToken) {
      post('pageInfo', info)
    }
  }

  sendPageInfo()

  let lastUrl = location.href
  const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href
      sendPageInfo()
    }
  })
  observer.observe(document.documentElement, { childList: true, subtree: true })

  // ─── Intercept fetch ────────────────────────────────────────────────

  const _origFetch = window.fetch
  window.fetch = async function (...args) {
    const [input, init] = args
    const url = typeof input === 'string' ? input : (input?.url || '')
    const method = (init?.method || 'GET').toUpperCase()

    // Capture ALL /space/api/ requests
    if (url.includes(CAPTURE_PATTERN)) {
      try {
        let bodyText = ''
        if (init?.body) {
          if (typeof init.body === 'string') bodyText = init.body
          else if (init.body instanceof ArrayBuffer) bodyText = new TextDecoder().decode(init.body)
          else if (init.body instanceof Uint8Array) bodyText = new TextDecoder().decode(init.body)
        }

        const headers = extractHeaders(init?.headers)
        const capture = buildCapture(url, method, headers, bodyText)
        post('fetchCapture', capture)
      } catch { /* ignore */ }
    }

    return _origFetch.apply(this, args)
  }

  // ─── Intercept XMLHttpRequest ───────────────────────────────────────

  const _origOpen = XMLHttpRequest.prototype.open
  const _origSend = XMLHttpRequest.prototype.send
  const _origSetHeader = XMLHttpRequest.prototype.setRequestHeader

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._lsUrl = url
    this._lsMethod = method
    this._lsHeaders = {}
    return _origOpen.call(this, method, url, ...rest)
  }

  XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
    if (this._lsHeaders) this._lsHeaders[name] = value
    return _origSetHeader.call(this, name, value)
  }

  XMLHttpRequest.prototype.send = function (body) {
    // Capture ALL /space/api/ requests
    if (this._lsUrl?.includes(CAPTURE_PATTERN)) {
      try {
        const bodyText = typeof body === 'string' ? body : ''
        const capture = buildCapture(
          this._lsUrl,
          this._lsMethod || 'GET',
          this._lsHeaders || {},
          bodyText,
        )
        post('fetchCapture', capture)
      } catch { /* ignore */ }
    }

    return _origSend.call(this, body)
  }
})()
