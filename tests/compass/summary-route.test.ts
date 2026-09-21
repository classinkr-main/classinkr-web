import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest, NextResponse } from "next/server"

// GET /api/admin/crm/compass-summary — 역할 가드·period 검증·응답 형태·캐시 헤더 계약(§13 D1).
// 집계 로직 자체는 lib/compass/summary.ts 몫이라 여기서는 buildCompassSummary를 통째로
// 목으로 세우고 라우트 배선만 본다(compass-pipeline 라우트 테스트와 같은 층위).

const mocks = vi.hoisted(() => ({
  requireVerifiedAdminContext: vi.fn(),
  buildCompassSummary: vi.fn(),
}))

vi.mock("@/lib/admin-auth", () => ({
  CRM_STAFF_ADMIN_API_ROLES: ["SUPER_ADMIN", "ADMIN", "BRANCH", "EDITOR"],
  requireVerifiedAdminContext: mocks.requireVerifiedAdminContext,
}))
vi.mock("@/lib/compass/summary", () => ({
  buildCompassSummary: mocks.buildCompassSummary,
}))

const SUMMARY_STUB = {
  period: { key: "7d", since: "2026-09-14T00:00:00+09:00", until: "2026-09-20T00:00:00.000Z" },
  generatedAt: "2026-09-20T00:00:00.000Z",
  down: false,
  truncated: false,
  inflowTotal: 3,
  byPlatform: [{ key: "meta", label: "메타", count: 2 }],
  metaInflow: 2,
  stages: [],
  lost: 0,
  neoRegistered: 0,
  won: 0,
  careStages: [],
  bdOpen: 0,
  todayDemoCount: 0,
  byOwner: [],
  lostReasons: [],
  upcomingActions: [],
  upcomingActionCount: 0,
}

async function loadRoute() {
  return import("@/app/api/admin/crm/compass-summary/route")
}

describe("GET /api/admin/crm/compass-summary", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireVerifiedAdminContext.mockResolvedValue({ userId: "admin-1", role: "ADMIN" })
    mocks.buildCompassSummary.mockResolvedValue(SUMMARY_STUB)
  })

  it("역할 가드가 거부하면 그대로 응답하고 조회하지 않는다", async () => {
    mocks.requireVerifiedAdminContext.mockResolvedValue(
      NextResponse.json({ error: "forbidden" }, { status: 403 })
    )
    const { GET } = await loadRoute()
    const response = await GET(new NextRequest("https://classin.kr/api/admin/crm/compass-summary"))

    expect(response.status).toBe(403)
    expect(mocks.buildCompassSummary).not.toHaveBeenCalled()
  })

  it("period 생략 시 기본값(7d)으로 조회한다", async () => {
    const { GET } = await loadRoute()
    await GET(new NextRequest("https://classin.kr/api/admin/crm/compass-summary"))

    expect(mocks.buildCompassSummary).toHaveBeenCalledWith("7d")
  })

  it.each(["7d", "30d", "90d"])("유효한 period=%s를 그대로 전달한다", async (period) => {
    const { GET } = await loadRoute()
    await GET(new NextRequest(`https://classin.kr/api/admin/crm/compass-summary?period=${period}`))

    expect(mocks.buildCompassSummary).toHaveBeenCalledWith(period)
  })

  it("잘못된 period는 400을 반환하고 조회하지 않는다", async () => {
    const { GET } = await loadRoute()
    const response = await GET(
      new NextRequest("https://classin.kr/api/admin/crm/compass-summary?period=365d")
    )

    expect(response.status).toBe(400)
    expect(mocks.buildCompassSummary).not.toHaveBeenCalled()
  })

  it("성공하면 adminCachedJson 캐시 헤더와 함께 요약을 그대로 반환한다", async () => {
    const { GET } = await loadRoute()
    const response = await GET(
      new NextRequest("https://classin.kr/api/admin/crm/compass-summary?period=7d")
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual(SUMMARY_STUB)
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=30, stale-while-revalidate=120")
  })

  it("buildCompassSummary가 던지면 500을 반환한다(무음 실패 금지)", async () => {
    mocks.buildCompassSummary.mockRejectedValue(new Error("boom"))
    const { GET } = await loadRoute()
    const response = await GET(new NextRequest("https://classin.kr/api/admin/crm/compass-summary"))

    expect(response.status).toBe(500)
  })
})
