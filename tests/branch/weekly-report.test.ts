import { beforeEach, describe, expect, it, vi } from "vitest"
import type { CompassRangeFunnel } from "@/lib/compass/summary"
import type { CompassLeadSliceRow } from "@/lib/compass/bridge"
import type { CompassKrTeamResult } from "@/lib/compass/kr-team-contract"

// 본사 주간 보고 Compass 구획 — 끝난 주 경계, 팀·개인 범위, 연결 끊김을 0 실적으로 위장하지 않는지 고정한다.
const calls: Array<{ since: string; rowFilter?: (row: CompassLeadSliceRow) => boolean }> = []
let funnelFor: (since: string) => CompassRangeFunnel
let krTeam: CompassKrTeamResult = { state: "not_configured", snapshot: null }

vi.mock("@/lib/compass/summary", () => ({
  UNASSIGNED_OWNER_LABEL: "미배정",
  buildCompassRangeFunnel: vi.fn(async (range: { since: string; until: string }, options: { rowFilter?: (row: CompassLeadSliceRow) => boolean } = {}) => {
    calls.push({ since: range.since, rowFilter: options.rowFilter })
    return funnelFor(range.since)
  }),
}))
vi.mock("@/lib/compass/kr-team", () => ({ readCompassKrTeam: vi.fn(async () => krTeam) }))

import { buildBranchWeeklyCompassReport, buildKaSection, isoWeekLabel, resolveReportWeeks } from "@/lib/branch/weekly-report"

const stages = (counts: number[]) => ["new", "contact", "consult", "demo", "quote", "bd", "won"].map((key, i) => ({ key, label: key, count: counts[i] ?? 0 }))
const funnel = (over: Partial<CompassRangeFunnel>): CompassRangeFunnel => ({
  since: "", until: "", down: false, truncated: false, inflowTotal: 0, stages: stages([]), lost: 0, won: 0, neoRegistered: 0, byOwner: [], lostReasons: [], ...over,
})
const row = (owner: string | null, caller: string | null = null) => ({ owner, caller } as CompassLeadSliceRow)
const deals = [
  { manager: "Heesung", team: "MKT" }, { manager: "Han", team: "BD" }, { manager: "Han", team: "BD" },
] as unknown as Parameters<typeof buildBranchWeeklyCompassReport>[0]["deals"]

beforeEach(() => {
  calls.length = 0
  krTeam = { state: "not_configured", snapshot: null }
  funnelFor = (since) => since.startsWith("2026-11-16")
    ? funnel({ inflowTotal: 12, stages: stages([12, 8, 5, 3, 2, 1, 1]), lost: 2, byOwner: [
        { owner: "신희성", total: 7, demo: 2, bd: 1, won: 1, lost: 1 }, { owner: "미배정", total: 5, demo: 0, bd: 0, won: 0, lost: 1 },
      ], lostReasons: [{ key: "가격", label: "가격", count: 2 }] })
    : funnel({ inflowTotal: 9, stages: stages([9, 6, 4, 2, 1, 0, 0]), lost: 1 })
})

describe("보고 주 경계", () => {
  it("오늘이 속한 주의 바로 앞 월~일을 보고 주로, 그 앞 주를 비교 주로 잡는다(KST)", () => {
    // 2026-11-25(수) 10:00 KST — 이번 주 월요일은 11-23
    const { week, previousWeek } = resolveReportWeeks(new Date("2026-11-25T01:00:00Z"))
    expect([week.startDate, week.endDate]).toEqual(["2026-11-16", "2026-11-22"])
    expect([previousWeek.startDate, previousWeek.endDate]).toEqual(["2026-11-09", "2026-11-15"])
    expect(week.since).toBe("2026-11-16T00:00+09:00")
    expect(week.until).toBe("2026-11-23T00:00+09:00")
    expect(week.label).toBe("2026 W47")
  })
  it("월요일 0시(KST)에는 막 끝난 주가 보고 주가 된다", () => {
    const { week } = resolveReportWeeks(new Date("2026-11-22T15:30:00Z")) // 11-23(월) 00:30 KST
    expect(week.startDate).toBe("2026-11-16")
    const sunday = resolveReportWeeks(new Date("2026-11-22T14:30:00Z")) // 11-22(일) 23:30 KST
    expect(sunday.week.startDate).toBe("2026-11-09")
  })
  it("ISO 주 번호는 그 주 목요일의 해를 따른다", () => {
    expect(isoWeekLabel("2026-12-28")).toBe("2026 W53")
    expect(isoWeekLabel("2027-01-04")).toBe("2027 W01")
  })
})

describe("Compass 주간 구획", () => {
  const now = new Date("2026-11-25T01:00:00Z")

  it("전체 범위는 필터 없이 세고, 지난 주·그 전 주와 미배정을 함께 싣는다", async () => {
    const report = await buildBranchWeeklyCompassReport({ now, team: "ALL", deals })
    expect(calls.every((call) => call.rowFilter === undefined)).toBe(true)
    expect(report.funnel.state).toBe("ready")
    expect(report.funnel.inflow).toEqual({ current: 12, previous: 9 })
    expect(report.funnel.stages[0]).toEqual({ key: "contact", label: "contact", current: 8, previous: 6 })
    expect(report.funnel.owners).toEqual([{ name: "Heesung", inflow: 7, demo: 2, bd: 1, won: 1, lost: 1 }])
    expect(report.funnel.unassigned).toBe(5)
    expect(report.evaluation.state).toBe("not_configured")
  })

  it("팀 범위는 한글 담당명을 정규화해 REV 장부의 팀으로 거르고, 미배정은 세지 않는다", async () => {
    const report = await buildBranchWeeklyCompassReport({ now, team: "MKT", deals })
    const filter = calls[0].rowFilter!
    expect(filter(row("신희성"))).toBe(true)
    expect(filter(row(null, "신희성"))).toBe(true)
    expect(filter(row("박한"))).toBe(false)
    expect(filter(row(null))).toBe(false)
    expect(report.scope.teamSource).toBe("rev_ledger")
    expect(report.funnel.unassigned).toBeNull()
  })

  it("개인 범위는 그 담당만 남긴다", async () => {
    await buildBranchWeeklyCompassReport({ now, team: "ALL", manager: "Heesung", deals })
    const filter = calls[0].rowFilter!
    expect(filter(row("신희성"))).toBe(true)
    expect(filter(row("황찬우"))).toBe(false)
  })

  it("한 주라도 연결이 끊기면 숫자를 0으로 싣지 않고 down으로 낸다", async () => {
    funnelFor = (since) => since.startsWith("2026-11-09") ? funnel({ down: true, error: "timeout" }) : funnel({ inflowTotal: 3 })
    const report = await buildBranchWeeklyCompassReport({ now, team: "ALL", deals })
    expect(report.funnel.state).toBe("down")
    expect(report.funnel.stages).toEqual([])
    expect(report.funnel.error).toBe("timeout")
  })

  it("Compass 명단이 있으면 그 팀 구분을 쓰고 평가는 달성률 낮은 순으로 범위에 맞춰 싣는다", async () => {
    const item = (label: string, rate: number | null, kind: "quant" | "qual" = "quant") => ({
      metric: label, label, weight: 1, target: 10, actual: 5, unit: "건", kind, rate, score: null, grade: null, source: "auto" as const, autoValue: null, reason: null, note: null,
    })
    krTeam = { state: "ready", snapshot: {
      version: 1, month: "2026-11", generatedAt: "2026-11-25T00:00:00Z",
      roster: [{ name: "신희성", role: "MKT", team: "MKT", evaluationOnly: false }, { name: "황찬우", role: "MKT", team: "MKT", evaluationOnly: false }, { name: "박한", role: "BD", team: "BD", evaluationOnly: false }],
      kpi: { basis: "live", closedAt: null, report: { month: "2026-11", empty: false, elapsed: 0.8, daysLeft: 5, people: [
        { name: "신희성", role: "MKT", rate: 82.4, score: 3, grade: "B", ratedWeight: 1, weightSum: 1, items: [item("콜", 40), item("데모", 90), item("후기", 10, "qual"), item("계약", 70)] },
        { name: "황찬우", role: "MKT", rate: 41.6, score: 2, grade: "C", ratedWeight: 1, weightSum: 1, items: [] },
        { name: "박한", role: "BD", rate: 10, score: 1, grade: "D", ratedWeight: 1, weightSum: 1, items: [] },
      ] } },
      revenue: { currency: "CNY", period: null, people: [] },
    } }
    const report = await buildBranchWeeklyCompassReport({ now, team: "MKT", deals: [] })
    expect(report.scope.teamSource).toBe("compass_roster")
    expect(calls[0].rowFilter!(row("황찬우"))).toBe(true)
    expect(report.evaluation.people.map((p) => [p.name, p.rate, p.grade])).toEqual([["Chanwoo", 42, "C"], ["Heesung", 82, "B"]])
    expect(report.evaluation.people[1].weakest.map((w) => w.label)).toEqual(["콜", "계약"])
  })
})

describe("KA 분기 고객", () => {
  const deal = (customer: string, importance: string | null, team: string, manager: string, payments: Record<string, number>, confirmed: Record<string, number>) => ({
    customer_name: customer, importance, team, manager, monthly_payments: payments, monthly_confirmed: confirmed, monthly_high_conf: {}, monthly_red: {},
  }) as unknown as Parameters<typeof buildKaSection>[0][number]
  const now = new Date("2026-11-25T01:00:00Z")
  const deals = [
    deal("한빛영어학원", "KA", "BD", "Han", { "2026-10": 100, "2026-11": 50, "2027-01": 999 }, { "2026-10": 100 }),
    deal(" 한빛영어학원 ", "ka", "BD", "Han", { "2026-12": 30 }, {}),
    deal("새솔수학", "KA", "MKT", "신희성", { "2026-11": 80 }, { "2026-11": 80 }),
    deal("작은학원", "SME", "BD", "Han", { "2026-11": 500 }, { "2026-11": 500 }),
  ]

  it("이번 회계 분기(10~12월) KA 딜만 고객별로 합치고 확정·미확정을 나눈다", () => {
    const ka = buildKaSection(deals, { now, team: "ALL" })
    expect(ka.quarter).toBe("FY2026-Q3")
    expect(ka.months).toEqual(["2026-10", "2026-11", "2026-12"])
    expect(ka.customers.map((c) => [c.customer, c.confirmed, c.open, c.deals])).toEqual([["한빛영어학원", 100, 80, 2], ["새솔수학", 80, 0, 1]])
    expect([ka.confirmed, ka.open, ka.customerCount]).toEqual([180, 80, 2])
  })

  it("팀·개인 범위는 REV 딜의 팀·담당(한글 별칭 포함)으로 거른다", () => {
    expect(buildKaSection(deals, { now, team: "MKT" }).customers.map((c) => c.customer)).toEqual(["새솔수학"])
    const personal = buildKaSection(deals, { now, team: "ALL", manager: "Heesung" })
    expect(personal.customers.map((c) => [c.customer, c.manager])).toEqual([["새솔수학", "Heesung"]])
  })
})
