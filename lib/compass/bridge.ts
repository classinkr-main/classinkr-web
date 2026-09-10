// Compass 브리지 — 마케팅팀 앱(mkt.classin.co.kr)의 crm 스키마를 읽는 유일한 계층.
// 원천은 supabase/migrations/20260828_compass_bridge_views.sql의 읽기 전용 뷰 7장.
//
// 계약:
//  * 읽기 전용 — 이 모듈은 어떤 쓰기도 하지 않는다. Compass 데이터의 쓰기 소유권은 Compass에 있다.
//  * 서버 전용 — service_role 클라이언트만 뷰에 접근 가능(anon/authenticated는 DB에서 차단됨).
//  * fail loud — Compass 쪽 컬럼 rename 시 뷰가 깨진다. 소비 화면은 isCompassBridgeDown()로
//    연결 상태를 감지해 "Compass 연결 끊김" 배지로 강등한다(무음 오염 금지).
//  * 뷰는 수동 타입 — database.types.ts 재생성에 의존하지 않는다(공유 파일 충돌 회피).
//  * 짧은 서버 메모이제이션 — 같은 인자로 반복되는 조회는 TTL 동안(기본 60초, down/에러는
//    10초) 원격 조회를 재사용한다. compass_leads_v.phone_key는 뷰 안의 정규식 계산 컬럼이라
//    .in("phone_key", keys) 조회가 호출마다 crm.leads 전체를 스캔한다 — 여기서 할 수 있는
//    것은 반복 호출을 접는 것뿐이다(생성 컬럼+인덱스는 Compass 쪽 별도 트랙).
import "server-only"

import { createHash } from "node:crypto"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"

export { normalizePhoneKey, compassLeadUrl } from "@/lib/compass/normalize"

export interface CompassLeadRow {
  id: number
  academy: string | null
  name: string | null
  phone_key: string | null
  email_key: string | null
  stage: string | null
  lost_reason: string | null
  owner: string | null
  caller: string | null
  team: string | null
  channel: string | null
  platform: string | null
  meta_ad_id: string | null
  campaign_id: number | null
  source_tab: string | null
  subject: string | null
  region: string | null
  created_at: string
  updated_at: string | null
  last_inflow_at: string | null
  callback_at: string | null
  demo_at: string | null
  account_at: string | null
  neocrm_registered_at: string | null
  care_stage: string | null
  care_track: string | null
  next_action_at: string | null
  next_action: string | null
  bd_owner: string | null
  bd_prob: number | null
  bd_contact_at: string | null
  bd_paid_at: string | null
  paid_amount: number | null
  paid_month: string | null
}

export interface CompassActivityRow {
  id: number
  lead_id: number
  kind: string | null
  body: string | null
  from_stage: string | null
  to_stage: string | null
  actor: string | null
  created_at: string
}

export interface CompassAdDailyRow {
  day: string
  ad_id: string
  ad_name: string | null
  adset_id: string | null
  adset_name: string | null
  campaign_id: string | null
  campaign_name: string | null
  category: string | null
  creative_thumb: string | null
  creative_image: string | null
  creative_title: string | null
  creative_body: string | null
  spend_usd: number | null
  leads: number | null
  clicks: number | null
  impressions: number | null
  synced_at: string | null
}

export interface CompassAdsetDailyRow {
  day: string
  adset_id: string
  adset_name: string | null
  campaign_id: string | null
  campaign_name: string | null
  spend_usd: number | null
  leads: number | null
  clicks: number | null
  impressions: number | null
  synced_at: string | null
}

export interface CompassDemoRow {
  id: number
  lead_id: number | null
  day: string | null
  kind: string | null
  status: string | null
  owner: string | null
  source: string | null
  memo: string | null
  day_approx: boolean | null
  bd: boolean | null
  created_at: string
}

export interface CompassCalEventRow {
  key: string
  day: string | null
  time: string | null
  title: string | null
  owners: string[] | null
  lead_id: number | null
  link: string | null
  synced_at: string | null
}

export interface CompassRevenueRow {
  id: number
  month: string | null
  week: number | null
  customer: string | null
  person: string | null
  status: string | null
  product: string | null
  amount: number | null
  team: string | null
  is_mkt: boolean | null
  synced_at: string | null
}

/** 브리지 조회 공통 결과 — down=true면 뷰가 깨졌거나 접근 불가(소비 화면은 배지로 강등). */
export interface CompassResult<T> {
  rows: T[]
  down: boolean
  error?: string
}

function ok<T>(rows: T[]): CompassResult<T> {
  return { rows, down: false }
}

function downResult<T>(error: unknown): CompassResult<T> {
  // Supabase 오류는 Error 인스턴스가 아니라 {message, code, ...} 평문 객체다 — String()이면 [object Object].
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? String((error as { message?: unknown }).message)
        : String(error)
  console.error("[compass-bridge] query failed:", message)
  return { rows: [], down: true, error: message }
}

// ---------------------------------------------------------------------------
// 짧은 서버 메모이제이션 — 모듈 스코프 Map 하나를 이 파일의 모든 조회 함수가 공유한다.
// unstable_cache는 쓰지 않는다: 브리지 결과에 down 플래그가 있어 실패 결과를 (Next의 기본
// 재검증 주기만큼) 오래 캐시하면 안 되고, 인자 배열(수백 개 phone_key 등)을 캐시 키로 매번
// 직렬화하는 비용도 피하고 싶다. 대신 여기서는:
//  * 키(문자열) → {promise, expiresAt} 만 들고, 진행 중 promise를 그대로 공유해 동시 호출을
//    한 번의 원격 조회로 접는다(요청이 몰릴 때 특히 유효).
//  * 결과가 정해지고 나서야 TTL을 확정한다 — down/에러면 짧게(10초), 정상이면 길게(60초)
//    잡아 브리지 복구가 빨리 반영되게 한다.
//  * fn() 자체가 reject하면(진짜 예외) 캐시하지 않고 항목을 지운다 — 다음 호출이 새로 시도한다.
//    (아래 각 export 함수는 이 memoize를 try로 감싸 브리지의 "절대 throw하지 않는다" 계약을
//    그대로 유지한다 — reject는 내부 캐시 판단에만 쓰이고 호출부까지는 항상 downResult로 나간다.)
//  * 캐시 원본은 절대 그대로 반환하지 않는다 — 호출부가 반환된 배열을 mutate해도 캐시나 다른
//    호출부가 오염되지 않도록 매 반환마다 얕은 복사(copy)를 새로 체이닝한다.
// ---------------------------------------------------------------------------

interface MemoEntry<T> {
  promise: Promise<T>
  expiresAt: number
}

interface MemoizeOptions<T> {
  /** 정상 결과 TTL(ms). */
  ttlMs: number
  /** down/에러 결과에 대신 쓸 짧은 TTL(ms). 생략하면 ttlMs를 그대로 쓴다. */
  downTtlMs?: number
  /** 결과가 "다운" 상태인지 판정 — true면 downTtlMs를 적용한다. */
  isDown?: (value: T) => boolean
  /** 캐시 원본을 밖으로 그대로 내보내지 않도록 매 반환 전 얕은 복사(배열은 slice, 객체는 spread). */
  copy: (value: T) => T
}

/** 엔트리 상한 — 초과하면(예: phone_key 배치 조합이 다양해 키가 폭증) 전체를 비운다.
 *  LRU 등 정교한 축출 대신 "가끔 캐시가 통째로 비는" 단순한 안전판을 택했다 — 60초 TTL
 *  자체가 짧아 전체 clear의 비용(다음 호출들의 캐시 미스)이 크지 않다. */
const MEMO_MAX_ENTRIES = 200
const memoStore = new Map<string, MemoEntry<unknown>>()

function memoize<T>(key: string, fn: () => Promise<T>, options: MemoizeOptions<T>): Promise<T> {
  const now = Date.now()
  const existing = memoStore.get(key) as MemoEntry<T> | undefined
  if (existing && existing.expiresAt > now) {
    return existing.promise.then(options.copy)
  }

  // fn()의 .then 콜백은 절대 동기 실행되지 않는다(Promise 스펙상 항상 마이크로태스크로
  // 미뤄진다) — 그래서 아래 콜백 안에서 entry를 참조해도(자기 자신을 가리키는 클로저) 이
  // const 초기화가 끝난 뒤에야 실제로 읽힌다.
  const entry: MemoEntry<T> = {
    // 진행 중에는 Infinity로 두어 "항상 신선"하게 취급한다 — 그 사이 들어오는 동시 호출이
    // 전부 이 promise를 공유하게 한다(원격 조회는 한 번만 나간다).
    expiresAt: Infinity,
    promise: fn().then(
      (value) => {
        const down = options.isDown?.(value) ?? false
        entry.expiresAt = Date.now() + (down ? (options.downTtlMs ?? options.ttlMs) : options.ttlMs)
        return value
      },
      (error: unknown) => {
        // 예외는 캐시하지 않는다 — 이 항목이 그 사이 다른 시도로 덮이지 않았을 때만 지운다.
        if (memoStore.get(key) === entry) memoStore.delete(key)
        throw error
      },
    ),
  }
  memoStore.set(key, entry as MemoEntry<unknown>)
  if (memoStore.size > MEMO_MAX_ENTRIES) memoStore.clear()
  return entry.promise.then(options.copy)
}

/** 테스트 전용 — 모듈 스코프 메모 캐시를 비운다. 케이스 간 TTL/공유 promise 오염을 막는다. */
export function __resetCompassBridgeMemoForTests(): void {
  memoStore.clear()
}

/** CompassResult<T> 공통 얕은 복사 — rows는 slice, 나머지 필드는 spread.
 *  행 객체 자체는 깊은 복사하지 않는다 — 브리지는 읽기 전용이고 호출부 관례도 행을 읽기만
 *  하므로, 배열/최상위 객체 교체(push·splice·필드 재할당)만 서로 격리하면 충분하다. */
function copyCompassResult<T>(result: CompassResult<T>): CompassResult<T> {
  return { ...result, rows: result.rows.slice() }
}

function isCompassResultDown<T>(result: CompassResult<T>): boolean {
  return result.down === true
}

/** 캐시 키가 길어지면(대량 phone_key/lead_id 배치) sha1로 접어 Map 키 크기를 줄인다.
 *  충돌 내성이 필요한 보안 용도가 아니라 단순 조회 키라 sha1로 충분하다. */
const LONG_KEY_JOIN_THRESHOLD = 200
function foldLongKey(joined: string): string {
  if (joined.length <= LONG_KEY_JOIN_THRESHOLD) return joined
  return `h:${createHash("sha1").update(joined).digest("hex")}`
}

/** ISO 타임스탬프를 분 단위("YYYY-MM-DDTHH:MM")까지만 남긴다. 형식이 어긋나면 원본을
 *  그대로 쓴다(캐시 적중률만 떨어질 뿐 정확성에는 영향 없음) — getCompassLeadsByInflowRange
 *  전용 키 도우미. */
function truncateIsoToMinute(iso: string): string {
  const match = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.exec(iso)
  return match ? match[0] : iso
}

const TTL_MS = 60_000
const TTL_DOWN_MS = 10_000

/** phone_key 배치 조회 — 리드 보드 칩 오버레이·등록 중복 경고용. 키는 normalizePhoneKey 산출값.
 *  60초 메모(down은 10초) — 키를 정렬·중복 제거해 조인한 문자열로 키를 만들어 순서 무관하게 캐시를 탄다. */
export async function getCompassLeadsByPhoneKeys(
  phoneKeys: string[],
): Promise<CompassResult<CompassLeadRow>> {
  const keys = [...new Set(phoneKeys.filter(Boolean))].sort()
  if (keys.length === 0) return ok([])
  const cacheKey = `leads:phone:${foldLongKey(keys.join(","))}`
  try {
    return await memoize(
      cacheKey,
      async () => {
        const sb = createSupabaseAdminClient()
        const { data, error } = await sb
          .from("compass_leads_v")
          .select("*")
          .in("phone_key", keys)
        if (error) return downResult(error)
        return ok((data ?? []) as CompassLeadRow[])
      },
      { ttlMs: TTL_MS, downTtlMs: TTL_DOWN_MS, isDown: isCompassResultDown, copy: copyCompassResult },
    )
  } catch (error) {
    return downResult(error)
  }
}

/** 기간 내 리드 — 라이브 인테이크 피드·재유입 카운트용(last_inflow_at 기준).
 *  60초 메모(down은 10초). toIso는 호출부(app/api/admin/marketing/intake-today)가 매 요청
 *  "지금"으로 새로 만드는 값이라 초·밀리초까지 캐시 키에 넣으면 사실상 항상 미스한다 —
 *  그래서 캐시 키만 fromIso/toIso를 분 단위로 잘라 만들고, 실제 쿼리는 원래 정밀도 그대로
 *  보낸다. 같은 분 안의 재호출·동시 요청은 캐시를 타고, 분 경계를 넘으면 자연히 새로
 *  조회된다(그 호출부는 이미 20초짜리 자체 라우트 메모도 갖고 있어 이중 안전판이 된다). */
export async function getCompassLeadsByInflowRange(
  fromIso: string,
  toIso?: string,
): Promise<CompassResult<CompassLeadRow>> {
  const cacheKey = `leads:inflow:${truncateIsoToMinute(fromIso)}:${toIso ? truncateIsoToMinute(toIso) : ""}`
  try {
    return await memoize(
      cacheKey,
      async () => {
        const sb = createSupabaseAdminClient()
        let query = sb
          .from("compass_leads_v")
          .select("*")
          .gte("last_inflow_at", fromIso)
          .order("last_inflow_at", { ascending: false })
          .limit(500)
        if (toIso) query = query.lte("last_inflow_at", toIso)
        const { data, error } = await query
        if (error) return downResult(error)
        return ok((data ?? []) as CompassLeadRow[])
      },
      { ttlMs: TTL_MS, downTtlMs: TTL_DOWN_MS, isDown: isCompassResultDown, copy: copyCompassResult },
    )
  } catch (error) {
    return downResult(error)
  }
}

/** 리드별 활동 타임라인 — 고객 360 병합용. body는 서버 전용으로만 다룰 것.
 *  60초 메모(down은 10초) — lead_id 집합(정렬·중복 제거)+limitPerFetch로 키를 만든다. */
export async function getCompassActivitiesByLeadIds(
  leadIds: number[],
  limitPerFetch = 300,
): Promise<CompassResult<CompassActivityRow>> {
  const ids = [...new Set(leadIds)].filter((id) => Number.isInteger(id)).sort((a, b) => a - b)
  if (ids.length === 0) return ok([])
  const cacheKey = `activities:${limitPerFetch}:${foldLongKey(ids.join(","))}`
  try {
    return await memoize(
      cacheKey,
      async () => {
        const sb = createSupabaseAdminClient()
        const { data, error } = await sb
          .from("compass_activities_v")
          .select("*")
          .in("lead_id", ids)
          .order("created_at", { ascending: false })
          .limit(limitPerFetch)
        if (error) return downResult(error)
        return ok((data ?? []) as CompassActivityRow[])
      },
      { ttlMs: TTL_MS, downTtlMs: TTL_DOWN_MS, isDown: isCompassResultDown, copy: copyCompassResult },
    )
  } catch (error) {
    return downResult(error)
  }
}

/** 소재 단위 일별 성과(크리에이티브 포함) — Summary/광고 탭 소재 CPL 카드용.
 *  60초 메모(down은 10초) — (fromDay, toDay) 범위 문자열이 그대로 키다. */
export async function getCompassAdsDaily(
  fromDay: string,
  toDay: string,
): Promise<CompassResult<CompassAdDailyRow>> {
  const cacheKey = `ads:${fromDay}:${toDay}`
  try {
    return await memoize(
      cacheKey,
      async () => {
        const sb = createSupabaseAdminClient()
        const { data, error } = await sb
          .from("compass_ads_v")
          .select("*")
          .gte("day", fromDay)
          .lte("day", toDay)
          .order("day", { ascending: true })
          .limit(3000)
        if (error) return downResult(error)
        return ok((data ?? []) as CompassAdDailyRow[])
      },
      { ttlMs: TTL_MS, downTtlMs: TTL_DOWN_MS, isDown: isCompassResultDown, copy: copyCompassResult },
    )
  } catch (error) {
    return downResult(error)
  }
}

/** 광고세트 단위 일별 성과. 60초 메모(down은 10초) — (fromDay, toDay) 범위가 키다. */
export async function getCompassAdsetsDaily(
  fromDay: string,
  toDay: string,
): Promise<CompassResult<CompassAdsetDailyRow>> {
  const cacheKey = `adsets:${fromDay}:${toDay}`
  try {
    return await memoize(
      cacheKey,
      async () => {
        const sb = createSupabaseAdminClient()
        const { data, error } = await sb
          .from("compass_adsets_v")
          .select("*")
          .gte("day", fromDay)
          .lte("day", toDay)
          .order("day", { ascending: true })
          .limit(3000)
        if (error) return downResult(error)
        return ok((data ?? []) as CompassAdsetDailyRow[])
      },
      { ttlMs: TTL_MS, downTtlMs: TTL_DOWN_MS, isDown: isCompassResultDown, copy: copyCompassResult },
    )
  } catch (error) {
    return downResult(error)
  }
}

/** 데모 실측 레코드(기간) — 캘린더 compass_demo 소스·CRM 홈 지휘대용.
 *  60초 메모(down은 10초) — (fromDay, toDay) 범위가 키다. */
export async function getCompassDemos(
  fromDay: string,
  toDay: string,
): Promise<CompassResult<CompassDemoRow>> {
  const cacheKey = `demos:${fromDay}:${toDay}`
  try {
    return await memoize(
      cacheKey,
      async () => {
        const sb = createSupabaseAdminClient()
        const { data, error } = await sb
          .from("compass_demos_v")
          .select("*")
          .gte("day", fromDay)
          .lte("day", toDay)
          .order("day", { ascending: true })
        if (error) return downResult(error)
        return ok((data ?? []) as CompassDemoRow[])
      },
      { ttlMs: TTL_MS, downTtlMs: TTL_DOWN_MS, isDown: isCompassResultDown, copy: copyCompassResult },
    )
  } catch (error) {
    return downResult(error)
  }
}

/** 캘린더 미러(기간) — 데모 외 마케팅 일정 포함, 제목·시각·담당·Compass 리드 링크.
 *  60초 메모(down은 10초) — (fromDay, toDay) 범위가 키다. */
export async function getCompassCalEvents(
  fromDay: string,
  toDay: string,
): Promise<CompassResult<CompassCalEventRow>> {
  const cacheKey = `calEvents:${fromDay}:${toDay}`
  try {
    return await memoize(
      cacheKey,
      async () => {
        const sb = createSupabaseAdminClient()
        const { data, error } = await sb
          .from("compass_cal_events_v")
          .select("*")
          .gte("day", fromDay)
          .lte("day", toDay)
          .order("day", { ascending: true })
        if (error) return downResult(error)
        return ok((data ?? []) as CompassCalEventRow[])
      },
      { ttlMs: TTL_MS, downTtlMs: TTL_DOWN_MS, isDown: isCompassResultDown, copy: copyCompassResult },
    )
  } catch (error) {
    return downResult(error)
  }
}

/** 매출 스냅샷(월 배열) — rev-sheet 대조 배지용 합계 소스. month 형식은 Compass 원본을 따른다.
 *  60초 메모(down은 10초) — 월 목록을 정렬·중복 제거해 조인한 문자열이 키다. */
export async function getCompassRevenue(
  months: string[],
): Promise<CompassResult<CompassRevenueRow>> {
  const uniq = [...new Set(months.filter(Boolean))].sort()
  if (uniq.length === 0) return ok([])
  const cacheKey = `revenue:${foldLongKey(uniq.join(","))}`
  try {
    return await memoize(
      cacheKey,
      async () => {
        const sb = createSupabaseAdminClient()
        const { data, error } = await sb
          .from("compass_revenue_v")
          .select("*")
          .in("month", uniq)
        if (error) return downResult(error)
        return ok((data ?? []) as CompassRevenueRow[])
      },
      { ttlMs: TTL_MS, downTtlMs: TTL_DOWN_MS, isDown: isCompassResultDown, copy: copyCompassResult },
    )
  } catch (error) {
    return downResult(error)
  }
}

/** count 전용 조회 결과 — CompassResult<T>의 count 버전(행 배열이 필요 없는 head:true 집계용). */
export interface CompassCountResult {
  count: number
  down: boolean
  error?: string
}

function downCount(error: unknown): CompassCountResult {
  const message = error instanceof Error ? error.message : String(error)
  console.error("[compass-bridge] query failed:", message)
  return { count: 0, down: true, error: message }
}

function copyCountResult(result: CompassCountResult): CompassCountResult {
  return { ...result }
}

/** 다음 액션 임박(기간) — now~+withinHours 사이 next_action_at 행. CRM 홈 지휘대 밴드용.
 *  60초 메모(down은 10초) — 인자는 withinHours(시각 아님)뿐이라 그대로 키로 쓴다. 내부에서
 *  Date.now()로 계산하는 now~until 경계는 캐시 미스일 때만 새로 계산되므로, 최대 60초까지는
 *  "그때 시점 기준" 창이 재사용된다 — 다른 모든 60초 메모와 같은 수준의 신선도다. */
export async function getCompassUpcomingActions(
  withinHours: number,
): Promise<CompassResult<CompassLeadRow>> {
  const cacheKey = `upcomingActions:${withinHours}`
  try {
    return await memoize(
      cacheKey,
      async () => {
        const sb = createSupabaseAdminClient()
        const nowIso = new Date().toISOString()
        const untilIso = new Date(Date.now() + withinHours * 60 * 60 * 1000).toISOString()
        const { data, error } = await sb
          .from("compass_leads_v")
          .select("*")
          .gte("next_action_at", nowIso)
          .lte("next_action_at", untilIso)
          .order("next_action_at", { ascending: true })
          .limit(500)
        if (error) return downResult(error)
        return ok((data ?? []) as CompassLeadRow[])
      },
      { ttlMs: TTL_MS, downTtlMs: TTL_DOWN_MS, isDown: isCompassResultDown, copy: copyCompassResult },
    )
  } catch (error) {
    return downResult(error)
  }
}

/** BD인계 진행 건수 — stage='bd' AND bd_paid_at IS NULL. CRM 홈 지휘대 밴드용.
 *  60초 메모(down은 10초) — 인자가 없어 키는 고정 문자열이다. */
export async function getCompassBdOpenCount(): Promise<CompassCountResult> {
  try {
    return await memoize(
      "bdOpenCount",
      async () => {
        const sb = createSupabaseAdminClient()
        const { count, error } = await sb
          .from("compass_leads_v")
          .select("id", { head: true, count: "exact" })
          .eq("stage", "bd")
          .is("bd_paid_at", null)
        if (error) return downCount(error)
        return { count: count ?? 0, down: false }
      },
      {
        ttlMs: TTL_MS,
        downTtlMs: TTL_DOWN_MS,
        isDown: (result) => result.down === true,
        copy: copyCountResult,
      },
    )
  } catch (error) {
    return downCount(error)
  }
}

// isCompassBridgeDown 전용 TTL — 배지 갱신 주기라 다른 조회보다 짧다. down(끊김) 판정이면
// 10초로 더 줄여 복구가 빨리 반영되게 한다(위 TTL_DOWN_MS와 같은 값이지만 의도를 분리해 이름 붙였다).
const TTL_BRIDGE_STATUS_MS = 15_000
const TTL_BRIDGE_STATUS_DOWN_MS = 10_000

/** 연결 상태 점검 — V6 배지용. head count 한 번으로 브리지 생사만 본다.
 *  15초 메모, 끊김(true) 판정이면 10초로 줄여 복구를 더 빨리 반영한다. */
export async function isCompassBridgeDown(): Promise<boolean> {
  try {
    return await memoize(
      "bridgeStatus",
      async () => {
        const sb = createSupabaseAdminClient()
        const { error } = await sb
          .from("compass_leads_v")
          .select("id", { head: true, count: "exact" })
        return Boolean(error)
      },
      {
        ttlMs: TTL_BRIDGE_STATUS_MS,
        downTtlMs: TTL_BRIDGE_STATUS_DOWN_MS,
        isDown: (down) => down === true,
        // boolean은 값 타입이라 mutate될 수 없다 — 인터페이스를 맞추려 항등 함수로 둔다.
        copy: (down) => down,
      },
    )
  } catch {
    return true
  }
}
