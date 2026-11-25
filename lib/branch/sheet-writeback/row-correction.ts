// 시트 행(Row ID)·월당 활성 정정 1건 — 순수 모듈(클라이언트 겸용 — server-only 금지).
//
// 왜(F-04): 장부의 유일성 인덱스(branch_sales_ledger_entries_active_manual_edit_unique)는 (source_deal_id, 월)이다.
// source_deal_id 는 REV 동기화(replace_branch_rev_deals)마다 새로 만들어지므로, 동기화 뒤 같은 시트 칸을 다시 정정하면
// 인덱스가 막지 못하고 두 정정이 함께 활성으로 남는다(600,000 + 650,000). 반영 직전에 초안을 시트 Row ID
// (sourceSnapshot.sheetBaseline.rowId — '2. REV' 숨김 열, 정렬·동기화에도 그대로)로 풀어 (Row ID, 월)로 한 번 더 본다.
// DB 인덱스(source_row_id 칸 + 부분 유일 인덱스)는 마이그레이션이 필요해 미뤘다 — 그때까지 이 검사와 기존 SQL 검사가 함께 막는다.
//
// 세지 않는 것:
//  - 자기 자신(같은 초안)에게서 나온 항목.
//  - 시트에 쓴 정정(되돌리기가 막힌 항목 — ledger-rules.ts sheetWriteBlocksReverse). 그 값은 다음 동기화가 시트 값으로
//    흡수하므로 겹쳐 세이지 않고, 시트 고정 뒤에는 "장부에서 원래 값으로 다시 입력"(F-22)이 유일한 길이라 막으면 안 된다.
//  - Row ID 가 없는 초안·항목(Row ID 스크립트를 돌리기 전 행) — 기존 SQL 검사(딜 id)만 받는다.

import { isValidRowId } from "./row-id"

/** 초안·항목 sourceSnapshot 의 시트 Row ID(sheetBaseline.rowId). 형식이 틀리거나 없으면 null. */
export function snapshotRowId(snapshot: Record<string, unknown> | null | undefined): string | null {
  const baseline = snapshot?.sheetBaseline
  if (!baseline || typeof baseline !== "object" || Array.isArray(baseline)) return null
  const rowId = (baseline as Record<string, unknown>).rowId
  return isValidRowId(rowId) ? rowId : null
}

export interface RowCorrectionDraft {
  id: string
  month: string
  sourceSnapshot: Record<string, unknown> | null | undefined
}

export interface RowCorrectionEntry {
  draftId?: string | null
  entryType: string
  entryStatus: string
  month: string
  sourceSnapshot: Record<string, unknown> | null | undefined
}

function rowMonthKey(rowId: string, month: string): string {
  return `${rowId}|${month}`
}

function activeEditKeys(entries: ReadonlyArray<RowCorrectionEntry>) {
  const byKey = new Map<string, RowCorrectionEntry[]>()
  for (const entry of entries) {
    if (entry.entryType !== "manual-edit" || entry.entryStatus !== "active") continue
    const rowId = snapshotRowId(entry.sourceSnapshot)
    if (!rowId) continue
    const key = rowMonthKey(rowId, entry.month)
    byKey.set(key, [...(byKey.get(key) ?? []), entry])
  }
  return byKey
}

/**
 * 초안과 (Row ID, 월)이 겹치는 활성 정정 항목의 초안 id — 시트에 쓴 항목인지 감사 표에서 확인할 대상이다.
 * 자기 자신에게서 나온 항목은 뺀다. 초안 id 가 없는 항목은 확인할 것이 없어 싣지 않는다(그대로 겹침으로 센다).
 */
export function clashingEntryDraftIds(
  drafts: ReadonlyArray<RowCorrectionDraft>,
  entries: ReadonlyArray<RowCorrectionEntry>,
): string[] {
  const byKey = activeEditKeys(entries)
  const ids = new Set<string>()
  for (const draft of drafts) {
    const rowId = snapshotRowId(draft.sourceSnapshot)
    if (!rowId) continue
    for (const entry of byKey.get(rowMonthKey(rowId, draft.month)) ?? []) {
      if (entry.draftId && entry.draftId !== draft.id) ids.add(entry.draftId)
    }
  }
  return [...ids]
}

/**
 * (Row ID, 월)에 이미 활성 정정이 있어 막을 초안 id. 같은 요청 안에서 두 초안이 같은 (Row ID, 월)을 노리면 앞의 것만
 * 통과한다(요청 순서). sheetWrittenDraftIds 는 시트에 쓴 정정의 초안 id — 그 항목은 세지 않는다.
 */
export function draftsBlockedByRowCorrection(
  drafts: ReadonlyArray<RowCorrectionDraft>,
  entries: ReadonlyArray<RowCorrectionEntry>,
  sheetWrittenDraftIds: ReadonlySet<string> = new Set(),
): Set<string> {
  const byKey = activeEditKeys(entries)
  const blocked = new Set<string>()
  const claimed = new Set<string>()
  for (const draft of drafts) {
    const rowId = snapshotRowId(draft.sourceSnapshot)
    if (!rowId) continue
    const key = rowMonthKey(rowId, draft.month)
    const clash = (byKey.get(key) ?? []).some(
      (entry) => entry.draftId !== draft.id && !(entry.draftId && sheetWrittenDraftIds.has(entry.draftId)),
    )
    if (clash || claimed.has(key)) {
      blocked.add(draft.id)
      continue
    }
    claimed.add(key)
  }
  return blocked
}
