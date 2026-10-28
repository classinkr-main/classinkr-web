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

  it("accepts chatbot events emitted by the floating assistant", async () => {
    const response = await POST(
      trackRequest({
        event: "chatbot_teaser_shown",
        page: "/contact",
        params: {
          path: "/contact",
          ignored: "drop-me",
        },
      })
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, stored: true })
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        event_name: "chatbot_teaser_shown",
        params: {
          path: "/contact",
        },
      })
    )
  })

  it("accepts purchase events emitted by checkout success", async () => {
    const response = await POST(
      trackRequest({
        event: "purchase",
        page: "/checkout/success",
        params: {
          transaction_id: "sw_sub_123",
          event_id: "purchase:sw_sub_123",
          value: 550000,
          currency: "KRW",
          ignored: "drop-me",
        },
      })
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, stored: true })
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        event_name: "purchase",
        params: {
          transaction_id: "sw_sub_123",
          event_id: "purchase:sw_sub_123",
          value: 550000,
          currency: "KRW",
        },
      })
    )
  })

  it("keeps form_type on lead submissions so contact and event signups stay separable", async () => {
    const response = await POST(
      trackRequest({
        event: "submit_demo_request",
        page: "/events/sample-event",
        params: {
          source: "contact_page",
          form_type: "event",
          event_slug: "sample-event",
          lead_id: "lead-1",
          stored: true,
          event_id: "lead:lead-1",
          ignored: "drop-me",
        },
      })
    )

    expect(response.status).toBe(200)
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        event_name: "submit_demo_request",
        params: {
          source: "contact_page",
          form_type: "event",
          event_slug: "sample-event",
          lead_id: "lead-1",
          stored: true,
          event_id: "lead:lead-1",
        },
      })
    )
  })

  it("keeps form_type on newsletter submissions", async () => {
    const response = await POST(
      trackRequest({
        event: "submit_newsletter",
        page: "/resources/academy-system-checklist",
        params: { source: "resource_pdf_download", form_type: "resource", lead_magnet: "academy-system-checklist" },
      })
    )

    expect(response.status).toBe(200)
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { source: "resource_pdf_download", form_type: "resource", lead_magnet: "academy-system-checklist" },
      })
    )
  })

  it("accepts material downloads with the page path", async () => {
    const response = await POST(
      trackRequest({
        event: "download_materials",
        page: "/blog/post",
        params: {
          asset_id: "academy-system-checklist",
          lead_magnet: "academy-system-checklist",
          gate: "email",
          source: "blog_lead_magnet",
          post_slug: "post",
          page_path: "/blog/post",
          url: "https://storage.example.com/signed?token=secret",
        },
      })
    )

    expect(response.status).toBe(200)
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        event_name: "download_materials",
        params: {
          asset_id: "academy-system-checklist",
          lead_magnet: "academy-system-checklist",
          gate: "email",
          source: "blog_lead_magnet",
          post_slug: "post",
          page_path: "/blog/post",
        },
      })
    )
  })

  const funnelCases: Array<[string, Record<string, string>]> = [
    ["contact_start", { form_type: "contact", page_path: "/contact" }],
    ["showroom_start", { form_type: "showroom", page_path: "/showroom" }],
    ["click_to_call", { link_location: "contact_page", page_path: "/contact" }],
    ["click_email", { link_location: "footer", page_path: "/" }],
    ["pricing_view", { pricing_surface: "pricing_simulator_krw", page_path: "/pricing/simulator/krw" }],
  ]

  it.each(funnelCases)("accepts the %s funnel event and drops anything else", async (event, params) => {
    const response = await POST(
      trackRequest({
        event,
        page: params.page_path,
        params: { ...params, phone: "02-6958-8566", href: "mailto:classinkr@classin.com" },
      })
    )

    expect(response.status).toBe(200)
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        event_name: event,
        params,
      })
    )
  })

  it("rejects events outside the allowlist", async () => {
    const response = await POST(trackRequest({ event: "form_start", params: {} }))
    expect(response.status).toBe(400)
    expect(insert).not.toHaveBeenCalled()
  })

  it("accepts internal page exit engagement events", async () => {
    const response = await POST(
      trackRequest({
        event: "page_exit",
        page: "/product/sw",
        params: {
          path: "/product/sw?utm_source=meta",
          title: "Classin SW",
          duration_ms: 12345,
          exit_type: "pagehide",
          ignored: "drop-me",
        },
      })
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, stored: true })
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        event_name: "page_exit",
        params: {
          path: "/product/sw?utm_source=meta",
          title: "Classin SW",
          duration_ms: 12345,
          exit_type: "pagehide",
        },
      })
    )
  })
})
