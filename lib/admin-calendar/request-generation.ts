/**
 * request-generation.ts — "최신 요청만 화면에 반영한다"는 규칙 하나를 담은 세대 토큰.
 *
 * 캘린더는 기간을 넘길 때마다 조회를 다시 띄운다. 인접 기간 프리페치가 들어온 뒤로는
 * 응답 속도 차이가 커져서, 늦게 띄운 B월이 캐시에서 즉시 돌아오고 먼저 띄운 A월이 나중에
 * 끝나는 일이 흔해졌다. 그때 A의 setEvents가 B 화면을 덮으면 사용자는 자기가 보고 있던
 * 달이 아닌 데이터를 본다. loading 도 같은 문제다 — 먼저 끝난 쪽이 false로 내리면 아직
 * 도는 요청이 있는데도 "새로고침 중" 표시가 꺼져 거짓 빈 상태가 다시 노출된다.
 *
 * 그래서 조회를 띄울 때 토큰을 하나 받아 두고, 결과를 화면에 반영하기 직전에 그 토큰이
 * 아직 최신인지 묻는다. 백그라운드 재검증(onRevalidated) 결과도 같은 문을 통과해야 한다.
 */

export interface RequestGeneration {
  /** 새 조회를 시작한다. 이 시점부터 이전 토큰은 전부 낡은 것이 된다. */
  next: () => number
  /** 이 토큰이 아직 최신인가 — 화면 반영(setState) 직전에 묻는다. */
  isCurrent: (token: number) => boolean
}

export function createRequestGeneration(): RequestGeneration {
  let current = 0
  return {
    next: () => {
      current += 1
      return current
    },
    isCurrent: (token: number) => token === current,
  }
}
