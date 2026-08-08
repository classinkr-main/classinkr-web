/**
 * 내부 CS 코파일럿 운영 계기판(계약 1) 조립기.
 *
 * repo(getInternalCsMetricsAggregate)가 DB 안에서 집계한 카운트·백분위를 받아 계약 shape 로 변환한다.
 * rate 는 분모가 0이면 null(빈 DB 안전 렌더). 마이그레이션 미적용 시 repo 가 빈 집계를 주므로
 * 이 조립기는 별도 분기 없이 동일하게 0/None shape 를 만든다.
 */

import "server-only"

import {
  getInternalCsMetricsAggregate,
  type InternalCsMetricsAggregate,
} from "@/lib/repositories/internal-cs-chat"

const MS_PER_DAY = 86_400_000

export interface InternalCsMetrics {
  range: { days: number; from: string; to: string }
  volume: { questions: number; conversations: number }
  fallbackRate: number | null
  evidenceMix: { knowledge: number; docs: number; channel: number; none: number }
  review: {
    approved: number
    changesRequested: number
    pending: number
    approvalRate: number | null
  }
  regression: {
    notEvaluated: number
    pass: number
    needsFix: number
    promoted: number
    excluded: number
  }
  leadTimeHours: { median: number | null; p90: number | null }
}

function rate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null
  return Math.round((numerator / denominator) * 10_000) / 10_000
}

function roundHours(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null
  return Math.round(value * 100) / 100
}

export function buildInternalCsMetrics(
  aggregate: InternalCsMetricsAggregate,
  nowMs: number
): InternalCsMetrics {
  const days = aggregate.days
  const to = new Date(nowMs).toISOString()
  const from = new Date(nowMs - days * MS_PER_DAY).toISOString()

  return {
    range: { days, from, to },
    volume: { questions: aggregate.questions, conversations: aggregate.conversations },
    fallbackRate: rate(aggregate.assistantDeterministic, aggregate.assistantTotal),
    evidenceMix: {
      knowledge: aggregate.evidenceKnowledge,
      docs: aggregate.evidenceDocs,
      channel: aggregate.evidenceChannel,
      none: aggregate.evidenceNone,
    },
    review: {
      approved: aggregate.reviewApproved,
      changesRequested: aggregate.reviewChangesRequested,
      pending: aggregate.reviewPending,
      // 판정된 초안(승인+수정요청) 중 승인 비율. 미판정(pending)은 분모에서 제외한다.
      approvalRate: rate(
        aggregate.reviewApproved,
        aggregate.reviewApproved + aggregate.reviewChangesRequested
      ),
    },
    regression: {
      notEvaluated: aggregate.regressionNotEvaluated,
      pass: aggregate.regressionPass,
      needsFix: aggregate.regressionNeedsFix,
      promoted: aggregate.regressionPromoted,
      excluded: aggregate.regressionExcluded,
    },
    leadTimeHours: {
      median: roundHours(aggregate.leadTimeMedianHours),
      p90: roundHours(aggregate.leadTimeP90Hours),
    },
  }
}

const METRICS_CACHE_TTL_MS = 60_000
interface CachedMetricsEntry {
  data: InternalCsMetrics
  fetchedAt: number
}
const metricsCache = new Map<number, CachedMetricsEntry>()

export async function getInternalCsMetrics(days: number, nowMs?: number): Promise<InternalCsMetrics> {
  const now = nowMs ?? Date.now()
  if (!nowMs) {
    const cached = metricsCache.get(days)
    if (cached && now - cached.fetchedAt < METRICS_CACHE_TTL_MS) {
      return cached.data
    }
  }

  const aggregate = await getInternalCsMetricsAggregate(days)
  const result = buildInternalCsMetrics(aggregate, now)
  if (!nowMs) {
    metricsCache.set(days, { data: result, fetchedAt: now })
  }
  return result
}
