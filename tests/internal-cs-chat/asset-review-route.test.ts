import { NextRequest, NextResponse } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  requireVerifiedAdminContext: vi.fn(),
  reviewInternalCsAsset: vi.fn(),
  isInternalCsChatNotReadyError: vi.fn(() => false),
}))

vi.mock("@/lib/admin-auth", () => ({
  CRM_STAFF_ADMIN_API_ROLES: ["SUPER_ADMIN", "ADMIN", "BRANCH"],
  requireVerifiedAdminContext: mocks.requireVerifiedAdminContext,
}))

vi.mock("@/lib/repositories/internal-cs-chat", () => ({
  reviewInternalCsAsset: mocks.reviewInternalCsAsset,
  isInternalCsChatNotReadyError: mocks.isInternalCsChatNotReadyError,
}))

import { PATCH } from "@/app/api/admin/cs-chat/conversations/[id]/assets/[assetId]/route"

function request(body: unknown) {
  return new NextRequest("https://classin.kr/api/admin/cs-chat/conversations/c1/assets/a1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

const context = { params: Promise.resolve({ id: "c1", assetId: "a1" }) }

afterEach(() => vi.clearAllMocks())

describe("PATCH internal CS asset review", () => {
  it("requires an authorized CS/admin session", async () => {
    mocks.requireVerifiedAdminContext.mockResolvedValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 })
    )
    const response = await PATCH(request({ decision: "approved" }), context)
    expect(response.status).toBe(403)
    expect(mocks.reviewInternalCsAsset).not.toHaveBeenCalled()
  })

  it("validates decisions and saves the CS owner's correction", async () => {
    mocks.requireVerifiedAdminContext.mockResolvedValue({ role: "ADMIN", name: "CS 담당자" })
    mocks.reviewInternalCsAsset.mockResolvedValue({ id: "a1", review_state: "changes_requested" })

    const response = await PATCH(request({
      decision: "changes_requested",
      reviewNote: "개인정보 제외",
      correctedAnalysis: "오류 안내 화면",
    }), context)
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.customerDeliveryAllowed).toBe(false)
    expect(mocks.reviewInternalCsAsset).toHaveBeenCalledWith({
      conversationId: "c1",
      assetId: "a1",
      decision: "changes_requested",
      reviewNote: "개인정보 제외",
      correctedAnalysis: "오류 안내 화면",
      actor: "CS 담당자",
    })
  })

  it("returns 404 when the asset is not ready for review", async () => {
    mocks.requireVerifiedAdminContext.mockResolvedValue({ role: "ADMIN", name: "CS" })
    mocks.reviewInternalCsAsset.mockResolvedValue(null)
    const response = await PATCH(request({ decision: "approved" }), context)
    expect(response.status).toBe(404)
  })
})
