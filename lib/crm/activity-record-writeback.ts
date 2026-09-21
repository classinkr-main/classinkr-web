// 우리 어드민의 활동을 외부 CRM(XiaoshouYi)의 활동 기록으로 되밀기 위한 변환.
//
// 왜 활동부터인가: 활동 기록은 추가만 하는 로그라 되돌리기 쉽고, 양쪽 CRM이
// 갈라지는 가장 큰 원인이며, 실패해도 피해가 작다. 상태·금액처럼 되돌리기 어려운 것은 뒤로 미룬다.
//
// 다루는 소스 3종:
//   - lead_contact_logs   (전화·문자·카톡·메일) → 원격 접촉
//   - crm_customer_events (방문·메모)           → 방문/내방, 또는 원격
//   - crm_tasks           (완료된 데모)          → 방문/내방 (방향을 호출자가 정한다)
//
// entityType·groupId 는 추론이 아니라 실측값이다. SOQL 로는 라벨도 groupId 도 안 나오지만
// crm_get_record 로 기존 레코드를 읽으면 `entityType-label` 과 `groupId` 가 함께 나온다(2026-08-28 확인).
// 그래도 전송 자체는 승인 큐(draft)를 거친다 — 남의 CRM 에 남는 기록이라 사람이 한 번 본다.

import type { ContactLogResult, ContactLogType } from "@/lib/supabase/database.types"

/**
 * 외부 CRM 활동 유형 ID. 라벨은 crm_get_record 로 실측한 값이다.
 * - 11010011100001 快速沟通 — 전화·메신저 등 원격 접촉
 * - 11010011100002 线下拜访 — 오프라인 방문(우리가 고객에게 감)
 * - 3588972666094228 公司参访 — 고객사의 우리 회사 방문(고객이 옴)
 */
export const XIAOSHOUYI_ACTIVITY_ENTITY_TYPE = {
  remoteContact: "11010011100001",
  visit: "11010011100002",
  inboundVisit: "3588972666094228",
} as const

/**
 * 활동 갈래. 외부 CRM 의 entityType 으로 1:1 대응한다.
 *
 * ⚠️ "데모"에 해당하는 전용 entityType 은 외부 CRM 에 없다. 데모는 방향에 따라
 * visit(우리가 감) 또는 inbound_visit(고객이 옴)으로 접힌다 — 그래서 데모를 밀 때는
 * 호출자가 방향을 정해야 하고, 모르면 만들지 않는다.
 */
export type ActivityKind = "remote_contact" | "visit" | "inbound_visit"

const ENTITY_TYPE_BY_KIND: Record<ActivityKind, string> = {
  remote_contact: XIAOSHOUYI_ACTIVITY_ENTITY_TYPE.remoteContact,
  visit: XIAOSHOUYI_ACTIVITY_ENTITY_TYPE.visit,
  inbound_visit: XIAOSHOUYI_ACTIVITY_ENTITY_TYPE.inboundVisit,
}

/**
 * ⚠️ groupId 는 활동 유형별 상수가 아니다 — **대상 레코드(고객/EEO)마다 있는 피드 그룹 id** 다.
 * (처음엔 유형별 상수로 오인했는데, 기존 레코드들을 대조하니 groupId 가 대상 레코드 id 와
 * 인접한 값이었고, 대상 레코드를 crm_get_record 로 읽으면 `groupId` 필드가 그대로 나온다.)
 * 틀린 groupId 로도 생성은 성공하지만 남의 피드 그룹에 꽂혀 화면에서 보이지 않는다.
 * 따라서 호출자가 대상 레코드에서 읽어 넘겨야 한다
 * (`lib/external-crm/xiaoshouyi-request.ts` 의 fetchXiaoshouyiGroupId).
 */

/** 한국 지사 부서 id. 필수 필드이며 자동 주입되지 않는다(실측). */
export const XIAOSHOUYI_KR_DEPARTMENT_ID = "3632980020953825"

/** 활동 기록의 출처 객체 구분. 11=리드, 1=고객. */
export const XIAOSHOUYI_ACTIVITY_FROM = { lead: 11, account: 1 } as const

/** 외부 CRM 에서 사람이 직접 적은 기록과 구별하기 위한 꼬리표. */
const ORIGIN_TAG = "(ClassIn 어드민)"

/**
 * 본문 조각들을 한 줄로 묶고 출처 꼬리표를 붙인다.
 *
 * 꼬리표는 본문이 아니다 — 조각이 하나도 없는데 꼬리표만 남으면 "내용 있는 활동"으로 오인된다.
 * 그래서 빈 판정은 언제나 꼬리표를 붙이기 **전** 조각으로 한다.
 */
function composeContent(parts: readonly string[]): string {
  return [...parts, ORIGIN_TAG].join(" ")
}

function meaningfulParts(parts: readonly (string | null | undefined)[]): string[] {
  return parts.map((part) => part?.trim() ?? "").filter((part) => part.length > 0)
}

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

/** 되밀 대상을 가리키는 공통 좌표. 세 소스가 모두 이걸 채워 넘긴다. */
export interface ActivityWritebackTarget {
  /**
   * 외부 CRM 대상 레코드 id. `fromLead` 가 true 면 **리드 id**, 아니면 고객(account) id.
   * 관계의 정본은 `activityRecordFrom`(다형 참조 — 허용 목록에 lead 포함) +
   * `activityRecordFrom_data`(값) 쌍이다. `dbcRelation26` 은 고객 전용이라 리드에는 넣지 않는다.
   */
  externalAccountId: string | null
  /**
   * 외부 CRM 담당자 id. describe 상 **필수**다(되밀기 지침 §2-4·§5) — 비우면 자동 주입돼
   * 실행 계정 소유로 쌓이므로 모르면 만들지 않는다(`missing_owner`).
   * 어드민 계정 → 네오CRM ownerId 매핑은 아직 없다(지침 §9) — 호출자가 채워야 한다.
   */
  externalOwnerId: string | null
  /**
   * 대상 레코드의 피드 그룹 id — 대상을 단건 조회하면 groupId 로 나온다.
   * ⚠️ 리드 출처(`fromLead`)는 되밀기 지침 §8 확인 3(리드 단건 조회에 groupId 가 있는지)이
   * 아직 미확인이다. 리드에 groupId 가 없으면 리드 대상 활동은 `missing_group` 으로 막힌다.
   */
  targetGroupId: string | null
  /** 리드 단계에서 남긴 기록인지 — 출처 구분에 쓴다. */
  fromLead?: boolean
}

export interface ContactWritebackInput extends ActivityWritebackTarget {
  type: ContactLogType
  result: ContactLogResult | null
  notes: string | null
  contactedAt: string
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
  /**
   * 연관 레코드 id — `activityRecordFrom` 과 짝을 이루는 다형 참조의 값 쪽.
   * 복합 필드(`activityRecordFrom_compound`)로 묶어 보내면 타입 불일치로 거절된다.
   */
  activityRecordFrom_data: string
  itemId: string
  /**
   * 고객(account) 전용 참조. describe 상 `referObjectApiKey: "account"` 이고,
   * 실제 리드 출처 레코드(`activityRecordFrom = 11`)에서는 전부 null 이다(2026-09-07 실측).
   * 그래서 **리드에 붙일 때는 넣지 않는다** — 리드 id 를 넣으면 고객 참조에 리드 id 가 들어간다.
   */
  dbcRelation26?: string
  /** 담당자 — describe 필수. 정책(`xiaoshouyi-write.ts`)도 같은 값을 필수로 검증한다. */
  ownerId: string
}

export type ContactWritebackSkipReason =
  | "missing_account"
  | "missing_owner"
  | "invalid_time"
  | "missing_group"
  | "missing_content"
  | "unknown_kind"

export type ContactWritebackResult =
  | { ok: true; payload: ActivityRecordPayload }
  | { ok: false; reason: ContactWritebackSkipReason }

/** 활동 기록 본문. 외부 CRM 에서 이 줄만 보고도 무슨 접촉이었는지 알 수 있어야 한다. */
function contactContentParts(input: Pick<ContactWritebackInput, "type" | "result" | "notes">) {
  const head = CONTACT_TYPE_LABELS[input.type] ?? input.type
  const result = input.result ? CONTACT_RESULT_LABELS[input.result] ?? input.result : null
  const notes = input.notes?.trim()
  // 유형은 언제나 남는다 — 결과·메모가 비어도 "무슨 접촉이었나"는 정보다.
  return meaningfulParts([`[${head}]`, result, notes ? `— ${notes}` : null])
}

export function buildActivityContent(input: Pick<ContactWritebackInput, "type" | "result" | "notes">) {
  return composeContent(contactContentParts(input))
}

/**
 * 공통 조립부. 세 소스가 각자 content·시각·갈래만 정하고 나머지 계약은 여기서 한 번만 채운다.
 * 필수값이 하나라도 없으면 payload 를 만들지 않는다 — 조용히 잘못된 곳에 꽂히는 것보다 안 만드는 게 낫다.
 */
function buildActivityRecord(input: {
  target: ActivityWritebackTarget
  kind: ActivityKind | null
  contentParts: readonly string[]
  occurredAt: string
}): ContactWritebackResult {
  const { target } = input
  if (!target.externalAccountId) return { ok: false, reason: "missing_account" }
  // ownerId 는 describe 필수 — 비우면 실행 계정 소유로 자동 주입되고 정책 검증에서도 거절된다.
  if (!target.externalOwnerId) return { ok: false, reason: "missing_owner" }
  // 틀린 그룹으로 보내면 조용히 다른 피드에 꽂힌다 — 모르면 만들지 않는다.
  // (리드 출처는 지침 §8 확인 3 — 리드 단건 조회에 groupId 가 있는지 — 에 의존한다.)
  if (!target.targetGroupId) return { ok: false, reason: "missing_group" }
  if (!input.kind) return { ok: false, reason: "unknown_kind" }

  if (input.contentParts.length === 0) return { ok: false, reason: "missing_content" }
  const content = composeContent(input.contentParts)

  const startTime = Date.parse(input.occurredAt)
  if (!Number.isFinite(startTime)) return { ok: false, reason: "invalid_time" }

  const payload: ActivityRecordPayload = {
    content,
    startTime,
    endTime: startTime,
    entityType: ENTITY_TYPE_BY_KIND[input.kind],
    groupId: target.targetGroupId,
    dimDepart: XIAOSHOUYI_KR_DEPARTMENT_ID,
    belongId: 1,
    activityRecordFrom: target.fromLead ? XIAOSHOUYI_ACTIVITY_FROM.lead : XIAOSHOUYI_ACTIVITY_FROM.account,
    activityRecordFrom_data: target.externalAccountId,
    itemId: target.externalAccountId,
    ownerId: target.externalOwnerId,
  }
  // 고객 참조는 고객일 때만. 리드 id 를 여기 넣으면 account 참조에 리드 id 가 들어간다.
  // 정책(activityrecord.conditionalCreateRules)이 같은 규칙을 다시 검증한다 —
  // 고객 출처면 dbcRelation26 필수, 리드 출처면 금지.
  if (!target.fromLead) payload.dbcRelation26 = target.externalAccountId

  return { ok: true, payload }
}

export function buildActivityRecordPayload(input: ContactWritebackInput): ContactWritebackResult {
  // 우리 연락 기록 4종(전화·문자·카톡·메일)은 전부 원격 접촉이다.
  return buildActivityRecord({
    target: input,
    kind: "remote_contact",
    contentParts: contactContentParts(input),
    occurredAt: input.contactedAt,
  })
}

// ── 방문·메모 (crm_customer_events) ────────────────────────────────────────────

export interface CustomerEventWritebackInput extends ActivityWritebackTarget {
  title: string
  summary: string | null
  body: string | null
  occurredAt: string
  ownerName: string | null
  /**
   * 활동 갈래. 우리 `crm_customer_events` 에는 방향(우리가 감/고객이 옴)을 담는 칼럼이 없어서
   * 추론하지 않는다 — 호출자가 정하고, 모르면 null 로 두어 만들지 않는다.
   */
  kind: ActivityKind | null
}

/**
 * 방문·메모 본문. 제목이 핵심이고, 요약/본문은 있으면 한 줄로 덧댄다.
 * 외부 CRM 활동 본문은 목록에서 한 줄로 보이므로 줄바꿈을 공백으로 접는다.
 */
function customerEventContentParts(
  input: Pick<CustomerEventWritebackInput, "title" | "summary" | "body" | "ownerName">
) {
  const title = input.title?.trim()
  const detail = (input.summary?.trim() || input.body?.trim() || "").replace(/\s+/g, " ").trim()
  const owner = input.ownerName?.trim()

  return meaningfulParts([
    title ? `[${title}]` : null,
    detail ? (detail.length > 500 ? `${detail.slice(0, 500)}…` : detail) : null,
    owner ? `· ${owner}` : null,
  ])
}

export function buildCustomerEventContent(
  input: Pick<CustomerEventWritebackInput, "title" | "summary" | "body" | "ownerName">
) {
  return composeContent(customerEventContentParts(input))
}

export function buildCustomerEventWritebackPayload(input: CustomerEventWritebackInput): ContactWritebackResult {
  return buildActivityRecord({
    target: input,
    kind: input.kind,
    contentParts: customerEventContentParts(input),
    occurredAt: input.occurredAt,
  })
}

// ── 데모 (crm_tasks, 완료된 것만) ──────────────────────────────────────────────

export interface DemoTaskWritebackInput extends ActivityWritebackTarget {
  title: string
  detail: string | null
  outcome: string | null
  /** 완료 시각. 데모는 "일어난 일"이라 예정(due_at)이 아니라 완료 시각으로 기록한다. */
  completedAt: string | null
  ownerName: string | null
  /** 방문 데모인지 내방 데모인지 — 외부 CRM 에 데모 전용 유형이 없어서 호출자가 정한다. */
  kind: ActivityKind | null
}

function demoContentParts(
  input: Pick<DemoTaskWritebackInput, "title" | "detail" | "outcome" | "ownerName">
) {
  const title = input.title?.trim()
  const outcome = input.outcome?.trim()
  const detail = input.detail?.trim()
  const owner = input.ownerName?.trim()
  const tail = outcome || detail

  // "[데모]" 는 언제나 남는다 — 제목이 비어도 무슨 일이 있었는지는 정보다.
  return meaningfulParts(["[데모]", title, tail ? `— ${tail}` : null, owner ? `· ${owner}` : null])
}

export function buildDemoContent(
  input: Pick<DemoTaskWritebackInput, "title" | "detail" | "outcome" | "ownerName">
) {
  return composeContent(demoContentParts(input))
}

/**
 * 완료된 데모 하나를 활동 기록으로. 아직 안 끝난 데모(`completedAt` 없음)는 밀지 않는다 —
 * 외부 CRM 활동 기록은 "일어난 일"의 로그이지 예정표가 아니다.
 */
export function buildDemoTaskWritebackPayload(input: DemoTaskWritebackInput): ContactWritebackResult {
  if (!input.completedAt) return { ok: false, reason: "invalid_time" }
  return buildActivityRecord({
    target: input,
    kind: input.kind,
    contentParts: demoContentParts(input),
    occurredAt: input.completedAt,
  })
}

// ── 큐 적재 ────────────────────────────────────────────────────────────────────

async function enqueueActivityRecord(
  built: ContactWritebackResult,
  requestedBy: string | null
): Promise<{ ok: true; requestId: string } | { ok: false; reason: ContactWritebackSkipReason | "create_failed"; error?: string }> {
  if (!built.ok) return built

  const { createCrmWriteRequest } = await import("@/lib/external-crm/xiaoshouyi-write")
  try {
    const row = await createCrmWriteRequest({
      objectApiKey: "activityrecord",
      operation: "create",
      payload: built.payload as unknown as Record<string, unknown>,
      requestedBy,
    })
    return { ok: true, requestId: String(row.id) }
  } catch (error) {
    return { ok: false, reason: "create_failed", error: error instanceof Error ? error.message : String(error) }
  }
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
) {
  return enqueueActivityRecord(buildActivityRecordPayload(input), input.requestedBy ?? null)
}

/** 방문·메모(crm_customer_events) 하나를 되밀기 요청(draft)으로 올린다. */
export async function enqueueCustomerEventWriteback(
  input: CustomerEventWritebackInput & { requestedBy?: string | null }
) {
  return enqueueActivityRecord(buildCustomerEventWritebackPayload(input), input.requestedBy ?? null)
}

/** 완료된 데모(crm_tasks) 하나를 되밀기 요청(draft)으로 올린다. */
export async function enqueueDemoTaskWriteback(
  input: DemoTaskWritebackInput & { requestedBy?: string | null }
) {
  return enqueueActivityRecord(buildDemoTaskWritebackPayload(input), input.requestedBy ?? null)
}
