/**
 * 견적 금액의 VAT 표기.
 *
 * 견적 버전의 total_amount 는 저장 경로와 무관하게 "부가세가 들어간 최종 금액"이다
 * (VAT 포함 견적은 단가에 이미 포함, VAT 별도 견적은 공급가 + 10%).
 * 그래서 금액 옆 라벨은 고정 문구가 아니라 견적의 VAT 설정(quoteDetails.vatIncluded)으로 정한다 —
 * 고객 공유 문서와 같은 기준이다.
 */

import { formatKRW } from "@/lib/format"

/**
 * VAT 포함 여부를 정한다. flag 는 structured_json 의 vatIncluded 값(boolean 또는 JSON 경로로 뽑은 "true"/"false").
 * 설정이 없는 옛 견적은 부가세를 따로 더했으면(tax_amount > 0) 별도, 아니면 문서 기본값인 포함으로 본다.
 */
export function resolveQuoteVatIncluded(flag: unknown, taxAmount?: number | null): boolean {
  if (flag === true || flag === "true") return true
  if (flag === false || flag === "false") return false
  return !(typeof taxAmount === "number" && taxAmount > 0)
}

/**
 * 최종 금액 아래에 붙는 한 줄. VAT 별도 견적은 최종 금액이 공급가 + VAT 임을 풀어 보여 준다.
 * 견적 할인이 있으면 공급가는 할인 뒤 금액이고, 할인액을 함께 적는다.
 */
export function describeQuoteVat(quote: {
  vatIncluded: boolean
  subtotalAmount: number
  taxAmount: number
  discountAmount?: number
}) {
  const discount = Math.max(0, Math.round(quote.discountAmount ?? 0))
  const discountText = discount > 0 ? ` · 할인 −${formatKRW(discount)}` : ""
  if (quote.vatIncluded) return `VAT 포함${discountText}`
  const supply = Math.round(quote.subtotalAmount) - discount
  return `공급가 ${formatKRW(supply)} + VAT ${formatKRW(Math.round(quote.taxAmount))}${discountText}`
}
