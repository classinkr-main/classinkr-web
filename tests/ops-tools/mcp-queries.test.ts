/**
 * MCP 전용 딜·견적 조회(lib/portal/repositories/mcp-queries.ts) — 가짜 저장소.
 * 가짜는 PostgREST 처럼 한 번 응답을 1000행으로 조용히 자르고(range 없을 때), 조건·정렬·limit·in·range 를 실제로 적용한다.
 * 호출 기록으로 조건이 DB 질의로 내려갔는지와 in() id 가 100개를 넘지 않는지를 본다.
 */
import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }))

import { MCP_ID_CHUNK, MCP_SCAN_CAP, likePattern, searchDealsForMcp, searchQuotesForMcp } from "@/lib/portal/repositories/mcp-queries"

type Row = Record<string, unknown>
type Op = { op: string; args: unknown[] }
type Call = { table: string; select: string; ops: Op[]; rows: number }

const getPath = (row: Row, path: string): unknown => {
  // "a->b->>c" 와 "a.b" 형태는 쓰지 않는다 — 단순 열만
  return row[path]
}

/** PostgREST ilike 처럼 — % 와 * 는 여러 글자, _ 는 한 글자, \ 다음 글자는 그대로. 대소문자 무시 */
function likeToRegExp(pattern: string): RegExp {
  const escapeRe = (c: string) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  let re = ""
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]
    if (ch === "\\" && i + 1 < pattern.length) re += escapeRe(pattern[++i])
    else if (ch === "%" || ch === "*") re += "[\\s\\S]*"
    else if (ch === "_") re += "[\\s\\S]"
    else re += escapeRe(ch)
  }
  return new RegExp(`^${re}$`, "i")
}

function makeDb(tables: Record<string, Row[]>) {
  const calls: Call[] = []
  const db = {
    from(table: string) {
      const ops: Op[] = []
      let select = ""
      const q: Record<string, unknown> = {
        select: (s: string) => {
          select = s
          return q
        },
      }
      const add = (op: string) => (...args: unknown[]) => {
        ops.push({ op, args })
        return q
      }
      for (const op of ["eq", "in", "ilike", "gte", "lte", "is", "not", "order", "limit", "range"]) q[op] = add(op)
      q.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
        try {
          let rows = [...(tables[table] ?? [])]
          if (table === "deals" && select.includes("customers!inner")) {
            rows = rows
              .map((d) => ({ ...d, customers: (tables.customers ?? []).find((c) => c.id === d.customer_id) ?? null }))
              .filter((d) => d.customers)
          }
          if (table === "quote_document_versions") {
            // template_id·vat_included 별칭은 가짜가 채우지 않는다
          }
          let order: { col: string; asc: boolean } | null = null
          let limit: number | null = null
          let range: [number, number] | null = null
          for (const { op, args } of ops) {
            const [col, val] = args as [string, unknown]
            if (op === "eq") rows = rows.filter((r) => getPath(r, col) === val)
            else if (op === "in") {
              expect((val as unknown[]).length).toBeLessThanOrEqual(MCP_ID_CHUNK)
              rows = rows.filter((r) => (val as unknown[]).includes(getPath(r, col)))
            } else if (op === "ilike") {
              const re = likeToRegExp(String(val))
              rows = rows.filter((r) => re.test(String(getPath(r, col) ?? "")))
            } else if (op === "gte") rows = rows.filter((r) => String(getPath(r, col)) >= String(val))
            else if (op === "lte") rows = rows.filter((r) => String(getPath(r, col)) <= String(val))
            else if (op === "is") rows = rows.filter((r) => (getPath(r, col) ?? null) === val)
            else if (op === "order") order = { col, asc: (args[1] as { ascending: boolean }).ascending }
            else if (op === "limit") limit = col as unknown as number
            else if (op === "range") range = [col as unknown as number, val as number]
          }
          if (order) {
            const o = order
            rows.sort((a, b) => (String(a[o.col]) < String(b[o.col]) ? -1 : String(a[o.col]) > String(b[o.col]) ? 1 : 0) * (o.asc ? 1 : -1))
          }
          if (range) rows = rows.slice(range[0], range[1] + 1)
          else rows = rows.slice(0, Math.min(limit ?? 1000, 1000)) // PostgREST 는 조용히 1000행에서 자른다
          calls.push({ table, select, ops, rows: rows.length })
          return Promise.resolve({ data: rows, error: null }).then(resolve, reject)
        } catch (e) {
          return Promise.reject(e).then(resolve, reject)
        }
      }
      return q
    },
  }
  return { db, calls }
}

const iso = (n: number) => new Date(Date.UTC(2026, 0, 1) + n * 60_000).toISOString() // n 이 클수록 최근

function seedDeals(count: number) {
  const customers: Row[] = [
    { id: "c-alpha", name: "알파학원", campus_name: "본원", region_label: "서울" },
    { id: "c-beta", name: "베타학원", campus_name: "분원", region_label: "부산" },
  ]
  const deals: Row[] = Array.from({ length: count }, (_, i) => ({
    id: `d-${String(i).padStart(5, "0")}`,
    title: `딜 ${i}`,
    status: "open",
    current_stage: "lead",
    owner_id: null,
    updated_at: iso(i),
    customer_id: i % 2 === 0 ? "c-alpha" : "c-beta",
  }))
  return { customers, deals }
}

describe("딜 조회", () => {
  it("검색어·기간·limit 이 DB 질의로 내려가고 limit+1 행만 읽는다", async () => {
    const { db, calls } = makeDb({ ...seedDeals(50), admin_profiles: [] })
    const r = await searchDealsForMcp({ query: "알파", updatedFrom: "2026-01-01", updatedTo: "2026-01-02", limit: 5 }, db)
    expect(r.items).toHaveLength(5)
    expect(r.more).toBe(true)
    const dealCalls = calls.filter((c) => c.table === "deals")
    expect(dealCalls.length).toBeGreaterThan(0)
    for (const c of dealCalls) {
      expect(c.ops).toContainEqual({ op: "limit", args: [6] })
      expect(c.ops.some((o) => o.op === "gte")).toBe(true)
      expect(c.ops.some((o) => o.op === "lte")).toBe(true)
    }
    expect(calls.some((c) => c.table === "customers" && c.ops.some((o) => o.op === "ilike"))).toBe(true)
    // 알파학원(짝수 번 딜)만, 최근 갱신순
    expect(r.items.every((d) => d.customer_name === "알파학원")).toBe(true)
    const times = r.items.map((d) => d.updated_at)
    expect([...times].sort().reverse()).toEqual(times)
  })

  it("딜 1,500개에서도 오래된 딜이 조용히 빠지지 않는다 — 검색어가 오래된 딜 하나를 가리키면 찾고, 더 있으면 more", async () => {
    const seed = seedDeals(1500)
    const { db } = makeDb({ ...seed, admin_profiles: [] })
    // 가장 오래된 딜(0번) 제목으로 찾기 — 전체를 읽어 메모리에서 거르던 때는 1000행에서 잘려 못 찾았다
    const found = await searchDealsForMcp({ query: "딜 0", limit: 30 }, db)
    expect(found.items.map((d) => d.id)).toContain("d-00000")
    // 제목 일부가 많은 딜에 맞으면 limit 만큼 + more
    const many = await searchDealsForMcp({ query: "딜", limit: 100 }, db)
    expect(many.items).toHaveLength(100)
    expect(many.more).toBe(true)
    // 조건에 맞는 것이 limit 이하면 more 가 아니다
    const few = await searchDealsForMcp({ query: "딜 1499", limit: 30 }, db)
    expect(few.items).toHaveLength(1)
    expect(few.more).toBe(false)
  })

  it("고객 id 가 100개를 넘어도 in() 은 100개씩 나뉜다", async () => {
    const customers: Row[] = Array.from({ length: 250 }, (_, i) => ({ id: `c-${i}`, name: `체인학원 ${i}`, campus_name: null, region_label: null }))
    const deals: Row[] = customers.map((c, i) => ({ id: `d-${i}`, title: `t${i}`, status: "open", current_stage: "lead", owner_id: null, updated_at: iso(i), customer_id: c.id }))
    const { db, calls } = makeDb({ customers, deals, admin_profiles: [] })
    const r = await searchDealsForMcp({ query: "체인학원", limit: 100 }, db)
    expect(r.items).toHaveLength(100)
    expect(r.more).toBe(true)
    const inCalls = calls.filter((c) => c.table === "deals" && c.ops.some((o) => o.op === "in"))
    expect(inCalls).toHaveLength(3) // 250 → 100+100+50
    for (const c of inCalls) for (const o of c.ops) if (o.op === "in") expect((o.args[1] as unknown[]).length).toBeLessThanOrEqual(100)
  })

  it("검색어 속 * 는 글자 그대로다 — PostgREST 가 ilike 의 * 를 % 로 읽어도 결과는 전처럼 포함 검색(반박 검토 2026-11-25)", async () => {
    const { db } = makeDb({ ...seedDeals(20), admin_profiles: [] })
    // DB 는 '딜*1' 을 '딜%1' 로 읽어 '딜 1'·'딜 11' 을 돌려주지만, 전에는 글자 그대로 '딜*1' 을 찾아 아무것도 없었다
    const r = await searchDealsForMcp({ query: "딜*1", limit: 10 }, db)
    expect(r.items).toEqual([])
    const star = makeDb({ customers: [{ id: "c-s", name: "별*학원", campus_name: null, region_label: null }], deals: [{ id: "d-s", title: "별 딜", status: "open", current_stage: "lead", owner_id: null, updated_at: iso(1), customer_id: "c-s" }], admin_profiles: [] })
    expect((await searchDealsForMcp({ query: "별*학", limit: 10 }, star.db)).items.map((d) => d.id)).toEqual(["d-s"])
  })

  it("검색어 속 % _ 는 글자 그대로 찾는다", () => {
    expect(likePattern("a%b_c\\d")).toBe("%a\\%b\\_c\\\\d%")
  })
})

function seedQuotes(dealCount: number, quotesPerDeal = 1) {
  const { customers, deals } = seedDeals(dealCount)
  const docs: Row[] = []
  const versions: Row[] = []
  let n = 0
  for (const d of deals) {
    for (let k = 0; k < quotesPerDeal; k++) {
      const id = `q-${String(n).padStart(5, "0")}`
      docs.push({ id, deal_id: d.id, quote_number: `Q-${String(n).padStart(5, "0")}`, current_version_id: `v-${id}`, status: n % 3 === 0 ? "sent" : "draft", updated_at: iso(n), deleted_at: null })
      versions.push({ id: `v-${id}`, quote_document_id: id, version_number: 1, title: `견적 ${n}`, subtotal: 100, discount_amount: 0, tax_amount: 10, total_amount: 110 })
      n++
    }
  }
  return { customers, deals, quote_documents: docs, quote_document_versions: versions, quote_document_shares: [], activity_logs: [] }
}

describe("견적 조회", () => {
  it("상태·기간·limit 이 DB 질의로 내려가고 limit+1 행만 읽는다(검색어 없음)", async () => {
    const { db, calls } = makeDb(seedQuotes(300))
    const r = await searchQuotesForMcp({ status: "sent", updatedFrom: "2026-01-01", limit: 10 }, db)
    expect(r.items).toHaveLength(10)
    expect(r.more).toBe(true)
    expect(r.items.every((d) => d.status === "sent" && d.kind === "quote")).toBe(true)
    const docCall = calls.find((c) => c.table === "quote_documents")!
    expect(docCall.ops).toContainEqual({ op: "eq", args: ["status", "sent"] })
    expect(docCall.ops).toContainEqual({ op: "limit", args: [11] })
    expect(docCall.ops.some((o) => o.op === "gte")).toBe(true)
    expect(docCall.ops).toContainEqual({ op: "is", args: ["deleted_at", null] })
    expect(docCall.rows).toBeLessThanOrEqual(11)
  })

  it("딜 1,500개·견적 1,500개에서 오래된 견적도 번호로 찾고, 모든 in() 은 100개 이하", async () => {
    const { db, calls } = makeDb(seedQuotes(1500))
    const r = await searchQuotesForMcp({ query: "Q-00000", limit: 30 }, db)
    expect(r.items.map((d) => d.document_number)).toContain("Q-00000")
    // 고객명으로 찾으면 알파학원 딜 750개 → 후보 상한에서 멈추고 more 로 알린다(조용히 자르지 않는다)
    const byCustomer = await searchQuotesForMcp({ query: "알파학원", limit: 30 }, db)
    expect(byCustomer.items).toHaveLength(30)
    expect(byCustomer.more).toBe(true)
    for (const c of calls) for (const o of c.ops) if (o.op === "in") expect((o.args[1] as unknown[]).length).toBeLessThanOrEqual(MCP_ID_CHUNK)
    expect(MCP_SCAN_CAP).toBeLessThanOrEqual(1000)
  })

  it("결과 항목은 기존 문서 목록과 같은 칸을 가진다", async () => {
    const { db } = makeDb(seedQuotes(3))
    const r = await searchQuotesForMcp({ limit: 5 }, db)
    expect(r.more).toBe(false)
    expect(Object.keys(r.items[0]).sort()).toEqual(
      [
        "id", "kind", "deal_id", "customer_id", "customer_name", "deal_title", "document_number", "title", "template_id", "status", "version_count",
        "total_amount", "subtotal", "discount_amount", "tax_amount", "vat_included", "updated_at", "latest_version_number", "share_count",
        "latest_share_created_at", "view_count", "last_viewed_at", "review_confirmed_at", "accepted_at", "pdf_url",
      ].sort()
    )
    expect(r.items[0]).toMatchObject({ kind: "quote", title: expect.stringMatching(/^견적 /), total_amount: 110, version_count: 1, share_count: 0 })
  })

  it("삭제된 견적은 빠지고, deal_id 로 한 딜만 본다", async () => {
    const seed = seedQuotes(4)
    ;(seed.quote_documents[3] as Row).deleted_at = "2026-02-01T00:00:00Z"
    const { db } = makeDb(seed)
    const all = await searchQuotesForMcp({ limit: 10 }, db)
    expect(all.items.map((d) => d.id)).not.toContain("q-00003")
    const one = await searchQuotesForMcp({ dealId: "d-00001", limit: 10 }, db)
    expect(one.items.map((d) => d.id)).toEqual(["q-00001"])
  })

  it("현재 버전 제목이 비어 기본 제목 '견적서' 로 보이는 견적도 '견적서' 로 찾는다(반박 검토 2026-11-25)", async () => {
    const seed = seedQuotes(3)
    ;(seed.quote_document_versions[1] as Row).title = null
    const { db } = makeDb(seed)
    const r = await searchQuotesForMcp({ query: "견적서", limit: 10 }, db)
    expect(r.items.map((d) => d.id)).toEqual(["q-00001"])
    expect(r.items[0].title).toBe("견적서")
    // 옛 버전 제목만 비어 있고 현재 버전에 제목이 있으면 맞지 않는다
    seed.quote_document_versions.push({ id: "v-old-null", quote_document_id: "q-00002", version_number: 0, title: null, subtotal: 1, discount_amount: 0, tax_amount: 0, total_amount: 1 })
    const again = await searchQuotesForMcp({ query: "견적서", limit: 10 }, makeDb(seed).db)
    expect(again.items.map((d) => d.id)).toEqual(["q-00001"])
  })

  it("현재 버전 제목이 아닌 옛 버전 제목만 맞는 견적은 거른다", async () => {
    const seed = seedQuotes(2)
    seed.quote_document_versions.push({ id: "v-old", quote_document_id: "q-00000", version_number: 0, title: "옛제목특수", subtotal: 1, discount_amount: 0, tax_amount: 0, total_amount: 1 })
    const { db } = makeDb(seed)
    const r = await searchQuotesForMcp({ query: "옛제목특수", limit: 10 }, db)
    expect(r.items).toHaveLength(0)
  })
})
