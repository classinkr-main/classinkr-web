/**
 * H1 — getCrmPriorityQueue({ force }) 계약.
 *
 * 클라이언트 새로고침(CrmPriorityQueuePanel의 `&force=1`)이 서버까지 관통하려면 리포지토리가
 * force를 받아 소스 스냅샷 Data Cache를 우회하고, 재수집 뒤 태그를 즉시 하드 만료해야 한다
 * (lib/admin-crm-overview.ts getAdminCrmOverview({ force })와 같은 컨벤션).
 * 모킹 패턴은 tests/repositories/crm-priority-queue-snapshot-cache.test.ts를 따른다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  unstableCache: vi.fn(),
  revalidateTag: vi.fn(),
}))

vi.mock("next/cache", () => ({
  unstable_cache: mocks.unstableCache,
  revalidateTag: mocks.revalidateTag,
}))

const SNAPSHOT_TAG = "admin-crm-priority-queue-snapshot"

// 캐시 경로에서 왔다는 표식 — 실제 소스(전부 성공·빈 배열)와 leadsOk/warnings로 구분한다.
const CACHED_SENTINEL_SNAPSHOT = {
  leads: [],
  leadsOk: false,
  neoRows: [],
  neoAccountsOk: true,
  tasks: [],
  tasksOk: true,
  engagements: null,
  demoSource: { demos: [], phoneKeysByCompassLeadId: [], down: false },
  warnings: ["센티널: 캐시에서 왔음"],
  complete: true,
}

function mockRealSourcesEmpty() {
  vi.doMock("@/lib/repositories/leads", () => ({
    getLeads: vi.fn().mockResolvedValue([]),
    onLeadsMutated: vi.fn(),
  }))
  vi.doMock("@/lib/repositories/crm-tasks", () => ({
    listCrmTasks: vi.fn().mockResolvedValue({ rows: [], health: { ok: true } }),
    onCrmTasksMutated: vi.fn(),
  }))
  vi.doMock("@/lib/repositories/contact-logs", () => ({ onContactLogsMutated: vi.fn() }))
  vi.doMock("@/lib/repositories/lead-activity", () => ({
    getLeadsActivitySummary: vi.fn().mockResolvedValue({}),
  }))
  vi.doMock("@/lib/crm/compass-demo-source", () => ({
    loadCompassDemoSource: vi
      .fn()
      .mockResolvedValue({ demos: [], phoneKeysByCompassLeadId: new Map(), down: false }),
  }))
  vi.doMock("@/lib/admin-crm-customers-neo", () => ({
    getNeoCrmCustomers: vi.fn().mockResolvedValue({ ok: true, rows: [] }),
  }))
}

async function loadRepository() {
  vi.resetModules()
  mockRealSourcesEmpty()
  return import("@/lib/repositories/crm-priority-queue")
}

describe("getCrmPriorityQueue force 계약 (H1)", () => {
  beforeEach(() => {
    mocks.unstableCache.mockReset()
    mocks.unstableCache.mockImplementation(() => vi.fn().mockResolvedValue(CACHED_SENTINEL_SNAPSHOT))
    mocks.revalidateTag.mockClear()
  })

  it("force=true면 소스 스냅샷 캐시를 우회해 실제 소스를 재수집한다", async () => {
    const { getCrmPriorityQueue } = await loadRepository()

    const result = await getCrmPriorityQueue({ force: true })

    expect(result.sources.leadsOk).toBe(true)
    expect(result.sources.warnings).not.toContain("센티널: 캐시에서 왔음")
  })

  it("force=true면 재수집 뒤 스냅샷 태그를 즉시 하드 만료한다({ expire: 0 })", async () => {
    const { getCrmPriorityQueue } = await loadRepository()

    await getCrmPriorityQueue({ force: true })

    expect(mocks.revalidateTag).toHaveBeenCalledWith(SNAPSHOT_TAG, { expire: 0 })
  })

  it("force가 없으면(기본) 캐시 경로를 쓰고 태그를 만료하지 않는다", async () => {
    const { getCrmPriorityQueue } = await loadRepository()

    const result = await getCrmPriorityQueue({ force: false })

    expect(result.sources.warnings).toContain("센티널: 캐시에서 왔음")
    expect(mocks.revalidateTag).not.toHaveBeenCalled()
  })
})
