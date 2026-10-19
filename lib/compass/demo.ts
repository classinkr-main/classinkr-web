/* ── 데모 한 행을 "데모"로 셀 것인가 ─────────────────────────────────────────────────────────────────
 *  Compass crm.lead_demos 는 취소해도 행을 지우지 않고 status='canceled' 로 두고, 노쇼는 'no_show' 로 남긴다. kind 에는
 *  demo 외에 seminar(설명회)·meeting 도 있다(Compass scripts/schema.sql — kind·status 둘 다 not null, 기본값 'demo'·'booked').
 *  Compass 자신은 status not in ('canceled','no_show')(lib/kpi.ts demoCounted)와 kind='demo'(lib/leadDemoRounds.ts)로 거른다.
 *  어드민은 2026-10-12 전까지 거르지 않아 취소한 데모가 「오늘 데모」와 우선순위 가산점에 그대로 들어갔다(브리지 감사 3번).
 *  여기서는 그보다 좁게 실제 kind='demo' 중 booked·done 만 센다 — 원본이 not null 이라 비어 있는(null·빠진) kind·status 는
 *  정상 행이 아니므로 세지 않는다(docs/active/compass-kr-team-sync.md). */
export const COMPASS_DEMO_COUNTED_STATUSES = ["booked", "done"] as const

/** 회차 원장은 취소·노쇼·미팅도 보존한다. 데모 건수(「오늘 데모」)·업무 신호(우선순위)는 유효 회차만 사용한다. */
export function isCountableCompassDemo(row: { kind: string | null; status: string | null }): boolean {
  return row.kind === "demo" && (COMPASS_DEMO_COUNTED_STATUSES as readonly string[]).includes(row.status ?? "")
}
