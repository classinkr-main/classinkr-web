import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8")
}

describe("branch ledger DB-first route wiring", () => {
  it("loads DSH, KPI, and REV from active imports before using fallback in summary", () => {
    const route = source("app/api/admin/branch/summary/route.ts")

    expect(route).toContain("readDshFromActiveImport")
    expect(route).toContain("readKpiBlocksFromActiveImport")
    // REV 읽기는 lib/branch/read-rev-deals의 단일 규약 헬퍼를 경유한다 — 라우트가 아니라
    // 헬퍼가 DB-native 우선 + 시트 미러 폴백을 보장한다(아래 helper 단언).
    expect(route).toContain("readRevDealsPreferActive")
    expect(route).toContain('from "@/lib/branch/read-rev-deals"')
    expect(route).toContain("if (imported) return imported")
    expect(route).toContain("if (imported) return imported.fy")
    expect(route).toContain("readRangeWithFormat(id, DSH_RANGE)")
    expect(route).toContain("readRangeWithFormat(id, KPI_RANGE)")

    const helper = source("lib/branch/read-rev-deals.ts")
    expect(helper).toContain("readRevDealsFromActiveImport")
    expect(helper).toContain("return imported ?? listBranchRevDeals")
  })

  it("loads DSH, KPI, and REV from active imports before using fallback in KPI route", () => {
    const route = source("app/api/admin/branch/kpi/route.ts")

    expect(route).toContain("readDshFromActiveImport")
    expect(route).toContain("readKpiBlocksFromActiveImport")
    expect(route).toContain("readRevDealsFromActiveImport")
    expect(route).toContain("const imported = await readDshFromActiveImport(fy)")
    expect(route).toContain("const imported = await readKpiBlocksFromActiveImport(fy)")
    expect(route).toContain("return imported ?? listBranchRevDeals")
    expect(route).toContain("parseDsh(await readRangeWithFormat")
    expect(route).toContain("parseKpiBlocks(await readRangeWithFormat")
  })

  it("loads REV from active imports before using branch_rev_deals fallback in pipeline route", () => {
    const route = source("app/api/admin/branch/pipeline/route.ts")

    expect(route).toContain("readRevDealsFromActiveImport")
    expect(route).toContain("await readRevDealsFromActiveImport(fy, { team }) ?? await listBranchRevDeals({ team })")
    expect(route).toContain("listRevRevenue(deals")
  })

  it("maps active import rows back into existing DSH, KPI, and REV domain contracts", () => {
    const repository = source("lib/repositories/sales-ledger-imports.ts")

    expect(repository).toContain("readDshFromActiveImport")
    expect(repository).toContain("readKpiBlocksFromActiveImport")
    expect(repository).toContain("readRevDealsFromActiveImport")
    expect(repository).toContain("branch_dsh_rows")
    expect(repository).toContain("branch_kpi_rows")
    expect(repository).toContain("branch_rev_lines")
    expect(repository).toContain("branch_rev_period_entries")
    // 액티브 포인터 조회: run 상태를 inner join으로 함께 확인(왕복 1회)하고,
    // 요청 핫패스라 unstable_cache(60s)로 감싼다.
    expect(repository).toContain("sales_ledger_import_runs!inner(status)")
    expect(repository).toContain('.eq("sales_ledger_import_runs.status", "succeeded")')
    expect(repository).toContain("getCachedActiveImportRunId")
    expect(repository).toContain("KPI_DB_METRIC_BY_APP_METRIC")
    expect(repository).toContain("return { rows, members, breakdown }")
    expect(repository).toContain("monthly_high_conf")
    expect(repository).toContain("weeklyPayments")
    expect(repository).toContain("return {")
    expect(repository).toContain("fy: rowsToKpiRows(fyRows)")
  })
})
