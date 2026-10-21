import { describe, expect, it } from "vitest"

import {
  quoteDetailsToTeamTemplateInput,
  teamTemplateViewToQuoteDetails,
} from "@/lib/quote-team-template-composer"
import {
  DEFAULT_QUOTE_TEMPLATE_DEFAULTS,
  teamQuoteTemplateView,
  validateQuoteTemplateInput,
  type QuoteTeamTemplateRecord,
} from "@/lib/quote-team-templates"
import { finalizeStandardQuoteDetails } from "@/lib/standard-quote-template"

function record(patch: Partial<QuoteTeamTemplateRecord>): QuoteTeamTemplateRecord {
  return {
    id: "tpl-1",
    name: "학원 2교실 패키지",
    productLine: "hardware",
    sourceTemplateId: "board_86",
    items: [],
    defaults: DEFAULT_QUOTE_TEMPLATE_DEFAULTS,
    scope: "team",
    showInMenu: false,
    ownerUserId: null,
    ownerName: null,
    archivedAt: null,
    createdAt: "2026-10-21T00:00:00Z",
    updatedAt: "2026-10-21T00:00:00Z",
    ...patch,
  }
}

const byCode = (details: ReturnType<typeof teamTemplateViewToQuoteDetails>, code: string) =>
  details?.lineItems?.find((line) => line.itemCode === code)

describe("teamTemplateViewToQuoteDetails", () => {
  it("짠 기본 템플릿 위에 수량·단가 덮어쓰기를 얹는다", () => {
    const view = teamQuoteTemplateView(
      record({
        items: [
          { sku: "board-86", quantity: 2, unitPrice: 5_900_000 },
          { sku: "camera-t1", quantity: 2, unitPrice: 1_000_000 },
          { sku: "wall-mount", quantity: 2, unitPrice: null },
        ],
        defaults: { ...DEFAULT_QUOTE_TEMPLATE_DEFAULTS, validityDays: 14, vat: "excluded", notePresetIds: ["general_payment_terms", "special_lead_time"] },
      }),
      true
    )
    const details = teamTemplateViewToQuoteDetails(view, "2026-10-21")

    expect(details?.templateId).toBe("board_86")
    expect(details?.optionSelections).toMatchObject({ mounting_option: "wall_mount", camera_bundle: true })
    expect(byCode(details, "board-86")).toMatchObject({ quantity: 2, unitPrice: 5_900_000, optionGroupId: "main_product" })
    expect(byCode(details, "camera-t1")).toMatchObject({ quantity: 2, unitPrice: 1_000_000 })
    expect(byCode(details, "wall-mount")).toMatchObject({ quantity: 2, unitPrice: 500_000 })
    // 대표·딸린 품목이 옵션으로 흡수돼 사용자 추가 행이 생기지 않는다.
    expect(details?.lineItems?.some((line) => line.isUserAdded)).toBe(false)
    expect(details?.validUntil).toBe("2026-11-04")
    expect(details?.vatIncluded).toBe(false)
    expect(details?.generalNotes).toContain("결제 조건")
    expect(details?.specialTerms).toContain("납기")
    // 작성기 finalize 를 거쳐도 합계가 덮어쓴 단가로 잡힌다.
    expect(finalizeStandardQuoteDetails(details, "board_86").subtotalAmount).toBe(
      2 * 5_900_000 + 2 * 1_000_000 + 2 * 500_000
    )
  })

  it("대표 수량과 다른 딸린 품목은 따로 행으로 붙이고 옵션은 끈다", () => {
    const view = teamQuoteTemplateView(
      record({ items: [{ sku: "board-86", quantity: 3, unitPrice: null }, { sku: "camera-t1", quantity: 1, unitPrice: null }] }),
      true
    )
    const details = teamTemplateViewToQuoteDetails(view, "2026-10-21")

    expect(details?.optionSelections).toMatchObject({ camera_bundle: false, mounting_option: "none" })
    expect(byCode(details, "camera-t1")).toMatchObject({ quantity: 1, isUserAdded: true })
    expect(details?.lineItems?.map((line) => line.lineNumber)).toEqual(details?.lineItems?.map((_, index) => index + 1))
  })

  it("대표 품목이 없는 템플릿은 기본 대표 행 없이 품목 행만 쓴다", () => {
    const view = teamQuoteTemplateView(
      record({ sourceTemplateId: null, items: [{ sku: "bundle-86-t1-wall", quantity: 2, unitPrice: null }] }),
      true
    )
    const details = teamTemplateViewToQuoteDetails(view, "2026-10-21")

    expect(details?.lineItems?.some((line) => line.optionGroupId === "main_product")).toBe(false)
    expect(byCode(details, "bundle-86-t1-wall")).toMatchObject({ quantity: 2, isUserAdded: true })
  })

  it("SW 템플릿은 SW 기본 템플릿으로 펼친다(공급자 클래스인)", () => {
    const view = teamQuoteTemplateView(
      record({
        productLine: "software",
        sourceTemplateId: null,
        items: [{ sku: "classin-business-recharge", quantity: 1, unitPrice: 3_500_000 }],
      }),
      true
    )
    const details = teamTemplateViewToQuoteDetails(view, "2026-10-21")

    expect(details?.templateId).toBe("business_recharge")
    expect(byCode(details, "classin-business-recharge")).toMatchObject({ unitPrice: 3_500_000 })
  })

  it("품목이 없으면 null", () => {
    expect(teamTemplateViewToQuoteDetails(teamQuoteTemplateView(record({ items: [] }), true), "2026-10-21")).toBeNull()
  })
})

describe("quoteDetailsToTeamTemplateInput", () => {
  it("뷰 → 작성기 → 저장 입력이 서버 검증을 통과하고 원래 품목으로 돌아온다", () => {
    const items = [
      { sku: "board-86", quantity: 2, unitPrice: 5_900_000 },
      { sku: "camera-t1", quantity: 2, unitPrice: null },
      { sku: "wall-mount", quantity: 2, unitPrice: null },
    ]
    const details = teamTemplateViewToQuoteDetails(
      teamQuoteTemplateView(
        record({ items, defaults: { ...DEFAULT_QUOTE_TEMPLATE_DEFAULTS, validityDays: 60, notePresetIds: ["general_vat"] } }),
        true
      ),
      "2026-10-21"
    )
    const input = quoteDetailsToTeamTemplateInput("  재저장  ", details!)

    expect(input).toMatchObject({
      name: "재저장",
      productLine: "hardware",
      sourceTemplateId: "board_86",
      scope: "team",
      showInMenu: false,
      defaults: { validityDays: 60, vat: "excluded", notePresetIds: ["general_vat"] },
    })
    expect(input?.items).toEqual(expect.arrayContaining(items))
    expect(input?.items).toHaveLength(items.length)
    const validated = validateQuoteTemplateInput(input as unknown as Record<string, unknown>)
    expect(validated.ok).toBe(true)
  })

  it("카탈로그 밖 행(0원 안내·정보 라인)은 빼고 같은 품목은 수량을 합친다", () => {
    const input = quoteDetailsToTeamTemplateInput("t", {
      templateId: "board_75",
      issuedAt: "2026-10-21",
      validUntil: "2026-10-28",
      lineItems: [
        { sortOrder: 1, lineNumber: 1, itemType: "hardware", itemCode: "board-75", itemName: "75", quantity: 1, unitPrice: 5_400_000 },
        { sortOrder: 2, lineNumber: 2, itemType: "service", itemCode: "install-training", itemName: "설치", quantity: 1, unitPrice: 0 },
        { sortOrder: 3, lineNumber: 3, itemType: "note_only", itemName: "안내", lineStatus: "informational" },
        { sortOrder: 4, lineNumber: 4, itemType: "hardware", itemCode: "stand", itemName: "스탠드", quantity: 1, unitPrice: 500_000 },
        { sortOrder: 5, lineNumber: 5, itemType: "hardware", itemCode: "stand", itemName: "스탠드", quantity: 2, unitPrice: 500_000 },
      ],
    })

    expect(input?.items).toEqual([
      { sku: "board-75", quantity: 1, unitPrice: null },
      { sku: "stand", quantity: 3, unitPrice: null },
    ])
    expect(input?.defaults.validityDays).toBe(14)
  })

  it("저장할 카탈로그 품목이 없으면 null", () => {
    expect(quoteDetailsToTeamTemplateInput("t", { templateId: "board_86", lineItems: [] })).toBeNull()
  })
})
