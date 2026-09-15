// 장부 정보 체계화(2026-09-14) — summary 가 "마지막 성공"과 "며칠째 실패"를 싣는다.
// lastSync 는 마지막 런의 종료 시각이라 실패한 런이어도 "방금"으로 보였다(장부 원천 스트립은
// lastError 를 안 봐 시트가 3주째 끊겨도 "sync 방금"). 연속 실패 판정은 크론 알림과 같은
// SSOT(computeSyncFailureStreak)를 쓴다.
import { NextRequest } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

const verifyAdmin = vi.fn()
const readDshPreferDbWithSource = vi.fn()
const readKpiBlocksPreferDb = vi.fn()
const readRevDealsPreferActiveWithSource = vi.fn()
const summarizeCampaigns = vi.fn()
const getRecentSyncRuns = vi.fn()
const listCachedPublicEvents = vi.fn()
const getSheetModifiedTime = vi.fn()

vi.mock("@/lib/admin-auth", () => ({ verifyAdmin, BRANCH_READ_ADMIN_API_ROLES: ["ADMIN"] }))
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }))
vi.mock("@/lib/branch/google-sheets", () => ({ envSheetId: () => "sheet-id", getSheetModifiedTime }))
vi.mock("@/lib/branch/read-dsh-kpi", () => ({ readDshPreferDbWithSource, readKpiBlocksPreferDb }))
vi.mock("@/lib/branch/read-rev-deals", () => ({ readRevDealsPreferActiveWithSource }))
vi.mock("@/lib/branch/computations/campaigns", () => ({ summarizeCampaigns }))
vi.mock("@/lib/repositories/branch-sync", () => ({ getRecentSyncRuns }))
vi.mock("@/lib/repositories/public-events", () => ({ listCachedPublicEvents }))

const PERMISSION = "rev: '2. REV'!A1:CF1000 failed after retries: Error: The caller does not have permission"

function mockBase(runs: unknown[]) {
  verifyAdmin.mockResolvedValue(null)
  readDshPreferDbWithSource.mockResolvedValue({ dsh: { rows: [], members: {}, breakdown: [] }, source: { kind: "mirror", asOf: null } })
  readKpiBlocksPreferDb.mockResolvedValue({ fy: [] })
  readRevDealsPreferActiveWithSource.mockResolvedValue({ deals: [], source: { kind: "mirror", asOf: null } })
  summarizeCampaigns.mockResolvedValue({ count_30d: 0, avg_open_pct: 0, recent: [] })
  getRecentSyncRuns.mockImplementation(async (limit: number) => runs.slice(0, limit))
  listCachedPublicEvents.mockResolvedValue([])
  getSheetModifiedTime.mockResolvedValue(null)
}

describe("GET /api/admin/branch/summary — sync_health", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("reports the last success and consecutive failing days per source", async () => {
    mockBase([
      { started_at: "2026-09-13T08:38:00Z", finished_at: "2026-09-13T08:38:05Z", status: "failed", error: PERMISSION, source: "all" },
      { started_at: "2026-09-12T08:38:00Z", finished_at: "2026-09-12T08:38:05Z", status: "failed", error: PERMISSION, source: "all" },
      { started_at: "2026-09-11T08:38:00Z", finished_at: "2026-09-11T08:38:05Z", status: "failed", error: PERMISSION, source: "all" },
      { started_at: "2026-08-18T02:30:52Z", finished_at: "2026-08-18T02:31:40Z", status: "success", error: null, source: "all" },
    ])

    const { GET } = await import("@/app/api/admin/branch/summary/route")
    const json = await (await GET(new NextRequest("https://classin.kr/api/admin/branch/summary"))).json()

    expect(json.lastSync).toBe("2026-09-13T08:38:05Z") // 기존 계약 유지
    expect(json.sync_health.rev).toEqual({
      failedDays: 3,
      lastSuccessAt: "2026-08-18T02:30:52Z",
      permissionDenied: true,
      truncated: false,
    })
    expect(json.sync_health.hw.failedDays).toBe(0)
  })

  it("reports a healthy source as 0 failing days", async () => {
    mockBase([{ started_at: "2026-09-13T08:38:00Z", finished_at: "2026-09-13T08:38:05Z", status: "success", error: null, source: "all" }])

    const { GET } = await import("@/app/api/admin/branch/summary/route")
    const json = await (await GET(new NextRequest("https://classin.kr/api/admin/branch/summary"))).json()

    expect(json.sync_health.rev).toEqual({ failedDays: 0, lastSuccessAt: "2026-09-13T08:38:00Z", permissionDenied: false, truncated: false })
  })
})
