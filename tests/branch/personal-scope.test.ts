import { matchesDataOwner } from "@/lib/crm/personal-owner"
import { describe, expect, it } from "vitest"
import { initialBranchManager, scopeDshToManager, UNMAPPED_BRANCH_MEMBER } from "@/lib/branch/personal-scope"
import { summarizeRevenue } from "@/lib/branch/computations/core-kpi"
import type { DshOutput } from "@/lib/branch/parsers/dsh"
import type { BranchRevDeal } from "@/lib/repositories/branch-deals"

const dsh: DshOutput = {
  members: { Junhyuk: "BD", Somang: "CSM" },
  rows: [
    { level: "team", team: "ALL", kind: "goal", annual: 1000, quarters: [0, 0, 1000, 0], months: { "2026-10": 1000 } },
    { level: "member", team: "BD", member: "Junhyuk", kind: "goal", annual: 100, quarters: [0, 0, 100, 0], months: { "2026-10": 100 } },
    { level: "member", team: "CSM", member: "Somang", kind: "goal", annual: 200, quarters: [0, 0, 200, 0], months: { "2026-10": 200 } },
  ],
  breakdown: [],
}

describe("개인 기본 범위", () => {
  it("담당자 이름은 한영 별명만 연결하고 비슷한 다른 이름을 포함하지 않는다", () => {
    expect(matchesDataOwner("Junhyuk", ["문준혁"])).toBe(true)
    expect(matchesDataOwner("매니저A2", ["매니저A"])).toBe(false)
    expect(matchesDataOwner("Junhyuk", [])).toBe(false)
    expect(matchesDataOwner(null, undefined)).toBe(true)
  })
  it("관리자·지사장도 전달된 자기 담당자로 시작하며 다른 브라우저 핀을 쓰지 않는다", () => {
    expect(initialBranchManager(new URLSearchParams(), "Junhyuk")).toBe("Junhyuk")
    expect(initialBranchManager(new URLSearchParams("lens=board&period=M"), "Somang")).toBe("Somang")
    expect(initialBranchManager(new URLSearchParams(), UNMAPPED_BRANCH_MEMBER)).toBe(UNMAPPED_BRANCH_MEMBER)
  })
  it("기본 ALL 팀 쿼리가 개인 담당 기본값을 단체 보기로 넓히지 않는다", () => {
    for (const lens of ["rev", "cockpit"]) {
      expect(initialBranchManager(new URLSearchParams(`lens=${lens}&team=ALL`), "Junhyuk")).toBe("Junhyuk")
      expect(initialBranchManager(new URLSearchParams(`lens=${lens}&team=ALL`), UNMAPPED_BRANCH_MEMBER)).toBe(UNMAPPED_BRANCH_MEMBER)
    }
    expect(initialBranchManager(new URLSearchParams("team="), "Somang")).toBe("Somang")
    expect(initialBranchManager(new URLSearchParams("team=unknown"), "Somang")).toBe("Somang")
    expect(initialBranchManager(new URLSearchParams("team=ALL&mgr="), "Junhyuk")).toBe("")
  })
  it("명시적 전체·팀·다른 담당자 링크를 보존한다", () => {
    expect(initialBranchManager(new URLSearchParams("mgr="), "Junhyuk")).toBe("")
    expect(initialBranchManager(new URLSearchParams("mgr=__me"), "Junhyuk")).toBe("Junhyuk")
    expect(initialBranchManager(new URLSearchParams("mgr=__me"), "Somang")).toBe("Somang")
    expect(initialBranchManager(new URLSearchParams("team=MKT"), "Junhyuk")).toBe("")
    expect(initialBranchManager(new URLSearchParams("mgr=진소망"), "Junhyuk")).toBe("Somang")
  })
  it("개인 목표만 사용하고 과거 부서나 전사 목표를 개인에게 배분하지 않는다", () => {
    const scoped = scopeDshToManager(dsh, "문준혁")
    const deal = { team: "MKT", monthly_payments: { "2026-10": 70 }, monthly_confirmed: { "2026-10": 70 } } as unknown as BranchRevDeal
    expect(summarizeRevenue(scoped, [deal], "ALL", "M", new Date("2026-10-15T00:00:00Z"))).toEqual({ confirmed: 70, goal: 100, pacing_pct: 70 })
    expect(Object.keys(scoped.members)).toEqual(["Junhyuk"])
    expect(scoped.breakdown).toEqual([])
    expect(dsh.rows[0].annual).toBe(1000)
  })
  it("담당자나 개인 목표가 없으면 전사 목표로 넓히지 않는다", () => {
    const scoped = scopeDshToManager(dsh, UNMAPPED_BRANCH_MEMBER)
    expect(scoped.rows).toEqual([])
    expect(scoped.members).toEqual({})
    expect(scopeDshToManager(dsh)).toBe(dsh)
  })
})
