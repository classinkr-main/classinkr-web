import { describe, expect, it } from "vitest"

import { EMPTY_METRIC_ROW, cloneLeadMagnet, type LeadMagnetMetricsResponse } from "@/components/admin/lead-magnets/model"
import { blogViewsFromTop, buildRecommendations, magnetPostOverlap } from "@/components/admin/lead-magnets/recommendations"
import type { LeadMagnetQualityIssue } from "@/lib/lead-magnet-quality"
import { leadMagnets } from "@/lib/lead-magnets"

const [a, b, c] = leadMagnets.map(cloneLeadMagnet)

function metrics(rows: Array<{ slug: string; impressions?: number; views?: number; submissions?: number; leads?: number; convertedLeads?: number }>): LeadMagnetMetricsResponse {
  const full = rows.map((row) => ({ ...EMPTY_METRIC_ROW, ...row }))
  const sum = (key: "impressions" | "views" | "submissions" | "leads" | "convertedLeads") => full.reduce((total, row) => total + row[key], 0)
  return {
    days: 30,
    since: "",
    generatedAt: "",
    truncated: false,
    totals: {
      impressions: sum("impressions"),
      views: sum("views"),
      submissions: sum("submissions"),
      downloads: 0,
      ctaClicks: 0,
      leads: sum("leads"),
      convertedLeads: sum("convertedLeads"),
      conversionRate: 0,
      leadConversionRate: 0,
    },
    byLeadMagnet: full,
    recentEvents: [],
  }
}

const noQuality = new Map<string, LeadMagnetQualityIssue[]>()

describe("buildRecommendations", () => {
  it("flags low submit rate, zero exposure and weak lead conversion against the period average", () => {
    const recs = buildRecommendations({
      magnets: [{ ...a, published: true }, { ...b, published: true }, { ...c, published: true }],
      metrics: metrics([
        { slug: a.slug, impressions: 500, views: 400, submissions: 48, leads: 40, convertedLeads: 8 },
        { slug: b.slug, impressions: 300, views: 200, submissions: 4, leads: 20, convertedLeads: 0 },
      ]),
      qualityBySlug: noQuality,
      blogPosts: null,
      blogViews: null,
    })
    expect(recs.map((rec) => rec.id)).toEqual([`cta:${b.slug}`, `exposure:${c.slug}`, `lead:${b.slug}`])
    expect(recs[0].target).toEqual({ kind: "panel", tab: "edit", surface: "blog", focus: "ctaCopy.title" })
  })

  it("stays quiet below the minimum volume and without metrics", () => {
    const quiet = buildRecommendations({
      magnets: [a, b],
      metrics: metrics([
        { slug: a.slug, impressions: 50, views: 29, submissions: 0, leads: 9, convertedLeads: 0 },
        { slug: b.slug, impressions: 50, views: 100, submissions: 10, leads: 9, convertedLeads: 3 },
      ]),
      qualityBySlug: noQuality,
      blogPosts: null,
      blogViews: null,
    })
    expect(quiet).toEqual([])
    expect(buildRecommendations({ magnets: [a], metrics: null, qualityBySlug: noQuality, blogPosts: null, blogViews: null })).toEqual([])
  })

  it("puts quality fixes first and opens the full editor at the issue's area", () => {
    const quality = new Map<string, LeadMagnetQualityIssue[]>([
      [a.slug, [{ id: "outcome-missing", severity: "fix", area: "page", message: "한 줄 설명이 비어 있습니다.", where: "자료 페이지" }]],
    ])
    const recs = buildRecommendations({
      magnets: [{ ...a, published: true }, { ...b, published: true }],
      metrics: metrics([{ slug: b.slug, impressions: 10, views: 5 }]),
      qualityBySlug: quality,
      blogPosts: null,
      blogViews: null,
    })
    expect(recs[0]).toMatchObject({ kind: "quality", slug: a.slug, target: { kind: "full", area: "page" } })
  })

  it("suggests a magnet for a well-read blog post without one, only when the words overlap", () => {
    const magnet = { ...a, published: true, title: "학원 운영 누수 진단표", summary: "출결 보강 상담 운영", audience: "원장", blogTone: "", suggestedPlacements: [] }
    const posts = [
      { id: "p1", slug: "retention", title: "학원 퇴원율 운영 이렇게 관리하세요", published: true, tags: ["상담", "보강"] },
      { id: "p2", slug: "linked", title: "학원 운영 체크", published: true, leadMagnetSlug: magnet.slug },
      { id: "p3", slug: "unrelated", title: "교육급여 바우처 신청", published: true },
      { id: "p4", slug: "draft", title: "학원 운영 초안", published: false },
    ]
    const recs = buildRecommendations({
      magnets: [magnet],
      metrics: metrics([{ slug: magnet.slug, impressions: 10, views: 10, submissions: 1 }]),
      qualityBySlug: noQuality,
      blogPosts: posts,
      blogViews: new Map([["retention", 962], ["linked", 500], ["unrelated", 800], ["draft", 900]]),
    })
    const links = recs.filter((rec) => rec.kind === "link")
    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({ slug: magnet.slug, target: { kind: "blog", href: "/admin/blog/p1/edit" } })
    expect(magnetPostOverlap(magnet, posts[2])).toBeLessThan(2)
  })
})

describe("blogViewsFromTop", () => {
  it("decodes Korean slugs, merges query variants and drops list pages", () => {
    const views = blogViewsFromTop(
      [
        { page: "/blog/%ED%95%99%EC%9B%90", count: 3 },
        { page: "/blog/%ED%95%99%EC%9B%90?utm=1", count: 2 },
        { page: "/blog/", count: 50 },
        { page: "/blog/other", count: 9 },
      ],
      new Set(["학원", "other"])
    )
    expect(views.get("학원")).toBe(5)
    expect(views.get("other")).toBe(9)
    expect(views.size).toBe(2)
  })
})

describe("partial metrics", () => {
  it("does not claim zero exposure when the metrics query only partly succeeded", () => {
    const partial = { ...metrics([]), warning: "client_events query failed" }
    const recs = buildRecommendations({ magnets: [{ ...a, published: true }], metrics: partial, qualityBySlug: noQuality, blogPosts: null, blogViews: null })
    expect(recs.filter((rec) => rec.kind === "exposure")).toEqual([])
  })
})
