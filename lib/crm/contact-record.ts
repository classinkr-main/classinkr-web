import "server-only"

// 리드 연락 기록의 단일 쓰기 경로(2026-09-25 W2: CT1·CT3).
//
// 연락은 어디서 입력하든 "연락 로그 저장 → (신규 리드면) 연락중 전환 → CRM 기록 미러 1건 → 미러의 다음
// 액션을 할 일로" 순서로 한 번만 일어난다. 리드 드로어·홈 큐(POST /api/admin/leads/[id]/logs)와 기록
// 컴포저의 리드 대상 콜·문자(POST /api/admin/crm/events)가 모두 여기를 지난다.
//
// 루프가 생기지 않는 이유: 미러는 이 함수가 저장소(getOrCreateCrmCustomerEventBySource)를 직접 불러
// 만든다 — 기록 라우트를 다시 타지 않고, 연락 로그 저장소(addContactLog)는 기록을 만들지 않으며,
// 기록 저장소는 로그를 만들지 않는다. 미러는 source_id = 로그 id로 묶여 로그당 한 번만 생긴다.
//
// 우선순위 큐·참여 신호 무효화는 addContactLog/updateLead/createCrmTask 안에서 일어난다
// (onContactLogsMutated 등 구독 + 큐 스냅샷 태그 직접 무효화) — 여기서 따로 부르지 않는다.

import { buildLeadContactMirrorInput, type LeadContactComposerContent } from "@/lib/crm/lead-contact-event"
import {
  addContactLog,
  deleteContactLog,
  findDuplicateContactLog,
  hasContactLog,
  type ContactLogRecord,
  type ContactLogResult,
  type ContactLogType,
} from "@/lib/repositories/contact-logs"
import {
  deleteCrmCustomerEventsBySource,
  getOrCreateCrmCustomerEventBySource,
  hasLeadContactEvent,
  LEAD_CONTACT_MIRROR_SOURCE_TYPES,
  type CrmCustomerEventRecord,
} from "@/lib/repositories/crm-events"
import { createTasksFromEventNextActions } from "@/lib/repositories/crm-tasks"
import { updateLead, type LeadRecord } from "@/lib/repositories/leads"

/** 연락 시각이 서버 시각보다 이만큼까지 앞서는 것은 시계 오차로 본다. 리드 생성 시각 쪽도 같은 여유. */
export const LEAD_CONTACT_TIME_SLACK_MS = 5 * 60_000

export type LeadContactTimeError = "future" | "before_lead"

/**
 * 연락 시각이 말이 되는지 — 미래(5분 초과)나 리드 생성 이전(5분 초과)이면 거절 사유를 돌려준다.
 * contactedAt이 없으면 서버 now로 저장되므로 항상 유효.
 */
export function leadContactTimeError(
  leadTimestamp: string | null | undefined,
  contactedAt: string | null | undefined,
  nowMs: number = Date.now()
): LeadContactTimeError | null {
  const contactTime = contactedAt ? new Date(contactedAt).getTime() : nowMs
  if (!Number.isFinite(contactTime)) return null
  if (contactTime > nowMs + LEAD_CONTACT_TIME_SLACK_MS) return "future"
  const leadTime = leadTimestamp ? new Date(leadTimestamp).getTime() : Number.NaN
  if (Number.isFinite(leadTime) && contactTime < leadTime - LEAD_CONTACT_TIME_SLACK_MS) return "before_lead"
  return null
}

export interface LeadContactEntry {
  type: ContactLogType
  result?: ContactLogResult
  notes?: string
  contacted_by?: string
  contacted_at?: string
}

export type LeadContactStatusSync = "updated" | "unchanged" | "failed"
export type LeadContactMirrorState = "created" | "existing" | "failed"

export type RecordLeadContactResult =
  | { ok: false; reason: LeadContactTimeError }
  | {
      ok: true
      log: ContactLogRecord
      /** 같은 내용·같은 연락 시각의 로그가 이미 있어 새로 저장하지 않았다(재전송·더블 클릭). */
      duplicate: boolean
      statusSync: LeadContactStatusSync
      event: CrmCustomerEventRecord | null
      mirror: LeadContactMirrorState
      tasksCreated: number
    }

export interface RecordLeadContactInput {
  /** 호출부가 이미 읽은 리드(존재 확인·404는 호출부 책임). */
  lead: Pick<LeadRecord, "id" | "status" | "timestamp" | "org" | "name">
  entry: LeadContactEntry
  /** 기록 컴포저가 남긴 내용 — 있으면 미러가 그 모드(call·sms)와 내용을 따른다. */
  composer?: LeadContactComposerContent | null
  /** 미러의 다음 액션으로 만드는 할 일의 작성자. 기본 = 로그의 contacted_by. */
  taskCreatedBy?: string | null
  now?: Date
}

/**
 * 리드 연락 1건을 기록한다 — 로그가 1차 증거라 로그 저장 실패만 던지고(아무것도 바뀌지 않는다),
 * 그 뒤 단계(연락중 전환·기록 미러·할 일)는 fail-soft로 결과에 상태만 싣는다. 로그를 저장한 뒤
 * 500을 돌려주면 클라이언트 재시도로 같은 연락이 두 번 쌓인다.
 */
export async function recordLeadContact(input: RecordLeadContactInput): Promise<RecordLeadContactResult> {
  const { lead, entry } = input
  const now = input.now ?? new Date()

  const timeError = leadContactTimeError(lead.timestamp, entry.contacted_at, now.getTime())
  if (timeError) return { ok: false, reason: timeError }

  const existing = await findDuplicateContactLog(lead.id, entry)
  const log = existing ?? (await addContactLog(lead.id, entry))

  let statusSync: LeadContactStatusSync = "unchanged"
  if (lead.status === "new") {
    try {
      const updated = await updateLead(lead.id, {
        status: "contacted",
        confirmed_at: now.toISOString(),
      })
      statusSync = updated ? "updated" : "failed"
    } catch (error) {
      console.error("[contact-record] sync lead status", error)
      statusSync = "failed"
    }
  }

  let event: CrmCustomerEventRecord | null = null
  let mirror: LeadContactMirrorState = "failed"
  let eventCreated = false
  try {
    const leadLabel = lead.org || lead.name || null
    const mirrored = await getOrCreateCrmCustomerEventBySource(
      buildLeadContactMirrorInput(log, leadLabel, input.composer ?? null)
    )
    event = mirrored.record
    eventCreated = mirrored.created
    mirror = mirrored.created ? "created" : "existing"
  } catch (error) {
    console.error("[contact-record] mirror to CRM event", error)
  }

  // 다음 액션 → 할 일은 미러가 "이번에 새로" 생겼을 때만 — 이미 있던 미러에서 다시 만들면 중복 할 일이 된다.
  let tasksCreated = 0
  if (event && eventCreated) {
    try {
      const tasks = await createTasksFromEventNextActions(event, {
        createdBy: input.taskCreatedBy ?? log.contacted_by,
      })
      tasksCreated = tasks.length
    } catch (error) {
      console.error("[contact-record] auto-task creation", error)
    }
  }

  return { ok: true, log, duplicate: Boolean(existing), statusSync, event, mirror, tasksCreated }
}

/**
 * 로그를 지울 때 함께 지우는 미러 — 드로어·홈 큐 로그가 만든 순수 미러(lead_contact_log)만이다.
 * 기록 컴포저가 남긴 콜·문자 기록(call·sms, source_id = 로그 id)은 요지·결정·녹음 경로가 담긴 사람의
 * 원본 기록이라 로그 삭제로 지우지 않는다(이번 라운드 전에는 컴포저 기록에 로그가 아예 없었다 — 그 상태와 같다).
 */
export const LEAD_CONTACT_PURE_MIRROR_SOURCE_TYPES = ["lead_contact_log"] as const satisfies readonly (typeof LEAD_CONTACT_MIRROR_SOURCE_TYPES)[number][]

export type DeleteLeadContactLogResult =
  | { deleted: true; mirrorsRemoved: number }
  | { deleted: false; reason: "log_delete_failed" | "mirror_cleanup_failed" }

/**
 * 리드 연락 로그를 지우고 그 로그의 순수 미러도 지운다(CT3 — 남겨두면 최초 응답·최근 컨택·주간 콜 집계에
 * 유령 연락이 남는다). **미러를 먼저** 지운다 — 미러 정리가 실패하면 로그를 지우지 않고 실패를 돌려 재시도할
 * 수 있게 한다(로그를 먼저 지우면 실패한 미러를 다시 지울 길이 없다).
 */
export async function deleteLeadContactLogWithMirrors(
  leadId: string,
  logId: string
): Promise<DeleteLeadContactLogResult> {
  let mirrorsRemoved: number
  try {
    mirrorsRemoved = await deleteCrmCustomerEventsBySource({
      sourceTypes: LEAD_CONTACT_PURE_MIRROR_SOURCE_TYPES,
      sourceId: logId,
      targetType: "lead",
      targetId: leadId,
    })
  } catch (error) {
    console.error("[contact-record] delete mirrored CRM events", error)
    return { deleted: false, reason: "mirror_cleanup_failed" }
  }
  const deleted = await deleteContactLog(logId)
  if (!deleted) return { deleted: false, reason: "log_delete_failed" }
  return { deleted: true, mirrorsRemoved }
}

/**
 * 리드를 사람이 "연락중"으로 바꿀 증거가 있는지 — 연락 로그가 1차, 없으면 사람 접촉 기록
 * (콜·문자·회의록·녹음·연락 로그 미러)도 인정한다. 이 변경 이전에 기록 컴포저로만 남긴 콜은
 * 로그가 없어 409가 났다(CT1).
 */
export async function hasLeadContactEvidence(leadId: string): Promise<boolean> {
  if (await hasContactLog(leadId)) return true
  return hasLeadContactEvent(leadId)
}
