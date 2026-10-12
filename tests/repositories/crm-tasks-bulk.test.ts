import { beforeEach, describe, expect, it, vi } from "vitest"

// 세그먼트 일괄 할 일(SG7) 저장소 — 실제 createCrmTask(lib/repositories/crm-tasks.ts)를 태워
// 할 일 Data Cache 태그 무효화(revalidateTag("admin-crm-tasks"))까지 함께 고정한다.
//  - 같은 대상 + 같은 제목(공백·대소문자 무시)의 열린 할 일(open·snoozed)이 있으면 skipped.
//  - 대상별 생성은 독립 — 실패한 대상은 failed 로 모으고 나머지는 만든다.
//  - 대상 이름(target_label)은 fail-soft 로 채운다. 리드는 기관명·이름만(연락처 복제 금지).
//  - 사전 조회 실패는 던진다(중복 판정 없이 만들지 않는다), 테이블 부재는 not-ready 로 던진다.

const mocks = vi.hoisted(() => ({
  revalidateTag: vi.fn(),
}))

vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
  revalidateTag: mocks.revalidateTag,
}))

vi.mock("@/lib/repositories/admin-users", () => ({
  findAdminCrmOwner: vi.fn(),
  listAdminUserDirectory: vi.fn().mockResolvedValue(null),
}))

type Row = Record<string, unknown>

let tables: Record<string, Row[]> = {}
let taskSeq = 1
let insertedTasks: Row[] = []
let tasksSelectError: { message: string; code?: string } | null = null
let labelSelectError: Record<string, { message: string }> = {}
let insertFailFor: ((row: Row) => { message: string; code?: string } | null) | null = null
let taskRangeCalls: Array<{ from: number; to: number; filters: Array<[string, string, unknown]> }> = []

function queryBuilder(table: string, options?: { count?: string }) {
  const filters: Array<[string, string, unknown]> = []
  const run = (from?: number, to?: number) => {
    if (table === "crm_tasks" && tasksSelectError) return { data: null, error: tasksSelectError, count: null }
    if (labelSelectError[table]) return { data: null, error: labelSelectError[table], count: null }
    const matched = (tables[table] ?? []).filter((row) =>
      filters.every(([op, field, value]) =>
        op === "eq" ? row[field] === value : (value as unknown[]).includes(row[field])
      )
    )
    const data = from === undefined ? matched : matched.slice(from, (to ?? matched.length) + 1)
    return { data, error: null, count: options?.count === "exact" ? matched.length : null }
  }
  const builder = {
    eq(field: string, value: unknown) {
      filters.push(["eq", field, value])
      return builder
    },
    in(field: string, values: unknown[]) {
      filters.push(["in", field, values])
      return builder
    },
    order() {
      return builder
    },
    async range(from: number, to: number) {
      if (table === "crm_tasks") taskRangeCalls.push({ from, to, filters: [...filters] })
      return run(from, to)
    },
    then(onFulfilled: (value: ReturnType<typeof run>) => unknown, onRejected?: (reason: unknown) => unknown) {
      return Promise.resolve(run()).then(onFulfilled, onRejected)
    },
  }
  return builder
}

const from = vi.fn((table: string) => ({
  select: (_columns: string, options?: { count?: string }) => queryBuilder(table, options),
  insert: (row: Row) => ({
    select: () => ({
      async single() {
        const failure = insertFailFor?.(row) ?? null
        if (failure) return { data: null, error: failure }
        const stored = {
          ...row,
          id: `task-${taskSeq++}`,
          created_at: "2026-09-25T00:00:00.000Z",
          updated_at: "2026-09-25T00:00:00.000Z",
        }
        insertedTasks.push(stored)
        ;(tables.crm_tasks ??= []).push(stored)
        return { data: stored, error: null }
      },
    }),
  }),
}))

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => ({ from })),
}))

import { createCrmTasksForTargets } from "@/lib/repositories/crm-tasks-bulk"
import { isCrmTasksNotReadyError } from "@/lib/repositories/crm-tasks"

const LEAD_A = "11111111-1111-4111-8111-111111111111"
const LEAD_B = "22222222-2222-4222-8222-222222222222"
const CUSTOMER_C = "33333333-3333-4333-8333-333333333333"

const leadTarget = (id: string) => ({ key: `lead:${id}`, targetType: "lead" as const, targetId: id })
const neoTarget = (id: string) => ({ key: `neo:${id}`, targetType: "neo_account" as const, targetId: id })
const customerTarget = (id: string) => ({ key: `customer:${id}`, targetType: "customer" as const, targetId: id })

function existingTask(targetType: string, targetId: string, title: string, status = "open"): Row {
  return { id: `existing-${targetId}-${status}`, target_type: targetType, target_id: targetId, title, status }
}

beforeEach(() => {
  tables = {
    crm_tasks: [],
    leads: [
      { id: LEAD_A, org: "가온학원", name: "김원장", email: "a@example.com", phone: "010-1111-2222" },
      { id: LEAD_B, org: null, name: null, email: "b@example.com", phone: "010-3333-4444" },
    ],
    customers: [{ id: CUSTOMER_C, name: "나래교육", campus_name: "분당캠퍼스" }],
    crm_neo_customer_snapshots: [{ source_system: "xiaoshouyi", account_id: "acc-1", account_name: "다온에듀" }],
  }
  taskSeq = 1
  insertedTasks = []
  tasksSelectError = null
  labelSelectError = {}
  insertFailFor = null
  taskRangeCalls = []
  mocks.revalidateTag.mockClear()
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.spyOn(console, "warn").mockImplementation(() => {})
})

describe("createCrmTasksForTargets", () => {
  it("대상마다 할 일 하나를 만들고, 작성자·기한·메모·유형·대상 이름을 채운다", async () => {
    const result = await createCrmTasksForTargets({
      targets: [leadTarget(LEAD_A), neoTarget("acc-1"), customerTarget(CUSTOMER_C)],
      title: "  갱신 안내 드리기 ",
      dueAt: "2026-09-30T00:00:00.000Z",
      note: " 9월 만료 대상 ",
      createdBy: "김매니저",
    })

    expect(result).toEqual({ created: 3, skipped: 0, failed: [] })
    expect(insertedTasks.map((row) => [row.target_type, row.target_id, row.target_label])).toEqual(
      expect.arrayContaining([
        ["lead", LEAD_A, "가온학원"],
        ["neo_account", "acc-1", "다온에듀"],
        ["customer", CUSTOMER_C, "나래교육 · 분당캠퍼스"],
      ])
    )
    for (const row of insertedTasks) {
      expect(row).toMatchObject({
        title: "갱신 안내 드리기",
        detail: "9월 만료 대상",
        due_at: "2026-09-30T00:00:00.000Z",
        task_type: "renewal",
        priority: "normal",
        status: "open",
        owner_key: null,
        created_by: "김매니저",
        assigned_by: "김매니저",
      })
    }
  })

  it("건별 생성이 할 일 캐시 태그를 무효화한다(createCrmTask 경유)", async () => {
    await createCrmTasksForTargets({ targets: [leadTarget(LEAD_A), leadTarget(LEAD_B)], title: "전화" })
    // 할 일 목록 태그는 대상마다 한 번씩(다른 소비자 태그는 crm-tasks.ts 소관이라 세지 않는다).
    const taskTagCalls = mocks.revalidateTag.mock.calls.filter(([tag]) => tag === "admin-crm-tasks")
    expect(taskTagCalls).toEqual([
      ["admin-crm-tasks", "max"],
      ["admin-crm-tasks", "max"],
    ])
  })

  it("키워드 없는 제목은 call 유형, 기한·메모가 없으면 null", async () => {
    await createCrmTasksForTargets({ targets: [leadTarget(LEAD_A)], title: "후속 확인" })
    expect(insertedTasks[0]).toMatchObject({ task_type: "call", due_at: null, detail: null, created_by: null })
  })

  it("리드 이름이 없으면 연락처를 라벨로 복제하지 않고 비워 둔다", async () => {
    await createCrmTasksForTargets({ targets: [leadTarget(LEAD_B)], title: "전화" })
    expect(insertedTasks[0].target_label).toBeNull()
  })

  it("같은 대상에 같은 제목(공백·대소문자 무시)의 열린·미룬 할 일이 있으면 skipped", async () => {
    tables.crm_tasks = [
      existingTask("lead", LEAD_A, "Call  Back"),
      existingTask("neo_account", "acc-1", "call back", "snoozed"),
      // 완료·취소된 같은 제목, 다른 제목, 다른 대상 타입의 같은 id 는 막지 않는다.
      existingTask("customer", CUSTOMER_C, "call back", "done"),
      existingTask("lead", LEAD_B, "다른 할 일"),
    ]
    const result = await createCrmTasksForTargets({
      targets: [leadTarget(LEAD_A), neoTarget("acc-1"), customerTarget(CUSTOMER_C), leadTarget(LEAD_B)],
      title: "call back",
    })
    expect(result).toEqual({ created: 2, skipped: 2, failed: [] })
    expect(insertedTasks.map((row) => row.target_id).sort()).toEqual([CUSTOMER_C, LEAD_B].sort())
    // 사전 조회는 열린(open·snoozed) 상태만 대상 타입별로 좁혀 읽는다.
    for (const call of taskRangeCalls) {
      expect(call.filters).toContainEqual(["in", "status", ["open", "snoozed"]])
    }
  })

  it("같은 대상이 두 번 들어와도 한 번만 만든다", async () => {
    const result = await createCrmTasksForTargets({ targets: [leadTarget(LEAD_A), leadTarget(LEAD_A)], title: "전화" })
    expect(result).toEqual({ created: 1, skipped: 0, failed: [] })
  })

  it("일부 생성이 실패하면 그 대상 키만 failed(요청 순서)로 모으고 나머지는 만든다", async () => {
    insertFailFor = (row) => (row.target_id === "acc-1" || row.target_id === CUSTOMER_C ? { message: "insert boom" } : null)
    const result = await createCrmTasksForTargets({
      targets: [leadTarget(LEAD_A), neoTarget("acc-1"), leadTarget(LEAD_B), customerTarget(CUSTOMER_C)],
      title: "전화",
    })
    expect(result).toEqual({ created: 2, skipped: 0, failed: ["neo:acc-1", `customer:${CUSTOMER_C}`] })
  })

  it("대상 이름 조회가 실패해도 라벨 없이 만든다(fail-soft)", async () => {
    labelSelectError = { leads: { message: "leads boom" } }
    const result = await createCrmTasksForTargets({ targets: [leadTarget(LEAD_A), neoTarget("acc-1")], title: "전화" })
    expect(result.created).toBe(2)
    const byTarget = Object.fromEntries(insertedTasks.map((row) => [row.target_id, row.target_label]))
    expect(byTarget).toEqual({ [LEAD_A]: null, "acc-1": "다온에듀" })
  })

  it("사전 조회가 실패하면 만들지 않고 던진다", async () => {
    tasksSelectError = { message: "read boom" }
    await expect(createCrmTasksForTargets({ targets: [leadTarget(LEAD_A)], title: "전화" })).rejects.toThrow("read boom")
    expect(insertedTasks).toEqual([])
  })

  it("crm_tasks 테이블이 없으면 not-ready 오류로 던진다(라우트 503)", async () => {
    tasksSelectError = { message: 'relation "public.crm_tasks" does not exist', code: "42P01" }
    const error = await createCrmTasksForTargets({ targets: [leadTarget(LEAD_A)], title: "전화" }).catch((e) => e)
    expect(isCrmTasksNotReadyError(error)).toBe(true)
  })

  it("대상 id 를 100개 단위로 나눠 사전 조회한다(URL 길이)", async () => {
    const targets = Array.from({ length: 150 }, (_, i) => neoTarget(`acc-${i}`))
    const result = await createCrmTasksForTargets({ targets, title: "전화" })
    expect(result.created).toBe(150)
    const idChunks = taskRangeCalls
      .filter((call) => call.from === 0)
      .map((call) => (call.filters.find(([op, field]) => op === "in" && field === "target_id")?.[2] as unknown[]).length)
    expect(idChunks).toEqual([100, 50])
  })
})
