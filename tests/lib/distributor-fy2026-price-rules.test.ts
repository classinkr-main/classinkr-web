import { describe, expect, it } from "vitest"

import {
  FY2026_CHANNEL_SUPPLY_PRICE_RULES,
  buildDistributorLinesFromQuote,
  computeDistributorTotals,
  pickTemplateUnitPrice,
  validateDistributorPriceTemplateInput,
} from "@/lib/distributor-settlements"
import { buildConfigurableStandardQuoteDetails } from "@/lib/standard-quote-template"

// FY2026 채널 유통 가격 정책표 — ClassIn KR → 퀴드러닝 채널공급가(VAT 포함).
// 기획: docs/active/distributor-quote-with-customer-quote-plan-2026-11-20.md
const rules = FY2026_CHANNEL_SUPPLY_PRICE_RULES

describe("FY2026 채널공급가 규칙", () => {
  it.each([
    ["board-86", 1, 4_870_000],
    ["board-86", 10, 4_870_000],
    ["board-86", 11, 4_670_000],
    ["board-86", 20, 4_670_000],
    ["board-86", 21, 4_500_000],
    ["board-86", 80, 4_500_000],
    ["board-75", 1, 4_200_000],
    ["board-75", 11, 4_000_000],
    ["board-75", 21, 3_850_000],
    ["camera-t1", 2, 840_000],
    ["camera-t1", 11, 800_000],
    ["stand", 1, 270_000],
    ["stand", 21, 250_000],
    ["ai-studio-recording-set", 1, 6_210_000],
    ["ai-studio-recording-set", 11, 5_970_000],
    ["ai-studio-recording-set", 50, 5_800_000],
    ["ai-studio-recording-set-75", 1, 5_540_000],
    ["ai-studio-recording-set-75", 11, 5_300_000],
    ["ai-studio-recording-set-75", 21, 5_150_000],
  ])("%s %i대 → %i원", (itemCode, quantity, expected) => {
    expect(pickTemplateUnitPrice(rules, itemCode, quantity)).toBe(expected)
  })

  it("정책표에 없는 품목(벽걸이)은 원가가 비어 발행 전 사람이 채운다", () => {
    expect(pickTemplateUnitPrice(rules, "wall-mount", 1)).toBeNull()
  })

  it("원가 템플릿 저장 형식으로도 그대로 통과한다", () => {
    const validated = validateDistributorPriceTemplateInput({ name: "FY2026 채널 공급가", rules: [...rules] })
    expect(validated.ok).toBe(true)
  })

  it("86\" 3대 고객 견적 → 칠판만 공급가로 포함, 설치·교육은 기본 제외", () => {
    const quote = buildConfigurableStandardQuoteDetails({ templateId: "board_86", baseQuantity: 3 })
    const lines = buildDistributorLinesFromQuote(quote.lineItems, { rules })
    const included = lines.filter((line) => line.included)
    expect(included.map((line) => [line.itemCode, line.quantity, line.unitPrice])).toEqual([["board-86", 3, 4_870_000]])
    const totals = computeDistributorTotals(lines, true)
    expect(totals.totalAmount).toBe(3 * 4_870_000)
    expect(totals.missingPriceCount).toBe(0)
  })
})
