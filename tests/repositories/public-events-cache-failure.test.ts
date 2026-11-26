import { afterEach, describe, expect, it, vi } from "vitest"

// 실패한 읽기가 [] / null 로 바뀌어 unstable_cache 에 1시간 저장되면 안 된다 — 캐시 콜백은 던져야 한다.
function mockFailingEventsRead(error: { code?: string; message: string }) {
  const result = { data: null, error }
  const builder: Record<string, unknown> = {}
  for (const name of ["select", "in", "not", "order", "eq"]) builder[name] = () => builder
  builder.abortSignal = () => {
    const done = Promise.resolve(result) as Promise<typeof result> & { single: () => Promise<typeof result> }
    done.single = () => Promise.resolve(result)
    return done
  }
  vi.doMock("@/lib/supabase/admin", () => ({
    createSupabaseAdminClient: () => ({ from: () => builder }),
  }))
  vi.doMock("next/cache", () => ({
    revalidateTag: vi.fn(),
    unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  }))
}

describe("public events cache fallbacks", () => {
  afterEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
  })

  it("rejects instead of returning an empty list when the read times out", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    vi.resetModules()
    mockFailingEventsRead({ message: "AbortError: aborted" })
    const repo = await import("@/lib/repositories/public-events")
    await expect(repo.listCachedPublicEvents()).rejects.toThrow("timeout")
    await expect(repo.listCachedPublicEventSlugs()).rejects.toThrow("timeout")
    await expect(repo.getCachedPublicEventBySlug("x")).rejects.toThrow("timeout")
  })

  it("rejects on a generic read error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    vi.resetModules()
    mockFailingEventsRead({ code: "XX000", message: "db blip" })
    const repo = await import("@/lib/repositories/public-events")
    await expect(repo.listCachedPublicEvents()).rejects.toMatchObject({ message: "db blip" })
  })
})
