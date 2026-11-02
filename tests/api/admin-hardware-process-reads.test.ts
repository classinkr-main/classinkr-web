// 재고관리 프로세스 읽기 API(갭 문서 §7-3) — 물류번호 고르기 · 회수 후보 · CRM 고객 검색 · 품목 설정 권한.
import { NextRequest } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

const repo = vi.hoisted(() => ({
  getHardwareLotChoices: vi.fn(),
  listHardwareReturnCandidates: vi.fn(),
  searchHardwareCustomers: vi.fn(),
  updateHardwareItem: vi.fn(),
  requireVerifiedAdminContext: vi.fn(),
}))

vi.mock("@/lib/admin-auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin-auth")>()),
  requireVerifiedAdminContext: repo.requireVerifiedAdminContext,
}))
vi.mock("@/lib/repositories/hardware-inventory", () => ({
  getHardwareLotChoices: repo.getHardwareLotChoices,
  listHardwareReturnCandidates: repo.listHardwareReturnCandidates,
  searchHardwareCustomers: repo.searchHardwareCustomers,
  updateHardwareItem: repo.updateHardwareItem,
}))

import { PATCH as patchItem } from "@/app/api/admin/hardware/items/[id]/route"
import { GET as getCustomers } from "@/app/api/admin/hardware/customers/route"
import { GET as getLots } from "@/app/api/admin/hardware/lots/route"
import { GET as getReturnCandidates } from "@/app/api/admin/hardware/return-candidates/route"

const SELLER = { source: "supabase", role: "ADMIN", name: "김매니저", userId: "u-1", capabilities: [] }
const INBOUND = { ...SELLER, name: "입고 담당", capabilities: ["hardware.inbound"] }
const ITEM_ID = "11111111-1111-4111-8111-111111111111"

function get(path: string) {
  return new NextRequest(`https://classin.kr${path}`)
}

afterEach(() => {
  vi.clearAllMocks()
})

describe("GET /api/admin/hardware/lots", () => {
  it("품목 id 로 잔여 물류번호를 돌려주고 캐시하지 않는다", async () => {
    repo.requireVerifiedAdminContext.mockResolvedValue(SELLER)
    repo.getHardwareLotChoices.mockResolvedValue({ itemId: ITEM_ID, product: "T1", lotTracked: true, lots: [], nextLotNo: "C3" })

    const response = await getLots(get(`/api/admin/hardware/lots?itemId=${ITEM_ID}&excludeMovementId=${ITEM_ID}`))

    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toContain("no-store")
    expect(repo.getHardwareLotChoices).toHaveBeenCalledWith({ itemId: ITEM_ID, product: null, excludeMovementId: ITEM_ID })
  })

  it("품목이 없거나 id 형식이 틀리면 400", async () => {
    repo.requireVerifiedAdminContext.mockResolvedValue(SELLER)
    expect((await getLots(get("/api/admin/hardware/lots"))).status).toBe(400)
    expect((await getLots(get("/api/admin/hardware/lots?itemId=abc"))).status).toBe(400)
    expect(repo.getHardwareLotChoices).not.toHaveBeenCalled()
  })
})

describe("GET /api/admin/hardware/return-candidates", () => {
  it("검색어·고객을 넘긴다", async () => {
    repo.requireVerifiedAdminContext.mockResolvedValue(SELLER)
    repo.listHardwareReturnCandidates.mockResolvedValue([{ id: "out-1", returnable: 1 }])

    const response = await getReturnCandidates(get(`/api/admin/hardware/return-candidates?q=T1&customerId=${ITEM_ID}&limit=10`))

    await expect(response.json()).resolves.toEqual({ candidates: [{ id: "out-1", returnable: 1 }] })
    expect(repo.listHardwareReturnCandidates).toHaveBeenCalledWith({ q: "T1", customerId: ITEM_ID, limit: 10 })
  })
})

describe("GET /api/admin/hardware/customers", () => {
  it("검색어로 CRM 고객을 찾는다", async () => {
    repo.requireVerifiedAdminContext.mockResolvedValue(SELLER)
    repo.searchHardwareCustomers.mockResolvedValue([{ id: ITEM_ID, name: "대치학원", campusName: null, regionLabel: null }])

    const response = await getCustomers(get("/api/admin/hardware/customers?q=대치"))

    await expect(response.json()).resolves.toMatchObject({ customers: [{ name: "대치학원" }] })
    expect(repo.searchHardwareCustomers).toHaveBeenCalledWith("대치", 20)
  })
})

describe("PATCH /api/admin/hardware/items/[id]", () => {
  function patch(body: unknown) {
    return new NextRequest(`https://classin.kr/api/admin/hardware/items/${ITEM_ID}`, {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    })
  }

  it("품목 설정은 입고관리 권한자만", async () => {
    repo.requireVerifiedAdminContext.mockResolvedValue(SELLER)
    const response = await patchItem(patch({ reorderPoint: 3 }), { params: Promise.resolve({ id: ITEM_ID }) })
    expect(response.status).toBe(403)
    expect(repo.updateHardwareItem).not.toHaveBeenCalled()
  })

  it("물류번호 관리·보고 묶음·정렬을 넘긴다", async () => {
    repo.requireVerifiedAdminContext.mockResolvedValue(INBOUND)
    repo.updateHardwareItem.mockResolvedValue({ id: ITEM_ID })

    const response = await patchItem(
      patch({ lotTracked: false, reportGroup: "accessory", sortOrder: 30 }),
      { params: Promise.resolve({ id: ITEM_ID }) }
    )

    expect(response.status).toBe(200)
    expect(repo.updateHardwareItem).toHaveBeenCalledWith(ITEM_ID, expect.objectContaining({
      lotTracked: false,
      reportGroup: "accessory",
      sortOrder: 30,
    }))
  })

  it("보고 묶음 값이 틀리면 400", async () => {
    repo.requireVerifiedAdminContext.mockResolvedValue(INBOUND)
    const response = await patchItem(patch({ reportGroup: "tablet" }), { params: Promise.resolve({ id: ITEM_ID }) })
    expect(response.status).toBe(400)
  })
})
