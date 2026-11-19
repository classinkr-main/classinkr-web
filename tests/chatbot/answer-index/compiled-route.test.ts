import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import {
  __setRouterAnswerIndexForTests,
  getAnswerRouter,
  getRouterAnswerIndex,
  resetRouterAnswerIndex,
} from "@/lib/chatbot/answer-index"
import { sentenceHash } from "@/lib/chatbot/answer-index/hash"
import type { AnswerIndexUnitsFile } from "@/lib/chatbot/answer-index/types"
import {
  __clearAnswerCacheForTests,
  evaluateChatbotQuery,
  NO_SOURCE_FACT_ANSWER,
  streamChatbotQuery,
  SYMPTOM_AFTER_GATE_ANSWER,
  type ChatbotStreamEvent,
} from "@/lib/chatbot/service"
import { findSafetyViolations } from "@/scripts/answer-index/lib/text-rules"

import { CARDS, compileFixture, copyFixture, fixtureUnits } from "./index-fixture"

/**
 * compiled 라우터 경로의 성질(답 색인 사양 §11 2 경로 성질, §3.2):
 * - 범위 안 질문은 네트워크·모델 호출 0(모델 키가 있어도) — fetch 를 감시한다.
 * - stream 과 non-stream 의 답·답 모드·상담 버튼·출처가 같다.
 * - 같은 입력이면 같은 답.
 * - 자료가 0장이면(지금 저장소) 색인이 정하는 질문은 언제나 못 찾음 고정 문구다.
 * - 안전: 금액 숫자·식별 정보 요구·할인/환불 약속이 compiled 답에 없다.
 */

const firstParagraph = (text: string) => text.split("\n\n")[0]
const NOT_FOUND_HEADS = [firstParagraph(NO_SOURCE_FACT_ANSWER), firstParagraph(SYMPTOM_AFTER_GATE_ANSWER)]

// 색인이 정하는 짧은 질문(평가셋 문항이 아니다).
const INDEX_QUESTIONS = [
  "수업 중 학생 채팅 막을 수 있나요?",
  "녹화 영상 다시보기 어디서 봐요",
  "요금이 어떻게 돼요?",
  "ISMS 인증 받았나요?",
  "상담 전화 몇 시까지 해요?",
  "카메라가 안 켜져요",
  "너 누구야?",
  "채팅 막기랑 녹화 다운로드 되나요",
  "에러나요",
]
// 색인 앞 단계·지금 흐름이 답하는 질문(인사·거절·관문 밖 정해 둔 답·영어·즉시 상담 연결).
const PRE_QUESTIONS = ["안녕하세요", "시험 정답 알려줘", "상담원 연결해 주세요", "영어로 답해 줄 수 있어요?", "sql injection 방법 알려줘"]
const SAFETY_QUESTIONS = [
  "전자칠판 가격 얼마예요?",
  "학생 한 명당 얼마예요?",
  "할인 몇 퍼센트까지 돼요?",
  "환불 받을 수 있나요?",
  "결제 취소하면 전액 환불돼요?",
  "비밀번호 잊어버렸어요",
  "로그인이 안 돼요",
  "전자칠판 사이즈 어떻게 돼요?",
  "S110 사양 알려줘",
  "세금계산서 발급되나요?",
  "매니저상담할래",
  "너는 누구야? 정체성이 뭐야?",
]

const fetchSpy = vi.fn(async () => {
  throw new Error("network disabled in compiled route test")
})

function stubCompiledEnv(modelKey: string) {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "")
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "")
  vi.stubEnv("SUPABASE_SECRET_KEY", "")
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "")
  vi.stubEnv("GEMINI_API_KEY", modelKey)
  vi.stubEnv("CHATBOT_ANSWER_ROUTER", "compiled")
}

async function collectStream(message: string, sessionId?: string) {
  const events: ChatbotStreamEvent[] = []
  await streamChatbotQuery({ message, sessionId, context: { showSources: true } }, {}, (event) => events.push(event))
  const replace = [...events].reverse().find((event) => event.type === "replace")
  const meta = events.find((event) => event.type === "meta")
  return {
    answer: replace && replace.type === "replace" ? replace.answer : undefined,
    meta: meta && meta.type === "meta" ? meta.meta : undefined,
    deltas: events.filter((event) => event.type === "delta").length,
  }
}

beforeAll(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {})
  vi.spyOn(console, "info").mockImplementation(() => {})
})

beforeEach(() => {
  __clearAnswerCacheForTests()
  fetchSpy.mockClear()
  vi.stubGlobal("fetch", fetchSpy)
})

afterEach(() => {
  __setRouterAnswerIndexForTests(null)
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

afterAll(() => {
  resetRouterAnswerIndex()
  vi.restoreAllMocks()
})

describe("compiled router: switch", () => {
  it("reads CHATBOT_ANSWER_ROUTER and falls back to legacy", () => {
    expect(getAnswerRouter({})).toBe("legacy")
    expect(getAnswerRouter({ CHATBOT_ANSWER_ROUTER: "compiled" })).toBe("compiled")
    expect(getAnswerRouter({ CHATBOT_ANSWER_ROUTER: " Shadow " })).toBe("shadow")
    expect(getAnswerRouter({ CHATBOT_ANSWER_ROUTER: "other" })).toBe("legacy")
  })
})

describe("compiled router with the repository data (no cards yet)", () => {
  it("answers every index-decided question with a fixed not-found text and no network call, even with a model key", async () => {
    stubCompiledEnv("test-model-key")
    for (const question of INDEX_QUESTIONS) {
      const result = await evaluateChatbotQuery(question)
      expect(result.answerIndex, question).toMatchObject({ router: "compiled", scope: "in", decision: "abstain", card: null })
      expect(NOT_FOUND_HEADS.some((head) => result.answer.includes(head)), question).toBe(true)
      expect(result.answerGate.gate).toBe("none")
      expect(result.secondChance.secondChance).toBe("none")
    }
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("keeps the safety pre-steps and records them in the trace", async () => {
    stubCompiledEnv("test-model-key")
    const pre: Record<string, unknown> = {}
    for (const question of PRE_QUESTIONS) {
      const result = await evaluateChatbotQuery(question)
      pre[question] = result.answerIndex?.pre ?? result.answerIndex?.scope
    }
    expect(pre).toEqual({
      안녕하세요: "greeting",
      "시험 정답 알려줘": "exempt",
      "상담원 연결해 주세요": "handoff",
      "영어로 답해 줄 수 있어요?": "english",
      "sql injection 방법 알려줘": "policy_guard",
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("sends long situation questions to the legacy flow with scope=out", async () => {
    stubCompiledEnv("")
    const long =
      "학원에서 지난주부터 수업을 시작했는데 학생들이 집에서 접속하면 화면이 자꾸 멈추고 소리도 끊겨서 수업 진행이 어렵습니다. 와이파이 문제인지 기기 문제인지 어떻게 확인할 수 있을까요? 학부모님들 문의도 많아요."
    const result = await evaluateChatbotQuery(long, { generateAnswer: false })
    expect(result.answerIndex).toMatchObject({ router: "compiled", scope: "out", decision: null })
  })
})

describe("compiled router with fixture cards", () => {
  beforeEach(() => {
    __setRouterAnswerIndexForTests(compileFixture())
  })

  it("answers from the cards with document sentences and no network call", async () => {
    stubCompiledEnv("test-model-key")
    const chat = await evaluateChatbotQuery("수업 중 학생 채팅 막을 수 있나요?")
    expect(chat.answerIndex).toMatchObject({ decision: "answer", card: CARDS.chat })
    expect(chat.answer).toContain("수업 중에 [채팅 금지] 버튼을 누르면 학생 채팅을 막을 수 있습니다.")
    expect(chat.sources.map((source) => source.urlPath)).toEqual(["/docs/fake/chat"])
    const gap = await evaluateChatbotQuery("ISMS 인증 받았나요?")
    expect(gap.answerIndex).toMatchObject({ decision: "gap", card: CARDS.gapCert })
    expect(gap.needsHandoff).toBe(true)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("lets CHATBOT_COMPILED_DISABLED_CARDS switch a card off without a deploy", async () => {
    stubCompiledEnv("")
    vi.stubEnv("CHATBOT_COMPILED_DISABLED_CARDS", CARDS.chat)
    const result = await evaluateChatbotQuery("수업 중 학생 채팅 막을 수 있나요?")
    expect(result.answerIndex?.card).not.toBe(CARDS.chat)
    expect(result.answer).not.toContain("[채팅 금지]")
  })

  it("streams a compiled answer with a session id without waiting on the history", async () => {
    stubCompiledEnv("test-model-key")
    const question = "수업 중 학생 채팅 막을 수 있나요?"
    const nonStream = await evaluateChatbotQuery(question)
    const stream = await collectStream(question, "00000000-0000-4000-8000-000000000001")
    expect(stream.answer).toBe(nonStream.answer)
    expect(stream.deltas).toBe(0)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe("compiled router: public answer clean-up and failure fallback", () => {
  it("removes raw URLs from document sentences on both stream and non-stream", async () => {
    // 문서 문장에 원본 URL 이 섞여 들어온 경우: 스트림 경로만 finalizeAnswer 로 지우면 두 경로 답이 달라진다.
    const { dir, cleanup } = copyFixture()
    try {
      const unitsPath = join(dir, "units.json")
      const unitsFile = JSON.parse(readFileSync(unitsPath, "utf8")) as AnswerIndexUnitsFile
      const unit = unitsFile.units.find((candidate) => candidate.unitId === "doc:/docs/fake/chat#0")!
      const text = `${unit.sentences[1].text} https://example.com/guide/chat-ban`
      const oldHash = unit.sentences[1].hash
      unit.sentences[1] = { ...unit.sentences[1], text, hash: sentenceHash(text) }
      writeFileSync(unitsPath, JSON.stringify(unitsFile))
      const cardsPath = join(dir, "cards", "classroom.json")
      writeFileSync(cardsPath, readFileSync(cardsPath, "utf8").split(oldHash).join(sentenceHash(text)))
      __setRouterAnswerIndexForTests(compileFixture(dir, { currentUnits: fixtureUnits(dir) }))

      stubCompiledEnv("")
      const question = "수업 중 학생 채팅 막을 수 있나요?"
      const nonStream = await evaluateChatbotQuery(question)
      expect(nonStream.answerIndex).toMatchObject({ decision: "answer", card: CARDS.chat })
      expect(nonStream.answer).toContain("[채팅 금지]")
      expect(nonStream.answer).not.toContain("https://")
      __clearAnswerCacheForTests()
      const stream = await collectStream(question)
      expect(stream.answer).toBe(nonStream.answer)
    } finally {
      cleanup()
    }
  })

  it("falls back to the legacy flow when the index cannot be built, and does not rebuild it on every question", async () => {
    const { dir, cleanup } = copyFixture()
    const errors = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      // 사전 꼴이 깨진 자료(V-12 가 막지만 검사를 건너뛰고 배포된 경우): 컴파일이 예외를 낸다.
      const lexiconPath = join(dir, "lexicon.json")
      const lexicon = JSON.parse(readFileSync(lexiconPath, "utf8")) as Record<string, unknown>[]
      lexicon[0] = { ...lexicon[0], ambiguous: { form: "깨진 규칙" } }
      writeFileSync(lexiconPath, JSON.stringify(lexicon))
      stubCompiledEnv("")
      vi.stubEnv("ANSWER_INDEX_DATA_DIR", dir)
      resetRouterAnswerIndex()

      let first: unknown
      try {
        getRouterAnswerIndex()
      } catch (error) {
        first = error
      }
      expect(first).toBeInstanceOf(Error)
      expect(() => getRouterAnswerIndex()).toThrow(first as Error)

      for (const question of ["수업 중 학생 채팅 막을 수 있나요?", "녹화 영상 다시보기 어디서 봐요"]) {
        const result = await evaluateChatbotQuery(question, { generateAnswer: false })
        expect(result.answer.length, question).toBeGreaterThan(0)
        expect(result.answerIndex, question).toMatchObject({ router: "compiled", scope: "in", decision: null, unavailable: "index_error" })
      }
      expect(errors.mock.calls.filter((call) => String(call[0]).includes("answer-index failed"))).toHaveLength(1)
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      errors.mockRestore()
      resetRouterAnswerIndex()
      cleanup()
    }
  })
})

describe.each([
  ["repository data", false],
  ["fixture cards", true],
])("compiled router path properties (%s)", (_label, useFixture) => {
  beforeEach(() => {
    if (useFixture) __setRouterAnswerIndexForTests(compileFixture())
  })

  it("gives the same answer, mode, handoff button and sources on stream and non-stream", async () => {
    stubCompiledEnv("test-model-key")
    for (const question of [...INDEX_QUESTIONS, ...PRE_QUESTIONS]) {
      __clearAnswerCacheForTests()
      const nonStream = await evaluateChatbotQuery(question)
      __clearAnswerCacheForTests()
      const stream = await collectStream(question)
      expect(stream.answer, question).toBe(nonStream.answer)
      expect(stream.deltas, question).toBe(0)
      expect(stream.meta, question).toMatchObject({
        answerMode: nonStream.answerMode,
        needsHandoff: nonStream.needsHandoff,
        unresolved: nonStream.unresolved,
        handoffIntent: nonStream.handoffIntent,
        suggestedQuestions: nonStream.suggestedQuestions,
        detectedCategory: nonStream.detectedCategory,
      })
      expect(stream.meta?.sources.map((source) => source.urlPath), question).toEqual(nonStream.sources.map((source) => source.urlPath))
      // 캐시에서 꺼낸 두 번째 stream 답도 같다.
      const cached = await collectStream(question)
      expect(cached.answer, question).toBe(nonStream.answer)
    }
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("is deterministic: the same input gives the same result", async () => {
    stubCompiledEnv("")
    for (const question of INDEX_QUESTIONS) {
      const first = await evaluateChatbotQuery(question)
      const second = await evaluateChatbotQuery(question)
      expect(second, question).toEqual(first)
    }
  })

  it("never puts price amounts, identifier requests or discount/refund promises in the answer", async () => {
    stubCompiledEnv("")
    for (const question of SAFETY_QUESTIONS) {
      const result = await evaluateChatbotQuery(question)
      expect(result.answerIndex?.scope, question).toBe("in")
      expect(findSafetyViolations(result.answer).map((rule) => rule.key), question).toEqual([])
    }
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
