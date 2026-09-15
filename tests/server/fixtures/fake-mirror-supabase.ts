// 미러 오케스트레이터(lib/server/meta-lead-mirror.ts) 테스트용 메모리 Supabase.
// 표·뷰는 행 배열이고, PostgREST 필터(eq·in·gte·lte·lt)·정렬·range·count·서버 1000행 상한을 흉내 낸다.
// RPC 는 테스트가 넘긴 처리기로 돈다. 모든 호출은 calls 에 남는다. 실 DB·네트워크에 닿지 않는다.
// 값은 전부 합성이다(010-0000-xxxx, example.com).

export type Row = Record<string, unknown>
export type FakeError = { message: string; code?: string }
export type Filter = [op: "eq" | "in" | "gte" | "lte" | "lt", column: string, value: unknown]

export type FromCall = {
  kind: "from"
  table: string
  select?: string
  count?: string
  filters: Filter[]
  orders: Array<[string, boolean]>
  range?: [number, number]
  update?: Row
  single?: boolean
}
export type RpcCall = { kind: "rpc"; name: string; args: Record<string, unknown> | undefined }
export type FakeCall = FromCall | RpcCall

export type RpcReply = { data: unknown; error: FakeError | null }

export interface FakeMirrorDbOptions {
  tables?: Record<string, Row[]>
  /** 표 읽기·쓰기 오류(호출마다 판정 가능) */
  errors?: Record<string, FakeError | ((call: FromCall) => FakeError | null)>
  rpc?: Record<string, (args: Record<string, unknown> | undefined) => RpcReply | Promise<RpcReply>>
  /** 서버 max-rows(기본 1000) */
  maxRows?: number
}

function compare(a: unknown, b: unknown): number {
  if (typeof a === "string" && typeof b === "string") {
    const da = Date.parse(a)
    const db = Date.parse(b)
    if (/^\d{4}-\d{2}-\d{2}/.test(a) && /^\d{4}-\d{2}-\d{2}/.test(b) && Number.isFinite(da) && Number.isFinite(db)) {
      return da - db
    }
    return a < b ? -1 : a > b ? 1 : 0
  }
  if (typeof a === "number" && typeof b === "number") return a - b
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0
}

function matches(row: Row, filters: Filter[]) {
  return filters.every(([op, column, value]) => {
    const cell = row[column]
    if (op === "eq") return cell === value
    if (op === "in") return (value as unknown[]).includes(cell)
    if (cell == null) return false
    const order = compare(cell, value)
    if (op === "gte") return order >= 0
    if (op === "lte") return order <= 0
    return order < 0
  })
}

function project(row: Row, select: string | undefined): Row {
  if (!select || select === "*") return { ...row }
  const out: Row = {}
  for (const column of select.split(",").map((item) => item.trim())) out[column] = row[column] ?? null
  return out
}

export function createFakeMirrorDb(options: FakeMirrorDbOptions = {}) {
  const tables: Record<string, Row[]> = { ...(options.tables ?? {}) }
  const calls: FakeCall[] = []
  const maxRows = options.maxRows ?? 1000

  function errorFor(call: FromCall): FakeError | null {
    const source = options.errors?.[call.table]
    if (!source) return null
    return typeof source === "function" ? source(call) : source
  }

  function runSelect(call: FromCall) {
    const error = errorFor(call)
    if (error) return { data: null, error, count: null }
    const rows = (tables[call.table] ?? []).filter((row) => matches(row, call.filters))
    const sorted = [...rows].sort((left, right) => {
      for (const [column, ascending] of call.orders) {
        const order = compare(left[column], right[column])
        if (order !== 0) return ascending ? order : -order
      }
      return 0
    })
    const count = call.count === "exact" ? sorted.length : null
    let page = sorted
    if (call.range) page = sorted.slice(call.range[0], call.range[1] + 1)
    page = page.slice(0, maxRows)
    if (call.single) return { data: page[0] ? project(page[0], call.select) : null, error: null }
    return { data: page.map((row) => project(row, call.select)), error: null, count }
  }

  function runUpdate(call: FromCall) {
    const error = errorFor(call)
    if (error) return { data: null, error }
    for (const row of tables[call.table] ?? []) {
      if (matches(row, call.filters)) Object.assign(row, call.update)
    }
    return { data: null, error: null }
  }

  const client = {
    from(table: string) {
      const call: FromCall = { kind: "from", table, filters: [], orders: [] }
      calls.push(call)
      const builder = {
        select(columns?: string, selectOptions?: { count?: string }) {
          call.select = columns
          if (selectOptions?.count) call.count = selectOptions.count
          return builder
        },
        update(values: Row) {
          call.update = values
          return builder
        },
        eq(column: string, value: unknown) {
          call.filters.push(["eq", column, value])
          return builder
        },
        in(column: string, values: unknown[]) {
          call.filters.push(["in", column, [...values]])
          return builder
        },
        gte(column: string, value: unknown) {
          call.filters.push(["gte", column, value])
          return builder
        },
        lte(column: string, value: unknown) {
          call.filters.push(["lte", column, value])
          return builder
        },
        lt(column: string, value: unknown) {
          call.filters.push(["lt", column, value])
          return builder
        },
        order(column: string, orderOptions?: { ascending?: boolean }) {
          call.orders.push([column, orderOptions?.ascending !== false])
          return builder
        },
        range(from: number, to: number) {
          call.range = [from, to]
          return builder
        },
        abortSignal() {
          return builder
        },
        maybeSingle() {
          call.single = true
          return builder
        },
        then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
          const result = call.update ? runUpdate(call) : runSelect(call)
          return Promise.resolve(result).then(onFulfilled, onRejected)
        },
      }
      return builder
    },
    rpc(name: string, args?: Record<string, unknown>) {
      const call: RpcCall = { kind: "rpc", name, args: args ? JSON.parse(JSON.stringify(args)) : undefined }
      calls.push(call)
      const builder = {
        abortSignal() {
          return builder
        },
        then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
          const handler = options.rpc?.[name]
          const reply: Promise<RpcReply> = handler
            ? Promise.resolve().then(() => handler(args))
            : Promise.resolve({ data: null, error: { message: `rpc ${name} 없음`, code: "PGRST202" } })
          return reply.then(onFulfilled, onRejected)
        },
      }
      return builder
    },
  }

  return { client, calls, tables }
}

export function rpcCalls(calls: FakeCall[], name: string) {
  return calls.filter((call): call is RpcCall => call.kind === "rpc" && call.name === name)
}

export function fromCalls(calls: FakeCall[], table: string) {
  return calls.filter((call): call is FromCall => call.kind === "from" && call.table === table)
}

/**
 * meta_lead_mirror_apply 흉내 — 원장 PK·blocked 재시도·skip_reason·숫자 id 검사만(창 판정은 테스트가 넘긴 함수).
 * 실제 SQL 의미는 tests/fixtures/meta-leadgen-single-receiver 의 로컬 PG 시나리오가 검증한다.
 */
export function createApplySimulator(
  ledger: Row[],
  options: {
    eligible?: (receivedAt: string) => boolean
    blockLeadgens?: Set<string>
    now?: () => string
  } = {}
) {
  const insertedRows: Row[] = []
  let sequence = 0
  const handler = (args: Record<string, unknown> | undefined): RpcReply => {
    const rows = (args?.p_rows ?? []) as Row[]
    const out: Row[] = []
    for (const row of rows) {
      const leadgenId = String(row.leadgen_id ?? "")
      const result = (action: string, id: unknown = null) =>
        out.push({ out_leadgen_id: leadgenId, out_action: action, out_public_lead_id: id })
      if (!/^[0-9]+$/.test(leadgenId)) {
        result("invalid")
        continue
      }
      if (options.eligible && !options.eligible(String(row.received_at))) {
        result("outside_window")
        continue
      }
      const existing = ledger.find((entry) => entry.leadgen_id === leadgenId)
      if (existing && !["blocked", "fallback_failed"].includes(String(existing.state))) {
        result(`exists_${existing.state}`, existing.public_lead_id ?? null)
        continue
      }
      const entry: Row = existing ?? { leadgen_id: leadgenId, origin: "compass_mirror", public_lead_id: null, side_effects_done_at: null }
      if (!existing) ledger.push(entry)
      entry.origin = "compass_mirror"
      entry.updated_at = options.now?.() ?? new Date().toISOString()
      if (row.skip_reason) {
        entry.state = "skipped"
        result("skipped")
        continue
      }
      if (options.blockLeadgens?.has(leadgenId)) {
        entry.state = "blocked"
        result("blocked")
        continue
      }
      sequence += 1
      const id = `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`
      entry.state = "inserted"
      entry.public_lead_id = id
      insertedRows.push(row)
      result("inserted", id)
    }
    return { data: out, error: null }
  }
  const mark = (args: Record<string, unknown> | undefined): RpcReply => {
    const ids = (args?.p_leadgen_ids ?? []) as string[]
    let count = 0
    for (const entry of ledger) {
      if (ids.includes(String(entry.leadgen_id)) && entry.state === "inserted" && entry.origin === "compass_mirror" && entry.side_effects_done_at == null) {
        entry.side_effects_done_at = options.now?.() ?? new Date().toISOString()
        count += 1
      }
    }
    return { data: count, error: null }
  }
  return { handler, mark, insertedRows }
}
