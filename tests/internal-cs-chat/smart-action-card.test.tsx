import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import SmartActionCard from "@/components/admin/cs-chat/components/SmartActionCard"
import QuickPromptChips from "@/components/admin/cs-chat/components/QuickPromptChips"
import type { InternalCsMessage } from "@/components/admin/cs-chat/types"

const mockPendingMessage: InternalCsMessage = {
  id: "msg-ops-1",
  conversation_id: "conv-1",
  role: "assistant",
  content: "전자칠판 OPS 부팅이 안 될 때 윈도우 전원 설정 및 슬롯 접촉을 확인합니다.",
  model_name: "gemini-4.0-flash",
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
  created_at: new Date().toISOString(),
}

const mockApprovedMessage: InternalCsMessage = {
  ...mockPendingMessage,
  id: "msg-ops-approved",
  review_state: "approved",
  reviewed_by: "김담당",
  reviewed_at: new Date().toISOString(),
}

describe("SmartActionCard component", () => {
  it("renders detected issue title, confirmation button, and 1-click approval button for pending message", () => {
    const html = renderToStaticMarkup(
      <SmartActionCard
        message={mockPendingMessage}
        isLatest={true}
        onQuickApprove={vi.fn()}
        onCopyCustomerHolding={vi.fn()}
        onRequestHq={vi.fn()}
        onSelectAlternativeIssue={vi.fn()}
      />
    )

    expect(html).toContain("파악된 증상 — 이런 상황 맞으신가요?")
    expect(html).toContain("전자칠판 OPS 부팅 불가")
    expect(html).toContain("네, 맞습니다")
    expect(html).toContain("다른 상황")
    expect(html).toContain("⚡ 이 초안으로 즉시 검토·승인 (허가)")
    expect(html).toContain("고객 안내 복사 진행")
    expect(html).toContain("본사 확인 등록")
  })

  it("renders approved status badge and active action buttons when message is approved", () => {
    const html = renderToStaticMarkup(
      <SmartActionCard
        message={mockApprovedMessage}
        isLatest={true}
        onQuickApprove={vi.fn()}
        onCopyCustomerHolding={vi.fn()}
        onRequestHq={vi.fn()}
        onSelectAlternativeIssue={vi.fn()}
        canPromote={true}
        onPromoteKnowledge={vi.fn()}
      />
    )

    expect(html).toContain("담당자 승인 완료 — 외부 전달 및 후속 작업")
    expect(html).toContain("허용됨")
    expect(html).toContain("고객 안내 복사 진행")
    expect(html).toContain("지식 승격")
    expect(html).not.toContain("⚡ 이 초안으로 즉시 검토·승인")
  })
})

describe("QuickPromptChips component", () => {
  it("renders quick troubleshooting preset chips", () => {
    const html = renderToStaticMarkup(<QuickPromptChips onSelectPrompt={vi.fn()} />)

    expect(html).toContain("빠른 질문:")
    expect(html).toContain("OPS 부팅 불가/블랙스크린")
    expect(html).toContain("터치 좌표 틀어짐 보정")
    expect(html).toContain("스마트펜 블루투스 페어링")
    expect(html).toContain("ClassIn 라이선스 갱신/배정")
    expect(html).toContain("고객 대기 문자 표준 초안")
    expect(html).toContain("본사 기술지원(HQ) 인계문")
  })
})
