import { describe, expect, it } from "vitest"

// 소통 초안 3종의 출력 문자열을 고정한다.
// 답변 카드의 "소통 초안 3종"과 본사 확인 화면(tab=hq)이 같은 함수를 공유하며,
// 담당자가 그대로 복사해 고객·내부·본사로 보내는 문안이라 한 글자만 바뀌어도 회귀다.
// 워크스페이스 분할(2026-07-27) 때 순수 모듈로 떨어져 나오면서 계약을 여기에 못 박는다.
import {
  buildCustomerHoldingTemplate,
  buildHqTemplate,
  buildInternalHandoffTemplate,
  getLastQuestion,
} from "@/components/admin/cs-chat/formatters"
import type {
  ConversationDetailResponse,
  InternalCsConversation,
  InternalCsMessage,
} from "@/components/admin/cs-chat/types"

const CONVERSATION: InternalCsConversation = {
  id: "11111111-2222-3333-4444-555555555555",
  title: "환불 정책 확인",
  status: "waiting_review",
  priority: "high",
  assignee_user_id: null,
  assignee_name: "CS 담당자",
  tags: ["area:billing", "intent:hq_confirmation"],
  customer_context: {},
  last_message_at: "2026-07-27T00:00:00.000Z",
  created_at: "2026-07-25T00:00:00.000Z",
  updated_at: "2026-07-26T00:00:00.000Z",
  archive_reason: null,
}

function message(role: InternalCsMessage["role"], content: string): InternalCsMessage {
  return {
    id: `${role}-${content.slice(0, 4)}`,
    conversation_id: CONVERSATION.id,
    role,
    content,
    model_name: null,
    model_mode: null,
    source_refs: [],
    metadata: {},
    review_state: "not_required",
    corrected_content: null,
    review_note: null,
    feedback_labels: [],
    regression_candidate: false,
    regression_outcome: "not_evaluated",
    reviewed_by: null,
    reviewed_at: null,
    created_at: "2026-07-27T00:00:00.000Z",
  }
}

const DETAIL: ConversationDetailResponse = {
  conversation: CONVERSATION,
  messages: [
    message("user", "첫 질문"),
    message("assistant", "초안"),
    message("user", "7일 이내 환불이 되나요?"),
  ],
  assets: [{ id: "asset-1" }, { id: "asset-2" }],
  integrationEvents: [],
}

describe("소통 초안 3종", () => {
  it("returns an empty string when there is no conversation detail", () => {
    expect(buildCustomerHoldingTemplate(null)).toBe("")
    expect(buildInternalHandoffTemplate(null)).toBe("")
    expect(buildHqTemplate(null)).toBe("")
  })

  it("takes the last user message as the reported symptom", () => {
    expect(getLastQuestion(DETAIL)).toBe("7일 이내 환불이 되나요?")
  })

  it("keeps the customer holding note free of any confirmed price or refund promise", () => {
    expect(buildCustomerHoldingTemplate(DETAIL)).toBe(
      [
        "안녕하세요.",
        "현재 확인된 범위: [확인된 내용 입력]",
        "추가 확인 중인 항목: [모델·세대·버전·계약 등 입력]",
        "확정 전 안내하지 않는 항목: [가격·환불·보증·원인 등 해당 시 입력]",
        "다음 안내: CS 담당자 · [회신 예정 시각]",
      ].join("\n")
    )
  })

  it("keeps the internal handoff note in its fixed field order", () => {
    expect(buildInternalHandoffTemplate(DETAIL)).toBe(
      [
        "[CS-11111111-2222-3333-4444-555555555555] 환불 정책 확인",
        "우선순위 / 상태: high / waiting_review",
        "담당자: CS 담당자",
        "분류 태그: area:billing, intent:hq_confirmation",
        "제품·모델·세대·앱 버전: 확인 필요",
        "문의 / 현상: 7일 이내 환불이 되나요?",
        "영향·긴급도: 입력 필요",
        "확인한 내용 / 시도 결과: 입력 필요",
        "고객에게 안내한 내용: 입력 필요",
        "미확정·충돌·리스크: 입력 필요",
        "다음 액션 / 담당자 / 기한: 입력 필요",
        "관련 근거·첨부: 이미지 2건 / 근거 링크 입력 필요",
      ].join("\n")
    )
  })

  it("keeps the HQ request in the fixed six-section format", () => {
    expect(buildHqTemplate(DETAIL)).toBe(
      [
        "[KR-CS][HIGH][billing][11111111-2222-3333-4444-555555555555] 환불 정책 확인",
        "",
        "1. Case",
        "- 내부 케이스 ID: 11111111-2222-3333-4444-555555555555",
        "- 한국 담당자: CS 담당자",
        "- 발생 시각(KST) / 기관·계정 식별자: 입력 필요 (개인정보 최소화)",
        "- 제품·모델·세대·앱 버전: 확인 필요",
        "",
        "2. Impact",
        "- 영향 사용자·수업·기기 수: 확인 필요",
        "- 수업 차단 여부 / 고객 요구 시한: 확인 필요",
        "",
        "3. Question / Reproduction",
        "- 현상: 7일 이내 환불이 되나요?",
        "- 재현 절차 / Expected / Actual / Frequency: 입력 필요",
        "",
        "4. Korea checks",
        "- 이미 확인한 항목 / 시도한 조치 / 임시 우회 결과: 입력 필요",
        "",
        "5. Evidence",
        "- 개인정보 제거 첨부 2건 / 내부 근거 링크: 입력 필요",
        "",
        "6. Request to HQ",
        "- 답변이 필요한 질문 1~3개: 입력 필요",
        "- 원인 / 조치 / 버그 여부 / ETA 중 필요한 항목: 입력 필요",
        "- Reply needed by (KST): 입력 필요",
        "- Please include applicable market/models, generation, effective date, and source document/version.",
      ].join("\n")
    )
  })

  it("falls back to placeholders when assignee, tags, questions and assets are missing", () => {
    const bare: ConversationDetailResponse = {
      conversation: { ...CONVERSATION, assignee_name: null, tags: [] },
      messages: [],
    }
    expect(buildCustomerHoldingTemplate(bare)).toContain("다음 안내: 담당자 지정 필요 · [회신 예정 시각]")
    expect(buildInternalHandoffTemplate(bare)).toContain("분류 태그: 분류 필요")
    expect(buildInternalHandoffTemplate(bare)).toContain("문의 / 현상: 입력 필요")
    expect(buildInternalHandoffTemplate(bare)).toContain("관련 근거·첨부: 이미지 0건 / 근거 링크 입력 필요")
    // area: 태그가 없으면 제목 줄의 분류 자리는 리터럴 AREA로 남는다.
    expect(buildHqTemplate(bare)).toContain("[KR-CS][HIGH][AREA]")
    expect(buildHqTemplate(bare)).toContain("- 현상: 질문과 현상을 입력해 주세요.")
  })
})
