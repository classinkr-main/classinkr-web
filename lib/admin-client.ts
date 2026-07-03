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
const ADMIN_MEMORY_CACHE_LIMIT = 90
const ADMIN_SESSION_CACHE_LIMIT = 70
const MAX_SESSION_CACHE_CHARS = 350_000

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
let pruneScheduled = false

// 변경(mutation) 직후에는 브라우저 HTTP 캐시(Cache-Control: max-age)를 우회해
// 서버에서 최신 데이터를 다시 받아온다. 그 외에는 HTTP 캐시를 활용해 재방문을 빠르게 한다.
// 무효화는 변경된 리소스 스코프에만 적용 — 블로그 저장이 CRM 캐시를 날리지 않게 한다.
const BROWSER_CACHE_BYPASS_MS = 60_000
const GLOBAL_CACHE_SCOPE = "*"

// CRM 홈/오버뷰는 여러 원천(계약·영수증·리드 등)을 합산하므로,
// 그 원천이 바뀌면 CRM 집계 캐시도 함께 무효화한다.
const CRM_AGGREGATE_SCOPE = "/api/admin/crm"
const CRM_SOURCE_BASES = new Set([
  "/api/admin/contracts",
  "/api/admin/receipts",
  "/api/admin/leads",
  "/api/admin/teams",
])

// scope -> 마지막 변경 시각. 활성 스코프에 매칭되는 GET만 브라우저 캐시를 우회한다.
const mutationScopeAt = new Map<string, number>()

function resourceBaseFromUrl(url: string): string | null {
  const match = url.match(/\/api\/admin\/[^/?#]+/)
  return match ? match[0] : null
}

// 변경된 URL이 무효화해야 할 스코프 목록. 리소스를 알 수 없으면 안전하게 전체.
function invalidationScopesForUrl(url: string): string[] {
  const base = resourceBaseFromUrl(url)
  if (!base) return [GLOBAL_CACHE_SCOPE]
  const scopes = [base]
  if (base.startsWith(CRM_AGGREGATE_SCOPE) || CRM_SOURCE_BASES.has(base)) {
    scopes.push(CRM_AGGREGATE_SCOPE)
  }
  return scopes
}

function markAdminMutation(scopes: string[]) {
  const now = Date.now()
  for (const scope of scopes) mutationScopeAt.set(scope, now)
}

function shouldBypassBrowserCache(url: string) {
  const now = Date.now()
  let bypass = false
  for (const [scope, ts] of mutationScopeAt) {
    if (now - ts >= BROWSER_CACHE_BYPASS_MS) {
      mutationScopeAt.delete(scope)
      continue
    }
    if (scope === GLOBAL_CACHE_SCOPE || url.includes(scope)) bypass = true
  }
  return bypass
}

function clearCacheScopes(scopes: string[]) {
  const global = scopes.includes(GLOBAL_CACHE_SCOPE)
  const matches = (key: string) => global || scopes.some((scope) => key.includes(scope))

  for (const key of Array.from(memoryCache.keys())) {
    if (matches(key)) memoryCache.delete(key)
  }
  for (const key of Array.from(inflightRequests.keys())) {
    if (matches(key)) inflightRequests.delete(key)
  }

  if (typeof window === "undefined") return
  for (const key of Object.keys(sessionStorage)) {
    if (key.startsWith(ADMIN_REQUEST_CACHE_PREFIX) && matches(key)) {
      sessionStorage.removeItem(key)
    }
  }
}

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

function pruneMemoryCache(now = Date.now()) {
  const staleRetentionCutoff = now - DEFAULT_ADMIN_STALE_WHILE_REVALIDATE_MS

  for (const [key, entry] of memoryCache) {
    if (entry.savedAt < staleRetentionCutoff) {
      memoryCache.delete(key)
    }
  }

  if (memoryCache.size <= ADMIN_MEMORY_CACHE_LIMIT) return

  const removable = Array.from(memoryCache.entries())
    .sort(([, a], [, b]) => a.savedAt - b.savedAt)
    .slice(0, memoryCache.size - ADMIN_MEMORY_CACHE_LIMIT)

  for (const [key] of removable) {
    memoryCache.delete(key)
  }
}

function pruneSessionCache(now = Date.now()) {
  if (typeof window === "undefined") return

  const staleRetentionCutoff = now - DEFAULT_ADMIN_STALE_WHILE_REVALIDATE_MS
  const entries: Array<{ key: string; savedAt: number }> = []

  for (const key of Object.keys(sessionStorage)) {
    if (!key.startsWith(ADMIN_REQUEST_CACHE_PREFIX)) continue

    try {
      const entry = JSON.parse(sessionStorage.getItem(key) ?? "null") as AdminCacheEntry<unknown> | null
      if (!entry || typeof entry.savedAt !== "number") {
        sessionStorage.removeItem(key)
        continue
      }

      if (entry.savedAt < staleRetentionCutoff) {
        sessionStorage.removeItem(key)
        continue
      }

      entries.push({ key, savedAt: entry.savedAt })
    } catch {
      sessionStorage.removeItem(key)
    }
  }

  if (entries.length <= ADMIN_SESSION_CACHE_LIMIT) return

  entries
    .sort((a, b) => a.savedAt - b.savedAt)
    .slice(0, entries.length - ADMIN_SESSION_CACHE_LIMIT)
    .forEach((entry) => sessionStorage.removeItem(entry.key))
}

function scheduleAdminCachePrune() {
  if (typeof window === "undefined" || pruneScheduled) return
  pruneScheduled = true

  const idleWindow = window as typeof window & {
    requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number
  }

  const run = () => {
    pruneScheduled = false
    pruneMemoryCache()
    pruneSessionCache()
  }

  if (idleWindow.requestIdleCallback) {
    idleWindow.requestIdleCallback(run, { timeout: 2_000 })
    return
  }

  window.setTimeout(run, 500)
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
    const serialized = JSON.stringify(entry)
    const sessionKey = getSessionCacheKey(cacheKey)

    if (serialized.length > MAX_SESSION_CACHE_CHARS) {
      sessionStorage.removeItem(sessionKey)
      return
    }

    sessionStorage.setItem(sessionKey, serialized)
    scheduleAdminCachePrune()
  } catch {
    sessionStorage.removeItem(getSessionCacheKey(cacheKey))
  }
}

function readAdminCache<T>(cacheKey: string, allowExpired = false): AdminCacheEntry<T> | null {
  pruneMemoryCache()

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
  clearCacheScopes([GLOBAL_CACHE_SCOPE])
  markAdminMutation([GLOBAL_CACHE_SCOPE])
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

  const isFormDataBody = typeof FormData !== "undefined" && init?.body instanceof FormData

  if (init?.body !== undefined && !headers.has("Content-Type") && !isFormDataBody) {
    headers.set("Content-Type", "application/json")
  }

  if (token) {
    headers.set("Authorization", `Bearer ${token}`)
  }

  const response = await fetch(input, {
    ...init,
    ...(method === "GET" && !init?.cache && shouldBypassBrowserCache(input)
      ? { cache: "no-cache" as RequestCache }
      : {}),
    headers,
  })

  if (response.status === 401 && typeof window !== "undefined") {
    clearAdminSessionStorage()

    if (window.location.pathname !== "/admin/login") {
      window.location.href = "/admin/login"
    }
  }

  if (response.ok && method !== "GET") {
    const scopes = invalidationScopesForUrl(input)
    clearCacheScopes(scopes)
    markAdminMutation(scopes)
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

export function getCachedAdminJson<T>(
  input: string,
  options: { cacheKey?: string; allowExpired?: boolean } = {}
) {
  const cacheKey = getAdminRequestCacheKey(input, undefined, options.cacheKey)
  return readAdminCache<T>(cacheKey, options.allowExpired ?? true)?.data ?? null
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

    const requestInit: RequestInit | undefined = options.force
      ? { ...init, cache: "no-cache" }
      : init
    const request = adminFetchJson<T>(input, requestInit)
      .then((data) => {
        const entry: AdminCacheEntry<T> = {
          data,
          expiresAt: Date.now() + ttlMs,
          savedAt: Date.now(),
        }
        memoryCache.set(cacheKey, entry)
        pruneMemoryCache()
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
  if (typeof document !== "undefined" && document.hidden) {
    return Promise.resolve()
  }

  const navigatorWithConnection = typeof navigator === "undefined"
    ? null
    : navigator as Navigator & { connection?: { saveData?: boolean } }

  if (navigatorWithConnection?.connection?.saveData) {
    return Promise.resolve()
  }

  return adminFetchJsonCached<unknown>(input, undefined, {
    ...options,
    persist: options.persist ?? false,
    staleWhileRevalidateMs: options.staleWhileRevalidateMs ?? 60_000,
  }).then(
    () => undefined,
    () => undefined
  )
}
