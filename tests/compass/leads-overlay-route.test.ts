import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest, NextResponse } from "next/server"

const requireVerifiedAdminContext = vi.fn()
const getCompassLeadsByPhoneKeys = vi.fn()

vi.mock("@/lib/admin-auth", () => ({
  CRM_STAFF_ADMIN_API_ROLES: ["SUPER_ADMIN", "ADMIN", "BRANCH"],
  requireVerifiedAdminContext,
}))

vi.mock("@/lib/compass/bridge", () => ({
  getCompassLeadsByPhoneKeys,
}))

function postRequest(body: unknown) {
  return new NextRequest("https://classin.kr/api/admin/compass/leads-overlay", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

async function callPost(body: unknown) {
  const { POST } = await import("@/app/api/admin/compass/leads-overlay/route")
  return POST(postRequest(body))
}

describe("POST /api/admin/compass/leads-overlay", () => {
  beforeEach(() => {
    requireVerifiedAdminContext.mockResolvedValue({ source: "supabase", role: "ADMIN", userId: "admin-1" })
    getCompassLeadsByPhoneKeys.mockResolvedValue({ rows: [], down: false })
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it("역할 검사를 서버에서 강제한다 — 가드가 응답을 내면 그대로 돌려준다", async () => {
    requireVerifiedAdminContext.mockResolvedValue(
      NextResponse.json({ error: "forbidden" }, { status: 403 })
    )
    const response = await callPost({ phoneKeys: ["01012345678"] })
    expect(response.status).toBe(403)
    expect(getCompassLeadsByPhoneKeys).not.toHaveBeenCalled()
  })

  it("숫자만 남은 키만 받는다 — 전화 원문이 실려 오면 버린다(PII 최소화)", async () => {
    await callPost({ phoneKeys: ["01012345678", "010-1234-5678", "", "  ", 42, null] })
    expect(getCompassLeadsByPhoneKeys).toHaveBeenCalledWith(["01012345678"])
  })

  it("키가 없으면 조회 없이 빈 맵 — down은 false다(장애가 아니다)", async () => {
    const response = await callPost({ phoneKeys: [] })
    expect(getCompassLeadsByPhoneKeys).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toEqual({
      overlay: {},
      down: false,
      requested: 0,
      matched: 0,
    })
  })

  it("긴 키 목록은 나눠 던지고 합친다 — in(...) URL 폭발 방지", async () => {
    const keys = Array.from({ length: 700 }, (_, index) => `0101${String(index).padStart(7, "0")}`)
    getCompassLeadsByPhoneKeys.mockImplementation(async (chunk: string[]) => ({
      rows: chunk.map((phone_key, index) => ({ id: index + 1, phone_key, stage: "contact" })),
      down: false,
    }))
    const response = await callPost({ phoneKeys: keys })
    expect(getCompassLeadsByPhoneKeys).toHaveBeenCalledTimes(3)
    const data = await response.json()
    expect(data.requested).toBe(700)
    expect(data.matched).toBe(700)
  })

  it("한 덩어리라도 죽으면 전체를 down으로 알린다 — 반쪽 오버레이를 매칭 없음으로 그리지 않는다", async () => {
    const keys = Array.from({ length: 400 }, (_, index) => `0102${String(index).padStart(7, "0")}`)
    getCompassLeadsByPhoneKeys
      .mockResolvedValueOnce({
        rows: [{ id: 1, phone_key: keys[0], stage: "contact" }],
        down: false,
      })
      .mockResolvedValueOnce({ rows: [], down: true, error: "relation does not exist" })
    const response = await callPost({ phoneKeys: keys })
    const data = await response.json()
    expect(data.down).toBe(true)
    expect(data.overlay).toEqual({})
    expect(data.matched).toBe(0)
  })

  it("매칭된 행은 칩이 필요로 하는 필드만 담아 돌려준다", async () => {
    getCompassLeadsByPhoneKeys.mockResolvedValue({
      rows: [
        {
          id: 771,
          phone_key: "01012345678",
          academy: "강남청담어학원",
          stage: "contact",
          caller: "진소망",
          demo_at: "2026-09-01T02:00:00Z",
          neocrm_registered_at: "2026-08-10T00:00:00Z",
          // 장문은 어드민으로 복제하지 않는다 — 응답에 실리면 안 된다.
          next_action: "원장 통화 후 데모 일정 확정 요청드림",
        },
      ],
      down: false,
    })
    const response = await callPost({ phoneKeys: ["01012345678"] })
    const data = await response.json()
    expect(data.matched).toBe(1)
    expect(data.overlay["01012345678"]).toMatchObject({
      compassLeadId: 771,
      stage: "contact",
      caller: "진소망",
      url: "https://mkt.classin.co.kr/leads?open=771",
    })
    expect(JSON.stringify(data)).not.toContain("원장 통화 후")
  })
})
