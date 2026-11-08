import { describe, expect, it } from "vitest"

import {
  actionPlanToText,
  caseCardsToText,
  changedFields,
  cloneLeadMagnet,
  emptyLeadMagnet,
  finalizeDraft,
  linksToText,
  scoreBandsToText,
  scriptSamplesToText,
  sectionsToText,
  textToActionPlan,
  textToCaseCards,
  textToLinks,
  textToScoreBands,
  textToScriptSamples,
  textToSections,
  textToWorksheetRows,
  worksheetRowsToText,
} from "@/components/admin/lead-magnets/model"
import { fieldInfo, setValueAtPath, valueAtPath } from "@/components/admin/lead-magnets/Surfaces"
import { leadMagnets } from "@/lib/lead-magnets"

describe("lead magnet editor text formats", () => {
  it("round-trips every real magnet's sections, score bands, plans and links", () => {
    for (const magnet of leadMagnets) {
      expect(textToSections(sectionsToText(magnet.sections))).toEqual(magnet.sections.map((s) => ({ ...s, description: s.description })))
      expect(textToScoreBands(scoreBandsToText(magnet.scoreBands))).toEqual(magnet.scoreBands)
      expect(textToActionPlan(actionPlanToText(magnet.actionPlan))).toEqual(magnet.actionPlan)
      expect(textToLinks(linksToText(magnet.sourceLinks)).map((link) => [link.label, link.href])).toEqual(
        (magnet.sourceLinks ?? []).map((link) => [link.label, link.href])
      )
    }
  })

  it("round-trips the PDF-only pilot blocks (case cards, script samples, worksheet rows)", () => {
    for (const magnet of leadMagnets) {
      if (magnet.caseCards?.length) expect(textToCaseCards(caseCardsToText(magnet.caseCards))).toEqual(magnet.caseCards)
      if (magnet.scriptSamples?.length) expect(textToScriptSamples(scriptSamplesToText(magnet.scriptSamples))).toEqual(magnet.scriptSamples)
      if (magnet.worksheet) expect(textToWorksheetRows(worksheetRowsToText(magnet.worksheet.rows))).toEqual(magnet.worksheet.rows)
    }
    expect(textToCaseCards("## 청주 이**국어 | 국어\n고민: 보강이 밀린다\n변화: 녹화로 보강")).toEqual([
      { label: "청주 이**국어", profile: "국어", challenge: "보강이 밀린다", change: "녹화로 보강" },
    ])
    // 변화가 없는 카드는 버린다(서버 normalizeCaseCards 와 같은 규칙)
    expect(textToCaseCards("## 라벨만\n고민: 무엇")).toEqual([])
    expect(textToWorksheetRows("* 합계 | 위 칸을 더함\n수업 준비")).toEqual([
      { label: "합계", hint: "위 칸을 더함", highlight: true },
      { label: "수업 준비" },
    ])
  })
})

describe("lead magnet draft helpers", () => {
  it("fills slug, tracking and resource defaults before saving", () => {
    const draft = { ...emptyLeadMagnet(), slug: "", title: "학원 운영 진단표", sourceDetail: "" as `lead_magnet:${string}`, resourceUrl: "" }
    const saved = finalizeDraft(draft)
    expect(saved.slug).toBe("학원-운영-진단표")
    expect(saved.sourceDetail).toBe("lead_magnet:학원-운영-진단표")
    expect(saved.resourceUrl).toBe("/resources/학원-운영-진단표")
  })

  it("counts changed top-level fields against the saved baseline", () => {
    const base = cloneLeadMagnet(leadMagnets[0])
    const draft = cloneLeadMagnet(base)
    expect(changedFields(draft, base)).toEqual([])
    draft.ctaCopy = { ...draft.ctaCopy, title: "새 제목" }
    draft.deliverables = [...draft.deliverables, "추가"]
    expect(changedFields(draft, base).sort()).toEqual(["ctaCopy", "deliverables"])
  })

  it("edits nested paths immutably and creates pdfGuide when writing its outcome", () => {
    const base = { ...cloneLeadMagnet(leadMagnets[0]), pdfGuide: undefined }
    const next = setValueAtPath(base, "pdfGuide.outcome", "한 줄 설명")
    expect(next.pdfGuide?.outcome).toBe("한 줄 설명")
    expect(base.pdfGuide).toBeUndefined()
    const item = setValueAtPath(next, "sections.0.items.1", "바뀐 문항")
    expect(valueAtPath(item, "sections.0.items.1")).toBe("바뀐 문항")
    expect(valueAtPath(next, "sections.0.items.1")).toBe(leadMagnets[0].sections[0].items[1])
  })

  it("names where a field is shown publicly", () => {
    expect(fieldInfo("title")?.where).toContain("PDF 표지")
    expect(fieldInfo("ctaCopy.title")?.where).toEqual(["블로그 신청 상자"])
    expect(fieldInfo("sections.2.items.0")?.label).toBe("점검 문항")
    expect(fieldInfo("unknown.path")).toBeNull()
  })
})
