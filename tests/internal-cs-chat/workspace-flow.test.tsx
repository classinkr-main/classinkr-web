import type { ComponentProps } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import ChatPanel from "@/components/admin/cs-chat/panels/ChatPanel"
import {
  describeMessageSpeaker,
  lastContextBoundaryIndex,
  readContextCard,
  turnsSinceBoundary,
} from "@/components/admin/cs-chat/ops-desk"
import type { ConversationDetailResponse, InternalCsMessage } from "@/components/admin/cs-chat/types"

function message(overrides: Partial<InternalCsMessage> & Pick<InternalCsMessage, "id" | "role">): InternalCsMessage {
  return {
    conversation_id: "conv-1",
    content: `${overrides.id} 본문`,
    model_name: null,
    model_mode: null,
    source_refs: [],
    metadata: {},
    review_state: overrides.role === "assistant" ? "pending" : "not_required",
    corrected_content: null,
    review_note: null,
    feedback_labels: [],
    regression_candidate: false,
    regression_outcome: "not_evaluated",
    reviewed_by: null,
    reviewed_at: null,
    created_at: "2026-10-15T08:50:00Z",
    ...overrides,
  }
}

function detailOf(
  messages: InternalCsMessage[],
  conversation: Partial<ConversationDetailResponse["conversation"]> = {}
): ConversationDetailResponse {
  return {
    conversation: {
      id: "conv-1",
      title: "카메라 문의",
      status: "active",
      priority: "normal",
      assignee_user_id: null,
      assignee_name: null,
      tags: [],
      customer_context: {},
      created_at: "2026-10-15T08:45:00Z",
      updated_at: "2026-10-15T08:50:00Z",
      last_message_at: "2026-10-15T08:50:00Z",
      archive_reason: null,
      ...conversation,
    },
    messages,
  }
}

function panel(detail: ConversationDetailResponse | null, props: Partial<ComponentProps<typeof ChatPanel>> = {}) {
  const messages = detail?.messages ?? []
  const pending = [...messages].reverse().find((m) => m.role === "assistant" && m.review_state === "pending") ?? null
  const latest = [...messages].reverse().find((m) => m.role === "assistant") ?? null
  return renderToStaticMarkup(
    <ChatPanel
      detail={detail}
      loading={false}
      isPending={false}
      reviewOpen={false}
      setReviewOpen={vi.fn()}
      selectedId={detail?.conversation.id ?? null}
      queueConversations={[]}
      handleSelect={vi.fn()}
      startNewConversation={vi.fn()}
      modelMode="auto"
      setModelMode={vi.fn()}
      requestHqConfirmation={vi.fn()}
      hqPendingActionId={null}
      pendingMessage={pending}
      latestAssistant={latest}
      expanded={null}
      setExpanded={vi.fn()}
      rerunWithPro={vi.fn()}
      copyText={vi.fn()}
      communicationTemplates={[]}
      regressionCandidate={false}
      setRegressionCandidate={vi.fn()}
      promotingMessageId={null}
      promotionResults={{}}
      promoteMessageToKnowledge={vi.fn()}
      assets={[]}
      selectedAsset={null}
      setSelectedAssetId={vi.fn()}
      assetReviewingId={null}
      approveSelectedAsset={vi.fn()}
      submitQuestion={vi.fn()}
      fileInputRef={{ current: null }}
      handleAssetFiles={vi.fn()}
      pendingFiles={[]}
      removePendingFile={vi.fn()}
      uploadingAssets={false}
      uploadProgress={{ current: 0, total: 0 }}
      assetError={null}
      composer=""
      setComposer={vi.fn()}
      {...props}
    />
  )
}

describe("ops-desk 스레드 표시 도우미", () => {
  it("메시지 머리를 주인별로 나눈다(IC-10)", () => {
    expect(describeMessageSpeaker(message({ id: "u", role: "user" })).label).toBe("담당자 질문")
    const customer = describeMessageSpeaker(
      message({ id: "u2", role: "user", metadata: { bridgeEventId: "e1", bridgeSourceSystem: "channel-talk" } })
    )
    expect(customer).toEqual({ kind: "customer", label: "고객 · 채널톡" })
    expect(describeMessageSpeaker(message({ id: "a", role: "assistant" })).label).toBe("AI 초안")
    expect(
      describeMessageSpeaker(message({ id: "a2", role: "assistant", metadata: { bridgeEventId: "e2" } })).kind
    ).toBe("external_ai")
    expect(describeMessageSpeaker(message({ id: "n", role: "internal_note", metadata: { bridgeEventId: "e3" } })).label).toBe("외부 AI 관찰")
    expect(describeMessageSpeaker(message({ id: "h", role: "internal_note", metadata: { kind: "hq_reply" } })).label).toBe("본사 회신(참고)")
  })

  it("맥락 경계 뒤의 질문 수를 센다(IC-25)", () => {
    const reset = message({ id: "r", role: "system", metadata: { kind: "copilot_context_reset" } })
    const thread = [message({ id: "u1", role: "user" }), message({ id: "a1", role: "assistant" }), reset]
    expect(lastContextBoundaryIndex(thread)).toBe(2)
    expect(turnsSinceBoundary(thread)).toBe(0)
    expect(turnsSinceBoundary([...thread, message({ id: "u2", role: "user" })])).toBe(1)
    expect(turnsSinceBoundary([message({ id: "u1", role: "user" })])).toBe(1)
  })

  it("customer_context 를 가려서 카드 칸으로 줄이고 사이트 밖 주소는 버린다", () => {
    const card = readContextCard({
      source: "public_chatbot",
      chatbotSummary: "문의 요약 연락처 010-1234-5678",
      lastQuestion: "상담원 연결",
      institution: "예시학원",
      chatbotSources: ["/docs/troubleshooting/camera#a", "https://evil.example/x", "//evil.example", "docs/relative"],
      page: "/docs/start",
    })
    expect(card?.source).toBe("공개 챗봇")
    expect(card?.summary).not.toContain("010-1234-5678")
    expect(card?.documents).toEqual(["/docs/troubleshooting/camera", "/docs/start"])
    expect(readContextCard({})).toBeNull()
    expect(readContextCard(null)).toBeNull()
  })
})

describe("ChatPanel 흐름(IC-10·IC-15·IC-25·IC-27)", () => {
  it("customer_context 가 있으면 상담 맥락 카드를 맨 위에 보이고, 없으면 그리지 않는다", () => {
    const withContext = detailOf([message({ id: "u1", role: "user" })], {
      customer_context: { source: "public_chatbot", lastQuestion: "상담원 연결", institution: "예시학원" },
    })
    const html = panel(withContext)
    expect(html).toContain('data-testid="conversation-context-card"')
    expect(html).toContain("Inbox에서 열기")
    expect(html).toContain("공개 챗봇")
    expect(panel(detailOf([message({ id: "u1", role: "user" })]))).not.toContain("conversation-context-card")
  })

  it("internal_note 에는 승인 카드·검토 배지를 붙이지 않고 '고객에게 보내지 않음'을 적는다", () => {
    const note = message({ id: "n1", role: "internal_note", metadata: { bridgeEventId: "e1" } })
    const html = panel(detailOf([note]))
    expect(html).toContain("외부 AI 관찰")
    expect(html).toContain("고객에게 보내지 않음")
    expect(html).not.toContain("본사 확인 등록")
    expect(html).not.toContain("고객 안내 복사")
    expect(html).not.toContain("검토 전 초안")
  })

  it("보관된 대화에는 입력창 대신 '다시 열고 묻기'가 있다", () => {
    const html = panel(detailOf([message({ id: "u1", role: "user" })], { status: "archived" }), {
      onReopenConversation: vi.fn(),
    })
    expect(html).toContain("다시 열고 묻기")
    expect(html).toContain('data-testid="archived-composer"')
    expect(html).not.toContain("내부 CS 질문 입력")
  })

  it("답을 받는 중에는 보낸 질문 말풍선과 role=status 표시가 보인다", () => {
    const html = panel(detailOf([]), {
      generating: { gen: 1, question: "카메라가 안 켜져요", startedAt: Date.now(), kind: "ask" },
    })
    expect(html).toContain('data-testid="pending-question"')
    expect(html).toContain("카메라가 안 켜져요")
    expect(html).toMatch(/role="status"[^>]*data-testid="generating-status"/)
    expect(html).toContain("AI가 초안을 쓰는 중입니다")
    expect(html).not.toContain("내부 CS 질문을 시작하세요")
  })

  it("맥락 비우기는 경계 뒤 질문이 1개 이상일 때만 보이고, 되돌리기 띠는 role=status 안에 뜬다", () => {
    const none = panel(detailOf([]), { onClearContext: vi.fn() })
    expect(none).not.toContain("코파일럿 맥락 비우기")
    const withTurn = panel(detailOf([message({ id: "u1", role: "user" })]), { onClearContext: vi.fn() })
    expect(withTurn).toContain('aria-label="코파일럿 맥락 비우기"')
    const reset = message({ id: "r", role: "system", metadata: { kind: "copilot_context_reset" } })
    const afterReset = panel(detailOf([message({ id: "u1", role: "user" }), reset]), { onClearContext: vi.fn() })
    expect(afterReset).not.toContain("코파일럿 맥락 비우기")
    expect(afterReset).toContain('role="separator"')
    expect(afterReset).toContain("여기부터 새 맥락")

    const band = panel(detailOf([message({ id: "u1", role: "user" })]), {
      band: { kind: "new_case", prevId: "conv-0", prevTitle: "이전 상담 제목" },
      onUndoBand: vi.fn(),
    })
    expect(band).toContain('data-testid="undo-band"')
    expect(band).toContain("새 상담을 시작했어요")
    expect(band).toContain("이전 상담 제목")
    expect(band).toContain("돌아가기")
    const contextBand = panel(detailOf([message({ id: "u1", role: "user" })]), {
      band: { kind: "context_reset", pendingDrafts: 2 },
      onUndoBand: vi.fn(),
      onRejectPending: vi.fn(),
    })
    expect(contextBand).toContain("코파일럿 맥락을 비웠어요")
    expect(contextBand).toContain("이전 초안 2개를 사용 안 함으로 정리")
  })

  it("빠른 질문 칩은 빈 대화에서만 보이고 대화가 있으면 숨긴다", () => {
    expect(panel(detailOf([]))).toContain("빠른 질문:")
    expect(panel(detailOf([message({ id: "u1", role: "user" })]))).not.toContain("빠른 질문:")
  })

  it("새 상담 버튼은 aria-label 이 있고 툴바에 새로고침·운영 도구가 합쳐져 있다", () => {
    const html = panel(detailOf([]), { onRefresh: vi.fn(), onOpenTools: vi.fn() })
    expect(html).toContain('aria-label="새 상담 시작"')
    expect(html).toContain('aria-label="목록 새로고침"')
    expect(html).toContain('aria-label="운영 도구 열기"')
  })
})
