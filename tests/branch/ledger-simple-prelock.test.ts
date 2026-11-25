import { describe, expect, it } from "vitest"

import {
  buildManagerRollup,
  buildSimpleColumns,
  buildSimpleLedger,
  rowMonthHasRefund,
} from "@/components/admin/branch/ledger/ledger-simple-logic"
import type { LedgerRevenueRow } from "@/components/admin/branch/ledger/shared"

// 잠금 전 정리(2026-11-25) — 기관별 · 매니저별 보기.
//  - D2: 환불만 있는 행도 남고 합계에서 빠진다(부호 그대로). 순액 0 상계 행만 뺀다.
//  - F-42: 담당자는 branchManagerMatches(별칭 · 대소문자 무시)로 맞춘다.
//  - F-43: 팀 소계는 행의 팀(row.team)으로 묶는다 — 팀 필터와 같은 합.

const MONTHS = ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03"]
const NOV = "2026-11"
const TODAY = "2026-11-25"

function row(partial: Partial<LedgerRevenueRow>): LedgerRevenueRow {
  return { id: partial.id ?? "x", customer: partial.id ?? "x", manager: "A", team: "BD", region: null, revenue: 0, ledgerOrigin: "sheet", ...partial }
}

const refund = row({ id: "refund", customer: "예시학원B", monthlyPayments: { [NOV]: -30_000 }, monthlyConfirmed: { [NOV]: -30_000 }, monthlyRed: { [NOV]: true } })
const offset = row({
  id: "offset", customer: "예시학원C", monthlyPayments: { [NOV]: 0 }, monthlyConfirmed: { [NOV]: 100 }, monthlyHighConfidence: { [NOV]: 0 },
  weeklyPayments: { [NOV]: [100, -100, 0, 0, 0] },
})
const positive = row({ id: "positive", customer: "예시학원A", monthlyPayments: { [NOV]: 50_000 }, monthlyConfirmed: { [NOV]: 50_000 } })

describe("기관별 — 환불 달은 값이다(D2)", () => {
  const columns = buildSimpleColumns(MONTHS, NOV)

  it("환불만 있는 행은 남고 합계에서 빠진다(부호 그대로), 네 값이 모두 0 인 행만 빠진다", () => {
    const empty = row({ id: "empty", customer: "예시학원D" })
    const ledger = buildSimpleLedger([refund, offset, positive, empty], columns, "none", TODAY)
    const labels = ledger.sections.flatMap((section) => section.lines.map((line) => line.label))
    // 순액 0 상계 행(확정 +100 · 예정 −100)은 남는다 — 확도 분해가 열 합계(캐논 sumLedgerRevenue 와 같은 합)에 든다.
    expect(labels).toEqual(["예시학원A", "예시학원C", "예시학원B"])
    const novIndex = columns.findIndex((column) => column.key === NOV)
    expect(ledger.cells[novIndex]).toEqual({ total: 20_000, confirmed: 20_100, high: 0, open: -100 })
    const refundLine = ledger.sections[0].lines.find((line) => line.label === "예시학원B")!
    expect(refundLine.cells[novIndex]).toEqual({ total: -30_000, confirmed: -30_000, high: 0, open: 0 })
    expect(refundLine.total.total).toBe(-30_000)
    expect(ledger.total.total).toBe(20_000)
  })

  it("환불이 든 달 — 순액이 음수이거나 주차에 음수가 있다", () => {
    expect(rowMonthHasRefund(refund, NOV)).toBe(true)
    expect(rowMonthHasRefund(offset, NOV)).toBe(true)
    expect(rowMonthHasRefund(positive, NOV)).toBe(false)
    expect(rowMonthHasRefund(refund, "2026-12")).toBe(false)
  })
})

describe("매니저별 — 팀은 행의 팀, 담당자는 branchManagerMatches", () => {
  const rows = [
    row({ id: "a-bd", manager: "예시A", team: "BD", monthlyPayments: { [NOV]: 100 }, monthlyConfirmed: { [NOV]: 100 } }),
    // 같은 사람의 소문자 표기 · 다른 팀(MKT) 행.
    row({ id: "a-mkt", manager: "예시a", team: "MKT", monthlyPayments: { [NOV]: 70 }, monthlyConfirmed: { [NOV]: 70 } }),
    row({ id: "b-mkt", manager: "예시B", team: "MKT", monthlyPayments: { [NOV]: 40 }, monthlyConfirmed: { [NOV]: 0 }, monthlyHighConfidence: { [NOV]: 40 } }),
    // 환불 — 팀 합계에서 빠진다.
    row({ id: "b-refund", manager: "예시B", team: "MKT", monthlyPayments: { [NOV]: -10 }, monthlyConfirmed: { [NOV]: -10 }, monthlyRed: { [NOV]: true } }),
  ]
  const goals = [
    { member: "예시A", team: "BD", goal: 1_000 },
    { member: "예시B", team: "MKT", goal: 500 },
  ]

  it("팀 소계 = 그 팀으로 적힌 행의 합(팀 필터와 같다) — 한 사람의 두 팀 행은 두 팀에 따로", () => {
    const teams = buildManagerRollup(rows, MONTHS, NOV, goals, TODAY)
    expect(teams.map((team) => [team.team, team.bucket.total, team.goal])).toEqual([
      ["BD", 100, 1_000],
      ["MKT", 100, 500],
    ])
    const mkt = teams.find((team) => team.team === "MKT")!
    expect(mkt.members.map((member) => [member.manager, member.bucket.total, member.goal])).toEqual([
      ["예시A", 70, null],
      ["예시B", 30, 500],
    ])
    // 목표는 소속 팀(BD) 줄에만 — MKT 줄에는 붙지 않는다.
    expect(teams.find((team) => team.team === "BD")!.members).toMatchObject([{ manager: "예시A", bucket: { total: 100 }, goal: 1_000 }])
  })

  it("대소문자 · 별칭이 달라도 같은 사람(branchManagerMatches) — 이름은 목표(DSH) 표기", () => {
    const teams = buildManagerRollup(rows.filter((item) => item.team === "MKT"), MONTHS, NOV, goals, TODAY)
    // '예시a' 행이 목표의 '예시A' 로 모인다(MKT 줄 하나).
    expect(teams.find((team) => team.team === "MKT")!.members.map((member) => member.manager)).toEqual(["예시A", "예시B"])
  })

  it("소속 팀에 행이 없으면 그 팀에 금액 0 줄을 두어 목표가 사라지지 않는다", () => {
    const teams = buildManagerRollup(rows.filter((item) => item.id === "a-mkt"), MONTHS, NOV, goals, TODAY)
    expect(teams.map((team) => [team.team, team.bucket.total, team.goal])).toEqual([
      ["MKT", 70, null],
      ["BD", 0, 1_000],
    ])
  })

  it("목표 팀을 모르면 금액이 가장 큰 줄에 목표를 붙인다, 목표가 없으면 지어내지 않는다", () => {
    const teams = buildManagerRollup(rows.slice(0, 2), MONTHS, NOV, [{ member: "예시a", team: null, goal: 900 }], TODAY)
    expect(teams.map((team) => [team.team, team.goal])).toEqual([["BD", 900], ["MKT", null]])
    expect(buildManagerRollup(rows.slice(0, 2), MONTHS, NOV, [], TODAY).every((team) => team.goal === null)).toBe(true)
  })

  it("이번 달 미확정 건수는 값이 있는(> 0) 달만 센다 — 환불은 미확정이 아니다", () => {
    const teams = buildManagerRollup(rows, MONTHS, NOV, goals, TODAY)
    const b = teams.find((team) => team.team === "MKT")!.members.find((member) => member.manager === "예시B")!
    expect(b.dueUnconfirmed).toBe(1)
  })
})
