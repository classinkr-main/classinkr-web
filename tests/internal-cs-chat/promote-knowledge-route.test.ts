import { NextRequest, NextResponse } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

// 승격 lib 는 spy 로 배선/자격만 검증하고, getInternalCsMessageById repo 는 실제 구현을 가짜 supabase 로 구동한다.
const mocks = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn((): unknown => ({ client: true })),
  requireVerifiedAdminContext: vi.fn(),
  getInternalCsMessageById: vi.fn(),
  promoteMessageToInternalArticle: vi.fn(),
}))

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}))

vi.mock("@/lib/admin-auth", () => ({
  CRM_STAFF_ADMIN_API_ROLES: ["SUPER_ADMIN", "ADMIN", "BRANCH"],
  requireVerifiedAdminContext: mocks.requireVerifiedAdminContext,
}))

vi.mock("@/lib/repositories/internal-cs-chat", async () => {
  const actual = await vi.importActual<typeof import("@/lib/repositories/internal-cs-chat")>(
    "@/lib/repositories/internal-cs-chat"
  )
  return { ...actual, getInternalCsMessageById: mocks.getInternalCsMessageById }
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

function promoteRequest(messageId: string) {
  return new NextRequest(
    `https://classin.kr/api/admin/cs-chat/messages/${messageId}/promote-knowledge`,
    { method: "POST" }
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
    corrected_content: "  환불은 계약 조건 확인 후 안내합니다.  ",
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

  it("returns 404 when the message does not exist", async () => {
    mocks.requireVerifiedAdminContext.mockResolvedValue({ role: "ADMIN", name: "CS" })
    mocks.getInternalCsMessageById.mockResolvedValue(null)

    const response = await promotePost(promoteRequest("missing"), routeContext("missing"))

    expect(response.status).toBe(404)
    expect(mocks.promoteMessageToInternalArticle).not.toHaveBeenCalled()
  })

  it("returns 400 when the message is not approved", async () => {
    mocks.requireVerifiedAdminContext.mockResolvedValue({ role: "ADMIN", name: "CS" })
    mocks.getInternalCsMessageById.mockResolvedValue({
      ...approvedMessage,
      review_state: "changes_requested",
    })

    const response = await promotePost(promoteRequest("assistant-1"), routeContext("assistant-1"))

    expect(response.status).toBe(400)
    expect(mocks.promoteMessageToInternalArticle).not.toHaveBeenCalled()
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
    })
    expect(mocks.promoteMessageToInternalArticle).toHaveBeenCalledWith(
      { client: true },
      {
        messageId: "assistant-1",
        conversationId: "conv-1",
        correctedContent: "환불은 계약 조건 확인 후 안내합니다.",
      }
    )
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
