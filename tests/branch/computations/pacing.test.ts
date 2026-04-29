import { describe, it, expect } from "vitest"
import { teamPacing, memberPacing, listMembersByTeam } from "@/lib/branch/computations/pacing"
import type { DshOutput } from "@/lib/branch/parsers/dsh"

const dsh: DshOutput = {
  rows: [
    { level: "team", team: "BD", kind: "goal", annual: 100, quarters: [25,25,25,25], months: { "2026-04": 8 } },
    { level: "team", team: "BD", kind: "status", annual: 50, quarters: [50,0,0,0], months: { "2026-04": 12 } },
    { level: "member", team: "BD", member: "Han", kind: "goal", annual: 40, quarters: [10,10,10,10], months: { "2026-04": 3 } },
    { level: "member", team: "BD", member: "Han", kind: "status", annual: 25, quarters: [25,0,0,0], months: { "2026-04": 5 } },
  ],
  members: { Han: "BD" },
}

describe("pacing", () => {
  const now = new Date("2026-05-15T00:00:00Z")
  it("teamPacing yearly", () => { expect(teamPacing(dsh, "BD", "Y", now)).toEqual({ goal: 100, status: 50, pacing_pct: 50 }) })
  it("teamPacing quarter Q1", () => { expect(teamPacing(dsh, "BD", "Q", now)).toEqual({ goal: 25, status: 50, pacing_pct: 200 }) })
  it("memberPacing reports team", () => { expect(memberPacing(dsh, "Han", "Y", now).team).toBe("BD") })
  it("listMembersByTeam", () => { expect(listMembersByTeam(dsh, "BD")).toEqual(["Han"]) })
})
