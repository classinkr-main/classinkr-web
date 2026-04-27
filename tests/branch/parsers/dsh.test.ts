import { describe, it, expect } from "vitest"
import fixture from "../fixtures/dsh-sample.json"
import { parseDsh } from "@/lib/branch/parsers/dsh"
import type { FormattedCell } from "@/lib/branch/google-sheets"

const grid = fixture as unknown as FormattedCell[][]

describe("parseDsh", () => {
  it("produces exactly two rows: team=ALL goal and team=ALL status", () => {
    const { rows, members } = parseDsh(grid, 2026)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ level: "team", team: "ALL", kind: "goal" })
    expect(rows[1]).toMatchObject({ level: "team", team: "ALL", kind: "status" })
    // No member info comes from DSH
    expect(Object.keys(members)).toHaveLength(0)
  })

  it("aggregates Goal rows correctly", () => {
    const { rows } = parseDsh(grid, 2026)
    const goal = rows.find((r) => r.kind === "goal")!
    // Fixture has two Goal rows: 60M + 60M = 120M annual
    expect(goal.annual).toBe(120000000)
    expect(goal.quarters[0]).toBe(30000000)
    expect(goal.months["2026-04"]).toBe(10000000)
  })

  it("aggregates Status rows correctly", () => {
    const { rows } = parseDsh(grid, 2026)
    const status = rows.find((r) => r.kind === "status")!
    // Fixture has two Status rows: 40M + 20M = 60M annual
    expect(status.annual).toBe(60000000)
    expect(status.quarters[0]).toBe(60000000)
    expect(status.months["2026-04"]).toBe(22000000)
  })
})
