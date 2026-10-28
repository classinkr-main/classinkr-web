import { beforeEach, describe, expect, it, vi } from "vitest"

const adminFetchJson = vi.fn()
vi.mock("@/lib/admin-client", () => ({ adminFetchJson: (...args: unknown[]) => adminFetchJson(...args) }))

import {
  crmCustomerHref,
  customerDisplayName,
  fetchHardwareCustomers,
  fetchHardwareLots,
  fetchOwnerOptions,
  fetchReturnCandidates,
} from "@/components/admin/hardware/inventory/hardware-lookups"

beforeEach(() => {
  adminFetchJson.mockReset()
})

describe("조회 API 정리 — 계약 §7-3", () => {
  it("lots — itemId 를 우선 싣고 excludeMovementId 를 붙인다", async () => {
    adminFetchJson.mockResolvedValueOnce({
      itemId: "ifp86",
      product: '86" IFP',
      lotTracked: true,
      lots: [{ lotNo: "C1", remaining: 2 }, { lotNo: "", remaining: 4 }, { lotNo: "C2" }],
      nextLotNo: "C3",
    })
    const result = await fetchHardwareLots({ itemId: "ifp86", product: '86" IFP', excludeMovementId: "m1" })
    expect(adminFetchJson).toHaveBeenCalledWith("/api/admin/hardware/lots?itemId=ifp86&excludeMovementId=m1", { cache: "no-store" })
    expect(result).toEqual({
      itemId: "ifp86",
      product: '86" IFP',
      lotTracked: true,
      lots: [{ lotNo: "C1", remaining: 2 }, { lotNo: "C2", remaining: 0 }],
      nextLotNo: "C3",
    })
  })

  it("lots — itemId 가 없으면 품목명, lotTracked 칸이 없으면 관리 품목으로 본다", async () => {
    const fetcher = vi.fn().mockResolvedValue({ lots: [] })
    const result = await fetchHardwareLots({ product: "S1" }, fetcher)
    expect(fetcher).toHaveBeenCalledWith("/api/admin/hardware/lots?product=S1", { cache: "no-store" })
    expect(result.lotTracked).toBe(true)
    const untracked = await fetchHardwareLots({ product: "케이블" }, vi.fn().mockResolvedValue({ lotTracked: false }))
    expect(untracked.lotTracked).toBe(false)
  })

  it("return-candidates — 검색어·고객을 싣고 줄을 정리한다", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      candidates: [{ id: "o1", productName: "S1", quantity: 2, returned: 0, returnable: 2, outboundType: "as" }, { id: 3 }],
    })
    const rows = await fetchReturnCandidates({ q: " 남명 ", customerId: "cust-1" }, fetcher)
    expect(fetcher).toHaveBeenCalledWith("/api/admin/hardware/return-candidates?q=%EB%82%A8%EB%AA%85&customerId=cust-1", { cache: "no-store" })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ id: "o1", returnable: 2, outboundType: "as" })
    expect(await fetchReturnCandidates({}, vi.fn().mockResolvedValue(null))).toEqual([])
  })

  it("customers — 이름 없는 줄을 버리고 빈 캠퍼스는 null", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      customers: [
        { id: "c1", name: "남명학원", campusName: "본원", regionLabel: "서울 강남" },
        { id: "c2", name: " ", campusName: null },
        { id: "c3", name: "가온학원", campusName: "", regionLabel: null },
      ],
    })
    const rows = await fetchHardwareCustomers("남명", fetcher)
    expect(fetcher).toHaveBeenCalledWith("/api/admin/hardware/customers?q=%EB%82%A8%EB%AA%85", { cache: "no-store" })
    expect(rows).toEqual([
      { id: "c1", name: "남명학원", campusName: "본원", regionLabel: "서울 강남" },
      { id: "c3", name: "가온학원", campusName: null, regionLabel: null },
    ])
    expect(customerDisplayName(rows[0])).toBe("남명학원 본원")
    expect(customerDisplayName({ name: "남명학원 본원", campusName: "본원" })).toBe("남명학원 본원")
  })

  it("owners — 계정 id 가 있는 담당자만, 중복 없이", async () => {
    adminFetchJson.mockResolvedValueOnce({
      owners: [
        { userId: "u1", displayName: "김매니저" },
        { userId: null, displayName: "시트 담당" },
        { userId: "u1", displayName: "김매니저(중복)" },
        { userId: "u2", displayName: "박매니저" },
      ],
    })
    expect(await fetchOwnerOptions()).toEqual([
      { userId: "u1", name: "김매니저" },
      { userId: "u2", name: "박매니저" },
    ])
    expect(adminFetchJson).toHaveBeenCalledWith("/api/admin/crm/owners", undefined)
  })

  it("CRM 고객 링크는 통합 고객 검색으로 연다", () => {
    expect(crmCustomerHref("남명학원 본원")).toBe("/admin/crm/customers/unified?owner=&q=%EB%82%A8%EB%AA%85%ED%95%99%EC%9B%90%20%EB%B3%B8%EC%9B%90")
  })
})
