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

// 품질 웨이브 4 — 항목 3. 응답이 영원히 오지 않는 요청(네트워크 끊김·서버 행)을 방지하는
// 클라이언트 타임아웃. 대부분의 어드민 요청은 45s면 충분하지만, 외부 동기화·가져오기·
// LLM 평가류는 정상적으로 수십 초~수 분이 걸릴 수 있다 — 그런 경로를 아래 목록으로
// 인식해 타임아웃을 끈다(무제한 대기 = 이 기능 도입 전과 동일한 동작, 오탐으로 인한
// 회귀 없음). 필요하면 호출부에서 `adminTimeoutMs`로 개별 오버라이드할 수도 있다.
const DEFAULT_ADMIN_FETCH_TIMEOUT_MS = 45_000
const ADMIN_TIMEOUT_MESSAGE = "요청이 너무 오래 걸립니다 — 다시 시도해 주세요"

// 실측(grep) 기준 — 동기화/가져오기/생성/평가/일괄 처리류. 어드민 어디서 호출하든(이
// 파일을 import하는 한) 자동으로 타임아웃이 비활성화된다 — 호출부가 sections/*·
// SalesLedgerWorkbench처럼 이 웨이브에서 손댈 수 없는 파일이어도 안전하게 적용된다.
const LONG_RUNNING_ADMIN_PATHS = [
  "/api/admin/branch/sync",
  "/api/admin/branch/ledger/db-import",
  "/api/admin/crm/external-sync",
  "/api/admin/crm/source-links/generate",
  "/api/admin/channel-talk/sync",
  "/api/admin/chatbot/eval",
  "/api/admin/subscribers/bulk",
  "/api/admin/hardware/import-sheet",
  "/api/admin/hardware/import-ledger",
]
// cs-chat AI 초안 생성은 대화 id가 경로 중간에 끼어 있어(/conversations/{id}/generate)
// 정확한 경로 목록으로 못 잡는다 — 패턴으로 별도 매칭.
const LONG_RUNNING_ADMIN_PATH_PATTERNS = [/^\/api\/admin\/cs-chat\/conversations\/[^/]+\/generate$/]

function isLongRunningAdminPath(pathname: string) {
  return (
    LONG_RUNNING_ADMIN_PATHS.includes(pathname) ||
    LONG_RUNNING_ADMIN_PATH_PATTERNS.some((pattern) => pattern.test(pathname))
  )
}

export interface AdminFetchInit extends RequestInit {
  /**
   * 이 요청 하나의 타임아웃(ms)을 오버라이드한다.
   * - 숫자: 그 ms로 교체.
   * - false: 타임아웃 비활성화(무제한 대기).
   * 생략 시 기본 45s — 단 LONG_RUNNING_ADMIN_PATHS에 매칭되는 경로는 자동으로
   * 비활성화된다.
   */
  adminTimeoutMs?: number | false
}

function resolveAdminTimeoutMs(input: string, init?: AdminFetchInit): number | false {
  if (init && init.adminTimeoutMs !== undefined) return init.adminTimeoutMs
  const pathname = input.split("?")[0]
  if (isLongRunningAdminPath(pathname)) return false
  return DEFAULT_ADMIN_FETCH_TIMEOUT_MS
}

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

/**
 * 어드민 요청 캐시 무효화.
 * - 무인자: 전역 클리어(기존 동작 그대로 — 로그아웃·전체 리셋용).
 * - prefix(예: "/api/admin/branch"): 그 prefix가 포함된 캐시 키만 지우고, 같은 스코프의
 *   브라우저 HTTP 캐시 우회(60초)도 그 prefix에만 건다 — branch 새로고침이 다른 어드민
 *   탭 캐시까지 날리지 않게 한다(감사 #13).
 */
export function clearAdminRequestCache(prefix?: string) {
  const scopes = prefix ? [prefix] : [GLOBAL_CACHE_SCOPE]
  clearCacheScopes(scopes)
  markAdminMutation(scopes)
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

export async function adminFetch(input: string, init?: AdminFetchInit) {
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

  const timeoutMs = resolveAdminTimeoutMs(input, init)
  const externalSignal = init?.signal ?? null
  let timeoutController: AbortController | null = null
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined
  let timedOut = false

  if (timeoutMs !== false) {
    const controller = new AbortController()
    timeoutController = controller
    timeoutHandle = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, timeoutMs)

    if (externalSignal) {
      if (externalSignal.aborted) controller.abort()
      else externalSignal.addEventListener("abort", () => controller.abort(), { once: true })
    }
  }

  try {
    const response = await fetch(input, {
      ...init,
      ...(method === "GET" && !init?.cache && shouldBypassBrowserCache(input)
        ? { cache: "no-cache" as RequestCache }
        : {}),
      headers,
      signal: timeoutController ? timeoutController.signal : externalSignal ?? undefined,
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
  } catch (error) {
    // fetch가 abort로 실패했더라도, 그 abort가 우리 타임아웃 때문이 아니라 호출부가
    // 넘긴 signal(externalSignal) 때문일 수 있다 — timedOut 플래그로만 구분해서
    // 진짜 우리 타임아웃일 때만 안내 메시지로 감싼다.
    if (timedOut) {
      throw new Error(ADMIN_TIMEOUT_MESSAGE)
    }
    throw error
  } finally {
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle)
  }
}

export async function adminFetchJson<T>(input: string, init?: AdminFetchInit) {
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

// 품질 웨이브 3 — 항목 1. staleIfError 폴백은 갱신 실패를 조용히 오래된 캐시로 대체해왔다
// (재시도 없이, 실패했다는 신호도 없이). adminFetchJsonCachedWithMeta는 그 대체가 실제로
// 일어났는지(staleReason: "error")를 옵트인으로 노출한다 — stale-while-revalidate 고속
// 경로(:아래 staleWindowMs 블록, 정상적인 캐시 정책이지 실패가 아님)는 별도로
// staleReason: "revalidate"로 구분해 "갱신 실패" 문구가 오탐하지 않게 한다.
// 기존 adminFetchJsonCached<T>()는 이 결과에서 data만 꺼내 반환 — 시그니처·동작 불변,
// 다른 어드민 화면은 이 변경을 전혀 감지하지 못한다(하위호환).
export interface AdminCachedFetchResult<T> {
  data: T
  /** true면 이번 호출이 네트워크로 새로 받아온 데이터가 아니다. */
  stale: boolean
  /** stale이 true일 때, 반환된 캐시 항목이 저장된 시각(ms epoch). */
  staleSince: number | null
  /** stale이 true인 이유. "error"=실시간 요청이 실패해 캐시로 대체(진짜 문제).
   *  "revalidate"=TTL은 지났지만 stale-while-revalidate 창 안이라 의도적으로 즉시 서빙
   *  (백그라운드 갱신 진행 중 — 정상 동작, 실패 아님). */
  staleReason?: "error" | "revalidate"
}

async function adminFetchJsonCachedInternal<T>(
  input: string,
  init: RequestInit | undefined,
  options: AdminFetchCacheOptions
): Promise<AdminCachedFetchResult<T>> {
  if (!isGetRequest(init)) {
    const data = await adminFetchJson<T>(input, init)
    return { data, stale: false, staleSince: null }
  }

  const ttlMs = options.ttlMs ?? DEFAULT_ADMIN_CACHE_TTL_MS
  const persist = options.persist ?? true
  const staleIfError = options.staleIfError ?? true

  if (ttlMs <= 0) {
    const data = await adminFetchJson<T>(input, init)
    return { data, stale: false, staleSince: null }
  }

  const cacheKey = getAdminRequestCacheKey(input, init, options.cacheKey)

  const startRequest = (): Promise<AdminCachedFetchResult<T>> => {
    const inflight = inflightRequests.get(cacheKey)
    if (inflight) return inflight as Promise<AdminCachedFetchResult<T>>

    const requestInit: RequestInit | undefined = options.force
      ? { ...init, cache: "no-cache" }
      : init
    const request = adminFetchJson<T>(input, requestInit)
      .then((data): AdminCachedFetchResult<T> => {
        const entry: AdminCacheEntry<T> = {
          data,
          expiresAt: Date.now() + ttlMs,
          savedAt: Date.now(),
        }
        memoryCache.set(cacheKey, entry)
        pruneMemoryCache()
        if (persist) writeSessionCache(cacheKey, entry)
        return { data, stale: false, staleSince: null }
      })
      .catch((error): AdminCachedFetchResult<T> => {
        const stale = staleIfError ? readAdminCache<T>(cacheKey, true) : null
        if (stale) return { data: stale.data, stale: true, staleSince: stale.savedAt, staleReason: "error" }
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
    if (cached) return { data: cached.data, stale: false, staleSince: null }

    const inflight = inflightRequests.get(cacheKey)
    if (inflight) return inflight as Promise<AdminCachedFetchResult<T>>

    const staleWindowMs =
      options.staleWhileRevalidateMs ?? DEFAULT_ADMIN_STALE_WHILE_REVALIDATE_MS
    if (staleWindowMs > 0) {
      const stale = readAdminCache<T>(cacheKey, true)
      if (stale && Date.now() - stale.savedAt <= staleWindowMs) {
        void startRequest().catch(() => undefined)
        return { data: stale.data, stale: true, staleSince: stale.savedAt, staleReason: "revalidate" }
      }
    }
  }

  return startRequest()
}

export async function adminFetchJsonCached<T>(
  input: string,
  init?: RequestInit,
  options: AdminFetchCacheOptions = {}
) {
  const result = await adminFetchJsonCachedInternal<T>(input, init, options)
  return result.data
}

/** adminFetchJsonCached의 옵트인 확장 — 반환값에 stale 메타를 함께 실어준다.
 *  기존 adminFetchJsonCached 소비처는 전혀 변경할 필요가 없다. */
export async function adminFetchJsonCachedWithMeta<T>(
  input: string,
  init?: RequestInit,
  options: AdminFetchCacheOptions = {}
): Promise<AdminCachedFetchResult<T>> {
  return adminFetchJsonCachedInternal<T>(input, init, options)
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
