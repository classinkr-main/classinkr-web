import { readFileSync } from "node:fs"
import path from "node:path"

import { NextRequest } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

// Meta 리드 미러 크론 라우트(설계 META-RECEIVER-FINAL §4-2 H7).
// 사이클 본문(runMetaLeadMirrorCycle)·폴백(metaLeadFallbackStep)은 tests/server/meta-lead-mirror·fallback 테스트가 잠근다.
// 여기서는 인증·예산·폴백 훅 연결·상태 코드 표·vercel.json 항목만 본다.

function cycleReport(overrides: Record<string, unknown> = {}) {
  return {
    status: "ok",
    trigger: "cron",
    dryRun: false,
    mode: "compass",
    mirror: {
      status: "ok",
      trigger: "cron",
      dryRun: false,
      mode: "compass",
      window: { kind: "compass", from: "2026-09-15T01:00:00.000Z", before: null },
      requested: 0,
      waitedMs: 0,
      targets: { submissions: 1, refsFallback: 0, notVisible: 0, inLedger: 0, effectsRetry: 0, invalid: 0, truncated: false },
      built: { rows: 1, skippedDeleted: 0, emailDropped: 0, buildFailed: 0 },
      applied: { batches: 1, inserted: 1, blocked: 0, skipped: 0, outsideWindow: 0, invalid: 0, existing: 0 },
      sideEffects: { ran: 1, deliveryErrors: 0, failed: 0, marked: 1, abandoned: 0, deferred: 0 },
      inserted: [{ leadgenId: "900000000000001", leadId: "lead-1" }],
      errors: [],
    },
    fallback: { status: "ok", changed: 0, counts: { claimed: 0 } },
    health: {
      ok: true,
      mode: "compass",
      staleMinutes: 9,
      views: { submissions: true, refs: true, failures: true },
      metrics: { at_risk: 0, admin_only_saved: 0 },
      due: [],
      alerted: [],
    },
    heartbeat: { written: true },
    audited: true,
    ...overrides,
  }
}

async function loadRoute() {
  vi.resetModules()
  const runMetaLeadMirrorCycle = vi.fn().mockResolvedValue(cycleReport())
  const metaLeadFallbackStep = vi.fn()
  vi.doMock("@/lib/server/meta-lead-mirror", () => ({ runMetaLeadMirrorCycle }))
  vi.doMock("@/lib/server/meta-lead-fallback", () => ({ metaLeadFallbackStep }))
  const route = await import("@/app/api/cron/meta-lead-mirror/route")
  return { ...route, runMetaLeadMirrorCycle, metaLeadFallbackStep }
}

function request(query = "", secret: string | null = "test-cron-secret") {
  return new NextRequest(`https://classin.co.kr/api/cron/meta-lead-mirror${query}`, {
    headers: secret == null ? {} : { authorization: `Bearer ${secret}` },
  })
}

describe("Meta 리드 미러 크론", () => {
  const previousCronSecret = process.env.CRON_SECRET

  afterEach(() => {
    if (previousCronSecret === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = previousCronSecret
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("maxDuration 은 60초다", async () => {
    const { maxDuration } = await loadRoute()
    expect(maxDuration).toBe(60)
  })

  it("CRON_SECRET 이 없으면 401 이고 사이클을 돌리지 않는다", async () => {
    delete process.env.CRON_SECRET
    const { GET, runMetaLeadMirrorCycle } = await loadRoute()

    const response = await GET(request())

    expect(response.status).toBe(401)
    expect(runMetaLeadMirrorCycle).not.toHaveBeenCalled()
  })

  it("Bearer 가 틀리거나 없으면 401 이고 사이클을 돌리지 않는다 — x-vercel-cron 만으로는 통과하지 않는다", async () => {
    process.env.CRON_SECRET = "test-cron-secret"
    const { GET, runMetaLeadMirrorCycle } = await loadRoute()

    expect((await GET(request("", "wrong"))).status).toBe(401)
    expect((await GET(request("", null))).status).toBe(401)
    const vercelHeaderOnly = new NextRequest("https://classin.co.kr/api/cron/meta-lead-mirror", {
      headers: { "x-vercel-cron": "1" },
    })
    expect((await GET(vercelHeaderOnly)).status).toBe(401)
    expect(runMetaLeadMirrorCycle).not.toHaveBeenCalled()
  })

  it("정상 실행은 cron 트리거·폴백 훅·45초 마감으로 사이클을 한 번 돌리고 200 과 보고서를 돌려준다", async () => {
    process.env.CRON_SECRET = "test-cron-secret"
    vi.spyOn(Date, "now").mockReturnValue(1_000_000)
    const { GET, runMetaLeadMirrorCycle, metaLeadFallbackStep } = await loadRoute()

    const response = await GET(request())

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, ...cycleReport() })
    expect(runMetaLeadMirrorCycle).toHaveBeenCalledTimes(1)
    expect(runMetaLeadMirrorCycle).toHaveBeenCalledWith({
      trigger: "cron",
      dryRun: false,
      deadlineAt: 1_000_000 + 45_000,
      fallback: metaLeadFallbackStep,
    })
  })

  it("dryRun=true 면 미리보기로만 돌린다(다른 값은 실제 실행)", async () => {
    process.env.CRON_SECRET = "test-cron-secret"
    const { GET, runMetaLeadMirrorCycle } = await loadRoute()

    await GET(request("?dryRun=true"))
    await GET(request("?dryRun=1"))

    expect(runMetaLeadMirrorCycle.mock.calls[0][0]).toMatchObject({ dryRun: true })
    expect(runMetaLeadMirrorCycle.mock.calls[1][0]).toMatchObject({ dryRun: false })
  })

  it("전환 전 기본(admin, mirror_since 없음)의 skipped 는 200 이다 — 배포만으로는 크론이 빨갛지 않다", async () => {
    process.env.CRON_SECRET = "test-cron-secret"
    const { GET, runMetaLeadMirrorCycle } = await loadRoute()
    runMetaLeadMirrorCycle.mockResolvedValueOnce(
      cycleReport({ status: "skipped", mode: "admin", fallback: null, health: null })
    )

    const response = await GET(request())

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true, status: "skipped", mode: "admin" })
  })

  it("상태 코드 표 — 유실 위험·막힘·실패 500, 브리지 장애 503, 시간 초과 504(lead-contact-sync 와 같은 자세)", async () => {
    process.env.CRON_SECRET = "test-cron-secret"
    const { GET, runMetaLeadMirrorCycle } = await loadRoute()

    for (const [status, code, ok] of [
      ["ok", 200, true],
      ["skipped", 200, true],
      ["at_risk", 500, false],
      ["blocked", 500, false],
      ["failed", 500, false],
      ["bridge_down", 503, false],
      ["timeout", 504, false],
    ] as const) {
      runMetaLeadMirrorCycle.mockResolvedValueOnce(cycleReport({ status }))
      const response = await GET(request())
      expect(response.status, status).toBe(code)
      expect(await response.json()).toMatchObject({ ok, status })
    }
  })

  it("예상 못 한 예외는 500 과 일반 문구로 돌려준다(오류 본문을 싣지 않는다)", async () => {
    process.env.CRON_SECRET = "test-cron-secret"
    const { GET, runMetaLeadMirrorCycle } = await loadRoute()
    runMetaLeadMirrorCycle.mockRejectedValueOnce(new Error("secret detail"))
    vi.spyOn(console, "error").mockImplementation(() => {})

    const response = await GET(request())

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      ok: false,
      status: "failed",
      dryRun: false,
      error: "Meta lead mirror cycle failed.",
    })
  })

  it("로그에는 건수·상태만 남긴다(leadgen·리드 식별자 없음)", async () => {
    process.env.CRON_SECRET = "test-cron-secret"
    const info = vi.spyOn(console, "info").mockImplementation(() => {})
    const { GET } = await loadRoute()

    await GET(request())

    const logged = JSON.stringify(info.mock.calls)
    expect(logged).not.toContain("900000000000001")
    expect(logged).not.toContain("lead-1")
    expect(info.mock.calls[0][1]).toMatchObject({ status: "ok", inserted: 1, atRisk: 0, heartbeat: true })
  })
})

describe("vercel.json — Meta 리드 미러 일정", () => {
  it("경로 항목은 하나, 10분마다(UTC 매시 0·10·…·50분, 하루 144회) 돈다", () => {
    const config = JSON.parse(readFileSync(path.join(process.cwd(), "vercel.json"), "utf8")) as {
      crons: Array<{ path: string; schedule: string }>
    }
    const entries = config.crons.filter((cron) => cron.path === "/api/cron/meta-lead-mirror")
    expect(entries).toEqual([{ path: "/api/cron/meta-lead-mirror", schedule: "*/10 * * * *" }])
    expect(config.crons.length).toBeLessThanOrEqual(40)
  })
})
