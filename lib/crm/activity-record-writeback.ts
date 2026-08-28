// 우리 어드민의 연락 기록을 외부 CRM(XiaoshouYi)의 활동 기록으로 되밀기 위한 변환.
//
// 왜 연락 기록부터인가: 활동 기록은 추가만 하는 로그라 되돌리기 쉽고, 양쪽 CRM이
// 갈라지는 가장 큰 원인이며, 실패해도 피해가 작다. 상태·금액처럼 되돌리기 어려운 것은 뒤로 미룬다.
//
// entityType·groupId 는 추론이 아니라 실측값이다. SOQL 로는 라벨도 groupId 도 안 나오지만
// crm_get_record 로 기존 레코드를 읽으면 `entityType-label` 과 `groupId` 가 함께 나온다(2026-08-28 확인).
// 그래도 전송 자체는 승인 큐(draft)를 거친다 — 남의 CRM 에 남는 기록이라 사람이 한 번 본다.

import type { ContactLogResult, ContactLogType } from "@/lib/supabase/database.types"

/**
 * 외부 CRM 활동 유형 ID. 라벨은 crm_get_record 로 실측한 값이다.
 * - 11010011100001 快速沟通 — 전화·메신저 등 원격 접촉
 * - 11010011100002 线下拜访 — 오프라인 방문
 * - 3588972666094228 公司参访 — 고객사의 우리 회사 방문
 */
export const XIAOSHOUYI_ACTIVITY_ENTITY_TYPE = {
  remoteContact: "11010011100001",
  visit: "11010011100002",
  inboundVisit: "3588972666094228",
} as const

/**
 * ⚠️ groupId 는 활동 유형별 상수가 아니다 — **대상 레코드(고객/EEO)마다 있는 피드 그룹 id** 다.
 * (처음엔 유형별 상수로 오인했는데, 기존 레코드들을 대조하니 groupId 가 대상 레코드 id 와
 * 인접한 값이었고, 대상 레코드를 crm_get_record 로 읽으면 `groupId` 필드가 그대로 나온다.)
 * 틀린 groupId 로도 생성은 성공하지만 남의 피드 그룹에 꽂혀 화면에서 보이지 않는다.
 * 따라서 호출자가 대상 레코드에서 읽어 넘겨야 한다.
 */

/** 한국 지사 부서 id. 필수 필드이며 자동 주입되지 않는다(실측). */
export const XIAOSHOUYI_KR_DEPARTMENT_ID = "3632980020953825"

/** 활동 기록의 출처 객체 구분. 11=리드, 1=고객. */
export const XIAOSHOUYI_ACTIVITY_FROM = { lead: 11, account: 1 } as const

const CONTACT_TYPE_LABELS: Record<ContactLogType, string> = {
  call: "전화",
  sms: "문자",
  kakao: "카카오톡",
  email: "이메일",
}

const CONTACT_RESULT_LABELS: Record<ContactLogResult, string> = {
  answered: "통화 완료",
  no_answer: "부재",
  callback: "재연락 요청",
  meeting_set: "미팅 확정",
}

export interface ContactWritebackInput {
  type: ContactLogType
  result: ContactLogResult | null
  notes: string | null
  contactedAt: string
  /** 외부 CRM 고객(account) id. 없으면 되밀 대상이 없다. */
  externalAccountId: string | null
  /** 외부 CRM 담당자 id. */
  externalOwnerId: string | null
  /** 대상 레코드의 피드 그룹 id — 대상(account/EEO)을 crm_get_record 로 읽으면 groupId 로 나온다. */
  targetGroupId: string | null
  /** 리드 단계에서 남긴 기록인지 — 출처 구분에 쓴다. */
  fromLead?: boolean
}

export interface ActivityRecordPayload {
  content: string
  startTime: number
  /** 시작과 같은 값. 비우면 생성이 거절된다. */
  endTime: number
  entityType: string
  groupId: string
  dimDepart: string
  belongId: number
  activityRecordFrom: number
  /** 연관 레코드 id. 복합 필드(activityRecordFrom_compound)로 보내면 타입 불일치로 거절된다. */
  activityRecordFrom_data: string
  itemId: string
  dbcRelation26: string
  ownerId?: string
}

export type ContactWritebackSkipReason = "missing_account" | "invalid_time" | "missing_group"

export type ContactWritebackResult =
  | { ok: true; payload: ActivityRecordPayload }
  | { ok: false; reason: ContactWritebackSkipReason }

/** 활동 기록 본문. 외부 CRM 에서 이 줄만 보고도 무슨 접촉이었는지 알 수 있어야 한다. */
export function buildActivityContent(input: Pick<ContactWritebackInput, "type" | "result" | "notes">) {
  const head = CONTACT_TYPE_LABELS[input.type] ?? input.type
  const result = input.result ? CONTACT_RESULT_LABELS[input.result] ?? input.result : null
  const notes = input.notes?.trim()

  const parts = [`[${head}]`]
  if (result) parts.push(result)
  if (notes) parts.push(`— ${notes}`)
  // 출처를 남긴다: 외부 CRM 에서 보면 사람이 직접 적은 기록과 구별돼야 한다.
  parts.push("(ClassIn 어드민)")
  return parts.join(" ")
}

export function buildActivityRecordPayload(input: ContactWritebackInput): ContactWritebackResult {
  if (!input.externalAccountId) return { ok: false, reason: "missing_account" }
  // 틀린 그룹으로 보내면 조용히 다른 피드에 꽂힌다 — 모르면 만들지 않는다.
  if (!input.targetGroupId) return { ok: false, reason: "missing_group" }

  const startTime = Date.parse(input.contactedAt)
  if (!Number.isFinite(startTime)) return { ok: false, reason: "invalid_time" }

  // 우리 연락 기록 4종(전화·문자·카톡·메일)은 전부 원격 접촉이다. 방문은 아직 다루지 않는다.
  const entityType = XIAOSHOUYI_ACTIVITY_ENTITY_TYPE.remoteContact
  const payload: ActivityRecordPayload = {
    content: buildActivityContent(input),
    startTime,
    endTime: startTime,
    entityType,
    groupId: input.targetGroupId,
    dimDepart: XIAOSHOUYI_KR_DEPARTMENT_ID,
    belongId: 1,
    activityRecordFrom: input.fromLead ? XIAOSHOUYI_ACTIVITY_FROM.lead : XIAOSHOUYI_ACTIVITY_FROM.account,
    activityRecordFrom_data: input.externalAccountId,
    itemId: input.externalAccountId,
    dbcRelation26: input.externalAccountId,
  }
  if (input.externalOwnerId) payload.ownerId = input.externalOwnerId

  return { ok: true, payload }
}

/**
 * 연락 기록 하나를 외부 CRM 되밀기 요청(draft)으로 올린다.
 *
 * 곧바로 전송하지 않는다 — `crm_write_requests` 승인 큐에 draft 로 쌓이고, 사람이 미리보기를
 * 확인해 승인해야 실제 POST 가 나간다. entityType 처럼 우리가 역추론한 값이 섞여 있으므로
 * 이 한 단계가 안전장치다.
 */
export async function enqueueContactWriteback(
  input: ContactWritebackInput & { requestedBy?: string | null }
): Promise<{ ok: true; requestId: string } | { ok: false; reason: ContactWritebackSkipReason | "create_failed"; error?: string }> {
  const built = buildActivityRecordPayload(input)
  if (!built.ok) return built

  const { createCrmWriteRequest } = await import("@/lib/external-crm/xiaoshouyi-write")
  try {
    const row = await createCrmWriteRequest({
      objectApiKey: "activityrecord",
      operation: "create",
      payload: built.payload as unknown as Record<string, unknown>,
      requestedBy: input.requestedBy ?? null,
    })
    return { ok: true, requestId: String(row.id) }
  } catch (error) {
    return { ok: false, reason: "create_failed", error: error instanceof Error ? error.message : String(error) }
  }
}
