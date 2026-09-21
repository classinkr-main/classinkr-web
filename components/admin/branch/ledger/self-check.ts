// 자가 체크 판정(입력 속도 라운드 4, P0-2 — docs/active/sales-ledger-input-speed-plan-2026-09-20.md §4).
//
// 매트릭스 셀 커밋은 저장 시점에 status=checked로 올라오고 checked_by가 작성자와 같다 — 2단 게이트
// (초안 → 체크 → 적용)를 없앤 게 아니라 "체크 시점을 입력 시점으로 당긴" 것이라, 큐에서는 이 초안이
// 남(검수자)의 체크가 아니라 본인 체크임을 배지로 드러내야 한다. 새 컬럼을 만들지 않고 이미 있는
// created_by / checked_by 두 감사 필드의 일치로만 파생한다(서버 JSON에 실려 오는 값 그대로).
//
// applied까지 true를 유지하는 이유: 적용 뒤에도 "누가 체크했는가"는 감사 표시로 유효하다.
// draft/cancelled는 체크가 없거나 무효라 항상 false.
export function isSelfCheckedDraft(draft: {
  status: string
  createdBy?: string | null
  checkedBy?: string | null
}): boolean {
  if (draft.status !== "checked" && draft.status !== "applied") return false
  const created = draft.createdBy?.trim()
  const checked = draft.checkedBy?.trim()
  return Boolean(created && checked && created === checked)
}

export const SELF_CHECK_BADGE_LABEL = "자가 체크"
export const SELF_CHECK_BADGE_TITLE = "입력한 사람이 저장 시점에 직접 체크한 초안입니다 — 적용은 여전히 체크 큐에서 명시적으로 합니다."
