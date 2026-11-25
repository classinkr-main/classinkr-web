import { NextRequest } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

// 승인 경계(IC-01): 검토 PATCH 가 AI 원문 그대로의 승인과 즉시 승인(quick_approved)을 거절하는지 고정한다.
const mocks = vi.hoisted(() => ({
  requireVerifiedAdminContext: vi.fn(),
  reviewInternalCsMessage: vi.fn(),
  getInternalCsMessageById: vi.fn(),
  getInternalCsConversation: vi.fn(),
  ingestInternalCsGap: vi.fn(),
  revalidateTag: vi.fn(),
}))

vi.mock("next/cache", async () => {
  const actual = await vi.importActual<typeof import("next/cache")>("next/cache")
  return { ...actual, revalidateTag: mocks.revalidateTag }
})

vi.mock("@/lib/admin-auth", () => ({
  CRM_STAFF_ADMIN_API_ROLES: ["SUPER_ADMIN", "ADMIN", "BRANCH"],
  requireVerifiedAdminContext: mocks.requireVerifiedAdminContext,
}))

vi.mock("@/lib/internal-cs-chat/gap-ingest", () => ({
  ingestInternalCsGap: mocks.ingestInternalCsGap,
}))

vi.mock("@/lib/repositories/internal-cs-chat", () => ({
  INTERNAL_CS_REGRESSION_OUTCOMES: ["not_evaluated", "pass", "needs_fix", "promoted", "excluded"],
  isInternalCsChatNotReadyError: vi.fn(() => false),
  reviewInternalCsMessage: mocks.reviewInternalCsMessage,
  getInternalCsMessageById: mocks.getInternalCsMessageById,
  getInternalCsConversation: mocks.getInternalCsConversation,
  updateInternalCsRegressionOutcome: vi.fn(),
}))

import { PATCH } from "@/app/api/admin/cs-chat/conversations/[id]/messages/[messageId]/route"

const CONVERSATION_ID = "conversation-1"
const MESSAGE_ID = "assistant-1"
const ORIGINAL = "## 내부 메모\n환불은 가능합니다."

function patch(body: unknown) {
  return PATCH(
    new NextRequest(`https://classin.kr/api/admin/cs-chat/conversations/${CONVERSATION_ID}/messages/${MESSAGE_ID}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: CONVERSATION_ID, messageId: MESSAGE_ID }) }
  )
}

function arrange(original: Record<string, unknown> | null = {}) {
  mocks.requireVerifiedAdminContext.mockResolvedValue({ role: "ADMIN", name: "CS 담당자" })
  mocks.getInternalCsMessageById.mockResolvedValue(
    original === null
      ? null
      : { id: MESSAGE_ID, conversation_id: CONVERSATION_ID, role: "assistant", content: ORIGINAL, ...original }
  )
  mocks.reviewInternalCsMessage.mockImplementation(async (input: { decision: string }) => ({
    id: MESSAGE_ID,
    conversation_id: CONVERSATION_ID,
    role: "assistant",
    review_state: input.decision,
    metadata: {},
  }))
}

afterEach(() => {
  vi.clearAllMocks()
})

describe("PATCH review route approval boundary", () => {
  it("rejects an approval whose correction equals the AI original apart from whitespace", async () => {
    arrange()
    const response = await patch({ decision: "approved", correctedContent: "## 내부 메모   환불은 가능합니다.  " })
    expect(response.status).toBe(400)
    expect(mocks.reviewInternalCsMessage).not.toHaveBeenCalled()
    expect(mocks.revalidateTag).not.toHaveBeenCalled()
  })

  it("rejects the quick_approved label with 400 without reading the message", async () => {
    arrange()
    const response = await patch({
      decision: "approved",
      correctedContent: "따로 쓴 고객용 답입니다.",
      feedbackLabels: ["human_approved", "quick_approved"],
      conversationAction: "resolve",
    })
    expect(response.status).toBe(400)
    expect(mocks.getInternalCsMessageById).not.toHaveBeenCalled()
    expect(mocks.reviewInternalCsMessage).not.toHaveBeenCalled()
  })

  it("approves a separately written correction and invalidates the metrics cache", async () => {
    arrange()
    const response = await patch({
      decision: "approved",
      correctedContent: "계약 조건을 확인한 뒤 환불 가능 여부를 안내드리겠습니다.",
      feedbackLabels: ["human_approved"],
    })
    expect(response.status).toBe(200)
    expect(mocks.reviewInternalCsMessage).toHaveBeenCalledWith(
      expect.objectContaining({ decision: "approved", feedbackLabels: ["human_approved"] })
    )
    expect(mocks.revalidateTag).toHaveBeenCalledWith("internal-cs-metrics", "max")
  })

  it("returns 404 when the message belongs to another conversation", async () => {
    arrange({ conversation_id: "other-conversation" })
    const response = await patch({ decision: "approved", correctedContent: "따로 쓴 답" })
    expect(response.status).toBe(404)
    expect(mocks.reviewInternalCsMessage).not.toHaveBeenCalled()
  })

  it("keeps rejected and changes_requested unchanged (no original comparison)", async () => {
    arrange()
    const rejected = await patch({ decision: "rejected", correctedContent: ORIGINAL })
    expect(rejected.status).toBe(200)
    const changes = await patch({ decision: "changes_requested", excludeFromGapQueue: true })
    expect(changes.status).toBe(200)
    expect(mocks.getInternalCsMessageById).not.toHaveBeenCalled()
  })

  it("still rejects an empty correction (existing rule) and a malformed body", async () => {
    arrange()
    expect((await patch({ decision: "approved", correctedContent: "   " })).status).toBe(400)
    expect((await patch("{broken")).status).toBe(400)
    expect(mocks.reviewInternalCsMessage).not.toHaveBeenCalled()
  })

  // 검토(안전-3): 원문에 '.' 이나 U+200B 하나 더한 글, 내부 표시가 남은 글, 사람이 더한 약속이 서버 가드를 넘던 길.
  it("rejects a correction that differs from the original only by punctuation or a zero-width space", async () => {
    arrange()
    expect((await patch({ decision: "approved", correctedContent: `${ORIGINAL}.` })).status).toBe(400)
    expect((await patch({ decision: "approved", correctedContent: `${ORIGINAL}\u200B` })).status).toBe(400)
    expect(mocks.reviewInternalCsMessage).not.toHaveBeenCalled()
  })

  it("rejects internal markers in the final answer even with warnings acknowledged", async () => {
    arrange()
    const response = await patch({
      decision: "approved",
      correctedContent: "안녕하세요.\n[선례] 같은 증상이 있었습니다.",
      feedbackLabels: ["human_approved"],
      warningsAcknowledged: true,
    })
    expect(response.status).toBe(400)
    expect(mocks.reviewInternalCsMessage).not.toHaveBeenCalled()
  })

  it("requires warningsAcknowledged for high-severity promises in the final answer and records it", async () => {
    arrange()
    const body = {
      decision: "approved",
      correctedContent: "확인했습니다. 환불을 진행해 드리겠습니다.",
      feedbackLabels: ["human_approved"],
    }
    const blocked = await patch(body)
    expect(blocked.status).toBe(400)
    expect(mocks.reviewInternalCsMessage).not.toHaveBeenCalled()

    const acknowledged = await patch({ ...body, warningsAcknowledged: true })
    expect(acknowledged.status).toBe(200)
    expect(mocks.reviewInternalCsMessage).toHaveBeenCalledWith(
      expect.objectContaining({ feedbackLabels: ["human_approved", "warnings_acknowledged"] })
    )
  })

  it("rejects a non-boolean warningsAcknowledged", async () => {
    arrange()
    expect((await patch({ decision: "approved", correctedContent: "따로 쓴 답", warningsAcknowledged: "yes" })).status).toBe(400)
  })
})
