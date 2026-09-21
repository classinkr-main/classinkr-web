/**
 * POST /api/admin/crm/source-links/hw-outbound (M4) — 360 매출 탭 "연결 대기 출고"에서
 * 미매칭 HW 출고를 NEO 계정에 확정 연결하는 라우트. source-links/manual과 같은 역할
 * (CRM_STAFF_ADMIN_API_ROLES)·검증(400)·충돌(409)·무효화 태그 계약을 고정한다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest, NextResponse } from "next/server"

const mocks = vi.hoisted(() => {
  class HoistedCrmSourceLinkConflictError extends Error {}
  return {
    requireVerifiedAdminContext: vi.fn(),
    confirmHwOutboundAccountLink: vi.fn(),
    revalidateTag: vi.fn(),
    CrmSourceLinkConflictError: HoistedCrmSourceLinkConflictError,
  }
})

vi.mock("@/lib/admin-auth", () => ({
  CRM_STAFF_ADMIN_API_ROLES: ["SUPER_ADMIN", "ADMIN", "BRANCH"],
  requireVerifiedAdminContext: mocks.requireVerifiedAdminContext,
}))

vi.mock("@/lib/repositories/crm-source-links", () => ({
  confirmHwOutboundAccountLink: mocks.confirmHwOutboundAccountLink,
  CrmSourceLinkConflictError: mocks.CrmSourceLinkConflictError,
}))

vi.mock("@/lib/admin-crm-revenue", () => ({
  ADMIN_CRM_REVENUE_CACHE_TAG: "test-admin-crm-revenue",
}))

vi.mock("@/lib/admin-crm-revenue-sheet", () => ({
  ADMIN_CRM_REVENUE_SHEET_CACHE_TAG: "test-admin-crm-revenue-sheet",
}))

vi.mock("next/cache", () => ({
  revalidateTag: mocks.revalidateTag,
}))

import {
  ADMIN_CRM_COVERAGE_CACHE_TAG,
  ADMIN_CRM_UNIFIED_SNAPSHOT_CACHE_TAG,
  ADMIN_OS_SUMMARY_CACHE_TAG,
} from "@/lib/admin/crm/cache-tags"

function postRequest(body: unknown) {
  return new NextRequest("https://classin.kr/api/admin/crm/source-links/hw-outbound", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

async function loadRoute() {
  return import("@/app/api/admin/crm/source-links/hw-outbound/route")
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireVerifiedAdminContext.mockResolvedValue({ userId: "admin-1" })
})

describe("POST /api/admin/crm/source-links/hw-outbound — 역할", () => {
  it("인증 실패면 저장소 호출 없이 그대로 응답한다", async () => {
    mocks.requireVerifiedAdminContext.mockResolvedValue(NextResponse.json({ error: "unauthorized" }, { status: 401 }))
    const { POST } = await loadRoute()
    const response = await POST(postRequest({ outboundId: "o1", accountId: "acc-1" }))
    expect(response.status).toBe(401)
    expect(mocks.confirmHwOutboundAccountLink).not.toHaveBeenCalled()
  })

  it("CRM_STAFF_ADMIN_API_ROLES로 requireVerifiedAdminContext를 호출한다", async () => {
    mocks.confirmHwOutboundAccountLink.mockResolvedValue({ id: "link-1", status: "confirmed" })
    const { POST } = await loadRoute()
    await POST(postRequest({ outboundId: "o1", accountId: "acc-1" }))
    expect(mocks.requireVerifiedAdminContext).toHaveBeenCalledWith(
      expect.anything(),
      ["SUPER_ADMIN", "ADMIN", "BRANCH"]
    )
  })
})

describe("POST /api/admin/crm/source-links/hw-outbound — 검증", () => {
  it("outboundId·accountId가 없으면 400이고 저장소를 호출하지 않는다", async () => {
    const { POST } = await loadRoute()
    const response = await POST(postRequest({}))
    expect(response.status).toBe(400)
    expect(mocks.confirmHwOutboundAccountLink).not.toHaveBeenCalled()
  })

  it("accountId만 없으면 400이다", async () => {
    const { POST } = await loadRoute()
    const response = await POST(postRequest({ outboundId: "o1" }))
    expect(response.status).toBe(400)
    expect(mocks.confirmHwOutboundAccountLink).not.toHaveBeenCalled()
  })

  it("본문이 JSON이 아니면 400이다", async () => {
    const { POST } = await loadRoute()
    const request = new NextRequest("https://classin.kr/api/admin/crm/source-links/hw-outbound", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    })
    const response = await POST(request)
    expect(response.status).toBe(400)
  })

  it("숫자 outboundId도 문자열로 변환해 받아들인다", async () => {
    mocks.confirmHwOutboundAccountLink.mockResolvedValue({ id: "link-1", status: "confirmed" })
    const { POST } = await loadRoute()
    const response = await POST(postRequest({ outboundId: 42, accountId: "acc-1" }))
    expect(response.status).toBe(200)
    expect(mocks.confirmHwOutboundAccountLink).toHaveBeenCalledWith({
      outboundId: "42",
      accountId: "acc-1",
      actorUserId: "admin-1",
    })
  })
})

describe("POST /api/admin/crm/source-links/hw-outbound — 성공·충돌·무효화", () => {
  it("성공하면 { ok: true, link }를 돌려주고 manual 라우트와 같은 태그 목록을 무효화한다", async () => {
    mocks.confirmHwOutboundAccountLink.mockResolvedValue({ id: "link-1", status: "confirmed" })
    const { POST } = await loadRoute()
    const response = await POST(postRequest({ outboundId: "o1", accountId: "acc-1" }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ ok: true, link: { id: "link-1", status: "confirmed" } })

    expect(mocks.revalidateTag).toHaveBeenCalledWith("test-admin-crm-revenue", "max")
    expect(mocks.revalidateTag).toHaveBeenCalledWith("test-admin-crm-revenue-sheet", "max")
    expect(mocks.revalidateTag).toHaveBeenCalledWith(ADMIN_CRM_COVERAGE_CACHE_TAG, "max")
    expect(mocks.revalidateTag).toHaveBeenCalledWith(ADMIN_OS_SUMMARY_CACHE_TAG, "max")
    expect(mocks.revalidateTag).toHaveBeenCalledWith(ADMIN_CRM_UNIFIED_SNAPSHOT_CACHE_TAG, "max")
    expect(mocks.revalidateTag).toHaveBeenCalledTimes(5)
  })

  it("이미 확정된 링크(CrmSourceLinkConflictError)면 409이고 무효화하지 않는다", async () => {
    mocks.confirmHwOutboundAccountLink.mockRejectedValue(new mocks.CrmSourceLinkConflictError("이미 확정된 출고 연결입니다."))
    const { POST } = await loadRoute()
    const response = await POST(postRequest({ outboundId: "o1", accountId: "acc-1" }))
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body.error).toBe("이미 확정된 출고 연결입니다.")
    expect(mocks.revalidateTag).not.toHaveBeenCalled()
  })

  it("그 외 에러는 500이다", async () => {
    mocks.confirmHwOutboundAccountLink.mockRejectedValue(new Error("boom"))
    const { POST } = await loadRoute()
    const response = await POST(postRequest({ outboundId: "o1", accountId: "acc-1" }))
    expect(response.status).toBe(500)
    expect(mocks.revalidateTag).not.toHaveBeenCalled()
  })
})
