// CRM T1 — 리드 상태(4) → 딜 단계(7)를 한 축으로 잇는 단계 퍼널. 순수 함수만 둔다(서버·클라 공용).
//
// 누적 규칙이 두 갈래로 다르다는 점이 이 파일의 핵심이다.
// - 리드는 "현재 상태 분포"라 그 자체로는 누적이 아니다(각 리드는 정확히 한 상태에만 있다).
//   그래서 "신규 이상 = new+contacted+converted 전부", "연락 이상 = contacted+converted",
//   "전환 = converted" 로 인위적으로 순차 누적을 정의한다. UI 캡션에 이 정의를 명시해야 한다.
// - 딜은 "현재 단계 인덱스 이상에 있는 딜 수"로 자연히 누적된다(lost 제외 — lost는 별도 집계).
//
// 리드 closed(종료)와 딜 lost(이탈)는 퍼널 9단계 밖에서 별도 값으로만 보고한다 — 퍼널에
// 섞으면 "종료된 리드가 딜 상담 이전 단계에 남아있다"처럼 의미 없는 값이 생긴다.

import type { CrmDealStage } from "@/lib/repositories/crm-deals"

export type StageFunnelGroup = "lead" | "deal"

export interface StageFunnelStage {
  key: string
  label: string
  value: number
  /** 이전 단계 대비 전환율(%, 소수 1자리). 첫 단계이거나 이전 단계 값이 0이면 null. */
  conversionFromPrev: number | null
  group: StageFunnelGroup
}

export interface StageFunnelBottleneck {
  key: string
  /** 전환율(%, 소수 1자리) — 값이 최저인 구간. */
  conversion: number
}

export interface StageFunnelResult {
  stages: StageFunnelStage[]
  /** 전환율이 최저인 구간. conversionFromPrev가 null이거나 해당 단계 value가 0이면 후보에서 제외한다. */
  bottleneck: StageFunnelBottleneck | null
  /** 딜 lost 건수 — 9단계 퍼널 밖 별도 값. */
  lost: number
  /** 리드 closed 건수 — 9단계 퍼널 밖 별도 값. */
  closed: number
}

export interface StageFunnelLeadInput {
  new: number
  contacted: number
  converted: number
  closed: number
}

export type StageFunnelDealInput = Record<CrmDealStage, number> & { total: number }

export interface BuildStageFunnelInput {
  leads: StageFunnelLeadInput
  /** 딜 단계별 집계. 조회 실패로 null이면 퍼널 전체를 null로 만든다(리드만으로는 반쪽 퍼널을 만들지 않는다). */
  deals: StageFunnelDealInput | null
}

// 딜 단계 중 lost를 제외한 진행 순서. 인덱스가 클수록 뒤 단계.
const DEAL_STAGE_ORDER: readonly Exclude<CrmDealStage, "lost">[] = [
  "consult",
  "demo",
  "quote",
  "decision",
  "order",
  "won",
]

const DEAL_STAGE_LABEL: Record<Exclude<CrmDealStage, "lost">, string> = {
  consult: "딜 상담",
  demo: "데모",
  quote: "견적",
  decision: "결정",
  order: "주문",
  won: "결제",
}

function roundPct(value: number): number {
  return Math.round(value * 10) / 10
}

function conversionFromPrev(current: number, previous: number): number | null {
  if (previous <= 0) return null
  return roundPct((current / previous) * 100)
}

export function buildStageFunnel(input: BuildStageFunnelInput): StageFunnelResult | null {
  if (!input.deals) return null

  const { leads, deals } = input

  // 리드 3단계 — 현재 상태 분포를 "이상 도달" 프레임으로 재정의한 순차 누적(주석 상단 참고).
  const leadNewOrLater = leads.new + leads.contacted + leads.converted
  const leadContactedOrLater = leads.contacted + leads.converted
  const leadConverted = leads.converted

  const stages: StageFunnelStage[] = [
    { key: "lead_new", label: "리드 신규", value: leadNewOrLater, conversionFromPrev: null, group: "lead" },
    {
      key: "lead_contacted",
      label: "리드 연락중",
      value: leadContactedOrLater,
      conversionFromPrev: conversionFromPrev(leadContactedOrLater, leadNewOrLater),
      group: "lead",
    },
    {
      key: "lead_converted",
      label: "리드 전환",
      value: leadConverted,
      conversionFromPrev: conversionFromPrev(leadConverted, leadContactedOrLater),
      group: "lead",
    },
  ]

  // 딜 6단계 — "현재 단계 인덱스 이상에 있는 딜 수"로 자연 누적(lost 제외).
  let prevValue = leadConverted
  for (const stage of DEAL_STAGE_ORDER) {
    const idx = DEAL_STAGE_ORDER.indexOf(stage)
    const value = DEAL_STAGE_ORDER.slice(idx).reduce((sum, s) => sum + (deals[s] ?? 0), 0)
    stages.push({
      key: `deal_${stage}`,
      label: DEAL_STAGE_LABEL[stage],
      value,
      conversionFromPrev: conversionFromPrev(value, prevValue),
      group: "deal",
    })
    prevValue = value
  }

  // 병목 — 전환율 최저 구간. value가 0인 단계는 "그 뒤로 아무것도 없다"는 자명한 결과라
  // 병목 후보에서 제외한다(0 단계 자체가 이미 극단값이라 "최저 구간을 콕 집는다"는 배지의
  // 의미가 사라진다). 동률이면 퍼널 순서상 앞선 단계를 우선한다(먼저 만난 후보를 유지).
  let bottleneck: StageFunnelBottleneck | null = null
  for (const stage of stages) {
    if (stage.conversionFromPrev == null) continue
    if (stage.value === 0) continue
    if (bottleneck == null || stage.conversionFromPrev < bottleneck.conversion) {
      bottleneck = { key: stage.key, conversion: stage.conversionFromPrev }
    }
  }

  return {
    stages,
    bottleneck,
    lost: deals.lost ?? 0,
    closed: leads.closed,
  }
}
