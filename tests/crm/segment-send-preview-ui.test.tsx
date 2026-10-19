/**
 * 세그먼트 → 메시지 발송 1단계 화면(2026-09-25) — 정적 렌더 + 소스 계약(jsdom 없음).
 *  - 세그먼트 허브: "메시지 발송" 줄(저장 전·표 미적용이면 막고 사유), 미리보기 건수 묶음, 메시지 탭 넘김 링크(id 만).
 *  - 발송 센터: 세그먼트 모드면 실발송 CTA 비활성 + 사유, 테스트 발송 유지. 모드 칸은 넘김이 있을 때만.
 *  - 캠페인 허브·마케팅 허브: ?segment= 일회성 소모 + 코어 fetch 게이트, 허브 발송 핸들러의 세그먼트 거절.
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/admin/crm/customers/segments",
  useSearchParams: () => new URLSearchParams(),
}))

import { SegmentHandoffAction, SegmentSendEntry } from "@/components/admin/crm/segments/SegmentSendPreviewDialog"
import ReachCoverageCard from "@/components/admin/marketing/ReachCoverageCard"
import { SegmentAudienceBreakdown } from "@/components/admin/marketing/SegmentAudienceCard"
import SendInvoiceRail from "@/components/admin/marketing/SendInvoiceRail"
import type { AudienceMode } from "@/components/admin/marketing/send-center-types"
import { classifySegmentAudience, type SegmentAudiencePreview } from "@/lib/crm/segment-audience"

const ID = "11111111-1111-4111-8111-111111111111"

function preview(partial: Partial<SegmentAudiencePreview> = {}): SegmentAudiencePreview {
  const base = classifySegmentAudience(
    [
      { kind: "lead", email: "a@x.com", phone: "010-1234-5678" },
      { kind: "lead", email: "b@x.com", phone: null },
      { kind: "neo_account", email: null, phone: "010-2222-3333" },
    ],
    (email) => (email === "a@x.com" ? "subscriber_active" : "unsubscribed"),
    { totalRows: 3, truncated: false }
  )
  return {
    ...base,
    generatedAt: "2026-09-25T00:00:00.000Z",
    segment: { id: ID, name: "만료 60일", labels: ["만료 60일 이내"], archived: false },
    channels: { email: "resend", smsConfigured: false },
    sources: "ok",
    viewer: { canSend: true },
    ...partial,
  }
}

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8")
}

describe("세그먼트 허브 — 메시지 발송 줄·미리보기·넘김", () => {
  it("저장 세그먼트면 '메시지 발송' 버튼이 열려 있다(발송 없음 안내)", () => {
    const html = renderToStaticMarkup(<SegmentSendEntry segmentId={ID} available onOpen={() => {}} />)
    expect(html).toContain("메시지 발송")
    expect(html).toContain("여기서는 보내지 않습니다")
    expect(html).not.toMatch(/<button[^>]*disabled=""/)
  })

  it("저장 전·표 미적용이면 버튼을 막고 사유를 보인다", () => {
    const unsaved = renderToStaticMarkup(<SegmentSendEntry segmentId={null} available onOpen={() => {}} />)
    expect(unsaved).toMatch(/<button[^>]*disabled=""/)
    expect(unsaved).toContain("저장하면 발송 대상을 미리 보고 메시지 탭으로 넘길 수 있어요.")
    const notReady = renderToStaticMarkup(<SegmentSendEntry segmentId={ID} available={false} onOpen={() => {}} />)
    expect(notReady).toContain("세그먼트 표가 아직 적용되지 않아")
  })

  it("미리보기 건수 묶음 — 발송 가능·제외 사유·문자 정책, 연락처 원문 없음", () => {
    const html = renderToStaticMarkup(<SegmentAudienceBreakdown preview={preview()} />)
    expect(html).toContain("이메일 발송 가능")
    expect(html).toContain("제외 1명(해지 1)")
    expect(html).toContain("이메일 없음 1명(전화만 1)")
    expect(html).toContain("문자 0명 — 문자 수신 동의 정책 결정 대기(전화 보유 2명)")
    expect(html).toContain("로그인 프로필 동의만 있는 사람은 이번에 뺍니다")
    expect(html).not.toContain("@")
    expect(html).not.toContain("010-")
  })

  it("넘길 수 있으면 '메시지 탭에서 열기' — URL 에는 세그먼트 id 만", () => {
    const html = renderToStaticMarkup(<SegmentHandoffAction preview={preview()} />)
    expect(html).toContain("메시지 탭에서 열기")
    expect(html).toContain(`href="/admin/campaigns?tab=email&amp;segment=${ID}"`)
  })

  it("권한 없음·저장 전이면 링크 대신 사유", () => {
    const noRole = renderToStaticMarkup(<SegmentHandoffAction preview={preview({ viewer: { canSend: false } })} />)
    expect(noRole).not.toContain("href=")
    expect(noRole).toContain("SUPER_ADMIN·ADMIN")
    const draft = renderToStaticMarkup(
      <SegmentHandoffAction preview={preview({ segment: { id: null, name: null, labels: [], archived: false } })} />
    )
    expect(draft).toContain("저장하면 메시지 탭으로 넘길 수 있어요")
  })

  it("소스 계약 — 허브는 줄과 대화상자만 배선하고 ?segment= 를 읽지 않는다, 대화상자는 포털·발송 호출 없음", () => {
    const hub = read("components/admin/crm/segments/SegmentHubClient.tsx")
    expect(hub).toContain("<SegmentSendEntry")
    expect(hub).toContain("<SegmentSendPreviewDialog source={sendPreview} onClose={closeSendPreview} />")
    expect(hub).not.toContain('get("segment")')
    const dialog = read("components/admin/crm/segments/SegmentSendPreviewDialog.tsx")
    expect(dialog).toContain("createPortal(")
    expect(dialog).toContain("document.body")
    expect(dialog).not.toContain("/api/admin/email/send")
    expect(dialog).not.toContain("/api/admin/sms/send")
  })
})

function rail(audienceMode: AudienceMode, audienceCount = 3) {
  return renderToStaticMarkup(
    <SendInvoiceRail
      draft={{ subject: "9월 안내", body: "<p>본문</p>", targetTags: [] }}
      audienceMode={audienceMode}
      directEmails={[]}
      audienceCount={audienceCount}
      checks={[]}
      readiness={{ status: "ok", label: "발송 가능", detail: "" }}
      balance={null}
      messagingStatusLoaded
      onSend={async () => {}}
      sendLoading={false}
    />
  )
}

describe("발송 센터 — 세그먼트 모드", () => {
  it("세그먼트 모드: 실발송 CTA 비활성 + 사유, 테스트 발송은 그대로", () => {
    const html = rail("segment")
    expect(html).toContain("세그먼트 실발송은 정책 결정 후 열립니다 — 지금은 대상 미리보기와 테스트 발송만")
    expect(html).toContain("세그먼트 발송은 아직 열리지 않았습니다")
    expect(html).not.toContain("명에게 발송하기")
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>)[\s\S])*세그먼트 발송은 아직 열리지 않았습니다/)
    expect(html).toContain("먼저 나에게 테스트 발송")
    expect(html).toContain("이메일 발송 가능 3명 · 발송 안 함")
  })

  it("태그 모드는 기존 그대로(발송 CTA 문구)", () => {
    const html = rail("tags")
    expect(html).toContain("3명에게 발송하기")
    expect(html).not.toContain("세그먼트 실발송은")
  })

  const reach = (segmentAvailable: boolean) =>
    renderToStaticMarkup(
      <ReachCoverageCard
        audienceMode="tags"
        onAudienceModeChange={() => {}}
        segmentAvailable={segmentAvailable}
        targetTags={[]}
        onTagsChange={() => {}}
        activeCount={0}
        unsubscribedCount={0}
        recipients={[]}
        directInput=""
        onDirectInputChange={() => {}}
        directEmails={[]}
        activeSegment={null}
        savedSegments={[]}
        onApplySegment={() => {}}
      />
    )

  it("받는 사람 모드 칸 — 고객 세그먼트(CRM)는 넘김이 있을 때만", () => {
    expect(reach(false)).not.toContain("고객 세그먼트(CRM)")
    expect(reach(true)).toContain("고객 세그먼트(CRM)")
  })

  it("소스 계약 — 발송 센터는 모드를 허브에 넘기고 세그먼트 모드에서 미리보기 카드·정적 변수 예시를 쓴다", () => {
    const center = read("components/admin/marketing/SendCenter.tsx")
    expect(center).toContain("onSend(data, { audienceMode })")
    expect(center).toContain("<SegmentAudienceCard")
    expect(center).toContain("const sampleRecipients = segmentMode ? NO_RECIPIENTS : recipients")
    const hub = read("components/admin/marketing/MarketingHub.tsx")
    const guard = hub.indexOf('if (context?.audienceMode === "segment") {')
    const post = hub.indexOf('adminFetch("/api/admin/email/send"')
    expect(guard).toBeGreaterThan(0)
    expect(guard).toBeLessThan(post)
    expect(hub).toContain("showToast(\"error\", SEGMENT_SEND_PREVIEW_ONLY_TOAST)")
  })

  it("소스 계약 — 캠페인 허브는 ?segment= 를 한 번 소모하고 코어 fetch 를 게이트한다", () => {
    const campaigns = read("components/admin/campaigns/CampaignsHubClient.tsx")
    expect(campaigns).toContain("const pendingSegmentHandoff = parseSegmentHandoff(window.location.search) !== null")
    expect(campaigns).toContain("if (!needsCore || pendingMessagePrefill || pendingSegmentHandoff) {")
    expect(campaigns).toContain("stripSegmentHandoffParams(window.location.search)")
    expect(campaigns).toContain("segmentHandoff={segmentHandoff}")
    const tab = read("components/admin/campaigns/tabs/EmailTab.tsx")
    expect(tab).toContain("segmentHandoff={segmentHandoff}")
    expect(tab).toContain("onSegmentHandoffConsumed={onSegmentHandoffConsumed}")
  })
})
