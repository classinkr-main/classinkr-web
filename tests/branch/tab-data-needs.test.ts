import { describe, expect, it } from "vitest"
import { getBranchTabDataNeeds } from "../../components/admin/branch/tab-data-needs"

describe("KR Team tab data needs", () => {
  it("loads KPI data only for tabs that render KPI views", () => {
    expect(getBranchTabDataNeeds("overview")).toEqual({ kpi: true })
    expect(getBranchTabDataNeeds("pipeline")).toEqual({ kpi: true })
    expect(getBranchTabDataNeeds("heatmap")).toEqual({ kpi: false })
    expect(getBranchTabDataNeeds("ai")).toEqual({ kpi: false })
  })
})
