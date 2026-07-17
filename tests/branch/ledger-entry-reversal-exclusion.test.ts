import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

// 웨이브 5, item 2 — 원장 entries를 소비하는 경로가 reversed 항목을 집계에서 제외하는지
// 확인. 실사용 소비처는 두 곳뿐이다(2026-07-17 grep 확인):
//  1) lib/repositories/branch-sales-ledger-drafts.ts의 listBranchSalesLedgerEntries
//     (repository 단위 테스트로 별도 커버 — tests/repositories/branch-sales-ledger-drafts.test.ts)
//  2) components/admin/branch/SalesLedgerWorkbench.tsx의 ledgerEntryRows useMemo
//     (매트릭스/합계에 실제로 반영되는 유일한 클라이언트 파생 지점).
// revenue-core.ts·rev-confirmed.ts·weekly-close(sales-ledger-weekly-close.ts)는 시트/DB-import
// REV 딜(branch_rev_deals · sales_ledger_import_runs)에서만 읽고 branch_sales_ledger_entries를
// 전혀 참조하지 않는다 — grep으로 확인됨, 이 내부 원장은 아직 그 파이프라인에 연결돼 있지 않다.
//
// components/*는 이 웨이브에서 수정 금지 대상이라 소스 내용만 읽어 회귀를 감시한다(수정 없음).
const workbenchPath = join(
  process.cwd(),
  "components/admin/branch/SalesLedgerWorkbench.tsx",
)

function workbenchSource() {
  return readFileSync(workbenchPath, "utf8")
}

describe("SalesLedgerWorkbench ledgerEntryRows — reversed 항목 제외 가드", () => {
  it("ledgerEntryRows useMemo가 entryStatus==='active'로 필터링한 뒤에만 매트릭스 행을 만든다", () => {
    const source = workbenchSource()
    const memoStart = source.indexOf("const ledgerEntryRows = useMemo")
    expect(memoStart).toBeGreaterThan(-1)

    const memoEnd = source.indexOf("}, [ledgerEntries, matrixMonths, team])", memoStart)
    expect(memoEnd).toBeGreaterThan(memoStart)

    const memoBody = source.slice(memoStart, memoEnd)
    expect(memoBody).toContain('.filter((entry) => entry.entryStatus === "active")')

    // 필터가 매핑(.map)보다 먼저 와야 reversed 항목이 애초에 행으로 파생되지 않는다.
    const filterIndex = memoBody.indexOf('.filter((entry) => entry.entryStatus === "active")')
    const mapIndex = memoBody.indexOf(".map((entry) => ({")
    expect(filterIndex).toBeGreaterThan(-1)
    expect(mapIndex).toBeGreaterThan(filterIndex)
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
