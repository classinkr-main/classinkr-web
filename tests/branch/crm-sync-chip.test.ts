// CRM 싱크 칩(B안) — SyncStatusBar 원천 배지 옆 컴팩트 칩 배선 검증.
// 렌더 하네스가 없는 저장소라 소스 스캔 관례(branch-hero-gauges-error-prop.test.ts)를 따른다.
// 데이터 계약(요약 모델)은 tests/crm/rev-sync-health.test.ts의 buildCrmSyncSummary가 커버.
import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

const syncStatusBarPath = join(process.cwd(), "components/admin/branch/SyncStatusBar.tsx")
const dashboardClientPath = join(process.cwd(), "components/admin/branch/BranchDashboardClient.tsx")
const workbenchPath = join(process.cwd(), "components/admin/branch/SalesLedgerWorkbench.tsx")

describe("SyncStatusBar CRM 싱크 칩 (B안)", () => {
  it("crmSync는 옵션 prop(기본 null) — 미전달 사용처는 칩이 그려지지 않는다", () => {
    const source = readFileSync(syncStatusBarPath, "utf8")
    expect(source).toContain("crmSync?: CrmSyncSummary | null")
    expect(source).toContain("crmSync = null")
    expect(source).toContain("{crmSync && (")
  })

  it("칩은 장부로 딥링크 + title 툴팁(포커스/호버 요약), 확도 전용 파랑 미사용", () => {
    const source = readFileSync(syncStatusBarPath, "utf8")
    const chipAt = source.indexOf("{crmSync && (")
    expect(chipAt).toBeGreaterThan(-1)
    const chipBlock = source.slice(chipAt, source.indexOf("CRM 연결", chipAt) + 40)
    expect(chipBlock).toContain('href="/admin/branch/ledger"')
    expect(chipBlock).toContain("title={`계정 ")
    expect(source).toContain("CRM 연결 {crmSync.accountPctLabel}")
    expect(source.toUpperCase()).not.toContain("1E5DA8")
    // 낮음 상태 칩 톤 = 테라코타 계열.
    expect(source).toContain("#B85C33")
  })

  it("KR Team(BranchDashboardClient)이 coverage를 1회 fetch해 prop으로 전달한다", () => {
    const source = readFileSync(dashboardClientPath, "utf8")
    expect(source).toContain('adminFetchJsonCached<{ revAccounts?: RevSyncCoverageView | null }>("/api/admin/crm/coverage"')
    expect(source).toContain("buildCrmSyncSummary(response?.revAccounts ?? null)")

    const barAt = source.indexOf("<SyncStatusBar")
    expect(barAt).toBeGreaterThan(-1)
    const barBlock = source.slice(barAt, source.indexOf("/>", barAt))
    expect(barBlock).toContain("crmSync={crmSync}")
  })

  it("장부 워크벤치는 SyncStatusBar를 쓰지 않는다 — A안 스트립과 칩이 중복되지 않음", () => {
    const source = readFileSync(workbenchPath, "utf8")
    expect(source).not.toContain("<SyncStatusBar")
  })
})
