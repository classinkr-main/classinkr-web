import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { embedText, generateGeminiFinalAnswer, streamGeminiFinalAnswer } from "@/lib/chatbot/llm"

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
  })

  it("uses project-scoped Vertex with the supported fallback models", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ error: { status: "UNAVAILABLE" } }, { status: 503 }))
      .mockResolvedValueOnce(Response.json(completion))
    vi.stubGlobal("fetch", fetchMock)

    expect(await generateGeminiFinalAnswer(args)).toBe(parts[1].text)
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      `${vertexModels}/gemini-3.5-flash-lite:generateContent`,
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
    expect(fetchMock.mock.calls[0][0]).toBe(`${vertexModels}/gemini-3.5-flash-lite:streamGenerateContent?alt=sse`)
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
})
