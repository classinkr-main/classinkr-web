import { describe, expect, it } from "vitest"

import {
  buildCrmTaskEditPatch,
  buildCrmTaskInsert,
  buildTaskInputsFromEvent,
  defaultSnoozeUntil,
  inferTaskTypeFromTitle,
  toCrmTaskRecord,
  type CrmTaskRecord,
} from "@/lib/repositories/crm-tasks"
import { buildTaskPriorityItem } from "@/lib/crm/priority"
import type { CrmTask } from "@/lib/supabase/database.types"

const NOW = new Date("2026-06-27T05:00:00.000Z")

function makeTaskRecord(overrides: Partial<CrmTaskRecord> = {}): CrmTaskRecord {
  return {
    id: "t1",
    targetType: "lead",
    targetId: "lead-1",
    targetLabel: "테스트 학원",
    ownerKey: "owner-a",
    ownerNameSnapshot: "김지사",
    taskType: "call",
    title: "첫 응대 전화",
    detail: null,
    dueAt: null,
    snoozedUntil: null,
    priority: "normal",
    status: "open",
    sourceEventId: null,
    createdBy: "김지사",
    assignedBy: "김지사",
    completedAt: null,
    completedBy: null,
    outcome: null,
    createdAt: "2026-06-20T00:00:00.000Z",
    updatedAt: "2026-06-26T00:00:00.000Z",
    ...overrides,
  }
}

describe("CRM tasks", () => {
  it("normalizes a quick task into a durable insert with safe defaults", () => {
    const insert = buildCrmTaskInsert({
      targetType: "lead",
      targetId: "lead-1",
      targetLabel: "테스트 학원",
      ownerKey: "  owner-a  ",
      ownerNameSnapshot: "김지사",
      taskType: "call",
      title: "  첫 응대 전화  ",
      dueAt: "2026-06-28T00:00:00.000Z",
      priority: "high",
      createdBy: "김지사",
      assignedBy: "김지사",
    })

    expect(insert).toMatchObject({
      target_type: "lead",
      target_id: "lead-1",
      target_label: "테스트 학원",
      owner_key: "owner-a",
      owner_name_snapshot: "김지사",
      task_type: "call",
      title: "첫 응대 전화",
      priority: "high",
      status: "open",
      due_at: "2026-06-28T00:00:00.000Z",
    })
    expect(insert.completed_at).toBeNull()
    expect(insert.snoozed_until).toBeNull()
  })

  it("falls back to safe title/type/priority for sparse input and invalid enums", () => {
    const insert = buildCrmTaskInsert({
      title: "   ",
      taskType: "bogus" as never,
      priority: "wat" as never,
      dueAt: "not-a-date",
    })

    expect(insert.title).toBe("제목 없는 CRM 할 일")
    expect(insert.task_type).toBe("call")
    expect(insert.priority).toBe("normal")
    expect(insert.target_type).toBe("unknown")
    expect(insert.due_at).toBeNull()
  })

  it("snoozes to tomorrow 09:00 KST (00:00 UTC the next day)", () => {
    expect(defaultSnoozeUntil(new Date("2026-06-27T05:00:00.000Z"))).toBe("2026-06-28T00:00:00.000Z")
    // 23:30 UTC is already 08:30 KST next day, so 'tomorrow' is two UTC days ahead.
    expect(defaultSnoozeUntil(new Date("2026-06-27T23:30:00.000Z"))).toBe("2026-06-29T00:00:00.000Z")
  })

  it("only patches fields explicitly provided in an edit", () => {
    expect(buildCrmTaskEditPatch({ title: "수정된 제목" })).toEqual({ title: "수정된 제목" })
    expect(buildCrmTaskEditPatch({ detail: "  ", dueAt: null })).toEqual({ detail: null, due_at: null })
    expect(buildCrmTaskEditPatch({})).toEqual({})
  })

  it("maps a db row into a camelCase record", () => {
    const row: CrmTask = {
      id: "task-1",
      target_type: "neo_account",
      target_id: "acc-9",
      target_label: "큰학원",
      owner_key: "owner-a",
      owner_name_snapshot: "김지사",
      task_type: "renewal",
      title: "갱신 상담",
      detail: null,
      due_at: "2026-07-01T00:00:00.000Z",
      snoozed_until: null,
      priority: "urgent",
      status: "open",
      source_event_id: "evt-3",
      created_by: "김지사",
      assigned_by: "김지사",
      completed_at: null,
      completed_by: null,
      outcome: null,
      created_at: "2026-06-27T00:00:00.000Z",
      updated_at: "2026-06-27T00:00:00.000Z",
    }

    expect(toCrmTaskRecord(row)).toMatchObject({
      id: "task-1",
      targetType: "neo_account",
      ownerKey: "owner-a",
      taskType: "renewal",
      priority: "urgent",
      sourceEventId: "evt-3",
    })
  })
})

describe("inferTaskTypeFromTitle", () => {
  it("maps Korean next-action phrasing to task types", () => {
    expect(inferTaskTypeFromTitle("견적서 발송")).toBe("quote")
    expect(inferTaskTypeFromTitle("데모 일정 확정")).toBe("demo")
    expect(inferTaskTypeFromTitle("설치 일정 잡기")).toBe("install")
    expect(inferTaskTypeFromTitle("갱신 상담 진행")).toBe("renewal")
    expect(inferTaskTypeFromTitle("원장님과 미팅")).toBe("meeting")
    expect(inferTaskTypeFromTitle("카톡으로 안내")).toBe("kakao")
    expect(inferTaskTypeFromTitle("전화 콜백")).toBe("call")
    expect(inferTaskTypeFromTitle("뭔가 막연한 일")).toBe("other")
    expect(inferTaskTypeFromTitle("")).toBe("other")
  })
})

describe("buildTaskInputsFromEvent", () => {
  const event = {
    id: "evt-1",
    targetType: "lead" as const,
    targetId: "lead-7",
    targetLabel: "테스트 학원",
    ownerName: "김지사",
    nextActions: [
      { title: "견적서 발송", ownerName: "이매니저", dueAt: "2026-06-30T00:00:00.000Z", done: false },
      { title: "이미 끝난 일", done: true },
      { title: "   ", done: false },
    ],
  }

  it("promotes only open, non-empty next actions and threads the source event + target", () => {
    const inputs = buildTaskInputsFromEvent(event, { createdBy: "김지사" })
    expect(inputs).toHaveLength(1)
    expect(inputs[0]).toMatchObject({
      targetType: "lead",
      targetId: "lead-7",
      targetLabel: "테스트 학원",
      title: "견적서 발송",
      taskType: "quote",
      ownerNameSnapshot: "이매니저",
      dueAt: "2026-06-30T00:00:00.000Z",
      sourceEventId: "evt-1",
      createdBy: "김지사",
      assignedBy: "김지사",
    })
  })

  it("falls back to the event owner when a next action has no owner", () => {
    const inputs = buildTaskInputsFromEvent(
      { ...event, nextActions: [{ title: "후속 통화", done: false }] },
      { createdBy: "김지사" }
    )
    expect(inputs[0]?.ownerNameSnapshot).toBe("김지사")
    expect(inputs[0]?.taskType).toBe("call")
  })

  it("returns nothing when there are no actionable next actions", () => {
    expect(buildTaskInputsFromEvent({ ...event, nextActions: [] })).toEqual([])
  })
})

describe("buildTaskPriorityItem", () => {
  it("puts overdue tasks in the today bucket with a delay reason", () => {
    const item = buildTaskPriorityItem(
      makeTaskRecord({ dueAt: "2026-06-25T05:00:00.000Z" }),
      NOW
    )
    expect(item).toMatchObject({
      source: "task",
      bucket: "today",
      action: "do_task",
      actionLabel: "전화",
      reason: "2일 지연된 할 일",
      ownerKeys: ["owner-a", "김지사"],
    })
    expect(item?.href).toBe("/admin/crm/customers/leads?lead=lead-1")
  })

  it("marks due-today tasks as 오늘 마감 in the today bucket", () => {
    const item = buildTaskPriorityItem(makeTaskRecord({ dueAt: "2026-06-27T23:00:00.000Z" }), NOW)
    expect(item?.bucket).toBe("today")
    expect(item?.reason).toBe("오늘 마감")
  })

  it("keeps far-future and undated normal tasks in the watch bucket", () => {
    expect(buildTaskPriorityItem(makeTaskRecord({ dueAt: "2026-07-10T00:00:00.000Z" }), NOW)?.bucket).toBe("watch")
    expect(buildTaskPriorityItem(makeTaskRecord({ dueAt: null }), NOW)?.bucket).toBe("watch")
  })

  it("floats undated urgent tasks into today", () => {
    expect(buildTaskPriorityItem(makeTaskRecord({ dueAt: null, priority: "urgent" }), NOW)?.bucket).toBe("today")
  })

  it("hides snoozed tasks until they resurface, then shows them", () => {
    expect(
      buildTaskPriorityItem(
        makeTaskRecord({ status: "snoozed", snoozedUntil: "2026-06-28T00:00:00.000Z" }),
        NOW
      )
    ).toBeNull()
    const resurfaced = buildTaskPriorityItem(
      makeTaskRecord({ status: "snoozed", snoozedUntil: "2026-06-27T00:00:00.000Z" }),
      NOW
    )
    expect(resurfaced?.statusLabel).toBe("미룬 할 일")
    expect(resurfaced?.bucket).toBe("today")
  })

  it("drops done and canceled tasks", () => {
    expect(buildTaskPriorityItem(makeTaskRecord({ status: "done" }), NOW)).toBeNull()
    expect(buildTaskPriorityItem(makeTaskRecord({ status: "canceled" }), NOW)).toBeNull()
  })

  it("routes neo_account tasks to the accounts surface and unknown tasks to activity", () => {
    expect(
      buildTaskPriorityItem(makeTaskRecord({ targetType: "neo_account", targetId: "acc-9" }), NOW)?.href
    ).toBe("/admin/crm/customers/accounts?account=acc-9")
    expect(
      buildTaskPriorityItem(makeTaskRecord({ targetType: "unknown", targetId: null }), NOW)?.href
    ).toBe("/admin/crm/activity")
  })
})
