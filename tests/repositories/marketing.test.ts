// getCachedAllCampaigns 캐시 + createCampaign/updateCampaign 무효화 배선 회귀 가드.
// branch summary의 campaigns_30d/campaigns_recent(lib/branch/computations/campaigns.ts의
// summarizeCampaigns)는 이제 getAllCampaigns 대신 getCachedAllCampaigns(60초 unstable_cache)를
// 쓴다. 이 테스트는 (1) 캐시가 실제로 재조회를 막는지, (2) createCampaign/updateCampaign이
// 태그를 무효화해 "방금 보낸/갱신한 캠페인이 최대 60초간 요약에 안 보이는" 회귀를 막는지 고정한다.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

function marketingClient(campaignRows: unknown[]) {
  let selectCalls = 0
  let insertCalls = 0
  let updateCalls = 0

  const from = vi.fn(() => ({
    select: () => {
      selectCalls += 1
      return {
        order: () => ({
          range: () => Promise.resolve({ data: campaignRows, error: null }),
        }),
      }
    },
    insert: () => {
      insertCalls += 1
      return {
        select: () => ({
          single: () =>
            Promise.resolve({
              data: {
                id: "c1",
                subject: "제목",
                body: "본문",
                target_tags: [],
                status: "sent",
                sent_at: null,
                recipient_count: 0,
                open_count: 0,
                external_id: null,
                created_at: "2026-07-01T00:00:00Z",
              },
              error: null,
            }),
        }),
      }
    },
    update: () => {
      updateCalls += 1
      return { eq: () => Promise.resolve({ error: null }) }
    },
  }))

  return {
    from,
    get selectCalls() { return selectCalls },
    get insertCalls() { return insertCalls },
    get updateCalls() { return updateCalls },
  }
}

let capturedTags: Record<string, string[]> = {}
const revalidateTag = vi.fn()

async function loadRepository(campaignRows: unknown[] = []) {
  vi.resetModules()
  capturedTags = {}
  revalidateTag.mockClear()
  // marketing.ts는 프로덕션/Vercel 밖에서 기본적으로 JSON 폴백을 쓴다 — 실제 Supabase 경로
  // (getAllCampaigns/createCampaign/updateCampaign)를 검증하려면 명시적으로 켜야 한다.
  process.env.USE_SUPABASE_MARKETING = "true"
  const client = marketingClient(campaignRows)

  vi.doMock("@/lib/supabase/admin", () => ({
    createSupabaseAdminClient: vi.fn(() => client),
  }))

  vi.doMock("next/cache", () => {
    const stores = new Map<string, Map<string, unknown>>()
    return {
      revalidateTag,
      unstable_cache: (
        fn: (...args: unknown[]) => Promise<unknown>,
        keyParts: string[],
        options?: { tags?: string[] },
      ) => {
        const cacheKey = keyParts.join("|")
        capturedTags[cacheKey] = options?.tags ?? []
        if (!stores.has(cacheKey)) stores.set(cacheKey, new Map())
        const store = stores.get(cacheKey)!
        return async (...args: unknown[]) => {
          const argsKey = JSON.stringify(args)
          if (store.has(argsKey)) return store.get(argsKey)
          const result = await fn(...args)
          store.set(argsKey, result)
          return result
        }
      },
    }
  })

  const repository = await import("@/lib/repositories/marketing")
  return { repository, client }
}

describe("getCachedAllCampaigns caching", () => {
  beforeEach(() => {
    delete process.env.USE_SUPABASE_MARKETING
  })

  afterEach(() => {
    delete process.env.USE_SUPABASE_MARKETING
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("tags the cache with MARKETING_CAMPAIGNS_CACHE_TAG", async () => {
    const { repository } = await loadRepository([])
    await repository.getCachedAllCampaigns()
    expect(capturedTags["marketing-campaigns-default"]).toEqual([repository.MARKETING_CAMPAIGNS_CACHE_TAG])
  })

  it("reuses the cached campaign list instead of re-querying Supabase", async () => {
    const { repository, client } = await loadRepository([
      { id: "c1", subject: "s", body: "b", target_tags: [], status: "sent", sent_at: "2026-07-01T00:00:00Z", recipient_count: 10, open_count: 5, external_id: null, created_at: "2026-07-01T00:00:00Z" },
    ])

    await repository.getCachedAllCampaigns()
    await repository.getCachedAllCampaigns()

    expect(client.selectCalls).toBe(1)
  })

  it("createCampaign revalidates the tag so a newly created campaign is immediately visible", async () => {
    const { repository, client } = await loadRepository([])

    await repository.createCampaign({
      subject: "제목",
      body: "본문",
      targetTags: [],
      status: "sent",
      recipientCount: 0,
    })

    expect(client.insertCalls).toBe(1)
    expect(revalidateTag).toHaveBeenCalledWith(repository.MARKETING_CAMPAIGNS_CACHE_TAG, "max")
  })

  it("updateCampaign revalidates the tag so updated open/recipient counts are immediately visible", async () => {
    const { repository, client } = await loadRepository([])

    await repository.updateCampaign("c1", { openCount: 3 })

    expect(client.updateCalls).toBe(1)
    expect(revalidateTag).toHaveBeenCalledWith(repository.MARKETING_CAMPAIGNS_CACHE_TAG, "max")
  })
})
