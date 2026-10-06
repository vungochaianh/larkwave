/**
 * Lark Sync Helper — Bridge Script (ISOLATED world)
 *
 * Listens for window.postMessage from the MAIN world content script
 * and forwards to the background service worker via chrome.runtime.
 */

const MSG_PREFIX = '__LARK_SYNC_HELPER__'

function safeSend(msg) {
  // chrome.runtime.id is undefined when extension context is invalidated
  // (e.g. after extension reload/update while page is still open)
  if (!chrome.runtime?.id) return
  chrome.runtime.sendMessage(msg).catch(() => {})
}

window.addEventListener('message', (event) => {
  if (event.source !== window) return
  if (!event.data || event.data.source !== MSG_PREFIX) return

  const { type, data } = event.data

  if (type === 'fetchCapture') {
    safeSend({ action: 'fetchCapture', data })
  }

  if (type === 'pageInfo') {
    safeSend({ action: 'pageInfo', data })
  }
})
