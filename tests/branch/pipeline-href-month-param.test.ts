import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

// 최종 수리 — 항목 3: SalesLedgerWorkbench의 pipelineHref가 period==="M"일 때 month를
// 동봉하지 않았다. BranchDashboardClient는 URL의 month를 읽어 selectedMonth를 초기화하므로
// (BranchDashboardClient.tsx line ~119 `searchParams.get("month")`), 다른 달을 보다가
// "KPI 보기" 등으로 파이프라인 탭으로 넘어가면 이번 달로 튕기는 버그였다.
// sections/PipelineTable.tsx의 ledgerHref(장부로 가는 반대 방향 크로스링크)가 이미
// `if (period === "M") base.set("month", selectedMonth)` 패턴을 쓰고 있어 그 규약을 그대로 따른다.
const workbenchPath = join(
  process.cwd(),
  "components/admin/branch/SalesLedgerWorkbench.tsx",
)
const pipelineTablePath = join(
  process.cwd(),
  "components/admin/branch/sections/PipelineTable.tsx",
)
const dashboardClientPath = join(
  process.cwd(),
  "components/admin/branch/BranchDashboardClient.tsx",
)

function workbenchSource() {
  return readFileSync(workbenchPath, "utf8")
}

describe("SalesLedgerWorkbench pipelineHref — month 파라미터 동봉 (항목 3)", () => {
  it("period==='M'일 때 month=selectedMonth를 동봉한다", () => {
    const source = workbenchSource()
    const memoStart = source.indexOf("const pipelineHref = useMemo")
    expect(memoStart).toBeGreaterThan(-1)
    const memoEnd = source.indexOf("}, [team, period, selectedMonth, query, managerFilter])", memoStart)
    expect(memoEnd).toBeGreaterThan(memoStart)
    const memoBody = source.slice(memoStart, memoEnd)

    expect(memoBody).toContain('if (period === "M") params.set("month", selectedMonth)')

    // 순서 확인: period 파라미터 설정 다음, q/mgr보다는 먼저 와야 자연스럽다(필수는 아니지만
    // diff 최소화 확인용) — 최소한 team/period 처리 이후에 위치.
    const periodIndex = memoBody.indexOf('if (period !== "Q") params.set("period", period)')
    const monthIndex = memoBody.indexOf('if (period === "M") params.set("month", selectedMonth)')
    expect(periodIndex).toBeGreaterThan(-1)
    expect(monthIndex).toBeGreaterThan(periodIndex)
  })

  it("selectedMonth가 의존성 배열에 포함돼 월 변경 시 링크가 재계산된다", () => {
    const source = workbenchSource()
    expect(source).toContain("}, [team, period, selectedMonth, query, managerFilter])")
  })

  it("PipelineTable.ledgerHref와 동일 규약(period==='M'일 때만 month 동봉)을 공유한다", () => {
    const pipelineTable = readFileSync(pipelineTablePath, "utf8")
    expect(pipelineTable).toContain('if (period === "M") base.set("month", selectedMonth)')
  })

  it("BranchDashboardClient가 URL의 month를 읽어 selectedMonth를 초기화한다(교차 검증 — 이 파라미터가 실제로 소비됨)", () => {
    const dashboardClient = readFileSync(dashboardClientPath, "utf8")
    expect(dashboardClient).toContain('const m = searchParams.get("month")')
  })
})
