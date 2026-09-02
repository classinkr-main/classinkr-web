import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// T11 — sync-branch-insights의 자기 방어: 최근 24시간 안에 성공한 branch sync(source: "all")가
// 없으면 인사이트를 돌리지 않고 skip 응답을 낸다. Vercel Hobby가 크론을 시(hour) 단위로만
// 스케줄링해 sync-branch(08:00)보다 이 크론(09:30)이 먼저 도는 경우까지 방어한다.
// 정본: docs/active/supabase-optimization-execution-plan-2026-09-02.md §T11.

const runInsights = vi.hoisted(() => vi.fn())
const getRecentSyncRuns = vi.hoisted(() => vi.fn())

vi.mock("@/lib/branch/insights/runner", () => ({
  runInsights,
}))
vi.mock("@/lib/repositories/branch-sync", () => ({
  getRecentSyncRuns,
}))

import { GET } from "@/app/api/cron/sync-branch-insights/route"

const ORIGINAL_ENV = { ...process.env }

function cronRequest() {
  return new NextRequest("https://classin.kr/api/cron/sync-branch-insights", {
    headers: {
      authorization: "Bearer cron-test-secret",
      "x-vercel-cron": "1",
    },
  })
}

function runAt(hoursAgo: number, overrides: Partial<Record<string, unknown>> = {}) {
  const finished = new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString()
  return {
    id: "run-1",
    started_at: finished,
    finished_at: finished,
    source: "all",
    trigger: "cron",
    status: "success",
    rows_affected: 10,
    error: null,
    ...overrides,
  }
}

beforeEach(() => {
  process.env.VERCEL = "1"
  process.env.CRON_SECRET = "cron-test-secret"
  runInsights.mockReset()
  getRecentSyncRuns.mockReset()
  runInsights.mockResolvedValue({ from: "cache", error: null })
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe("sync-branch-insights cron self-defense", () => {
  it("skips (200, ok:false) when no branch sync run exists at all", async () => {
    getRecentSyncRuns.mockResolvedValue([])

    const response = await GET(cronRequest())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      skipped: true,
      reason: "branch sync not completed today",
    })
    expect(runInsights).not.toHaveBeenCalled()
  })

  it("skips when the most recent successful sync is older than 24h", async () => {
    getRecentSyncRuns.mockResolvedValue([runAt(30)])

    const response = await GET(cronRequest())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ ok: false, skipped: true })
    expect(runInsights).not.toHaveBeenCalled()
  })

  it("skips when the recent run failed rather than succeeded", async () => {
    getRecentSyncRuns.mockResolvedValue([runAt(2, { status: "failed", finished_at: new Date().toISOString() })])

    const response = await GET(cronRequest())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ ok: false, skipped: true })
    expect(runInsights).not.toHaveBeenCalled()
  })

  it("ignores a successful run from a different source (e.g. insights itself)", async () => {
    getRecentSyncRuns.mockResolvedValue([runAt(2, { source: "insights" })])

    const response = await GET(cronRequest())

    await expect(response.json()).resolves.toMatchObject({ ok: false, skipped: true })
    expect(runInsights).not.toHaveBeenCalled()
  })

  it("proceeds and runs insights when a recent successful branch sync exists", async () => {
    getRecentSyncRuns.mockResolvedValue([runAt(1)])

    const response = await GET(cronRequest())

    expect(response.status).toBe(200)
    expect(runInsights).toHaveBeenCalledTimes(4)
    expect(runInsights).toHaveBeenCalledWith("ALL", true)
    expect(runInsights).toHaveBeenCalledWith("BD", true)
    expect(runInsights).toHaveBeenCalledWith("MKT", true)
    expect(runInsights).toHaveBeenCalledWith("CSM", true)
    const body = await response.json()
    expect(body).toMatchObject({ ALL: { from: "cache", error: null } })
  })
})
