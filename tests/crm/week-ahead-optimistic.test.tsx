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

import { readFileSync } from "node:fs"
import { join } from "node:path"

import CrmWeekAheadPanel, {
  WEEK_AHEAD_UNDO_WINDOW_MS,
  buildDueAtRestoreBody,
  focusTargetAfterTaskRemoval,
  patchTaskRow,
  removeTaskRow,
  restoreTaskRow,
  snoozeUndoRestoredMessage,
  visibleTaskOrder,
} from "@/components/admin/crm/CrmWeekAheadPanel"
import { classifyTaskBucket } from "@/lib/crm/week-ahead"
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

// 기한 없던 할 일의 '내일로' 되돌리기(crm-tab-develop-plan §10 후속, 2026-09-21) — 서버 update가
// dueAt: null을 "기한 지움"으로 받게 되면서 클라이언트도 null을 실제로 보내야 한다.
describe("CrmWeekAheadPanel 미루기 되돌리기 — 기한 복원", () => {
  it("원래 기한이 없던 할 일은 dueAt: null을 JSON 바디에 명시해 보낸다(undefined로 키가 빠지지 않게)", () => {
    const body = buildDueAtRestoreBody(makeTask("a", { dueAt: null }))
    expect(body).toEqual({ action: "update", dueAt: null })
    const wire = JSON.parse(JSON.stringify(body)) as Record<string, unknown>
    expect(wire).toHaveProperty("dueAt", null)
  })

  it("원래 기한이 있던 할 일은 그 기한을 그대로 보낸다", () => {
    const dueAt = "2026-09-14T00:00:00.000Z"
    expect(buildDueAtRestoreBody(makeTask("a", { dueAt }))).toEqual({ action: "update", dueAt })
  })

  it("복원된 행은 기한 없음 버킷으로 돌아가고, 문구도 기한 없음으로 돌아갔다고 밝힌다", () => {
    const original = makeTask("a", { dueAt: null, title: "견적 회신" })
    const restored = { ...original, dueAt: buildDueAtRestoreBody(original).dueAt }
    expect(classifyTaskBucket(restored, NOW)).toBe("nodue")

    const message = snoozeUndoRestoredMessage(original)
    expect(message).toContain("'견적 회신' 미루기를 되돌렸습니다")
    expect(message).toContain("기한 없는 할 일")
    expect(message).not.toContain("내일 오전 9시로 남")
  })

  it("기한이 있던 할 일의 문구는 복원한 기한을 말한다", () => {
    const message = snoozeUndoRestoredMessage(makeTask("a", { dueAt: "2026-09-14T00:00:00.000Z", title: "데모" }))
    expect(message).toContain("'데모' 미루기를 되돌렸습니다 — 기한 ")
    expect(message).toContain("로 복원.")
  })

  it("되돌리기 흐름은 기한 유무와 무관하게 미루기면 항상 기한 복원 단계를 탄다(소스 계약)", () => {
    const source = readFileSync(join(process.cwd(), "components/admin/crm/CrmWeekAheadPanel.tsx"), "utf8").replace(
      /\r\n/g,
      "\n"
    )
    // 이전 결함: 기한 없는 할 일은 복원 단계를 건너뛰어 기한이 내일 09:00으로 남았다.
    expect(source).not.toContain("if (!task.dueAt) return")
    expect(source).not.toContain('action === "snooze" && task.dueAt')
    expect(source).toContain('if (action === "snooze") {\n        await restoreTaskDueAt(task, reopened)')
    // 복원 PATCH는 buildDueAtRestoreBody로만 만든다(null 명시가 한 곳에서 보장되도록).
    expect(source).toContain("const body = buildDueAtRestoreBody(task)")
    expect(source).toContain('adminFetchJson(taskUrl, { method: "PATCH", body: JSON.stringify(body) })')
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
