// 입력 큐 초안 목록 보관 규칙(라운드 5 Q-1) — 순수 함수.
//
// 예전엔 상태가 바뀔 때마다 목록을 최근 50건으로 잘랐다(slice(0, 50)). 큰 붙여넣기(최대 600칸)가 끝나면
// 대기 초안 대부분이 목록에서 빠져, 큐·일괄 적용·FAB 배지·매트릭스 대기 표시와 "같은 셀 재편집이면 새 초안
// 대신 그 초안을 PATCH"하는 이중 계상 방지 판정이 그 초안을 못 봤다. 이제 열린 초안(draft·checked)과 서버에
// 아직 못 올린 로컬 초안(local-*)은 전부 두고, 닫힌 초안(적용·취소)만 최근 이력 몫(기본 50)으로 자른다.

import type { LedgerDraft } from "./shared"

export const LEDGER_CLOSED_DRAFTS_KEEP = 50

export function isOpenLedgerDraft(draft: Pick<LedgerDraft, "id" | "status">): boolean {
  return draft.status === "draft" || draft.status === "checked" || draft.id.startsWith("local-")
}

/** 순서를 유지한 채 열린·로컬 초안은 모두, 닫힌 초안은 앞에서부터 closedKeep건만 남긴다. */
export function capLedgerDrafts(drafts: readonly LedgerDraft[], closedKeep = LEDGER_CLOSED_DRAFTS_KEEP): LedgerDraft[] {
  let closed = 0
  const kept: LedgerDraft[] = []
  for (const draft of drafts) {
    if (isOpenLedgerDraft(draft)) {
      kept.push(draft)
      continue
    }
    if (closed < closedKeep) {
      kept.push(draft)
      closed += 1
    }
  }
  return kept
}
