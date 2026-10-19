import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { CrmRevenuePerformance } from "@/lib/crm/revenue-performance"

// Node SSR has no effect lifecycle: seed the real component's loaded state,
// and replace only the chart renderer to inspect the signed series/domain it receives.
const state = vi.hoisted(() => ({ values: [] as unknown[], index: 0 }))
const charts = vi.hoisted(() => ({ comparisons: [] as Array<{ data: Array<{ revenue: number }>; leftDomain?: [number, number] }> }))
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>()
  return {
    ...actual,
    useState: (initial: unknown) => actual.useState(state.index < state.values.length ? state.values[state.index++] : initial),
  }
})
vi.mock("@/lib/admin-client", () => ({ adminFetchJson: vi.fn(), adminFetchJsonCached: vi.fn() }))
vi.mock("@/components/admin/viz/ComparisonBarChart", () => ({
  ComparisonBarChart: (props: { data: Array<{ revenue: number }>; leftDomain?: [number, number] }) => {
    charts.comparisons.push(props)
    return <div data-chart="monthly" />
  },
}))
vi.mock("@/components/admin/viz/RankedHorizontalBars", () => ({ RankedHorizontalBars: () => <div data-chart="ranking" /> }))

import CrmPerformanceCharts from "@/components/admin/crm/CrmPerformanceCharts"

const report = (revenues: number[]): CrmRevenuePerformance => ({
  generatedAt: "2026-10-15T00:00:00Z",
  months: ["2026-09", "2026-10"],
  monthly: revenues.map((revenue, index) => ({ month: index === 0 ? "2026-09" : "2026-10", revenue })),
  total: revenues.reduce((sum, value) => sum + value, 0),
  byTeam: [], byMember: [], dealCount: 2, newAccountsByMonth: [], windowLimited: true,
})

function render(data: CrmRevenuePerformance, target: number | null = null, error = false) {
  // data, loading, error, target; the rest of the editor's state uses its real defaults.
  state.values = [data, false, error, target]
  state.index = 0
  return renderToStaticMarkup(<CrmPerformanceCharts />)
}

beforeEach(() => { charts.comparisons = []; state.index = 0 })

describe("CRM performance zero-net and error rendering", () => {
  it("renders monthly payment/refund history when the report total nets to zero", () => {
    const html = render(report([100, -100]), 200)
    expect(html).toContain("매출 추이")
    expect(html).not.toContain("표시할 매출 데이터가 없습니다")
    expect(charts.comparisons).toHaveLength(1)
    const chart = charts.comparisons[0]
    expect(chart.data.map((point) => point.revenue)).toEqual([100, -100])
    expect(chart.leftDomain?.[0]).toBeLessThanOrEqual(-100)
    expect(chart.leftDomain?.[1]).toBeGreaterThanOrEqual(200)
  })

  it("keeps the empty message when every month is actually zero", () => {
    expect(render(report([0, 0]))).toContain("표시할 매출 데이터가 없습니다")
    expect(charts.comparisons).toHaveLength(0)
  })

  it("shows a read failure separately from an empty revenue result", () => {
    const html = render(report([0, 0]), null, true)
    expect(html).toContain("성과 데이터를 불러오지 못했습니다")
    expect(html).not.toContain("표시할 매출 데이터가 없습니다")
    expect(charts.comparisons).toHaveLength(0)
  })
})
