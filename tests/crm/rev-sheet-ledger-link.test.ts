import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(
  join(process.cwd(), "app/admin/crm/deals/rev-sheet/page.tsx"),
  "utf8"
)

// P2-10(docs/active/sales-ledger-input-speed-plan-2026-09-20.md §0·§4) — 매출시트 행에서 매출
// 장부(REV 렌즈)로 바로 들어가는 딥링크. 매출시트는 여전히 READ 표면이라(CRM-1 역할 분리 유지)
// 이 테스트는 소스 스캔으로 "링크가 맞는 파라미터를 싣는지"·"금액 입력 요소가 새로 생기지
// 않았는지"만 지킨다 — 이 저장소 관례(tests/admin/rev-sheet-mobile-contract.test.ts 등)와 동일.
describe("REV sheet → ledger row deep link (P2-10)", () => {
  it("gives every row a '장부에서 입력' link into the ledger's REV lens", () => {
    expect(source).toContain("장부에서 입력")
    expect(source).toContain("/admin/branch/ledger?lens=rev")
  })

  it("carries the row's customer name as the ledger's search query param (q=) — the only name SalesLedgerWorkbench's URL restore reads for search", () => {
    // SalesLedgerWorkbench.tsx:795 `setQuery(params.get("q") ?? "")` — q가 실제로 파싱되는 이름.
    expect(source).toContain("q=${encodeURIComponent(row.customerName)}")
  })

  it("only adds team= when the row's team is a value the ledger's team filter actually accepts", () => {
    // components/admin/branch/types.ts TEAMS — 장부 team 필터가 받는 값(ALL/BD/MKT/CSM)만 유효.
    expect(source).toContain("@/components/admin/branch/types")
    expect(source).toContain('row.team !== "ALL"')
    expect(source).toContain("TEAMS as readonly string[]).includes(row.team)")
    expect(source).toContain("&team=${encodeURIComponent(team)}")
  })

  it("deliberately leaves month/period off the row link — a sheet row has no single canonical month, and the ledger's default period (Q) ignores selectedMonth anyway", () => {
    const start = source.indexOf("function buildLedgerInputHref")
    const end = source.indexOf("function matchesStatusFilter")
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    const hrefBuilder = source.slice(start, end)
    expect(hrefBuilder).not.toContain("month")
    expect(hrefBuilder).not.toContain("period")
  })

  it("stops the link click from bubbling into any row click handler and keeps the touch target size", () => {
    expect(source).toContain("stopPropagation")
    expect(source).toContain("min-h-11")
  })

  it("labels the link for assistive tech with the customer name", () => {
    expect(source).toContain("aria-label={`${row.customerName} 장부에서 입력 열기`}")
  })

  it("keeps the existing READ-only role banner and its 매칭 인박스 link, and adds a 매출 장부 entry point beside it (not instead of it)", () => {
    expect(source).toContain("분석·검수 전용")
    expect(source).toContain("매칭 인박스 ↗")
    expect(source).toContain("매출 장부 ↗")
    expect(source).toContain('href="/admin/branch/ledger?lens=rev"')
  })

  it("never grows a money-entry control on this page — REV sheet stays a READ surface (CRM-1)", () => {
    expect(source).not.toContain("AdminMoneyInput")
    expect(source).not.toContain('type="number"')
  })
})
