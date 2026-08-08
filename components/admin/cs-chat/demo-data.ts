// 개발 전용 폴백 데이터.
// 진입 조건은 loadConversations()의 catch 안 `process.env.NODE_ENV === "development"` 하나뿐이다 —
// 프로덕션에서는 demoMode가 켜지지 않는다.
//
// 프로덕션 번들 잔존 — 이 모듈을 참조하는 워크스페이스 분기는 조건에
// `process.env.NODE_ENV === "development"`를 함께 달아 두어(InternalCsChatWorkspace.tsx demoMode 주석)
// 번들러가 분기째 접는다. 그 결과 DEMO_MESSAGES·DEMO_DETAIL은 프로덕션 청크에서 사라졌다.
// DEMO_CONVERSATION 객체 하나(~0.4KB)만 남는데, 모듈 최상위의 new Date() 때문에 미니파이어가
// 선언을 순수하다고 보지 못해서다. /*#__PURE__*/ 주석으로 지워지는지 실측했으나 효과가 없었다
// (Next 16 SWC 미니파이어). 남은 값을 마저 빼려면 상수를 팩토리 함수로 바꿔야 하는데,
// 0.4KB 때문에 개발 폴백 호출부 10곳을 건드릴 값어치가 없다고 판단했다.

import type {
  ConversationDetailResponse,
  InternalCsConversation,
  InternalCsMessage,
} from "./types"

export const DEMO_CONVERSATION: InternalCsConversation = {
  id: "preview-internal-cs",
  title: "환불 정책 확인",
  status: "waiting_review",
  priority: "high",
  assignee_user_id: null,
  assignee_name: "CS 담당자",
  tags: ["area:billing", "intent:hq_confirmation", "evidence:hq_pending"],
  customer_context: {},
  last_message_at: new Date().toISOString(),
  // 미리보기 대화는 이틀 전 등록 · 하루 전 마지막 갱신으로 둬서 본사 확인 화면의
  // 등록 시각/대기 경과 두 칼럼이 서로 다른 값을 보여준다.
  created_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
  updated_at: new Date(Date.now() - 86_400_000).toISOString(),
  archive_reason: null,
}

export const DEMO_MESSAGES: InternalCsMessage[] = [
  {
    id: "preview-user-message",
    conversation_id: DEMO_CONVERSATION.id,
    role: "user",
    content: "결제 후 수업을 한 번도 듣지 않았고, 7일 이내 환불을 요청했습니다. 환불 가능 여부와 본사 확인이 필요한지 검토하고 답변 초안을 작성해 주세요.",
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
    created_at: new Date().toISOString(),
  },
  {
    id: "preview-assistant-message",
    conversation_id: DEMO_CONVERSATION.id,
    role: "assistant",
    content: "검토 전 내부 초안\n\n환불 조건은 결제·계약 방식에 따라 달라질 수 있어 현재 정보만으로 확정할 수 없습니다. 고객의 계약서 또는 주문 조건을 먼저 확인하고, 프로모션 코드가 적용된 건이라면 본사 확인 후 안내하는 것이 안전합니다.\n\n고객에게는 ‘계약 조건과 결제 내역을 확인한 뒤 담당자가 환불 가능 여부와 처리 일정을 안내하겠다’고 우선 답변해 주세요.",
    model_name: "gemini-3.1-pro-preview",
    model_mode: "deep",
    source_refs: [
      { id: "/docs/getting-started/pre-adoption-checklist", label: "도입 전 확인 기준", kind: "public_doc" },
      { id: "docs/active/classin-operating-canon-2026-07-02.md", label: "Classin 운영 정본", kind: "internal_guide" },
      {
        id: "docs/active/internal-cs-content-arrangement-2026-07-15.md#가격계약환불보증",
        label: "가격·계약·환불의 한국 적용 범위",
        kind: "curated_knowledge",
        verificationStatus: "hq_confirmation_required",
        externalUse: "confirmation_required",
      },
    ],
    metadata: { origin: "model", fallbackUsed: false },
    review_state: "pending",
    corrected_content: null,
    review_note: null,
    feedback_labels: [],
    regression_candidate: false,
    regression_outcome: "not_evaluated",
    reviewed_by: null,
    reviewed_at: null,
    created_at: new Date().toISOString(),
  },
]

export const DEMO_DETAIL: ConversationDetailResponse = {
  conversation: DEMO_CONVERSATION,
  messages: DEMO_MESSAGES,
  assets: [],
  integrationEvents: [],
}
