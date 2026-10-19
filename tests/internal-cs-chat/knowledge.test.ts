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

  it("surfaces SMS cost as a confirm-before-external conditional fact", () => {
    const result = selectInternalCsKnowledge("엔터프라이즈 구독에 회원가입 문자 몇 건 포함돼?")
    const sms = result.entries.find((entry) => entry.id === "messaging-sms-cost")

    expect(sms).toMatchObject({
      status: "conditional",
      externalUse: "confirmation_required",
    })
    expect(sms?.summary).toContain("0.4위안")
    expect(sms?.summary).toContain("2,000건")
    expect(result.internalContext).toContain("문자")
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

  it("matches network interruption questions to code 56/57 diagnostics", () => {
    const result = selectInternalCsKnowledge("수업 중 코드 56 오류로 끊기고 최대화가 풀려요")
    const entry = result.entries.find((e) => e.id === "network-interruption-diagnostics")

    expect(entry).toMatchObject({
      status: "confirmed",
      externalUse: "reviewed_summary_allowed",
    })
    expect(entry?.summary).toContain("코드 56은 서버-클라이언트 네트워크 단절")
    expect(result.recommendedTags).toContain("topic:network")
  })

  it("routes recording failure questions to error code 4001 and disable diagnostics", () => {
    const result = selectInternalCsKnowledge("현장 녹화가 시작되었다고 뜨는데 파일이 없어요 error code 4001")
    const entry = result.entries.find((e) => e.id === "recording-error-diagnostics")

    expect(entry).toMatchObject({
      status: "confirmed",
      externalUse: "reviewed_summary_allowed",
    })
    expect(entry?.summary).toContain("error code 4001")
    expect(result.recommendedTags).toContain("topic:recording")
  })

  it("surfaces camera network troubleshooting for IP conflict and CameraCMS issues", () => {
    const result = selectInternalCsKnowledge("CameraCMS에서 카메라는 검색되는데 192.168.1.222 접속 실패해요")
    const entry = result.entries.find((e) => e.id === "camera-network-troubleshooting")

    expect(entry).toMatchObject({
      status: "confirmed",
      externalUse: "reviewed_summary_allowed",
    })
    expect(entry?.summary).toContain("192.168.1.222")
    expect(result.recommendedTags).toContain("area:camera")
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
