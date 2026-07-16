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

beforeEach(() => {
  mocks.searchConsultationEvidence.mockResolvedValue([])
})

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
})

describe("buildInternalCsCopilotContext", () => {
  it("combines public docs evidence with internal operations and HQ communication rules", async () => {
    mocks.evaluateChatbotQuery.mockResolvedValue({
      answer: "관리자 녹화 메뉴에서 확인할 수 있습니다.",
      sources: [
        {
          articleId: "article-recording",
          title: "녹화 관리",
          heading: "관리자 확인",
          urlPath: "/docs/admin/recording",
          category: "admin",
          excerpt: "관리자는 녹화 목록과 권한을 확인합니다.",
          score: 42,
        },
      ],
      warning: undefined,
    })

    const result = await buildInternalCsCopilotContext("녹화 파일 확인 방법")

    expect(mocks.evaluateChatbotQuery).toHaveBeenCalledWith("녹화 파일 확인 방법", {
      generateAnswer: false,
    })
    expect(result.internalContext).toContain("공개 고객 응대 안전 초안")
    expect(result.internalContext).toContain("최종 판단, 고객 전달, 본사 전달, 승인 권한은 CS 담당자")
    expect(result.internalContext).toContain("결론·사실 우선")
    expect(result.internalContext).toContain("[KR-CS][우선순위][제품 영역][케이스 ID]")
    expect(result.sourceRefs).toContainEqual({
      id: "article-recording",
      label: "녹화 관리 · 관리자 확인",
      kind: "public_doc",
    })
    expect(result.curatedEvidence.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "software-current-scope", status: "conditional" }),
    ]))
    expect(result.curatedEvidence.recommendedTags).toContain("area:software")
    expect(result.deterministicFallback).toContain("관리자 녹화 메뉴")
    expect(result.deterministicFallback).toContain("정리된 내부 기준")
    expect(result.deterministicFallback).toContain("CS 담당자의 검토와 승인")
  })

  it("remains usable when public document retrieval fails", async () => {
    mocks.evaluateChatbotQuery.mockRejectedValue(new Error("docs unavailable"))

    const result = await buildInternalCsCopilotContext("본사 확인 문안을 만들어줘")

    expect(result.publicEvidence.sources).toEqual([])
    expect(result.publicEvidence.warning).toContain("검색에 실패")
    expect(result.internalContext).toContain("본사 확인·소통 기준")
    expect(result.internalContext).toContain("정리된 내부 CS 지식")
    expect(result.deterministicFallback).toContain("직접 일치하는 공개 가이드 근거를 찾지 못했습니다")
  })

  it("uses queue tags to surface conflict evidence and require deeper review", async () => {
    mocks.evaluateChatbotQuery.mockResolvedValue({ answer: null, sources: [] })

    const result = await buildInternalCsCopilotContext("현재 건 확인", {
      queueTags: ["area:board", "topic:warranty"],
    })

    expect(result.curatedEvidence.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "board-generations", status: "conflicting_sources" }),
      expect.objectContaining({ id: "pricing-contract-refund", status: "hq_confirmation_required" }),
    ]))
    expect(result.curatedEvidence.reviewRequired).toBe(true)
    expect(result.curatedEvidence.reviewReasons.join(" ")).toContain("자료 충돌")
    expect(result.curatedEvidence.reviewReasons.join(" ")).toContain("본사 확인 필요")
  })
})
