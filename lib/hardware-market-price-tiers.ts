import type { DistributorPriceRule } from "@/lib/distributor-settlements"

// FY2026 채널 유통 가격 정책표의 퀴드러닝 → 엔드유저 시장판매가(VAT 포함) — 수량 구간 단가.
// 고객 견적 단가는 자동으로 바꾸지 않는다(2026-11-20 결정: 매니저가 직접 고친다). 이미 산 적이 있는 고객이
// 명확히 매칭됐을 때만 "누적 대수 기준 구간가"를 작성기에서 추천(넛지)하는 데 쓴다.
// 기획: docs/active/distributor-quote-with-customer-quote-plan-2026-11-20.md
// 서버·클라이언트 공용(server-only 금지).

export const FY2026_MARKET_PRICE_RULES: readonly DistributorPriceRule[] = [
  ...tiers("board-86", '전자칠판 86"', [6_300_000, 5_800_000, 5_500_000, 5_300_000]),
  ...tiers("board-75", '전자칠판 75"', [5_400_000, 4_900_000, 4_600_000, 4_400_000]),
  ...tiers("camera-t1", "T1 카메라", [1_200_000, 1_200_000, 1_000_000, 1_000_000]),
  ...tiers("stand", "이동형 스탠드", [500_000, 500_000, 500_000, 500_000]),
  ...tiers("ai-studio-recording-set", '녹화 세트 86" (OMO)', [8_300_000, 7_800_000, 7_500_000, 7_300_000]),
  ...tiers("ai-studio-recording-set-75", '녹화 세트 75" (OMO)', [7_400_000, 6_900_000, 6_600_000, 6_400_000]),
]

function tiers(itemCode: string, itemName: string, prices: [number, number, number, number]) {
  return [1, 2, 11, 21].map((minQuantity, index) => ({ itemCode, itemName, minQuantity, unitPrice: prices[index] }))
}

export function marketTierLabel(quantity: number) {
  if (quantity >= 21) return "21대 이상"
  if (quantity >= 11) return "11~20대"
  if (quantity >= 2) return "2~10대"
  return "1대"
}

export type CumulativeTierNudge = {
  itemCode: string
  itemName: string
  priorQuantity: number
  currentQuantity: number
  cumulativeQuantity: number
  tierLabel: string
  recommendedUnitPrice: number
  currentUnitPrice: number
}

/**
 * 이전 승인 오더 대수 + 이번 줄 수량으로 구간가를 다시 본다. 이번 줄 단가보다 낮은 구간가가 나올 때만 추천한다.
 * 이전 구매가 없으면(prior 0) 추천하지 않는다 — 단일 견적의 수량 구간은 매니저가 직접 정한다.
 */
export function buildCumulativeTierNudge(
  line: { itemCode?: string; itemName: string; quantity?: number | null; unitPrice?: number | null },
  priorUnitsByItemCode: Readonly<Record<string, number>>,
  rules: readonly DistributorPriceRule[] = FY2026_MARKET_PRICE_RULES
): CumulativeTierNudge | null {
  const itemCode = line.itemCode
  if (!itemCode) return null
  const prior = Math.max(0, Math.round(priorUnitsByItemCode[itemCode] ?? 0))
  if (prior === 0) return null
  const current = Math.max(0, Math.round(Number(line.quantity ?? 0)))
  if (current === 0 || line.unitPrice == null) return null
  const cumulative = prior + current
  let best: DistributorPriceRule | null = null
  for (const rule of rules) {
    if (rule.itemCode !== itemCode || rule.minQuantity > cumulative) continue
    if (!best || rule.minQuantity > best.minQuantity) best = rule
  }
  if (!best || best.unitPrice >= line.unitPrice) return null
  return {
    itemCode,
    itemName: line.itemName,
    priorQuantity: prior,
    currentQuantity: current,
    cumulativeQuantity: cumulative,
    tierLabel: marketTierLabel(cumulative),
    recommendedUnitPrice: best.unitPrice,
    currentUnitPrice: line.unitPrice,
  }
}
