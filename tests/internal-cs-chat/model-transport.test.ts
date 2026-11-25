import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

// 내부 코파일럿의 모델 호출 5곳(생성·이미지·상담 임베딩·승격 임베딩·심판)이 모두 model-transport 하나를 지나는지 확인한다.
// 실제 모델 API 는 부르지 않는다: 공개 챗봇 연결(gemini-transport)과 fetch 를 가짜로 둔다.
const mocks = vi.hoisted(() => ({
  getChatbotGeminiConnection: vi.fn(),
  postChatbotGemini: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
}))

vi.mock("@/lib/chatbot/gemini-transport", async () => {
  const actual = await vi.importActual<typeof import("@/lib/chatbot/gemini-transport")>("@/lib/chatbot/gemini-transport")
  return {
    ...actual,
    getChatbotGeminiConnection: mocks.getChatbotGeminiConnection,
    postChatbotGemini: mocks.postChatbotGemini,
  }
})

vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: mocks.createSupabaseAdminClient }))

import { searchConsultationEvidence } from "@/lib/internal-cs-chat/consultation-search"
import { generateInternalCsAnswer } from "@/lib/internal-cs-chat/gemini"
import { embedInternalText } from "@/lib/internal-cs-chat/internal-article-writer"
import {
  callInternalCsModel,
  classifyHttpStatus,
  resolveInternalCsConnection,
  stopsModelChain,
} from "@/lib/internal-cs-chat/model-transport"
import { judgeRegression } from "@/lib/internal-cs-chat/regression-eval"
import { analyzeInternalCsImage } from "@/lib/internal-cs-chat/vision"

const vertexConnection = { provider: "vertex" as const, project: "fake-project-1", location: "global" }

function jsonResponse(data: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => data } as unknown as Response
}

function textCandidate(text: string) {
  return jsonResponse({ candidates: [{ content: { parts: [{ text }] } }] })
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe("model-transport routing", () => {
  it("sends all five internal call sites through the Vertex transport when the chatbot connection is Vertex", async () => {
    mocks.getChatbotGeminiConnection.mockReturnValue(vertexConnection)
    vi.stubEnv("GEMINI_EMBED_DIM", "8")
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://fake.example.invalid")
    vi.stubEnv("SUPABASE_SECRET_KEY", "fake-secret")
    vi.stubEnv("CHANNEL_CONVERSATION_EMBED_DIM", "768")
    const direct = vi.fn(async () => {
      throw new Error("direct fetch must not be used on a Vertex connection")
    })
    vi.stubGlobal("fetch", direct)
    mocks.createSupabaseAdminClient.mockReturnValue({ rpc: vi.fn().mockResolvedValue({ data: [], error: null }) })
    // Vertex 임베딩은 predict 형식이고 요청한 차원과 다른 벡터는 버려진다 → 요청 차원대로 돌려준다.
    mocks.postChatbotGemini.mockImplementation(async (_connection, _model, operation: string, body: string) => {
      if (operation === "embedContent") {
        const dim = (JSON.parse(body) as { parameters: { outputDimensionality: number } }).parameters.outputDimensionality
        return jsonResponse({ predictions: [{ embeddings: { values: Array.from({ length: dim }, () => 0.5) } }] })
      }
      return textCandidate(JSON.stringify({ summary: "요약", outcome: "pass", rationale: "근거" }))
    })

    await generateInternalCsAnswer({ question: "녹화 메뉴 위치" })
    await analyzeInternalCsImage({ bytes: Uint8Array.from([1, 2, 3]), mimeType: "image/png" })
    await searchConsultationEvidence("환불 문의")
    const embedded = await embedInternalText("승격할 글")
    await judgeRegression({ question: "q", reference: "r", regenerated: "g" })

    expect(embedded).toHaveLength(8)
    expect(direct).not.toHaveBeenCalled()
    const operations = mocks.postChatbotGemini.mock.calls.map((call) => call[2])
    expect(operations).toEqual(["generateContent", "generateContent", "embedContent", "embedContent", "generateContent"])
    for (const call of mocks.postChatbotGemini.mock.calls) {
      expect(call[0]).toMatchObject({ provider: "vertex", project: "fake-project-1" })
    }
  })

  it("sends the developer key in a header, never in the URL", async () => {
    mocks.getChatbotGeminiConnection.mockReturnValue({ provider: "developer", apiKey: "dev-secret-key" })
    const fetchMock = vi.fn().mockResolvedValue(textCandidate("답"))
    vi.stubGlobal("fetch", fetchMock)

    const result = await callInternalCsModel({
      connection: resolveInternalCsConnection()!,
      model: "gemini-3.5-flash",
      operation: "generateContent",
      body: { contents: [] },
      timeoutMs: 1_000,
    })

    expect(result.ok).toBe(true)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent")
    expect(url).not.toContain("key=")
    expect(url).not.toContain("dev-secret-key")
    expect(init.headers).toMatchObject({ "x-goog-api-key": "dev-secret-key" })
  })

  it("INTERNAL_CS_GEMINI_PROVIDER overrides the chatbot connection", () => {
    mocks.getChatbotGeminiConnection.mockReturnValue(vertexConnection)
    vi.stubEnv("INTERNAL_CS_GEMINI_PROVIDER", "developer")
    vi.stubEnv("GEMINI_API_KEY", "dev-key")
    expect(resolveInternalCsConnection()).toEqual({ provider: "developer", apiKey: "dev-key" })

    vi.stubEnv("INTERNAL_CS_GEMINI_PROVIDER", "vertex")
    expect(resolveInternalCsConnection()).toEqual(vertexConnection)

    mocks.getChatbotGeminiConnection.mockReturnValue({ provider: "developer", apiKey: "x" })
    expect(resolveInternalCsConnection()).toBeNull()

    vi.stubEnv("INTERNAL_CS_GEMINI_PROVIDER", "")
    expect(resolveInternalCsConnection()).toEqual({ provider: "developer", apiKey: "x" })
  })

  it("classifies statuses and decides when the model chain should stop", () => {
    expect(classifyHttpStatus(401)).toBe("auth")
    expect(classifyHttpStatus(403)).toBe("auth")
    expect(classifyHttpStatus(402)).toBe("quota")
    expect(classifyHttpStatus(429)).toBe("rate")
    expect(classifyHttpStatus(504)).toBe("timeout")
    expect(classifyHttpStatus(503)).toBe("server")
    expect(classifyHttpStatus(404)).toBe("shape")
    expect(stopsModelChain("quota", "gemini-3.5-flash", 402)).toBe(true)
    expect(stopsModelChain("auth", "gemini-3.5-flash", 403)).toBe(true)
    expect(stopsModelChain("auth", "gemini-4-hydrogen", 403)).toBe(false)
    expect(stopsModelChain("auth", "gemini-4-hydrogen", 401)).toBe(true)
    expect(stopsModelChain("rate", "gemini-3.5-flash", 429)).toBe(false)
    expect(stopsModelChain("timeout", "gemini-3.5-flash")).toBe(false)
  })

  it("reports a timeout when the model does not answer in time, without throwing", async () => {
    mocks.getChatbotGeminiConnection.mockReturnValue({ provider: "developer", apiKey: "k" })
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })))
      }))
    )
    const result = await callInternalCsModel({
      connection: resolveInternalCsConnection()!,
      model: "gemini-3.5-flash",
      operation: "generateContent",
      body: {},
      timeoutMs: 20,
    })
    expect(result).toMatchObject({ ok: false, kind: "timeout" })
  })
})

describe("internal CS source hygiene", () => {
  const dir = join(process.cwd(), "lib/internal-cs-chat")
  const files = readdirSync(dir).filter((name) => name.endsWith(".ts"))

  it("never puts an API key in a URL query", () => {
    for (const name of files) {
      const source = readFileSync(join(dir, name), "utf8")
      expect(source, name).not.toMatch(/\?key=/)
    }
  })

  it("reads GEMINI_API_KEY only in model-transport.ts", () => {
    const readers = files.filter((name) => readFileSync(join(dir, name), "utf8").includes("GEMINI_API_KEY"))
    expect(readers).toEqual(["model-transport.ts"])
  })
})
