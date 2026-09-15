import "server-only"

// PostgREST range 페이지네이션 공용 헬퍼 — 원격 호출은 fetchPage 콜백이 하고, 여기서는 전진·종료·절단 판정만 한다.
//
// 왜: PostgREST 는 서버 max-rows(Supabase 기본 1000)를 넘는 요청을 오류 없이 잘라 돌려준다. 단일
// `.limit(n)` 은 앞 max-rows 행만 받고 조용히 끝난다.
//
// 규칙(2026-09-14 후속 수정 — Compass 브리지 전용 사본 lib/compass/paginate.ts 를 여기로 합쳤다):
//  * 전진 간격은 요청 크기가 아니라 **실제로 받은 행 수**다. 서버 max-rows 가 요청보다 작게 클램프해도
//    중간 행을 건너뛰지 않는다.
//  * **count 를 알면(첫 페이지에 count:"exact") 짧은 페이지를 끝으로 보지 않는다** — 서버 클램프일 수 있다.
//    받은 행이 min(count, maxRows) 에 닿거나 빈 페이지가 오면 끝난다(추가 왕복 없음). 예전 규칙은 count 가
//    더 있다고 말하는데도 `rows < requested` 에서 멈추고 truncated=false 를 돌려줬다(max-rows 가 요청보다
//    작은 서버에서 첫 페이지만 받고 "전체"라고 했다).
//  * count 를 모르면 짧은 페이지가 끝이다(예전과 같다). 클램프인지 끝인지 가를 근거가 없고, 빈 페이지를
//    한 번 더 확인하면 count 없이 쓰는 모든 조회(작은 표·기간 스캔)가 같은 조회를 OFFSET 으로 한 번 더
//    돌린다. 페이지 크기 상한이 Supabase 기본 max-rows(1000)와 같아 기본 설정에서는 이 경로가 클램프를
//    만나지 않는다. **max-rows 를 1000 아래로 낮춘 프로젝트에서 빠짐없이 읽어야 하면 첫 페이지에 count 를 요청한다.**
//  * count 는 exact 여야 한다(planned·estimated 는 실제와 달라 일찍 멈추거나 헛돈다).
//  * 절단 판정: count 를 알면 count > 받은 행(조회 중 행이 줄어든 경우 포함), 모르면 maxRows 도달.
//  * concurrent: count 를 알면 첫 페이지 길이 간격으로 남은 구간을 병렬로 받는다. 구간 하나가 기대보다
//    짧으면 그 뒤 구간은 버리고 거기서부터 순차로 채운다 — 짧은 구간 뒤에 오프셋이 어긋난 구간을 이어
//    붙이면 행이 빠지거나 겹친다. 기본은 순차(기존 호출부의 부하 모양 유지).
//
// 호출부는 반드시 **유일한 정렬 키**(예: day + ad_id, 또는 id tie-breaker)로 정렬해야 한다. 페이지 경계에서
// 순서가 흔들리면 행이 중복·누락된다.

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
  /** 받은 행. error 가 있으면 그 전까지 받은 행 — 호출부는 반쪽 결과를 정상처럼 쓰지 않는다. */
  data: T[]
  error: SupabaseQueryError
  /** 첫 페이지가 알려 준 총 행수(count:"exact"). 모르면 null. */
  count: number | null
  /** 받지 못한 행이 있다(maxRows 상한 또는 조회 중 행 감소). 합계를 "전체"라 부르면 안 된다. */
  truncated: boolean
  /** 원격 왕복 수 */
  pages: number
}

interface FetchSupabasePagesInput {
  /** from·to 는 0-based 포함 range. count 는 from === 0 인 첫 페이지에서만 요청하면 된다(첫 값만 채택). */
  fetchPage: (from: number, to: number) => PromiseLike<SupabasePageResult>
  /** 전체 상한 — 폭주 방지. 이보다 많으면 truncated=true. */
  maxRows: number
  /** 한 번에 요청할 행 수(최대 PostgREST 기본 max-rows 1000). */
  pageSize?: number
  /** count 를 알 때 남은 구간을 병렬로 받는다(기본 false = 순차). */
  concurrent?: boolean
}

const POSTGREST_DEFAULT_MAX_ROWS = 1000

export async function fetchSupabasePages<T>({
  fetchPage,
  maxRows,
  pageSize = POSTGREST_DEFAULT_MAX_ROWS,
  concurrent = false,
}: FetchSupabasePagesInput): Promise<SupabasePagedResult<T>> {
  const safeMaxRows = Math.max(0, Math.floor(maxRows))
  const safePageSize = Math.min(
    POSTGREST_DEFAULT_MAX_ROWS,
    Math.max(1, Math.floor(pageSize))
  )
  const data: T[] = []
  let count: number | null = null
  let pages = 0
  // 받을 목표 행수 — count 를 알게 되면 min(count, maxRows) 로 줄어든다.
  let target = safeMaxRows

  const failed = (error: SupabaseQueryError): SupabasePagedResult<T> => ({
    data,
    error,
    count,
    truncated: false,
    pages,
  })

  /** 한 페이지를 받아 count 를 채택하고 행(오류면 빈 행 + error)을 돌려준다. */
  const load = async (from: number, to: number): Promise<{ rows: T[]; error: SupabaseQueryError }> => {
    const result = await fetchPage(from, to)
    pages += 1
    if (count == null && typeof result.count === "number" && result.count >= 0) {
      count = result.count
      target = Math.min(count, safeMaxRows)
    }
    if (result.error) return { rows: [], error: result.error }
    return { rows: Array.isArray(result.data) ? (result.data as T[]) : [], error: null }
  }

  let ended = false
  let firstPageLength = 0

  if (target > 0) {
    const first = await load(0, Math.min(safePageSize, target) - 1)
    if (first.error) return failed(first.error)
    firstPageLength = first.rows.length
    data.push(...first.rows.slice(0, target))
    const requested = Math.min(safePageSize, safeMaxRows)
    if (first.rows.length === 0 || (count == null && first.rows.length < requested)) ended = true
  }

  // 병렬 구간 — count 를 알 때만. 간격은 첫 페이지가 실제로 준 행 수(서버 클램프 반영).
  if (!ended && concurrent && count != null && firstPageLength > 0 && data.length < target) {
    const step = firstPageLength
    const ranges: Array<{ from: number; to: number }> = []
    for (let from = data.length; from < target; from += step) {
      ranges.push({ from, to: Math.min(from + step, target) - 1 })
    }
    const loaded = await Promise.all(ranges.map(({ from, to }) => load(from, to)))
    for (let index = 0; index < loaded.length; index += 1) {
      const page = loaded[index]
      if (page.error) return failed(page.error)
      const expected = ranges[index].to - ranges[index].from + 1
      data.push(...page.rows.slice(0, expected))
      // 짧은 구간 뒤는 오프셋이 어긋난다 — 버리고 아래 순차 채움이 data.length 부터 잇는다.
      if (page.rows.length < expected) break
    }
  }

  // 순차 채움 — 기본 경로이자 병렬 구간이 짧았을 때의 방어. 빈 페이지가 끝이고,
  // count 를 모를 때만 짧은 페이지도 끝이다(위 규칙).
  while (!ended && data.length < target) {
    const from = data.length
    const requested = Math.min(from + safePageSize, target) - from
    const page = await load(from, from + requested - 1)
    if (page.error) return failed(page.error)
    if (page.rows.length === 0) break
    data.push(...page.rows.slice(0, target - from))
    if (count == null && page.rows.length < requested) break
  }

  return {
    data,
    error: null,
    count,
    truncated: count == null ? data.length >= safeMaxRows : count > data.length,
    pages,
  }
}
