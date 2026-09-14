import { afterEach, describe, expect, it, vi } from "vitest"

// 감사 2026-09-07 §8 — leads/[id]에 동시 편집 충돌 검증이 전혀 없어 "마지막 쓰기가 이긴다"였다.
// updateLead(id, patch, { expectedUpdatedAt })가 그 최소 낙관적 잠금을 구현한다:
//   - 생략하면(기존 모든 호출부) 기존처럼 무조건 덮어쓴다.
//   - 지정했는데 DB의 updated_at이 다르면(그사이 다른 곳에서 먼저 저장) LeadVersionConflictError.
//   - 지정했는데 리드 자체가 없으면 기존 계약대로 null(404)을 유지한다.

type QueryResult = { data: unknown; error: unknown }

function makeSupabaseMock() {
  const updateResults: QueryResult[] = []
  const selectResults: QueryResult[] = []
  const updateEqCalls: Array<[string, unknown]> = []

  const from = vi.fn(() => ({
    update: () => {
      const chain = {
        eq: (col: string, val: unknown) => {
          updateEqCalls.push([col, val])
          return chain
        },
        select: () => ({
          single: async (): Promise<QueryResult> => updateResults.shift() ?? { data: null, error: new Error("no update result queued") },
        }),
      }
      return chain
    },
    select: () => {
      const chain = {
        eq: () => chain,
        single: async (): Promise<QueryResult> => selectResults.shift() ?? { data: null, error: new Error("no select result queued") },
      }
      return chain
    },
  }))

  return { from, updateResults, selectResults, updateEqCalls }
}

function leadRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "lead-1",
    source: "site",
    status: "new",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    ...overrides,
  }
}

describe("updateLead 낙관적 잠금(expectedUpdatedAt)", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("expectedUpdatedAt 없이 호출하면 updated_at 조건 없이 기존처럼 무조건 덮어쓴다", async () => {
    vi.resetModules()
    process.env.USE_SUPABASE_LEADS = "true"
    const { from, updateResults, updateEqCalls } = makeSupabaseMock()
    vi.doMock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn(() => ({ from })) }))
    // updateLead 성공 경로는 returnAfterLeadMutation → revalidateTag를 부른다. next/cache의
    // 실제 구현은 요청 스코프 스토어가 필요해 순수 vitest 환경에서 죽으므로 얇게 대체한다.
    vi.doMock("next/cache", () => ({
      unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
      revalidateTag: vi.fn(),
    }))
    updateResults.push({ data: leadRow({ notes: "새 메모" }), error: null })

    const { updateLead } = await import("@/lib/repositories/leads")
    const result = await updateLead("lead-1", { notes: "새 메모" })

    expect(result).toMatchObject({ id: "lead-1", notes: "새 메모" })
    // id 조건만 걸리고 updated_at 조건은 없어야 한다.
    expect(updateEqCalls).toEqual([["id", "lead-1"]])
  })

  it("expectedUpdatedAt을 지정하면 updated_at 조건을 함께 건다", async () => {
    vi.resetModules()
    process.env.USE_SUPABASE_LEADS = "true"
    const { from, updateResults, updateEqCalls } = makeSupabaseMock()
    vi.doMock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn(() => ({ from })) }))
    // updateLead 성공 경로는 returnAfterLeadMutation → revalidateTag를 부른다. next/cache의
    // 실제 구현은 요청 스코프 스토어가 필요해 순수 vitest 환경에서 죽으므로 얇게 대체한다.
    vi.doMock("next/cache", () => ({
      unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
      revalidateTag: vi.fn(),
    }))
    updateResults.push({ data: leadRow({ notes: "새 메모" }), error: null })

    const { updateLead } = await import("@/lib/repositories/leads")
    await updateLead("lead-1", { notes: "새 메모" }, { expectedUpdatedAt: "2026-09-01T00:00:00.000Z" })

    expect(updateEqCalls).toEqual([
      ["id", "lead-1"],
      ["updated_at", "2026-09-01T00:00:00.000Z"],
    ])
  })

  it("그사이 다른 곳에서 먼저 저장했으면(0행 매치) LeadVersionConflictError를 던진다", async () => {
    vi.resetModules()
    process.env.USE_SUPABASE_LEADS = "true"
    const { from, updateResults, selectResults } = makeSupabaseMock()
    vi.doMock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn(() => ({ from })) }))
    // updateLead 성공 경로는 returnAfterLeadMutation → revalidateTag를 부른다. next/cache의
    // 실제 구현은 요청 스코프 스토어가 필요해 순수 vitest 환경에서 죽으므로 얇게 대체한다.
    vi.doMock("next/cache", () => ({
      unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
      revalidateTag: vi.fn(),
    }))
    // 버전 불일치 — WHERE에 걸린 updated_at이 안 맞아 0행, PostgREST가 에러로 보고한다.
    updateResults.push({ data: null, error: { message: "JSON object requested, multiple (or no) rows returned" } })
    // 존재 여부 확인(getLeadById)은 리드가 여전히 있다고 답한다 — 즉 "충돌"이지 "삭제됨"이 아니다.
    selectResults.push({ data: leadRow(), error: null })

    const { updateLead, LeadVersionConflictError } = await import("@/lib/repositories/leads")

    await expect(
      updateLead("lead-1", { notes: "새 메모" }, { expectedUpdatedAt: "2026-08-01T00:00:00.000Z" })
    ).rejects.toBeInstanceOf(LeadVersionConflictError)
  })

  it("리드 자체가 없으면(버전 조건이 있어도) 기존 계약대로 null을 반환한다", async () => {
    vi.resetModules()
    process.env.USE_SUPABASE_LEADS = "true"
    const { from, updateResults, selectResults } = makeSupabaseMock()
    vi.doMock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn(() => ({ from })) }))
    // updateLead 성공 경로는 returnAfterLeadMutation → revalidateTag를 부른다. next/cache의
    // 실제 구현은 요청 스코프 스토어가 필요해 순수 vitest 환경에서 죽으므로 얇게 대체한다.
    vi.doMock("next/cache", () => ({
      unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
      revalidateTag: vi.fn(),
    }))
    updateResults.push({ data: null, error: { message: "0 rows" } })
    // 존재 여부 확인도 못 찾음 — 진짜로 삭제/부재한 리드다.
    selectResults.push({ data: null, error: { message: "not found" } })

    const { updateLead } = await import("@/lib/repositories/leads")
    const result = await updateLead(
      "missing-lead",
      { notes: "새 메모" },
      { expectedUpdatedAt: "2026-08-01T00:00:00.000Z" }
    )

    expect(result).toBeNull()
  })
})
