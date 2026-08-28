// nav active 판정 SSOT — 사이드바(AdminSidebar)와 CS 콘솔 가로 메뉴(cs/CsConsoleNav)가
// 같은 판정을 공유한다. 두 벌로 갈리면 반드시 어긋난다
// (docs/active/cs-admin-console-ia-2026-07-27.md §5 "active 판정 공용화").
//
// React 상태·브라우저 API를 쓰지 않는 순수 모듈이므로 "use client" 불필요.
// AdminSidebar에서 추출한 뒤 path 판정만 admin-nav-routes의 부모/자식 SSOT를 소비한다.
// 쿼리·형제 양보 규칙은 그대로 유지한다.

import { isAdminNavRouteMatch } from "./admin-nav-routes"

/** next/navigation의 ReadonlyURLSearchParams와 URLSearchParams를 함께 받는 최소 인터페이스. */
export interface NavSearchParamsLike {
  get(key: string): string | null
}

export interface NavActiveContext {
  /** usePathname() 결과. */
  pathname: string
  /** useSearchParams() 결과(또는 URLSearchParams). */
  searchParams: NavSearchParamsLike
  /**
   * 하이라이트 양보 판정에 쓰는 형제 항목 — 실제로 렌더되는(권한 필터를 통과한) 항목만 넣는다.
   * 사이드바는 visibleNav, CS 콘솔은 현재 모드의 가시 메뉴를 넘긴다.
   */
  siblings: ReadonlyArray<{ href: string }>
}

// nav href의 쿼리 딥링크(예: /admin/docs?tab=gaps)를 path와 query로 분리한다.
export function splitNavHref(href: string): { path: string; query: string | null } {
  const queryIndex = href.indexOf("?")
  return queryIndex === -1
    ? { path: href, query: null }
    : { path: href.slice(0, queryIndex), query: href.slice(queryIndex + 1) }
}

// 현재 URL 쿼리가 nav href의 쿼리(예: tab=gaps)를 전부 포함하는지 판별.
export function queryMatches(query: string, searchParams: NavSearchParamsLike) {
  const wanted = new URLSearchParams(query)
  for (const [key, value] of wanted.entries()) {
    if (searchParams.get(key) !== value) return false
  }
  return true
}

// 쿼리 인지형 active 매칭 — 쿼리 딥링크 항목은 path+query가 모두 맞아야 active,
// 쿼리 없는 항목은 같은 경로의 쿼리 딥링크 형제가 매칭되면 하이라이트를 양보한다
// (가이드 문서 /admin/docs vs 문서 보강 큐 /admin/docs?tab=gaps).
export function isNavActive(href: string, { pathname, searchParams, siblings }: NavActiveContext) {
  const { path, query } = splitNavHref(href)
  const onPath = isAdminNavRouteMatch(path, pathname)
  if (!onPath) return false
  if (query) return queryMatches(query, searchParams)
  return !siblings.some((item) => {
    const sibling = splitNavHref(item.href)
    // 쿼리 딥링크 형제(같은 경로, 예: /admin/docs vs /admin/docs?tab=gaps)에 양보.
    if (sibling.path === path && sibling.query !== null && queryMatches(sibling.query, searchParams)) return true
    // 더 깊은 경로 형제(예: /admin/branch vs /admin/branch/ledger)가 현재 경로에 맞으면 상위는 양보 —
    // KR Team과 매출 장부가 동시에 하이라이트되지 않게 한다.
    if (sibling.path.startsWith(`${path}/`) && (pathname === sibling.path || pathname.startsWith(`${sibling.path}/`))) return true
    return false
  })
}
