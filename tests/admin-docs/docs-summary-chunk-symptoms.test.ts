import { describe, expect, it } from "vitest"

import { buildDocsSummaryChunkContent } from "@/lib/admin-docs"

describe("buildDocsSummaryChunkContent", () => {
  const base = {
    title: "소리가 안 들릴 때",
    description: "수업 중 오디오 문제를 복구합니다.",
    chatbot_summary: "장치 선택과 권한을 먼저 확인합니다.",
    keywords: ["오디오", "마이크"],
    audience: ["교사"],
  }

  it("includes symptoms so they are embedded and keyword-matched", () => {
    const content = buildDocsSummaryChunkContent({
      ...base,
      symptoms: ["소리 안 남", "마이크 인식 안 됨"],
    })
    expect(content).toContain("증상: 소리 안 남, 마이크 인식 안 됨")
    expect(content).toContain("키워드: 오디오, 마이크")
    expect(content).toContain("대상: 교사")
  })

  it("omits the symptoms line when there are none", () => {
    for (const symptoms of [null, []]) {
      const content = buildDocsSummaryChunkContent({ ...base, symptoms })
      expect(content).not.toContain("증상:")
      expect(content).toBe(
        [base.title, base.description, base.chatbot_summary, "키워드: 오디오, 마이크", "대상: 교사"].join(
          "\n\n"
        )
      )
    }
  })
})
