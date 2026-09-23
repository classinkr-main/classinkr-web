import { afterEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const requireVerifiedAdminContext = vi.fn()
const createHardwareMovementRows = vi.fn()
const createHardwareMovementsBatch = vi.fn()

vi.mock("@/lib/admin-auth", () => ({
  HARDWARE_EDITOR_ADMIN_API_ROLES: ["SUPER_ADMIN", "ADMIN", "BRANCH", "EDITOR"],
  requireVerifiedAdminContext,
}))

vi.mock("@/lib/repositories/hardware-inventory", () => ({
  HARDWARE_MOVEMENT_TYPES: ["inbound", "outbound", "return", "transfer", "repair", "adjust"],
  createHardwareMovementRows,
  createHardwareMovementsBatch,
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
    createHardwareMovementsBatch.mockResolvedValue([
      { ok: true, movements: [{ id: "movement-1", product_name: "카메라", quantity: 2 }], error: null },
      { ok: false, movements: [], error: "칠판 lot 재고가 부족합니다." },
    ])

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
    // 줄별 결과는 그대로 두고 저장은 한 번에 보낸다(왕복 1회).
    expect(createHardwareMovementsBatch).toHaveBeenCalledTimes(1)
    expect(createHardwareMovementsBatch).toHaveBeenCalledWith([
      expect.objectContaining({
        createdBy: "Ops Admin",
        movementType: "outbound",
        productName: "카메라",
        quantity: 2,
      }),
      expect.objectContaining({ productName: "칠판", quantity: 1 }),
    ])
    expect(createHardwareMovementRows).not.toHaveBeenCalled()
  })

  it("uses a non-2xx response when every cart line fails", async () => {
    requireVerifiedAdminContext.mockResolvedValue({
      source: "supabase",
      role: "ADMIN",
      name: "Ops Admin",
      userId: "admin-1",
    })
    createHardwareMovementsBatch.mockResolvedValue([
      { ok: false, movements: [], error: "카메라 lot 재고가 부족합니다." },
    ])

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

  it("keeps an unparsable cart line out of the batch and fails only that line", async () => {
    requireVerifiedAdminContext.mockResolvedValue({
      source: "supabase",
      role: "ADMIN",
      name: "Ops Admin",
      userId: "admin-1",
    })
    createHardwareMovementsBatch.mockResolvedValue([
      { ok: true, movements: [{ id: "movement-1", product_name: "카메라", quantity: 2 }], error: null },
    ])

    const { POST } = await import("@/app/api/admin/hardware/movements/route")
    const response = await POST(movementsRequest({
      movements: [
        { productName: "카메라", movementType: "outbound", quantity: 2 },
        { productName: "칠판", movementType: "outbound", quantity: 0 },
      ],
    }))

    expect(response.status).toBe(207)
    await expect(response.json()).resolves.toMatchObject({
      lineResults: [
        { index: 0, ok: true, productName: "카메라", quantity: 2 },
        { index: 1, ok: false, productName: "칠판", quantity: 0 },
      ],
      summary: { success: 1, failed: 1 },
    })
    // 저장 요청에는 파싱된 줄만 실린다.
    expect(createHardwareMovementsBatch).toHaveBeenCalledWith([
      expect.objectContaining({ productName: "카메라", quantity: 2 }),
    ])
  })
})
