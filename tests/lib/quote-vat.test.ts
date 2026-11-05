import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { describeQuoteVat, resolveQuoteVatIncluded } from "@/lib/portal/quote-vat"

describe("resolveQuoteVatIncluded", () => {
  it("견적의 VAT 설정을 그대로 따른다(boolean·JSON 경로 문자열 모두)", () => {
    expect(resolveQuoteVatIncluded(true, 0)).toBe(true)
    expect(resolveQuoteVatIncluded("true", 0)).toBe(true)
    expect(resolveQuoteVatIncluded(false, 830_000)).toBe(false)
    expect(resolveQuoteVatIncluded("false", 830_000)).toBe(false)
    // 설정이 우선 — 부가세가 0인 별도 견적(금액 미정)도 별도로 본다.
    expect(resolveQuoteVatIncluded("false", 0)).toBe(false)
  })

  it("설정이 없는 옛 견적은 부가세를 따로 더했는지로 판단한다", () => {
    expect(resolveQuoteVatIncluded(null, 830_000)).toBe(false)
    expect(resolveQuoteVatIncluded(undefined, 0)).toBe(true)
    expect(resolveQuoteVatIncluded(null, null)).toBe(true)
  })
})

describe("describeQuoteVat", () => {
  it("VAT 포함 견적은 'VAT 포함'으로 표기한다", () => {
    expect(describeQuoteVat({ vatIncluded: true, subtotalAmount: 8_300_000, taxAmount: 0 })).toBe("VAT 포함")
  })

  it("VAT 별도 견적은 최종 금액이 공급가 + VAT 임을 풀어 쓴다", () => {
    expect(describeQuoteVat({ vatIncluded: false, subtotalAmount: 8_300_000, taxAmount: 830_000 })).toBe(
      "공급가 8,300,000원 + VAT 830,000원"
    )
  })
})

describe("견적 상세 금액 라벨", () => {
  it("고정 문구 'VAT 별도' 대신 견적의 VAT 설정으로 표기한다", () => {
    const panelSource = readFileSync(
      join(process.cwd(), "components/admin/documents/HardwareQuotesPanel.tsx"),
      "utf8"
    )
    expect(panelSource).not.toContain(">VAT 별도<")
    expect(panelSource).toContain("{describeQuoteVat(quote)}")
  })

  it("목록 API가 현재 버전의 VAT 설정을 JSON 경로로 함께 읽는다", () => {
    const repoSource = readFileSync(join(process.cwd(), "lib/portal/repositories/documents.ts"), "utf8")
    expect(repoSource).toContain("vat_included:structured_json->quoteDetails->>vatIncluded")
  })
})
