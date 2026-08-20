// lib/marketing/perf.ts
// 퍼포먼스 대시보드 순수 계산 — 기간 해석·전기 대비 델타·캠페인 페이싱·일자 시리즈 + 응답 계약.
// 정직 규칙: 분모 0/미측정 은 0% 가 아니라 null. 통화 혼합 집행률은 호출부에서 null 로 들어온다.
// 순수 모듈 유지 — 서버 전용 import 금지(순수 모듈·타입/상수만 허용). 조립은 perf-assemble.ts.

import { getLeadSourceGroup, isTestLead, type LeadSourceGroup } from "@/lib/crm/lead-attribution"
import type { LeadRecord } from "@/lib/repositories/leads"
import { AD_CHANNELS, type AdChannel } from "@/lib/types/event-metrics"
import type { CampaignUpdate } from "@/lib/types/marketing-campaign"

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
/** ISO 일자(YYYY-MM-DD)를 ±days 만큼 이동한다 — 조립부(스파크라인 창 계산)와 공유. */
export function shiftDays(iso: string, days: number): string {
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

/* ─── 캠페인 페이싱 통화 결정 ─────────────────────────────────── */

export interface PacingBasisInput {
  /** 캠페인의 채널 실행 링크 — refType/refId 만 본다. */
  links: ReadonlyArray<{ refType: string; refId: string }>
  /** 캠페인 KRW 배정 예산(marketing_campaigns.budget). */
  budgetKrw: number | null
  /** Meta 캠페인 id → lifetimeBudget(계정 통화 네이티브). 대시보드 소스 실패 시 null. */
  metaLifetimeBudgetById: ReadonlyMap<string, number | null> | null
  /** Meta 계정 통화가 실제 USD 인가 — 아니면 "USD" 라벨을 지어내지 않는다(라벨 조작 금지). */
  metaBudgetIsUsd: boolean
  /** 현재 기간 링크된 Meta spend 합(USD). insights 소스 실패 시 null(거짓 0% 방지). */
  metaSpendUsd: number | null
  /** eventId → KRW 광고비 합(행사 수기 입력). event-metrics 소스 실패 시 null. */
  eventAdSpend: Record<string, number> | null
}

export interface PacingBasis {
  spend: number | null
  budget: number | null
  currency: "USD" | "KRW" | null
}

/**
 * 캠페인 페이싱(집행률)의 분자·분모·통화 축을 결정한다 — 혼합 통화 집행률 금지:
 *  (1) 링크가 전부 Meta 이고 계정 통화 USD·lifetimeBudget 합>0 → USD 기준.
 *      분자는 조회 기간의 Meta spend — lifetime 예산 대비 과소 방향이라 과대포장 없음.
 *  (2) 캠페인 KRW 예산>0 이고 event 링크가 있으면 → 링크된 행사 KRW 광고비 합 기준
 *      (동일 행사 중복 링크는 1회만 계상).
 *  (3) 둘 다 아니면 미산정(전부 null) — 기간 경과율은 호출부(computePacing)가 항상 계산한다.
 */
export function resolvePacingBasis(input: PacingBasisInput): PacingBasis {
  const metaRefIds: string[] = []
  const eventIds = new Set<string>()
  for (const link of input.links) {
    if (link.refType === "meta_campaign") metaRefIds.push(link.refId)
    else if (link.refType === "event") eventIds.add(link.refId)
  }

  const allMeta = input.links.length > 0 && metaRefIds.length === input.links.length
  if (allMeta && input.metaBudgetIsUsd && input.metaSpendUsd != null && input.metaLifetimeBudgetById) {
    let lifetimeSum = 0
    for (const id of metaRefIds) lifetimeSum += input.metaLifetimeBudgetById.get(id) ?? 0
    if (lifetimeSum > 0) {
      return { spend: input.metaSpendUsd, budget: lifetimeSum, currency: "USD" }
    }
  }

  if (input.budgetKrw != null && input.budgetKrw > 0 && eventIds.size > 0 && input.eventAdSpend) {
    let spendKrw = 0
    for (const id of eventIds) spendKrw += input.eventAdSpend[id] ?? 0
    return { spend: spendKrw, budget: input.budgetKrw, currency: "KRW" }
  }

  return { spend: null, budget: null, currency: null }
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

/* ─── 소스 그룹별 일자 유입 ───────────────────────────────────── */

/**
 * Recharts 스택 막대에 바로 먹이는 형태 — `[{ date: "2026-08-01", meta: 3, homepage: 1 }, …]`.
 * 리드가 있는 그룹 키만 존재하고(0 채움 없음 — 무근거 0 날조 방지), date 오름차순.
 * 그룹 축은 lead-attribution 의 SOURCE_GROUP_BY_SOURCE(7그룹) SSOT 를 그대로 쓴다.
 */
export type LeadDailyBySourcePoint = { date: string } & Partial<Record<LeadSourceGroup, number>>

/**
 * (KST 일자, 리드) 쌍을 일자 × 소스 그룹 카운트로 접는다(date asc). 테스트 리드는 호출부의
 * 선제외와 무관하게 여기서도 제외한다 — 대시보드 리드 집계 전체와 동일 기준(isTestLead).
 */
export function aggregateLeadDailyBySource(
  rows: Array<{ date: string; lead: LeadRecord }>
): LeadDailyBySourcePoint[] {
  const byDate = new Map<string, LeadDailyBySourcePoint>()
  for (const { date, lead } of rows) {
    if (isTestLead(lead)) continue
    const group = getLeadSourceGroup(lead)
    const point: LeadDailyBySourcePoint = byDate.get(date) ?? { date }
    point[group] = (point[group] ?? 0) + 1
    byDate.set(date, point)
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

/* ─── 채널별 KRW 집행 ─────────────────────────────────────────── */

/**
 * 행사 수기 광고비(event-metrics adSpendEntries — 전부 KRW)를 채널별 합으로 접는다.
 * 광고 탭 채널 예산·집행 표(app/admin/campaigns/page.tsx channelEfficiencyData)의 집행
 * 산식을 그대로 승격한 것 — 두 화면이 같은 숫자를 보게 한다.
 *
 * 정직 규칙:
 *  - 입력이 하나도 없는 채널은 0 이 아니라 null(미측정) — 집행 기록이 없는 채널을
 *    "0원 집행"으로 단정하지 않는다. 명시 입력된 0원은 측정값 0 으로 유지한다.
 *  - Meta 라이브 집행(계정 통화 USD)은 여기 절대 섞지 않는다 — 이 표의 meta 는
 *    행사 단위로 수기 입력된 KRW 광고비다(project-rollup 과 동일 원칙).
 *  - JSONB 원천이라 enum 밖 채널·비수치 금액은 무시한다(미지 채널을 '기타'로 안 부풀림).
 */
export function channelSpendFromEventMetrics(
  all: Record<string, { adSpendEntries?: ReadonlyArray<{ channel: AdChannel; amount: number }> | null }>
): Record<AdChannel, number | null> {
  const out = Object.fromEntries(AD_CHANNELS.map((c) => [c, null])) as Record<AdChannel, number | null>
  const known = new Set<string>(AD_CHANNELS)
  for (const metrics of Object.values(all)) {
    for (const entry of metrics.adSpendEntries ?? []) {
      if (!known.has(entry.channel)) continue
      if (typeof entry.amount !== "number" || !Number.isFinite(entry.amount)) continue
      out[entry.channel] = (out[entry.channel] ?? 0) + entry.amount
    }
  }
  return out
}

/* ─── perf API 응답 계약 ──────────────────────────────────────── */
// GET /api/admin/marketing/perf 의 응답 형태 — 조립(perf-assemble)과 UI 가 이 타입 하나를 본다.
// 통화 분리: Meta 금액은 USD 네이티브(KRW 환산·합산 금지), KRW 지표는 KRW 소스만 합산한다.

export interface PerfKpi {
  value: number | null
  previous: number | null
  deltaPct: number | null
  /** 값의 단위가 아니라 산정 기준 통화 축 — budgetExecutionPct 는 % 값이지만 KRW 축이다(% 에 통화 기호 금지). */
  currency?: "USD" | "KRW"
}

export interface PerfScoreboardRow {
  campaignId: string
  name: string
  status: string
  pacing: Pacing
  /** 집행률(pacing.executionPct)이 어느 통화 기준인지 — null 이면 통화 정합 실패로 미산정. */
  pacingCurrency: "USD" | "KRW" | null
  /** 링크된 Meta 캠페인의 일자 leads 합 — 캠페인 귀속이 가능한 유일 축이라 Meta 카운트를 쓴다. */
  leads: number
  /** USD — 링크된 Meta 일자 spend 합 / leads (분모 0 → null). */
  cpl: number | null
  /** 최근 14일 날짜별 leads. */
  sparkline: Array<{ date: string; leads: number }>
  latestUpdate: { body: string; kind: string; createdAt: string; createdBy: string | null } | null
  /** Phase 3 전까지 빈 배열. */
  anomalies: string[]
}

/**
 * 스코어보드 표시 정렬 — 리드 내림차순, 동률이면 이름 오름차순(로케일 비교).
 * API 반환 순서 그대로(사실상 무작위) 두면 성과 있는 캠페인이 목록에 파묻힌다
 * (컨트롤러 실측: 캠페인 18개 중 리드 있는 캠페인 4개가 순서 없이 흩어짐).
 */
export function sortScoreboardRows(rows: PerfScoreboardRow[]): PerfScoreboardRow[] {
  return [...rows].sort((a, b) => b.leads - a.leads || a.name.localeCompare(b.name, "ko"))
}

export interface MarketingPerfResponse {
  period: PerfPeriod
  snapshotAt: string | null
  kpis: {
    spendUsd: PerfKpi
    leads: PerfKpi
    cplUsd: PerfKpi
    /** 광고 리드 중 전환 비율(%) — lead-attribution isConvertedLead 정의. */
    leadConversionRate: PerfKpi
    /** KRW 배정 합 대비 KRW 집행 합(%) — 통화 분리, Meta USD 불포함. */
    budgetExecutionPct: PerfKpi
  }
  daily: DailyPoint[]
  scoreboard: PerfScoreboardRow[]
  /** 퍼널 5단 — contacted 는 누적 해석(신규 status 를 벗어난 광고 리드: 전환·종료 포함, ≥ convertedLeads). */
  funnel: {
    impressions: number
    clicks: number
    adLeads: number
    contacted: number
    convertedLeads: number
  }
  /** 현재 기간 소스 그룹별 일자 유입(테스트 리드 제외) — 리드가 있는 날만, 0 채움 없음. */
  leadDailyBySource: LeadDailyBySourcePoint[]
  channelMix: Array<{
    channel: string
    budget: number
    spendKrw: number | null
    /** meta 채널 행에만 — 현재 기간 Meta 라이브 집행(USD 네이티브, 통화 분리 유지). */
    metaSpendUsd: number | null
  }>
  updatesFeed: CampaignUpdate[]
}
