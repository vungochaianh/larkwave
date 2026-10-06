/**
 * Shared API key resolver — single fetch, cached in memory + sessionStorage.
 * All API modules (baApi, n8nApi, sharedApi) import from here to avoid
 * redundant /api/auth/key round-trips.
 */

const STORAGE_KEY = 'agents_api_key';

let _apiKey = '';
let _inflight: Promise<string> | null = null;

export async function getApiKey(): Promise<string> {
  if (_apiKey) return _apiKey;

  // Check sessionStorage first
  if (typeof window !== 'undefined') {
    const cached = sessionStorage.getItem(STORAGE_KEY);
    if (cached) { _apiKey = cached; return _apiKey; }
  }

  // Deduplicate concurrent calls
  if (_inflight) return _inflight;

  _inflight = (async () => {
    try {
      const res = await fetch('/api/auth/key');
      if (res.ok) {
        const d = await res.json();
        _apiKey = d.api_key || '';
        if (_apiKey && typeof window !== 'undefined') {
          sessionStorage.setItem(STORAGE_KEY, _apiKey);
        }
      }
    } catch { /* */ }
    _inflight = null;
    return _apiKey;
  })();

  return _inflight;
}

export async function authHeaders(): Promise<Record<string, string>> {
  const key = await getApiKey();
  return key
    ? { 'X-API-Key': key, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

export async function authHeadersNoContentType(): Promise<Record<string, string>> {
  const key = await getApiKey();
  return key ? { 'X-API-Key': key } : {};
}

/** Sync access to cached key (returns '' if not yet fetched) */
export function getApiKeySync(): string {
  if (_apiKey) return _apiKey;
  if (typeof window !== 'undefined') {
    return sessionStorage.getItem(STORAGE_KEY) || '';
  }
  return '';
}
