// 칸 저장 진행 중(F-05 · F-19) — 워크벤치가 칸 커밋을 보낸 뒤 응답이 오기 전까지 칸에 그릴 것을 정하는 순수 함수.
//
//  - 진행 중 저장의 입력(pendingFromDraftInput)을 대기 초안 지도(pendingByCell) 위에 얹어, 방금 친 금액이 응답 전에도
//    칸에 대기 스타일로 보이게 한다(overlayInFlightPending — 표시 전용, 저장 대상 판정은 서버 목록 지도 그대로).
//  - "저장 중" 칸(행 → 달 · 주차 집합) — 훅(useLedgerDraftQueue)의 savingCellKeys(칸 키 ledgerCellKey)와 워크벤치가 들고
//    있는 진행 중 저장을 합친다(savingCellsByRow). 시트 보기 · 주차 검수 표의 주차 칸이 aria-busy · '저장 중…'으로 그린다.
//
// 렌더 없이 테스트한다(tests/branch/ledger-cell-flight.test.ts).

import { matrixCoordKey, rowCommitKind, type MatrixPendingDraft } from "./rev-matrix-logic"
import type { DraftKind, LedgerRevenueRow } from "./shared"

/** 응답을 기다리는 칸 저장 하나 — (행, 달, 종류)마다 마지막으로 보낸 것. */
export interface InFlightCell {
  rowId: string
  month: string
  kind: DraftKind
  /** 고친 주차(0~4). 월 칸이면 null. */
  week: number | null
  /** 보낸 입력의 요약(pendingFromDraftInput) — 주차 칸 커밋이면 그 달 주차 5칸(weekly)을 싣는다. */
  pending: MatrixPendingDraft
}

/** "저장 중" 칸의 행 안 키 — 주차 칸은 0~4, 월 칸은 "month". */
export function cellSavingKey(month: string, week: number | null | undefined): string {
  return `${month}::${week == null ? "month" : week}`
}

const EMPTY_SAVING: ReadonlyMap<string, ReadonlySet<string>> = new Map()

/**
 * 진행 중 저장을 대기 초안 지도에 얹은 표시용 지도. 진행 중 저장이 없으면 입력 지도 그대로(같은 참조 — 메모가 깨지지 않는다).
 *  - 그 달 키(`행::달`)는 진행 중 저장이 차지한다(가장 최근 입력).
 *  - 주차 칸 커밋(weekly 있음): 고친 주차 키와, 같은 달에 이미 있던 주차 키를 진행 중 저장으로 바꾼다 — 예전 한 주차 초안이
 *    남아 다른 값을 보이지 않게. 바뀌지 않은 다른 주차는 그 달 키의 weekly 와 지금 칸 값을 비교해 보인다(matrixWeekPendingAmounts).
 *  - 월 칸 커밋(weekly 없음): 그 달은 월 금액으로 바뀌므로 같은 달 주차 키를 지운다.
 * 저장 대상(PATCH · POST) 판정에는 쓰지 않는다 — 진행 중 저장의 id 는 서버 id 가 아닐 수 있다("in-flight").
 */
export function overlayInFlightPending(
  pendingByCell: Map<string, MatrixPendingDraft>,
  inFlight: ReadonlyMap<string, InFlightCell>,
): Map<string, MatrixPendingDraft> {
  if (inFlight.size === 0) return pendingByCell
  const out = new Map(pendingByCell)
  for (const cell of inFlight.values()) {
    const pending: MatrixPendingDraft = { ...cell.pending, kind: cell.kind }
    out.set(matrixCoordKey({ rowId: cell.rowId, month: cell.month }), pending)
    for (let week = 0; week < 5; week += 1) {
      const key = matrixCoordKey({ rowId: cell.rowId, month: cell.month, week })
      if (pending.weekly) {
        if (week === cell.week || out.has(key)) out.set(key, pending)
      } else {
        out.delete(key)
      }
    }
  }
  return out
}

/** 훅 칸 키(ledgerCellKey: `종류|deal:딜|달|주차` · `종류|customer:고객|달|주차`)를 나눈다. 모양이 틀리면 null. */
export function parseLedgerCellKey(key: string): {
  kind: DraftKind
  deal: string | null
  customer: string | null
  month: string
  week: number | null
} | null {
  const first = key.indexOf("|")
  const last = key.lastIndexOf("|")
  const beforeLast = last > 0 ? key.lastIndexOf("|", last - 1) : -1
  if (first < 0 || beforeLast <= first) return null
  const kind = key.slice(0, first)
  if (kind !== "edit-row" && kind !== "new-row") return null
  const target = key.slice(first + 1, beforeLast)
  const month = key.slice(beforeLast + 1, last)
  const weekToken = key.slice(last + 1)
  if (!/^\d{4}-\d{2}$/.test(month)) return null
  let week: number | null = null
  if (weekToken !== "month") {
    const match = /^w([1-5])$/.exec(weekToken)
    if (!match) return null
    week = Number(match[1]) - 1
  }
  if (target.startsWith("deal:")) {
    const deal = target.slice("deal:".length)
    return deal ? { kind, deal, customer: null, month, week } : null
  }
  if (target.startsWith("customer:")) {
    const customer = target.slice("customer:".length)
    return customer ? { kind, deal: null, customer, month, week } : null
  }
  return null
}

type SavingRow = Pick<LedgerRevenueRow, "id" | "sourceDealId" | "ledgerOrigin" | "customer">

/**
 * 행 id → "저장 중" 칸 집합(cellSavingKey). 훅의 칸 키는 그 칸의 딜(수정: 원천 딜 · 신규: 고객 이름)로 행을 찾는다 — 칸 커밋과
 * 같은 판정(rowCommitKind, 원천 딜 = row.sourceDealId ?? 시트 행 id). 진행 중 저장은 행 id 를 들고 있다.
 * 아무것도 없으면 늘 같은 빈 지도(메모가 깨지지 않는다).
 */
export function savingCellsByRow(
  rows: ReadonlyArray<SavingRow>,
  savingKeys: ReadonlySet<string>,
  inFlight: ReadonlyMap<string, InFlightCell>,
): ReadonlyMap<string, ReadonlySet<string>> {
  if (savingKeys.size === 0 && inFlight.size === 0) return EMPTY_SAVING
  const out = new Map<string, Set<string>>()
  const add = (rowId: string, month: string, week: number | null) => {
    let set = out.get(rowId)
    if (!set) {
      set = new Set()
      out.set(rowId, set)
    }
    set.add(cellSavingKey(month, week))
  }
  for (const cell of inFlight.values()) add(cell.rowId, cell.month, cell.week)
  const parsed = Array.from(savingKeys, parseLedgerCellKey).filter((value): value is NonNullable<typeof value> => value != null)
  if (parsed.length > 0) {
    for (const row of rows) {
      const kind = rowCommitKind(row)
      const deal = row.sourceDealId ?? (row.ledgerOrigin === "sheet" ? row.id : undefined)
      const customer = row.customer.trim()
      for (const key of parsed) {
        if (key.kind !== kind) continue
        if (kind === "edit-row" ? key.deal !== deal : key.customer !== customer) continue
        add(row.id, key.month, key.week)
      }
    }
  }
  return out.size === 0 ? EMPTY_SAVING : out
}

/** 같은 (행, 달)의 응답 전 저장 — 그 저장이 끝나면 생기는 초안(없으면 null). */
export interface PriorCellCommit {
  promise: Promise<{ id: string } | null>
}

/**
 * 칸 저장을 어떻게 보낼지(F-05) — 같은 칸에 서버 대기 초안이 있으면 그것을 PATCH, 같은 (행, 달)의 저장이 아직 응답을 기다리면
 * 그 저장이 끝난 뒤 그 초안을 PATCH(응답 전에 다음 주차를 쳐도 초안이 하나 더 생기지 않는다 — 로컬 임시 초안이면 그것을 고친다),
 * 둘 다 없으면 새로 만든다. 앞 저장이 아무 초안도 남기지 못했으면(검증 거부 · 서버 실패) 새로 만든다.
 * chained = 앞 저장에 이어 붙인 PATCH(실행 취소를 달지 않는다 — 취소하면 앞 주차까지 사라진다).
 */
export function chainCellCommit<I, R>(args: {
  existingId: string | null
  prior: PriorCellCommit | null
  input: I
  updateDraft: (id: string, input: I) => Promise<R>
  createDraft: (input: I) => Promise<R>
}): { persist: Promise<R>; chained: boolean } {
  const { existingId, prior, input, updateDraft, createDraft } = args
  if (existingId) return { persist: updateDraft(existingId, input), chained: false }
  if (prior) {
    return {
      persist: prior.promise.then((draft) => (draft ? updateDraft(draft.id, input) : createDraft(input))),
      chained: true,
    }
  }
  return { persist: createDraft(input), chained: false }
}
