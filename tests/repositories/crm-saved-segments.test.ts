import { beforeEach, describe, expect, it, vi } from "vitest"

// 저장 세그먼트 저장소(세그먼트 허브, 2026-09-25) — 미적용 폴백 두 관례(읽기 available:false · 쓰기 NotReady),
// range 페이지네이션(실수신 행 수만큼 전진), 활성 자동 라벨 중복(23505) → 충돌 오류, spec_hash, 일별 upsert 키.

interface Recorded {
  table: string
  op: string
  payload?: unknown
  options?: unknown
  filters: Array<[string, string, unknown]>
  range?: [number, number]
}

let recorded: Recorded[] = []
let respond: (query: Recorded) => { data?: unknown; error?: unknown; count?: number | null } = () => ({ data: [] })

function builder(query: Recorded) {
  const chain = {
    select(_columns?: string, options?: unknown) {
      if (query.op === "") query.op = "select"
      if (options) query.options = options
      return chain
    },
    insert(payload: unknown) {
      query.op = "insert"
      query.payload = payload
      return chain
    },
    update(payload: unknown) {
      query.op = "update"
      query.payload = payload
      return chain
    },
    upsert(payload: unknown, options: unknown) {
      query.op = "upsert"
      query.payload = payload
      query.options = options
      return chain
    },
    delete() {
      query.op = "delete"
      return chain
    },
    eq(column: string, value: unknown) {
      query.filters.push(["eq", column, value])
      return chain
    },
    is(column: string, value: unknown) {
      query.filters.push(["is", column, value])
      return chain
    },
    not(column: string, _op: string, value: unknown) {
      query.filters.push(["not", column, value])
      return chain
    },
    in(column: string, value: unknown) {
      query.filters.push(["in", column, value])
      return chain
    },
    gte(column: string, value: unknown) {
      query.filters.push(["gte", column, value])
      return chain
    },
    lt(column: string, value: unknown) {
      query.filters.push(["lt", column, value])
      return chain
    },
    order() {
      return chain
    },
    limit() {
      return chain
    },
    range(fromIndex: number, toIndex: number) {
      query.range = [fromIndex, toIndex]
      return chain
    },
    single() {
      return Promise.resolve(respond(query)).then((result) => ({ data: result.data ?? null, error: result.error ?? null }))
    },
    maybeSingle() {
      return chain.single()
    },
    then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
      return Promise.resolve()
        .then(() => respond(query))
        .then((result) => ({ data: result.data ?? null, error: result.error ?? null, count: result.count ?? null }))
        .then(onFulfilled, onRejected)
    },
  }
  return chain
}

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from(table: string) {
      const query: Recorded = { table, op: "", filters: [] }
      recorded.push(query)
      return builder(query)
    },
  }),
}))

async function loadRepo() {
  vi.resetModules()
  return import("@/lib/repositories/crm-saved-segments")
}

function segmentRow(id: string) {
  return {
    id,
    name: `s${id}`,
    description: null,
    spec: { expDays: 30 },
    spec_version: 1,
    spec_hash: "h",
    visibility: "team",
    owner_user_id: "u1",
    owner_name: "관리자",
    auto_tag_enabled: false,
    auto_tag_label: null,
    auto_untag: false,
    last_count: null,
    last_evaluated_at: null,
    last_run_status: "bogus",
    last_run_detail: { tagged: 3, flags: ["neo_stale", "nope"], blockedUntag: true },
    archived_at: null,
    archived_by: null,
    created_by: null,
    updated_by: null,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
  }
}

beforeEach(() => {
  recorded = []
  respond = () => ({ data: [] })
})

describe("listSavedSegments", () => {
  it("표 부재(PGRST205)면 available:false + 적용 안내 — 던지지 않는다", async () => {
    respond = () => ({ error: { code: "PGRST205", message: "Could not find the table 'public.crm_saved_segments' in the schema cache" } })
    const { listSavedSegments, SAVED_SEGMENTS_NOT_READY_MESSAGE } = await loadRepo()
    expect(await listSavedSegments()).toEqual({ available: false, warning: SAVED_SEGMENTS_NOT_READY_MESSAGE, segments: [] })
  })

  it("그 밖의 읽기 오류는 던진다(빈 목록으로 위장하지 않음)", async () => {
    respond = () => ({ error: { code: "57014", message: "statement timeout" } })
    const { listSavedSegments } = await loadRepo()
    await expect(listSavedSegments()).rejects.toThrow("statement timeout")
  })

  it("range 페이지네이션 — 서버 상한이 작아도 실제 받은 행 수만큼 전진, 보관 필터", async () => {
    const all = Array.from({ length: 5 }, (_, index) => segmentRow(String(index)))
    respond = (query) => {
      const [from] = query.range ?? [0, 0]
      // 서버 max-rows 2 — 요청은 1,000 이지만 2행씩만 준다.
      return { data: all.slice(from, from + 2), count: 5 }
    }
    const { listSavedSegments } = await loadRepo()
    const result = await listSavedSegments()
    expect(result.available && result.segments.map((segment) => segment.id)).toEqual(["0", "1", "2", "3", "4"])
    expect(recorded.map((query) => query.range?.[0])).toEqual([0, 2, 4])
    expect(recorded[0].filters).toContainEqual(["is", "archived_at", null])
    // 모르는 상태 값·플래그는 버린다.
    if (result.available) {
      expect(result.segments[0].lastRunStatus).toBeNull()
      expect(result.segments[0].lastRunDetail).toEqual({ tagged: 3, flags: ["neo_stale"], blockedUntag: true })
    }
  })
})

describe("쓰기", () => {
  const input = {
    name: "만료",
    description: null,
    spec: { expDays: 30, anyOf: [{ risk: ["urgent" as const] }] },
    visibility: "team" as const,
    ownerUserId: "u1",
    ownerName: "관리자",
    autoTag: { enabled: true, label: "만료임박", untag: false },
    actor: "관리자",
  }

  it("생성 — spec_version 1 · spec_hash = 정규형 쿼리 sha256 앞 16자", async () => {
    respond = () => ({ data: segmentRow("new") })
    const { createSavedSegment, computeSegmentSpecHash } = await loadRepo()
    await createSavedSegment(input)
    const payload = recorded[0].payload as Record<string, unknown>
    expect(payload).toMatchObject({ spec_version: 1, auto_tag_enabled: true, auto_tag_label: "만료임박", owner_user_id: "u1" })
    expect(payload.spec_hash).toBe(computeSegmentSpecHash(input.spec))
    expect(String(payload.spec_hash)).toMatch(/^[0-9a-f]{16}$/)
    // 같은 뜻이면 같은 해시, OR 그룹이 다르면 다른 해시.
    expect(computeSegmentSpecHash({ anyOf: [{ risk: ["urgent"] }], expDays: 30 })).toBe(payload.spec_hash)
    expect(computeSegmentSpecHash({ expDays: 30 })).not.toBe(payload.spec_hash)
  })

  it("활성 자동 라벨 중복(23505) → 충돌 오류, 표 부재(42P01) → NotReady, CHECK(23514) → 제약 오류", async () => {
    const repo = await loadRepo()
    respond = () => ({ error: { code: "23505", message: "duplicate key value violates unique constraint" } })
    await expect(repo.createSavedSegment(input)).rejects.toBeInstanceOf(repo.SavedSegmentAutoTagLabelConflictError)
    respond = () => ({ error: { code: "42P01", message: 'relation "public.crm_saved_segments" does not exist' } })
    await expect(repo.createSavedSegment(input)).rejects.toBeInstanceOf(repo.SavedSegmentsNotReadyError)
    respond = () => ({ error: { code: "23514", message: "violates check constraint" } })
    await expect(repo.updateSavedSegment("x", { name: "a", actor: null })).rejects.toBeInstanceOf(repo.SavedSegmentConstraintError)
  })

  it("보관은 자동 태그를 끄고 archived_at 을 채운다(물리 삭제 아님)", async () => {
    respond = () => ({ data: segmentRow("x") })
    const { archiveSavedSegment } = await loadRepo()
    await archiveSavedSegment("x", "관리자")
    expect(recorded[0].op).toBe("update")
    expect(recorded[0].payload).toMatchObject({ auto_tag_enabled: false, archived_by: "관리자" })
  })
})

describe("일별 기록", () => {
  it("배치 upsert — (segment_id, snapshot_date) 충돌 키, 표 부재면 not_ready", async () => {
    const { upsertSavedSegmentDailyRows } = await loadRepo()
    const row = {
      segmentId: "s1",
      snapshotDate: "2026-09-25",
      total: 3,
      leadCount: 3,
      neoAccountCount: 0,
      customerCount: 0,
      specHash: "h",
      flags: [],
      autoTagStatus: "off" as const,
      tagged: 0,
      untagged: 0,
      tagFailed: 0,
      runTrigger: "cron" as const,
      evaluatedAt: "2026-09-24T21:00:00Z",
    }
    expect(await upsertSavedSegmentDailyRows([row])).toEqual({ ok: true, written: 1 })
    expect(recorded[0].options).toEqual({ onConflict: "segment_id,snapshot_date" })

    respond = () => ({ error: { code: "PGRST205", message: "Could not find the table 'public.crm_saved_segment_daily'" } })
    expect(await upsertSavedSegmentDailyRows([row])).toEqual({ ok: false, reason: "not_ready" })
    expect(await upsertSavedSegmentDailyRows([])).toEqual({ ok: true, written: 0 })
  })

  it("기간 조회 — 일별 표만 없으면 available:false(추이만 빈다)", async () => {
    respond = () => ({ error: { code: "42P01", message: 'relation "public.crm_saved_segment_daily" does not exist' } })
    const { listSavedSegmentDailyPoints } = await loadRepo()
    expect(await listSavedSegmentDailyPoints(["s1"], "2026-08-01")).toMatchObject({ available: false, points: [] })
  })

  it("활성 자동 라벨 조회 — 표가 없으면 빈 배열", async () => {
    respond = () => ({ error: { code: "PGRST205", message: "Could not find the table 'public.crm_saved_segments'" } })
    const { listActiveAutoTagLabels } = await loadRepo()
    expect(await listActiveAutoTagLabels()).toEqual([])
  })
})
