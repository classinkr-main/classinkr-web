import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ createEvent: vi.fn(), queue: vi.fn() }))
vi.mock("@/lib/admin-auth", () => ({ CRM_STAFF_ADMIN_API_ROLES: ["ADMIN"], requireVerifiedAdminContext: vi.fn().mockResolvedValue({ role: "ADMIN", name: "테스트 담당" }) }))
vi.mock("@/lib/repositories/crm-events", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/repositories/crm-events")>(), createCrmCustomerEvent: mocks.createEvent }))
vi.mock("@/lib/repositories/crm-tasks", () => ({ createTasksFromEventNextActions: mocks.queue }))
import { POST } from "@/app/api/admin/crm/events/route"

const event = { id: "event-a", nextActions: [{ title: "견적 발송", done: false }] }
const request = () => new NextRequest("https://classin.co.kr/api/admin/crm/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetType: "lead", targetId: "a", body: "상담 내용을 기록합니다.", nextActionTitle: "견적 발송" }) })
beforeEach(() => { vi.clearAllMocks(); mocks.createEvent.mockResolvedValue(event); mocks.queue.mockResolvedValue([{ id: "task-a" }]) })

describe("기록 저장과 다음 액션 큐", () => {
  it("저장한 기록의 다음 액션을 큐로 연결하고 생성 건수를 응답한다", async () => {
    const response = await POST(request())
    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ event, tasksCreated: 1 })
    expect(mocks.queue).toHaveBeenCalledWith(event, { createdBy: "테스트 담당" })
  })
  it("기록만 저장된 부분 성공에서는 큐 실패를 명시하고 기록을 다시 생성하지 않는다", async () => {
    mocks.queue.mockRejectedValue(new Error("task unavailable"))
    const response = await POST(request())
    const body = await response.json()
    expect(response.status).toBe(201)
    expect(body.event.id).toBe("event-a")
    expect(body.tasksCreated).toBe(0)
    expect(body.taskQueueWarning).toContain("기록은 저장됐지만")
    expect(mocks.createEvent).toHaveBeenCalledTimes(1)
  })
})
