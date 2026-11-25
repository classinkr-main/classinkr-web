import { describe, expect, it } from "vitest"

import { readReviewWarnings, reviewApprovalState } from "@/components/admin/cs-chat/ops-desk"

const checks = { customer: true, evidence: true, externalScope: true, warnings: false }
const base = {
  checks,
  warningCount: 0,
  hasPending: true,
  finalDraft: "고객에게 보낼 확인 문안입니다.",
  original: "내부 분석 원문입니다.",
}

describe("reviewApprovalState (승인 버튼 조건과 사유)", () => {
  it("확인 3종과 따로 쓴 최종 답이 있으면 켜진다", () => {
    expect(reviewApprovalState(base)).toEqual({ canApprove: true, reason: null })
  })

  it("대기 초안이 없거나 최종 답이 비면 사유를 돌려준다", () => {
    expect(reviewApprovalState({ ...base, hasPending: false }).canApprove).toBe(false)
    const empty = reviewApprovalState({ ...base, finalDraft: "  " })
    expect(empty.canApprove).toBe(false)
    expect(empty.reason).toContain("최종 답변")
  })

  it("확인 3종 중 하나라도 비면 막는다", () => {
    const state = reviewApprovalState({ ...base, checks: { ...checks, evidence: false } })
    expect(state.canApprove).toBe(false)
    expect(state.reason).toContain("확인 3종")
  })

  it("최종 답이 AI 원문과 같으면(공백 차이만) 막는다 — 서버 400과 같은 규칙", () => {
    const state = reviewApprovalState({ ...base, finalDraft: "내부   분석\n원문입니다." })
    expect(state.canApprove).toBe(false)
    expect(state.reason).toContain("AI 초안과 같습니다")
  })

  it("검토 경고가 있으면 경고 확인 체크 뒤에만 켜진다(IC-04)", () => {
    const blocked = reviewApprovalState({ ...base, warningCount: 2 })
    expect(blocked.canApprove).toBe(false)
    expect(blocked.reason).toContain("경고")
    const acked = reviewApprovalState({ ...base, warningCount: 2, checks: { ...checks, warnings: true } })
    expect(acked.canApprove).toBe(true)
  })
})

describe("readReviewWarnings", () => {
  it("메시지 metadata 의 경고만 검증해 읽고 모양이 틀린 항목은 버린다", () => {
    const warnings = readReviewWarnings({
      metadata: {
        reviewWarnings: [
          { code: "amount", severity: "high", label: "금액", excerpt: "33,000원" },
          { code: 5, label: "버려짐" },
          null,
          { code: "promise", label: "약속" },
        ],
      },
    })
    expect(warnings.map((warning) => warning.code)).toEqual(["amount", "promise"])
    expect(warnings[1].severity).toBe("medium")
    expect(readReviewWarnings(null)).toEqual([])
    expect(readReviewWarnings({ metadata: {} })).toEqual([])
  })
})

// 검토(안전-3): 승인 버튼도 라우트와 같은 최종본 재검사를 따른다.
describe("reviewApprovalState — final answer re-check", () => {
  it("blocks internal markers in the final answer regardless of checks", () => {
    const state = reviewApprovalState({ ...base, checks: { ...checks, warnings: true }, finalDraft: "## 내부 분석\n안내드립니다." })
    expect(state.canApprove).toBe(false)
    expect(state.reason).toContain("내부 표시")
  })

  it("requires the warning acknowledgement when the final answer itself carries a promise", () => {
    const draft = "확인했습니다. 환불을 진행해 드리겠습니다."
    expect(reviewApprovalState({ ...base, finalDraft: draft }).canApprove).toBe(false)
    expect(reviewApprovalState({ ...base, finalDraft: draft, checks: { ...checks, warnings: true } }).canApprove).toBe(true)
  })
})

