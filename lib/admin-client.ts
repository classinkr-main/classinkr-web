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

// 정리·무효화 매칭용 고정 접두사. **여기에 배포 토큰을 섞지 않는다** — 프루너·스코프
// 무효화·로그아웃 정리가 전부 이 접두사로 키를 훑으므로, 접두사가 배포마다 바뀌면 이전
// 배포가 남긴 엔트리를 아무도 못 지워 저장소에 영구히 쌓이고 로그아웃해도 남는다.
const ADMIN_REQUEST_CACHE_PREFIX = "admin_request_cache:"
// 배포마다 달라지는 캐시 스키마 토큰 — 읽기 키에만 섞는다(getSessionCacheKey).
//
// 지속 캐시(session/local)에 남은 **이전 배포의 응답 모양**을 새 코드가 읽는 사고를 막는다.
// 실제 사고(2026-09-01): Overview 리드 요약의 필드명이 contactPage* → homepage* 로 바뀌었는데
// /api/admin/leads 스코프는 localStorage에 SWR 10분으로 남는다. 배포 직후 그 캐시를 든 화면이
// 새 필드를 못 찾아 "undefined건"을 그렸고, 마운트 1회 로드 화면이라 그 방문 내내 복구되지 않았다.
// (개별 URL에 ?contract=v3 처럼 손으로 버전을 붙여 온 관례가 있었지만, 붙이는 걸 잊으면 그대로 사고다.)
//
// 이전 배포 엔트리는 고정 접두사에 계속 걸리므로 프루너가 보존창(최대 30분) 안에 스스로 정리한다.
// 로컬 개발은 토큰이 "dev"로 고정돼 기존 동작 그대로다.
const ADMIN_CACHE_BUILD = process.env.NEXT_PUBLIC_ADMIN_CACHE_BUILD || "dev"
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
//
// 확장 감사(2026-09-10, admin-performance-round3 §3.5) — 지사·마케팅·하드웨어·캘린더 4곳이
// sessionStorage까지만이라 브라우저 재시작마다 콜드 스켈레톤을 본다는 지적에 대한 판단.
// **무작정 4곳을 다 넣지 않았다** — 이 배열은 "문자열이 캐시 키에 포함되면 승격"이라는
// 부분일치 규칙이고, 승격 계층(local)은 CRM/leads와 한 풀(ADMIN_LOCAL_CACHE_LIMIT=60,
// LRU by savedAt)을 공유한다. 화면이 자체적으로 team×period처럼 조합형 쿼리 캐시 키를
// 쓰면, 그 조합 수만큼 슬롯을 잠식해 CRM/leads가 먼저 밀려난다(프루너는 스코프를 모르고
// 저장 시각만 본다) — 옛 "SWR 10분을 5분에 자르던" 사고와는 다른 종류지만 같은 계열의
// 용량 사고다. 그래서 화면 단위가 아니라 **엔드포인트 단위**로 판단했다(실제 소비처 코드를
// grep으로 추적):
//  - `/api/admin/hardware`  — 하드웨어 홈 대시보드. 소비처(HardwareInventoryClient.load)가
//    캐시 키를 URL 그대로 쓰고 쿼리 파라미터가 없다 = 슬롯 1개 고정. 콜드 스켈레톤 체감이
//    가장 큰 화면(5,481줄 컴포넌트)이라 이득 대비 비용이 가장 좋다. 단, 기본 GET 응답은
//    movements 최대 2,000행을 그대로 포함한다(app/api/admin/hardware/route.ts 주석 —
//    "기본 페이로드 자체는 줄이지 않았다") — MAX_SESSION_CACHE_CHARS(350KB)를 넘기면
//    writePersistedCache가 조용히 저장을 건너뛴다(기존 가드, 안전하지만 이 스코프 추가의
//    실효를 응답 크기에 의존하게 만든다 — npm run build 금지로 실측 못 했다. 하드웨어 팀이
//    기본 페이로드의 movements를 트림하면 그때 완전히 실현된다).
//  - `calendar:source-health` — 캘린더 연동 상태(app/admin/calendar/page.tsx, 커스텀
//    cacheKey). 응답이 작고 슬롯 1개 고정, "재시작 직후 연동 끊김을 바로 보여준다"는 이득이
//    또렷하다. **캘린더 일정 조회(`buildAdminCalendarUrl` — from/to 쿼리)는 일부러 넣지
//    않았다** — 날짜 구간마다 캐시 키가 달라 조합이 사실상 무한하고, 재시작 후 기본 뷰가
//    "이번 달"로 돌아가면 예전 방문 구간 캐시는 애초에 다시 읽히지도 않아 이득이 없다.
//  - `/api/admin/messaging/status` — round3 §3.2가 지목한 재방문 지연(모듈 메모조차 없어
//    ~1.8초급) 엔드포인트. URL 자체가 캐시 키라 슬롯 1개 고정.
//  - `marketing-intake-today` — "오늘의 유입" 카드(TodayIntakeCard, 커스텀 cacheKey) 슬롯
//    1개 고정. 날짜가 바뀌어도 SWR 백그라운드 갱신이 곧바로 교체하므로 자정 직후 잠깐의
//    stale 표시는 무해하다.
//  - **지사(`/api/admin/branch`)는 통째로 넣지 않았다** — BranchDashboardClient·
//    SalesLedgerWorkbench가 team(4종)×period(3종)×화면(summary/kpi/pipeline/heatmap/hw)으로
//    쿼리 문자열 캐시 키를 만든다. 사용자 한 명이 한 세션에서 팀·기간 토글만 몇 번 눌러도
//    수십 개 슬롯이 생겨 로컬 풀을 지사 혼자 잠식할 수 있다 — 화면 소유(장부/지사 에이전트)가
//    "기본 조합(ALL팀·이번 달)만 고정 키로 캐시"하듯 좁혀야 안전하게 넣을 수 있어 위임 대상.
//  - **마케팅의 나머지 엔드포인트(캠페인별 스코어보드·`compass-ads:${period}` 등)도 넣지
//    않았다** — 캠페인 id·크리에이티브 단위로 캐시 키가 늘어날 수 있어(EventOriginMatrix·
//    CampaignManageClient·LinkPicker), 그 파일 소유 에이전트가 실제 카디널리티 상한을
//    확인해야 안전하게 판단할 수 있다.
//
// 세 함정 장치가 새 스코프에도 자동으로 닿는지 확인했다(코드로 추적, tests/admin/
// admin-client-cache-persistence.test.ts에 고정):
//  1) 프루너(pruneStorageTier)는 스코프를 모르고 ADMIN_REQUEST_CACHE_PREFIX로 시작하는
//     모든 저장 키를 훑어 retentionDeadline(엔트리별 keepUntil)만 본다 — 어떤 URL이 local로
//     승격됐는지와 무관하게 그대로 적용된다.
//  2) 배포 토큰 shape guard(getSessionCacheKey의 ADMIN_CACHE_BUILD)는 지속 계층 선택보다
//     먼저 키에 섞이므로 local이든 session이든 동일하게 적용된다.
//  3) 로그아웃 정리(clearAdminSessionStorage → clearAdminRequestCache(ADMIN_CACHE_SCOPE_ALL))는
//     PERSIST_TIERS 전체(session+local)를 prefix만으로 비운다 — 스코프 목록 자체를 참조하지
//     않아 새 항목을 추가로 등록할 필요가 없다.
// ADMIN_LOCAL_CACHE_LIMIT(60)은 그대로 뒀다 — 이번에 늘린 4개는 전부 조합 없는 고정 키라
// 최악의 경우도 슬롯 +4일 뿐, 기존 CRM/leads 예산을 실질적으로 잠식하지 않는다.
const LOCAL_PERSIST_SCOPES = [
  "/api/admin/crm",
  "/api/admin/leads",
  "/api/admin/hardware",
  "calendar:source-health",
  "/api/admin/messaging/status",
  "marketing-intake-today",
] as const

// 품질 웨이브 4 — 항목 3. 응답이 영원히 오지 않는 요청(네트워크 끊김·서버 행)을 방지하는
// 클라이언트 타임아웃. 대부분의 어드민 요청은 45s면 충분하지만, 외부 동기화·가져오기·
// LLM 평가류는 정상적으로 수십 초~수 분이 걸릴 수 있다 — 그런 경로를 아래 목록으로
// 인식해 타임아웃을 끈다(무제한 대기 = 이 기능 도입 전과 동일한 동작, 오탐으로 인한
// 회귀 없음). 필요하면 호출부에서 `adminTimeoutMs`로 개별 오버라이드할 수도 있다.
const DEFAULT_ADMIN_FETCH_TIMEOUT_MS = 45_000
const ADMIN_TIMEOUT_MESSAGE = "요청이 너무 오래 걸립니다 — 다시 시도해 주세요"

/**
 * 이 클라이언트의 45초 타임아웃으로 끊긴 요청인지 — 서버는 끝까지 처리했을 수 있다. 쓰기 호출부는
 * "다시 시도"를 권하기 전에 결과를 다시 조회해 확인한다(재전송은 하지 않는다 — 중복 기록 위험).
 */
export function isAdminTimeoutError(error: unknown): boolean {
  return error instanceof Error && error.message === ADMIN_TIMEOUT_MESSAGE
}

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
  return `${ADMIN_REQUEST_CACHE_PREFIX}${ADMIN_CACHE_BUILD}:${cacheKey}`
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
 * clearAdminRequestCache(ADMIN_CACHE_SCOPE_ALL)로 전역 클리어를 요청할 때만 쓰는 값.
 *
 * 횡단 인프라 감사(2026-09-10) — 예전 시그니처는 `prefix?: string`라 인자를 깜빡 빠뜨린
 * 호출이 조용히 전역 무효화(GLOBAL_CACHE_SCOPE="*")가 됐다. 실제로 components/admin/crm/
 * Customer360Drawer.tsx에 "감사#1: 인자 없는 clearAdminRequestCache()는 전역 캐시를 날린다"는
 * 주석까지 붙어 호출부가 스스로 조심하고 있었다 — 그 방어를 호출부의 기억력이 아니라 타입
 * 시스템으로 옮긴다. prefix를 필수로 바꾸고, "정말 전역을 지운다"는 의도는 이 상수를 명시
 * 전달해야만 표현되게 한다(다른 문자열과 섞이지 않도록 실제 값은 내부 GLOBAL_CACHE_SCOPE와
 * 동일하게 유지). 실수로 인자를 빠뜨리면 컴파일이 깨진다 — 런타임까지 갈 필요가 없다.
 */
export const ADMIN_CACHE_SCOPE_ALL = GLOBAL_CACHE_SCOPE

/**
 * 어드민 요청 캐시 무효화.
 * - scope === ADMIN_CACHE_SCOPE_ALL: 전역 클리어(로그아웃·전체 리셋 전용 — clearAdminSessionStorage
 *   내부에서만 명시적으로 쓴다. 다른 호출부가 이 상수를 넘기고 있다면 정말 전역을 지울
 *   의도인지 다시 확인할 것).
 * - 그 외 문자열(예: "/api/admin/branch"): 그 prefix가 포함된 캐시 키만 지우고, 같은 스코프의
 *   브라우저 HTTP 캐시 우회(60초)도 그 prefix에만 건다 — branch 새로고침이 다른 어드민
 *   탭 캐시까지 날리지 않게 한다(감사 #13).
 */
export function clearAdminRequestCache(scope: string) {
  const scopes = [scope]
  clearCacheScopes(scopes)
  markAdminMutation(scopes)
}

export function clearAdminSessionStorage() {
  if (typeof window === "undefined") return

  STORAGE_KEYS.forEach((key) => {
    sessionStorage.removeItem(key)
  })

  clearAdminRequestCache(ADMIN_CACHE_SCOPE_ALL)
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
 *
 * generatedAt(T4) — 이 프리페치가 서버에서 실제로 만들어진 시각(ms epoch)을 넘기면 그 값이
 * savedAt이 된다(생략 시 지금까지처럼 Date.now()). staleTimes.dynamic(180초)로 클라이언트
 * 라우터 캐시가 예전 RSC 응답을 재사용할 수 있어, 이 함수가 호출되는 시점과 그 데이터가
 * 실제로 만들어진 시점이 최대 180초 어긋날 수 있다 — generatedAt을 savedAt으로 써야
 * expiresAt/keepUntil이 "언제 실제로 계산됐는가" 기준으로 계산되고, 오래된 시드는
 * (ttlMs는 지났지만 keepUntil 안에 있는) "만료됐지만 SWR 가능" 상태로 정확히 떨어진다 —
 * 소비처는 그 상태를 stale-while-revalidate로 즉시 서빙하면서 백그라운드로 재검증한다
 * (adminFetchJsonCachedInternal 참조). 신선하다고 우기지 않는다.
 *
 * 아래 가드(이미 더 최신 엔트리가 있으면 덮어쓰지 않는다)는 generatedAt이 없던 시절에는
 * 사실상 무의미했다 — savedAt이 매 호출마다 Date.now()였으므로 "기존 엔트리가 이번
 * savedAt보다 같거나 늦다"는 같은 밀리초에 두 번 불릴 때만 우연히 성립했다(동일 컴포넌트가
 * 같은 렌더에서 중복 호출하는 경우의 방어 정도). generatedAt을 넘기는 호출부터는 진짜
 * 의미가 생긴다 — 재사용된 오래된 RSC 시드가, 그 사이 사용자가 새로고침해 이미 받아온
 * 더 최신 네트워크 응답을 덮어쓰는 것을 막는다.
 */
export function seedAdminRequestCache<T>(
  input: string,
  data: T,
  options: {
    cacheKey?: string
    ttlMs?: number
    staleWhileRevalidateMs?: number
    persistTo?: AdminPersistTier
    generatedAt?: number
  } = {}
) {
  const cacheKey = getAdminRequestCacheKey(input, undefined, options.cacheKey)
  const ttlMs = options.ttlMs ?? DEFAULT_ADMIN_CACHE_TTL_MS
  const staleWindowMs = options.staleWhileRevalidateMs ?? DEFAULT_ADMIN_STALE_WHILE_REVALIDATE_MS
  const savedAt = options.generatedAt ?? Date.now()

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

interface WarmQueueEntry extends AdminWarmQueueItem {
  options: AdminFetchCacheOptions
}

// 전역 큐 + 활성 워커 카운터 — 호출 하나가 아니라 프로세스(탭) 전체가 동시성 3을 공유한다.
//
// 횡단 인프라 감사(2026-09-10): 예전 구현은 warmAdminRequestCacheQueued 호출마다 자기만의
// cursor/워커 3개를 새로 띄웠다. 사이드바에서 탭 A를 hover(180ms 디바운스 후 큐 5개 투입) →
// 곧이어 탭 B를 hover하면(A가 아직 다 안 돌았어도) 큐가 또 하나 생겨 워커 3개가 추가로
// 뜬다 — 실제 동시 in-flight 예열 요청이 3이 아니라 호출 횟수 × 3까지 쌓일 수 있었다.
// 주석이 말하는 "같은 틱에 몰아치지 않는다"는 목표가 호출 하나 안에서만 지켜지고 사이드바를
// 훑듯이 여러 탭을 빠르게 hover하는 실제 사용 패턴에서는 지켜지지 않았던 것 — 그 폭주가
// 정작 사용자가 클릭한 탭의 진짜 네비게이션 요청과 대역폭을 다툴 수 있다. 큐와 워커를
// 모듈 전역으로 옮기고, 새 호출은 워커를 새로 띄우지 않고 기존(또는 방금 다 돈) 워커가
// 없을 때만 보충한다 — 여러 번의 warmAdminRequestCacheQueued 호출이 하나의 큐를 나눠 쓰며
// 전체 동시성이 항상 3 이하로 유지된다. 먼저 투입된 항목이 FIFO로 먼저 처리되므로, 먼저
// hover한 탭의 예열이 나중 탭보다 우선순위를 유지한다.
const warmQueue: WarmQueueEntry[] = []
let activeWarmWorkers = 0

function pumpWarmQueue() {
  while (activeWarmWorkers < WARM_QUEUE_CONCURRENCY && warmQueue.length > 0) {
    const entry = warmQueue.shift()
    if (!entry) break
    const { url, cacheKey, options } = entry
    activeWarmWorkers++
    void warmAdminRequestCache(url, cacheKey ? { ...options, cacheKey } : options).finally(() => {
      activeWarmWorkers--
      pumpWarmQueue()
    })
  }
}

/**
 * warmAdminTab(AdminSidebar)·warmSubtab(CrmSubnav)처럼 탭 하나가 URL 여러 개를 한 번에
 * 예열할 때, 동시성을 3으로 제한해 같은 틱에 몰아치지 않게 한다 — 이 제한은 이 호출 하나가
 * 아니라 모듈 전체가 공유한다(warmQueue 주석 참조), 그래야 사이드바를 훑듯 여러 탭을 빠르게
 * hover해도 실제 동시 in-flight 예열 요청이 3을 넘지 않는다. 각 항목은 그대로
 * warmAdminRequestCache로 위임하므로 document.hidden/saveData 스킵·실패 삼킴("Prefetch is
 * an optimization only")은 항목별로 동일하게 적용된다 — 여기서는 순서·동시성만 관리한다.
 * fire-and-forget이라 반환값은 없다(호출부는 await하지 않는다).
 *
 * 중복 예열 가드(클라이언트 캐시 규약 점검, 2026-09-10) — 같은 캐시 키(URL 또는 커스텀
 * cacheKey)가 이미 진행 중(inflightRequests)이거나 큐에 대기 중이면 다시 넣지 않는다.
 * adminFetchJsonCachedInternal의 inflight/캐시 적중 경로가 중복 "네트워크 요청" 자체는
 * 이미 막아 주지만, 큐에 그대로 밀어 넣으면 워커 슬롯(3개뿐)을 하나 잡아먹고 같은 응답을
 * 또 기다리게 된다 — 그동안 정말 새로운 URL의 예열이 그만큼 늦어진다. 사이드바를 훑듯
 * 탭을 오가면 같은 URL이 여러 warm 표(메인 사이드바 + CrmSubnav 등)에 반복 등장하는 실제
 * 패턴이라, 슬롯 낭비가 드문 일이 아니다. 이미 캐시에 신선하게 적중해 있는 URL까지는
 * 걸러내지 않는다 — 그 경로는 이미 거의 공짜(동기 캐시 히트)라 TTL 재계산까지 복제할
 * 이유가 없다.
 */
export function warmAdminRequestCacheQueued(
  items: Array<string | AdminWarmQueueItem>,
  options: AdminFetchCacheOptions = {}
) {
  for (const item of items) {
    const normalized = typeof item === "string" ? { url: item } : item
    const dedupeKey = getAdminRequestCacheKey(normalized.url, undefined, normalized.cacheKey)

    if (inflightRequests.has(dedupeKey)) continue
    const alreadyQueued = warmQueue.some(
      (queued) => getAdminRequestCacheKey(queued.url, undefined, queued.cacheKey) === dedupeKey
    )
    if (alreadyQueued) continue

    warmQueue.push({ ...normalized, options })
  }
  pumpWarmQueue()
}
