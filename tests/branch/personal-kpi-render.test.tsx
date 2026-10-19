import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import BranchKpiAccordion from "@/components/admin/branch/sections/BranchKpiAccordion"
import type { BranchKpiResponse } from "@/components/admin/branch/types"

describe("개인 KPI 렌더링", () => {
  it("전사 팀 합계가 없어도 과거 CSM 소속 개인의 승인 목표·매출 행을 펼쳐 표시한다", () => {
    const data: BranchKpiResponse = {
      scope: { manager: "Somang" }, teams: [],
      members: [{ member: "Somang", team: "CSM", goal: 200, status: 70, achievement_pct: 35, confirmed: 70, deals_total: 1, deals_confirmed: 1, new_renew: { new: 1, renew: 0 }, kpi: {} }],
    }
    const html = renderToStaticMarkup(<BranchKpiAccordion data={data} loading={false} error={null} team="ALL" period="M" selectedMonth="2026-10" />)
    expect(html).toContain("내 담당 · Somang")
    expect(html).toContain('aria-expanded="true"')
    expect(html).toContain("Somang")
    expect(html).not.toContain("Junhyuk")
    expect(html).toContain("Compass")
  })
})
