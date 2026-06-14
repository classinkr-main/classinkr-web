import { describe, expect, it } from "vitest"

import { buildDocDraftArticlePayload } from "@/lib/chatbot/doc-draft-article"

describe("doc draft article payload", () => {
  it("turns an AI draft into a safe draft docs article payload", () => {
    const payload = buildDocDraftArticlePayload({
      draft: {
        title: "수업 녹화 저장 용량 확인",
        contentMarkdown: "## 확인 순서\n\n관리자 화면에서 스토리지 메뉴를 확인합니다.",
        suggestedCategory: "admin",
      },
      question: "수업 녹화 저장 용량과 스토리지는 관리자에서 어디서 확인하나요?",
    })

    expect(payload.categoryId).toBe("admin")
    expect(payload.productArea).toBe("admin")
    expect(payload.docType).toBe("faq")
    expect(payload.status).toBe("draft")
    expect(payload.visibility).toBe("unlisted")
    expect(payload.noindex).toBe(true)
    expect(payload.slug).toMatch(/^ai-draft-[a-z0-9]+$/)
    expect(payload.contentMarkdown).toContain("# 수업 녹화 저장 용량 확인")
    expect(payload.keywords).toContain("수업 녹화 저장 용량과 스토리지는 관리자에서 어디서 확인하나요?")
  })

  it("maps board and student drafts to chatbot-friendly product areas", () => {
    expect(
      buildDocDraftArticlePayload({
        draft: {
          title: "S98 Pro 설치 확인",
          contentMarkdown: "# S98 Pro 설치 확인",
          suggestedCategory: "board",
        },
        question: "S98 Pro 설치 공간은 어떻게 확인하나요?",
      }).productArea
    ).toBe("hardware")

    expect(
      buildDocDraftArticlePayload({
        draft: {
          title: "학생 계정 초대",
          contentMarkdown: "# 학생 계정 초대",
          suggestedCategory: "student",
        },
        question: "학생 계정은 어떻게 초대하나요?",
      }).productArea
    ).toBe("classroom")
  })
})
