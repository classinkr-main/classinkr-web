/**
 * 내부 CS 코파일럿 운영 계기판(계약 1) 조립기.
 *
 * repo(getInternalCsMetricsAggregate)가 DB 안에서 집계한 카운트·백분위를 받아 계약 shape 로 변환한다.
 * rate 는 분모가 0이면 null(빈 DB 안전 렌더). 마이그레이션 미적용 시 repo 가 빈 집계를 주므로
 * 이 조립기는 별도 분기 없이 동일하게 0/None shape 를 만든다.
 */

import "server-only"

import { unstable_cache } from "next/cache"
import { shareInFlightByArgs } from "@/lib/server/share-in-flight"
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

async function loadInternalCsMetrics(days: number): Promise<InternalCsMetrics> {
  const aggregate = await getInternalCsMetricsAggregate(days)
  return buildInternalCsMetrics(aggregate, Date.now())
}

/**
 * admin-performance-round3-2026-09-10.md §3.3 — route-local Map(metricsCache)은 Vercel
 * Fluid 콜드 인스턴스마다 비어 있었다. unstable_cache(Data Cache)로 교체해 인스턴스 간
 * 공유한다. TTL은 옛 METRICS_CACHE_TTL_MS와 같은 60초로 유지한다.
 *
 * 무효화 배선은 없다 — 이 조립이 읽는 원천(내부 상담 대화·리뷰·회귀 평가)의 쓰기 경로는
 * app/api/admin/cs-chat/conversations/**·regression-eval/** 등인데, 이번 라운드의 담당
 * 범위는 app/api/admin/cs-chat/metrics/**로 한정돼 그 쓰기 경로들을 배선할 권한이 없다
 * (다른 파트 소유 파일). TTL만이 신선도 수단이고, Phase 4 원칙(무효화 없으면 TTL을 올리지
 * 않는다)에 따라 60초를 그대로 둔다 — chatbot 파트 에이전트가 무효화를 배선하면 그때
 * TTL 상향을 재검토할 수 있다.
 */
export const INTERNAL_CS_METRICS_CACHE_TAG = "internal-cs-metrics"

const getCachedInternalCsMetrics = unstable_cache(
  shareInFlightByArgs("internal-cs-metrics-v1", loadInternalCsMetrics),
  ["internal-cs-metrics-v1"],
  { revalidate: 60, tags: [INTERNAL_CS_METRICS_CACHE_TAG] }
)

export async function getInternalCsMetrics(days: number, nowMs?: number): Promise<InternalCsMetrics> {
  // nowMs는 테스트 전용 결정론 경로다(회귀 스냅샷이 "지금"에 좌우되면 안 된다) — 캐시를
  // 거치지 않고 항상 재계산한다(기존 동작 그대로 유지).
  if (nowMs !== undefined) {
    const aggregate = await getInternalCsMetricsAggregate(days)
    return buildInternalCsMetrics(aggregate, nowMs)
  }
  return getCachedInternalCsMetrics(days)
}
