import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ rev: vi.fn(), hw: vi.fn(), links: vi.fn(), client: vi.fn() }))
vi.mock("server-only", () => ({}))
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }))
vi.mock("@/lib/repositories/branch-deals", () => ({ listBranchRevDeals: mocks.rev }))
vi.mock("@/lib/repositories/branch-hw", () => ({ listHwOutbound: mocks.hw }))
vi.mock("@/lib/repositories/crm-source-links", () => ({ listConfirmedHwOutboundAccountLinks: mocks.links }))
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: mocks.client }))
import { getCrmAccountProductSummary, getCrmMoneyLineItemsSummary } from "@/lib/repositories/crm-account-money"

beforeEach(() => { vi.resetAllMocks(); mocks.rev.mockResolvedValue([]); mocks.hw.mockResolvedValue([]); mocks.links.mockResolvedValue(new Map()) })

describe("고객 누적 구매 집계", () => {
  it("판매 실출고만 집계하고 샘플·프로모션·A/S·예정·다른 고객을 제외한다", async () => {
    const base = { destination: "테스트 학원", outbound_date: "2026-01-01", progress: "출고 완료", product: "T1", quantity: 1, type: "Sales" }
    mocks.hw.mockResolvedValue([base, { ...base, product: '86" IFP' }, ...["Sample", "Promotion", "A/S"].map(type => ({ ...base, type, quantity: 10 })), { ...base, progress: "배송 예정", quantity: 10 }, { ...base, outbound_date: null, quantity: 10 }, { ...base, destination: "다른 학원", quantity: 10 }])
    const result = await getCrmAccountProductSummary("테스트 학원")
    expect(result.hwQuantity).toBe(2)
    expect(result.hwCumulativeCNY).toBeNull()
    expect(result.swCumulativeCNY).toBeNull()
    expect(result.hwProducts).toEqual([{ product: "T1", quantity: 1 }, { product: '86" IFP', quantity: 1 }])
  })
  it("REV 원장의 제품군·통화 기준을 유지한다", async () => {
    mocks.rev.mockResolvedValue([
      { customer_name: "테스트 학원", product_version: "ClassIn 구독", monthly_payments: { "01": 100, "02": 200 } },
      { customer_name: "테스트 학원", product_version: "HW IFP", monthly_payments: { "01": 500 } },
    ])
    expect(await getCrmAccountProductSummary("테스트 학원")).toMatchObject({ swCumulativeCNY: 300, hwCumulativeCNY: 500, matched: true })
  })
  it("원천 장애를 정상 0 구매로 반환하지 않는다", async () => {
    mocks.rev.mockRejectedValue(new Error("unavailable"))
    await expect(getCrmAccountProductSummary("테스트 학원")).rejects.toThrow("unavailable")
  })
  it("품목 조회는 1,000행 뒤 고객까지 조회하고 실패한 두 번째 페이지를 숨기지 않는다", async () => {
    const record = (id: number) => ({ id: String(id), deal_id: "deal", product_name: "카메라", quantity: 1, amount: 100, unit_price: 100, updated_at: null, deals: { id: "deal", deal_code: "D1", customer_id: "customer", customers: { id: "customer", name: id === 1000 ? "테스트 학원" : "다른 학원", campus_name: null, contact_name: null } } })
    const all = Array.from({ length: 1001 }, (_, index) => record(index))
    let fail = false
    const range = vi.fn((from: number, to: number) => Promise.resolve(from > 0 && fail ? { data: null, error: { message: "page failed" } } : { data: all.slice(from, to + 1), error: null, count: all.length }))
    const builder = { select: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), range }
    mocks.client.mockReturnValue({ from: vi.fn(() => builder) })
    const result = await getCrmMoneyLineItemsSummary({ name: "테스트 학원", accountId: "account" })
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems[0].quantity).toBe(1)
    expect(range).toHaveBeenCalledTimes(2)
    fail = true
    await expect(getCrmMoneyLineItemsSummary({ name: "테스트 학원", accountId: "account" })).rejects.toEqual({ message: "page failed" })
  })
})
