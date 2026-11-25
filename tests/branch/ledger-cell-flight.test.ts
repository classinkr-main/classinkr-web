// 칸 저장 진행 중(F-05 · F-19) — 워크벤치 칸 커밋이 응답 전에 칸에 그릴 것과 저장을 잇는 순수 함수(ledger-cell-flight.ts).
//  - 진행 중 저장을 대기 초안 지도에 얹는다: 방금 친 금액이 응답 전에도 대기 금액으로 보인다(표시 전용).
//  - "저장 중" 칸: 훅의 칸 키(ledgerCellKey)와 워크벤치의 진행 중 저장을 행 → 달 · 주차로 모은다.
//  - 저장 잇기: W3 저장이 응답 전인데 W4 를 치면 새 초안을 만들지 않고 W3 저장의 초안을 PATCH 한다 — 두 주차가 한 초안에 남는다.
import { describe, expect, it } from "vitest"

import {
  cellSavingKey,
  chainCellCommit,
  overlayInFlightPending,
  parseLedgerCellKey,
  savingCellsByRow,
  type InFlightCell,
} from "@/components/admin/branch/ledger/ledger-cell-flight"
import {
  buildMatrixPendingByCell,
  cellCommitMonthKey,
  matrixMonthPendingTotal,
  matrixWeekPendingAmounts,
} from "@/components/admin/branch/ledger/RevMatrix"
import { mergeWeekCellCommit, pendingFromDraftInput, type MatrixPendingDraft } from "@/components/admin/branch/ledger/rev-matrix-logic"
import { sheetBlockPending } from "@/components/admin/branch/ledger/ledger-sheet-logic"
import { ledgerCellKey } from "@/components/admin/branch/ledger/useLedgerDraftQueue"
import type { LedgerDraft, LedgerRevenueRow } from "@/components/admin/branch/ledger/shared"

const MONTH = "2026-12"

function sheetRow(partial: Partial<LedgerRevenueRow> = {}): LedgerRevenueRow {
  return {
    id: "deal-1",
    customer: "예시학원",
    manager: "예시A",
    team: "BD",
    region: "서울",
    revenue: 0,
    ledgerOrigin: "sheet",
    ...partial,
  } as LedgerRevenueRow
}

/** 워크벤치 buildCellDraftInput 이 보내는 입력 모양(병합 결과 그대로). */
function weekInput(merged: ReturnType<typeof mergeWeekCellCommit>, kind: "edit-row" | "new-row" = "edit-row") {
  return {
    kind,
    amount: merged.amount,
    metadata: {
      week: `w${merged.week + 1}`,
      weekly: merged.weekly,
      weeklyConfidence: merged.weeklyConfidence,
      confidence: "expected",
    },
  }
}

function inFlight(cell: Omit<InFlightCell, "kind"> & { kind?: InFlightCell["kind"] }): ReadonlyMap<string, InFlightCell> {
  const full: InFlightCell = { kind: "edit-row", ...cell }
  return new Map([[cellCommitMonthKey(full.rowId, full.month, full.kind), full]])
}

describe("overlayInFlightPending — 응답 전 칸 표시(F-19 · F-05)", () => {
  it("진행 중 저장이 없으면 같은 지도(참조 그대로)", () => {
    const map = new Map<string, MatrixPendingDraft>()
    expect(overlayInFlightPending(map, new Map())).toBe(map)
  })

  it("빈 달 W3 저장이 응답 전이면 그 칸 · 그 달 계가 친 금액을 대기 금액으로 보인다", () => {
    const row = sheetRow()
    const merged = mergeWeekCellCommit({ pendingDraft: null, sheetRow: row, month: MONTH, week: 2, amount: 300_000 })
    const pending = pendingFromDraftInput(weekInput(merged), "in-flight")
    const display = overlayInFlightPending(new Map(), inFlight({ rowId: row.id, month: MONTH, week: 2, pending }))
    const weeks = matrixWeekPendingAmounts(row, MONTH, [0, 0, 0, 0, 0], display)
    expect(weeks.map((cell) => cell?.amount ?? null)).toEqual([null, null, 300_000, null, null])
    expect(matrixMonthPendingTotal(row, MONTH, 0, display)).toBe(300_000)
    // 시트 보기(건별 시트)도 같은 지도로 달 계 · 주차 칸 대기 금액을 정한다.
    const block = {
      month: MONTH,
      bucket: { total: 0, confirmed: 0, high: 0, open: 0 },
      weeks: Array.from({ length: 5 }, () => ({ display: 0, refund: 0, absent: false })),
    }
    const sheet = sheetBlockPending(row, block as Parameters<typeof sheetBlockPending>[1], display)
    expect(sheet?.total).toBe(300_000)
    expect(sheet?.weeks).toEqual([null, null, 300_000, null, null])
  })

  it("예전 한 주차 초안이 남아 있어도 진행 중 병합 저장이 그 주차 칸을 덮는다 — 다른 값을 보이지 않는다", () => {
    const row = sheetRow()
    const server: LedgerDraft = {
      id: "d-old",
      kind: "edit-row",
      status: "checked",
      sourceDealId: row.id,
      customer: row.customer,
      manager: "예시A",
      team: "BD",
      month: MONTH,
      amount: 100_000,
      note: "",
      metadata: { week: "w3", confidence: "expected" },
      createdAt: "2026-11-25T00:00:00Z",
      updatedAt: "2026-11-25T00:00:00Z",
    } as LedgerDraft
    const base = buildMatrixPendingByCell([server], [row])
    const merged = mergeWeekCellCommit({ pendingDraft: base.get(`${row.id}::${MONTH}`), sheetRow: row, month: MONTH, week: 3, amount: 50_000 })
    expect(merged.weekly).toEqual([0, 0, 100_000, 50_000, 0])
    const display = overlayInFlightPending(base, inFlight({ rowId: row.id, month: MONTH, week: 3, pending: pendingFromDraftInput(weekInput(merged), "d-old") }))
    expect(display).not.toBe(base)
    // 서버 지도는 그대로(저장 대상 판정은 서버 목록).
    expect(base.get(`${row.id}::${MONTH}::w3`)?.amount).toBe(100_000)
    const weeks = matrixWeekPendingAmounts(row, MONTH, [0, 0, 0, 0, 0], display)
    expect(weeks.map((cell) => cell?.amount ?? null)).toEqual([null, null, 100_000, 50_000, null])
    expect(matrixMonthPendingTotal(row, MONTH, 0, display)).toBe(150_000)
  })

  it("월 칸 저장(weekly 없음)이 진행 중이면 같은 달 예전 주차 키를 지운다 — 그 달은 월 금액으로 바뀐다", () => {
    const row = sheetRow()
    const base = new Map<string, MatrixPendingDraft>([
      [`${row.id}::${MONTH}`, { id: "d-1", kind: "edit-row", amount: 100_000, confidence: "expected", weekly: null, weeklyConfidence: null, week: 2 }],
      [`${row.id}::${MONTH}::w3`, { id: "d-1", kind: "edit-row", amount: 100_000, confidence: "expected", weekly: null, weeklyConfidence: null, week: 2 }],
    ])
    const pending = pendingFromDraftInput({ kind: "edit-row", amount: 400_000, metadata: { week: "month", weekly: null, confidence: "confirmed" } }, "d-1")
    const display = overlayInFlightPending(base, inFlight({ rowId: row.id, month: MONTH, week: null, pending }))
    expect(display.has(`${row.id}::${MONTH}::w3`)).toBe(false)
    expect(display.get(`${row.id}::${MONTH}`)?.amount).toBe(400_000)
  })
})

describe("parseLedgerCellKey — 훅 칸 키(ledgerCellKey)와 같은 모양", () => {
  it("수정 · 신규 · 월 칸 키를 왕복한다(고객 이름의 | 도 지킨다)", () => {
    const edit = ledgerCellKey({ kind: "edit-row", sourceDealId: "deal-1", month: MONTH, week: 3 })!
    expect(parseLedgerCellKey(edit)).toEqual({ kind: "edit-row", deal: "deal-1", customer: null, month: MONTH, week: 3 })
    const fresh = ledgerCellKey({ kind: "new-row", customer: "가|나 학원", month: MONTH, week: "w1" })!
    expect(parseLedgerCellKey(fresh)).toEqual({ kind: "new-row", deal: null, customer: "가|나 학원", month: MONTH, week: 0 })
    const month = ledgerCellKey({ kind: "edit-row", sourceDealId: "deal-1", month: MONTH })!
    expect(parseLedgerCellKey(month)?.week).toBeNull()
  })

  it("모양이 틀리면 null", () => {
    expect(parseLedgerCellKey("edit-row|deal:x|2026-12")).toBeNull()
    expect(parseLedgerCellKey("other|deal:x|2026-12|w1")).toBeNull()
    expect(parseLedgerCellKey("edit-row|deal:|2026-12|w1")).toBeNull()
    expect(parseLedgerCellKey("edit-row|deal:x|2026-12|w9")).toBeNull()
  })
})

describe("savingCellsByRow — '저장 중' 칸(F-05)", () => {
  const sheet = sheetRow()
  const ledgerNew = sheetRow({ id: "ledger-e1", customer: " 새학원 ", ledgerOrigin: "draft", sourceDealId: undefined })
  const correction = sheetRow({ id: "ledger-e2", ledgerOrigin: "draft", sourceDealId: "deal-9", customer: "정정학원" })

  it("아무것도 없으면 늘 같은 빈 지도", () => {
    const first = savingCellsByRow([sheet], new Set(), new Map())
    expect(first.size).toBe(0)
    expect(savingCellsByRow([sheet], new Set(), new Map())).toBe(first)
  })

  it("훅 칸 키는 칸 커밋과 같은 판정으로 행을 찾는다 — 수정은 원천 딜, 신규는 고객 이름", () => {
    const keys = new Set([
      ledgerCellKey({ kind: "edit-row", sourceDealId: "deal-1", month: MONTH, week: 2 })!,
      ledgerCellKey({ kind: "new-row", customer: "새학원", month: MONTH, week: 0 })!,
      ledgerCellKey({ kind: "edit-row", sourceDealId: "deal-9", month: MONTH, week: 4 })!,
      // 신규 키는 같은 이름의 시트 행(수정 대상)에는 걸리지 않는다.
      ledgerCellKey({ kind: "new-row", customer: "예시학원", month: MONTH, week: 1 })!,
    ])
    const out = savingCellsByRow([sheet, ledgerNew, correction], keys, new Map())
    expect([...(out.get(sheet.id) ?? [])]).toEqual([cellSavingKey(MONTH, 2)])
    expect([...(out.get(ledgerNew.id) ?? [])]).toEqual([cellSavingKey(MONTH, 0)])
    expect([...(out.get(correction.id) ?? [])]).toEqual([cellSavingKey(MONTH, 4)])
  })

  it("진행 중 저장은 그 행의 고친 칸을 저장 중으로 둔다(앞 저장을 기다리는 동안에도)", () => {
    const pending = pendingFromDraftInput({ kind: "edit-row", amount: 1, metadata: { week: "w4" } })
    const out = savingCellsByRow([sheet], new Set(), inFlight({ rowId: sheet.id, month: MONTH, week: 3, pending }))
    expect(out.get(sheet.id)?.has(cellSavingKey(MONTH, 3))).toBe(true)
    expect(out.get(sheet.id)?.has(cellSavingKey(MONTH, 2))).toBe(false)
  })
})

describe("chainCellCommit — 응답 전 다시 친 주차는 앞 저장의 초안을 PATCH 한다(F-05)", () => {
  type Input = { amount: number; weekly: number[] }
  type Result = { draft: { id: string } | null }

  function fakeQueue() {
    const calls: string[] = []
    const stored = new Map<string, Input>()
    let nextId = 1
    let releaseCreate: (() => void) | null = null
    const createDraft = (input: Input): Promise<Result> => {
      calls.push(`POST ${input.amount}`)
      return new Promise((resolve) => {
        releaseCreate = () => {
          const id = `d-${nextId++}`
          stored.set(id, input)
          resolve({ draft: { id } })
        }
      })
    }
    const updateDraft = async (id: string, input: Input): Promise<Result> => {
      calls.push(`PATCH ${id} ${input.amount}`)
      stored.set(id, input)
      return { draft: { id } }
    }
    return { calls, stored, createDraft, updateDraft, release: () => releaseCreate?.() }
  }

  it("W3 POST 가 응답 전인데 W4 를 치면 POST 는 한 번, W4 는 그 초안의 PATCH — 두 주차가 한 초안에 남는다", async () => {
    const queue = fakeQueue()
    const row = sheetRow()
    const flight = new Map<string, { pending: MatrixPendingDraft; promise: Promise<{ id: string } | null> }>()
    const key = cellCommitMonthKey(row.id, MONTH, "edit-row")

    // W3 = 300,000 — 서버 대기 초안 없음.
    const w3 = mergeWeekCellCommit({ pendingDraft: flight.get(key)?.pending ?? null, sheetRow: row, month: MONTH, week: 2, amount: 300_000 })
    const first = chainCellCommit({ existingId: null, prior: flight.get(key) ?? null, input: { amount: w3.amount, weekly: w3.weekly }, ...queue })
    flight.set(key, { pending: pendingFromDraftInput(weekInput(w3)), promise: first.persist.then((r) => r.draft) })
    expect(first.chained).toBe(false)

    // 응답 전 W4 = 200,000 — 기준은 진행 중 W3 저장의 입력.
    const w4 = mergeWeekCellCommit({ pendingDraft: flight.get(key)?.pending ?? null, sheetRow: row, month: MONTH, week: 3, amount: 200_000 })
    expect(w4.weekly).toEqual([0, 0, 300_000, 200_000, 0])
    const second = chainCellCommit({ existingId: null, prior: flight.get(key) ?? null, input: { amount: w4.amount, weekly: w4.weekly }, ...queue })
    expect(second.chained).toBe(true)

    queue.release()
    await second.persist
    expect(queue.calls).toEqual(["POST 300000", "PATCH d-1 500000"])
    expect([...queue.stored.keys()]).toEqual(["d-1"])
    expect(queue.stored.get("d-1")?.weekly).toEqual([0, 0, 300_000, 200_000, 0])
  })

  it("서버 대기 초안이 있으면 그 초안을 PATCH(잇지 않는다), 앞 저장이 초안을 못 남겼으면 새로 만든다", async () => {
    const calls: string[] = []
    const api = {
      createDraft: async (input: string) => {
        calls.push(`POST ${input}`)
        return { draft: { id: "new" } }
      },
      updateDraft: async (id: string, input: string) => {
        calls.push(`PATCH ${id} ${input}`)
        return { draft: { id } }
      },
    }
    const existing = chainCellCommit({ existingId: "d-9", prior: { promise: Promise.resolve({ id: "d-1" }) }, input: "a", ...api })
    expect(existing.chained).toBe(false)
    await existing.persist
    const failedPrior = chainCellCommit({ existingId: null, prior: { promise: Promise.resolve(null) }, input: "b", ...api })
    expect(failedPrior.chained).toBe(true)
    await failedPrior.persist
    expect(calls).toEqual(["PATCH d-9 a", "POST b"])
  })
})
