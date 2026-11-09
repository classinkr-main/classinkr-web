import "server-only"

import { unstable_cache } from "next/cache"

import { getVisitorStatsSinceIso, type VisitorStatsRangeDays } from "@/lib/admin-visitor-stats"

/** 서버의 HTML 요청 건수. 사람 수나 분석 동의 상태는 알 수 없다. */
export interface PublicPageRequests {
  rangeDays: number
  timezone: "Asia/Seoul"
  generatedAt: string
  total: number
  today: number
  daily: Array<{ date: string; requests: number }>
}

const TEAM_ID = "team_W39YZVJ5OewACs3sFThsXOEv"
const PROJECT_ID = "prj_iZkSESk178bnLeCUF5MAfu1dPAvs"
const DAY_MS = 86_400_000

// HTML 응답만 센다. 클라이언트 탐색, 브라우저 캐시, 미확인 봇 등으로 사람 수와 다르다.
// 토큰과 원본 요청/IP/URL은 응답·로그·브라우저에 내보내지 않는다.
export const PUBLIC_PAGE_REQUEST_FILTER = [
  "request_hostname eq 'classin.co.kr'",
  "request_method eq 'GET'",
  "is_prefetch_request eq ''",
  "bot_verified eq ''",
  "startswith(content_type, 'text/html')",
  "not startswith(request_path, '/admin')",
  "not startswith(request_path, '/api/')",
  "not startswith(request_path, '/_next/')",
  "not startswith(request_path, '/share')",
  "not startswith(request_path, '/account')",
  "not startswith(request_path, '/auth')",
  "not startswith(request_path, '/login')",
  "not startswith(request_path, '/signup')",
  "not startswith(request_path, '/forgot-password')",
  "not startswith(request_path, '/unsubscribe')",
  "not startswith(request_path, '/receipt')",
  "http_status ge 200",
  "http_status lt 400",
].join(" and ")

type ObservabilityResponse = {
  data?: unknown
  summary?: unknown
}

export function mergePublicPageRequestChunks(
  results: ObservabilityResponse[],
  rangeDays: VisitorStatsRangeDays,
  now: Date
): PublicPageRequests {
  const rows = results.flatMap((result) => result.data as unknown[])
  const total = results.reduce((sum, result) => sum + ((result.summary as Array<Record<string, number>>)[0].vercel_request_count_sum), 0)
  return parsePublicPageRequests({ data: rows, summary: [{ vercel_request_count_sum: total }] }, rangeDays, now)
}

export function parsePublicPageRequests(
  response: ObservabilityResponse,
  rangeDays: VisitorStatsRangeDays,
  now: Date
): PublicPageRequests {
  if (!Array.isArray(response.data) || !Array.isArray(response.summary) || response.summary.length !== 1) {
    throw new Error("Invalid request metrics response")
  }
  const total = (response.summary[0] as Record<string, unknown>)?.vercel_request_count_sum
  if (typeof total !== "number" || !Number.isSafeInteger(total) || total < 0) {
    throw new Error("Invalid request metrics total")
  }
  const start = new Date(getVisitorStatsSinceIso(rangeDays, now)).getTime()
  const byDate = new Map<string, number>()
  const seenDates = new Set<string>()
  for (let index = 0; index < rangeDays; index++) {
    const date = new Date(start + index * DAY_MS + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
    byDate.set(date, 0)
  }
  for (const item of response.data) {
    if (!item || typeof item !== "object") throw new Error("Invalid request metrics row")
    const row = item as Record<string, unknown>
    const timestamp = typeof row.timestamp === "string" ? Date.parse(row.timestamp) : NaN
    const value = row.vercel_request_count_sum
    if (!Number.isFinite(timestamp) || typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
      throw new Error("Invalid request metrics row")
    }
    const date = new Date(timestamp + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
    if (!byDate.has(date) || seenDates.has(date)) throw new Error("Unexpected request metrics bucket")
    seenDates.add(date)
    byDate.set(date, value)
  }
  const daily = Array.from(byDate, ([date, requests]) => ({ date, requests }))
  if (daily.reduce((sum, day) => sum + day.requests, 0) !== total) {
    throw new Error("Incomplete request metrics response")
  }
  return { rangeDays, timezone: "Asia/Seoul", generatedAt: now.toISOString(), total, today: daily.at(-1)?.requests ?? 0, daily }
}

async function fetchPublicPageRequests(rangeDays: VisitorStatsRangeDays): Promise<PublicPageRequests> {
  const token = process.env.VERCEL_TRAFFIC_TOKEN
  // 이 API의 관측 보존 기간은 현재 최대 36일이다. 90일 결과를 부분 수치로 표시하지 않는다.
  if (!token || rangeDays > 30) throw new Error("Request metrics unavailable")
  const now = new Date()
  const start = Date.parse(getVisitorStatsSinceIso(rangeDays, now))
  // 긴 단일 조회는 Vercel 자체 25초 제한에 걸린다. KST 경계에서 7일씩 나눠 병렬 조회한다.
  const chunks = Array.from({ length: Math.ceil(rangeDays / 7) }, (_, index) => {
    const from = start + index * 7 * DAY_MS
    const to = Math.min(from + 7 * DAY_MS, now.getTime())
    return { from, to }
  })
  const results = await Promise.all(chunks.map(async ({ from, to }) => {
    const response = await fetch(`https://api.vercel.com/v2/observability/query?teamId=${TEAM_ID}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        metric: "vercel.request.count",
        scope: { type: "project", ownerId: TEAM_ID, projectIds: [PROJECT_ID] },
        aggregation: "sum",
        granularity: { days: 1 },
        bucketTimezone: "Asia/Seoul",
        startTime: new Date(from).toISOString(),
        endTime: new Date(to).toISOString(),
        filter: PUBLIC_PAGE_REQUEST_FILTER,
        limit: 7,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(32_000),
    })
    if (!response.ok) throw new Error(`Request metrics HTTP ${response.status}`)
    const payload = await response.json() as ObservabilityResponse
    // 각 부분의 합계와 기간도 검증한다. 누락·중복된 부분을 합쳐 완전한 30일로 표시하지 않는다.
    const part = parsePublicPageRequests(payload, rangeDays, now)
    if (part.daily.some((day) => {
      const timestamp = Date.parse(`${day.date}T00:00:00+09:00`)
      return day.requests > 0 && (timestamp < from || timestamp >= to)
    })) throw new Error("Unexpected request metrics interval")
    return payload
  }))
  return mergePublicPageRequestChunks(results, rangeDays, now)
}

// 실패를 캐시하지 않는다. 자격증명 누락·권한·timeout도 0이 아닌 미상으로 표시한다.
const cachedRequests = unstable_cache(fetchPublicPageRequests, ["admin-public-page-requests-v1"], { revalidate: 120 })
const inFlight = new Map<VisitorStatsRangeDays, Promise<PublicPageRequests | null>>()

export async function getPublicPageRequests(rangeDays: VisitorStatsRangeDays): Promise<PublicPageRequests | null> {
  const existing = inFlight.get(rangeDays)
  if (existing) return existing
  const pending = cachedRequests(rangeDays).catch(() => null).finally(() => inFlight.delete(rangeDays))
  inFlight.set(rangeDays, pending)
  return pending
}
