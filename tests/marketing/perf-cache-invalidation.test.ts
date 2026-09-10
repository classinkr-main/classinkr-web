// perf 캐시 무효화 배선 — 캠페인 CRUD·채널 예산·Meta insights 동기화 쓰기 경로 (2026-09-04).
//
// getCachedMarketingPerf(60초 unstable_cache)를 도입하면서, 이 값을 만드는 원천에 쓰는 경로가
// marketing-perf 태그를 무효화하지 않으면 캠페인 편집·예산 저장·Meta 동기화 직후에도 최대 60초
// 동안 옛 perf 수치가 보인다. 이 파일은 그 쓰기 경로들이 성공 시 revalidateTag를 부르는지 고정한다.
import { beforeEach, describe, expect, it, vi } from "vitest"

type Result = { data: unknown; error: unknown }
let result: Result
let builder: ReturnType<typeof makeBuilder>
const fromSpy = vi.fn(() => builder)
const revalidateTag = vi.fn()

function makeBuilder() {
  const b = {
    select: vi.fn(() => b),
    order: vi.fn(() => b),
    eq: vi.fn(() => b),
    gte: vi.fn(() => b),
    lte: vi.fn(() => b),
    insert: vi.fn(() => b),
    update: vi.fn(() => b),
    delete: vi.fn(() => b),
    upsert: vi.fn(() => b),
    single: vi.fn(() => b),
    then: (resolve: (v: Result) => void) => resolve(result),
  }
  return b
}

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => ({ from: fromSpy })),
}))
// marketing-campaigns.ts/channel-budgets.ts/meta-insights-daily.ts는 태그 상수를 얻으려
// lib/repositories/marketing.ts를 임포트하는데, 그 파일이 자체 getCachedAllCampaigns를
// 모듈 스코프에서 unstable_cache로 감싼다 — 이 목이 없으면 임포트 자체가 던진다.
vi.mock("next/cache", () => ({
  revalidateTag,
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}))

beforeEach(() => {
  result = { data: null, error: null }
  builder = makeBuilder()
  fromSpy.mockClear()
  revalidateTag.mockClear()
})

describe("marketing-campaigns.ts 쓰기 경로", () => {
  it("createCampaign 성공 시 marketing-perf 태그를 무효화한다", async () => {
    result = {
      data: {
        id: "camp-new", name: "n", objective: null, status: "planned", channels: [],
        starts_at: null, ends_at: null, budget: null, owner: null, project_id: null,
        created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-01T00:00:00Z",
      },
      error: null,
    }
    const { createCampaign } = await import("@/lib/repositories/marketing-campaigns")
    await createCampaign({ name: "n" })
    expect(revalidateTag).toHaveBeenCalledWith("marketing-perf", "max")
  })

  it("updateCampaign 성공 시 marketing-perf 태그를 무효화한다", async () => {
    result = {
      data: {
        id: "camp-1", name: "n", objective: null, status: "paused", channels: [],
        starts_at: null, ends_at: null, budget: null, owner: null, project_id: null,
        created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-02T00:00:00Z",
      },
      error: null,
    }
    const { updateCampaign } = await import("@/lib/repositories/marketing-campaigns")
    await updateCampaign("camp-1", { status: "paused" })
    expect(revalidateTag).toHaveBeenCalledWith("marketing-perf", "max")
  })

  it("deleteCampaign 성공 시 marketing-perf 태그를 무효화한다", async () => {
    const { deleteCampaign } = await import("@/lib/repositories/marketing-campaigns")
    await deleteCampaign("camp-1")
    expect(revalidateTag).toHaveBeenCalledWith("marketing-perf", "max")
  })

  it("addLink 성공 시 marketing-perf 태그를 무효화한다(스코어보드 링크가 perf에 영향)", async () => {
    result = {
      data: { id: "link-1", campaign_id: "camp-1", ref_type: "meta_campaign", ref_id: "1", created_at: "2026-08-01T00:00:00Z" },
      error: null,
    }
    const { addLink } = await import("@/lib/repositories/marketing-campaigns")
    await addLink("camp-1", "meta_campaign", "1")
    expect(revalidateTag).toHaveBeenCalledWith("marketing-perf", "max")
  })

  it("removeLink 성공 시 marketing-perf 태그를 무효화한다", async () => {
    const { removeLink } = await import("@/lib/repositories/marketing-campaigns")
    await removeLink("camp-1", "link-1")
    expect(revalidateTag).toHaveBeenCalledWith("marketing-perf", "max")
  })
})

describe("channel-budgets.ts 쓰기 경로", () => {
  it("saveChannelBudget 성공 시 marketing-perf 태그를 무효화한다(집행률 KPI에 영향)", async () => {
    result = { data: [], error: null }
    const { saveChannelBudget } = await import("@/lib/repositories/channel-budgets")
    await saveChannelBudget("meta", 1_000_000)
    expect(revalidateTag).toHaveBeenCalledWith("marketing-perf", "max")
  })
})

describe("meta-insights-daily.ts 쓰기 경로(Meta insights 동기화 크론)", () => {
  it("upsertMetaInsightsDaily 가 실제로 행을 적재하면 marketing-perf 태그를 무효화한다", async () => {
    result = { data: null, error: null }
    const { upsertMetaInsightsDaily } = await import("@/lib/repositories/meta-insights-daily")
    await upsertMetaInsightsDaily(
      [
        {
          date: "2026-08-30",
          campaignId: "c1",
          campaignName: "camp",
          spend: 1,
          impressions: 1,
          reach: 1,
          clicks: 1,
          ctr: null,
          cpc: null,
          cpm: null,
          leads: 1,
        },
      ],
      "USD",
    )
    expect(revalidateTag).toHaveBeenCalledWith("marketing-perf", "max")
  })

  it("빈 배열이면 아무것도 쓰지 않고 태그도 건드리지 않는다", async () => {
    const { upsertMetaInsightsDaily } = await import("@/lib/repositories/meta-insights-daily")
    await upsertMetaInsightsDaily([], "USD")
    expect(fromSpy).not.toHaveBeenCalled()
    expect(revalidateTag).not.toHaveBeenCalled()
  })
})
