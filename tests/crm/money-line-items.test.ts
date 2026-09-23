/**
 * M2·M4 — lib/crm/money-line-items.ts 순수 함수.
 * 합산(같은 품목·통화·근거)·통화 분리·근거 판정(확정/추정)·정렬(수량 내림차순)·유사도 산식을 고정한다.
 */
import { describe, expect, it } from "vitest"

import {
  buildCrmMoneyLineItems,
  buildUnmatchedOutboundCandidates,
  categorizeMoneyLineItemProduct,
  computeAccountNameSimilarity,
  type MoneyDealLineItemRow,
  type MoneyHwOutboundRow,
} from "@/lib/crm/money-line-items"

function dealRow(overrides: Partial<MoneyDealLineItemRow> & { ref: string }): MoneyDealLineItemRow {
  return {
    product: "전자칠판 86",
    quantity: 1,
    unitPrice: 5_800_000,
    amount: 5_800_000,
    currency: "KRW",
    at: "2026-09-01T00:00:00.000Z",
    ...overrides,
  }
}

function hwRow(overrides: Partial<MoneyHwOutboundRow> & { id: string; ref: string }): MoneyHwOutboundRow {
  return {
    product: "전자칠판 86",
    quantity: 1,
    revenue: 1500,
    destination: "테스트 학원",
    serials: [],
    outboundDate: "2026-09-05T00:00:00.000Z",
    isPlanned: false,
    confirmedAccountId: null,
    ...overrides,
  }
}

describe("categorizeMoneyLineItemProduct", () => {
  it("칠판·카메라·스탠드·소프트웨어·기타를 판정한다", () => {
    expect(categorizeMoneyLineItemProduct("전자칠판 86형")).toBe("board")
    expect(categorizeMoneyLineItemProduct("Smart Board 75")).toBe("board")
    expect(categorizeMoneyLineItemProduct("AI 카메라 T1")).toBe("camera")
    expect(categorizeMoneyLineItemProduct("거치 스탠드")).toBe("stand")
    expect(categorizeMoneyLineItemProduct("연간 라이선스")).toBe("software")
    expect(categorizeMoneyLineItemProduct("설치비")).toBe("other")
    expect(categorizeMoneyLineItemProduct(null)).toBe("other")
  })
})

describe("buildCrmMoneyLineItems — 합산·통화 분리·근거 판정·정렬", () => {
  const account = { accountId: "acc-1", accountName: "테스트 학원" }

  it("딜 라인아이템은 항상 confirmed(KRW)다", () => {
    const result = buildCrmMoneyLineItems(account, {
      dealLineItems: [dealRow({ ref: "DEAL-1" })],
      hwOutbound: [],
    })
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems[0]).toMatchObject({
      source: "deal_line_items",
      evidence: "confirmed",
      currency: "KRW",
      quantity: 1,
      amount: 5_800_000,
    })
    expect(result.meta.sources).toEqual(["deal_line_items"])
  })

  it("확정 링크가 있는 출고는 confirmed, 이름만 일치하는 출고는 estimated다", () => {
    const result = buildCrmMoneyLineItems(account, {
      dealLineItems: [],
      hwOutbound: [
        hwRow({ id: "o1", ref: "LG-1", confirmedAccountId: "acc-1", destination: "다른이름학원" }),
        hwRow({ id: "o2", ref: "LG-2", confirmedAccountId: null, destination: "테스트 학원" }),
      ],
    })
    expect(result.lineItems).toHaveLength(2)
    const confirmed = result.lineItems.find((item) => item.evidence === "confirmed")
    const estimated = result.lineItems.find((item) => item.evidence === "estimated")
    expect(confirmed?.source).toBe("hw_outbound")
    expect(confirmed?.currency).toBe("USD")
    expect(estimated?.source).toBe("hw_outbound")
    expect(result.unlinkedHwOutbound).toHaveLength(0)
  })

  it("다른 계정으로 확정된 출고는 lineItems에도 unlinkedHwOutbound에도 넣지 않는다", () => {
    const result = buildCrmMoneyLineItems(account, {
      dealLineItems: [],
      hwOutbound: [hwRow({ id: "o1", ref: "LG-1", confirmedAccountId: "other-acc", destination: "테스트 학원" })],
    })
    expect(result.lineItems).toHaveLength(0)
    expect(result.unlinkedHwOutbound).toHaveLength(0)
  })

  it("이름이 다르고 확정 링크도 없는 출고는 unlinkedHwOutbound로 돌려준다(M4 후보)", () => {
    const result = buildCrmMoneyLineItems(account, {
      dealLineItems: [],
      hwOutbound: [hwRow({ id: "o1", ref: "LG-1", confirmedAccountId: null, destination: "테스트학원 캠퍼스" })],
    })
    expect(result.lineItems).toHaveLength(0)
    expect(result.unlinkedHwOutbound).toHaveLength(1)
  })

  it("예정 출고는 lineItems·unlinkedHwOutbound 어디에도 넣지 않고 meta.note에 건수를 남긴다", () => {
    const result = buildCrmMoneyLineItems(account, {
      dealLineItems: [],
      hwOutbound: [
        hwRow({ id: "o1", ref: "LG-1", isPlanned: true, destination: "테스트 학원" }),
        hwRow({ id: "o2", ref: "LG-2", isPlanned: true, destination: "전혀 다른 이름" }),
      ],
    })
    expect(result.lineItems).toHaveLength(0)
    expect(result.unlinkedHwOutbound).toHaveLength(0)
    expect(result.meta.note).toBe("예정 출고 2건 제외")
  })

  it("같은 품목·통화·근거는 한 행으로 수량을 합산하고 details에 건별로 남긴다", () => {
    const result = buildCrmMoneyLineItems(account, {
      dealLineItems: [
        dealRow({ ref: "DEAL-1", quantity: 2, amount: 11_600_000, at: "2026-09-01T00:00:00.000Z" }),
        dealRow({ ref: "DEAL-2", quantity: 1, amount: 5_800_000, at: "2026-09-10T00:00:00.000Z" }),
      ],
      hwOutbound: [],
    })
    expect(result.lineItems).toHaveLength(1)
    const [item] = result.lineItems
    expect(item.quantity).toBe(3)
    expect(item.amount).toBe(17_400_000)
    expect(item.details).toHaveLength(2)
    // details는 최신순(9/10이 9/1보다 먼저)
    expect(item.details[0].ref).toBe("DEAL-2")
    expect(item.lastAt).toBe("2026-09-10T00:00:00.000Z")
  })

  it("통화가 다르면(KRW 딜 vs USD 출고) 같은 품목명이어도 절대 합치지 않는다", () => {
    const result = buildCrmMoneyLineItems(account, {
      dealLineItems: [dealRow({ ref: "DEAL-1", product: "전자칠판 86" })],
      hwOutbound: [hwRow({ id: "o1", ref: "LG-1", product: "전자칠판 86", confirmedAccountId: "acc-1" })],
    })
    expect(result.lineItems).toHaveLength(2)
    const currencies = result.lineItems.map((item) => item.currency).sort()
    expect(currencies).toEqual(["KRW", "USD"])
  })

  it("근거(확정/추정)가 다르면 같은 품목·통화여도 분리한다", () => {
    const result = buildCrmMoneyLineItems(account, {
      dealLineItems: [],
      hwOutbound: [
        hwRow({ id: "o1", ref: "LG-1", product: "AI 카메라 T1", confirmedAccountId: "acc-1" }),
        hwRow({ id: "o2", ref: "LG-2", product: "AI 카메라 T1", confirmedAccountId: null, destination: "테스트 학원" }),
      ],
    })
    expect(result.lineItems).toHaveLength(2)
    const evidences = result.lineItems.map((item) => item.evidence).sort()
    expect(evidences).toEqual(["confirmed", "estimated"])
  })

  it("수량 내림차순으로 정렬한다", () => {
    const result = buildCrmMoneyLineItems(account, {
      dealLineItems: [
        dealRow({ ref: "DEAL-1", product: "설치비", quantity: 1, amount: 500_000 }),
        dealRow({ ref: "DEAL-2", product: "전자칠판 86", quantity: 5, amount: 29_000_000 }),
      ],
      hwOutbound: [],
    })
    expect(result.lineItems.map((item) => item.product)).toEqual(["전자칠판 86", "설치비"])
  })

  it("options.truncated를 meta.truncated에 그대로 반영한다", () => {
    const result = buildCrmMoneyLineItems(account, { dealLineItems: [], hwOutbound: [] }, { truncated: true })
    expect(result.meta.truncated).toBe(true)
  })
})

describe("computeAccountNameSimilarity", () => {
  it("정규화 키가 같으면 1이다", () => {
    expect(computeAccountNameSimilarity("테스트 학원", "테스트학원")).toBe(1)
  })

  it("부분 포함이면 최소 0.8이다", () => {
    expect(computeAccountNameSimilarity("테스트 학원", "테스트 학원 강남캠퍼스")).toBeGreaterThanOrEqual(0.8)
  })

  it("겹치는 토큰이 없으면 0이다", () => {
    expect(computeAccountNameSimilarity("테스트 학원", "완전 다른 이름")).toBe(0)
  })

  it("이름이 비어 있으면 0이다", () => {
    expect(computeAccountNameSimilarity("", "테스트 학원")).toBe(0)
    expect(computeAccountNameSimilarity("테스트 학원", "")).toBe(0)
  })
})

describe("buildUnmatchedOutboundCandidates — 유사도 필터·정렬·상한", () => {
  const rows: MoneyHwOutboundRow[] = [
    hwRow({ id: "o1", ref: "LG-1", destination: "테스트 학원 강남캠퍼스" }), // 부분 포함 → 높은 유사도
    hwRow({ id: "o2", ref: "LG-2", destination: "완전 다른 이름" }), // 유사도 0 → 제외
    hwRow({ id: "o3", ref: "LG-3", destination: "학원 테스트" }), // 토큰 겹침
  ]

  it("임계값(0.5) 미만은 제외한다", () => {
    const candidates = buildUnmatchedOutboundCandidates("테스트 학원", rows)
    expect(candidates.some((c) => c.id === "o2")).toBe(false)
  })

  it("유사도 내림차순으로 정렬하고 상한(limit)을 지킨다", () => {
    const candidates = buildUnmatchedOutboundCandidates("테스트 학원", rows, 1)
    expect(candidates).toHaveLength(1)
    expect(candidates[0].id).toBe("o1")
  })

  it("결과에 목적지·품목·수량·시리얼·유사도(0~1, 소수 둘째 자리)를 담는다", () => {
    const candidates = buildUnmatchedOutboundCandidates("테스트 학원", [
      hwRow({ id: "o1", ref: "LG-1", destination: "테스트 학원 강남캠퍼스", quantity: 3, serials: ["SN-1"] }),
    ])
    expect(candidates[0]).toMatchObject({
      id: "o1",
      product: "전자칠판 86",
      quantity: 3,
      destination: "테스트 학원 강남캠퍼스",
      serials: ["SN-1"],
    })
    expect(candidates[0].similarity).toBeGreaterThanOrEqual(0.5)
    expect(candidates[0].similarity).toBeLessThanOrEqual(1)
  })
})
