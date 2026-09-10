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
