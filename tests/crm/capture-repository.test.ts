import { beforeEach, describe, expect, it, vi } from "vitest"

const limit = vi.fn()
const order = vi.fn(() => ({ limit }))
const inFilter = vi.fn(() => ({ order }))
const select = vi.fn(() => ({ in: inFilter }))
const from = vi.fn(() => ({ select }))

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => ({ from })),
}))

import { OPEN_CAPTURE_BATCH_STATUSES, listOpenCaptureBatches } from "@/lib/crm/capture/repository"

function batchRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "batch-1",
    source_type: "public_event",
    source_id: null,
    source_label: "6월 세미나 참석자",
    public_event_id: "event-9",
    default_activity_type: "event_attended",
    default_task_enabled: true,
    default_task_offset_days: 1,
    raw_input_storage_path: null,
    status: "parsed",
    row_count: 12,
    event_created_count: 0,
    task_created_count: 0,
    lead_created_count: 0,
    created_by: "관리자",
    created_at: "2026-07-01T09:00:00Z",
    updated_at: "2026-07-01T09:05:00Z",
    ...overrides,
  }
}

describe("OPEN_CAPTURE_BATCH_STATUSES", () => {
  it("종결 상태(applied/canceled)는 미완료 목록에 포함되지 않는다", () => {
    expect(OPEN_CAPTURE_BATCH_STATUSES).toEqual(["draft", "parsed", "reviewed", "partial_failed"])
    expect(OPEN_CAPTURE_BATCH_STATUSES).not.toContain("applied")
    expect(OPEN_CAPTURE_BATCH_STATUSES).not.toContain("canceled")
  })
})

describe("listOpenCaptureBatches", () => {
  beforeEach(() => {
    from.mockClear()
    select.mockClear()
    inFilter.mockClear()
    order.mockClear()
    limit.mockReset()
  })

  it("미완료 상태만 최근 생성순으로 조회하고 camelCase 레코드로 매핑한다", async () => {
    limit.mockResolvedValue({ data: [batchRow()], error: null })

    const result = await listOpenCaptureBatches()

    expect(from).toHaveBeenCalledWith("crm_capture_batches")
    expect(select).toHaveBeenCalledWith("*")
    expect(inFilter).toHaveBeenCalledWith("status", OPEN_CAPTURE_BATCH_STATUSES)
    expect(order).toHaveBeenCalledWith("created_at", { ascending: false })
    expect(limit).toHaveBeenCalledWith(20)
    expect(result).toEqual([
      {
        id: "batch-1",
        sourceType: "public_event",
        sourceId: null,
        sourceLabel: "6월 세미나 참석자",
        publicEventId: "event-9",
        defaultActivityType: "event_attended",
        defaultTaskEnabled: true,
        defaultTaskOffsetDays: 1,
        status: "parsed",
        rowCount: 12,
        eventCreatedCount: 0,
        taskCreatedCount: 0,
        leadCreatedCount: 0,
        createdBy: "관리자",
        createdAt: "2026-07-01T09:00:00Z",
        updatedAt: "2026-07-01T09:05:00Z",
      },
    ])
  })

  it("limit 인자를 쿼리에 그대로 전달한다", async () => {
    limit.mockResolvedValue({ data: [], error: null })
    await listOpenCaptureBatches(5)
    expect(limit).toHaveBeenCalledWith(5)
  })

  it("data가 null이면 빈 배열을 반환한다", async () => {
    limit.mockResolvedValue({ data: null, error: null })
    await expect(listOpenCaptureBatches()).resolves.toEqual([])
  })

  it("쿼리 에러 시 메시지를 포함해 throw 한다", async () => {
    limit.mockResolvedValue({ data: null, error: { message: "rls denied" } })
    await expect(listOpenCaptureBatches()).rejects.toThrow(/미완료 배치 목록 조회 실패.*rls denied/)
  })
})
