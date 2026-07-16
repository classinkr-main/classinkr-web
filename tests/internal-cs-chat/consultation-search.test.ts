import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
}))

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}))

import { searchConsultationEvidence } from "@/lib/internal-cs-chat/consultation-search"

function enableEnv() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co")
  vi.stubEnv("SUPABASE_SECRET_KEY", "secret-key")
  vi.stubEnv("GEMINI_API_KEY", "gemini-key")
}

function stubEmbeddingFetch(values: number[] = Array.from({ length: 768 }, () => 0.01)) {
  const fetchMock = vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
    if (String(url).includes(":embedContent")) {
      return { ok: true, json: async () => ({ embedding: { values } }) } as unknown as Response
    }
    throw new Error(`unexpected fetch: ${String(url)}`)
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

function rpcClient(result: { data?: unknown; error?: unknown }) {
  const rpc = vi.fn().mockResolvedValue(result)
  mocks.createSupabaseAdminClient.mockReturnValue({ rpc })
  return rpc
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    chunk_id: "chunk-1",
    conversation_id: "userchat-1",
    content: "환불 문의에 대해 계약 형태를 먼저 확인했습니다.",
    category: "billing",
    similarity: 0.82,
    tags: ["환불", "결제"],
    first_question: "환불 되나요?",
    matched_org: "한빛학원",
    last_message_at: "2026-07-10T02:00:00.000Z",
    ...overrides,
  }
}

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe("searchConsultationEvidence", () => {
  it("embeds the question at 768d and maps RPC rows into ConsultationEvidence", async () => {
    enableEnv()
    const fetchMock = stubEmbeddingFetch()
    const rpc = rpcClient({ data: [row()], error: null })

    const result = await searchConsultationEvidence("환불 규정이 궁금해요")

    expect(result).toEqual([
      {
        conversationId: "userchat-1",
        excerpt: "환불 문의에 대해 계약 형태를 먼저 확인했습니다.",
        category: "billing",
        tags: ["환불", "결제"],
        matchedOrg: "한빛학원",
        occurredAt: "2026-07-10T02:00:00.000Z",
        similarity: 0.82,
      },
    ])

    // 임베딩은 RETRIEVAL_QUERY, 768차원으로 요청한다.
    const embedInit = fetchMock.mock.calls[0]?.[1]
    const embedBody = JSON.parse(String(embedInit?.body))
    expect(embedBody.taskType).toBe("RETRIEVAL_QUERY")
    expect(embedBody.outputDimensionality).toBe(768)

    // RPC 인자는 계약 3 shape + pgvector 문자열 직렬화.
    expect(rpc).toHaveBeenCalledWith("match_channel_conversation_chunks", {
      query_embedding: JSON.stringify(Array.from({ length: 768 }, () => 0.01)),
      match_count: 4,
      min_similarity: 0.5,
    })
  })

  it("passes the clamped limit as match_count", async () => {
    enableEnv()
    stubEmbeddingFetch()
    const rpc = rpcClient({ data: [], error: null })

    await searchConsultationEvidence("질문", { limit: 99 })
    expect(rpc).toHaveBeenCalledWith(
      "match_channel_conversation_chunks",
      expect.objectContaining({ match_count: 8 })
    )

    await searchConsultationEvidence("질문", { limit: 0 })
    expect(rpc).toHaveBeenLastCalledWith(
      "match_channel_conversation_chunks",
      expect.objectContaining({ match_count: 1 })
    )
  })

  it("drops rows without usable content and sorts by similarity desc", async () => {
    enableEnv()
    stubEmbeddingFetch()
    rpcClient({
      data: [
        row({ chunk_id: "c-low", conversation_id: "low", similarity: 0.51, content: "낮은 유사도 사례" }),
        row({ chunk_id: "c-empty", conversation_id: "empty", content: "   " }),
        row({ chunk_id: "c-high", conversation_id: "high", similarity: 0.9, content: "높은 유사도 사례" }),
      ],
      error: null,
    })

    const result = await searchConsultationEvidence("질문", { limit: 5 })
    expect(result.map((entry) => entry.conversationId)).toEqual(["high", "low"])
  })

  it("normalizes nullable fields", async () => {
    enableEnv()
    stubEmbeddingFetch()
    rpcClient({
      data: [row({ category: null, tags: null, matched_org: null, last_message_at: null })],
      error: null,
    })

    const [entry] = await searchConsultationEvidence("질문")
    expect(entry.category).toBeNull()
    expect(entry.tags).toEqual([])
    expect(entry.matchedOrg).toBeNull()
    expect(entry.occurredAt).toBeNull()
  })

  it("returns [] without embedding or RPC when Supabase env is missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "")
    vi.stubEnv("SUPABASE_SECRET_KEY", "")
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "")
    vi.stubEnv("GEMINI_API_KEY", "gemini-key")
    const fetchMock = stubEmbeddingFetch()
    const rpc = rpcClient({ data: [row()], error: null })

    expect(await searchConsultationEvidence("질문")).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it("returns [] and skips the RPC when embedding fails", async () => {
    enableEnv()
    const fetchMock = vi.fn(async () => ({ ok: false, json: async () => ({}) }) as unknown as Response)
    vi.stubGlobal("fetch", fetchMock)
    const rpc = rpcClient({ data: [row()], error: null })

    expect(await searchConsultationEvidence("질문")).toEqual([])
    expect(rpc).not.toHaveBeenCalled()
  })

  it("returns [] when the RPC reports an error (never throws)", async () => {
    enableEnv()
    stubEmbeddingFetch()
    rpcClient({ data: null, error: { message: "relation does not exist" } })
    vi.spyOn(console, "warn").mockImplementation(() => undefined)

    expect(await searchConsultationEvidence("질문")).toEqual([])
  })

  it("returns [] when the RPC throws (never throws)", async () => {
    enableEnv()
    stubEmbeddingFetch()
    const rpc = vi.fn().mockRejectedValue(new Error("network down"))
    mocks.createSupabaseAdminClient.mockReturnValue({ rpc })

    expect(await searchConsultationEvidence("질문")).toEqual([])
  })

  describe("timeout", () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    it("resolves to [] after the 3.5s budget when the RPC hangs", async () => {
      enableEnv()
      stubEmbeddingFetch()
      const rpc = vi.fn(() => new Promise(() => {}))
      mocks.createSupabaseAdminClient.mockReturnValue({ rpc })

      const pending = searchConsultationEvidence("질문")
      await vi.advanceTimersByTimeAsync(3_500)

      await expect(pending).resolves.toEqual([])
    })
  })
})
