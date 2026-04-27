"use client"

import { useEffect, useState } from "react"

interface BranchJsonState<T> {
  key: string
  data: T | null
  error: string | null
  loading: boolean
}

const responseCache = new Map<string, unknown>()
const inflightRequests = new Map<string, Promise<unknown>>()

function getToken(): string {
  return typeof window !== "undefined" ? sessionStorage.getItem("admin_password") ?? "" : ""
}

export function clearBranchRequestCache() {
  responseCache.clear()
  inflightRequests.clear()
}

export async function adminFetchJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set("Authorization", `Bearer ${getToken()}`)
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json")

  const res = await fetch(url, { ...init, headers })
  const payload = await res.json().catch(() => null)
  if (!res.ok) {
    const message = payload && typeof payload === "object" && "error" in payload
      ? String((payload as { error: unknown }).error)
      : `Request failed: ${res.status}`
    throw new Error(message)
  }
  return payload as T
}

function loadBranchJson<T>(key: string, url: string): Promise<T> {
  const cached = responseCache.get(key)
  if (cached) return Promise.resolve(cached as T)

  const inflight = inflightRequests.get(key)
  if (inflight) return inflight as Promise<T>

  const request = adminFetchJson<T>(url).then((data) => {
    responseCache.set(key, data)
    return data
  }).finally(() => {
    inflightRequests.delete(key)
  })
  inflightRequests.set(key, request)
  return request
}

export function useBranchJson<T>(url: string, refreshKey: number): BranchJsonState<T> {
  const cacheKey = `${refreshKey}:${url}`
  const hasInitialCache = responseCache.has(cacheKey)
  const [state, setState] = useState<BranchJsonState<T>>({
    key: cacheKey,
    data: hasInitialCache ? responseCache.get(cacheKey) as T : null,
    error: null,
    loading: !hasInitialCache,
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
    const hasCache = responseCache.has(cacheKey)
    return {
      key: cacheKey,
      data: hasCache ? responseCache.get(cacheKey) as T : null,
      error: null,
      loading: !hasCache,
    }
  }

  return state
}
