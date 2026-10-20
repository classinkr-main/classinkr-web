import { describe, expect, it } from "vitest"

import {
  buildManagerRollup,
  buildSimpleColumns,
  buildSimpleLedger,
  fiscalPace,
  rowMatchesChips,
} from "@/components/admin/branch/ledger/ledger-simple-logic"
import type { LedgerRevenueRow } from "@/components/admin/branch/ledger/shared"

const MONTHS = ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03"]

function row(partial: Partial<LedgerRevenueRow>): LedgerRevenueRow {
  return { id: partial.customer ?? "x", customer: "x", manager: "A", team: "BD", region: null, revenue: 0, ledgerOrigin: "sheet", ...partial }
}

const rows = [
  row({ id: "sw", customer: "가온어학원", productVersion: "ClassIn 라이선스", status: "Renew", dealType: "Direct",
    monthlyPayments: { "2026-05": 100, "2026-10": 50 }, monthlyConfirmed: { "2026-05": 100, "2026-10": 0 }, monthlyHighConfidence: { "2026-10": 50 } }),
  row({ id: "hw", customer: "가온어학원", productVersion: "전자칠판", status: "New", dealType: "Channel",
    monthlyPayments: { "2026-11": 30 }, monthlyConfirmed: { "2026-11": 0 }, monthlyHighConfidence: { "2026-11": 0 } }),
  row({ id: "b", customer: "한빛수학", manager: "B", team: "MKT", productVersion: "ClassIn", status: "New", dealType: "Direct",
    monthlyPayments: { "2026-10": 40 }, monthlyConfirmed: { "2026-10": 40 }, monthlyHighConfidence: {} }),
]

describe("장부 기본 화면 집계", () => {
  it("이번 달 이전은 한 열로 접고, 이번 달이 FY 밖이면 12개월을 그대로 둔다", () => {
    const columns = buildSimpleColumns(MONTHS, "2026-10")
    expect(columns.map((c) => c.label)).toEqual(["4–9월", "10월", "11월", "12월", "1월", "2월", "3월"])
    expect(columns[0].months).toHaveLength(6)
    expect(columns[1].current).toBe(true)
    expect(buildSimpleColumns(MONTHS, "2027-05")).toHaveLength(12)
    const expanded = buildSimpleColumns(MONTHS, "2026-10", true)
    expect(expanded).toHaveLength(12)
    expect(expanded.filter((c) => c.past)).toHaveLength(6)
  })

  it("칩 필터는 같은 기준 안에서 OR, 기준끼리 AND", () => {
    const pick = (keys: string[]) => rows.filter((r) => rowMatchesChips(r, new Set(keys))).map((r) => r.id)
    expect(pick([])).toEqual(["sw", "hw", "b"])
    expect(pick(["product:HW"])).toEqual(["hw"])
    expect(pick(["contract:신규", "contract:갱신"])).toEqual(["sw", "hw", "b"])
    expect(pick(["contract:신규", "channel:직접"])).toEqual(["b"])
  })

  it("묶기 없음은 고객 한 줄, 확도 합은 총액과 같다", () => {
    const ledger = buildSimpleLedger(rows, buildSimpleColumns(MONTHS, "2026-10"), "none")
    expect(ledger.sections).toHaveLength(1)
    const gaon = ledger.sections[0].lines.find((line) => line.label === "가온어학원")!
    expect(gaon.rows).toHaveLength(2)
    expect(gaon.cells[0]).toMatchObject({ total: 100, confirmed: 100 })
    expect(gaon.cells[1]).toMatchObject({ total: 50, high: 50 })
    expect(ledger.total.total).toBe(220)
    expect(ledger.total.confirmed + ledger.total.high + ledger.total.open).toBe(220)
  })

  it("제품으로 묶으면 같은 고객의 SW·HW가 다른 묶음에 소계와 함께 들어간다", () => {
    const ledger = buildSimpleLedger(rows, buildSimpleColumns(MONTHS, "2026-10"), "product")
    expect(ledger.sections.map((s) => [s.label, s.total.total])).toEqual([["SW", 190], ["HW", 30]])
    expect(ledger.sections[1].lines[0].tag).toBe("신규 · 채널")
  })

  it("담당자별 합계는 팀으로 묶고 목표가 없으면 지어내지 않는다", () => {
    const teams = buildManagerRollup(rows, MONTHS, "2026-10", [{ member: "A", team: "BD", goal: 1000 }])
    expect(teams.map((t) => [t.team, t.bucket.total, t.goal])).toEqual([["BD", 180, 1000], ["MKT", 40, null]])
    expect(teams[0].members[0].dueUnconfirmed).toBe(1)
    expect(teams[1].members[0].dueUnconfirmed).toBe(0)
  })

  it("오늘 페이스는 FY 경과 비율이다", () => {
    expect(fiscalPace(MONTHS, "2026-10")).toBeCloseTo(7 / 12)
    expect(fiscalPace(MONTHS, "2027-05")).toBe(1)
  })
})
