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
  it("공개 경로(옵션 미지정)는 match_docs_ai_chunks 에 include_internal 을 넘기지 않는다", async () => {
    await evaluateChatbotQuery("학생 초대는 어떻게 하나요?", { generateAnswer: false })

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

  it("내부 코파일럿 경로(includeInternalDocs:true)만 include_internal:true 를 넘긴다", async () => {
    await evaluateChatbotQuery("학생 초대는 어떻게 하나요?", {
      generateAnswer: false,
      includeInternalDocs: true,
    })

    const params = docsRpcParams()
    expect(params.length).toBeGreaterThan(0)
    expect(params.some((call) => call.include_internal === true)).toBe(true)
  })
})
