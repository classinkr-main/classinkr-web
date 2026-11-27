// 자동화 지연 발송 큐 — 보내기 전에 선점하고, 한 실행이 집는 수와 시간을 제한한다(2026-11-25 점검 B-1).
// 예전에는 pending 을 읽어 보낸 뒤에야 sent 로 바꿔, 겹친 크론이나 상태 기록 실패가 같은 메일을 다시 보냈다.
import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getDueDelayItems: vi.fn(),
  claimDelayItem: vi.fn(),
  updateDelayItemStatus: vi.fn(),
  executeDelayQueueItem: vi.fn(),
}))

vi.mock("@/lib/server/cron-auth", () => ({ checkCronAuth: () => "ok" }))
vi.mock("@/lib/automation-engine", () => ({
  executeRule: vi.fn(),
  executeDelayQueueItem: mocks.executeDelayQueueItem,
}))
vi.mock("@/lib/repositories/automation", () => ({
  getActiveRulesByTrigger: vi.fn().mockResolvedValue([]),
  getAllLogs: vi.fn().mockResolvedValue([]),
}))
vi.mock("@/lib/repositories/automation-delay", () => ({
  getDueDelayItems: mocks.getDueDelayItems,
  claimDelayItem: mocks.claimDelayItem,
  updateDelayItemStatus: mocks.updateDelayItemStatus,
}))

import { GET } from "@/app/api/cron/automation/route"

const item = (id: string) => ({ id, ruleId: "rule-1", recipientEmail: `${id}@example.com`, recipientData: { email: `${id}@example.com` } })
const run = async () => (await GET(new NextRequest("https://classin.kr/api/cron/automation"))).json()

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "log").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
  mocks.claimDelayItem.mockResolvedValue(true)
  mocks.updateDelayItemStatus.mockResolvedValue(undefined)
  mocks.executeDelayQueueItem.mockResolvedValue(undefined)
})

describe("GET /api/cron/automation — 지연 발송 큐", () => {
  it("선점한 뒤에 보내고, 보낸 뒤 sent 로 기록한다", async () => {
    mocks.getDueDelayItems.mockResolvedValue([item("a")])
    const order: string[] = []
    mocks.claimDelayItem.mockImplementation(async () => { order.push("claim"); return true })
    mocks.executeDelayQueueItem.mockImplementation(async () => { order.push("send") })
    mocks.updateDelayItemStatus.mockImplementation(async (_id: string, status: string) => { order.push(status) })

    const body = await run()

    expect(order).toEqual(["claim", "send", "sent"])
    expect(body.delay).toMatchObject({ processed: 1, failed: 0, skipped: 0 })
  })

  it("다른 실행이 먼저 가져간 항목은 보내지 않는다", async () => {
    mocks.getDueDelayItems.mockResolvedValue([item("a"), item("b")])
    mocks.claimDelayItem.mockImplementation(async (id: string) => id === "b")

    const body = await run()

    expect(mocks.executeDelayQueueItem).toHaveBeenCalledTimes(1)
    expect(body.delay).toMatchObject({ processed: 1, skipped: 1 })
  })

  it("선점 조회가 실패하면 보내지 않고 상태도 건드리지 않는다(pending 그대로)", async () => {
    mocks.getDueDelayItems.mockResolvedValue([item("a")])
    mocks.claimDelayItem.mockRejectedValue(new Error("db down"))

    const body = await run()

    expect(mocks.executeDelayQueueItem).not.toHaveBeenCalled()
    expect(mocks.updateDelayItemStatus).not.toHaveBeenCalled()
    expect(body.delay.errors).toHaveLength(1)
  })

  it("발송이 실패하면 failed 로 남기고, 응답 오류에 수신자 주소를 싣지 않는다", async () => {
    mocks.getDueDelayItems.mockResolvedValue([item("a")])
    mocks.executeDelayQueueItem.mockRejectedValue(new Error("provider down"))

    const body = await run()

    expect(mocks.updateDelayItemStatus).toHaveBeenCalledWith("a", "failed", "provider down")
    expect(body.delay).toMatchObject({ processed: 0, failed: 1 })
    expect(JSON.stringify(body)).not.toContain("a@example.com")
  })
})
