import { describe, expect, it } from "vitest"
import {
  classifySalesLedgerProductCategory,
  classifySalesLedgerProductCategoryFromText,
  classifySalesLedgerSoftwareSubtype,
} from "../../lib/branch/product-category"

describe("classifySalesLedgerProductCategory", () => {
  it("classifies software from English product text", () => {
    expect(
      classifySalesLedgerProductCategory({
        product: "ClassIn Learning Space annual subscription - 120 accounts",
      }),
    ).toBe("software")
  })

  it("classifies software from Korean account text when product is blank", () => {
    expect(
      classifySalesLedgerProductCategory({
        account: "ClassIn \uB77C\uC774\uC120\uC2A4 50\uACC4\uC815 \uAD6C\uB3C5",
      }),
    ).toBe("software")
  })

  it("classifies hardware from English product text", () => {
    expect(
      classifySalesLedgerProductCategory({
        product: '86" IFP + OPS module',
      }),
    ).toBe("hardware")
  })

  it("classifies hardware from Korean raw text", () => {
    expect(
      classifySalesLedgerProductCategoryFromText(
        "\uC804\uC790\uCE60\uD310 \uBCF4\uB4DC \uCE74\uBA54\uB77C \uC124\uCE58",
      ),
    ).toBe("hardware")
  })

  it("lets explicit product text outrank weaker account cues", () => {
    expect(
      classifySalesLedgerProductCategory({
        product: "75 IFP smart board",
        account: "ClassIn \uACC4\uC815 \uB2F4\uB2F9",
      }),
    ).toBe("hardware")
  })

  it("reads raw snapshot objects without dependencies", () => {
    expect(
      classifySalesLedgerProductCategory({
        rawText: {
          row: ["renewal", "Business plan", "cloud license"],
          note: "FY renewal",
        },
      }),
    ).toBe("software")
  })

  it("falls back to software for empty or generic REV text (HW 아니면 SW 규칙)", () => {
    expect(classifySalesLedgerProductCategory({})).toBe("software")
    expect(
      classifySalesLedgerProductCategory({
        product: "v2",
        account: "Sunrise Academy",
        rawText: "renewal memo",
      }),
    ).toBe("software")
  })

  it("keeps hardware when hardware signals outrank software signals", () => {
    expect(
      classifySalesLedgerProductCategory({
        product: "86 IFP whiteboard + ClassIn license bundle",
      }),
    ).toBe("hardware")
  })
})

describe("classifySalesLedgerSoftwareSubtype", () => {
  it("classifies subscription from English and Korean cues", () => {
    expect(classifySalesLedgerSoftwareSubtype({ product: "ClassIn annual subscription 120 seats" })).toBe("subscription")
    expect(classifySalesLedgerSoftwareSubtype({ product: "연간 구독 50계정" })).toBe("subscription")
  })

  it("classifies recharge from consumption cues", () => {
    expect(classifySalesLedgerSoftwareSubtype({ product: "Business Consumption" })).toBe("recharge")
    expect(classifySalesLedgerSoftwareSubtype({ product: "포인트 충전" })).toBe("recharge")
  })

  it("falls back to other when signals are absent", () => {
    expect(classifySalesLedgerSoftwareSubtype({ product: "Nobook" })).toBe("other")
    expect(classifySalesLedgerSoftwareSubtype({})).toBe("other")
  })
})
