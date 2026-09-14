// 구글 API 오류 재시도 판정 — 순수 함수(google-sheets.ts의 withRetry가 쓴다).
// 400·401·403·404는 다시 보내도 결과가 같다(범위 문법·자격증명·공유 끊김·API 미사용 설정·시트 ID).
// 이런 오류를 0+200+800+2000ms 백오프로 재시도하면 요청마다 3초가 버려진다 — 실측(2026-09-14):
// 시트 403 상태에서 summary p50 4.1초, data-quality 5초 뒤 500. 429·5xx·네트워크 오류만 재시도한다.

const NON_RETRYABLE_STATUS = new Set([400, 401, 403, 404])

function toStatus(value: unknown): number | null {
  const numeric = typeof value === "string" && /^\d{3}$/.test(value) ? Number(value) : value
  return typeof numeric === "number" && Number.isInteger(numeric) ? numeric : null
}

// gaxios(googleapis) 오류는 status·code·response.status 중 어디에든 HTTP 코드를 싣는다.
// 모양을 모르면 재시도한다 — 예전 동작(무조건 재시도)을 안전망으로 유지한다.
export function isRetryableGoogleError(error: unknown): boolean {
  if (!error || typeof error !== "object") return true
  const record = error as { status?: unknown; code?: unknown; response?: { status?: unknown } | null }
  const status = toStatus(record.status) ?? toStatus(record.code) ?? toStatus(record.response?.status)
  if (status == null) return true
  return !NON_RETRYABLE_STATUS.has(status)
}
