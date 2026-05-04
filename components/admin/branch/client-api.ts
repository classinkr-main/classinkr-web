"use client"

import { useEffect, useState } from "react"
import {
  adminFetchJson as sharedAdminFetchJson,
  adminFetchJsonCached,
  clearAdminRequestCache,
} from "@/lib/admin-client"

interface BranchJsonState<T> {
  key: string
  data: T | null
  error: string | null
  loading: boolean
}

export function clearBranchRequestCache() {
  clearAdminRequestCache()
}

export async function adminFetchJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  return sharedAdminFetchJson<T>(url, init)
}

function loadBranchJson<T>(key: string, url: string): Promise<T> {
  return adminFetchJsonCached<T>(url, undefined, {
    cacheKey: `branch:${key}`,
    ttlMs: 60_000,
  })
}

export function useBranchJson<T>(url: string, refreshKey: number): BranchJsonState<T> {
  const cacheKey = `${refreshKey}:${url}`
  const [state, setState] = useState<BranchJsonState<T>>({
    key: cacheKey,
    data: null,
    error: null,
    loading: true,
  })

  useEffect(() => {
    let active = true
    void loadBranchJson<T>(cacheKey, url)
      .then((data) => {
        if (active) setState({ key: cacheKey, data, error: null, loading: false })
      })
      .catch((error) => {
        if (active) {
          setState({
            key: cacheKey,
            data: null,
            error: error instanceof Error ? error.message : String(error),
            loading: false,
          })
        }
      })

    return () => { active = false }
  }, [cacheKey, url])

  if (state.key !== cacheKey) {
    return {
      key: cacheKey,
      data: null,
      error: null,
      loading: true,
    }
  }

  return state
}
