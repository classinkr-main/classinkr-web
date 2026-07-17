import { NextRequest, NextResponse } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

// 계기판 repo 집계 함수는 실제 구현을 가짜 supabase.rpc 로 구동하고, 라우트는 조립기를 spy 로 배선 검증한다.
const mocks = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  requireVerifiedAdminContext: vi.fn(),
  getInternalCsMetrics: vi.fn(),
}))

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}))

vi.mock("@/lib/admin-auth", () => ({
  CRM_STAFF_ADMIN_API_ROLES: ["SUPER_ADMIN", "ADMIN", "BRANCH"],
  requireVerifiedAdminContext: mocks.requireVerifiedAdminContext,
}))

vi.mock("@/lib/internal-cs-chat/metrics", async () => {
  const actual = await vi.importActual<typeof import("@/lib/internal-cs-chat/metrics")>(
    "@/lib/internal-cs-chat/metrics"
  )
  return { ...actual, getInternalCsMetrics: mocks.getInternalCsMetrics }
})

import { GET as metricsGet } from "@/app/api/admin/cs-chat/metrics/route"

async function importRealRepo() {
  return vi.importActual<typeof import("@/lib/repositories/internal-cs-chat")>(
    "@/lib/repositories/internal-cs-chat"
  )
}

afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe("getInternalCsMetricsAggregate", () => {
  it("maps the RPC JSONB into the aggregate shape", async () => {
    const repo = await importRealRepo()
    const rpc = vi.fn().mockResolvedValue({
      data: {
        days: 7,
        questions: 12,
        conversations: 4,
        assistantTotal: 10,
        assistantDeterministic: 2,
        evidenceKnowledge: 3,
        evidenceDocs: 4,
        evidenceChannel: 1,
        evidenceNone: 2,
        reviewApproved: 5,
        reviewChangesRequested: 2,
        reviewPending: 3,
        regressionNotEvaluated: 1,
        regressionPass: 2,
        regressionNeedsFix: 1,
        regressionPromoted: 1,
        regressionExcluded: 0,
        leadTimeMedianHours: 3.5,
        leadTimeP90Hours: 12.0,
      },
      error: null,
    })
    mocks.createSupabaseAdminClient.mockReturnValue({ rpc })

    const aggregate = await repo.getInternalCsMetricsAggregate(7)

    expect(rpc).toHaveBeenCalledWith("internal_cs_metrics", { range_days: 7 })
    expect(aggregate.questions).toBe(12)
    expect(aggregate.evidenceDocs).toBe(4)
    expect(aggregate.leadTimeMedianHours).toBe(3.5)
  })

  it("returns an empty aggregate when the metrics function is not applied (PGRST202)", async () => {
    const repo = await importRealRepo()
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: "PGRST202",
        message: "Could not find the function public.internal_cs_metrics(range_days) in the schema cache",
      },
    })
    mocks.createSupabaseAdminClient.mockReturnValue({ rpc })
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined)

    const aggregate = await repo.getInternalCsMetricsAggregate(30)

    expect(aggregate).toEqual(repo.emptyInternalCsMetricsAggregate(30))
    // 정확한 함수-부재 코드는 기대된 상태 — 경고 없이 조용히 흡수한다.
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it("surfaces a permission error (42501) instead of masking it as an empty dashboard", async () => {
    const repo = await importRealRepo()
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: "42501",
        message: "permission denied for function internal_cs_metrics",
      },
    })
    mocks.createSupabaseAdminClient.mockReturnValue({ rpc })

    // 텍스트 휴리스틱("internal_cs_metrics"+"function")에 걸리더라도 42501 은 무조건 throw 다.
    await expect(repo.getInternalCsMetricsAggregate(7)).rejects.toThrow(/aggregate metrics/)
  })

  it("warns when a text-fallback match absorbs an error without an exact missing-function code", async () => {
    const repo = await importRealRepo()
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: {
        message: "function public.internal_cs_metrics(range_days) does not exist",
      },
    })
    mocks.createSupabaseAdminClient.mockReturnValue({ rpc })
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined)

    const aggregate = await repo.getInternalCsMetricsAggregate(7)

    // 흡수는 유지하되 원문이 로그로 남는다(M2).
    expect(aggregate).toEqual(repo.emptyInternalCsMetricsAggregate(7))
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("not-ready로 흡수"))
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("does not exist"))
  })

  it("throws on an unexpected database error", async () => {
    const repo = await importRealRepo()
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "57014", message: "canceling statement due to statement timeout" },
    })
    mocks.createSupabaseAdminClient.mockReturnValue({ rpc })

    await expect(repo.getInternalCsMetricsAggregate(7)).rejects.toThrow(/aggregate metrics/)
  })
})

describe("GET /api/admin/cs-chat/metrics", () => {
  it("requires an authorized CS/admin session", async () => {
    mocks.requireVerifiedAdminContext.mockResolvedValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 })
    )

    const response = await metricsGet(
      new NextRequest("https://classin.kr/api/admin/cs-chat/metrics?days=7")
    )

    expect(response.status).toBe(403)
    expect(mocks.getInternalCsMetrics).not.toHaveBeenCalled()
  })

  it("passes an allowed range through and returns the metrics payload", async () => {
    mocks.requireVerifiedAdminContext.mockResolvedValue({ role: "ADMIN", name: "CS" })
    mocks.getInternalCsMetrics.mockResolvedValue({ range: { days: 30 } })

    const response = await metricsGet(
      new NextRequest("https://classin.kr/api/admin/cs-chat/metrics?days=30")
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.getInternalCsMetrics).toHaveBeenCalledWith(30)
    expect(json.range.days).toBe(30)
  })

  it("falls back to a 7-day window for an unsupported range", async () => {
    mocks.requireVerifiedAdminContext.mockResolvedValue({ role: "ADMIN", name: "CS" })
    mocks.getInternalCsMetrics.mockResolvedValue({ range: { days: 7 } })

    await metricsGet(new NextRequest("https://classin.kr/api/admin/cs-chat/metrics?days=999"))

    expect(mocks.getInternalCsMetrics).toHaveBeenCalledWith(7)
  })

  it("returns 500 when the aggregate throws (권한 오류 등 비 not-ready 오류 표면화)", async () => {
    mocks.requireVerifiedAdminContext.mockResolvedValue({ role: "ADMIN", name: "CS" })
    mocks.getInternalCsMetrics.mockRejectedValue(
      new Error("[internal-cs-chat] failed to aggregate metrics: permission denied for function internal_cs_metrics")
    )
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)

    const response = await metricsGet(
      new NextRequest("https://classin.kr/api/admin/cs-chat/metrics?days=7")
    )

    expect(response.status).toBe(500)
    expect(errorSpy).toHaveBeenCalled()
  })
})
