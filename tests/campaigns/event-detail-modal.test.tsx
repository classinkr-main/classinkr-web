import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { EventDetailModal } from "@/components/admin/campaigns/EventDetailModal"
import { DEFAULT_EVENT_METRICS } from "@/lib/types/event-metrics"
import type { PublicEvent } from "@/lib/types/public-events"

function makeEvent(overrides: Partial<PublicEvent> = {}): PublicEvent {
  return {
    id: "evt-1",
    title: "Classin Meets Incheon",
    description: null,
    category: "오프라인 행사",
    tag: null,
    startsAt: "2026-07-18T00:00:00.000Z",
    endsAt: null,
    sessionDates: null,
    location: "인천",
    ctaLabel: "신청하기",
    ctaHref: null,
    imagePath: null,
    imageUrl: null,
    highlight: false,
    statusOverride: null,
    status: "진행 중",
    publicationStatus: "published",
    slug: "classin-meets-incheon",
    contentMarkdown: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  }
}

describe("EventDetailModal", () => {
  it("renders the header, a prominent homepage link and the edit button", () => {
    const html = renderToStaticMarkup(
      <EventDetailModal
        event={makeEvent()}
        metrics={{ ...DEFAULT_EVENT_METRICS, eventId: "evt-1", updatedAt: "" }}
        attributedLeadCount={0}
        duringLeadCount={0}
        onClose={() => {}}
        onEdit={() => {}}
      />
    )
    expect(html).toContain("Classin Meets Incheon")
    expect(html).toContain("홈페이지에서 보기")
    expect(html).toContain("/events/classin-meets-incheon")
    expect(html).toContain("성과 입력")
  })

  it("omits the homepage button when the event has no slug", () => {
    const html = renderToStaticMarkup(
      <EventDetailModal
        event={makeEvent({ slug: null })}
        metrics={{ ...DEFAULT_EVENT_METRICS, eventId: "evt-1", updatedAt: "" }}
        attributedLeadCount={0}
        duringLeadCount={0}
        onClose={() => {}}
        onEdit={() => {}}
      />
    )
    expect(html).not.toContain("홈페이지에서 보기")
  })
})
