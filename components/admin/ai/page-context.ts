// 경로 → 사람이 읽는 화면 이름. nav SSOT(admin-nav)에서만 파생한다.
import { ADMIN_NAV, CRM_CHILD_NAV } from "../admin-nav"
import { resolveAdminNavParentHref } from "../admin-nav-routes"

const PARENT_HREFS = ADMIN_NAV.map((item) => item.href)

export function describeAdminPath(pathname: string): string {
  const parentHref = resolveAdminNavParentHref(pathname, PARENT_HREFS)
  const parent = ADMIN_NAV.find((item) => item.href === parentHref)
  if (!parent) return "어드민"

  if (parent.href === "/admin/crm") {
    const child = CRM_CHILD_NAV.find((item) => item.match(pathname))
    if (child) return `CRM › ${child.label}`
  }

  return parent.label
}

/** 위젯을 띄우지 않는 경로 — 로그인, 그리고 위젯의 전체 화면판인 AI 올인원 탭. */
export function isAdminAiWidgetHidden(pathname: string): boolean {
  return (
    pathname === "/admin/login" || pathname === "/admin/ai" || pathname.startsWith("/admin/ai/")
  )
}
