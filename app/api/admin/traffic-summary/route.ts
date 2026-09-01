import { type NextRequest, NextResponse } from "next/server"
import { unstable_cache } from "next/cache"

import { verifyAdmin } from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { buildHomepageFlowFromRows } from "@/lib/admin-homepage-flow"
import { buildLeadConversions, type LeadConversionRow } from "@/lib/admin/traffic-lead-conversions"
import {
  buildVisitorStatsFromRows,
  getVisitorStatsSinceIso,
  parseVisitorStatsRange,
  type VisitorStatsRangeDays,
} from "@/lib/admin-visitor-stats"

// 방문자/트래픽 통합 요약 (7-23 감사 3-A) — /admin/traffic이 같은 client_events
// 윈도우를 3개 라우트(visitor-stats / homepage-flow / event-counts)로 3중 스캔하던
// 것을 1회 조회 + 메모리 분배로 합친 집계 엔드포인트다.
// 기존 3개 라우트는 다른 소비자(Overview 방문자 카드, 사이드바 warm 목록)가 있어
// 계약 그대로 유지한다 — 이 라우트는 /admin/traffic 전용 소비 계약이다.
//
// 수치 동일성:
// - visitorStats / homepageFlow: 기존 라우트의 폴백 빌더(같은 exported 함수)를
//   같은 KST 일 경계 윈도우의 같은 행 집합에 그대로 적용한다. RPC 고속경로
//   (admin_daily_visitor_counts)는 애초에 이 빌더의 SQL 사본으로 설계됐다.
// - eventCounts: admin_event_counts RPC와 동일 규칙(byEvent 전량 count desc ·
//   byButton 상위 50 · daily UTC 날짜 · total 전량)을 rolling now-Nd 윈도우(기존
//   event-counts와 동일)에 적용한다.
// 윈도우 산식: rolling(now-Nd) ≤ KST 일 경계 시작이 항상 성립하므로 rolling 시점부터
// 1회 조회한 뒤 각 소비 윈도우로 잘라 담는다.

interface TrafficEventRow {
  event_name: string
  page: string | null
  params: Record<string, unknown> | null
  anonymous_id: string | null
  button: string | null
  created_at: string
}

interface TrafficEventCounts {
  rangeDays: number
  total: number
  byEvent: Array<{ event: string; count: number; lastSeen: string | null }>
  byButton: Array<{ button: string; event: string; count: number; lastSeen: string | null }>
  daily: Array<{ date: string; count: number }>
}

// 기존 flow/visitor 라우트의 스캔 상한과 동일. 전체 이벤트 기준이므로 윈도우 내
// 행이 이 상한을 넘으면(현 트래픽 규모에서는 여유) 오래된 쪽부터 잘린다.
const SCAN_LIMIT = 100_000
const DAY_MS = 24 * 60 * 60 * 1000
const FLOW_EVENT_NAMES = new Set(["page_view", "download_materials", "page_exit"])

// event-counts 라우트의 폴백 집계와 동일 로직(50k 절단만 없음 — RPC 결과와 정합).
function buildEventCounts(rows: TrafficEventRow[], rangeDays: number): TrafficEventCounts {
  const eventMap = new Map<string, { count: number; lastSeen: string | null }>()
  const buttonMap = new Map<string, { event: string; count: number; lastSeen: string | null }>()
  const dailyMap = new Map<string, number>()

  for (const row of rows) {
    const event = eventMap.get(row.event_name) ?? { count: 0, lastSeen: null }
    event.count += 1
    if (!event.lastSeen || row.created_at > event.lastSeen) event.lastSeen = row.created_at
    eventMap.set(row.event_name, event)

    if (row.button) {
      const key = `${row.event_name}::${row.button}`
      const button = buttonMap.get(key) ?? { event: row.event_name, count: 0, lastSeen: null }
      button.count += 1
      if (!button.lastSeen || row.created_at > button.lastSeen) button.lastSeen = row.created_at
      buttonMap.set(key, button)
    }

    // 일별 집계 (UTC 기준 YYYY-MM-DD — admin_event_counts RPC와 동일)
    const date = row.created_at.slice(0, 10)
    dailyMap.set(date, (dailyMap.get(date) ?? 0) + 1)
  }

  return {
    rangeDays,
    total: rows.length,
    byEvent: Array.from(eventMap.entries())
      .map(([event, value]) => ({ event, count: value.count, lastSeen: value.lastSeen }))
      .sort((a, b) => b.count - a.count),
    byButton: Array.from(buttonMap.entries())
      .map(([key, value]) => ({
        button: key.split("::")[1],
        event: value.event,
        count: value.count,
        lastSeen: value.lastSeen,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 50),
    daily: Array.from(dailyMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => (a.date < b.date ? -1 : 1)),
  }
}

async function computeTrafficSummary(rangeDays: VisitorStatsRangeDays) {
  const now = new Date()
  // visitor-stats/homepage-flow 윈도우(KST 일 경계, 두 라우트가 같은 수식 사용)
  const kstSinceIso = getVisitorStatsSinceIso(rangeDays, now)
  // event-counts 윈도우(rolling now - N일)
  const rollingSinceIso = new Date(now.getTime() - rangeDays * DAY_MS).toISOString()
  // rolling ≤ KST 시작이 산식상 항상 성립하지만, 경계 동시각 등 만일에 대비해 min으로 조회.
  const sinceIso = rollingSinceIso < kstSinceIso ? rollingSinceIso : kstSinceIso

  const supabase = createSupabaseAdminClient()
  // 전환 지표는 leads 에서, 나머지 트래픽 지표는 client_events 에서 온다. 두 조회를 나란히 던진다.
  // leads 는 source/created_at 두 컬럼만 가져오고 즉시 숫자로 접는다 — 응답에 리드 행이 실리면
  // unstable_cache 항목이 커진다(리드 전량은 2MB 상한을 위협한다).
  const [eventsResult, leadsResult] = await Promise.all([
    supabase
      .from("client_events")
      .select("event_name, page, params, anonymous_id, button, created_at")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(SCAN_LIMIT),
    supabase
      .from("leads")
      .select("source, created_at")
      .gte("created_at", rollingSinceIso)
      .limit(SCAN_LIMIT),
  ])

  if (eventsResult.error) throw eventsResult.error
  const rows = (eventsResult.data ?? []) as TrafficEventRow[]
  // 리드 조회 실패는 트래픽 요약 전체를 죽이지 않는다 — 방문자·이벤트 지표는 그대로 쓸 수 있다.
  if (leadsResult.error) {
    console.error("[GET /api/admin/traffic-summary] lead conversions:", leadsResult.error.message)
  }
  const leadRows = (leadsResult.data ?? []) as LeadConversionRow[]

  // ISO 오프셋 표기가 소스마다 다를 수 있어 문자열이 아닌 epoch로 자른다.
  const kstSinceMs = new Date(kstSinceIso).getTime()
  const rollingSinceMs = new Date(rollingSinceIso).getTime()
  const kstRows = rows.filter((row) => new Date(row.created_at).getTime() >= kstSinceMs)

  return {
    rangeDays,
    timezone: "Asia/Seoul" as const,
    generatedAt: now.toISOString(),
    visitorStats: buildVisitorStatsFromRows(
      kstRows.filter((row) => row.event_name === "page_view"),
      rangeDays,
      now
    ),
    homepageFlow: buildHomepageFlowFromRows(
      kstRows.filter((row) => FLOW_EVENT_NAMES.has(row.event_name)),
      rangeDays,
      now
    ),
    eventCounts: buildEventCounts(
      rows.filter((row) => new Date(row.created_at).getTime() >= rollingSinceMs),
      rangeDays
    ),
    leadConversions: buildLeadConversions(leadRows, rangeDays, now),
    /** 리드 조회가 실패해 leadConversions 가 0으로 보이는 상태인지. 화면이 0과 미상을 구분한다. */
    leadConversionsUnavailable: Boolean(leadsResult.error),
  }
}

// 서버 메모이제이션 — adminCachedJson은 브라우저 프라이빗 캐시 헤더만 붙이므로
// 유저·콜드미스마다 위 스캔이 재실행된다. unstable_cache(60초, range별 키 — 인자가
// 캐시 키에 포함된다)로 집계 결과를 요청·유저 간 공유한다. createSupabaseAdminClient는
// 요청 무관(non-cookie) 서비스 롤 클라이언트라 unstable_cache 안에서 안전하다
// (lib/admin-crm-revenue.ts:1534 동일 논리). generatedAt은 집계 시각을 그대로 캐시한다.
const getCachedTrafficSummary = unstable_cache(computeTrafficSummary, ["admin-traffic-summary"], {
  revalidate: 60,
  tags: ["admin-traffic-summary"],
})

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err

  const rangeDays = parseVisitorStatsRange(req.nextUrl.searchParams.get("range"))

  try {
    return adminCachedJson(await getCachedTrafficSummary(rangeDays))
  } catch (error) {
    console.error("[GET /api/admin/traffic-summary]", error)
    return NextResponse.json({ error: "Failed to fetch traffic summary" }, { status: 500 })
  }
}
