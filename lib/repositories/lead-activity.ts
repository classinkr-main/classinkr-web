/**
 * Lead Activity Intelligence — read-only
 *
 * 공개 사이트에서 이미 캡처·인덱싱되고 있으나 영업담당자에게 노출되지 않던
 * 인증/행동 신호를 리드 단위로 모아준다. 모두 service-role SELECT(RLS 우회)다.
 *
 *  - user_profiles      : Google/Naver 로그인 신원 (provider, 마케팅 동의)
 *  - material_downloads : 게이트 자료 다운로드 감사 로그
 *  - client_events      : 페이지/행동 이벤트 (lead_id 스티칭 후)
 *
 * 조인 키는 lead_id. user_profiles는 스티칭이 lead_id를 못 채운 경우를 대비해
 * 리드 이메일로도 보조 매칭한다.
 */

import "server-only"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import type { LeadEngagement } from "@/lib/crm/lead-ranking"

export interface LeadAuthProfile {
  provider: string | null
  providerId: string | null
  name: string | null
  email: string | null
  marketingConsent: boolean
  createdAt: string
  /** lead_id로 직접 연결됐는지, 이메일로만 매칭됐는지 */
  matchedBy: "lead_id" | "email"
}

export interface LeadDownloadRecord {
  slug: string
  gateType: string
  source: string | null
  postSlug: string | null
  createdAt: string
}

export interface LeadEventRecord {
  eventName: string
  button: string | null
  page: string | null
  params: Record<string, unknown> | null
  createdAt: string
}

export interface LeadActivitySummary {
  authenticated: boolean
  providers: string[]
  marketingConsent: boolean
  downloadCount: number
  /** client_events 전체 카운트(타임라인은 최근 N건만 가져옴) */
  eventCount: number
  lastActivityAt: string | null
  topPages: { page: string; count: number }[]
}

export interface LeadActivity {
  summary: LeadActivitySummary
  profiles: LeadAuthProfile[]
  downloads: LeadDownloadRecord[]
  events: LeadEventRecord[]
}

/**
 * 리스트 한눈 표시용 경량 배지 겸 랭킹 입력.
 *
 * 리드 보드 기본 정렬이 "자주·최근·주요" 합성 점수로 바뀌면서, 배지가 화면 장식이 아니라
 * 정렬의 입력이 됐다. 그래서 로그인/다운로드에 더해 이벤트 수·연락 횟수·마지막 접점까지
 * 여기서 같이 내려준다(형태는 lib/crm/lead-ranking.ts 의 LeadEngagement 와 동일).
 */
export type LeadActivityBadge = LeadEngagement

interface RawProfile {
  provider: string | null
  provider_id: string | null
  name: string | null
  email: string | null
  marketing_consent: boolean | null
  created_at: string
}

interface RawDownload {
  material_slug: string
  gate_type: string
  source: string | null
  post_slug: string | null
  created_at: string
}

interface RawEvent {
  event_name: string
  button: string | null
  page: string | null
  params: Record<string, unknown> | null
  created_at: string
}

const EVENT_FETCH_LIMIT = 200

export async function getLeadActivity(leadId: string): Promise<LeadActivity> {
  const supabase = createSupabaseAdminClient()

  // 보조 이메일 매칭용 — 리드 이메일
  const { data: leadRow } = await supabase
    .from("leads")
    .select("email")
    .eq("id", leadId)
    .maybeSingle()
  const leadEmail = (leadRow?.email as string | null)?.trim().toLowerCase() || null

  const PROFILE_COLUMNS = "provider, provider_id, name, email, marketing_consent, created_at"

  const [profilesByLeadRes, profilesByEmailRes, downloadsRes, eventsRes, eventCountRes] =
    await Promise.all([
      supabase.from("user_profiles").select(PROFILE_COLUMNS).eq("lead_id", leadId),
      leadEmail
        ? supabase.from("user_profiles").select(PROFILE_COLUMNS).eq("email", leadEmail)
        : Promise.resolve({ data: [] as RawProfile[], error: null }),
      supabase
        .from("material_downloads")
        .select("material_slug, gate_type, source, post_slug, created_at")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false }),
      supabase
        .from("client_events")
        .select("event_name, button, page, params, created_at")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false })
        .limit(EVENT_FETCH_LIMIT),
      supabase
        .from("client_events")
        .select("id", { count: "exact", head: true })
        .eq("lead_id", leadId),
    ])

  // ── 프로필 병합 + 중복 제거 (provider:provider_id 또는 이메일 기준) ──
  const profileMap = new Map<string, LeadAuthProfile>()
  const ingest = (rows: RawProfile[] | null, matchedBy: "lead_id" | "email") => {
    for (const row of rows ?? []) {
      const key =
        row.provider && row.provider_id
          ? `${row.provider}:${row.provider_id}`
          : row.email ?? `anon:${row.created_at}`
      const existing = profileMap.get(key)
      // lead_id 매칭이 이메일 매칭보다 신뢰도 높음 — 승격 허용
      if (!existing || (existing.matchedBy === "email" && matchedBy === "lead_id")) {
        profileMap.set(key, {
          provider: row.provider,
          providerId: row.provider_id,
          name: row.name,
          email: row.email,
          marketingConsent: Boolean(row.marketing_consent),
          createdAt: row.created_at,
          matchedBy: existing ? "lead_id" : matchedBy,
        })
      }
    }
  }
  ingest(profilesByLeadRes.data as RawProfile[] | null, "lead_id")
  ingest((profilesByEmailRes as { data: RawProfile[] | null }).data, "email")
  const profiles = Array.from(profileMap.values()).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  )

  const downloads: LeadDownloadRecord[] = ((downloadsRes.data as RawDownload[] | null) ?? []).map(
    (d) => ({
      slug: d.material_slug,
      gateType: d.gate_type,
      source: d.source ?? null,
      postSlug: d.post_slug ?? null,
      createdAt: d.created_at,
    })
  )

  const events: LeadEventRecord[] = ((eventsRes.data as RawEvent[] | null) ?? []).map((e) => ({
    eventName: e.event_name,
    button: e.button ?? null,
    page: e.page ?? null,
    params: e.params ?? null,
    createdAt: e.created_at,
  }))

  // ── 요약 ──
  const providers = Array.from(
    new Set(profiles.map((p) => p.provider).filter((p): p is string => Boolean(p)))
  )
  const activityTimes = [...downloads.map((d) => d.createdAt), ...events.map((e) => e.createdAt)]
  const lastActivityAt = activityTimes.length
    ? activityTimes.reduce((a, b) => (a > b ? a : b))
    : null

  const pageCounts = new Map<string, number>()
  for (const e of events) {
    if (!e.page) continue
    pageCounts.set(e.page, (pageCounts.get(e.page) ?? 0) + 1)
  }
  const topPages = Array.from(pageCounts.entries())
    .map(([page, count]) => ({ page, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  return {
    summary: {
      authenticated: profiles.length > 0,
      providers,
      marketingConsent: profiles.some((p) => p.marketingConsent),
      downloadCount: downloads.length,
      eventCount: eventCountRes.count ?? events.length,
      lastActivityAt,
      topPages,
    },
    profiles,
    downloads,
    events,
  }
}

// PostgREST 는 한 응답의 행 수를 서버 설정(기본 1000)으로 자른다. client_events 처럼
// 리드당 수십 행이 쌓이는 테이블은 한 번의 select 로 다 못 받으므로 range 페이징으로 훑고,
// 그래도 끝이 안 보이면 상한에서 멈춘다(최신순이라 잘리는 쪽은 항상 오래된 활동).
const BULK_PAGE_SIZE = 1000
/** 행동 로그(이벤트·다운로드)·로그인 신원 상한 — 리드당 수십 행까지 감안한 값. */
const ACTIVITY_ROW_CAP = 20_000
const CONTACT_LOG_ROW_CAP = 10_000

type PageResult<T> = { data: T[] | null; error: { message?: string } | null }

async function fetchPagedRows<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  cap: number
): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; from < cap; from += BULK_PAGE_SIZE) {
    const to = Math.min(from + BULK_PAGE_SIZE, cap) - 1
    const { data, error } = await fetchPage(from, to)
    if (error) throw new Error(error.message ?? "unknown database error")
    const page = data ?? []
    rows.push(...page)
    if (page.length < to - from + 1) break
  }
  return rows
}

/** 보조 신호 하나가 실패해도 보드 전체(정렬 포함)를 죽이지 않는다. */
async function softly<T>(
  label: string,
  run: () => Promise<T>,
  fallback: T,
  onFailure?: () => void
): Promise<T> {
  try {
    return await run()
  } catch (error) {
    console.warn(`[lead-activity] ${label} 집계 실패 — 해당 신호 없이 계속합니다:`, error)
    onFailure?.()
    return fallback
  }
}

function maxIso(a: string | null, b: string | null) {
  if (!a) return b
  if (!b) return a
  return a > b ? a : b
}

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>

const ACTIVITY_SUMMARY_RPC = "admin_lead_activity_summary"

/**
 * 활동 집계 창(일). RPC와 행 집계 폴백이 같은 값을 쓴다 — 두 경로가 다른 창을 보면
 * 마이그레이션 적용 여부에 따라 보드 정렬이 달라지고, 그 차이는 화면에서 재현되지 않는다.
 * 로그인 신원(user_profiles)은 활동이 아니라 사실이라 창을 걸지 않는다.
 */
const ACTIVITY_WINDOW_DAYS = 90
const ACTIVITY_SUMMARY_TTL_MS = 45_000

let activitySummaryCache: { at: number; value: Record<string, LeadActivityBadge> } | null = null
let activitySummaryInFlight: Promise<Record<string, LeadActivityBadge>> | null = null

/**
 * 이 맵의 입력(연락 로그·다운로드·이벤트)을 쓰는 경로가 즉시 반영을 원하면 호출한다.
 * 쓰기는 이 모듈 밖(lib/repositories/contact-logs.ts 등)에 있고 여기를 부르지 않으므로,
 * 현재 갱신 경로는 TTL 만료뿐이다.
 */
export function invalidateLeadsActivitySummary() {
  activitySummaryCache = null
}

/**
 * 리드 보드 전체에 한 번에 뿌릴 참여 신호 맵 — 정렬(자주·최근)의 입력이자 행 배지.
 *
 * CRM 홈 콜드에서는 우선순위 큐와 통합 스냅샷이 이 맵을 각각 독립으로 요구해 같은 집계가
 * 두 번 돌았다. TTL 메모 + in-flight 공유로 그 두 번을 한 번으로 접는다. 값은 작은 집계
 * 맵이고 호출부는 읽기만 하므로 복제 없이 그대로 공유한다.
 */
export async function getLeadsActivitySummary(): Promise<Record<string, LeadActivityBadge>> {
  const cached = activitySummaryCache
  if (cached && Date.now() - cached.at < ACTIVITY_SUMMARY_TTL_MS) return cached.value
  if (activitySummaryInFlight) return activitySummaryInFlight

  const request = loadLeadsActivitySummary()
    .then(({ map, complete }) => {
      // 신호 하나가 빠진 반쪽 집계는 캐시하지 않는다 — 일시적 실패가 45초간 굳는다.
      if (complete) activitySummaryCache = { at: Date.now(), value: map }
      return map
    })
    .finally(() => {
      activitySummaryInFlight = null
    })
  activitySummaryInFlight = request
  return request
}

async function loadLeadsActivitySummary(): Promise<{
  map: Record<string, LeadActivityBadge>
  complete: boolean
}> {
  const supabase = createSupabaseAdminClient()
  const viaRpc = await loadActivitySummaryViaRpc(supabase)
  if (viaRpc) return { map: viaRpc, complete: true }
  return loadActivitySummaryFromRows(supabase)
}

interface RawBadge {
  authenticated?: unknown
  providers?: unknown
  downloadCount?: unknown
  eventCount?: unknown
  contactLogCount?: unknown
  lastActivityAt?: unknown
  lastContactAt?: unknown
}

/** 마이그레이션 미적용 환경(배포 스큐) — 함수가 아직 없다. */
function isMissingFunctionError(error: { code?: string | null; message?: string | null }) {
  const code = error.code ?? ""
  if (code === "PGRST202" || code === "42883") return true
  const message = (error.message ?? "").toLowerCase()
  return message.includes(ACTIVITY_SUMMARY_RPC) && /could not find|does not exist/.test(message)
}

function toIsoOrNull(value: unknown) {
  return typeof value === "string" && value ? value : null
}

/**
 * GROUP BY 한 번으로 끝나는 경로. 실패하면 null 을 돌려 행 집계 폴백으로 넘긴다 —
 * 함수 부재(마이그 전)든 다른 오류든, 배지가 통째로 비는 것보다 느린 정답이 낫다.
 */
async function loadActivitySummaryViaRpc(
  supabase: SupabaseAdminClient
): Promise<Record<string, LeadActivityBadge> | null> {
  const { data, error } = await supabase.rpc(ACTIVITY_SUMMARY_RPC, {
    p_days: ACTIVITY_WINDOW_DAYS,
  })

  if (error) {
    if (!isMissingFunctionError(error)) {
      console.warn(`[lead-activity] ${ACTIVITY_SUMMARY_RPC} 실패 — 행 집계로 폴백합니다:`, error)
    }
    return null
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null

  const map: Record<string, LeadActivityBadge> = {}
  for (const [leadId, raw] of Object.entries(data as Record<string, unknown>)) {
    if (!leadId || !raw || typeof raw !== "object") continue
    const row = raw as RawBadge
    map[leadId] = {
      authenticated: row.authenticated === true,
      providers: Array.isArray(row.providers)
        ? row.providers.filter((value): value is string => typeof value === "string" && !!value)
        : [],
      downloadCount: Number(row.downloadCount) || 0,
      eventCount: Number(row.eventCount) || 0,
      contactLogCount: Number(row.contactLogCount) || 0,
      lastActivityAt: toIsoOrNull(row.lastActivityAt),
      lastContactAt: toIsoOrNull(row.lastContactAt),
    }
  }
  return map
}

/**
 * RPC 미적용 환경 전용 폴백 — lead_id가 연결된 행만 모아 JS로 집계한다.
 * 창(ACTIVITY_WINDOW_DAYS)은 RPC와 동일하게 걸어 두 경로의 산출물을 같게 유지한다.
 */
async function loadActivitySummaryFromRows(supabase: SupabaseAdminClient): Promise<{
  map: Record<string, LeadActivityBadge>
  complete: boolean
}> {
  const since = new Date(Date.now() - ACTIVITY_WINDOW_DAYS * 86_400_000).toISOString()
  let complete = true
  const markIncomplete = () => {
    complete = false
  }

  const [profiles, downloads, events, contactLogs] = await Promise.all([
    // 이전에는 limit 없이 한 번만 select 해서 PostgREST 기본 상한(1000행)에 조용히 잘렸다.
    // range 페이징은 정렬이 없으면 페이지 경계에서 행이 겹치거나 빠지므로 PK 순으로 고정한다.
    softly(
      "user_profiles",
      async () =>
        (await fetchPagedRows<{ lead_id: string; provider: string | null }>(
          (from, to) =>
            supabase
              .from("user_profiles")
              .select("lead_id, provider")
              .not("lead_id", "is", null)
              .order("id", { ascending: true })
              .range(from, to),
          ACTIVITY_ROW_CAP
        )) ?? [],
      [] as { lead_id: string; provider: string | null }[],
      markIncomplete
    ),
    softly(
      "material_downloads",
      async () =>
        (await fetchPagedRows<{ lead_id: string; created_at: string }>(
          (from, to) =>
            supabase
              .from("material_downloads")
              .select("lead_id, created_at")
              .not("lead_id", "is", null)
              .gte("created_at", since)
              .order("created_at", { ascending: false })
              .range(from, to),
          ACTIVITY_ROW_CAP
        )) ?? [],
      [] as { lead_id: string; created_at: string }[],
      markIncomplete
    ),
    softly(
      "client_events",
      async () =>
        (await fetchPagedRows<{ lead_id: string; created_at: string }>(
          (from, to) =>
            supabase
              .from("client_events")
              .select("lead_id, created_at")
              .not("lead_id", "is", null)
              .gte("created_at", since)
              .order("created_at", { ascending: false })
              .range(from, to),
          ACTIVITY_ROW_CAP
        )) ?? [],
      [] as { lead_id: string; created_at: string }[],
      markIncomplete
    ),
    softly(
      "lead_contact_logs",
      async () =>
        (await fetchPagedRows<{ lead_id: string; contacted_at: string }>(
          (from, to) =>
            supabase
              .from("lead_contact_logs")
              .select("lead_id, contacted_at")
              .gte("contacted_at", since)
              .order("contacted_at", { ascending: false })
              .range(from, to),
          CONTACT_LOG_ROW_CAP
        )) ?? [],
      [] as { lead_id: string; contacted_at: string }[],
      markIncomplete
    ),
  ])

  const map: Record<string, LeadActivityBadge> = {}
  const ensure = (leadId: string) =>
    (map[leadId] ??= {
      authenticated: false,
      providers: [],
      downloadCount: 0,
      eventCount: 0,
      contactLogCount: 0,
      lastActivityAt: null,
      lastContactAt: null,
    })

  for (const row of profiles) {
    const entry = ensure(row.lead_id)
    entry.authenticated = true
    if (row.provider && !entry.providers.includes(row.provider)) entry.providers.push(row.provider)
  }

  for (const row of downloads) {
    const entry = ensure(row.lead_id)
    entry.downloadCount += 1
    entry.lastActivityAt = maxIso(entry.lastActivityAt, row.created_at)
  }

  for (const row of events) {
    const entry = ensure(row.lead_id)
    entry.eventCount += 1
    entry.lastActivityAt = maxIso(entry.lastActivityAt, row.created_at)
  }

  for (const row of contactLogs) {
    if (!row.lead_id) continue
    const entry = ensure(row.lead_id)
    entry.contactLogCount += 1
    entry.lastContactAt = maxIso(entry.lastContactAt, row.contacted_at)
  }

  return { map, complete }
}
