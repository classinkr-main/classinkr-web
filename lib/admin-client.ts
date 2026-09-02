"use client"

const STORAGE_KEYS = [
  "admin_password",
  "admin_token",
  "admin_role",
  "admin_name",
  "admin_email",
  "admin_branch",
  "admin_nav_preset",
  "admin_nav_overrides",
] as const

const ADMIN_REQUEST_CACHE_PREFIX = "admin_request_cache:"
const DEFAULT_ADMIN_CACHE_TTL_MS = 45_000
// TTL이 지나도 이 시간 안의 데이터면 즉시 보여주고 백그라운드에서 갱신한다.
// (mutation 시 clearAdminRequestCache로 전체 캐시가 비워지므로 편집 직후 staleness 없음)
const DEFAULT_ADMIN_STALE_WHILE_REVALIDATE_MS = 5 * 60_000
const ADMIN_MEMORY_CACHE_LIMIT = 90
const ADMIN_SESSION_CACHE_LIMIT = 70
// localStorage 계층은 브라우저 재시작을 넘어 살아남으므로 세션 계층보다 작게 잡는다.
const ADMIN_LOCAL_CACHE_LIMIT = 60
const MAX_SESSION_CACHE_CHARS = 350_000
// 엔트리별 보존창의 상한. 호출부가 staleWhileRevalidateMs를 아무리 크게 줘도 캐시가
// 무한히 남지는 않게 한다 — 프루너는 이 상한 안에서 엔트리 자신의 창을 존중한다.
const MAX_CACHE_RETENTION_MS = 30 * 60_000
// localStorage로 승격하는 스코프. CRM 작업면은 탭 전환·브라우저 재시작을 넘어 즉시
// 그려야 해서 여기 둔다. 지속성의 상한은 인증 수명(admin_session 쿠키 7일)이고,
// 로그아웃·인증 실패는 clearAdminSessionStorage → clearAdminRequestCache로 함께 비운다.
const LOCAL_PERSIST_SCOPES = ["/api/admin/crm", "/api/admin/leads"] as const

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
  // 단체 전환 — 서버가 리드당 대여섯 번 DB 왕복을 25건 순차로 돈다. 45초에 클라이언트만
  // abort되면 서버는 계속 전환하는데 화면은 전부 실패로 세는 어긋남이 생긴다.
  "/api/admin/leads/bulk-convert",
  "/api/admin/marketing-campaigns/meta-sync",
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
  /**
   * POST처럼 body가 필요한 읽기 전용 요청이 성공해도 관리자 화면 캐시를 무효화하지 않는다.
   * 실제 쓰기 요청에는 사용하지 않는다.
   */
  adminReadOnly?: boolean
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
  /**
   * 이 엔트리를 언제까지 들고 있어야 하는지(ms epoch). 프루너는 전역 상수가 아니라 이 값을
   * 본다 — 호출부가 요청한 stale-while-revalidate 창이 청소기에 잘리지 않게 하는 유일한
   * 근거다(그 전에는 전역 5분이 10분 요청을 절반에서 잘랐다).
   * 값이 없는 레거시 엔트리(이전 버전이 남긴 sessionStorage 항목)는 기존 동작 그대로
   * savedAt + DEFAULT_ADMIN_STALE_WHILE_REVALIDATE_MS로 취급한다.
   */
  keepUntil?: number
}

type AdminPersistTier = "session" | "local"

/** 엔트리를 언제까지 보관해야 하는가 — 레거시 엔트리는 기존 전역 창으로 폴백. */
function retentionDeadline(entry: Pick<AdminCacheEntry<unknown>, "savedAt" | "keepUntil">) {
  return entry.keepUntil ?? entry.savedAt + DEFAULT_ADMIN_STALE_WHILE_REVALIDATE_MS
}

function computeKeepUntil(savedAt: number, ttlMs: number, staleWindowMs: number) {
  const window = Math.max(ttlMs, staleWindowMs, DEFAULT_ADMIN_STALE_WHILE_REVALIDATE_MS)
  return savedAt + Math.min(window, MAX_CACHE_RETENTION_MS)
}

/** 지속 계층 결정 — 명시 옵션 우선, 없으면 URL 스코프. */
function resolvePersistTier(cacheKey: string, explicit?: AdminPersistTier): AdminPersistTier {
  if (explicit) return explicit
  return LOCAL_PERSIST_SCOPES.some((scope) => cacheKey.includes(scope)) ? "local" : "session"
}

/** 브라우저 밖(SSR)에서는 null. 두 계층을 같은 코드로 다루기 위한 접근자. */
function storageFor(tier: AdminPersistTier): Storage | null {
  if (typeof window === "undefined") return null
  try {
    return tier === "local" ? window.localStorage : window.sessionStorage
  } catch {
    // 사파리 프라이빗 모드 등 저장소 접근 자체가 던지는 환경 — 메모리 캐시만으로 동작한다.
    return null
  }
}

const PERSIST_TIERS: Array<{ tier: AdminPersistTier; limit: number }> = [
  { tier: "session", limit: ADMIN_SESSION_CACHE_LIMIT },
  { tier: "local", limit: ADMIN_LOCAL_CACHE_LIMIT },
]

interface AdminFetchCacheOptions<T = unknown> {
  cacheKey?: string
  ttlMs?: number
  persist?: boolean
  /**
   * 지속 계층을 명시한다. 생략하면 URL 스코프로 결정한다
   * (LOCAL_PERSIST_SCOPES → "local", 그 외 → "session").
   */
  persistTo?: AdminPersistTier
  force?: boolean
  staleIfError?: boolean
  /**
   * TTL이 지난 캐시라도 이 시간(ms) 안에 저장된 것이면 즉시 반환하고
   * 백그라운드에서 갱신한다. 재방문 시 로딩 스피너 대신 직전 데이터를 보여준다.
   * 기본 5분. 0을 주면 비활성화.
   */
  staleWhileRevalidateMs?: number
  /**
   * stale-while-revalidate 고속 경로(TTL 만료 + SWR 창 안)로 오래된 캐시를 즉시 돌려준
   * 회차에서, 뒤이은 백그라운드 갱신이 끝나면 그 결과를 알려준다.
   * 마운트 시 1회만 로드하는 화면은 이 콜백 없이는 갱신 결과를 영영 못 받는다
   * (effect가 다시 돌지 않으므로 최대 `ttlMs + staleWhileRevalidateMs`만큼 stale).
   * - 성공: `{ data }` — 새로 받은 데이터.
   * - 실패: `{ error }` — 화면은 기존 stale 데이터를 그대로 들고 있다.
   * 호출 규약: 한 회차당 최대 1회. SWR 고속 경로를 타지 않은 회차(신선한 캐시 적중·
   * force·네트워크 직행)에는 호출하지 않는다 — 그때는 반환값 자체가 최신이다.
   * 갱신이 도는 사이 이 캐시 키가 무효화됐다면(= 뮤테이션 발생) 호출하지 않는다.
   */
  onRevalidated?: (result: { data?: T; error?: unknown }) => void
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

// 어떤 요청이 시작된 뒤 이 캐시 키가 무효화됐는지 되짚는다. 소비처는 둘 — 콜백 통지
// (notifyRevalidation)와 응답 성공 시의 캐시 쓰기(startRequest) 양쪽을 같은 술어로 가드한다.
// 콜백만 막으면 절반이다: 화면에는 안 보여줘도 memoryCache/sessionStorage에는 뮤테이션 이전
// 응답이 그대로 들어앉아, 다음 읽기가 방금 저장한 내용을 되돌린 상태로 시작한다.
// 캐시 엔트리 자체로는 못 되짚는다 — 갱신이 성공하면 같은 키를 다시 채워 넣기 때문이다.
// 대신 mutationScopeAt을 본다: clearCacheScopes(캐시 삭제)는 두 호출부(clearAdminRequestCache,
// adminFetch의 비-GET 성공 처리) 모두에서 markAdminMutation과 짝으로만 실행되므로
// 무효화 이력의 충실한 사본이다. 스코프 매칭도 clearCacheScopes와 같은 술어(key.includes)를 쓴다.
// 한계: mutationScopeAt 항목은 60초(BROWSER_CACHE_BYPASS_MS)가 지나면 정리될 수 있다.
// 어드민 GET은 기본 45초에 타임아웃되므로 실제 갱신 구간은 그 창 안이지만,
// 타임아웃이 꺼진 장기 경로(LONG_RUNNING_ADMIN_PATHS)라면 60초 이전의 무효화는 놓칠 수 있다.
function wasCacheKeyInvalidatedSince(cacheKey: string, since: number) {
  for (const [scope, at] of mutationScopeAt) {
    // 같은 ms에 찍힌 무효화는 무효화 쪽으로 센다 — 순서를 가릴 수 없을 때는
    // "갱신 결과를 한 번 버리는" 쪽이 "저장한 내용을 되돌리는" 쪽보다 안전하다.
    if (at < since) continue
    if (scope === GLOBAL_CACHE_SCOPE || cacheKey.includes(scope)) return true
  }
  return false
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
  for (const { tier } of PERSIST_TIERS) {
    const storage = storageFor(tier)
    if (!storage) continue
    for (const key of Object.keys(storage)) {
      if (key.startsWith(ADMIN_REQUEST_CACHE_PREFIX) && matches(key)) {
        storage.removeItem(key)
      }
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
  for (const [key, entry] of memoryCache) {
    if (retentionDeadline(entry) <= now) {
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

function pruneStorageTier(tier: AdminPersistTier, limit: number, now: number) {
  const storage = storageFor(tier)
  if (!storage) return

  const entries: Array<{ key: string; savedAt: number }> = []

  for (const key of Object.keys(storage)) {
    if (!key.startsWith(ADMIN_REQUEST_CACHE_PREFIX)) continue

    try {
      const entry = JSON.parse(storage.getItem(key) ?? "null") as AdminCacheEntry<unknown> | null
      if (!entry || typeof entry.savedAt !== "number") {
        storage.removeItem(key)
        continue
      }

      // 전역 5분이 아니라 엔트리가 요청한 창까지 살려 둔다.
      if (retentionDeadline(entry) <= now) {
        storage.removeItem(key)
        continue
      }

      entries.push({ key, savedAt: entry.savedAt })
    } catch {
      storage.removeItem(key)
    }
  }

  if (entries.length <= limit) return

  entries
    .sort((a, b) => a.savedAt - b.savedAt)
    .slice(0, entries.length - limit)
    .forEach((entry) => storage.removeItem(entry.key))
}

function pruneSessionCache(now = Date.now()) {
  for (const { tier, limit } of PERSIST_TIERS) pruneStorageTier(tier, limit, now)
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

function readStorageTier<T>(
  tier: AdminPersistTier,
  cacheKey: string,
  allowExpired: boolean
): AdminCacheEntry<T> | null {
  const storage = storageFor(tier)
  if (!storage) return null

  try {
    const raw = storage.getItem(getSessionCacheKey(cacheKey))
    if (!raw) return null

    const entry = JSON.parse(raw) as AdminCacheEntry<T>
    if (!entry || typeof entry.expiresAt !== "number") return null
    if (!allowExpired && entry.expiresAt <= Date.now()) return null

    return entry
  } catch {
    storage.removeItem(getSessionCacheKey(cacheKey))
    return null
  }
}

/**
 * 두 지속 계층을 모두 본다. 스코프 정책이 바뀌어도(예: 어떤 URL이 session → local로 옮겨가도)
 * 이전 계층에 남은 엔트리를 버리지 않고 이어 쓰기 위해서다. 둘 다 있으면 최신 것을 택한다.
 */
function readPersistedCache<T>(cacheKey: string, allowExpired = false): AdminCacheEntry<T> | null {
  let best: AdminCacheEntry<T> | null = null
  for (const { tier } of PERSIST_TIERS) {
    const entry = readStorageTier<T>(tier, cacheKey, allowExpired)
    if (entry && (!best || entry.savedAt > best.savedAt)) best = entry
  }
  return best
}

function writePersistedCache(
  cacheKey: string,
  entry: AdminCacheEntry<unknown>,
  tier: AdminPersistTier
) {
  const storage = storageFor(tier)
  if (!storage) return

  const storageKey = getSessionCacheKey(cacheKey)

  // 계층이 바뀐 키는 반대편에 남은 옛 사본을 지운다 — readPersistedCache가 둘 다 보므로,
  // 방치하면 오래된 쪽이 최신 쪽을 이길 일은 없어도 저장소 예산만 갉아먹는다.
  for (const { tier: other } of PERSIST_TIERS) {
    if (other === tier) continue
    storageFor(other)?.removeItem(storageKey)
  }

  try {
    const serialized = JSON.stringify(entry)

    if (serialized.length > MAX_SESSION_CACHE_CHARS) {
      storage.removeItem(storageKey)
      return
    }

    storage.setItem(storageKey, serialized)
    scheduleAdminCachePrune()
  } catch {
    storage.removeItem(storageKey)
  }
}

function readAdminCache<T>(cacheKey: string, allowExpired = false): AdminCacheEntry<T> | null {
  pruneMemoryCache()

  const memoryEntry = memoryCache.get(cacheKey) as AdminCacheEntry<T> | undefined
  if (memoryEntry && (allowExpired || memoryEntry.expiresAt > Date.now())) {
    return memoryEntry
  }

  const persistedEntry = readPersistedCache<T>(cacheKey, allowExpired)
  if (persistedEntry && (!memoryEntry || persistedEntry.savedAt >= memoryEntry.savedAt)) {
    memoryCache.set(cacheKey, persistedEntry)
    return persistedEntry
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

    if (response.ok && method !== "GET" && !init?.adminReadOnly) {
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

/**
 * 서버(RSC)가 이미 만들어 내려보낸 응답을 클라이언트 캐시에 그대로 심는다.
 * 첫 화면은 prop으로 그리고, **같은 화면을 떠났다 돌아왔을 때**도 네트워크 없이 즉시
 * 그려지게 하는 것이 목적이다(prop은 그 회차 렌더에만 존재한다).
 *
 * 네트워크 응답과 동일한 규약을 따른다 — 같은 cacheKey, 같은 TTL/보존창 계산, 같은 계층 선택.
 * 이미 더 최신 엔트리가 있으면(사용자가 새로고침을 눌러 방금 받아온 경우) 덮어쓰지 않는다.
 */
export function seedAdminRequestCache<T>(
  input: string,
  data: T,
  options: { cacheKey?: string; ttlMs?: number; staleWhileRevalidateMs?: number; persistTo?: AdminPersistTier } = {}
) {
  const cacheKey = getAdminRequestCacheKey(input, undefined, options.cacheKey)
  const ttlMs = options.ttlMs ?? DEFAULT_ADMIN_CACHE_TTL_MS
  const staleWindowMs = options.staleWhileRevalidateMs ?? DEFAULT_ADMIN_STALE_WHILE_REVALIDATE_MS
  const savedAt = Date.now()

  const existing = readAdminCache<T>(cacheKey, true)
  if (existing && existing.savedAt >= savedAt) return

  const entry: AdminCacheEntry<T> = {
    data,
    expiresAt: savedAt + ttlMs,
    savedAt,
    keepUntil: computeKeepUntil(savedAt, ttlMs, staleWindowMs),
  }
  memoryCache.set(cacheKey, entry)
  writePersistedCache(cacheKey, entry, resolvePersistTier(cacheKey, options.persistTo))
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
  /** staleReason이 "error"일 때 캐시로 대체하게 만든 원인 오류. 표시용이 아니라
   *  onRevalidated로 실패 원인을 전달하기 위한 통로다(기존 소비처는 읽지 않는다). */
  staleError?: unknown
}

// SWR 고속 경로가 띄운 백그라운드 갱신의 결말을 소비처에 알린다.
// 콜백이 없으면 기존과 동일하게 결과·예외를 모두 삼킨다(unhandled rejection 방지).
function notifyRevalidation<T>(
  revalidation: Promise<AdminCachedFetchResult<T>>,
  cacheKey: string,
  onRevalidated: ((result: { data?: T; error?: unknown }) => void) | undefined
) {
  if (!onRevalidated) {
    void revalidation.catch(() => undefined)
    return
  }

  const startedAt = Date.now()
  const notify = (result: { data?: T; error?: unknown }) => {
    // 갱신이 도는 사이 이 키가 무효화됐다면 결과를 버린다. 서버가 뮤테이션 이전 상태를
    // 응답했을 수 있고, 그대로 반영하면 방금 저장한 내용을 화면에서 되돌리게 된다.
    if (wasCacheKeyInvalidatedSince(cacheKey, startedAt)) return
    try {
      onRevalidated(result)
    } catch {
      /* 소비처 콜백의 예외가 백그라운드 갱신을 unhandled rejection으로 만들지 않게 한다 */
    }
  }

  void revalidation.then(
    (result) => {
      // staleIfError 폴백으로 살아 돌아온 회차는 새 데이터가 아니라 갱신 실패다.
      if (result.staleReason === "error") {
        notify({ error: result.staleError ?? new Error("최신 데이터를 받지 못했습니다.") })
        return
      }
      notify({ data: result.data })
    },
    (error) => notify({ error })
  )
}

async function adminFetchJsonCachedInternal<T>(
  input: string,
  init: AdminFetchInit | undefined,
  options: AdminFetchCacheOptions<T>
): Promise<AdminCachedFetchResult<T>> {
  if (!isGetRequest(init)) {
    const data = await adminFetchJson<T>(input, init)
    return { data, stale: false, staleSince: null }
  }

  const ttlMs = options.ttlMs ?? DEFAULT_ADMIN_CACHE_TTL_MS
  const persist = options.persist ?? true
  const staleIfError = options.staleIfError ?? true
  // 아래 SWR 고속 경로와 엔트리 보존창(keepUntil)이 같은 값을 봐야 한다 —
  // "즉시 서빙하기로 한 창"과 "그때까지 안 지우는 창"이 어긋나면 A-1 버그가 재발한다.
  const staleWindowMs =
    options.staleWhileRevalidateMs ?? DEFAULT_ADMIN_STALE_WHILE_REVALIDATE_MS

  if (ttlMs <= 0) {
    const data = await adminFetchJson<T>(input, init)
    return { data, stale: false, staleSince: null }
  }

  const cacheKey = getAdminRequestCacheKey(input, init, options.cacheKey)

  const startRequest = (): Promise<AdminCachedFetchResult<T>> => {
    const inflight = inflightRequests.get(cacheKey)
    if (inflight) return inflight as Promise<AdminCachedFetchResult<T>>

    const requestInit: AdminFetchInit | undefined = options.force
      ? { ...init, cache: "no-cache" }
      : init
    // 캐시 쓰기 가드의 기준 시각 — fetch를 띄우기 직전에 잡는다. 이 시각 **이후**의 무효화
    // (뮤테이션)는 "이 응답은 이미 낡았다"는 뜻이므로 캐시에 되쓰지 않는다.
    // 포그라운드 최초 요청(뮤테이션 → 즉시 재조회 포함)은 무효화가 끝난 뒤에 시작되므로
    // requestStartedAt > 무효화 시각이 되어 가드에 걸리지 않는다 — 새 데이터를 캐시하는
    // 정상 흐름은 그대로다. 걸리는 건 요청이 도는 **사이**에 무효화가 끼어든 회차뿐이고,
    // 그건 사실상 SWR 백그라운드 갱신 경로다.
    // 대가: 무효화와 요청 시작이 같은 ms에 겹치면(예: clearBranchRequestCache 직후 바로
    // 나가는 새로고침 요청) 술어가 "무효화됨"으로 세어 이 응답을 캐시하지 않는다 —
    // 데이터는 그대로 반환되고 다음 읽기가 한 번 더 네트워크를 탈 뿐이라, 저장한 내용을
    // 되돌릴 위험보다 이쪽을 택한다(wasCacheKeyInvalidatedSince 주석의 같은 정책).
    const requestStartedAt = Date.now()
    const request = adminFetchJson<T>(input, requestInit)
      .then((data): AdminCachedFetchResult<T> => {
        if (!wasCacheKeyInvalidatedSince(cacheKey, requestStartedAt)) {
          const savedAt = Date.now()
          const entry: AdminCacheEntry<T> = {
            data,
            expiresAt: savedAt + ttlMs,
            savedAt,
            keepUntil: computeKeepUntil(savedAt, ttlMs, staleWindowMs),
          }
          memoryCache.set(cacheKey, entry)
          pruneMemoryCache()
          if (persist) {
            writePersistedCache(cacheKey, entry, resolvePersistTier(cacheKey, options.persistTo))
          }
        }
        return { data, stale: false, staleSince: null }
      })
      .catch((error): AdminCachedFetchResult<T> => {
        const stale = staleIfError ? readAdminCache<T>(cacheKey, true) : null
        if (stale) {
          return {
            data: stale.data,
            stale: true,
            staleSince: stale.savedAt,
            staleReason: "error",
            // undefined여도 키가 생기면(항상 열거형) 콜백을 쓰지 않는 소비처의 결과
            // 직렬화 형태가 바뀐다 — 값이 있을 때만 실어 기본 shape을 유지한다.
            ...(error === undefined ? {} : { staleError: error }),
          }
        }
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

    if (staleWindowMs > 0) {
      const stale = readAdminCache<T>(cacheKey, true)
      if (stale && Date.now() - stale.savedAt <= staleWindowMs) {
        notifyRevalidation(startRequest(), cacheKey, options.onRevalidated)
        return { data: stale.data, stale: true, staleSince: stale.savedAt, staleReason: "revalidate" }
      }
    }
  }

  return startRequest()
}

export async function adminFetchJsonCached<T>(
  input: string,
  init?: AdminFetchInit,
  options: AdminFetchCacheOptions<T> = {}
) {
  const result = await adminFetchJsonCachedInternal<T>(input, init, options)
  return result.data
}

/** adminFetchJsonCached의 옵트인 확장 — 반환값에 stale 메타를 함께 실어준다.
 *  기존 adminFetchJsonCached 소비처는 전혀 변경할 필요가 없다. */
export async function adminFetchJsonCachedWithMeta<T>(
  input: string,
  init?: AdminFetchInit,
  options: AdminFetchCacheOptions<T> = {}
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

/** warmAdminRequestCacheQueued 항목 — URL만 주면 캐시 키도 URL(기본 규약)이지만, 소비 측이
 *  adminFetchJsonCached에 커스텀 cacheKey를 넘기는 URL(예: 캠페인 요약의 marketing/perf·insights)은
 *  같은 cacheKey를 함께 줘야 예열이 소비 측이 읽는 캐시 슬롯과 맞는다. */
export interface AdminWarmQueueItem {
  url: string
  cacheKey?: string
}

const WARM_QUEUE_CONCURRENCY = 3

/**
 * warmAdminTab(AdminSidebar)·warmSubtab(CrmSubnav)처럼 탭 하나가 URL 여러 개를 한 번에
 * 예열할 때, 동시성을 3으로 제한해 같은 틱에 몰아치지 않게 한다. 각 항목은 그대로
 * warmAdminRequestCache로 위임하므로 document.hidden/saveData 스킵·실패 삼킴("Prefetch is
 * an optimization only")은 항목별로 동일하게 적용된다 — 여기서는 순서·동시성만 관리한다.
 * fire-and-forget이라 반환값은 없다(호출부는 await하지 않는다).
 */
export function warmAdminRequestCacheQueued(
  items: Array<string | AdminWarmQueueItem>,
  options: AdminFetchCacheOptions = {}
) {
  const queue = items.map((item) => (typeof item === "string" ? { url: item } : item))
  let cursor = 0

  const runNext = async (): Promise<void> => {
    const index = cursor++
    if (index >= queue.length) return
    const { url, cacheKey } = queue[index]
    await warmAdminRequestCache(url, cacheKey ? { ...options, cacheKey } : options)
    return runNext()
  }

  const workerCount = Math.min(WARM_QUEUE_CONCURRENCY, queue.length)
  for (let i = 0; i < workerCount; i++) void runNext()
}
