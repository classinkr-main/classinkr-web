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
      const cells: FormattedCell[] = Array(23).fill(empty).map(() => ({ value: "", bg: null }))
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

  it("normalizes confirmed CSM placeholder names", () => {
    const empty: FormattedCell = { value: "", bg: null }
    const row = (values: Record<number, string | number>): FormattedCell[] => {
      const cells: FormattedCell[] = Array(23).fill(empty).map(() => ({ value: "", bg: null }))
      for (const [idx, value] of Object.entries(values)) cells[Number(idx)] = { value, bg: null }
      return cells
    }
    const gridWithMembers: FormattedCell[][] = [
      row({ 10: 4 }),
      row({ 0: "CSM", 1: "Goal", 5: 20, 10: 2 }),
      row({ 1: "Status", 5: 10, 10: 1 }),
      row({ 3: "Somang", 4: "Goal", 5: 8, 10: 1 }),
      row({ 4: "Status", 5: 4, 10: 1 }),
      row({ 3: "New 2", 4: "Goal", 5: 12, 10: 1 }),
      row({ 4: "Status", 5: 6, 10: 0 }),
    ]

    const out = parseDsh(gridWithMembers, 2026)
    expect(out.members).toEqual({ Somang: "CSM", Minjae: "CSM" })
    expect(out.rows.find((r) => r.level === "member" && r.member === "Minjae" && r.kind === "goal")).toMatchObject({
      team: "CSM",
      annual: 12,
    })
  })

  // 실측: '1. DSH'의 Hardware Renew 행은 채널 열(E)이 공란이다. 예전 로직은
  // `!chan`이면 통째로 버려서 breakdown에서 이 조합이 아예 누락됐다(연간 1,358,156 =
  // 전사 목표의 13.6%). 채널 공란이어도 cat/stat이 유효하면 "(미구분)"으로 채택해야 한다.
  describe("breakdown: blank channel column", () => {
    const empty: FormattedCell = { value: "", bg: null }
    const row = (values: Record<number, string | number>): FormattedCell[] => {
      const cells: FormattedCell[] = Array(13).fill(empty).map(() => ({ value: "", bg: null }))
      for (const [idx, value] of Object.entries(values)) cells[Number(idx)] = { value, bg: null }
      return cells
    }

    it("accepts a Hardware/Renew row with a blank channel as \"(미구분)\"", () => {
      const grid: FormattedCell[][] = [
        row({ 10: 4, 11: 5, 12: 6 }), // header: month cols 4,5,6 at DSH_COLS.monthStart(10)..
        row({ 1: "Goal", 2: "Hardware", 3: "Renew", 5: 10000000, 6: 2500000, 9: 2500000, 10: 1000000 }), // col4(channel) blank
        row({ 1: "Status", 2: "Hardware", 3: "Renew", 5: 5000000, 6: 5000000, 9: 0, 10: 2000000 }), // col4(channel) blank
      ]
      const { breakdown } = parseDsh(grid, 2026)
      expect(breakdown).toBeDefined()
      const goalRow = breakdown!.find((b) => b.kind === "goal" && b.category === "Hardware" && b.status_type === "Renew")
      const statusRow = breakdown!.find((b) => b.kind === "status" && b.category === "Hardware" && b.status_type === "Renew")
      expect(goalRow?.channel).toBe("(미구분)")
      expect(goalRow?.annual).toBe(10000000)
      expect(statusRow?.channel).toBe("(미구분)")
      expect(statusRow?.annual).toBe(5000000)
    })

    it("still drops a row whose channel is a non-blank, unrecognized value", () => {
      const grid: FormattedCell[][] = [
        row({ 10: 4 }),
        row({ 1: "Goal", 2: "Software", 3: "New", 4: "TBD", 5: 999 }),
      ]
      const { breakdown } = parseDsh(grid, 2026)
      expect(breakdown!.some((b) => b.category === "Software" && b.status_type === "New")).toBe(false)
    })

    it("still parses ordinary Direct/Channel rows unchanged", () => {
      const grid: FormattedCell[][] = [
        row({ 10: 4 }),
        row({ 1: "Goal", 2: "Software", 3: "New", 4: "Direct", 5: 1000 }),
        row({ 1: "Goal", 2: "Software", 3: "New", 4: "Channel", 5: 2000 }),
      ]
      const { breakdown } = parseDsh(grid, 2026)
      expect(breakdown!.find((b) => b.channel === "Direct")?.annual).toBe(1000)
      expect(breakdown!.find((b) => b.channel === "Channel")?.annual).toBe(2000)
    })
  })
})
