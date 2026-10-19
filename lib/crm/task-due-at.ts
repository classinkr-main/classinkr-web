// CRM 할 일 기한(dueAt) 요청 값 파서 — POST(생성)와 PATCH update(편집)가 같은 규칙을 공유한다.
//
// 3상태: 키 없음(undefined) = 지정 안 함(생성: 기한 없음 / 편집: 그대로), null = 기한 없음(편집: 지움),
// 날짜 문자열 = 그 시각(UTC ISO로 정규화). 빈 문자열도 기한 없음으로 받는다 — 비운 날짜 입력칸이 ""를 보낸다.
//
// 이전엔 POST가 optionalString으로 읽어 숫자·객체는 null로, 해석 못 하는 문자열은 저장소 nullableIso가
// null로 바꿔 "기한 없음"으로 조용히 저장했다(PATCH만 400으로 막았다). 이제 둘 다 400으로 거절한다.

export type TaskDueAtParse =
  | { ok: true; dueAt: string | null | undefined }
  | { ok: false; error: string }

export const TASK_DUE_AT_TYPE_ERROR = "dueAt must be a date string or null"
export const TASK_DUE_AT_INVALID_ERROR = "Invalid dueAt"

export function parseTaskDueAt(value: unknown): TaskDueAtParse {
  if (value === undefined) return { ok: true, dueAt: undefined }
  if (value === null) return { ok: true, dueAt: null }
  if (typeof value !== "string") return { ok: false, error: TASK_DUE_AT_TYPE_ERROR }
  const trimmed = value.trim()
  if (!trimmed) return { ok: true, dueAt: null }
  const time = new Date(trimmed).getTime()
  if (Number.isNaN(time)) return { ok: false, error: TASK_DUE_AT_INVALID_ERROR }
  return { ok: true, dueAt: new Date(time).toISOString() }
}
