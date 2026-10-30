/**
 * 블로그 공개 날짜 신호가 updated_at(토글에도 바뀐다)이 아니라 content_updated_at 을 따르는지 고정한다.
 * 사이트맵 lastmod · RSS lastBuildDate · 블로그 상세 JSON-LD(BlogPosting dateModified/datePublished).
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_URL, createArticleJsonLd } from "@/lib/seo"

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

function read(relative: string) {
  return readFileSync(join(process.cwd(), relative), "utf8").replace(/\r\n/g, "\n")
}

// 대표 글 토글로 updated_at 만 10-28 로 밀린 글 — 내용은 10-26 에 마지막으로 바뀌었다.
const toggledPost = {
  slug: "toggled",
  title: "토글만 한 글",
  excerpt: "요약",
  category: "인사이트",
  featured: true,
  publishedAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-28T09:00:00.000Z",
  contentUpdatedAt: "2026-10-26T03:00:00.000Z",
  createdAt: "2026-09-30T00:00:00.000Z",
}

// 마이그레이션 미적용 DB 에서 읽힌 글 — contentUpdatedAt 이 없다.
const legacyPost = {
  slug: "legacy",
  title: "미적용 DB 글",
  excerpt: "요약",
  category: "제품",
  featured: false,
  publishedAt: "2026-10-02T00:00:00.000Z",
  updatedAt: "2026-10-10T00:00:00.000Z",
  createdAt: "2026-10-02T00:00:00.000Z",
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getPublishedPostsForStaticSitemap.mockResolvedValue([])
  mocks.listCachedPublicEvents.mockResolvedValue([])
  mocks.getDocsContent.mockResolvedValue(null)
})

describe("sitemap blog lastModified", () => {
  async function loadByUrl() {
    const { default: sitemap } = await import("@/app/sitemap")
    const entries = await sitemap()
    return new Map(entries.map((entry) => [entry.url, entry]))
  }

  it("uses contentUpdatedAt, not the toggle-bumped updatedAt, and falls back to updatedAt without the column", async () => {
    mocks.getPublishedPostsForStaticSitemap.mockResolvedValue([toggledPost, legacyPost])

    const byUrl = await loadByUrl()

    expect(byUrl.get(`${SITE_URL}/blog/toggled`)?.lastModified).toBe("2026-10-26T03:00:00.000Z")
    expect(byUrl.get(`${SITE_URL}/blog/legacy`)?.lastModified).toBe("2026-10-10T00:00:00.000Z")
  })

  it("derives the /blog hub lastModified from the same content dates", async () => {
    mocks.getPublishedPostsForStaticSitemap.mockResolvedValue([toggledPost, legacyPost])

    const byUrl = await loadByUrl()

    // 10-28 은 토글 시각이라 허브 날짜에도 쓰이지 않는다.
    expect(byUrl.get(`${SITE_URL}/blog`)?.lastModified).toEqual(new Date("2026-10-26T03:00:00.000Z"))
  })

  it("falls back to publishedAt then createdAt for posts without any update timestamp", async () => {
    mocks.getPublishedPostsForStaticSitemap.mockResolvedValue([
      { ...legacyPost, slug: "published-only", updatedAt: undefined },
      { ...legacyPost, slug: "created-only", updatedAt: undefined, publishedAt: undefined, createdAt: "2026-03-05T00:00:00.000Z" },
    ])

    const byUrl = await loadByUrl()

    expect(byUrl.get(`${SITE_URL}/blog/published-only`)?.lastModified).toBe("2026-10-02T00:00:00.000Z")
    expect(byUrl.get(`${SITE_URL}/blog/created-only`)?.lastModified).toBe("2026-03-05T00:00:00.000Z")
  })
})

describe("blog RSS lastBuildDate", () => {
  it("prefers contentUpdatedAt over a toggle-bumped updatedAt", async () => {
    mocks.getPublishedPostsForStaticSitemap.mockResolvedValue([toggledPost])

    const { GET } = await import("@/app/blog/rss.xml/route")
    const xml = await (await GET()).text()

    expect(xml).toContain(`<lastBuildDate>${new Date("2026-10-26T03:00:00.000Z").toUTCString()}</lastBuildDate>`)
    expect(xml).not.toContain(new Date("2026-10-28T09:00:00.000Z").toUTCString())
  })

  it("still uses updatedAt for posts read before the migration is applied", async () => {
    mocks.getPublishedPostsForStaticSitemap.mockResolvedValue([toggledPost, legacyPost])

    const { GET } = await import("@/app/blog/rss.xml/route")
    const xml = await (await GET()).text()

    // 가장 최근 = toggled 의 내용 변경(10-26) > legacy 의 updated_at(10-10).
    expect(xml).toContain(`<lastBuildDate>${new Date("2026-10-26T03:00:00.000Z").toUTCString()}</lastBuildDate>`)
  })
})

describe("blog detail JSON-LD", () => {
  it("createArticleJsonLd emits BlogPosting on request and keeps Article as the default", () => {
    const base = { path: "/blog/x", title: "제목", description: "설명" }
    expect(createArticleJsonLd({ ...base, type: "BlogPosting" })["@type"]).toBe("BlogPosting")
    expect(createArticleJsonLd(base)["@type"]).toBe("Article")
  })

  it("the blog detail page passes BlogPosting with content-based dates; the docs detail page stays Article", () => {
    const blogPage = read("app/blog/[slug]/page.tsx")
    expect(blogPage).toContain('type: "BlogPosting"')
    expect(blogPage).toContain("dateModified: resolveBlogContentModifiedAt(post)")
    expect(blogPage).toContain("datePublished: resolveBlogPublishedAt(post)")
    expect(blogPage).not.toContain("dateModified: post.updatedAt")

    // 문서 상세 JSON-LD 는 lib/docs-structured-data.ts 가 만든다(Article, 문제 해결 문서는 TechArticle).
    const docsPage = read("app/docs/[category]/[slug]/page.tsx")
    expect(docsPage).toContain("createDocStructuredData(")
    expect(docsPage).not.toContain('"BlogPosting"')
    const docsStructuredData = read("lib/docs-structured-data.ts")
    expect(docsStructuredData).toContain("createArticleJsonLd(")
    expect(docsStructuredData).not.toContain('"BlogPosting"')
  })
})
