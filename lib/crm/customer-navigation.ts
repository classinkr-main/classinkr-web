export function customerDetailHref(key: string): string {
  return `/admin/crm/customers/${encodeURIComponent(key)}?tab=activity`
}

/** 우선순위 항목 id는 lead:{id} 또는 neo:{accountId}다. 다른 소스는 기존 경로를 유지한다. */
export function priorityCustomerHref(item: { id: string; source: string; href: string }): string {
  return item.source === "lead" || item.source === "neo_account" ? customerDetailHref(item.id) : item.href
}
