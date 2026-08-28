import { describe, expect, it } from "vitest"

import { buildLeadAssignmentPolicyPreview } from "@/lib/crm/lead-assignment-policy"
import type { LeadRecord } from "@/lib/repositories/leads"

const NOW = Date.parse("2026-08-27T00:00:00.000Z")

function lead(id: string, patch: Partial<LeadRecord> = {}): LeadRecord {
  return {
    id,
    source: "meta_lead_ads",
    name: `운영 리드 ${id}`,
    phone: `0101234${id.padStart(4, "0")}`,
    timestamp: "2026-08-26T00:00:00.000Z",
    status: "new",
    confirmed_at: "2026-08-26T01:00:00.000Z",
    ...patch,
  }
}

describe("lead assignment safety policy", () => {
  it("권위 있는 owner 연결이 없으므로 채널·지역만으로 자동 추천하지 않는다", () => {
    const preview = buildLeadAssignmentPolicyPreview([lead("1", { branch: "서울" })], ["1"], NOW)

    expect(preview.automaticEvidenceReady).toBe(0)
    expect(preview.manualReviewReady).toBe(1)
  })

  it("미확인·테스트·30일 이상 리드를 각각 차단한다", () => {
    const preview = buildLeadAssignmentPolicyPreview(
      [
        lead("1", { confirmed_at: undefined }),
        lead("2", { name: "<test lead: dummy data>", email: "test@meta.com" }),
        lead("3", { timestamp: "2026-07-01T00:00:00.000Z" }),
      ],
      ["1", "2", "3"],
      NOW
    )

    expect(preview.manualReviewReady).toBe(0)
    expect(preview.blockerCounts.unconfirmed).toBe(1)
    expect(preview.blockerCounts.test_lead).toBe(1)
    expect(preview.blockerCounts.stale_30d).toBe(1)
  })

  it("선택 밖 동일 연락처가 있으면 부분 중복 코호트로 차단한다", () => {
    const preview = buildLeadAssignmentPolicyPreview(
      [lead("1", { phone: "010-1111-2222" }), lead("2", { phone: "01011112222" })],
      ["1"],
      NOW
    )

    expect(preview.partialDuplicateClusters).toBe(1)
    expect(preview.blockerCounts.partial_duplicate_cohort).toBe(1)
    expect(preview.safeLeadIds).toEqual([])
  })

  it("중복 묶음 전체를 선택하면 두 행 모두 수동 검토 가능하다", () => {
    const preview = buildLeadAssignmentPolicyPreview(
      [lead("1", { email: "same@classin.kr" }), lead("2", { email: "SAME@classin.kr" })],
      ["1", "2"],
      NOW
    )

    expect(preview.duplicateClusters).toBe(1)
    expect(preview.manualReviewReady).toBe(2)
    expect(preview.blockedLeadIds).toEqual([])
  })

  it("이미 배정·종료·누락 행을 안전 대상으로 세지 않는다", () => {
    const preview = buildLeadAssignmentPolicyPreview(
      [lead("1", { assigned_to: "Owner" }), lead("2", { status: "closed" })],
      ["1", "2", "missing"],
      NOW
    )

    expect(preview.blockerCounts.already_assigned).toBe(1)
    expect(preview.blockerCounts.inactive).toBe(1)
    expect(preview.blockerCounts.missing).toBe(1)
  })
})
