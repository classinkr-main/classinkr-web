// Compass 브리지 — 마케팅팀 앱(mkt.classin.co.kr)의 crm 스키마를 읽는 유일한 계층.
// 원천은 supabase/migrations/20260828_compass_bridge_views.sql의 읽기 전용 뷰 7장.
//
// 계약:
//  * 읽기 전용 — 이 모듈은 어떤 쓰기도 하지 않는다. Compass 데이터의 쓰기 소유권은 Compass에 있다.
//  * 서버 전용 — service_role 클라이언트만 뷰에 접근 가능(anon/authenticated는 DB에서 차단됨).
//  * fail loud — Compass 쪽 컬럼 rename 시 뷰가 깨진다. 소비 화면은 isCompassBridgeDown()로
//    연결 상태를 감지해 "Compass 연결 끊김" 배지로 강등한다(무음 오염 금지).
//  * 뷰는 수동 타입 — database.types.ts 재생성에 의존하지 않는다(공유 파일 충돌 회피).
import "server-only"

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

/** phone_key 배치 조회 — 리드 보드 칩 오버레이·등록 중복 경고용. 키는 normalizePhoneKey 산출값. */
export async function getCompassLeadsByPhoneKeys(
  phoneKeys: string[],
): Promise<CompassResult<CompassLeadRow>> {
  const keys = [...new Set(phoneKeys.filter(Boolean))]
  if (keys.length === 0) return ok([])
  try {
    const sb = createSupabaseAdminClient()
    const { data, error } = await sb
      .from("compass_leads_v")
      .select("*")
      .in("phone_key", keys)
    if (error) return downResult(error)
    return ok((data ?? []) as CompassLeadRow[])
  } catch (error) {
    return downResult(error)
  }
}

/** 기간 내 리드 — 라이브 인테이크 피드·재유입 카운트용(last_inflow_at 기준). */
export async function getCompassLeadsByInflowRange(
  fromIso: string,
  toIso?: string,
): Promise<CompassResult<CompassLeadRow>> {
  try {
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
  } catch (error) {
    return downResult(error)
  }
}

/** 리드별 활동 타임라인 — 고객 360 병합용. body는 서버 전용으로만 다룰 것. */
export async function getCompassActivitiesByLeadIds(
  leadIds: number[],
  limitPerFetch = 300,
): Promise<CompassResult<CompassActivityRow>> {
  const ids = [...new Set(leadIds)].filter((id) => Number.isInteger(id))
  if (ids.length === 0) return ok([])
  try {
    const sb = createSupabaseAdminClient()
    const { data, error } = await sb
      .from("compass_activities_v")
      .select("*")
      .in("lead_id", ids)
      .order("created_at", { ascending: false })
      .limit(limitPerFetch)
    if (error) return downResult(error)
    return ok((data ?? []) as CompassActivityRow[])
  } catch (error) {
    return downResult(error)
  }
}

/** 소재 단위 일별 성과(크리에이티브 포함) — Summary/광고 탭 소재 CPL 카드용. */
export async function getCompassAdsDaily(
  fromDay: string,
  toDay: string,
): Promise<CompassResult<CompassAdDailyRow>> {
  try {
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
  } catch (error) {
    return downResult(error)
  }
}

/** 광고세트 단위 일별 성과. */
export async function getCompassAdsetsDaily(
  fromDay: string,
  toDay: string,
): Promise<CompassResult<CompassAdsetDailyRow>> {
  try {
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
  } catch (error) {
    return downResult(error)
  }
}

/** 데모 실측 레코드(기간) — 캘린더 compass_demo 소스·CRM 홈 지휘대용. */
export async function getCompassDemos(
  fromDay: string,
  toDay: string,
): Promise<CompassResult<CompassDemoRow>> {
  try {
    const sb = createSupabaseAdminClient()
    const { data, error } = await sb
      .from("compass_demos_v")
      .select("*")
      .gte("day", fromDay)
      .lte("day", toDay)
      .order("day", { ascending: true })
    if (error) return downResult(error)
    return ok((data ?? []) as CompassDemoRow[])
  } catch (error) {
    return downResult(error)
  }
}

/** 캘린더 미러(기간) — 데모 외 마케팅 일정 포함, 제목·시각·담당·Compass 리드 링크. */
export async function getCompassCalEvents(
  fromDay: string,
  toDay: string,
): Promise<CompassResult<CompassCalEventRow>> {
  try {
    const sb = createSupabaseAdminClient()
    const { data, error } = await sb
      .from("compass_cal_events_v")
      .select("*")
      .gte("day", fromDay)
      .lte("day", toDay)
      .order("day", { ascending: true })
    if (error) return downResult(error)
    return ok((data ?? []) as CompassCalEventRow[])
  } catch (error) {
    return downResult(error)
  }
}

/** 매출 스냅샷(월 배열) — rev-sheet 대조 배지용 합계 소스. month 형식은 Compass 원본을 따른다. */
export async function getCompassRevenue(
  months: string[],
): Promise<CompassResult<CompassRevenueRow>> {
  const uniq = [...new Set(months.filter(Boolean))]
  if (uniq.length === 0) return ok([])
  try {
    const sb = createSupabaseAdminClient()
    const { data, error } = await sb
      .from("compass_revenue_v")
      .select("*")
      .in("month", uniq)
    if (error) return downResult(error)
    return ok((data ?? []) as CompassRevenueRow[])
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

/** 다음 액션 임박(기간) — now~+withinHours 사이 next_action_at 행. CRM 홈 지휘대 밴드용. */
export async function getCompassUpcomingActions(
  withinHours: number,
): Promise<CompassResult<CompassLeadRow>> {
  try {
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
  } catch (error) {
    return downResult(error)
  }
}

/** BD인계 진행 건수 — stage='bd' AND bd_paid_at IS NULL. CRM 홈 지휘대 밴드용. */
export async function getCompassBdOpenCount(): Promise<CompassCountResult> {
  try {
    const sb = createSupabaseAdminClient()
    const { count, error } = await sb
      .from("compass_leads_v")
      .select("id", { head: true, count: "exact" })
      .eq("stage", "bd")
      .is("bd_paid_at", null)
    if (error) return downCount(error)
    return { count: count ?? 0, down: false }
  } catch (error) {
    return downCount(error)
  }
}

/** 연결 상태 점검 — V6 배지용. head count 한 번으로 브리지 생사만 본다. */
export async function isCompassBridgeDown(): Promise<boolean> {
  try {
    const sb = createSupabaseAdminClient()
    const { error } = await sb
      .from("compass_leads_v")
      .select("id", { head: true, count: "exact" })
    return Boolean(error)
  } catch {
    return true
  }
}
