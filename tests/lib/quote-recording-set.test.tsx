// 녹화 세트(86"·75") 템플릿 재점검 — 할부 안내·안내 행 표기·작성기 패키지 동작.
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import QuoteDocumentPreview from "@/components/portal/quotes/QuoteDocumentPreview"
import {
  buildConfigurableStandardQuoteDetails,
  finalizeStandardQuoteDetails,
  getQuoteInstallmentNote,
  isQuoteNoteLine,
} from "@/lib/standard-quote-template"

const composerSource = readFileSync(join(process.cwd(), "components/portal/quotes/QuickQuoteComposer.tsx"), "utf8")

describe("녹화 세트 12개월 할부 안내", () => {
  it("고객 문서(공유 링크·내부 보기·PDF)에 월 납입액이 찍힌다 — 할인·VAT 반영 총액 ÷ 12", () => {
    const installment = buildConfigurableStandardQuoteDetails({
      templateId: "recording_studio_75",
      optionSelections: { payment_plan: "12_month" },
    })
    expect(getQuoteInstallmentNote(installment)).toBe("12개월 할부 시 월 약 616,667원 (VAT 포함)")

    const discounted = finalizeStandardQuoteDetails(
      { ...installment, vatIncluded: false, quoteDiscount: { mode: "amount", value: 200_000 } },
      "recording_studio_75"
    )
    // (7,400,000 − 200,000) × 1.1 = 7,920,000 → 월 660,000
    expect(getQuoteInstallmentNote(discounted)).toBe("12개월 할부 시 월 약 660,000원 (VAT 포함)")
    expect(renderToStaticMarkup(<QuoteDocumentPreview quote={discounted} />)).toContain("월 약 660,000원")
  })

  it("일시납·다른 템플릿에는 할부 안내가 없다", () => {
    expect(getQuoteInstallmentNote(buildConfigurableStandardQuoteDetails({ templateId: "recording_studio" }))).toBeNull()
    expect(
      getQuoteInstallmentNote(
        buildConfigurableStandardQuoteDetails({ templateId: "board_86", optionSelections: { payment_plan: "12_month" } })
      )
    ).toBeNull()
  })

  it("작성기는 같은 안내를 따로 그리지 않는다(견적서 렌더러 한 곳)", () => {
    expect(composerSource).not.toContain("12개월 분할 시 월 약")
  })
})

describe("안내 행 표기", () => {
  it("조건·할부 안내 행은 견적서에서 수량·단가·금액이 0 이 아니라 '–' 로 찍힌다", () => {
    const quote = buildConfigurableStandardQuoteDetails({
      templateId: "recording_studio",
      optionSelections: { payment_plan: "12_month" },
    })
    const condition = quote.lineItems?.find((line) => line.itemCode === "recording-studio-condition")
    expect(condition && isQuoteNoteLine(condition)).toBe(true)

    const html = renderToStaticMarkup(<QuoteDocumentPreview quote={quote} />)
    const row = html.split("12개월 할부 안내")[1].split("</tr>")[0]
    expect(row).not.toMatch(/<td>0<\/td>/)
    expect(row.match(/<td>–<\/td>/g)?.length).toBe(3)
  })
})

describe("작성기 패키지 동작", () => {
  it("단품 장에 녹화 세트·번들을 누르면 행을 덧붙이지 않고 장을 패키지로 바꾼다", () => {
    expect(composerSource).toContain('item.group === "package" && item.presetId && !isPackageSheet(sheet) && !hasUserRows')
    expect(composerSource).toContain("function isPackageSheet(sheet: ComposerSheet)")
  })

  it("번들은 녹화 제외임을 레일에 드러낸다", () => {
    expect(composerSource).toContain(`description: '86" + T1 + 벽걸이 · 녹화 제외'`)
  })

  it("저장 후 다시 저장·보내기는 같은 견적의 다음 버전으로 올린다(중복 견적 방지)", () => {
    expect(composerSource).toContain("savedDocsRef.current[sheet.line]")
    expect(composerSource).toContain("/quotes/${saved.document.id}/versions")
  })

  it("판매 중단 상품(AI Suite) 견적은 복제하지 않는다", () => {
    expect(composerSource).toContain("판매가 중단된 상품(구독형 AI Suite) 견적은 복제할 수 없습니다.")
  })
})

describe("공유 페이지 내부 열람", () => {
  it("어드민 로그인 상태로 연 공유 링크는 고객 열람으로 기록하지 않는다", () => {
    const page = readFileSync(join(process.cwd(), "app/share/quote/[token]/page.tsx"), "utf8")
    expect(page).toContain("const internalViewer = Boolean(await resolveAdminShellSession())")
    expect(page).toContain("if (deal && !internalViewer) {")
  })
})
