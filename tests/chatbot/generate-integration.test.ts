import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { __clearAnswerGateCacheForTests } from "@/lib/chatbot/answer-gate"
import { flagSentence } from "@/lib/chatbot/answer-index/sentences"
import { CONTENT_SUGGEST_ALLOWLIST } from "@/lib/chatbot/generated-answer"
import {
  __clearAnswerCacheForTests,
  evaluateChatbotQuery,
  normalizeSessionHistoryForGemini,
  streamChatbotQuery,
  WEAK_SOURCE_DRAFT_ANSWER,
  type ChatbotStreamEvent,
} from "@/lib/chatbot/service"
import {
  answerGateResponse,
  enableGenerateMode,
  evidenceSelectionResponse,
  isAnswerGateCall,
  isEvidenceSelectionCall,
  isOutlinePickCall,
  outlinePickResponse,
  readEvidenceSelectionRequest,
} from "./helpers/final-answer-llm"

// generate 모드(모델이 고른 문장을 근거로 답을 다시 쓴다)를 서비스에 이은 것(2026-11-20 조사 G6·G13·G14·G15).
// Gemini 는 가짜 fetch 로 흉내 낸다. 예시 질문은 이 시험을 위해 지었다.

// 근거 선별이 문서 문장을 고르는 질문(문서 검색 경로).
const SELECTED_QUESTION = "클래스인으로 토론형 수업 운영 가능해?"
const MODEL_TEXT = "토론형 수업에서도 Classin으로 자료 공유와 판서, 녹화 복습 흐름을 함께 운영할 수 있어요."

interface ModelStub {
  plain?: () => unknown
  stream?: () => unknown
  pick?: (text: string) => boolean
}

function stubGemini({ plain, stream, pick }: ModelStub) {
  const kinds: string[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (isAnswerGateCall(init)) {
        kinds.push("gate")
        return answerGateResponse("answers")
      }
      if (isOutlinePickCall(init)) {
        kinds.push("outline")
        return outlinePickResponse([])
      }
      if (isEvidenceSelectionCall(init)) {
        kinds.push("selection")
        const request = readEvidenceSelectionRequest(init)
        return evidenceSelectionResponse(pick ? request.sentences.filter((sentence) => pick(sentence.text)).map((sentence) => sentence.id) : [1])
      }
      if (String(url).includes(":streamGenerateContent")) {
        kinds.push("stream")
        return stream ? stream() : sseResponse([sseLine(MODEL_TEXT, "STOP")])
      }
      if (String(url).includes(":generateContent")) {
        kinds.push("generate")
        return plain ? plain() : plainResponse(MODEL_TEXT, "STOP")
      }
      return { ok: true, status: 200, json: async () => ({}) }
    })
  )
  return { kinds }
}

function plainResponse(text: string, finishReason?: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ candidates: [{ content: { parts: [{ text }] }, ...(finishReason ? { finishReason } : {}) }] }),
  }
}

function sseLine(text: string, finishReason?: string) {
  return `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, ...(finishReason ? { finishReason } : {}) }] })}`
}

/** SSE 응답. fail 이 true 면 마지막 조각 뒤 읽기에서 끊긴다(연결 끊김·시간 초과). */
function sseResponse(lines: string[], { fail = false } = {}) {
  const encoder = new TextEncoder()
  let index = 0
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < lines.length) {
        controller.enqueue(encoder.encode(`${lines[index++]}\n\n`))
        return
      }
      if (fail) controller.error(Object.assign(new Error("aborted"), { name: "AbortError" }))
      else controller.close()
    },
  })
  return { ok: true, status: 200, body }
}

async function collectStream(message: string) {
  const events: ChatbotStreamEvent[] = []
  await streamChatbotQuery({ message, context: { showSources: true } }, {}, (event) => events.push(event))
  const replaces = events.filter((event) => event.type === "replace")
  return {
    answer: replaces.at(-1)?.type === "replace" ? (replaces.at(-1) as { answer: string }).answer : "",
    deltas: events.filter((event) => event.type === "delta").length,
    replaces: replaces.length,
  }
}

/** 같은 질문을 select 모드(모델은 문장만 고름)로 물은 답. generate 가 못 쓰면 이 답이 나가야 한다. */
async function selectModeAnswer(question: string) {
  vi.stubEnv("CHATBOT_FINAL_ANSWER_LLM", "select")
  stubGemini({})
  const result = await evaluateChatbotQuery(question)
  __clearAnswerCacheForTests()
  __clearAnswerGateCacheForTests()
  enableGenerateMode()
  return result
}

beforeAll(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {})
  vi.spyOn(console, "info").mockImplementation(() => {})
})

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "")
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "")
  vi.stubEnv("SUPABASE_SECRET_KEY", "")
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "")
  vi.stubEnv("GEMINI_API_KEY", "test-key")
  vi.stubEnv("GEMINI_FAST_MODEL", "")
  vi.stubEnv("GEMINI_REASONING_MODEL", "")
  vi.stubEnv("GEMINI_MODEL", "")
  vi.stubEnv("CHATBOT_PROVIDER", "")
  enableGenerateMode()
  __clearAnswerCacheForTests()
  __clearAnswerGateCacheForTests()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

afterAll(() => {
  vi.restoreAllMocks()
})

describe("generate 모드: 다시 쓰는 답", () => {
  it("근거 선별이 고른 답은 모델이 다시 쓴다(기준)", async () => {
    const { kinds } = stubGemini({})
    const result = await evaluateChatbotQuery(SELECTED_QUESTION)
    expect(kinds).toContain("selection")
    expect(kinds).toContain("generate")
    expect(result.answer).toContain("토론형 수업에서도 Classin으로")
    expect(result.modelState).toBe("ok")
  })

  it("관문을 거친 정해 둔 답·검수 틀 답은 다시 쓰지 않는다", async () => {
    for (const question of ["클래스인이 뭐예요?", "맥북에도 깔리나요?"]) {
      __clearAnswerCacheForTests()
      const { kinds } = stubGemini({})
      const result = await evaluateChatbotQuery(question)
      expect(kinds, question).toContain("gate")
      expect(kinds.filter((kind) => kind === "generate" || kind === "stream"), question).toEqual([])
      expect(result.answer, question).not.toContain(MODEL_TEXT)
    }
  })

  it("문서가 없는 질문(fallback 초안)은 모델에게 넘기지 않는다", async () => {
    const { kinds } = stubGemini({})
    const result = await evaluateChatbotQuery("클래스인으로 메타버스 아바타 수업도 되나요?")
    expect(kinds.filter((kind) => kind === "generate" || kind === "stream")).toEqual([])
    expect(result.answer).not.toContain(MODEL_TEXT)
  })
})

describe("generate 모드: 끝까지 받지 못한 답은 버린다", () => {
  it("MAX_TOKENS 로 잘린 답은 버리고 고른 문장 답을 낸다", async () => {
    const baseline = await selectModeAnswer(SELECTED_QUESTION)
    stubGemini({ plain: () => plainResponse(MODEL_TEXT, "MAX_TOKENS") })
    const result = await evaluateChatbotQuery(SELECTED_QUESTION)
    expect(result.answer).not.toContain("토론형 수업에서도 Classin으로")
    expect(result.answer).toBe(baseline.answer)
    expect(result.modelState).toBe("error")
  })

  it("두 번째 조각에서 끊긴 스트림은 초안(고른 문장 답)으로 돌아가고, 검사 전에 글을 흘리지 않는다", async () => {
    const baseline = await selectModeAnswer(SELECTED_QUESTION)
    stubGemini({ stream: () => sseResponse([sseLine("토론형 수업에서도 "), sseLine("Classin으로 자료 공유와")], { fail: true }) })
    const stream = await collectStream(SELECTED_QUESTION)
    expect(stream.deltas).toBe(0)
    expect(stream.replaces).toBe(1)
    expect(stream.answer).toBe(baseline.answer)
  })
})

describe("generate 모드: 내보내기 전 검사", () => {
  const [allowed] = CONTENT_SUGGEST_ALLOWLIST

  it("추천 자료 토큰으로 끝난 답은 토큰을 뗀 뒤 통과하고, 허용 목록 자료만 정해진 제목으로 추천한다", async () => {
    const text = `${MODEL_TEXT}\n[CONTENT_SUGGEST: type=resource, slug=${allowed.slug}, title=모델이 지은 제목]\n[CONTENT_SUGGEST:type=blog,slug=made-up-post,title=없는 글]`
    stubGemini({ plain: () => plainResponse(text, "STOP") })
    const result = await evaluateChatbotQuery(SELECTED_QUESTION)
    expect(result.answer).toContain("토론형 수업에서도 Classin으로")
    expect(result.answer).not.toContain("CONTENT_SUGGEST")
    expect(result.suggestedContent).toEqual([{ type: "resource", slug: allowed.slug, title: allowed.title, url: `/resources/${allowed.slug}` }])
  })

  it("근거 밖 숫자를 지은 문장은 버린다", async () => {
    stubGemini({ plain: () => plainResponse(`${MODEL_TEXT} 한 수업에 최대 500명까지 함께 토론할 수 있어요.`, "STOP") })
    const result = await evaluateChatbotQuery(SELECTED_QUESTION)
    expect(result.answer).toContain("토론형 수업에서도 Classin으로")
    expect(result.answer).not.toContain("500명")
  })

  it("남는 문장이 없으면(연락처를 묻는 글뿐) 고른 문장 답을 낸다", async () => {
    const baseline = await selectModeAnswer(SELECTED_QUESTION)
    stubGemini({ plain: () => plainResponse("수업 운영을 도와드릴게요. 연락처 남겨 주세요.", "STOP") })
    const result = await evaluateChatbotQuery(SELECTED_QUESTION)
    expect(result.answer).toBe(baseline.answer)
  })

  it("stream 과 non-stream 의 최종 답이 같다", async () => {
    const text = `${MODEL_TEXT} 한 수업에 최대 500명까지 함께 토론할 수 있어요.\n[CONTENT_SUGGEST:type=resource,slug=${allowed.slug},title=제목]`
    stubGemini({
      plain: () => plainResponse(text, "STOP"),
      stream: () => sseResponse([sseLine(text.slice(0, 20)), sseLine(text.slice(20), "STOP")]),
    })
    const nonStream = await evaluateChatbotQuery(SELECTED_QUESTION)
    __clearAnswerCacheForTests()
    const stream = await collectStream(SELECTED_QUESTION)
    expect(stream.deltas).toBe(0)
    expect(stream.answer).toBe(nonStream.answer)
    expect(nonStream.answer).toContain("토론형 수업에서도 Classin으로")
  })
})

describe("근거 선별: 앞 문장에 기대는 문장(2026-11-20 조사 G15)", () => {
  it("앞 문장 없이 connective 문장만 고르면 답 문장을 못 찾은 것으로 다룬다", async () => {
    vi.stubEnv("CHATBOT_FINAL_ANSWER_LLM", "select")
    const isConnective = (text: string) => flagSentence(text, { docLink: false, table: false }).includes("connective")
    const { kinds } = stubGemini({ pick: isConnective })
    const result = await evaluateChatbotQuery("퀴즈 결과는 어디서 확인하나요?")
    expect(kinds).toContain("selection")
    expect(result.answer).toContain(WEAK_SOURCE_DRAFT_ANSWER.split("\n\n")[0])
    expect(result.sources).toEqual([])
  })
})

describe("세션 이력 정규화", () => {
  it("user 가 연이으면 마지막 user 를 남겨 뒤의 답과 짝을 맞춘다", () => {
    expect(
      normalizeSessionHistoryForGemini([
        { role: "user", content: "답을 못 받은 질문" },
        { role: "user", content: "다시 물은 질문" },
        { role: "assistant", content: "다시 물은 질문의 답" },
        { role: "user", content: "아직 답 없는 최신 질문" },
      ])
    ).toEqual([
      { role: "user", parts: [{ text: "다시 물은 질문" }] },
      { role: "model", parts: [{ text: "다시 물은 질문의 답" }] },
    ])
  })
})

describe("고정 답에는 안내형 첫마디·영업 끝 질문을 붙이지 않는다(2026-11-20 조사 G6)", () => {
  it.each(["죄송한데 처음이라 몰라서요, 양자암호 지원하나요?", "걱정돼서 그런데 양자암호 지원하나요?"])(
    "%s: 못 찾음 답 앞에 안내형 첫마디, 뒤에 끝 질문이 붙지 않는다",
    async (question) => {
      vi.stubEnv("GEMINI_API_KEY", "")
      const result = await evaluateChatbotQuery(question, { generateAnswer: false })
      expect(result.answer.startsWith("이 질문에 대한 내용은 공개 안내에서 찾지 못했어요.")).toBe(true)
      expect(result.answer).not.toMatch(/순서대로 알려 드릴게요|차근차근 확인해 볼게요/)
      expect(result.answer).not.toMatch(/몇 명인지 알려 주시면|도입은 언제쯤|기기가 PC인지/)
    }
  )
})
