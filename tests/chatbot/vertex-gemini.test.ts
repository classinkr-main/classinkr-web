import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { getAnswerGateDisabledReason } from "@/lib/chatbot/answer-gate"
import {
  __resetModelCircuitForTests,
  embedText,
  generateGeminiFinalAnswer,
  hasChatbotGeminiConnection,
  isModelCircuitOpen,
  judgePreparedAnswerFit,
  selectAnsweringSentenceIds,
  streamGeminiFinalAnswer,
  type GeminiAnswerCompletion,
} from "@/lib/chatbot/llm"

const { getAccessToken, fromJSON, getVercelOidcToken } = vi.hoisted(() => ({
  getAccessToken: vi.fn(async () => "test-access-token"),
  fromJSON: vi.fn((_options: {
    subject_token_supplier: { getSubjectToken: () => Promise<string> }
  }) => ({})),
  getVercelOidcToken: vi.fn(async () => "test-vercel-token"),
}))

vi.mock("google-auth-library", () => ({
  GoogleAuth: class { getAccessToken = getAccessToken },
  JWT: class {},
  ExternalAccountClient: { fromJSON },
}))

vi.mock("@vercel/oidc", () => ({ getVercelOidcToken }))

const args = {
  question: "플립러닝 수업은 어떻게 구성하나요?",
  category: "classroom",
  answerMode: "direct_answer",
  draftAnswer: "수업 전에 자료를 안내할 수 있습니다.",
}
const parts = [
  { thought: true, text: "공개하지 않을 내부 추론" },
  { text: "수업 전에 학습 자료를 공유하고 수업 중에는 문제를 함께 풀어 보세요." },
]
const completion = { candidates: [{ content: { parts } }] }
const vertexModels = "https://aiplatform.googleapis.com/v1/projects/test-classin-ai2/locations/global/publishers/google/models"

describe("public chatbot with Vertex Gemini", () => {
  beforeEach(() => {
    vi.stubEnv("CHATBOT_GEMINI_PROVIDER", "vertex")
    vi.stubEnv("CHATBOT_VERTEX_PROJECT_ID", "test-classin-ai2")
    vi.stubEnv("CHATBOT_VERTEX_LOCATION", "global")
    vi.stubEnv("CHATBOT_VERTEX_SERVICE_ACCOUNT_EMAIL", "")
    vi.stubEnv("CHATBOT_VERTEX_PRIVATE_KEY", "")
    vi.stubEnv("CHATBOT_VERTEX_WIF_PROVIDER", "")
    vi.stubEnv("GEMINI_API_KEY", "developer-key")
    vi.stubEnv("GEMINI_FAST_MODEL", "gemini-2.5-flash")
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
    __resetModelCircuitForTests()
  })

  // 2026-11-20: 1순위가 gemini-4-hydrogen 으로 바뀌어(사용자 지시) 첫 호출 모델이 3.5-flash-lite 에서 hydrogen 으로, 다음이 3.5-flash 다.
  it("uses project-scoped Vertex with the supported fallback models", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ error: { status: "UNAVAILABLE" } }, { status: 503 }))
      .mockResolvedValueOnce(Response.json(completion))
    vi.stubGlobal("fetch", fetchMock)

    expect(await generateGeminiFinalAnswer(args)).toBe(parts[1].text)
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      `${vertexModels}/gemini-4-hydrogen:generateContent`,
      `${vertexModels}/gemini-3.5-flash:generateContent`,
    ])
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      headers: { Authorization: "Bearer test-access-token", "x-goog-user-project": "test-classin-ai2" },
    })
  })

  it("streams Vertex answer text and drops thought parts", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(`data: ${JSON.stringify(completion)}\n\n`))
    vi.stubGlobal("fetch", fetchMock)

    const chunks: string[] = []
    for await (const chunk of streamGeminiFinalAnswer(args)) chunks.push(chunk)

    expect(chunks).toEqual([parts[1].text])
    expect(fetchMock.mock.calls[0][0]).toBe(`${vertexModels}/gemini-4-hydrogen:streamGenerateContent?alt=sse`)
  })

  it("requests the existing retrieval dimension and rejects an incompatible Vertex vector", async () => {
    const values = Array.from({ length: 1536 }, () => 0.01)
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ predictions: [{ embeddings: { values } }] }))
      .mockResolvedValueOnce(Response.json({ predictions: [{ embeddings: { values: [0.4] } }] }))
    vi.stubGlobal("fetch", fetchMock)

    expect(await embedText(args.question, "RETRIEVAL_QUERY")).toHaveLength(1536)
    expect(await embedText(args.question, "RETRIEVAL_QUERY")).toBeNull()
    expect(fetchMock.mock.calls[0][0]).toBe(`${vertexModels}/gemini-embedding-001:predict`)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      instances: [{ content: args.question, task_type: "RETRIEVAL_QUERY" }],
      parameters: { outputDimensionality: 1536 },
    })
  })

  it("does not send a request without an explicit Vertex project", async () => {
    vi.stubEnv("CHATBOT_VERTEX_PROJECT_ID", "")
    vi.stubEnv("GOOGLE_CLOUD_PROJECT", "unrelated-project")
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    expect(await generateGeminiFinalAnswer(args)).toBeNull()
    expect(await embedText(args.question, "RETRIEVAL_QUERY")).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("uses a Vercel token scoped to the Google federation provider for the runtime account", async () => {
    const provider = "projects/123456789012/locations/global/workloadIdentityPools/classin-home/providers/vercel"
    const email = "chatbot@test-classin-ai2.iam.gserviceaccount.com"
    vi.stubEnv("CHATBOT_VERTEX_WIF_PROVIDER", provider)
    vi.stubEnv("CHATBOT_VERTEX_SERVICE_ACCOUNT_EMAIL", email)
    const fetchMock = vi.fn().mockResolvedValue(Response.json(completion))
    vi.stubGlobal("fetch", fetchMock)

    expect(await generateGeminiFinalAnswer(args)).toBe(parts[1].text)
    expect(fromJSON).toHaveBeenCalledWith(expect.objectContaining({
      audience: `//iam.googleapis.com/${provider}`,
      service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${email}:generateAccessToken`,
    }))
    const [{ subject_token_supplier }] = fromJSON.mock.calls[0]
    expect(await subject_token_supplier.getSubjectToken()).toBe("test-vercel-token")
    expect(getVercelOidcToken).toHaveBeenCalledWith({ audience: `https://iam.googleapis.com/${provider}` })
    expect(new Headers(fetchMock.mock.calls[0][1].headers).has("x-goog-user-project")).toBe(false)
  })

  it("fails closed when both federation and a private key are configured", async () => {
    vi.stubEnv("CHATBOT_VERTEX_WIF_PROVIDER", "projects/123456789012/locations/global/workloadIdentityPools/classin-home/providers/vercel")
    vi.stubEnv("CHATBOT_VERTEX_SERVICE_ACCOUNT_EMAIL", "chatbot@test-classin-ai2.iam.gserviceaccount.com")
    vi.stubEnv("CHATBOT_VERTEX_PRIVATE_KEY", "test-private-key")
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    expect(await generateGeminiFinalAnswer(args)).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  // 2026-11-20 합치기: 차단기·완료 신호·체인 넘김은 developer·vertex 두 연결에 같이 걸린다.
  it("opens the same circuit on a Vertex 401/403 and stops the chain and later calls", async () => {
    for (const status of [401, 403]) {
      __resetModelCircuitForTests()
      const fetchMock = vi.fn().mockResolvedValue(Response.json({ error: { status: "PERMISSION_DENIED" } }, { status }))
      vi.stubGlobal("fetch", fetchMock)
      const errors = vi.spyOn(console, "error").mockImplementation(() => {})

      expect(await generateGeminiFinalAnswer(args), String(status)).toBeNull()
      expect(fetchMock, String(status)).toHaveBeenCalledTimes(1)
      expect(isModelCircuitOpen(), String(status)).toBe(true)
      expect(await embedText(args.question, "RETRIEVAL_QUERY")).toBeNull()
      expect(fetchMock, String(status)).toHaveBeenCalledTimes(1)
      expect(errors.mock.calls.some((call) => String(call[0]).includes(`Gemini HTTP ${status}`))).toBe(true)
      errors.mockRestore()
    }
  })

  it("opens the circuit when the Vertex token request is refused with 401/403, without sending the model request", async () => {
    getAccessToken.mockRejectedValueOnce(Object.assign(new Error("unauthorized_client"), { response: { status: 403 } }))
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const errors = vi.spyOn(console, "error").mockImplementation(() => {})

    expect(await generateGeminiFinalAnswer(args)).toBeNull()
    expect(isModelCircuitOpen()).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(getAccessToken).toHaveBeenCalledTimes(1)
    errors.mockRestore()
  })

  it("moves to the next Vertex model on 404 and 5xx", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ error: { status: "NOT_FOUND" } }, { status: 404 }))
      .mockResolvedValueOnce(Response.json({ candidates: [{ content: { parts }, finishReason: "STOP" }] }))
    vi.stubGlobal("fetch", fetchMock)

    expect(await generateGeminiFinalAnswer(args)).toBe(parts[1].text)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(isModelCircuitOpen()).toBe(false)
  })

  it("applies the completion signal to Vertex: MAX_TOKENS is dropped, a stream without a finish reason is interrupted", async () => {
    const completions: GeminiAnswerCompletion[] = []
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      Response.json({ candidates: [{ content: { parts }, finishReason: "MAX_TOKENS" }] })
    ))
    expect(await generateGeminiFinalAnswer({ ...args, onCompletion: (completion) => completions.push(completion) })).toBeNull()
    expect(completions.at(-1)).toMatchObject({ complete: false, reason: "finish_reason", finishReason: "MAX_TOKENS" })

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(`data: ${JSON.stringify(completion)}\r\n\r\n`)))
    for await (const chunk of streamGeminiFinalAnswer({ ...args, onCompletion: (completion) => completions.push(completion) })) {
      expect(chunk).toBe(parts[1].text)
    }
    expect(completions.at(-1)).toMatchObject({ complete: false, reason: "interrupted" })

    const stopped = { candidates: [{ content: { parts }, finishReason: "STOP" }] }
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(`data: ${JSON.stringify(stopped)}\r\n\r\n`)))
    for await (const chunk of streamGeminiFinalAnswer({ ...args, onCompletion: (completion) => completions.push(completion) })) {
      expect(chunk).toBe(parts[1].text)
    }
    expect(completions.at(-1)).toMatchObject({ complete: true, reason: "stop", finishReason: "STOP" })
  })

  it("runs the gate and evidence selection on Vertex without a developer key", async () => {
    vi.stubEnv("GEMINI_API_KEY", "")
    expect(hasChatbotGeminiConnection()).toBe(true)
    expect(getAnswerGateDisabledReason()).toBeNull()

    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = String(init.body)
      const text = body.includes('"verdict"') ? '{"asked":"a","quote":"b","verdict":"answers"}' : '{"ids":[1]}'
      return Response.json({ candidates: [{ content: { parts: [{ thought: true, text: "생각" }, { text }] }, finishReason: "STOP" }] })
    })
    vi.stubGlobal("fetch", fetchMock)

    const verdict = await judgePreparedAnswerFit({ question: "녹화 다시보기 어디서 봐요?", answer: "녹화본은 수업 기록에서 봅니다.", timeoutMs: 3000 })
    expect(verdict?.verdict).toBe("answers")
    const ids = await selectAnsweringSentenceIds({
      question: "녹화 다시보기 어디서 봐요?",
      sentences: [{ id: 1, sourceIndex: 0, label: "녹화 / 다시보기", text: "녹화본은 수업 기록에서 봅니다." }],
    })
    expect(ids).toEqual([1])
    for (const [url] of fetchMock.mock.calls) expect(String(url)).toMatch(new RegExp(`^${vertexModels}/`))
  })
})
