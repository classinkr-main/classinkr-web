import { NextRequest, NextResponse } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ auth: vi.fn(), timeline: vi.fn() }))
vi.mock("@/lib/admin-auth", () => ({ CRM_STAFF_ADMIN_API_ROLES: ["ADMIN", "BRANCH"], requireVerifiedAdminContext: mocks.auth }))
vi.mock("@/lib/repositories/crm-customer-timeline", () => ({ getCrmCustomerTimeline: mocks.timeline }))
import { GET } from "@/app/api/admin/crm/customers/[key]/timeline/route"
import { parseUnifiedCustomerKey } from "@/lib/repositories/crm-customer-360"
import { customerDetailHref, customerHomeHref } from "@/lib/crm/customer-navigation"

const request = (query = "") => new NextRequest(`https://classin.co.kr/api/admin/crm/customers/lead%3Aa/timeline${query}`)
const params = (key = "lead:a") => ({ params: Promise.resolve({ key }) })
beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockResolvedValue({ role: "ADMIN" }); mocks.timeline.mockResolvedValue({ activity: {}, compass: {} }) })

describe("고객 전용 페이지와 전체 로그", () => {
  it("페이지의 인코딩된 키와 API의 디코딩된 키를 같은 고객으로 해석한다", () => {
    expect(parseUnifiedCustomerKey("neo%3Aaccount%3Aone")).toEqual(parseUnifiedCustomerKey("neo:account:one"))
    expect(parseUnifiedCustomerKey("neo:account%3Aone")?.entityId).toBe("account%3Aone")
    expect(parseUnifiedCustomerKey("%invalid")).toBeNull()
    expect(customerDetailHref("lead:a")).toBe("/admin/crm/customers/lead%3Aa?tab=activity")
    expect(customerHomeHref({ key: "neo:a", href: "/old" })).toBe("/admin/crm/customers/neo%3Aa?tab=activity")
    expect(customerHomeHref({ key: "task:a", href: "/tasks" })).toBe("/tasks")
  })
  it("인증이 거부되면 기록을 조회하지 않는다", async () => {
    mocks.auth.mockResolvedValue(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
    expect((await GET(request(), params())).status).toBe(401)
    expect(mocks.timeline).not.toHaveBeenCalled()
  })
  it.each(["?crmOffset=-1", "?compassOffset=1.5", "?crmOffset=100001", "?before=invalid"])("잘못된 페이지 요청 %s는 400으로 처리한다", async query => {
    expect((await GET(request(query), params())).status).toBe(400)
    expect(mocks.timeline).not.toHaveBeenCalled()
  })
  it("두 원천의 커서와 조회 시점 경계를 전달하고 응답을 영속 캐시하지 않는다", async () => {
    const response = await GET(request("?crmOffset=50&compassOffset=300&before=2026-10-13T09%3A00%3A00Z"), params("lead%3Aa"))
    expect(mocks.timeline).toHaveBeenCalledWith({ source: "lead", targetType: "lead", entityId: "a" }, { crmOffset: 50, compassOffset: 300, before: "2026-10-13T09:00:00.000Z" })
    expect(response.headers.get("cache-control")).toBe("private, no-store")
  })
  it("원천 실패를 고객 없음이나 빈 기록으로 응답하지 않는다", async () => {
    mocks.timeline.mockRejectedValue(new Error("database unavailable"))
    expect((await GET(request(), params())).status).toBe(503)
  })
})
