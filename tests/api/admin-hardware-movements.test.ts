import { afterEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const requireVerifiedAdminContext = vi.fn()
const createHardwareMovementRows = vi.fn()
const createHardwareMovementsBatch = vi.fn()

vi.mock("@/lib/admin-auth", async () => {
  const { NextResponse } = await import("next/server")
  const isManager = (admin: { role: string; capabilities?: string[] }) =>
    admin.role === "SUPER_ADMIN" ||
    (admin.capabilities ?? []).some((capability) => capability === "hardware.inbound" || capability === "hardware.finalize")
  return {
    HARDWARE_EDITOR_ADMIN_API_ROLES: ["SUPER_ADMIN", "ADMIN", "BRANCH", "EDITOR"],
    requireVerifiedAdminContext,
    toHardwareActor: (admin: { role: string; capabilities?: string[]; userId?: string; name?: string }) => ({
      userId: admin.userId ?? null,
      name: admin.name ?? null,
      isInventoryManager: isManager(admin),
    }),
    requireHardwareInventoryManager: (admin: { role: string; capabilities?: string[] }) =>
      isManager(admin)
        ? undefined
        : NextResponse.json({ error: "입고관리 권한(hardware.inbound)이 필요합니다.", requiredCapability: "hardware.inbound" }, { status: 403 }),
  }
})

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
    ], { actor: { userId: "admin-1", name: "Ops Admin", isInventoryManager: false } })
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
    ], expect.objectContaining({ actor: expect.any(Object) }))
  })

  it("입고·재고 조정이 섞인 저장은 입고관리 권한자만 — 아니면 저장 전에 403", async () => {
    requireVerifiedAdminContext.mockResolvedValue({ source: "supabase", role: "ADMIN", name: "김매니저", userId: "u-1", capabilities: [] })

    const { POST } = await import("@/app/api/admin/hardware/movements/route")
    const response = await POST(movementsRequest({
      movements: [
        { productName: "T1", movementType: "inbound", quantity: 2, isFree: false, lotNo: "C3" },
      ],
    }))

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({ requiredCapability: "hardware.inbound" })
    expect(createHardwareMovementsBatch).not.toHaveBeenCalled()
  })

  it("새 칸을 읽어 요청자와 함께 저장소로 넘긴다", async () => {
    requireVerifiedAdminContext.mockResolvedValue({ source: "supabase", role: "ADMIN", name: "김매니저", userId: "u-1", capabilities: [] })
    createHardwareMovementRows.mockResolvedValue([{ id: "mv-1" }])

    const { POST } = await import("@/app/api/admin/hardware/movements/route")
    const response = await POST(movementsRequest({
      productName: "T1",
      movementType: "outbound",
      quantity: 1,
      occurredAt: "2026-10-28",
      status: "배송 예정",
      outboundType: "sample",
      customerId: "11111111-1111-4111-8111-111111111111",
      expectedReturnAt: "2026-11-30",
      lotNo: "C1",
    }))

    expect(response.status).toBe(201)
    expect(createHardwareMovementRows).toHaveBeenCalledWith(
      expect.objectContaining({
        outboundType: "sample",
        customerId: "11111111-1111-4111-8111-111111111111",
        expectedReturnAt: "2026-11-30",
        lotNo: "C1",
      }),
      { actor: { userId: "u-1", name: "김매니저", isInventoryManager: false } }
    )
  })

  it("출고 유형·고객 id 형식이 틀리면 400", async () => {
    requireVerifiedAdminContext.mockResolvedValue({ source: "supabase", role: "ADMIN", name: "김매니저", userId: "u-1", capabilities: [] })
    const { POST } = await import("@/app/api/admin/hardware/movements/route")

    const badType = await POST(movementsRequest({ productName: "T1", movementType: "outbound", quantity: 1, outboundType: "gift" }))
    expect(badType.status).toBe(400)
    const badCustomer = await POST(movementsRequest({ productName: "T1", movementType: "outbound", quantity: 1, customerId: "cust-1" }))
    expect(badCustomer.status).toBe(400)
    expect(createHardwareMovementRows).not.toHaveBeenCalled()
  })
})
