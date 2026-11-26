/**
 * 메모리 위의 가짜 Supabase(PostgREST) — 상담 전환·피드백·CRM 기록 시험용.
 *
 * - 연산마다 한 틱(setTimeout 0)을 쉬고 적용하므로 Promise.all 로 띄운 두 요청이 실제처럼 서로 끼어든다.
 * - update 는 필터를 적용 순간에 다시 평가한다(PostgreSQL READ COMMITTED 의 조건부 갱신과 같은 결과).
 * - 유니크·check 제약을 표별로 흉내 낸다. 'payload->a->b' 같은 JSON 경로 필터를 읽는다.
 * - hooks.failUpdate 로 특정 갱신을 실패시킬 수 있다(보낸 뒤 상태 기록 실패 재현).
 */

type Row = Record<string, unknown>
type DbError = { code: string; message: string }

export interface FakeStoreOptions {
  /** 표 → 유니크 칸 묶음. */
  unique?: Record<string, string[][]>
  /** 표 → status 칸이 가질 수 있는 값(check 제약). */
  statusCheck?: Record<string, string[]>
  /** 부분 유니크(조건을 만족하는 행끼리만). */
  partialUnique?: Record<string, Array<{ columns: string[]; where: (row: Row) => boolean }>>
}

export interface FakeStoreHooks {
  failUpdate?: (table: string, patch: Row, row: Row) => DbError | null
}

function readPath(row: Row, column: string): unknown {
  const parts = column.split("->")
  let value: unknown = row[parts[0]]
  for (const key of parts.slice(1)) {
    if (!value || typeof value !== "object") return null
    value = (value as Record<string, unknown>)[key]
  }
  return value ?? null
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

let idCounter = 0

export function createFakeSupabase(seed: Record<string, Row[]> = {}, options: FakeStoreOptions = {}) {
  const tables: Record<string, Row[]> = {}
  for (const [name, rows] of Object.entries(seed)) tables[name] = rows.map((row) => ({ ...row }))
  const hooks: FakeStoreHooks = {}
  const table = (name: string) => (tables[name] ??= [])

  function violates(name: string, candidate: Row, ignore?: Row): DbError | null {
    const allowed = options.statusCheck?.[name]
    if (allowed && "status" in candidate && !allowed.includes(String(candidate.status))) {
      return { code: "23514", message: `new row violates check constraint "${name}_status_check"` }
    }
    for (const columns of options.unique?.[name] ?? []) {
      const clash = table(name).some(
        (row) => row !== ignore && columns.every((column) => row[column] === candidate[column])
      )
      if (clash) return { code: "23505", message: `duplicate key value violates unique constraint (${columns.join(",")})` }
    }
    for (const rule of options.partialUnique?.[name] ?? []) {
      if (!rule.where(candidate)) continue
      const clash = table(name).some(
        (row) => row !== ignore && rule.where(row) && rule.columns.every((column) => row[column] === candidate[column])
      )
      if (clash) return { code: "23505", message: `duplicate key value violates unique constraint (${rule.columns.join(",")})` }
    }
    return null
  }

  class Query implements PromiseLike<{ data: unknown; error: DbError | null }> {
    private op: "select" | "insert" | "update" | "delete" = "select"
    private filters: Array<(row: Row) => boolean> = []
    private orders: Array<{ column: string; ascending: boolean }> = []
    private limitCount: number | null = null
    private values: Row | Row[] | null = null
    private returning = false

    constructor(private readonly name: string) {}

    select() {
      if (this.op !== "select") this.returning = true
      return this
    }
    insert(values: Row | Row[]) {
      this.op = "insert"
      this.values = values
      return this
    }
    update(values: Row) {
      this.op = "update"
      this.values = values
      return this
    }
    delete() {
      this.op = "delete"
      return this
    }
    eq(column: string, value: unknown) {
      this.filters.push((row) => readPath(row, column) === value)
      return this
    }
    in(column: string, values: unknown[]) {
      this.filters.push((row) => values.includes(readPath(row, column)))
      return this
    }
    is(column: string, value: null) {
      this.filters.push((row) => readPath(row, column) === value)
      return this
    }
    not(column: string, operator: string, value: unknown) {
      if (operator !== "is") throw new Error(`fake not(${operator}) unsupported`)
      this.filters.push((row) => readPath(row, column) !== value)
      return this
    }
    lt(column: string, value: string | number) {
      this.filters.push((row) => {
        const current = readPath(row, column)
        return current !== null && (current as string | number) < value
      })
      return this
    }
    gte(column: string, value: string | number) {
      this.filters.push((row) => {
        const current = readPath(row, column)
        return current !== null && (current as string | number) >= value
      })
      return this
    }
    order(column: string, options: { ascending?: boolean } = {}) {
      this.orders.push({ column, ascending: options.ascending !== false })
      return this
    }
    limit(count: number) {
      this.limitCount = count
      return this
    }
    async maybeSingle() {
      const { data, error } = await this.execute()
      if (error) return { data: null, error }
      const rows = data as Row[]
      if (rows.length > 1) return { data: null, error: { code: "PGRST116", message: "multiple rows" } }
      return { data: rows[0] ?? null, error: null }
    }
    async single() {
      const { data, error } = await this.execute()
      if (error) return { data: null, error }
      const rows = data as Row[]
      if (rows.length !== 1) return { data: null, error: { code: "PGRST116", message: "not single" } }
      return { data: rows[0], error: null }
    }
    then<TResult1 = { data: unknown; error: DbError | null }, TResult2 = never>(
      onfulfilled?: ((value: { data: unknown; error: DbError | null }) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
    ) {
      return this.execute().then(onfulfilled, onrejected)
    }

    private matching() {
      let rows = table(this.name).filter((row) => this.filters.every((filter) => filter(row)))
      for (const { column, ascending } of [...this.orders].reverse()) {
        rows = [...rows].sort((a, b) => {
          const left = readPath(a, column) as string | number
          const right = readPath(b, column) as string | number
          if (left === right) return 0
          if (left === null) return 1
          if (right === null) return -1
          return (left < right ? -1 : 1) * (ascending ? 1 : -1)
        })
      }
      if (this.limitCount !== null) rows = rows.slice(0, this.limitCount)
      return rows
    }

    private async execute(): Promise<{ data: unknown; error: DbError | null }> {
      await tick()
      const now = new Date().toISOString()
      if (this.op === "select") {
        return { data: this.matching().map((row) => ({ ...row })), error: null }
      }
      if (this.op === "insert") {
        const inserted: Row[] = []
        for (const value of Array.isArray(this.values) ? this.values : [this.values as Row]) {
          const row: Row = {
            id: `row-${++idCounter}`,
            created_at: now,
            updated_at: now,
            ...(this.name === "chatbot_channel_handoffs"
              ? { attempt_count: 0, last_error: null, payload: {}, status: "pending" }
              : {}),
            ...value,
          }
          const error = violates(this.name, row)
          if (error) return { data: null, error }
          table(this.name).push(row)
          inserted.push({ ...row })
        }
        return { data: this.returning ? inserted : null, error: null }
      }
      if (this.op === "delete") {
        const doomed = new Set(this.matching())
        tables[this.name] = table(this.name).filter((row) => !doomed.has(row))
        return { data: null, error: null }
      }
      const patch = this.values as Row
      const updated: Row[] = []
      for (const row of this.matching()) {
        const failure = hooks.failUpdate?.(this.name, patch, row)
        if (failure) return { data: null, error: failure }
        const next = { ...row, ...patch, updated_at: (patch.updated_at as string | undefined) ?? now }
        const error = violates(this.name, next, row)
        if (error) return { data: null, error }
        Object.assign(row, next)
        updated.push({ ...row })
      }
      return { data: this.returning ? updated : null, error: null }
    }
  }

  return {
    client: { from: (name: string) => new Query(name) },
    tables,
    hooks,
    rows: (name: string) => table(name),
  }
}

export type FakeSupabase = ReturnType<typeof createFakeSupabase>
