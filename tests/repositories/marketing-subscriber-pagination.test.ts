import { describe, expect, it, vi } from "vitest"

import { fetchAllSubscriberRowsById } from "@/lib/repositories/marketing"

describe("subscriber analytics keyset pagination", () => {
  it("returns rows beyond the former 1,000-row cutoff", async () => {
    const source = Array.from({ length: 2_003 }, (_, index) => ({
      id: `sub-${String(index + 1).padStart(4, "0")}`,
    }))
    const fetchPage = vi.fn(async (afterId: string | null, limit: number) => {
      const start = afterId ? source.findIndex((row) => row.id === afterId) + 1 : 0
      return { data: source.slice(start, start + limit), error: null }
    })

    const rows = await fetchAllSubscriberRowsById(fetchPage)

    expect(rows).toHaveLength(2_003)
    expect(rows.at(-1)?.id).toBe("sub-2003")
    expect(fetchPage.mock.calls).toEqual([
      [null, 1_000],
      ["sub-1000", 1_000],
      ["sub-2000", 1_000],
    ])
  })

  it("surfaces a later-page failure instead of returning a partial rollup", async () => {
    let page = 0
    await expect(
      fetchAllSubscriberRowsById(
        async () => {
          page += 1
          if (page === 2) return { data: null, error: { message: "second page failed" } }
          return { data: [{ id: "sub-1" }, { id: "sub-2" }], error: null }
        },
        { pageSize: 2 }
      )
    ).rejects.toThrow("second page failed")
  })
})

describe("getActiveSubscribersByTags pagination", () => {
  it("returns every active subscriber past the PostgREST 1000-row cap", async () => {
    vi.resetModules()
    process.env.USE_SUPABASE_MARKETING = "true"
    const source = Array.from({ length: 2_300 }, (_, index) => ({
      id: `sub-${String(index + 1).padStart(5, "0")}`,
      email: `u${index}@example.com`,
      created_at: "2026-07-01T00:00:00Z",
    }))
    vi.doMock("@/lib/supabase/admin", () => ({
      createSupabaseAdminClient: () => ({
        from: () => {
          let after: string | null = null
          let limit = 0
          const builder: Record<string, unknown> = {}
          for (const name of ["select", "eq", "order", "overlaps"]) builder[name] = () => builder
          builder.limit = (n: number) => ((limit = n), builder)
          builder.gt = (_c: string, v: string) => ((after = v), builder)
          builder.then = (resolve: (v: unknown) => unknown) => {
            const start = after ? source.findIndex((row) => row.id === after) + 1 : 0
            // 서버 max-rows 1000 클램프
            return Promise.resolve({ data: source.slice(start, start + Math.min(limit, 1_000)), error: null }).then(resolve)
          }
          return builder
        },
      }),
    }))
    const { getActiveSubscribersByTags } = await import("@/lib/repositories/marketing")
    const rows = await getActiveSubscribersByTags([])
    expect(rows).toHaveLength(2_300)
  })
})
