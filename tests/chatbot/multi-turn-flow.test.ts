import { NextRequest } from "next/server"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { POST as postQuery } from "@/app/api/chatbot/query/route"
import { POST as postStream } from "@/app/api/chatbot/query/stream/route"

import { __clearAnswerGateCacheForTests } from "@/lib/chatbot/answer-gate"
import { detectAskedSlot } from "@/lib/chatbot/follow-up"
import {
  __clearAnswerCacheForTests,
  ChatbotInputError,
  evaluateChatbotQuery,
  streamChatbotQuery,
  validateChatbotQueryInput,
  type ChatbotStreamEvent,
  type ChatbotStreamMeta,
} from "@/lib/chatbot/service"
import { PRIOR_BOT_LINE, PRIOR_INQUIRY_LINE } from "@/lib/chatbot/tone"
import { stubEvidenceSelection } from "./helpers/final-answer-llm"

// 두 턴 대화(직전 한 턴을 위젯이 보내는 계약, lib/chatbot/conversation-context.ts). 예시 질문은 이 시험을 위해 지었다.
// 직전 턴은 측정 스크립트(scripts/lib/chatbot-live-eval-checks.ts buildPreviousTurn)와 같은 방법으로 만든다.

function disableExternal() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "")
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "")
  vi.stubEnv("SUPABASE_SECRET_KEY", "")
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "")
  vi.stubEnv("GEMINI_API_KEY", "")
  vi.stubEnv("CHATBOT_ANSWER_ROUTER", "")
}

type Evaluated = Awaited<ReturnType<typeof evaluateChatbotQuery>>

function previousTurnOf(question: string, answer: Evaluated) {
  const askedSlot = detectAskedSlot(answer.answer)
  return { question: question.slice(0, 200), ...(askedSlot ? { askedSlot } : {}), answerMode: answer.answerMode }
}

async function twoTurns(first: string, second: string, options: { pagePath?: string } = {}) {
  const firstAnswer = await evaluateChatbotQuery(first, { generateAnswer: false, ...options })
  const previousTurn = previousTurnOf(first, firstAnswer)
  const secondAnswer = await evaluateChatbotQuery(second, { generateAnswer: false, previousTurn, ...options })
  return { firstAnswer, previousTurn, secondAnswer }
}

async function collectStream(message: string, context: Record<string, unknown>) {
  const events: ChatbotStreamEvent[] = []
  await streamChatbotQuery({ message, context: { showSources: true, ...context } }, {}, (event) => events.push(event))
  const replace = [...events].reverse().find((event) => event.type === "replace")
  const meta = events.find((event) => event.type === "meta")
  return {
    answer: replace?.type === "replace" ? replace.answer : "",
    meta: meta?.type === "meta" ? (meta.meta as ChatbotStreamMeta) : undefined,
  }
}

const fetchSpy = vi.fn(async () => {
  throw new Error("network disabled in multi-turn flow test")
})

beforeAll(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {})
  vi.spyOn(console, "info").mockImplementation(() => {})
})

beforeEach(() => {
  __clearAnswerCacheForTests()
  __clearAnswerGateCacheForTests()
  disableExternal()
  fetchSpy.mockClear()
  vi.stubGlobal("fetch", fetchSpy)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

afterAll(() => {
  vi.restoreAllMocks()
})

describe("두 턴: 뒤 턴이 앞 턴 주제로 답한다", () => {
  it("증상 다음 '휴대폰이요'는 같은 증상 안내다(일반 되묻기가 아니다)", async () => {
    const alone = await evaluateChatbotQuery("휴대폰이요", { generateAnswer: false })
    expect(alone.answerMode).toBe("clarifying_question")
    const { secondAnswer } = await twoTurns("카메라가 안 켜져요", "휴대폰이요")
    expect(secondAnswer.contextExpanded).toBe(true)
    expect(secondAnswer.answerMode).toBe("direct_answer")
    expect(secondAnswer.answer).toContain("카메라")
    expect(secondAnswer.sources.map((source) => source.urlPath)).toContain("/docs/start/camera-mic-troubleshooting")
  })

  it("소개 다음 '전자칠판이요'는 전자칠판 안내다", async () => {
    const { secondAnswer } = await twoTurns("클래스인이 뭐예요?", "전자칠판이요")
    expect(secondAnswer.contextExpanded).toBe(true)
    expect(secondAnswer.detectedCategory).toBe("hardware")
    expect(secondAnswer.answer).toMatch(/전자칠판|Classin Board/)
    expect(secondAnswer.answerMode).not.toBe("clarifying_question")
  })

  it("'그러면 아이패드는요'는 앞 턴 증상으로 답한다", async () => {
    const alone = await evaluateChatbotQuery("그러면 아이패드는요", { generateAnswer: false })
    const { secondAnswer } = await twoTurns("카메라가 안 켜져요", "그러면 아이패드는요")
    expect(secondAnswer.conversationReason).toBe("follow_up")
    expect(secondAnswer.answer).toContain("카메라")
    expect(secondAnswer.answer).not.toBe(alone.answer)
  })

  it("'아까 그거 다시 알려주세요'는 '지난 문의는 볼 수 없어요' 대신 앞 턴 안내를 다시 준다", async () => {
    const alone = await evaluateChatbotQuery("아까 그거 다시 알려주세요", { generateAnswer: false })
    expect(alone.answer).toContain(PRIOR_INQUIRY_LINE)
    const { secondAnswer } = await twoTurns("카메라가 안 켜져요", "아까 그거 다시 알려주세요")
    expect(secondAnswer.answer).not.toContain(PRIOR_INQUIRY_LINE)
    expect(secondAnswer.answer).not.toMatch(/볼\s*수\s*없/)
    expect(secondAnswer.answer).toContain("카메라")
  })

  it("증상 안내 뒤 '해 봤는데 또 안 돼요'는 같은 안내를 또 주지 않고 상담으로 잇는다", async () => {
    const alone = await evaluateChatbotQuery("해 봤는데 또 안 돼요", { generateAnswer: false })
    expect(alone.answer).toContain(PRIOR_INQUIRY_LINE)
    const { secondAnswer } = await twoTurns("카메라가 안 켜져요", "해 봤는데 또 안 돼요")
    expect(secondAnswer.answerMode).toBe("handoff")
    expect(secondAnswer.needsHandoff).toBe(true)
    expect(secondAnswer.answer).toContain("같은 안내를 또 드리지 않을게요")
    expect(secondAnswer.answer).not.toContain(PRIOR_INQUIRY_LINE)
  })

  it("다른 창·지난 대화를 가리키는 말은 직전 턴이 있어도 '볼 수 없다'고 답한다", async () => {
    const { secondAnswer } = await twoTurns("카메라가 안 켜져요", "다른 창에서 챗봇이 알려준 거 다시 알려주세요")
    expect(secondAnswer.contextExpanded).toBe(false)
    expect(secondAnswer.answer).toMatch(/볼\s*수\s*없/)
    expect(secondAnswer.answer.includes(PRIOR_BOT_LINE) || secondAnswer.answer.includes(PRIOR_INQUIRY_LINE)).toBe(true)
  })

  it("혼자서도 답이 서는 짧은 말('요금은요?')은 넓히지 않는다", async () => {
    const alone = await evaluateChatbotQuery("요금은요?", { generateAnswer: false })
    const { secondAnswer } = await twoTurns("카메라가 안 켜져요", "요금은요?")
    expect(secondAnswer.contextExpanded).toBe(false)
    expect(secondAnswer.answer).toBe(alone.answer)
  })
})

describe("직전 턴이 없으면 지금과 같은 답", () => {
  it.each(["휴대폰이요", "카메라가 안 켜져요", "녹화 파일은 어디서 받아요?", "해 봤는데 또 안 돼요"])("%s", async (question) => {
    const plain = await evaluateChatbotQuery(question, { generateAnswer: false })
    const withNull = await evaluateChatbotQuery(question, { generateAnswer: false, previousTurn: null })
    expect(withNull.answer).toBe(plain.answer)
    expect(plain.contextExpanded).toBe(false)
  })
})

describe("stream 과 non-stream 은 같은 답·같은 상담 버튼", () => {
  it.each([
    ["카메라가 안 켜져요", "휴대폰이요"],
    ["카메라가 안 켜져요", "해 봤는데 또 안 돼요"],
    ["카메라가 안 켜져요", "아까 그거 다시 알려주세요"],
    ["클래스인이 뭐예요?", "전자칠판이요"],
  ])("%s → %s", async (first, second) => {
    const firstAnswer = await evaluateChatbotQuery(first)
    const previousTurn = previousTurnOf(first, firstAnswer)
    __clearAnswerCacheForTests()
    const nonStream = await evaluateChatbotQuery(second, { previousTurn })
    __clearAnswerCacheForTests()
    const stream = await collectStream(second, { previousTurn })
    expect(stream.answer).toBe(nonStream.answer)
    expect(stream.meta?.needsHandoff).toBe(nonStream.needsHandoff)
    expect(stream.meta?.answerMode).toBe(nonStream.answerMode)
  })
})

describe("질문당 모델 호출 수가 늘지 않는다", () => {
  it("넓힌 질문은 같은 글을 한 줄로 물었을 때와 같은 수의 모델 호출을 한다", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key")
    const { fetchMock } = stubEvidenceSelection(() => false)
    await evaluateChatbotQuery("녹화 파일은 어디서 받아요? 아이패드요")
    const plainCalls = fetchMock.mock.calls.length
    expect(plainCalls).toBeGreaterThan(0)
    fetchMock.mockClear()
    __clearAnswerCacheForTests()
    __clearAnswerGateCacheForTests()
    const expanded = await evaluateChatbotQuery("아이패드요", { previousTurn: { question: "녹화 파일은 어디서 받아요?" } })
    expect(expanded.contextExpanded).toBe(true)
    expect(fetchMock.mock.calls.length).toBe(plainCalls)
  })
})

describe("문서 페이지 맥락", () => {
  const pagePath = "/docs/start/camera-mic-troubleshooting"

  it("'방금 본 내용 정리해 줘'는 그 문서를 첫 출처로 쓴다", async () => {
    const result = await evaluateChatbotQuery("방금 본 내용 정리해 줘", { generateAnswer: false, pagePath })
    expect(result.conversationReason).toBe("page_context")
    expect(result.sources[0]?.urlPath).toBe(pagePath)
  })

  it("근거 선별이 그 문서 문장을 고른다(모델 흉내)", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key")
    const { requests } = stubEvidenceSelection((text) => /권한/.test(text))
    const result = await evaluateChatbotQuery("방금 본 내용 정리해 줘", { pagePath })
    expect(requests.length).toBeGreaterThan(0)
    expect(requests[0].labels[0]).toContain("카메라")
    expect(result.sources[0]?.urlPath).toBe(pagePath)
  })

  it("내용 낱말이 있는 질문은 경로와 상관없이 같은 답이다", async () => {
    const plain = await evaluateChatbotQuery("학생 초대는 어떻게 하나요?", { generateAnswer: false })
    const onPage = await evaluateChatbotQuery("학생 초대는 어떻게 하나요?", { generateAnswer: false, pagePath })
    expect(onPage.answer).toBe(plain.answer)
    expect(onPage.sources).toEqual(plain.sources)
  })

  it("문서가 아닌 경로·없는 문서는 쓰지 않는다", async () => {
    for (const path of ["/pricing", "/docs/start/no-such-doc"]) {
      const result = await evaluateChatbotQuery("방금 본 내용 정리해 줘", { generateAnswer: false, pagePath: path })
      expect(result.conversationReason, path).not.toBe("page_context")
    }
  })

  it("페이지 맥락 답은 경로를 넣은 열쇠로만 캐시된다", async () => {
    vi.stubEnv("GEMINI_API_KEY", "")
    const onPage = await evaluateChatbotQuery("방금 본 내용 정리해 줘", { pagePath })
    const offPage = await evaluateChatbotQuery("방금 본 내용 정리해 줘")
    expect(offPage.sources[0]?.urlPath).not.toBe(pagePath)
    const onPageAgain = await evaluateChatbotQuery("방금 본 내용 정리해 줘", { pagePath })
    expect(onPageAgain.answer).toBe(onPage.answer)
    expect(onPageAgain.sources[0]?.urlPath).toBe(pagePath)
  })
})

function routeRequest(path: string, body: unknown, ip: string) {
  return new NextRequest(`https://classin.kr${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  })
}

describe("요청 계약", () => {
  it("두 라우트 모두 꼴이 틀린 직전 턴에 400 을 낸다(스트림은 열기 전에)", async () => {
    const body = { message: "휴대폰이요", context: { previousTurn: { question: "카메라", askedSlot: "budget" } } }
    const query = await postQuery(routeRequest("/api/chatbot/query", body, "multi-turn-query-400"))
    expect(query.status).toBe(400)
    const stream = await postStream(routeRequest("/api/chatbot/query/stream", body, "multi-turn-stream-400"))
    expect(stream.status).toBe(400)
  })

  it("일반 라우트도 직전 턴을 받아 앞 턴 주제로 답한다", async () => {
    const body = { message: "휴대폰이요", context: { previousTurn: { question: "카메라가 안 켜져요" } } }
    const response = await postQuery(routeRequest("/api/chatbot/query", body, "multi-turn-query-200"))
    const json = (await response.json()) as { answer: string; answerMode: string }
    expect(response.status).toBe(200)
    expect(json.answer).toContain("카메라")
    expect(json.answerMode).toBe("direct_answer")
  })

  it("꼴이 틀린 직전 턴은 400 계열 입력 오류다", () => {
    for (const previousTurn of ["카메라", { question: "가".repeat(201) }, { question: "카메라", askedSlot: "budget" }]) {
      expect(() => validateChatbotQueryInput({ message: "휴대폰이요", context: { previousTurn } })).toThrow(ChatbotInputError)
    }
    expect(() => validateChatbotQueryInput({ message: "휴대폰이요", context: { previousTurn: { question: "카메라가 안 켜져요" } } })).not.toThrow()
  })

  it("직전 질문의 개인정보도 가린다(넓힌 질문에 연락처가 남지 않는다)", async () => {
    const result = await evaluateChatbotQuery("휴대폰이요", {
      generateAnswer: false,
      previousTurn: { question: "010-1234-5678 로 연락 주세요. 카메라가 안 켜져요" },
    })
    expect(result.answer).not.toContain("1234")
  })

  it("select 모드는 세션이 있어도 답 캐시를 쓴다", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key")
    const { fetchMock } = stubEvidenceSelection(() => false)
    const sessionId = "00000000-0000-4000-8000-000000000123"
    await collectStream("녹화 파일은 어디서 받아요?", {})
    const callsAfterFirst = fetchMock.mock.calls.length
    expect(callsAfterFirst).toBeGreaterThan(0)
    const events: ChatbotStreamEvent[] = []
    await streamChatbotQuery({ message: "녹화 파일은 어디서 받아요?", sessionId, context: {} }, {}, (event) => events.push(event))
    expect(fetchMock.mock.calls.length).toBe(callsAfterFirst)
  })
})

describe("처음 온 고객(2026-11-20 조사 G8)", () => {
  it("직전 턴 없는 '이거 뭐예요'는 못 찾음이 아니라 되묻기와 처음 온 사람용 칩이다", async () => {
    for (const question of ["이거 뭐예요", "그거 어떻게 해요?"]) {
      const result = await evaluateChatbotQuery(question, { generateAnswer: false })
      expect(result.conversationReason, question).toBe("target_unknown")
      expect(result.answerMode, question).toBe("clarifying_question")
      expect(result.sources, question).toEqual([])
      expect(result.answer, question).not.toContain("찾지 못했어요")
      expect(result.answer, question).toContain("클래스인이 어떤 서비스인지")
      expect(result.suggestedQuestions, question).toContain("클래스인이 뭐예요?")
    }
  })

  it("모델이 켜져 있어도 대상 불명 질문은 근거 선별을 부르지 않는다", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key")
    const { requests } = stubEvidenceSelection(() => true)
    const result = await evaluateChatbotQuery("이거 뭐예요")
    expect(result.answerMode).toBe("clarifying_question")
    expect(requests).toHaveLength(0)
  })

  it("처음 온 사람용 칩은 각각 소개·수업 입장·요금 답으로 간다", async () => {
    const intro = await evaluateChatbotQuery("클래스인이 뭐예요?", { generateAnswer: false })
    expect(intro.answer).toContain("수업 운영 솔루션")
    const join = await evaluateChatbotQuery("수업에 들어가는 방법이 궁금해요", { generateAnswer: false })
    expect(join.answerMode).toBe("direct_answer")
    expect(join.sources[0]?.urlPath).toBe("/docs/student/class-join-replay")
    const pricing = await evaluateChatbotQuery("요금은 어떻게 되나요?", { generateAnswer: false })
    expect(pricing.detectedCategory).toBe("billing")
  })

  it("두 조각 질문에서 한 조각만 답했으면 답하지 못한 조각을 한 줄로 알리고 첫 추천 질문으로 둔다", async () => {
    const result = await evaluateChatbotQuery("맥북에도 깔리나요? 그리고 카메라가 안 켜져요", { generateAnswer: false })
    expect(result.answer).toContain("함께 물어보신 '맥북에도 깔리나요'는 이 답에 담지 못했어요.")
    expect(result.suggestedQuestions[0]).toBe("맥북에도 깔리나요?")
  })

  it("두 조각을 함께 답한 답에는 알리지 않는다", async () => {
    const result = await evaluateChatbotQuery("맥북에도 깔리나요? 그리고 녹화 파일 다운로드 돼요?", { generateAnswer: false })
    expect(result.answer).not.toContain("함께 물어보신")
  })

  it("stream 과 non-stream 이 같은 알림 줄을 낸다", async () => {
    const question = "무료 체험 있나요? 그리고 앱 설치는 어떻게 해요?"
    const nonStream = await evaluateChatbotQuery(question)
    __clearAnswerCacheForTests()
    const stream = await collectStream(question, {})
    expect(nonStream.answer).toContain("함께 물어보신")
    expect(stream.answer).toBe(nonStream.answer)
  })
})

describe("캐시를 거쳐도 조각 알림이 같다", () => {
  it("일반 경로가 캐시한 답을 스트림이 꺼내도 같은 알림 줄을 낸다", async () => {
    const question = "무료 체험 있나요? 그리고 앱 설치는 어떻게 해요?"
    const nonStream = await evaluateChatbotQuery(question)
    expect(nonStream.answer).toContain("함께 물어보신")
    const fromCache = await collectStream(question, {})
    expect(fromCache.answer).toBe(nonStream.answer)
  })
})

// 2026-11-20 검토 결과 고침. 예시 질문은 이 시험을 위해 지었다.
describe("검토 고침: 대상 불명 답은 다른 대화에 따라 갈리지 않는다", () => {
  it.each(["안녕하세요", "이거 뭐예요"])("직전 질문이 '%s'여도 대상 불명 되묻기이고, 뒤에 온 새 방문자도 되묻기를 받는다(select, 가짜 Gemini)", async (previous) => {
    vi.stubEnv("GEMINI_API_KEY", "test-key")
    const { requests } = stubEvidenceSelection(() => false)
    const other = await evaluateChatbotQuery("이거 뭐예요", { previousTurn: { question: previous } })
    expect(other.conversationReason).toBe("target_unknown")
    expect(other.answerMode).toBe("clarifying_question")
    const fresh = await evaluateChatbotQuery("이거 뭐예요")
    expect(fresh.answerMode).toBe("clarifying_question")
    expect(fresh.answer).toBe(other.answer)
    const stream = await collectStream("이거 뭐예요", {})
    expect(stream.answer).toBe(fresh.answer)
    expect(requests).toHaveLength(0)
  })
})

describe("검토 고침: 같은 대화의 '아까 챗봇이 알려준'(G2)", () => {
  it.each(["아까 챗봇이 알려준 대로 했는데 안 돼요", "아까 알려준 거 해봤는데 안 돼요", "아까 그거 해봤는데도 똑같아요"])(
    "증상 안내 뒤 '%s'는 같은 안내를 또 주지 않고 상담으로 잇는다",
    async (second) => {
      const { secondAnswer } = await twoTurns("카메라가 안 켜져요", second)
      expect(secondAnswer.contextExpanded).toBe(true)
      expect(secondAnswer.answerMode).toBe("handoff")
      expect(secondAnswer.answer).toContain("같은 안내를 또 드리지 않을게요")
      expect(secondAnswer.answer).not.toContain(PRIOR_INQUIRY_LINE)
      expect(secondAnswer.answer).not.toMatch(/볼\s*수\s*없/)
    }
  )
})

describe("검토 고침: 넓히면 안 되는 말은 혼자 물었을 때와 같은 답", () => {
  it.each([
    ["견적 받고 싶어요", "학생 30명인데 녹화 파일은 어디서 받아요?"],
    ["데모 신청하고 싶어요", "강사 3명인데 학생 초대는 어떻게 하나요?"],
    ["학원에 도입하려면 어떻게 해야 하나요?", "아직 모르겠는데 학생은 수업에 어떻게 들어가요?"],
    ["학원에 도입하려면 어떻게 해야 하나요?", "바로 쓰고 싶은데 앱 설치는 어떻게 해요?"],
    ["카메라가 안 켜져요", "출결은요?"],
    ["카메라가 안 켜져요", "숙제는요?"],
  ])("%s → %s", async (first, second) => {
    const alone = await evaluateChatbotQuery(second, { generateAnswer: false })
    const { secondAnswer } = await twoTurns(first, second)
    expect(secondAnswer.contextExpanded).toBe(false)
    expect(secondAnswer.answer).toBe(alone.answer)
  })

  it("'그러면 출결은요?'는 앞 턴 카메라 안내를 다시 내지 않는다", async () => {
    const { firstAnswer, secondAnswer } = await twoTurns("카메라가 안 켜져요", "그러면 출결은요?")
    expect(secondAnswer.contextExpanded).toBe(false)
    expect(secondAnswer.answer).not.toBe(firstAnswer.answer)
    expect(secondAnswer.answer).not.toContain("카메라")
  })
})

describe("검토 고침: 문서 페이지에서 조사 '이'·'말고'는 페이지 맥락이 아니다", () => {
  const pagePath = "/docs/start/camera-mic-troubleshooting"

  it.each(["학생이 글씨를 못 써요", "선생님이 페이지를 넘기면 학생 화면도 넘어가나요?", "학생이 안내 문자를 못 받아요"])(
    "%s: 경로와 상관없이 같은 답",
    async (question) => {
      const plain = await evaluateChatbotQuery(question, { generateAnswer: false })
      const onPage = await evaluateChatbotQuery(question, { generateAnswer: false, pagePath })
      expect(onPage.conversationReason).toBe("none")
      expect(onPage.answer).toBe(plain.answer)
      expect(onPage.sources).toEqual(plain.sources)
    }
  )

  it("select 모드에서 '이 안내 말고 영수증은 어디서 받아요?'는 페이지 요약이 아니라 영수증 안내다", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key")
    stubEvidenceSelection(() => false)
    const question = "이 안내 말고 영수증은 어디서 받아요?"
    const plain = await evaluateChatbotQuery(question)
    __clearAnswerCacheForTests()
    const onPage = await evaluateChatbotQuery(question, { pagePath: "/docs/start/password-change-pc" })
    expect(onPage.conversationReason).toBe("none")
    expect(onPage.answer).toBe(plain.answer)
    expect(onPage.sources.map((source) => source.urlPath)).not.toContain("/docs/start/password-change-pc")
  })
})

describe("검토 고침: 스트림 캐시에 앞 턴 말투가 남지 않는다", () => {
  it("화난 1턴 뒤 '아까 그거요'는 stream 과 non-stream 이 같고 사과·연결을 다시 붙이지 않는다", async () => {
    const first = "PC에서 수업 녹화 파일은 어디서 다시 보나요 진짜 화나네요"
    const firstStream = await collectStream(first, {})
    const streamSecond = await collectStream("아까 그거요", { previousTurn: { question: first, answerMode: firstStream.meta?.answerMode } })
    __clearAnswerCacheForTests()
    const firstPlain = await evaluateChatbotQuery(first)
    const plainSecond = await evaluateChatbotQuery("아까 그거요", { previousTurn: { question: first, answerMode: firstPlain.answerMode } })
    expect(streamSecond.answer).toBe(plainSecond.answer)
    expect(streamSecond.meta?.needsHandoff).toBe(plainSecond.needsHandoff)
    expect(streamSecond.answer).not.toContain("죄송")
    expect(plainSecond.needsHandoff).toBe(false)
  })
})

describe("검토 고침: 한 조각만 정해 둔 답이 서는 두 조각 질문", () => {
  it("'가격이 얼마예요? 앱도 있어요?'는 답하지 못한 '앱도 있어요'를 알린다", async () => {
    const result = await evaluateChatbotQuery("가격이 얼마예요? 앱도 있어요?", { generateAnswer: false })
    expect(result.answer).toContain("함께 물어보신 '앱도 있어요'는 이 답에 담지 못했어요.")
    expect(result.suggestedQuestions[0]).toBe("앱도 있어요?")
  })

  it("묻는 꼴이 아닌 조각(상황 설명)은 알리지 않는다", async () => {
    const result = await evaluateChatbotQuery("가격이 얼마예요? 벌써 세 번째 물어봐요", { generateAnswer: false })
    expect(result.answer).not.toContain("함께 물어보신")
  })
})

describe("검토 고침: 증상을 말한 짧은 질문의 되묻기 예시", () => {
  it("'판서가 안 보여요'에는 사용 문제 예시를 든다(처음 온 사람용 예시가 아니다)", async () => {
    for (const question of ["판서가 안 보여요", "그거 안 열려요"]) {
      const result = await evaluateChatbotQuery(question, { generateAnswer: false })
      expect(result.answer, question).toContain("수업 입장·소리·화면 같은 사용 문제")
      expect(result.answer, question).not.toContain("클래스인이 어떤 서비스인지")
    }
  })
})

describe("검토 고침: 반복 측정 스위치(CHATBOT_ANSWER_CACHE=off)", () => {
  it("캐시를 끄면 같은 질문을 되풀이할 때마다 근거 선별을 다시 부른다", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key")
    let call = 0
    const { requests } = stubEvidenceSelection(() => call++ % 2 === 0)
    await evaluateChatbotQuery("녹화 파일은 어디서 받아요?")
    const afterFirst = requests.length
    expect(afterFirst).toBeGreaterThan(0)
    await evaluateChatbotQuery("녹화 파일은 어디서 받아요?")
    expect(requests.length).toBe(afterFirst)
    vi.stubEnv("CHATBOT_ANSWER_CACHE", "off")
    await evaluateChatbotQuery("녹화 파일은 어디서 받아요?")
    await evaluateChatbotQuery("녹화 파일은 어디서 받아요?")
    expect(requests.length).toBe(afterFirst * 3)
  })
})
