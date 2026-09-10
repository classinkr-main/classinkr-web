import { describe, expect, it } from "vitest"

import {
  buildAdminBlogOverviewSummary,
  type AdminBlogOverviewSourceRow,
} from "@/lib/admin/overview/blog-summary"

function row(overrides: Partial<AdminBlogOverviewSourceRow> = {}): AdminBlogOverviewSourceRow {
  return {
    id: "post-1",
    title: "글",
    category: "인사이트",
    authorName: "ClassIn",
    status: "PUBLISHED",
    ctaText: "상담",
    ctaUrl: "/contact",
    publishedAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  }
}

describe("buildAdminBlogOverviewSummary", () => {
  it("returns only Overview counts and four recent lightweight rows", () => {
    const summary = buildAdminBlogOverviewSummary([
      row({ id: "old", updatedAt: "2026-07-01T00:00:00.000Z" }),
      ...Array.from({ length: 5 }, (_, index) =>
        row({ id: `post-${index}`, updatedAt: `2026-08-0${index + 1}T00:00:00.000Z` })
      ),
      row({ id: "draft", status: "DRAFT", updatedAt: "2026-07-02T00:00:00.000Z" }),
    ])

    expect(summary).toMatchObject({
      totalPosts: 7,
      draftPosts: 1,
      publishedPosts: 6,
      ctaCoverage: 100,
      publishedPostsWithoutCta: 0,
    })
    expect(summary.recentPosts.map((post) => post.id)).toEqual([
      "post-4",
      "post-3",
      "post-2",
      "post-1",
    ])
    expect(summary.recentPosts[0]).not.toHaveProperty("contentMarkdown")
  })

  it("preserves legacy default CTA semantics and flags explicitly blank CTA values", () => {
    const summary = buildAdminBlogOverviewSummary([
      row({ id: "default", ctaText: null, ctaUrl: null }),
      row({ id: "blank", ctaText: "", ctaUrl: "" }),
      row({ id: "review", status: "review" }),
    ])

    expect(summary.publishedPosts).toBe(2)
    expect(summary.publishedPostsWithoutCta).toBe(1)
    expect(summary.ctaCoverage).toBe(50)
  })
})
