// GET /api/admin/receipts — 캐시가 전혀 없던 경로를 Data Cache로 승격
// (admin-performance-round3-2026-09-10.md §3.3). POST(생성)/DELETE가 그 태그를
// {expire:0}으로 하드 만료하는지도 함께 고정한다.
import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  verifyAdmin: vi.fn(),
  listReceipts: vi.fn(),
  createReceipt: vi.fn(),
  generateReceiptNumber: vi.fn(),
  deleteReceipt: vi.fn(),
  revalidateTag: vi.fn(),
}))

const unstableCacheCalls: Array<{
  keyParts: string[]
  options?: { revalidate?: number; tags?: string[] }
}> = []

vi.mock("@/lib/admin-auth", () => ({ verifyAdmin: mocks.verifyAdmin }))
vi.mock("@/lib/repositories/receipts", () => ({
  listReceipts: mocks.listReceipts,
  createReceipt: mocks.createReceipt,
  generateReceiptNumber: mocks.generateReceiptNumber,
  deleteReceipt: mocks.deleteReceipt,
}))
vi.mock("next/cache", () => ({
  unstable_cache: (
    fn: (...args: unknown[]) => unknown,
    keyParts: string[],
    options?: { revalidate?: number; tags?: string[] },
  ) => {
    unstableCacheCalls.push({ keyParts, options })
    return fn
  },
  revalidateTag: mocks.revalidateTag,
}))

beforeEach(() => {
  vi.clearAllMocks()
  unstableCacheCalls.length = 0
  mocks.verifyAdmin.mockResolvedValue(null)
  mocks.listReceipts.mockResolvedValue([])
})

describe("GET /api/admin/receipts — unstable_cache 배선", () => {
  it("60초로 캐시하고 태그를 채운다", async () => {
    vi.resetModules()
    await import("@/app/api/admin/receipts/_cache")

    const call = unstableCacheCalls.find((c) => c.options?.revalidate === 60)
    expect(call).toBeDefined()
    expect(call?.options?.tags?.length).toBeGreaterThan(0)
  })

  it("쿼리를 그대로 캐시된 함수에 전달한다", async () => {
    vi.resetModules()
    const { GET } = await import("@/app/api/admin/receipts/route")
    const req = new NextRequest(
      "https://classin.kr/api/admin/receipts?contract_id=c1&partner_id=p1"
    )
    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(mocks.listReceipts).toHaveBeenCalledWith("c1", "p1")
  })
})

describe("POST /api/admin/receipts", () => {
  it("생성 성공 시 목록 캐시 태그를 {expire:0}으로 하드 만료한다", async () => {
    vi.resetModules()
    mocks.createReceipt.mockResolvedValue({ id: "r1" })
    const { POST } = await import("@/app/api/admin/receipts/route")
    const req = new NextRequest("https://classin.kr/api/admin/receipts", {
      method: "POST",
      body: JSON.stringify({ receipt_number: "R-1", contract_id: "c1" }),
    })

    const res = await POST(req)

    expect(res.status).toBe(201)
    expect(mocks.revalidateTag).toHaveBeenCalledTimes(1)
    const [tag, profile] = mocks.revalidateTag.mock.calls[0]
    expect(typeof tag).toBe("string")
    expect(profile).toEqual({ expire: 0 })
  })

  it("생성 실패 시 무효화하지 않는다", async () => {
    vi.resetModules()
    mocks.createReceipt.mockRejectedValue(new Error("db down"))
    const { POST } = await import("@/app/api/admin/receipts/route")
    const req = new NextRequest("https://classin.kr/api/admin/receipts", {
      method: "POST",
      body: JSON.stringify({ receipt_number: "R-1" }),
    })

    const res = await POST(req)

    expect(res.status).toBe(500)
    expect(mocks.revalidateTag).not.toHaveBeenCalled()
  })
})

describe("DELETE /api/admin/receipts/[id]", () => {
  it("삭제 성공 시 목록 캐시 태그를 {expire:0}으로 하드 만료한다", async () => {
    vi.resetModules()
    mocks.deleteReceipt.mockResolvedValue(undefined)
    const { DELETE } = await import("@/app/api/admin/receipts/[id]/route")

    const res = await DELETE(new NextRequest("https://classin.kr/api/admin/receipts/r1"), {
      params: Promise.resolve({ id: "r1" }),
    })

    expect(res.status).toBe(200)
    expect(mocks.revalidateTag).toHaveBeenCalledTimes(1)
    const [tag, profile] = mocks.revalidateTag.mock.calls[0]
    expect(typeof tag).toBe("string")
    expect(profile).toEqual({ expire: 0 })
  })
})
