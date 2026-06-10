"use client"

const STORAGE_KEYS = [
  "admin_password",
  "admin_token",
  "admin_role",
  "admin_name",
  "admin_email",
  "admin_branch",
] as const

const ADMIN_REQUEST_CACHE_PREFIX = "admin_request_cache:"
const DEFAULT_ADMIN_CACHE_TTL_MS = 45_000
// TTL이 지나도 이 시간 안의 데이터면 즉시 보여주고 백그라운드에서 갱신한다.
// (mutation 시 clearAdminRequestCache로 전체 캐시가 비워지므로 편집 직후 staleness 없음)
const DEFAULT_ADMIN_STALE_WHILE_REVALIDATE_MS = 5 * 60_000

interface AdminCacheEntry<T> {
  data: T
  expiresAt: number
  savedAt: number
}

interface AdminFetchCacheOptions {
  cacheKey?: string
  ttlMs?: number
  persist?: boolean
  force?: boolean
  staleIfError?: boolean
  /**
   * TTL이 지난 캐시라도 이 시간(ms) 안에 저장된 것이면 즉시 반환하고
   * 백그라운드에서 갱신한다. 재방문 시 로딩 스피너 대신 직전 데이터를 보여준다.
   * 기본 5분. 0을 주면 비활성화.
   */
  staleWhileRevalidateMs?: number
}

const memoryCache = new Map<string, AdminCacheEntry<unknown>>()
const inflightRequests = new Map<string, Promise<unknown>>()

function isGetRequest(init?: RequestInit) {
  return !init?.method || init.method.toUpperCase() === "GET"
}

function getAdminRequestCacheKey(input: string, init?: RequestInit, cacheKey?: string) {
  const method = init?.method?.toUpperCase() ?? "GET"
  return `${method}:${cacheKey ?? input}`
}

function getSessionCacheKey(cacheKey: string) {
  return `${ADMIN_REQUEST_CACHE_PREFIX}${cacheKey}`
}

function readSessionCache<T>(cacheKey: string, allowExpired = false): AdminCacheEntry<T> | null {
  if (typeof window === "undefined") return null

  try {
    const raw = sessionStorage.getItem(getSessionCacheKey(cacheKey))
    if (!raw) return null

    const entry = JSON.parse(raw) as AdminCacheEntry<T>
    if (!entry || typeof entry.expiresAt !== "number") return null
    if (!allowExpired && entry.expiresAt <= Date.now()) return null

    return entry
  } catch {
    sessionStorage.removeItem(getSessionCacheKey(cacheKey))
    return null
  }
}

function writeSessionCache(cacheKey: string, entry: AdminCacheEntry<unknown>) {
  if (typeof window === "undefined") return

  try {
    sessionStorage.setItem(getSessionCacheKey(cacheKey), JSON.stringify(entry))
  } catch {
    sessionStorage.removeItem(getSessionCacheKey(cacheKey))
  }
}

function readAdminCache<T>(cacheKey: string, allowExpired = false): AdminCacheEntry<T> | null {
  const memoryEntry = memoryCache.get(cacheKey) as AdminCacheEntry<T> | undefined
  if (memoryEntry && (allowExpired || memoryEntry.expiresAt > Date.now())) {
    return memoryEntry
  }

  const sessionEntry = readSessionCache<T>(cacheKey, allowExpired)
  if (sessionEntry && (!memoryEntry || sessionEntry.savedAt >= memoryEntry.savedAt)) {
    memoryCache.set(cacheKey, sessionEntry)
    return sessionEntry
  }

  return null
}

export function clearAdminRequestCache() {
  memoryCache.clear()
  inflightRequests.clear()

  if (typeof window === "undefined") return

  for (const key of Object.keys(sessionStorage)) {
    if (key.startsWith(ADMIN_REQUEST_CACHE_PREFIX)) {
      sessionStorage.removeItem(key)
    }
  }
}

export function clearAdminSessionStorage() {
  if (typeof window === "undefined") return

  STORAGE_KEYS.forEach((key) => {
    sessionStorage.removeItem(key)
  })

  clearAdminRequestCache()
}

export function getAdminToken() {
  if (typeof window === "undefined") return ""

  return (
    sessionStorage.getItem("admin_token") ??
    sessionStorage.getItem("admin_password") ??
    ""
  )
}

export async function adminFetch(input: string, init?: RequestInit) {
  const headers = new Headers(init?.headers)
  const token = getAdminToken()
  const method = init?.method?.toUpperCase() ?? "GET"

  if (init?.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }

  if (token) {
    headers.set("Authorization", `Bearer ${token}`)
  }

  const response = await fetch(input, {
    ...init,
    headers,
  })

  if (response.status === 401 && typeof window !== "undefined") {
    clearAdminSessionStorage()

    if (window.location.pathname !== "/admin/login") {
      window.location.href = "/admin/login"
    }
  }

  if (response.ok && method !== "GET") {
    clearAdminRequestCache()
  }

  return response
}

export async function adminFetchJson<T>(input: string, init?: RequestInit) {
  const response = await adminFetch(input, init)
  const data = await response.json().catch(() => null)

  if (!response.ok) {
    const fallback = `${response.status} ${response.statusText}`.trim()
    throw new Error(data?.error ?? data?.message ?? (fallback || "요청에 실패했습니다."))
  }

  return data as T
}

export async function adminFetchJsonCached<T>(
  input: string,
  init?: RequestInit,
  options: AdminFetchCacheOptions = {}
) {
  if (!isGetRequest(init)) {
    return adminFetchJson<T>(input, init)
  }

  const ttlMs = options.ttlMs ?? DEFAULT_ADMIN_CACHE_TTL_MS
  const persist = options.persist ?? true
  const staleIfError = options.staleIfError ?? true

  if (ttlMs <= 0) {
    return adminFetchJson<T>(input, init)
  }

  const cacheKey = getAdminRequestCacheKey(input, init, options.cacheKey)

  const startRequest = (): Promise<T> => {
    const inflight = inflightRequests.get(cacheKey)
    if (inflight) return inflight as Promise<T>

    const request = adminFetchJson<T>(input, init)
      .then((data) => {
        const entry: AdminCacheEntry<T> = {
          data,
          expiresAt: Date.now() + ttlMs,
          savedAt: Date.now(),
        }
        memoryCache.set(cacheKey, entry)
        if (persist) writeSessionCache(cacheKey, entry)
        return data
      })
      .catch((error) => {
        const stale = staleIfError ? readAdminCache<T>(cacheKey, true) : null
        if (stale) return stale.data
        throw error
      })
      .finally(() => {
        inflightRequests.delete(cacheKey)
      })

    inflightRequests.set(cacheKey, request)
    return request
  }

  if (!options.force) {
    const cached = readAdminCache<T>(cacheKey)
    if (cached) return cached.data

    const inflight = inflightRequests.get(cacheKey)
    if (inflight) return inflight as Promise<T>

    const staleWindowMs =
      options.staleWhileRevalidateMs ?? DEFAULT_ADMIN_STALE_WHILE_REVALIDATE_MS
    if (staleWindowMs > 0) {
      const stale = readAdminCache<T>(cacheKey, true)
      if (stale && Date.now() - stale.savedAt <= staleWindowMs) {
        void startRequest().catch(() => undefined)
        return stale.data
      }
    }
  }

  return startRequest()
}

export function warmAdminRequestCache(input: string, options: AdminFetchCacheOptions = {}) {
  return adminFetchJsonCached<unknown>(input, undefined, options).then(
    () => undefined,
    () => undefined
  )
}
