// marketing-campaigns 저장소 회귀 가드.
// RLS admin-only 테이블이므로 저장소는 반드시 admin(service-role) 클라이언트를 쓴다 →
// 여기서는 createSupabaseAdminClient 를 목킹해 (1) 올바른 테이블/정렬/조인 형태로 조회하는지,
// (2) camelCase 입력 → snake_case payload 로 insert/upsert 하는지, (3) row snake_case →
// 도메인 camelCase 매핑이 양방향으로 맞는지를 고정한다. 실제 DB 는 건드리지 않는다.
import { beforeEach, describe, expect, it, vi } from "vitest"

type Result = { data: unknown; error: unknown }

// 각 테스트가 프로그램 가능한 단일 결과를 세팅한다. builder 는 chainable + thenable 이라
// .select().order() (리스트) 와 .insert().select().single() (단건) 체인 모두 await 시 result 로 resolve.
let result: Result
let builder: ReturnType<typeof makeBuilder>
const fromSpy = vi.fn(() => builder)

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => ({ from: fromSpy })),
}))

import {
  listCampaigns,
  getCampaign,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  addLink,
  removeLink,
} from "@/lib/repositories/marketing-campaigns"

function makeBuilder() {
  const b = {
    select: vi.fn(() => b),
    order: vi.fn(() => b),
    eq: vi.fn(() => b),
    insert: vi.fn(() => b),
    update: vi.fn(() => b),
    delete: vi.fn(() => b),
    upsert: vi.fn(() => b),
    single: vi.fn(() => b),
    // thenable: 체인 어느 지점에서 await 하든 현재 result 로 resolve
    then: (resolve: (v: Result) => void) => resolve(result),
  }
  return b
}

beforeEach(() => {
  result = { data: null, error: null }
  builder = makeBuilder()
  fromSpy.mockClear()
})

describe("listCampaigns", () => {
  it("queries marketing_campaigns with the campaign_links join, orders by created_at desc, and maps snake_case → CampaignWithLinks (links present, no rollup)", async () => {
    result = {
      data: [
        {
          id: "camp-1",
          name: "여름 프로모션",
          objective: "신규 학원 유치",
          status: "active",
          channels: ["email", "meta"],
          starts_at: "2026-07-01",
          ends_at: "2026-07-31",
          budget: 3000000,
          owner: "moon",
          project_id: null,
          created_at: "2026-07-20T00:00:00Z",
          updated_at: "2026-07-21T00:00:00Z",
          campaign_links: [
            {
              id: "link-1",
              campaign_id: "camp-1",
              ref_type: "email_campaign",
              ref_id: "ec-9",
              created_at: "2026-07-20T01:00:00Z",
            },
          ],
        },
      ],
      error: null,
    }

    const campaigns = await listCampaigns()

    expect(fromSpy).toHaveBeenCalledWith("marketing_campaigns")
    expect(builder.select).toHaveBeenCalledWith("*, campaign_links(*)")
    expect(builder.order).toHaveBeenCalledWith("created_at", { ascending: false })

    expect(campaigns).toHaveLength(1)
    const c = campaigns[0]
    expect(c.id).toBe("camp-1")
    expect(c.name).toBe("여름 프로모션")
    expect(c.status).toBe("active")
    expect(c.channels).toEqual(["email", "meta"])
    expect(c.startsAt).toBe("2026-07-01")
    expect(c.endsAt).toBe("2026-07-31")
    expect(c.budget).toBe(3000000)
    expect(c.owner).toBe("moon")
    expect(c.projectId).toBeNull()
    expect(c.createdAt).toBe("2026-07-20T00:00:00Z")
    expect(c.updatedAt).toBe("2026-07-21T00:00:00Z")
    // 링크는 camelCase 로 매핑되고, rollup 은 이 레이어에서 계산하지 않으므로 없어야 한다.
    expect(c.links).toEqual([
      {
        id: "link-1",
        campaignId: "camp-1",
        refType: "email_campaign",
        refId: "ec-9",
        createdAt: "2026-07-20T01:00:00Z",
      },
    ])
    expect(c.rollup).toBeUndefined()
  })

  it("throws when the query errors (surfaces to API layer as 500 → UI degrades)", async () => {
    result = { data: null, error: { message: "relation does not exist" } }
    await expect(listCampaigns()).rejects.toThrow(/relation does not exist/)
  })
})

describe("getCampaign", () => {
  it("returns null when the row is not found (single() errors)", async () => {
    result = { data: null, error: { message: "no rows" } }
    const c = await getCampaign("missing")
    expect(fromSpy).toHaveBeenCalledWith("marketing_campaigns")
    expect(c).toBeNull()
  })
})

describe("createCampaign", () => {
  it("inserts a snake_case payload built from a camelCase input", async () => {
    result = {
      data: {
        id: "camp-new",
        name: "가을 캠페인",
        objective: null,
        status: "planned",
        channels: ["sms"],
        starts_at: "2026-09-01",
        ends_at: null,
        budget: 500000,
        owner: null,
        project_id: null,
        created_at: "2026-08-01T00:00:00Z",
        updated_at: "2026-08-01T00:00:00Z",
      },
      error: null,
    }

    const created = await createCampaign({
      name: "가을 캠페인",
      channels: ["sms"],
      budget: 500000,
      startsAt: "2026-09-01",
    })

    expect(fromSpy).toHaveBeenCalledWith("marketing_campaigns")
    // camelCase → snake_case 변환 + 기본값(status=planned, channels 그대로)을 spot-check.
    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "가을 캠페인",
        status: "planned",
        channels: ["sms"],
        budget: 500000,
        starts_at: "2026-09-01",
      }),
    )
    expect(created.id).toBe("camp-new")
    expect(created.channels).toEqual(["sms"])
    expect(created.budget).toBe(500000)
    expect(created.status).toBe("planned")
  })
})

describe("updateCampaign", () => {
  it("patches only provided fields, mapping camelCase → snake_case (startsAt → starts_at)", async () => {
    result = {
      data: {
        id: "camp-1",
        name: "여름 프로모션",
        objective: null,
        status: "paused",
        channels: [],
        starts_at: "2026-07-05",
        ends_at: null,
        budget: null,
        owner: null,
        project_id: null,
        created_at: "2026-07-20T00:00:00Z",
        updated_at: "2026-07-22T00:00:00Z",
      },
      error: null,
    }

    await updateCampaign("camp-1", { status: "paused", startsAt: "2026-07-05" })

    expect(fromSpy).toHaveBeenCalledWith("marketing_campaigns")
    expect(builder.update).toHaveBeenCalledWith({ status: "paused", starts_at: "2026-07-05" })
    expect(builder.eq).toHaveBeenCalledWith("id", "camp-1")
  })
})

describe("deleteCampaign", () => {
  it("deletes by id (campaign_links cascade via FK)", async () => {
    result = { data: null, error: null }
    await deleteCampaign("camp-1")
    expect(fromSpy).toHaveBeenCalledWith("marketing_campaigns")
    expect(builder.delete).toHaveBeenCalled()
    expect(builder.eq).toHaveBeenCalledWith("id", "camp-1")
  })
})

describe("addLink", () => {
  it("upserts into campaign_links with the right ref_type/ref_id (idempotent on unique conflict)", async () => {
    result = {
      data: {
        id: "link-7",
        campaign_id: "camp-1",
        ref_type: "meta_campaign",
        ref_id: "23851234567890",
        created_at: "2026-07-24T00:00:00Z",
      },
      error: null,
    }

    const link = await addLink("camp-1", "meta_campaign", "23851234567890")

    expect(fromSpy).toHaveBeenCalledWith("campaign_links")
    expect(builder.upsert).toHaveBeenCalledWith(
      { campaign_id: "camp-1", ref_type: "meta_campaign", ref_id: "23851234567890" },
      { onConflict: "campaign_id,ref_type,ref_id" },
    )
    expect(link).toEqual({
      id: "link-7",
      campaignId: "camp-1",
      refType: "meta_campaign",
      refId: "23851234567890",
      createdAt: "2026-07-24T00:00:00Z",
    })
  })
})

describe("removeLink", () => {
  it("deletes the link by id", async () => {
    result = { data: null, error: null }
    await removeLink("link-7")
    expect(fromSpy).toHaveBeenCalledWith("campaign_links")
    expect(builder.delete).toHaveBeenCalled()
    expect(builder.eq).toHaveBeenCalledWith("id", "link-7")
  })
})
