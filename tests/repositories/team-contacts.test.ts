import { beforeEach, describe, expect, it, vi } from "vitest"

// 담당자 표 저장소 — 가짜 Supabase(운영 DB 를 부르지 않는다). 값은 지어낸 것이다.
// 미적용 폴백(목록 available:false · 쓰기 NotReady), 행 정규화, 영역 겹침(23505) → AreaTaken,
// 안내용 읽기의 60초 캐시·실패 미캐시·쓰기 뒤 무효화, CSV 넣기의 줄별 실패.

interface Recorded {
  table: string
  op: string
  payload?: unknown
  filters: Array<[string, string, unknown]>
}

let recorded: Recorded[] = []
let respond: (query: Recorded) => { data?: unknown; error?: unknown } = () => ({ data: [] })

function builder(query: Recorded) {
  const settle = () =>
    Promise.resolve()
      .then(() => respond(query))
      .then((result) => ({ data: result.data ?? null, error: result.error ?? null }))
  const chain = {
    select() {
      if (query.op === "") query.op = "select"
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
    eq(column: string, value: unknown) {
      query.filters.push(["eq", column, value])
      return chain
    },
    order() {
      return chain
    },
    single: settle,
    maybeSingle: settle,
    then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
      return settle().then(onFulfilled, onRejected)
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
  return import("@/lib/repositories/team-contacts")
}

const MISSING = { code: "PGRST205", message: "Could not find the table 'public.internal_team_contacts' in the schema cache" }

function dbRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    org: "KR",
    area: "quote",
    role: "BD 팀 매니저",
    name: "담당자 A",
    deputy: "담당자 B",
    channel: "위컴 1:1",
    prep: ["고객사", 3, "품목"],
    admin_link: "/admin/quotes",
    note: null,
    confirmed_at: "2026-11-20",
    confirmed_by: "관리자",
    active: true,
    sort_order: 40,
    created_at: "2026-11-20T00:00:00Z",
    updated_at: "2026-11-20T00:00:00Z",
    ...overrides,
  }
}

const INPUT = {
  org: "KR" as const,
  area: "quote",
  role: "BD 팀 매니저",
  name: "담당자 A",
  deputy: null,
  channel: "위컴 1:1",
  prep: ["고객사"],
  adminLink: null,
  note: null,
  confirmedAt: "2026-11-25",
  sortOrder: 0,
}

beforeEach(() => {
  recorded = []
  respond = () => ({ data: [] })
  vi.spyOn(console, "warn").mockImplementation(() => {})
})

describe("team-contacts 저장소 — 목록·쓰기", () => {
  it("활성 행만 읽고 칸을 정규화한다(준비물의 글 아닌 값은 버리고, 모르는 조직 행은 뺀다)", async () => {
    respond = () => ({ data: [dbRow(), dbRow({ id: "x", org: "XX" })] })
    const repo = await loadRepo()
    const list = await repo.listTeamContacts()
    expect(list.available).toBe(true)
    expect(list.rows).toEqual([
      expect.objectContaining({ org: "KR", area: "quote", name: "담당자 A", prep: ["고객사", "품목"], adminLink: "/admin/quotes", confirmedAt: "2026-11-20", sortOrder: 40 }),
    ])
    expect(recorded[0].filters).toContainEqual(["eq", "active", true])
  })

  it("includeInactive 면 active 거르개를 걸지 않는다", async () => {
    const repo = await loadRepo()
    await repo.listTeamContacts({ includeInactive: true })
    expect(recorded[0].filters).toEqual([])
  })

  it("표가 없으면 목록은 available:false + 안내, 쓰기는 NotReady", async () => {
    respond = () => ({ error: MISSING })
    const repo = await loadRepo()
    const list = await repo.listTeamContacts()
    expect(list).toMatchObject({ available: false, rows: [] })
    expect(list.warning).toContain("20261126_internal_team_contacts.sql")
    await expect(repo.createTeamContact(INPUT, { name: "관리자" })).rejects.toBeInstanceOf(repo.TeamContactsNotReadyError)
  })

  it("미적용이 아닌 읽기 오류는 삼키지 않고 던진다", async () => {
    respond = () => ({ error: { code: "57014", message: "canceling statement due to statement timeout" } })
    const repo = await loadRepo()
    await expect(repo.listTeamContacts()).rejects.toThrow(/timeout/)
  })

  it("만들기 — DB 칸 이름으로 넣고, 확인일이 있으면 확인자를 행위자로", async () => {
    respond = (query) => (query.op === "insert" ? { data: dbRow() } : { data: [] })
    const repo = await loadRepo()
    await repo.createTeamContact(INPUT, { name: "관리자 갑" })
    const insert = recorded.find((query) => query.op === "insert")
    expect(insert?.payload).toMatchObject({ org: "KR", area: "quote", admin_link: null, confirmed_at: "2026-11-25", confirmed_by: "관리자 갑", sort_order: 0, active: true })
  })

  it("같은 영역에 활성 행이 있으면(23505) TeamContactAreaTakenError", async () => {
    respond = () => ({ error: { code: "23505", message: "duplicate key value violates unique constraint" } })
    const repo = await loadRepo()
    await expect(repo.createTeamContact(INPUT, { name: "관리자" })).rejects.toBeInstanceOf(repo.TeamContactAreaTakenError)
    await expect(repo.setTeamContactActive("id-1", true)).rejects.toBeInstanceOf(repo.TeamContactAreaTakenError)
  })

  it("고치기 — 확인일이 그대로면 확인자도 그대로, 바뀌면 행위자, 비우면 비운다", async () => {
    respond = (query) => (query.op === "select" ? { data: [dbRow()] } : { data: dbRow() })
    const repo = await loadRepo()
    const base = (await repo.listTeamContacts()).rows[0]
    recorded = []
    await repo.updateTeamContact(base, { ...INPUT, confirmedAt: "2026-11-20" }, { name: "관리자 을" })
    await repo.updateTeamContact(base, { ...INPUT, confirmedAt: "2026-11-26" }, { name: "관리자 을" })
    await repo.updateTeamContact(base, { ...INPUT, confirmedAt: null }, { name: "관리자 을" })
    expect(recorded.map((query) => (query.payload as { confirmed_by: unknown }).confirmed_by)).toEqual(["관리자", "관리자 을", null])
    expect(recorded.every((query) => query.filters.some(([, column, value]) => column === "id" && value === base.id))).toBe(true)
  })

  it("확인일 찍기 — 한국 날짜와 확인자", async () => {
    respond = () => ({ data: dbRow() })
    const repo = await loadRepo()
    await repo.confirmTeamContact("id-1", { name: "관리자 병" }, new Date("2026-11-25T16:30:00Z"))
    expect(recorded[0].payload).toEqual({ confirmed_at: "2026-11-26", confirmed_by: "관리자 병" })
  })

  it("비활성화 — active=false 로만 고친다(물리 삭제 없음)", async () => {
    respond = () => ({ data: dbRow({ active: false }) })
    const repo = await loadRepo()
    const row = await repo.setTeamContactActive("id-1", false)
    expect(row?.active).toBe(false)
    expect(recorded[0]).toMatchObject({ op: "update", payload: { active: false } })
  })

  it("CSV 넣기 — 고칠 행은 update, 새 행은 insert, 한 줄 실패는 나머지를 막지 않는다", async () => {
    respond = (query) => {
      if (query.op === "insert" && (query.payload as { area: string }).area === "contract") return { error: { code: "23505", message: "dup" } }
      return { data: { id: "new" } }
    }
    const repo = await loadRepo()
    const result = await repo.applyTeamContactImport([
      { existingId: "id-1", input: INPUT, confirmedBy: "관리자 (CSV)" },
      { existingId: null, input: { ...INPUT, area: "contract" }, confirmedBy: null },
      { existingId: null, input: { ...INPUT, area: "payment", confirmedAt: null }, confirmedBy: "무시" },
    ])
    expect(result.updated).toBe(1)
    expect(result.created).toBe(1)
    expect(result.failed).toEqual([{ area: "contract", error: expect.stringContaining("활성 행") }])
    expect(recorded.map((query) => query.op)).toEqual(["update", "insert", "insert"])
    expect((recorded[0].payload as { confirmed_by: unknown }).confirmed_by).toBe("관리자 (CSV)")
    expect((recorded[2].payload as { confirmed_by: unknown }).confirmed_by).toBeNull()
  })

  it("CSV 넣기 — 표 미적용이면 첫 줄에서 NotReady 를 던진다", async () => {
    respond = () => ({ error: MISSING })
    const repo = await loadRepo()
    await expect(repo.applyTeamContactImport([{ existingId: null, input: INPUT, confirmedBy: null }])).rejects.toBeInstanceOf(
      repo.TeamContactsNotReadyError
    )
  })
})

describe("readActiveTeamContactsCached — 안내용 짧은 캐시", () => {
  it("60초 안에는 다시 읽지 않고, 지나면 다시 읽는다", async () => {
    respond = () => ({ data: [dbRow()] })
    const repo = await loadRepo()
    let now = 1_000_000
    const first = await repo.readActiveTeamContactsCached(() => now)
    now += 59_000
    await repo.readActiveTeamContactsCached(() => now)
    expect(first).toMatchObject({ failed: false, warning: null })
    expect(first.rows).toHaveLength(1)
    expect(recorded).toHaveLength(1)
    now += 2_000
    await repo.readActiveTeamContactsCached(() => now)
    expect(recorded).toHaveLength(2)
  })

  it("실패면 빈 표 + failed:true 이고 캐시하지 않는다(다음 질문이 다시 읽는다)", async () => {
    respond = () => ({ error: { code: "57014", message: "timeout" } })
    const repo = await loadRepo()
    const failed = await repo.readActiveTeamContactsCached(() => 0)
    expect(failed).toEqual({ rows: [], failed: true, warning: null })
    respond = () => ({ data: [dbRow()] })
    const ok = await repo.readActiveTeamContactsCached(() => 1)
    expect(ok.failed).toBe(false)
    expect(ok.rows).toHaveLength(1)
  })

  it("표 미적용이면 failed + 미적용 안내", async () => {
    respond = () => ({ error: MISSING })
    const repo = await loadRepo()
    const read = await repo.readActiveTeamContactsCached(() => 0)
    expect(read.failed).toBe(true)
    expect(read.warning).toBe(repo.TEAM_CONTACTS_NOT_READY_GAP)
  })

  it("쓰기 뒤에는 이 인스턴스의 캐시를 비운다", async () => {
    respond = (query) => (query.op === "select" ? { data: [dbRow()] } : { data: dbRow() })
    const repo = await loadRepo()
    await repo.readActiveTeamContactsCached(() => 0)
    await repo.confirmTeamContact("id-1", { name: "관리자" })
    await repo.readActiveTeamContactsCached(() => 1)
    expect(recorded.filter((query) => query.op === "select")).toHaveLength(2)
  })
})
