// lib/internal-cs-chat/metrics.ts — route-local 60초 Map(metricsCache)을 Data Cache로 교체
// (admin-performance-round3-2026-09-10.md §3.3).
//
// getInternalCsMetrics(days)는 unstable_cache(60초, 옛 TTL 유지)로 승격한다.
// getInternalCsMetrics(days, nowMs)는 여전히 캐시를 건너뛰는 테스트 전용 결정론 경로다
// (tests/internal-cs-chat/metrics.test.ts가 이 계약을 이미 고정하고 있어 그대로 보존한다).
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getInternalCsMetricsAggregate: vi.fn(),
}))

const unstableCacheCalls: Array<{
  keyParts: string[]
  options?: { revalidate?: number; tags?: string[] }
}> = []

vi.mock("@/lib/repositories/internal-cs-chat", async () => {
  const actual = await vi.importActual<typeof import("@/lib/repositories/internal-cs-chat")>(
    "@/lib/repositories/internal-cs-chat"
  )
  return { ...actual, getInternalCsMetricsAggregate: mocks.getInternalCsMetricsAggregate }
})
vi.mock("next/cache", () => ({
  unstable_cache: (
    fn: (...args: unknown[]) => unknown,
    keyParts: string[],
    options?: { revalidate?: number; tags?: string[] },
  ) => {
    unstableCacheCalls.push({ keyParts, options })
    return fn
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  unstableCacheCalls.length = 0
  mocks.getInternalCsMetricsAggregate.mockResolvedValue({
    days: 7,
    questions: 0,
    conversations: 0,
    assistantTotal: 0,
    assistantDeterministic: 0,
    evidenceKnowledge: 0,
    evidenceDocs: 0,
    evidenceChannel: 0,
    evidenceNone: 0,
    reviewApproved: 0,
    reviewChangesRequested: 0,
    reviewPending: 0,
    regressionNotEvaluated: 0,
    regressionPass: 0,
    regressionNeedsFix: 0,
    regressionPromoted: 0,
    regressionExcluded: 0,
    leadTimeMedianHours: null,
    leadTimeP90Hours: null,
  })
})

describe("getInternalCsMetrics — unstable_cache 배선", () => {
  it("옛 메모와 같은 60초로 캐시하고 태그를 채운다", async () => {
    vi.resetModules()
    await import("@/lib/internal-cs-chat/metrics")

    const call = unstableCacheCalls.find((c) => c.options?.revalidate === 60)
    expect(call).toBeDefined()
    expect(call?.options?.tags).toBeDefined()
    expect(call?.options?.tags?.length).toBeGreaterThan(0)
  })

  it("nowMs 없이 부르면 캐시된 경로(days만 인자)를 탄다", async () => {
    vi.resetModules()
    const { getInternalCsMetrics } = await import("@/lib/internal-cs-chat/metrics")

    const metrics = await getInternalCsMetrics(7)

    expect(mocks.getInternalCsMetricsAggregate).toHaveBeenCalledWith(7)
    expect(metrics.range.days).toBe(7)
  })

  it("nowMs를 주면 캐시를 건너뛰고 그 시각 기준으로 결정론적으로 계산한다(기존 계약 보존)", async () => {
    vi.resetModules()
    const { getInternalCsMetrics } = await import("@/lib/internal-cs-chat/metrics")
    const NOW = Date.parse("2026-07-16T00:00:00.000Z")

    const metrics = await getInternalCsMetrics(30, NOW)

    expect(mocks.getInternalCsMetricsAggregate).toHaveBeenCalledWith(30)
    expect(metrics.range.to).toBe("2026-07-16T00:00:00.000Z")
  })
})
