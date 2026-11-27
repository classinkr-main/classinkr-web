// 자동화 규칙 수동 실행 — 방금 실행한 규칙은 확인(force) 없이 다시 보내지 않는다(2026-11-25 점검 B-2).
import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ executeRule: vi.fn(), getAllLogs: vi.fn() }))

vi.mock("@/lib/admin-auth", () => ({ verifyAdmin: vi.fn().mockResolvedValue(null) }))
vi.mock("@/lib/automation-engine", () => ({ executeRule: mocks.executeRule }))
vi.mock("@/lib/repositories/automation", () => ({ getAllLogs: mocks.getAllLogs }))

import { POST } from "@/app/api/admin/automation/rules/[id]/trigger/route"

const trigger = (body?: unknown) =>
  POST(
    new NextRequest("https://classin.kr/api/admin/automation/rules/rule-1/trigger", {
      method: "POST",
      ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    }),
    { params: Promise.resolve({ id: "rule-1" }) }
  )
const log = (status: string, minutesAgo: number) => ({
  id: "log-1",
  ruleId: "rule-1",
  status,
  recipientCount: 12,
  triggeredAt: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
  createdAt: new Date().toISOString(),
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.executeRule.mockResolvedValue({ logId: "log-2", recipientCount: 12, status: "sent" })
  mocks.getAllLogs.mockResolvedValue([])
})

describe("POST /api/admin/automation/rules/[id]/trigger", () => {
  it("최근 실행이 없으면 그대로 실행한다(본문 없는 기존 호출 포함)", async () => {
    const response = await trigger()
    expect(response.status).toBe(200)
    expect(mocks.executeRule).toHaveBeenCalledWith("rule-1")
  })

  it.each(["sent", "pending"])("10분 안에 %s 실행이 있으면 409(recent_run)이고 보내지 않는다", async (status) => {
    mocks.getAllLogs.mockResolvedValue([log(status, 3)])
    const response = await trigger({})
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body.code).toBe("recent_run")
    expect(mocks.executeRule).not.toHaveBeenCalled()
  })

  it("force 를 보내면 최근 실행이 있어도 실행한다", async () => {
    mocks.getAllLogs.mockResolvedValue([log("sent", 3)])
    const response = await trigger({ force: true })
    expect(response.status).toBe(200)
    expect(mocks.executeRule).toHaveBeenCalledTimes(1)
  })

  it("최근 실행이 실패였거나 10분이 지났으면 다시 실행한다", async () => {
    mocks.getAllLogs.mockResolvedValue([log("failed", 1)])
    expect((await trigger({})).status).toBe(200)
    mocks.getAllLogs.mockResolvedValue([log("sent", 11)])
    expect((await trigger({})).status).toBe(200)
    expect(mocks.executeRule).toHaveBeenCalledTimes(2)
  })
})
