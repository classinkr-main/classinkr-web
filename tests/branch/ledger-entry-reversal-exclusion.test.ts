import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

import { buildLedgerOverlay, type LedgerOverlayEntry } from "@/lib/branch/ledger-overlay"

// 웨이브 5, item 2 — 원장 entries를 소비하는 경로가 reversed 항목을 집계에서 제외하는지
// 확인. 실사용 소비처는 두 곳뿐이다(2026-07-17 grep 확인):
//  1) lib/repositories/branch-sales-ledger-drafts.ts의 listBranchSalesLedgerEntries
//     (repository 단위 테스트로 별도 커버 — tests/repositories/branch-sales-ledger-drafts.test.ts)
//  2) lib/branch/ledger-overlay.ts의 buildLedgerOverlay — 2026-11-25부터 SalesLedgerWorkbench의
//     ledgerEntryRows useMemo 대신 이 순수 함수가 매트릭스/합계 행을 만든다(서버 집계도 같은 함수).
// revenue-core.ts·rev-confirmed.ts·weekly-close(sales-ledger-weekly-close.ts)는 시트/DB-import
// REV 딜(branch_rev_deals · sales_ledger_import_runs)에서만 읽고 branch_sales_ledger_entries를
// 전혀 참조하지 않는다 — grep으로 확인됨, 이 내부 원장은 아직 그 파이프라인에 연결돼 있지 않다.
//
// 오버레이는 순수 함수라 동작으로 검증하고, 워크벤치는 그 함수를 부르는지만 소스로 본다.
const workbenchPath = join(
  process.cwd(),
  "components/admin/branch/SalesLedgerWorkbench.tsx",
)

function workbenchSource() {
  return readFileSync(workbenchPath, "utf8")
}

function entry(overrides: Partial<LedgerOverlayEntry>): LedgerOverlayEntry {
  return {
    id: "e-1",
    draftId: "d-1",
    entryType: "manual-new",
    entryStatus: "active",
    sourceSheetRow: null,
    customer: "예시학원1",
    manager: "예시A",
    team: "BD",
    month: "2026-11",
    amount: 1_000,
    note: "",
    appliedAt: "2026-11-20T00:00:00.000Z",
    metadata: { confidence: "confirmed" },
    ...overrides,
  }
}

describe("장부 오버레이 — reversed 항목 제외 가드", () => {
  it("entryStatus==='active' 항목만 행이 되고, reversed 항목은 매트릭스 행·합계에 들어가지 않는다", () => {
    const result = buildLedgerOverlay({
      sheetRows: [],
      ledgerEntries: [entry({ id: "e-active" }), entry({ id: "e-reversed", draftId: "d-2", entryStatus: "reversed", amount: 9_000 })],
    })
    expect(result.entryRows.map((row) => row.id)).toEqual(["ledger-e-active"])
    expect(result.rows.reduce((sum, row) => sum + (row.monthlyPayments?.["2026-11"] ?? 0), 0)).toBe(1_000)
  })

  it("워크벤치는 인라인 합성 대신 buildLedgerOverlay에 항목을 넘긴다", () => {
    const source = workbenchSource()
    const start = source.indexOf("const ledgerOverlay = useMemo(")
    expect(start).toBeGreaterThan(-1)
    expect(source.slice(start, start + 400)).toContain("ledgerEntries,")
    expect(source).not.toContain('.filter((entry) => entry.entryStatus === "active")')
  })
})

describe("revenue-core / weekly-close는 branch_sales_ledger_entries를 참조하지 않는다 (문서화 가드)", () => {
  it("revenue-core.ts / rev-confirmed.ts에 branch_sales_ledger_entries 참조가 없다", () => {
    const revenueCore = readFileSync(join(process.cwd(), "lib/branch/computations/revenue-core.ts"), "utf8")
    const revConfirmed = readFileSync(join(process.cwd(), "lib/branch/computations/rev-confirmed.ts"), "utf8")
    expect(revenueCore).not.toContain("branch_sales_ledger_entries")
    expect(revConfirmed).not.toContain("branch_sales_ledger_entries")
  })

  it("sales-ledger-weekly-close.ts는 REV 딜/스냅샷 테이블만 읽고 내부 원장을 읽지 않는다", () => {
    const weeklyClose = readFileSync(join(process.cwd(), "lib/repositories/sales-ledger-weekly-close.ts"), "utf8")
    expect(weeklyClose).not.toContain("branch_sales_ledger_entries")
    expect(weeklyClose).toContain("readRevDealsFromActiveImport")
  })
})
