"use client"

import { adminAiStore, selectGraceOrders, selectLiveOrders, type AdminAiState } from "@/lib/admin-ai/store"

const TOAST_BUTTON =
  "shrink-0 rounded px-1.5 py-0.5 text-[12px] font-semibold text-white underline underline-offset-2 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white"

/**
 * 새 대화 직후 6초 동안 뜨는 알림 — 직전 대화 되돌리기(N2). 지우지 않는 것도 함께 알린다(N3·N7):
 * 발송 유예 중인 오더가 있으면 "계속 진행됩니다 · 발송 취소", 그 밖의 오더가 있으면 "새 대화에도 남습니다".
 * 카운트다운은 그리지 않는다 — 읽어 주는 글이 매초 바뀌지 않게.
 */
export function NewConversationToast({
  state,
  className = "",
}: {
  state: AdminAiState
  className?: string
}) {
  if (!state.undoSnapshot) return null
  const grace = selectGraceOrders(state)
  const live = selectLiveOrders(state)

  return (
    <div
      role="status"
      className={`flex flex-col gap-1.5 rounded-lg bg-[#111110] px-3 py-2.5 text-[12px] text-white shadow-[0_6px_14px_rgba(0,0,0,0.12)] ${className}`}
    >
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1">새 대화를 시작했습니다</span>
        <button type="button" className={TOAST_BUTTON} onClick={() => adminAiStore.restoreConversation()}>
          되돌리기
        </button>
      </div>
      {grace.length > 0 ? (
        <div className="flex items-center gap-2 border-t border-white/15 pt-1.5">
          <span className="min-w-0 flex-1">발송 대기 {grace.length}건은 계속 진행됩니다</span>
          <button type="button" className={TOAST_BUTTON} onClick={() => adminAiStore.abortGraceOrders()}>
            발송 취소
          </button>
        </div>
      ) : live.length > 0 ? (
        <p className="border-t border-white/15 pt-1.5 text-white/80">
          오더 {live.length}건은 새 대화에도 남습니다
        </p>
      ) : null}
    </div>
  )
}
