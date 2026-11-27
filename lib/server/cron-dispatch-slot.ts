/**
 * 시간 슬롯 크론이 "지금 몇 시 슬롯인가"를 시계에서 구한다(UTC 0~23).
 *
 * Vercel 크론은 정각을 몇 초 앞뒤로 비켜 깨울 수 있다. 내림(getUTCHours)만 쓰면 20:59:58 에 깬 21시 실행이
 * 20시 슬롯으로 읽혀 그날의 고정 잡(세그먼트 06시·하드웨어 알림 08시·아침 카드)이 통째로 빠진다.
 * 그래서 가장 가까운 정시로 맞춘다 — 정각 기준 ±30분 안이면 같은 슬롯이다.
 */
export function resolveDispatchSlot(now: Date): number {
  return new Date(now.getTime() + 30 * 60 * 1000).getUTCHours()
}
