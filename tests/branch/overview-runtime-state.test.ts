import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

const branchClientPath = join(process.cwd(), "components/admin/branch/BranchDashboardClient.tsx")
const overviewPanelPath = join(process.cwd(), "components/admin/branch/BranchOverviewPanel.tsx")
const clientApiPath = join(process.cwd(), "components/admin/branch/client-api.ts")

const sourceOf = (path: string) => readFileSync(path, "utf8")

describe("KR Team 개요 런타임 상태", () => {
  it("개요 위젯을 여러 독립 청크 대신 하나의 실패 경계로 불러온다", () => {
    const source = sourceOf(branchClientPath)

    expect(source).toContain('import("./BranchOverviewPanel")')
    expect(source).toContain("12_000")
    expect(source).toContain("개요 화면을 불러오지 못했습니다")
    expect(source).not.toContain('dynamic(() => import("./sections/CoreKpiGrid")')
    expect(source).not.toContain('dynamic(() => import("./sections/BranchHeroGauges")')
    expect(source).not.toContain('dynamic(() => import("./sections/RevenueFlowSection")')
  })

  it("개요 탭만 summary의 경량 timeline projection을 요청한다", () => {
    const source = sourceOf(branchClientPath)

    expect(source).toContain('activeTab === "overview" ? "&view=overview" : ""')
    expect(source).toContain("${monthQuery}${summaryViewQuery}")
  })

  it("개요 로딩 영역의 busy 상태를 보조기술에 노출한다", () => {
    const source = sourceOf(branchClientPath)

    expect(source).toContain("aria-busy={summary.loading && !summary.data}")
  })

  it("요약 요청의 loading/error/empty/stale 상태를 명시적으로 표시한다", () => {
    const source = sourceOf(overviewPanelPath)

    expect(source).toContain("summary.loading && !summary.data")
    expect(source).toContain("summary.error && !summary.data")
    expect(source).toContain("if (!summary.data)")
    expect(source).toContain("if (!summary.stale && !kpi.stale) return null")
    expect(source).toContain("실시간 갱신에 실패해 이전 데이터를 표시합니다")
  })

  it("branch 요청 상태가 stale 여부와 저장 시각을 소비자에게 노출한다", () => {
    const source = sourceOf(clientApiPath)

    expect(source).toContain("export interface BranchJsonState<T>")
    expect(source).toContain("const BRANCH_READ_TIMEOUT_MS = 15_000")
    expect(source).toContain("{ adminTimeoutMs: BRANCH_READ_TIMEOUT_MS }")
    expect(source).toContain("stale: boolean")
    expect(source).toContain("staleSince: number | null")
  })
})
