// GET/PATCH /api/admin/notifications — 라우트 배선 회귀 가드.
// 비즈니스 로직(카운트 합산·recipient 필터·캐시/무효화)은
// tests/notifications/repository-cache.test.ts가 저장소 레벨에서 고정한다. 여기서는 라우트가
// 인증 컨텍스트 → 셀렉터 → 저장소 호출까지 올바르게 배선됐는지만 확인한다.
import { NextRequest, NextResponse } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  requireVerifiedAdminContext: vi.fn(),
  countUnreadNotificationsForRecipients: vi.fn(),
  listNotificationsForRecipients: vi.fn(),
  markAllNotificationsReadForRecipients: vi.fn(),
}))

vi.mock("@/lib/admin-auth", () => ({
  requireVerifiedAdminContext: mocks.requireVerifiedAdminContext,
}))
vi.mock("@/lib/notifications/repository", () => ({
  countUnreadNotificationsForRecipients: mocks.countUnreadNotificationsForRecipients,
  listNotificationsForRecipients: mocks.listNotificationsForRecipients,
  markAllNotificationsReadForRecipients: mocks.markAllNotificationsReadForRecipients,
}))

import { GET, PATCH } from "@/app/api/admin/notifications/route"

function req(query = "") {
  return new NextRequest(`https://classin.kr/api/admin/notifications${query}`)
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireVerifiedAdminContext.mockResolvedValue({
    role: "ADMIN",
    userId: "admin-1",
    name: "관리자",
  })
  mocks.countUnreadNotificationsForRecipients.mockResolvedValue(0)
  mocks.listNotificationsForRecipients.mockResolvedValue([])
  mocks.markAllNotificationsReadForRecipients.mockResolvedValue(0)
})

describe("GET /api/admin/notifications", () => {
  it("countOnly=1이면 목록 조회 없이 카운트만 부른다", async () => {
    mocks.countUnreadNotificationsForRecipients.mockResolvedValue(4)

    const res = await GET(req("?countOnly=1"))
    const body = await res.json()

    expect(body.unreadCount).toBe(4)
    expect(mocks.listNotificationsForRecipients).not.toHaveBeenCalled()
    expect(mocks.countUnreadNotificationsForRecipients).toHaveBeenCalledTimes(1)
  })

  it("countOnly가 없으면 목록과 카운트를 함께 반환한다", async () => {
    mocks.listNotificationsForRecipients.mockResolvedValue([{ id: "n1" }])
    mocks.countUnreadNotificationsForRecipients.mockResolvedValue(1)

    const res = await GET(req())
    const body = await res.json()

    expect(body.items).toEqual([{ id: "n1" }])
    expect(body.unreadCount).toBe(1)
  })

  it("인증 실패 응답을 그대로 반환한다", async () => {
    mocks.requireVerifiedAdminContext.mockResolvedValue(
      NextResponse.json({ error: "unauthorized" }, { status: 401 })
    )

    const res = await GET(req("?countOnly=1"))

    expect(res.status).toBe(401)
    expect(mocks.countUnreadNotificationsForRecipients).not.toHaveBeenCalled()
  })
})

describe("PATCH /api/admin/notifications", () => {
  it("현재 관리자 셀렉터로 전체 읽음 처리를 위임한다", async () => {
    mocks.markAllNotificationsReadForRecipients.mockResolvedValue(3)

    const res = await PATCH(req())
    const body = await res.json()

    expect(body).toEqual({ ok: true, updatedCount: 3 })
    expect(mocks.markAllNotificationsReadForRecipients).toHaveBeenCalledTimes(1)
  })
})
