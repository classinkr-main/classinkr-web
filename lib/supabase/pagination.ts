import "server-only"

export type SupabaseQueryError = {
  code?: string
  details?: string
  hint?: string
  message?: string
} | null

export interface SupabasePageResult {
  data: unknown[] | null
  error: SupabaseQueryError
  count?: number | null
}

export interface SupabasePagedResult<T> {
  data: T[]
  error: SupabaseQueryError
  count: number | null
  truncated: boolean
  pages: number
}

interface FetchSupabasePagesInput {
  fetchPage: (from: number, to: number) => PromiseLike<SupabasePageResult>
  maxRows: number
  pageSize?: number
}

const POSTGREST_DEFAULT_MAX_ROWS = 1000

export async function fetchSupabasePages<T>({
  fetchPage,
  maxRows,
  pageSize = POSTGREST_DEFAULT_MAX_ROWS,
}: FetchSupabasePagesInput): Promise<SupabasePagedResult<T>> {
  const safeMaxRows = Math.max(0, Math.floor(maxRows))
  const safePageSize = Math.min(
    POSTGREST_DEFAULT_MAX_ROWS,
    Math.max(1, Math.floor(pageSize))
  )
  const data: T[] = []
  let count: number | null = null
  let pages = 0

  while (data.length < safeMaxRows) {
    const remaining = safeMaxRows - data.length
    const requested = Math.min(safePageSize, remaining)
    const from = data.length
    const to = from + requested - 1
    const result = await fetchPage(from, to)
    pages += 1

    if (count == null && typeof result.count === "number") {
      count = result.count
    }

    if (result.error) {
      return { data, error: result.error, count, truncated: false, pages }
    }

    const rows = (result.data ?? []) as T[]
    data.push(...rows)

    if (rows.length < requested) {
      return { data, error: null, count, truncated: false, pages }
    }
  }

  return {
    data,
    error: null,
    count,
    truncated: count == null ? data.length >= safeMaxRows : count > data.length,
    pages,
  }
}
