import "server-only"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"

export type HomepageFlowRangeDays = 7 | 14 | 30 | 90

interface ClientEventRow {
  event_name: string
  page: string | null
  params: Record<string, unknown> | null
  anonymous_id: string | null
  created_at: string
}

export interface HomepageFlowDailyRow {
  date: string
  visitors: number
  pageViews: number
  downloads: number
  exits: number
}

export interface HomepageFlowPageRow {
  path: string
  pageViews: number
  visitors: number
  avgDwellSeconds: number
  exits: number
  exitRate: number
}

export interface HomepageFlowStepRow {
  path: string
  label: string
  count: number
  share: number
}

export interface HomepageFlowDownloadRow {
  asset: string
  source: string | null
  count: number
  lastSeen: string | null
}

export interface HomepageFlowPayload {
  rangeDays: HomepageFlowRangeDays
  timezone: "Asia/Seoul"
  generatedAt: string
  totals: {
    visitors: number
    pageViews: number
    homeVisitors: number
    homePageViews: number
    downloads: number
    exits: number
    avgDwellSeconds: number
  }
  daily: HomepageFlowDailyRow[]
  nextStepsFromHome: HomepageFlowStepRow[]
  topPages: HomepageFlowPageRow[]
  highDwellPages: HomepageFlowPageRow[]
  exitPages: HomepageFlowPageRow[]
  downloads: HomepageFlowDownloadRow[]
}

const TIME_ZONE = "Asia/Seoul"
const KST_OFFSET_MS = 9 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const FLOW_WINDOW_MS = 30 * 60 * 1000
const MAX_DWELL_MS = 30 * 60 * 1000
const ALLOWED_RANGES: HomepageFlowRangeDays[] = [7, 14, 30, 90]

export function parseHomepageFlowRange(value: string | null): HomepageFlowRangeDays {
  const parsed = value ? parseInt(value, 10) : NaN
  return ALLOWED_RANGES.includes(parsed as HomepageFlowRangeDays)
    ? (parsed as HomepageFlowRangeDays)
    : 30
}

function kstDateKey(date: Date) {
  return new Date(date.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10)
}

function kstDayStartUtc(date: Date) {
  return new Date(`${kstDateKey(date)}T00:00:00.000+09:00`)
}

export function getHomepageFlowSinceIso(rangeDays: HomepageFlowRangeDays, now = new Date()) {
  const todayStart = kstDayStartUtc(now)
  return new Date(todayStart.getTime() - (rangeDays - 1) * DAY_MS).toISOString()
}

function makeDayBuckets(rangeDays: HomepageFlowRangeDays, now = new Date()) {
  const todayStart = kstDayStartUtc(now)
  return Array.from({ length: rangeDays }, (_, index) => {
    const date = kstDateKey(new Date(todayStart.getTime() - (rangeDays - 1 - index) * DAY_MS))
    return {
      date,
      visitors: 0,
      pageViews: 0,
      downloads: 0,
      exits: 0,
    }
  })
}

function normalizePath(value: unknown) {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!trimmed) return null

  try {
    const url = trimmed.startsWith("http") ? new URL(trimmed) : new URL(trimmed, "https://classin.kr")
    const path = url.pathname || "/"
    return path === "" ? "/" : path
  } catch {
    const path = trimmed.split("?")[0]?.trim()
    if (!path) return null
    return path.startsWith("/") ? path : `/${path}`
  }
}

function pagePath(row: ClientEventRow) {
  return normalizePath(row.params?.path) ?? normalizePath(row.page) ?? "/"
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function dwellMs(row: ClientEventRow) {
  const duration = readNumber(row.params?.duration_ms)
  if (!duration || duration < 1000 || duration > MAX_DWELL_MS) return null
  return duration
}

function percent(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : 0
}

function averageSeconds(values: number[]) {
  if (values.length === 0) return 0
  const averageMs = values.reduce((sum, value) => sum + value, 0) / values.length
  return Math.round(averageMs / 1000)
}

function displayPath(path: string) {
  if (path === "__exit__") return "사이트 이탈"
  return path
}

export function buildHomepageFlowFromRows(
  rows: ClientEventRow[],
  rangeDays: HomepageFlowRangeDays,
  now = new Date()
): HomepageFlowPayload {
  const days = makeDayBuckets(rangeDays, now)
  const dayMap = new Map(days.map((day) => [day.date, day]))
  const dailyVisitors = new Map<string, Set<string>>()
  const totalVisitors = new Set<string>()
  const homeVisitors = new Set<string>()
  const pageViews = new Map<string, { count: number; visitors: Set<string> }>()
  const dwellByPath = new Map<string, number[]>()
  const exitsByPath = new Map<string, number>()
  const downloads = new Map<string, HomepageFlowDownloadRow>()
  const pageViewsByVisitor = new Map<string, ClientEventRow[]>()

  let totalPageViews = 0
  let homePageViews = 0
  let totalDownloads = 0
  let totalExits = 0

  const sortedRows = [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at))

  for (const row of sortedRows) {
    const createdAt = new Date(row.created_at)
    if (Number.isNaN(createdAt.getTime())) continue
    const date = kstDateKey(createdAt)
    const day = dayMap.get(date)

    if (row.event_name === "page_view") {
      const path = pagePath(row)
      const anonymousId = row.anonymous_id?.trim() || null
      totalPageViews += 1
      if (day) day.pageViews += 1
      if (path === "/") homePageViews += 1

      const page = pageViews.get(path) ?? { count: 0, visitors: new Set<string>() }
      page.count += 1
      if (anonymousId) page.visitors.add(anonymousId)
      pageViews.set(path, page)

      if (anonymousId) {
        totalVisitors.add(anonymousId)
        if (path === "/") homeVisitors.add(anonymousId)
        if (!dailyVisitors.has(date)) dailyVisitors.set(date, new Set())
        dailyVisitors.get(date)?.add(anonymousId)

        if (!pageViewsByVisitor.has(anonymousId)) pageViewsByVisitor.set(anonymousId, [])
        pageViewsByVisitor.get(anonymousId)?.push(row)
      }
    }

    if (row.event_name === "download_materials") {
      totalDownloads += 1
      if (day) day.downloads += 1

      const asset =
        readString(row.params?.asset_id) ??
        readString(row.params?.lead_magnet) ??
        "unknown"
      const source = readString(row.params?.source) ?? normalizePath(row.page)
      const current = downloads.get(asset) ?? {
        asset,
        source,
        count: 0,
        lastSeen: null,
      }
      current.count += 1
      if (!current.lastSeen || row.created_at > current.lastSeen) current.lastSeen = row.created_at
      downloads.set(asset, current)
    }

    if (row.event_name === "page_exit") {
      const path = pagePath(row)
      const duration = dwellMs(row)
      if (duration) {
        if (!dwellByPath.has(path)) dwellByPath.set(path, [])
        dwellByPath.get(path)?.push(duration)
      }

      const exitType = readString(row.params?.exit_type)
      if (exitType && exitType !== "route_change") {
        totalExits += 1
        if (day) day.exits += 1
        exitsByPath.set(path, (exitsByPath.get(path) ?? 0) + 1)
      }
    }
  }

  for (const day of days) {
    day.visitors = dailyVisitors.get(day.date)?.size ?? 0
  }

  const allDwellSamples = [...dwellByPath.values()].flat()
  const pageRows = Array.from(pageViews.entries())
    .map(([path, value]) => {
      const exits = exitsByPath.get(path) ?? 0
      return {
        path,
        pageViews: value.count,
        visitors: value.visitors.size,
        avgDwellSeconds: averageSeconds(dwellByPath.get(path) ?? []),
        exits,
        exitRate: percent(exits, value.count),
      }
    })
    .sort((a, b) => b.pageViews - a.pageViews)

  const nextStepMap = new Map<string, number>()
  for (const visitorRows of pageViewsByVisitor.values()) {
    for (let index = 0; index < visitorRows.length; index += 1) {
      const current = visitorRows[index]
      if (pagePath(current) !== "/") continue

      const currentTime = new Date(current.created_at).getTime()
      const next = visitorRows
        .slice(index + 1)
        .find((candidate) => {
          const candidatePath = pagePath(candidate)
          const candidateTime = new Date(candidate.created_at).getTime()
          return candidatePath !== "/" && candidateTime - currentTime <= FLOW_WINDOW_MS
        })
      const nextPath = next ? pagePath(next) : "__exit__"
      nextStepMap.set(nextPath, (nextStepMap.get(nextPath) ?? 0) + 1)
    }
  }

  const nextStepTotal = Array.from(nextStepMap.values()).reduce((sum, count) => sum + count, 0)
  const nextStepsFromHome = Array.from(nextStepMap.entries())
    .map(([path, count]) => ({
      path,
      label: displayPath(path),
      count,
      share: percent(count, nextStepTotal),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)

  return {
    rangeDays,
    timezone: TIME_ZONE,
    generatedAt: now.toISOString(),
    totals: {
      visitors: totalVisitors.size,
      pageViews: totalPageViews,
      homeVisitors: homeVisitors.size,
      homePageViews,
      downloads: totalDownloads,
      exits: totalExits,
      avgDwellSeconds: averageSeconds(allDwellSamples),
    },
    daily: days,
    nextStepsFromHome,
    topPages: pageRows.slice(0, 10),
    highDwellPages: pageRows
      .filter((row) => row.avgDwellSeconds > 0)
      .sort((a, b) => b.avgDwellSeconds - a.avgDwellSeconds || b.pageViews - a.pageViews)
      .slice(0, 10),
    exitPages: pageRows
      .filter((row) => row.exits > 0)
      .sort((a, b) => b.exits - a.exits || b.exitRate - a.exitRate)
      .slice(0, 10),
    downloads: Array.from(downloads.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
  }
}

export async function getAdminHomepageFlow(rangeDays: HomepageFlowRangeDays) {
  const sinceIso = getHomepageFlowSinceIso(rangeDays)
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("client_events")
    .select("event_name, page, params, anonymous_id, created_at")
    .in("event_name", ["page_view", "download_materials", "page_exit"])
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(100000)

  if (error) throw error
  return buildHomepageFlowFromRows((data ?? []) as ClientEventRow[], rangeDays)
}
