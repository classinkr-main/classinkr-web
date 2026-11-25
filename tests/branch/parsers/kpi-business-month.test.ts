// selectKpiRows 의 '이번 달·분기'는 KST 영업일 기준(F-10) — 12/1 00:05 KST 는 12월 KPI 를 고른다.
import { describe, expect, it } from "vitest"
import { selectKpiRows, type KpiBlocks, type KpiRow } from "@/lib/branch/parsers/kpi"

const member = (name: string, goal: number): KpiRow => ({
  member: name,
  pairs: {
    LD: { goal, actual: 0 },
    ACC: { goal: 0, actual: 0 },
    OPP: { goal: 0, actual: 0 },
    SOL: { goal: 0, actual: 0 },
    VST: { goal: 0, actual: 0 },
  },
})

const blocks: KpiBlocks = {
  fy: [member("예시A", 999)],
  months: { 11: [member("예시A", 11)], 12: [member("예시A", 12)], 1: [member("예시A", 1)] },
}

describe("selectKpiRows — KST 영업월", () => {
  it("월: 2026-11-30T15:05Z(12/1 00:05 KST)는 12월, 14:59Z 는 11월", () => {
    expect(selectKpiRows(blocks, "M", new Date("2026-11-30T15:05:00Z"))[0].pairs.LD.goal).toBe(12)
    expect(selectKpiRows(blocks, "M", new Date("2026-11-30T14:59:00Z"))[0].pairs.LD.goal).toBe(11)
  })

  it("분기: 2026-12-31T15:05Z(1/1 00:05 KST)는 4분기(1~3월)", () => {
    expect(selectKpiRows(blocks, "Q", new Date("2026-12-31T15:05:00Z"))[0].pairs.LD.goal).toBe(1)
    expect(selectKpiRows(blocks, "Q", new Date("2026-12-31T14:59:00Z"))[0].pairs.LD.goal).toBe(23)
  })
})
