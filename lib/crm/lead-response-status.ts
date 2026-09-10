import { RESPONSE_TARGET_SOURCES, isTestLead } from "@/lib/crm/lead-attribution"
import type { LeadRecord } from "@/lib/repositories/leads"

export type LeadResponseStatusRecord = Pick<
  LeadRecord,
  "source" | "status" | "name" | "org" | "email" | "timestamp"
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
    const createdAtMs = new Date(lead.timestamp).getTime()
    if (!Number.isFinite(createdAtMs)) continue
    const ageMs = nowMs - createdAtMs
    if (ageMs >= 24 * 3_600_000) over24hCount += 1
    if (ageMs >= 48 * 3_600_000) over48hCount += 1
  }

  return { awaitingResponseCount, over24hCount, over48hCount }
}
