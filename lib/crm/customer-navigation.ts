export function customerDetailHref(key: string): string {
  return `/admin/crm/customers/${encodeURIComponent(key)}?tab=activity`
}

/** 고객 360(상세 페이지·드로어)이 받는 키인가 — lead:{id}·neo:{accountId} 뿐이다. */
export function isCustomer360Key(key: string): boolean {
  return key.startsWith("lead:") || key.startsWith("neo:")
}

/**
 * Home 고객 링크 규칙의 정본 — 360 키(lead:·neo:)는 고객 360 상세(?tab=activity)로, 그 밖(전환 고객 검색 착지·딜·
 * 할 일·Compass 전용 외부 URL)은 호출부가 만든 기존 경로 그대로. 홈 "오늘 연락" 행(TodayContactRow
 * todayContactHomeHref)이 이 함수를 부른다 — 규칙을 바꿀 때는 여기 한 곳만 고친다.
 */
export function customerHomeHref(item: { key: string; href: string }): string {
  return isCustomer360Key(item.key) ? customerDetailHref(item.key) : item.href
}

/**
 * 옛 우선순위 큐 항목 모양(id = lead:{id}·neo:{accountId})의 별칭 — 큐 패널은 2026-10-19 09-mooni 병합에서 지웠고
 * 운영 호출부는 없다. 규칙을 따로 들고 있지 않고 customerHomeHref 에 맡긴다(두 규칙이 갈라지지 않게).
 */
export function priorityCustomerHref(item: { id: string; source: string; href: string }): string {
  return customerHomeHref({ key: item.id, href: item.href })
}
