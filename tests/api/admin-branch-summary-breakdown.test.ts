// /api/admin/branch/summary — dsh_breakdown 노출 검증.
// 장부 DSH 렌즈의 수치 상세 그리드는 파서가 이미 만드는 DshBreakdownRow[]를
// summary 응답의 dsh_breakdown 필드로 소비한다. breakdown은 팀 필터와 무관한
// Team KR 전사 수치이므로 team 파라미터가 있어도 그대로 실려야 한다.
import { NextRequest, NextResponse } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

const verifyAdmin = vi.fn()
const readDshPreferDbWithSource = vi.fn()
const readKpiBlocksPreferDb = vi.fn()
const readRevDealsPreferActiveWithSource = vi.fn()
const summarizeCampaigns = vi.fn()
const getRecentSyncRuns = vi.fn()
const listPublicEvents = vi.fn()
const getSheetModifiedTime = vi.fn()

vi.mock("@/lib/admin-auth", () => ({
  verifyAdmin,
  BRANCH_READ_ADMIN_API_ROLES: ["ADMIN"],
}))

// 라우트 모듈 스코프의 readSheetFreshness가 unstable_cache로 감싸져 있어
// Next 런타임 밖에서는 identity 함수로 대체한다(hardware-inventory 테스트와 동일 패턴).
vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
}))

vi.mock("@/lib/branch/google-sheets", () => ({
  envSheetId: () => "sheet-id",
  getSheetModifiedTime,
}))

vi.mock("@/lib/branch/read-dsh-kpi", () => ({
  readDshPreferDbWithSource,
  readKpiBlocksPreferDb,
}))

vi.mock("@/lib/branch/read-rev-deals", () => ({
  readRevDealsPreferActiveWithSource,
}))

vi.mock("@/lib/branch/computations/campaigns", () => ({
  summarizeCampaigns,
}))

vi.mock("@/lib/repositories/branch-sync", () => ({
  getRecentSyncRuns,
}))

vi.mock("@/lib/repositories/public-events", () => ({
  listPublicEvents,
}))

const BREAKDOWN = [
  {
    kind: "goal",
    category: "Software",
    status_type: "New",
    channel: "Direct",
    annual: 60_000_000,
    quarters: [15_000_000, 15_000_000, 15_000_000, 15_000_000],
    months: { "2026-04": 5_000_000, "2026-05": 5_000_000, "2026-06": 5_000_000 },
  },
  {
    kind: "status",
    category: "Software",
    status_type: "New",
    channel: "Direct",
    annual: 24_000_000,
    quarters: [12_000_000, 12_000_000, 0, 0],
    months: { "2026-04": 4_000_000, "2026-05": 4_000_000, "2026-06": 4_000_000 },
  },
]

function mockHappyPath() {
  verifyAdmin.mockResolvedValue(null)
  readDshPreferDbWithSource.mockResolvedValue({
    dsh: { rows: [], members: {}, breakdown: BREAKDOWN },
    source: { kind: "mirror", asOf: null },
  })
  readKpiBlocksPreferDb.mockResolvedValue({ fy: [] })
  readRevDealsPreferActiveWithSource.mockResolvedValue({
    deals: [],
    source: { kind: "mirror", asOf: null },
  })
  summarizeCampaigns.mockResolvedValue({ count_30d: 0, avg_open_pct: 0, recent: [] })
  getRecentSyncRuns.mockResolvedValue([])
  listPublicEvents.mockResolvedValue([])
  getSheetModifiedTime.mockResolvedValue(null)
}

function summaryRequest(query = "") {
  return new NextRequest(`https://classin.kr/api/admin/branch/summary${query}`)
}

describe("GET /api/admin/branch/summary — dsh_breakdown", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("exposes the parser breakdown rows as dsh_breakdown", async () => {
    mockHappyPath()

    const { GET } = await import("@/app/api/admin/branch/summary/route")
    const response = await GET(summaryRequest())

    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json.dsh_breakdown).toBeDefined()
    expect(json.dsh_breakdown).toHaveLength(2)
    expect(json.dsh_breakdown[0]).toHaveProperty("quarters")
    expect(json.dsh_breakdown[0]).toMatchObject({
      kind: "goal",
      category: "Software",
      status_type: "New",
      channel: "Direct",
      annual: 60_000_000,
    })
  })

  it("keeps dsh_breakdown company-wide even with a team filter", async () => {
    mockHappyPath()

    const { GET } = await import("@/app/api/admin/branch/summary/route")
    const response = await GET(summaryRequest("?team=BD&period=M&month=2026-05"))

    expect(response.status).toBe(200)
    const json = await response.json()
    // breakdown은 팀 스코프가 없는 전사 수치 — 팀 필터에 깎이지 않고 그대로 노출된다.
    expect(json.dsh_breakdown).toHaveLength(2)
  })

  it("returns the guard response when verifyAdmin rejects", async () => {
    const denied = NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    verifyAdmin.mockResolvedValue(denied)

    const { GET } = await import("@/app/api/admin/branch/summary/route")
    const response = await GET(summaryRequest())

    expect(response.status).toBe(401)
    expect(readDshPreferDbWithSource).not.toHaveBeenCalled()
  })

  it("exposes data_sources with the import run's captured time and runId", async () => {
    mockHappyPath()
    readRevDealsPreferActiveWithSource.mockResolvedValue({
      deals: [],
      source: { kind: "import", asOf: "2026-07-03T01:00:00Z", runId: "run-abc123" },
    })
    getRecentSyncRuns.mockResolvedValue([
      { finished_at: "2026-07-16T09:00:00Z", started_at: "2026-07-16T08:55:00Z", status: "success" },
    ])

    const { GET } = await import("@/app/api/admin/branch/summary/route")
    const response = await GET(summaryRequest())
    const json = await response.json()

    expect(json.data_sources.rev).toEqual({
      kind: "import",
      asOf: "2026-07-03T01:00:00Z",
      runId: "run-abc123",
    })
    // DSH stayed on the mirror mock — its asOf falls back to lastSync (no extra query).
    expect(json.data_sources.dsh).toEqual({ kind: "mirror", asOf: "2026-07-16T09:00:00Z" })
    expect(json.lastSync).toBe("2026-07-16T09:00:00Z")
  })

  it("falls back to lastSync for a mirror-sourced REV read (no runId)", async () => {
    mockHappyPath()
    getRecentSyncRuns.mockResolvedValue([
      { finished_at: "2026-07-16T09:00:00Z", started_at: "2026-07-16T08:55:00Z", status: "success" },
    ])

    const { GET } = await import("@/app/api/admin/branch/summary/route")
    const response = await GET(summaryRequest())
    const json = await response.json()

    expect(json.data_sources.rev).toEqual({ kind: "mirror", asOf: "2026-07-16T09:00:00Z" })
    expect(json.data_sources.rev.runId).toBeUndefined()
  })
})
