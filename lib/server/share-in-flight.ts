import "server-only"

/**
 * 같은 키의 비동기 계산이 동시에 시작되면 첫 번째 promise를 함께 기다리게 한다(인스턴스 단위).
 *
 * 왜 필요한가: unstable_cache(Data Cache)는 인스턴스 간 공유·stale-while-revalidate 를 주지만
 * **같은 인스턴스 안의 동시 미스/재검증은 합치지 않는다** — 콜드 인스턴스에서 CRM 홈이 8개,
 * Overview 가 13개 요청을 한꺼번에 띄우면 같은 스냅샷(예: 통합고객 스냅샷을 읽는
 * customers/unified 와 health-distribution)을 두 번 계산한다. 옛 모듈 메모가 갖고 있던
 * in-flight promise 공유를 이 헬퍼로 되살려 unstable_cache 콜백 안쪽에서 쓴다.
 *
 * 규약: key 는 캐시 키와 인자를 문자 그대로 포함해야 한다(인자가 다른 계산을 합치면 안 된다).
 * 실패한 promise 는 정리되므로 다음 호출이 다시 시도한다. 결과는 공유 객체이므로 호출부가
 * 변형하면 안 된다(Data Cache 에 들어가는 값과 같은 규약).
 */
const inFlight = new Map<string, Promise<unknown>>()

export function shareInFlight<T>(key: string, run: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key)
  if (existing) return existing as Promise<T>

  const promise = run().finally(() => {
    if (inFlight.get(key) === promise) inFlight.delete(key)
  })
  inFlight.set(key, promise)
  return promise
}

/**
 * 인자를 받는 계산용 — 인자를 JSON 으로 키에 섞어 같은 인자끼리만 합친다.
 * unstable_cache 콜백 자리에 그대로 끼워 넣는 용도(인자는 unstable_cache 와 같은 직렬화 규약).
 */
export function shareInFlightByArgs<A extends unknown[], T>(
  key: string,
  run: (...args: A) => Promise<T>
): (...args: A) => Promise<T> {
  return (...args: A) => shareInFlight(`${key}:${JSON.stringify(args)}`, () => run(...args))
}

/** 테스트 전용 — 인스턴스 상태를 비운다. */
export function __resetShareInFlightForTests() {
  inFlight.clear()
}
