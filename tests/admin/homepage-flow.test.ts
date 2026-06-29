import { describe, expect, it } from "vitest"

import { buildHomepageFlowFromRows } from "@/lib/admin-homepage-flow"

type FlowRows = Parameters<typeof buildHomepageFlowFromRows>[0]

describe("homepage flow analytics", () => {
  it("builds visitor flow, dwell, exits, and download rankings", () => {
    const now = new Date("2026-06-24T12:00:00.000Z")
    const rows: FlowRows = [
      {
        event_name: "page_view",
        page: "/",
        params: { path: "/" },
        anonymous_id: "visitor-a",
        created_at: "2026-06-24T01:00:00.000Z",
      },
      {
        event_name: "page_view",
        page: "/product/sw",
        params: { path: "/product/sw?utm_source=meta" },
        anonymous_id: "visitor-a",
        created_at: "2026-06-24T01:04:00.000Z",
      },
      {
        event_name: "page_exit",
        page: "/product/sw",
        params: {
          path: "/product/sw?utm_source=meta",
          duration_ms: 90_000,
          exit_type: "pagehide",
        },
        anonymous_id: "visitor-a",
        created_at: "2026-06-24T01:06:00.000Z",
      },
      {
        event_name: "download_materials",
        page: "resource_pdf_download",
        params: {
          asset_id: "academy-system-checklist",
          source: "resource_pdf_download",
        },
        anonymous_id: "visitor-a",
        created_at: "2026-06-24T01:07:00.000Z",
      },
      {
        event_name: "page_view",
        page: "/",
        params: { path: "/" },
        anonymous_id: "visitor-b",
        created_at: "2026-06-24T02:00:00.000Z",
      },
      {
        event_name: "page_exit",
        page: "/",
        params: { path: "/", duration_ms: 20_000, exit_type: "pagehide" },
        anonymous_id: "visitor-b",
        created_at: "2026-06-24T02:01:00.000Z",
      },
      {
        event_name: "page_exit",
        page: "/",
        params: { path: "/", duration_ms: 10_000, exit_type: "route_change" },
        anonymous_id: "visitor-a",
        created_at: "2026-06-24T01:03:00.000Z",
      },
    ]

    const flow = buildHomepageFlowFromRows(rows, 7, now)

    expect(flow.totals.homeVisitors).toBe(2)
    expect(flow.totals.pageViews).toBe(3)
    expect(flow.totals.downloads).toBe(1)
    expect(flow.totals.exits).toBe(2)
    expect(flow.nextStepsFromHome[0]).toMatchObject({
      path: "/product/sw",
      count: 1,
    })
    expect(flow.nextStepsFromHome.some((step) => step.path === "__exit__")).toBe(true)
    expect(flow.highDwellPages[0]).toMatchObject({
      path: "/product/sw",
      avgDwellSeconds: 90,
    })
    expect(flow.exitPages[0].exits).toBeGreaterThan(0)
    expect(flow.downloads[0]).toMatchObject({
      asset: "academy-system-checklist",
      count: 1,
    })
  })
})
