// T5-B: getOverviewBlogSummary — 전 포스트(LIST_COLUMNS) 로드 대신 head 카운트 4개 + 최근 4건만.
// 술어 고정: totalCount는 deleted_at null이면 status 무관(기존 blogPosts.length = "발행된 포스트" 카드 값),
// publishedCount는 countPublishedPosts와 같은 status 술어, publishedWithoutCta는 공개 글 ∧ CTA 컬럼 공백,
// recent는 updated_at 내림차순(nulls last) 4건을 supabaseToLegacy와 같은 규칙으로 매핑한다.
import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

type Op = { op: string; args: unknown[] }
type Query = { columns: string; options?: { count?: string; head?: boolean }; ops: Op[] }

const RECENT_ROWS = [
  {
    id: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
    title: "최근 글",
    status: "PUBLISHED",
    category: null,
    author_name: null,
    updated_at: "2026-09-01T09:00:00Z",
    published_at: "2026-08-30T00:00:00Z",
    created_at: "2026-08-29T00:00:00Z",
  },
  {
    id: "3f2504e0-4f89-11d3-9a0c-0305e82c3302",
    title: "검수 중 글",
    status: "IN_REVIEW",
    category: "인사이트",
    author_name: "팀",
    updated_at: "2026-08-20T09:00:00Z",
    published_at: null,
    created_at: "2026-08-19T00:00:00Z",
  },
]

function blogClient() {
  const queries: Query[] = []
  const from = vi.fn(() => ({
    select: (columns: string, options?: { count?: string; head?: boolean }) => {
      const query: Query = { columns, options, ops: [] }
      queries.push(query)
      const builder: Record<string, unknown> = {}
      for (const op of ["is", "in", "not", "or", "order", "limit"]) {
        builder[op] = (...args: unknown[]) => {
          query.ops.push({ op, args })
          return builder
        }
      }
      builder.then = (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
        Promise.resolve(resolveQuery(query)).then(onFulfilled, onRejected)
      return builder
    },
  }))
  return { from, queries }
}

function has(query: Query, op: string, first?: unknown) {
  return query.ops.some((entry) => entry.op === op && (first === undefined || entry.args[0] === first))
}

// 술어 조합으로 어떤 카운트 쿼리인지 판별해 고정 수치를 돌려준다.
function resolveQuery(query: Query) {
  if (!query.options?.head) return { data: RECENT_ROWS, error: null, count: null }
  const published = has(query, "in", "status")
  const notDraft = has(query, "not", "status")
  const blankCta = has(query, "or")
  if (published && blankCta) return { data: null, error: null, count: 2 }
  if (published) return { data: null, error: null, count: 7 }
  if (notDraft) return { data: null, error: null, count: 3 }
  return { data: null, error: null, count: 12 }
}

async function loadRepository() {
  vi.resetModules()
  const client = blogClient()
  vi.doMock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn(() => client) }))
  const repository = await import("@/lib/repositories/blog")
  return { repository, client }
}

describe("getOverviewBlogSummary", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("head 카운트 4개 + 최근 4건(7컬럼) 조합으로 요약을 만든다", async () => {
    const { repository, client } = await loadRepository()
    const summary = await repository.getOverviewBlogSummary()

    expect(summary.totalCount).toBe(12)
    expect(summary.publishedCount).toBe(7)
    expect(summary.draftCount).toBe(3)
    expect(summary.publishedWithoutCtaCount).toBe(2)

    const counts = client.queries.filter((query) => query.options?.head)
    expect(counts).toHaveLength(4)
    for (const query of counts) {
      expect(query.columns).toBe("id")
      expect(query.options).toEqual({ count: "exact", head: true })
      expect(has(query, "is", "deleted_at")).toBe(true)
    }
    // totalCount 쿼리는 deleted_at null 외 status 조건이 없어야 한다(status 무관 = 기존 카드 값).
    const totalQuery = counts.find((query) => !has(query, "in") && !has(query, "not") && !has(query, "or"))
    expect(totalQuery?.ops).toEqual([{ op: "is", args: ["deleted_at", null] }])

    const publishedQuery = counts.find((query) => has(query, "in", "status") && !has(query, "or"))
    expect(publishedQuery?.ops).toContainEqual({ op: "in", args: ["status", ["PUBLISHED", "published"]] })

    const ctaQuery = counts.find((query) => has(query, "or"))
    const orFilter = ctaQuery?.ops.find((entry) => entry.op === "or")?.args[0] as string
    expect(orFilter).toContain("cta_text.")
    expect(orFilter).toContain("cta_url.")
    expect(has(ctaQuery!, "in", "status")).toBe(true)
  })

  it("recent는 updated_at 내림차순 4건, supabaseToLegacy와 같은 매핑(id 해시·status·기본값)", async () => {
    const { repository, client } = await loadRepository()
    const summary = await repository.getOverviewBlogSummary()

    const recentQuery = client.queries.find((query) => !query.options?.head)
    expect(recentQuery?.columns).toBe("id,title,status,category,author_name,updated_at,published_at,created_at")
    expect(recentQuery?.ops).toEqual([
      { op: "is", args: ["deleted_at", null] },
      { op: "order", args: ["updated_at", { ascending: false, nullsFirst: false }] },
      { op: "order", args: ["created_at", { ascending: false }] },
      { op: "limit", args: [4] },
    ])

    expect(summary.recent).toHaveLength(2)
    expect(summary.recent[0]).toEqual({
      id: expect.any(Number),
      title: "최근 글",
      status: "published",
      category: "전체",
      author: "",
      updatedAt: "2026-09-01T09:00:00Z",
      publishedAt: "2026-08-30T00:00:00Z",
    })
    expect(summary.recent[1]).toMatchObject({ status: "review", category: "인사이트", author: "팀", publishedAt: undefined })
    // 레거시 number id는 uuid 해시 — 두 글이 서로 다른 id를 받아야 한다(렌더 key).
    expect(summary.recent[0].id).not.toBe(summary.recent[1].id)
  })
})

describe("GET /api/admin/blog", () => {
  const getAllPosts = vi.fn(async () => [{ id: 1 }])
  const getTrashedPosts = vi.fn(async () => [])
  const getOverviewBlogSummary = vi.fn(async () => ({
    totalCount: 5,
    publishedCount: 3,
    draftCount: 2,
    publishedWithoutCtaCount: 1,
    recent: [],
  }))

  beforeEach(() => {
    vi.resetModules()
    getAllPosts.mockClear()
    getOverviewBlogSummary.mockClear()
    vi.doMock("@/lib/admin-auth", () => ({ verifyAdmin: vi.fn(async () => undefined) }))
    vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }))
    vi.doMock("@/lib/repositories/blog", () => ({
      getAllPosts,
      getTrashedPosts,
      getOverviewBlogSummary,
      createPost: vi.fn(),
      isBlogSlugConflictError: () => false,
    }))
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("?scope=overview면 요약 객체를 그대로 응답한다", async () => {
    const { GET } = await import("@/app/api/admin/blog/route")
    const res = await GET(new NextRequest("http://localhost/api/admin/blog?scope=overview"))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      totalCount: 5,
      publishedCount: 3,
      draftCount: 2,
      publishedWithoutCtaCount: 1,
      recent: [],
    })
    expect(getAllPosts).not.toHaveBeenCalled()
  })

  it("scope 미전달이면 기존 { posts } 응답", async () => {
    const { GET } = await import("@/app/api/admin/blog/route")
    const res = await GET(new NextRequest("http://localhost/api/admin/blog"))
    expect(await res.json()).toEqual({ posts: [{ id: 1 }] })
    expect(getOverviewBlogSummary).not.toHaveBeenCalled()
  })
})
