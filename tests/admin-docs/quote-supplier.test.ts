import { describe, expect, it } from "vitest"

import {
  CLASSIN_QUOTE_SUPPLIER,
  STANDARD_QUOTE_SUPPLIER,
  finalizeStandardQuoteDetails,
  isSoftwareQuoteTemplate,
  resolveQuoteSupplier,
} from "@/lib/standard-quote-template"

describe("isSoftwareQuoteTemplate", () => {
  it("online_suite is software, hardware templates are not", () => {
    expect(isSoftwareQuoteTemplate("online_suite")).toBe(true)
    expect(isSoftwareQuoteTemplate("board_86")).toBe(false)
    expect(isSoftwareQuoteTemplate("camera_t1")).toBe(false)
    expect(isSoftwareQuoteTemplate(undefined)).toBe(false)
  })
})

describe("resolveQuoteSupplier", () => {
  it("SW → 클래스인 공급자 + 매니저 담당자", () => {
    const s = resolveQuoteSupplier("online_suite", { name: "정규성", phone: "010-5112-2588" })
    expect(s.supplierBusinessName).toBe(CLASSIN_QUOTE_SUPPLIER.businessName)
    expect(s.supplierBusinessRegistrationNumber).toBe("724-88-02403")
    expect(s.supplierContactName).toBe("정규성")
    expect(s.supplierContactPhone).toBe("010-5112-2588")
  })

  it("HW → 표준 공급자(퀴드러닝)", () => {
    const s = resolveQuoteSupplier("board_86", { name: "정규성", phone: "010-5112-2588" })
    expect(s.supplierBusinessName).toBe(STANDARD_QUOTE_SUPPLIER.businessName)
    expect(s.supplierContactName).toBe(STANDARD_QUOTE_SUPPLIER.contactName)
    expect(s.supplierContactPhone).toBe(STANDARD_QUOTE_SUPPLIER.contactPhone)
  })
})

describe("finalizeStandardQuoteDetails supplier fallback", () => {
  it("커스텀 공급자(클래스인) 지정 시 담당자 미입력이어도 퀴드러닝 담당자가 섞이지 않는다", () => {
    const out = finalizeStandardQuoteDetails(
      { templateId: "online_suite", ...resolveQuoteSupplier("online_suite", { name: "정규성", phone: "" }) },
      "online_suite",
    )
    expect(out.supplierBusinessName).toBe(CLASSIN_QUOTE_SUPPLIER.businessName)
    expect(out.supplierContactName).toBe("정규성")
    // 전화 미입력 → 빈 값이어야 하고, 퀴드러닝 번호가 새어들면 안 된다.
    expect(out.supplierContactPhone ?? "").toBe("")
    expect(out.supplierContactPhone).not.toBe(STANDARD_QUOTE_SUPPLIER.contactPhone)
  })

  it("공급자 미지정(HW 기본) → 퀴드러닝으로 폴백", () => {
    const out = finalizeStandardQuoteDetails({ templateId: "board_86" }, "board_86")
    expect(out.supplierBusinessName).toBe(STANDARD_QUOTE_SUPPLIER.businessName)
    expect(out.supplierContactPhone).toBe(STANDARD_QUOTE_SUPPLIER.contactPhone)
  })
})
