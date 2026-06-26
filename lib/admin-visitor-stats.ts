import "server-only"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"

export type VisitorStatsRangeDays = 7 | 14 | 30 | 90

export interface VisitorStatsDay {
  date: string
  visitors: number
  pageViews: number
  homeVisitors: number
  homePageViews: number
}

export interface VisitorStatsPayload {
  rangeDays: VisitorStatsRangeDays
  timezone: "Asia/Seoul"
  today: VisitorStatsDay
  totals: {
    visitors: number
    pageViews: number
    homeVisitors: number
    homePageViews: number
  }
  daily: VisitorStatsDay[]
}

interface VisitorEventRow {
  page: string | null
  anonymous_id: string | null
  created_at: string
}

const TIME_ZONE = "Asia/Seoul"
const KST_OFFSET_MS = 9 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const ALLOWED_RANGES: VisitorStatsRangeDays[] = [7, 14, 30, 90]

export function parseVisitorStatsRange(value: string | null): VisitorStatsRangeDays {
  const parsed = value ? parseInt(value, 10) : NaN
  return ALLOWED_RANGES.includes(parsed as VisitorStatsRangeDays)
    ? (parsed as VisitorStatsRangeDays)
    : 30
}

function kstDateKey(date: Date) {
  return new Date(date.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10)
}

function kstDayStartUtc(date: Date) {
  return new Date(`${kstDateKey(date)}T00:00:00.000+09:00`)
}

export function getVisitorStatsSinceIso(rangeDays: VisitorStatsRangeDays, now = new Date()) {
  const todayStart = kstDayStartUtc(now)
  return new Date(todayStart.getTime() - (rangeDays - 1) * DAY_MS).toISOString()
}

function makeEmptyDay(date: string): VisitorStatsDay {
  return {
    date,
    visitors: 0,
    pageViews: 0,
    homeVisitors: 0,
    homePageViews: 0,
  }
}

function makeDayBuckets(rangeDays: VisitorStatsRangeDays, now = new Date()) {
  const todayStart = kstDayStartUtc(now)
  return Array.from({ length: rangeDays }, (_, index) => {
    const date = kstDateKey(new Date(todayStart.getTime() - (rangeDays - 1 - index) * DAY_MS))
    return makeEmptyDay(date)
  })
}

function normalizePage(page: string | null) {
  if (!page) return null
  const normalized = page.split("?")[0]?.trim() || null
  if (!normalized) return null
  return normalized === "" ? "/" : normalized
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

export function normalizeVisitorStatsPayload(
  payload: unknown,
  rangeDays: VisitorStatsRangeDays,
  now = new Date()
): VisitorStatsPayload {
  const days = makeDayBuckets(rangeDays, now)
  const byDate = new Map(days.map((day) => [day.date, day]))
  const raw = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {}
  const dailyRows = Array.isArray(raw.daily) ? raw.daily : []

  for (const row of dailyRows) {
    if (!row || typeof row !== "object") continue
    const item = row as Record<string, unknown>
    const date = typeof item.date === "string" ? item.date : null
    const target = date ? byDate.get(date) : null
    if (!target) continue
    target.visitors = numberValue(item.visitors)
    target.pageViews = numberValue(item.pageViews)
    target.homeVisitors = numberValue(item.homeVisitors)
    target.homePageViews = numberValue(item.homePageViews)
  }

  const totalsRaw =
    raw.totals && typeof raw.totals === "object" ? (raw.totals as Record<string, unknown>) : null
  const totals = totalsRaw
    ? {
        visitors: numberValue(totalsRaw.visitors),
        pageViews: numberValue(totalsRaw.pageViews),
        homeVisitors: numberValue(totalsRaw.homeVisitors),
        homePageViews: numberValue(totalsRaw.homePageViews),
      }
    : days.reduce(
        (acc, day) => ({
          visitors: acc.visitors + day.visitors,
          pageViews: acc.pageViews + day.pageViews,
          homeVisitors: acc.homeVisitors + day.homeVisitors,
          homePageViews: acc.homePageViews + day.homePageViews,
        }),
        { visitors: 0, pageViews: 0, homeVisitors: 0, homePageViews: 0 }
      )

  return {
    rangeDays,
    timezone: TIME_ZONE,
    today: byDate.get(kstDateKey(now)) ?? makeEmptyDay(kstDateKey(now)),
    totals,
    daily: days,
  }
}

export function buildVisitorStatsFromRows(
  rows: VisitorEventRow[],
  rangeDays: VisitorStatsRangeDays,
  now = new Date()
): VisitorStatsPayload {
  const days = makeDayBuckets(rangeDays, now)
  const byDate = new Map(days.map((day) => [day.date, day]))
  const dailyVisitors = new Map<string, Set<string>>()
  const dailyHomeVisitors = new Map<string, Set<string>>()
  const totalVisitors = new Set<string>()
  const totalHomeVisitors = new Set<string>()
  let pageViews = 0
  let homePageViews = 0

  for (const row of rows) {
    const createdAt = new Date(row.created_at)
    if (Number.isNaN(createdAt.getTime())) continue

    const date = kstDateKey(createdAt)
    const day = byDate.get(date)
    if (!day) continue

    const page = normalizePage(row.page)
    const anonymousId = row.anonymous_id?.trim() || null

    day.pageViews += 1
    pageViews += 1

    if (anonymousId) {
      totalVisitors.add(anonymousId)
      if (!dailyVisitors.has(date)) dailyVisitors.set(date, new Set())
      dailyVisitors.get(date)?.add(anonymousId)
    }

    if (page === "/") {
      day.homePageViews += 1
      homePageViews += 1
      if (anonymousId) {
        totalHomeVisitors.add(anonymousId)
        if (!dailyHomeVisitors.has(date)) dailyHomeVisitors.set(date, new Set())
        dailyHomeVisitors.get(date)?.add(anonymousId)
      }
    }
  }

  for (const day of days) {
    day.visitors = dailyVisitors.get(day.date)?.size ?? 0
    day.homeVisitors = dailyHomeVisitors.get(day.date)?.size ?? 0
  }

  return {
    rangeDays,
    timezone: TIME_ZONE,
    today: byDate.get(kstDateKey(now)) ?? makeEmptyDay(kstDateKey(now)),
    totals: {
      visitors: totalVisitors.size,
      pageViews,
      homeVisitors: totalHomeVisitors.size,
      homePageViews,
    },
    daily: days,
  }
}

export async function getAdminVisitorStats(rangeDays: VisitorStatsRangeDays) {
  const sinceIso = getVisitorStatsSinceIso(rangeDays)
  const supabase = createSupabaseAdminClient()

  const agg = await supabase.rpc("admin_daily_visitor_counts", {
    since_ts: sinceIso,
    timezone_name: TIME_ZONE,
  })
  if (!agg.error && agg.data) {
    return normalizeVisitorStatsPayload(agg.data, rangeDays)
  }

  const { data, error } = await supabase
    .from("client_events")
    .select("page, anonymous_id, created_at")
    .eq("event_name", "page_view")
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(100000)

  if (error) throw error
  return buildVisitorStatsFromRows((data ?? []) as VisitorEventRow[], rangeDays)
}
