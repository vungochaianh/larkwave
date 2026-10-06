/**
 * Lark Sync Helper — Popup Script
 *
 * Priority: /bitable/connector/sync shown first.
 * Other /space/api/ requests hidden behind "Show more".
 *
 * Quick Setup calls POST /bitable-sync/parse-curl first (like CMS does),
 * then creates the job with the exact same payload shape as the CMS form.
 */

const DEFAULT_API = 'https://apihoanam.toolswave.net/api'
let apiBase = DEFAULT_API
let showOthers = false

// ─── Init ─────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  const stored = await chrome.storage.local.get(['apiBase'])
  apiBase = stored.apiBase || DEFAULT_API
  document.getElementById('apiBase').value = apiBase

  document.getElementById('btnSaveApi').addEventListener('click', () => {
    apiBase = document.getElementById('apiBase').value.trim() || DEFAULT_API
    chrome.storage.local.set({ apiBase })
    showToast('API saved')
  })

  document.getElementById('btnClear').addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'clearCaptures' }, () => {
      loadCaptures()
      showToast('Cleared')
    })
  })

  document.getElementById('btnOpenCms').addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://cmshoanam.toolswave.net/sync/bitable' })
  })

  loadCaptures()
})

// ─── Load & Render ────────────────────────────────────────────────────

async function loadCaptures() {
  const resp = await new Promise(resolve =>
    chrome.runtime.sendMessage({ action: 'getCaptures' }, resolve)
  )

  const allCaptures = resp?.captures || []
  const currentPage = resp?.currentPage || null

  const connectors = []
  const others = []
  allCaptures.forEach((c, i) => {
    const item = { ...c, _origIdx: i }
    if (c.type === 'connector') connectors.push(item)
    else others.push(item)
  })

  // Current page
  const cpSection = document.getElementById('currentPageSection')
  const cpInfo = document.getElementById('currentPageInfo')
  if (currentPage && (currentPage.appToken || currentPage.wikiToken)) {
    cpSection.style.display = ''
    cpInfo.innerHTML = ''
    if (currentPage.type) cpInfo.innerHTML += `<span class="tag accent">${currentPage.type}</span>`
    if (currentPage.appToken) cpInfo.innerHTML += `<span class="tag">app: ${currentPage.appToken}</span>`
    if (currentPage.wikiToken) cpInfo.innerHTML += `<span class="tag">wiki: ${currentPage.wikiToken}</span>`
    if (currentPage.tableId) cpInfo.innerHTML += `<span class="tag green">table: ${currentPage.tableId}</span>`
    if (currentPage.viewId) cpInfo.innerHTML += `<span class="tag">view: ${currentPage.viewId}</span>`
  } else {
    cpSection.style.display = 'none'
  }

  document.getElementById('captureCount').textContent = allCaptures.length
  document.getElementById('connectorCount').textContent = connectors.length

  const list = document.getElementById('captureList')
  let html = ''

  if (connectors.length === 0) {
    html += `
      <div class="empty">
        <div class="empty-icon">📡</div>
        <div>No connector/sync captured yet</div>
        <div style="margin-top:6px;color:var(--text3)">
          Open Lark Bitable and click "Sync"<br>
          to capture the connector request
        </div>
      </div>`
  } else {
    for (const c of connectors) {
      html += renderConnector(c, c._origIdx)
    }
  }

  if (others.length > 0) {
    html += `
      <div class="show-more-bar" id="showMoreBar">
        <button class="btn small" id="btnToggleOthers">
          ${showOthers ? 'Hide' : 'Show'} other requests (${others.length})
        </button>
      </div>`
    if (showOthers) {
      for (const c of others) {
        html += renderOther(c, c._origIdx)
      }
    }
  }

  list.innerHTML = html

  document.getElementById('btnToggleOthers')?.addEventListener('click', () => {
    showOthers = !showOthers
    loadCaptures()
  })

  list.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const action = e.currentTarget.dataset.action
      const idx = parseInt(e.currentTarget.dataset.idx)
      handleAction(action, allCaptures[idx], idx)
    })
  })
}

// ─── Render: Connector Sync ───────────────────────────────────────────

function renderConnector(c, idx) {
  const time = new Date(c.timestamp).toLocaleTimeString('vi-VN', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })

  return `
    <div class="capture connector-capture">
      <div class="capture-header">
        <span class="capture-type" style="background:rgba(99,102,241,0.15);color:#6366f1">CONNECTOR SYNC</span>
        <span class="capture-time">${time}</span>
      </div>
      <div class="capture-fields">
        <div class="field"><div class="field-label">Domain</div><div class="field-value">${esc(c.domain)}</div></div>
        <div class="field"><div class="field-label">Host Type</div><div class="field-value">${esc(c.hostType)}</div></div>
        <div class="field"><div class="field-label">Doc Token</div><div class="field-value mono">${esc(c.docToken || '—')}</div></div>
        <div class="field"><div class="field-label">Table IDs</div><div class="field-value mono">${esc((c.tableIds || []).join(', ') || '—')}</div></div>
        <div class="field"><div class="field-label">CSRF</div><div class="field-value mono">${esc(truncate(c.csrfToken, 20))}</div></div>
        <div class="field"><div class="field-label">Host ID</div><div class="field-value mono">${esc(truncate(c.hostId, 20))}</div></div>
        <div class="field"><div class="field-label">Cookies</div><div class="field-value">${c.cookies ? '&#10003; ' + (c.cookieCount || '?') + ' cookies (' + (c.httpOnlyCount || 0) + ' httpOnly)' : '<span style="color:#ef4444">&#10007; empty</span>'}</div></div>
        ${!c.csrfToken ? '<div class="field full-width"><div class="field-value" style="color:#f59e0b">&#9888; CSRF token missing — sync may fail</div></div>' : ''}
        <div class="field"><div class="field-label">URL</div><div class="field-value mono">${esc(truncate(c.url, 50))}</div></div>
      </div>
      <div class="capture-actions">
        <button class="btn small primary" data-action="quickSetup" data-idx="${idx}">Quick Setup</button>
        <button class="btn small" data-action="parseCurl" data-idx="${idx}">Parse cURL (API)</button>
        <button class="btn small" data-action="copyCurl" data-idx="${idx}">Copy cURL</button>
        <button class="btn small" data-action="copyConfig" data-idx="${idx}">Copy Config</button>
        <button class="btn small" data-action="copyUrl" data-idx="${idx}">Copy URL</button>
        <button class="btn small" data-action="openCmsWithData" data-idx="${idx}">&rarr; CMS</button>
        <button class="btn small danger" data-action="delete" data-idx="${idx}">&times;</button>
      </div>
    </div>`
}

// ─── Render: Other requests ───────────────────────────────────────────

function renderOther(c, idx) {
  const time = new Date(c.timestamp).toLocaleTimeString('vi-VN', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const shortPath = (c.path || c.url || '').replace(/^\/space\/api\//, '/')

  return `
    <div class="capture other-capture">
      <div class="capture-header">
        <span class="capture-type" style="background:rgba(156,163,175,0.12);color:#9ca3af">${esc(c.method || 'POST')}</span>
        <span class="capture-path mono">${esc(truncate(shortPath, 55))}</span>
        <span class="capture-time">${time}</span>
      </div>
      <div class="capture-actions">
        <button class="btn small" data-action="copyUrl" data-idx="${idx}">Copy URL</button>
        <button class="btn small" data-action="copyAll" data-idx="${idx}">Copy JSON</button>
        <button class="btn small danger" data-action="delete" data-idx="${idx}">&times;</button>
      </div>
    </div>`
}

// ─── Actions ──────────────────────────────────────────────────────────

async function handleAction(action, capture, idx) {
  switch (action) {
    case 'copyUrl':
      copyText(capture.url)
      showToast('URL copied!')
      break

    case 'copyCurl':
      copyText(buildCurlFromCapture(capture))
      showToast('cURL copied!')
      break

    case 'copyConfig':
      copyText(JSON.stringify({
        domain: capture.domain,
        docToken: capture.docToken,
        tableIds: capture.tableIds || [],
        cookies: capture.cookies,
        csrfToken: capture.csrfToken,
        hostId: capture.hostId,
        hostType: capture.hostType,
      }, null, 2))
      showToast('Config JSON copied!')
      break

    case 'copyAll': {
      const clean = { ...capture }
      if (clean.cookies?.length > 200) clean.cookies = clean.cookies.slice(0, 100) + '...[truncated]'
      delete clean.headers
      delete clean._origIdx
      copyText(JSON.stringify(clean, null, 2))
      showToast('JSON copied!')
      break
    }

    case 'parseCurl':
      await parseCurlViaApi(capture)
      break

    case 'quickSetup':
      await quickSetupJob(capture)
      break

    case 'openCmsWithData':
      openCmsWithCapture(capture)
      break

    case 'delete':
      chrome.runtime.sendMessage({ action: 'deleteCapture', index: idx }, () => loadCaptures())
      break
  }
}

// ─── Parse cURL via backend API (same as CMS does) ────────────────────

async function parseCurlViaApi(capture) {
  const curl = buildCurlFromCapture(capture)
  try {
    const resp = await fetch(`${apiBase}/bitable-sync/parse-curl`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ curl }),
    })
    const result = await resp.json()
    if (result.success && result.data) {
      const d = result.data
      copyText(JSON.stringify(d, null, 2))
      showToast(`Parsed! domain=${d.domain}, tables=${d.tableIds.length}`)
    } else {
      showToast(result.error || 'Parse failed', true)
    }
  } catch (e) {
    showToast(`Error: ${e.message}`, true)
  }
}

// ─── Quick Setup: create sync job via API ─────────────────────────────
// Matches exact payload shape from CMS page.tsx handleFinish()

async function quickSetupJob(capture) {
  const name = prompt(
    'Sync Job Name:',
    `Connector — ${capture.domain.split('.')[0]} — ${new Date().toLocaleDateString('vi-VN')}`
  )
  if (!name) return

  // Step 1: Parse cURL via backend (same as CMS)
  const curl = buildCurlFromCapture(capture)
  let parsed = null
  try {
    const resp = await fetch(`${apiBase}/bitable-sync/parse-curl`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ curl }),
    })
    const result = await resp.json()
    if (result.success && result.data) {
      parsed = result.data
    }
  } catch { /* fallback to local data */ }

  // Use parsed data from API, fallback to local capture
  const domain = parsed?.domain || capture.domain || ''
  const docToken = parsed?.docToken || capture.docToken || ''
  const tableIds = parsed?.tableIds || capture.tableIds || []
  const cookies = parsed?.cookies || capture.cookies || ''
  const csrfToken = parsed?.csrfToken || capture.csrfToken || ''
  const hostId = parsed?.hostId || capture.hostId || ''
  const hostType = parsed?.hostType || capture.hostType || 'Wiki'

  // Step 2: Build payload — exact same shape as CMS page.tsx handleFinish()
  const payload = {
    name,
    description: '',
    accountId: null,
    syncMode: 'connector',
    appToken: docToken,          // CMS sets appToken = docToken for connector
    tableId: tableIds[0] || '',  // CMS sets tableId = tableIds[0]
    viewId: '',
    connector: {
      domain,
      docToken,
      tableIds,                  // Array, not string
      cookies,
      csrfToken,
      hostId,
      hostType,
    },
    intervalSeconds: 60,         // 1 minute
    enabled: true,
    ignoreSchedule: false,
    schedule: {
      activeHoursStart: 6,
      activeHoursEnd: 20,
      activeDays: [1, 2, 3, 4, 5, 6],
      timezone: 'Asia/Ho_Chi_Minh',
    },
    webhookUrl: '',
    notify: {
      onNewRecords: false,
      onUpdatedRecords: false,
      onDeletedRecords: false,
      channels: [],
    },
  }

  // Step 3: Create sync job
  try {
    const resp = await fetch(`${apiBase}/bitable-sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const result = await resp.json()
    if (result.success || result.data) {
      const jobName = result.data?.name || name
      showToast(`Created: ${jobName}`)
    } else {
      showToast(result.error || result.message || 'Failed to create', true)
    }
  } catch (e) {
    showToast(`Error: ${e.message}`, true)
  }
}

// ─── Open CMS with pre-filled connector data ─────────────────────────

function openCmsWithCapture(capture) {
  const params = new URLSearchParams()
  params.set('mode', 'connector')
  params.set('domain', capture.domain || '')
  params.set('docToken', capture.docToken || '')
  params.set('tableIds', (capture.tableIds || []).join(','))
  params.set('csrfToken', capture.csrfToken || '')
  params.set('hostId', capture.hostId || '')
  params.set('hostType', capture.hostType || '')
  if (capture.cookies) {
    chrome.storage.local.set({ _pendingCookies: capture.cookies })
    params.set('hasCookies', '1')
  }
  chrome.tabs.create({ url: `https://cmshoanam.toolswave.net/sync/bitable?action=create&${params.toString()}` })
}

// ─── Build cURL from capture (same format browser DevTools produces) ──

function buildCurlFromCapture(c) {
  const parts = [`curl '${c.url}'`]
  parts.push(`  -X ${c.method || 'POST'}`)
  // Headers
  if (c.csrfToken) parts.push(`  -H 'x-csrftoken: ${c.csrfToken}'`)
  if (c.hostId) parts.push(`  -H 'docs-host-id: ${c.hostId}'`)
  if (c.hostType) parts.push(`  -H 'docs-host-type: ${c.hostType}'`)
  // Referer (helps backend extract tableId as fallback)
  const referer = c.headers?.referer || c.headers?.Referer || ''
  if (referer) parts.push(`  -H 'referer: ${referer}'`)
  // Cookies
  if (c.cookies) parts.push(`  -b '${c.cookies}'`)
  // Body
  if (c.body) parts.push(`  --data-raw '${c.body}'`)
  return parts.join(' \\\n')
}

// ─── Utils ────────────────────────────────────────────────────────────

function copyText(text) {
  navigator.clipboard.writeText(text).catch(() => {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.cssText = 'position:fixed;opacity:0'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
  })
}

function showToast(msg, isError = false) {
  const el = document.getElementById('toast')
  el.textContent = msg
  el.className = `toast show ${isError ? 'error' : ''}`
  setTimeout(() => { el.className = 'toast' }, 2500)
}

function esc(s) {
  if (!s) return ''
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function truncate(s, len) {
  if (!s) return ''
  return s.length > len ? s.slice(0, len) + '…' : s
}
