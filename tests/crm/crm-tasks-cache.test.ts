/**
 * lib/repositories/crm-tasks.ts 의 listCrmTasks 캐시 배선 계약 (2026-09-10 3라운드 §3.3).
 *
 * 이전엔 캐시가 아예 없어(2라운드 실측 3.3초) 매 조회가 crm_tasks를 다시 읽었다.
 * unstable_cache(5분, admin-crm-tasks 태그)로 승격했다 — 쓰기 경로(createCrmTask·
 * applyTaskUpdate)가 전부 이 태그를 revalidateTag(tag, "max")로 무효화한다.
 *
 * now는 캐시 키에서 제외했다(lib/repositories/crm-tasks.ts의 normalizeListCrmTasksParams
 * 주석 참고) — summary.overdue/dueToday 같은 now-민감 파생값은 캐시된 rows를 호출자의 now로
 * 매번 다시 계산해야 crm-customer-360.ts처럼 자기 now를 넘기는 호출부도 정확한 값을 받는다.
 * 이 파일의 두 번째 테스트가 그 계약을 고정한다.
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

const SENTINEL_ROW = {
  id: "task-1",
  targetType: "lead" as const,
  targetId: "lead-1",
  targetLabel: "테스트 학원",
  ownerKey: "owner-a",
  ownerNameSnapshot: "김지사",
  taskType: "call" as const,
  title: "첫 응대 전화",
  detail: null,
  dueAt: "2026-09-10T00:00:00.000Z",
  snoozedUntil: null,
  priority: "normal" as const,
  status: "open" as const,
  sourceEventId: null,
  createdBy: "김지사",
  assignedBy: "김지사",
  completedAt: null,
  completedBy: null,
  outcome: null,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
}

const SENTINEL_PAGE = {
  rows: [SENTINEL_ROW],
  total: 1,
  health: { ok: true, message: null },
}

// createCrmTask/applyTaskUpdate 전용 최소 supabase 스텁 — insert/update 체인만 흉내 낸다.
// (tests/helpers/recording-supabase-client는 .single()/.maybeSingle()을 지원하지 않는다.)
const TASK_DB_ROW = {
  id: "task-2",
  target_type: "lead",
  target_id: "lead-2",
  target_label: "새 학원",
  owner_key: "owner-b",
  owner_name_snapshot: "이매니저",
  task_type: "call",
  title: "새 할 일",
  detail: null,
  due_at: null,
  snoozed_until: null,
  priority: "normal",
  status: "open",
  source_event_id: null,
  created_by: "이매니저",
  assigned_by: "이매니저",
  completed_at: null,
  completed_by: null,
  outcome: null,
  created_at: "2026-09-10T00:00:00.000Z",
  updated_at: "2026-09-10T00:00:00.000Z",
}

function createMutationSupabaseStub() {
  return {
    from: () => ({
      insert: () => ({ select: () => ({ single: async () => ({ data: TASK_DB_ROW, error: null }) }) }),
      update: () => ({
        eq: () => ({ select: () => ({ maybeSingle: async () => ({ data: TASK_DB_ROW, error: null }) }) }),
      }),
    }),
  }
}

async function loadModule() {
  vi.resetModules()
  vi.doMock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => createMutationSupabaseStub() }))
  // admin-users.ts도 자기 unstable_cache(listAdminUserDirectory)를 갖고 있다 — 목킹 안 하면
  // crm-tasks.ts를 부를 때마다 딸려 들어와 "unstable_cache가 몇 번 불렸나" 계약이 흔들린다.
  // crm-tasks.ts의 reassignCrmTask 계열만 이 모듈을 쓰고 이 테스트 범위 밖이라 안전하게 비운다.
  vi.doMock("@/lib/repositories/admin-users", () => ({
    findAdminCrmOwner: vi.fn(),
    listAdminUserDirectory: vi.fn().mockResolvedValue(null),
  }))
  return import("@/lib/repositories/crm-tasks")
}

describe("crm-tasks listCrmTasks 캐시 배선", () => {
  let cachedPageFn: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mocks.unstableCache.mockReset()
    mocks.unstableCache.mockImplementation(() => {
      cachedPageFn = vi.fn().mockResolvedValue(SENTINEL_PAGE)
      return cachedPageFn
    })
    mocks.revalidateTag.mockClear()
  })

  it("unstable_cache(5분, admin-crm-tasks 태그)로 감싼다", async () => {
    await loadModule()

    expect(mocks.unstableCache).toHaveBeenCalledTimes(1)
    const [fn, keyParts, options] = mocks.unstableCache.mock.calls[0]
    expect(typeof fn).toBe("function")
    expect(keyParts).toEqual(["admin-crm-tasks-v1"])
    expect(options).toEqual({ revalidate: 300, tags: ["admin-crm-tasks"] })
  })

  it("now는 캐시 키에서 제외되고, 캐시된 rows를 호출자의 now로 다시 요약한다", async () => {
    const { listCrmTasks } = await loadModule()

    const before = await listCrmTasks({ now: new Date("2026-09-09T00:00:00.000Z") })
    const after = await listCrmTasks({ now: new Date("2026-09-10T12:00:00.000Z") })

    // 같은 (캐시된) rows인데 now가 다르면 overdue/dueToday가 달라진다.
    expect(before.summary).toMatchObject({ overdue: 0, dueToday: 0 })
    expect(after.summary).toMatchObject({ overdue: 1, dueToday: 1 })
    // rows/total 자체는 두 호출 다 같은 캐시 페이지에서 왔다.
    expect(before.rows).toEqual(after.rows)
    expect(before.pagination.total).toBe(1)
    // now가 다른 두 호출이 캐시 함수를 별도로 다시 부르지 않는다(같은 필터 → 같은 params 인자).
    expect(cachedPageFn).toHaveBeenCalledTimes(2)
    expect(cachedPageFn.mock.calls[0][0]).toEqual(cachedPageFn.mock.calls[1][0])
  })

  it("담당자 배열 순서만 다른 요청은 같은 캐시 키로 정규화된다", async () => {
    const { listCrmTasks } = await loadModule()

    await listCrmTasks({ ownerKeys: ["b", "a"] })
    await listCrmTasks({ ownerKeys: ["a", "b"] })

    expect(cachedPageFn.mock.calls[0][0].ownerKeys).toEqual(["a", "b"])
    expect(cachedPageFn.mock.calls[1][0].ownerKeys).toEqual(["a", "b"])
  })

  it("createCrmTask는 저장 성공 후 admin-crm-tasks 태그를 SWR로 무효화한다", async () => {
    const { createCrmTask } = await loadModule()

    await createCrmTask({ title: "새 할 일" })

    expect(mocks.revalidateTag).toHaveBeenCalledWith("admin-crm-tasks", "max")
  })

  it("완료·미루기 등 applyTaskUpdate 경로도 admin-crm-tasks 태그를 무효화한다", async () => {
    const { completeCrmTask } = await loadModule()

    await completeCrmTask("task-2", { now: new Date("2026-09-10T00:00:00.000Z") })

    expect(mocks.revalidateTag).toHaveBeenCalledWith("admin-crm-tasks", "max")
  })
})
