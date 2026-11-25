import { NextRequest, NextResponse } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  createRecordingSupabaseClient,
  filterValue,
  type RecordedQueryResolver,
} from "../helpers/recording-supabase-client"

/**
 * 총판 미수금 읽기 — 라우트(응답 shape·가드·500)와 저장소(청크·페이지·합치기·truncated)를 고정한다.
 */

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  receivables: vi.fn(),
  reviews: vi.fn(),
  payments: vi.fn(),
}))

vi.mock("@/lib/admin-auth", () => ({
  requireVerifiedAdminContext: mocks.auth,
  CRM_STAFF_ADMIN_API_ROLES: ["SUPER_ADMIN", "ADMIN"],
}))
vi.mock("@/lib/repositories/distributor-settlements", () => ({
  listDistributorReceivables: mocks.receivables,
  listDistributorSettlementReviews: mocks.reviews,
  listDistributorReceivablePayments: mocks.payments,
}))

import { GET } from "@/app/api/admin/distributor-receivables/route"

const request = () => new NextRequest("https://classin.co.kr/api/admin/distributor-receivables?includePaid=1")

beforeEach(() => {
  vi.resetAllMocks()
  mocks.auth.mockResolvedValue({ userId: "admin", role: "ADMIN" })
  mocks.reviews.mockResolvedValue({ available: true, warning: null, value: [] })
})

describe("GET /api/admin/distributor-receivables", () => {
  it("인증 실패는 가드 응답 그대로 돌려주고 저장소를 부르지 않는다", async () => {
    mocks.auth.mockResolvedValueOnce(NextResponse.json({ error: "Forbidden" }, { status: 403 }))
    expect((await GET(request())).status).toBe(403)
    expect(mocks.receivables).not.toHaveBeenCalled()
  })

  it("payments·truncated 를 싣고 receivables 의 id 로 입금을 읽는다", async () => {
    mocks.receivables.mockResolvedValue({ available: true, warning: null, value: [{ id: "s1" }, { id: "s2" }], truncated: true })
    mocks.payments.mockResolvedValue([{ settlementId: "s1", amount: 100, paidOn: "2026-11-01" }])
    const res = await GET(request())
    expect(res.status).toBe(200)
    expect(res.headers.get("Cache-Control")).toBe("no-store")
    expect(mocks.receivables).toHaveBeenCalledWith({ includePaid: true })
    expect(mocks.payments).toHaveBeenCalledWith(["s1", "s2"])
    expect(await res.json()).toEqual({
      available: true,
      warning: null,
      receivables: [{ id: "s1" }, { id: "s2" }],
      reviews: [],
      payments: [{ settlementId: "s1", amount: 100, paidOn: "2026-11-01" }],
      truncated: true,
    })
  })

  it("표 미적용이면 입금 조회 없이 빈 payments 를 준다", async () => {
    mocks.receivables.mockResolvedValue({ available: false, warning: "미적용", value: null, truncated: false })
    const body = await (await GET(request())).json()
    expect(mocks.payments).not.toHaveBeenCalled()
    expect(body).toMatchObject({ available: false, receivables: [], payments: [], truncated: false })
  })

  it("저장소가 던지면 원문 없이 500", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    mocks.receivables.mockRejectedValue(new Error("secret db detail"))
    const res = await GET(request())
    expect(res.status).toBe(500)
    const text = JSON.stringify(await res.json())
    expect(text).toContain("총판 미수금을 불러오지 못했습니다.")
    expect(text).not.toContain("secret")
  })
})

describe("distributor-settlements 저장소 읽기", () => {
  async function load(resolver: RecordedQueryResolver) {
    vi.resetModules()
    vi.doUnmock("@/lib/repositories/distributor-settlements")
    const { client, queries } = createRecordingSupabaseClient(resolver)
    vi.doMock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => client }))
    const repo = await vi.importActual<typeof import("@/lib/repositories/distributor-settlements")>(
      "@/lib/repositories/distributor-settlements"
    )
    return { repo, queries }
  }

  it("mergeReceivableLists — issued_at 내림차순(null 뒤), 한도에 닿은 조회가 있으면 truncated", async () => {
    const { repo } = await load(() => ({ data: [] }))
    const a = [{ id: "a", issuedAt: "2026-10-01" }, { id: "n", issuedAt: null }]
    const b = [{ id: "b", issuedAt: "2026-11-01" }]
    expect(repo.mergeReceivableLists([a, b])).toEqual({
      rows: [b[0], a[0], a[1]],
      truncated: false,
    })
    expect(repo.mergeReceivableLists([a, b], 1).truncated).toBe(true)
  })

  it("입금 요약 — id 0개면 DB 를 부르지 않는다", async () => {
    const { repo, queries } = await load(() => ({ data: [] }))
    expect(await repo.listDistributorReceivablePayments([])).toEqual([])
    expect(queries).toHaveLength(0)
  })

  it("입금 요약 — 200개씩 끊고 페이지를 끝까지 읽으며 amount 를 number 로 바꾼다", async () => {
    const ids = Array.from({ length: 450 }, (_, i) => `s${i}`)
    const { repo, queries } = await load((q) => {
      const chunk = filterValue(q, "settlement_id", "in") as string[]
      if (chunk[0] !== "s0") return { data: [{ settlement_id: chunk[0], amount: "5", paid_on: "2026-11-02" }] }
      const from = q.range?.from ?? 0
      const rows = from === 0 ? 1000 : 3
      return { data: Array.from({ length: rows }, () => ({ settlement_id: "s0", amount: "1000.5", paid_on: "2026-11-01" })) }
    })
    const out = await repo.listDistributorReceivablePayments(ids)
    expect(queries.map((q) => (filterValue(q, "settlement_id", "in") as string[]).length)).toEqual([200, 200, 200, 50])
    expect(queries[0].select).toBe("settlement_id, amount, paid_on")
    expect(queries[0].order.map((o) => o.column)).toEqual(["paid_on", "id"])
    expect(queries[1].range).toEqual({ from: 1000, to: 1999 })
    expect(out).toHaveLength(1003 + 2)
    expect(out[0]).toEqual({ settlementId: "s0", amount: 1000.5, paidOn: "2026-11-01" })
  })

  it("입금 요약 — 읽기 오류는 빈 배열로 삼키지 않고 던진다", async () => {
    const { repo } = await load(() => ({ error: { message: "boom" } }))
    await expect(repo.listDistributorReceivablePayments(["s1"])).rejects.toBeTruthy()
  })

  it("미수 목록 — includePaid 면 미수·완납을 따로 한도 500 으로 조회한다", async () => {
    const { repo, queries } = await load((q) => {
      const statuses = filterValue(q, "status", "in") as string[]
      return statuses.includes("paid")
        ? { data: [{ id: "p", issued_at: "2026-09-01", status: "paid" }] }
        : { data: [{ id: "i", issued_at: "2026-10-01", status: "issued" }] }
    })
    const read = await repo.listDistributorReceivables({ includePaid: true })
    expect(queries).toHaveLength(2)
    expect(queries.every((q) => q.limit === repo.RECEIVABLES_LIST_LIMIT)).toBe(true)
    expect(read.available && read.value.map((r) => r.id)).toEqual(["i", "p"])
    expect(read.truncated).toBe(false)
    await repo.listDistributorReceivables()
    expect(queries).toHaveLength(3)
  })
})
