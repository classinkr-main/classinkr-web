import type { ContactLogResult, ContactLogType } from "@/lib/repositories/contact-logs"

// 연락 기록의 채널↔결과 규약 SSOT.
//
// 채널 4종은 DB CHECK(supabase/migrations/20260409_schema_fixes.sql)과 API 검증이 같이 거는 상한이고,
// 결과(연결됨·부재중·콜백 요청·미팅 확정)는 통화 성격이 있는 채널에만 의미가 있다.
// 카카오·이메일에 결과를 실어 보내면 저장은 되지만 "발신했을 뿐인 기록"에 통화 결과가 붙어
// 응대 통계가 조용히 부풀어 오른다 — 그래서 클라이언트와 서버가 같은 표를 보고 떨어뜨린다.
export const CONTACT_LOG_RESULT_CHANNELS: ReadonlySet<ContactLogType> = new Set<ContactLogType>([
  "call",
  "sms",
])

export function channelCarriesResult(type: ContactLogType): boolean {
  return CONTACT_LOG_RESULT_CHANNELS.has(type)
}

/** 연락 로그 채널 4종 — DB CHECK(20260409_schema_fixes.sql)와 같은 상한. */
export const CONTACT_LOG_TYPES: readonly ContactLogType[] = ["call", "sms", "kakao", "email"]
/** 통화 결과 4종 — DB CHECK와 같은 상한. */
export const CONTACT_LOG_RESULTS: readonly ContactLogResult[] = ["answered", "no_answer", "callback", "meeting_set"]

export function isContactLogType(value: unknown): value is ContactLogType {
  return typeof value === "string" && (CONTACT_LOG_TYPES as readonly string[]).includes(value)
}

export function isContactLogResult(value: unknown): value is ContactLogResult {
  return typeof value === "string" && (CONTACT_LOG_RESULTS as readonly string[]).includes(value)
}

/**
 * 기록 컴포저(POST /api/admin/crm/events)의 어떤 저장이 "리드에게 실제로 연락한 것"인지와 그 채널을 정한다.
 *
 * - 콜 모드(sourceType "call") = 전화.
 * - 문자 모드(sourceType "sms", 폼 설명 "문자·카톡 발신/회신") = 문자. 요청이 contactChannel로
 *   kakao·email을 명시하면 그 채널로 좁힌다(전화로는 바꾸지 않는다 — 콜은 콜 모드로만).
 * - 메모·회의록·녹음 등 그 밖의 모드는 연락 로그 채널이 아니다(null) — 기존처럼 기록만 남는다.
 */
export function resolveComposerContactChannel(
  sourceType: string | null | undefined,
  requestedChannel?: unknown
): ContactLogType | null {
  if (sourceType === "call") return "call"
  if (sourceType !== "sms") return null
  if (requestedChannel === "kakao" || requestedChannel === "email") return requestedChannel
  return "sms"
}

export type ContactLogDraft = {
  type: ContactLogType
  result?: ContactLogResult
  notes?: string
  contacted_by?: string
}

/**
 * 저장 페이로드를 만든다. 채널이 결과를 갖지 않으면 `result` 키 자체를 넣지 않는다
 * (undefined로 넘기면 JSON 직렬화에서 사라지지만, 키를 붙였다 지웠다 하는 분기가
 * 호출부마다 갈라지지 않도록 이 함수 하나에서 결정한다).
 * 빈 문자열 메모·담당자도 같은 이유로 떨어뜨린다.
 */
export function buildContactLogEntry(draft: ContactLogDraft): ContactLogDraft {
  const entry: ContactLogDraft = { type: draft.type }
  if (draft.result && channelCarriesResult(draft.type)) entry.result = draft.result
  const notes = draft.notes?.trim()
  if (notes) entry.notes = notes
  const contactedBy = draft.contacted_by?.trim()
  if (contactedBy) entry.contacted_by = contactedBy
  return entry
}
