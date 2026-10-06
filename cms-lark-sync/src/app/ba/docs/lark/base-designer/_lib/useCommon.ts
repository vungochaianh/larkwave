'use client'

import { useEffect, useState } from 'react'
import { getLarkBases, setLarkToken } from '@/lib/api'
import { buildLarkOAuthUrl, clearLarkSession, getLarkRedirectUri, isLarkTokenValid } from '@/lib/larkOAuth'
import { API_BASE } from './constants'
import type { LarkAccount, LarkBase, StoredAIConfig } from './types'

export type { LarkAccount, LarkBase, StoredAIConfig }
export { getLarkRedirectUri }

/** Shared hook for auth, bases, AI configs — used by all sub-pages */
export function useCommon() {
  // ── Auth ─────────────────────────────────────────────────────────────────
  const [userToken,      setUserToken]      = useState<string | null>(null)
  const [userName,       setUserName]       = useState('')
  const [userAvatar,     setUserAvatar]     = useState('')
  const [appId,          setAppId]          = useState('')
  const [sessionExpired, setSessionExpired] = useState(false)

  // ── Lark accounts ────────────────────────────────────────────────────────
  const [larkAccounts,      setLarkAccounts]      = useState<LarkAccount[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState<string>('')

  // ── AI configs ────────────────────────────────────────────────────────────
  const [aiConfigs,          setAiConfigs]          = useState<StoredAIConfig[]>([])
  const [selectedAiConfigId, setSelectedAiConfigId] = useState<string>('')

  // ── Bases ────────────────────────────────────────────────────────────────
  const [bases,        setBases]        = useState<LarkBase[]>([])
  const [loadingBases, setLoadingBases] = useState(false)
  const [basesError,   setBasesError]   = useState<string | null>(null)
  const [basesLoadedAt, setBasesLoadedAt] = useState<Date | null>(null)

  // ── Init auth + auto-load bases ───────────────────────────────────────────
  useEffect(() => {
    setAppId(localStorage.getItem('lark_app_id') ?? '')
    if (isLarkTokenValid()) {
      const token = localStorage.getItem('lark_user_token')!
      setUserToken(token)
      setLarkToken(token)
      setUserName(localStorage.getItem('lark_user_name') ?? '')
      setUserAvatar(localStorage.getItem('lark_user_avatar') ?? '')
      // Auto-load bases on mount when already logged in
      setLoadingBases(true)
      getLarkBases()
        .then(res => { setBases(res.data); setBasesLoadedAt(new Date()) })
        .catch(e  => setBasesError(e.message || 'Failed to load bases'))
        .finally(() => setLoadingBases(false))
    } else if (localStorage.getItem('lark_user_token')) {
      clearLarkSession(); setSessionExpired(true)
    }
  }, [])

  // ── Load Lark accounts ────────────────────────────────────────────────────
  useEffect(() => {
    fetch(`${API_BASE.replace(/\/api$/, '')}/api/lark-accounts?status=active&limit=50`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        if (d.success && d.data?.length) {
          setLarkAccounts(d.data)
          const def = d.data.find((a: LarkAccount) => a.isDefault) ?? d.data[0]
          if (def) {
            setSelectedAccountId(def._id)
            setAppId(def.appId)
            localStorage.setItem('lark_app_id', def.appId)
          }
        }
      })
      .catch(() => {})
  }, [])

  // ── Load AI configs ───────────────────────────────────────────────────────
  useEffect(() => {
    fetch(`${API_BASE}/ai-configs`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        if (d.success && d.data?.length) {
          const active = d.data.filter((c: StoredAIConfig) => c.status === 'active')
          setAiConfigs(active)
          const def = d.data.find((c: StoredAIConfig) => c.isDefault) ?? d.data[0]
          if (def) setSelectedAiConfigId(def._id)
        }
      })
      .catch(() => {})
  }, [])

  // ── Load bases (manual reload) ────────────────────────────────────────────
  async function loadBases() {
    setLoadingBases(true); setBasesError(null)
    try {
      const res = await getLarkBases()
      setBases(res.data); setBasesLoadedAt(new Date())
    } catch (e: any) { setBasesError(e.message || 'Failed to load bases') }
    finally { setLoadingBases(false) }
  }

  // ── Auth actions ──────────────────────────────────────────────────────────
  function handleLogin() {
    const account = larkAccounts.find(a => a._id === selectedAccountId)
    const id = account?.appId ?? appId.trim()
    if (!id) return
    localStorage.setItem('lark_app_id', id)
    window.location.href = buildLarkOAuthUrl(id, 'standard')
  }

  function handleLogout() {
    clearLarkSession()
    setUserToken(null); setUserName(''); setUserAvatar('')
    setBases([]); setSessionExpired(false)
  }

  function getAIParams() {
    return selectedAiConfigId ? { aiConfigId: selectedAiConfigId } : {}
  }

  function isAuthError(msg: string) {
    const l = msg.toLowerCase()
    return l.includes('no token') || l.includes('401') ||
           (l.includes('token') && l.includes('invalid')) || l.includes('unauthorized')
  }

  return {
    userToken, userName, userAvatar, appId, setAppId, sessionExpired, setSessionExpired,
    larkAccounts, selectedAccountId, setSelectedAccountId,
    aiConfigs, selectedAiConfigId, setSelectedAiConfigId, getAIParams,
    bases, loadingBases, basesError, setBasesError, loadBases, basesLoadedAt,
    handleLogin, handleLogout, isAuthError,
  }
}
