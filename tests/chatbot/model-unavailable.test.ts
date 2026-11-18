import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { __clearAnswerGateCacheForTests } from "@/lib/chatbot/answer-gate"
import {
  __clearAnswerCacheForTests,
  evaluateChatbotQuery,
  MODEL_UNAVAILABLE_ANSWER,
  NO_SOURCE_FACT_ANSWER,
  streamChatbotQuery,
  type ChatbotStreamEvent,
  type ChatbotStreamMeta,
} from "@/lib/chatbot/service"
import {
  answerGateResponse,
  evidenceSelectionResponse,
  isAnswerGateCall,
  isEvidenceSelectionCall,
  isOutlinePickCall,
  outlinePickResponse,
} from "./helpers/final-answer-llm"

// 모델(근거 선별) 호출이 실패했을 때 확인되지 않은 검색 조각을 답으로 내지 않는다(lib/chatbot/service.ts withholdUnverifiedDraft).
// 2026-11-18 Gemini 크레딧 소진(모든 호출 402) 상태에서 처음 보는 질문 90개 중 46건이 검색 조각 초안을 그대로 냈다.

function disableSupabase() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "")
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "")
  vi.stubEnv("SUPABASE_SECRET_KEY", "")
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "")
}

// 낱말 목록 안의 질문. 모델이 죽은 상태에서 검색 조각 초안("재원생을 클래스인에 처음 올릴 때는…")이 그대로 나가던 질문이다.
const IN_VOCAB_QUESTION = "학생 계정은 따로 만들어 줘야 하나요"
const MODEL_UNAVAILABLE_HEAD = MODEL_UNAVAILABLE_ANSWER.split("\n\n")[0]

type Failure = "402" | "500" | "timeout" | "parse"

function failingResponse(failure: Failure) {
  if (failure === "timeout") {
    // AbortController 가 시간 초과로 끊은 것과 같은 오류를 낸다.
    return Promise.reject(Object.assign(new Error("The operation was aborted."), { name: "AbortError" }))
  }
  if (failure === "parse") {
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: "not json" }] } }] }) })
  }
  const status = failure === "402" ? 402 : 500
  return Promise.resolve({ ok: false, status, json: async () => ({}), text: async () => `error ${status}` })
}

interface StubOptions {
  /** 근거 선별 호출의 결과. 실패 종류나 고를 번호. */
  selection?: Failure | number[]
  verdict?: "answers" | "off_target"
  /** 관문 호출도 실패시킨다. */
  gate?: Failure
}

function stubModel({ selection = "402", verdict = "answers", gate }: StubOptions = {}) {
  const calls: string[] = []
  const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    if (isAnswerGateCall(init)) {
      calls.push("gate")
      return gate ? failingResponse(gate) : answerGateResponse(verdict)
    }
    if (isOutlinePickCall(init)) {
      calls.push("outline")
      return outlinePickResponse([])
    }
    if (isEvidenceSelectionCall(init)) {
      calls.push("selection")
      return Array.isArray(selection) ? evidenceSelectionResponse(selection) : failingResponse(selection)
    }
    calls.push("other")
    return { ok: true, status: 200, json: async () => ({}) }
  })
  vi.stubGlobal("fetch", fetchMock)
  return { calls, fetchMock }
}

async function collectStream(message: string) {
  const events: ChatbotStreamEvent[] = []
  await streamChatbotQuery({ message }, {}, (event) => events.push(event))
  const replaces = events.filter((event): event is { type: "replace"; answer: string } => event.type === "replace")
  const meta = events.find((event): event is { type: "meta"; meta: ChatbotStreamMeta } => event.type === "meta")?.meta
  const deltas = events.filter((event) => event.type === "delta")
  return { answer: replaces.at(-1)?.answer ?? "", meta, deltas }
}

describe("모델 호출 실패 시 확인 안 된 조각을 내지 않는다", () => {
  beforeEach(() => {
    disableSupabase()
    vi.stubEnv("GEMINI_API_KEY", "test-key")
    vi.stubEnv("CHATBOT_ANSWER_GATE", "")
    vi.stubEnv("CHATBOT_FINAL_ANSWER_LLM", "")
    vi.stubEnv("CHATBOT_SECOND_CHANCE", "")
    __clearAnswerGateCacheForTests()
    __clearAnswerCacheForTests()
    vi.spyOn(console, "warn").mockImplementation(() => {})
    vi.spyOn(console, "info").mockImplementation(() => {})
    vi.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("기준: 모델 없이 만든 초안은 검색 조각이다(이 질문은 낱말 목록 안이라 기존에는 보류되지 않았다)", async () => {
    const draft = await evaluateChatbotQuery(IN_VOCAB_QUESTION, { generateAnswer: false })
    expect(draft.answerMode).toBe("direct_answer")
    expect(draft.sources.length).toBeGreaterThan(0)
    expect(draft.answer).not.toContain(MODEL_UNAVAILABLE_HEAD)
  })

  for (const failure of ["402", "500", "timeout", "parse"] as const) {
    it(`선별 호출이 실패(${failure})하면 낱말 목록 안 질문도 조각 대신 고정 문구와 상담 버튼을 낸다`, async () => {
      const draft = await evaluateChatbotQuery(IN_VOCAB_QUESTION, { generateAnswer: false })
      const { calls } = stubModel({ selection: failure })

      const result = await evaluateChatbotQuery(IN_VOCAB_QUESTION)

      expect(calls).toContain("selection")
      expect(result.answer).toBe(MODEL_UNAVAILABLE_ANSWER)
      expect(result.answer).not.toContain(draft.answer.split("\n\n")[0])
      expect(result.answerMode).toBe("handoff")
      expect(result.needsHandoff).toBe(true)
      expect(result.handoffIntent).toBeTruthy()
      expect(result.unresolved).toBe(true)
      expect(result.sources).toHaveLength(0)
      expect(result.confidence).toBeLessThanOrEqual(0.2)
      // '못 찾음'이 아니다: 두 번째 검색(목차 고르기)을 부르지 않는다.
      expect(result.answer).not.toContain(NO_SOURCE_FACT_ANSWER.split("\n\n")[0])
      expect(calls).not.toContain("outline")
      expect(result.secondChance.secondChance).toBe("none")
    })
  }

  it("고정 문구 답은 답 캐시에 넣지 않아, 모델이 살아나면 다음 요청에서 다시 고른다", async () => {
    stubModel({ selection: "500" })
    const first = await evaluateChatbotQuery(IN_VOCAB_QUESTION)
    expect(first.answer).toBe(MODEL_UNAVAILABLE_ANSWER)

    const healthy = stubModel({ selection: [1] })
    const second = await evaluateChatbotQuery(IN_VOCAB_QUESTION)
    expect(healthy.calls).toContain("selection")
    expect(second.answerMode).toBe("direct_answer")
    expect(second.answer).not.toContain(MODEL_UNAVAILABLE_HEAD)
  })

  it("스트림 경로도 같은 답·같은 연결 표시를 내고, 확인 전에 조각을 delta 로 흘리지 않는다", async () => {
    for (const question of [IN_VOCAB_QUESTION, "급해요 ㅠㅠ 학생 계정은 따로 만들어 줘야 하나요", "학생 계정 따로 만들어야 하냐고요!!"]) {
      // 스트림을 먼저 돌린다(일반 경로가 캐시를 남기면 차이가 가려진다. 이 답은 캐시되지 않지만 순서를 지킨다).
      stubModel({ selection: "500" })
      const stream = await collectStream(question)
      stubModel({ selection: "500" })
      const normal = await evaluateChatbotQuery(question)

      expect(normal.answer, question).toContain(MODEL_UNAVAILABLE_HEAD)
      expect(stream.answer, question).toBe(normal.answer)
      expect(stream.deltas, question).toHaveLength(0)
      expect(stream.meta?.answerMode, question).toBe(normal.answerMode)
      expect(stream.meta?.needsHandoff, question).toBe(true)
      expect(stream.meta?.unresolved, question).toBe(true)
      expect(stream.meta?.handoffIntent, question).toBe(normal.handoffIntent)
    }
  })

  it("스트림 경로의 고정 문구 답도 캐시하지 않는다", async () => {
    stubModel({ selection: "500" })
    await collectStream(IN_VOCAB_QUESTION)
    const healthy = stubModel({ selection: [1] })
    const again = await collectStream(IN_VOCAB_QUESTION)
    expect(healthy.calls).toContain("selection")
    expect(again.answer).not.toContain(MODEL_UNAVAILABLE_HEAD)
  })

  it("선별이 설정으로 꺼진 경우(키 없음·CHATBOT_FINAL_ANSWER_LLM=off)는 기존 동작 그대로다", async () => {
    vi.stubEnv("GEMINI_API_KEY", "")
    const baseline = await evaluateChatbotQuery(IN_VOCAB_QUESTION, { generateAnswer: false })
    const { calls } = stubModel({ selection: "500" })
    const noKey = await evaluateChatbotQuery(IN_VOCAB_QUESTION)
    expect(noKey.answer).toBe(baseline.answer)
    expect(calls).toHaveLength(0)

    vi.stubEnv("GEMINI_API_KEY", "test-key")
    vi.stubEnv("CHATBOT_FINAL_ANSWER_LLM", "off")
    __clearAnswerCacheForTests()
    const off = await evaluateChatbotQuery(IN_VOCAB_QUESTION)
    expect(off.answer).toBe(baseline.answer)
  })

  it("큐레이션 출처(점수 240 이상) 틀 답은 선별이 실패해도 그대로 낸다", async () => {
    const question = "세금계산서 발행 어떻게 받아요"
    const baseline = await evaluateChatbotQuery(question, { generateAnswer: false })
    expect(baseline.sources[0]?.score ?? 0).toBeGreaterThanOrEqual(240)
    stubModel({ selection: "500", verdict: "answers" })
    const result = await evaluateChatbotQuery(question)
    expect(result.answer).toBe(baseline.answer)
  })

  it("정해 둔 답은 관문 호출이 실패해도(건너뜀) 기존 답 그대로다", async () => {
    const question = "전자칠판 꼭 사야하나요?"
    const baseline = await evaluateChatbotQuery(question, { generateAnswer: false })
    stubModel({ selection: "500", gate: "500" })
    const result = await evaluateChatbotQuery(question)
    expect(result.answerGate.gate).toBe("skipped")
    expect(result.answer).toBe(baseline.answer)
  })

  it("관문이 버린 뒤 문서 경로의 선별 호출이 실패하면 '못 찾음'을 단정하지 않고 고정 문구를 낸다", async () => {
    const question = "전자칠판 꼭 사야하나요?"
    const { calls } = stubModel({ verdict: "off_target", selection: "500" })
    const result = await evaluateChatbotQuery(question)
    expect(result.answerGate.gate).toBe("rejected")
    expect(calls).toContain("selection")
    expect(result.answer).toContain(MODEL_UNAVAILABLE_HEAD)
    expect(result.answer).not.toContain(NO_SOURCE_FACT_ANSWER.split("\n\n")[0])
    expect(result.needsHandoff).toBe(true)
    expect(result.unresolved).toBe(true)
    expect(result.sources).toHaveLength(0)
    expect(calls).not.toContain("outline")
  })

  it("내부 CS 경로(includeInternalDocs)는 바꾸지 않는다", async () => {
    stubModel({ selection: "500" })
    const result = await evaluateChatbotQuery(IN_VOCAB_QUESTION, { includeInternalDocs: true })
    expect(result.answer).not.toContain(MODEL_UNAVAILABLE_HEAD)
  })
})
