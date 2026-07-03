import { afterEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const requireVerifiedAdminContext = vi.fn()
const createHardwareMovementRows = vi.fn()

vi.mock("@/lib/admin-auth", () => ({
  requireVerifiedAdminContext,
}))

vi.mock("@/lib/repositories/hardware-inventory", () => ({
  HARDWARE_MOVEMENT_TYPES: ["inbound", "outbound", "return", "transfer", "repair", "adjust"],
  createHardwareMovementRows,
}))

function movementsRequest(body: unknown) {
  return new NextRequest("https://classin.kr/api/admin/hardware/movements", {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
    },
  })
}

describe("POST /api/admin/hardware/movements", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("returns line-level results so failed cart lines can be retried", async () => {
    requireVerifiedAdminContext.mockResolvedValue({
      source: "supabase",
      role: "ADMIN",
      name: "Ops Admin",
      userId: "admin-1",
    })
    createHardwareMovementRows
      .mockResolvedValueOnce([{ id: "movement-1", product_name: "카메라", quantity: 2 }])
      .mockRejectedValueOnce(new Error("칠판 lot 재고가 부족합니다."))

    const { POST } = await import("@/app/api/admin/hardware/movements/route")
    const response = await POST(movementsRequest({
      movements: [
        { productName: "카메라", movementType: "outbound", quantity: 2 },
        { productName: "칠판", movementType: "outbound", quantity: 1 },
      ],
    }))

    expect(response.status).toBe(207)
    await expect(response.json()).resolves.toMatchObject({
      movements: [{ id: "movement-1", product_name: "카메라", quantity: 2 }],
      lineResults: [
        { index: 0, ok: true, productName: "카메라", quantity: 2 },
        { index: 1, ok: false, productName: "칠판", quantity: 1, error: "칠판 lot 재고가 부족합니다." },
      ],
      summary: { success: 1, failed: 1 },
    })
    expect(createHardwareMovementRows).toHaveBeenCalledTimes(2)
    expect(createHardwareMovementRows).toHaveBeenNthCalledWith(1, expect.objectContaining({
      createdBy: "Ops Admin",
      movementType: "outbound",
      productName: "카메라",
      quantity: 2,
    }))
  })

  it("uses a non-2xx response when every cart line fails", async () => {
    requireVerifiedAdminContext.mockResolvedValue({
      source: "supabase",
      role: "ADMIN",
      name: "Ops Admin",
      userId: "admin-1",
    })
    createHardwareMovementRows.mockRejectedValueOnce(new Error("카메라 lot 재고가 부족합니다."))

    const { POST } = await import("@/app/api/admin/hardware/movements/route")
    const response = await POST(movementsRequest({
      movements: [
        { productName: "카메라", movementType: "outbound", quantity: 2 },
      ],
    }))

    expect(response.status).toBe(422)
    await expect(response.json()).resolves.toMatchObject({
      movements: [],
      lineResults: [
        { index: 0, ok: false, productName: "카메라", quantity: 2, error: "카메라 lot 재고가 부족합니다." },
      ],
      summary: { success: 0, failed: 1 },
    })
  })
})
