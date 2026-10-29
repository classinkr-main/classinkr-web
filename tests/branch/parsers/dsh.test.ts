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

  // 실측('1. DSH' FY26-27, 2026-10-28 감사): Team KR 블록의 Status 구간에만 "Software Sum"(시트 row 11)·
  // "Hardware Sum"(row 16) 소계 행이 있다. 예전 1차 루프는 kind 아래 숫자 행을 전부 누적해 구성 행과
  // 소계를 둘 다 더했고, Team KR(ALL) Status가 정확히 2배(시트 ¥2,502,976 → 미러 ¥5,005,951)가 돼
  // 장부 DSH 렌즈의 Team KR 달성률이 25%가 아니라 50%로 보였다. BD/MKT/CSM·멤버·ALL Goal은 정확했다.
  describe("Sum subtotal rows inside the Team KR Status block", () => {
    const row = (values: Record<number, string | number>): FormattedCell[] => {
      const cells: FormattedCell[] = Array.from({ length: 23 }, () => ({ value: "", bg: null }))
      for (const [idx, value] of Object.entries(values)) cells[Number(idx)] = { value, bg: null }
      return cells
    }
    // F=Year, G~J=Q1~Q4, K~V=4월~3월(헤더는 월 숫자만). 열 인덱스는 DSH_COLS와 같다.
    const header = row({ 0: "FY26-27", 5: "Year", 6: "Q1", 7: "Q2", 8: "Q3", 9: "Q4", 10: 4, 11: 5, 12: 6, 13: 7, 14: 8, 15: 9, 16: 10, 17: 11, 18: 12, 19: 1, 20: 2, 21: 3, 22: "Ratio" })
    // 연간 전액을 한 분기·한 달에 몰아 넣는 행 빌더 — 분기·월 2중 계상도 같은 테스트로 잡는다.
    const amount = (annual: number, quarter: 0 | 1 | 2 | 3, monthCol: number) => ({ 5: annual, [6 + quarter]: annual, [monthCol]: annual })

    // Team KR 블록 — Goal(소계 없음) + Status(Software Sum / Hardware Sum 소계 포함). C·D·E는 시트처럼
    // 병합 셀이라 첫 행에만 값이 있고, Hardware Renew는 채널 열이 공란이다.
    const goalRows: FormattedCell[][] = [
      row({ 1: "Goal", 2: "Software", 3: "New", 4: "Direct", ...amount(3_000_000, 0, 10) }),
      row({ 4: "Channel", ...amount(2_000_000, 0, 10) }),
      row({ 3: "Renew", 4: "Direct", ...amount(1_500_000, 1, 13) }),
      row({ 4: "Channel", ...amount(1_000_000, 1, 13) }),
      row({ 2: "Hardware", 3: "New", 4: "Direct", ...amount(1_200_000, 2, 16) }),
      row({ 4: "Channel", ...amount(800_000, 2, 16) }),
      row({ 3: "Renew", ...amount(500_000, 3, 19) }),
    ]
    const softwareStatusRows: FormattedCell[][] = [
      row({ 1: "Status", 2: "Software", 3: "New", 4: "Direct", ...amount(400_000, 0, 10) }),
      row({ 4: "Channel", ...amount(300_000, 0, 10) }),
      row({ 3: "Renew", 4: "Direct", ...amount(166_056, 0, 10) }),
      row({ 4: "Channel", ...amount(100_000, 1, 13) }),
    ]
    const softwareSum = row({ 3: "Sum", 5: 966_056, 6: 866_056, 7: 100_000, 10: 866_056, 13: 100_000 })
    const hardwareStatusRows: FormattedCell[][] = [
      row({ 2: "Hardware", 3: "New", 4: "Direct", ...amount(800_000, 0, 10) }),
      row({ 4: "Channel", ...amount(500_000, 0, 10) }),
      row({ 3: "Renew", ...amount(236_920, 2, 16) }),
    ]
    const hardwareSum = row({ 3: "Sum", 5: 1_536_920, 6: 1_300_000, 8: 236_920, 10: 1_300_000, 16: 236_920 })

    const teamBlocks: FormattedCell[][] = [
      row({ 0: "BD", 1: "Goal", ...amount(5_000_000, 0, 10) }),
      row({ 1: "Status", ...amount(1_300_000, 0, 10) }),
      row({ 0: "MKT", 1: "Goal", ...amount(3_000_000, 0, 10) }),
      row({ 1: "Status", ...amount(800_000, 0, 10) }),
      row({ 0: "CSM", 1: "Goal", ...amount(2_000_000, 0, 10) }),
      row({ 1: "Status", ...amount(402_976, 0, 10) }),
    ]
    const memberBlocks: FormattedCell[][] = [
      row({ 0: "Member" }), // 팀이 아닌 라벨 → 1차 루프의 팀 누적이 끝난다
      row({ 3: "Han", 4: "Goal", ...amount(3_000_000, 0, 10) }),
      row({ 4: "Status", ...amount(700_000, 0, 10) }),
      row({ 3: "Wangchan", 4: "Goal", ...amount(2_000_000, 0, 10) }),
      row({ 4: "Status", ...amount(600_000, 0, 10) }),
      row({ 3: "Heesung", 4: "Goal", ...amount(3_000_000, 0, 10) }),
      row({ 4: "Status", ...amount(800_000, 0, 10) }),
      row({ 3: "Somang", 4: "Goal", ...amount(2_000_000, 0, 10) }),
      row({ 4: "Status", ...amount(402_976, 0, 10) }),
    ]

    const buildGrid = (withSums: boolean): FormattedCell[][] => [
      header,
      row({ 0: "Team KR", 1: "Total", 5: 10_000_000 }),
      ...goalRows,
      ...softwareStatusRows,
      ...(withSums ? [softwareSum] : []),
      ...hardwareStatusRows,
      ...(withSums ? [hardwareSum] : []),
      ...teamBlocks,
      ...memberBlocks,
    ]

    const sumOf = (rowsToSum: FormattedCell[][]) => {
      const total = { annual: 0, quarters: [0, 0, 0, 0], months: {} as Record<string, number> }
      const monthKeys = ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03"]
      for (const ym of monthKeys) total.months[ym] = 0
      for (const cells of rowsToSum) {
        total.annual += Number(cells[5].value || 0)
        for (let q = 0; q < 4; q++) total.quarters[q] += Number(cells[6 + q].value || 0)
        monthKeys.forEach((ym, i) => { total.months[ym] += Number(cells[10 + i].value || 0) })
      }
      return total
    }

    const teamRow = (out: ReturnType<typeof parseDsh>, team: string, kind: "goal" | "status") =>
      out.rows.find((r) => r.level === "team" && r.team === team && r.kind === kind)!

    it("counts Team KR Status once: equals the sum of the component rows, not components + Sum", () => {
      const out = parseDsh(buildGrid(true), 2026)
      const expected = sumOf([...softwareStatusRows, ...hardwareStatusRows])
      const status = teamRow(out, "ALL", "status")
      expect(status.annual).toBe(2_502_976) // 감사 시점 시트 Team KR Status Total — 예전 파서는 5,005,952
      expect(status).toMatchObject(expected)
      expect(status.quarters).toEqual([2_166_056, 100_000, 236_920, 0])
      expect(status.months["2026-10"]).toBe(236_920)
    })

    it("produces the same team/member rows as the same sheet without the Sum rows", () => {
      const withSums = parseDsh(buildGrid(true), 2026)
      const withoutSums = parseDsh(buildGrid(false), 2026)
      expect(withSums.rows).toEqual(withoutSums.rows)
      expect(withSums.members).toEqual(withoutSums.members)
      // breakdown은 비교하지 않는다 — 이 픽스처의 BD/MKT/CSM 행은 C·D가 공란이라 2차 루프의
      // 캐리포워드가 Sum 유무에 따라 다르게 처리한다(소계 뒤에서는 prevStatus="Sum"이라 버림).
      // 실제 시트의 팀 블록은 Software/Hardware × New/Renew 행을 명시해 이 차이가 생기지 않는다.
    })

    it("leaves ALL Goal, BD/MKT/CSM team rows, and member rows unchanged", () => {
      const out = parseDsh(buildGrid(true), 2026)
      expect(teamRow(out, "ALL", "goal")).toMatchObject(sumOf(goalRows))
      expect(teamRow(out, "ALL", "goal").annual).toBe(10_000_000)
      expect(teamRow(out, "BD", "goal").annual).toBe(5_000_000)
      expect(teamRow(out, "BD", "status").annual).toBe(1_300_000)
      expect(teamRow(out, "MKT", "goal").annual).toBe(3_000_000)
      expect(teamRow(out, "MKT", "status").annual).toBe(800_000)
      expect(teamRow(out, "CSM", "goal").annual).toBe(2_000_000)
      expect(teamRow(out, "CSM", "status").annual).toBe(402_976)
      expect(out.members).toEqual({ Han: "BD", Wangchan: "BD", Heesung: "MKT", Somang: "CSM" })
      const memberStatus = out.rows.filter((r) => r.level === "member" && r.kind === "status")
      expect(memberStatus.map((r) => [r.member, r.team, r.annual])).toEqual([
        ["Han", "BD", 700_000],
        ["Wangchan", "BD", 600_000],
        ["Heesung", "MKT", 800_000],
        ["Somang", "CSM", 402_976],
      ])
    })

    it("keeps Sum rows out of the breakdown and the breakdown Status total equal to the component sum", () => {
      const { breakdown } = parseDsh(buildGrid(true), 2026)
      expect(breakdown!.some((b) => b.status_type.toLowerCase() === "sum")).toBe(false)
      const statusTotal = breakdown!.filter((b) => b.kind === "status").reduce((acc, b) => acc + b.annual, 0)
      expect(statusTotal).toBe(2_502_976)
      expect(breakdown!.filter((b) => b.kind === "status")).toHaveLength(7)
    })

    it("recognizes the subtotal label regardless of case or surrounding whitespace", () => {
      const grid: FormattedCell[][] = [
        header,
        row({ 0: "Team KR", 1: "Status", 2: "Software", 3: "New", 4: "Direct", ...amount(1_000, 0, 10) }),
        row({ 3: " SUM ", ...amount(1_000, 0, 10) }),
      ]
      const out = parseDsh(grid, 2026)
      expect(teamRow(out, "ALL", "status").annual).toBe(1_000)
    })
  })
})
