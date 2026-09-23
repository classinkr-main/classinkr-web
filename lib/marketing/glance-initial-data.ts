// lib/marketing/glance-initial-data.ts
// 한눈에 층 서버 프리페치 payload 의 계약 — 서버(lib/admin/marketing/glance-prefetch)와
// 클라이언트(SummaryTab·훅)가 같은 형태를 본다. 값 계산이 없는 타입 전용 모듈이라 "server-only" 를
// 두지 않는다(클라이언트 컴포넌트가 import type 으로 읽는다).

import type { AnomalyFlag } from "@/lib/marketing/anomaly"
import type { IntakeFeedResult } from "@/lib/marketing/intake-feed"
import type { MarketingPerfResponse } from "@/lib/marketing/perf"

/** /api/admin/marketing/insights 응답의 클라이언트 측 최소 사본 — 서버 계약의 정본은
 *  app/api/admin/marketing/insights/route.ts 다. 저장소 타입(lib/repositories/marketing-insights)은
 *  server-only 모듈이라 클라이언트 컴포넌트에서 직접 import 하지 않는다. */
export interface MarketingInsightRecord {
  headline: string
  created_at: string
  payload: {
    highlights?: string[]
    next_actions?: Array<{ title?: string; why?: string }>
    /** 브리핑이 실제로 본 기간 — 대시보드 토글과 무관하다(브리핑은 항상 30일 기준). */
    period?: { key?: string }
  }
}

export interface MarketingInsightsResponse {
  insight: MarketingInsightRecord | null
  /** 브리핑 신선도와 무관한 "현재" 이상 신호 — 서버가 매 요청 계산한다. */
  anomalies: AnomalyFlag[]
  from?: string
  warnings?: number
  error?: string
}

export interface MarketingGlanceInitialData {
  /** 요청된 기간(?perf=)의 perf 응답. 예산 초과·역할 부족·실패는 null. */
  perf: MarketingPerfResponse | null
  insights: MarketingInsightsResponse | null
  intake: IntakeFeedResult | null
  /** 프리페치가 서버에서 settle 된 시각(ms epoch). 0 = 프리페치 없음. */
  generatedAt: number
}

export const EMPTY_MARKETING_GLANCE_INITIAL_DATA: MarketingGlanceInitialData = {
  perf: null,
  insights: null,
  intake: null,
  generatedAt: 0,
}
