import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest, NextResponse } from "next/server"
import { snapshot } from "../compass/kr-team.fixture"

const mocks = vi.hoisted(() => ({ auth: vi.fn(), compass: vi.fn(), quality: vi.fn(), sheet: vi.fn() }))
vi.mock("@/lib/admin-auth", () => ({ verifyAdmin: mocks.auth }))
vi.mock("@/lib/compass/kr-team", () => ({ readCompassKrTeam: mocks.compass }))
vi.mock("@/lib/branch/google-sheets", () => ({ envSheetId: () => "sheet", readRangeWithFormat: mocks.sheet }))
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }))
vi.mock("@/lib/repositories/branch-deals", () => ({ listBranchRevDeals: async () => [] }))
vi.mock("@/lib/repositories/branch-hw", () => ({ listHwInbound: async () => [], listHwOutbound: async () => [], listHwStock: async () => [] }))
vi.mock("@/lib/branch/computations/data-quality", () => ({ DATA_QUALITY_RULE_COUNT: 9, runDataQuality: mocks.quality }))
import { GET } from "@/app/api/admin/branch/data-quality/route"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.auth.mockResolvedValue(null)
  mocks.sheet.mockResolvedValue([])
  mocks.quality.mockReturnValue([])
})
const req = () => new NextRequest("http://localhost/api/admin/branch/data-quality")

describe("시트 QC의 현재 Compass 명부 대조", () => {
  it("인증 실패 시 시트와 Compass를 읽지 않는다", async () => {
    mocks.auth.mockResolvedValue(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
    expect((await GET(req())).status).toBe(401)
    expect(mocks.sheet).not.toHaveBeenCalled()
    expect(mocks.compass).not.toHaveBeenCalled()
  })

  it("현재 명부만 전달하고 KPI·매출 원문은 응답에 포함하지 않는다", async () => {
    const data = snapshot()
    mocks.compass.mockResolvedValue({ state: "ready", snapshot: data })
    const response = await GET(req())
    expect(response.status).toBe(200)
    expect(mocks.quality).toHaveBeenCalledWith(expect.objectContaining({ currentKpiMembers: data.roster.map((p) => p.name) }))
    const body = await response.json()
    expect(body.currentRosterState).toBe("ready")
    expect(body.snapshot).toBeUndefined()
    expect(body.roster).toBeUndefined()
  })

  it.each(["not_configured", "unavailable"])("%s를 빈 명부로 바꾸지 않는다", async (state) => {
    mocks.compass.mockResolvedValue({ state, snapshot: null })
    expect((await (await GET(req())).json()).currentRosterState).toBe(state)
    expect(mocks.quality).toHaveBeenCalledWith(expect.objectContaining({ currentKpiMembers: undefined }))
  })
})
