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
