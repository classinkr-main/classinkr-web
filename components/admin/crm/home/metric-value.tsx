"use client"

// CRM 홈 — "0 대신 확인 불가" 3분기 헬퍼(UX 규약 3).
//
// 히어로 KPI 카드·리드 요약 타일/힌트가 같은 규칙으로 값을 그린다:
//   loading     → 값 자리 크기의 스켈레톤(콜드 로드 '...' 금지, CRM-5)
//   unavailable → 실패·부분 실패 상태. 숫자를 0으로 대체하지 않고 '—'(또는 '확인 불가')를 danger 톤으로 그린다.
//   ready       → 포맷터 결과
// formatNumber(undefined)가 '0'을 돌려주는 shared.tsx 규칙은 "값이 실제로 0"일 때만 통과해야 하므로,
// 소비처는 반드시 이 헬퍼로 상태를 먼저 판정한다(home-01·home-05).

import type { ReactNode } from "react"

import { STATUS_TONE_TEXT_CLASS } from "@/lib/crm/status-tone"

import { ValueSkeleton } from "./shared"

export type MetricState = "loading" | "unavailable" | "ready"

/** 실패를 '없음'으로 그리지 않는 SR·시각 공통 라벨. */
export const METRIC_UNAVAILABLE_LABEL = "확인 불가"

/**
 * 소스 하나의 표시 상태를 판정한다.
 *  - 데이터가 아직 없고 로딩 중이면 loading
 *  - 데이터가 없거나(요청 실패) 데이터 자체가 부분 실패(ok=false)를 알리면 unavailable
 *  - 그 외 ready
 */
export function resolveMetricState(input: {
  loading: boolean
  hasData: boolean
  /** 응답은 왔지만 해당 원천이 ok=false 로 폴백된 경우(예: neoCrm.ok === false). */
  partialFailure?: boolean
}): MetricState {
  if (input.loading && !input.hasData) return "loading"
  // 데이터가 없는데 로딩도 아니면 요청이 실패한 것이다 — 0 이 아니라 확인 불가.
  if (!input.hasData) return "unavailable"
  if (input.partialFailure) return "unavailable"
  return "ready"
}

export interface MetricValueOptions {
  /** 스켈레톤 크기(값 자리 레이아웃과 일치시킨다). */
  skeletonClassName?: string
  /** unavailable 표시 글자('—' 기본). 힌트 줄처럼 문맥이 필요한 곳은 '확인 불가'. */
  unavailableText?: string
  /** unavailable 표시의 추가 클래스(크기·굵기). 색은 항상 danger 톤. */
  unavailableClassName?: string
}

/**
 * 상태에 따라 값 노드를 돌려준다. `format` 은 ready 일 때만 호출되므로
 * `formatNumber(undefined)` 같은 0 폴백이 실패 상태에서 새어 나오지 않는다.
 */
export function metricValue(state: MetricState, format: () => ReactNode, options: MetricValueOptions = {}): ReactNode {
  if (state === "loading") return <ValueSkeleton className={options.skeletonClassName ?? "h-6 w-20"} />
  if (state === "unavailable") {
    return (
      <span
        role="img"
        aria-label={METRIC_UNAVAILABLE_LABEL}
        title={METRIC_UNAVAILABLE_LABEL}
        data-metric-state="unavailable"
        className={`${STATUS_TONE_TEXT_CLASS.danger} ${options.unavailableClassName ?? ""}`}
      >
        {options.unavailableText ?? "—"}
      </span>
    )
  }
  return format()
}
