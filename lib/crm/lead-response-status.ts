import { RESPONSE_TARGET_SOURCES, isTestLead } from "@/lib/crm/lead-attribution"
import type { LeadRecord } from "@/lib/repositories/leads"

export type LeadResponseStatusRecord = Pick<
  LeadRecord,
  "source" | "status" | "name" | "org" | "email" | "timestamp" | "last_inflow_at"
>

/**
 * 아직 실제 첫 응답 이벤트를 보유하지 않으므로 이 값은 "미응답"의 대리 지표다.
 * 운영 리드 중 응대 대상 소스가 여전히 new 상태인 경우만 포함한다.
 */
export function isLeadAwaitingResponse(lead: LeadResponseStatusRecord) {
  return (
    lead.status === "new" &&
    RESPONSE_TARGET_SOURCES.has(lead.source) &&
    !isTestLead(lead as LeadRecord)
  )
}

/**
 * 경과 시간 기준 시각(ms) — 재유입(last_inflow_at)이 있으면 그 이후로 다시 시계를 돌린다.
 * 재유입 이후의 방치 여부를 최초 유입 시각 하나로만 재면, 몇 달 전 첫 유입 때문에 방금
 * 재유입한 리드가 곧장 24h/48h 초과로 뜬다 — 실제로 방치된 것은 "재유입 이후"뿐이다.
 */
function inflowClockMs(lead: Pick<LeadResponseStatusRecord, "timestamp" | "last_inflow_at">) {
  const createdAtMs = new Date(lead.timestamp).getTime()
  const inflowAtMs = lead.last_inflow_at ? new Date(lead.last_inflow_at).getTime() : NaN
  if (!Number.isFinite(inflowAtMs)) return createdAtMs
  if (!Number.isFinite(createdAtMs)) return inflowAtMs
  return Math.max(createdAtMs, inflowAtMs)
}

export function summarizeLeadResponseStatus(
  leads: readonly LeadResponseStatusRecord[],
  now = new Date()
) {
  let awaitingResponseCount = 0
  let over24hCount = 0
  let over48hCount = 0
  const nowMs = now.getTime()

  for (const lead of leads) {
    if (!isLeadAwaitingResponse(lead)) continue
    awaitingResponseCount += 1
    const clockMs = inflowClockMs(lead)
    if (!Number.isFinite(clockMs)) continue
    const ageMs = nowMs - clockMs
    if (ageMs >= 24 * 3_600_000) over24hCount += 1
    if (ageMs >= 48 * 3_600_000) over48hCount += 1
  }

  return { awaitingResponseCount, over24hCount, over48hCount }
}

/**
 * 재유입 후 아직 접촉하지 않은 리드 — Compass lib/leadFilter.ts의 UNCONTACTED 조건
 * ("마지막 유입 이후 접촉 없음", Compass 저장소)을 이식했다. status가 contacted인
 * 리드라도 last_inflow_at 이후로 아직 응대 기록이 없으면(=마지막 접촉이 없거나 재유입보다
 * 이르면) true를 낸다 — "이미 컨택했으니 끝"이 아니라 "재유입 이후로는 아직 안 봤다"를 잡는다.
 *
 * 배선은 이번 범위 밖(함수·테스트만 제공) — lastContactAt 후보:
 *  - lib/repositories/crm-events.ts getCrmCustomerContactMaps().latestContactByTarget
 *    (crm_customer_events + lead_contact_logs를 합친 대상별 최신 컨택 시각, 이미 존재)
 *  - lib/repositories/crm-events.ts getLeadFirstResponseMap()(리드별 최초 응답 — "최신"이
 *    아니라 "최초"라 재유입 판정에는 latestContactByTarget이 더 정확하다)
 *  - lib/repositories/contact-logs.ts getContactLogs(leadId)의 최신 항목(리드 단건 조회용)
 */
export function isReinflowAwaitingContact(
  lead: Pick<LeadResponseStatusRecord, "status" | "last_inflow_at">,
  lastContactAt: string | null | undefined
): boolean {
  if (lead.status !== "contacted" || !lead.last_inflow_at) return false
  if (!lastContactAt) return true

  const lastContactMs = new Date(lastContactAt).getTime()
  const inflowMs = new Date(lead.last_inflow_at).getTime()
  if (!Number.isFinite(lastContactMs) || !Number.isFinite(inflowMs)) return true

  return lastContactMs < inflowMs
}
