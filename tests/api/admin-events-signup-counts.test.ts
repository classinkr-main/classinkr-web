// /api/admin/events/signup-counts — 행사 신청수 집계 라우트.
// 감사에서 확인된 토큰 키 불일치: 공개 신청 리드는 [event:slug], 리드 보드 수동
// 연결·캡처 배치는 [event:id]를 기록한다. 라우트가 두 토큰을 행사 카탈로그로
// 정규화해 같은 키(slug ?? id)로 합산하는지 검증한다.
import { NextRequest, NextResponse } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

const verifyAdmin = vi.fn()
const getLeads = vi.fn()
const getAllEventsForAdmin = vi.fn()

vi.mock("@/lib/admin-auth", () => ({
  verifyAdmin,
}))

vi.mock("@/lib/repositories/leads", () => ({
  getLeads,
}))

vi.mock("@/lib/repositories/public-events", () => ({
  getAllEventsForAdmin,
}))

function signupCountsRequest() {
  return new NextRequest("https://classin.kr/api/admin/events/signup-counts")
}

describe("GET /api/admin/events/signup-counts", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("counts id-token leads together with slug-token leads under the slug key", async () => {
    verifyAdmin.mockResolvedValue(null)
    getAllEventsForAdmin.mockResolvedValue([
      { id: "EV-123", slug: "spring-seminar" },
      { id: "ev-no-slug", slug: null },
    ])
    getLeads.mockResolvedValue([
      { notes: "[event:spring-seminar]\n공개 신청 폼" },
      { notes: "[event:EV-123]\n리드 보드 수동 연결" },
      { notes: "[event:ev-123]" }, // 캡처 배치 — 대소문자 무관
      { notes: "[event:ev-no-slug]\nslug 없는 행사" },
      { notes: "[event:deleted-event]\n삭제된 행사 토큰" },
      { notes: "토큰 없는 메모" },
      { notes: null },
    ])

    const { GET } = await import("@/app/api/admin/events/signup-counts/route")
    const response = await GET(signupCountsRequest())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      counts: {
        "spring-seminar": 3,
        "ev-no-slug": 1,
        "deleted-event": 1,
      },
    })
  })

  it("falls back to raw token keys when the event catalog fetch fails", async () => {
    verifyAdmin.mockResolvedValue(null)
    getAllEventsForAdmin.mockRejectedValue(new Error("catalog down"))
    getLeads.mockResolvedValue([
      { notes: "[event:spring-seminar]\n폼 리드" },
      { notes: "[event:EV-123]\n수동 연결 리드" },
    ])

    const { GET } = await import("@/app/api/admin/events/signup-counts/route")
    const response = await GET(signupCountsRequest())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      counts: {
        "spring-seminar": 1,
        "EV-123": 1,
      },
    })
  })

  it("returns the guard response when verifyAdmin rejects", async () => {
    const denied = NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    verifyAdmin.mockResolvedValue(denied)

    const { GET } = await import("@/app/api/admin/events/signup-counts/route")
    const response = await GET(signupCountsRequest())

    expect(response.status).toBe(401)
    expect(getLeads).not.toHaveBeenCalled()
    expect(getAllEventsForAdmin).not.toHaveBeenCalled()
  })

  it("returns 500 when lead fetch fails", async () => {
    verifyAdmin.mockResolvedValue(null)
    getLeads.mockRejectedValue(new Error("leads down"))

    const { GET } = await import("@/app/api/admin/events/signup-counts/route")
    const response = await GET(signupCountsRequest())

    expect(response.status).toBe(500)
  })
})
