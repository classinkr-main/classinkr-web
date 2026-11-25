// REV 시트 ↔ 장부 대조(lib/branch/reconcile/rev-ledger-reconcile.ts) — 설계 T1~T18. 기대값은 손으로 적었다.
// 픽스처는 가명(예시학원N · 예시A~D)이고, 별칭 동작은 member-names.ts 에 이미 있는 키('New 2' → Minjae)로만 본다.
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { afterAll, describe, expect, it, vi } from "vitest"

vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: vi.fn() }))

import {
  reconcileManagerKey,
  reconcileRevLedger,
  type ManagerMonthCell,
  type ReconcileMeasure,
  type ReconcileOptions,
  type ReconcileReport,
} from "@/lib/branch/reconcile/rev-ledger-reconcile"
import type { ReconcileLedgerInput, ReconcileSheetInput } from "@/lib/branch/reconcile/rev-ledger-inputs"
import { colToA1 } from "@/lib/branch/sheet-writeback/layout"
import {
  AS_OF,
  BASE_ROWS,
  NOW,
  SYNC_AT,
  draft,
  entry,
  importDeals,
  ledgerInput,
  mirrorDeals,
  monthCol,
  revGrid,
  rowIdOf,
  sheetInput,
  weekCol,
  type FixtureRow,
} from "./fixtures/rev-reconcile-fixtures"

const reports: ReconcileReport[] = []

function run(sheet: ReconcileSheetInput, ledger: ReconcileLedgerInput, opts: Partial<ReconcileOptions> = {}): ReconcileReport {
  const report = reconcileRevLedger(sheet, ledger, { fiscalYear: 2026, asOf: AS_OF, now: NOW, ...opts })
  reports.push(report)
  return report
}

function cell(report: ReconcileReport, manager: string, month: string, measure: ReconcileMeasure): ManagerMonthCell | undefined {
  return report.totals.find((item) => item.managerKey === reconcileManagerKey(manager) && item.month === month && item.measure === measure)
}

function diffCells(report: ReconcileReport): ManagerMonthCell[] {
  return report.totals.filter((item) => [item.delta, item.deltaEntries, item.deltaSync, item.deltaTime].some((value) => Math.abs(value) >= 0.5))
}

function baseCase(rows: FixtureRow[] = BASE_ROWS, today = AS_OF) {
  const grid = revGrid(rows)
  const deals = mirrorDeals(grid, { today, syncedAt: SYNC_AT })
  return { grid, deals, sheet: sheetInput(grid) }
}

describe("T1 같음 — 시트 = 장부 DB, 장부 항목 없음", () => {
  it("모든 칸 차이 0, 건별 차이 없음, same · 종료 코드 0", () => {
    const { sheet, deals } = baseCase()
    const report = run(sheet, ledgerInput(deals))
    expect(report.status).toBe("same")
    expect(report.exitCode).toBe(0)
    expect(report.rowDiffs).toEqual([])
    expect(diffCells(report)).toEqual([])
    // 손으로 적은 값: 예시A 11월 = 예시학원1 500(빨강 300 확정 · 검정 200 예정)
    expect(cell(report, "예시A", "2026-11", "total")).toMatchObject({ sheet: 500, ledger: 500 })
    expect(cell(report, "예시A", "2026-11", "confirmed")).toMatchObject({ sheet: 300, ledger: 300 })
    // 12월 = 예시학원1 220(빨강 w1 은 12/1 시작이라 11/30 에는 예정 · 파랑 50 · 검정 70) + 예시학원3 400(색 없음, 이번 달 이후 → 예정)
    expect(cell(report, "예시A", "2026-12", "total")).toMatchObject({ sheet: 620, ledger: 620 })
    expect(cell(report, "예시A", "2026-12", "highConfidence")).toMatchObject({ sheet: 50, ledger: 50 })
    expect(cell(report, "예시A", "2026-12", "expected")).toMatchObject({ sheet: 570, ledger: 570 })
    expect(cell(report, "예시A", "2026-12", "confirmed")).toBeUndefined()
    // 예시B 10월(색 없음, 지난달) 확정 400 · 11월 예정 500
    expect(cell(report, "예시B", "2026-10", "confirmed")).toMatchObject({ sheet: 400, ledger: 400 })
    expect(cell(report, "예시B", "2026-11", "expected")).toMatchObject({ sheet: 500, ledger: 500 })
    expect(report.sheetChecks.unexplainedColumns).toBe(0)
    expect(report.sheetChecks.headerProblem).toBeNull()
    expect(report.sheetChecks.sumColumn?.delta).toBe(0)
    expect(report.checks.serverParity.ok).toBe(true)
    expect(report.meta.dataDate).toBe("2026-11-30")
  })
})

describe("T2 장부 새 행", () => {
  it("12월 확정 ¥1,000 → 확정·합계 칸 차이 = 장부 입력 +1000, ledger_new, 같은 고객 12월 금액이 있어 이중 입력 의심", () => {
    const { sheet, deals } = baseCase()
    const report = run(sheet, ledgerInput(deals, {
      entries: [entry({ id: "e2", customer: "예시학원1", manager: "예시A", month: "2026-12", amount: 1000, confidence: "confirmed" })],
    }))
    expect(cell(report, "예시A", "2026-12", "confirmed")).toMatchObject({ sheet: 0, ledger: 1000, delta: 1000, deltaEntries: 1000, deltaSync: 0, deltaTime: 0 })
    expect(cell(report, "예시A", "2026-12", "total")).toMatchObject({ sheet: 620, ledger: 1620, delta: 1000, deltaEntries: 1000 })
    expect(report.rowDiffs).toHaveLength(1)
    expect(report.rowDiffs[0]).toMatchObject({ cause: "ledger_new", customer: "예시학원1", month: "2026-12", sheet: null, refs: { entryId: "e2", draftId: "d-e2" } })
    expect(report.rowDiffs[0].ledger).toEqual({ total: 1000, confirmed: 1000, highConfidence: 0, expected: 0 })
    expect(report.checks.doubleEntrySuspects).toEqual([
      expect.objectContaining({ customer: "예시학원1", month: "2026-12", amount: 1000, sheetRows: [3], sheetAmount: 220, exactMatch: false }),
    ])
    expect(report.status).toBe("explained")
    expect(report.exitCode).toBe(0)
  })

  it("시트 금액과 같은 금액이면 exactMatch", () => {
    const { sheet, deals } = baseCase()
    const report = run(sheet, ledgerInput(deals, {
      entries: [entry({ id: "e2b", customer: "예시학원3", manager: "예시A", month: "2026-12", amount: 400 })],
    }))
    expect(report.checks.doubleEntrySuspects[0]).toMatchObject({ customer: "예시학원3", exactMatch: true, sheetAmount: 400 })
  })
})

describe("T3 장부 정정 — 행이 옮겨져도 Row ID 로 원본을 찾는다", () => {
  it("11월 ¥500 → ¥600(예정) → 예정·합계 장부 입력 +100, ledger_edit", () => {
    // 시트가 정렬돼 예시학원2 가 4행 → 5행으로 옮겨졌다. 정정은 옛 행 번호·옛 id 를 들고 있다.
    const reordered = [BASE_ROWS[0], BASE_ROWS[2], BASE_ROWS[1]]
    const { sheet, deals } = baseCase(reordered)
    const report = run(sheet, ledgerInput(deals, {
      entries: [entry({
        id: "e3",
        type: "manual-edit",
        customer: "예시학원2",
        manager: "예시B",
        month: "2026-11",
        amount: 600,
        confidence: "expected",
        sourceSheetRow: 4,
        sourceDealId: "gone-id",
        rowId: rowIdOf(2),
      })],
    }))
    expect(cell(report, "예시B", "2026-11", "expected")).toMatchObject({ sheet: 500, ledger: 600, delta: 100, deltaEntries: 100, deltaSync: 0 })
    expect(cell(report, "예시B", "2026-11", "total")).toMatchObject({ delta: 100, deltaEntries: 100 })
    expect(report.rowDiffs).toHaveLength(1)
    expect(report.rowDiffs[0]).toMatchObject({ cause: "ledger_edit", sheetRow: 5, month: "2026-11", rowId: rowIdOf(2) })
    expect(report.rowDiffs[0].sheet).toEqual({ total: 500, confirmed: 0, highConfidence: 0, expected: 500 })
    expect(report.rowDiffs[0].ledger).toEqual({ total: 600, confirmed: 0, highConfidence: 0, expected: 600 })
    expect(report.rowDiffs[0].detail).toContain("Row ID 로")
    expect(report.checks.unresolvedCorrections).toEqual([])
  })
})

describe("T4 정정 대상 못 찾음", () => {
  it("고객명이 바뀌고 Row ID 가 없으면 ledger_edit_unresolved — 원본과 정정이 둘 다 더해진다", () => {
    const { sheet, deals } = baseCase()
    const report = run(sheet, ledgerInput(deals, {
      entries: [entry({ id: "e4", type: "manual-edit", customer: "예시학원옛이름", manager: "예시B", month: "2026-11", amount: 600, confidence: "expected", sourceSheetRow: 99 })],
    }))
    expect(cell(report, "예시B", "2026-11", "total")).toMatchObject({ sheet: 500, ledger: 1100, delta: 600, deltaEntries: 600 })
    expect(report.rowDiffs.map((diff) => diff.cause)).toEqual(["ledger_edit_unresolved"])
    expect(report.checks.unresolvedCorrections).toEqual([expect.objectContaining({ customer: "예시학원옛이름", month: "2026-11", amount: 600, entryId: "e4" })])
  })
})

describe("T5 상쇄·안전망", () => {
  it("상쇄 항목은 빠지고 그 초안은 되살아나지 않는다 · 항목 없는 적용 초안은 더해지고 fallbackDraftIds 에 든다", () => {
    const { sheet, deals } = baseCase()
    const report = run(sheet, ledgerInput(deals, {
      entries: [entry({ id: "e5", draftId: "d1", status: "reversed", customer: "예시학원1", manager: "예시A", month: "2026-12", amount: 300 })],
      appliedDrafts: [
        draft({ id: "d1", customer: "예시학원1", manager: "예시A", month: "2026-12", amount: 300 }),
        draft({ id: "d2", customer: "예시학원새", manager: "예시B", month: "2026-11", amount: 250, confidence: "confirmed" }),
      ],
    }))
    expect(cell(report, "예시A", "2026-12", "total")).toMatchObject({ delta: 0 })
    expect(cell(report, "예시B", "2026-11", "confirmed")).toMatchObject({ sheet: 0, ledger: 250, deltaEntries: 250 })
    expect(report.checks.fallbackDraftIds).toEqual(["d2"])
    expect(report.rowDiffs).toEqual([expect.objectContaining({ cause: "ledger_new", customer: "예시학원새", refs: { draftId: "d2", appliedAt: "2026-11-28T03:00:00Z" } })])
    expect(report.rowDiffs[0].detail).toContain("항목 없는 적용 초안")
    expect(report.meta.ledger).toMatchObject({ activeEntries: 0, reversedEntries: 1, fallbackDrafts: 1 })
  })
})

describe("T6 시트 쓰기로 흡수된 초안", () => {
  const rows: FixtureRow[] = [BASE_ROWS[0], BASE_ROWS[1], { ...BASE_ROWS[2], months: { "2026-12": { weeks: [450] } } }]
  const grid = revGrid(rows)
  // 시트 쓰기 11-29 10:00Z → 동기화 시작 21:00Z → 미러 21:05Z: 시트 행이 이미 +50 을 담았다.
  const deals = mirrorDeals(grid, { today: "2026-11-30", syncedAt: "2026-11-29T21:05:00Z" })
  const writtenEntry = entry({ id: "e6", draftId: "d6", customer: "예시학원3", manager: "예시A", month: "2026-12", amount: 50 })
  const sheetWrites = { d6: { status: "written", writtenAt: "2026-11-29T10:00:00Z" } }

  it("흡수된 초안은 오버레이에서 빠진다 — 이중 계상 없음", () => {
    const report = run(sheetInput(grid), ledgerInput(deals, { entries: [writtenEntry], sheetWrites, lastRevSyncStartedAt: "2026-11-29T21:00:00Z" }))
    expect(report.checks.absorbedDraftIds).toEqual(["d6"])
    expect(diffCells(report)).toEqual([])
    expect(report.status).toBe("same")
  })

  it("동기화 기록이 없으면 흡수로 보지 않는다 — 그때는 +50 이 장부 입력으로 보인다", () => {
    const report = run(sheetInput(grid), ledgerInput(deals, { entries: [writtenEntry], sheetWrites, lastRevSyncStartedAt: null }))
    expect(report.checks.absorbedDraftIds).toEqual([])
    expect(cell(report, "예시A", "2026-12", "total")).toMatchObject({ delta: 50, deltaEntries: 50 })
  })
})

describe("T7 동기화 뒤 시트 변경", () => {
  it("12월 ¥400 → ¥450 → 동기화 뒤 시트 변경 −50, sheet_changed, 막음 · 종료 코드 1", () => {
    const dbGrid = revGrid(BASE_ROWS)
    const liveGrid = revGrid([BASE_ROWS[0], BASE_ROWS[1], { ...BASE_ROWS[2], months: { "2026-12": { weeks: [450] } } }])
    const report = run(sheetInput(liveGrid), ledgerInput(mirrorDeals(dbGrid, { today: AS_OF, syncedAt: SYNC_AT })))
    expect(cell(report, "예시A", "2026-12", "total")).toMatchObject({ sheet: 670, ledger: 620, delta: -50, deltaEntries: 0, deltaSync: -50, deltaTime: 0 })
    expect(report.rowDiffs).toEqual([
      expect.objectContaining({
        cause: "sheet_changed",
        customer: "예시학원3",
        month: "2026-12",
        sheet: { total: 450, confirmed: 0, highConfidence: 0, expected: 450 },
        ledger: { total: 400, confirmed: 0, highConfidence: 0, expected: 400 },
      }),
    ])
    expect(report.status).toBe("blocked")
    expect(report.exitCode).toBe(1)
    expect(report.meta.blockReasons[0]).toContain("동기화 뒤 시트 변경")
    expect(report.meta.deltaSyncTotal).toBe(-50)
  })
})

describe("T8 담당자 바뀜", () => {
  it("예시C → 예시D — 동기화 뒤 시트 변경이 두 담당 사이를 옮기고 합은 0", () => {
    const rowsDb: FixtureRow[] = [{ customer: "예시학원8", manager: "예시C", rowId: rowIdOf(8), months: { "2026-12": { weeks: [400] } } }]
    const rowsLive: FixtureRow[] = [{ ...rowsDb[0], manager: "예시D" }]
    const report = run(sheetInput(revGrid(rowsLive)), ledgerInput(mirrorDeals(revGrid(rowsDb), { today: AS_OF, syncedAt: SYNC_AT })))
    expect(cell(report, "예시C", "2026-12", "total")).toMatchObject({ sheet: 0, ledger: 400, deltaSync: 400 })
    expect(cell(report, "예시D", "2026-12", "total")).toMatchObject({ sheet: 400, ledger: 0, deltaSync: -400 })
    const totalSync = report.totals.filter((item) => item.measure === "total").reduce((sum, item) => sum + item.deltaSync, 0)
    expect(totalSync).toBe(0)
    expect(report.rowDiffs.map((diff) => diff.cause)).toContain("manager_changed")
    const changed = report.rowDiffs.find((diff) => diff.cause === "manager_changed")!
    expect(changed.detail).toBe("담당 예시C(장부 DB) → 예시D(시트)")
    expect(changed.managerKeys.sort()).toEqual(["예시c", "예시d"])
  })
})

describe("T9 시간 경과 — 빨간 예정 칸은 읽는 날에 확정이 된다(F-08)", () => {
  const rows: FixtureRow[] = [
    { customer: "예시학원9", manager: "예시C", rowId: rowIdOf(9), months: { "2026-12": { weeks: [{ amount: 100, color: "red" }, null, { amount: 200, color: "red" }] } } },
  ]
  const grid = revGrid(rows)
  const deals = mirrorDeals(grid, { today: "2026-11-30", syncedAt: SYNC_AT })

  it("11/30 데이터를 12/15 에 읽으면 w1·w3 모두 확정 — 시간 경과 0(다시 파싱할 필요 없음)", () => {
    const report = run(sheetInput(grid), ledgerInput(deals), { asOf: "2026-12-15" })
    expect(cell(report, "예시C", "2026-12", "confirmed")).toMatchObject({ sheet: 300, ledger: 300, deltaTime: 0, deltaSync: 0 })
    expect(cell(report, "예시C", "2026-12", "expected")).toBeUndefined()
    expect(report.status).toBe("same")
  })

  it("12/1 에 읽으면 w1 만 확정, w3 ¥200 은 12/15 에 저절로 확정(autoPromote)", () => {
    const report = run(sheetInput(grid), ledgerInput(deals), { asOf: "2026-12-01" })
    expect(cell(report, "예시C", "2026-12", "confirmed")).toMatchObject({ sheet: 100, ledger: 100, deltaTime: 0 })
    expect(cell(report, "예시C", "2026-12", "expected")).toMatchObject({ sheet: 200, ledger: 200, deltaTime: 0 })
    expect(report.checks.autoPromote.cells).toEqual([
      expect.objectContaining({ customer: "예시학원9", month: "2026-12", amount: 200, when: "2026-12-15", reason: "red_week" }),
    ])
    expect(report.checks.stuckAfterLock.rows).toEqual([])
  })

  it("데이터 날짜보다 이른 날로 읽으면(파싱 때 굳은 확정) 시간 경과로 드러난다 — pending_rollover", () => {
    const late = mirrorDeals(grid, { today: "2026-12-20", syncedAt: "2026-12-20T03:00:00Z" })
    const report = run(sheetInput(grid), ledgerInput(late), { asOf: "2026-12-10" })
    expect(report.meta.dataDate).toBe("2026-12-20")
    expect(cell(report, "예시C", "2026-12", "confirmed")).toMatchObject({ sheet: 100, ledger: 300, deltaTime: 200, deltaSync: 0, deltaEntries: 0 })
    expect(cell(report, "예시C", "2026-12", "expected")).toMatchObject({ sheet: 200, ledger: 0, deltaTime: -200 })
    expect(cell(report, "예시C", "2026-12", "total")).toMatchObject({ delta: 0, deltaTime: 0 })
    const rollover = report.rowDiffs.find((diff) => diff.cause === "pending_rollover")!
    expect(rollover.detail).toContain("w3(12-15 시작)")
    // 시간 경과만으로는 잠금을 막지 않는다
    expect(report.status).toBe("explained")
  })
})

describe("T10 임포트 모드 — 색 없는 행의 이번 달 이후도 읽는 날로 판정(F-09)", () => {
  const rows: FixtureRow[] = [{ customer: "예시학원10", manager: "예시D", rowId: rowIdOf(10), months: { "2026-12": { weeks: [200] } } }]
  const grid = revGrid(rows)
  const imported = importDeals(grid, { today: "2026-11-30", createdAt: SYNC_AT })
  const importLedger = ledgerInput(imported, { source: { kind: "import", runId: "run-1", startedAt: "2026-11-30T12:39:00Z" } })

  it("11월 캡처를 12/15 에 읽으면 12월은 아직 예정(이번 달) — 동기화 뒤 시트 변경 0 · 시간 경과 0", () => {
    const report = run(sheetInput(grid), importLedger, { asOf: "2026-12-15" })
    expect(cell(report, "예시D", "2026-12", "expected")).toMatchObject({ sheet: 200, ledger: 200, deltaSync: 0, deltaTime: 0 })
    expect(report.checks.autoPromote.cells).toEqual([expect.objectContaining({ month: "2026-12", amount: 200, when: "2027-01-01", reason: "no_color_month" })])
    expect(report.meta.db.kind).toBe("import")
  })

  it("1/5 에 읽으면 임포트도 확정 200(캡처 달에 굳지 않는다) — 미러와 같다", () => {
    const fromImport = run(sheetInput(grid), importLedger, { asOf: "2027-01-05" })
    const fromMirror = run(sheetInput(grid), ledgerInput(mirrorDeals(grid, { today: "2026-11-30", syncedAt: SYNC_AT })), { asOf: "2027-01-05" })
    for (const report of [fromImport, fromMirror]) {
      expect(cell(report, "예시D", "2026-12", "confirmed")).toMatchObject({ sheet: 200, ledger: 200, deltaSync: 0, deltaTime: 0 })
      expect(report.status).toBe("same")
    }
  })
})

describe("T11 환불(음수) 달", () => {
  it("−¥30 이 양쪽에 있고 차이 0, 담당 요약 음수 월 −30", () => {
    const rows: FixtureRow[] = [
      ...BASE_ROWS,
      { customer: "예시학원11", manager: "예시A", rowId: rowIdOf(11), months: { "2026-10": { total: -30 } } },
    ]
    const { sheet, deals } = baseCase(rows)
    const report = run(sheet, ledgerInput(deals))
    expect(cell(report, "예시A", "2026-10", "total")).toMatchObject({ sheet: -30, ledger: -30, delta: 0 })
    expect(report.managerSummary.find((summary) => summary.managerKey === reconcileManagerKey("예시A"))?.negativeMonths).toBe(-30)
    expect(report.status).toBe("same")
  })
})

describe("T12 시트 자체 점검(0절)", () => {
  const rows: FixtureRow[] = [
    BASE_ROWS[0],
    // 6행: 고객명 빈 행 11월 ¥70 — 시트 SUM 은 더하고 앱은 읽지 않는다
    { customer: null, manager: "예시A", months: { "2026-11": { weeks: [70] } } },
    // 5행: 글자로 적은 '(1,234)' — 앱은 −1234 로 읽고 시트 SUM 은 더하지 않는다
    { customer: "예시학원12", manager: "예시B", rowId: rowIdOf(12), months: { "2026-11": { totalText: "(1,234)" } } },
    // 6행: 주 칸에 '약 300' — 아무도 못 읽는다
    { customer: "예시학원13", manager: "예시B", rowId: rowIdOf(13), months: { "2026-11": { weeks: [{ text: "약 300" }] } } },
    // 7행: 월 칸 3000 ≠ 주 합 2700
    { customer: "예시학원14", manager: "예시A", rowId: rowIdOf(14), months: { "2026-12": { total: 3000, weeks: [{ amount: 2700, color: "red" }] } } },
  ]

  it("고객명 빈 행 · 글자 금액 · 못 읽은 칸 · 월≠주 합을 찾고, 못 읽은 칸 때문에 막는다", () => {
    const { sheet, deals } = baseCase(rows)
    const report = run(sheet, ledgerInput(deals))
    const nov = report.sheetChecks.columns.find((column) => column.month === "2026-11" && column.kind === "month")!
    // 시트 SUM = 예시학원1 500 + 빈 행 70 + 예시학원13 0 = 570 · 앱 = 500 − 1234 + 0 = −734
    expect(nov).toMatchObject({ sheetSum: 570, appSum: -734, delta: 1304, orphanSum: 70, textSum: -1234, weekFallbackSum: 0, residual: 0, unparsed: 0 })
    expect(report.sheetChecks.orphanRows).toEqual([{ sheetRow: 4, amount: 70, months: ["2026-11"] }])
    expect(report.sheetChecks.textAmountCells).toEqual([{ a1: `${colToA1(monthCol("2026-11"))}5`, sheetRow: 5, amount: -1234, text: "(1,234)" }])
    expect(report.sheetChecks.unparsedCells).toEqual([{ a1: `${colToA1(weekCol("2026-11", 1))}6`, sheetRow: 6, text: "약 300", customer: "예시학원13" }])
    expect(report.sheetChecks.monthWeekMismatch).toEqual([
      expect.objectContaining({ sheetRow: 7, customer: "예시학원14", month: "2026-12", monthValue: 3000, weekSum: 2700 }),
    ])
    expect(report.sheetChecks.unexplainedColumns).toBe(0)
    expect(report.status).toBe("blocked")
    expect(report.meta.blockReasons).toEqual(["시트 자체 점검: 숫자로 못 읽은 칸 1개"])
    // 장부 칸에는 차이가 없다(DB 도 같은 시트를 읽었다)
    expect(diffCells(report)).toEqual([])
  })

  it("설명되는 것만 있으면 막지 않는다(explained · 0)", () => {
    const { sheet, deals } = baseCase(rows.filter((row) => row.customer !== "예시학원13"))
    const report = run(sheet, ledgerInput(deals))
    expect(report.status).toBe("explained")
    expect(report.exitCode).toBe(0)
  })

  it("1행 SUM 이 설명 안 되게 다르면 막는다", () => {
    // 11월 = 예시학원1 500 + 예시학원2 500 = 1000 인데 1행이 1010
    const grid = revGrid(BASE_ROWS, { sumOverrides: { [monthCol("2026-11")]: 1010 } })
    const report = run(sheetInput(grid), ledgerInput(mirrorDeals(grid, { today: AS_OF, syncedAt: SYNC_AT })))
    const nov = report.sheetChecks.columns.find((column) => column.month === "2026-11" && column.kind === "month")!
    expect(nov).toMatchObject({ sheetSum: 1010, appSum: 1000, residual: 10 })
    expect(report.sheetChecks.unexplainedColumns).toBe(1)
    expect(report.status).toBe("blocked")
    // Sum 열(M1)은 그대로라 월 열 1행 합보다 10 작다
    expect(report.sheetChecks.sumColumn?.delta).toBe(-10)
  })
})

describe("T13 담당자 이름", () => {
  it("별칭 · 대소문자 · 모르는 이름 · 공백 · 빈 담당", () => {
    const rows: FixtureRow[] = [
      { customer: "예시학원21", manager: "New 2", rowId: rowIdOf(21), months: { "2026-11": { weeks: [10] } } },
      { customer: "예시학원22", manager: "ExampleA", rowId: rowIdOf(22), months: { "2026-11": { weeks: [10] } } },
      { customer: "예시학원23", manager: "examplea", rowId: rowIdOf(23), months: { "2026-11": { weeks: [10] } } },
      { customer: "예시학원24", manager: "예시Z", rowId: rowIdOf(24), months: { "2026-11": { weeks: [10] } } },
      { customer: "예시학원25", manager: " 예시A ", rowId: rowIdOf(25), months: { "2026-11": { weeks: [10] } } },
      { customer: "예시학원26", manager: "hwang", rowId: rowIdOf(26), months: { "2026-11": { weeks: [10] } } },
    ]
    const { sheet, deals } = baseCase(rows)
    const report = run(sheet, ledgerInput(deals, {
      entries: [entry({ id: "e13", customer: "예시학원빈담당", manager: "", month: "2026-11", amount: 30 })],
    }))
    const note = (key: string) => report.managerNames.find((item) => item.managerKey === key)!
    expect(note("minjae")).toMatchObject({ label: "Minjae", sheetSpellings: [{ raw: "New 2", rows: 1 }] })
    expect(note("minjae").notes).toEqual(["alias_applied"])
    expect(note("chanwoo")).toMatchObject({ label: "Chanwoo", notes: ["alias_applied"] })
    expect(note("examplea").notes).toEqual(["case_variant", "unknown"])
    expect(note("예시z").notes).toEqual(["unknown"])
    expect(note("예시a")).toMatchObject({ label: "예시A", sheetSpellings: [{ raw: " 예시A ", rows: 1 }] })
    expect(note("예시a").notes).toEqual(["unknown", "whitespace"])
    expect(note("")).toMatchObject({ label: "(미지정)", entrySpellings: [{ raw: "", entries: 1 }] })
    expect(note("").notes).toEqual(["empty"])
    expect(report.checks.emptyManagerEntries).toEqual([{ customer: "예시학원빈담당", month: "2026-11", amount: 30, id: "e13" }])
    // 빈 담당 항목도 합계에는 든다(담당 키 '')
    expect(cell(report, "", "2026-11", "total")).toMatchObject({ ledger: 30, deltaEntries: 30 })
  })
})

describe("T15 CNY 아닌 항목", () => {
  it("합계에는 그대로 더하고 목록에 남긴다", () => {
    const { sheet, deals } = baseCase()
    const report = run(sheet, ledgerInput(deals, {
      entries: [entry({ id: "e15", customer: "예시학원1", manager: "예시A", month: "2026-12", amount: 100, currency: "USD" })],
    }))
    expect(cell(report, "예시A", "2026-12", "total")).toMatchObject({ deltaEntries: 100 })
    expect(report.checks.nonCnyEntries).toEqual([expect.objectContaining({ customer: "예시학원1", currency: "USD", amount: 100, entryId: "e15" })])
  })
})

describe("T16 불완전", () => {
  it("장부 항목이 상한에 닿으면 incomplete · 3", () => {
    const { sheet, deals } = baseCase()
    const report = run(sheet, ledgerInput(deals, { truncated: { entries: true, appliedDrafts: false, openDrafts: false } }))
    expect(report.status).toBe("incomplete")
    expect(report.exitCode).toBe(3)
    expect(report.meta.incompleteReasons[0]).toContain("장부 항목이 안전 상한")
  })

  it("장부 항목 표를 못 읽으면 · 시트 쓰기 기록을 못 읽으면 incomplete", () => {
    const { sheet, deals } = baseCase()
    expect(run(sheet, ledgerInput(deals, { entriesHealthOk: false })).status).toBe("incomplete")
    expect(run(sheet, ledgerInput(deals, { sheetWritesReadable: false })).status).toBe("incomplete")
  })

  it("시트 머리를 못 알아보면 incomplete(A2 가 Account 가 아님)", () => {
    const grid = revGrid(BASE_ROWS)
    grid[1] = grid[1].map((cell, index) => (index === 0 ? { ...cell, value: "Customer" } : cell))
    const report = run(sheetInput(grid), ledgerInput(mirrorDeals(grid, { today: AS_OF, syncedAt: SYNC_AT })))
    expect(report.status).toBe("incomplete")
    expect(report.meta.incompleteReasons[0]).toContain("A2 머리가 Account")
  })
})

describe("T17 달·담당 필터", () => {
  it("--months 와 --manager 는 칸·건·이름을 좁힌다(별칭·대소문자 무시)", () => {
    const { sheet, deals } = baseCase()
    const report = run(sheet, ledgerInput(deals, {
      entries: [
        entry({ id: "e17a", customer: "예시학원1", manager: "예시A", month: "2026-11", amount: 10 }),
        entry({ id: "e17b", customer: "예시학원2", manager: "예시B", month: "2026-11", amount: 20 }),
        entry({ id: "e17c", customer: "예시학원1", manager: "예시A", month: "2026-12", amount: 30 }),
      ],
    }), { months: ["2026-11"], manager: "예시a" })
    expect(report.meta.manager).toBe("예시A")
    expect(report.meta.months).toEqual(["2026-11"])
    expect(new Set(report.totals.map((item) => item.managerKey))).toEqual(new Set(["예시a"]))
    expect(new Set(report.totals.map((item) => item.month))).toEqual(new Set(["2026-11"]))
    expect(report.rowDiffs.map((diff) => diff.refs.entryId)).toEqual(["e17a"])
    expect(report.managerNames.map((note) => note.managerKey)).toEqual(["예시a"])
  })

  it("회계연도 밖의 달은 거절한다", () => {
    const { sheet, deals } = baseCase()
    expect(() => reconcileRevLedger(sheet, ledgerInput(deals), { fiscalYear: 2026, asOf: AS_OF, now: NOW, months: ["2027-04"] })).toThrow(/회계연도/)
  })
})

describe("건 맞추기 — 시트에만 · DB 에만 · 짝 모호", () => {
  it("시트에만 있는 행과 DB 에만 있는 행", () => {
    const dbGrid = revGrid([BASE_ROWS[0], BASE_ROWS[1]])
    const liveGrid = revGrid([BASE_ROWS[0], { customer: "예시학원31", manager: "예시B", rowId: rowIdOf(31), months: { "2026-11": { weeks: [80] } } }])
    const report = run(sheetInput(liveGrid), ledgerInput(mirrorDeals(dbGrid, { today: AS_OF, syncedAt: SYNC_AT })))
    const causes = report.rowDiffs.map((diff) => `${diff.cause}:${diff.customer}:${diff.month}`)
    expect(causes).toEqual(expect.arrayContaining([
      "sheet_only_row:예시학원31:2026-11",
      "db_only_row:예시학원2:2026-10",
      "db_only_row:예시학원2:2026-11",
    ]))
    expect(cell(report, "예시B", "2026-11", "total")).toMatchObject({ sheet: 80, ledger: 500, deltaSync: 420 })
  })

  it("DB 행 둘이 시트 행 하나에 붙으면 ambiguous_match", () => {
    const grid = revGrid(BASE_ROWS)
    const deals = mirrorDeals(grid, { today: AS_OF, syncedAt: SYNC_AT })
    const twin = { ...deals[2], id: "m-twin" }
    const report = run(sheetInput(grid), ledgerInput([...deals, twin]))
    expect(report.rowDiffs.filter((diff) => diff.cause === "ambiguous_match").map((diff) => diff.refs.dbRowId).sort()).toEqual(["m-5", "m-twin"])
    expect(report.status).toBe("blocked")
  })
})

describe("잠금 전 확인 — 겹친 정정 · 정정 뒤 시트 변경 · 잠금 뒤 저절로 확정되지 않는 금액", () => {
  it("같은 칸 정정 둘은 늦은 것만 센다(F-04)", () => {
    const { sheet, deals } = baseCase()
    const edit = (id: string, amount: number, appliedAt: string) =>
      entry({ id, type: "manual-edit", customer: "예시학원3", manager: "예시A", month: "2026-12", amount, confidence: "expected", rowId: rowIdOf(3), appliedAt })
    const report = run(sheet, ledgerInput(deals, { entries: [edit("e-old", 450, "2026-11-27T01:00:00Z"), edit("e-new", 480, "2026-11-28T01:00:00Z")] }))
    expect(cell(report, "예시A", "2026-12", "total")).toMatchObject({ deltaEntries: 80 })
    expect(report.checks.supersededCorrections).toEqual([expect.objectContaining({ amount: 450, rowId: "ledger-e-old", winnerId: "ledger-e-new" })])
    expect(report.meta.ledger.superseded).toBe(1)
  })

  it("정정 뒤 시트가 바뀐 정정을 알린다(F-16 drift)", () => {
    const liveRows: FixtureRow[] = [BASE_ROWS[0], BASE_ROWS[1], { ...BASE_ROWS[2], months: { "2026-12": { weeks: [450] } } }]
    const { sheet, deals } = baseCase(liveRows)
    const report = run(sheet, ledgerInput(deals, {
      entries: [entry({ id: "e-drift", type: "manual-edit", customer: "예시학원3", manager: "예시A", month: "2026-12", amount: 500, confidence: "expected", rowId: rowIdOf(3), sourceSheetRow: 5, baselineWeeks: [400, 0, 0, 0, 0] })],
    }))
    expect(report.checks.driftCorrections).toEqual([expect.objectContaining({ customer: "예시학원3", baselineTotal: 400, currentTotal: 450, correctionAmount: 500 })])
  })

  it("색 있는 행의 검정·파랑 칸과 장부 예정 입력은 잠금 뒤에도 예정·고확도로 남는다 — 색 없는 행·빨간 예정 칸은 저절로 확정", () => {
    const { sheet, deals } = baseCase()
    const report = run(sheet, ledgerInput(deals, {
      entries: [entry({ id: "e-exp", customer: "예시학원40", manager: "예시B", month: "2026-12", amount: 90, confidence: "expected" })],
    }))
    const stuck = report.checks.stuckAfterLock
    expect(stuck.readDate).toBe("2027-04-01")
    expect(stuck.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ customer: "예시학원1", month: "2026-11", expected: 200, highConfidence: 0, origin: "sheet" }),
      expect.objectContaining({ customer: "예시학원1", month: "2026-12", expected: 70, highConfidence: 50, origin: "sheet" }),
      expect.objectContaining({ customer: "예시학원40", month: "2026-12", expected: 90, origin: "ledger" }),
    ]))
    expect(stuck.rows).toHaveLength(3)
    expect(stuck.byManager).toEqual([
      { managerKey: "예시a", manager: "예시A", expected: 270, highConfidence: 50 },
      { managerKey: "예시b", manager: "예시B", expected: 90, highConfidence: 0 },
    ])
    const auto = report.checks.autoPromote.cells.map((item) => `${item.customer}:${item.month}:${item.amount}:${item.when}:${item.reason}`).sort()
    expect(auto).toEqual([
      "예시학원1:2026-12:100:2026-12-01:red_week",
      "예시학원2:2026-11:500:2026-12-01:no_color_month",
      "예시학원3:2026-12:400:2027-01-01:no_color_month",
    ])
  })

  it("열린 초안은 합계에 없고 담당별로 센다", () => {
    const { sheet, deals } = baseCase()
    const report = run(sheet, ledgerInput(deals, {
      openDrafts: [
        draft({ id: "o1", status: "draft", customer: "예시학원1", manager: "예시A", month: "2026-12", amount: 10 }),
        draft({ id: "o2", status: "checked", customer: "예시학원1", manager: "예시A", month: "2026-12", amount: 20 }),
      ],
    }))
    expect(report.checks.openDrafts).toEqual([{ managerKey: "예시a", manager: "예시A", count: 2, amount: 30 }])
    expect(diffCells(report)).toEqual([])
  })
})

describe("T14 항등식 — 모든 칸에서 차이 = 장부 입력 + 동기화 뒤 시트 변경 + 시간 경과", () => {
  it("섞인 픽스처(새 행·정정·못 찾은 정정·시트 변경·담당 변경·시간 경과·환불)", () => {
    const dbRows: FixtureRow[] = [
      ...BASE_ROWS,
      { customer: "예시학원8", manager: "예시C", rowId: rowIdOf(8), months: { "2026-12": { weeks: [{ amount: 100, color: "red" }, null, { amount: 200, color: "red" }] } } },
      { customer: "예시학원11", manager: "예시D", rowId: rowIdOf(11), months: { "2026-10": { total: -30 }, "2027-01": { weeks: [{ amount: 75, color: "blue" }, 25] } } },
    ]
    const liveRows: FixtureRow[] = [
      dbRows[0],
      { ...dbRows[1], months: { "2026-10": { weeks: [400] }, "2026-11": { weeks: [520] } } },
      dbRows[2],
      { ...dbRows[3], manager: "예시D" },
      dbRows[4],
    ]
    const dbGrid = revGrid(dbRows)
    const deals = mirrorDeals(dbGrid, { today: "2026-12-20", syncedAt: "2026-12-20T03:00:00Z" })
    const report = run(sheetInput(revGrid(liveRows)), ledgerInput(deals, {
      entries: [
        entry({ id: "p1", customer: "예시학원1", manager: "예시A", month: "2026-12", amount: 1000 }),
        entry({ id: "p2", type: "manual-edit", customer: "예시학원3", manager: "예시A", month: "2026-12", amount: 333, confidence: "high-confidence", rowId: rowIdOf(3) }),
        entry({ id: "p3", type: "manual-edit", customer: "예시학원없음", manager: "예시B", month: "2026-11", amount: 77, sourceSheetRow: 98 }),
      ],
    }), { asOf: "2026-12-10" })
    expect(report.totals.length).toBeGreaterThan(10)
    for (const item of report.totals) {
      expect(Math.abs(item.delta - (item.deltaEntries + item.deltaSync + item.deltaTime))).toBeLessThan(1e-6)
    }
    expect(report.totals.some((item) => item.deltaEntries !== 0)).toBe(true)
    expect(report.totals.some((item) => item.deltaSync !== 0)).toBe(true)
    expect(report.totals.some((item) => item.deltaTime !== 0)).toBe(true)
  })
})

describe("같은 입력이면 같은 보고서", () => {
  it("장부 DB 행 순서가 달라도 보고서가 같다", () => {
    const rows: FixtureRow[] = [
      ...BASE_ROWS,
      { customer: "예시학원9", manager: "예시C", rowId: rowIdOf(9), months: { "2026-12": { weeks: [{ amount: 100, color: "red" }, 30] } } },
    ]
    const { sheet, deals } = baseCase(rows)
    const entries = [entry({ id: "e-a", customer: "예시학원1", manager: "예시A", month: "2026-12", amount: 5, confidence: "expected" })]
    const forward = reconcileRevLedger(sheet, ledgerInput(deals, { entries }), { fiscalYear: 2026, asOf: AS_OF, now: NOW })
    const backward = reconcileRevLedger(sheet, ledgerInput([...deals].reverse(), { entries }), { fiscalYear: 2026, asOf: AS_OF, now: NOW })
    expect(JSON.stringify(backward)).toBe(JSON.stringify(forward))
  })
})

describe("T18 순수 — 지금 시각·환경 변수를 읽지 않는다", () => {
  it.each(["rev-ledger-reconcile.ts", "rev-ledger-render.ts", "rev-ledger-inputs.ts", "run-reconcile.ts"])("%s", (file) => {
    // 주석은 빼고 본다(설명에 'process.env 금지' 같은 글이 있다)
    const source = readFileSync(join(process.cwd(), "lib/branch/reconcile", file), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "")
    expect(source).not.toMatch(/new Date\(\s*\)/)
    expect(source).not.toMatch(/Date\.now\b/)
    expect(source).not.toMatch(/process\.env/)
    expect(source).not.toMatch(/from "node:fs"|require\("fs"\)/)
  })
})

afterAll(() => {
  // T14(전 픽스처): 이 파일에서 만든 모든 보고서의 모든 칸에서 항등식이 성립하고, 화면 식 = 서버 식이다.
  expect(reports.length).toBeGreaterThan(20)
  for (const report of reports) {
    for (const item of report.totals) {
      expect(Math.abs(item.delta - (item.deltaEntries + item.deltaSync + item.deltaTime))).toBeLessThan(1e-6)
    }
    expect(report.checks.serverParity).toEqual({ ok: true, cells: [] })
  }
})
