/**
 * lib/admin-crm-overview.ts 의 getAdminCrmOverview 캐시 배선 계약.
 *
 * 이전에는 인스턴스 모듈 메모(120초 TTL + in-flight promise)였다 — Vercel Fluid
 * 인스턴스가 콜드일 때마다 비어 있어 사실상 항상 콜드 비용을 물었다. unstable_cache(Data
 * Cache)는 인스턴스 간 공유되고 stale-while-revalidate라 콜드 인스턴스에서도 최근에
 * 누군가 데운 값을 즉시 돌려준다. 여기서 고정하는 것:
 *  (a) 비-force 경로는 unstable_cache(buildAdminCrmOverview, ["admin-crm-overview"],
 *      { revalidate: 120, tags: ["admin-crm-overview"] })로 감싼다.
 *  (b) force 경로는 캐시를 우회해 즉시 새로 계산하고, revalidateTag(tag, { expire: 0 })로
 *      태그를 하드 만료해 다음 캐시 읽기가 반드시 새 값을 보게 한다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  createRecordingSupabaseClient,
  type RecordedQueryResolver,
} from "../helpers/recording-supabase-client"

const mocks = vi.hoisted(() => ({
  unstableCache: vi.fn((fn: (...args: unknown[]) => unknown) => fn),
  revalidateTag: vi.fn(),
  getCachedCrmDuplicatePreflightReport: vi.fn(),
  getCrmDuplicatePreflightReport: vi.fn(),
  getNeoCrmTeamReport: vi.fn(),
  getCrmSchemaContractReadiness: vi.fn(),
  getExternalCrmObjectSnapshotTotals: vi.fn(),
  getXiaoshouyiSyncPreflight: vi.fn(),
  getXiaoshouyiSyncSchemaReadiness: vi.fn(),
  getXiaoshouyiWriteSchemaReadiness: vi.fn(),
}))

vi.mock("next/cache", () => ({
  unstable_cache: mocks.unstableCache,
  revalidateTag: mocks.revalidateTag,
}))
vi.mock("@/lib/admin-crm-duplicate-preflight", () => ({
  getCachedCrmDuplicatePreflightReport: mocks.getCachedCrmDuplicatePreflightReport,
  getCrmDuplicatePreflightReport: mocks.getCrmDuplicatePreflightReport,
}))
vi.mock("@/lib/admin-crm-neo", () => ({ getNeoCrmTeamReport: mocks.getNeoCrmTeamReport }))
vi.mock("@/lib/admin-crm-schema-contract", () => ({
  getCrmSchemaContractReadiness: mocks.getCrmSchemaContractReadiness,
}))
vi.mock("@/lib/external-crm/latest-synced-at", () => ({
  EXTERNAL_CRM_SNAPSHOT_OBJECT_KEYS: ["account"],
}))
vi.mock("@/lib/external-crm/object-snapshot", () => ({
  getExternalCrmObjectSnapshotTotals: mocks.getExternalCrmObjectSnapshotTotals,
}))
vi.mock("@/lib/external-crm/xiaoshouyi-sync", () => ({
  getXiaoshouyiSyncPreflight: mocks.getXiaoshouyiSyncPreflight,
  getXiaoshouyiSyncSchemaReadiness: mocks.getXiaoshouyiSyncSchemaReadiness,
}))
vi.mock("@/lib/external-crm/xiaoshouyi-write", () => ({
  getXiaoshouyiWriteSchemaReadiness: mocks.getXiaoshouyiWriteSchemaReadiness,
}))

let fakeRpc = vi.fn()
let fakeFrom: ReturnType<typeof createRecordingSupabaseClient>["client"]["from"]

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ from: fakeFrom, rpc: fakeRpc }),
}))

function setupHappyDependencies() {
  mocks.getCachedCrmDuplicatePreflightReport.mockResolvedValue({ checks: [] })
  mocks.getCrmDuplicatePreflightReport.mockResolvedValue({ checks: [] })
  mocks.getNeoCrmTeamReport.mockResolvedValue({
    ok: true,
    error: null,
    latestSyncedAt: null,
    account: { totalCount: 0, activeInPeriodCount: 0 },
    revenue: { teamTotal: 0, orderCount: 0 },
    order: { amount: 0, count: 0, recent: [] },
    collection: { amount: 0, count: 0, amount30d: 0, count30d: 0 },
  })
  mocks.getCrmSchemaContractReadiness.mockResolvedValue({ checks: [] })
  mocks.getExternalCrmObjectSnapshotTotals.mockResolvedValue({
    activeCount: 0,
    staleCount: 0,
    latestSyncedAt: null,
    error: null,
  })
  mocks.getXiaoshouyiSyncPreflight.mockReturnValue({
    configured: false,
    authMode: "missing",
    missingEnvGroups: [],
    objects: [],
    pageSize: 0,
    maxPages: 0,
  })
  mocks.getXiaoshouyiSyncSchemaReadiness.mockResolvedValue({ checks: [] })
  mocks.getXiaoshouyiWriteSchemaReadiness.mockResolvedValue({ checks: [] })

  const resolve: RecordedQueryResolver = () => ({ data: [], error: null, count: 0 })
  const { client } = createRecordingSupabaseClient(resolve)
  fakeFrom = client.from
  fakeRpc = vi.fn().mockResolvedValue({ data: null, error: { code: "PGRST202", message: "missing" } })
}

async function loadModule() {
  vi.resetModules()
  return import("@/lib/admin-crm-overview")
}

describe("getAdminCrmOverview 캐시 배선", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.unstableCache.mockImplementation((fn: (...args: unknown[]) => unknown) => fn)
    setupHappyDependencies()
  })

  it("unstable_cache(buildAdminCrmOverview, [admin-crm-overview], {revalidate:120, tags:[admin-crm-overview]})로 감싼다", async () => {
    const { getAdminCrmOverview } = await loadModule()

    expect(mocks.unstableCache).toHaveBeenCalledTimes(1)
    expect(mocks.unstableCache).toHaveBeenCalledWith(expect.any(Function), ["admin-crm-overview"], {
      revalidate: 120,
      tags: ["admin-crm-overview"],
    })

    const overview = await getAdminCrmOverview()
    expect(overview.generatedAt).toEqual(expect.any(String))
  })

  it("force가 아니면 캐시된 중복검수 경로를 쓰고 revalidateTag를 부르지 않는다", async () => {
    const { getAdminCrmOverview } = await loadModule()

    await getAdminCrmOverview()

    expect(mocks.getCachedCrmDuplicatePreflightReport).toHaveBeenCalledTimes(1)
    expect(mocks.getCrmDuplicatePreflightReport).not.toHaveBeenCalled()
    expect(mocks.revalidateTag).not.toHaveBeenCalled()
  })

  it("force=true는 캐시를 우회해 새로 계산하고 태그를 즉시 하드 만료한다", async () => {
    const { getAdminCrmOverview } = await loadModule()

    const fresh = await getAdminCrmOverview({ force: true })

    expect(mocks.getCrmDuplicatePreflightReport).toHaveBeenCalledTimes(1)
    expect(mocks.getCachedCrmDuplicatePreflightReport).not.toHaveBeenCalled()
    expect(mocks.getNeoCrmTeamReport).toHaveBeenCalledWith(
      expect.objectContaining({ force: true })
    )
    expect(mocks.revalidateTag).toHaveBeenCalledWith("admin-crm-overview", { expire: 0 })
    expect(fresh.generatedAt).toEqual(expect.any(String))
  })
})
