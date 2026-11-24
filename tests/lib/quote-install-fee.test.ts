import { describe, expect, it } from "vitest"

import {
  buildConfigurableStandardQuoteDetails,
  getStandardQuoteOptionGroups,
  INSTALL_FEE_ITEM_CODE,
  type StandardQuoteTemplateId,
} from "@/lib/standard-quote-template"
import { HARDWARE_INSTALL_PRICE_KRW } from "@/lib/billing/hardware-catalog"

// "설치비 추가" 옵션(2026-11-24) — 하드웨어 템플릿 공통 토글, 기본 꺼짐, 금액 수정 가능.
const HARDWARE: StandardQuoteTemplateId[] = ["board_86", "board_75", "camera_t1", "recording_studio", "recording_studio_75"]

function build(templateId: StandardQuoteTemplateId, selections: Record<string, string | boolean>, baseQuantity = 1, existing?: Parameters<typeof buildConfigurableStandardQuoteDetails>[0]["input"]) {
  return buildConfigurableStandardQuoteDetails({
    templateId,
    input: existing ?? { templateId },
    optionSelections: selections,
    baseQuantity,
  })
}

const installLine = (details: ReturnType<typeof build>) =>
  (details.lineItems ?? []).find((line) => line.itemCode === INSTALL_FEE_ITEM_CODE)

describe("설치비 추가 옵션", () => {
  it.each(HARDWARE)("%s 에 토글이 있고 기본은 꺼짐", (templateId) => {
    const group = getStandardQuoteOptionGroups(templateId).find((item) => item.id === "install_fee")
    expect(group?.control).toBe("toggle")
    expect(group?.defaultValue).toBe(false)
  })

  it("소프트웨어 템플릿에는 없다", () => {
    expect(getStandardQuoteOptionGroups("business_recharge").some((item) => item.id === "install_fee")).toBe(false)
  })

  it.each(HARDWARE)("%s — 꺼져 있으면 행이 없고, 켜면 대표 수량만큼 기본 단가로 붙는다", (templateId) => {
    expect(installLine(build(templateId, {}, 3))).toBeUndefined()
    const line = installLine(build(templateId, { install_fee: true }, 3))
    expect(line).toBeDefined()
    expect(line?.quantity).toBe(3)
    expect(line?.unitPrice).toBe(HARDWARE_INSTALL_PRICE_KRW)
    expect(line?.priceLocked).toBe(false)
  })

  it("작성자가 고친 금액은 옵션을 다시 계산해도 남는다", () => {
    const first = build("board_86", { install_fee: true }, 2)
    const edited = {
      ...first,
      lineItems: (first.lineItems ?? []).map((line) =>
        line.itemCode === INSTALL_FEE_ITEM_CODE ? { ...line, unitPrice: 300_000 } : line
      ),
    }
    const rebuilt = build("board_86", { install_fee: true, camera_bundle: true }, 2, edited)
    expect(installLine(rebuilt)?.unitPrice).toBe(300_000)
  })

  it("합계에 들어간다", () => {
    const off = build("board_86", {}, 1)
    const on = build("board_86", { install_fee: true }, 1)
    const total = (details: ReturnType<typeof build>) =>
      (details.lineItems ?? []).reduce((sum, line) => sum + Number(line.unitPrice ?? 0) * Number(line.quantity ?? 0), 0)
    expect(total(on) - total(off)).toBe(HARDWARE_INSTALL_PRICE_KRW)
  })
})
