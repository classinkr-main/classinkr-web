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

/** KA 고객에 이름으로 맞춘 Compass 리드와 최근 기록 — 진행 서술(AI 초안)의 근거. 이름 매칭이라 확정 연결이 아니다. */
export interface WeeklyKaCompass {
  leadId: number
  academy: string | null
  url: string
  stage: string | null
  stageLabel: string | null
  nextAction: string | null
  nextActionAt: string | null
  /** 가장 최근 기록 시각 */
  lastActivityAt: string | null
  /** 보고 주(월~일) 기록 수 */
  weekActivityCount: number
  /** 최근 30일 기록(최신순, 최대 6) — 연락처는 가린 본문 */
  recent: { at: string; kind: string | null; actor: string | null; text: string }[]
}

export interface WeeklyKaCustomer {
  compass?: WeeklyKaCompass | null
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
  /** Compass 기록 조회 상태 — down이면 진행 서술 초안을 만들지 않는다. */
  compassState?: "ready" | "down"
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

/** 본사 주간 보고서 모듈(5.2 对应模块). */
export type ReportModule = "KA" | "market" | "partner" | "other"

/** AI가 쓴 본사 양식(韩国业务周报) 간이 보고 — 간체 중국어. raw_response._weekly_report로 저장된다. */
export interface WeeklyReportDraft {
  /** 一、财年业绩进展表 한 줄 평 */
  performance: string
  /** 二、本月收款 한 줄 평 */
  collections: string
  /** 三、重点KA客户情况跟进 행 */
  ka: Array<{ customer: string; stage: string; change: string; issue: string; next_action: string; hq_support: string }>
  /** 四、市场活动 한 줄 평(Compass 퍼널·행사) */
  activities: string
  /** 5.1 本周要点 */
  key_points: string[]
  /** 5.2 下周主要计划 */
  next_week: Array<{ plan: string; module: ReportModule; due: string }>
}

/** 저장된 raw_response에서 간이 보고를 안전하게 꺼낸다(모양이 다르면 null). */
export function readWeeklyReportDraft(value: unknown): WeeklyReportDraft | null {
  if (!value || typeof value !== "object") return null
  const v = value as Record<string, unknown>
  const str = (x: unknown) => (typeof x === "string" ? x : "")
  if (!Array.isArray(v.ka) || !Array.isArray(v.key_points) || !Array.isArray(v.next_week)) return null
  return {
    performance: str(v.performance),
    collections: str(v.collections),
    activities: str(v.activities),
    key_points: v.key_points.filter((x): x is string => typeof x === "string"),
    ka: v.ka.filter((x): x is Record<string, unknown> => !!x && typeof x === "object").map((x) => ({
      customer: str(x.customer), stage: str(x.stage), change: str(x.change), issue: str(x.issue), next_action: str(x.next_action), hq_support: str(x.hq_support),
    })),
    next_week: v.next_week.filter((x): x is Record<string, unknown> => !!x && typeof x === "object").map((x) => ({
      plan: str(x.plan),
      module: (["KA", "market", "partner", "other"].includes(str(x.module)) ? str(x.module) : "other") as ReportModule,
      due: str(x.due),
    })),
  }
}
