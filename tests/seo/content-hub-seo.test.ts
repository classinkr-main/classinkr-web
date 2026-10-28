import { beforeEach, describe, expect, it, vi } from "vitest"

import { docsCategories, isDocCategoryId, type DocArticle } from "@/lib/docs"
import { SITE_URL } from "@/lib/seo"

const mocks = vi.hoisted(() => ({
  getPublishedPostsForStaticSitemap: vi.fn(),
  listCachedPublicEvents: vi.fn(),
  getDocsContent: vi.fn(),
}))

vi.mock("@/lib/repositories/blog", () => ({
  getPublishedPostsForStaticSitemap: mocks.getPublishedPostsForStaticSitemap,
}))

vi.mock("@/lib/repositories/public-events", () => ({
  listCachedPublicEvents: mocks.listCachedPublicEvents,
}))

vi.mock("@/lib/docs-content", async () => {
  const actual = await vi.importActual<typeof import("@/lib/docs-content")>("@/lib/docs-content")
  return { ...actual, getDocsContent: mocks.getDocsContent }
})

function makeDoc(overrides: Partial<DocArticle> & Pick<DocArticle, "slug" | "category">): DocArticle {
  return {
    title: overrides.slug,
    description: "설명",
    audience: "원장",
    updatedAt: "2026-01-01",
    readMinutes: 1,
    tags: [],
    keywords: [],
    chatbotSummary: "요약",
    sections: [],
    status: "published",
    visibility: "public",
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getPublishedPostsForStaticSitemap.mockResolvedValue([])
  mocks.listCachedPublicEvents.mockResolvedValue([])
})

describe("robots", () => {
  it("lets every crawler fetch the blog OG fallback image while /api stays blocked", async () => {
    const { default: robots } = await import("@/app/robots")
    const { rules } = robots()
    const list = Array.isArray(rules) ? rules : [rules]

    expect(list.length).toBeGreaterThan(0)
    for (const rule of list) {
      expect(rule.allow).toEqual(expect.arrayContaining(["/", "/api/og/"]))
      expect(rule.disallow).toEqual(expect.arrayContaining(["/api", "/admin"]))
    }
  })
})

describe("static docs categories", () => {
  it("includes updates so /docs/updates/* resolves without Supabase", () => {
    const updates = docsCategories.find((category) => category.id === "updates")

    expect(isDocCategoryId("updates")).toBe(true)
    expect(updates).toMatchObject({
      title: "업데이트",
      description: "학원 운영에 영향을 주는 제품 변경 사항과 권장 조치입니다.",
    })
  })

  it("keeps category ids unique", () => {
    const ids = docsCategories.map((category) => category.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe("blog RSS", () => {
  it("adds lastBuildDate and ttl, and falls back to createdAt when publishedAt is missing", async () => {
    mocks.getPublishedPostsForStaticSitemap.mockResolvedValue([
      {
        slug: "published",
        title: "발행 글",
        excerpt: "요약",
        category: "제품",
        publishedAt: "2026-10-01T00:00:00.000Z",
        updatedAt: "2026-10-20T09:30:00.000Z",
        createdAt: "2026-09-30T00:00:00.000Z",
      },
      {
        slug: "legacy",
        title: "레거시 글",
        excerpt: "요약",
        category: "인사이트",
        createdAt: "2026-03-05T00:00:00.000Z",
      },
    ])

    const { GET } = await import("@/app/blog/rss.xml/route")
    const xml = await (await GET()).text()

    expect(xml).toContain(`<lastBuildDate>${new Date("2026-10-20T09:30:00.000Z").toUTCString()}</lastBuildDate>`)
    expect(xml).toContain("<ttl>60</ttl>")
    expect(xml).toContain(`<pubDate>${new Date("2026-10-01T00:00:00.000Z").toUTCString()}</pubDate>`)
    expect(xml).toContain(`<pubDate>${new Date("2026-03-05T00:00:00.000Z").toUTCString()}</pubDate>`)
  })

  it("omits lastBuildDate instead of inventing one when there are no posts", async () => {
    mocks.getPublishedPostsForStaticSitemap.mockResolvedValue([])

    const { GET } = await import("@/app/blog/rss.xml/route")
    const xml = await (await GET()).text()

    expect(xml).not.toContain("<lastBuildDate>")
    expect(xml).toContain("<ttl>60</ttl>")
  })
})

describe("sitemap", () => {
  async function loadSitemap() {
    const { default: sitemap } = await import("@/app/sitemap")
    return sitemap()
  }

  it("lists /resources and /download without a made-up lastModified, plus published event videos", async () => {
    mocks.getDocsContent.mockResolvedValue(null)

    const entries = await loadSitemap()
    const byUrl = new Map(entries.map((entry) => [entry.url, entry]))

    const resources = byUrl.get(`${SITE_URL}/resources`)
    const download = byUrl.get(`${SITE_URL}/download`)
    expect(resources).toMatchObject({ changeFrequency: "monthly", priority: 0.7 })
    expect(download).toMatchObject({ changeFrequency: "weekly", priority: 0.8 })
    expect(resources?.lastModified).toBeUndefined()
    expect(download?.lastModified).toBeUndefined()

    expect(entries.some((entry) => entry.url.startsWith(`${SITE_URL}/events/videos/`))).toBe(true)
  })

  it("derives docs hub and category lastModified from listed docs, and honors a same-origin canonicalPath", async () => {
    mocks.getDocsContent.mockResolvedValue({
      categories: [
        { id: "start", title: "시작", description: "", order: 1 },
        { id: "updates", title: "업데이트", description: "", order: 60 },
      ],
      docs: [
        makeDoc({ slug: "a", category: "start", updatedAt: "2026-07-01" }),
        makeDoc({
          slug: "b",
          category: "start",
          updatedAt: "2026-09-15",
          canonicalPath: "/docs/start/a-canonical",
        }),
        makeDoc({
          slug: "c",
          category: "start",
          updatedAt: "2026-08-01",
          canonicalPath: "https://elsewhere.example.com/docs/c",
        }),
        // 색인 제외 문서는 최댓값 계산에도 들어가지 않는다.
        makeDoc({ slug: "hidden", category: "start", updatedAt: "2026-12-31", noindex: true }),
      ],
    })

    const entries = await loadSitemap()
    const byUrl = new Map(entries.map((entry) => [entry.url, entry]))

    expect(byUrl.get(`${SITE_URL}/docs`)?.lastModified).toEqual(new Date("2026-09-15"))
    expect(byUrl.get(`${SITE_URL}/docs/start`)?.lastModified).toEqual(new Date("2026-09-15"))
    // 문서가 없는 카테고리는 날짜를 지어내지 않고 생략한다.
    expect(byUrl.get(`${SITE_URL}/docs/updates`)).toBeDefined()
    expect(byUrl.get(`${SITE_URL}/docs/updates`)?.lastModified).toBeUndefined()

    expect(byUrl.has(`${SITE_URL}/docs/start/a`)).toBe(true)
    expect(byUrl.has(`${SITE_URL}/docs/start/b`)).toBe(false)
    expect(byUrl.has(`${SITE_URL}/docs/start/a-canonical`)).toBe(true)
    // 다른 호스트를 가리키는 canonicalPath 는 문서 자신의 경로로 되돌린다.
    expect(byUrl.has(`${SITE_URL}/docs/start/c`)).toBe(true)
    expect(entries.some((entry) => entry.url.includes("elsewhere.example.com"))).toBe(false)
    expect(entries.some((entry) => entry.url.endsWith("/hidden"))).toBe(false)

    const urls = entries.map((entry) => entry.url)
    expect(new Set(urls).size).toBe(urls.length)
  })
})
