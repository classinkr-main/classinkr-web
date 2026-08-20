// lib/marketing/perf.ts
// 퍼포먼스 대시보드 순수 계산 — 기간 해석·전기 대비 델타·캠페인 페이싱·일자 시리즈.
// 정직 규칙: 분모 0/미측정 은 0% 가 아니라 null. 통화 혼합 집행률은 호출부에서 null 로 들어온다.

export type PerfPeriodKey = "7d" | "30d" | "90d" | "quarter"

export interface PerfPeriod {
  key: PerfPeriodKey
  since: string
  until: string
  prevSince: string
  prevUntil: string
}

const DAY_MS = 86_400_000

function toDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`)
}
function toIso(d: Date): string {
  return d.toISOString().slice(0, 10)
}
function shiftDays(iso: string, days: number): string {
  return toIso(new Date(toDate(iso).getTime() + days * DAY_MS))
}

/** today(YYYY-MM-DD, KST 기준 오늘) 를 끝점으로 기간과 직전 동일 길이 기간을 해석한다. */
export function resolvePerfPeriod(key: PerfPeriodKey, today: string): PerfPeriod {
  let since: string
  if (key === "quarter") {
    const d = toDate(today)
    const qStartMonth = Math.floor(d.getUTCMonth() / 3) * 3
    since = toIso(new Date(Date.UTC(d.getUTCFullYear(), qStartMonth, 1)))
  } else {
    const days = key === "7d" ? 7 : key === "90d" ? 90 : 30
    since = shiftDays(today, -(days - 1))
  }
  const lengthDays = Math.round((toDate(today).getTime() - toDate(since).getTime()) / DAY_MS) + 1
  const prevUntil = shiftDays(since, -1)
  const prevSince = shiftDays(prevUntil, -(lengthDays - 1))
  return { key, since, until: today, prevSince, prevUntil }
}

/** 전기 대비 증감률(%). 이전이 0/null 이거나 현재가 null 이면 null. */
export function computeDeltaPct(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null || previous === 0) return null
  return Math.round(((current - previous) / previous) * 100)
}

export interface PacingInput {
  startsAt: string | null
  endsAt: string | null
  today: string
  spend: number | null // 예산과 같은 통화일 때만 값, 아니면 null
  budget: number | null
}

export interface Pacing {
  elapsedPct: number | null // 기간 경과율 0~100 (기간 미설정 시 null)
  executionPct: number | null // 집행률 (spend/budget, 통화 정합 시만)
}

export function computePacing({ startsAt, endsAt, today, spend, budget }: PacingInput): Pacing {
  let elapsedPct: number | null = null
  if (startsAt && endsAt) {
    const start = toDate(startsAt).getTime()
    const end = toDate(endsAt).getTime() + DAY_MS // endsAt 당일 포함
    const now = toDate(today).getTime() + DAY_MS / 2
    if (end > start) {
      elapsedPct = Math.round(Math.min(1, Math.max(0, (now - start) / (end - start))) * 100)
    }
  }
  const executionPct =
    spend != null && budget != null && budget > 0 ? Math.round((spend / budget) * 100) : null
  return { elapsedPct, executionPct }
}

export interface DailyPoint {
  date: string
  spend: number
  leads: number
}

/** 캠페인별 일자 행을 날짜로 접어 spend/leads 합산 시리즈로 만든다(date asc). */
export function aggregateDailySeries(
  rows: Array<{ date: string; spend: number; leads: number }>
): DailyPoint[] {
  const byDate = new Map<string, DailyPoint>()
  for (const row of rows) {
    const point = byDate.get(row.date) ?? { date: row.date, spend: 0, leads: 0 }
    point.spend += row.spend
    point.leads += row.leads
    byDate.set(row.date, point)
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}
