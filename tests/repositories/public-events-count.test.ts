import { afterEach, describe, expect, it, vi } from "vitest"

interface SelectCall {
  columns: string
  options?: { count?: string; head?: boolean }
  filtered: boolean
}

function mockPublicEventCount(results: Array<{ count: number | null; error: { code?: string; message?: string } | null }>) {
  const calls: SelectCall[] = []
  let resultIndex = 0

  const from = vi.fn(() => ({
    select: (columns: string, options?: { count?: string; head?: boolean }) => {
      const finish = (filtered: boolean) => {
        calls.push({ columns, options, filtered })
        return {
          abortSignal: vi.fn(async () => results[resultIndex++] ?? { count: null, error: null }),
        }
      }
      return {
        in: vi.fn(() => finish(true)),
        abortSignal: vi.fn(async () => {
          calls.push({ columns, options, filtered: false })
          return results[resultIndex++] ?? { count: null, error: null }
        }),
      }
    },
  }))

  vi.doMock("@/lib/supabase/admin", () => ({
    createSupabaseAdminClient: vi.fn(() => ({ from })),
  }))

  return { calls, from }
}

describe("countPublicEvents", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("발행 행사 수만 head count로 조회해 행 payload를 만들지 않는다", async () => {
    const { calls } = mockPublicEventCount([{ count: 12, error: null }])
    const { countPublicEvents } = await import("@/lib/repositories/public-events")

    await expect(countPublicEvents()).resolves.toBe(12)
    expect(calls).toEqual([
      {
        columns: "id",
        options: { count: "exact", head: true },
        filtered: true,
      },
    ])
  })

  it("publication_status 마이그레이션 전에는 전체 행 head count로 폴백한다", async () => {
    const { calls } = mockPublicEventCount([
      {
        count: null,
        error: { code: "42703", message: "column public_events.publication_status does not exist" },
      },
      { count: 7, error: null },
    ])
    const { countPublicEvents } = await import("@/lib/repositories/public-events")

    await expect(countPublicEvents()).resolves.toBe(7)
    expect(calls).toHaveLength(2)
    expect(calls.every((call) => call.options?.head === true)).toBe(true)
    expect(calls[0]?.filtered).toBe(true)
    expect(calls[1]?.filtered).toBe(false)
  })
})
