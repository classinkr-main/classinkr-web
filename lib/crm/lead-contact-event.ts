import type { ContactLogRecord } from "@/lib/repositories/contact-logs"
import type {
  CrmCustomerEventCreateInput,
  CrmCustomerEventSourceType,
  CrmEventNextAction,
} from "@/lib/repositories/crm-events"

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

/**
 * 기록 컴포저(POST /api/admin/crm/events)가 리드 연락을 남길 때 넘기는 기록 내용.
 * 대상·원천 id·발생 시각은 서버가 저장된 로그로 덮어쓰므로 받지 않는다.
 */
export type LeadContactComposerContent = Omit<
  CrmCustomerEventCreateInput,
  "targetType" | "targetId" | "sourceType" | "sourceId" | "occurredAt"
> & { sourceType: Extract<CrmCustomerEventSourceType, "call" | "sms"> }

export type LeadContactMirrorInput = CrmCustomerEventCreateInput & {
  sourceType: CrmCustomerEventSourceType
  sourceId: string
}

function trimmedOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

/**
 * 연락 로그 1건의 CRM 기록 미러 입력. 로그가 1차 증거이고 기록은 파생이다 — 어느 입력 경로든
 * source_id = 로그 id로 묶여 getOrCreateCrmCustomerEventBySource가 로그당 한 번만 만든다.
 *
 * - 컴포저 내용이 없으면(리드 드로어·홈 큐) 로그에서 만든 기본 미러(lead_contact_log).
 * - 컴포저 내용이 있으면 사용자가 고른 모드(call·sms)와 적은 내용(요약·녹음·태그·다음 액션 등)을
 *   그대로 살리고, 비어 있는 제목·담당자·다음 액션·분위기만 로그 기본값으로 채운다.
 */
export function buildLeadContactMirrorInput(
  log: ContactLogRecord,
  leadLabel: string | null,
  composer?: LeadContactComposerContent | null
): LeadContactMirrorInput {
  const base = buildLeadContactEventInput(log, leadLabel)
  if (!composer) return base

  const composerNextActions = (composer.nextActions ?? []).filter((action) => action.title?.trim())
  return {
    ...composer,
    targetType: "lead",
    targetId: log.lead_id,
    targetLabel: trimmedOrNull(composer.targetLabel) ?? base.targetLabel ?? null,
    sourceType: composer.sourceType,
    sourceId: log.id,
    occurredAt: log.contacted_at,
    title: trimmedOrNull(composer.title) ?? base.title,
    ownerName: trimmedOrNull(composer.ownerName) ?? base.ownerName ?? null,
    nextActions: composerNextActions.length > 0 ? composerNextActions : base.nextActions,
    sentiment:
      composer.sentiment && composer.sentiment !== "neutral" ? composer.sentiment : base.sentiment,
    createdBy: trimmedOrNull(composer.createdBy) ?? base.createdBy ?? null,
  }
}
