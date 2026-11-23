// 견적 "계약 전환"은 contract_documents 에 쓰는데 계약서 탭(/api/admin/contracts)은 V1 contracts 만 읽어,
// 전환한 계약이 탭에 나타나지 않던 문제. 전환 라우트와 목록 라우트를 같은 인메모리 DB 위에서 이어 돌려
// "전환하면 계약서 탭 목록 응답에 그 계약이 들어 있다"를 고정한다.
import { NextRequest, NextResponse } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

type Row = Record<string, unknown>

const { db, requirePortalContext } = vi.hoisted(() => ({
  db: { tables: {} as Record<string, Array<Record<string, unknown>>>, seq: 0, failTables: new Set<string>(), failUpdateTables: new Set<string>(), uniqueColumns: {} as Record<string, string>, forcedConflicts: {} as Record<string, number> },
  requirePortalContext: vi.fn(),
}))

// supabase-js 빌더 흉내 — 이 흐름이 쓰는 체인(select/insert/update/eq/in/like/order/limit/single)만 구현한다.
function readPath(row: Row, column: string): unknown {
  // "structured_json->sourceQuote->>quote_document_id" 같은 JSON 경로
  return column.split(/->>?/).reduce<unknown>((value, key) => {
    if (value && typeof value === "object") return (value as Row)[key]
    return undefined
  }, row)
}

function project(row: Row, columns: string | null): Row {
  if (!columns || columns === "*") return row
  const out: Row = {}
  for (const part of columns.split(",").map((value) => value.trim())) {
    const [alias, path] = part.includes(":") ? part.split(":") : [part, part]
    out[alias] = readPath(row, path)
  }
  return out
}

function createBuilder(table: string) {
  const rows = (db.tables[table] ??= [])
  const state = {
    op: "select" as "select" | "insert" | "update" | "delete",
    columns: null as string | null,
    payload: null as Row | null,
    filters: [] as Array<(row: Row) => boolean>,
    orders: [] as Array<{ column: string; ascending: boolean }>,
    limit: null as number | null,
    head: false,
    single: false,
  }

  function run() {
    if (db.failTables.has(table)) return { data: null, error: { message: `${table} unavailable` }, count: null }

    if (state.op === "update" && db.failUpdateTables.has(table)) {
      return { data: null, error: { message: `${table} update failed` }, count: null }
    }

    let result: Row[]
    if (state.op === "delete") {
      const doomed = rows.filter((row) => state.filters.every((filter) => filter(row)))
      for (const row of doomed) rows.splice(rows.indexOf(row), 1)
      // contract_document_versions 는 계약 문서 삭제 시 cascade.
      if (table === "contract_documents") {
        const versions = (db.tables.contract_document_versions ??= [])
        db.tables.contract_document_versions = versions.filter(
          (version) => !doomed.some((row) => row.id === version.contract_document_id)
        )
      }
      return { data: null, error: null, count: doomed.length }
    }
    if (state.op === "insert") {
      const uniqueColumn = db.uniqueColumns[table]
      if ((db.forcedConflicts[table] ?? 0) > 0) {
        db.forcedConflicts[table] -= 1
        return { data: null, error: { code: "23505", message: "duplicate key value" }, count: null }
      }
      if (uniqueColumn && rows.some((row) => row[uniqueColumn] === state.payload?.[uniqueColumn])) {
        return { data: null, error: { code: "23505", message: "duplicate key value" }, count: null }
      }
      const now = new Date(Date.UTC(2026, 10, 23, 0, 0, ++db.seq)).toISOString()
      const inserted = { id: `${table}_${db.seq}`, created_at: now, updated_at: now, ...state.payload }
      rows.push(inserted)
      result = [inserted]
    } else {
      result = rows.filter((row) => state.filters.every((filter) => filter(row)))
      if (state.op === "update") result.forEach((row) => Object.assign(row, state.payload))
    }

    for (const order of [...state.orders].reverse()) {
      result = [...result].sort((left, right) => {
        const a = String(left[order.column] ?? "")
        const b = String(right[order.column] ?? "")
        return (a < b ? -1 : a > b ? 1 : 0) * (order.ascending ? 1 : -1)
      })
    }
    if (state.limit !== null) result = result.slice(0, state.limit)

    if (state.head) return { data: null, error: null, count: result.length }
    const projected = result.map((row) => project(row, state.columns))
    if (state.single) {
      return projected.length === 1
        ? { data: projected[0], error: null }
        : { data: null, error: { message: "not a single row" } }
    }
    return { data: projected, error: null, count: projected.length }
  }

  const builder = {
    select(columns?: string, options?: { head?: boolean }) {
      state.columns = columns ?? "*"
      state.head = Boolean(options?.head)
      return builder
    },
    insert(payload: Row) {
      state.op = "insert"
      state.payload = payload
      return builder
    },
    delete() {
      state.op = "delete"
      return builder
    },
    update(payload: Row) {
      state.op = "update"
      state.payload = payload
      return builder
    },
    eq(column: string, value: unknown) {
      state.filters.push((row) => readPath(row, column) === value)
      return builder
    },
    in(column: string, values: unknown[]) {
      state.filters.push((row) => values.includes(row[column]))
      return builder
    },
    gt(column: string, value: unknown) {
      state.filters.push((row) => String(row[column] ?? "") > String(value))
      return builder
    },
    like(column: string, pattern: string) {
      const prefix = pattern.replace(/%$/, "")
      state.filters.push((row) => String(row[column] ?? "").startsWith(prefix))
      return builder
    },
    order(column: string, options?: { ascending?: boolean }) {
      state.orders.push({ column, ascending: options?.ascending ?? true })
      return builder
    },
    limit(count: number) {
      state.limit = count
      return builder
    },
    single() {
      state.single = true
      return builder
    },
    then<T>(resolve: (value: ReturnType<typeof run>) => T, reject?: (reason: unknown) => T) {
      return Promise.resolve().then(run).then(resolve, reject)
    },
  }
  return builder
}

vi.mock("server-only", () => ({}))
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ from: (table: string) => createBuilder(table) }),
}))
vi.mock("@/lib/admin-auth", () => ({ verifyAdmin: vi.fn(async () => null) }))
vi.mock("@/lib/portal/portal-context", () => ({
  requirePortalContext,
  isErrorResponse: (value: unknown) => value instanceof NextResponse,
}))
vi.mock("@/lib/portal/portal-authorize", () => ({
  authorizeForAccount: vi.fn(() => undefined),
  getActorInfo: vi.fn(() => ({ actor_user_id: "admin-1", actor_role: "admin" })),
}))
vi.mock("@/lib/portal/repositories/deals", () => ({
  getDeal: vi.fn(async (id: string) => db.tables.deals?.find((deal) => deal.id === id) ?? null),
  updateDeal: vi.fn(),
}))
vi.mock("@/lib/portal/repositories/quote-documents", () => ({
  getQuoteDocument: vi.fn(async (id: string) => db.tables.quote_documents?.find((doc) => doc.id === id) ?? null),
}))
vi.mock("@/lib/portal/repositories/activity", () => ({
  logActivity: vi.fn(),
  getLatestAcceptedQuoteInteraction: vi.fn(async () => null),
}))
vi.mock("@/lib/repositories/crm-tasks", () => ({
  completeCrmTask: vi.fn(),
  listActiveTasksForDealByType: vi.fn(async () => []),
}))

import { POST as convert } from "@/app/api/portal/quotes/[id]/convert/route"
import { GET as listContractsTab, POST as createContractRoute } from "@/app/api/admin/contracts/route"
import { applySignature, createContractDocument } from "@/lib/portal/repositories/contract-documents"
import { generateContractNumber } from "@/lib/contract-number"

const convertQuote = (id: string) =>
  convert(new NextRequest(`https://classin.kr/api/portal/quotes/${id}/convert`, { method: "POST" }), {
    params: Promise.resolve({ id }),
  })
const getContractsTab = (query = "") =>
  listContractsTab(new NextRequest(`https://classin.kr/api/admin/contracts${query}`))

beforeEach(() => {
  db.seq = 0
  db.failTables.clear()
  db.failUpdateTables.clear()
  db.forcedConflicts = {}
  db.uniqueColumns = { contracts: "contract_number", contract_documents: "contract_number" }
  db.tables = {
    contracts: [
      {
        id: "v1_1",
        partner_id: "partner_1",
        contract_number: "C-2026-001",
        title: "직접 작성 계약",
        status: "draft",
        created_at: "2026-11-01T00:00:00.000Z",
      },
    ],
    customers: [{ id: "cust_1", name: "한빛학원" }],
    deals: [
      { id: "deal_1", title: "86형 전자칠판 4대", customer_id: "cust_1", partner_account_id: "pa_1", current_stage: "contract" },
    ],
    quote_documents: [
      { id: "qd_1", deal_id: "deal_1", quote_number: "Q-2026-014", status: "accepted", current_version_id: "qv_1", deleted_at: null },
    ],
    quote_document_versions: [
      {
        id: "qv_1",
        quote_document_id: "qd_1",
        version_number: 1,
        title: "한빛학원 전자칠판 견적",
        content_html: "<p>견적 본문</p>",
        structured_json: { items: [{ name: "86형 전자칠판", quantity: 4 }] },
        total_amount: 17_600_000,
        valid_until: "2026-12-31",
      },
    ],
  }
  requirePortalContext.mockResolvedValue({ type: "admin", scope: "all", userId: "admin-1", name: "영업 담당", role: "ADMIN" })
})

describe("견적 계약 전환 → 계약서 탭 목록", () => {
  it("전환 전에는 직접 작성 계약만 있고, 전환하면 그 계약이 목록 응답에 들어 있다", async () => {
    const before = await (await getContractsTab()).json()
    expect(before.contracts).toHaveLength(1)
    expect(before.convertedContracts).toEqual([])

    const converted = await convertQuote("qd_1")
    expect(converted.status).toBe(201)
    const { contract } = await converted.json()

    const response = await getContractsTab()
    expect(response.status).toBe(200)
    const after = await response.json()

    // 직접 작성(V1) 계약은 그대로 — ReceiptsPanel 등 기존 소비처의 계약(contracts 키)이 바뀌지 않는다.
    expect(after.contracts.map((row: Row) => row.id)).toEqual(["v1_1"])
    expect(after.convertedContractsError).toBeNull()
    expect(after.convertedContracts).toEqual([
      expect.objectContaining({
        id: contract.id,
        contract_number: contract.contract_number,
        status: "draft",
        deal_id: "deal_1",
        deal_title: "86형 전자칠판 4대",
        customer_name: "한빛학원",
        title: "한빛학원 전자칠판 견적",
        total_amount: 17_600_000,
        valid_until: "2026-12-31",
        version_number: 1,
        source_quote_document_id: "qd_1",
        source_quote_number: "Q-2026-014",
      }),
    ])
    // 목록에는 본문·견적 스냅샷 전체를 싣지 않는다.
    expect(after.convertedContracts[0]).not.toHaveProperty("content_html")
    expect(after.convertedContracts[0]).not.toHaveProperty("structured_json")
  })

  it("다시 전환하면 409 로 거절하고, 만들어진 계약 번호와 계약서 탭을 안내한다", async () => {
    const { contract } = await (await convertQuote("qd_1")).json()

    const again = await convertQuote("qd_1")
    expect(again.status).toBe(409)
    const body = await again.json()
    expect(body.contract_number).toBe(contract.contract_number)
    expect(body.error).toContain(contract.contract_number)
    expect(body.error).toContain("계약서 탭")

    expect((await (await getContractsTab()).json()).convertedContracts).toHaveLength(1)
  })

  it("전환 없이 보관만 한 견적은 '이미 전환됨'이라고 단정하지 않는다", async () => {
    db.tables.quote_documents[0].status = "archived"

    const response = await convertQuote("qd_1")
    expect(response.status).toBe(409)
    const body = await response.json()
    expect(body.contract_number).toBeNull()
    expect(body.error).toContain("보관된 견적")
  })

  it("V1 파트너로 좁힌 조회에는 전환 계약을 넣지 않는다(딜·고객 기준이라 partner_id 가 없다)", async () => {
    await convertQuote("qd_1")
    const body = await (await getContractsTab("?partner_id=partner_1")).json()
    expect(body.contracts).toHaveLength(1)
    expect(body.convertedContracts).toEqual([])
  })

  it("전환 계약 조회가 실패해도 직접 작성 계약은 돌려주고 실패를 응답에 남긴다", async () => {
    await convertQuote("qd_1")
    db.failTables.add("contract_documents")

    const response = await getContractsTab()
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.contracts).toHaveLength(1)
    expect(body.convertedContracts).toEqual([])
    expect(body.convertedContractsError).toBeTruthy()
  })
})

describe("계약 번호 채번", () => {
  it("직접 작성·견적 전환 두 표의 최대 순번 + 1 을 쓴다", async () => {
    const year = new Date().getFullYear()
    db.tables.contracts = [{ id: "a", contract_number: `C-${year}-004` }]
    db.tables.contract_documents = [{ id: "b", contract_number: `C-${year}-007` }]
    expect(await generateContractNumber()).toBe(`C-${year}-008`)
  })

  it("삭제로 중간 번호가 비어도 번호를 재사용하지 않고, 999 를 넘어도 숫자 최댓값을 쓴다", async () => {
    const year = new Date().getFullYear()
    db.tables.contracts = [
      { id: "a", contract_number: `C-${year}-001` },
      { id: "b", contract_number: `C-${year}-005` },
      { id: "c", contract_number: `C-${year}-999` },
    ]
    db.tables.contract_documents = [{ id: "d", contract_number: `C-${year}-1000` }]
    expect(await generateContractNumber()).toBe(`C-${year}-1001`)
  })

  it("전환 계약과 직접 작성 계약이 같은 번호를 받지 않는다", async () => {
    const year = new Date().getFullYear()
    db.tables.contracts = [{ id: "a", contract_number: `C-${year}-001` }]
    const { contract } = await (await convertQuote("qd_1")).json()
    expect(contract.contract_number).toBe(`C-${year}-002`)
  })

  it("V2 생성이 번호 충돌(23505)을 만나면 새 번호로 다시 시도한다", async () => {
    const year = new Date().getFullYear()
    db.tables.contracts = []
    db.forcedConflicts.contract_documents = 1 // 채번 직후 다른 요청이 같은 번호를 먼저 넣은 상황

    const doc = await createContractDocument({ deal_id: "deal_1", status: "draft", current_version_id: null, created_by: null })
    expect(doc.contract_number).toBe(`C-${year}-001`)
    expect(db.forcedConflicts.contract_documents).toBe(0)
  })

  it("계속 충돌하면 3번까지만 시도하고 실패한다", async () => {
    db.forcedConflicts.contract_documents = 10

    await expect(
      createContractDocument({ deal_id: "deal_1", status: "draft", current_version_id: null, created_by: null })
    ).rejects.toMatchObject({ code: "23505" })
    expect(db.forcedConflicts.contract_documents).toBe(7)
    expect(db.tables.contract_documents ?? []).toHaveLength(0)
  })

  it("직접 작성 POST 도 번호 충돌 시 새 번호로 재시도한다", async () => {
    const year = new Date().getFullYear()
    db.tables.contracts = []
    db.forcedConflicts.contracts = 1

    const response = await createContractRoute(
      new NextRequest("https://classin.kr/api/admin/contracts", {
        method: "POST",
        body: JSON.stringify({ title: "직접 작성", partner_id: "partner_1" }),
      })
    )
    expect(response.status).toBe(201)
    expect((await response.json()).contract.contract_number).toBe(`C-${year}-001`)
  })
})

describe("견적 전환 원자성·멱등성·동의 검사", () => {
  it("견적 보관 업데이트가 실패하면 만든 계약을 되돌리고 500 을 준다", async () => {
    db.failUpdateTables.add("quote_documents")

    const response = await convertQuote("qd_1")
    expect(response.status).toBe(500)
    expect(db.tables.contract_documents ?? []).toHaveLength(0)
    expect(db.tables.contract_document_versions ?? []).toHaveLength(0)
    expect(db.tables.quote_documents[0].status).toBe("accepted")
  })

  it("버전 생성이 실패하면 만든 계약 문서를 지운다", async () => {
    db.failTables.add("contract_document_versions")

    const response = await convertQuote("qd_1")
    expect(response.status).toBe(500)
    expect(db.tables.contract_documents ?? []).toHaveLength(0)
  })

  it("accepted 상태여도 이미 계약이 있으면 409 로 번호를 안내한다(archived 로 바뀌지 않은 경우)", async () => {
    const { contract } = await (await convertQuote("qd_1")).json()
    db.tables.quote_documents[0].status = "accepted"

    const again = await convertQuote("qd_1")
    expect(again.status).toBe(409)
    const body = await again.json()
    expect(body.contract_number).toBe(contract.contract_number)
    expect(body.error).toContain("계약서 탭")
    expect(db.tables.contract_documents).toHaveLength(1)
  })

  it("고객이 동의하지 않은 견적은 409 로 거절하고 계약을 만들지 않는다", async () => {
    db.tables.quote_documents[0].status = "shared"

    const response = await convertQuote("qd_1")
    expect(response.status).toBe(409)
    expect((await response.json()).error).toBe("고객이 동의한 견적만 계약으로 전환할 수 있습니다.")
    expect(db.tables.contract_documents ?? []).toHaveLength(0)
  })
})

describe("applySignature — 버전 sign_status", () => {
  it("양측 서명이 모두 있으면 서명 순서와 무관하게 completed, 한쪽만이면 서명한 쪽 상태", async () => {
    db.tables.contract_document_versions = [{ id: "cv_1", partner_signed_at: null, admin_signed_at: null, sign_status: "draft" }]

    const first = await applySignature("cv_1", "a.png", "admin")
    expect(first.sign_status).toBe("admin_signed")
    const second = await applySignature("cv_1", "p.png", "partner")
    expect(second.sign_status).toBe("completed")
    expect(db.tables.contract_document_versions[0].sign_status).toBe("completed")
  })
})
