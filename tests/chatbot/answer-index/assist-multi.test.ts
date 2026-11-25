import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { __setRouterAnswerIndexForTests, resetRouterAnswerIndex } from "@/lib/chatbot/answer-index"
import {
  ANSWER_CARD_MULTI_PICK_INSTRUCTION,
  ANSWER_CARD_PICK_INSTRUCTION,
  ANSWER_CARD_PICK_INSTRUCTION_V2,
  assistBand,
  assistCandidateCount,
  assistCandidates,
  assistPartCandidates,
  assistPartQuotas,
  assistPickPromptVersion,
  buildAnswerCardMultiPickInput,
  maybeAssistWithModel,
  resolveAssistPick,
  resolveAssistPicks,
  type AnswerCardPickArgs,
  type AnswerCardPickOutcome,
  type AnswerCardPickRequest,
} from "@/lib/chatbot/answer-index/assist"
import type { CompiledAnswerIndex } from "@/lib/chatbot/answer-index/compile"
import { decideWithAnalysis } from "@/lib/chatbot/answer-index/decide"
import type { AnswerCard } from "@/lib/chatbot/answer-index/types"
import { buildClaudeCardPickRequest } from "@/lib/chatbot/claude/card-pick"
import {
  __resetModelCircuitForTests,
  buildAnswerCardPickGenerationConfig,
  isAnswerCardMultiPickRequestBody,
  isAnswerCardPickRequestBody,
  parseAnswerCardPicks,
  readAnswerCardPickResult,
} from "@/lib/chatbot/llm"
import { __clearAnswerCacheForTests, evaluateChatbotQuery } from "@/lib/chatbot/service"

import { CARDS, compileFixture } from "./index-fixture"

/**
 * 복합 질문 모델 고르기(R2 B3). 모델은 가짜다(실제 Gemini·Anthropic 호출 없음).
 * - {"picks": […]} 파서·호환({"pick": n} → 조각 1)·길이 불일치·범위 밖 번호.
 * - 조각별 후보(몫 5·5 / 5·3·2, "← 조각 n")와 입력(답함 표시·주의 줄), 조각별 받아들이기, 결정형이 답한 조각 보존.
 * - 정책 주제 거절은 개념 겹침·허용 표시, 없는 개념은 묻는 대상(상황 절 밖)일 때만.
 * - 설정값: 후보 수·대역·단일 지시문 판.
 */

// 픽스처 색인: 앞 조각(녹화 다시보기)은 결정형이 답하고, 뒤 조각(강퇴)은 문턱 아래다.
const MIXED = "녹화 다시보기 어디서 봐요? 그리고 강퇴는 어떻게 해요?"
const MIXED_REVERSED = "강퇴는 어떻게 해요? 그리고 녹화 다시보기 어디서 봐요?"
const BOTH_DECIDED = "녹화 다시보기 어디서 봐요? 그리고 채팅 막을 수 있나요?"

function analyze(index: CompiledAnswerIndex, question: string) {
  return decideWithAnalysis(index, question, { env: {} })
}

function numberOf(candidates: readonly { id: string; n: number }[], id: string) {
  const found = candidates.find((candidate) => candidate.id === id)
  if (!found) throw new Error(`후보에 없는 카드: ${id}`)
  return found.n
}

function withPolicyCard(index: CompiledAnswerIndex, concepts: string[]): CompiledAnswerIndex {
  const template = index.cards[index.cardById.get(CARDS.price)!]
  const id = "policy:test-policy"
  const card = {
    ...template,
    index: index.cards.length,
    id,
    kind: "policy" as const,
    ownConcepts: concepts,
    conceptClosure: new Set(concepts),
    card: { ...template.card, id, kind: "policy", concepts } as AnswerCard,
  }
  const cardById = new Map(index.cardById)
  cardById.set(id, card.index)
  return { ...index, cards: [...index.cards, card], cardById }
}

function fakeRequest(outcome: (args: AnswerCardPickArgs) => AnswerCardPickOutcome) {
  return vi.fn<AnswerCardPickRequest>(async (args) => outcome(args))
}

beforeAll(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {})
  vi.spyOn(console, "info").mockImplementation(() => {})
})

afterAll(() => {
  resetRouterAnswerIndex()
  vi.restoreAllMocks()
})

describe("picks parser and request shapes", () => {
  it("reads {\"picks\": […]}, maps a lone {\"pick\": n} to fragment 1 and rejects non-integers", () => {
    expect(parseAnswerCardPicks('{"picks": [2, 0]}')).toEqual([2, 0])
    expect(parseAnswerCardPicks('```json\n{"picks": [-1, 3, 1]}\n```')).toEqual([-1, 3, 1])
    expect(parseAnswerCardPicks('{"pick": 4}')).toEqual([4])
    expect(parseAnswerCardPicks('{"picks": []}')).toEqual([])
    expect(parseAnswerCardPicks('{"picks": [1, "2"]}')).toBeNull()
    expect(parseAnswerCardPicks('{"picks": [1.5]}')).toBeNull()
    expect(parseAnswerCardPicks("1번, 2번")).toBeNull()
    expect(parseAnswerCardPicks(undefined)).toBeNull()
    expect(readAnswerCardPickResult('{"picks": [3, 1]}', "picks")).toEqual({ pick: 3, picks: [3, 1] })
    expect(readAnswerCardPickResult('{"picks": []}', "picks")).toEqual({ pick: 0, picks: [] })
    // 단일 고르기는 지금처럼 {"pick": n} 만 읽는다.
    expect(readAnswerCardPickResult('{"pick": 3}')).toEqual({ pick: 3 })
    expect(readAnswerCardPickResult('{"picks": [3]}')).toBeNull()
  })

  it("asks Gemini and Claude for an integer array only for compound questions", () => {
    expect(buildAnswerCardPickGenerationConfig("gemini-4-hydrogen", "picks").responseSchema).toEqual({
      type: "object",
      properties: { picks: { type: "array", items: { type: "integer" } } },
      required: ["picks"],
    })
    expect(buildAnswerCardPickGenerationConfig("gemini-4-hydrogen").responseSchema).toEqual({
      type: "object",
      properties: { pick: { type: "integer" } },
      required: ["pick"],
    })
    const multi = buildClaudeCardPickRequest({ instruction: ANSWER_CARD_MULTI_PICK_INSTRUCTION, input: "x", model: "claude-haiku-5-5", expect: "picks" })
    expect(multi.output_config.format.schema).toEqual({
      type: "object",
      properties: { picks: { type: "array", items: { type: "integer" } } },
      required: ["picks"],
      additionalProperties: false,
    })
    const single = buildClaudeCardPickRequest({ instruction: ANSWER_CARD_PICK_INSTRUCTION, input: "x", model: "claude-haiku-5-5" })
    expect(single.output_config.format.schema).toMatchObject({ properties: { pick: { type: "integer" } } })
    const body = JSON.stringify({ systemInstruction: { parts: [{ text: ANSWER_CARD_MULTI_PICK_INSTRUCTION }] }, generationConfig: buildAnswerCardPickGenerationConfig("m", "picks") })
    expect(isAnswerCardPickRequestBody(body)).toBe(true)
    expect(isAnswerCardMultiPickRequestBody(body)).toBe(true)
    expect(isAnswerCardMultiPickRequestBody(JSON.stringify({ text: ANSWER_CARD_PICK_INSTRUCTION, schema: { pick: 1 } }))).toBe(false)
  })

  it("keeps the old single instruction and adds the two rules only to the new single version and the compound instruction", () => {
    for (const rule of ["가능 여부·수치·한도·있다/없다를 묻는데 카드가 그 값을 말하지 않으면 그 카드를 고르지 않는다.", "증상이 불분명해 무엇이 안 되는지 알 수 없으면 -1(되묻기)."]) {
      expect(ANSWER_CARD_PICK_INSTRUCTION).not.toContain(rule)
      expect(ANSWER_CARD_PICK_INSTRUCTION_V2).toContain(rule)
      expect(ANSWER_CARD_MULTI_PICK_INSTRUCTION).toContain(rule)
    }
    expect(ANSWER_CARD_PICK_INSTRUCTION_V2.startsWith(ANSWER_CARD_PICK_INSTRUCTION.split("\n4.")[0])).toBe(true)
    expect(ANSWER_CARD_PICK_INSTRUCTION_V2.endsWith('출력은 JSON 한 줄: {"pick": 번호}')).toBe(true)
    expect(ANSWER_CARD_MULTI_PICK_INSTRUCTION.endsWith('{"picks": [번호, 번호]}')).toBe(true)
  })
})

describe("settings", () => {
  it("reads the candidate count (10 by default, 1..20), the band override and the single prompt version", () => {
    expect(assistCandidateCount({})).toBe(10)
    expect(assistCandidateCount({ CHATBOT_ASSIST_CANDIDATES: "15" })).toBe(15)
    expect(assistCandidateCount({ CHATBOT_ASSIST_CANDIDATES: "20" })).toBe(20)
    expect(assistCandidateCount({ CHATBOT_ASSIST_CANDIDATES: "35" })).toBe(20)
    expect(assistCandidateCount({ CHATBOT_ASSIST_CANDIDATES: "0" })).toBe(10)
    expect(assistCandidateCount({ CHATBOT_ASSIST_CANDIDATES: "many" })).toBe(10)
    expect(assistPickPromptVersion({})).toBe("v1")
    expect(assistPickPromptVersion({ CHATBOT_ASSIST_PICK_PROMPT: "V2" })).toBe("v2")
    expect(assistPickPromptVersion({ CHATBOT_ASSIST_PICK_PROMPT: "v3" })).toBe("v1")

    const index = { ...compileFixture(), assist: { enabled: true, band: [0.45, 0.62] as [number, number] } }
    expect(assistBand(index, {})).toEqual([0.45, 0.62])
    expect(assistBand(index, { CHATBOT_ASSIST_BAND_LO: "0.1", CHATBOT_ASSIST_BAND_HI: "0.7" })).toEqual([0.1, 0.7])
    expect(assistBand(index, { CHATBOT_ASSIST_BAND_LO: "0.8" })).toEqual([0.45, 0.62])
    expect(assistBand(index, { CHATBOT_ASSIST_BAND_LO: "x" })).toEqual([0.45, 0.62])
  })

  it("splits the candidate quota 5+5 / 5+3+2 (and keeps proportions for 15·20)", () => {
    expect(assistPartQuotas(1, 10)).toEqual([10])
    expect(assistPartQuotas(2, 10)).toEqual([5, 5])
    expect(assistPartQuotas(3, 10)).toEqual([5, 3, 2])
    expect(assistPartQuotas(2, 15)).toEqual([8, 7])
    expect(assistPartQuotas(3, 15)).toEqual([8, 5, 2])
    expect(assistPartQuotas(3, 20)).toEqual([10, 6, 4])
  })

  it("lists more single-question candidates when CHATBOT_ASSIST_CANDIDATES grows", () => {
    const index = compileFixture()
    const { analysis } = analyze(index, "녹화 영상 다시보기 어디서 봐요")
    const ten = assistCandidates(index, analysis, {})
    const two = assistCandidates(index, analysis, { CHATBOT_ASSIST_CANDIDATES: "2" })
    expect(two).toHaveLength(Math.min(2, ten.length))
    expect(two.map((candidate) => candidate.id)).toEqual(ten.slice(0, 2).map((candidate) => candidate.id))
  })
})

describe("compound candidates and input", () => {
  it("lists the answered fragment's card once and the open fragment's top cards, tagged by fragment", () => {
    const index = compileFixture()
    const { decision, analysis } = analyze(index, MIXED)
    expect(analysis.parts).toHaveLength(2)
    expect(decision.segments?.map((segment) => [segment.kind, segment.card])).toEqual([
      ["answer", CARDS.replay],
      ["abstain", null],
    ])
    const { candidates, asked } = assistPartCandidates(index, analysis, decision.segments!, {})
    expect(asked).toEqual([1])
    expect(candidates[0]).toMatchObject({ n: 1, id: CARDS.replay, parts: [1] })
    expect(candidates[0].line.endsWith(" ← 조각 1")).toBe(true)
    const kick = candidates.find((candidate) => candidate.id === CARDS.kick)!
    expect(kick.parts).toContain(2)
    expect(kick.line).toMatch(/ ← 조각 (?:1·)?2$/)
    // 물을 조각이 하나면 그 조각이 몫을 다 쓴다(답한 조각 카드 1장 + 최대 10장).
    expect(candidates.length).toBeLessThanOrEqual(11)

    const input = buildAnswerCardMultiPickInput(MIXED, analysis.parts!.map((part, at) => ({ text: part.text, answered: at === 0 ? 1 : null })), candidates, [])
    expect(input).toContain(`방문자 질문: ${MIXED}`)
    expect(input).toContain("조각:\n(1) 녹화 다시보기 어디서 봐요? — 답함: [1]\n(2) 강퇴는 어떻게 해요?")
    expect(input).toContain("\n\n답 카드 후보:\n[1] ")
    const withCaution = buildAnswerCardMultiPickInput(MIXED, [{ text: "a", answered: null }, { text: "b", answered: null }], candidates, ["주의: 'ISMS'은(는) 공개 안내에 없음"])
    expect(withCaution).toContain("(2) b\n\n주의: 'ISMS'은(는) 공개 안내에 없음\n\n답 카드 후보:")
  })
})

describe("resolveAssistPicks (per-fragment acceptance)", () => {
  const index = compileFixture()
  const mixed = analyze(index, MIXED)
  const parts = assistPartCandidates(index, mixed.analysis, mixed.decision.segments!, {})
  const kickN = numberOf(parts.candidates, CARDS.kick)

  it("answers the open fragment with the picked card and keeps the fragment the index answered", () => {
    const result = resolveAssistPicks(index, mixed.analysis, mixed.decision, parts.candidates, [1, kickN], { env: {} })
    expect(result).toMatchObject({ accepted: true, rejectReason: null, pickCard: CARDS.kick })
    expect(result.parts.map((part) => [part.asked, part.accepted, part.rejectReason])).toEqual([
      [false, false, "index_kept"],
      [true, true, null],
    ])
    expect(result.decision).toMatchObject({ kind: "answer", card: CARDS.replay, partial: false })
    expect(result.decision.segments?.map((segment) => [segment.card, segment.by])).toEqual([
      [CARDS.replay, "index"],
      [CARDS.kick, "assist"],
    ])
  })

  it("never overwrites a fragment the index answered (different card or 0 for it)", () => {
    // 앞 조각에 다른 카드(강퇴)·0·-1 을 내도 결정형이 답한 앞 조각은 그대로다.
    for (const first of [kickN, 0, -1]) {
      const result = resolveAssistPicks(index, mixed.analysis, mixed.decision, parts.candidates, [first, kickN], { env: {} })
      expect(result.decision.segments?.[0], String(first)).toMatchObject({ card: CARDS.replay, kind: "answer" })
      expect(result.parts[0], String(first)).toMatchObject({ asked: false, rejectReason: "index_kept" })
    }
  })

  it("applies a lone {\"pick\": n} to fragment 1 and leaves the rest (missing), uses only the leading picks of a longer array", () => {
    const reversed = analyze(index, MIXED_REVERSED)
    expect(reversed.decision.segments?.map((segment) => segment.kind)).toEqual(["abstain", "answer"])
    const listed = assistPartCandidates(index, reversed.analysis, reversed.decision.segments!, {})
    const n = numberOf(listed.candidates, CARDS.kick)
    const lone = resolveAssistPicks(index, reversed.analysis, reversed.decision, listed.candidates, [n], { env: {} })
    expect(lone.parts.map((part) => part.rejectReason)).toEqual([null, "index_kept"])
    expect(lone.decision.segments?.map((segment) => segment.card)).toEqual([CARDS.kick, CARDS.replay])
    // 질문 순서: 첫 조각이 답하면 결정 카드도 첫 조각 카드다.
    expect(lone.decision.card).toBe(CARDS.kick)

    const short = resolveAssistPicks(index, mixed.analysis, mixed.decision, parts.candidates, [1], { env: {} })
    expect(short).toMatchObject({ accepted: false, rejectReason: "missing" })
    expect(short.decision).toBe(mixed.decision)

    const long = resolveAssistPicks(index, mixed.analysis, mixed.decision, parts.candidates, [1, kickN, 3, 4], { env: {} })
    expect(long.decision.segments?.map((segment) => segment.card)).toEqual([CARDS.replay, CARDS.kick])
  })

  it("keeps a fragment on an out-of-range number and follows 0 / -1 for the open fragment only", () => {
    for (const bad of [parts.candidates.length + 1, -2]) {
      const result = resolveAssistPicks(index, mixed.analysis, mixed.decision, parts.candidates, [1, bad], { env: {} })
      expect(result, String(bad)).toMatchObject({ accepted: false, rejectReason: "out_of_range" })
      expect(result.decision).toBe(mixed.decision)
    }
    const none = resolveAssistPicks(index, mixed.analysis, mixed.decision, parts.candidates, [1, 0], { env: {} })
    expect(none.parts[1]).toMatchObject({ accepted: true, rejectReason: null })
    expect(none.decision.segments?.map((segment) => [segment.kind, segment.card])).toEqual([
      ["answer", CARDS.replay],
      ["abstain", null],
    ])
    expect(none.decision).toMatchObject({ kind: "answer", card: CARDS.replay })
    const clarify = resolveAssistPicks(index, mixed.analysis, mixed.decision, parts.candidates, [1, -1], { env: {} })
    expect(clarify.decision.segments?.[1]).toMatchObject({ kind: "clarify", by: "assist" })
  })

  it("rejects per fragment on the policy-topic overlap rule (and accepts with a caution when nothing overlaps)", () => {
    const policy = withPolicyCard(index, ["C_kick"])
    const analysed = analyze(policy, MIXED)
    const listed = assistPartCandidates(policy, analysed.analysis, analysed.decision.segments!, {})
    const n = numberOf(listed.candidates, CARDS.kick)
    const blocked = resolveAssistPicks(policy, analysed.analysis, analysed.decision, listed.candidates, [1, n], { env: {}, isPolicyTopic: () => true })
    expect(blocked).toMatchObject({ accepted: false, rejectReason: "policy_topic" })
    expect(blocked.parts[1]).toMatchObject({ asked: true, accepted: false, rejectReason: "policy_topic", pickCard: CARDS.kick })
    const open = resolveAssistPicks(index, mixed.analysis, mixed.decision, parts.candidates, [1, kickN], { env: {}, isPolicyTopic: () => true })
    expect(open.decision).toMatchObject({ cautions: [{ kind: "policy_topic" }] })
    expect(open.decision.segments?.[1]).toMatchObject({ card: CARDS.kick })
  })
})

describe("single-question acceptance changes (R2 B3)", () => {
  it("accepts a card when the absent concept sits only in a situation clause, and still blocks an asked absent concept", () => {
    const index = compileFixture()
    const situation = analyze(index, "ISMS 인증 준비 중인데, 수업 중 학생 채팅 막을 수 있나요?")
    const candidates = assistCandidates(index, situation.analysis, {})
    const chat = resolveAssistPick(index, situation.analysis, situation.decision, candidates, numberOf(candidates, CARDS.chat), { env: {} })
    expect(chat).toMatchObject({ accepted: true, decision: { kind: "answer", card: CARDS.chat } })
    // 묻는 대상인 없는 개념은 지금처럼 막는다(assist.test.ts "rejects a card that does not cover an absent concept").
    expect(situation.analysis.whole.absentTargets.some((item) => item.match.id === "A_isms")).toBe(true)
  })

  it("lets a policy-card answer go to not-found on 0 only (never to another card or a clarifying question)", () => {
    const index = compileFixture()
    const priceAt = index.cardById.get(CARDS.price)!
    const policyIndex: CompiledAnswerIndex = {
      ...index,
      cards: index.cards.map((compiled, at) => (at === priceAt ? { ...compiled, card: { ...compiled.card, policyGoverned: true } as AnswerCard } : compiled)),
    }
    const { decision, analysis } = analyze(policyIndex, "요금이 어떻게 돼요?")
    expect(decision).toMatchObject({ kind: "answer", card: CARDS.price })
    const candidates = assistCandidates(policyIndex, analysis, {})
    expect(resolveAssistPick(policyIndex, analysis, decision, candidates, 0, { env: {} })).toMatchObject({ accepted: true, decision: { kind: "abstain", card: null } })
    expect(resolveAssistPick(policyIndex, analysis, decision, candidates, -1, { env: {} })).toMatchObject({ accepted: false, rejectReason: "policy_card" })
    const other = candidates.find((candidate) => candidate.id !== CARDS.price)!
    expect(resolveAssistPick(policyIndex, analysis, decision, candidates, other.n, { env: {} })).toMatchObject({ accepted: false, rejectReason: "policy_card" })
  })
})

describe("maybeAssistWithModel with compound questions", () => {
  const index = compileFixture()

  it("asks once with the compound instruction, {picks} and fragment tags, and records per-fragment results", async () => {
    const { decision, analysis } = analyze(index, MIXED)
    const listed = assistPartCandidates(index, analysis, decision.segments!, {})
    const kickN = numberOf(listed.candidates, CARDS.kick)
    const request = fakeRequest(() => ({ ok: true, pick: 1, picks: [1, kickN], model: "fake" }))
    const result = await maybeAssistWithModel({ index, analysis, decision, question: MIXED, mode: "always", request, env: {} })
    expect(request).toHaveBeenCalledTimes(1)
    const args = request.mock.calls[0][0]
    expect(args.instruction).toBe(ANSWER_CARD_MULTI_PICK_INSTRUCTION)
    expect(args.expect).toBe("picks")
    expect(args.input).toContain("— 답함: [1]")
    expect(args.input).toContain(" ← 조각 2")
    expect(result.decision.segments?.map((segment) => segment.card)).toEqual([CARDS.replay, CARDS.kick])
    expect(result.trace).toMatchObject({
      used: true,
      prompt: "multi",
      picks: [1, kickN],
      accepted: true,
      parts: [
        { asked: false, rejectReason: "index_kept" },
        { asked: true, accepted: true, pickCard: CARDS.kick },
      ],
      original: { kind: "answer", card: CARDS.replay },
    })
  })

  it("does not ask when the index answered every fragment (always mode does not fold two answers into one card)", async () => {
    const { decision, analysis } = analyze(index, BOTH_DECIDED)
    expect(decision.segments?.map((segment) => segment.card)).toEqual([CARDS.replay, CARDS.chat])
    const request = fakeRequest(() => ({ ok: true, pick: 2, picks: [2, 2], model: "fake" }))
    const result = await maybeAssistWithModel({ index, analysis, decision, question: BOTH_DECIDED, mode: "always", request, env: {} })
    expect(request).not.toHaveBeenCalled()
    expect(result.decision).toBe(decision)
    expect(result.trace).toMatchObject({ used: false, rejectReason: "segments_decided" })
  })

  it("keeps the deterministic decision when the compound answer does not parse or the call fails", async () => {
    const { decision, analysis } = analyze(index, MIXED)
    const failed = await maybeAssistWithModel({
      index,
      analysis,
      decision,
      question: MIXED,
      mode: "always",
      request: fakeRequest(() => ({ ok: false, reason: "parse_error", model: "fake" })),
      env: {},
    })
    expect(failed.decision).toBe(decision)
    expect(failed.trace).toMatchObject({ used: true, rejectReason: "parse_error", prompt: "multi" })
    expect(failed.modelFailure).toBe("parse_error")
  })

  it("uses the old single instruction by default and the new one only with CHATBOT_ASSIST_PICK_PROMPT=v2", async () => {
    const { decision, analysis } = analyze(index, "녹화 영상 다시보기 어디서 봐요")
    const request = fakeRequest(() => ({ ok: true, pick: 1, model: "fake" }))
    const v1 = await maybeAssistWithModel({ index, analysis, decision, question: "녹화 영상 다시보기 어디서 봐요", mode: "always", request, env: {} })
    expect(request.mock.calls[0][0]).toEqual({ instruction: ANSWER_CARD_PICK_INSTRUCTION, input: expect.any(String), timeoutMs: expect.any(Number) })
    expect(v1.trace && "prompt" in v1.trace).toBe(false)
    await maybeAssistWithModel({ index, analysis, decision, question: "녹화 영상 다시보기 어디서 봐요", mode: "always", request, env: { CHATBOT_ASSIST_PICK_PROMPT: "v2" } })
    expect(request.mock.calls[1][0].instruction).toBe(ANSWER_CARD_PICK_INSTRUCTION_V2)
    expect(request.mock.calls[1][0].input).toBe(request.mock.calls[0][0].input)
    expect(request.mock.calls[1][0].expect).toBeUndefined()
  })

  it("adds caution lines to the new single input (asked absent concept, policy topic)", async () => {
    const { decision, analysis } = analyze(index, "ISMS 인증 받았나요?")
    const request = fakeRequest(() => ({ ok: true, pick: 1, model: "fake" }))
    await maybeAssistWithModel({
      index,
      analysis,
      decision,
      question: "ISMS 인증 받았나요?",
      mode: "always",
      request,
      isPolicyTopic: () => true,
      env: { CHATBOT_ASSIST_PICK_PROMPT: "v2" },
    })
    const input = request.mock.calls[0][0].input
    expect(input).toMatch(/^방문자 질문: ISMS 인증 받았나요\?\n\n주의: '[^']+'은\(는\) 공개 안내에 없음\n주의: 정책 주제\(요금·계약·체험·인원 한도 등\)가 섞여 있음\n\n답 카드 후보:\n\[1\] /)
  })
})

describe("compiled route with a compound question (fake Gemini)", () => {
  const bodies: string[] = []
  const fetchMock = vi.fn(async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const body = String(init?.body ?? "")
    bodies.push(body)
    const text = JSON.parse(body).contents[0].parts[0].text as string
    const kick = text.split("\n").find((line) => line.includes("(doc) 교실에서 내보내기") || line.includes(" ← 조각 2"))
    const n = kick ? Number(kick.match(/^\[(\d+)\]/)?.[1]) : 0
    const answer = isAnswerCardMultiPickRequestBody(body) ? JSON.stringify({ picks: [1, n] }) : JSON.stringify({ pick: 1 })
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: answer }] }, finishReason: "STOP" }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  })

  beforeEach(() => {
    bodies.length = 0
    __clearAnswerCacheForTests()
    __resetModelCircuitForTests()
    vi.stubGlobal("fetch", fetchMock)
    __setRouterAnswerIndexForTests(compileFixture())
    vi.stubEnv("GEMINI_API_KEY", "test-model-key")
    vi.stubEnv("CHATBOT_GEMINI_PROVIDER", "developer")
    vi.stubEnv("GEMINI_FAST_MODEL", "")
    vi.stubEnv("GEMINI_REASONING_MODEL", "")
    vi.stubEnv("GEMINI_MODEL", "")
    vi.stubEnv("ANSWER_INDEX_DATA_DIR", undefined)
    vi.stubEnv("CHATBOT_ANSWER_ROUTER", "compiled")
    vi.stubEnv("CHATBOT_ANSWER_ASSIST", "always")
  })

  afterEach(() => {
    __setRouterAnswerIndexForTests(null)
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it("sends one {picks} request and answers both fragments in question order", async () => {
    const result = await evaluateChatbotQuery(MIXED)
    expect(bodies).toHaveLength(1)
    const body = JSON.parse(bodies[0])
    expect(body.systemInstruction.parts[0].text).toBe(ANSWER_CARD_MULTI_PICK_INSTRUCTION)
    expect(body.generationConfig.responseSchema).toMatchObject({ properties: { picks: { type: "array" } } })
    expect(result.answerIndex).toMatchObject({ decision: "answer", card: CARDS.replay, segments: 2 })
    expect(result.answerIndex?.parts?.map((part) => [part.card, part.by])).toEqual([
      [CARDS.replay, "index"],
      [CARDS.kick, "assist"],
    ])
    expect(result.answerIndex?.assist).toMatchObject({ prompt: "multi", accepted: true })
    const replayAt = result.answer.indexOf("[다시보기]")
    expect(replayAt).toBeGreaterThanOrEqual(0)
  })
})
