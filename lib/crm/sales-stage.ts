// 영업 단계 — 사용자가 고르는 값이 아니라 기존 기록에서 파생되는 신호다.
// (운영 결정 캐논: "위험·지연·건강도는 사용자가 고르는 딜 단계가 아니라 원천 데이터에서
//  계산한 신호다" — 이 모듈은 그 문장의 영업 단계 확장이다.)
//
// 팀 문화 전제(culture-fit §2): 기록 강제 금지, 엄격한 딜 단계보다 빠른 후속 관리.
// 그래서 단계는 입력 없이 판정 가능한 재료만 쓴다 — 리드 status·연락 기록·데모 캘린더(전부
// 자체 데이터), NEO 만료·잔액(결제 시스템 데이터). 수동 enum(crm_deals.stage,
// stage_signal)은 커버리지가 얇아 주 재료로 쓰지 않는다.

export type SalesStage =
  | "untouched" // 접촉 전 — 유입만 있고 우리 쪽 기록 없음
  | "contacting" // 컨택 중 — 연락 기록·상태 전이 존재
  | "consulting" // 상담·데모 — 데모 예정/직후, 미팅 확정
  | "converted" // 계약·전환 — 리드 전환 완료(고객·딜 생성)
  | "active" // 이용 중 — 서비스 활성(잔액·만료 정상)
  | "renewal" // 연장 관리 — 만료 임박(D-30 이내) 또는 잔액 소진
  | "recovery" // 회복 — 만료 경과 후 되살리는 구간
  | "dormant" // 휴면 — 신호 끊김

export const SALES_STAGE_LABELS: Record<SalesStage, string> = {
  untouched: "접촉 전",
  contacting: "컨택 중",
  consulting: "상담·데모",
  converted: "계약·전환",
  active: "이용 중",
  renewal: "연장 관리",
  recovery: "회복",
  dormant: "휴면",
}

/** 화면 정렬·필터용 진행 순서(앞 = 퍼널 앞단). */
export const SALES_STAGE_ORDER: SalesStage[] = [
  "untouched",
  "contacting",
  "consulting",
  "converted",
  "active",
  "renewal",
  "recovery",
  "dormant",
]

// ─── 리드(구매 전) — 자체 데이터만으로 판정 ───────────────────

export interface LeadStageInput {
  status: "new" | "contacted" | "converted" | "closed"
  /** 연락 기록 존재 — status 표기가 안 바뀌어도 기록이 있으면 컨택으로 친다(priority.ts와 동일 규칙). */
  hasContactLog?: boolean
  /** 쇼룸 캘린더 데모 신호(예정·당일·14일 내 완료). */
  hasDemoSignal?: boolean
  /** 연락 기록 중 미팅 확정(result=meeting_set) 존재. */
  hasMeetingSet?: boolean
}

export function deriveLeadSalesStage(input: LeadStageInput): SalesStage {
  if (input.status === "converted") return "converted"
  // 종료 리드는 단계 사다리 밖 — 화면에서는 상태(종료)가 단계를 대신한다.
  if (input.status === "closed") return "dormant"
  if (input.hasDemoSignal || input.hasMeetingSet) return "consulting"
  if (input.status === "contacted" || input.hasContactLog) return "contacting"
  return "untouched"
}

// ─── 기존 고객(NEO 계정) — 결제·만료(신뢰 高) 중심 판정 ────────

export interface AccountStageInput {
  /** 만료까지 남은 달력일. 음수 = 경과. null = 만료 정보 없음. */
  expiryDays: number | null
  /** 잔액이 남아 있는가(null = 원천 미조인). */
  hasBalance: boolean | null
  /** 잔액 소진 판정(depleted_balance 코드 또는 balance ≤ 0). */
  depleted?: boolean
  /** 마지막 자체 컨택 이후 경과일(자체 CRM 기록, 신뢰 高). */
  ownContactDays?: number | null
  /** 만료 경과 후 장기 회복 진입선(일). priority.ts와 동일 기본값. */
  staleRecoveryDays?: number
}

export function deriveAccountSalesStage(input: AccountStageInput): SalesStage {
  const staleLine = input.staleRecoveryDays ?? 60
  if (input.expiryDays != null && input.expiryDays < 0) {
    // 만료 경과 — 회복 구간과 휴면을 장기 회복 진입선으로 가른다.
    return Math.abs(input.expiryDays) > staleLine ? "dormant" : "recovery"
  }
  if (input.expiryDays != null && input.expiryDays <= 30) return "renewal"
  if (input.depleted) {
    // 잔액 소진 — 최근 자체 컨택이 살아 있으면 연장(충전) 관리, 아니면 휴면.
    const alive = input.ownContactDays != null && input.ownContactDays <= 45
    return alive ? "renewal" : "dormant"
  }
  if (input.hasBalance) return "active"
  // 원천 미조인·정보 없음 — 단계를 추측하지 않는다.
  return "active"
}

// ─── 전환 고객(Portal) — 문서·딜 상태에서 판정 ─────────────────

export interface PortalStageInput {
  /** Portal deals.current_stage 값(있으면). */
  currentStage?: string | null
  /** 진행 중 딜 수. */
  activeDealCount?: number
}

export function derivePortalSalesStage(input: PortalStageInput): SalesStage {
  const stage = input.currentStage ?? null
  if (stage === "installation" || stage === "payment") return "active"
  if (stage === "closed") return "active"
  if (stage === "cancelled") return "dormant"
  // contact/quote/contract/confirmed — 전환 직후 계약 진행 구간.
  if (stage) return "converted"
  return (input.activeDealCount ?? 0) > 0 ? "converted" : "active"
}
