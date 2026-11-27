// 시간 슬롯 크론 단일 진입점(2026-11-27 크론 정리 합-1) — 슬롯을 경로가 아니라 시계에서 구한다.
// vercel.json 의 dispatch/00~23 24줄을 /api/cron/dispatch 한 줄로 합쳤다. 도는 잡과 시각은 그대로여야 한다.
import { readFileSync } from "node:fs"
import path from "node:path"
import { NextRequest, NextResponse } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { resolveDispatchSlot } from "@/lib/server/cron-dispatch-slot"

const mocks = vi.hoisted(() => ({ checkCronAuth: vi.fn(), runSlot: vi.fn() }))
vi.mock("@/lib/server/cron-auth", () => ({ checkCronAuth: mocks.checkCronAuth }))
vi.mock("@/app/api/cron/dispatch/[slot]/route", () => ({ GET: mocks.runSlot }))

import { GET } from "@/app/api/cron/dispatch/route"

describe("resolveDispatchSlot — 가장 가까운 정시(UTC)", () => {
  it.each([
    ["2026-11-27T21:00:00Z", 21],
    ["2026-11-27T20:59:58Z", 21], // 몇 초 일찍 깬 21시 실행
    ["2026-11-27T21:00:07Z", 21], // 몇 초 늦게 깬 21시 실행
    ["2026-11-27T21:29:59Z", 21],
    ["2026-11-27T21:30:00Z", 22],
    ["2026-11-27T23:59:59Z", 0], // 자정 경계 — 다음 날 0시 슬롯
    ["2026-11-27T02:00:01Z", 2],
    ["2026-11-27T01:59:59Z", 2],
  ])("%s → 슬롯 %i", (iso, slot) => {
    expect(resolveDispatchSlot(new Date(iso))).toBe(slot)
  })
})

describe("GET /api/cron/dispatch", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ toFake: ["Date"] })
    mocks.checkCronAuth.mockReturnValue("ok")
    mocks.runSlot.mockResolvedValue(NextResponse.json({ ok: true }))
  })
  afterEach(() => vi.useRealTimers())

  let lastRequest: NextRequest
  const call = () => {
    lastRequest = new NextRequest("https://classin.kr/api/cron/dispatch?dryRun=true", {
      headers: { authorization: "Bearer test" },
    })
    return GET(lastRequest)
  }

  it("시계에서 구한 슬롯으로 [slot] 본문을 그대로 부른다(요청·쿼리는 그대로 넘긴다)", async () => {
    vi.setSystemTime(new Date("2026-11-27T20:59:58Z"))
    const response = await call()

    expect(response.status).toBe(200)
    expect(mocks.runSlot).toHaveBeenCalledTimes(1)
    const [request, context] = mocks.runSlot.mock.calls[0]
    // 받은 요청을 그대로 넘겨야 한다 — 새 요청을 만들면 Authorization 헤더가 빠져 [slot] 본문이 매시 401 로 죽는다.
    expect(request).toBe(lastRequest)
    expect((request as NextRequest).headers.get("authorization")).toBe("Bearer test")
    expect((request as NextRequest).nextUrl.searchParams.get("dryRun")).toBe("true")
    expect(await (context as { params: Promise<{ slot: string }> }).params).toEqual({ slot: "21" })
  })

  it("한 자리 슬롯은 두 자리로 넘긴다", async () => {
    vi.setSystemTime(new Date("2026-11-27T02:00:03Z"))
    await call()
    expect(await (mocks.runSlot.mock.calls[0][1] as { params: Promise<{ slot: string }> }).params).toEqual({ slot: "02" })
  })

  it.each([
    ["missing_secret", 401],
    ["unauthorized", 401],
  ])("인증이 %s 면 %i 이고 슬롯 본문을 부르지 않는다", async (result, status) => {
    mocks.checkCronAuth.mockReturnValue(result)
    const response = await call()
    expect(response.status).toBe(status)
    expect(mocks.runSlot).not.toHaveBeenCalled()
  })
})

describe("vercel.json — 디스패처 등록", () => {
  const crons = (JSON.parse(readFileSync(path.join(process.cwd(), "vercel.json"), "utf8")) as {
    crons: Array<{ path: string; schedule: string }>
  }).crons

  it("디스패처는 매시 정각 한 줄뿐이고, 시간대별 경로는 등록돼 있지 않다", () => {
    expect(crons.filter((cron) => cron.path === "/api/cron/dispatch")).toEqual([
      { path: "/api/cron/dispatch", schedule: "0 * * * *" },
    ])
    expect(crons.filter((cron) => cron.path.startsWith("/api/cron/dispatch/"))).toEqual([])
  })
})
