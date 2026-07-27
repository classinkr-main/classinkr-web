// /api/admin/branch/summary — dsh_breakdown 노출 검증.
// 장부 DSH 렌즈의 수치 상세 그리드는 파서가 이미 만드는 DshBreakdownRow[]를
// summary 응답의 dsh_breakdown 필드로 소비한다. breakdown은 팀 필터와 무관한
// Team KR 전사 수치이므로 team 파라미터가 있어도 그대로 실려야 한다.
// dsh_breakdown은 opt-in 필드다(?breakdown=1) — R4 실측상 summary 페이로드의 사실상
// 전부를 이 필드가 차지하는데(53,305B 중 대부분), 소비처는 장부 DSH 수치 그리드
// 한 곳뿐이라 그 요청만 플래그를 보낸다. 플래그가 없으면 키 자체가 응답에서 빠지고,
// KR Team 개요가 쓰는 revenue/deal_mix/data_sources/lastSync 등은 플래그와 무관하게
// 항상 그대로 실린다.
import { NextRequest, NextResponse } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

const verifyAdmin = vi.fn()
const readDshPreferDbWithSource = vi.fn()
const readKpiBlocksPreferDb = vi.fn()
const readRevDealsPreferActiveWithSource = vi.fn()
const summarizeCampaigns = vi.fn()
const getRecentSyncRuns = vi.fn()
const listCachedPublicEvents = vi.fn()
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
  listCachedPublicEvents,
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
  listCachedPublicEvents.mockResolvedValue([])
  getSheetModifiedTime.mockResolvedValue(null)
}

function summaryRequest(query = "") {
  return new NextRequest(`https://classin.kr/api/admin/branch/summary${query}`)
}

describe("GET /api/admin/branch/summary — dsh_breakdown", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("omits dsh_breakdown when the breakdown flag is absent", async () => {
    mockHappyPath()

    const { GET } = await import("@/app/api/admin/branch/summary/route")
    const response = await GET(summaryRequest())

    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json.dsh_breakdown).toBeUndefined()
    expect("dsh_breakdown" in json).toBe(false)
  })

  it("keeps the KR Team overview fields present without the breakdown flag", async () => {
    mockHappyPath()

    const { GET } = await import("@/app/api/admin/branch/summary/route")
    const response = await GET(summaryRequest())

    expect(response.status).toBe(200)
    const json = await response.json()
    // BranchDashboardClient(KR Team 개요)가 소비하는 필드들 — breakdown 플래그와 무관하게
    // 항상 그대로 실려야 한다.
    expect(json.revenue).toBeDefined()
    expect(json.deal_mix).toBeDefined()
    expect(json.data_sources).toBeDefined()
    expect("lastSync" in json).toBe(true)
  })

  it("exposes the parser breakdown rows as dsh_breakdown when breakdown=1", async () => {
    mockHappyPath()

    const { GET } = await import("@/app/api/admin/branch/summary/route")
    const response = await GET(summaryRequest("?breakdown=1"))

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
    const response = await GET(summaryRequest("?team=BD&period=M&month=2026-05&breakdown=1"))

    expect(response.status).toBe(200)
    const json = await response.json()
    // breakdown은 팀 스코프가 없는 전사 수치 — 팀 필터에 깎이지 않고 그대로 노출된다.
    expect(json.dsh_breakdown).toHaveLength(2)
  })

  it("dedupes per-scope duplicated breakdown combos in deal_mix (3중 계상 방지)", async () => {
    // 파서 breakdown은 같은 (kind, category, status_type, channel) 콤보를 스코프별
    // (전사 + 팀 + 멤버 섹션)로 반복 방출한다 — 전사 행은 부분 행들의 합이라 annual이
    // 항상 최대다. deal_mix는 raw 합산이 아니라 dedupeDshByKind(최대-annual 채택)를
    // 거쳐야 한다. 실측 사고: raw 합산 시 전사 연간 목표 10,000,000이 30,000,000으로
    // 3배 부풀고, goal(3.0배)·status(스코프 결측으로 ~2.5배) 배율이 달라 pct도 왜곡됐다.
    const mk = (
      kind: "goal" | "status",
      category: "Software" | "Hardware",
      channel: "Direct" | "Channel",
      annual: number,
    ) => ({
      kind,
      category,
      status_type: "New",
      channel,
      annual,
      quarters: [annual / 4, annual / 4, annual / 4, annual / 4],
      months: { "2026-04": annual / 12 },
    })
    mockHappyPath()
    readDshPreferDbWithSource.mockResolvedValue({
      dsh: {
        rows: [],
        members: {},
        breakdown: [
          // Software New Direct — 전사 60M = 팀 40M + 멤버 20M
          mk("goal", "Software", "Direct", 60_000_000),
          mk("goal", "Software", "Direct", 40_000_000),
          mk("goal", "Software", "Direct", 20_000_000),
          mk("status", "Software", "Direct", 24_000_000),
          mk("status", "Software", "Direct", 16_000_000),
          mk("status", "Software", "Direct", 8_000_000),
          // Hardware New Channel — 단일 담당 콤보(전사=팀=멤버 동액 3행)
          mk("goal", "Hardware", "Channel", 30_000_000),
          mk("goal", "Hardware", "Channel", 30_000_000),
          mk("goal", "Hardware", "Channel", 30_000_000),
          mk("status", "Hardware", "Channel", 9_000_000),
          mk("status", "Hardware", "Channel", 9_000_000),
          mk("status", "Hardware", "Channel", 9_000_000),
        ],
      },
      source: { kind: "mirror", asOf: null },
    })

    const { GET } = await import("@/app/api/admin/branch/summary/route")
    const response = await GET(summaryRequest("?period=Y"))

    expect(response.status).toBe(200)
    const json = await response.json()
    const byCategory = json.deal_mix.by_category as Array<{ name: string; goal: number; actual: number; pct: number }>
    const software = byCategory.find((s) => s.name === "Software")
    const hardware = byCategory.find((s) => s.name === "Hardware")
    // 전사(최대-annual) 값 그대로 — raw 합산이면 Software goal 120M / Hardware goal 90M으로 부푼다.
    expect(software).toMatchObject({ goal: 60_000_000, actual: 24_000_000 })
    expect(software?.pct).toBeCloseTo(40, 5)
    expect(hardware).toMatchObject({ goal: 30_000_000, actual: 9_000_000 })

    const byChannel = json.deal_mix.by_channel as Array<{ name: string; goal: number; actual: number }>
    expect(byChannel.find((s) => s.name === "Direct")).toMatchObject({ goal: 60_000_000, actual: 24_000_000 })
    expect(byChannel.find((s) => s.name === "Channel")).toMatchObject({ goal: 30_000_000, actual: 9_000_000 })
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
