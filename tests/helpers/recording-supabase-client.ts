// supabase-js PostgrestFilterBuilder 흉내. 체인 호출(select/eq/in/order/limit/range…)을
// 쿼리 단위로 기록하고, await 시점에 resolver 가 결과를 만든다. 실제 빌더처럼 체인 메서드는
// 같은 객체를 돌려주고 thenable 이라 `await`·`Promise.all`·fetchSupabasePages 에 바로 들어간다.
// 쿼리 기록은 "어떤 SQL 모양이 나갔는가"(count 요청 여부, 필터, 정렬, 페이지)를 검증하는 데 쓴다.

export interface RecordedFilter {
  op: string
  column: string
  value: unknown
}

export interface RecordedOrder {
  column: string
  ascending: boolean
}

export interface RecordedSelectOptions {
  count?: string
  head?: boolean
}

export interface RecordedQuery {
  table: string
  method: "select" | "update" | "upsert" | "insert" | "delete" | null
  select: string | null
  selectOptions: RecordedSelectOptions | undefined
  filters: RecordedFilter[]
  order: RecordedOrder[]
  limit: number | null
  range: { from: number; to: number } | null
}

export interface RecordedQueryError {
  code?: string
  message?: string
  details?: string
  hint?: string
}

export interface RecordedQueryResult {
  data?: unknown[] | null
  error?: RecordedQueryError | null
  count?: number | null
}

export interface NormalizedQueryResult {
  data: unknown[] | null
  error: RecordedQueryError | null
  count: number | null
}

export type RecordedQueryResolver = (query: RecordedQuery) => RecordedQueryResult

export interface RecordingQueryBuilder extends PromiseLike<NormalizedQueryResult> {
  select(columns?: string, options?: RecordedSelectOptions): RecordingQueryBuilder
  update(values?: unknown): RecordingQueryBuilder
  upsert(values?: unknown, options?: unknown): RecordingQueryBuilder
  insert(values?: unknown): RecordingQueryBuilder
  delete(): RecordingQueryBuilder
  eq(column: string, value: unknown): RecordingQueryBuilder
  neq(column: string, value: unknown): RecordingQueryBuilder
  gt(column: string, value: unknown): RecordingQueryBuilder
  gte(column: string, value: unknown): RecordingQueryBuilder
  lt(column: string, value: unknown): RecordingQueryBuilder
  lte(column: string, value: unknown): RecordingQueryBuilder
  in(column: string, value: unknown): RecordingQueryBuilder
  is(column: string, value: unknown): RecordingQueryBuilder
  ilike(column: string, value: unknown): RecordingQueryBuilder
  or(expression: string): RecordingQueryBuilder
  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }): RecordingQueryBuilder
  limit(count: number): RecordingQueryBuilder
  range(from: number, to: number): RecordingQueryBuilder
}

export interface RecordingSupabaseClient {
  from(table: string): RecordingQueryBuilder
}

/** 기록된 쿼리에서 특정 컬럼 필터의 값을 꺼낸다(기본 eq). 없으면 undefined. */
export function filterValue(query: RecordedQuery, column: string, op = "eq") {
  return query.filters.find((filter) => filter.column === column && filter.op === op)?.value
}

function createBuilder(query: RecordedQuery, resolve: RecordedQueryResolver): RecordingQueryBuilder {
  const filter = (op: string) => (column: string, value: unknown) => {
    query.filters.push({ op, column, value })
    return builder
  }

  const builder: RecordingQueryBuilder = {
    select(columns = "*", options) {
      query.method ??= "select"
      query.select = columns
      query.selectOptions = options
      return builder
    },
    update() {
      query.method = "update"
      return builder
    },
    upsert() {
      query.method = "upsert"
      return builder
    },
    insert() {
      query.method = "insert"
      return builder
    },
    delete() {
      query.method = "delete"
      return builder
    },
    eq: filter("eq"),
    neq: filter("neq"),
    gt: filter("gt"),
    gte: filter("gte"),
    lt: filter("lt"),
    lte: filter("lte"),
    in: filter("in"),
    is: filter("is"),
    ilike: filter("ilike"),
    or(expression) {
      query.filters.push({ op: "or", column: "", value: expression })
      return builder
    },
    order(column, options) {
      query.order.push({ column, ascending: options?.ascending ?? true })
      return builder
    },
    limit(count) {
      query.limit = count
      return builder
    },
    range(from, to) {
      query.range = { from, to }
      return builder
    },
    then(onFulfilled, onRejected) {
      return Promise.resolve()
        .then(() => resolve(query))
        .then(
          (result): NormalizedQueryResult => ({
            data: result.data ?? null,
            error: result.error ?? null,
            count: result.count ?? null,
          })
        )
        .then(onFulfilled, onRejected)
    },
  }

  return builder
}

/**
 * `from(table)` 마다 새 쿼리를 기록하는 가짜 admin 클라이언트.
 * `vi.doMock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => client }))` 로 꽂는다.
 */
export function createRecordingSupabaseClient(resolve: RecordedQueryResolver) {
  const queries: RecordedQuery[] = []
  const client: RecordingSupabaseClient = {
    from(table) {
      const query: RecordedQuery = {
        table,
        method: null,
        select: null,
        selectOptions: undefined,
        filters: [],
        order: [],
        limit: null,
        range: null,
      }
      queries.push(query)
      return createBuilder(query, resolve)
    },
  }
  return { client, queries }
}
