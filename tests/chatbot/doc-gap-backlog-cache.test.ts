import { afterEach, describe, expect, it, vi } from "vitest"

// listDocGapBacklog(app/api/admin/docs/gaps, app/api/admin/docs/alpha-readiness 가 호출) —
// 콜드 인스턴스마다 question_clusters + docs_search_events(500행) + 매핑된 클러스터(1000행)
// 3개 쿼리를 서버 캐시 없이 매번 다시 실행하던 것을 60초 unstable_cache 로 감쌌다(2026-09-04).
// 이 테스트는 (1) 캐시 keyParts/tags/revalidate 배선을 고정하고, (2) 호출자마다 다른 limit
// (gaps 라우트=기본 30, alpha-readiness=100)이 실제로 캐시 인자(=쿼리의 .limit())까지
// 전달되는지를 검증한다.
const unstableCacheCalls: Array<{
  keyParts: string[]
  options?: { revalidate?: number; tags?: string[] }
}> = []

vi.mock("next/cache", () => ({
  unstable_cache: (
    fn: (...args: unknown[]) => unknown,
    keyParts: string[],
    options?: { revalidate?: number; tags?: string[] }
  ) => {
    unstableCacheCalls.push({ keyParts, options })
    return fn
  },
}))

const mocks = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
}))

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}))

function chain(result: { data: unknown; error: unknown }) {
  const query: Record<string, ReturnType<typeof vi.fn>> = {}
  for (const method of ["select", "is", "in", "order", "eq", "not"]) {
    query[method] = vi.fn(() => query)
  }
  query.limit = vi.fn(() => Promise.resolve(result))
  return query
}

function mockThreeQueries() {
  const gapChain = chain({ data: [], error: null })
  const eventsChain = chain({ data: [], error: null })
  const mappedChain = chain({ data: [], error: null })
  mocks.createSupabaseAdminClient.mockReturnValue({
    from: vi
      .fn()
      .mockReturnValueOnce(gapChain)
      .mockReturnValueOnce(eventsChain)
      .mockReturnValueOnce(mappedChain),
  })
  return { gapChain, eventsChain, mappedChain }
}

async function loadDocGaps() {
  // 모듈 최상단에서 unstable_cache(...)를 한 번 호출해 캐시 래퍼를 구성하므로, keyParts/tags
  // 배선을 매 테스트 새로 관찰하려면 모듈을 다시 로드해야 한다(ESM 캐시라 재-import만으로는
  // 재실행되지 않는다).
  vi.resetModules()
  unstableCacheCalls.length = 0
  return import("@/lib/chatbot/doc-gaps")
}

describe("listDocGapBacklog cache wiring", () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
  })

  it("wraps the computation in a 60s unstable_cache tagged chatbot-doc-gap-backlog", async () => {
    await loadDocGaps()

    // doc-gaps.ts 는 ./service 를 임포트하고, 그 모듈도 getChatbotStats 용 unstable_cache 를
    // 최상단에서 구성한다 — 이 파일의 배선만 골라내려면 keyParts 로 특정해야 한다.
    const call = unstableCacheCalls.find(
      (entry) => entry.keyParts[0] === "chatbot-doc-gap-backlog-v1"
    )
    expect(call).toBeDefined()
    expect(call?.keyParts).toEqual(["chatbot-doc-gap-backlog-v1"])
    expect(call?.options).toEqual({
      revalidate: 60,
      tags: ["chatbot-doc-gap-backlog"],
    })
  })

  it("keeps the caller's limit in the cache key by threading it into the Supabase query", async () => {
    const { gapChain } = mockThreeQueries()
    const { listDocGapBacklog } = await loadDocGaps()

    await listDocGapBacklog({ limit: 100 })

    expect(gapChain.limit).toHaveBeenCalledWith(100)
  })

  it("defaults the limit to 30 when the caller omits it", async () => {
    const { gapChain } = mockThreeQueries()
    const { listDocGapBacklog } = await loadDocGaps()

    await listDocGapBacklog()

    expect(gapChain.limit).toHaveBeenCalledWith(30)
  })
})
