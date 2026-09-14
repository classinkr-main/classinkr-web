// GET /api/admin/showroom-bookings — 캐시가 전혀 없던 경로를 Data Cache로 승격
// (admin-performance-round3-2026-09-10.md §3.3). PATCH /api/admin/showroom-bookings/[id]가
// 상태 전이 성공 시 그 캐시 태그를 {expire:0}으로 하드 만료하는지도 함께 고정한다.
import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  verifyAdmin: vi.fn(),
  listShowroomBookings: vi.fn(),
  updateShowroomBookingStatus: vi.fn(),
  revalidateTag: vi.fn(),
}))

const unstableCacheCalls: Array<{
  keyParts: string[]
  options?: { revalidate?: number; tags?: string[] }
}> = []

vi.mock("@/lib/admin-auth", () => ({ verifyAdmin: mocks.verifyAdmin }))
vi.mock("@/lib/repositories/showroom-bookings", async () => {
  const actual = await vi.importActual<typeof import("@/lib/repositories/showroom-bookings")>(
    "@/lib/repositories/showroom-bookings"
  )
  return {
    ...actual,
    listShowroomBookings: mocks.listShowroomBookings,
    updateShowroomBookingStatus: mocks.updateShowroomBookingStatus,
  }
})
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

function listReq(query = "") {
  return new NextRequest(`https://classin.kr/api/admin/showroom-bookings${query}`)
}

beforeEach(() => {
  vi.clearAllMocks()
  unstableCacheCalls.length = 0
  mocks.verifyAdmin.mockResolvedValue(null)
  mocks.listShowroomBookings.mockResolvedValue([])
})

describe("GET /api/admin/showroom-bookings — unstable_cache 배선", () => {
  it("60초로 캐시하고 태그를 채운다", async () => {
    vi.resetModules()
    await import("@/app/api/admin/showroom-bookings/_cache")

    const call = unstableCacheCalls.find((c) => c.options?.revalidate === 60)
    expect(call).toBeDefined()
    expect(call?.options?.tags?.length).toBeGreaterThan(0)
  })

  it("필터 없이 부르면 캐시된 함수를 한 번만 호출한다", async () => {
    vi.resetModules()
    const { GET } = await import("@/app/api/admin/showroom-bookings/route")
    const res = await GET(listReq())

    expect(res.status).toBe(200)
    expect(mocks.listShowroomBookings).toHaveBeenCalledTimes(1)
    expect(mocks.listShowroomBookings).toHaveBeenCalledWith({
      from: undefined,
      to: undefined,
      status: undefined,
    })
  })

  it("잘못된 status는 조회 없이 400을 돌려준다", async () => {
    vi.resetModules()
    const { GET } = await import("@/app/api/admin/showroom-bookings/route")
    const res = await GET(listReq("?status=bogus"))

    expect(res.status).toBe(400)
    expect(mocks.listShowroomBookings).not.toHaveBeenCalled()
  })
})

describe("PATCH /api/admin/showroom-bookings/[id]", () => {
  it("상태 전이 성공 시 목록 캐시 태그를 {expire:0}으로 하드 만료한다", async () => {
    vi.resetModules()
    mocks.updateShowroomBookingStatus.mockResolvedValue({ id: "b1", status: "confirmed" })
    const { PATCH } = await import("@/app/api/admin/showroom-bookings/[id]/route")

    const req = new NextRequest("https://classin.kr/api/admin/showroom-bookings/b1", {
      method: "PATCH",
      body: JSON.stringify({ status: "confirmed" }),
    })
    const res = await PATCH(req, { params: Promise.resolve({ id: "b1" }) })

    expect(res.status).toBe(200)
    expect(mocks.revalidateTag).toHaveBeenCalledTimes(1)
    const [tag, profile] = mocks.revalidateTag.mock.calls[0]
    expect(typeof tag).toBe("string")
    expect(profile).toEqual({ expire: 0 })
  })

  it("대상이 없으면(404) 무효화하지 않는다", async () => {
    vi.resetModules()
    mocks.updateShowroomBookingStatus.mockResolvedValue(null)
    const { PATCH } = await import("@/app/api/admin/showroom-bookings/[id]/route")

    const req = new NextRequest("https://classin.kr/api/admin/showroom-bookings/nope", {
      method: "PATCH",
      body: JSON.stringify({ status: "confirmed" }),
    })
    const res = await PATCH(req, { params: Promise.resolve({ id: "nope" }) })

    expect(res.status).toBe(404)
    expect(mocks.revalidateTag).not.toHaveBeenCalled()
  })
})
