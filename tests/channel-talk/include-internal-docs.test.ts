import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

// match_docs_ai_chunks RPC 호출 인자를 캡처하기 위해 admin 클라이언트를 가짜로 교체한다.
const rpc = vi.fn((_name: string, _params?: Record<string, unknown>) =>
  Promise.resolve({ data: [] as unknown[], error: null })
)

function makeQueryBuilder() {
  const result = { data: [], error: null }
  const builder: Record<string, unknown> = {
    then: (resolve: (value: typeof result) => unknown) => resolve(result),
  }
  const methods = [
    "select", "eq", "in", "not", "is", "or", "order", "limit",
    "gte", "lte", "lt", "gt", "textSearch", "ilike", "filter", "single", "maybeSingle",
  ]
  for (const method of methods) builder[method] = () => builder
  return builder
}

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ rpc, from: () => makeQueryBuilder() }),
}))

// embedText 가 non-null 벡터를 돌려줘야 vectorSearchSupabaseSources(→RPC)가 실행된다.
vi.mock("@/lib/chatbot/llm", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/chatbot/llm")>()
  return {
    ...actual,
    embedText: vi.fn(async () => new Array(768).fill(0.02)),
  }
})

import { evaluateChatbotQuery } from "@/lib/chatbot/service"
import { HANDOFF_NOW_LINE } from "@/lib/chatbot/tone"

const SUPABASE_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-test",
  SUPABASE_SECRET_KEY: "secret-test",
} as const

const savedEnv: Record<string, string | undefined> = {}

beforeAll(() => {
  for (const [key, value] of Object.entries(SUPABASE_ENV)) {
    savedEnv[key] = process.env[key]
    process.env[key] = value
  }
})

afterAll(() => {
  for (const key of Object.keys(SUPABASE_ENV)) {
    if (savedEnv[key] === undefined) delete process.env[key]
    else process.env[key] = savedEnv[key]
  }
})

beforeEach(() => {
  rpc.mockClear()
})

function docsRpcParams(): Record<string, unknown>[] {
  return rpc.mock.calls
    .filter((call) => call[0] === "match_docs_ai_chunks")
    .map((call) => call[1] ?? {})
}

describe("evaluateChatbotQuery includeInternalDocs (계약 6 — 공개 경로 무회귀)", () => {
  // 아래 두 질문은 큐레이션/게이트를 통과해 벡터 RPC(match_docs_ai_chunks)까지 도달한다.
  // ("학생 초대는 어떻게 하나요?"는 공개 경로에서 증상 트리아지가 문서 섹션으로 바로 답해 RPC까지 가지 않는다.)
  it("공개 경로(옵션 미지정)는 match_docs_ai_chunks 에 include_internal 을 넘기지 않는다", async () => {
    await evaluateChatbotQuery("수업 자료는 어디에 올려 두면 되나요?", { generateAnswer: false })

    const params = docsRpcParams()
    expect(params.length).toBeGreaterThan(0)
    for (const call of params) {
      // 무회귀: 공개 호출은 기존과 byte-identical — include_internal 키 자체가 없어야 한다.
      expect(call).not.toHaveProperty("include_internal")
    }
  })

  it("generateAnswer:false 공개 호출도 include_internal 을 넘기지 않는다(다른 질문)", async () => {
    await evaluateChatbotQuery("출석부는 어디서 확인해요?", { generateAnswer: false })

    const params = docsRpcParams()
    expect(params.length).toBeGreaterThan(0)
    for (const call of params) {
      expect(call).not.toHaveProperty("include_internal")
    }
  })

  // 공개 경로에서는 트리아지가 바로 답하는 질문이어도, 내부 코파일럿 경로는 내부 문서까지 검색해야 한다.
  it("내부 코파일럿 경로(includeInternalDocs:true)만 include_internal:true 를 넘긴다", async () => {
    await evaluateChatbotQuery("학생 초대는 어떻게 하나요?", {
      generateAnswer: false,
      includeInternalDocs: true,
    })

    const params = docsRpcParams()
    expect(params.length).toBeGreaterThan(0)
    expect(params.some((call) => call.include_internal === true)).toBe(true)
  })

  // 공개 위젯 전용 결정형 조기 답변(증상·사용법 트리아지, "이미 다 해 봤다" 상담 연결)과 말투 계층이
  // 내부 코파일럿 경로의 내부 문서 검색을 건너뛰게 하면 안 된다.
  // 검색 결과는 질문·범위별로 모듈 캐시에 남으므로 위 테스트와 겹치지 않는 질문을 쓴다(캐시 적중이면 RPC 0회).
  it.each([
    ["사용법 트리아지", "학생 초대 방법 알려주세요"],
    ["증상 트리아지", "녹화가 안 돼요"],
    ["이미 해 봤음 상담 연결", "기본 조치 다 해봤는데 또 끊겨요 진짜 짜증나"],
  ])("공개 위젯이 결정형으로 답하는 질문(%s)도 내부 코파일럿 경로는 검색까지 간다", async (_label, question) => {
    const publicResult = await evaluateChatbotQuery(question, { generateAnswer: false })
    // 전제: 공개 위젯은 검색 없이 결정형으로 답한다(이 전제가 깨지면 아래 내부 경로 단언이 아무것도 지키지 않는다).
    expect(docsRpcParams()).toHaveLength(0)
    expect(publicResult.answer.trim().length).toBeGreaterThan(0)

    rpc.mockClear()
    const internalResult = await evaluateChatbotQuery(question, {
      generateAnswer: false,
      includeInternalDocs: true,
    })

    const params = docsRpcParams()
    expect(params.length).toBeGreaterThan(0)
    expect(params.every((call) => call.include_internal === true)).toBe(true)
    // 공개 위젯 말투(상담 연결 버튼 안내)는 상담원용 근거 답에 붙지 않는다.
    expect(internalResult.answer).not.toContain(HANDOFF_NOW_LINE)
  })
})
