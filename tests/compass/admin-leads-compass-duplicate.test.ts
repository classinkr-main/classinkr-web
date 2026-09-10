import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

// POST /api/admin/leads 의 Compass 교차 중복 경고 계약.
// 핵심: **차단이 아니라 경고**다 — 브리지가 무슨 말을 하든 등록은 등록대로 되어야 한다.

const requireVerifiedAdminContext = vi.fn()
const findLeadsByContacts = vi.fn()
const saveLead = vi.fn()
const getCompassLeadsByPhoneKeys = vi.fn()

vi.mock("@/lib/admin-auth", () => ({
  CRM_STAFF_ADMIN_API_ROLES: ["SUPER_ADMIN", "ADMIN", "BRANCH"],
  requireVerifiedAdminContext,
}))

vi.mock("@/lib/admin-api-response", () => ({ adminCachedJson: vi.fn() }))

vi.mock("@/lib/admin/overview/lead-summary-cache", () => ({
  getCachedOverviewLeadSummary: vi.fn(),
}))

vi.mock("@/lib/repositories/leads", () => ({
  getLeads: vi.fn(),
  getDashboardLeads: vi.fn(),
  getCampaignLeads: vi.fn(),
  getMarketingLeads: vi.fn(),
  findLeadsByContacts,
  saveLead,
}))

vi.mock("@/lib/compass/bridge", () => ({ getCompassLeadsByPhoneKeys }))

const COMPASS_ROW = {
  id: 771,
  phone_key: "01012345678",
  academy: "강남청담어학원",
  stage: "contact",
  caller: "진소망",
  owner: "김담당",
  last_inflow_at: "2026-08-20T00:00:00Z",
}

async function callPost(body: unknown) {
  const { POST } = await import("@/app/api/admin/leads/route")
  return POST(
    new NextRequest("https://classin.kr/api/admin/leads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  )
}

describe("POST /api/admin/leads — Compass 교차 중복 경고", () => {
  beforeEach(() => {
    requireVerifiedAdminContext.mockResolvedValue({ source: "supabase", role: "ADMIN", userId: "admin-1" })
    findLeadsByContacts.mockResolvedValue([])
    let sequence = 0
    saveLead.mockImplementation(async (lead: Record<string, unknown>) => ({
      ...lead,
      id: `lead-${++sequence}`,
      status: "new",
    }))
    getCompassLeadsByPhoneKeys.mockResolvedValue({ rows: [], down: false })
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it("Compass에 있어도 등록은 막지 않고 경고만 싣는다", async () => {
    getCompassLeadsByPhoneKeys.mockResolvedValue({ rows: [COMPASS_ROW], down: false })
    const response = await callPost({ org: "강남청담어학원", phone: "010-1234-5678" })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.created).toBe(1)
    expect(saveLead).toHaveBeenCalledTimes(1)
    expect(data.compassDuplicate).toMatchObject({
      compassLeadId: 771,
      academy: "강남청담어학원",
      stageLabel: "컨택",
      caller: "진소망",
      url: "https://mkt.classin.co.kr/leads?open=771",
    })
    expect(data.compassDuplicates).toBe(1)
  })

  it("정규화된 전화 키로 조회한다 — 하이픈·국가코드 표기 차이를 흡수한다", async () => {
    await callPost({ name: "이수진", phone: "+82 10-1234-5678" })
    expect(getCompassLeadsByPhoneKeys).toHaveBeenCalledWith(["01012345678"])
  })

  it("매칭이 없으면 경고를 만들지 않는다", async () => {
    const response = await callPost({ name: "이수진", phone: "010-9999-0000" })
    const data = await response.json()
    expect(data.compassDuplicate).toBeNull()
    expect(data.compassDuplicates).toBe(0)
    expect(data.compassDown).toBe(false)
  })

  it("전화가 없는 등록(이메일만)은 브리지를 아예 부르지 않는다 — 장애가 아니라 해당 없음", async () => {
    const response = await callPost({ name: "이수진", email: "lee@example.com" })
    const data = await response.json()
    expect(response.status).toBe(200)
    expect(getCompassLeadsByPhoneKeys).not.toHaveBeenCalled()
    expect(data.compassDown).toBe(false)
  })

  it("브리지가 죽어도 등록은 성공하고, 침묵 대신 compassDown으로 말한다", async () => {
    getCompassLeadsByPhoneKeys.mockResolvedValue({ rows: [], down: true, error: "relation does not exist" })
    const response = await callPost({ org: "강남청담어학원", phone: "010-1234-5678" })
    const data = await response.json()
    expect(data.created).toBe(1)
    expect(data.compassDuplicate).toBeNull()
    // "겹치는 리드 없음"과 "확인 못 함"을 같은 침묵으로 뭉개지 않는다.
    expect(data.compassDown).toBe(true)
  })

  it("브리지가 던져도 등록은 성공한다(down으로 표면화)", async () => {
    getCompassLeadsByPhoneKeys.mockRejectedValue(new Error("boom"))
    const response = await callPost({ org: "강남청담어학원", phone: "010-1234-5678" })
    const data = await response.json()
    expect(data.created).toBe(1)
    expect(data.compassDuplicate).toBeNull()
    expect(data.compassDown).toBe(true)
  })

  it("우리 쪽 중복(409)일 때도 어느 원장에서 굴러가는지 함께 알린다", async () => {
    findLeadsByContacts.mockResolvedValue([{ id: "lead-existing", phone: "01012345678" }])
    getCompassLeadsByPhoneKeys.mockResolvedValue({ rows: [COMPASS_ROW], down: false })
    const response = await callPost({ org: "강남청담어학원", phone: "010-1234-5678" })
    const data = await response.json()

    expect(response.status).toBe(409)
    expect(data.existingId).toBe("lead-existing")
    expect(data.compassDuplicate).toMatchObject({ compassLeadId: 771 })
    expect(saveLead).not.toHaveBeenCalled()
  })

  it("벌크는 Compass에 이미 있는 행 수를 세고 대표 1건을 남긴다", async () => {
    getCompassLeadsByPhoneKeys.mockResolvedValue({ rows: [COMPASS_ROW], down: false })
    const response = await callPost({
      leads: [
        { org: "강남청담어학원", phone: "010-1234-5678" },
        { org: "동일번호 다른표기", phone: "0082-1012345678" },
        { org: "무관", phone: "010-7777-8888" },
      ],
    })
    const data = await response.json()
    // 기존 자기 테이블 중복 규칙은 숫자만 비교한다(국가코드 정규화 없음) — 그래서
    // "010-1234-5678"과 "0082-1012345678"을 서로 다른 번호로 보고 3건을 모두 저장한다.
    // Compass 키(normalizePhoneKey)는 국가코드를 접으므로 같은 번호로 보고 2건을 경고한다.
    // 두 규칙의 이 어긋남은 기존 동작이며 이 작업에서 바꾸지 않았다(리포트에 기록).
    expect(data.created).toBe(3)
    expect(data.compassDuplicates).toBe(2)
    expect(data.compassDuplicate).toMatchObject({ compassLeadId: 771 })
  })
})
