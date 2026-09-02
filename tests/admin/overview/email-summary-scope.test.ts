// T5-B: /api/admin/email?scope=summary — overview는 캠페인 HTML 본문(body)을 읽지 않으므로
// 7컬럼만 select하고 body를 빈 문자열로 투영한다. scope 미전달(기존 호출자)은 select("*") 그대로.
import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

type Row = Record<string, unknown>

function marketingClient(rowsBySelect: (columns: string) => Row[]) {
  const selects: string[] = []
  const from = vi.fn(() => ({
    select: (columns: string) => {
      selects.push(columns)
      return {
        order: () => ({
          range: () => Promise.resolve({ data: rowsBySelect(columns), error: null }),
        }),
      }
    },
  }))
  return { from, selects }
}

const FULL_ROW: Row = {
  id: "c1",
  subject: "9월 뉴스레터",
  body: "<html><body><h1>아주 긴 HTML 본문</h1></body></html>",
  target_tags: ["vip"],
  status: "sent",
  sent_at: "2026-09-01T00:00:00Z",
  recipient_count: 120,
  open_count: 30,
  external_id: "ext-1",
  created_at: "2026-08-31T00:00:00Z",
}

function projectRow(columns: string): Row {
  if (columns === "*") return FULL_ROW
  return Object.fromEntries(columns.split(",").map((column) => [column, FULL_ROW[column]]))
}

async function loadRepository() {
  vi.resetModules()
  process.env.USE_SUPABASE_MARKETING = "true"
  const client = marketingClient((columns) => [projectRow(columns)])
  vi.doMock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn(() => client) }))
  vi.doMock("next/cache", () => ({
    revalidateTag: vi.fn(),
    unstable_cache: (fn: (...args: unknown[]) => Promise<unknown>) => fn,
  }))
  const repository = await import("@/lib/repositories/marketing")
  return { repository, client }
}

describe("getAllCampaigns scope", () => {
  beforeEach(() => {
    delete process.env.USE_SUPABASE_MARKETING
  })
  afterEach(() => {
    delete process.env.USE_SUPABASE_MARKETING
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("summary: 7컬럼만 select하고 body는 빈 문자열, open_count/external_id는 투영하지 않는다", async () => {
    const { repository, client } = await loadRepository()
    const campaigns = await repository.getAllCampaigns(200, 0, "summary")

    expect(client.selects).toEqual(["id,subject,status,recipient_count,target_tags,sent_at,created_at"])
    expect(campaigns).toEqual([
      {
        id: "c1",
        subject: "9월 뉴스레터",
        body: "",
        targetTags: ["vip"],
        status: "sent",
        sentAt: "2026-09-01T00:00:00Z",
        recipientCount: 120,
        createdAt: "2026-08-31T00:00:00Z",
      },
    ])
    expect(JSON.stringify(campaigns)).not.toContain("HTML 본문")
  })

  it("scope 미전달(기존 호출자)은 select('*')와 전체 투영 그대로다", async () => {
    const { repository, client } = await loadRepository()
    const campaigns = await repository.getAllCampaigns()

    expect(client.selects).toEqual(["*"])
    expect(campaigns[0]).toMatchObject({
      body: FULL_ROW.body,
      openCount: 30,
      externalId: "ext-1",
    })
  })
})

describe("GET /api/admin/email", () => {
  const getAllCampaigns = vi.fn(async () => [])

  beforeEach(() => {
    vi.resetModules()
    getAllCampaigns.mockClear()
    vi.doMock("@/lib/admin-auth", () => ({ verifyAdmin: vi.fn(async () => undefined) }))
    vi.doMock("@/lib/repositories/marketing", () => ({ getAllCampaigns }))
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("?scope=summary면 summary 스코프로 조회한다", async () => {
    const { GET } = await import("@/app/api/admin/email/route")
    const res = await GET(new NextRequest("http://localhost/api/admin/email?scope=summary"))
    expect(res.status).toBe(200)
    expect(getAllCampaigns).toHaveBeenCalledWith(200, 0, "summary")
  })

  it("scope 미전달·기타 값이면 full 스코프(기존 응답)로 조회한다", async () => {
    const { GET } = await import("@/app/api/admin/email/route")
    await GET(new NextRequest("http://localhost/api/admin/email"))
    await GET(new NextRequest("http://localhost/api/admin/email?scope=anything"))
    expect(getAllCampaigns).toHaveBeenNthCalledWith(1, 200, 0, "full")
    expect(getAllCampaigns).toHaveBeenNthCalledWith(2, 200, 0, "full")
  })
})
