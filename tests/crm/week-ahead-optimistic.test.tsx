import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/admin-client", () => ({
  adminFetchJsonCached: vi.fn(() => new Promise(() => undefined)),
  adminFetchJson: vi.fn(async () => null),
  getCachedAdminJson: vi.fn(() => null),
}))
vi.mock("@/components/admin/crm/useCrmOwners", () => ({
  useCrmOwners: () => ({ owners: [], currentOwner: null, health: null }),
  buildOwnerSelectOptions: () => [],
}))

import CrmWeekAheadPanel, {
  WEEK_AHEAD_UNDO_WINDOW_MS,
  focusTargetAfterTaskRemoval,
  patchTaskRow,
  removeTaskRow,
  restoreTaskRow,
  visibleTaskOrder,
} from "@/components/admin/crm/CrmWeekAheadPanel"
import type { CrmTaskRecord, ListCrmTasksResult } from "@/lib/repositories/crm-tasks"

const NOW = Date.UTC(2026, 8, 15, 3, 0, 0) // 2026-09-15 12:00 KST

function makeTask(id: string, overrides: Partial<CrmTaskRecord> = {}): CrmTaskRecord {
  return {
    id,
    targetType: "lead",
    targetId: null,
    targetLabel: "테스트 학원",
    ownerKey: "kim",
    ownerNameSnapshot: "김담당",
    taskType: "call",
    title: `할 일 ${id}`,
    detail: null,
    dueAt: new Date(NOW + 60 * 60 * 1000).toISOString(), // 오늘
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
  } as CrmTaskRecord
}

function makeResult(rows: CrmTaskRecord[], total = rows.length): ListCrmTasksResult {
  return {
    generatedAt: "2026-09-15T03:00:00.000Z",
    health: { ok: true, message: null },
    summary: { total, returned: rows.length, open: rows.length, overdue: 0, dueToday: rows.length, snoozed: 0 },
    rows,
  } as ListCrmTasksResult
}

describe("CrmWeekAheadPanel 낙관 갱신 헬퍼", () => {
  it("removeTaskRow는 행과 summary.total/returned를 함께 줄인다", () => {
    const data = makeResult([makeTask("a"), makeTask("b")], 10)
    const next = removeTaskRow(data, "a")
    expect(next?.rows.map((row) => row.id)).toEqual(["b"])
    expect(next?.summary.total).toBe(9)
    expect(next?.summary.returned).toBe(1)
    expect(removeTaskRow(data, "zzz")).toBe(data)
  })

  it("patchTaskRow는 해당 행만 바꾸고, restoreTaskRow는 원본으로 교체하거나 다시 넣는다", () => {
    const a = makeTask("a")
    const data = makeResult([a, makeTask("b")])
    const snoozed = patchTaskRow(data, "a", { status: "snoozed" })
    expect(snoozed?.rows[0].status).toBe("snoozed")
    expect(snoozed?.rows[1].status).toBe("open")
    expect(restoreTaskRow(snoozed, a)?.rows[0]).toEqual(a)
    const removed = removeTaskRow(data, "a")
    const restored = restoreTaskRow(removed, a)
    expect(restored?.rows.map((row) => row.id)).toEqual(["b", "a"])
    expect(restored?.summary.total).toBe(2)
  })

  it("focusTargetAfterTaskRemoval은 버킷 순·예산 순서에서 같은 자리의 다음 행을 고른다", () => {
    const overdue = makeTask("late", { dueAt: new Date(NOW - 2 * 24 * 60 * 60 * 1000).toISOString() })
    const rows = [makeTask("a"), overdue, makeTask("b")]
    expect(visibleTaskOrder(rows, null, NOW)).toEqual(["late", "a", "b"])
    expect(focusTargetAfterTaskRemoval(rows, "late", null, NOW)).toBe("a")
    expect(focusTargetAfterTaskRemoval(rows, "b", null, NOW)).toBe("a")
    expect(focusTargetAfterTaskRemoval([overdue], "late", null, NOW)).toBeNull()
    // 예산(1행)으로 접혀 있으면 보이는 행 안에서만 고른다
    expect(focusTargetAfterTaskRemoval(rows, "late", 1, NOW)).toBe("a")
  })

  it("되돌리기 창은 8초", () => {
    expect(WEEK_AHEAD_UNDO_WINDOW_MS).toBe(8_000)
  })
})

describe("CrmWeekAheadPanel 콜드 렌더", () => {
  it("로딩은 스켈레톤으로 그리고 '할 일 없음'·#B85C33 리터럴을 쓰지 않는다", () => {
    const html = renderToStaticMarkup(<CrmWeekAheadPanel compact />)
    expect(html).toContain("animate-pulse")
    expect(html).not.toContain("열린 할 일이 없습니다")
    expect(html).not.toContain("불러오는 중입니다")
    expect(html).not.toContain("#B85C33")
    expect(html).toMatch(/<p role="status" aria-live="polite" class="sr-only">/)
    // 섹션 heading은 처리 뒤 포커스 착지점(tabIndex=-1)
    expect(html).toMatch(/<h2 tabindex="-1"[^>]*>이번 주 해야 할 일<\/h2>/)
  })
})
