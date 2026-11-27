import { beforeAll, describe, expect, it } from "vitest"

import { GAP_RELATED_INTRO } from "@/lib/chatbot/answer-index/respond"
import {
  CLOSING_TEMPLATE_LINES,
  contentSignature,
  findWidgetBreaks,
  isClosingTemplate,
  isEmptyLeadSentence,
  shapeAnswer,
  shapeOptionsFor,
  toBlocks,
} from "@/lib/chatbot/answer-index/shape"
import { renderCardTexts, type CardText } from "@/scripts/answer-index/lib/card-texts"

/**
 * 다듬기(shape.ts) 전수 시험(R2 검토 회귀-11): 저장소 자료(data/answer-index)의 모든 카드를 respond.ts 와 같은 순서(리드 → 다듬기, 사람 글·공백 답은
 * 끝맺음을 지우지 않음)로 그려 본다. 손으로 쓴 몇 문장만 보던 시험이 놓친 것(끝맺음처럼 보이는 사실 줄 지우기)을 자료 전체로 잡는다.
 * - 글자 보존: 빈 리드·끝맺음 틀 줄만 빼고 전후 글자열이 같다(지운 줄을 비교에서 빼지 않는다).
 * - 지운 끝맺음은 틀 줄(CLOSING_TEMPLATE_LINES)뿐, 지운 리드는 빈 리드뿐이다.
 * - policy·fixed·gap 카드에서는 끝맺음을 지우지 않는다. 공백 답의 '공개 안내에는 이런 내용이 있어요:' 뒤가 비지 않는다.
 * - 위젯이 깨뜨려 그리는 덩이가 없다.
 */

let cards: CardText[] = []

beforeAll(async () => {
  cards = (await renderCardTexts({})).cards
}, 60_000)

describe("shape over every repository card", () => {
  it("renders the whole card set", () => {
    expect(cards.length).toBeGreaterThan(1000)
  })

  it("keeps every character except empty leads and closing-template lines, and removes nothing else", () => {
    const mismatched: string[] = []
    const nonTemplate: string[] = []
    const badLeads: string[] = []
    const humanTouched: string[] = []
    const widget: string[] = []
    const danglingIntro: string[] = []
    for (const card of cards) {
      const composed = card.lead ? `${card.lead} ${card.text}` : card.text
      const kind = card.policyGoverned ? "policy" : card.kind
      const result = shapeAnswer(composed, shapeOptionsFor(kind))
      if (result.reverted) continue
      let expected = contentSignature(composed)
      for (const removed of [...result.removedLeads, ...result.removedClosings]) expected = expected.replace(contentSignature(removed), "")
      if (expected !== contentSignature(result.text)) mismatched.push(card.id)
      for (const removed of result.removedClosings) if (!isClosingTemplate(removed)) nonTemplate.push(`${card.id}: ${removed}`)
      for (const removed of result.removedLeads) if (!isEmptyLeadSentence(removed)) badLeads.push(`${card.id}: ${removed}`)
      if ((card.policyGoverned || card.kind === "fixed" || card.kind === "gap") && result.removedClosings.length > 0) humanTouched.push(card.id)
      if (findWidgetBreaks(result.text).length > 0) widget.push(card.id)
      for (const block of toBlocks(result.text)) if (block[block.length - 1] === GAP_RELATED_INTRO) danglingIntro.push(card.id)
    }
    expect(mismatched).toEqual([])
    expect(nonTemplate).toEqual([])
    expect(badLeads).toEqual([])
    expect(humanTouched).toEqual([])
    expect(widget).toEqual([])
    expect(danglingIntro).toEqual([])
  })

  it("keeps the content lines the review found deleted (policy·fixed·doc), word for word", () => {
    const byId = new Map(cards.map((card) => [card.id, card]))
    const shaped = (id: string) => {
      const card = byId.get(id)
      if (!card) return null
      const composed = card.lead ? `${card.lead} ${card.text}` : card.text
      return { before: composed, after: shapeAnswer(composed, shapeOptionsFor(card.policyGoverned ? "policy" : card.kind)).text }
    }
    for (const id of ["policy:overseas-card", "policy:contract-confirm-needed", "policy:contract-auto-renewal", "fixed:camera-mirror", "fixed:web-live-app-closed"]) {
      const result = shaped(id)
      if (!result) continue
      expect(contentSignature(result.after), id).toBe(contentSignature(result.before))
    }
  })

  it("lists only template closings", () => {
    for (const line of CLOSING_TEMPLATE_LINES) expect(isClosingTemplate(line)).toBe(true)
    expect(isClosingTemplate("해외에서 발급한 카드로 결제되는지는 공개 안내에 없어요. 결제 담당자가 확인해 드려야 해요.")).toBe(false)
  })
})
