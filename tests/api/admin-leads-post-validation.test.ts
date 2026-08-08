import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const requireVerifiedAdminContext = vi.fn()
const getLeads = vi.fn()
const getDashboardLeads = vi.fn()
const getCampaignLeads = vi.fn()
const findLeadsByContacts = vi.fn()
const saveLead = vi.fn()
const adminCachedJson = vi.fn()

vi.mock("@/lib/admin-auth", () => ({
  CRM_STAFF_ADMIN_API_ROLES: ["SUPER_ADMIN", "ADMIN", "BRANCH"],
  requireVerifiedAdminContext,
}))

vi.mock("@/lib/admin-api-response", () => ({
  adminCachedJson,
}))

vi.mock("@/lib/repositories/leads", () => ({
  getLeads,
  getDashboardLeads,
  getCampaignLeads,
  getMarketingLeads: vi.fn(),
  findLeadsByContacts,
  saveLead,
}))

function postRequest(body: unknown) {
  return new NextRequest("https://classin.kr/api/admin/leads", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

async function callPost(body: unknown) {
  const { POST } = await import("@/app/api/admin/leads/route")
  return POST(postRequest(body))
}

describe("POST /api/admin/leads — 형식 검증·중복 방지 집계", () => {
  beforeEach(() => {
    requireVerifiedAdminContext.mockResolvedValue({ source: "supabase", role: "ADMIN", userId: "admin-1" })
    findLeadsByContacts.mockResolvedValue([])
    let sequence = 0
    saveLead.mockImplementation(async (lead: Record<string, unknown>) => ({
      ...lead,
      id: `lead-${++sequence}`,
      status: "new",
    }))
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it("형식 불량 phone/email 행은 invalid로 집계되고 저장되지 않는다", async () => {
    const response = await callPost({
      leads: [
        { name: "전화불량", phone: "asdf" },
        { name: "메일불량", email: "not-an-email" },
        { name: "정상", phone: "010-1234-5678" },
      ],
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      created: 1,
      failed: 0,
      total: 3,
      invalid: 2,
      duplicates: 0,
    })
    expect(saveLead).toHaveBeenCalledTimes(1)
    expect(saveLead).toHaveBeenCalledWith(expect.objectContaining({ phone: "010-1234-5678" }))
  })

  it("기존 리드와 전화가 같으면(하이픈 유무 무관) duplicates로 건너뛴다", async () => {
    findLeadsByContacts.mockResolvedValue([
      { id: "lead-old", phone: "010-1234-5678", email: undefined },
    ])

    const response = await callPost({
      leads: [
        { name: "중복", phone: "01012345678" },
        { name: "신규", phone: "010-9999-8888" },
      ],
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      created: 1,
      failed: 0,
      total: 2,
      invalid: 0,
      duplicates: 1,
    })
    expect(saveLead).toHaveBeenCalledTimes(1)
    expect(saveLead).toHaveBeenCalledWith(expect.objectContaining({ phone: "010-9999-8888" }))
  })

  it("같은 붙여넣기 안의 중복 전화는 첫 행만 저장한다", async () => {
    const response = await callPost({
      leads: [
        { name: "첫 행", phone: "010-1234-5678" },
        { name: "같은 번호", phone: "010 1234 5678" },
      ],
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      created: 1,
      duplicates: 1,
      invalid: 0,
    })
    expect(saveLead).toHaveBeenCalledTimes(1)
    expect(saveLead).toHaveBeenCalledWith(expect.objectContaining({ name: "첫 행" }))
  })

  it("단건 등록이 중복이면 409와 기존 리드 id를 돌려준다", async () => {
    findLeadsByContacts.mockResolvedValue([
      { id: "lead-existing", phone: undefined, email: "owner@example.com" },
    ])

    const response = await callPost({ name: "김원장", email: "OWNER@example.com" })

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error: "이미 등록된 리드입니다(전화/이메일 일치).",
      existingId: "lead-existing",
    })
    expect(saveLead).not.toHaveBeenCalled()
  })

  it("유효 행이 0건이면 400을 돌려준다", async () => {
    const response = await callPost({ leads: [{ phone: "asdf" }, {}] })

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toContain("유효한 리드가 없습니다")
    expect(saveLead).not.toHaveBeenCalled()
    expect(findLeadsByContacts).not.toHaveBeenCalled()
  })

  it("벌크 500행 초과는 400으로 거절한다", async () => {
    const leads = Array.from({ length: 501 }, (_, i) => ({ name: `리드${i}` }))

    const response = await callPost({ leads })

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toContain("최대 500행")
    expect(saveLead).not.toHaveBeenCalled()
  })
})

describe("POST /api/admin/leads — utm 수용(캠페인 허브 가져오기)", () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  // 가져오기 다이얼로그가 utm_medium=cpc·utm_campaign 을 실어 보낸다. 서버가 이것을
  // 떨어뜨리면 방금 가져온 리드가 광고/마케팅 렌즈 어디에도 안 잡힌다(회귀 방지).
  it("utm_* 필드가 저장 입력까지 전달된다", async () => {
    requireVerifiedAdminContext.mockResolvedValue({ source: "supabase", role: "ADMIN", userId: "admin-1" })
    findLeadsByContacts.mockResolvedValue([])
    saveLead.mockImplementation(async (lead: Record<string, unknown>) => ({ ...lead, id: "lead-1", status: "new" }))

    const response = await callPost({
      leads: [
        {
          org: "A학원",
          phone: "010-1111-2222",
          source: "admin_manual",
          utm_medium: "cpc",
          utm_campaign: "여름 HW",
          utm_source: "naver",
        },
      ],
    })

    expect(response.status).toBe(200)
    expect(saveLead).toHaveBeenCalledWith(
      expect.objectContaining({ utm_medium: "cpc", utm_campaign: "여름 HW", utm_source: "naver" })
    )
  })
})
