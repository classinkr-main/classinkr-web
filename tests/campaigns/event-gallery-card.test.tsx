import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { EventGalleryCard } from "@/components/admin/campaigns/EventGalleryCard"
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
    imageUrl: "https://xyzco.supabase.co/storage/v1/object/public/event-images/incheon.jpg",
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

describe("EventGalleryCard", () => {
  it("renders title, status and date/category — no funnel numbers", () => {
    const html = renderToStaticMarkup(<EventGalleryCard event={makeEvent()} onOpen={() => {}} />)
    expect(html).toContain("Classin Meets Incheon")
    expect(html).toContain("진행 중")
    expect(html).toContain("7/18")
    expect(html).toContain("오프라인 행사")
  })

  it("renders a placeholder cover when imageUrl is null", () => {
    const html = renderToStaticMarkup(<EventGalleryCard event={makeEvent({ imageUrl: null })} onOpen={() => {}} />)
    expect(html).not.toContain("<img")
  })

  it("is a clickable button", () => {
    const html = renderToStaticMarkup(<EventGalleryCard event={makeEvent()} onOpen={() => {}} />)
    expect(html).toContain('type="button"')
  })
})
