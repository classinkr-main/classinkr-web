import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const insert = vi.fn()
const from = vi.fn(() => ({ insert }))

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => ({ from })),
}))

import { POST } from "@/app/api/track/event/route"

function trackRequest(body: unknown) {
  return new NextRequest("https://classin.kr/api/track/event", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://classin.kr",
      "x-forwarded-for": "track-event-test",
    },
    body: JSON.stringify(body),
  })
}

describe("track event route", () => {
  beforeEach(() => {
    from.mockClear()
    insert.mockReset()
    insert.mockResolvedValue({ error: null })
  })

  it("keeps blog and event CTA attribution while dropping unknown params", async () => {
    const response = await POST(
      trackRequest({
        event: "click_cta",
        page: "/events/sample-event",
        params: {
          button: "event_detail_hero_cta",
          destination: "/contact?source=event&event=sample-event",
          slug: "blog-post-slug",
          event_slug: "sample-event",
          event_id: "event-123",
          ignored: "drop-me",
        },
      })
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, stored: true })
    expect(from).toHaveBeenCalledWith("client_events")
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        event_name: "click_cta",
        params: {
          button: "event_detail_hero_cta",
          destination: "/contact?source=event&event=sample-event",
          slug: "blog-post-slug",
          event_slug: "sample-event",
          event_id: "event-123",
        },
      })
    )
  })
})
