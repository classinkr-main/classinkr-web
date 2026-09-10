/**
 * lib/repositories/crm-priority-queue.ts 의 소스 스냅샷 캐시 배선 계약.
 *
 * 이전에는 인스턴스 모듈 메모(sourceSnapshotCache + sourceSnapshotInFlight +
 * sourceSnapshotGeneration, 60초 TTL)였다 — Vercel Fluid 인스턴스가 콜드일 때마다 비어 있어
 * 매 요청이 leads+NEO+할 일 200건+참여요약+쇼룸 ICS 전량 재수집을 물었다. unstable_cache
 * (Data Cache)는 인스턴스 간 공유되고 stale-while-revalidate라 콜드 인스턴스에서도 다른
 * 인스턴스가 데운 값을 즉시 돌려준다.
 *
 * "무효화 시점 이전에 시작된 수집이 뒤늦게 캐시를 되채우는" 구 generation 가드는 캐시 저장
 * 결정을 더 이상 이 파일이 하지 않으므로(unstable_cache가 대신함) 제거했다 — 이 계약은
 * invalidateCrmPrioritySourceSnapshot()이 태그를 SWR로 무효화하는 것으로 검증한다.
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

// unstable_cache가 실제로 감싸는 값과 구분되는 "캐시에서 왔다"는 표식의 가짜 스냅샷.
// getCrmPriorityQueue는 sources.{leadsOk,neoAccountsOk,tasksOk,warnings}를 그대로 통과시킨다.
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

describe("crm-priority-queue 소스 스냅샷 캐시 배선", () => {
  beforeEach(() => {
    mocks.unstableCache.mockReset()
    mocks.unstableCache.mockImplementation(() => vi.fn().mockResolvedValue(CACHED_SENTINEL_SNAPSHOT))
    mocks.revalidateTag.mockClear()
  })

  it("unstable_cache(60초, admin-crm-priority-queue-snapshot 태그)로 감싼다", async () => {
    await loadRepository()

    expect(mocks.unstableCache).toHaveBeenCalledTimes(1)
    const [fn, keyParts, options] = mocks.unstableCache.mock.calls[0]
    expect(typeof fn).toBe("function")
    expect(keyParts).toEqual(["admin-crm-priority-queue-snapshot", "json-v2"])
    expect(options).toEqual({ revalidate: 60, tags: ["admin-crm-priority-queue-snapshot"] })
  })

  it("now 없이 부르면 캐시된 경로(모의 unstable_cache의 센티널 값)를 그대로 쓴다", async () => {
    const { getCrmPriorityQueue } = await loadRepository()

    const result = await getCrmPriorityQueue({})

    expect(result.sources.leadsOk).toBe(false)
    expect(result.sources.warnings).toContain("센티널: 캐시에서 왔음")
  })

  it("now가 주어지면 캐시를 우회해 실제 소스를 직접 재수집한다", async () => {
    const { getCrmPriorityQueue } = await loadRepository()

    const result = await getCrmPriorityQueue({ now: new Date("2026-08-26T00:00:00.000Z") })

    // 실제 소스는 전부 성공(빈 배열)으로 모킹했으므로 캐시 우회 시 leadsOk=true여야 한다.
    expect(result.sources.leadsOk).toBe(true)
    expect(result.sources.warnings).not.toContain("센티널: 캐시에서 왔음")
  })

  it("invalidateCrmPrioritySourceSnapshot()은 admin-crm-priority-queue-snapshot 태그를 SWR로 무효화한다", async () => {
    const { invalidateCrmPrioritySourceSnapshot } = await loadRepository()

    invalidateCrmPrioritySourceSnapshot()

    expect(mocks.revalidateTag).toHaveBeenCalledWith("admin-crm-priority-queue-snapshot", "max")
  })
})
