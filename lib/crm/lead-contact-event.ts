import type { ContactLogRecord } from "@/lib/repositories/contact-logs"
import type { CrmCustomerEventCreateInput, CrmEventNextAction } from "@/lib/repositories/crm-events"

// 리드 연락 로그(통화/카톡/문자/이메일)를 CRM 활동 타임라인(crm_customer_events)과
// 다음 액션(crm_tasks)으로 잇는다(§8 #6, culture-fit §3.1 "결과 중심").

const TYPE_LABELS: Record<ContactLogRecord["type"], string> = {
  call: "전화",
  sms: "문자",
  kakao: "카카오",
  email: "이메일",
}

const RESULT_LABELS: Record<NonNullable<ContactLogRecord["result"]>, string> = {
  answered: "응답",
  no_answer: "부재",
  callback: "콜백 요청",
  meeting_set: "미팅 확정",
}

export function leadContactEventTitle(log: Pick<ContactLogRecord, "type" | "result">): string {
  const typeLabel = TYPE_LABELS[log.type] ?? "연락"
  const resultLabel = log.result ? RESULT_LABELS[log.result] : null
  return resultLabel ? `${typeLabel} · ${resultLabel}` : typeLabel
}

function leadContactSentiment(result: ContactLogRecord["result"]): "positive" | "neutral" | "risk" {
  if (result === "meeting_set") return "positive"
  return "neutral"
}

// 명확한 약속(콜백/미팅)만 다음 액션으로 승격한다. 단순 부재는 우선순위 큐가 이미 재노출한다.
export function leadContactNextActions(log: Pick<ContactLogRecord, "result" | "contacted_by">): CrmEventNextAction[] {
  if (log.result === "callback") {
    return [{ title: "콜백 약속 이행", ownerName: log.contacted_by ?? null, dueAt: null, done: false }]
  }
  if (log.result === "meeting_set") {
    return [{ title: "미팅 준비 및 진행", ownerName: log.contacted_by ?? null, dueAt: null, done: false }]
  }
  return []
}

export function buildLeadContactEventInput(
  log: ContactLogRecord,
  leadLabel: string | null
): CrmCustomerEventCreateInput & { sourceType: "lead_contact_log"; sourceId: string } {
  return {
    targetType: "lead",
    targetId: log.lead_id,
    targetLabel: leadLabel,
    sourceType: "lead_contact_log",
    sourceId: log.id,
    occurredAt: log.contacted_at,
    title: leadContactEventTitle(log),
    body: log.notes ?? null,
    ownerName: log.contacted_by ?? null,
    nextActions: leadContactNextActions(log),
    sentiment: leadContactSentiment(log.result),
    createdBy: log.contacted_by ?? null,
  }
}
