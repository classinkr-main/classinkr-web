/**
 * lib/repositories/crm-tasks.ts listCrmTasksDueForToday — 현황 "오늘 연락"의 할 일 원천(교차 리뷰 [13], 2026-09-26).
 * 후보 풀 listCrmTasks(active, 상한 200)가 세그먼트 "오늘 연락에 넣기" 한 번으로 지난·오늘 할 일과 기한 없는 긴급 할 일을
 * 절단 표시 없이 떨어뜨리던 결함 — 오늘 대상 할 일을 range 페이지네이션(created_at·id 전순서, 받은 행 수만큼 전진)으로
 * 따로 전량 읽고, 상한에 닿으면 truncated 로 알린다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

function taskRow(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    target_type: "lead",
    target_id: "L1",
    target_label: null,
    owner_key: null,
    owner_name_snapshot: null,
    task_type: "call",
    title: id,
    detail: null,
    due_at: "2026-09-25T09:00:00.000Z",
    snoozed_until: null,
    priority: "normal",
    status: "open",
    source_event_id: null,
    created_by: null,
    assigned_by: null,
    completed_at: null,
    completed_by: null,
    outcome: null,
    created_at: "2026-09-20T00:00:00.000Z",
    updated_at: "2026-09-20T00:00:00.000Z",
    ...overrides,
  }
}

function recordingQuery(pages: Array<{ data: unknown[] | null; error?: unknown; count?: number | null }>) {
  const calls: Array<[string, unknown[]]> = []
  let page = 0
  const query: Record<string, unknown> = {}
  for (const name of ["select", "in", "or", "order"]) {
    query[name] = (...args: unknown[]) => {
      calls.push([name, args])
      return query
    }
  }
  query.range = async (...args: unknown[]) => {
    calls.push(["range", args])
    const next = pages[Math.min(page, pages.length - 1)]
    page += 1
    return { data: next.data, error: next.error ?? null, count: next.count ?? null }
  }
  return { calls, query }
}

beforeEach(() => {
  vi.resetModules()
  vi.doMock("next/cache", () => ({ revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }))
  vi.doMock("@/lib/repositories/admin-users", () => ({ findAdminCrmOwner: vi.fn(), listAdminUserDirectory: vi.fn() }))
})

describe("listCrmTasksDueForToday", () => {
  it("활성 할 일 중 오늘 끝 전 기한·미룬 기한 · 기한 없는 긴급·높음 · 오늘 수정을 created_at·id 순 range 로 읽는다", async () => {
    const { calls, query } = recordingQuery([{ data: [taskRow("T1"), taskRow("U1", { due_at: null, priority: "urgent" })], count: 2 }])
    vi.doMock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ from: () => query }) }))
    const { listCrmTasksDueForToday } = await import("@/lib/repositories/crm-tasks")
    const result = await listCrmTasksDueForToday("2026-09-24T15:00:00.000Z", "2026-09-25T14:59:59.999Z")
    expect(result).toMatchObject({ health: { ok: true }, truncated: false })
    expect(result.rows.map((row) => row.id)).toEqual(["T1", "U1"])
    expect(calls).toContainEqual(["in", ["status", ["open", "snoozed"]]])
    expect(calls).toContainEqual([
      "or",
      [
        'due_at.lt."2026-09-25T14:59:59.999Z",snoozed_until.lt."2026-09-25T14:59:59.999Z",and(due_at.is.null,priority.in.(urgent,high)),updated_at.gte."2026-09-24T15:00:00.000Z"',
      ],
    ])
    expect(calls.filter(([name]) => name === "order").map(([, args]) => args[0])).toEqual(["created_at", "id"])
    expect(calls).toContainEqual(["range", [0, 999]])
  })

  it("상한에 닿으면 truncated — 받은 만큼만(200건 절단을 '전체'라 부르지 않는다)", async () => {
    const rows = Array.from({ length: 3 }, (_, index) => taskRow(`T${index}`))
    const { query } = recordingQuery([{ data: rows, count: 250 }])
    vi.doMock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ from: () => query }) }))
    const { listCrmTasksDueForToday } = await import("@/lib/repositories/crm-tasks")
    const result = await listCrmTasksDueForToday("2026-09-24T15:00:00.000Z", "2026-09-25T14:59:59.999Z", { maxRows: 3 })
    expect(result.rows).toHaveLength(3)
    expect(result.truncated).toBe(true)
  })

  it("받은 행 수만큼 전진한다(서버 max-rows 클램프에도 중간 행을 건너뛰지 않는다)", async () => {
    const { calls, query } = recordingQuery([
      { data: [taskRow("T1"), taskRow("T2")], count: 3 },
      { data: [taskRow("T3")] },
    ])
    vi.doMock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ from: () => query }) }))
    const { listCrmTasksDueForToday } = await import("@/lib/repositories/crm-tasks")
    const result = await listCrmTasksDueForToday("2026-09-24T15:00:00.000Z", "2026-09-25T14:59:59.999Z")
    expect(result.rows.map((row) => row.id)).toEqual(["T1", "T2", "T3"])
    expect(calls.filter(([name]) => name === "range").map(([, args]) => args)).toEqual([
      [0, 999],
      [2, 2],
    ])
    expect(result.truncated).toBe(false)
  })

  it("테이블 미적용은 health.ok=false(던지지 않음) · 그 밖의 오류와 잘못된 범위는 던진다", async () => {
    const missing = recordingQuery([{ data: null, error: { code: "42P01", message: "relation crm_tasks does not exist" } }])
    vi.doMock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ from: () => missing.query }) }))
    const { listCrmTasksDueForToday } = await import("@/lib/repositories/crm-tasks")
    await expect(listCrmTasksDueForToday("2026-09-24T15:00:00.000Z", "2026-09-25T14:59:59.999Z")).resolves.toMatchObject({
      rows: [],
      health: { ok: false },
    })
    await expect(listCrmTasksDueForToday("nope", "2026-09-25T14:59:59.999Z")).rejects.toThrow()

    vi.resetModules()
    const broken = recordingQuery([{ data: null, error: { code: "57014", message: "statement timeout" } }])
    vi.doMock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ from: () => broken.query }) }))
    const fresh = await import("@/lib/repositories/crm-tasks")
    await expect(fresh.listCrmTasksDueForToday("2026-09-24T15:00:00.000Z", "2026-09-25T14:59:59.999Z")).rejects.toThrow(
      "오늘 할 일 조회 실패"
    )
  })
})
