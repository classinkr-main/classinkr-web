// Compass 브리지 범위 조회용 페이지네이션 — 순수 로직(원격 호출은 fetchPage 콜백이 한다).
//
// 왜 필요한가(2026-09-14, Compass 감사 R5 X3·B3): PostgREST 는 서버 max-rows(Supabase 기본 1000)를
// 넘는 행을 오류 없이 잘라 돌려준다. 브리지의 기간 조회는 day 오름차순이라 잘리는 쪽이 **최신
// 일자**다. 예전 호출부는 `.limit(3000)` 을 걸고 `rows.length >= 3000` 으로 절단을 판정해서
// 1000행 절단을 영원히 잡지 못했다.
//
// 규칙은 lib/repositories/leads.ts loadAllLeadRows 와 같다:
//  * 첫 페이지에서 count:"exact" 로 총 행수를 함께 받는다.
//  * 페이지 간격은 요청 크기가 아니라 **첫 페이지가 실제로 돌려준 행 수**다 — max-rows 가 요청보다
//    작게 클램프해도 중간 행을 건너뛰지 않는다.
//  * 총 행수를 알면 남은 구간을 병렬로, 모르면 빈 페이지가 나올 때까지 순차로 받는다.
//  * 절단 판정은 "count > 받은 행 수"(count 를 모르면 상한 도달)다.
// 차이: 병렬 구간 중 하나라도 기대보다 짧으면 그 뒤 구간은 버리고 거기서부터 순차로 채운다 —
// 짧은 구간 뒤에 오프셋이 어긋난 구간을 이어 붙이면 행이 빠지거나 겹친다.
//
// 호출부는 반드시 **유일한 정렬 키**(예: day + ad_id)로 정렬해야 한다. 같은 day 가 페이지 경계에
// 걸릴 때 순서가 흔들리면 행이 중복·누락된다.

/** PostgREST 기본 max-rows 와 같은 요청 크기. 서버가 더 작게 잘라도 위 규칙으로 안전하다. */
export const COMPASS_PAGE_SIZE = 1000

export interface CompassPageRange {
  /** 0-based 포함 시작 */
  from: number
  /** 0-based 포함 끝 */
  to: number
  /** 첫 페이지만 true — count:"exact" 를 요청한다 */
  withCount: boolean
}

/** supabase-js 응답의 필요한 부분만. */
export interface CompassPageResponse {
  data: unknown
  error: unknown
  count?: number | null
}

export interface CompassPagedRows<T> {
  rows: T[]
  /** 첫 페이지가 알려준 총 행수. 모르면 null. */
  count: number | null
  /** 받지 못한 행이 있다(상한 maxRows 또는 조회 중 행 감소). 합계를 "전체"라 부르면 안 된다. */
  truncated: boolean
  /** 원격 오류(첫 오류). 있으면 rows 는 비어 있다 — 반쪽 결과를 정상처럼 쓰지 않는다. */
  error: unknown
}

export interface CompassPaginateOptions {
  /** 한 번에 요청할 행 수(기본 COMPASS_PAGE_SIZE). */
  pageSize?: number
  /** 전체 상한 — 폭주 방지. 이보다 많으면 truncated=true. */
  maxRows: number
}

function hasError(response: CompassPageResponse): boolean {
  return response.error !== null && response.error !== undefined
}

function pageRows<T>(response: CompassPageResponse): T[] {
  return Array.isArray(response.data) ? (response.data as T[]) : []
}

export async function fetchCompassPages<T>(
  fetchPage: (range: CompassPageRange) => PromiseLike<CompassPageResponse>,
  options: CompassPaginateOptions,
): Promise<CompassPagedRows<T>> {
  const pageSize = Math.max(1, Math.floor(options.pageSize ?? COMPASS_PAGE_SIZE))
  const maxRows = Math.max(1, Math.floor(options.maxRows))
  const failed = (error: unknown): CompassPagedRows<T> => ({ rows: [], count: null, truncated: false, error })

  const first = await fetchPage({ from: 0, to: Math.min(pageSize, maxRows) - 1, withCount: true })
  if (hasError(first)) return failed(first.error)

  const rows = pageRows<T>(first).slice(0, maxRows)
  const count = typeof first.count === "number" && first.count >= 0 ? first.count : null
  const target = count == null ? maxRows : Math.min(count, maxRows)

  // 총 행수를 알면 남은 구간을 병렬로 — 간격은 첫 페이지가 실제로 준 행 수.
  if (count != null && rows.length > 0 && rows.length < target) {
    const step = rows.length
    const ranges: Array<{ from: number; to: number }> = []
    for (let from = step; from < target; from += step) {
      ranges.push({ from, to: Math.min(from + step, target) - 1 })
    }
    const pages = await Promise.all(ranges.map(({ from, to }) => fetchPage({ from, to, withCount: false })))
    for (let index = 0; index < pages.length; index += 1) {
      const page = pages[index]
      if (hasError(page)) return failed(page.error)
      const batch = pageRows<T>(page)
      const expected = ranges[index].to - ranges[index].from + 1
      rows.push(...batch.slice(0, expected))
      // 짧은 구간 뒤는 오프셋이 어긋난다 — 버리고 아래 순차 채움이 rows.length 부터 잇는다.
      if (batch.length < expected) break
    }
  }

  // 순차 채움 — count 를 모를 때의 기본 경로이자 병렬 구간이 짧았을 때의 방어.
  // 빈 페이지가 끝이다. 짧은 페이지는 서버 클램프일 수 있어 끝으로 보지 않는다.
  // 첫 페이지가 비었으면 더 볼 것이 없다.
  while (rows.length > 0 && rows.length < target) {
    const from = rows.length
    const page = await fetchPage({ from, to: Math.min(from + pageSize, target) - 1, withCount: false })
    if (hasError(page)) return failed(page.error)
    const batch = pageRows<T>(page)
    if (batch.length === 0) break
    rows.push(...batch.slice(0, target - from))
  }

  const truncated = count != null ? count > rows.length : rows.length >= maxRows
  return { rows, count, truncated, error: null }
}
