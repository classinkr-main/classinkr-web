import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import ChatPanel from "@/components/admin/cs-chat/panels/ChatPanel"
import type { ConversationDetailResponse, InternalCsMessage } from "@/components/admin/cs-chat/types"

const createMockMessage = (reviewState: "pending" | "approved" | "changes_requested"): InternalCsMessage => ({
  id: "msg-assistant-1",
  conversation_id: "conv-1",
  role: "assistant",
  content: "ClassIn S-시리즈 전자칠판 무게 안내 초안입니다.",
  corrected_content: reviewState === "approved" ? "S-시리즈 순중량 확정 안내문입니다." : null,
  review_state: reviewState,
  reviewed_by: reviewState === "approved" ? "CS 담당자" : null,
  reviewed_at: reviewState === "approved" ? "2026-10-15T09:00:00Z" : null,
  created_at: "2026-10-15T08:50:00Z",
  model_name: "gemini-2.5-flash",
  model_mode: "fast",
  source_refs: [],
  metadata: {},
  feedback_labels: [],
  review_note: null,
  regression_candidate: false,
  regression_outcome: "not_evaluated",
})

const createMockDetail = (message: InternalCsMessage): ConversationDetailResponse => ({
  conversation: {
    id: "conv-1",
    title: "S-시리즈 전자칠판 문의",
    status: "active",
    priority: "normal",
    assignee_user_id: null,
    assignee_name: "CS 담당자",
    tags: ["area:hardware"],
    customer_context: {},
    created_at: "2026-10-15T08:45:00Z",
    updated_at: "2026-10-15T08:50:00Z",
    last_message_at: "2026-10-15T08:50:00Z",
    archive_reason: null,
  },
  messages: [message],
})

describe("CS Copilot Approval Gate in ChatPanel", () => {
  it("locks communication templates and displays approval warning banner when message is pending", () => {
    const pendingMsg = createMockMessage("pending")
    const detail = createMockDetail(pendingMsg)

    const html = renderToStaticMarkup(
      <ChatPanel
        detail={detail}
        loading={false}
        isPending={false}
        reviewOpen={false}
        setReviewOpen={vi.fn()}
        selectedId="conv-1"
        queueConversations={[]}
        handleSelect={vi.fn()}
        startNewConversation={vi.fn()}
        modelMode="fast"
        setModelMode={vi.fn()}
        requestHqConfirmation={vi.fn()}
        hqPendingActionId={null}
        pendingMessage={pendingMsg}
        latestAssistant={pendingMsg}
        expanded="hq"
        setExpanded={vi.fn()}
        rerunWithPro={vi.fn()}
        copyText={vi.fn()}
        communicationTemplates={[
          { id: "customer_holding", label: "고객 대기 안내 초안", content: "확인 중입니다." },
        ]}
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
      />
    )

    // 승인 필요 배너 확인
    expect(html).toContain("담당자 검토·승인(허가) 후")
    expect(html).toContain("검토·승인 열기")

    // 소통 초안 복사 버튼 잠금(disabled) 확인
    expect(html).toContain("승인 필요")
    expect(html).toContain("disabled")
    expect(html).toContain("담당자 승인 후 복사 가능합니다")
  })

  it("unlocks communication templates when message is approved", () => {
    const approvedMsg = createMockMessage("approved")
    const detail = createMockDetail(approvedMsg)

    const html = renderToStaticMarkup(
      <ChatPanel
        detail={detail}
        loading={false}
        isPending={false}
        reviewOpen={false}
        setReviewOpen={vi.fn()}
        selectedId="conv-1"
        queueConversations={[]}
        handleSelect={vi.fn()}
        startNewConversation={vi.fn()}
        modelMode="fast"
        setModelMode={vi.fn()}
        requestHqConfirmation={vi.fn()}
        hqPendingActionId={null}
        pendingMessage={null}
        latestAssistant={approvedMsg}
        expanded="hq"
        setExpanded={vi.fn()}
        rerunWithPro={vi.fn()}
        copyText={vi.fn()}
        communicationTemplates={[
          { id: "customer_holding", label: "고객 대기 안내 초안", content: "확인 중입니다." },
        ]}
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
      />
    )

    // 승인 완료 뱃지 확인
    expect(html).toContain("담당자 검토·승인 완료")
    expect(html).toContain("허가")

    // 소통 초안 복사 버튼 활성화 확인
    expect(html).toContain("복사")
    expect(html).not.toContain("승인 필요")
  })
})
