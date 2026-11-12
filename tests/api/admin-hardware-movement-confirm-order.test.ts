// PATCH /api/admin/hardware/movements/[id] confirm-planned — 오더로 만든 배송 예정을 출고 확정하면
// 그 딜을 설치 단계로 올린다(연결 로직 §4-4). 확정 권한은 재고관리 프로세스(갭 문서 §7-2) — 본인 건 또는
// 입고관리 권한자 — 이고, 기록을 읽어야 판정할 수 있어 저장소가 MovementRuleError(403)로 막는다.
import { NextRequest } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

const {
  requireVerifiedAdminContext,
  confirmPlannedHardwareMovement,
  advanceDealForShippedMovementSafely,
  logAdminAudit,
  requestDistributorReviewOnInstallSafely,
} = vi.hoisted(() => ({
  requireVerifiedAdminContext: vi.fn(),
  confirmPlannedHardwareMovement: vi.fn(),
  advanceDealForShippedMovementSafely: vi.fn(),
  logAdminAudit: vi.fn(),
  requestDistributorReviewOnInstallSafely: vi.fn(),
}))

vi.mock("@/lib/admin-auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin-auth")>()),
  requireVerifiedAdminContext,
}))
vi.mock("@/lib/auth/audit", () => ({ logAdminAudit }))
vi.mock("@/lib/orders/deal-stage", () => ({ advanceDealForShippedMovementSafely }))
vi.mock("@/lib/server/distributor-settlement-install", () => ({ requestDistributorReviewOnInstallSafely }))
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
    // 설치 완료 → 총판 정산 자동 준비 · 검토 요청(자동 발행 없음).
    expect(requestDistributorReviewOnInstallSafely).toHaveBeenCalledWith({ ...movement, lotNos: null })
    expect(logAdminAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "hardware.movement.finalize" }))
  })

  it.each([
    [{ status: "review_requested" }, "review_requested"],
    [{ status: "skipped", reason: "승인된 오더가 아닙니다." }, "skipped: 승인된 오더가 아닙니다."],
    [null, "failed"],
  ])("총판 정산 자동 준비 결과를 감사 기록에 남긴다(실패·건너뜀이 응답을 막지 않으므로) — %j", async (outcome, recorded) => {
    requireVerifiedAdminContext.mockResolvedValue(FINALIZER)
    confirmPlannedHardwareMovement.mockResolvedValue({ id: "mv_actual", raw: { sales_order_id: "so_1" }, lot_no: "C1" })
    advanceDealForShippedMovementSafely.mockResolvedValue(true)
    requestDistributorReviewOnInstallSafely.mockResolvedValue(outcome)

    const response = await PATCH(confirmRequest(), { params: Promise.resolve({ id: "mv_1" }) })
    expect(response.status).toBe(200)
    expect(logAdminAudit).toHaveBeenCalledWith(
      expect.objectContaining({ payload: expect.objectContaining({ distributorReview: recorded }) })
    )
  })

  it("요청자를 저장소로 넘기고, 저장소가 권한으로 막으면 403 — 딜 전진도 하지 않는다", async () => {
    const { MovementRuleError } = await import("@/lib/hardware/movement-rules")
    requireVerifiedAdminContext.mockResolvedValue({ ...FINALIZER, name: "운영 담당", userId: "admin-9", capabilities: [] })
    confirmPlannedHardwareMovement.mockRejectedValue(
      new MovementRuleError("다른 사람의 배송 예정은 담당자나 입고관리 권한자만 확정할 수 있습니다.", 403, "hardware.inbound")
    )

    const response = await PATCH(confirmRequest(), { params: Promise.resolve({ id: "mv_1" }) })

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({ requiredCapability: "hardware.inbound" })
    expect(confirmPlannedHardwareMovement).toHaveBeenCalledWith(
      "mv_1",
      expect.objectContaining({ actorContext: { userId: "admin-9", name: "운영 담당", isInventoryManager: false } })
    )
    expect(advanceDealForShippedMovementSafely).not.toHaveBeenCalled()
    expect(requestDistributorReviewOnInstallSafely).not.toHaveBeenCalled()
    expect(logAdminAudit).not.toHaveBeenCalled()
  })

  it("확정 물류번호 배정을 읽어 넘긴다", async () => {
    requireVerifiedAdminContext.mockResolvedValue(FINALIZER)
    confirmPlannedHardwareMovement.mockResolvedValue({ id: "mv_actual", lot_no: "C1" })
    const request = new NextRequest("https://classin.kr/api/admin/hardware/movements/mv_1", {
      method: "PATCH",
      body: JSON.stringify({ action: "confirm-planned", confirmQty: 3, lotAllocations: [{ lotNo: "C1", quantity: 2 }, { lotNo: "H8", quantity: 1 }] }),
      headers: { "content-type": "application/json" },
    })

    const response = await PATCH(request, { params: Promise.resolve({ id: "mv_1" }) })

    expect(response.status).toBe(200)
    expect(confirmPlannedHardwareMovement).toHaveBeenCalledWith("mv_1", expect.objectContaining({
      confirmQty: 3,
      lotAllocations: [{ lotNo: "C1", quantity: 2 }, { lotNo: "H8", quantity: 1 }],
      actorContext: expect.objectContaining({ isInventoryManager: true }),
    }))
    // 총판 정산 방식 판단에 쓰도록 배정된 로트를 모두 넘긴다(C1·H8 이 섞이면 검토 사유에 적힌다).
    expect(requestDistributorReviewOnInstallSafely).toHaveBeenCalledWith(
      expect.objectContaining({ id: "mv_actual", lotNos: ["C1", "H8"] })
    )
  })
})
