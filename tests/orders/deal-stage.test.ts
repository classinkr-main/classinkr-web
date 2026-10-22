// lib/orders/deal-stage.ts — 오더가 딜 단계를 전진시킨다(확정·설치). 전진만, 취소 딜은 그대로, 실패는 삼킨다.
import { beforeEach, describe, expect, it, vi } from "vitest"

const { getDeal, updateDeal, salesOrderRows } = vi.hoisted(() => ({
  getDeal: vi.fn(),
  updateDeal: vi.fn(),
  salesOrderRows: { value: [] as unknown[], error: null as unknown },
}))

vi.mock("@/lib/portal/repositories/deals", () => ({ getDeal, updateDeal }))
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => ({
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        limit: () => Promise.resolve({ data: salesOrderRows.value, error: salesOrderRows.error }),
      }
      return chain
    },
  })),
}))

import { advanceDealForShippedMovementSafely, advanceDealStageSafely } from "@/lib/orders/deal-stage"

beforeEach(() => {
  getDeal.mockReset()
  updateDeal.mockReset()
  salesOrderRows.value = []
  salesOrderRows.error = null
})

describe("advanceDealStageSafely", () => {
  it("앞 단계면 올리고, 같거나 뒤 단계·취소 딜은 그대로 둔다", async () => {
    getDeal.mockResolvedValueOnce({ id: "d", current_stage: "quote" })
    await expect(advanceDealStageSafely("d", "confirmed")).resolves.toBe(true)
    expect(updateDeal).toHaveBeenCalledWith("d", { current_stage: "confirmed" })

    for (const stage of ["confirmed", "installation", "payment", "cancelled"]) {
      updateDeal.mockClear()
      getDeal.mockResolvedValueOnce({ id: "d", current_stage: stage })
      await expect(advanceDealStageSafely("d", "confirmed")).resolves.toBe(false)
      expect(updateDeal).not.toHaveBeenCalled()
    }
  })

  it("딜이 없거나 갱신이 실패해도 throw 하지 않는다", async () => {
    await expect(advanceDealStageSafely(null, "installation")).resolves.toBe(false)

    getDeal.mockResolvedValueOnce({ id: "d", current_stage: "confirmed" })
    updateDeal.mockRejectedValueOnce(new Error("db down"))
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined)
    await expect(advanceDealStageSafely("d", "installation")).resolves.toBe(false)
    errorLog.mockRestore()
  })
})

describe("advanceDealForShippedMovementSafely", () => {
  it("오더로 만든 예정을 확정하면 그 오더의 딜을 설치로 올린다", async () => {
    salesOrderRows.value = [{ deal_id: "deal_1", status: "approved" }]
    getDeal.mockResolvedValueOnce({ id: "deal_1", current_stage: "confirmed" })

    await expect(advanceDealForShippedMovementSafely({ raw: { sales_order_id: "so_1", order_no: "ORD-2610-002" } })).resolves.toBe(true)
    expect(updateDeal).toHaveBeenCalledWith("deal_1", { current_stage: "installation" })
  })

  it("오더 없이 만든 예정·취소된 오더는 아무것도 하지 않는다", async () => {
    await expect(advanceDealForShippedMovementSafely({ raw: { workflow: {} } })).resolves.toBe(false)
    await expect(advanceDealForShippedMovementSafely(null)).resolves.toBe(false)

    salesOrderRows.value = [{ deal_id: "deal_1", status: "cancelled" }]
    await expect(advanceDealForShippedMovementSafely({ raw: { sales_order_id: "so_1" } })).resolves.toBe(false)
    expect(getDeal).not.toHaveBeenCalled()
  })
})
