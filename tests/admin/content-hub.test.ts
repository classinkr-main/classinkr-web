import { describe, expect, it } from "vitest"

import {
  blogPublishedDateKey,
  blogViewRanks,
  blogViewsBySlug,
  bucketDailyViews,
  buildContentHubCadence,
  buildContentHubItems,
  buildContentHubWindow,
  countContentChars,
  instagramCaptionBody,
  instagramCaptionTitle,
  instagramDateKey,
  instagramMediaTypeLabel,
  markdownToPreviewText,
  pageMatchesBlogPath,
  sortContentHubItems,
  type ContentHubInstagramMedia,
} from "@/lib/admin/content-hub"
import { getBlogPostPath } from "@/lib/blog-slug-route"
import type { BlogPost } from "@/lib/blog-types"

// 2026-10-29 10:00 KST
const NOW = new Date("2026-10-29T01:00:00.000Z")

function post(overrides: Partial<BlogPost>): BlogPost {
  return {
    id: 1,
    slug: "post",
    title: "글",
    excerpt: "",
    category: "인사이트",
    tags: [],
    tag: "",
    date: "2026. 10. 01",
    author: "ClassIn 팀",
    authorRole: "",
    authorBio: "",
    readTime: "5분",
    imageUrl: "",
    thumbnailAlt: "",
    heroImageUrl: "",
    heroImageAlt: "",
    featured: false,
    benefitItems: [],
    targetReader: "",
    contentMarkdown: "",
    seoTitle: "",
    seoDescription: "",
    relatedPostIds: [],
    pageLayout: "standard",
    cta: { eyebrow: "", title: "", description: "", buttonLabel: "", buttonHref: "" },
    status: "published",
    ...overrides,
  }
}

function media(overrides: Partial<ContentHubInstagramMedia>): ContentHubInstagramMedia {
  return {
    id: "m1",
    caption: "캡션",
    mediaType: "IMAGE",
    timestamp: "2026-10-20T03:00:00+0000",
    insights: { views: 100, reach: 80, likes: 5, comments: 1, shares: 0, saved: 2, totalInteractions: 8 },
    ...overrides,
  }
}

describe("buildContentHubWindow", () => {
  it("counts days including today in KST", () => {
    const window = buildContentHubWindow("last_30d", NOW)
    expect(window.endKey).toBe("2026-10-29")
    expect(window.startKey).toBe("2026-09-30")
    expect(window.days).toBe(30)
    expect(window.dayKeys).toHaveLength(30)
    expect(window.dayKeys[0]).toBe("2026-09-30")
    expect(window.dayKeys[29]).toBe("2026-10-29")
  })

  it("uses the KST date even when UTC is still the previous day", () => {
    // 2026-10-29 08:30 KST = 2026-10-28 23:30 UTC
    const window = buildContentHubWindow("last_7d", new Date("2026-10-28T23:30:00.000Z"))
    expect(window.endKey).toBe("2026-10-29")
    expect(window.startKey).toBe("2026-10-23")
  })

  it("starts this_month on the 1st", () => {
    const window = buildContentHubWindow("this_month", NOW)
    expect(window.startKey).toBe("2026-10-01")
    expect(window.days).toBe(29)
  })
})

describe("date keys", () => {
  it("prefers publishedAt and falls back to the display date", () => {
    expect(blogPublishedDateKey({ publishedAt: "2026-10-13T16:00:00.000Z", date: "2026. 01. 01" })).toBe("2026-10-14")
    expect(blogPublishedDateKey({ date: "2026. 6. 2" })).toBe("2026-06-02")
    expect(blogPublishedDateKey({ date: "" })).toBeNull()
  })

  it("reads Graph API timestamps with a +0000 offset as KST dates", () => {
    expect(instagramDateKey("2026-10-16T16:30:00+0000")).toBe("2026-10-17")
    expect(instagramDateKey(undefined)).toBeNull()
    expect(instagramDateKey("not a date")).toBeNull()
  })
})

describe("blog page matching", () => {
  it("maps page_view paths to posts, ignoring query strings, trailing slashes and list pages", () => {
    const posts = [post({ slug: "alpha" }), post({ slug: "beta" })]
    const views = blogViewsBySlug(
      [
        { page: "/blog/alpha", count: 10 },
        { page: "/blog/alpha/", count: 2 },
        { page: "/blog/alpha?utm_source=x", count: 3 },
        { page: "/blog/", count: 50 },
        { page: "/blog/beta", count: 4 },
      ],
      posts
    )
    expect(views.get("alpha")).toBe(15)
    expect(views.get("beta")).toBe(4)
    expect(views.size).toBe(2)
  })

  it("matches Korean slugs by their encoded path and truncated stored paths by prefix", () => {
    const longSlug = "학원-운영-체크리스트-".repeat(4) + "끝"
    const path = getBlogPostPath(longSlug)
    expect(path.length).toBeGreaterThan(200)
    const truncated = path.slice(0, 200)
    const posts = [post({ slug: "짧은-글" }), post({ slug: longSlug })]
    const views = blogViewsBySlug(
      [
        { page: getBlogPostPath("짧은-글"), count: 7 },
        { page: truncated, count: 9 },
      ],
      posts
    )
    expect(views.get("짧은-글")).toBe(7)
    expect(views.get(longSlug)).toBe(9)
    expect(pageMatchesBlogPath(truncated, path)).toBe(true)
    // 짧은 경로가 다른 글의 앞부분이라고 같은 글로 보지 않는다
    expect(pageMatchesBlogPath("/blog/alp", "/blog/alpha")).toBe(false)
  })

  it("ranks only posts that were viewed", () => {
    const ranks = blogViewRanks(new Map([["a", 3], ["b", 10], ["c", 0]]))
    expect(ranks.get("b")).toBe(1)
    expect(ranks.get("a")).toBe(2)
    expect(ranks.has("c")).toBe(false)
  })
})

describe("buildContentHubItems", () => {
  const window = buildContentHubWindow("last_30d", NOW)

  it("keeps published posts published in the window or viewed in the window, and instagram posts in the window", () => {
    const posts = [
      post({ id: 1, slug: "new", date: "2026. 10. 20" }),
      post({ id: 2, slug: "old-popular", date: "2026. 06. 02" }),
      post({ id: 3, slug: "old-quiet", date: "2026. 06. 02" }),
      post({ id: 4, slug: "draft", date: "2026. 10. 21", status: "draft" }),
      post({ id: 5, slug: "trashed", date: "2026. 10. 22", deletedAt: "2026-10-23T00:00:00Z" }),
    ]
    const items = buildContentHubItems({
      posts,
      viewsBySlug: new Map([["new", 5], ["old-popular", 40]]),
      media: [media({ id: "in" }), media({ id: "out", timestamp: "2026-08-01T00:00:00+0000" })],
      window,
    })
    expect(items.map((item) => item.key)).toEqual(["ig:in", "blog:1", "blog:2"])
    const oldPopular = items.find((item) => item.key === "blog:2")
    expect(oldPopular?.inWindow).toBe(false)
    expect(oldPopular?.views).toBe(40)
    expect(items.find((item) => item.key === "blog:1")?.reactions).toBeNull()
    expect(items.find((item) => item.key === "ig:in")?.reactions).toBe(8)
  })

  it("shows unknown blog views as null while page views are not loaded", () => {
    const items = buildContentHubItems({
      posts: [post({ id: 1, slug: "new", date: "2026. 10. 20" }), post({ id: 2, slug: "old", date: "2026. 06. 02" })],
      viewsBySlug: null,
      media: null,
      window,
    })
    expect(items.map((item) => item.key)).toEqual(["blog:1"])
    expect(items[0].views).toBeNull()
  })

  it("sorts by views with nulls last", () => {
    const items = buildContentHubItems({
      posts: [post({ id: 1, slug: "a", date: "2026. 10. 20" }), post({ id: 2, slug: "b", date: "2026. 10. 10" })],
      viewsBySlug: new Map([["a", 1], ["b", 9]]),
      media: null,
      window,
    })
    expect(sortContentHubItems(items, "views").map((item) => item.key)).toEqual(["blog:2", "blog:1"])
    expect(sortContentHubItems(items, "recent").map((item) => item.key)).toEqual(["blog:1", "blog:2"])
  })
})

describe("buildContentHubCadence", () => {
  it("marks only content published inside the window and averages the gap", () => {
    const window = buildContentHubWindow("last_30d", NOW)
    const items = buildContentHubItems({
      posts: [
        post({ id: 1, slug: "a", date: "2026. 10. 02" }),
        post({ id: 2, slug: "b", date: "2026. 10. 14" }),
        post({ id: 3, slug: "c", date: "2026. 10. 26" }),
        post({ id: 4, slug: "old", date: "2026. 06. 02" }),
      ],
      viewsBySlug: new Map([["old", 3]]),
      media: [media({ id: "x", timestamp: "2026-10-28T01:00:00+0000" })],
      window,
    })
    const cadence = buildContentHubCadence(items, window)
    expect(cadence.days).toHaveLength(30)
    expect(cadence.blogCount).toBe(3)
    expect(cadence.igCount).toBe(1)
    expect(cadence.blogAverageGapDays).toBe(12)
    expect(cadence.igAverageGapDays).toBeNull()
    expect(cadence.days.find((day) => day.key === "2026-10-14")?.blog).toBe(1)
    expect(cadence.days[cadence.days.length - 1].isToday).toBe(true)
  })
})

describe("bucketDailyViews", () => {
  it("counts page views per KST day and drops times outside the range", () => {
    const dayKeys = ["2026-10-27", "2026-10-28", "2026-10-29"]
    const counts = bucketDailyViews(
      [
        "2026-10-26T14:59:59.000Z", // 10-26 23:59 KST — 밖
        "2026-10-26T15:00:00.000Z", // 10-27 00:00 KST
        "2026-10-28T03:00:00.000Z",
        "2026-10-28T10:00:00.000Z",
        "2026-10-28T15:30:00.000Z", // 10-29 00:30 KST
        "garbage",
      ],
      dayKeys
    )
    expect(counts).toEqual([1, 2, 1])
  })
})

describe("instagram labels", () => {
  it("names reels and uses the first caption line as the title", () => {
    expect(instagramMediaTypeLabel({ mediaType: "VIDEO", mediaProductType: "REELS" })).toBe("릴스")
    expect(instagramMediaTypeLabel({ mediaType: "CAROUSEL_ALBUM" })).toBe("캐러셀")
    expect(instagramCaptionTitle("\n  첫 줄 제목\n둘째 줄")).toBe("첫 줄 제목")
    expect(instagramCaptionTitle(undefined)).toBe("캡션 없음")
    expect(instagramCaptionTitle("가".repeat(80), 10)).toBe(`${"가".repeat(9)}…`)
  })
})

describe("content preview text", () => {
  it("keeps headings and list lines but drops markdown syntax, images, code and html", () => {
    const markdown = [
      "## 1. 수업 표준화",
      "",
      "강사가 바뀌어도 **같은 흐름**을 [유지](https://example.com)합니다.",
      "",
      "- 첫째 항목",
      "2. 둘째 항목",
      "> 인용문",
      "",
      "![표지](https://example.com/a.png)",
      "```js",
      "const secret = 1",
      "```",
      "<div>상자</div>",
      "---",
      "| 구분 | 값 |",
      "| --- | --- |",
      "| 점수 | 32 |",
    ].join("\n")
    expect(markdownToPreviewText(markdown)).toBe(
      [
        "1. 수업 표준화",
        "",
        "강사가 바뀌어도 같은 흐름을 유지합니다.",
        "",
        "· 첫째 항목",
        "· 둘째 항목",
        "인용문",
        "",
        "상자",
        "",
        "구분 · 값",
        "점수 · 32",
      ].join("\n")
    )
    expect(markdownToPreviewText(undefined)).toBe("")
  })

  it("counts characters without whitespace and splits the caption title from its body", () => {
    expect(countContentChars("가 나\n다")).toBe(3)
    expect(instagramCaptionBody("\n첫 줄 제목\n\n둘째 줄\n#클래스인")).toBe("둘째 줄\n#클래스인")
    expect(instagramCaptionBody("한 줄뿐")).toBe("")
  })

  it("puts a one-line summary on each table row", () => {
    const window = buildContentHubWindow("last_30d", NOW)
    const items = buildContentHubItems({
      posts: [
        post({ id: 1, slug: "with-excerpt", date: "2026. 10. 20", excerpt: "요약 문장", contentMarkdown: "## 본문" }),
        post({ id: 2, slug: "no-excerpt", date: "2026. 10. 19", excerpt: "", contentMarkdown: "## 제목\n\n- 본문 첫 줄" }),
      ],
      viewsBySlug: null,
      media: [media({ id: "c", caption: "릴스 제목\n캡션 본문 #해시태그" })],
      window,
    })
    expect(items.find((item) => item.key === "blog:1")?.summary).toBe("요약 문장")
    expect(items.find((item) => item.key === "blog:2")?.summary).toBe("제목 · 본문 첫 줄")
    expect(items.find((item) => item.key === "ig:c")?.summary).toBe("캡션 본문 #해시태그")
  })
})
