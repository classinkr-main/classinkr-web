// 통합 고객 테스트용 가짜 PostgREST — 테이블별 dataset 에 eq/neq/in/is/not/gte/lte 필터와 order 를 적용하고
// range 로 자른 뒤 서버 max-rows 로 한 번 더 자른다(오류 없이 — 실제 PostgREST 와 같다). select 두 번째
// 인자에 count:"exact" 가 있으면 총 행수를 준다. 쿼리 기록(table·select·filters·orders·range)을 남긴다.
//
// tests/helpers/recording-supabase-client.ts 는 not()·maybeSingle() 이 없어 재연락 알림(admin_profiles
// .not(...)) 같은 경로를 못 태운다 — 그래서 이 영역 테스트만 쓰는 작은 사본을 둔다(파일명에 .test 가 없어
// vitest 가 테스트로 실행하지 않는다).

export interface FakeQueryLog {
  table: string
  select: string
  selectOptions: { count?: string } | undefined
  filters: Array<{ op: string; column: string; value: unknown }>
  orders: Array<{ column: string; ascending: boolean; nullsFirst?: boolean }>
  range: { from: number; to: number } | null
  limit: number | null
}

type Row = Record<string, unknown>

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0
  if (a == null) return 1
  if (b == null) return -1
  if (typeof a === "number" && typeof b === "number") return a - b
  return String(a) < String(b) ? -1 : 1
}

export function createFakePostgrest(
  datasets: Record<string, Row[]>,
  options: { maxRows?: number; failTables?: ReadonlySet<string> } = {}
) {
  const maxRows = options.maxRows ?? 1000
  const logs: FakeQueryLog[] = []

  function from(table: string) {
    const log: FakeQueryLog = {
      table,
      select: "",
      selectOptions: undefined,
      filters: [],
      orders: [],
      range: null,
      limit: null,
    }
    logs.push(log)

    const run = () => {
      if (options.failTables?.has(table)) {
        return { data: null, error: { message: `${table} failed`, code: "XX000" }, count: null }
      }
      let rows = [...(datasets[table] ?? [])]
      for (const { op, column, value } of log.filters) {
        if (op === "eq") rows = rows.filter((row) => row[column] === value)
        if (op === "neq") rows = rows.filter((row) => row[column] !== value)
        if (op === "in") rows = rows.filter((row) => (value as unknown[]).includes(row[column]))
        if (op === "gte") rows = rows.filter((row) => row[column] != null && String(row[column]) >= String(value))
        if (op === "lte") rows = rows.filter((row) => row[column] != null && String(row[column]) <= String(value))
        if (op === "is") rows = rows.filter((row) => (value === null ? row[column] == null : row[column] === value))
        if (op === "not.is") rows = rows.filter((row) => (value === null ? row[column] != null : row[column] !== value))
      }
      const total = rows.length
      rows.sort((a, b) => {
        for (const order of log.orders) {
          const result = compare(a[order.column], b[order.column])
          if (result !== 0) return order.ascending ? result : -result
        }
        return 0
      })
      let sliced = rows
      if (log.range) {
        const take = Math.min(log.range.to - log.range.from + 1, maxRows)
        sliced = rows.slice(log.range.from, log.range.from + take)
      } else {
        sliced = rows.slice(0, Math.min(log.limit ?? rows.length, maxRows))
      }
      return { data: sliced, error: null, count: log.selectOptions?.count === "exact" ? total : null }
    }

    const builder = {
      select(columns = "*", selectOptions?: { count?: string }) {
        log.select = columns
        log.selectOptions = selectOptions
        return builder
      },
      eq(column: string, value: unknown) {
        log.filters.push({ op: "eq", column, value })
        return builder
      },
      neq(column: string, value: unknown) {
        log.filters.push({ op: "neq", column, value })
        return builder
      },
      in(column: string, value: unknown) {
        log.filters.push({ op: "in", column, value })
        return builder
      },
      is(column: string, value: unknown) {
        log.filters.push({ op: "is", column, value })
        return builder
      },
      not(column: string, operator: string, value: unknown) {
        log.filters.push({ op: `not.${operator}`, column, value })
        return builder
      },
      gte(column: string, value: unknown) {
        log.filters.push({ op: "gte", column, value })
        return builder
      },
      lte(column: string, value: unknown) {
        log.filters.push({ op: "lte", column, value })
        return builder
      },
      or(expression: string) {
        log.filters.push({ op: "or", column: "", value: expression })
        return builder
      },
      order(column: string, orderOptions?: { ascending?: boolean; nullsFirst?: boolean }) {
        log.orders.push({ column, ascending: orderOptions?.ascending ?? true, nullsFirst: orderOptions?.nullsFirst })
        return builder
      },
      limit(count: number) {
        log.limit = count
        return builder
      },
      range(fromIndex: number, toIndex: number) {
        log.range = { from: fromIndex, to: toIndex }
        return builder
      },
      maybeSingle() {
        return Promise.resolve(run()).then((result) => ({ ...result, data: result.data?.[0] ?? null }))
      },
      then<T1 = unknown, T2 = never>(
        onFulfilled?: ((value: ReturnType<typeof run>) => T1 | PromiseLike<T1>) | null,
        onRejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null
      ) {
        return Promise.resolve().then(run).then(onFulfilled, onRejected)
      },
    }
    return builder
  }

  return { client: { from }, logs }
}
