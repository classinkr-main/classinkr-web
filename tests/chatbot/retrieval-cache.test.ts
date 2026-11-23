import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

// 문서 검색 캐시(2026-11-20 조사 G16): 시간 초과 때의 정적 대체 결과는 캐시하지 않고, Supabase 검색은 질문 임베딩을 썼는지(벡터)를
// 열쇠에 넣는다. 정적 문서 읽기(getDocsContent)를 멈춰 시간 초과를 흉내 낸다. 외부 서비스는 부르지 않는다.

const docsContent = vi.hoisted(() => ({ hang: false, calls: 0 }))

vi.mock("@/lib/docs-content", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/docs-content")>()
  return {
    ...actual,
    getDocsContent: () => {
      docsContent.calls += 1
      return docsContent.hang ? new Promise(() => {}) : actual.getDocsContent()
    },
  }
})

const { __clearAnswerCacheForTests, __retrievalCacheKeyForTests, evaluateChatbotQuery } = await import("@/lib/chatbot/service")

beforeAll(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {})
  vi.spyOn(console, "info").mockImplementation(() => {})
})

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "")
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "")
  vi.stubEnv("SUPABASE_SECRET_KEY", "")
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "")
  vi.stubEnv("GEMINI_API_KEY", "")
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("network disabled in retrieval cache test")
    })
  )
  __clearAnswerCacheForTests()
  docsContent.hang = false
  docsContent.calls = 0
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

afterAll(() => {
  vi.restoreAllMocks()
})

describe("검색 캐시", () => {
  it("시간 초과 대체 결과는 캐시하지 않아, 같은 질문을 다시 검색한다", async () => {
    vi.stubEnv("CHATBOT_KNOWLEDGE_SEARCH_TIMEOUT_MS", "30")
    docsContent.hang = true
    // 지은 질문(평가 묶음 문항이 아니다). 정해 둔 답·큐레이션 출처가 아닌 문서 검색 경로를 탄다.
    const question = "학원 출결 리포트 메뉴 구성"
    const first = await evaluateChatbotQuery(question, { generateAnswer: false })
    expect(first.warning).toContain("지연")
    expect(docsContent.calls).toBe(1)
    const second = await evaluateChatbotQuery(question, { generateAnswer: false })
    expect(second.warning).toContain("지연")
    expect(docsContent.calls).toBe(2)
  })

  it("정상으로 끝난 검색 결과는 캐시한다(비교 기준)", async () => {
    const question = "학원 출결 리포트 메뉴 구성 알려주세요"
    await evaluateChatbotQuery(question, { generateAnswer: false })
    const callsAfterFirst = docsContent.calls
    expect(callsAfterFirst).toBe(1)
    await evaluateChatbotQuery(question, { generateAnswer: false })
    expect(docsContent.calls).toBe(callsAfterFirst)
  })

  it("Supabase 검색은 벡터를 썼을 때와 못 썼을 때 열쇠가 다르다", () => {
    const question = "녹화 파일 보관 기간"
    const on = __retrievalCacheKeyForTests(question, { supabase: true, vector: "on" })
    const off = __retrievalCacheKeyForTests(question, { supabase: true, vector: "off" })
    expect(on).not.toBe(off)
    expect(on).toContain("vector-on")
    expect(off).toContain("vector-off")
    // 정적 문서 검색은 임베딩을 쓰지 않아 벡터 표시가 없다.
    expect(__retrievalCacheKeyForTests(question, { supabase: false, vector: "on" })).toBe(
      __retrievalCacheKeyForTests(question, { supabase: false, vector: "off" })
    )
  })
})
