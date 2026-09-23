/**
 * Compass(mkt.classin.co.kr) 정리 대시보드 응답 계약 — 2026-09-20 라운드.
 *
 * 서버(lib/compass/summary.ts → GET /api/admin/crm/compass-summary)와 화면(홈 밴드·인사이트 섹션)이
 * 같은 타입을 import 한다. 이 파일은 타입·상수만 갖고 서버 의존이 없어 클라이언트에서도 안전하다.
 *
 * 규칙:
 *  - 금액 필드는 싣지 않는다(paid_amount 합산 금지 — 매출은 revenue 테이블·rev-sheet 가 정본).
 *  - down=true 면 숫자를 전부 신뢰하지 않는다 — 화면은 "Compass 연결 끊김" 한 줄로 강등한다.
 *  - truncated=true 면 range 스캔이 상한에 닿았다 — 합계를 "전체"라 부르지 않고 "N건 이상"으로 표기한다.
 *  - 기간은 KST 일 경계(since 00:00 ~ 지금). stage 퍼널은 "기간 내 유입 리드의 현재 단계" 기준
 *    누적(해당 단계 이상 도달) 이며 lost 는 별도 카운트다.
 */

export type CompassSummaryPeriodKey = "7d" | "30d" | "90d"

export const COMPASS_SUMMARY_PERIODS: ReadonlyArray<{ key: CompassSummaryPeriodKey; label: string; days: number }> = [
  { key: "7d", label: "7일", days: 7 },
  { key: "30d", label: "30일", days: 30 },
  { key: "90d", label: "90일", days: 90 },
]

export const COMPASS_SUMMARY_DEFAULT_PERIOD: CompassSummaryPeriodKey = "7d"

export function isCompassSummaryPeriodKey(value: unknown): value is CompassSummaryPeriodKey {
  return value === "7d" || value === "30d" || value === "90d"
}

/** 퍼널 순서 — crm.stages 실측 어휘(lib/compass/normalize.ts COMPASS_STAGE_LABEL). lost 는 퍼널 밖. */
export const COMPASS_FUNNEL_STAGES = ["new", "contact", "consult", "demo", "quote", "bd", "won"] as const
export type CompassFunnelStage = (typeof COMPASS_FUNNEL_STAGES)[number]

/** 케어 사다리 순서(COMPASS_CARE_STAGE_LABEL). */
export const COMPASS_CARE_STAGES = ["member", "leader", "ceo", "paid", "closed"] as const

export const COMPASS_UPCOMING_ACTION_HOURS = 48
export const COMPASS_SUMMARY_MAX_ROWS = 5_000
export const COMPASS_SUMMARY_OWNER_LIMIT = 8
export const COMPASS_SUMMARY_ACTION_LIMIT = 8
export const COMPASS_SUMMARY_LOST_REASON_LIMIT = 5

export interface CompassSummaryCount {
  key: string
  label: string
  count: number
}

export interface CompassSummaryOwnerRow {
  /** 콜 담당(caller) 우선, 없으면 owner. 둘 다 없으면 "미배정". */
  owner: string
  total: number
  demo: number
  bd: number
  won: number
  lost: number
}

export interface CompassSummaryActionRow {
  compassLeadId: number
  academy: string | null
  name: string | null
  stage: string | null
  nextAction: string | null
  nextActionAt: string | null
  owner: string | null
  caller: string | null
  /** compassLeadUrl(id) — 새 탭 딥링크 */
  url: string
}

export interface CompassSummary {
  period: { key: CompassSummaryPeriodKey; since: string; until: string }
  generatedAt: string
  down: boolean
  error?: string
  truncated: boolean
  /** 기간 내 last_inflow_at 리드 수 */
  inflowTotal: number
  /** 유입 플랫폼/채널 묶음 — key "meta" 는 라벨 "메타"; 그 외 channel 원문, 비면 "기타" */
  byPlatform: CompassSummaryCount[]
  /** byPlatform 중 meta 건수(홈 세그먼트 타일용 지름길) */
  metaInflow: number
  /** COMPASS_FUNNEL_STAGES 순서 · 누적(해당 단계 이상 도달, lost 제외) */
  stages: CompassSummaryCount[]
  /** 기간 내 유입 중 stage=lost */
  lost: number
  /** 기간 내 유입 중 neocrm_registered_at 있음 */
  neoRegistered: number
  /** 기간 내 유입 중 stage=won */
  won: number
  /** COMPASS_CARE_STAGES 순서(0건 포함) */
  careStages: CompassSummaryCount[]
  /** 전 기간 BD인계 진행(stage=bd · bd_paid_at null) — getCompassBdOpenCount */
  bdOpen: number
  /** 오늘 데모 건수 — getCompassDemos(today, today) */
  todayDemoCount: number
  /** total 내림차순 상위 COMPASS_SUMMARY_OWNER_LIMIT, "미배정" 은 맨 뒤 */
  byOwner: CompassSummaryOwnerRow[]
  /** 이탈 사유 상위 COMPASS_SUMMARY_LOST_REASON_LIMIT (비어 있으면 "사유 없음") */
  lostReasons: CompassSummaryCount[]
  /** 다음 액션 임박(COMPASS_UPCOMING_ACTION_HOURS 이내) 상위 COMPASS_SUMMARY_ACTION_LIMIT, nextActionAt 오름차순 */
  upcomingActions: CompassSummaryActionRow[]
  upcomingActionCount: number
}

/** 화면이 down 상태를 한 곳에서 판정하도록 — data 없음 + error, 또는 data.down. */
export function isCompassSummaryDown(data: CompassSummary | null | undefined, error?: string | null): boolean {
  if (!data) return Boolean(error)
  return data.down === true
}

export function compassSummaryUrl(period: CompassSummaryPeriodKey): string {
  return `/api/admin/crm/compass-summary?period=${period}`
}
