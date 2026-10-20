import { describe, it, expect } from "vitest"
import { runDataQuality } from "@/lib/branch/computations/data-quality"
import type { DshOutput } from "@/lib/branch/parsers/dsh"
import type { BranchRevDeal } from "@/lib/repositories/branch-deals"
import type { KpiRow } from "@/lib/branch/parsers/kpi"
import type { DqInputs } from "@/lib/branch/computations/data-quality"
import type { HwInbound } from "@/lib/repositories/branch-hw"

const emptyDsh: DshOutput = { rows: [], members: {} }

const mk = (over: Partial<BranchRevDeal>): BranchRevDeal => ({
  id: "x", sheet_row: 1, customer_name: "c", branch_contact: null, team: "BD",
  manager: "Han", deal_type: "Direct", status: "New", first_payment: null,
  product_version: null, region: "서울", importance: "A", note: null,
  contract_target: 0, monthly_payments: {}, monthly_red: {}, raw: {}, synced_at: "",
  ...over,
})

describe("runDataQuality", () => {
  const inspect = (overrides: Partial<DqInputs>) => runDataQuality({
    deals: [], dsh: emptyDsh, kpi: [], seg: [], hwInbound: [], hwOutbound: [], hwStock: [], ...overrides,
  })

  it("uses registered products and aliases including promotional and other-category items", () => {
    const products = ['STD1', 'T1', 'S1', '65" IFP', '110" IFP', 'STD1 (Promoted)', 'T1(promoted)', 'STDM1(110")', '카메라 브라켓', '86\'\' IFP']
    const hardwareCatalog: { name: string; source_aliases: string[] }[] = products.map((name) => ({ name, source_aliases: [] }))
    hardwareCatalog.push({ name: 'OPS', source_aliases: ['OPS PC'] })
    const hwInbound = [...products, 'OPS PC'].map((product) => ({ product } as HwInbound))
    expect(inspect({ hardwareCatalog, hwInbound }).find((i) => i.id === "DQ-9")).toBeUndefined()
    expect(inspect({ hardwareCatalog, hwInbound: [...hwInbound, { product: 'T1-bracket-typo' } as HwInbound] })
      .find((i) => i.id === "DQ-9")?.samples).toEqual(['T1-bracket-typo'])
  })

  it("does not treat a regular product registration as approval of its promoted variant", () => {
    expect(inspect({ hardwareCatalog: [{ name: 'STD1', source_aliases: [] }], hwInbound: [{ product: 'STD1(promoted)' } as HwInbound] })
      .find((i) => i.id === "DQ-9")?.samples).toEqual(['STD1(promoted)'])
  })

  it("does not mistake source black text, including future weeks of this month, for extraction failure", () => {
    const deals = [mk({ first_payment: '2026-01-14', monthly_payments: { '2026-10': 5000 }, raw: { weeklyPayments: { '2026-10': [0, 0, 0, 0, 5000] } } })]
    expect(inspect({ deals, revColorSource: deals }).find((i) => i.id === "DQ-10")).toBeUndefined()
  })

  it("detects dropped red and blue amounts by comparing the original sheet, without requiring first payment", () => {
    const deals = [mk({ monthly_payments: { '2026-10': 100 } })]
    for (const color of [{ monthly_confirmed: { '2026-10': 60 } }, { monthly_high_conf: { '2026-10': 40 } }]) {
      expect(inspect({ deals, revColorSource: [mk(color)] }).find((i) => i.id === "DQ-10")?.samples).toEqual(['c'])
    }
  })

  it("preserves explicit zero and signed amounts and detects partial or stale color maps", () => {
    const original = mk({ monthly_confirmed: { '2026-10': 0, '2026-11': -100 }, monthly_high_conf: { '2026-11': 50 } })
    expect(inspect({ deals: [original], revColorSource: [original] }).find((i) => i.id === "DQ-10")).toBeUndefined()
    expect(inspect({ deals: [mk({ monthly_confirmed: { '2026-11': -100 }, monthly_high_conf: { '2026-11': 50 } })], revColorSource: [original] })
      .find((i) => i.id === "DQ-10")?.severity).toBe("warn")
    expect(inspect({ deals: [original], revColorSource: [mk({})] }).find((i) => i.id === "DQ-10")).toBeDefined()
  })

  it("reports unavailable comparisons instead of returning a clean bill of health", () => {
    const issues = inspect({ hardwareCatalog: null, revColorSource: null })
    expect(issues.filter((i) => ['DQ-9', 'DQ-10'].includes(i.id))).toHaveLength(2)
    expect(issues.find((i) => i.id === 'DQ-10')?.message).toContain('대조 미완료')
  })

  it("does not call row insertion, deletion or renaming a successful color comparison", () => {
    const original = mk({ sheet_row: 10 })
    for (const revColorSource of [[], [mk({ sheet_row: 11 })], [mk({ sheet_row: 10, customer_name: 'renamed' })]]) {
      expect(inspect({ deals: [original], revColorSource }).find((i) => i.id === 'DQ-10')).toBeDefined()
    }
  })

  const check = (deals: BranchRevDeal[] = [], currentKpiMembers?: string[]) => runDataQuality({
    deals, dsh: emptyDsh, kpi: ["Minjae", "Han"].map((member) => ({ member, pairs: {} } as KpiRow)),
    seg: [], hwInbound: [], hwOutbound: [], hwStock: [], currentKpiMembers,
  })

  it("preserves zero-revenue history outside the imported fiscal months", () => {
    const monthly_payments = { "2026-04": 0, "2027-03": 0 }
    expect(check([
      mk({ first_payment: "2026-03-31", monthly_payments }),
      mk({ first_payment: "2027-04-01", monthly_payments }),
      mk({ first_payment: "2019-06-18", monthly_payments }),
    ]).find((i) => i.id === "DQ-2")).toBeUndefined()
  })

  it.each(["2026-04-01", "2027-03-31"])("still warns for zero payments after first payment within the imported months: %s", (first_payment) => {
    expect(check([mk({ first_payment, monthly_payments: { "2026-04": 0, "2027-03": 0 } })])
      .find((i) => i.id === "DQ-2")?.severity).toBe("warn")
  })

  it("does not mistake a refund offset for absent monthly payments", () => {
    expect(check([mk({ first_payment: "2026-04-01", monthly_payments: { "2026-04": 100, "2026-05": -100 } })])
      .find((i) => i.id === "DQ-2")).toBeUndefined()
  })

  it("checks mapping only for the current Compass roster using canonical aliases", () => {
    expect(check([], ["박한"]).find((i) => i.id === "DQ-13")?.samples).toEqual(["Han"])
    expect(check([], []).find((i) => i.id === "DQ-13")).toBeUndefined()
  })

  it("keeps mapping warnings if the current roster could not be read", () => {
    expect(check().find((i) => i.id === "DQ-13")?.samples).toEqual(["Minjae", "Han"])
  })

  it("flags missing DSH team", () => {
    const dsh: DshOutput = { rows: [], members: {} }
    const out = runDataQuality({
      deals: [], dsh, kpi: [], seg: [], hwInbound: [], hwOutbound: [], hwStock: [],
    })
    expect(out.find((i) => i.id === "DQ-7")).toBeTruthy()
  })

  it("requires current BD/MKT rows without resurrecting the retired CSM team", () => {
    const rows: DshOutput["rows"] = ["BD", "MKT"].map((team) => ({
      level: "team", team, kind: "goal", annual: 100,
      quarters: [25, 25, 25, 25], months: {},
    }))
    const out = runDataQuality({
      deals: [], dsh: { rows, members: {} }, kpi: [], seg: [],
      hwInbound: [], hwOutbound: [], hwStock: [],
    })
    expect(out.filter((issue) => issue.id === "DQ-7")).toEqual([])
  })

  // REV_RANGE 상한(현재 '2. REV'!A1:CF1000 → 1000행) 사용률 규칙(DQ-15).
  describe("DQ-15 REV range usage", () => {
    it("does not fire below the 90% warn threshold", () => {
      const out = runDataQuality({
        deals: [mk({ sheet_row: 899 })], dsh: emptyDsh, kpi: [], seg: [],
        hwInbound: [], hwOutbound: [], hwStock: [],
      })
      expect(out.find((i) => i.id === "DQ-15")).toBeUndefined()
    })

    it("warns once max sheet_row reaches 90% of the range upper bound", () => {
      const out = runDataQuality({
        deals: [mk({ sheet_row: 900 })], dsh: emptyDsh, kpi: [], seg: [],
        hwInbound: [], hwOutbound: [], hwStock: [],
      })
      const issue = out.find((i) => i.id === "DQ-15")
      expect(issue?.severity).toBe("warn")
      expect(issue?.message).toContain("상한 증설 검토")
      expect(issue?.sheetRow).toBe(900)
    })

    it("errors once max sheet_row reaches the range upper bound (truncation risk)", () => {
      const out = runDataQuality({
        deals: [mk({ sheet_row: 1000 })], dsh: emptyDsh, kpi: [], seg: [],
        hwInbound: [], hwOutbound: [], hwStock: [],
      })
      const issue = out.find((i) => i.id === "DQ-15")
      expect(issue?.severity).toBe("error")
      expect(issue?.message).toContain("범위 절단 의심")
      expect(issue?.sheetRow).toBe(1000)
    })

    it("is skipped entirely when there are no deals", () => {
      const out = runDataQuality({
        deals: [], dsh: emptyDsh, kpi: [], seg: [], hwInbound: [], hwOutbound: [], hwStock: [],
      })
      expect(out.find((i) => i.id === "DQ-15")).toBeUndefined()
    })
  })
})
