import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { EventCardHeader } from "@/components/admin/campaigns/EventCardHeader"
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

describe("EventCardHeader", () => {
  it("renders status, category, title, date range and location", () => {
    const html = renderToStaticMarkup(<EventCardHeader event={makeEvent()} />)
    expect(html).toContain("진행 중")
    expect(html).toContain("오프라인 행사")
    expect(html).toContain("Classin Meets Incheon")
    expect(html).toContain("7/18")
    expect(html).toContain("인천")
  })

  it("renders a tag pill only when tag is set", () => {
    const withoutTag = renderToStaticMarkup(<EventCardHeader event={makeEvent()} />)
    expect(withoutTag).not.toContain("FEF3EE")
    const withTag = renderToStaticMarkup(<EventCardHeader event={makeEvent({ tag: "얼리버드" })} />)
    expect(withTag).toContain("얼리버드")
  })

  it("renders the actions slot when provided", () => {
    const html = renderToStaticMarkup(
      <EventCardHeader event={makeEvent()} actions={<button>성과 입력</button>} />
    )
    expect(html).toContain("성과 입력")
  })
})
