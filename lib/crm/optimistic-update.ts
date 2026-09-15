/**
 * 낙관적 갱신의 순서를 고정한다: 스냅샷 → 로컬 반영(apply) → 커밋(commit) → 실패 시 롤백(rollback).
 *
 * 쓰기 성공 응답을 기다리지 않고 화면을 먼저 바꾸되, 실패하면 반드시 스냅샷으로 되돌린다.
 * 재검증(force 없는 백그라운드 재조회)은 commit 안이나 성공 뒤에 소비처가 흘린다.
 *
 * 사용:
 *   const result = await runOptimistic({
 *     snapshot: () => rows,
 *     apply: () => setRows((prev) => prev.filter((r) => r.id !== id)),
 *     commit: () => adminFetchJson(`/api/…/${id}`, { method: "DELETE" }),
 *     rollback: (saved) => setRows(saved),
 *     onError: (e) => setNotice({ tone: "danger", message: toMessage(e) }),
 *   })
 *   if (result.ok) focusNextRow()
 *
 * commit 이 거부되면 rollback → onError 순으로 호출하고 `{ ok:false, error }` 를 돌려준다.
 * 예외를 다시 던지지 않으므로 소비처는 반환값으로 후속 처리를 분기한다.
 */
export interface OptimisticUpdate<S> {
  /** apply 직전 상태를 캡처한다. rollback 에 그대로 전달된다. */
  snapshot: () => S
  /** 로컬 상태를 즉시 바꾼다(setState 등). */
  apply: () => void
  /** 서버 쓰기. 거부(reject)되면 실패로 본다. */
  commit: () => Promise<unknown>
  /** commit 실패 시 snapshot 값으로 되돌린다. */
  rollback: (snapshot: S) => void
  /** rollback 뒤 호출. 실패 배너·토스트 표시용. */
  onError?: (error: unknown) => void
}

export type OptimisticResult = { ok: true } | { ok: false; error: unknown }

export async function runOptimistic<S>(update: OptimisticUpdate<S>): Promise<OptimisticResult> {
  const saved = update.snapshot()
  update.apply()
  try {
    await update.commit()
    return { ok: true }
  } catch (error) {
    update.rollback(saved)
    update.onError?.(error)
    return { ok: false, error }
  }
}
