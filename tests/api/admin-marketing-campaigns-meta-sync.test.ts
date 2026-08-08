import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

/*
 * meta-sync 라우트 계약 — 플랜 계산은 실제 순수함수(buildMetaSyncPlan)를 그대로 쓰고,
 * Graph 조회·저장소만 모킹한다(두 번째 플래너 구현이 생기지 않았음을 함께 고정).
 * 핵심: 생성은 "링크까지" 되어야 created 로 세고, 항목별 실패는 나머지 적용을 막지 않는다.
 */

const mocks = vi.hoisted(() => ({
  verifyAdmin: vi.fn(),
  getMetaCampaignDashboard: vi.fn(),
  listCampaigns: vi.fn(),
  createCampaign: vi.fn(),
  updateCampaign: vi.fn(),
  addLink: vi.fn(),
  deleteCampaign: vi.fn(),
  // vi.mock 팩토리는 호이스트되므로 에러 클래스도 함께 호이스트 블록에 둔다.
  MetaConfigError: class FakeMetaConfigError extends Error {},
}))

const FakeMetaConfigError = mocks.MetaConfigError

vi.mock("@/lib/admin-auth", () => ({ verifyAdmin: mocks.verifyAdmin }))
vi.mock("@/lib/meta/marketing", () => ({
  getMetaCampaignDashboard: mocks.getMetaCampaignDashboard,
  MetaConfigError: mocks.MetaConfigError,
}))
vi.mock("@/lib/repositories/marketing-campaigns", () => ({
  listCampaigns: mocks.listCampaigns,
  createCampaign: mocks.createCampaign,
  updateCampaign: mocks.updateCampaign,
  addLink: mocks.addLink,
  deleteCampaign: mocks.deleteCampaign,
}))

import { POST } from "@/app/api/admin/marketing-campaigns/meta-sync/route"

function metaCampaign(id: string, patch: Record<string, unknown> = {}) {
  return {
    id,
    name: `Meta ${id}`,
    status: "ACTIVE",
    insights: { spend: 0, impressions: 0, reach: 0, clicks: 0, ctr: null, cpc: null, cpm: null, leads: 0 },
    ...patch,
  }
}

function umbrella(id: string, links: Array<{ refType: string; refId: string }>, patch: Record<string, unknown> = {}) {
  return {
    id,
    name: `캠페인 ${id}`,
    objective: null,
    status: "active",
    channels: ["meta"],
    startsAt: null,
    endsAt: null,
    budget: null,
    owner: null,
    projectId: null,
    createdAt: "2026-08-01T00:00:00Z",
    updatedAt: "2026-08-01T00:00:00Z",
    links: links.map((l, i) => ({ id: `l-${i}`, campaignId: id, createdAt: "2026-08-01", ...l })),
    ...patch,
  }
}

const req = () =>
  new NextRequest("http://localhost/api/admin/marketing-campaigns/meta-sync", { method: "POST" })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.verifyAdmin.mockResolvedValue(undefined)
  mocks.getMetaCampaignDashboard.mockResolvedValue({
    account: { id: "act_1", currency: "USD" },
    datePreset: "last_30d",
    campaigns: [],
    summary: {},
  })
  mocks.listCampaigns.mockResolvedValue([])
  mocks.createCampaign.mockImplementation(async (input: { name: string }) => ({
    id: `new-${input.name}`,
    ...input,
  }))
  mocks.updateCampaign.mockResolvedValue({})
  mocks.addLink.mockResolvedValue({ id: "link-1" })
  mocks.deleteCampaign.mockResolvedValue(undefined)
})

describe("POST /api/admin/marketing-campaigns/meta-sync", () => {
  it("미링크 Meta 캠페인을 우산 생성 + 링크로 가져온다", async () => {
    mocks.getMetaCampaignDashboard.mockResolvedValue({
      account: { id: "act_1" },
      campaigns: [metaCampaign("m-1", { name: "여름 HW" })],
      summary: {},
    })

    const response = await POST(req())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.created).toEqual([{ campaignId: "new-여름 HW", metaId: "m-1", name: "여름 HW" }])
    expect(mocks.createCampaign).toHaveBeenCalledWith(
      expect.objectContaining({ name: "여름 HW", channels: ["meta"], status: "active" })
    )
    expect(mocks.addLink).toHaveBeenCalledWith("new-여름 HW", "meta_campaign", "m-1")
  })

  it("미러의 상태 변화를 패치하고 변화 없는 미러는 세기만 한다", async () => {
    mocks.getMetaCampaignDashboard.mockResolvedValue({
      account: { id: "act_1" },
      campaigns: [
        metaCampaign("m-1", { name: "캠페인 c-1", status: "PAUSED" }),
        metaCampaign("m-2", { name: "캠페인 c-2", status: "ACTIVE" }),
      ],
      summary: {},
    })
    mocks.listCampaigns.mockResolvedValue([
      umbrella("c-1", [{ refType: "meta_campaign", refId: "m-1" }]),
      umbrella("c-2", [{ refType: "meta_campaign", refId: "m-2" }]),
    ])

    const body = await (await POST(req())).json()

    expect(mocks.updateCampaign).toHaveBeenCalledWith("c-1", { status: "paused" })
    expect(body.updated).toEqual([
      { campaignId: "c-1", name: "캠페인 c-1", changes: ["status"] },
    ])
    expect(body.unchangedMirrorCount).toBe(1)
    expect(mocks.createCampaign).not.toHaveBeenCalled()
  })

  it("한 건의 적용 실패가 나머지 동기화를 막지 않는다(failed 로 격리)", async () => {
    mocks.getMetaCampaignDashboard.mockResolvedValue({
      account: { id: "act_1" },
      campaigns: [metaCampaign("m-1", { name: "실패건" }), metaCampaign("m-2", { name: "성공건" })],
      summary: {},
    })
    mocks.createCampaign.mockImplementation(async (input: { name: string }) => {
      if (input.name === "실패건") throw new Error("insert failed")
      return { id: `new-${input.name}`, ...input }
    })

    const body = await (await POST(req())).json()

    expect(body.created).toHaveLength(1)
    expect(body.failed).toEqual([{ name: "실패건", error: "insert failed" }])
  })

  it("링크 실패한 생성은 보상 삭제되고 failed 로 보고된다(고아 캠페인 누적 방지)", async () => {
    mocks.getMetaCampaignDashboard.mockResolvedValue({
      account: { id: "act_1" },
      campaigns: [metaCampaign("m-1", { name: "링크실패" })],
      summary: {},
    })
    mocks.addLink.mockRejectedValue(new Error("link failed"))

    const body = await (await POST(req())).json()

    expect(body.created).toEqual([])
    expect(body.failed).toEqual([{ name: "링크실패", error: "link failed" }])
    // 링크 없는 우산은 다음 동기화가 같은 Meta 캠페인을 또 가져오게 만든다 — 반드시 정리.
    expect(mocks.deleteCampaign).toHaveBeenCalledWith("new-링크실패")
  })

  it("보상 삭제까지 실패하면 orphanCampaignId 로 정리 대상을 남긴다", async () => {
    mocks.getMetaCampaignDashboard.mockResolvedValue({
      account: { id: "act_1" },
      campaigns: [metaCampaign("m-1", { name: "고아" })],
      summary: {},
    })
    mocks.addLink.mockRejectedValue(new Error("link failed"))
    mocks.deleteCampaign.mockRejectedValue(new Error("delete failed"))

    const body = await (await POST(req())).json()

    expect(body.failed).toEqual([
      { name: "고아", error: "link failed", orphanCampaignId: "new-고아" },
    ])
  })

  it("Meta 미구성이면 503 + configured:false", async () => {
    mocks.getMetaCampaignDashboard.mockRejectedValue(new FakeMetaConfigError("Missing META_ACCESS_TOKEN"))

    const response = await POST(req())

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({ ok: false, configured: false })
  })

  it("인증 실패 응답은 그대로 통과한다", async () => {
    const { NextResponse } = await import("next/server")
    mocks.verifyAdmin.mockResolvedValue(NextResponse.json({ error: "forbidden" }, { status: 403 }))

    const response = await POST(req())

    expect(response.status).toBe(403)
    expect(mocks.getMetaCampaignDashboard).not.toHaveBeenCalled()
  })
})
