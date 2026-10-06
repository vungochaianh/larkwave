'use client'

/**
 * Lark OAuth Callback Page
 *
 * Lark redirects here after the user authorizes the app:
 *   https://{this-page}?code=1yxlUSU8Rf+7B32HY3HR7g&state=xxx
 *
 * CRITICAL: The `code` value from Lark can contain `+` characters (literal
 * plus signs, NOT encoded as %2B). Using `URLSearchParams.get('code')` —
 * which is what `useSearchParams()` uses — decodes `+` as a space, corrupting
 * the code and causing the token exchange to fail with an invalid_grant error.
 *
 * Fix: parse the raw query string with `decodeURIComponent` (which does NOT
 * touch `+`) instead of URLSearchParams.
 */

import { Suspense, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Result, Spin, Typography } from 'antd'
import { validateOAuthState, clearLarkSession } from '@/lib/larkOAuth'

const { Text } = Typography

const API_ORIGIN = (process.env.NEXT_PUBLIC_API_BASE || 'https://apihoanam.toolswave.net/api').replace(/\/api$/, '')

type Status = 'loading' | 'success' | 'error'

/**
 * Parse a query-string parameter from the raw URL WITHOUT converting + to space.
 *
 * `URLSearchParams` (and `useSearchParams`) follows the application/x-www-form-
 * urlencoded spec which converts `+` → space. Lark's authorization code can
 * contain literal `+` characters, so we must avoid that decoding.
 *
 * This function uses `decodeURIComponent` which only processes %XX sequences
 * and leaves `+` intact.
 */
function getRawParam(search: string, name: string): string | null {
  // Remove the leading `?` if present
  const qs = search.startsWith('?') ? search.slice(1) : search
  for (const pair of qs.split('&')) {
    const eqIdx = pair.indexOf('=')
    if (eqIdx === -1) continue
    try {
      const key = decodeURIComponent(pair.slice(0, eqIdx))
      if (key === name) {
        return decodeURIComponent(pair.slice(eqIdx + 1))
      }
    } catch {
      // malformed pair — skip
    }
  }
  return null
}

function CallbackContent() {
  const router = useRouter()
  const [status,   setStatus]   = useState<Status>('loading')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    async function handleCallback() {
      // Read the raw query string — never use URLSearchParams/useSearchParams
      // for the `code` value because they convert `+` to space.
      const rawSearch = window.location.search

      // ── 1. Check for Lark-side errors ─────────────────────────────────────
      const larkError = getRawParam(rawSearch, 'error')
      if (larkError) {
        setErrorMsg(`Lark returned an error: ${decodeURIComponent(larkError)}`)
        setStatus('error')
        return
      }

      // ── 2. Get the authorization code (preserve + characters) ──────────────
      const code = getRawParam(rawSearch, 'code')
      if (!code) {
        setErrorMsg(
          'No authorization code in the callback URL. ' +
          'Make sure your redirect URI is registered correctly in the Lark Developer Console.'
        )
        setStatus('error')
        return
      }

      // ── 3. Validate state parameter (CSRF protection) ─────────────────────
      const returnedState = getRawParam(rawSearch, 'state')
      if (!validateOAuthState(returnedState)) {
        setErrorMsg(
          'OAuth state mismatch. This may be a CSRF attempt, or the login ' +
          'session expired. Please go back and try logging in again.'
        )
        setStatus('error')
        return
      }

      // ── 4. Exchange code for user access token ─────────────────────────────
      // Two paths:
      //  A) accountId in sessionStorage → use server-side credentials from DB
      //  B) appId + appSecret in localStorage → legacy Base Designer flow
      try {
        const { LARK_V2_BASE_URL } = await import('@/lib/api')
        const accountId = sessionStorage.getItem('lark_account_id')

        let res: Response
        if (accountId) {
          // Path A: account-based (knowledge browser login)
          res = await fetch(`${API_ORIGIN}/api-base/lark/v2/oauth/token-from-account`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ code, accountId }),
          })
        } else {
          // Path B: manual credentials (Base Designer legacy)
          const appId     = localStorage.getItem('lark_app_id')     ?? ''
          const appSecret = localStorage.getItem('lark_app_secret') ?? ''
          if (!appId || !appSecret) {
            setErrorMsg(
              'Lark App ID / Secret not found in browser storage. ' +
              'Open the ⚙ Config drawer in Base Designer, enter your credentials, then try again.'
            )
            setStatus('error')
            return
          }
          res = await fetch(`${LARK_V2_BASE_URL}/oauth/token`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ code, appId, appSecret }),
          })
        }

        const data = await res.json()
        if (!data.success) {
          throw new Error(data.error || `Token exchange failed (HTTP ${res.status})`)
        }

        // Persist session (path A also returns appId for consistency)
        if (data.appId) localStorage.setItem('lark_app_id', data.appId)
        localStorage.setItem('lark_user_token',       data.data.accessToken)
        localStorage.setItem('lark_user_name',        data.data.name      ?? '')
        localStorage.setItem('lark_user_avatar',      data.data.avatarUrl ?? '')
        localStorage.setItem(
          'lark_token_expires_at',
          String(Date.now() + (data.data.expiresIn ?? 7200) * 1000),
        )

        // Clean up sessionStorage
        const returnPath = sessionStorage.getItem('lark_oauth_return') ?? '/lark/base-designer'
        sessionStorage.removeItem('lark_account_id')
        sessionStorage.removeItem('lark_oauth_return')

        setStatus('success')
        setTimeout(() => router.replace(returnPath), 900)
      } catch (e: any) {
        setErrorMsg(e.message)
        setStatus('error')
      }
    }

    handleCallback()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (status === 'loading') {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3">
        <Spin size="large" />
        <Text className="text-neutral-500">Authenticating with Lark…</Text>
      </div>
    )
  }

  if (status === 'success') {
    return (
      <Result
        status="success"
        title="Đăng nhập thành công"
        subTitle="Đang chuyển hướng…"
      />
    )
  }

  return (
    <Result
      status="error"
      title="Authentication Failed"
      subTitle={errorMsg}
      extra={[
        <Button
          key="back"
          type="primary"
          onClick={() => {
            clearLarkSession()
            router.replace('/lark/base-designer')
          }}
        >
          Back to Base Designer
        </Button>,
      ]}
    />
  )
}

/**
 * Suspense is required here because this is a client component rendered
 * during the OAuth redirect flow. We do NOT use useSearchParams() (it would
 * corrupt + in the code), but Suspense is kept for safe hydration.
 */
export default function LarkOAuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center">
          <Spin size="large" />
        </div>
      }
    >
      <CallbackContent />
    </Suspense>
  )
}
