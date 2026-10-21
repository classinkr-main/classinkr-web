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

  it("keeps header actions compact on mobile", () => {
    expect(source).toContain("grid w-full grid-cols-3 gap-2 sm:w-auto sm:flex sm:flex-wrap")
    // 종이 자체가 화면이라 별도 미리보기 패널/모바일 미리보기 오버레이는 없다.
    expect(source).not.toContain("QuotePreviewPanel")
    expect(source).not.toContain("mobilePreviewOpen")
  })

  it("edits the quote directly on the paper (수신·참조·발행일·유효기한·품목·세부내역·기타사항)", () => {
    expect(source).toContain("<QuoteDocumentPreview")
    expect(source).toContain('aria-label="수신 고객사"')
    expect(source).toContain('aria-label="참조"')
    expect(source).toContain('aria-label="발행일"')
    expect(source).toContain('aria-label="유효기한"')
    expect(source).toContain('aria-label="품목명"')
    expect(source).toContain('aria-label="세부 내역"')
    expect(source).toContain('label="기타사항"')
    // 수신 칸 하나로 기존 고객(자동완성 일치)과 새 고객을 가른다.
    expect(source).toContain('list="quick-quote-customer-options"')
    expect(source).toContain("function handleRecipientChange(")
  })

  it("shows a pre-send check line with missing values in amber", () => {
    expect(source).toContain('aria-label="발송 전 확인"')
    expect(source).toContain('"수신 비어 있음"')
    expect(source).toContain('font-semibold text-[#7A520F]')
  })

  it("has the 4-part left rail: 최근 견적 복제 → 빠른 조합 → 템플릿 → 품목", () => {
    const sections = ["최근 견적 복제", "빠른 조합", "템플릿</p>", "품목 · 눌러서 추가"].map((marker) =>
      source.indexOf(marker)
    )
    expect(sections.every((index) => index > 0)).toBe(true)
    expect([...sections].sort((left, right) => left - right)).toEqual(sections)
    expect(source).not.toContain('"녹화 세트 + AI Suite"')
    expect(source).toContain("visibleTemplates.map(")
    // 팀 템플릿(DB)은 목록만 꽂을 자리
    expect(source).toContain("teamTemplates?: QuickQuoteTeamTemplate[]")
    expect(source).toContain("function handleCatalogAdd(")
  })

  it("clones a recent quote but clears only the customer, with stale-price reset", () => {
    expect(source).toContain("async function handleReuseQuote(")
    expect(source).toContain('setRecipientInput("")')
    expect(source).toContain("border border-[#084734] bg-white")
    expect(source).toContain("옛 단가 {staleLines.length}건 → 지금 정가로")
  })

  it("marks manual unit prices against list price without an approval step", () => {
    expect(source).toContain("function getListPrice(")
    expect(source).toContain("% 할인`")
    expect(source).toContain("% 인상`")
    expect(source).toContain("· 정가로")
  })

  it("splits SW/HW into one sheet per supplier and saves one quote per sheet", () => {
    expect(source).toContain("function withSheet(")
    expect(source).toContain("resolveQuoteSupplier(sheet.templateId)")
    expect(source).toContain("for (const { sheet, quote } of targets)")
    expect(source).toContain("견적서가 <b className=\"text-[#111110]\">2장</b>으로 나뉩니다")
    // 묶음 링크 1개는 미결정 — 링크 2개를 한 메시지에 담는다.
    expect(source).toContain("links: ShareLink[]")
    expect(source).toContain("function buildQuoteShareText(")
  })

  it("keeps the save contract (structured_json.quoteDetails + finalize)", () => {
    expect(source).toContain("structured_json: {")
    expect(source).toContain("quoteDetails: preparedQuote,")
    expect(source).toContain("finalizeStandardQuoteDetails(")
    expect(source).toContain("templateId: sheet.templateId,")
  })

  it("keeps the running total visible on each sheet", () => {
    expect(source).toContain("quote={quote}")
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
    expect(source).toContain('id={index === 0 ? "quote-vat-policy" : undefined}')
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

  it("reserves the solid green button for 보내기 only", () => {
    expect(source).toContain('aria-label="견적 작성 닫기"')
    const solidGreenButtons = source.match(/h-9 bg-\[#084734\] text-\[13px\] text-white/g) ?? []
    // 헤더의 보내기 + 보내기 줄의 완료, 두 개뿐이어야 한다.
    expect(solidGreenButtons).toHaveLength(2)
  })

  it("distinguishes standalone SW from packages and provides recharge price edit with under-2M confirmation modal", () => {
    // 패키지 상품 분리 (online_suite, recording_studio, bundle은 package)
    expect(source).toContain('group: "package"')
    expect(source).toContain('group: "software"')
    expect(source).toContain('badge: "학원 패키지"')
    expect(source).toContain('badge: "SW 단독"')

    // ClassIn Business 충전형 전용 직접 금액 수정
    expect(source).toContain("충전 금액 설정")
    expect(source).toContain("가격 직접 수정 가능")
    expect(source).toContain("requestSetRechargeAmount")
    expect(source).toContain("applyRechargeAmount")

    // 200만원 미만 예외 발행 확인 모달
    expect(source).toContain("200만원 미만 예외 발행 확인")
    expect(source).toContain("underMinModalOpen")
    expect(source).toContain("confirmUnderMinRecharge")
    expect(source).toContain("cancelUnderMinRecharge")
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

  it("작성 진입은 SW 단독/HW/AI Suite와 HW 프리셋 드롭다운이다", () => {
    expect(pageSource).toContain("SW 단독 견적서")
    expect(pageSource).toContain("HW 견적서")
    expect(pageSource).toContain('onSelect("business_recharge")')
    expect(pageSource).toContain('onSelect("new")')
    expect(pageSource).toContain('onSelect("online_suite")')
    expect(pageSource).toContain("HARDWARE_QUOTE_PRESETS")
    expect(pageSource).toContain('aria-label="HW 견적 템플릿 선택"')
    // 유형이 드러나지 않던 단일 버튼은 유형별 진입으로 대체됐다.
    expect(pageSource).toContain("function QuoteCreateButtons(")
    expect(pageSource).not.toContain("function QuoteCreateButton(")
  })

  it("목록에 유형 필터와 행 배지가 있다", () => {
    expect(panelSource).toContain("PRODUCT_LINE_OPTIONS")
    expect(panelSource).toContain('{ key: "software", label: "SW" }')
    expect(panelSource).toContain('{ key: "hardware", label: "HW" }')
    expect(panelSource).toContain("productLineFilter")
    expect(panelSource).toContain("PRODUCT_LINE_META[quote.productLine]")
    expect(panelSource).toContain("resolveQuoteProductLine")
    expect(panelSource).not.toContain("저장된 하드웨어 견적서가 없습니다")
  })
})

describe("admin quotes shell — 팀 템플릿 연결", () => {
  const composerSource = readFileSync(
    join(process.cwd(), "components/portal/quotes/QuickQuoteComposer.tsx"),
    "utf8"
  )
  const panelSource = readFileSync(
    join(process.cwd(), "components/admin/documents/HardwareQuotesPanel.tsx"),
    "utf8"
  )

  it("작성기는 저장을 주입받은 콜백으로만 한다(어드민 클라이언트 import 없음)", () => {
    expect(composerSource).toContain("onSaveTemplate?: (draft: { name: string; details: PartnerQuoteDetailsInput }) => Promise<void>")
    expect(composerSource).toContain("이 구성을 템플릿으로 저장")
    // 템플릿은 공급자 1곳 기준 — 2장으로 나뉘면 저장을 막는다.
    expect(composerSource).toContain("disabled={isSplit || sheets.length === 0}")
    expect(composerSource).not.toContain("@/lib/admin-client")
  })

  it("패널이 팀 템플릿을 불러와 넘기고, 실패하면 기본 템플릿만 쓴다", () => {
    expect(panelSource).toContain('const QUOTE_TEMPLATES_API = "/api/admin/quote-templates"')
    expect(panelSource).toContain("teamTemplateViewToQuoteDetails(view, today)")
    expect(panelSource).toContain("setTeamTemplates([])")
    expect(panelSource).toContain("quoteDetailsToTeamTemplateInput(draft.name, draft.details)")
    expect(panelSource).toContain("teamTemplates={teamTemplates}")
    expect(panelSource).toContain("onSaveTemplate={handleSaveTemplate}")
  })
})
