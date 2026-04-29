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
    expect(Object.keys(members)).toHaveLength(0)
  })

  it("aggregates Goal rows correctly", () => {
    const { rows } = parseDsh(grid, 2026)
    const goal = rows.find((r) => r.kind === "goal")!
    expect(goal.annual).toBe(120000000)
    expect(goal.quarters[0]).toBe(30000000)
    expect(goal.months["2026-04"]).toBe(10000000)
  })

  it("aggregates Status rows correctly", () => {
    const { rows } = parseDsh(grid, 2026)
    const status = rows.find((r) => r.kind === "status")!
    expect(status.annual).toBe(60000000)
    expect(status.quarters[0]).toBe(60000000)
    expect(status.months["2026-04"]).toBe(22000000)
  })

  it("extracts a breakdown array", () => {
    const out = parseDsh(fixture as never, 2026)
    expect(Array.isArray(out.breakdown)).toBe(true)
  })

  it("maps member summary rows to teams by matching team goal totals", () => {
    const empty: FormattedCell = { value: "", bg: null }
    const row = (values: Record<number, string | number>): FormattedCell[] => {
      const cells = Array(23).fill(empty).map(() => ({ value: "", bg: null }))
      for (const [idx, value] of Object.entries(values)) cells[Number(idx)] = { value, bg: null }
      return cells
    }
    const gridWithMembers: FormattedCell[][] = [
      row({ 10: 4 }),
      row({ 0: "BD", 1: "Goal", 5: 100, 10: 10 }),
      row({ 1: "Status", 5: 40, 10: 4 }),
      row({ 0: "MKT", 1: "Goal", 5: 80, 10: 8 }),
      row({ 1: "Status", 5: 20, 10: 2 }),
      row({ 3: "Han", 4: "Goal", 5: 60, 10: 6 }),
      row({ 4: "Status", 5: 25, 10: 2 }),
      row({ 3: "Mira", 4: "Goal", 5: 40, 10: 4 }),
      row({ 4: "Status", 5: 15, 10: 2 }),
      row({ 3: "Heesung", 4: "Goal", 5: 80, 10: 8 }),
      row({ 4: "Status", 5: 20, 10: 2 }),
    ]

    const out = parseDsh(gridWithMembers, 2026)
    expect(out.members).toEqual({ Han: "BD", Mira: "BD", Heesung: "MKT" })
    expect(out.rows.find((r) => r.level === "member" && r.member === "Han" && r.kind === "goal")).toMatchObject({
      team: "BD",
      annual: 60,
    })
    expect(out.rows.find((r) => r.level === "member" && r.member === "Han" && r.kind === "status")).toMatchObject({
      team: "BD",
      annual: 25,
    })
  })
})
