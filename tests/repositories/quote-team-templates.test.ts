import { beforeEach, describe, expect, it, vi } from "vitest"

// 견적 팀 템플릿 저장소 — 미적용 폴백(읽기 available:false + 기본 템플릿 · 쓰기 NotReady), 행 정규화, 가시성 필터,
// 보관 = archived_at(물리 삭제 없음), 보관된 행은 수정하지 않음.

interface Recorded {
  table: string
  op: string
  payload?: unknown
  filters: Array<[string, string, unknown]>
}

let recorded: Recorded[] = []
let respond: (query: Recorded) => { data?: unknown; error?: unknown } = () => ({ data: [] })

function builder(query: Recorded) {
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
    is(column: string, value: unknown) {
      query.filters.push(["is", column, value])
      return chain
    },
    order() {
      return chain
    },
    limit() {
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
        .then((result) => ({ data: result.data ?? null, error: result.error ?? null }))
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
  return import("@/lib/repositories/quote-team-templates")
}

const MISSING = { code: "PGRST205", message: "Could not find the table 'public.quote_team_templates' in the schema cache" }

function row(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: `t${id}`,
    product_line: "hardware",
    source_template_id: "board_86",
    items: [{ sku: "board-86", quantity: 2, unitPrice: 5_900_000 }, { sku: "camera-t1", quantity: 1 }, "junk"],
    defaults: { validityDays: 14, notePresetIds: ["general_validity"] },
    scope: "team",
    show_in_menu: true,
    owner_user_id: "u1",
    owner_name: "Han",
    archived_at: null,
    created_at: "2026-10-12T00:00:00Z",
    updated_at: "2026-10-12T00:00:00Z",
    ...overrides,
  }
}

const input = {
  name: "학원 2교실",
  productLine: "hardware" as const,
  sourceTemplateId: null,
  items: [{ sku: "board-86", quantity: 2, unitPrice: 5_900_000 }],
  defaults: { validityDays: 30 as const, vat: "excluded" as const, installation: "included_quote" as const, payment: "one_time" as const, notePresetIds: [] },
  scope: "team" as const,
  showInMenu: true,
}

beforeEach(() => {
  recorded = []
  respond = () => ({ data: [] })
})

describe("quote-team-templates 저장소", () => {
  it("표가 없으면 읽기는 available:false 로 강등하고 기본 템플릿은 그대로 준다", async () => {
    respond = () => ({ error: MISSING })
    const repo = await loadRepo()
    const result = await repo.listQuoteTemplatesFor({ userId: "u1", isStaffAdmin: false })
    expect(result.available).toBe(false)
    expect(result.warning).toContain("20261021_quote_team_templates.sql")
    expect(result.team).toEqual([])
    expect(result.base.length).toBeGreaterThan(0)
  })

  it("표 부재가 아닌 읽기 오류는 빈 결과로 삼키지 않는다", async () => {
    respond = () => ({ error: { code: "57014", message: "statement timeout" } })
    const repo = await loadRepo()
    await expect(repo.listQuoteTeamTemplates()).rejects.toThrow("statement timeout")
  })

  it("표가 없으면 쓰기는 NotReady 오류(라우트 503)", async () => {
    respond = () => ({ error: MISSING })
    const repo = await loadRepo()
    await expect(repo.createQuoteTeamTemplate({ input, ownerUserId: "u1", ownerName: "Han", actor: "Han" })).rejects.toBeInstanceOf(
      repo.QuoteTeamTemplatesNotReadyError
    )
  })

  it("행을 정규화하고, 남의 '나만'은 빼고, 내 것만 수정 가능으로 표시한다", async () => {
    respond = () => ({ data: [row("a"), row("b", { scope: "mine", owner_user_id: "u2" }), row("c", { scope: "mine" })] })
    const repo = await loadRepo()
    const result = await repo.listQuoteTemplatesFor({ userId: "u1", isStaffAdmin: false })
    expect(result.available).toBe(true)
    expect(result.team.map((view) => view.id)).toEqual(["a", "c"])
    expect(result.team.every((view) => view.canEdit)).toBe(true)
    const [first] = result.team
    expect(first.items.map((item) => [item.sku, item.unitPrice])).toEqual([
      ["board-86", 5_900_000],
      ["camera-t1", 1_200_000],
    ])
    expect(first.defaults).toMatchObject({ validityDays: 14, notePresetIds: ["general_validity"] })
    expect(first.baseTemplateId).toBe("board_86")
    expect(recorded[0].filters).toContainEqual(["is", "archived_at", null])
  })

  it("생성은 소유자·작성자를 남기고, 수정·보관은 보관 안 된 행만 건드린다", async () => {
    respond = (query) => (query.op === "update" && query.payload && "archived_at" in (query.payload as object) ? { data: { id: "a" } } : { data: row("a") })
    const repo = await loadRepo()
    await repo.createQuoteTeamTemplate({ input, ownerUserId: "u1", ownerName: "Han", actor: "Han" })
    expect(recorded[0]).toMatchObject({
      op: "insert",
      payload: expect.objectContaining({ product_line: "hardware", show_in_menu: true, owner_user_id: "u1", created_by: "Han" }),
    })

    await repo.updateQuoteTeamTemplate("a", input, "Han")
    expect(recorded[1].filters).toEqual([["eq", "id", "a"], ["is", "archived_at", null]])

    expect(await repo.archiveQuoteTeamTemplate("a", "Han")).toBe(true)
    expect(recorded[2]).toMatchObject({ op: "update", payload: expect.objectContaining({ archived_by: "Han" }) })
    expect(recorded.some((query) => query.op === "delete")).toBe(false)
  })
})
