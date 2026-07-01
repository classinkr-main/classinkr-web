import { describe, expect, it } from "vitest"
import {
  classifySalesLedgerProductCategory,
  classifySalesLedgerProductCategoryFromText,
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

  it("returns unknown for empty or generic REV text", () => {
    expect(classifySalesLedgerProductCategory({})).toBe("unknown")
    expect(
      classifySalesLedgerProductCategory({
        product: "v2",
        account: "Sunrise Academy",
        rawText: "renewal memo",
      }),
    ).toBe("unknown")
  })
})
