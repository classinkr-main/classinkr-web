import { describe, expect, it } from "vitest"

import {
  C360_OVERRIDE_MS,
  addDealRow,
  addTaskRow,
  applyC360Overrides,
  nextTaskIdAfterRemoval,
  patchDealRow,
  pruneC360Overrides,
  removeTaskRow,
  restoreTaskRow,
  taskCompleteButtonId,
  type C360LocalOverride,
} from "@/components/admin/crm/drawer/c360-local-patch"
import type { Customer360 } from "@/lib/repositories/crm-customer-360"
import type { CrmDealRecord } from "@/lib/repositories/crm-deals"
import type { CrmTaskRecord } from "@/lib/repositories/crm-tasks"

// c360-03 — 드로어 쓰기의 낙관 갱신 헬퍼. 서버 응답 레코드로 행을 바로 바꾸고, 재검증 응답(SWR라
// 처리 전 행을 돌려줄 수 있음) 위에 창(C360_OVERRIDE_MS) 안의 로컬 변경을 덧씌우는 계약을 고정한다.

function makeTask(id: string, overrides: Partial<CrmTaskRecord> = {}): CrmTaskRecord {
  return {
    id,
    targetType: "lead",
    targetId: "lead-1",
    targetLabel: "테스트 학원",
    ownerKey: null,
    ownerNameSnapshot: null,
    taskType: "call",
    title: `할 일 ${id}`,
    detail: null,
    dueAt: null,
    snoozedUntil: null,
    priority: "normal",
    status: "open",
    sourceEventId: null,
    createdBy: null,
    assignedBy: null,
    completedAt: null,
    completedBy: null,
    outcome: null,
    createdAt: "2026-09-10T00:00:00.000Z",
    updatedAt: "2026-09-10T00:00:00.000Z",
    ...overrides,
  }
}

function makeDeal(id: string, overrides: Partial<CrmDealRecord> = {}): CrmDealRecord {
  return {
    id,
    targetType: "lead",
    targetId: "lead-1",
    targetLabel: "테스트 학원",
    ownerKey: null,
    ownerNameSnapshot: null,
    title: `딜 ${id}`,
    stage: "consult",
    status: "open",
    expectedAmount: 1_000_000,
    expectedCloseAt: null,
    nextTaskId: null,
    quoteRef: null,
    orderRef: null,
    riskNote: null,
    createdBy: null,
    closedAt: null,
    closedBy: null,
    createdAt: "2026-09-10T00:00:00.000Z",
    updatedAt: "2026-09-10T00:00:00.000Z",
    ...overrides,
  }
}

function make360(tasks: CrmTaskRecord[], deals: CrmDealRecord[]): Customer360 {
  return {
    tasks: {
      generatedAt: "2026-09-15T00:00:00.000Z",
      health: { ok: true, message: null },
      summary: { total: tasks.length + 3, returned: tasks.length, open: tasks.length, overdue: 0, dueToday: 0, snoozed: 0, done: 0 },
      rows: tasks,
    },
    deals: {
      generatedAt: "2026-09-15T00:00:00.000Z",
      health: { ok: true, message: null },
      summary: {
        total: deals.length,
        returned: deals.length,
        open: deals.filter((d) => d.status === "open").length,
        won: 0,
        lost: 0,
        openAmount: deals.reduce((sum, d) => sum + (d.status === "open" ? d.expectedAmount ?? 0 : 0), 0),
        noNextActionCount: 0,
        aggregateTruncated: false,
      },
      rows: deals,
    },
  } as unknown as Customer360
}

const NOW = Date.UTC(2026, 8, 15, 3, 0, 0)

describe("c360-local-patch 할 일", () => {
  it("addTaskRow는 맨 앞에 넣고 total/returned/open을 함께 올리며, 중복 id는 no-op", () => {
    const data = make360([makeTask("a")], [])
    const next = addTaskRow(data, makeTask("new"))
    expect(next.tasks.rows.map((r) => r.id)).toEqual(["new", "a"])
    expect(next.tasks.summary).toMatchObject({ total: 5, returned: 2, open: 2 })
    expect(addTaskRow(next, makeTask("new"))).toBe(next)
  })

  it("removeTaskRow는 행과 summary를 줄이고, restoreTaskRow는 원래 위치에 되돌린다", () => {
    const b = makeTask("b")
    const data = make360([makeTask("a"), b, makeTask("c")], [])
    const removed = removeTaskRow(data, "b")
    expect(removed.tasks.rows.map((r) => r.id)).toEqual(["a", "c"])
    expect(removed.tasks.summary).toMatchObject({ total: 5, returned: 2, open: 2 })
    expect(removeTaskRow(removed, "zzz")).toBe(removed)
    const restored = restoreTaskRow(removed, b, 1)
    expect(restored.tasks.rows.map((r) => r.id)).toEqual(["a", "b", "c"])
    expect(restored.tasks.summary).toMatchObject({ total: 6, returned: 3, open: 3 })
  })

  it("nextTaskIdAfterRemoval은 같은 자리(없으면 마지막) 행을 고르고, 남는 행이 없으면 null", () => {
    const rows = [makeTask("a"), makeTask("b"), makeTask("c")]
    expect(nextTaskIdAfterRemoval(rows, "a")).toBe("b")
    expect(nextTaskIdAfterRemoval(rows, "c")).toBe("b")
    expect(nextTaskIdAfterRemoval([makeTask("only")], "only")).toBeNull()
    expect(taskCompleteButtonId("x-1")).toBe("c360-task-done-x-1")
  })
})

describe("c360-local-patch 딜", () => {
  it("addDealRow는 open 딜의 openAmount를 더하고, patchDealRow는 해당 행만 바꾼다", () => {
    const data = make360([], [makeDeal("d1")])
    const added = addDealRow(data, makeDeal("d2", { expectedAmount: 250_000 }))
    expect(added.deals.rows.map((r) => r.id)).toEqual(["d2", "d1"])
    expect(added.deals.summary).toMatchObject({ total: 2, returned: 2, open: 2, openAmount: 1_250_000 })
    const patched = patchDealRow(added, "d1", { stage: "quote" })
    expect(patched.deals.rows.find((r) => r.id === "d1")?.stage).toBe("quote")
    expect(patched.deals.rows.find((r) => r.id === "d2")?.stage).toBe("consult")
    expect(patchDealRow(patched, "missing", { stage: "won" })).toBe(patched)
  })
})

describe("applyC360Overrides", () => {
  it("창 안의 로컬 변경을 서버 응답 위에 순서대로 덧씌우고, 창이 지난 항목은 버린다", () => {
    const server = make360([makeTask("done-but-echoed"), makeTask("keep")], [makeDeal("d1")])
    const overrides: C360LocalOverride[] = [
      { kind: "task_removed", id: "done-but-echoed", at: NOW - 1_000 },
      { kind: "task_added", id: "fresh", at: NOW - 1_000, record: makeTask("fresh") },
      { kind: "deal_patched", id: "d1", at: NOW - 1_000, patch: { stage: "decision" } },
      { kind: "deal_added", id: "d-old", at: NOW - C360_OVERRIDE_MS - 1, record: makeDeal("d-old") },
    ]
    const next = applyC360Overrides(server, overrides, NOW)
    expect(next.tasks.rows.map((r) => r.id)).toEqual(["fresh", "keep"])
    expect(next.deals.rows.map((r) => r.id)).toEqual(["d1"])
    expect(next.deals.rows[0].stage).toBe("decision")
    expect(pruneC360Overrides(overrides, NOW)).toHaveLength(3)
  })

  it("서버가 이미 같은 상태면 no-op이라 중복 삽입하지 않는다", () => {
    const server = make360([makeTask("fresh")], [])
    const next = applyC360Overrides(
      server,
      [{ kind: "task_added", id: "fresh", at: NOW, record: makeTask("fresh") }],
      NOW
    )
    expect(next).toBe(server)
  })
})
