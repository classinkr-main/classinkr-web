import { describe, expect, it } from "vitest"

import { getLinkById } from "@/lib/admin-ai/links"
import { NO_EVIDENCE_ANSWER, answerKnowledge } from "@/lib/admin-ai/server/knowledge"
import { createFakeModelAdapter } from "@/lib/admin-ai/server/llm/adapter"
import { collectTurn, type TurnInput } from "@/lib/admin-ai/server/orchestrator"
import type { AiBlock } from "@/lib/admin-ai/types"

import { COMPOUND_QUESTIONS, INFO_QUESTIONS } from "../fixtures/server-questions"
import { STAFF_ACTOR, fakeDeps, fakeEvidence } from "./fakes"

const turn = (text: string, extra: Partial<TurnInput> = {}): TurnInput => ({ text, context: null, actor: STAFF_ACTOR, now: Date.parse("2026-11-25T01:00:00Z"), ...extra })

/** 카드가 가리키는 링크 id 를 모두 모은다. */
function linkIdsOf(blocks: AiBlock[]): string[] {
  const ids: string[] = []
  for (const block of blocks) {
    if (block.kind === "links") ids.push(...block.card.items.map((item) => item.linkId))
    if (block.kind === "answer") for (const source of block.card.sources) if (source.linkId) ids.push(source.linkId)
  }
  return ids
}

/** 두괄식 첫 줄 — 한 줄, 목록 표시 없음, 문장 끝(마침표 등). */
const CONCLUSION_SHAPE = /^(?![-•*·]|\d+[.)])[^\n]{4,140}[.!?。…]$/

describe("조율기 — 정보 질문", () => {
  it("정보 질문 20개는 답·담당자·링크 블록만 내고 오더는 0개다", async () => {
    const { deps, run, preview, execute } = fakeDeps()
    for (const text of INFO_QUESTIONS) {
      const result = await collectTurn(turn(text), deps)
      expect(result.orders, text).toHaveLength(0)
      expect(result.blocks.length, text).toBeGreaterThan(0)
      for (const block of result.blocks) expect(["answer", "contact", "links"], `${text} → ${block.kind}`).toContain(block.kind)
    }
    expect(preview).not.toHaveBeenCalled()
    expect(execute).not.toHaveBeenCalled()
    expect(run).not.toHaveBeenCalled()
  })

  it("복합 질문 10개는 조각 수만큼 블록 묶음을 순서대로 낸다", async () => {
    const { deps } = fakeDeps()
    for (const [text, count, branches] of COMPOUND_QUESTIONS) {
      const result = await collectTurn(turn(text), deps)
      // 조각마다 "단계" 한 줄 + 첫 단계(질문 나누기)
      expect(result.steps.length, text).toBe(count + 1)
      const kinds = result.blocks.map((block) => block.kind)
      const expected: Record<string, string> = { knowledge: "answer", contact: "contact", link: "links", read: "read" }
      const order = branches.map((branch) => kinds.indexOf(expected[branch] as AiBlock["kind"]))
      for (const index of order) expect(index, `${text} ${kinds.join(",")}`).toBeGreaterThanOrEqual(0)
      // 서로 다른 갈래면 블록이 질문 순서대로 나온다
      const distinct = branches.filter((b, i) => branches.indexOf(b) === i)
      const positions = distinct.map((branch) => kinds.indexOf(expected[branch] as AiBlock["kind"]))
      expect([...positions].sort((a, b) => a - b), `${text} ${kinds.join(",")}`).toEqual(positions)
    }
  })

  it("\"A 는 어떻게 하고, B 는 누구한테 물어?\" → 답 카드 + 담당자 카드", async () => {
    const { deps } = fakeDeps()
    const result = await collectTurn(turn("수업 녹화는 어떻게 하고, 녹화 오류는 누구한테 물어?"), deps)
    expect(result.blocks.map((b) => b.kind)).toEqual(["answer", "contact"])
  })

  it("답 블록의 첫 줄은 결론 문장이고 방법은 한 단계 한 줄이다(두괄식)", async () => {
    const { deps } = fakeDeps()
    for (const text of ["수업 녹화는 어떻게 켜?", "환불 규정이 어떻게 돼?", "견적서에 할인을 넣어도 되나?"]) {
      const result = await collectTurn(turn(text), deps)
      const answer = result.blocks.find((b) => b.kind === "answer")
      expect(answer?.kind, text).toBe("answer")
      if (answer?.kind !== "answer") continue
      expect(answer.card.answer, text).toMatch(CONCLUSION_SHAPE)
      for (const step of answer.card.steps ?? []) {
        expect(step, text).not.toContain("\n")
        expect(step, text).not.toMatch(/^[-•*·]|^\d+[.)]/)
      }
    }
  })

  it("확인이 필요한 정책 근거는 '확인 필요'와 주의 문장을 단다", async () => {
    const [block] = await answerKnowledge("환불 규정 알려 줘", { evidence: async (q) => fakeEvidence(q), contact: async () => ({ title: "담당자", target: { label: "", meta: "" } }) })
    expect(block.kind).toBe("answer")
    if (block.kind !== "answer") return
    expect(block.card.confidence).toBe("needs-check")
    expect(block.card.cautions?.length).toBeGreaterThan(0)
  })

  it("근거가 없으면 지어내지 않고 담당자 카드와 코파일럿 링크를 낸다", async () => {
    const { deps } = fakeDeps()
    const result = await collectTurn(turn("우주선 수업 기능은 어떻게 써?"), deps)
    expect(result.blocks.map((b) => b.kind)).toEqual(["answer", "contact", "links"])
    const answer = result.blocks[0]
    if (answer.kind === "answer") {
      expect(answer.card.answer).toBe(NO_EVIDENCE_ANSWER)
      expect(answer.card.sources).toHaveLength(0)
    }
  })

  it("상담 사례 근거는 건수만 싣는다(기관 이름·원문 없음)", async () => {
    const blocks = await answerKnowledge("수업 녹화 방법", {
      evidence: async (q) => fakeEvidence(q),
      consultationCount: async () => 3,
      contact: async () => ({ title: "담당자", target: { label: "", meta: "" } }),
    })
    const answer = blocks[0]
    expect(answer.kind).toBe("answer")
    if (answer.kind !== "answer") return
    const consultation = answer.card.sources.filter((s) => s.kind === "consultation")
    expect(consultation).toHaveLength(1)
    expect(consultation[0].title).toBe("비슷한 상담 사례 3건")
    expect(consultation[0].externalUse).toBe(false)
  })

  it("답 색인 카드는 고객용 문안 칸에 따로 두고, 정책 질문에는 정책 카드만 쓴다(R18)", async () => {
    const base = { evidence: async (q: string) => fakeEvidence(q), contact: async () => ({ title: "담당자", target: { label: "", meta: "" } }) }
    const fixed = await answerKnowledge("수업 녹화 방법", { ...base, customerPhrasing: async () => ({ cardId: "c1", kind: "fixed", text: "녹화는 설정에서 켤 수 있어요.", conf: 0.9 }) })
    expect(fixed[0].kind === "answer" && fixed[0].card.customerDraft?.text).toBe("녹화는 설정에서 켤 수 있어요.")
    const policyAskFixed = await answerKnowledge("환불 규정 알려 줘", { ...base, customerPhrasing: async () => ({ cardId: "c2", kind: "fixed", text: "결제는 이렇게 해요.", conf: 0.95 }) })
    expect(policyAskFixed[0].kind === "answer" && policyAskFixed[0].card.customerDraft).toBeUndefined()
    const policy = await answerKnowledge("환불 규정 알려 줘", { ...base, customerPhrasing: async () => ({ cardId: "c3", kind: "policy", text: "환불은 상담으로 안내해요.", conf: 0.8, policyRef: "HQ-01" }) })
    const draft = policy[0].kind === "answer" ? policy[0].card.customerDraft : undefined
    expect(draft?.status).toBe("needs-check")
    expect(draft?.note).toContain("HQ-01")
    const low = await answerKnowledge("수업 녹화 방법", { ...base, customerPhrasing: async () => ({ cardId: "c4", kind: "fixed", text: "x", conf: 0.5 }) })
    expect(low[0].kind === "answer" && low[0].card.customerDraft).toBeUndefined()
  })

  it("링크는 링크 목록 id 에서만 나온다", async () => {
    const { deps } = fakeDeps()
    const texts = [...INFO_QUESTIONS, ...COMPOUND_QUESTIONS.map(([text]) => text), "우주선 기능 어떻게 써?"]
    let seen = 0
    for (const text of texts) {
      const result = await collectTurn(turn(text), deps)
      for (const id of linkIdsOf(result.blocks)) {
        seen += 1
        expect(getLinkById(id), `${text} → ${id}`).toBeDefined()
      }
      for (const block of result.blocks) {
        if ((block.kind === "read" || block.kind === "deny") && block.card.openHref) {
          expect(block.card.openHref.startsWith("/admin"), text).toBe(true)
        }
      }
    }
    expect(seen).toBeGreaterThan(5)
  })
})

describe("조율기 — 조회 도구", () => {
  it("재고 조회는 조회 카드와 두괄식 요약 한 줄(단위 포함)을 낸다", async () => {
    const { deps, run } = fakeDeps()
    const result = await collectTurn(turn("T1 재고 몇 대야?"), deps)
    expect(run).toHaveBeenCalledTimes(1)
    expect(run.mock.calls[0][1]).toEqual({ query: "T1" })
    expect(result.blocks[0]).toEqual({ kind: "text", text: "T1 카메라 가용 재고는 7대입니다." })
    const read = result.blocks[1]
    expect(read.kind).toBe("read")
    if (read.kind === "read") {
      expect(read.card.table?.rows[0]).toEqual(["T1 카메라", "7대", "9대", "2대"])
      expect(read.card.openHref).toBe("/admin/hardware")
    }
  })

  it("견적 조회는 통화를 붙이고 견적 화면 링크를 단다", async () => {
    const { deps } = fakeDeps()
    const result = await collectTurn(turn("견적 목록 보여 줘"), deps)
    expect(result.blocks[0]).toEqual({ kind: "text", text: "견적 1건, 합계 ₩1,100,000(VAT 포함 금액 기준)입니다." })
    const read = result.blocks[1]
    if (read.kind === "read") {
      expect(read.card.table?.rows[0][3]).toBe("₩1,100,000")
      expect(read.card.openHref).toBe("/admin/quotes")
    }
  })

  it("도구가 없는 조회(결제 내역)는 화면 링크가 달린 준비 중 카드다", async () => {
    const { deps, run } = fakeDeps()
    const result = await collectTurn(turn("결제 내역 보여 줘"), deps)
    expect(run).not.toHaveBeenCalled()
    expect(result.blocks[0].kind).toBe("deny")
  })
})

describe("조율기 — 되묻기와 모델 어댑터", () => {
  it("모델이 없으면 가까운 후보 2개를 되묻는다", async () => {
    const { deps } = fakeDeps()
    const result = await collectTurn(turn("견적서 링크 어디 있는지 누가 알아"), deps)
    expect(result.blocks[0].kind).toBe("choice")
    if (result.blocks[0].kind === "choice") expect(result.blocks[0].card.options).toHaveLength(2)
  })

  it("모델은 두 후보 중에서만 고르고, 입력에 연락처가 가려져 있다", async () => {
    const { adapter, calls } = createFakeModelAdapter({ route: "contact" })
    const { deps } = fakeDeps({ model: adapter })
    const result = await collectTurn(turn("견적서 링크 어디 있는지 누가 알아 010-1234-5678 a.person@example.com"), deps)
    expect(result.blocks[0].kind).toBe("contact")
    expect(calls).toHaveLength(1)
    const input = JSON.stringify(calls[0].input)
    expect(input).not.toContain("1234-5678")
    expect(input).not.toContain("a.person@")
    expect(input).toContain("010-****-5678")
  })

  it("모델이 후보 밖 답을 내거나 늦으면 결정형 되묻기로 돌아간다", async () => {
    const outside = createFakeModelAdapter({ route: "write" })
    const result = await collectTurn(turn("견적서 링크 어디 있는지 누가 알아"), fakeDeps({ model: outside.adapter }).deps)
    expect(result.blocks[0].kind).toBe("choice")
  })

  it("쓰기 미리보기가 연결되지 않으면 모든 시키는 말은 준비 중 카드다(오더 0)", async () => {
    const { deps, preview, execute } = fakeDeps()
    for (const text of ["가온학원 견적 10% 깎아 줘", "도담영어에 결제 링크 문자로 보내 줘", "견적 초안 삭제해 줘"]) {
      const result = await collectTurn(turn(text), deps)
      expect(result.orders, text).toHaveLength(0)
      expect(result.blocks.map((b) => b.kind), text).toEqual(["deny"])
    }
    expect(preview).not.toHaveBeenCalled()
    expect(execute).not.toHaveBeenCalled()
  })
})
