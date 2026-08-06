export const CRM_SAVED_VIEWS = [
  { view: "expiring", label: "만료 임박" },
  { view: "dormant", label: "30일+ 미접촉" },
  { view: "hot_lead", label: "고전환 리드" },
  { view: "upsell", label: "업셀 후보" },
] as const

export type CrmSavedView = (typeof CRM_SAVED_VIEWS)[number]["view"]

/** 저장 보기는 통합 고객 목록의 쿼리이므로 다른 CRM 화면에서는 노출하지 않는다. */
export function isCrmSavedViewsPath(pathname: string | null): boolean {
  if (!pathname) return false
  return (
    pathname === "/admin/crm/customers" ||
    pathname === "/admin/crm/customers/unified" ||
    pathname.startsWith("/admin/crm/customers/unified/")
  )
}

export function isCrmSavedViewActive(
  pathname: string | null,
  currentView: string | null,
  view: CrmSavedView
): boolean {
  return isCrmSavedViewsPath(pathname) && currentView === view
}
