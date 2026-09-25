/**
 * 할 일 쓰기 → 현황 "오늘 연락" 즉시 반영 계약(2026-09-26 교차 리뷰 [Q2-15]).
 *
 *  (a) 할 일 쓰기(만들기·완료·미루기·취소·재개·편집·재배정)는 저장소 한 곳(notifyCrmTasksMutated)에서 오늘 연락 보조 원천
 *      태그를 즉시 만료({ expire: 0 })한다 — 할 일 라우트·세그먼트 "오늘 연락에 넣기"(tasks/bulk → createCrmTask 건별)·
 *      결과 기록이 모두 이 길을 지난다. 큐 스냅샷 태그는 전처럼 SWR("max").
 *  (b) 새로고침(force)·고정 now 읽기의 후보 풀은 할 일 Data Cache(admin-crm-tasks)도 거치지 않는다 — listCrmTasks 에
 *      bypassCache 를 넘긴다. 일반(캐시) 경로는 전처럼 캐시를 탄다.
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

const TODAY_CONTACTS_TAG = "admin-crm-today-contacts"
const PRIORITY_TAG = "admin-crm-priority-queue-snapshot"
const TASKS_TAG = "admin-crm-tasks"

const TASK_DB_ROW = {
  id: "task-2",
  target_type: "lead",
  target_id: "lead-2",
  target_label: "새 학원",
  owner_key: null,
  owner_name_snapshot: null,
  task_type: "call",
  title: "[세그먼트] 재활성",
  detail: null,
  due_at: "2026-09-25T09:00:00.000Z",
  snoozed_until: null,
  priority: "normal",
  status: "open",
  source_event_id: null,
  created_by: "김운영",
  assigned_by: "김운영",
  completed_at: null,
  completed_by: null,
  outcome: null,
  created_at: "2026-09-25T02:00:00.000Z",
  updated_at: "2026-09-25T02:00:00.000Z",
}

const CACHED_PAGE = {
  rows: [{ id: "cached-task" }],
  total: 1,
  health: { ok: true, message: null },
}

/** crm_tasks 최소 스텁 — 목록 조회(select … range → await)와 insert/update 체인만 흉내 낸다. */
function createTasksSupabaseStub(dbRows: unknown[]) {
  const listChain: Record<string, unknown> = {}
  for (const method of ["select", "order", "range", "in", "eq", "lte", "or"]) {
    listChain[method] = vi.fn(() => listChain)
  }
  listChain.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
    Promise.resolve({ data: dbRows, error: null, count: dbRows.length }).then(resolve, reject)
  return {
    listChain,
    client: {
      from: () => ({
        ...listChain,
        insert: () => ({ select: () => ({ single: async () => ({ data: TASK_DB_ROW, error: null }) }) }),
        update: () => ({
          eq: () => ({ select: () => ({ maybeSingle: async () => ({ data: TASK_DB_ROW, error: null }) }) }),
        }),
      }),
    },
  }
}

let cachedPageFn: ReturnType<typeof vi.fn>

async function loadTasksModule(dbRows: unknown[] = [TASK_DB_ROW]) {
  vi.resetModules()
  const stub = createTasksSupabaseStub(dbRows)
  vi.doMock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => stub.client }))
  vi.doMock("@/lib/repositories/admin-users", () => ({
    findAdminCrmOwner: vi.fn(),
    listAdminUserDirectory: vi.fn().mockResolvedValue(null),
  }))
  const mod = await import("@/lib/repositories/crm-tasks")
  return { mod, stub }
}

beforeEach(() => {
  mocks.unstableCache.mockReset()
  mocks.unstableCache.mockImplementation(() => {
    cachedPageFn = vi.fn().mockResolvedValue(CACHED_PAGE)
    return cachedPageFn
  })
  mocks.revalidateTag.mockReset()
})

describe("[Q2-15] (a) 할 일 쓰기 → 오늘 연락 태그 즉시 만료", () => {
  it("할 일 만들기(세그먼트 '오늘 연락에 넣기'가 건별로 부르는 createCrmTask)는 오늘 연락 태그를 즉시 만료한다", async () => {
    const { mod } = await loadTasksModule()
    await mod.createCrmTask({ title: "[세그먼트] 재활성", targetType: "lead", targetId: "lead-2", dueAt: "2026-09-25T09:00:00.000Z" })
    expect(mocks.revalidateTag).toHaveBeenCalledWith(TODAY_CONTACTS_TAG, { expire: 0 })
    // 큐 스냅샷·할 일 목록 캐시는 전처럼 SWR.
    expect(mocks.revalidateTag).toHaveBeenCalledWith(PRIORITY_TAG, "max")
    expect(mocks.revalidateTag).toHaveBeenCalledWith(TASKS_TAG, "max")
    expect(mocks.revalidateTag).not.toHaveBeenCalledWith(PRIORITY_TAG, { expire: 0 })
  })

  it.each([
    ["완료", (mod: typeof import("@/lib/repositories/crm-tasks")) => mod.completeCrmTask("task-2", { completedBy: "김운영" })],
    ["미루기", (mod: typeof import("@/lib/repositories/crm-tasks")) => mod.snoozeCrmTask("task-2", { assignedBy: "김운영" })],
    ["취소(삭제)", (mod: typeof import("@/lib/repositories/crm-tasks")) => mod.cancelCrmTask("task-2", { completedBy: "김운영" })],
    ["재개", (mod: typeof import("@/lib/repositories/crm-tasks")) => mod.reopenCrmTask("task-2")],
    ["편집", (mod: typeof import("@/lib/repositories/crm-tasks")) => mod.updateCrmTask("task-2", { dueAt: null })],
    [
      "재배정",
      (mod: typeof import("@/lib/repositories/crm-tasks")) =>
        mod.reassignCrmTask("task-2", { ownerKey: "kim", ownerNameSnapshot: "김운영", assignedBy: "김운영" }),
    ],
  ])("%s도 오늘 연락 태그를 즉시 만료한다", async (_label, run) => {
    const { mod } = await loadTasksModule()
    await run(mod)
    expect(mocks.revalidateTag).toHaveBeenCalledWith(TODAY_CONTACTS_TAG, { expire: 0 })
  })

  it("오늘 연락 무효화가 던져도 저장 결과와 구독 리스너는 깨지지 않는다", async () => {
    mocks.revalidateTag.mockImplementation((tag: string) => {
      if (tag === TODAY_CONTACTS_TAG) throw new Error("no store")
    })
    const { mod } = await loadTasksModule()
    const listener = vi.fn()
    mod.onCrmTasksMutated(listener)
    const task = await mod.createCrmTask({ title: "[세그먼트] 재활성" })
    expect(task.id).toBe("task-2")
    expect(listener).toHaveBeenCalledTimes(1)
  })
})

describe("[Q2-15] (b) listCrmTasks bypassCache", () => {
  it("bypassCache 면 할 일 Data Cache 를 거치지 않고 DB 를 바로 읽는다 — 기본은 캐시", async () => {
    const { mod } = await loadTasksModule()
    const fresh = await mod.listCrmTasks({ status: "active", limit: 200, bypassCache: true })
    expect(cachedPageFn).not.toHaveBeenCalled()
    expect(fresh.rows.map((row) => row.id)).toEqual(["task-2"])
    expect(fresh.rows[0]).toMatchObject({ title: "[세그먼트] 재활성", status: "open" })

    const cached = await mod.listCrmTasks({ status: "active", limit: 200 })
    expect(cachedPageFn).toHaveBeenCalledTimes(1)
    expect(cached.rows.map((row) => row.id)).toEqual(["cached-task"])
    // bypassCache 는 캐시 키(정규화 파라미터)에 들어가지 않는다.
    expect(cachedPageFn.mock.calls[0][0]).not.toHaveProperty("bypassCache")
  })
})

describe("[Q2-15] (b) 후보 풀 force → 할 일 캐시 우회", () => {
  const CORE = {
    leads: [],
    leadsOk: true,
    neoRows: [],
    neoAccountsOk: true,
    neoLatestSyncedAt: null,
    neoIsShroffAccountStale: false,
    engagements: null,
    demoSource: { demos: [], phoneKeysByCompassLeadId: [], down: false },
    complete: true,
  }

  async function loadQueue() {
    vi.resetModules()
    const listCrmTasks = vi.fn().mockResolvedValue({ rows: [], health: { ok: true, message: null } })
    vi.doMock("@/lib/repositories/crm-shared-source-snapshot", () => ({
      getCrmCoreSourceSnapshot: vi.fn().mockResolvedValue(CORE),
    }))
    vi.doMock("@/lib/repositories/crm-tasks", () => ({ listCrmTasks, onCrmTasksMutated: vi.fn() }))
    vi.doMock("@/lib/repositories/leads", () => ({ onLeadsMutated: vi.fn() }))
    vi.doMock("@/lib/repositories/contact-logs", () => ({ onContactLogsMutated: vi.fn() }))
    const mod = await import("@/lib/repositories/crm-priority-queue")
    return { mod, listCrmTasks }
  }

  it("force 는 할 일도 캐시를 우회해 읽는다(bypassCache) — 방금 미룬·완료한 할 일의 옛 값이 새로고침에 남지 않게", async () => {
    const { mod, listCrmTasks } = await loadQueue()
    await mod.getCrmPriorityCandidatePool({ force: true })
    expect(listCrmTasks).toHaveBeenCalledWith({ status: "active", limit: 200, bypassCache: true })
    expect(mocks.revalidateTag).toHaveBeenCalledWith(PRIORITY_TAG, { expire: 0 })
  })

  it("일반 읽기(캐시 경로 콜백)는 전처럼 할 일 캐시를 탄다 — bypassCache 를 넘기지 않는다", async () => {
    // unstable_cache 를 그대로 통과시켜 캐시 콜백(스냅샷 재수집)을 실제로 돌린다.
    mocks.unstableCache.mockImplementation((fn: (...args: unknown[]) => Promise<unknown>) => fn)
    const { mod, listCrmTasks } = await loadQueue()
    await mod.getCrmPriorityCandidatePool({})
    expect(listCrmTasks).toHaveBeenCalledWith({ status: "active", limit: 200 })
    expect(listCrmTasks.mock.calls[0][0]).not.toHaveProperty("bypassCache")
  })
})
