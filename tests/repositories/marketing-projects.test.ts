// marketing-projects 저장소 회귀 가드.
// RLS admin-only 테이블이므로 저장소는 반드시 admin(service-role) 클라이언트를 쓴다 →
// 여기서는 createSupabaseAdminClient 를 목킹해 (1) 올바른 테이블/정렬/필터/조인 형태로
// 조회하는지, (2) camelCase 입력 → snake_case payload 로 insert/update 하는지, (3) row
// snake_case → 도메인 camelCase 매핑이 양방향으로 맞는지를 고정한다. 실제 DB 는 건드리지 않는다.
import { beforeEach, describe, expect, it, vi } from "vitest"

type Result = { data: unknown; error: unknown }

// 각 테스트가 프로그램 가능한 단일 결과를 세팅한다. builder 는 chainable + thenable 이라
// .select().order() (리스트) 와 .insert().select().single() (단건), .update().eq() (배정)
// 체인 모두 await 시 result 로 resolve.
let result: Result
let builder: ReturnType<typeof makeBuilder>
const fromSpy = vi.fn(() => builder)

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => ({ from: fromSpy })),
}))

import {
  listProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  assignCampaignToProject,
  listCampaignsByProject,
} from "@/lib/repositories/marketing-projects"

function makeBuilder() {
  const b = {
    select: vi.fn(() => b),
    order: vi.fn(() => b),
    eq: vi.fn(() => b),
    insert: vi.fn(() => b),
    update: vi.fn(() => b),
    delete: vi.fn(() => b),
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

describe("listProjects", () => {
  it("queries marketing_projects, orders by created_at desc, and maps snake_case → MarketingProject", async () => {
    result = {
      data: [
        {
          id: "proj-1",
          name: "2026 하반기 그로스",
          objective: "신규 학원 300곳",
          status: "active",
          starts_at: "2026-07-01",
          ends_at: "2026-12-31",
          budget: 50000000,
          owner: "moon",
          created_at: "2026-07-20T00:00:00Z",
          updated_at: "2026-07-21T00:00:00Z",
        },
      ],
      error: null,
    }

    const projects = await listProjects()

    expect(fromSpy).toHaveBeenCalledWith("marketing_projects")
    expect(builder.order).toHaveBeenCalledWith("created_at", { ascending: false })

    expect(projects).toHaveLength(1)
    const p = projects[0]
    expect(p.id).toBe("proj-1")
    expect(p.name).toBe("2026 하반기 그로스")
    expect(p.objective).toBe("신규 학원 300곳")
    expect(p.status).toBe("active")
    expect(p.startsAt).toBe("2026-07-01")
    expect(p.endsAt).toBe("2026-12-31")
    expect(p.budget).toBe(50000000)
    expect(p.owner).toBe("moon")
    expect(p.createdAt).toBe("2026-07-20T00:00:00Z")
    expect(p.updatedAt).toBe("2026-07-21T00:00:00Z")
  })

  it("throws when the query errors (surfaces to API layer as 500 → UI degrades)", async () => {
    result = { data: null, error: { message: "relation does not exist" } }
    await expect(listProjects()).rejects.toThrow(/relation does not exist/)
  })
})

describe("getProject", () => {
  it("returns null when the row is not found (single() errors)", async () => {
    result = { data: null, error: { message: "no rows" } }
    const p = await getProject("missing")
    expect(fromSpy).toHaveBeenCalledWith("marketing_projects")
    expect(p).toBeNull()
  })
})

describe("createProject", () => {
  it("inserts a snake_case payload built from a camelCase input (status defaults to 'active')", async () => {
    result = {
      data: {
        id: "proj-new",
        name: "봄 온보딩",
        objective: null,
        status: "active",
        starts_at: "2026-03-01",
        ends_at: null,
        budget: 8000000,
        owner: null,
        created_at: "2026-02-01T00:00:00Z",
        updated_at: "2026-02-01T00:00:00Z",
      },
      error: null,
    }

    const created = await createProject({
      name: "봄 온보딩",
      budget: 8000000,
      startsAt: "2026-03-01",
    })

    expect(fromSpy).toHaveBeenCalledWith("marketing_projects")
    // camelCase → snake_case 변환 + DB DEFAULT 'active' 미러를 spot-check.
    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "봄 온보딩",
        status: "active",
        budget: 8000000,
        starts_at: "2026-03-01",
      }),
    )
    expect(created.id).toBe("proj-new")
    expect(created.status).toBe("active")
    expect(created.budget).toBe(8000000)
  })
})

describe("updateProject", () => {
  it("patches only provided fields, mapping camelCase → snake_case (startsAt → starts_at)", async () => {
    result = {
      data: {
        id: "proj-1",
        name: "2026 하반기 그로스",
        objective: null,
        status: "paused",
        starts_at: "2026-08-01",
        ends_at: null,
        budget: null,
        owner: null,
        created_at: "2026-07-20T00:00:00Z",
        updated_at: "2026-07-22T00:00:00Z",
      },
      error: null,
    }

    await updateProject("proj-1", { status: "paused", startsAt: "2026-08-01" })

    expect(fromSpy).toHaveBeenCalledWith("marketing_projects")
    expect(builder.update).toHaveBeenCalledWith({ status: "paused", starts_at: "2026-08-01" })
    expect(builder.eq).toHaveBeenCalledWith("id", "proj-1")
  })
})

describe("deleteProject", () => {
  it("deletes by id (member campaigns' project_id set null via FK)", async () => {
    result = { data: null, error: null }
    await deleteProject("proj-1")
    expect(fromSpy).toHaveBeenCalledWith("marketing_projects")
    expect(builder.delete).toHaveBeenCalled()
    expect(builder.eq).toHaveBeenCalledWith("id", "proj-1")
  })
})

describe("assignCampaignToProject", () => {
  it("assigns a campaign to a project (updates marketing_campaigns.project_id)", async () => {
    result = { data: null, error: null }
    await assignCampaignToProject("camp-1", "proj-1")
    expect(fromSpy).toHaveBeenCalledWith("marketing_campaigns")
    expect(builder.update).toHaveBeenCalledWith({ project_id: "proj-1" })
    expect(builder.eq).toHaveBeenCalledWith("id", "camp-1")
  })

  it("unassigns a campaign when projectId is null (project_id → null)", async () => {
    result = { data: null, error: null }
    await assignCampaignToProject("camp-1", null)
    expect(fromSpy).toHaveBeenCalledWith("marketing_campaigns")
    expect(builder.update).toHaveBeenCalledWith({ project_id: null })
    expect(builder.eq).toHaveBeenCalledWith("id", "camp-1")
  })
})

describe("listCampaignsByProject", () => {
  it("filters marketing_campaigns by project_id, joins campaign_links, and maps to CampaignWithLinks", async () => {
    result = {
      data: [
        {
          id: "camp-1",
          name: "여름 프로모션",
          objective: null,
          status: "active",
          channels: ["email", "meta"],
          starts_at: "2026-07-01",
          ends_at: "2026-07-31",
          budget: 3000000,
          owner: "moon",
          project_id: "proj-1",
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

    const campaigns = await listCampaignsByProject("proj-1")

    expect(fromSpy).toHaveBeenCalledWith("marketing_campaigns")
    expect(builder.select).toHaveBeenCalledWith("*, campaign_links(*)")
    expect(builder.eq).toHaveBeenCalledWith("project_id", "proj-1")

    expect(campaigns).toHaveLength(1)
    const c = campaigns[0]
    expect(c.id).toBe("camp-1")
    expect(c.projectId).toBe("proj-1")
    expect(c.channels).toEqual(["email", "meta"])
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
})
