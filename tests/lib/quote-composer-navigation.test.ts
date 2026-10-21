import { describe, expect, it } from "vitest"
import { clearQuoteComposerIntent, normalizeQuoteQuickAction, quoteComposerMode } from "@/lib/quote-composer-navigation"
import { buildConfigurableStandardQuoteDetails, STANDARD_QUOTE_TEMPLATES } from "@/lib/standard-quote-template"

describe("견적 작성 진입과 종료", () => {
  it("SW 충전형을 포함해 모든 표준 견적 딥링크를 인식한다", () => {
    for (const template of STANDARD_QUOTE_TEMPLATES) {
      expect(normalizeQuoteQuickAction(template.id)).toBe(template.id)
    }
    expect(normalizeQuoteQuickAction("quick")).toBe("new")
    expect(normalizeQuoteQuickAction("unknown")).toBeNull()
    expect(normalizeQuoteQuickAction(null)).toBeNull()
  })

  it("한 번 연 작성 의도를 지우고 목록 필터를 보존한다", () => {
    const input = new URL("https://classin.co.kr/admin/quotes?tab=hardware&action=business_recharge&quick=new&dealId=d1&customerName=Test&owner=me#list")
    const closed = clearQuoteComposerIntent(input)
    expect(closed.href).toBe("https://classin.co.kr/admin/quotes?tab=hardware&owner=me#list")
    expect(input.searchParams.get("action")).toBe("business_recharge")
    expect(clearQuoteComposerIntent(closed).href).toBe(closed.href)
  })

  it("구 고객·거래 별칭도 작성기 재진입 트리거로 남기지 않는다", () => {
    const url = clearQuoteComposerIntent(new URL("https://classin.co.kr/admin/quotes?customer=c1&deal=d1&customerId=c1"))
    expect(url.search).toBe("")
  })
})

describe("SW 단독과 AI Suite 상품 경계", () => {
  it("SW 단독 카탈로그에는 장비나 AI Suite가 들어가지 않는다", () => {
    const templates = STANDARD_QUOTE_TEMPLATES.filter((t) => quoteComposerMode(t.id) === "software")
    expect(templates.map((t) => t.id)).toEqual(["business_recharge"])
    const quote = buildConfigurableStandardQuoteDetails({ templateId: templates[0].id })
    expect(quote.lineItems?.some((line) => line.itemType === "hardware")).toBe(false)
    expect(quote.lineItems?.some((line) => line.itemCode === "classin-business-recharge")).toBe(true)
  })

  it("AI Suite는 HW+SW가 포함된 단일 월 구독 견적이다", () => {
    expect(quoteComposerMode("online_suite")).toBe("suite")
    const quote = buildConfigurableStandardQuoteDetails({ templateId: "online_suite" })
    const subscription = quote.lineItems?.find((line) => line.itemCode === "online-suite-monthly")
    expect(subscription?.itemDescription).toContain("전자칠판")
    expect(subscription?.unitPrice).toBe(400_000)
    expect(quote.lineItems?.some((line) => line.itemType === "hardware" && Number(line.unitPrice) > 0)).toBe(false)
  })
})
