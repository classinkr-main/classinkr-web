import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { EventDetailContent } from "@/components/admin/campaigns/EventDetailContent"
import { DEFAULT_EVENT_METRICS, type EventMetrics } from "@/lib/types/event-metrics"
import type { PublicEvent } from "@/lib/types/public-events"

function makeEvent(overrides: Partial<PublicEvent> = {}): PublicEvent {
  return {
    id: "evt-1",
    title: "Classin Meets Incheon",
    description: "인천권 원장님 대상 오프라인 세미나",
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

function makeMetrics(overrides: Partial<EventMetrics> = {}): EventMetrics {
  return { ...DEFAULT_EVENT_METRICS, eventId: "evt-1", updatedAt: "2026-07-19T00:00:00.000Z", ...overrides }
}

describe("EventDetailContent", () => {
  it("renders description preview and lead source label", () => {
    const html = renderToStaticMarkup(
      <EventDetailContent event={makeEvent()} metrics={makeMetrics()} attributedLeadCount={3} duringLeadCount={0} />
    )
    expect(html).toContain("인천권 원장님 대상")
    expect(html).toContain("명시 매칭 3건")
  })

  it("renders a homepage link when the event has a slug", () => {
    const html = renderToStaticMarkup(
      <EventDetailContent event={makeEvent()} metrics={makeMetrics()} attributedLeadCount={0} duringLeadCount={0} />
    )
    expect(html).toContain("/events/classin-meets-incheon")
  })

  it("omits the homepage link when slug is null", () => {
    const html = renderToStaticMarkup(
      <EventDetailContent
        event={makeEvent({ slug: null })}
        metrics={makeMetrics()}
        attributedLeadCount={0}
        duringLeadCount={0}
      />
    )
    expect(html).not.toContain("/events/")
  })

  it("renders related links as anchors when present, and hides the section when empty", () => {
    const withLinks = renderToStaticMarkup(
      <EventDetailContent
        event={makeEvent()}
        metrics={makeMetrics({
          relatedLinks: [{ label: "블로그 후기", url: "https://blog.classin.co.kr/incheon" }],
        })}
        attributedLeadCount={0}
        duringLeadCount={0}
      />
    )
    expect(withLinks).toContain("블로그 후기")
    expect(withLinks).toContain("https://blog.classin.co.kr/incheon")

    const withoutLinks = renderToStaticMarkup(
      <EventDetailContent event={makeEvent()} metrics={makeMetrics()} attributedLeadCount={0} duringLeadCount={0} />
    )
    expect(withoutLinks).not.toContain("관련 자료")
  })
})
