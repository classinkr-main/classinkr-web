// KR Team 본사 주간 보고 — Compass(마케팅·BD CRM) 구획의 응답 계약.
// 서버(lib/branch/weekly-report.ts → GET /api/admin/branch/weekly-report)와 화면(BranchAiInsights)이 같은 타입을 쓴다.
// 타입·순수 함수만 두고 서버 의존이 없어 클라이언트에서도 안전하다.
//
// 규칙:
//  - Compass 수치는 리드 퍼널·과정 평가다. REV 확정 매출·DSH 목표와 더하거나 대신 쓰지 않는다.
//  - 보고 주는 끝난 주(월~일, KST)다. 진행 중인 이번 주를 섞지 않아 한 주 동안 같은 숫자를 보인다.
//  - 퍼널은 "그 주에 유입된 리드의 현재 단계" 누적이다(해당 단계 이상 도달, 종료 제외).
//  - down이면 숫자를 쓰지 않는다. truncated면 "N건 이상"으로 읽는다.

export interface WeeklyReportWeek {
  /** ISO 주 라벨, 예: "2026 W47" */
  label: string
  /** 월요일 YYYY-MM-DD(KST) */
  startDate: string
  /** 일요일 YYYY-MM-DD(KST) */
  endDate: string
  since: string
  until: string
}

export interface WeeklyFunnelStage {
  key: string
  label: string
  current: number
  previous: number
}

export interface WeeklyFunnelOwner {
  name: string
  inflow: number
  demo: number
  bd: number
  won: number
  lost: number
}

export interface WeeklyCompassFunnel {
  state: "ready" | "down"
  error?: string
  truncated: boolean
  inflow: { current: number; previous: number }
  stages: WeeklyFunnelStage[]
  lost: { current: number; previous: number }
  /** 보고 주 이탈 사유 상위 */
  lostReasons: { label: string; count: number }[]
  /** 보고 주 담당별(정규화한 이름). 팀·개인 범위에서는 그 범위 담당만. */
  owners: WeeklyFunnelOwner[]
  /** 보고 주 미배정 유입 — 전체 범위에서만 센다(팀·개인 범위에는 귀속할 팀이 없다). */
  unassigned: number | null
}

export interface WeeklyEvaluationPerson {
  name: string
  team: string | null
  /** Compass 평가 달성률(%) — Compass가 산식을 소유한다. */
  rate: number
  grade: string
  /** 달성률이 가장 낮은 정량 항목(최대 2개) */
  weakest: { label: string; rate: number; actual: number | null; target: number | null; unit: string | null }[]
}

export interface WeeklyCompassEvaluation {
  state: "ready" | "not_configured" | "unavailable"
  month: string
  basis: "live" | "closed" | null
  people: WeeklyEvaluationPerson[]
}

export interface WeeklyKaCustomer {
  customer: string
  manager: string | null
  team: string | null
  /** 이번 분기 확정(REV 캐논 confirmedMonthAmount) */
  confirmed: number
  /** 이번 분기 미확정(고확도·예정 — 월 납부 예정액 − 확정) */
  open: number
  total: number
  deals: number
}

/** KA(REV 딜 importance=KA) 이번 분기 고객 — 매출 장부와 같은 딜·같은 확정 캐논. */
export interface WeeklyKaSection {
  /** 예: "FY2026-Q3" */
  quarter: string
  months: string[]
  confirmed: number
  open: number
  customerCount: number
  /** 분기 합계 큰 순 상위 */
  customers: WeeklyKaCustomer[]
}

export interface BranchWeeklyCompassReport {
  generatedAt: string
  week: WeeklyReportWeek
  previousWeek: WeeklyReportWeek
  scope: {
    team: string
    manager: string | null
    /** 담당→팀 매핑 출처. compass_roster = Compass 월간 명단, rev_ledger = REV 장부 담당 팀(최빈값). */
    teamSource: "compass_roster" | "rev_ledger" | null
  }
  funnel: WeeklyCompassFunnel
  evaluation: WeeklyCompassEvaluation
  ka: WeeklyKaSection
}

export function weeklyDelta(current: number, previous: number): { diff: number; pct: number | null } {
  return { diff: current - previous, pct: previous > 0 ? ((current - previous) / previous) * 100 : null }
}
