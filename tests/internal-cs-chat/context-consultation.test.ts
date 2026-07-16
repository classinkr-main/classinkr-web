import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  evaluateChatbotQuery: vi.fn(),
  searchConsultationEvidence: vi.fn(),
}))

vi.mock("@/lib/chatbot/service", () => ({
  evaluateChatbotQuery: mocks.evaluateChatbotQuery,
}))

vi.mock("@/lib/internal-cs-chat/consultation-search", () => ({
  searchConsultationEvidence: mocks.searchConsultationEvidence,
}))

import { buildInternalCsCopilotContext } from "@/lib/internal-cs-chat/context"

const consultationEvidence = [
  {
    conversationId: "userchat-77",
    excerpt: "환불은 계약 형태(연간/월간)에 따라 달라 담당자가 계약을 먼저 확인했습니다.",
    category: "billing",
    tags: ["환불", "결제"],
    matchedOrg: "한빛학원",
    occurredAt: "2026-07-10T02:00:00.000Z",
    similarity: 0.83,
  },
]

beforeEach(() => {
  mocks.evaluateChatbotQuery.mockResolvedValue({ answer: null, sources: [] })
  mocks.searchConsultationEvidence.mockResolvedValue([])
})

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
})

describe("buildInternalCsCopilotContext — 과거 상담 사례 결합", () => {
  it("adds a consultation section, channel source refs, and a fallback note when evidence exists", async () => {
    mocks.searchConsultationEvidence.mockResolvedValue(consultationEvidence)

    const result = await buildInternalCsCopilotContext("환불 규정 알려줘")

    expect(mocks.searchConsultationEvidence).toHaveBeenCalledWith("환불 규정 알려줘")
    expect(result.internalContext).toContain("[과거 상담 사례]")
    expect(result.internalContext).toContain("환불은 계약 형태")
    expect(result.internalContext).toContain("유사도 0.83")
    expect(result.sourceRefs).toContainEqual(
      expect.objectContaining({
        id: "channel:userchat-77",
        label: expect.stringContaining("[상담]"),
      })
    )
    expect(result.deterministicFallback).toContain("과거 유사 상담 사례 1건")
  })

  it("omits the consultation section and notes the absence when there is no evidence", async () => {
    mocks.searchConsultationEvidence.mockResolvedValue([])

    const result = await buildInternalCsCopilotContext("환불 규정 알려줘")

    expect(result.internalContext).not.toContain("[과거 상담 사례]")
    expect(result.sourceRefs.some((ref) => ref.id.startsWith("channel:"))).toBe(false)
    expect(result.deterministicFallback).toContain("과거 유사 상담 사례는 찾지 못했습니다")
  })

  it("stays usable when consultation search rejects (never blocks the copilot)", async () => {
    mocks.searchConsultationEvidence.mockRejectedValue(new Error("boom"))

    const result = await buildInternalCsCopilotContext("환불 규정 알려줘")

    expect(result.internalContext).not.toContain("[과거 상담 사례]")
    expect(result.deterministicFallback).toContain("과거 유사 상담 사례는 찾지 못했습니다")
  })

  it("threads includeInternalDocs into the public retriever only when requested", async () => {
    await buildInternalCsCopilotContext("환불 규정 알려줘", { includeInternalDocs: true })
    expect(mocks.evaluateChatbotQuery).toHaveBeenLastCalledWith("환불 규정 알려줘", {
      generateAnswer: false,
      includeInternalDocs: true,
    })

    mocks.evaluateChatbotQuery.mockClear()

    await buildInternalCsCopilotContext("환불 규정 알려줘")
    expect(mocks.evaluateChatbotQuery).toHaveBeenLastCalledWith("환불 규정 알려줘", {
      generateAnswer: false,
    })
  })
})
