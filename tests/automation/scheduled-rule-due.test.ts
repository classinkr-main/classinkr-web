// /api/cron/automation — 예약 규칙은 식이 가리키는 날에만, 하루 한 번만 돈다(2026-11-27 크론 정리 정-1).
import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ executeRule: vi.fn(), getActiveRulesByTrigger: vi.fn(), getAllLogs: vi.fn() }))

vi.mock("@/lib/server/cron-auth", () => ({ checkCronAuth: () => "ok" }))
vi.mock("@/lib/automation-engine", () => ({ executeRule: mocks.executeRule, executeDelayQueueItem: vi.fn() }))
vi.mock("@/lib/repositories/automation", () => ({
  getActiveRulesByTrigger: mocks.getActiveRulesByTrigger,
  getAllLogs: mocks.getAllLogs,
}))
vi.mock("@/lib/repositories/automation-delay", () => ({
  getDueDelayItems: vi.fn().mockResolvedValue([]),
  claimDelayItem: vi.fn(),
  updateDelayItemStatus: vi.fn(),
}))

import { GET } from "@/app/api/cron/automation/route"

const rule = (id: string, cron: string) => ({ id, name: id, triggerConfig: { type: "scheduled", cron } })
const run = async () => (await GET(new NextRequest("https://classin.kr/api/cron/automation"))).json()

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "log").mockImplementation(() => {})
  vi.useFakeTimers({ toFake: ["Date"] })
  mocks.executeRule.mockResolvedValue({ logId: "log", recipientCount: 1, status: "sent" })
  mocks.getAllLogs.mockResolvedValue([])
})
afterEach(() => vi.useRealTimers())

describe("GET /api/cron/automation — 예약 규칙 실행 판정", () => {
  it("화요일에는 매일 규칙만 돌고 매주 월요일·매월 15일 규칙은 건너뛴다", async () => {
    vi.setSystemTime(new Date("2026-12-01T09:00:05Z")) // 화요일, 1일
    mocks.getActiveRulesByTrigger.mockResolvedValue([
      rule("daily", "0 9 * * *"),
      rule("weekly-mon", "0 9 * * 1"),
      rule("monthly-15", "0 9 15 * *"),
    ])

    const body = await run()

    expect(mocks.executeRule.mock.calls.map((call) => call[0])).toEqual(["daily"])
    expect(body).toMatchObject({ ran: 1, skipped: 2, errors: [] })
  })

  it("월요일에는 매주 월요일 규칙이 돈다", async () => {
    vi.setSystemTime(new Date("2026-11-30T09:00:05Z"))
    mocks.getActiveRulesByTrigger.mockResolvedValue([rule("weekly-mon", "0 9 * * 1")])

    const body = await run()

    expect(mocks.executeRule).toHaveBeenCalledWith("weekly-mon")
    expect(body.ran).toBe(1)
  })

  it("도는 날이어도 23시간 안에 이미 실행했으면 건너뛴다(매주 규칙 포함)", async () => {
    vi.setSystemTime(new Date("2026-11-30T09:00:05Z"))
    mocks.getActiveRulesByTrigger.mockResolvedValue([rule("weekly-mon", "0 9 * * 1")])
    mocks.getAllLogs.mockResolvedValue([{ triggeredAt: "2026-11-30T08:59:00Z" }])

    const body = await run()

    expect(mocks.executeRule).not.toHaveBeenCalled()
    expect(body.skipped).toBe(1)
  })

  it("읽지 못하는 식은 보내지 않고 errors 에 싣는다", async () => {
    vi.setSystemTime(new Date("2026-11-30T09:00:05Z"))
    mocks.getActiveRulesByTrigger.mockResolvedValue([rule("odd", "0 9 */2 * *")])

    const body = await run()

    expect(mocks.executeRule).not.toHaveBeenCalled()
    expect(body.errors).toHaveLength(1)
    expect(body.errors[0]).toContain("지원하지 않는 예약 식")
  })

  it("실패한 실행 기록은 그날 몫을 막지 않는다 — 매월 규칙이 한 달을 통째로 건너뛰지 않게", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    vi.setSystemTime(new Date("2026-12-01T09:00:05Z"))
    mocks.getActiveRulesByTrigger.mockResolvedValue([rule("monthly-1", "0 9 1 * *")])
    mocks.getAllLogs.mockResolvedValue([
      { triggeredAt: "2026-12-01T01:00:00Z", status: "failed" },
      { triggeredAt: "2026-11-01T09:00:00Z", status: "sent" },
    ])

    const body = await run()

    expect(mocks.executeRule).toHaveBeenCalledWith("monthly-1")
    expect(body.ran).toBe(1)
  })

  it("같은 날 이미 성공했거나 실행 중이면 건너뛴다", async () => {
    vi.setSystemTime(new Date("2026-12-01T09:00:05Z"))
    mocks.getActiveRulesByTrigger.mockResolvedValue([rule("monthly-1", "0 9 1 * *")])
    for (const status of ["sent", "pending"]) {
      mocks.getAllLogs.mockResolvedValue([{ triggeredAt: "2026-12-01T01:00:00Z", status }])
      await run()
    }
    expect(mocks.executeRule).not.toHaveBeenCalled()
  })
})
