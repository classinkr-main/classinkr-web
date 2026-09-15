// app/api/admin/hardware/samples/route.ts — 샘플 이벤트 입력 검증·규칙 오류 상태·감사 로그 회귀.
//
// 사무실·샘플 재고 풀(2026-09-15): showcase·store 이벤트와 adjust 의 nextStatus(상태 정정)를 받는다.
// 전이·메모 필수 규칙은 저장소가 판정하고(SampleUnitRuleError), 라우트는 그 상태를 그대로 돌려준다.
import { NextRequest, NextResponse } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

const { requireVerifiedAdminContext, verifyAdmin, recordSampleUnitEvents, registerSampleUnits, logAdminAudit, RuleError } =
  vi.hoisted(() => {
    class RuleError extends Error {
      readonly status: number
      constructor(message: string, status = 400) {
        super(message)
        this.status = status
      }
    }
    return {
      requireVerifiedAdminContext: vi.fn(),
      verifyAdmin: vi.fn(),
      recordSampleUnitEvents: vi.fn(),
      registerSampleUnits: vi.fn(),
      logAdminAudit: vi.fn(),
      RuleError,
    }
  })

vi.mock("@/lib/admin-auth", () => ({
  BRANCH_READ_ADMIN_API_ROLES: ["SUPER_ADMIN", "ADMIN", "BRANCH", "EDITOR", "VIEWER"],
  HARDWARE_EDITOR_ADMIN_API_ROLES: ["SUPER_ADMIN", "ADMIN", "BRANCH", "EDITOR"],
  requireVerifiedAdminContext,
  verifyAdmin,
}))

vi.mock("@/lib/admin-api-response", () => ({
  adminCachedJson: (body: unknown) => NextResponse.json(body),
}))

vi.mock("@/lib/auth/audit", () => ({ logAdminAudit }))

vi.mock("@/lib/repositories/hardware-samples", () => ({
  SAMPLE_UNIT_STATUSES: ["office", "showroom", "loaned", "repair", "converted", "retired"],
  SAMPLE_EVENT_TYPES: ["assign", "loan", "return", "showcase", "store", "repair", "convert", "adjust", "memo", "retire"],
  SampleUnitRuleError: RuleError,
  listSampleUnits: vi.fn(),
  listSampleUnitEvents: vi.fn(),
  recordSampleUnitEvents,
  registerSampleUnits,
}))

import { POST } from "@/app/api/admin/hardware/samples/route"

const ADMIN = { source: "supabase", role: "ADMIN", name: "Ops Admin", userId: "admin-1" }

function samplesRequest(body: unknown) {
  return new NextRequest("https://classin.kr/api/admin/hardware/samples", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  })
}

function sampleUnit(id: string, status: string) {
  return { id, asset_code: `S-86-${id}`, product_name: '86" IFP', status }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe("POST /api/admin/hardware/samples — 샘플 이벤트 검증", () => {
  it("showcase 이벤트를 받아 저장소에 넘기고 감사 로그를 남긴다", async () => {
    requireVerifiedAdminContext.mockResolvedValue(ADMIN)
    recordSampleUnitEvents.mockResolvedValue([sampleUnit("01", "showroom"), sampleUnit("02", "showroom")])

    const response = await POST(samplesRequest({ action: "event", eventType: "showcase", unitIds: ["01", "02"] }))

    expect(response.status).toBe(201)
    expect(recordSampleUnitEvents).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "showcase", unitIds: ["01", "02"], nextStatus: null, createdBy: "Ops Admin" })
    )
    expect(logAdminAudit).toHaveBeenCalledWith({
      admin: ADMIN,
      action: "hardware.sample.showcase",
      targetType: "hardware_sample_unit",
      targetId: undefined,
      payload: {
        eventType: "showcase",
        nextStatus: null,
        statuses: ["showroom"],
        count: 2,
        unitIds: ["01", "02"],
        assetCodes: ["S-86-01", "S-86-02"],
      },
    })
  })

  it("store 이벤트도 허용한다", async () => {
    requireVerifiedAdminContext.mockResolvedValue(ADMIN)
    recordSampleUnitEvents.mockResolvedValue([sampleUnit("01", "office")])

    const response = await POST(samplesRequest({ action: "event", eventType: "store", unitIds: ["01"] }))

    expect(response.status).toBe(201)
    expect(logAdminAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "hardware.sample.store", targetId: "01" })
    )
  })

  it("adjust 의 nextStatus 를 허용 상태 enum 으로 검증해 넘긴다", async () => {
    requireVerifiedAdminContext.mockResolvedValue(ADMIN)
    recordSampleUnitEvents.mockResolvedValue([sampleUnit("01", "showroom")])

    const response = await POST(
      samplesRequest({ action: "event", eventType: "adjust", unitIds: ["01"], nextStatus: "showroom", memo: "쇼룸 전시" })
    )

    expect(response.status).toBe(201)
    expect(recordSampleUnitEvents).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "adjust", nextStatus: "showroom", memo: "쇼룸 전시" })
    )
    expect(logAdminAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "hardware.sample.adjust",
        payload: expect.objectContaining({ nextStatus: "showroom" }),
      })
    )
  })

  it("허용되지 않는 nextStatus 값은 400 이고 저장소를 부르지 않는다", async () => {
    requireVerifiedAdminContext.mockResolvedValue(ADMIN)

    const response = await POST(
      samplesRequest({ action: "event", eventType: "adjust", unitIds: ["01"], nextStatus: "demo", memo: "x" })
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: "정정 상태 값이 올바르지 않습니다." })
    expect(recordSampleUnitEvents).not.toHaveBeenCalled()
    expect(logAdminAudit).not.toHaveBeenCalled()
  })

  it("adjust 가 아닌 이벤트에 nextStatus 를 붙이면 400 이다", async () => {
    requireVerifiedAdminContext.mockResolvedValue(ADMIN)

    const response = await POST(
      samplesRequest({ action: "event", eventType: "loan", unitIds: ["01"], customer: "남명학원", nextStatus: "office" })
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: "상태 정정(nextStatus)은 정정(adjust) 이벤트에서만 쓸 수 있습니다.",
    })
    expect(recordSampleUnitEvents).not.toHaveBeenCalled()
  })

  it("빈 문자열 nextStatus 는 없는 것으로 본다", async () => {
    requireVerifiedAdminContext.mockResolvedValue(ADMIN)
    recordSampleUnitEvents.mockResolvedValue([sampleUnit("01", "loaned")])

    const response = await POST(
      samplesRequest({ action: "event", eventType: "adjust", unitIds: ["01"], nextStatus: "", customer: "탑텐영어" })
    )

    expect(response.status).toBe(201)
    expect(recordSampleUnitEvents).toHaveBeenCalledWith(expect.objectContaining({ nextStatus: null }))
  })

  it("assign·알 수 없는 이벤트 유형은 400 이다", async () => {
    requireVerifiedAdminContext.mockResolvedValue(ADMIN)

    for (const eventType of ["assign", "display"]) {
      const response = await POST(samplesRequest({ action: "event", eventType, unitIds: ["01"] }))
      expect(response.status).toBe(400)
    }
    expect(recordSampleUnitEvents).not.toHaveBeenCalled()
  })

  it("저장소 규칙 오류는 정해진 상태와 문구 그대로 돌려주고 감사 로그를 남기지 않는다", async () => {
    requireVerifiedAdminContext.mockResolvedValue(ADMIN)
    recordSampleUnitEvents.mockRejectedValueOnce(new RuleError("전시 상태는 DB 업데이트 적용 후 사용할 수 있습니다.", 409))

    const response = await POST(samplesRequest({ action: "event", eventType: "showcase", unitIds: ["01"] }))

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({ error: "전시 상태는 DB 업데이트 적용 후 사용할 수 있습니다." })
    expect(logAdminAudit).not.toHaveBeenCalled()
  })

  it("메모 이벤트는 감사 로그를 따로 남기지 않는다", async () => {
    requireVerifiedAdminContext.mockResolvedValue(ADMIN)
    recordSampleUnitEvents.mockResolvedValue([sampleUnit("01", "loaned")])

    const response = await POST(samplesRequest({ action: "event", eventType: "memo", unitIds: ["01"], memo: "회수 협의" }))

    expect(response.status).toBe(201)
    expect(logAdminAudit).not.toHaveBeenCalled()
  })

  it("등록(register)은 hardware.sample.register 로 감사 로그를 남긴다", async () => {
    requireVerifiedAdminContext.mockResolvedValue(ADMIN)
    registerSampleUnits.mockResolvedValue([sampleUnit("01", "office")])

    const response = await POST(samplesRequest({ action: "register", productName: '86" IFP', count: 1, status: "office" }))

    expect(response.status).toBe(201)
    expect(logAdminAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "hardware.sample.register",
        targetId: "01",
        payload: expect.objectContaining({ productName: '86" IFP', status: "office", count: 1 }),
      })
    )
  })

  it("등록 초기 상태는 여전히 office·loaned 만 받는다(showroom 등록 불가)", async () => {
    requireVerifiedAdminContext.mockResolvedValue(ADMIN)

    const response = await POST(
      samplesRequest({ action: "register", productName: '86" IFP', count: 1, status: "showroom" })
    )

    expect(response.status).toBe(400)
    expect(registerSampleUnits).not.toHaveBeenCalled()
  })

  it("편집 권한이 없는 요청은 인증 가드 응답을 그대로 돌려준다", async () => {
    requireVerifiedAdminContext.mockResolvedValue(NextResponse.json({ error: "Forbidden" }, { status: 403 }))

    const response = await POST(samplesRequest({ action: "event", eventType: "showcase", unitIds: ["01"] }))

    expect(response.status).toBe(403)
    expect(recordSampleUnitEvents).not.toHaveBeenCalled()
  })
})
