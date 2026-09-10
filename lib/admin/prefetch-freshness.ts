/**
 * 재사용된 RSC 프리페치 payload("initialData")가 아직 신선한지 판정하는 공용 규칙.
 *
 * next.config.ts의 experimental.staleTimes.dynamic(180초)이 도입되면서, 사이드바 hover가
 * 미리 받아 둔 admin 페이지의 RSC 응답(그 안의 initialData)이 클라이언트 라우터 캐시에
 * 최대 180초까지 남아 재사용될 수 있다 — 실제로 그 페이지가 서버에서 다시 렌더된 시점은
 * 최대 180초 전일 수 있다는 뜻이다.
 *
 * 이 모듈은 "그 initialData가 지금 화면을 그대로 채워도 되는가(=마운트 시 재검증을
 * 건너뛰어도 되는가)"만 판정한다. 기준은 훨씬 짧다(10초) — staleTimes.dynamic 180초는
 * "재사용된 RSC payload를 화면에 스켈레톤 없이 즉시 보여줄 수 있는 상한"이고, 이 10초는
 * "그 payload를 신선하다고 믿고 마운트 페치를 아예 생략해도 되는 상한"이라 서로 다른 질문이다.
 * 신선하지 않으면(=10초보다 오래됐으면) 소비처는 initialData를 여전히 첫 프레임에 그대로
 * 그리되(스켈레톤 없음), 자기 자신의 평소 마운트 페치/재검증 경로는 생략하지 않는다 —
 * 그 결과 lib/admin-client.ts의 클라이언트 SWR 캐시나 네트워크가 최신 여부를 결정한다.
 *
 * 클라이언트 컴포넌트(OverviewClient 등)와 서버 프리페치 모듈(overview/prefetch.ts 등)
 * 양쪽에서 import하므로 "server-only"를 두지 않는다 — 값 계산만 하는 순수 함수다.
 */
export const ADMIN_PREFETCH_FRESH_MS = 10_000

/**
 * generatedAt(그 RSC 프리페치가 서버에서 만들어진 시각, ms epoch)이 now 기준
 * ADMIN_PREFETCH_FRESH_MS 이내면 true. generatedAt이 없거나(0/undefined/null) 유한수가
 * 아니면 무조건 false — "프리페치 없음"·"EMPTY 폴백"과 같은 취급이다.
 */
export function isPrefetchFresh(
  generatedAt: number | null | undefined,
  now: number = Date.now()
): boolean {
  if (typeof generatedAt !== "number" || !Number.isFinite(generatedAt)) return false
  return now - generatedAt <= ADMIN_PREFETCH_FRESH_MS
}
