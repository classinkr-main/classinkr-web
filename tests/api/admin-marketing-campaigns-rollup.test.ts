import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { emptyCampaignLinkLabels } from "@/lib/marketing/campaign-labels"

/*
 * 목록 라우트 계약 — "리스트에도 롤업을, 단 N+1 없이".
 *
 * 캠페인 N건이어도 소스 수집(gatherRollupSources)은 요청당 1회여야 하고, 캠페인별 롤업은
 * 그 수집 결과로 메모리에서 계산된다. 롤업 계산(computeCampaignRollup)과 라벨 enrichment
 * (withLinkLabels)는 실제 구현을 그대로 쓴다 — 두 번째 롤업 구현이 생기지 않았음을 함께 고정한다.
 */

const mocks = vi.hoisted(() => ({
  verifyAdmin: vi.fn(),
  listCampaigns: vi.fn(),
  createCampaign: vi.fn(),
  gatherRollupSources: vi.fn(),
}))

vi.mock("@/lib/admin-auth", () => ({ verifyAdmin: mocks.verifyAdmin }))
vi.mock("@/lib/repositories/marketing-campaigns", () => ({
  listCampaigns: mocks.listCampaigns,
  createCampaign: mocks.createCampaign,
}))
vi.mock("@/lib/marketing/campaign-rollup-sources", () => ({
  gatherRollupSources: mocks.gatherRollupSources,
}))

import { GET } from "@/app/api/admin/marketing-campaigns/route"

type Link = {
  id: string
  campaignId: string
  refType: "email_campaign" | "sms_campaign" | "event" | "meta_campaign"
  refId: string
  createdAt: string
}

function link(refType: Link["refType"], refId: string, campaignId: string): Link {
  return { id: `link-${refType}-${refId}-${campaignId}`, campaignId, refType, refId, createdAt: "2026-07-24" }
}

function campaign(id: string, links: Link[]) {
  return {
    id,
    name: `캠페인 ${id}`,
    objective: null,
    status: "active",
    channels: [],
    startsAt: null,
    endsAt: null,
    budget: null,
    owner: null,
    projectId: null,
    createdAt: "2026-07-20T00:00:00Z",
    updatedAt: "2026-07-20T00:00:00Z",
    links,
  }
}

const req = () => new NextRequest("http://localhost/api/admin/marketing-campaigns")

beforeEach(() => {
  mocks.verifyAdmin.mockReset()
  mocks.verifyAdmin.mockResolvedValue(undefined) // 인증 통과
  mocks.listCampaigns.mockReset()
  mocks.gatherRollupSources.mockReset()

  const labels = emptyCampaignLinkLabels()
  labels.email_campaign["e-1"] = "7월 뉴스레터"
  labels.sms_campaign["s-1"] = "개학 특가 안내"
  mocks.gatherRollupSources.mockResolvedValue({
    sources: {
      emailCampaigns: { "e-1": { recipientCount: 1200, openCount: 380 } },
      smsCampaigns: { "s-1": { recipientCount: 340 } },
      eventMetrics: {},
      metaCampaigns: { "m-1": { spend: 120.5, leads: 7, currency: "USD" } },
    },
    labels,
  })
})

describe("GET /api/admin/marketing-campaigns", () => {
  it("캠페인 3건이어도 소스 수집은 1회 — 전체 링크를 합쳐 한 번만 넘긴다", async () => {
    mocks.listCampaigns.mockResolvedValue([
      campaign("camp-1", [link("email_campaign", "e-1", "camp-1"), link("meta_campaign", "m-1", "camp-1")]),
      campaign("camp-2", [link("email_campaign", "e-1", "camp-2"), link("sms_campaign", "s-1", "camp-2")]),
      campaign("camp-3", []),
    ])

    const res = await GET(req())

    expect(res.status).toBe(200)
    expect(mocks.gatherRollupSources).toHaveBeenCalledTimes(1)
    const passedLinks = mocks.gatherRollupSources.mock.calls[0][0] as Link[]
    expect(passedLinks).toHaveLength(4)
    expect(passedLinks.map((l) => l.refId)).toEqual(["e-1", "m-1", "e-1", "s-1"])
  })

  it("캠페인마다 자기 링크만으로 롤업을 계산한다(수집 결과 재사용)", async () => {
    mocks.listCampaigns.mockResolvedValue([
      campaign("camp-1", [link("email_campaign", "e-1", "camp-1"), link("meta_campaign", "m-1", "camp-1")]),
      campaign("camp-2", [link("email_campaign", "e-1", "camp-2"), link("sms_campaign", "s-1", "camp-2")]),
      campaign("camp-3", []),
    ])

    const body = await (await GET(req())).json()
    const [c1, c2, c3] = body.campaigns

    expect(c1.rollup).toEqual({
      emailRecipients: 1200,
      emailOpens: 380,
      smsRecipients: 0,
      eventLeads: 0,
      eventDeals: 0,
      eventRevenue: null,
      metaSpend: 120.5,
      metaCurrency: "USD", // Meta 는 계정 통화 네이티브 — KRW 로 접지 않는다
      metaLeads: 7,
      linkedCounts: { email: 1, sms: 0, event: 0, meta: 1 },
    })
    expect(c2.rollup).toMatchObject({
      emailRecipients: 1200,
      smsRecipients: 340,
      metaSpend: null, // Meta 링크 없음 → 0 이 아니라 null
      metaCurrency: null,
      metaLeads: 0,
      linkedCounts: { email: 1, sms: 1, event: 0, meta: 0 },
    })
    // 링크 0건 캠페인도 rollup 을 받는다(UI 가 "연결 없음"을 그릴 수 있도록).
    expect(c3.rollup).toMatchObject({
      emailRecipients: 0,
      eventRevenue: null,
      metaSpend: null,
      linkedCounts: { email: 0, sms: 0, event: 0, meta: 0 },
    })
  })

  it("링크에 라벨을 실어 보내고, 해석 안 된 refId 는 라벨 없이 raw id 로 남긴다", async () => {
    mocks.listCampaigns.mockResolvedValue([
      campaign("camp-1", [link("email_campaign", "e-1", "camp-1"), link("meta_campaign", "m-1", "camp-1")]),
    ])

    const body = await (await GET(req())).json()
    const links = body.campaigns[0].links

    expect(links[0]).toMatchObject({ refId: "e-1", label: "7월 뉴스레터" })
    expect(links[1].refId).toBe("m-1")
    expect(links[1].label).toBeUndefined() // 라벨 조작 금지 — UI 가 raw id 폴백
  })

  it("목록 조회가 throw 하면 500 으로 강등한다(크래시 없음)", async () => {
    mocks.listCampaigns.mockRejectedValue(new Error("relation \"marketing_campaigns\" does not exist"))

    const res = await GET(req())

    expect(res.status).toBe(500)
    expect(mocks.gatherRollupSources).not.toHaveBeenCalled()
  })

  it("인증 실패면 그대로 반환하고 데이터에 손대지 않는다", async () => {
    mocks.verifyAdmin.mockResolvedValue(new Response("forbidden", { status: 403 }))

    const res = await GET(req())

    expect(res.status).toBe(403)
    expect(mocks.listCampaigns).not.toHaveBeenCalled()
    expect(mocks.gatherRollupSources).not.toHaveBeenCalled()
  })
})
