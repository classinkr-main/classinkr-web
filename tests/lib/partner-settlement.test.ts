import { describe, expect, it } from "vitest"

import { parsePartnerSettlementSnapshot, summarizePartnerSettlement } from "@/lib/partner-settlement"

// 합성 스냅샷 — 실제 고객·금액이 아니다. 보드가 바로 읽는 머리값만 채운다.
function snapshot() {
  return {
    generatedAt: "2026-01-31T09:00+09:00",
    partner: "테스트 총판",
    rule: { item: "보드 1세트", market: 1_000, supply: 800, margin: 200 },
    sources: [],
    totals: {
      supply: 10_000, transfer: 6_000, card: 1_000, ledgerPaid: 500,
      transferCount: 2, cardCount: 1, ledgerCount: 1, receiptCount: 4, bankMatched: 2,
      unallocated: 0, outflow: 0, due: 3_000, credit: 500, neoOnly: 0,
      counts: { due: 1, credit: 1, unverified: 1, settled: 0 },
      balance: 2_500, low: 2_500, high: 2_500,
    },
    deals: [],
    receipts: [],
    neoOnly: [],
    neoSameTransfer: [],
    statement: [{ date: "2026-01-05", dateLabel: "1/5", type: "charge", label: "청구", detail: "", amount: 10_000, balance: 10_000, deal: null, evidence: "" }],
    months: [{ month: "1월", endBalance: 2_500 }],
    issues: [],
    resolved: [],
    backlog: [],
    outflows: [],
    outflowNote: "",
    preAugust: [],
    priceTable: [],
    priceNote: "",
  }
}

describe("partner settlement snapshot", () => {
  it("accepts a well-formed snapshot and sums it for the Overview card", () => {
    const parsed = parsePartnerSettlementSnapshot(snapshot())
    expect(parsed).not.toBeNull()
    expect(summarizePartnerSettlement(parsed!)).toEqual({
      billed: 10_000,
      transfers: 6_000,
      card: 1_000,
      ledger: 500,
      balance: 2_500,
      generatedAt: "2026-01-31T09:00+09:00",
    })
  })

  it("rejects rows the board cannot draw instead of crashing it", () => {
    const missingTotal = snapshot() as Record<string, unknown>
    ;(missingTotal.totals as Record<string, unknown>).balance = "2500"
    const notAList = { ...snapshot(), deals: {} }
    const emptyChart = { ...snapshot(), statement: [] }

    for (const raw of [null, "{}", [], { ...snapshot(), generatedAt: 1 }, missingTotal, notAList, emptyChart]) {
      expect(parsePartnerSettlementSnapshot(raw)).toBeNull()
    }
  })
})
