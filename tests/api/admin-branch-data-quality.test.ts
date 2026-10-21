import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest, NextResponse } from "next/server"
import { snapshot } from "../compass/kr-team.fixture"

const mocks = vi.hoisted(() => ({ auth: vi.fn(), compass: vi.fn(), quality: vi.fn(), sheet: vi.fn(), catalog: vi.fn(), deals: vi.fn() }))
vi.mock("@/lib/admin-auth", () => ({ verifyAdmin: mocks.auth }))
vi.mock("@/lib/compass/kr-team", () => ({ readCompassKrTeam: mocks.compass }))
vi.mock("@/lib/branch/google-sheets", () => ({ envSheetId: () => "sheet", readRangeWithFormat: mocks.sheet }))
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }))
vi.mock("@/lib/repositories/branch-deals", () => ({ listBranchRevDealsFresh: mocks.deals }))
vi.mock("@/lib/repositories/branch-hw", () => ({ listHwInbound: async () => [], listHwOutbound: async () => [], listHwStock: async () => [] }))
vi.mock("@/lib/repositories/hardware-inventory", () => ({ listHardwareItems: mocks.catalog }))
vi.mock("@/lib/branch/computations/data-quality", () => ({ DATA_QUALITY_RULE_COUNT: 9, runDataQuality: mocks.quality }))
import { GET } from "@/app/api/admin/branch/data-quality/route"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.auth.mockResolvedValue(null)
  mocks.sheet.mockResolvedValue([])
  mocks.quality.mockReturnValue([])
  mocks.catalog.mockResolvedValue([{ name: 'STD1', source_aliases: [] }])
  mocks.deals.mockResolvedValue([])
})
const req = () => new NextRequest("http://localhost/api/admin/branch/data-quality")

describe("시트 QC의 현재 Compass 명부 대조", () => {
  it("인증 실패 시 시트와 Compass를 읽지 않는다", async () => {
    mocks.auth.mockResolvedValue(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
    expect((await GET(req())).status).toBe(401)
    expect(mocks.sheet).not.toHaveBeenCalled()
    expect(mocks.compass).not.toHaveBeenCalled()
    expect(mocks.catalog).not.toHaveBeenCalled()
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
    expect(body.checkSources).toEqual({ hardwareCatalog: 'ready', revColors: 'ready' })
    expect(mocks.quality).toHaveBeenCalledWith(expect.objectContaining({ hardwareCatalog: [{ name: 'STD1', source_aliases: [] }], revColorSource: [] }))
  })

  it.each(["not_configured", "unavailable"])("%s를 빈 명부로 바꾸지 않는다", async (state) => {
    mocks.compass.mockResolvedValue({ state, snapshot: null })
    expect((await (await GET(req())).json()).currentRosterState).toBe(state)
    expect(mocks.quality).toHaveBeenCalledWith(expect.objectContaining({ currentKpiMembers: undefined }))
  })

  it("개별 대조 원천 실패를 정상 빈 결과로 숨기지 않는다", async () => {
    mocks.compass.mockResolvedValue({ state: 'not_configured', snapshot: null })
    mocks.catalog.mockRejectedValue(new Error('private-provider-error'))
    mocks.sheet.mockImplementation(async (_id, range: string) => {
      if (range.startsWith("'2. REV'")) throw new Error('private-provider-error')
      return []
    })
    const response = await GET(req())
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.checkSources).toEqual({ hardwareCatalog: 'unavailable', revColors: 'unavailable' })
    expect(JSON.stringify(body)).not.toContain('private-provider-error')
    expect(mocks.quality).toHaveBeenCalledWith(expect.objectContaining({ hardwareCatalog: null, revColorSource: null }))
  })

  it("기존 미러가 있는데 원본이 비었으면 색상 대조 미완료로 보고한다", async () => {
    mocks.compass.mockResolvedValue({ state: 'not_configured', snapshot: null })
    mocks.deals.mockResolvedValue([{ sheet_row: 3, customer_name: 'original' }])
    expect((await (await GET(req())).json()).checkSources.revColors).toBe('unavailable')
    expect(mocks.quality).toHaveBeenCalledWith(expect.objectContaining({ revColorSource: null }))
  })
})
