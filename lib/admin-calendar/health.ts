/**
 * health.ts — 캘린더 소스 연결 상태 파생
 *
 * "일정이 없는 것"과 "연동이 끊긴 것"은 화면에서 구분돼야 한다(2026-08-19 결정).
 * 이 파일은 각 소스의 원시 사실(개수·마지막 날짜·접근 가능 인원)을 받아
 * 상태(ok/stale/dead)와 사람이 읽는 한 줄 설명으로 바꾼다. 순수 함수만 둔다 —
 * 사실 수집은 /api/admin/calendar/health 라우트가 담당한다.
 */
import type { EventSource } from "@/lib/calendar-data"

export type SourceHealthStatus = "ok" | "stale" | "dead"

/**
 * 소스별 실측(관측 전용). status/headline 판정에는 관여하지 않는다 —
 * "왜 느린가"를 답하기 위한 부가 정보이며, 화면은 무시해도 된다.
 */
export interface SourceTiming {
  /** 이번 점검에서 그 소스를 기다린 시간(ms) */
  durationMs: number
  /** 돌려준 데이터의 캐시 나이(ms). null = 캐시를 두지 않는 소스(Supabase 직조회) */
  ageMs: number | null
  /** 확정된 최신이 아님(콜드 실패·마감 초과·직전 갱신 실패) */
  degraded: boolean
}

export interface SourceHealth {
  source: EventSource
  status: SourceHealthStatus
  /** 칩·수리 패널에 그대로 노출되는 짧은 상태 문구 */
  headline: string
  /** 근거 날짜 등 보조 문구 */
  detail?: string
  /** 원본으로 가는 수리 링크(없으면 화면 밖 과제) */
  href?: string
  /** 소스별 타이밍·캐시 상태(관측 전용, 없을 수 있음) */
  timing?: SourceTiming
}

export interface CalendarHealthPayload {
  checkedAt: string
  sources: SourceHealth[]
}

/** "MM/DD" — 상태 문구에 넣는 짧은 날짜 */
export function shortDate(date: string): string {
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`
}

/** 달력 월 차이. 2026-05-xx → 2026-08-xx = 3 */
export function monthsBetween(from: string, to: string): number {
  const fromMonths = Number(from.slice(0, 4)) * 12 + Number(from.slice(5, 7))
  const toMonths = Number(to.slice(0, 4)) * 12 + Number(to.slice(5, 7))
  return Math.max(0, toMonths - fromMonths)
}

export function daysBetweenDates(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

/** 이벤트 날짜 배열을 "오늘 기준 마지막 과거 / 첫 미래"로 요약 */
export function summarizeDates(dates: string[], today: string): {
  lastPast: string | null
  nextFuture: string | null
} {
  let lastPast: string | null = null
  let nextFuture: string | null = null
  for (const date of dates) {
    if (date <= today) {
      if (!lastPast || date > lastPast) lastPast = date
    } else if (!nextFuture || date < nextFuture) {
      nextFuture = date
    }
  }
  return { lastPast, nextFuture }
}

/** 사람이 입력하는 저장형 소스(팀 일정·파트너 일정) — 전체 개수가 진실 */
export function deriveStoredHealth(input: {
  source: EventSource
  count: number
  lastDate: string | null
  href?: string
}): SourceHealth {
  if (input.count === 0) {
    return { source: input.source, status: "dead", headline: "입력 없음", href: input.href }
  }
  return {
    source: input.source,
    status: "ok",
    headline: "정상",
    detail: input.lastDate ? `마지막 ${shortDate(input.lastDate)}` : undefined,
    href: input.href,
  }
}

/** 공개 행사 — 미래 회차가 있으면 정상, 전부 과거면 그 사실을 말한다 */
export function derivePublicEventsHealth(input: {
  dates: string[]
  today: string
  href?: string
}): SourceHealth {
  const { lastPast, nextFuture } = summarizeDates(input.dates, input.today)
  if (input.dates.length === 0) {
    return { source: "event", status: "dead", headline: "등록 없음", href: input.href }
  }
  if (nextFuture) {
    return {
      source: "event",
      status: "ok",
      headline: "정상",
      detail: `다음 ${shortDate(nextFuture)}`,
      href: input.href,
    }
  }
  return {
    source: "event",
    status: "stale",
    headline: "전부 과거",
    detail: lastPast ? `마지막 ${shortDate(lastPast)}` : undefined,
    href: input.href,
  }
}

/** 외부 피드(노션·쇼룸) — 조회 윈도 안에서 최근성만 판단한다 */
export function deriveFeedHealth(input: {
  source: EventSource
  dates: string[]
  today: string
  /** 라우트가 과거로 몇 개월을 조회했는지 — "N개월+ 없음" 문구의 정직한 하한 */
  lookbackMonths: number
  /** 이 일수 안에 과거 유입이 있으면 정상으로 본다 */
  staleAfterDays?: number
  href?: string
}): SourceHealth {
  const staleAfterDays = input.staleAfterDays ?? 45
  const { lastPast, nextFuture } = summarizeDates(input.dates, input.today)

  if (nextFuture) {
    return {
      source: input.source,
      status: "ok",
      headline: "정상",
      detail: `다음 ${shortDate(nextFuture)}`,
      href: input.href,
    }
  }
  if (!lastPast) {
    return {
      source: input.source,
      status: "dead",
      headline: `${input.lookbackMonths}개월+ 없음`,
      href: input.href,
    }
  }
  if (daysBetweenDates(lastPast, input.today) <= staleAfterDays) {
    return {
      source: input.source,
      status: "ok",
      headline: "정상",
      detail: `마지막 ${shortDate(lastPast)}`,
      href: input.href,
    }
  }
  const months = monthsBetween(lastPast, input.today)
  return {
    source: input.source,
    status: "stale",
    headline: months >= 1 ? `${months}개월째 없음` : "유입 끊김",
    detail: `마지막 ${shortDate(lastPast)}`,
    href: input.href,
  }
}

/** 팀원 구글 캘린더 — 공유(접근) 가능 인원이 진실 */
export function deriveTeamAccessHealth(input: {
  configured: number
  accessible: number | null
}): SourceHealth {
  if (input.configured === 0) {
    return { source: "team_event", status: "dead", headline: "구성 없음" }
  }
  if (input.accessible === null) {
    // 프로브 실패(자격 문제 등) — 모른다고 말한다. 죽었다고 단정하지 않는다.
    return { source: "team_event", status: "stale", headline: "확인 불가" }
  }
  if (input.accessible === 0) {
    return {
      source: "team_event",
      status: "dead",
      headline: `${input.configured}명 공유 필요`,
      detail: "서비스 계정에 캘린더 공유",
    }
  }
  if (input.accessible < input.configured) {
    return {
      source: "team_event",
      status: "stale",
      headline: `${input.configured - input.accessible}명 공유 필요`,
      detail: `${input.accessible}/${input.configured}명 연결됨`,
    }
  }
  return { source: "team_event", status: "ok", headline: "정상", detail: `${input.configured}명 연결됨` }
}
