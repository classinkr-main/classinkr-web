import { describe, expect, it } from "vitest"

import { buildDistributorLinesFromQuote, FY2026_CHANNEL_SUPPLY_PRICE_RULES } from "@/lib/distributor-settlements"
import { buildCumulativeTierNudge } from "@/lib/hardware-market-price-tiers"
import { buildSalesOrderLines } from "@/lib/orders/order-lines"
import {
  GIFT_CAMERA_T1_ITEM_CODE,
  GIFT_STAND_ITEM_CODE,
  buildConfigurableStandardQuoteDetails,
  getStandardQuoteDefaultSelections,
} from "@/lib/standard-quote-template"

// 2026-11-20 결정 — 프로모션은 작성자가 옵션 토글로 직접 켠다 / 누적 대수 구간가는 매칭된 고객에게 추천만.

describe("프로모션 증정 토글", () => {
  it.each(["board_86", "board_75"] as const)("%s: 기본은 꺼져 있다", (templateId) => {
    const defaults = getStandardQuoteDefaultSelections(templateId)
    expect(defaults.gift_t1).toBe(false)
    expect(defaults.gift_stand).toBe(false)
  })

  it("켜면 0원 증정 행이 생긴다 — T1 은 2대당 1대, 스탠드는 1대당 1대", () => {
    const quote = buildConfigurableStandardQuoteDetails({
      templateId: "board_86",
      optionSelections: { gift_t1: true, gift_stand: true },
      baseQuantity: 5,
    })
    const gifts = (quote.lineItems ?? []).filter((line) => line.itemCode === GIFT_CAMERA_T1_ITEM_CODE || line.itemCode === GIFT_STAND_ITEM_CODE)
    expect(gifts.map((line) => [line.itemCode, line.quantity, line.unitPrice, line.lineSupplyAmount])).toEqual([
      [GIFT_CAMERA_T1_ITEM_CODE, 2, 0, 0],
      [GIFT_STAND_ITEM_CODE, 5, 0, 0],
    ])
    // 합계는 칠판 5대 그대로
    expect(quote.subtotalAmount).toBe(5 * 6_300_000)
  })

  it("1대면 T1 증정도 최소 1대(작성자가 켰을 때만)", () => {
    const quote = buildConfigurableStandardQuoteDetails({ templateId: "board_75", optionSelections: { gift_t1: true }, baseQuantity: 1 })
    expect(quote.lineItems?.find((line) => line.itemCode === GIFT_CAMERA_T1_ITEM_CODE)?.quantity).toBe(1)
  })

  it("출고(오더 줄)는 같은 재고 품목으로 센다", () => {
    const quote = buildConfigurableStandardQuoteDetails({
      templateId: "board_86",
      optionSelections: { gift_t1: true, gift_stand: true },
      baseQuantity: 2,
    })
    const orderLines = buildSalesOrderLines("q1", quote.lineItems ?? [])
    const gift = orderLines.filter((line) => line.itemCode?.endsWith("-gift"))
    expect(gift.map((line) => [line.itemCode, line.hardwareProducts, line.unmappedHardware])).toEqual([
      [GIFT_CAMERA_T1_ITEM_CODE, [{ product: "T1", quantity: 1 }], false],
      [GIFT_STAND_ITEM_CODE, [{ product: "STD1", quantity: 2 }], false],
    ])
  })

  it("총판 견적서에는 포함되지만 원가는 비어 있다(수동 입력)", () => {
    const quote = buildConfigurableStandardQuoteDetails({ templateId: "board_86", optionSelections: { gift_t1: true }, baseQuantity: 2 })
    const lines = buildDistributorLinesFromQuote(quote.lineItems, { rules: FY2026_CHANNEL_SUPPLY_PRICE_RULES })
    const gift = lines.find((line) => line.itemCode === GIFT_CAMERA_T1_ITEM_CODE)
    expect(gift).toMatchObject({ included: true, unitPrice: null })
  })
})

describe("누적 대수 구간가 추천", () => {
  const board = { itemCode: "board-86", itemName: '전자칠판 86"', quantity: 3, unitPrice: 6_300_000 }

  it("이전 구매가 없으면 추천하지 않는다", () => {
    expect(buildCumulativeTierNudge(board, {})).toBeNull()
  })

  it("이전 9대 + 이번 3대 = 12대 → 11~20대 시장가 5,500,000", () => {
    expect(buildCumulativeTierNudge(board, { "board-86": 9 })).toMatchObject({
      priorQuantity: 9,
      currentQuantity: 3,
      cumulativeQuantity: 12,
      tierLabel: "11~20대",
      recommendedUnitPrice: 5_500_000,
    })
  })

  it("이전 1대 + 이번 1대 = 2대 → 2~10대 5,800,000", () => {
    expect(buildCumulativeTierNudge({ ...board, quantity: 1 }, { "board-86": 1 })?.recommendedUnitPrice).toBe(5_800_000)
  })

  it("50대를 넘어도 21대 이상 가격 그대로", () => {
    expect(buildCumulativeTierNudge(board, { "board-86": 80 })?.recommendedUnitPrice).toBe(5_300_000)
  })

  it("이미 그 값 이하로 잡혀 있으면 추천하지 않는다", () => {
    expect(buildCumulativeTierNudge({ ...board, unitPrice: 5_400_000 }, { "board-86": 9 })).toBeNull()
  })

  it("스탠드는 전 구간 같은 값이라 추천하지 않는다", () => {
    expect(buildCumulativeTierNudge({ itemCode: "stand", itemName: "스탠드", quantity: 5, unitPrice: 500_000 }, { stand: 30 })).toBeNull()
  })
})
