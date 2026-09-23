// 라운드 5 B2·D-9·D-10·D-11·D-13 — DSH 카드 표 복사(TSV)와 REV 딥링크·표기 회귀 고정.
import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

import { dshMemberRevHref } from "@/components/admin/branch/ledger/DshTeamGrid"
import { dshMonthRevHref } from "@/components/admin/branch/ledger/DshMonthlyPace"
import { buildDshTeamGrid, formatDshThousands, type DshMonthlyPaceData, type DshNumbers } from "@/components/admin/branch/ledger/dsh-derive"
import {
  buildDshNumericTsvRows,
  buildDshPaceTsvRows,
  buildDshTeamTsvRows,
  dshCopyCaption,
  dshCopyMonthHeader,
} from "@/components/admin/branch/ledger/dsh-export"
import type { BranchDshRow } from "@/components/admin/branch/types"
import { toTsv } from "@/lib/export/delimited"

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8").replace(/\r\n/g, "\n")

const MONTHS = ["2026-04", "2026-05"]

function numbers(annual: number, months: Record<string, number>): DshNumbers {
  return { annual, quarters: [annual, 0, 0, 0], months }
}

describe("buildDshNumericTsvRows — 수치 그리드 현재 보기(B2)", () => {
  const rows = [
    { category: "Software", status_type: "New", channel: "Direct", ...numbers(750_400.6, { "2026-04": 500_000, "2026-05": 250_400.6 }) },
    { category: "Hardware", status_type: "Renew", channel: "(미구분)", ...numbers(250_000, { "2026-04": 250_000 }) },
  ]
  const total = numbers(1_000_400.6, { "2026-04": 750_000, "2026-05": 250_400.6 })

  it("Goal/Status: 원값 ¥ 정수(반올림) + 연간 구성비 %, 첫 행은 Team KR · Total", () => {
    const table = buildDshNumericTsvRows({ view: "status", monthKeys: MONTHS, rows, total })
    expect(table[0]).toEqual(["카테고리", "구분", "연간(¥)", "Q1(¥)", "Q2(¥)", "Q3(¥)", "Q4(¥)", "2026.4월(¥)", "2026.5월(¥)", "연간 구성비(%)"])
    expect(table[1]).toEqual(["Team KR", "Total", 1_000_401, 1_000_401, 0, 0, 0, 750_000, 250_401, 100])
    expect(table[2]).toEqual(["Software", "New · Direct", 750_401, 750_401, 0, 0, 0, 500_000, 250_401, 75])
    // 빠진 달은 0(화면 규약 — numbers.months[ym] ?? 0).
    expect(table[3][8]).toBe(0)
  })

  it("Gap은 구성비 열이 없다(화면의 '–')", () => {
    const table = buildDshNumericTsvRows({ view: "gap", monthKeys: MONTHS, rows, total })
    expect(table[0]).not.toContain("연간 구성비(%)")
    expect(table[1]).toHaveLength(2 + 5 + MONTHS.length)
  })

  it("Rate: 달성률 % 소수 1자리, 목표 없는 칸은 빈 칸", () => {
    const cell = (pct: number | null) => ({ pct, status: 0, goal: 0 })
    const rate = {
      annual: cell(83.456),
      quarters: [cell(100), cell(null), cell(null), cell(null)],
      months: { "2026-04": cell(120.04), "2026-05": cell(null) },
    }
    const table = buildDshNumericTsvRows({
      view: "rate",
      monthKeys: MONTHS,
      rows: [{ category: "Software", status_type: "New", channel: "Direct", ...rate }],
      total: rate,
    })
    expect(table[0][2]).toBe("연간(%)")
    expect(table[1]).toEqual(["Team KR", "Total", 83.5, 100, null, null, null, 120, null])
    expect(toTsv(table).split("\n")[1]).toBe("Team KR\tTotal\t83.5\t100\t\t\t\t120\t")
  })
})

describe("buildDshTeamTsvRows — 팀·멤버(접힌 멤버 포함)", () => {
  const row = (team: string, kind: "goal" | "status", annual: number, member?: string): BranchDshRow => ({
    level: member ? "member" : "team",
    team,
    ...(member ? { member } : {}),
    kind,
    annual,
    quarters: [annual, 0, 0, 0],
    months: { "2026-04": annual },
  })
  const grid = buildDshTeamGrid([
    row("ALL", "goal", 1_000_000),
    row("ALL", "status", 800_000),
    row("BD", "goal", 400_000),
    row("BD", "status", 500_000),
    row("BD", "goal", 200_000, "Minjae"),
  ])

  it("팀 행 다음에 멤버 행, 연간 달성률은 뷰와 무관하게 상시", () => {
    const table = buildDshTeamTsvRows(grid, "status")
    expect(table[0].slice(0, 4)).toEqual(["팀", "멤버", "연간 달성률(%)", "연간(¥)"])
    expect(table[1].slice(0, 4)).toEqual(["Team KR", null, 80, 800_000])
    expect(table[2].slice(0, 4)).toEqual(["BD", null, 125, 500_000])
    // 멤버는 실적 행이 없어 Status 뷰 금액이 전부 빈 칸, 달성률도 판정 불가(목표만 있음 → 0%).
    expect(table[3][0]).toBe("BD")
    expect(table[3][1]).toBe("Minjae")
    expect(table[3][2]).toBe(0)
    expect(table[3].slice(3).every((value) => value === null)).toBe(true)
  })

  it("Rate 뷰는 칸마다 달성률 %", () => {
    const table = buildDshTeamTsvRows(grid, "rate")
    expect(table[0][3]).toBe("연간(%)")
    expect(table[1][3]).toBe(80)
    expect(table[1][table[1].length - 1]).toBe(80)
  })
})

describe("buildDshPaceTsvRows — 월별 페이스", () => {
  const pace: DshMonthlyPaceData = {
    annual: { goal: 200, status: 50, gap: -150, pct: 25 },
    months: [
      { ym: "2026-09", goal: 100, status: 50, gap: -50, pct: 50, cumGoal: 100, cumStatus: 50, cumPct: 50, isCurrent: true, isFuture: false },
      { ym: "2026-10", goal: 100, status: 0, gap: -100, pct: 0, cumGoal: 200, cumStatus: 50, cumPct: 25, isCurrent: false, isFuture: true },
    ],
  }

  it("당월 머리 표시, 아직 안 온 달의 실적 0 달성률은 빈 칸(누적 달성률은 값 유지)", () => {
    const table = buildDshPaceTsvRows(pace)
    expect(table[0]).toEqual(["구분", "단위", "2026.9월(당월)", "2026.10월"])
    expect(table[4]).toEqual(["달성률", "%", 50, null])
    expect(table[7]).toEqual(["누적 달성률", "%", 50, 25])
    expect(table[3]).toEqual(["Gap", "¥", -50, -100])
  })
})

describe("표기·캡션(D-10·D-11·D-13)", () => {
  it("formatDshThousands는 -0을 찍지 않는다", () => {
    expect(formatDshThousands(-400)).toBe("0")
    expect(formatDshThousands(-600)).toBe("-1")
    expect(formatDshThousands(Number.NaN)).toBe("0")
  })

  it("캡션은 빈 항목을 빼고 ' · '로 잇는다", () => {
    expect(dshCopyCaption(["DSH", null, "", false, "단위 ¥"])).toBe("DSH · 단위 ¥")
    expect(dshCopyMonthHeader("2027-01", "(¥)")).toBe("2027.1월(¥)")
  })

  it("세 카드 모두 '표 복사' 버튼을 달고, 단위는 ¥천, 당월 표기는 한글", () => {
    for (const path of [
      "components/admin/branch/ledger/DshNumericGrid.tsx",
      "components/admin/branch/ledger/DshTeamGrid.tsx",
      "components/admin/branch/ledger/DshMonthlyPace.tsx",
    ]) {
      const source = read(path)
      expect(source, path).toContain("<CopyTableButton")
      expect(source, path).toContain("(단위: ¥천")
      expect(source, path).not.toContain("(단위: 천")
    }
    const pace = read("components/admin/branch/ledger/DshMonthlyPace.tsx")
    expect(pace).toContain("당월")
    expect(pace).not.toContain("今")
  })

  it("워크벤치는 세 카드에 DSH 원천(기준 시각)을 넘긴다", () => {
    const workbench = read("components/admin/branch/SalesLedgerWorkbench.tsx")
    expect(workbench.match(/dataSource=\{summary\.data\?\.data_sources\?\.dsh \?\? null\}/g)?.length).toBeGreaterThanOrEqual(4)
  })
})

describe("DSH → REV 딥링크(D-9)", () => {
  it("멤버 행: 담당자 필터(mgr) + REV가 받는 팀만", () => {
    const url = new URL(dshMemberRevHref("BD", "Minjae"), "https://x")
    expect(url.pathname).toBe("/admin/branch/ledger")
    expect(url.searchParams.get("lens")).toBe("rev")
    expect(url.searchParams.get("team")).toBe("BD")
    expect(url.searchParams.get("mgr")).toBe("Minjae")
    expect(new URL(dshMemberRevHref("ALL", "Han"), "https://x").searchParams.has("team")).toBe(false)
    expect(new URL(dshMemberRevHref("HQ", "Han"), "https://x").searchParams.has("team")).toBe(false)
  })

  it("월 머리: 월 기간(period=M)으로 그 달", () => {
    const url = new URL(dshMonthRevHref("2026-09"), "https://x")
    expect(url.searchParams.get("period")).toBe("M")
    expect(url.searchParams.get("month")).toBe("2026-09")
  })
})
