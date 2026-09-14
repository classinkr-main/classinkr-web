/**
 * CrmPriorityQueuePanel(클라이언트)과 CRM 홈 서버 프리페치(lib/admin/crm/home-prefetch.ts)가
 * 같은 캐시 키를 만들도록 공유하는 중립 모듈 — "server-only"도 "use client"도 달지 않는다.
 *
 * 왜 별도 파일인가: home-prefetch.ts가 CrmPriorityQueuePanel.tsx에서 직접 상수를 끌어오면
 * 서버 번들이 그 컴포넌트 파일의 다른 import(next/navigation의 useRouter 등 클라이언트 전용
 * 훅)까지 함께 끌고 들어온다. limit 값과 URL 조립 규칙만 필요하므로 값만 담은 순수 모듈로
 * 분리해 양쪽에서 안전하게 공유한다(2026-09-07 감사 #7).
 */

// 선별 모수 — 쿼터 믹스가 세 슬롯을 다 채우려면 오늘 버킷 밖 후보까지 넉넉히 필요하다(서버 상한 50).
export const QUEUE_POOL_LIMIT = 50

// source는 항상 "customer"로 고정한다 — 서버가 돌려주는 item.source는 lead/neo_account만
// 가능하고 "task"는 절대 오지 않는다(2026-09-07 감사 #4, CrmPriorityQueuePanel.tsx 참고).
export function queueUrl(owner: string, limit: number) {
  // v=3: 레인·시점 파라미터를 제거한 "오늘 전화" 페이로드 — 이전 캐시와 섞이지 않게 버전 분리.
  const params = new URLSearchParams({ limit: String(limit), source: "customer", v: "3" })
  if (owner) params.set("owner", owner)
  return `/api/admin/crm/home/priority-queue?${params.toString()}`
}
