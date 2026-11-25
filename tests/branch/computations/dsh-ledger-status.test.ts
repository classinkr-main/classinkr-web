import { describe, expect, it } from "vitest"

import {
  aggregateDshTotals,
  buildDshTeamGrid,
  deriveDshProgress,
  deriveDshSegments,
  dshTotalsFromRows,
} from "@/components/admin/branch/ledger/dsh-derive"
import {
  aggregateLedgerDshStatus,
  buildDshAccountHints,
  classifyDshDeal,
  dshLedgerConfirmed,
  dshMonthKeys,
  dshSheetCompareFor,
  spliceDshNumbers,
  spliceDshWithLedger,
  type DshLedgerClassifyContext,
  type DshLedgerDeal,
} from "@/lib/branch/computations/dsh-ledger-status"
import { dedupeDshByKind } from "@/lib/branch/dsh-dedupe"
import { scopeDshToManager } from "@/lib/branch/personal-scope"
import { dshFixture, FY, FY_KEYS, ledgerEntry, mergedDeals } from "../helpers/dsh-ledger-fixture"

// DSH 실적을 장부에서(D4) — 순수 규칙. 숫자는 design-3 프로토타입(실제 파서·파생 함수로 돌린 값)과 같다.

const LOCK = { lockedAt: "2026-12-01", lockMonth: "2026-12" }
const DEC20 = new Date("2026-12-20T03:00:00Z")
const JAN20 = new Date("2027-01-20T03:00:00Z")

function splice(today = "2026-12-20", deals = mergedDeals([], today)) {
  return spliceDshWithLedger({ dsh: dshFixture(), deals, fiscalYear: FY, today, ...LOCK })
}

function sheetDeal(overrides: Partial<DshLedgerDeal>): DshLedgerDeal {
  return {
    id: "s",
    customer_name: "예시학원",
    manager: "예시A",
    deal_type: "Direct",
    status: null,
    first_payment: null,
    product_version: null,
    monthly_payments: {},
    monthly_red: {},
    monthly_confirmed: {},
    monthly_high_conf: {},
    raw: {},
    ...overrides,
  }
}

const ledgerDeal = (overrides: Partial<DshLedgerDeal>) =>
  sheetDeal({ deal_type: null, ...overrides, raw: { ledgerDeal: { origin: "entry", kind: "new-row" }, ...(overrides.raw ?? {}) } })

function context(sheetCombos: string[], deals: DshLedgerDeal[] = []): DshLedgerClassifyContext {
  return { fiscalYear: FY, sheetCombos: new Set(sheetCombos), ...buildDshAccountHints(deals) }
}

describe("classifyDshDeal — SW/HW × New/Renew × Direct/Channel", () => {
  const combos = ["Software|New|Direct", "Software|Renew|Direct", "Hardware|Renew|(미구분)"]

  it("SW/HW: 저장된 hardware 가 SW 상품명을 이긴다 · 상품명 분류기 · 빈 값은 SW", () => {
    const ctx = context(combos)
    expect(classifyDshDeal(sheetDeal({ product_version: "ClassIn 연간 구독", raw: { productCategory: "hardware" } }), ctx).category).toBe("Hardware")
    expect(classifyDshDeal(sheetDeal({ product_version: "전자칠판 75 IFP" }), ctx).category).toBe("Hardware")
    expect(classifyDshDeal(sheetDeal({ product_version: "ClassIn 연간 구독" }), ctx).category).toBe("Software")
    expect(classifyDshDeal(sheetDeal({ product_version: "" }), ctx).category).toBe("Software")
  })

  it("New/Renew: REV Status 가 먼저 — 첫 결제일이 이번 회계연도여도 Renew 는 Renew", () => {
    const ctx = context(combos)
    expect(classifyDshDeal(sheetDeal({ status: "Renew", first_payment: "2026-06-03" }), ctx).statusType).toBe("Renew")
    expect(classifyDshDeal(sheetDeal({ status: "신규", first_payment: "2020-01-01" }), ctx).statusType).toBe("New")
  })

  it("Status 가 없으면 첫 결제일 ≥ 회계연도 4/1 이 New · 시트 행에 첫 결제일도 없으면 Renew", () => {
    const ctx = context(combos)
    expect(classifyDshDeal(sheetDeal({ first_payment: "2026-04-01" }), ctx).statusType).toBe("New")
    expect(classifyDshDeal(sheetDeal({ first_payment: "2026-03-31" }), ctx).statusType).toBe("Renew")
    expect(classifyDshDeal(sheetDeal({ first_payment: "2026/4/2" }), ctx).statusType).toBe("New")
    const blank = classifyDshDeal(sheetDeal({}), ctx)
    expect(blank.statusType).toBe("Renew")
    expect(blank.inferredStatus).toBe(false)
  })

  it("장부 새 행: 같은 거래처의 시트 첫 결제일로 판정하고, 처음 보는 거래처면 New — 둘 다 추정으로 센다", () => {
    const sheet = sheetDeal({ id: "s1", customer_name: "예시학원 2", first_payment: "2025-05-01", deal_type: "Channel" })
    const ctx = context([...combos, "Software|Renew|Channel"], [sheet])
    const known = classifyDshDeal(ledgerDeal({ customer_name: "예시학원2" }), ctx)
    expect(known).toMatchObject({ statusType: "Renew", channel: "Channel", inferredStatus: true, inferredChannel: false })
    const fresh = classifyDshDeal(ledgerDeal({ customer_name: "예시학원99" }), ctx)
    expect(fresh).toMatchObject({ statusType: "New", channel: "(미구분)", inferredStatus: true, inferredChannel: true })
  })

  it("채널: Type 이 아니면 (미구분) · 시트에 그 조합이 없고 (미구분) 조합이 있으면 (미구분)으로 맞춘다", () => {
    const ctx = context(combos)
    const unknown = classifyDshDeal(ledgerDeal({ deal_type: "갱신", status: "New" }), ctx)
    expect(unknown).toMatchObject({ channel: "(미구분)", inferredChannel: true })
    const hwRenewChannel = sheetDeal({ status: "Renew", deal_type: "Channel", product_version: "전자칠판 75 IFP" })
    expect(classifyDshDeal(hwRenewChannel, ctx).channel).toBe("(미구분)")
    // 시트에 (미구분) 조합이 없으면 맞추지 않는다(목표 없는 Channel 조합이 그대로 생긴다).
    expect(classifyDshDeal(hwRenewChannel, context(["Software|New|Direct"])).channel).toBe("Channel")
    // 시트 행의 Type 공란은 추정 건수가 아니다(장부 새 행만 센다).
    expect(classifyDshDeal(sheetDeal({ deal_type: null }), ctx).inferredChannel).toBe(false)
  })
})

describe("dshLedgerConfirmed — 장부 매출 한 정의의 확정", () => {
  it("확정만 센다 · 환불(음수)은 그대로 빠진다 · 예정은 0", () => {
    const deals = mergedDeals()
    const byId = new Map(deals.map((deal) => [deal.id, deal]))
    expect(dshLedgerConfirmed(byId.get("d1")!, "2026-12", "2026-12-20")).toBe(22_000)
    expect(dshLedgerConfirmed(byId.get("d5")!, "2026-12", "2026-12-20")).toBe(-3_000)
    const forecast = deals.find((deal) => deal.customer_name === "예시학원7")!
    expect(dshLedgerConfirmed(forecast, "2026-12", "2026-12-20")).toBe(0)
  })
})

describe("aggregateLedgerDshStatus — 12월(프로토타입 수치)", () => {
  const dsh = dshFixture()
  const deduped = dedupeDshByKind(dsh.breakdown ?? [])
  const sheetCombos = new Set([...deduped.goal.keys(), ...deduped.status.keys()])
  const status = aggregateLedgerDshStatus(
    mergedDeals([ledgerEntry({ id: "e-nov", customer: "예시학원8", manager: "예시A", month: "2026-11", amount: 99_999 })]),
    { fiscalYear: FY, months: FY_KEYS.filter((ym) => ym >= "2026-12"), members: dsh.members, sheetCombos, today: "2026-12-20" },
  )
  const dec = (series: Record<string, number> | undefined) => series?.["2026-12"] ?? 0

  it("조합: SW New Direct 28,000 · SW Renew Direct 12,000 · HW Renew (미구분) 8,000 · SW New (미구분) 9,000", () => {
    expect(Object.fromEntries([...status.byCombo].map(([key, series]) => [key, dec(series.months)]))).toEqual({
      "Software|New|Direct": 28_000,
      "Software|Renew|Direct": 12_000,
      "Hardware|Renew|(미구분)": 8_000,
      "Software|New|(미구분)": 9_000,
    })
    expect(dec(status.total)).toBe(57_000)
  })

  it("멤버: 예시A 19,000(정정 22,000 · 환불 −3,000) · 예시B 15,000(예정 50,000 제외) · 예시C 17,000 · 미배정 예시D 6,000", () => {
    const byMember = Object.fromEntries([...status.byMember.values()].map((series) => [`${series.team}/${series.member}`, dec(series.months)]))
    expect(byMember).toEqual({ "BD/예시A": 19_000, "BD/예시B": 15_000, "MKT/예시C": 17_000, "미배정/예시D": 6_000 })
    expect(status.unassigned).toEqual([{ manager: "예시D", amount: 6_000 }])
  })

  it("팀: BD 34,000 · MKT 17,000 · 미배정 6,000 — 합이 Team KR 57,000", () => {
    expect(Object.fromEntries([...status.byTeam].map(([team, series]) => [team, dec(series)]))).toEqual({
      BD: 34_000,
      MKT: 17_000,
      미배정: 6_000,
    })
  })

  it("고정 달 이전(11월) 장부 항목은 읽지 않는다 · 장부 새 행 추정 건수", () => {
    expect(status.total["2026-11"]).toBeUndefined()
    expect(status.inferred).toEqual({ channelUnknown: 1, statusInferred: 1 })
  })
})

describe("spliceDshNumbers — 델타 스플라이스", () => {
  it("장부 달만 바꾸고, 바꾼 만큼 그 분기·연간을 고친다 · 모든 월 키를 0 으로 채운다", () => {
    const sheet = { annual: 100, quarters: [10, 20, 30, 40], months: { "2026-11": 5, "2026-12": 7 } }
    const out = spliceDshNumbers(sheet, { "2026-12": 20, "2027-01": 4 }, ["2026-12", "2027-01"], FY_KEYS)
    expect(out.months["2026-11"]).toBe(5)
    expect(out.months["2026-12"]).toBe(20)
    expect(out.months["2027-01"]).toBe(4)
    expect(out.quarters).toEqual([10, 20, 43, 44])
    expect(out.annual).toBe(117)
    expect(Object.keys(out.months).sort()).toEqual([...FY_KEYS].sort())
    // 시트 값과 같으면 그대로다.
    expect(spliceDshNumbers(sheet, { "2026-12": 7 }, ["2026-12"], FY_KEYS)).toMatchObject({ annual: 100, quarters: [10, 20, 30, 40] })
  })
})

describe("spliceDshWithLedger — 시트 실적에 장부 실적을 끼워 넣는다", () => {
  it("12/20: 실적 연간 588,000 → 633,000 · Q3 156,000 → 201,000 · 11월 72,000 그대로 · 목표는 같은 참조", () => {
    const raw = dshFixture()
    const before = aggregateDshTotals(raw.breakdown ?? [])
    expect(before.status.annual).toBe(588_000)
    const { dsh, info } = splice()
    const after = aggregateDshTotals(dsh.breakdown ?? [])
    expect(after.status.annual).toBe(633_000)
    expect(after.status.quarters[2]).toBe(201_000)
    expect(after.status.months["2026-12"]).toBe(57_000)
    expect(after.status.months["2026-11"]).toBe(72_000)
    expect(after.goal).toEqual(before.goal)
    const progress = deriveDshProgress(after, DEC20)
    expect(progress.month).toEqual({ goal: 80_000, status: 57_000, pct: 71.25 })
    expect(progress.quarter).toEqual({ goal: 240_000, status: 201_000, pct: 83.75 })
    expect(info).toMatchObject({ ...LOCK, ledgerMonths: ["2026-12", "2027-01", "2027-02", "2027-03"] })
  })

  it("항등: 다시 dedupe 해도 행 수가 그대로 · 모든 행이 12개 월 키를 가진다 · 목표 행은 같은 객체", () => {
    const raw = dshFixture()
    const rawGoals = [...dedupeDshByKind(raw.breakdown ?? []).goal.values()]
    const { dsh } = spliceDshWithLedger({ dsh: raw, deals: mergedDeals(), fiscalYear: FY, today: "2026-12-20", ...LOCK })
    const breakdown = dsh.breakdown ?? []
    const deduped = dedupeDshByKind(breakdown)
    expect(deduped.goal.size).toBe(breakdown.filter((row) => row.kind === "goal").length)
    expect(deduped.status.size).toBe(breakdown.filter((row) => row.kind === "status").length)
    for (const row of [...breakdown, ...dsh.rows.filter((r) => r.kind === "status")]) {
      expect(Object.keys(row.months).sort()).toEqual([...FY_KEYS].sort())
    }
    expect([...deduped.goal.values()].every((row, index) => row === rawGoals[index])).toBe(true)
    const rawGoalRows = raw.rows.filter((row) => row.kind === "goal")
    expect(dsh.rows.filter((row) => row.kind === "goal").every((row, index) => row === rawGoalRows[index])).toBe(true)
  })

  it("Team KR = 팀 합(미배정 포함) = 조합 합 — 장부 달마다", () => {
    const { dsh } = splice()
    const grid = buildDshTeamGrid(dsh.rows)
    const totals = aggregateDshTotals(dsh.breakdown ?? [])
    for (const ym of ["2026-12", "2027-01", "2027-02", "2027-03"]) {
      const all = grid.teams.find((team) => team.team === "ALL")!.status!.months[ym]
      const teams = grid.teams.filter((team) => team.team !== "ALL").reduce((sum, team) => sum + (team.status?.months[ym] ?? 0), 0)
      expect(teams).toBe(all)
      expect(totals.status.months[ym]).toBe(all)
    }
    const dec = Object.fromEntries(grid.teams.map((team) => [team.team, team.status?.months["2026-12"] ?? null]))
    expect(dec).toEqual({ ALL: 57_000, BD: 34_000, MKT: 17_000, 미배정: 6_000 })
    const unassigned = grid.teams.find((team) => team.team === "미배정")!
    expect(unassigned.goal).toBeNull()
    expect(unassigned.members.map((member) => [member.member, member.status?.months["2026-12"]])).toEqual([["예시D", 6_000]])
  })

  it("입력 DshOutput 은 바꾸지 않고, 멤버→팀 지도는 그대로다", () => {
    const raw = dshFixture()
    const snapshot = JSON.parse(JSON.stringify(raw))
    const { dsh } = spliceDshWithLedger({ dsh: raw, deals: mergedDeals(), fiscalYear: FY, today: "2026-12-20", ...LOCK })
    expect(raw).toEqual(snapshot)
    expect(dsh.members).toEqual({ 예시A: "BD", 예시B: "BD", 예시C: "MKT" })
  })

  it("채널 맞춤: Channel HW Renew 딜이 목표 있는 (미구분) 조합으로 간다 · 장부 새 행(유형 없음)은 SW New (미구분)", () => {
    const { dsh } = splice()
    const segments = deriveDshSegments(dsh.breakdown ?? [], DEC20, "M")
    const rows = Object.fromEntries(segments.flatMap((group) => group.rows.map((row) => [`${group.category}|${row.label}`, row.status])))
    expect(rows).toMatchObject({
      "Software|New · Direct": 28_000,
      "Software|New · (미구분)": 9_000,
      "Software|Renew · Direct": 12_000,
      "Hardware|Renew · (미구분)": 8_000,
    })
    expect(Object.keys(rows)).not.toContain("Hardware|Renew · Channel")
  })

  it("1/20: 1월 장부 확정이 1월 실적이 되고, 12월은 장부 값 그대로 · 비교값은 싣지 않는다", () => {
    const today = "2027-01-20"
    const deals = mergedDeals(
      [ledgerEntry({ id: "e-jan", customer: "예시학원2", manager: "예시B", month: "2027-01", amount: 30_000, appliedAt: "2027-01-15T01:00:00.000Z" })],
      today,
    )
    const { dsh, info } = splice(today, deals)
    const totals = aggregateDshTotals(dsh.breakdown ?? [])
    expect(totals.status.months["2027-01"]).toBe(30_000)
    expect(totals.status.months["2026-12"]).toBe(57_000)
    expect(deriveDshProgress(totals, JAN20).month).toEqual({ goal: 80_000, status: 30_000, pct: 37.5 })
    expect(info?.sheetCompare).toBeUndefined()
  })

  it("12월(고정 달) 동안만 시트 실적 비교값 — 전사 12,000 · BD 9,000 · MKT 3,000 · 예시A 4,000", () => {
    const { info } = splice()
    expect(info?.sheetCompare).toMatchObject({
      month: "2026-12",
      total: 12_000,
      byTeam: { ALL: 12_000, BD: 9_000, MKT: 3_000 },
      byMember: { 예시A: 4_000, 예시B: 5_000, 예시C: 3_000 },
    })
    expect(info?.sheetCompare?.byCombo).toEqual({
      "Software|New|Direct": 5_000,
      "Software|Renew|Direct": 7_000,
      "Hardware|Renew|(미구분)": 0,
    })
    expect(dshSheetCompareFor(dshFixture(), "2026-12").total).toBe(12_000)
  })

  it("개인 범위: 멤버 행을 끼워 넣어 scopeDshToManager 가 장부 실적을 고른다 · DSH 밖 담당도 실적만으로 진도가 선다", () => {
    const { dsh } = splice()
    const personal = scopeDshToManager(dsh, "예시a")
    const totals = dshTotalsFromRows(personal.rows)
    expect(totals?.status.months["2026-12"]).toBe(19_000)
    // summary 는 개인 범위에서 멤버 행만 보낸다(F-24) — 멤버 행 합으로 같은 값을 낸다.
    const memberOnly = dshTotalsFromRows(personal.rows.filter((row) => row.level === "member"))
    expect(memberOnly?.status.months["2026-12"]).toBe(19_000)
    expect(memberOnly?.goal.months["2026-12"]).toBe(30_000)
    expect(personal.breakdown).toEqual([])

    const outside = dshTotalsFromRows(scopeDshToManager(dsh, "예시D").rows.filter((row) => row.level === "member"))
    expect(outside).not.toBeNull()
    expect(outside?.goal.annual).toBe(0)
    expect(outside?.status.months["2026-12"]).toBe(6_000)
  })

  it("DSH 창에 고정 달 이상인 달이 없으면(지난 회계연도) 입력 그대로 · info null", () => {
    const raw = dshFixture()
    const result = spliceDshWithLedger({ dsh: raw, deals: mergedDeals(), fiscalYear: FY, today: "2027-05-02", lockedAt: "2027-04-01", lockMonth: "2027-04" })
    expect(result.dsh).toBe(raw)
    expect(result.info).toBeNull()
    expect(dshMonthKeys(raw)).toEqual(FY_KEYS)
  })
})
