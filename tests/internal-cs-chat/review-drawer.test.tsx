import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import ReviewDrawer from "@/components/admin/cs-chat/panels/ReviewDrawer"
import type { InternalCsMessage } from "@/components/admin/cs-chat/types"

const pending: InternalCsMessage = {
  id: "msg-1",
  conversation_id: "conv-1",
  role: "assistant",
  content: "내부 분석 원문입니다.",
  model_name: "gemini",
  model_mode: "fast",
  source_refs: [],
  metadata: {},
  review_state: "pending",
  corrected_content: null,
  review_note: null,
  feedback_labels: [],
  regression_candidate: false,
  regression_outcome: "not_evaluated",
  reviewed_by: null,
  reviewed_at: null,
  created_at: "2026-10-15T08:50:00Z",
}

const props = {
  reviewChecks: { customer: true, evidence: true, externalScope: true, warnings: false },
  finalDraft: "고객용 문안",
  reviewNote: "",
  regressionCandidate: false,
  excludeFromGapQueue: false,
  pendingMessage: pending,
  isPending: false,
  canApprove: true,
  onClose: vi.fn(),
  onCheckChange: vi.fn(),
  onFinalDraftChange: vi.fn(),
  onReviewNoteChange: vi.fn(),
  onRegressionCandidateChange: vi.fn(),
  onExcludeFromGapQueueChange: vi.fn(),
  onSubmitReview: vi.fn(),
}

describe("ReviewDrawer", () => {
  it("대화상자 역할과 접힌 읽기 전용 검토 대상, 자동 처리 요약 한 줄을 보인다", () => {
    const html = renderToStaticMarkup(<ReviewDrawer {...props} onPolish={vi.fn()} onReject={vi.fn()} />)
    expect(html).toContain('role="dialog"')
    expect(html).toContain("검토 대상 AI 초안 보기")
    expect(html).toContain("읽기 전용")
    expect(html).toContain("내부 분석 원문입니다.")
    expect(html).not.toMatch(/<details[^>]*\sopen/)
    expect(html).toContain("수정 요청 시 자동 처리")
    expect(html).toContain("고객용 문안 만들기")
    expect(html).toContain("사용 안 함")
    // 최종 칸은 6~8줄.
    expect(html).toMatch(/rows="[678]"/)
    // 자동 외부 전송은 없고, '외부 전달 허용' 류 문구도 없다.
    expect(html).toContain("자동 외부 전송은 하지 않습니다")
    expect(html).not.toContain("허가")
  })

  it("검토 경고가 있으면 경고 목록과 확인 체크를 보이고, 꺼진 승인에는 이유를 적는다", () => {
    const withWarnings = {
      ...pending,
      metadata: { reviewWarnings: [{ code: "amount", severity: "high", label: "금액 표현", excerpt: "월 33,000원" }] },
    }
    const html = renderToStaticMarkup(
      <ReviewDrawer
        {...props}
        pendingMessage={withWarnings}
        canApprove={false}
        approveBlockedReason="검토 경고를 읽고 확인했는지 체크해 주세요."
      />
    )
    expect(html).toContain("검토 경고 1건")
    expect(html).toContain("위 경고를 확인했습니다")
    expect(html).toContain("승인할 수 없는 이유")
    expect(html).toContain("검토 경고를 읽고 확인했는지")
    const approve = html.match(/<button[^>]*>승인하고 복사<\/button>/)?.[0] ?? ""
    expect(approve).toContain("disabled")
  })

  it("모델 실패 초안이면 상태 띠를 보인다(IC-03)", () => {
    const failed = { ...pending, metadata: { origin: "deterministic", failureKinds: ["quota"] } }
    const html = renderToStaticMarkup(<ReviewDrawer {...props} pendingMessage={failed} />)
    expect(html).toContain("AI 연결 실패")
    expect(html).toContain("AI 사용 한도")
  })
})
