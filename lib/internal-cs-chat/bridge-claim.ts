// 브리지 웹훅 이벤트 선점(claim) 규칙. 순수 함수만 둔다(저장소·라우트가 함께 쓴다).

/** accepted/processing 상태로 이 시간이 지나면 처리하던 요청이 죽은 것으로 보고 같은 멱등 키 재요청에 다시 처리를 허용한다. */
export const INTERNAL_CS_BRIDGE_STALE_PROCESSING_MS = 5 * 60 * 1000

export interface InternalCsBridgeClaimState {
  status: string
  updated_at?: string | null
  created_at?: string | null
}

/**
 * 같은 멱등 키로 다시 들어온 이벤트를 다시 처리해도 되는가.
 * - failed: 항상(문서 계약: 재시도는 같은 키를 쓴다)
 * - accepted/processing: 마지막 갱신 후 N분이 지났을 때(처리하던 쪽이 죽은 경우)
 * - completed: 절대 아님(같은 결과를 돌려준다)
 */
export function isInternalCsBridgeEventReclaimable(
  event: InternalCsBridgeClaimState,
  now: Date = new Date(),
  staleMs: number = INTERNAL_CS_BRIDGE_STALE_PROCESSING_MS
) {
  if (event.status === "failed") return true
  if (event.status !== "accepted" && event.status !== "processing") return false
  const stamp = Date.parse(event.updated_at ?? event.created_at ?? "")
  if (!Number.isFinite(stamp)) return false
  return now.getTime() - stamp >= staleMs
}
