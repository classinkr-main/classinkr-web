import { describe, expect, it } from "vitest"

import {
  QUOTE_TEMPLATE_CATALOG,
  baseQuoteTemplateViews,
  canEditQuoteTemplate,
  getQuoteTemplateCatalogEntry,
  isQuoteTemplateVisibleTo,
  normalizeQuoteTemplateDefaults,
  quoteTemplateDiscountPercent,
  teamQuoteTemplateView,
  validateQuoteTemplateInput,
  type QuoteTeamTemplateRecord,
} from "@/lib/quote-team-templates"
import { getProductBySku } from "@/lib/product-templates"

// 견적 팀 템플릿 — 카탈로그 정가 · 공급자 1곳 규칙 · 할인 표시 · 가시성/수정 권한 · 기본값 정규화.

const hw = { name: "학원 2교실 패키지", productLine: "hardware", items: [{ sku: "board-86", quantity: 2, unitPrice: 5_900_000 }] }

function record(overrides: Partial<QuoteTeamTemplateRecord> = {}): QuoteTeamTemplateRecord {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    name: "t",
    productLine: "hardware",
    sourceTemplateId: null,
    items: [{ sku: "board-86", quantity: 2, unitPrice: 5_900_000 }, { sku: "camera-t1", quantity: 2, unitPrice: null }],
    defaults: normalizeQuoteTemplateDefaults({}),
    scope: "team",
    showInMenu: true,
    ownerUserId: "u1",
    ownerName: "Han",
    archivedAt: null,
    createdAt: "2026-10-12T00:00:00Z",
    updatedAt: "2026-10-12T00:00:00Z",
    ...overrides,
  }
}

describe("카탈로그", () => {
  it("정가는 getProductBySku 가 정본이고, 카탈로그 밖 템플릿 품목은 템플릿 라인 단가를 쓴다", () => {
    expect(getQuoteTemplateCatalogEntry("board-86")?.listPrice).toBe(getProductBySku("board-86")?.unit_price)
    expect(getQuoteTemplateCatalogEntry("classin-business-recharge")).toMatchObject({ listPrice: 2_000_000, productLine: "software" })
    expect(getQuoteTemplateCatalogEntry("online-suite-monthly")?.productLine).toBe("software")
    expect(getQuoteTemplateCatalogEntry("camera-t1")?.productLine).toBe("hardware")
    // 0원 안내 라인은 단가 조정 대상이 아니다.
    expect(getQuoteTemplateCatalogEntry("install-training")).toBeNull()
    expect(QUOTE_TEMPLATE_CATALOG.every((entry) => entry.listPrice > 0)).toBe(true)
  })

  it("기본 템플릿 뷰는 정가 그대로·수정 불가이고 공급자가 유형을 따른다", () => {
    const views = baseQuoteTemplateViews()
    const board = views.find((view) => view.id === "base:board_86")!
    expect(board).toMatchObject({ kind: "base", productLine: "hardware", supplierLabel: "퀴드러닝", canEdit: false, hasDiscount: false })
    expect(board.items.map((item) => item.sku)).toEqual(["board-86"])
    expect(views.find((view) => view.id === "base:business_recharge")).toMatchObject({ productLine: "software", supplierLabel: "클래스인" })
    expect(views.find((view) => view.id === "base:online_suite")?.showInMenu).toBe(false)
    expect(views.every((view) => view.items.length > 0)).toBe(true)
  })
})

describe("할인 표시", () => {
  it("정가보다 낮을 때만 소수 1자리 % — 승인 없이 표시만", () => {
    expect(quoteTemplateDiscountPercent(6_300_000, 5_900_000)).toBe(6.3)
    expect(quoteTemplateDiscountPercent(6_300_000, 6_300_000)).toBeNull()
    expect(quoteTemplateDiscountPercent(6_300_000, 7_000_000)).toBeNull()
  })

  it("팀 템플릿 뷰는 덮어쓰기 단가와 정가 합계를 함께 낸다", () => {
    const view = teamQuoteTemplateView(record(), true)
    expect(view.total).toBe(5_900_000 * 2 + 1_200_000 * 2)
    expect(view.listTotal).toBe(6_300_000 * 2 + 1_200_000 * 2)
    expect(view.hasDiscount).toBe(true)
    expect(view.items[0].discountPercent).toBe(6.3)
  })
})

describe("validateQuoteTemplateInput", () => {
  it("정상 입력을 정규화한다 — 정가와 같은 단가 덮어쓰기는 null 로 접는다", () => {
    const result = validateQuoteTemplateInput({
      ...hw,
      name: "  학원 2교실  ",
      items: [...hw.items, { sku: "camera-t1", quantity: 1, unitPrice: 1_200_000 }],
    })
    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({
        name: "학원 2교실",
        scope: "mine",
        showInMenu: false,
        items: [
          { sku: "board-86", quantity: 2, unitPrice: 5_900_000 },
          { sku: "camera-t1", quantity: 1, unitPrice: null },
        ],
      }),
    })
  })

  it("견적 1장 = 공급자 1곳 — HW 템플릿에 SW 품목을 섞으면 거절한다", () => {
    const result = validateQuoteTemplateInput({ ...hw, items: [...hw.items, { sku: "classin-business-recharge", quantity: 1 }] })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain("공급자 1곳")
  })

  it("원본 기본 템플릿과 유형이 다르면 거절한다", () => {
    expect(validateQuoteTemplateInput({ ...hw, sourceTemplateId: "business_recharge" }).ok).toBe(false)
    expect(validateQuoteTemplateInput({ ...hw, sourceTemplateId: "board_86" }).ok).toBe(true)
  })

  it.each([
    [{ name: "" }, "이름"],
    [{ productLine: "both" }, "유형"],
    [{ items: [] }, "1개 이상"],
    [{ items: [{ sku: "nope", quantity: 1 }] }, "카탈로그"],
    [{ items: [{ sku: "board-86", quantity: 0 }] }, "수량"],
    [{ items: [{ sku: "board-86", quantity: 1, unitPrice: -1 }] }, "단가"],
    [{ items: [{ sku: "board-86", quantity: 1 }, { sku: "board-86", quantity: 1 }] }, "두 번"],
    [{ defaults: { validityDays: 45 } }, "유효기한"],
    [{ defaults: { notePresetIds: ["made_up"] } }, "메모"],
    [{ scope: "public" }, "공개 범위"],
  ])("잘못된 값 %o 은 거절한다", (patch, needle) => {
    const result = validateQuoteTemplateInput({ ...hw, ...patch })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain(needle)
  })

  it("수정은 보낸 키만 바꾸고 나머지는 현재 값을 쓴다", () => {
    const current = record({ scope: "team", showInMenu: true })
    const result = validateQuoteTemplateInput({ name: "새 이름" }, current)
    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({ name: "새 이름", scope: "team", showInMenu: true, items: current.items }),
    })
    // 유형만 SW 로 바꾸면 남아 있는 HW 품목 때문에 거절된다.
    expect(validateQuoteTemplateInput({ productLine: "software" }, current).ok).toBe(false)
  })
})

describe("기본값·권한", () => {
  it("DB 의 모르는 기본값은 기본으로 접고 없는 메모 id 는 버린다", () => {
    expect(
      normalizeQuoteTemplateDefaults({ validityDays: 99, vat: "included", installation: "x", notePresetIds: ["general_validity", "zzz", "general_validity"] })
    ).toEqual({ validityDays: 30, vat: "included", installation: "included_quote", payment: "one_time", notePresetIds: ["general_validity"] })
  })

  it("'나만'은 소유자만 보고, 팀 템플릿 수정은 소유자 또는 관리자", () => {
    const mine = record({ scope: "mine" })
    expect(isQuoteTemplateVisibleTo(mine, { userId: "u1", isStaffAdmin: false })).toBe(true)
    expect(isQuoteTemplateVisibleTo(mine, { userId: "u2", isStaffAdmin: true })).toBe(false)
    expect(isQuoteTemplateVisibleTo(mine, { userId: null, isStaffAdmin: true })).toBe(false)

    const team = record({ scope: "team" })
    expect(canEditQuoteTemplate(team, { userId: "u2", isStaffAdmin: false })).toBe(false)
    expect(canEditQuoteTemplate(team, { userId: "u2", isStaffAdmin: true })).toBe(true)
    expect(canEditQuoteTemplate(mine, { userId: "u2", isStaffAdmin: true })).toBe(false)
  })
})
