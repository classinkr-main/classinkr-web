import { beforeEach, describe, expect, it, vi } from "vitest"

// 감사 2026-09-07 §4 — ActivityQuickForm 등 수기 입력 경로가 source_id 없이 무조건 INSERT하던
// createCrmCustomerEvent에 짧은 창(10초) 중복 방지를 추가했다. 더블클릭·네트워크 재시도로 같은
// 대상·같은 제목·같은 본문이 다시 들어오면 새로 만들지 않고 기존 행을 그대로 돌려줘야 한다.

// 체이너블 쿼리 빌더 — select/eq/is/gte/order/limit은 전부 this를 돌려주고,
// maybeSingle·single·insert 뒤의 select만 테스트가 지정한 결과로 끝난다.
function makeQueryBuilder(options: {
  maybeSingleResult: { data: unknown; error: unknown }
  insertResult?: { data: unknown; error: unknown }
}) {
  const calls: { method: string; args: unknown[] }[] = []
  const record = (method: string, args: unknown[]) => calls.push({ method, args })

  const builder: Record<string, unknown> = {}
  const chain = (name: string) => (...args: unknown[]) => {
    record(name, args)
    return builder
  }
  builder.select = chain("select")
  builder.eq = chain("eq")
  builder.is = chain("is")
  builder.gte = chain("gte")
  builder.order = chain("order")
  builder.limit = chain("limit")
  builder.maybeSingle = vi.fn(async () => {
    record("maybeSingle", [])
    return options.maybeSingleResult
  })
  builder.insert = (...args: unknown[]) => {
    record("insert", args)
    return {
      select: () => ({
        single: async () => {
          record("single", [])
          return options.insertResult ?? { data: null, error: new Error("insertResult not configured") }
        },
      }),
    }
  }
  return { builder, calls }
}

describe("createCrmCustomerEvent 중복 방지", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it("짧은 창 안에 같은 대상·제목·본문의 기록이 이미 있으면 새로 만들지 않고 기존 행을 돌려준다", async () => {
    const existingRow = {
      id: "evt-existing",
      target_type: "lead",
      target_id: "lead-1",
      source_type: "manual_note",
      title: "상담 메모",
      body: "가격 문의",
      recording_storage_path: null,
    }
    const { builder, calls } = makeQueryBuilder({
      maybeSingleResult: { data: existingRow, error: null },
    })
    const from = vi.fn(() => builder)
    vi.doMock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn(() => ({ from })) }))
    vi.doMock("@/lib/storage/crm-recordings", () => ({
      createCrmRecordingSignedUrls: vi.fn(async () => new Map()),
    }))

    const { createCrmCustomerEvent } = await import("@/lib/repositories/crm-events")
    const result = await createCrmCustomerEvent({
      targetType: "lead",
      targetId: "lead-1",
      sourceType: "manual_note",
      title: "상담 메모",
      body: "가격 문의",
    })

    expect(result).toMatchObject({ id: "evt-existing" })
    // insert가 호출되지 않아야 한다 — 중복으로 판정되면 새 행을 만들지 않는다.
    expect(calls.some((c) => c.method === "insert")).toBe(false)
    expect(calls.some((c) => c.method === "maybeSingle")).toBe(true)
  })

  it("중복이 없으면 평소처럼 INSERT로 새 기록을 만든다", async () => {
    const insertedRow = {
      id: "evt-new",
      target_type: "lead",
      target_id: "lead-1",
      source_type: "manual_note",
      title: "상담 메모",
      body: "가격 문의",
      recording_storage_path: null,
    }
    const { builder, calls } = makeQueryBuilder({
      maybeSingleResult: { data: null, error: null },
      insertResult: { data: insertedRow, error: null },
    })
    const from = vi.fn(() => builder)
    vi.doMock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn(() => ({ from })) }))
    vi.doMock("@/lib/storage/crm-recordings", () => ({
      createCrmRecordingSignedUrls: vi.fn(async () => new Map()),
    }))

    const { createCrmCustomerEvent } = await import("@/lib/repositories/crm-events")
    const result = await createCrmCustomerEvent({
      targetType: "lead",
      targetId: "lead-1",
      sourceType: "manual_note",
      title: "상담 메모",
      body: "가격 문의",
    })

    expect(result).toMatchObject({ id: "evt-new" })
    expect(calls.some((c) => c.method === "insert")).toBe(true)
  })

  it("중복 조회 자체가 실패해도(컬럼 부재 등) 저장을 막지 않고 그대로 INSERT한다", async () => {
    const insertedRow = { id: "evt-new-2", target_type: "lead", target_id: null, source_type: "manual_note", title: "제목 없는 CRM 기록", body: null, recording_storage_path: null }
    const { builder, calls } = makeQueryBuilder({
      maybeSingleResult: { data: null, error: { message: "column created_at does not exist" } },
      insertResult: { data: insertedRow, error: null },
    })
    const from = vi.fn(() => builder)
    vi.doMock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn(() => ({ from })) }))
    vi.doMock("@/lib/storage/crm-recordings", () => ({
      createCrmRecordingSignedUrls: vi.fn(async () => new Map()),
    }))

    const { createCrmCustomerEvent } = await import("@/lib/repositories/crm-events")
    const result = await createCrmCustomerEvent({})

    expect(result).toMatchObject({ id: "evt-new-2" })
    expect(calls.some((c) => c.method === "insert")).toBe(true)
  })
})
