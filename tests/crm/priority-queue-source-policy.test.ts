/**
 * H2 — 큐 소비처의 source 정책.
 *
 * 홈 "오늘 전화" 큐(CrmPriorityQueuePanel)는 source=customer(리드 + ClassIn 고객)로 조회한다.
 * 인사이트 "우선 연락" 숫자가 홈 큐와 같으려면 getCrmInsights도 같은 source를 써야 한다.
 * 매니저 리포트는 task 항목을 overdue_task로 매핑하므로 의도적으로 source=all을 유지한다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getCrmPriorityQueue: vi.fn(),
  getCrmSourceLinkCoverage: vi.fn(),
  getAdminCrmOverview: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
}))

vi.mock("@/lib/repositories/crm-priority-queue", () => ({
  getCrmPriorityQueue: mocks.getCrmPriorityQueue,
}))
vi.mock("@/lib/repositories/crm-source-links", () => ({
  getCrmSourceLinkCoverage: mocks.getCrmSourceLinkCoverage,
}))
vi.mock("@/lib/admin-crm-overview", () => ({
  getAdminCrmOverview: mocks.getAdminCrmOverview,
}))
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}))

const QUEUE_STUB = {
  generatedAt: "2026-09-12T00:00:00.000Z",
  sources: { leadsOk: true, neoAccountsOk: true, tasksOk: true, warnings: [] },
  summary: { total: 3, critical: 1, high: 1, leadCount: 2, neoAccountCount: 1, taskCount: 0, ownerCount: 1 },
  buckets: [],
  lanes: [],
  owners: [],
  items: [],
}

// supabase 쿼리 빌더 흉내 — 어떤 체인이든 마지막에 { data: [], error: null }로 settle 된다.
function emptyQueryBuilder() {
  const result = { data: [] as unknown[], error: null }
  const builder: Record<string, unknown> = {}
  for (const method of ["from", "select", "in", "eq", "gte", "limit"]) {
    builder[method] = () => builder
  }
  builder.then = (resolve: (value: typeof result) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject)
  return builder
}

describe("우선순위 큐 소비처 source 정책 (H2)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getCrmPriorityQueue.mockResolvedValue(QUEUE_STUB)
    mocks.getCrmSourceLinkCoverage.mockResolvedValue({ total: 10, linked: 8, needsReview: 1, coveragePct: 80 })
    mocks.getAdminCrmOverview.mockRejectedValue(new Error("overview unavailable in test"))
    mocks.createSupabaseAdminClient.mockReturnValue(emptyQueryBuilder())
  })

  it("getCrmInsights는 홈 큐와 같은 source=customer로 큐를 부르고 그 total을 '우선 연락'에 쓴다", async () => {
    const { getCrmInsights } = await import("@/lib/repositories/crm-insights")

    const insights = await getCrmInsights()

    expect(mocks.getCrmPriorityQueue).toHaveBeenCalledTimes(1)
    expect(mocks.getCrmPriorityQueue).toHaveBeenCalledWith(expect.objectContaining({ source: "customer" }))
    expect(insights.kpis.priorityTotal).toBe(3)
  })

  it("getCrmManagerReport는 지연 할 일(overdue_task)을 세야 하므로 source=all을 명시적으로 유지한다", async () => {
    const { getCrmManagerReport } = await import("@/lib/repositories/crm-manager-report")

    await getCrmManagerReport({ now: new Date("2026-09-12T00:00:00.000Z") })

    expect(mocks.getCrmPriorityQueue).toHaveBeenCalledTimes(1)
    expect(mocks.getCrmPriorityQueue).toHaveBeenCalledWith(expect.objectContaining({ source: "all", limit: 40 }))
  })
})
