/**
 * 현황 "오늘 연락"(C안 ①)이 기대는 작은 변경들의 계약:
 *  - contactEventTitle: 계정 결과 기록 제목(결과는 call·sms 만) — 리드 미러 제목은 그대로.
 *  - hasInflowStamp export · isReinflowAwaitingContact 백필 게이트(timestamp 를 넘길 때만).
 *  - crm_customer_events 쓰기가 오늘 연락 캐시 태그를 SWR 로 무효화(생성·getOrCreate 신규·원천 삭제).
 *  - listCrmTasksClosedSince: 완료·취소 + completed_at ≥ since, completed_at·id 전순서 range.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

import { contactEventTitle, leadContactEventTitle } from "@/lib/crm/lead-contact-event"
import { hasInflowStamp } from "@/lib/crm/lead-reinflow"
import { inflowClockMs, isReinflowAwaitingContact } from "@/lib/crm/lead-response-status"

describe("contactEventTitle", () => {
  it("통화 성격 채널만 결과를 붙인다", () => {
    expect(contactEventTitle("call", "no_answer")).toBe("전화 · 부재")
    expect(contactEventTitle("sms", "answered")).toBe("문자 · 응답")
    expect(contactEventTitle("kakao", "answered")).toBe("카카오")
    expect(contactEventTitle("email", null)).toBe("이메일")
  })

  it("리드 미러 제목은 예전 그대로(이미 결과가 붙은 카톡 로그 포함)", () => {
    expect(leadContactEventTitle({ type: "call", result: "callback" })).toBe("전화 · 콜백 요청")
    expect(leadContactEventTitle({ type: "kakao", result: "answered" })).toBe("카카오 · 응답")
  })
})

describe("재문의 스탬프 게이트", () => {
  const created = "2026-08-01T00:00:00.000Z"

  it("hasInflowStamp — 생성 시각보다 60초 넘게 뒤일 때만", () => {
    expect(hasInflowStamp({ timestamp: created, last_inflow_at: created })).toBe(false)
    expect(hasInflowStamp({ timestamp: created, last_inflow_at: "2026-08-01T00:00:30.000Z" })).toBe(false)
    expect(hasInflowStamp({ timestamp: created, last_inflow_at: "2026-08-20T00:00:00.000Z" })).toBe(true)
  })

  it("timestamp 를 넘기면 백필(last_inflow_at = 생성 시각)은 재문의 미접촉이 아니다", () => {
    expect(isReinflowAwaitingContact({ status: "contacted", timestamp: created, last_inflow_at: created }, null)).toBe(false)
    expect(
      isReinflowAwaitingContact({ status: "contacted", timestamp: created, last_inflow_at: "2026-08-20T00:00:00.000Z" }, null)
    ).toBe(true)
    // 옛 호출부(timestamp 없음)는 예전처럼 게이트 없이.
    expect(isReinflowAwaitingContact({ status: "contacted", last_inflow_at: created }, null)).toBe(true)
  })

  it("inflowClockMs 는 max(생성, 재유입)", () => {
    expect(inflowClockMs({ timestamp: created, last_inflow_at: "2026-08-20T00:00:00.000Z" })).toBe(
      new Date("2026-08-20T00:00:00.000Z").getTime()
    )
  })
})

describe("crm_customer_events 쓰기 → 오늘 연락 캐시 무효화", () => {
  const revalidateTag = vi.fn()

  function builder(result: { maybeSingle?: unknown; single?: unknown; deleteRows?: unknown[] }) {
    const query: Record<string, unknown> = {}
    const self = () => query
    for (const name of ["select", "eq", "is", "gte", "order", "limit", "in"]) query[name] = self
    query.maybeSingle = async () => result.maybeSingle ?? { data: null, error: null }
    query.insert = () => ({ select: () => ({ single: async () => result.single }) })
    query.delete = () => {
      const deleteChain: Record<string, unknown> = {}
      for (const name of ["in", "eq"]) deleteChain[name] = () => deleteChain
      deleteChain.select = async () => ({ data: result.deleteRows ?? [], error: null })
      return deleteChain
    }
    return query
  }

  beforeEach(() => {
    vi.resetModules()
    revalidateTag.mockReset()
    vi.doMock("next/cache", () => ({ revalidateTag, unstable_cache: (fn: unknown) => fn }))
    vi.doMock("@/lib/storage/crm-recordings", () => ({ createCrmRecordingSignedUrls: vi.fn(async () => new Map()) }))
  })

  const ROW = { id: "E1", target_type: "neo_account", target_id: "N1", source_type: "call", title: "전화", recording_storage_path: null }

  it("getOrCreate 가 새로 만들면 무효화, 이미 있으면 무효화하지 않는다", async () => {
    vi.doMock("@/lib/supabase/admin", () => ({
      createSupabaseAdminClient: () => ({ from: () => builder({ single: { data: ROW, error: null } }) }),
    }))
    const { getOrCreateCrmCustomerEventBySource } = await import("@/lib/repositories/crm-events")
    const created = await getOrCreateCrmCustomerEventBySource({ sourceType: "call", sourceId: "today-contact:abc", targetType: "neo_account", targetId: "N1" })
    expect(created.created).toBe(true)
    expect(revalidateTag).toHaveBeenCalledWith("admin-crm-today-contacts", "max")

    vi.resetModules()
    revalidateTag.mockReset()
    vi.doMock("@/lib/supabase/admin", () => ({
      createSupabaseAdminClient: () => ({ from: () => builder({ maybeSingle: { data: ROW, error: null } }) }),
    }))
    const again = await (await import("@/lib/repositories/crm-events")).getOrCreateCrmCustomerEventBySource({
      sourceType: "call",
      sourceId: "today-contact:abc",
    })
    expect(again.created).toBe(false)
    expect(revalidateTag).not.toHaveBeenCalled()
  })

  it("원천 삭제는 지운 행이 있을 때만 무효화한다", async () => {
    vi.doMock("@/lib/supabase/admin", () => ({
      createSupabaseAdminClient: () => ({ from: () => builder({ deleteRows: [{ id: "E1" }] }) }),
    }))
    const { deleteCrmCustomerEventsBySource } = await import("@/lib/repositories/crm-events")
    const removed = await deleteCrmCustomerEventsBySource({ sourceTypes: ["call"], sourceId: "today-contact:abc", targetType: "neo_account", targetId: "N1" })
    expect(removed).toBe(1)
    expect(revalidateTag).toHaveBeenCalledWith("admin-crm-today-contacts", "max")
  })

  it("무효화가 실패해도 저장 결과를 깨뜨리지 않는다", async () => {
    revalidateTag.mockImplementation(() => {
      throw new Error("no store")
    })
    vi.doMock("@/lib/supabase/admin", () => ({
      createSupabaseAdminClient: () => ({ from: () => builder({ single: { data: ROW, error: null } }) }),
    }))
    const { createCrmCustomerEvent } = await import("@/lib/repositories/crm-events")
    await expect(createCrmCustomerEvent({ targetType: "neo_account", targetId: "N1", sourceType: "call", title: "전화" })).resolves.toMatchObject({ id: "E1" })
  })
})

describe("listCrmTasksClosedSince", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.doMock("next/cache", () => ({ revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }))
    vi.doMock("@/lib/repositories/admin-users", () => ({ findAdminCrmOwner: vi.fn(), listAdminUserDirectory: vi.fn() }))
  })

  function taskRow(id: string) {
    return {
      id,
      target_type: "neo_account",
      target_id: "N1",
      target_label: null,
      owner_key: null,
      owner_name_snapshot: null,
      task_type: "call",
      title: id,
      detail: null,
      due_at: null,
      snoozed_until: null,
      priority: "normal",
      status: "done",
      source_event_id: null,
      created_by: null,
      assigned_by: null,
      completed_at: "2026-09-25T01:00:00.000Z",
      completed_by: null,
      outcome: null,
      created_at: "2026-09-20T00:00:00.000Z",
      updated_at: "2026-09-25T01:00:00.000Z",
    }
  }

  it("완료·취소 + completed_at ≥ since 를 completed_at·id 순 range 로 읽는다", async () => {
    const calls: Array<[string, unknown[]]> = []
    const query: Record<string, unknown> = {}
    for (const name of ["select", "in", "gte", "order"]) {
      query[name] = (...args: unknown[]) => {
        calls.push([name, args])
        return query
      }
    }
    query.range = async (...args: unknown[]) => {
      calls.push(["range", args])
      return { data: [taskRow("T1"), taskRow("T2")], error: null, count: 2 }
    }
    vi.doMock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ from: () => query }) }))
    const { listCrmTasksClosedSince } = await import("@/lib/repositories/crm-tasks")
    const result = await listCrmTasksClosedSince("2026-09-24T15:00:00.000Z")
    expect(result.health.ok).toBe(true)
    expect(result.truncated).toBe(false)
    expect(result.rows.map((row) => row.id)).toEqual(["T1", "T2"])
    expect(calls).toContainEqual(["in", ["status", ["done", "canceled"]]])
    expect(calls).toContainEqual(["gte", ["completed_at", "2026-09-24T15:00:00.000Z"]])
    expect(calls.filter(([name]) => name === "order").map(([, args]) => args[0])).toEqual(["completed_at", "id"])
  })

  it("테이블 미적용은 health.ok=false(던지지 않음) · 잘못된 시각은 던진다", async () => {
    const query: Record<string, unknown> = {}
    for (const name of ["select", "in", "gte", "order"]) query[name] = () => query
    query.range = async () => ({ data: null, error: { code: "42P01", message: "relation crm_tasks does not exist" }, count: null })
    vi.doMock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ from: () => query }) }))
    const { listCrmTasksClosedSince } = await import("@/lib/repositories/crm-tasks")
    await expect(listCrmTasksClosedSince("2026-09-24T15:00:00.000Z")).resolves.toMatchObject({ health: { ok: false }, rows: [] })
    await expect(listCrmTasksClosedSince("어제")).rejects.toThrow()
  })
})
