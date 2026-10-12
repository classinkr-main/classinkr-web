import { readFileSync } from "node:fs"
import path from "node:path"

import { NextRequest, NextResponse } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

// Meta 리드 미러 관리 라우트(설계 META-RECEIVER-FINAL §4-2 H8) — SUPER_ADMIN 전용, GET 상태·건강·대조, POST run|dryRun.
// 모드 전환은 SQL 함수로만 한다(라우트에 없음). 사이클·대조·건강 본문은 각 모듈 테스트가 잠근다.

const mocks = vi.hoisted(() => ({
  role: "SUPER_ADMIN" as string | null,
  requireVerifiedAdminContext: vi.fn(),
  logAdminAudit: vi.fn(),
  readMetaLeadMirrorHealth: vi.fn(),
  isMetaLeadgenForceAdmin: vi.fn(),
  readMetaLeadgenCutover: vi.fn(),
  runMetaLeadMirrorCycle: vi.fn(),
  metaLeadFallbackStep: vi.fn(),
  buildMetaLeadParityReport: vi.fn(),
}))

vi.mock("@/lib/admin-auth", () => ({ requireVerifiedAdminContext: mocks.requireVerifiedAdminContext }))
vi.mock("@/lib/auth/audit", () => ({ logAdminAudit: mocks.logAdminAudit }))
vi.mock("@/lib/meta/lead-mirror-health", () => ({ readMetaLeadMirrorHealth: mocks.readMetaLeadMirrorHealth }))
vi.mock("@/lib/meta/leadgen-cutover", () => ({
  isMetaLeadgenForceAdmin: mocks.isMetaLeadgenForceAdmin,
  readMetaLeadgenCutover: mocks.readMetaLeadgenCutover,
}))
vi.mock("@/lib/server/meta-lead-mirror", () => ({ runMetaLeadMirrorCycle: mocks.runMetaLeadMirrorCycle }))
vi.mock("@/lib/server/meta-lead-fallback", () => ({ metaLeadFallbackStep: mocks.metaLeadFallbackStep }))
vi.mock("@/lib/server/meta-lead-parity", () => ({
  PARITY_MAX_DAYS: 45,
  buildMetaLeadParityReport: mocks.buildMetaLeadParityReport,
}))

import { GET, POST, maxDuration } from "@/app/api/admin/meta-lead-mirror/route"

const CUTOVER = {
  mode: "shadow",
  shadowSince: "2026-09-10T02:00:00.000Z",
  mirrorSince: null,
  compassStartedAt: null,
  compassEndedAt: null,
  sideEffects: { leadCreatedNotification: true, subscriberUpsert: true, automationOnSubmit: true, externalForwards: true },
  fallbackAfterMinutes: 120,
  updatedAt: "2026-09-10T02:00:00.000Z",
}
const HEALTH = { mode: "shadow", stale_minutes: 4, at_risk: 0, admin_only_saved: 0, h2_mirror_backlog_30m: 0 }
const PARITY = { generatedAt: "2026-09-15T03:00:00.000Z", mode: "shadow", categories: { both: 3, admin_only: 0 } }
const CYCLE = {
  status: "ok",
  trigger: "admin",
  dryRun: false,
  mode: "compass",
  mirror: { status: "ok", applied: { inserted: 2, skipped: 1 }, inserted: [] },
  fallback: { status: "ok", changed: 1, counts: { claimed: 1 } },
  health: { ok: true, alerted: ["h2_mirror_backlog_30m"], metrics: { at_risk: 0 } },
  heartbeat: { written: true },
  audited: true,
}

function getRequest(query = "") {
  return new NextRequest(`https://classin.co.kr/api/admin/meta-lead-mirror${query}`)
}

function postRequest(body: unknown) {
  return new NextRequest("https://classin.co.kr/api/admin/meta-lead-mirror", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://classin.co.kr" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

describe("/api/admin/meta-lead-mirror", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.role = "SUPER_ADMIN"
    // 실제 가드와 같은 판정: 세션 없음 401, 허용 역할 밖 403
    mocks.requireVerifiedAdminContext.mockImplementation(async (_req: NextRequest, roles: readonly string[]) => {
      if (!mocks.role) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      if (!roles.includes(mocks.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      return { userId: "admin-1", name: "운영자", role: mocks.role, source: "supabase", capabilities: [] }
    })
    mocks.isMetaLeadgenForceAdmin.mockReturnValue(false)
    mocks.readMetaLeadgenCutover.mockResolvedValue(CUTOVER)
    mocks.readMetaLeadMirrorHealth.mockResolvedValue({ ok: true, health: HEALTH })
    mocks.buildMetaLeadParityReport.mockResolvedValue(PARITY)
    mocks.runMetaLeadMirrorCycle.mockResolvedValue(CYCLE)
    mocks.logAdminAudit.mockResolvedValue(undefined)
  })

  it("maxDuration 60 — 대조 보고·수동 사이클 예산", () => {
    expect(maxDuration).toBe(60)
  })

  describe("권한 — SUPER_ADMIN 전용", () => {
    it("GET·POST 모두 가드에 SUPER_ADMIN 하나만 넘긴다(실제 판정에서 ADMIN 은 통과하지 못한다)", async () => {
      await GET(getRequest())
      await POST(postRequest({ action: "dryRun" }))
      for (const call of mocks.requireVerifiedAdminContext.mock.calls) {
        expect(call[1]).toEqual(["SUPER_ADMIN"])
      }
      expect(mocks.requireVerifiedAdminContext).toHaveBeenCalledTimes(2)
      const { hasAdminApiRole } = await vi.importActual<typeof import("@/lib/admin-auth")>("@/lib/admin-auth")
      expect(hasAdminApiRole("ADMIN", ["SUPER_ADMIN"])).toBe(false)
      expect(hasAdminApiRole("SUPER_ADMIN", ["SUPER_ADMIN"])).toBe(true)
    })

    for (const role of ["ADMIN", "EDITOR", "VIEWER", "BRANCH"]) {
      it(`${role} 는 403 이고 아무것도 읽거나 돌리지 않는다`, async () => {
        mocks.role = role

        expect((await GET(getRequest())).status).toBe(403)
        expect((await POST(postRequest({ action: "run" }))).status).toBe(403)

        expect(mocks.readMetaLeadgenCutover).not.toHaveBeenCalled()
        expect(mocks.readMetaLeadMirrorHealth).not.toHaveBeenCalled()
        expect(mocks.buildMetaLeadParityReport).not.toHaveBeenCalled()
        expect(mocks.runMetaLeadMirrorCycle).not.toHaveBeenCalled()
        expect(mocks.logAdminAudit).not.toHaveBeenCalled()
      })
    }

    it("세션이 없으면 401", async () => {
      mocks.role = null
      expect((await GET(getRequest())).status).toBe(401)
      expect((await POST(postRequest({ action: "run" }))).status).toBe(401)
      expect(mocks.runMetaLeadMirrorCycle).not.toHaveBeenCalled()
    })
  })

  describe("GET — 스위치·건강·대조", () => {
    it("응답 모양: generatedAt · switch · health · parity(기본 창)", async () => {
      const response = await GET(getRequest())

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(Object.keys(body)).toEqual(["generatedAt", "switch", "health", "parity"])
      expect(Date.parse(body.generatedAt)).not.toBeNaN()
      expect(body.switch).toEqual({ webhookMode: "shadow", forceAdmin: false, cutover: CUTOVER })
      expect(body.health).toEqual({ ok: true, data: HEALTH })
      expect(body.parity).toEqual(PARITY)
      expect(mocks.buildMetaLeadParityReport).toHaveBeenCalledWith({})
      expect(mocks.runMetaLeadMirrorCycle).not.toHaveBeenCalled()
      expect(mocks.logAdminAudit).not.toHaveBeenCalled()
    })

    it("?days= 는 1..45 정수만 대조 보고에 넘긴다", async () => {
      await GET(getRequest("?days=1"))
      await GET(getRequest("?days=45"))
      expect(mocks.buildMetaLeadParityReport.mock.calls).toEqual([[{ days: 1 }], [{ days: 45 }]])
    })

    for (const bad of ["0", "46", "7.5", "-1", "abc", "1000"]) {
      it(`?days=${bad} 는 400 이고 아무것도 읽지 않는다`, async () => {
        const response = await GET(getRequest(`?days=${bad}`))
        expect(response.status).toBe(400)
        expect(mocks.buildMetaLeadParityReport).not.toHaveBeenCalled()
        expect(mocks.readMetaLeadMirrorHealth).not.toHaveBeenCalled()
      })
    }

    it("env 비상 스위치가 켜져 있으면 웹훅 모드는 admin 이고 DB 행은 그대로 보여준다", async () => {
      mocks.isMetaLeadgenForceAdmin.mockReturnValue(true)
      mocks.readMetaLeadgenCutover.mockResolvedValue({ ...CUTOVER, mode: "compass" })

      const body = await (await GET(getRequest())).json()

      expect(body.switch).toMatchObject({ webhookMode: "admin", forceAdmin: true, cutover: { mode: "compass" } })
    })

    it("스위치·건강을 못 읽어도 200 으로 원인을 싣는다(웹훅처럼 admin 으로 본다)", async () => {
      mocks.readMetaLeadgenCutover.mockRejectedValue(new Error("meta_leadgen_cutover 읽기 실패: 42P01"))
      mocks.readMetaLeadMirrorHealth.mockResolvedValue({ ok: false, error: "meta_lead_mirror_health 실패: PGRST202" })

      const response = await GET(getRequest())

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.switch).toEqual({
        webhookMode: "admin",
        forceAdmin: false,
        cutover: null,
        error: "meta_leadgen_cutover 읽기 실패: 42P01",
      })
      expect(body.health).toEqual({ ok: false, error: "meta_lead_mirror_health 실패: PGRST202" })
    })

    it("예상 못 한 예외는 500 일반 문구", async () => {
      mocks.buildMetaLeadParityReport.mockRejectedValue(new Error("boom"))
      vi.spyOn(console, "error").mockImplementation(() => {})

      const response = await GET(getRequest())

      expect(response.status).toBe(500)
      expect(await response.json()).toEqual({ error: "Failed to load Meta lead mirror status" })
    })
  })

  describe("POST — run · dryRun", () => {
    it("run 은 관리 트리거·폴백 훅·45초 마감으로 사이클을 돌리고, 누가 돌렸는지 감사에 건수만 남긴다", async () => {
      vi.spyOn(Date, "now").mockReturnValue(5_000_000)

      const response = await POST(postRequest({ action: "run" }))

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ ok: true, action: "run", report: CYCLE })
      expect(mocks.runMetaLeadMirrorCycle).toHaveBeenCalledWith({
        trigger: "admin",
        dryRun: false,
        deadlineAt: 5_000_000 + 45_000,
        fallback: mocks.metaLeadFallbackStep,
      })
      expect(mocks.logAdminAudit).toHaveBeenCalledWith({
        admin: expect.objectContaining({ userId: "admin-1", role: "SUPER_ADMIN" }),
        action: "meta_lead_mirror.manual_run",
        targetType: "meta_lead_mirror",
        payload: {
          status: "ok",
          mode: "compass",
          mirrorStatus: "ok",
          inserted: 2,
          skipped: 1,
          fallbackStatus: "ok",
          fallbackChanged: 1,
          alerted: ["h2_mirror_backlog_30m"],
        },
      })
      vi.restoreAllMocks()
    })

    it("dryRun 은 쓰기 없는 사이클이고 감사를 남기지 않는다", async () => {
      mocks.runMetaLeadMirrorCycle.mockResolvedValue({ ...CYCLE, dryRun: true })

      const response = await POST(postRequest({ action: "dryRun" }))

      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({ ok: true, action: "dryRun", report: { dryRun: true } })
      expect(mocks.runMetaLeadMirrorCycle).toHaveBeenCalledWith(expect.objectContaining({ trigger: "admin", dryRun: true }))
      expect(mocks.logAdminAudit).not.toHaveBeenCalled()
    })

    it("사이클이 끝났으면 유실 위험·실패도 200 으로 보고서를 돌려준다(ok 로 구분)", async () => {
      for (const status of ["at_risk", "blocked", "failed", "bridge_down", "timeout", "skipped"]) {
        mocks.runMetaLeadMirrorCycle.mockResolvedValueOnce({ ...CYCLE, status })
        const response = await POST(postRequest({ action: "run" }))
        expect(response.status).toBe(200)
        expect(await response.json()).toMatchObject({ ok: status === "skipped", report: { status } })
      }
    })

    for (const body of [
      { action: "setMode", mode: "compass" },
      { action: "set_mode" },
      { action: "setOptions", options: { fallback_after_minutes: 30 } },
      { mode: "admin" },
      {},
      "not-json",
    ]) {
      it(`모드 전환·알 수 없는 요청은 400 이고 아무것도 돌리지 않는다 — ${JSON.stringify(body)}`, async () => {
        const response = await POST(postRequest(body))
        expect(response.status).toBe(400)
        expect((await response.json()).error).toContain("SQL-only")
        expect(mocks.runMetaLeadMirrorCycle).not.toHaveBeenCalled()
        expect(mocks.logAdminAudit).not.toHaveBeenCalled()
      })
    }

    it("예상 못 한 예외는 500 일반 문구", async () => {
      mocks.runMetaLeadMirrorCycle.mockRejectedValue(new Error("boom"))
      vi.spyOn(console, "error").mockImplementation(() => {})

      const response = await POST(postRequest({ action: "run" }))

      expect(response.status).toBe(500)
      expect(await response.json()).toEqual({ error: "Meta lead mirror run failed" })
      expect(mocks.logAdminAudit).not.toHaveBeenCalled()
    })
  })

  it("라우트는 Supabase·RPC 를 직접 부르지 않는다 — 모드 전환 함수(set_mode·set_options) 호출 자리가 없다", () => {
    const source = readFileSync(path.join(process.cwd(), "app/api/admin/meta-lead-mirror/route.ts"), "utf8")
    expect(source).not.toMatch(/\.rpc\(/)
    expect(source).not.toMatch(/createSupabaseAdminClient|@\/lib\/supabase\//)
    expect(source).not.toMatch(/export async function (PUT|PATCH|DELETE)/)
  })
})
