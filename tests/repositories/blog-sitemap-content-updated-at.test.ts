/**
 * getPublishedPostsForStaticSitemap 의 content_updated_at 읽기와 마이그레이션 미적용 폴백.
 *
 * 20261028_blog_posts_content_updated_at.sql 이 적용되기 전에 코드가 먼저 배포돼도 사이트맵·RSS 가
 * 42703(컬럼 없음)으로 죽지 않고 기존 컬럼으로 다시 읽어야 한다. 그 밖의 오류는 삼키지 않는다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

interface FakeResult {
  data: unknown[] | null
  error: { code?: string; message?: string } | null
}

const state = vi.hoisted(() => ({
  selects: [] as string[],
  respond: (() => ({ data: [], error: null })) as (columns: string) => FakeResult,
}))

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from() {
      let columns = ""
      const builder = {
        select(value: string) {
          columns = value
          state.selects.push(value)
          return builder
        },
        in: () => builder,
        is: () => builder,
        or: () => builder,
        order: () => builder,
        abortSignal: () => builder,
        then(onFulfilled: (value: FakeResult) => unknown, onRejected?: (reason: unknown) => unknown) {
          return Promise.resolve(state.respond(columns)).then(onFulfilled, onRejected)
        },
      }
      return builder
    },
  }),
}))

const row = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "post",
  title: "글",
  excerpt: "요약",
  category: "인사이트",
  tags: [],
  featured: false,
  status: "PUBLISHED",
  benefit_items: [],
  related_post_ids: [],
  page_layout: "standard",
  published_at: "2026-10-01T00:00:00.000Z",
  updated_at: "2026-10-28T09:00:00.000Z",
  created_at: "2026-09-30T00:00:00.000Z",
  deleted_at: null,
}

beforeEach(() => {
  state.selects = []
  vi.spyOn(console, "warn").mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("getPublishedPostsForStaticSitemap content_updated_at", () => {
  it("selects content_updated_at and maps it to contentUpdatedAt alongside createdAt", async () => {
    state.respond = () => ({ data: [{ ...row, content_updated_at: "2026-10-26T03:00:00.000Z" }], error: null })
    const { getPublishedPostsForStaticSitemap } = await import("@/lib/repositories/blog")

    const [post] = await getPublishedPostsForStaticSitemap()

    expect(state.selects).toHaveLength(1)
    expect(state.selects[0].split(",")).toContain("content_updated_at")
    expect(post).toMatchObject({
      contentUpdatedAt: "2026-10-26T03:00:00.000Z",
      updatedAt: "2026-10-28T09:00:00.000Z",
      createdAt: "2026-09-30T00:00:00.000Z",
    })
  })

  it("retries without the column when the migration is not applied (42703) and leaves contentUpdatedAt empty", async () => {
    state.respond = (columns) =>
      columns.includes("content_updated_at")
        ? { data: null, error: { code: "42703", message: "column blog_posts.content_updated_at does not exist" } }
        : { data: [row], error: null }
    const { getPublishedPostsForStaticSitemap } = await import("@/lib/repositories/blog")

    const posts = await getPublishedPostsForStaticSitemap()

    expect(state.selects).toHaveLength(2)
    expect(state.selects[1].split(",")).not.toContain("content_updated_at")
    expect(posts).toHaveLength(1)
    expect(posts[0].contentUpdatedAt).toBeUndefined()
    expect(posts[0].updatedAt).toBe("2026-10-28T09:00:00.000Z")
    // 무음 강등이 아니다 — 적용할 마이그레이션을 남긴다.
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("20261028_blog_posts_content_updated_at.sql"))
  })

  it("throws other failures instead of retrying or returning an empty sitemap", async () => {
    state.respond = () => ({ data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } })
    const { getPublishedPostsForStaticSitemap } = await import("@/lib/repositories/blog")

    await expect(getPublishedPostsForStaticSitemap()).rejects.toThrow("[blog] sitemap query failed")
    expect(state.selects).toHaveLength(1)
  })

  it("throws when the fallback query fails too", async () => {
    state.respond = (columns) =>
      columns.includes("content_updated_at")
        ? { data: null, error: { code: "42703", message: "column blog_posts.content_updated_at does not exist" } }
        : { data: null, error: { code: "500", message: "upstream down" } }
    const { getPublishedPostsForStaticSitemap } = await import("@/lib/repositories/blog")

    await expect(getPublishedPostsForStaticSitemap()).rejects.toThrow("upstream down")
    expect(state.selects).toHaveLength(2)
  })
})

describe("isMissingContentUpdatedAtColumn", () => {
  it("recognises PostgREST undefined_column and messages naming the column, nothing else", async () => {
    const { isMissingContentUpdatedAtColumn } = await import("@/lib/repositories/blog")
    expect(isMissingContentUpdatedAtColumn({ code: "42703", message: "column x does not exist" })).toBe(true)
    expect(isMissingContentUpdatedAtColumn({ message: "Could not find the 'content_updated_at' column" })).toBe(true)
    expect(isMissingContentUpdatedAtColumn({ code: "57014", message: "statement timeout" })).toBe(false)
    expect(isMissingContentUpdatedAtColumn(null)).toBe(false)
  })
})
