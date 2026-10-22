// app/api/admin/hardware/orders — 하드웨어 승인 대기 목록과 승인·반려·취소.
// 하드웨어가 들어간 오더는 hardware.finalize 권한자(이왕찬·슈퍼 어드민)만 결정한다(2026-10-22 운영자 결정).
// 권한 판정은 실제 lib/admin-auth 의 hasAdminCapability·requireAdminCapability 를 그대로 쓴다.
import { NextRequest } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

const {
  requireVerifiedAdminContext,
  logAdminAudit,
  listSalesOrders,
  listSheetOrderChecks,
  approveSalesOrder,
  rejectSalesOrder,
  cancelApprovedSalesOrder,
} = vi.hoisted(() => ({
  requireVerifiedAdminContext: vi.fn(),
  logAdminAudit: vi.fn(),
  listSalesOrders: vi.fn(),
  listSheetOrderChecks: vi.fn(),
  approveSalesOrder: vi.fn(),
  rejectSalesOrder: vi.fn(),
  cancelApprovedSalesOrder: vi.fn(),
}))

vi.mock("@/lib/admin-auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin-auth")>()),
  requireVerifiedAdminContext,
}))
vi.mock("@/lib/auth/audit", () => ({ logAdminAudit }))
vi.mock("@/lib/repositories/sales-orders", async () => {
  class SalesOrderError extends Error {
    status: number
    constructor(message: string, status: number) {
      super(message)
      this.status = status
    }
  }
  return { SalesOrderError, listSalesOrders, listSheetOrderChecks, approveSalesOrder, rejectSalesOrder, cancelApprovedSalesOrder }
})

import { GET } from "@/app/api/admin/hardware/orders/route"
import { POST } from "@/app/api/admin/hardware/orders/[id]/route"
import { GET as GET_SHEET_CHECK } from "@/app/api/admin/hardware/orders/sheet-check/route"
import { SalesOrderError } from "@/lib/repositories/sales-orders"

const EDITOR = { source: "supabase", role: "ADMIN", name: "운영 담당", userId: "admin-1", capabilities: [] }
const FINALIZER = { ...EDITOR, name: "이왕찬", userId: "admin-2", capabilities: ["hardware.finalize"] }
const SUPER = { ...EDITOR, role: "SUPER_ADMIN", name: "지사장", userId: "admin-3" }

function listRequest(query = "") {
  return new NextRequest(`https://classin.kr/api/admin/hardware/orders${query}`)
}

function actionRequest(body: unknown) {
  return new NextRequest("https://classin.kr/api/admin/hardware/orders/so_1", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  })
}

const params = { params: Promise.resolve({ id: "so_1" }) }

afterEach(() => {
  vi.clearAllMocks()
})

describe("GET /api/admin/hardware/orders", () => {
  it("기본은 승인 대기만 읽고, 버튼 표시용 canApprove 를 권한으로 정한다", async () => {
    requireVerifiedAdminContext.mockResolvedValue(EDITOR)
    listSalesOrders.mockResolvedValue([{ id: "so_1" }])

    const response = await GET(listRequest())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(listSalesOrders).toHaveBeenCalledWith({ statuses: ["pending_approval"], limit: 100, withFulfillment: false })
    expect(body).toEqual({ orders: [{ id: "so_1" }], viewer: { canApprove: false } })

    requireVerifiedAdminContext.mockResolvedValue(FINALIZER)
    expect((await (await GET(listRequest("?status=closed"))).json()).viewer.canApprove).toBe(true)
    expect(listSalesOrders).toHaveBeenLastCalledWith({ statuses: ["rejected", "cancelled"], limit: 100, withFulfillment: false })

    // 승인된 오더에는 출고·예정 대수를 붙인다.
    await GET(listRequest("?status=approved"))
    expect(listSalesOrders).toHaveBeenLastCalledWith({ statuses: ["approved"], limit: 100, withFulfillment: true })
  })

  it("모르는 status 는 400", async () => {
    requireVerifiedAdminContext.mockResolvedValue(EDITOR)
    expect((await GET(listRequest("?status=weird"))).status).toBe(400)
    expect(listSalesOrders).not.toHaveBeenCalled()
  })

  it("마이그레이션 미적용(503)은 available:false 로 알려 화면이 안내로 강등한다", async () => {
    requireVerifiedAdminContext.mockResolvedValue(EDITOR)
    listSalesOrders.mockRejectedValue(new SalesOrderError("오더 기능은 DB 업데이트 적용 후 사용할 수 있습니다.", 503))

    const response = await GET(listRequest())

    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ available: false })
  })
})

describe("POST /api/admin/hardware/orders/[id]", () => {
  it("hardware.finalize 가 없으면 403 — 저장소를 부르지 않는다", async () => {
    requireVerifiedAdminContext.mockResolvedValue(EDITOR)

    const response = await POST(actionRequest({ action: "approve" }), params)

    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ requiredCapability: "hardware.finalize" })
    expect(approveSalesOrder).not.toHaveBeenCalled()
    expect(logAdminAudit).not.toHaveBeenCalled()
  })

  it("권한자가 승인하면 오더를 돌려주고 감사 로그를 남긴다", async () => {
    requireVerifiedAdminContext.mockResolvedValue(FINALIZER)
    approveSalesOrder.mockResolvedValue({ id: "so_1", orderNo: "ORD-2610-002", status: "approved" })

    const response = await POST(actionRequest({ action: "approve" }), params)

    expect(response.status).toBe(200)
    expect(approveSalesOrder).toHaveBeenCalledWith("so_1", { actor: "이왕찬" })
    expect(logAdminAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "hardware.order.approve",
        targetType: "sales_order",
        targetId: "so_1",
        payload: { orderNo: "ORD-2610-002", status: "approved", reason: null },
      })
    )
  })

  it("슈퍼 어드민(지사장)도 반려·취소할 수 있고 사유를 넘긴다", async () => {
    requireVerifiedAdminContext.mockResolvedValue(SUPER)
    rejectSalesOrder.mockResolvedValue({ id: "so_1", orderNo: null, status: "rejected" })
    cancelApprovedSalesOrder.mockResolvedValue({ id: "so_1", orderNo: "ORD-2610-002", status: "cancelled" })

    expect((await POST(actionRequest({ action: "reject", reason: "재고 부족" }), params)).status).toBe(200)
    expect(rejectSalesOrder).toHaveBeenCalledWith("so_1", { actor: "지사장", reason: "재고 부족" })

    expect((await POST(actionRequest({ action: "cancel", reason: "고객 취소" }), params)).status).toBe(200)
    expect(cancelApprovedSalesOrder).toHaveBeenCalledWith("so_1", { actor: "지사장", reason: "고객 취소" })
  })

  it("저장소 규칙 오류는 그 상태 코드로, 모르는 액션은 400", async () => {
    requireVerifiedAdminContext.mockResolvedValue(FINALIZER)
    approveSalesOrder.mockRejectedValue(new SalesOrderError("이미 처리된 오더입니다.", 409))

    const conflict = await POST(actionRequest({ action: "approve" }), params)
    expect(conflict.status).toBe(409)
    expect(await conflict.json()).toEqual({ error: "이미 처리된 오더입니다." })
    expect(logAdminAudit).not.toHaveBeenCalled()

    expect((await POST(actionRequest({ action: "delete" }), params)).status).toBe(400)
  })
})

describe("GET /api/admin/hardware/orders/sheet-check", () => {
  it("편집 역할 누구나 읽고, canApprove 를 함께 돌려준다", async () => {
    requireVerifiedAdminContext.mockResolvedValue(EDITOR)
    listSheetOrderChecks.mockResolvedValue({ since: "2026-10-22", checks: [{ kind: "missing_order_no" }] })

    const response = await GET_SHEET_CHECK(listRequest("/sheet-check"))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      since: "2026-10-22",
      checks: [{ kind: "missing_order_no" }],
      viewer: { canApprove: false },
    })
  })

  it("테이블 미적용(503)은 available:false", async () => {
    requireVerifiedAdminContext.mockResolvedValue(FINALIZER)
    listSheetOrderChecks.mockRejectedValue(new SalesOrderError("오더 기능은 DB 업데이트 적용 후 사용할 수 있습니다.", 503))

    const response = await GET_SHEET_CHECK(listRequest("/sheet-check"))

    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ available: false })
  })
})
