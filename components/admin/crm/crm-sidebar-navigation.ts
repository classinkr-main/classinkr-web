export const CRM_SAVED_VIEW_GROUPS = [
  {
    key: "recent",
    label: "최근 진행",
    views: [
      { view: "recent_contact", label: "최근 컨택" },
      { view: "active_deal", label: "진행 중인 딜" },
    ],
  },
  {
    key: "signals",
    label: "관리 신호",
    views: [
      { view: "hot_lead", label: "고전환 리드" },
      { view: "upsell", label: "업셀 후보" },
      { view: "dormant", label: "30일+ 미접촉" },
      { view: "expiring", label: "만료 임박" },
    ],
  },
] as const

export const CRM_SAVED_VIEWS = CRM_SAVED_VIEW_GROUPS.flatMap((group) => [...group.views])

export type CrmSavedView = (typeof CRM_SAVED_VIEW_GROUPS)[number]["views"][number]["view"]

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
