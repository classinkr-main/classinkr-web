// 체크 큐 카드의 "누가·언제" 줄과 비활성 버튼 사유(라운드 5 Q-8·Q-9) — 순수 함수.
//
// 카드에 입력자·시각이 없어 "이게 누가 언제 넣은 건지"를 알 수 없었고, 편집·삭제 버튼이 회색이 돼도 이유가 없었다
// (셀 입력은 저장과 동시에 자가 체크돼 곧장 편집이 막힌다 — 라운드 4 P0-2). 시각은 절대 시각(월/일 시:분)으로 적는다 —
// 렌더 중 현재 시각을 읽지 않아(순수) 서버·클라이언트 표기가 같다.

import { isSelfCheckedDraft } from "./self-check"
import { formatDateTime, type LedgerDraft } from "./shared"

type DraftMetaInput = Pick<LedgerDraft, "status" | "createdAt" | "updatedAt" | "createdBy" | "checkedBy">

/** "입력 홍길동 · 9. 23. 14:05 · 수정 9. 23. 15:10 · 체크 김검수" — 모르는 값은 뺀다. */
export function draftAuthorLine(draft: DraftMetaInput): string {
  const parts: string[] = []
  const author = draft.createdBy?.trim()
  parts.push(`입력 ${author || "미확인"}`)
  if (draft.createdAt) parts.push(formatDateTime(draft.createdAt))
  const created = Date.parse(draft.createdAt)
  const updated = Date.parse(draft.updatedAt)
  // 1분 넘게 뒤에 고쳐졌으면 수정 시각도(저장 직후 서버 타임스탬프 차이는 무시).
  if (Number.isFinite(created) && Number.isFinite(updated) && updated - created > 60_000) {
    parts.push(`수정 ${formatDateTime(draft.updatedAt)}`)
  }
  const checker = draft.checkedBy?.trim()
  if (checker && (draft.status === "checked" || draft.status === "applied") && checker !== author) {
    parts.push(`체크 ${checker}`)
  }
  return parts.join(" · ")
}

/** 편집 버튼이 막힌 이유(막히지 않았으면 null). 큐 카드 편집은 draft 상태에서만 열린다. */
export function draftEditDisabledReason(draft: Pick<LedgerDraft, "status" | "createdBy" | "checkedBy">): string | null {
  if (draft.status === "checked") {
    return isSelfCheckedDraft(draft)
      ? "셀 입력은 저장과 함께 체크까지 끝난 초안입니다 — 고치려면 '체크 해제' 후 편집하세요"
      : "체크된 초안은 편집할 수 없습니다 — '체크 해제' 후 편집하세요"
  }
  if (draft.status === "applied") return "적용된 초안은 편집할 수 없습니다 — 되돌리기(상쇄) 뒤 새로 입력하세요"
  if (draft.status === "cancelled") return "취소된 초안은 편집할 수 없습니다"
  return null
}

/** 삭제 버튼이 막힌 이유(막히지 않았으면 null). 삭제는 draft 상태에서만 — 그 밖은 취소·되돌리기로. */
export function draftDeleteDisabledReason(draft: Pick<LedgerDraft, "status">): string | null {
  if (draft.status === "checked") return "체크된 초안은 삭제할 수 없습니다 — '체크 해제' 후 삭제하거나 '취소'하세요(기록 보존)"
  if (draft.status === "applied") return "적용된 초안은 삭제할 수 없습니다 — 되돌리기(상쇄)를 쓰세요"
  if (draft.status === "cancelled") return "취소된 초안은 삭제할 수 없습니다(감사 기록)"
  return null
}
