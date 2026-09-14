import "server-only"

/**
 * 어드민 페이지 서버 프리페치(RSC)의 공용 시간 예산.
 *
 * 프리페치를 쓰는 페이지는 전부 force-dynamic이라 프리페치가 끝날 때까지 RSC 응답이 나가지
 * 않는다 — 상한이 없으면 콜드 캐시 미스(리드 전량 스캔·하드웨어 대시보드 전체 집계·
 * buildBranchSummaryPayload 등) 대기가 그대로 TTFB가 되어, 스켈레톤이 즉시 뜨던 기존 체감보다
 * 나빠진다(빈 탭을 오래 본다). 웜 캐시 적중은 ms 단위라 1.2초면 대부분 통과하고, 넘긴 소스는
 * null로 내려 기존 클라이언트 페치 경로를 그대로 탄다.
 * 넘긴 뒤에도 서버 쿼리는 계속 돌아 캐시를 데우므로 뒤이은 그 요청이 웜 결과를 받는다.
 *
 * 값은 Overview·하드웨어·KR Team·장부가 공유한다 — 화면마다 다른 상한을 두면 "언제 스켈레톤이
 * 뜨는가"가 탭마다 달라져 추적이 어려워진다.
 */
export const ADMIN_PREFETCH_BUDGET_MS = 1_200

/**
 * run()을 예산 안에서만 기다린다.
 * - 예산 초과: null (호출부는 initialData 없음 = 클라이언트 폴백).
 * - 실패: null — 프리페치 없음과 같게 취급해 페이지를 500으로 만들지 않는다.
 * 경주가 끝나면 타이머를 정리해 예산만큼 이벤트 루프를 붙잡지 않는다.
 *
 * **이중 비용 경고(횡단 인프라 감사, 2026-09-10)**: 이 함수는 "기다렸다가" 돌려준다 — 콜드
 * 미스가 예산을 넘기면 그 예산 전체(1.2초)가 그대로 TTFB에 얹힌 뒤에야 null이 나온다. 그 null을
 * 받은 클라이언트가 다시 같은 데이터를 요청하므로, 콜드 경로는 "1.2초 대기 + 클라이언트 왕복"을
 * 이중으로 낸다(실측: 장부/오버뷰/CRM 홈 콜드·재검증 TTFB가 1,217~1,291ms에 고정). force-dynamic
 * 페이지가 이 함수로 await한 결과를 곧장 JSX에 꽂는 한 이 비용은 구조적으로 못 없앤다 — 예산을
 * 줄여도 "웜인데 예산 밖으로 밀려나 폴백되는" 오탐만 늘 뿐 콜드 TTFB의 상한 자체는 그대로다.
 * 정말 TTFB를 예산과 무관하게 만들려면(=콜드에서도 즉시 응답) 아래 openPrefetchLane +
 * React `use()` + `<Suspense>` 스트리밍으로 옮겨야 한다 — 신규 소스나 스트리밍으로 전환 가능한
 * 화면은 이쪽을 먼저 검토할 것. 이 함수는 아직 옮기지 않은 소스를 위해 그대로 남긴다(하위호환 —
 * 이 시그니처를 바꾸면 Overview·CRM 홈·장부·하드웨어 4개 page.tsx가 동시에 깨진다).
 */
export function settleWithinBudget<T>(
  run: () => Promise<T>,
  budgetMs: number = ADMIN_PREFETCH_BUDGET_MS
): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const task = run().then(
    (value) => value,
    () => null
  )
  const budget = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), budgetMs)
  })
  return Promise.race([task, budget]).finally(() => {
    if (timer !== undefined) clearTimeout(timer)
  })
}

/**
 * 정말 멈춘 쿼리(네트워크 단절·DB 락 등)가 스트림을 무한정 붙잡지 않기 위한 안전판.
 * settleWithinBudget의 ADMIN_PREFETCH_BUDGET_MS(1.2초)와 목적이 다르다 — 그쪽은 "TTFB를
 * 아끼기 위한 상한"이라 짧아야 하고, 이쪽은 "리소스 누수를 막기 위한 상한"이라 넉넉해야 한다
 * (정상적으로 느린 콜드 집계까지 여기 걸려 잘리면 스트리밍의 이점이 없다).
 */
const DEFAULT_PREFETCH_LANE_CEILING_MS = 15_000

/** openPrefetchLane이 돌려주는 값 — 아직 정착되지 않은 소스를 나타낸다. */
export interface DeferredPrefetch<T> {
  /**
   * settle 여부와 무관하게 즉시 반환되는 promise. 컴포넌트가 이 값을 그대로 prop으로 받아
   * React `use()`로 풀어야 스트리밍 이점이 생긴다 — 여기서 await하면(=바로 .then/await로
   * 소비) settleWithinBudget과 다를 게 없어진다(오히려 상한이 없어 더 나쁘다).
   */
  promise: Promise<T | null>
  /** 이 레인을 연 시각(ms epoch) — seedAdminRequestCache/isPrefetchFresh와 같은 T3/T4 규약. */
  generatedAt: number
}

/**
 * 프리페치 이중비용(위 settleWithinBudget 주석) 해소용 신규 계약.
 *
 * run()을 **즉시** 시작하고 기다리지 않는다 — settleWithinBudget처럼 "예산 안에서 값을 얻거나
 * 포기"를 기다렸다가 돌려주는 것이 아니라, 시작만 해두고 그 자리에서 곧장 {promise, generatedAt}을
 * 돌려준다. 호출부(page.tsx)가 이 결과를 await하지 않고 그대로 클라이언트 컴포넌트에 prop으로
 * 넘기면, RSC 셸은 이 소스가 settle되기를 전혀 기다리지 않고 즉시 스트리밍을 시작한다 — 그
 * 소스가 아무리 느려도(콜드 리드 전량 스캔이든 하드웨어 전체 집계든) TTFB에 단 1ms도 얹히지
 * 않는다. 대신 그 컴포넌트는 <Suspense fallback=...>로 감싸야 한다(안 감싸면 그 컴포넌트
 * 트리 전체가 아무 표시 없이 정지한 것처럼 보인다 — force-dynamic이라 페이지 자체는 여전히
 * 렌더를 마칠 때까지 응답을 안 보내는 게 아니라, Suspense 경계가 스트리밍 청크로 이어서 보낸다).
 *
 * 페이지가 이 함수로 옮겨가려면 함께 바뀌어야 하는 것 — 상세 diff는 위임 요청 문서 참고:
 *  1) page.tsx: `await settleWithinBudget(...)`를 지우고 `openPrefetchLane(...)`으로 교체 —
 *     await하지 않는다. 반환된 initialData 타입이 `T | null`에서 `DeferredPrefetch<T>`로 바뀐다.
 *  2) 클라이언트 컴포넌트: 그 prop을 그대로 들고 있다가, 실제로 그 값이 필요한 하위 컴포넌트가
 *     React `use(promise)`로 푼다. 그 하위 컴포넌트는 반드시 `<Suspense fallback={...스켈레톤...}>`
 *     자식이어야 한다 — 화면 전체를 감싸면 스트리밍 이점이 사라지니(가장 느린 소스가 전체를
 *     막음) 소스별로 독립된 Suspense 경계를 쓰는 편이 낫다.
 *  3) generatedAt은 여전히 seedAdminRequestCache/isPrefetchFresh에 그대로 넘긴다 — 이 레인을
 *     연 시각이 "이 값이 실제로 계산된 시각"과 다를 수 있다는 점은 settleWithinBudget과 동일한
 *     한계이므로 소비처의 기존 신선도 판정 로직을 바꿀 필요는 없다.
 *
 * ceilingMs: 기본 15초(DEFAULT_PREFETCH_LANE_CEILING_MS) — settleWithinBudget의 1.2초와 절대
 * 헷갈리지 않게 이름과 기본값을 크게 벌려 두었다.
 */
export function openPrefetchLane<T>(
  run: () => Promise<T>,
  ceilingMs: number = DEFAULT_PREFETCH_LANE_CEILING_MS
): DeferredPrefetch<T> {
  const generatedAt = Date.now()
  let timer: ReturnType<typeof setTimeout> | undefined

  const task = run().then(
    (value) => value,
    (error) => {
      // settleWithinBudget과 달리 여기서는 로그를 남긴다 — 이 레인은 예산 초과가 아니라
      // 진짜 실패(또는 15초 무응답)만 null이 되므로, 조용히 삼키면 "왜 이 소스만 항상
      // 비는지" 진단할 방법이 없어진다.
      console.error("[admin prefetch lane] source failed", error)
      return null
    }
  )
  const ceiling = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ceilingMs)
  })

  const promise = Promise.race([task, ceiling]).finally(() => {
    if (timer !== undefined) clearTimeout(timer)
  })

  return { promise, generatedAt }
}
