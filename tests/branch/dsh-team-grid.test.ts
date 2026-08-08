import { describe, expect, it } from "vitest"
import { buildDshTeamGrid, dshRate } from "@/components/admin/branch/ledger/dsh-derive"
import type { BranchDshRow } from "@/components/admin/branch/types"

// DshTeamGrid의 트리 조립(buildDshTeamGrid) 검증 — summary dsh_rows(파서 DshRow 미러)를
// 팀 → 멤버 구조로 세운다. 핵심 규칙: 팀 순서 ALL→BD→MKT→CSM 고정·없는 팀 생략,
// 같은 (team|member, kind) 중복은 첫 행 채택(합산 금지 — breakdown 3중 계상과 같은 계열 방어),
// 멤버는 시트 등장 순서 보존.

function teamRow(
  team: string,
  kind: "goal" | "status",
  annual: number,
  months: Record<string, number> = {},
): BranchDshRow {
  return {
    level: "team",
    team,
    kind,
    annual,
    quarters: [annual / 4, annual / 4, annual / 4, annual / 4] as [number, number, number, number],
    months,
  }
}

function memberRow(
  team: string,
  member: string,
  kind: "goal" | "status",
  annual: number,
  months: Record<string, number> = {},
): BranchDshRow {
  return { ...teamRow(team, kind, annual, months), level: "member", member }
}

describe("buildDshTeamGrid", () => {
  it("팀 순서는 ALL → BD → MKT → CSM 고정, 시트에 없는 팀은 행 생략", () => {
    const grid = buildDshTeamGrid([
      teamRow("CSM", "goal", 300_000),
      teamRow("ALL", "goal", 1_000_000),
      teamRow("BD", "goal", 500_000),
      // MKT 없음 — 생략돼야 한다(0 합성 금지).
    ])
    expect(grid.teams.map((t) => t.team)).toEqual(["ALL", "BD", "CSM"])
  })

  it("멤버는 소속 팀 아래에 시트 등장 순서로 묶이고, 없는 kind는 null이다", () => {
    const grid = buildDshTeamGrid([
      teamRow("BD", "goal", 500_000),
      teamRow("BD", "status", 200_000),
      teamRow("CSM", "goal", 300_000),
      memberRow("BD", "철수", "goal", 300_000),
      memberRow("BD", "철수", "status", 150_000),
      memberRow("CSM", "민재", "status", 90_000), // goal 행 없는 멤버
      memberRow("BD", "영희", "goal", 200_000),
    ])
    const bd = grid.teams.find((t) => t.team === "BD")!
    expect(bd.members.map((m) => m.member)).toEqual(["철수", "영희"])
    expect(bd.members[0].goal?.annual).toBe(300_000)
    expect(bd.members[0].status?.annual).toBe(150_000)
    expect(bd.members[1].status).toBeNull()

    const csm = grid.teams.find((t) => t.team === "CSM")!
    expect(csm.members.map((m) => m.member)).toEqual(["민재"])
    expect(csm.members[0].goal).toBeNull()
    expect(csm.members[0].status?.annual).toBe(90_000)
  })

  it("같은 (team, kind)·(member, kind) 중복 행은 첫 행 채택 — 합산 금지 회귀", () => {
    const grid = buildDshTeamGrid([
      teamRow("BD", "goal", 500_000, { "2026-04": 40_000 }),
      teamRow("BD", "goal", 999_999, { "2026-04": 99_999 }), // 중복 — 무시돼야 한다
      memberRow("BD", "철수", "goal", 300_000),
      memberRow("BD", "철수", "goal", 111_111), // 중복 — 무시돼야 한다
    ])
    const bd = grid.teams.find((t) => t.team === "BD")!
    // 합산이었다면 1,499,999 — 첫 행 채택으로 500,000 유지.
    expect(bd.goal?.annual).toBe(500_000)
    expect(bd.goal?.months["2026-04"]).toBe(40_000)
    expect(bd.members[0].goal?.annual).toBe(300_000)
  })

  it("팀 행 없이 멤버만 있는 팀도 노출된다(팀 수치는 null — 시트 미기재를 합성하지 않는다)", () => {
    const grid = buildDshTeamGrid([memberRow("MKT", "지현", "goal", 120_000)])
    expect(grid.teams.map((t) => t.team)).toEqual(["MKT"])
    expect(grid.teams[0].goal).toBeNull()
    expect(grid.teams[0].members[0].goal?.annual).toBe(120_000)
  })

  it("monthKeys는 전 행 월 키의 합집합 정렬 — FY 경계(4월 시작)를 문자열 정렬로 보존", () => {
    const grid = buildDshTeamGrid([
      teamRow("ALL", "goal", 100, { "2027-01": 10, "2026-04": 20 }),
      memberRow("BD", "철수", "status", 50, { "2026-12": 5 }),
    ])
    expect(grid.monthKeys).toEqual(["2026-04", "2026-12", "2027-01"])
  })

  it("상시 달성률 열의 산식(연간 status ÷ goal)은 dshRate 규약을 그대로 따른다", () => {
    // 컴포넌트(annualRateCell)가 쓰는 산식 스모크 — goal 없으면 null("–").
    expect(dshRate(200_000, 500_000)).toBeCloseTo(40, 6)
    expect(dshRate(90_000, 0)).toBeNull()
  })
})
