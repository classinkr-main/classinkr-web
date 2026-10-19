/**
 * CRM 홈 "외부 CRM sync check: …" 에 NEO 실행 기록의 원문 오류가 새지 않는지(2026-09-25 리뷰).
 *
 * getExternalSnapshotOverview 는 external_crm_sync_runs 최신 행이 failed 면 externalSnapshots.error 에
 * 사유를 싣고, CRM 홈(CrmOperationsDashboard)이 그 문자열을 그대로 렌더한다. 원문에는 키·토큰·내부 URL 이
 * 섞일 수 있어 동기화 경고 띠와 같은 분류 라벨(classifySyncFailure("neo", …))로만 말한다.
 * Supabase 조회 오류 문구 형식은 기존 그대로다. "최신 동기화 시각 = 성공 실행만" 규칙도 함께 고정한다.
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

const RAW_NEO_ERROR =
  "Xiaoshouyi request failed: 401 Unauthorized https://api-internal.example/oauth2/token?client_secret=sk-LEAK"

function setupDependencies(latestRun: Record<string, unknown> | null) {
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
    activeCount: 10,
    staleCount: 0,
    latestSyncedAt: "2026-08-28T02:05:00.000Z",
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

  const resolve: RecordedQueryResolver = (query) =>
    query.table === "external_crm_sync_runs"
      ? { data: latestRun ? [latestRun] : [], error: null, count: null }
      : { data: [], error: null, count: 0 }
  const { client } = createRecordingSupabaseClient(resolve)
  fakeFrom = client.from
  fakeRpc = vi.fn().mockResolvedValue({ data: null, error: { code: "PGRST202", message: "missing" } })
}

async function loadOverview() {
  vi.resetModules()
  const { getAdminCrmOverview } = await import("@/lib/admin-crm-overview")
  return getAdminCrmOverview({ force: true })
}

describe("getExternalSnapshotOverview — 실행 기록 원문 오류 대신 분류 라벨", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.unstableCache.mockImplementation((fn: (...args: unknown[]) => unknown) => fn)
  })

  it("최신 NEO 실행이 실패면 분류 라벨만 싣고 원문(URL·키)은 싣지 않는다", async () => {
    setupDependencies({
      status: "failed",
      object_api_key: "__sync_lock__",
      started_at: "2026-09-24T01:00:00.000Z",
      finished_at: "2026-09-24T01:03:00.000Z",
      error: RAW_NEO_ERROR,
    })

    const { externalSnapshots } = await loadOverview()

    expect(externalSnapshots.ok).toBe(false)
    expect(externalSnapshots.error).toBe("external_crm_sync_runs latest failed: 권한 오류")
    expect(externalSnapshots.error).not.toContain("api-internal")
    expect(externalSnapshots.error).not.toContain("sk-LEAK")
    // 실패 실행의 finished_at 은 최신 동기화 시각이 아니다 — 레코드 synced_at(08-28)이 남는다.
    expect(externalSnapshots.latestSyncedAt).toBe("2026-08-28T02:05:00.000Z")
  })

  it("오류 문구가 비어 있으면 접미사 없이 실패만 알린다", async () => {
    setupDependencies({ status: "failed", object_api_key: "__sync_lock__", started_at: "2026-09-24T01:00:00.000Z", finished_at: null, error: "  " })

    const { externalSnapshots } = await loadOverview()

    expect(externalSnapshots.error).toBe("external_crm_sync_runs latest failed")
  })

  it("성공 실행이면 오류가 없고 그 finished_at 이 최신 동기화 시각이 된다", async () => {
    setupDependencies({
      status: "success",
      object_api_key: "__sync_lock__",
      started_at: "2026-09-24T01:00:00.000Z",
      finished_at: "2026-09-24T01:04:00.000Z",
      error: null,
    })

    const { externalSnapshots } = await loadOverview()

    expect(externalSnapshots.ok).toBe(true)
    expect(externalSnapshots.error).toBeNull()
    expect(externalSnapshots.latestSyncedAt).toBe("2026-09-24T01:04:00.000Z")
  })
})
