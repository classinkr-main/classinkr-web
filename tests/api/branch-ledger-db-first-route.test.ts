import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8")
}

describe("branch ledger DB-first route wiring", () => {
  it("loads DSH, KPI, and REV from active imports before using fallback in summary", () => {
    const route = source("app/api/admin/branch/summary/route.ts")

    // DSH/KPI 읽기는 lib/branch/read-dsh-kpi의 단일 규약 헬퍼를 경유한다(91fb6e57 미러 도입) —
    // 라우트가 아니라 헬퍼가 액티브임포트→미러→라이브시트 사다리를 보장한다(아래 helper 단언).
    expect(route).toContain("readDshPreferDb")
    expect(route).toContain("readKpiBlocksPreferDb")
    expect(route).toContain('from "@/lib/branch/read-dsh-kpi"')
    // REV 읽기도 같은 방식으로 lib/branch/read-rev-deals 헬퍼를 경유한다.
    expect(route).toContain("readRevDealsPreferActive")
    expect(route).toContain('from "@/lib/branch/read-rev-deals"')

    const revHelper = source("lib/branch/read-rev-deals.ts")
    expect(revHelper).toContain("readRevDealsFromActiveImport")
    expect(revHelper).toContain("return imported ?? listBranchRevDeals")

    const dshKpiHelper = source("lib/branch/read-dsh-kpi.ts")
    expect(dshKpiHelper).toContain("readDshFromActiveImport")
    expect(dshKpiHelper).toContain("readKpiBlocksFromActiveImport")
    expect(dshKpiHelper).toContain("readBranchDshMirror")
    expect(dshKpiHelper).toContain("readBranchKpiMirror")
    expect(dshKpiHelper).toContain("if (imported) return imported")
    expect(dshKpiHelper).toContain("if (mirror) return mirror")
    expect(dshKpiHelper).toContain("parseDsh(await readRangeWithFormat")
    expect(dshKpiHelper).toContain("parseKpiBlocks(await readRangeWithFormat")
  })

  it("loads DSH, KPI, and REV from active imports before using fallback in KPI route", () => {
    const route = source("app/api/admin/branch/kpi/route.ts")

    expect(route).toContain("readDshPreferDb")
    expect(route).toContain("readKpiBlocksPreferDb")
    expect(route).toContain('from "@/lib/branch/read-dsh-kpi"')
    expect(route).toContain("readRevDealsPreferActive")
    expect(route).toContain('from "@/lib/branch/read-rev-deals"')
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
    // 액티브 포인터 조회: run 상태+캡처 시각을 inner join으로 함께 확인(왕복 1회)하고,
    // 요청 핫패스라 unstable_cache(60s)로 감싼다. started_at도 같이 실어 data_sources
    // 노출(WithSource 변형)이 별도 왕복을 만들지 않게 한다.
    expect(repository).toContain("sales_ledger_import_runs!inner(status, started_at)")
    expect(repository).toContain('.eq("sales_ledger_import_runs.status", "succeeded")')
    expect(repository).toContain("getCachedActiveImportRunInfo")
    expect(repository).toContain("KPI_DB_METRIC_BY_APP_METRIC")
    expect(repository).toContain("return { rows, members, breakdown }")
    expect(repository).toContain("monthly_high_conf")
    expect(repository).toContain("weeklyPayments")
    expect(repository).toContain("return {")
    expect(repository).toContain("fy: rowsToKpiRows(fyRows)")
  })
})
