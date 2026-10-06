/**
 * useJobs — lightweight data-fetching hook for the jobs list.
 * Keeps loading / error / data in a single place so pages stay lean.
 */
'use client'

import { useCallback, useEffect, useState } from 'react'
import { getJobs } from '@/lib/api'
import type { CurlJob } from '@/lib/types'

type UseJobsResult = {
  jobs: CurlJob[]
  loading: boolean
  error: string | null
  reload: () => void
}

export function useJobs(): UseJobsResult {
  const [jobs, setJobs] = useState<CurlJob[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getJobs()
      if (!res.success) throw new Error(res.error || 'Failed to load jobs')
      setJobs(res.data || [])
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  return { jobs, loading, error, reload }
}
