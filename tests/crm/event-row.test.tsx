import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import CrmEventRow from "@/components/admin/crm/CrmEventRow"
import type { CrmEventRecord } from "@/components/admin/crm/rail/activity-contract"

function makeEvent(overrides: Partial<CrmEventRecord> = {}): CrmEventRecord {
  return {
    id: "evt-1",
    targetType: "neo_account",
    targetId: "acc-1",
    targetLabel: "테스트 학원",
    sourceType: "meeting_minutes",
    sourceId: null,
    occurredAt: "2026-07-10T05:00:00.000Z",
    title: "7월 도입 미팅",
    summary: "하드웨어 견적 요청",
    body: "본문 상세 내용",
    meetingPurpose: null,
    ownerName: "김지사",
    attendees: [],
    decisions: [],
    blockers: [],
    nextActions: [],
    sentiment: "neutral",
    stageSignal: null,
    tags: [],
    recording: null,
    createdAt: "2026-07-10T05:00:00.000Z",
    updatedAt: "2026-07-10T05:00:00.000Z",
    ...overrides,
  }
}

describe("CrmEventRow (static render, collapsed)", () => {
  it("shows source chip, title+summary, target and keeps children hidden", () => {
    const html = renderToStaticMarkup(
      <CrmEventRow event={makeEvent()}>
        <p>펼침 상세 본문</p>
      </CrmEventRow>
    )
    expect(html).toContain("회의록")
    expect(html).toContain("7월 도입 미팅")
    expect(html).toContain("하드웨어 견적 요청")
    expect(html).toContain("테스트 학원")
    // 접힘 기본 — 펼침 children은 렌더되지 않는다
    expect(html).not.toContain("펼침 상세 본문")
    expect(html).toContain('aria-expanded="false"')
  })

  it("surfaces open next-action count as a green pill", () => {
    const html = renderToStaticMarkup(
      <CrmEventRow
        event={makeEvent({
          nextActions: [
            { title: "견적서 발송", ownerName: null, dueAt: null, done: false },
            { title: "데모 일정", ownerName: null, dueAt: null, done: false },
            { title: "완료된 액션", ownerName: null, dueAt: null, done: true },
          ],
        })}
      />
    )
    expect(html).toContain("액션 2")
  })

  it("marks risk rows (risk sentiment or blockers) with a risk pill", () => {
    const riskHtml = renderToStaticMarkup(<CrmEventRow event={makeEvent({ sentiment: "risk" })} />)
    expect(riskHtml).toContain("리스크")

    const blockerHtml = renderToStaticMarkup(<CrmEventRow event={makeEvent({ blockers: ["가격 이견"] })} />)
    expect(blockerHtml).toContain("리스크")

    const plainHtml = renderToStaticMarkup(<CrmEventRow event={makeEvent()} />)
    expect(plainHtml).not.toContain("리스크")
  })

  it("falls back to 미연결 when the event has no target label", () => {
    const html = renderToStaticMarkup(<CrmEventRow event={makeEvent({ targetLabel: null })} />)
    expect(html).toContain("미연결")
  })
})
