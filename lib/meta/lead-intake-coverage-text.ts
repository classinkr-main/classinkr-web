// Meta 광고 리드 수 "미측정" 가드의 계약과 문구(순수, import 없음).
// 판정·조회는 lib/meta/lead-intake-coverage.ts(server-only)가 하고, 이 파일은 보고서 빌더(순수 모듈)와
// 위컴 카드 조립(lib/notifications/emit-event.ts)이 같은 문구를 쓰게 한다. 설계 META-RECEIVER-FINAL §4-2 H9.

/** 광고 리드 수를 믿어도 되는 이유 */
export type MetaLeadIntakeMeasuredReason =
  /** env META_LEADGEN_FORCE_ADMIN=1 — 웹훅이 지금 경로로 저장한다 */
  | "env_force_admin"
  /** 전환 스위치를 못 읽음(마이그레이션 미적용 포함) — 웹훅과 같이 admin 으로 본다 */
  | "cutover_unreadable"
  /** admin 모드이고 롤백 잔여분 창도 닫혔다 */
  | "admin_mode"
  /** shadow — 웹훅이 지금 경로로 저장한다 */
  | "shadow_mode"
  /** 미러 창이 열려 있고 건강 지표가 정상이다 */
  | "mirror_current"

/** 광고 리드 수가 모자랄 수 있는 이유(미러 창이 열려 있을 때만) */
export type MetaLeadIntakeUnmeasuredReason =
  /** 건강 RPC 실패·시간 초과·모양 이상 */
  | "health_unavailable"
  /** public.compass_meta_submissions_v 가 없다 */
  | "submissions_view_missing"
  /** h2 — 창 안인데 30분 넘게 원장에 없는 제출이 있다 */
  | "mirror_backlog"
  /** 미러 크론 심장박동이 없거나 30분을 넘었다 */
  | "heartbeat_stale"

export type MetaLeadIntakeCoverage =
  | { measured: true; reason: MetaLeadIntakeMeasuredReason }
  | { measured: false; reason: MetaLeadIntakeUnmeasuredReason }

export type MetaLeadIntakeGap = Extract<MetaLeadIntakeCoverage, { measured: false }>

/** 카드·보고서에서 건수 자리에 쓰는 표기 */
export const META_LEAD_INTAKE_UNMEASURED_LABEL = "미측정(미러 지연)"

const GAP_DESCRIPTIONS: Record<MetaLeadIntakeUnmeasuredReason, string> = {
  health_unavailable: "미러 건강 지표를 읽지 못함",
  submissions_view_missing: "Compass 제출 뷰 없음",
  mirror_backlog: "30분 넘게 미러되지 않은 제출이 있음",
  heartbeat_stale: "미러 크론이 30분 넘게 돌지 않음",
}

export function describeMetaLeadIntakeGap(reason: MetaLeadIntakeUnmeasuredReason): string {
  return GAP_DESCRIPTIONS[reason]
}

export function isMetaLeadIntakeGap(coverage: MetaLeadIntakeCoverage | null | undefined): coverage is MetaLeadIntakeGap {
  return coverage?.measured === false
}
