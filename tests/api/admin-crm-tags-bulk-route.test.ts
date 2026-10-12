import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest, NextResponse } from "next/server"

// POST /api/admin/crm/tags/bulk(SG6) — 역할 가드, 입력 검증(상한 500·label 1~40자·action), invalid 키 집계,
// 저장소 결과(applied/skipped/failed) 전달, 전부 실패 시 500 을 고정한다.
// 키 해석은 실제 lib/crm/unified-customer-key.ts 를 쓴다(계약 그대로).

const mocks = vi.hoisted(() => ({
  requireVerifiedAdminContext: vi.fn(),
  addCustomerTagToTargets: vi.fn(),
  removeCustomerTagFromTargets: vi.fn(),
}))

vi.mock("@/lib/admin-auth", () => ({
  CRM_STAFF_ADMIN_API_ROLES: ["SUPER_ADMIN", "ADMIN", "BRANCH", "EDITOR"],
  requireVerifiedAdminContext: mocks.requireVerifiedAdminContext,
}))

vi.mock("@/lib/repositories/crm-customer-tags", () => ({
  addCustomerTagToTargets: mocks.addCustomerTagToTargets,
  removeCustomerTagFromTargets: mocks.removeCustomerTagFromTargets,
}))

const LEAD_A = "11111111-1111-4111-8111-111111111111"
const CUSTOMER_C = "33333333-3333-4333-8333-333333333333"

function postRequest(body: unknown) {
  return new NextRequest("https://classin.kr/api/admin/crm/tags/bulk", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

async function loadRoute() {
  return import("@/app/api/admin/crm/tags/bulk/route")
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireVerifiedAdminContext.mockResolvedValue({ role: "ADMIN", name: "김매니저", userId: "admin-1" })
  mocks.addCustomerTagToTargets.mockResolvedValue({ applied: 0, skipped: 0, failed: [] })
  mocks.removeCustomerTagFromTargets.mockResolvedValue({ applied: 0, skipped: 0, failed: [] })
  vi.spyOn(console, "info").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("POST /api/admin/crm/tags/bulk — 가드", () => {
  it("CRM_STAFF_ADMIN_API_ROLES 로 가드를 부른다", async () => {
    const { POST } = await loadRoute()
    await POST(postRequest({ keys: ["neo:acc-1"], label: "VIP" }))
    expect(mocks.requireVerifiedAdminContext).toHaveBeenCalledWith(expect.anything(), [
      "SUPER_ADMIN",
      "ADMIN",
      "BRANCH",
      "EDITOR",
    ])
  })

  it.each([401, 403])("가드가 %i 을 돌려주면 저장소를 부르지 않고 그대로 응답한다", async (status) => {
    mocks.requireVerifiedAdminContext.mockResolvedValue(NextResponse.json({ error: "denied" }, { status }))
    const { POST } = await loadRoute()
    const response = await POST(postRequest({ keys: ["neo:acc-1"], label: "VIP" }))
    expect(response.status).toBe(status)
    expect(mocks.addCustomerTagToTargets).not.toHaveBeenCalled()
    expect(mocks.removeCustomerTagFromTargets).not.toHaveBeenCalled()
  })
})

describe("POST /api/admin/crm/tags/bulk — 입력 검증(400)", () => {
  it("JSON 이 아니거나 객체가 아니면 400", async () => {
    const { POST } = await loadRoute()
    expect((await POST(postRequest("not json"))).status).toBe(400)
    expect((await POST(postRequest(["neo:acc-1"]))).status).toBe(400)
  })

  it("keys 가 배열이 아니거나 비어 있으면 400", async () => {
    const { POST } = await loadRoute()
    expect((await POST(postRequest({ keys: "neo:acc-1", label: "VIP" }))).status).toBe(400)
    expect((await POST(postRequest({ keys: [], label: "VIP" }))).status).toBe(400)
    expect((await POST(postRequest({ label: "VIP" }))).status).toBe(400)
  })

  it("중복 제거 후 500개를 넘으면 400(limit 포함), 중복만 많으면 통과", async () => {
    const { POST } = await loadRoute()
    const over = Array.from({ length: 501 }, (_, i) => `neo:acc-${i}`)
    const response = await POST(postRequest({ keys: over, label: "VIP" }))
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ limit: 500 })
    expect(mocks.addCustomerTagToTargets).not.toHaveBeenCalled()

    const dupes = [...Array.from({ length: 500 }, (_, i) => `neo:acc-${i}`), "neo:acc-0", " neo:acc-1 "]
    const ok = await POST(postRequest({ keys: dupes, label: "VIP" }))
    expect(ok.status).toBe(200)
    expect(mocks.addCustomerTagToTargets.mock.calls[0][0]).toHaveLength(500)
  })

  it("label 이 없거나 공백뿐이거나 40자를 넘으면 400", async () => {
    const { POST } = await loadRoute()
    for (const label of [undefined, 3, "", "   ", "가".repeat(41)]) {
      const response = await POST(postRequest({ keys: ["neo:acc-1"], label }))
      expect(response.status, String(label)).toBe(400)
    }
    // 정규화(앞뒤 공백 제거·연속 공백 1칸) 후 40자면 통과한다.
    const ok = await POST(postRequest({ keys: ["neo:acc-1"], label: `  ${"가".repeat(40)}  ` }))
    expect(ok.status).toBe(200)
    expect(mocks.addCustomerTagToTargets).not.toHaveBeenCalledWith(expect.anything(), "가".repeat(41), expect.anything())
  })

  it("action 이 add/remove 가 아니면 400", async () => {
    const { POST } = await loadRoute()
    const response = await POST(postRequest({ keys: ["neo:acc-1"], label: "VIP", action: "rename" }))
    expect(response.status).toBe(400)
  })
})

describe("POST /api/admin/crm/tags/bulk — 처리", () => {
  it("기본 action 은 add — 해석된 대상·정규화한 label·작성자를 저장소에 넘기고 결과를 그대로 돌려준다", async () => {
    mocks.addCustomerTagToTargets.mockResolvedValue({ applied: 2, skipped: 1, failed: [] })
    const { POST } = await loadRoute()
    const response = await POST(
      postRequest({
        keys: [`lead:${LEAD_A}`, "neo:acc-1", `customer:${CUSTOMER_C}`, `lead:${LEAD_A.toUpperCase()}`],
        label: "  우수   고객 ",
      })
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      applied: 2,
      skipped: 1,
      invalid: [],
      failed: [],
      action: "add",
      label: "우수 고객",
    })
    expect(mocks.addCustomerTagToTargets).toHaveBeenCalledWith(
      [
        { key: `lead:${LEAD_A}`, targetType: "lead", targetId: LEAD_A },
        { key: "neo:acc-1", targetType: "neo_account", targetId: "acc-1" },
        { key: `customer:${CUSTOMER_C}`, targetType: "customer", targetId: CUSTOMER_C },
      ],
      "우수 고객",
      "김매니저"
    )
    expect(mocks.removeCustomerTagFromTargets).not.toHaveBeenCalled()
  })

  it("해석 못 하는 키는 invalid 로 모으고 나머지만 처리한다", async () => {
    mocks.addCustomerTagToTargets.mockResolvedValue({ applied: 1, skipped: 0, failed: [] })
    const { POST } = await loadRoute()
    const response = await POST(
      postRequest({ keys: ["neo:acc-1", "bogus", "lead:not-a-uuid", "deal:x", 9], label: "VIP" })
    )
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.invalid).toEqual(["bogus", "lead:not-a-uuid", "deal:x", "9"])
    expect(mocks.addCustomerTagToTargets.mock.calls[0][0]).toEqual([
      { key: "neo:acc-1", targetType: "neo_account", targetId: "acc-1" },
    ])
  })

  it("키가 전부 invalid 면 저장소를 부르지 않고 0건으로 응답한다", async () => {
    const { POST } = await loadRoute()
    const response = await POST(postRequest({ keys: ["bogus"], label: "VIP", action: "remove" }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      applied: 0,
      skipped: 0,
      invalid: ["bogus"],
      failed: [],
      action: "remove",
      label: "VIP",
    })
    expect(mocks.removeCustomerTagFromTargets).not.toHaveBeenCalled()
  })

  it("action remove 는 제거 저장소를 부른다 — 없는 태그는 skipped 로 그대로 전달", async () => {
    mocks.removeCustomerTagFromTargets.mockResolvedValue({ applied: 1, skipped: 1, failed: [] })
    const { POST } = await loadRoute()
    const response = await POST(postRequest({ keys: ["neo:acc-1", "neo:acc-2"], label: "VIP", action: "remove" }))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ applied: 1, skipped: 1, action: "remove" })
    expect(mocks.removeCustomerTagFromTargets).toHaveBeenCalledWith(
      [
        { key: "neo:acc-1", targetType: "neo_account", targetId: "acc-1" },
        { key: "neo:acc-2", targetType: "neo_account", targetId: "acc-2" },
      ],
      "VIP"
    )
  })

  it("부분 실패는 200 + failed 키로 집계한다", async () => {
    mocks.addCustomerTagToTargets.mockResolvedValue({ applied: 1, skipped: 0, failed: ["neo:acc-2"] })
    const { POST } = await loadRoute()
    const response = await POST(postRequest({ keys: ["neo:acc-1", "neo:acc-2"], label: "VIP" }))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ applied: 1, skipped: 0, failed: ["neo:acc-2"] })
  })

  it("쓰기를 시도한 대상이 전부 실패하면 500(건수는 함께 싣는다)", async () => {
    mocks.addCustomerTagToTargets.mockResolvedValue({ applied: 0, skipped: 1, failed: ["neo:acc-2"] })
    const { POST } = await loadRoute()
    const response = await POST(postRequest({ keys: ["neo:acc-1", "neo:acc-2"], label: "VIP" }))
    expect(response.status).toBe(500)
    expect(await response.json()).toMatchObject({ applied: 0, skipped: 1, failed: ["neo:acc-2"] })
  })

  it("저장소가 던지면 500", async () => {
    mocks.addCustomerTagToTargets.mockRejectedValue(new Error("boom"))
    const { POST } = await loadRoute()
    const response = await POST(postRequest({ keys: ["neo:acc-1"], label: "VIP" }))
    expect(response.status).toBe(500)
  })
})
