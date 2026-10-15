import { describe, expect, it, vi } from "vitest"
import { createRecordingSupabaseClient, type RecordedQuery } from "../helpers/recording-supabase-client"

let queries: RecordedQuery[] = []
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => createRecordingSupabaseClient(query => {
  queries.push(query)
  return { data: [{ id: 22, lead_id: 7, created_at: "2026-10-13T09:00:00Z" }], count: 152, error: null }
}).client }))
import { getCompassActivityPage } from "@/lib/compass/bridge"

describe("Compass 고객 로그 페이지", () => {
  it("동시각 기록도 id로 순서를 고정하고 고객 범위·조회 시점·페이지를 유지한다", async () => {
    queries = []
    const result = await getCompassActivityPage([7, 7], { offset: 100, limit: 50, before: "2026-10-13T09:00:00Z" })
    expect(result.total).toBe(152)
    expect(result.truncated).toBe(true)
    expect(queries[0].filters).toContainEqual({ op: "in", column: "lead_id", value: [7] })
    expect(queries[0].filters).toContainEqual({ op: "lte", column: "created_at", value: "2026-10-13T09:00:00Z" })
    expect(queries[0].order).toEqual([{ column: "created_at", ascending: false }, { column: "id", ascending: false }])
    expect(queries[0].range).toEqual({ from: 100, to: 149 })
  })
})
