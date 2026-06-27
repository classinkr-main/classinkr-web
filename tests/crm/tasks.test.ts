import { describe, expect, it } from "vitest"

import {
  buildCrmTaskEditPatch,
  buildCrmTaskInsert,
  defaultSnoozeUntil,
  toCrmTaskRecord,
} from "@/lib/repositories/crm-tasks"
import type { CrmTask } from "@/lib/supabase/database.types"

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
