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
  // 승인 라우트는 사람이 고친 고객용 최종본(교정본)을 요구한다. 교정본 없는 승인 행은 '재검토 필요'로 보인다(검토 안전-1).
  corrected_content: "OPS 전원 설정과 슬롯 접촉을 먼저 확인해 주세요.",
  feedback_labels: ["human_approved"],
  reviewed_by: "김담당",
  reviewed_at: new Date().toISOString(),
}

describe("SmartActionCard component", () => {
  const baseProps = {
    isLatest: true,
    onOpenReview: vi.fn(),
    onCopyCustomerHolding: vi.fn(),
    onRequestHq: vi.fn(),
  }

  // IC-01: 즉시 승인 버튼은 사라졌고, 대기 초안에는 '검토 열기'만 있다. 승인은 드로어에서만 한다.
  it("대기 초안에는 즉시 승인 대신 '검토 열기'만 있다", () => {
    const html = renderToStaticMarkup(<SmartActionCard message={mockPendingMessage} {...baseProps} />)

    expect(html).toContain("검토 열기")
    expect(html).not.toContain("즉시 검토")
    expect(html).not.toContain("즉시 승인")
    expect(html).not.toContain("승인(허가)")
    expect(html).not.toContain("외부 전달")
    expect(html).not.toContain("⚡")
    expect(html).toContain("고객 안내 복사")
    expect(html).toContain("본사 확인 등록")
  })

  it("증상 추정은 분류 값이 있을 때만 그리고 '확정' 표시가 없다(IC-20)", () => {
    const without = renderToStaticMarkup(<SmartActionCard message={mockPendingMessage} {...baseProps} />)
    expect(without).not.toContain("분류 추정")
    expect(without).not.toContain("파악된 증상")

    const withHint = renderToStaticMarkup(
      <SmartActionCard message={mockPendingMessage} {...baseProps} issueHint="전자칠판·OPS" />
    )
    expect(withHint).toContain("분류 추정")
    expect(withHint).toContain("전자칠판·OPS")
    expect(withHint).not.toContain("조치 확정")
    expect(withHint).not.toContain("다른 상황")
  })

  it("옛 초안(최신이 아닌 대기 초안)에도 '사용 안 함'을 둘 수 있다(IC-13)", () => {
    const html = renderToStaticMarkup(
      <SmartActionCard message={mockPendingMessage} {...baseProps} onReject={vi.fn()} />
    )
    expect(html).toContain("사용 안 함")
  })

  it("승인된 초안은 확정 문구와 활성 복사 버튼을 보이고 지식 승격 버튼은 두지 않는다(IC-27)", () => {
    const html = renderToStaticMarkup(<SmartActionCard message={mockApprovedMessage} {...baseProps} />)

    expect(html).toContain("담당자 승인 완료")
    expect(html).toContain("고객용 최종 답이 확정되었습니다")
    expect(html).not.toContain("허용됨")
    expect(html).not.toContain("지식 승격")
    expect(html).not.toContain("검토 열기")
    expect(html).toContain("고객 안내 복사")
  })
})

describe("SmartActionCard legacy quick-approved rows", () => {
  it("예전 즉시 승인 행은 승인 완료로 보이지 않고 재검토 필요로 보이며 고객 안내 복사를 잠근다(검토 안전-1)", () => {
    const legacy: InternalCsMessage = {
      ...mockApprovedMessage,
      id: "msg-legacy",
      corrected_content: mockPendingMessage.content,
      feedback_labels: ["quick_approved"],
    }
    const html = renderToStaticMarkup(
      <SmartActionCard message={legacy} isLatest onOpenReview={vi.fn()} onCopyCustomerHolding={vi.fn()} onRequestHq={vi.fn()} />
    )
    expect(html).not.toContain("담당자 승인 완료")
    expect(html).toContain("재검토 필요")
    expect(html).toContain("담당자 승인 후 복사 가능")
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
