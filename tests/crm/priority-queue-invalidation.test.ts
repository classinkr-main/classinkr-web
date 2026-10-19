/**
 * F1 — CRM 홈 우선순위 큐 소스 스냅샷(ADMIN_CRM_PRIORITY_QUEUE_SNAPSHOT_CACHE_TAG) 직접 무효화.
 *
 * 스냅샷은 unstable_cache(인스턴스 간 공유 Data Cache)인데, 무효화는 큐 모듈 하단의 구독
 * (onLeadsMutated·onCrmTasksMutated·onContactLogsMutated)뿐이었다 — 쓰기 라우트는 큐 모듈을 import하지
 * 않으므로 쓰기가 일어난 인스턴스에는 리스너가 0개라 다른 인스턴스가 데운 스냅샷이 최대 60초 남았다.
 * 이제 리드·할 일·연락 로그 쓰기가 태그를 revalidateTag(tag, "max")로 직접 건다(구독은 유지).
 * 리드 쓰기는 지역 지도(leads.branch를 읽는다) 태그도 건다.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ revalidateTag: vi.fn() }))

vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: mocks.revalidateTag,
}))

const PRIORITY_TAG = "admin-crm-priority-queue-snapshot"
const REGION_MAP_TAG = "admin-crm-region-map"

const TASK_DB_ROW = {
  id: "task-1",
  target_type: "lead",
  target_id: "lead-1",
  target_label: "테스트 학원",
  owner_key: null,
  owner_name_snapshot: null,
  task_type: "call",
  title: "콜백",
  detail: null,
  due_at: null,
  snoozed_until: null,
  priority: "normal",
  status: "open",
  source_event_id: null,
  created_by: null,
  assigned_by: null,
  completed_at: null,
  completed_by: null,
  outcome: null,
  created_at: "2026-09-25T00:00:00.000Z",
  updated_at: "2026-09-25T00:00:00.000Z",
}

const LOG_DB_ROW = {
  id: "log-1",
  lead_id: "lead-1",
  type: "call",
  result: null,
  notes: null,
  contacted_at: "2026-09-25T00:00:00.000Z",
  contacted_by: null,
}

// insert/update/delete 체인만 흉내 내는 최소 스텁 — 테이블 이름으로 돌려줄 행을 고른다.
function supabaseStub() {
  return {
    from: (table: string) => {
      const row = table === "crm_tasks" ? TASK_DB_ROW : LOG_DB_ROW
      return {
        insert: () => ({ select: () => ({ single: async () => ({ data: row, error: null }) }) }),
        update: () => ({
          eq: () => ({ select: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }),
        }),
        delete: () => ({ eq: async () => ({ error: null }) }),
      }
    },
  }
}

function priorityCalls() {
  return mocks.revalidateTag.mock.calls.filter(([tag]) => tag === PRIORITY_TAG)
}

beforeEach(() => {
  vi.resetModules()
  mocks.revalidateTag.mockClear()
  vi.doMock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => supabaseStub() }))
  vi.doMock("@/lib/repositories/admin-users", () => ({
    findAdminCrmOwner: vi.fn(),
    listAdminUserDirectory: vi.fn().mockResolvedValue(null),
  }))
  vi.doMock("@/lib/repositories/lead-activity", () => ({ invalidateLeadsActivitySummary: vi.fn() }))
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("연락 로그 쓰기 → 우선순위 큐 스냅샷 직접 무효화", () => {
  it("addContactLog·deleteContactLog가 큐 태그를 SWR로 건다 — 구독 리스너도 그대로 부른다", async () => {
    const { addContactLog, deleteContactLog, onContactLogsMutated } = await import("@/lib/repositories/contact-logs")
    const listener = vi.fn()
    onContactLogsMutated(listener)

    await addContactLog("lead-1", { type: "call" })
    expect(priorityCalls()).toEqual([[PRIORITY_TAG, "max"]])
    expect(listener).toHaveBeenCalledTimes(1)

    mocks.revalidateTag.mockClear()
    await deleteContactLog("log-1")
    expect(priorityCalls()).toEqual([[PRIORITY_TAG, "max"]])
    expect(listener).toHaveBeenCalledTimes(2)
  })
})

describe("무효화 실패는 커밋된 쓰기를 깨뜨리지 않는다", () => {
  it("revalidateTag가 던져도 addContactLog는 저장된 로그를 돌려주고 구독 리스너도 부른다", async () => {
    const { addContactLog, onContactLogsMutated } = await import("@/lib/repositories/contact-logs")
    const listener = vi.fn()
    onContactLogsMutated(listener)
    mocks.revalidateTag.mockImplementationOnce(() => {
      throw new Error("static generation store missing")
    })
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})

    await expect(addContactLog("lead-1", { type: "call" })).resolves.toMatchObject({ id: "log-1" })
    expect(listener).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })
})

describe("할 일 쓰기 → 우선순위 큐 스냅샷 직접 무효화", () => {
  it("createCrmTask·completeCrmTask가 큐 태그를 SWR로 건다", async () => {
    const { createCrmTask, completeCrmTask } = await import("@/lib/repositories/crm-tasks")

    await createCrmTask({ title: "콜백", targetType: "lead", targetId: "lead-1" })
    expect(priorityCalls()).toEqual([[PRIORITY_TAG, "max"]])

    mocks.revalidateTag.mockClear()
    await completeCrmTask("task-1", { outcome: "완료" })
    expect(priorityCalls()).toEqual([[PRIORITY_TAG, "max"]])
  })
})

describe("리드 쓰기 → 우선순위 큐·지역 지도 직접 무효화", () => {
  it("deleteLead(리드 쓰기 공용 무효화 경로)가 큐 태그와 지역 지도 태그를 SWR로 건다", async () => {
    vi.stubEnv("USE_SUPABASE_LEADS", "true")
    const { deleteLead } = await import("@/lib/repositories/leads")

    await expect(deleteLead("lead-1")).resolves.toBe(true)

    expect(mocks.revalidateTag).toHaveBeenCalledWith(PRIORITY_TAG, "max")
    expect(mocks.revalidateTag).toHaveBeenCalledWith(REGION_MAP_TAG, "max")
  })
})

describe("순환 금지 — 쓰기 저장소는 큐 모듈을 import하지 않고 cache-tags만 본다", () => {
  const files = ["lib/repositories/contact-logs.ts", "lib/repositories/crm-tasks.ts", "lib/repositories/leads.ts"]

  it.each(files)("%s", (file) => {
    const source = readFileSync(join(process.cwd(), file), "utf8")
    expect(source).not.toContain("@/lib/repositories/crm-priority-queue")
    expect(source).toContain("ADMIN_CRM_PRIORITY_QUEUE_SNAPSHOT_CACHE_TAG")
    expect(source).toContain("@/lib/admin/crm/cache-tags")
  })
})
