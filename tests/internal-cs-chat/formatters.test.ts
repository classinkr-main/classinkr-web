import { describe, expect, it } from "vitest"

// 소통 초안 3종의 출력 문자열을 고정한다.
// 답변 카드의 "소통 초안 3종"과 본사 확인 화면(tab=hq)이 같은 함수를 공유하며,
// 담당자가 그대로 복사해 고객·내부·본사로 보내는 문안이라 한 글자만 바뀌어도 회귀다.
// 워크스페이스 분할(2026-07-27) 때 순수 모듈로 떨어져 나오면서 계약을 여기에 못 박는다.
// 2026-11 B1: 본사 틀의 "(개인정보 최소화)"·"개인정보 제거 첨부" 문구가 사실과 달라(가림이 없었고 첨부는 원본)
// 기대값을 고쳤다. 사용자 글·제목은 이제 가림을 거친다.
import {
  assetSensitiveWarnings,
  buildCustomerDraftBase,
  buildCustomerHoldingTemplate,
  buildHqTemplate,
  buildInternalHandoffTemplate,
  escalationInputFromDetail,
  getLastQuestion,
  hasDraftPlaceholder,
  maskAssetFileName,
  prepareInternalDraftCopy,
  sourceHref,
  sourceLink,
  sourceStatus,
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
        "- 발생 시각(KST) / 기관·계정 식별자: 입력 필요 (전화·이메일·계좌·이름은 적지 않음)",
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
        "- 첨부 이미지 2건(원본 — 개인정보 포함 여부 직접 확인) / 내부 근거 링크: 입력 필요",
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

describe("초안 안전화(B1)", () => {
  // 지어낸 값이다.
  const PII_QUESTION = "연락처 010-2345-6789, 환불 계좌 신한 110-123-456789, UID 12345678 확인 부탁"
  const RAW = ["010-2345-6789", "110-123-456789", "12345678"]

  function withMessages(messages: InternalCsMessage[]): ConversationDetailResponse {
    return { ...DETAIL, messages }
  }

  it("masks the user's question in the fixed HQ and handoff templates", () => {
    const detail = withMessages([message("user", PII_QUESTION)])
    for (const draft of [buildHqTemplate(detail), buildInternalHandoffTemplate(detail)]) {
      for (const raw of RAW) expect(draft).not.toContain(raw)
      expect(draft).toContain("[phone]")
    }
  })

  it("feeds only user messages, customer_context and conversation meta to the draft generator", () => {
    const aiAnswer = { ...message("assistant", "다른 기관 선례: 20:10 점검을 완료하였습니다"), id: "a-1" }
    const input = escalationInputFromDetail(withMessages([message("user", "녹화가 안 돼요"), aiAnswer]))
    expect(input.userMessages).toEqual(["녹화가 안 돼요"])
    expect(JSON.stringify(input)).not.toContain("20:10")
    expect(input.priority).toBe("high")
    expect(input.customerContext).toEqual({})
  })

  it("bases the customer draft on the approved correction, masked, and otherwise on the holding template", () => {
    const approved: InternalCsMessage = {
      ...message("assistant", "AI 원문"),
      id: "a-2",
      review_state: "approved",
      corrected_content: "확인 결과를 010-2345-6789 로 안내드리겠습니다.",
    }
    const base = buildCustomerDraftBase(withMessages([message("user", PII_QUESTION), approved]))
    expect(base.source).toBe("approved")
    expect(base.text).not.toContain("010-2345-6789")
    expect(base.redactionCount).toBe(1)
    expect(hasDraftPlaceholder(base.text)).toBe(false)

    const holding = buildCustomerDraftBase(withMessages([message("user", PII_QUESTION)]))
    expect(holding.source).toBe("holding")
    expect(holding.text).toBe(buildCustomerHoldingTemplate(DETAIL))
    expect(hasDraftPlaceholder(holding.text)).toBe(true)
    for (const raw of RAW) expect(holding.text).not.toContain(raw)
  })

  it("detects fill-in placeholders but not redaction tokens", () => {
    expect(hasDraftPlaceholder("현재 확인된 범위: [확인된 내용 입력]")).toBe(true)
    expect(hasDraftPlaceholder("확인 사항: [확인 후 입력]")).toBe(true)
    expect(hasDraftPlaceholder("다음 안내: 담당자 · [회신 예정 시각]")).toBe(true)
    expect(hasDraftPlaceholder("연락처 [phone] 로 안내드립니다.")).toBe(false)
  })

  it("applies the same masking rule to every internal draft copy", () => {
    expect(prepareInternalDraftCopy(PII_QUESTION)).toEqual({
      text: "연락처 [phone], 환불 계좌 신한 [account], UID [uid] 확인 부탁",
      count: 3,
    })
  })

  it("labels internal-only, precedent and past-consultation sources", () => {
    expect(sourceStatus({ id: "doc-1", externalUse: "internal_only" })?.label).toBe("내부 전용")
    expect(sourceStatus({ id: "cases/d-18.md", label: "[선례] 화질 저하", kind: "internal_guide" })?.label).toBe("선례 · 내부 전용")
    expect(sourceStatus({ id: "channel:abc", label: "[상담] 발췌" })?.label).toBe("과거 상담 · 내부 전용")
    expect(sourceStatus({ id: "/docs/a", verificationStatus: "confirmed" })?.label).toBe("확정")
  })

  it("links channel sources to the consultation inbox in a new tab without changing sourceHref", () => {
    expect(sourceHref({ id: "channel:abc" })).toBeNull()
    expect(sourceLink({ id: "channel:abc" })).toEqual({ href: "/admin/channel-talk", newTab: true })
    expect(sourceLink({ id: "/docs/a#x" })).toEqual({ href: "/docs/a", newTab: true })
    expect(sourceLink({ id: "docs/internal.md" })).toBeNull()
  })

  it("reads sensitive-data warnings from the analysis payload and hides PII-looking file names", () => {
    expect(
      assetSensitiveWarnings({ id: "x", analysis_payload: { sensitiveDataWarnings: ["전화번호 010-2345-6789 노출", 3, ""] } })
    ).toEqual(["전화번호 [phone] 노출"])
    expect(assetSensitiveWarnings({ id: "x" })).toEqual([])
    expect(maskAssetFileName("캡처_고객_010-2345-6789.png")).toBe("첨부 이미지.png")
    expect(maskAssetFileName("board-error.jpg")).toBe("board-error.jpg")
    expect(maskAssetFileName(null)).toBe("첨부 이미지")
  })
})
