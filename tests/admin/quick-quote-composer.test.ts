import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

describe("admin quick quote composer shell", () => {
  const source = readFileSync(
    join(process.cwd(), "components/portal/quotes/QuickQuoteComposer.tsx"),
    "utf8"
  )

  it("renders the quick quote overlay through a body portal", () => {
    expect(source).toContain('import { createPortal } from "react-dom"')
    expect(source).toContain("createPortal(")
    expect(source).toContain('data-testid="quick-quote-composer-overlay"')
    expect(source).toContain("document.body")
  })

  it("locks background scroll while the composer is open", () => {
    expect(source).toContain("previousBodyOverflow")
    expect(source).toContain('document.body.style.overflow = "hidden"')
    expect(source).toContain("document.body.style.overflow = previousBodyOverflow")
  })

  it("keeps mobile footer actions compact", () => {
    expect(source).toContain("grid w-full grid-cols-2 gap-2 sm:w-auto sm:flex sm:flex-wrap")
    // 미리보기 진입은 상단 바의 xl:hidden 버튼 하나로 모은다 —
    // 상시 숨김이던 푸터 중복 버튼('hidden xl:hidden')은 제거했다.
    expect(source).not.toContain('className="hidden xl:hidden"')
    expect(source).toContain("화면 미리보기")
  })

  it("uses the compact field tokens instead of the old h-10 form controls", () => {
    expect(source).toContain('const COMPACT_INPUT_CLASS = "h-9 text-[13px]"')
    expect(source).toContain("const COMPACT_SELECT_CLASS =")
    expect(source).not.toContain("h-10 w-full rounded-md border border-input")
    expect(source).not.toContain("flex h-10 w-full rounded-md border border-input")
  })

  it("orders the left column by the writing flow (01 고객 → 02 구성 → 03 조건 → 04 메모)", () => {
    const steps = ['step="01"', 'step="02"', 'step="03"', 'step="04"'].map((marker) =>
      source.indexOf(marker)
    )
    expect(steps.every((index) => index > 0)).toBe(true)
    expect([...steps].sort((left, right) => left - right)).toEqual(steps)
    expect(source).toContain('title="고객 · 거래"')
    expect(source).toContain('title="구성 · 품목"')
    expect(source).toContain('title="조건"')
    expect(source).toContain('title="메모"')
  })

  it("keeps the running total visible in the left column", () => {
    expect(source).toContain("text-[19px] font-bold leading-none tabular-nums text-[#111110]")
    expect(source).toContain("totals.grandTotalAmount")
  })

  it("offers a manager dropdown for the supplier contact without importing the admin client", () => {
    expect(source).toContain("supplierManagerOptions")
    expect(source).toContain('const MANAGER_CUSTOM_VALUE = "__custom__"')
    expect(source).toContain("handleManagerSelectionChange")
    // 포털에서도 쓰는 컴포저이므로 어드민 전용 훅/클라이언트를 직접 끌어오지 않는다.
    expect(source).not.toContain("useCrmOwners")
    expect(source).not.toContain("admin-client")
  })

  it("keeps validity and VAT as compact selects", () => {
    expect(source).toContain('aria-label="유효기한 빠른 선택"')
    expect(source).toContain('id="quote-vat-policy"')
    expect(source).toContain("validityPresetValue")
  })

  it("supports informational (금액 없는) line items and note presets", () => {
    expect(source).toContain("createInformationalQuoteLine")
    expect(source).toContain("정보 라인 추가")
    expect(source).toContain("function removeLine(")
    expect(source).toContain("getQuoteNotePresets")
    expect(source).toContain("appendQuoteNoteLine")
    expect(source).toContain("function QuoteNoteField(")
  })

  it("exposes a SW/HW segment in the composer header", () => {
    expect(source).toContain('aria-label="견적 유형"')
    expect(source).toContain("function handleProductLineChange(")
    expect(source).toContain("lastHardwareTemplateRef")
    // 전환 결과를 한 줄로 알린다(품목만 리셋, 고객·거래 유지).
    expect(source).toContain("고객·거래 입력은 유지됩니다")
    // 진행 스트립 · 푸터 타이틀에 현재 유형 표기
    expect(source).toContain('isSoftwareQuote ? "SW 견적" : "HW 견적"')
    expect(source).toContain('isSoftwareQuote ? "SW" : "HW"')
    // 저장 payload 로 유형이 전달돼 목록이 추정 없이 배지를 그린다.
    expect(source).toContain("templateId,")
  })

  it("reserves the solid green button for 발송 only", () => {
    expect(source).toContain('variant="ghost"')
    const solidGreenButtons = source.match(/h-9 bg-\[#084734\] text-\[13px\] text-white/g) ?? []
    // 작성 푸터의 발송 + 공유 시트의 완료, 두 개뿐이어야 한다.
    expect(solidGreenButtons).toHaveLength(2)
  })
})

describe("admin quotes shell — SW/HW 일급 개념", () => {
  const pageSource = readFileSync(join(process.cwd(), "app/admin/quotes/page.tsx"), "utf8")
  const panelSource = readFileSync(
    join(process.cwd(), "components/admin/documents/HardwareQuotesPanel.tsx"),
    "utf8"
  )

  it("목록 탭은 SW/HW 통합임을 드러내는 '견적서' 라벨을 쓴다", () => {
    expect(pageSource).toContain('label: "견적서"')
    expect(pageSource).not.toContain('label: "하드웨어 견적서"')
    // 결제 코드 탭은 별개 개념이라 이름을 유지한다.
    expect(pageSource).toContain('label: "SW 견적 코드"')
  })

  it("작성 진입은 SW/HW 명시 버튼 2개 + HW 프리셋 드롭다운이다", () => {
    expect(pageSource).toContain("SW 견적서")
    expect(pageSource).toContain("HW 견적서")
    expect(pageSource).toContain('onSelect("online_suite")')
    expect(pageSource).toContain('onSelect("new")')
    expect(pageSource).toContain("HARDWARE_QUOTE_PRESETS")
    expect(pageSource).toContain('aria-label="HW 견적 템플릿 선택"')
    // 유형이 드러나지 않던 단일 분할 버튼(QuoteCreateButton)은 2버튼 구성으로 대체됐다.
    expect(pageSource).toContain("function QuoteCreateButtons(")
    expect(pageSource).not.toContain("function QuoteCreateButton(")
  })

  it("목록에 유형 필터와 행 배지가 있다", () => {
    expect(panelSource).toContain("PRODUCT_LINE_OPTIONS")
    expect(panelSource).toContain('{ key: "software", label: "소프트웨어" }')
    expect(panelSource).toContain('{ key: "hardware", label: "하드웨어" }')
    expect(panelSource).toContain("productLineFilter")
    expect(panelSource).toContain("PRODUCT_LINE_BADGE[quote.productLine]")
    expect(panelSource).toContain("resolveQuoteProductLine")
    expect(panelSource).not.toContain("저장된 하드웨어 견적서가 없습니다")
  })
})
