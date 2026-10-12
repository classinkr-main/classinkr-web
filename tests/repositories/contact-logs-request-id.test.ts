/**
 * lib/repositories/contact-logs.ts — 호출자가 정한 로그 id(요청 키 멱등, 교차 리뷰 [12] 2026-09-26).
 * 현황 "오늘 연락"의 리드 결과 기록은 로그 id 를 요청 키에서 정한다(lib/crm/account-contact-record.ts todayContactLeadLogId).
 *  - findDuplicateContactLog 는 id 가 있으면 그 id 의 로그를 돌려준다(내용·시각 비교 없음).
 *  - addContactLog 는 id 를 insert 에 싣고, 기본키 충돌(동시 재전송)이면 먼저 저장된 로그를 돌려준다.
 *  - id 가 없는 기존 호출부는 그대로(내용 + 명시 시각 비교 · DB 기본 id).
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  revalidateTag: vi.fn(),
  inserts: [] as Array<Record<string, unknown>>,
  eqCalls: [] as Array<[string, unknown]>,
  insertError: null as { code?: string; message: string } | null,
  lookupRow: null as Record<string, unknown> | null,
}))

vi.mock("next/cache", () => ({ revalidateTag: mocks.revalidateTag }))
vi.mock("@/lib/repositories/lead-activity", () => ({ invalidateLeadsActivitySummary: vi.fn() }))
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: () => {
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => {
          mocks.eqCalls.push([column, value])
          return query
        },
        limit: async () => ({ data: mocks.lookupRow ? [mocks.lookupRow] : [], error: null }),
        maybeSingle: async () => ({ data: mocks.lookupRow, error: null }),
        insert: (payload: Record<string, unknown>) => {
          mocks.inserts.push(payload)
          return {
            select: () => ({
              single: async () =>
                mocks.insertError
                  ? { data: null, error: mocks.insertError }
                  : { data: { ...payload, id: payload.id ?? "db-generated" }, error: null },
            }),
          }
        },
      }
      return query
    },
  }),
}))

import { addContactLog, findDuplicateContactLog } from "@/lib/repositories/contact-logs"

const LOG_ID = "7d9a0c1e-2b3f-5a4d-8e6f-0123456789ab"
const EXISTING = {
  id: LOG_ID,
  lead_id: "L1",
  type: "call",
  result: "no_answer",
  notes: null,
  contacted_at: "2026-09-25T02:59:00.000Z",
  contacted_by: "김운영",
}

beforeEach(() => {
  mocks.revalidateTag.mockClear()
  mocks.inserts.length = 0
  mocks.eqCalls.length = 0
  mocks.insertError = null
  mocks.lookupRow = null
})

describe("contact-logs — 요청 키 로그 id", () => {
  it("findDuplicateContactLog 는 id 가 있으면 그 id 의 로그(이 리드)를 돌려준다 — 내용·시각이 달라도 같은 요청이다", async () => {
    mocks.lookupRow = EXISTING
    const found = await findDuplicateContactLog("L1", {
      id: LOG_ID,
      type: "call",
      result: "answered",
      contacted_at: "2026-09-25T03:05:00.000Z",
    })
    expect(found).toMatchObject({ id: LOG_ID, contacted_at: EXISTING.contacted_at })
    expect(mocks.eqCalls).toEqual([
      ["id", LOG_ID],
      ["lead_id", "L1"],
    ])
  })

  it("id 가 없고 연락 시각도 없으면 예전처럼 중복이 아니다(조회하지 않는다)", async () => {
    mocks.lookupRow = EXISTING
    expect(await findDuplicateContactLog("L1", { type: "call" })).toBeNull()
    expect(mocks.eqCalls).toEqual([])
  })

  it("addContactLog 는 정한 id 를 insert 에 싣는다 · 없으면 싣지 않는다(DB 기본값)", async () => {
    const withId = await addContactLog("L1", { id: LOG_ID, type: "call", contacted_by: "김운영", contacted_at: EXISTING.contacted_at })
    expect(mocks.inserts[0]).toMatchObject({ id: LOG_ID, lead_id: "L1", contacted_at: EXISTING.contacted_at })
    expect(withId.id).toBe(LOG_ID)

    await addContactLog("L1", { type: "call" })
    expect(mocks.inserts[1]).not.toHaveProperty("id")
  })

  it("같은 id 로 동시에 들어온 재전송(기본키 충돌)은 실패가 아니다 — 먼저 저장된 로그를 돌려주고 무효화를 다시 걸지 않는다", async () => {
    mocks.insertError = { code: "23505", message: "duplicate key value violates unique constraint" }
    mocks.lookupRow = EXISTING
    const log = await addContactLog("L1", { id: LOG_ID, type: "call" })
    expect(log).toMatchObject({ id: LOG_ID, contacted_by: "김운영" })
    expect(mocks.revalidateTag).not.toHaveBeenCalled()
  })

  it("id 없는 저장의 오류는 그대로 던진다", async () => {
    mocks.insertError = { code: "23505", message: "boom" }
    await expect(addContactLog("L1", { type: "call" })).rejects.toThrow("[contact-logs] 저장 실패: boom")
  })
})
