import { describe, expect, it } from "vitest"
import { filterEvents } from "@/components/admin/campaigns/filter-events"
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

const events = [
  makeEvent({ id: "1", title: "Classin Meets Incheon", status: "진행 중", category: "오프라인 행사" }),
  makeEvent({ id: "2", title: "Classin Meets Gwang-ju", status: "예정", category: "오프라인 행사" }),
  makeEvent({ id: "3", title: "여름 웨비나: AI 시대 학원", status: "마감", category: "웨비나" }),
]

describe("filterEvents", () => {
  it("returns all events when search/status/category are all default", () => {
    expect(filterEvents(events, { search: "", status: "all", category: "all" })).toHaveLength(3)
  })

  it("matches title case-insensitively as a substring", () => {
    const result = filterEvents(events, { search: "gwang", status: "all", category: "all" })
    expect(result.map((e) => e.id)).toEqual(["2"])
  })

  it("filters by status", () => {
    const result = filterEvents(events, { search: "", status: "마감", category: "all" })
    expect(result.map((e) => e.id)).toEqual(["3"])
  })

  it("filters by category", () => {
    const result = filterEvents(events, { search: "", status: "all", category: "웨비나" })
    expect(result.map((e) => e.id)).toEqual(["3"])
  })

  it("combines search, status and category with AND", () => {
    const result = filterEvents(events, { search: "classin", status: "예정", category: "오프라인 행사" })
    expect(result.map((e) => e.id)).toEqual(["2"])
  })
})
