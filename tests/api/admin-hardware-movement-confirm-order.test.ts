// PATCH /api/admin/hardware/movements/[id] confirm-planned — 오더로 만든 배송 예정을 출고 확정하면
// 그 딜을 설치 단계로 올린다(연결 로직 §4-4). 확정 권한(hardware.finalize) 게이트는 그대로다.
import { NextRequest } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

const { requireVerifiedAdminContext, confirmPlannedHardwareMovement, advanceDealForShippedMovementSafely, logAdminAudit } =
  vi.hoisted(() => ({
    requireVerifiedAdminContext: vi.fn(),
    confirmPlannedHardwareMovement: vi.fn(),
    advanceDealForShippedMovementSafely: vi.fn(),
    logAdminAudit: vi.fn(),
  }))

vi.mock("@/lib/admin-auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin-auth")>()),
  requireVerifiedAdminContext,
}))
vi.mock("@/lib/auth/audit", () => ({ logAdminAudit }))
vi.mock("@/lib/orders/deal-stage", () => ({ advanceDealForShippedMovementSafely }))
vi.mock("@/lib/repositories/hardware-inventory", () => ({
  confirmPlannedHardwareMovement,
  HARDWARE_MOVEMENT_TYPES: ["inbound", "outbound", "return", "transfer", "repair", "adjust"],
  updateHardwareMovement: vi.fn(),
  voidHardwareMovement: vi.fn(),
}))

import { PATCH } from "@/app/api/admin/hardware/movements/[id]/route"

const FINALIZER = { source: "supabase", role: "ADMIN", name: "이왕찬", userId: "admin-2", capabilities: ["hardware.finalize"] }

function confirmRequest() {
  return new NextRequest("https://classin.kr/api/admin/hardware/movements/mv_1", {
    method: "PATCH",
    body: JSON.stringify({ action: "confirm-planned" }),
    headers: { "content-type": "application/json" },
  })
}

afterEach(() => {
  vi.clearAllMocks()
})

describe("PATCH movements/[id] confirm-planned — 오더 딜 설치 단계", () => {
  it("확정한 행을 넘겨 딜 단계 전진을 맡긴다", async () => {
    requireVerifiedAdminContext.mockResolvedValue(FINALIZER)
    const movement = { id: "mv_actual", raw: { order_no: "ORD-2610-002", sales_order_id: "so_1" } }
    confirmPlannedHardwareMovement.mockResolvedValue(movement)
    advanceDealForShippedMovementSafely.mockResolvedValue(true)

    const response = await PATCH(confirmRequest(), { params: Promise.resolve({ id: "mv_1" }) })

    expect(response.status).toBe(200)
    expect(advanceDealForShippedMovementSafely).toHaveBeenCalledWith(movement)
    expect(logAdminAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "hardware.movement.finalize" }))
  })

  it("확정 권한이 없으면 403 — 확정도 딜 전진도 하지 않는다", async () => {
    requireVerifiedAdminContext.mockResolvedValue({ ...FINALIZER, name: "운영 담당", capabilities: [] })

    const response = await PATCH(confirmRequest(), { params: Promise.resolve({ id: "mv_1" }) })

    expect(response.status).toBe(403)
    expect(confirmPlannedHardwareMovement).not.toHaveBeenCalled()
    expect(advanceDealForShippedMovementSafely).not.toHaveBeenCalled()
  })
})
