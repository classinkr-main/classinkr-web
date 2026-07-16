import { describe, expect, it } from "vitest"

import {
  getInternalCsKnowledgeEntries,
  selectInternalCsKnowledge,
} from "@/lib/internal-cs-chat/knowledge"

describe("internal CS curated knowledge", () => {
  it("routes board generation questions to the current conflict boundary", () => {
    const result = selectInternalCsKnowledge("S86 모델과 세대별 OPS 사양을 확인해줘")

    expect(result.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "board-generations",
        status: "conflicting_sources",
        externalUse: "confirmation_required",
      }),
    ]))
    expect(result.internalContext).toContain("S65·S75·S86·S98 Pro·S110 5개")
    expect(result.internalContext).toContain("ZIP의 4모델 표")
    expect(result.recommendedTags).toContain("area:board")
    expect(result.recommendedTags).toContain("evidence:conflict")
  })

  it("keeps global refund notes out of Korean customer facts", () => {
    const result = selectInternalCsKnowledge("프로모션 결제 환불 가능 여부를 고객에게 답해줘")
    const pricing = result.entries.find((entry) => entry.id === "pricing-contract-refund")

    expect(pricing).toMatchObject({
      status: "hq_confirmation_required",
      externalUse: "confirmation_required",
    })
    expect(pricing?.summary).toContain("한국 계약 정본이 아니다")
    expect(result.recommendedTags).toContain("intent:hq_confirmation")
  })

  it("always injects source precedence and support tone", () => {
    const result = selectInternalCsKnowledge("일반 문의")

    expect(result.entries.slice(0, 2).map((entry) => entry.id)).toEqual([
      "source-precedence",
      "support-tone",
    ])
    expect(result.internalContext).toContain("현재 저장소의 명시적 SSOT를 우선")
    expect(result.internalContext).toContain("CS 담당자의 검토 상태")
  })

  it("keeps every curated entry linked to repository-relative evidence", () => {
    for (const entry of getInternalCsKnowledgeEntries()) {
      expect(entry.sourceRefs.length).toBeGreaterThan(0)
      for (const source of entry.sourceRefs) {
        expect(source.id).toMatch(/^docs\//)
        expect(source.id).not.toMatch(/^[A-Za-z]:\\/)
      }
    }
  })
})
