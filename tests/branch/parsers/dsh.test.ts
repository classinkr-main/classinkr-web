import { describe, it, expect } from "vitest"
import fixture from "../fixtures/dsh-sample.json"
import { parseDsh } from "@/lib/branch/parsers/dsh"
import type { FormattedCell } from "@/lib/branch/google-sheets"

const grid = fixture as unknown as FormattedCell[][]

describe("parseDsh", () => {
  it("extracts team-level Goal/Status", () => {
    const { rows, members } = parseDsh(grid, 2026)
    const bdGoal = rows.find((r) => r.level === "team" && r.team === "BD" && r.kind === "goal")
    expect(bdGoal?.annual).toBe(120000000)
    expect(bdGoal?.quarters[0]).toBe(30000000)
    expect(bdGoal?.months["2026-04"]).toBe(10000000)
    expect(members.Han).toBe("BD")
  })
})
