import { describe, expect, it } from "vitest"

import {
  DEFAULT_HARDWARE_QUOTE_TEMPLATE_ID,
  DEFAULT_SOFTWARE_QUOTE_TEMPLATE_ID,
  QUOTE_NOTE_PRESETS,
  appendQuoteNoteLine,
  buildConfigurableStandardQuoteDetails,
  createInformationalQuoteLine,
  finalizeStandardQuoteDetails,
  getQuoteNotePresets,
  getQuoteProductLineLabel,
  getQuoteProductLineTemplateId,
  getStandardQuoteDefaultSelections,
  isSoftwareQuoteTemplate,
  quoteNoteHasLine,
  resolveQuoteProductLine,
} from "@/lib/standard-quote-template"

describe("QUOTE_NOTE_PRESETS", () => {
  it("id 는 유일하고 label/text 는 비어 있지 않다", () => {
    const ids = QUOTE_NOTE_PRESETS.map((preset) => preset.id)
    expect(new Set(ids).size).toBe(ids.length)

    for (const preset of QUOTE_NOTE_PRESETS) {
      expect(preset.label.trim().length).toBeGreaterThan(0)
      expect(preset.text.trim().length).toBeGreaterThan(0)
      // 칩 라벨은 짧게(한 줄 유지), 본문은 라벨보다 길다.
      expect(preset.label.length).toBeLessThanOrEqual(10)
      expect(preset.text.length).toBeGreaterThan(preset.label.length)
      // 메모는 줄 단위로 추가되므로 프리셋 문구에 개행이 있으면 안 된다.
      expect(preset.text).not.toContain("\n")
    }
  })

  it("general/special 각각 5~7개를 제공한다", () => {
    for (const group of ["general", "special"] as const) {
      const presets = getQuoteNotePresets(group)
      expect(presets.length).toBeGreaterThanOrEqual(5)
      expect(presets.length).toBeLessThanOrEqual(7)
      expect(presets.every((preset) => preset.group === group)).toBe(true)
    }
  })
})

describe("appendQuoteNoteLine", () => {
  const [preset] = getQuoteNotePresets("general")

  it("빈 메모에는 문구만 남고, 기존 메모에는 새 줄로 붙는다", () => {
    expect(appendQuoteNoteLine("", preset.text)).toBe(preset.text)
    expect(appendQuoteNoteLine("납품장소: 구매처 지정장소", preset.text)).toBe(
      `납품장소: 구매처 지정장소\n${preset.text}`
    )
  })

  it("이미 들어간 문구는 다시 붙이지 않는다(칩 비활성 판정과 동일 기준)", () => {
    const once = appendQuoteNoteLine("납품장소: 구매처 지정장소", preset.text)
    expect(appendQuoteNoteLine(once, preset.text)).toBe(once)
    expect(quoteNoteHasLine(once, preset.text)).toBe(true)
    expect(quoteNoteHasLine(once, "들어간 적 없는 문구")).toBe(false)
  })

  it("빈 문구는 원본을 바꾸지 않는다", () => {
    expect(appendQuoteNoteLine("기존 메모", "   ")).toBe("기존 메모")
    expect(quoteNoteHasLine("기존 메모", "  ")).toBe(false)
  })
})

describe("resolveQuoteProductLine", () => {
  it("templateId 를 알면 그것이 정본이다", () => {
    expect(resolveQuoteProductLine({ templateId: "online_suite" })).toBe("software")
    expect(resolveQuoteProductLine({ templateId: "board_86" })).toBe("hardware")
    // 제목이 반대로 읽혀도 templateId 가 이긴다.
    expect(resolveQuoteProductLine({ templateId: "board_86", title: "소프트웨어 견적서" })).toBe(
      "hardware"
    )
  })

  it("templateId 가 없으면 제목·거래명으로 SW 를 알아본다", () => {
    // 실제 운영 견적(Q-2026-009/010) 제목 형태
    expect(
      resolveQuoteProductLine({ title: "갈무리국어학원 소프트웨어(Enterprise) 견적서" })
    ).toBe("software")
    // 표준 SW 템플릿으로 만든 제목
    expect(resolveQuoteProductLine({ title: "○○학원 구독형 AI Suite 견적서" })).toBe("software")
    expect(resolveQuoteProductLine({ title: "테스트", dealTitle: "AI Suite 36개월" })).toBe(
      "software"
    )
  })

  it("HW 견적과 판정 불가 행은 하드웨어로 본다", () => {
    expect(resolveQuoteProductLine({ title: '○○학원 전자칠판 86" 견적서' })).toBe("hardware")
    expect(resolveQuoteProductLine({ title: "○○학원 올인원 녹화수업 세트 견적서" })).toBe(
      "hardware"
    )
    expect(resolveQuoteProductLine({})).toBe("hardware")
    expect(resolveQuoteProductLine({ title: "  ", dealTitle: null })).toBe("hardware")
  })

  it("대표 템플릿과 배지 라벨이 제품군과 일치한다", () => {
    expect(getQuoteProductLineTemplateId("software")).toBe(DEFAULT_SOFTWARE_QUOTE_TEMPLATE_ID)
    expect(getQuoteProductLineTemplateId("hardware")).toBe(DEFAULT_HARDWARE_QUOTE_TEMPLATE_ID)
    expect(isSoftwareQuoteTemplate(DEFAULT_SOFTWARE_QUOTE_TEMPLATE_ID)).toBe(true)
    expect(isSoftwareQuoteTemplate(DEFAULT_HARDWARE_QUOTE_TEMPLATE_ID)).toBe(false)
    expect(getQuoteProductLineLabel("software")).toBe("SW")
    expect(getQuoteProductLineLabel("hardware")).toBe("HW")
  })
})

describe("createInformationalQuoteLine", () => {
  const defaults = getStandardQuoteDefaultSelections("board_86")
  const base = buildConfigurableStandardQuoteDetails({
    templateId: "board_86",
    input: {},
    optionSelections: defaults,
  })

  function withNoteLine() {
    const items = base.lineItems ?? []
    return finalizeStandardQuoteDetails(
      {
        ...base,
        lineItems: [
          ...items,
          createInformationalQuoteLine({
            itemName: "납품 조건",
            itemDescription: "설치 배송비 포함",
            sortOrder: items.length + 1,
          }),
        ],
      },
      "board_86"
    )
  }

  it("finalize 를 통과하고 합계에 잡히지 않는다", () => {
    const result = withNoteLine()
    const note = result.lineItems?.at(-1)

    expect(note?.itemType).toBe("note_only")
    expect(note?.lineStatus).toBe("informational")
    expect(note?.isUserAdded).toBe(true)
    // 금액 없는 라인이라 공급가액은 비고, 총액/미정 여부는 그대로다.
    expect(note?.lineSupplyAmount).toBeUndefined()
    expect(note?.unitPrice).toBeUndefined()
    expect(result.subtotalAmount).toBe(base.subtotalAmount)
    expect(result.grandTotalAmount).toBe(base.grandTotalAmount)
    expect(result.hasPendingAmounts).toBe(base.hasPendingAmounts)
  })

  it("제목을 비우면 기본 구분명을 쓴다", () => {
    const line = createInformationalQuoteLine({ itemDescription: "현장 실측 후 확정" })
    expect(line.itemName).toBe("안내")
    expect(line.itemDescription).toBe("현장 실측 후 확정")
    expect(line.quantity).toBeUndefined()
  })

  it("옵션/수량을 바꿔 재생성해도 사용자가 추가한 정보 라인은 살아남는다", () => {
    const rebuilt = buildConfigurableStandardQuoteDetails({
      templateId: "board_86",
      input: withNoteLine(),
      optionSelections: { ...defaults, camera_bundle: true },
      baseQuantity: 3,
    })

    const note = rebuilt.lineItems?.find((line) => line.isUserAdded === true)
    expect(note?.itemName).toBe("납품 조건")
    expect(note?.itemDescription).toBe("설치 배송비 포함")
    expect(note?.lineSupplyAmount).toBeUndefined()
    // 재생성 라인 뒤에 붙고 번호는 다시 매겨진다.
    expect(note?.lineNumber).toBe(rebuilt.lineItems?.length)
    // 템플릿 라인은 정상적으로 재생성된다(카메라 번들 추가 + 수량 3대).
    expect(rebuilt.lineItems?.some((line) => line.itemCode === "camera-t1")).toBe(true)
    expect(rebuilt.lineItems?.[0]?.quantity).toBe(3)
  })
})
