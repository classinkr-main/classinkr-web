import { NextRequest, NextResponse } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

// 승격 lib 는 spy 로 배선/자격만 검증하고, getInternalCsMessageById repo 는 실제 구현을 가짜 supabase 로 구동한다.
const mocks = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn((): unknown => ({ client: true })),
  requireVerifiedAdminContext: vi.fn(),
  getInternalCsMessageById: vi.fn(),
  promoteMessageToInternalArticle: vi.fn(),
  promoteRegressionOutcomes: vi.fn(),
  revalidateTag: vi.fn(),
}))

// 승격 뒤 지표 캐시 무효화(revalidateTag)는 Next 요청 문맥 밖에서 던지므로 가짜로 둔다.
vi.mock("next/cache", async () => {
  const actual = await vi.importActual<typeof import("next/cache")>("next/cache")
  return { ...actual, revalidateTag: mocks.revalidateTag }
})

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}))

// capability 검사(requireCsCopilotCapability)는 실제 구현을 쓴다 — 기본 부여·엄격 스위치 동작을 그대로 확인한다.
vi.mock("@/lib/admin-auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/admin-auth")>("@/lib/admin-auth")
  return { ...actual, requireVerifiedAdminContext: mocks.requireVerifiedAdminContext }
})

vi.mock("@/lib/repositories/internal-cs-chat", async () => {
  const actual = await vi.importActual<typeof import("@/lib/repositories/internal-cs-chat")>(
    "@/lib/repositories/internal-cs-chat"
  )
  return {
    ...actual,
    getInternalCsMessageById: mocks.getInternalCsMessageById,
    promoteRegressionOutcomes: mocks.promoteRegressionOutcomes,
  }
})

vi.mock("@/lib/internal-cs-chat/internal-article-writer", async () => {
  const actual = await vi.importActual<typeof import("@/lib/internal-cs-chat/internal-article-writer")>(
    "@/lib/internal-cs-chat/internal-article-writer"
  )
  return { ...actual, promoteMessageToInternalArticle: mocks.promoteMessageToInternalArticle }
})

import { POST as promotePost } from "@/app/api/admin/cs-chat/messages/[messageId]/promote-knowledge/route"

async function importRealRepo() {
  return vi.importActual<typeof import("@/lib/repositories/internal-cs-chat")>(
    "@/lib/repositories/internal-cs-chat"
  )
}

function promoteRequest(messageId: string, body?: string) {
  return new NextRequest(
    `https://classin.kr/api/admin/cs-chat/messages/${messageId}/promote-knowledge`,
    body === undefined
      ? { method: "POST" }
      : { method: "POST", headers: { "content-type": "application/json" }, body }
  )
}

function routeContext(messageId: string) {
  return { params: Promise.resolve({ messageId }) }
}

afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe("getInternalCsMessageById", () => {
  function singleChain(result: { data: unknown; error: unknown }) {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {}
    chain.select = vi.fn(() => chain)
    chain.eq = vi.fn(() => chain)
    chain.maybeSingle = vi.fn(() => Promise.resolve(result))
    return chain
  }

  it("returns the row when found and null otherwise", async () => {
    const repo = await importRealRepo()
    const row = { id: "assistant-1", conversation_id: "conv-1", role: "assistant" }
    mocks.createSupabaseAdminClient.mockReturnValueOnce({ from: vi.fn(() => singleChain({ data: row, error: null })) })
    expect(await repo.getInternalCsMessageById("assistant-1")).toBe(row)

    mocks.createSupabaseAdminClient.mockReturnValueOnce({ from: vi.fn(() => singleChain({ data: null, error: null })) })
    expect(await repo.getInternalCsMessageById("missing")).toBeNull()
  })
})

describe("POST /api/admin/cs-chat/messages/[messageId]/promote-knowledge", () => {
  const approvedMessage = {
    id: "assistant-1",
    conversation_id: "conv-1",
    role: "assistant",
    review_state: "approved",
    reviewed_at: "2026-09-29T01:02:03.000Z",
    content: "AI 초안: 환불은 가능합니다.",
    feedback_labels: ["human_approved"],
    corrected_content: "  환불은 계약 조건 확인 후 안내합니다.  ",
    metadata: {
      citations: [{ id: "pricing-contract-refund", verificationStatus: "hq_confirmation_required", externalUse: "confirmation_required" }],
      curatedKnowledgeStatuses: [{ id: "cs-tone", status: "confirmed", externalUse: "reviewed_summary_allowed" }],
    },
  }

  it("requires an authorized CS/admin session", async () => {
    mocks.requireVerifiedAdminContext.mockResolvedValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 })
    )

    const response = await promotePost(promoteRequest("assistant-1"), routeContext("assistant-1"))

    expect(response.status).toBe(403)
    expect(mocks.getInternalCsMessageById).not.toHaveBeenCalled()
    expect(mocks.promoteMessageToInternalArticle).not.toHaveBeenCalled()
  })

  it("denies under the strict capability switch without cs.knowledge.promote (default grant otherwise unchanged)", async () => {
    vi.stubEnv("CS_COPILOT_STRICT_CAPABILITIES", "1")
    try {
      mocks.requireVerifiedAdminContext.mockResolvedValue({ role: "ADMIN", name: "CS", userId: "u1", capabilities: [] })
      const denied = await promotePost(promoteRequest("assistant-1"), routeContext("assistant-1"))
      expect(denied.status).toBe(403)
      expect(await denied.json()).toMatchObject({ requiredCapability: "cs.knowledge.promote" })
      expect(mocks.getInternalCsMessageById).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it("returns 404 when the message does not exist", async () => {
    mocks.requireVerifiedAdminContext.mockResolvedValue({ role: "ADMIN", name: "CS" })
    mocks.getInternalCsMessageById.mockResolvedValue(null)

    const response = await promotePost(promoteRequest("missing"), routeContext("missing"))

    expect(response.status).toBe(404)
    expect(mocks.promoteMessageToInternalArticle).not.toHaveBeenCalled()
  })

  // 2026-11 B1(loop-2): 수정 요청(changes_requested)이라도 교정본이 있으면 승격한다 — 예전 기대값(400)을 뒤집었다.
  it("returns 400 when the message is pending or rejected", async () => {
    mocks.requireVerifiedAdminContext.mockResolvedValue({ role: "ADMIN", name: "CS" })
    for (const reviewState of ["pending", "rejected"]) {
      mocks.getInternalCsMessageById.mockResolvedValue({ ...approvedMessage, review_state: reviewState })
      const response = await promotePost(promoteRequest("assistant-1"), routeContext("assistant-1"))
      expect(response.status).toBe(400)
    }
    expect(mocks.promoteMessageToInternalArticle).not.toHaveBeenCalled()
  })

  it("promotes a changes_requested answer that carries a separate correction", async () => {
    mocks.requireVerifiedAdminContext.mockResolvedValue({ role: "ADMIN", name: "CS" })
    mocks.getInternalCsMessageById.mockResolvedValue({ ...approvedMessage, review_state: "changes_requested" })
    mocks.promoteMessageToInternalArticle.mockResolvedValue({
      articleId: "article-x",
      slug: "cs-assistant-1",
      reused: false,
      embeddingFailures: 0,
    })

    const response = await promotePost(promoteRequest("assistant-1"), routeContext("assistant-1"))
    expect(response.status).toBe(200)
    expect(mocks.promoteMessageToInternalArticle).toHaveBeenCalledTimes(1)
  })

  it("returns 409 for quick_approved rows or a correction equal to the AI original", async () => {
    mocks.requireVerifiedAdminContext.mockResolvedValue({ role: "ADMIN", name: "CS" })
    mocks.getInternalCsMessageById.mockResolvedValueOnce({
      ...approvedMessage,
      feedback_labels: ["human_approved", "quick_approved"],
    })
    const quick = await promotePost(promoteRequest("assistant-1"), routeContext("assistant-1"))
    expect(quick.status).toBe(409)
    expect((await quick.json()).code).toBe("unreviewed_original")

    mocks.getInternalCsMessageById.mockResolvedValueOnce({
      ...approvedMessage,
      content: "환불은 계약 조건\n확인 후   안내합니다.",
    })
    const same = await promotePost(promoteRequest("assistant-1"), routeContext("assistant-1"))
    expect(same.status).toBe(409)
    expect(mocks.promoteMessageToInternalArticle).not.toHaveBeenCalled()
  })

  it("returns 409 with a warning when the correction contains PII, and promotes the masked text once confirmed", async () => {
    mocks.requireVerifiedAdminContext.mockResolvedValue({ role: "ADMIN", name: "CS" })
    const withPii = { ...approvedMessage, corrected_content: "담당자 010-2345-6789 로 환불 계약 조건을 안내합니다." }
    mocks.getInternalCsMessageById.mockResolvedValue(withPii)

    const warned = await promotePost(promoteRequest("assistant-1"), routeContext("assistant-1"))
    const warnedJson = await warned.json()
    expect(warned.status).toBe(409)
    expect(warnedJson.code).toBe("redaction_confirmation_required")
    expect(warnedJson.warnings).toEqual(["개인정보 1건을 가렸습니다"])
    expect(warnedJson.redactedPreview).not.toContain("010-2345-6789")
    expect(mocks.promoteMessageToInternalArticle).not.toHaveBeenCalled()

    mocks.promoteMessageToInternalArticle.mockResolvedValue({
      articleId: "article-x",
      slug: "cs-assistant-1",
      reused: false,
      embeddingFailures: 0,
    })
    const confirmed = await promotePost(
      promoteRequest("assistant-1", JSON.stringify({ confirmRedaction: true })),
      routeContext("assistant-1")
    )
    expect(confirmed.status).toBe(200)
    expect((await confirmed.json()).redacted).toBe(1)
    const [, input] = mocks.promoteMessageToInternalArticle.mock.calls[0] as [unknown, { correctedContent: string }]
    expect(input.correctedContent).toBe("담당자 [phone] 로 환불 계약 조건을 안내합니다.")
  })

  it("rejects a malformed body or a non-boolean confirmRedaction with 400", async () => {
    mocks.requireVerifiedAdminContext.mockResolvedValue({ role: "ADMIN", name: "CS" })
    const broken = await promotePost(promoteRequest("assistant-1", "{not json"), routeContext("assistant-1"))
    expect(broken.status).toBe(400)
    const wrongType = await promotePost(
      promoteRequest("assistant-1", JSON.stringify({ confirmRedaction: "yes" })),
      routeContext("assistant-1")
    )
    expect(wrongType.status).toBe(400)
    expect(mocks.getInternalCsMessageById).not.toHaveBeenCalled()
  })

  it("closes the regression outcome and invalidates the metrics cache after promotion, even if closing fails", async () => {
    mocks.requireVerifiedAdminContext.mockResolvedValue({ role: "ADMIN", name: "CS" })
    mocks.getInternalCsMessageById.mockResolvedValue(approvedMessage)
    mocks.promoteMessageToInternalArticle.mockResolvedValue({
      articleId: "article-x",
      slug: "cs-assistant-1",
      reused: false,
      embeddingFailures: 0,
    })
    mocks.promoteRegressionOutcomes.mockRejectedValueOnce(new Error("db down"))
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)

    const response = await promotePost(promoteRequest("assistant-1"), routeContext("assistant-1"))

    expect(response.status).toBe(200)
    expect(mocks.promoteRegressionOutcomes).toHaveBeenCalledWith([{ messageId: "assistant-1" }])
    expect(mocks.revalidateTag).toHaveBeenCalledWith("internal-cs-metrics", "max")
    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect((await response.json()).gapQueueNote).toContain("보강 큐")
  })

  it("returns 400 when there is no corrected_content", async () => {
    mocks.requireVerifiedAdminContext.mockResolvedValue({ role: "ADMIN", name: "CS" })
    mocks.getInternalCsMessageById.mockResolvedValue({ ...approvedMessage, corrected_content: "   " })

    const response = await promotePost(promoteRequest("assistant-1"), routeContext("assistant-1"))

    expect(response.status).toBe(400)
    expect(mocks.promoteMessageToInternalArticle).not.toHaveBeenCalled()
  })

  it("promotes an eligible message with a trimmed correction and returns the article link", async () => {
    mocks.requireVerifiedAdminContext.mockResolvedValue({ role: "ADMIN", name: "CS" })
    mocks.getInternalCsMessageById.mockResolvedValue(approvedMessage)
    mocks.promoteMessageToInternalArticle.mockResolvedValue({
      articleId: "article-x",
      slug: "cs-assistant-1",
      reused: false,
      embeddingFailures: 0,
    })

    const response = await promotePost(promoteRequest("assistant-1"), routeContext("assistant-1"))
    const json = await response.json()

    expect(response.status).toBe(200)
    // 모든 청크 임베딩 성공 → searchable: true
    expect(json).toEqual({
      articleId: "article-x",
      slug: "cs-assistant-1",
      reused: false,
      searchable: true,
      redacted: 0,
      gapQueueNote: "보강 큐에 같은 질문 항목이 있으면 별도로 닫아야 합니다.",
    })
    expect(mocks.promoteMessageToInternalArticle).toHaveBeenCalledWith(
      { client: true },
      {
        messageId: "assistant-1",
        conversationId: "conv-1",
        correctedContent: "환불은 계약 조건 확인 후 안내합니다.",
        // 원 답변의 근거 상태 중 가장 보수적인 값과 검토 시각이 승격 문서로 넘어간다.
        knowledge: {
          status: "hq_confirmation_required",
          externalUse: "confirmation_required",
          asOf: "2026-09-29T01:02:03.000Z",
        },
        embed: expect.any(Function),
      }
    )
  })

  it("redacts PII from the chunk text before it reaches the external embedding API", async () => {
    mocks.requireVerifiedAdminContext.mockResolvedValue({ role: "ADMIN", name: "CS" })
    mocks.getInternalCsMessageById.mockResolvedValue(approvedMessage)
    mocks.promoteMessageToInternalArticle.mockResolvedValue({
      articleId: "article-x",
      slug: "cs-assistant-1",
      reused: false,
      embeddingFailures: 0,
    })
    vi.stubEnv("GEMINI_API_KEY", "test-key")
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ embedding: { values: [0.1, 0.2] } }), { status: 200 })
    )
    vi.stubGlobal("fetch", fetchMock)

    try {
      await promotePost(promoteRequest("assistant-1"), routeContext("assistant-1"))
      const [, input] = mocks.promoteMessageToInternalArticle.mock.calls[0] as [
        unknown,
        { embed: (text: string) => Promise<number[] | null> },
      ]
      expect(await input.embed("고객 010-1234-5678 / customer@example.com 환불 안내")).toEqual([0.1, 0.2])

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
      const payload = String(init.body)
      expect(payload).toContain("[phone]")
      expect(payload).toContain("[email]")
      expect(payload).not.toContain("010-1234-5678")
      expect(payload).not.toContain("customer@example.com")
    } finally {
      vi.unstubAllEnvs()
      vi.unstubAllGlobals()
    }
  })

  it("passes reused=true through on re-promotion", async () => {
    mocks.requireVerifiedAdminContext.mockResolvedValue({ role: "ADMIN", name: "CS" })
    mocks.getInternalCsMessageById.mockResolvedValue(approvedMessage)
    mocks.promoteMessageToInternalArticle.mockResolvedValue({
      articleId: "article-x",
      slug: "cs-assistant-1",
      reused: true,
      embeddingFailures: 0,
    })

    const response = await promotePost(promoteRequest("assistant-1"), routeContext("assistant-1"))
    const json = await response.json()

    expect(json.reused).toBe(true)
    expect(json.searchable).toBe(true)
  })

  it("marks the response searchable=false when some chunks failed to embed", async () => {
    mocks.requireVerifiedAdminContext.mockResolvedValue({ role: "ADMIN", name: "CS" })
    mocks.getInternalCsMessageById.mockResolvedValue(approvedMessage)
    mocks.promoteMessageToInternalArticle.mockResolvedValue({
      articleId: "article-x",
      slug: "cs-assistant-1",
      reused: false,
      embeddingFailures: 2,
    })

    const response = await promotePost(promoteRequest("assistant-1"), routeContext("assistant-1"))
    const json = await response.json()

    // 문서는 저장됐지만(200) 일부 청크가 벡터 검색되지 않는다 — UI 배지 분기용.
    expect(response.status).toBe(200)
    expect(json.searchable).toBe(false)
  })
})
