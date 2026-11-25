import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"

// 저장소에 jsdom 이 없어(node 환경) 서버 렌더 결과로 고정한다. 편집본 유지는 패널이 접혔다 펴질 때(언마운트→마운트)
// 새 인스턴스가 대화별 메모리에서 편집본을 다시 읽는지로 확인한다.
import CommunicationTabs, {
  rememberCommunicationDrafts,
  resetCommunicationDraftMemory,
} from "@/components/admin/cs-chat/components/CommunicationTabs"
import HqPanel from "@/components/admin/cs-chat/panels/HqPanel"
import { escalationInputFromDetail } from "@/components/admin/cs-chat/formatters"
import { primeEscalationResult, resetEscalationMemory } from "@/components/admin/cs-chat/use-escalation"
import { buildEscalationResult } from "@/lib/internal-cs-chat/escalation-routing"
import type { EscalationResult } from "@/lib/internal-cs-chat/escalation-types"
import type { ConversationDetailResponse, InternalCsMessage } from "@/components/admin/cs-chat/types"

function message(id: string, role: InternalCsMessage["role"], content: string, extra: Partial<InternalCsMessage> = {}): InternalCsMessage {
  return {
    id,
    conversation_id: "conv-1",
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
    created_at: "2026-11-01T00:00:00Z",
    ...extra,
  }
}

// 지어낸 값이다.
const USER_TEXT = "T1 카메라 화질 저하. 연락처 010-2345-6789, parent@example.com, 계좌 신한 110-123-456789"

function detail(messages: InternalCsMessage[]): ConversationDetailResponse {
  return {
    conversation: {
      id: "conv-1",
      title: "카메라 화질 문의",
      status: "active",
      priority: "normal",
      assignee_user_id: null,
      assignee_name: "CS 담당자",
      tags: ["area:camera", "evidence:hq_pending"],
      customer_context: { institution: "테스트 기관 A" },
      created_at: "2026-11-01T00:00:00Z",
      updated_at: "2026-11-01T00:00:00Z",
      last_message_at: "2026-11-01T00:00:00Z",
      archive_reason: null,
    },
    messages,
  }
}

// 서버(POST /api/admin/cs-chat/escalation)가 돌려주는 것과 같은 결과. JSON 을 한 번 거쳐 응답 본문과 같은 꼴로 만든다.
// 화면은 담당 표를 직접 import 하지 않으므로(B2) 시험은 이 결과를 탭 메모리에 미리 넣고 그린다.
function serverResult(d: ConversationDetailResponse): EscalationResult {
  return JSON.parse(JSON.stringify(buildEscalationResult(escalationInputFromDetail(d))))
}

function primed(d: ConversationDetailResponse) {
  primeEscalationResult(d, serverResult(d))
  return d
}

const TABS_DETAIL = () =>
  detail([message("u-1", "user", USER_TEXT), message("a-1", "assistant", "다른 기관 선례 20:10 점검을 완료")])

function render(props: Partial<Parameters<typeof CommunicationTabs>[0]> = {}, prime = true) {
  const d = TABS_DETAIL()
  if (prime) primed(d)
  return renderToStaticMarkup(
    <CommunicationTabs
      detail={d}
      isApproved={false}
      onOpenReview={vi.fn()}
      onCopyText={vi.fn()}
      {...props}
    />
  )
}

function hqPanelHtml(onRecordHqReply?: () => void, prime = true) {
  const d = detail([message("u-1", "user", USER_TEXT), message("a-1", "assistant", "다른 기관 선례 20:10")])
  if (prime) primed(d)
  return renderToStaticMarkup(
    <HqPanel
      conversations={[d.conversation]}
      detailError={null}
      expandedId="conv-1"
      expandedDetail={d}
      busyId={null}
      onToggleRow={vi.fn()}
      onCopy={vi.fn()}
      onOpenConversation={vi.fn()}
      onResolve={vi.fn()}
      onRecordHqReply={onRecordHqReply}
    />
  )
}

afterEach(() => {
  resetCommunicationDraftMemory()
  resetEscalationMemory()
})

describe("CommunicationTabs", () => {
  it("never claims a 'safe filter' and keeps the customer copy locked until approval", () => {
    const html = render()
    expect(html).not.toContain("안전 필터")
    expect(html).toContain("외부 전달용 · 승인 후 복사")
    expect(html).toContain("담당자 승인 후 복사 가능합니다")
    expect(html).not.toContain("010-2345-6789")
  })

  it("keeps the customer copy locked while holding-template placeholders remain, even after approval", () => {
    const html = render({ isApproved: true })
    expect(html).toContain("[ ] 자리를 채운 뒤 복사할 수 있습니다")
  })

  it("restores an edited draft after the panel is collapsed and expanded again", () => {
    rememberCommunicationDrafts("conv-1", { customer: "담당자가 고쳐 쓴 고객 안내" })
    const html = render()
    expect(html).toContain("담당자가 고쳐 쓴 고객 안내")
    expect(html).toContain("수정한 내용이 반영되었습니다")
  })

  it("builds the HQ tab without AI-answer facts or raw PII and lets it be copied without approval (same rule as HqPanel)", () => {
    const html = render({ defaultTab: "hq" })
    for (const raw of ["010-2345-6789", "parent@example.com", "110-123-456789", "20:10", "점검을 완료", "已排查"]) {
      expect(html).not.toContain(raw)
    }
    expect(html).toContain("개인정보 3건을 가렸습니다")
    expect(html).toContain("테스트 기관 A")
    expect(html).not.toMatch(/<button[^>]*disabled[^>]*title="초안 복사"/)
    expect(html).toMatch(/<button[^>]*title="초안 복사"/)

    // HqPanel 은 같은 생성기·같은 가림 개수를 보인다.
    const panel = hqPanelHtml()
    expect(panel).toContain("개인정보 3건을 가렸습니다")
  })
})

describe("server-built escalation result (B2)", () => {
  it("draws the badge and HQ tab from the API result: same draft text, domain line and masking count", () => {
    const d = TABS_DETAIL()
    const result = serverResult(d)
    primeEscalationResult(d, result)
    const html = renderToStaticMarkup(
      <CommunicationTabs detail={d} isApproved={false} onOpenReview={vi.fn()} onCopyText={vi.fn()} defaultTab="hq" />
    )
    expect(result.context.domain).toBe("camera")
    expect(html).toContain(result.context.contact.domainLabel)
    expect(html).toContain(result.context.contact.recommendedTag.replace(/&/g, "&amp;"))
    // textarea 기본값이 서버 초안 그대로다(HTML 이스케이프만 다르다).
    const escaped = result.hqDraft.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
    expect(html).toContain(escaped.split("\n")[0])
    expect(html).toContain("개인정보 3건을 가렸습니다")
  })

  it("HqPanel shows the same server draft and badge as the communication tab", () => {
    const html = hqPanelHtml()
    const d = detail([message("u-1", "user", USER_TEXT), message("a-1", "assistant", "다른 기관 선례 20:10")])
    const result = serverResult(d)
    expect(html).toContain(result.context.contact.domainLabel)
    expect(html).toContain("百忙之中打扰您")
    expect(html).toContain("개인정보 3건을 가렸습니다")
  })

  it("shows a loading state and blocks the internal copy until the server answers (no client-side fallback)", () => {
    const tabs = render({ defaultTab: "hq" }, false)
    expect(tabs).toContain("본사 담당 추천과 사내 초안을 만드는 중입니다")
    expect(tabs).toMatch(/<button[^>]*disabled[^>]*title="초안을 만드는 중입니다"/)
    expect(tabs).not.toContain("百忙之中打扰您")

    const panel = hqPanelHtml(undefined, false)
    expect(panel).toContain("본사 담당 추천과 WeCom 초안을 만드는 중입니다")
    expect(panel).toMatch(/<button[^>]*disabled[^>]*>.*?스마트 WeCom 복사/)
    expect(panel).toContain("고정 초안 복사")
  })
})

describe("HqPanel", () => {
  it("shows no raw phone in the expanded draft and the masking notice", () => {
    const html = hqPanelHtml()
    expect(html).not.toContain("010-")
    expect(html).toContain("개인정보 3건을 가렸습니다")
    expect(html).toContain("스마트 WeCom 복사")
  })

  it("shows the HQ reply field only when onRecordHqReply is provided", () => {
    expect(hqPanelHtml()).not.toContain("본사 회신 붙여넣기")
    expect(hqPanelHtml(vi.fn())).toContain("본사 회신 붙여넣기")
  })
})
