// 체크 큐 일괄 체크·일괄 적용 대상 계산 — 순수 함수(DraftQueue가 확인 다이얼로그에 건수·합계를 보여준다).
// 3단계(초안→체크→적용)는 그대로 두고, 한 건씩 누르던 동작을 "지금 보이는 목록" 단위로 묶는다(2026-09-14).
// 로컬 임시 초안(local-*)은 DB 장부에 적용할 수 없으므로 적용 계획에서 빼고 건수만 알린다.

interface DraftLike {
  id: string
  status: string
  amount: number
}

export interface BulkPlan {
  ids: string[]
  count: number
  total: number
}

function toPlan(items: readonly DraftLike[]): BulkPlan {
  return {
    ids: items.map((item) => item.id),
    count: items.length,
    total: items.reduce((sum, item) => sum + (Number.isFinite(item.amount) ? item.amount : 0), 0),
  }
}

export function planBulkCheck(drafts: readonly DraftLike[]): BulkPlan {
  return toPlan(drafts.filter((draft) => draft.status === "draft"))
}

export function planBulkApply(drafts: readonly DraftLike[]): BulkPlan & { skippedLocal: number } {
  const checked = drafts.filter((draft) => draft.status === "checked")
  const local = checked.filter((draft) => draft.id.startsWith("local-"))
  return { ...toPlan(checked.filter((draft) => !draft.id.startsWith("local-"))), skippedLocal: local.length }
}
