// 최상위 Admin nav와 그 아래로 흡수된 독립 라우트의 관계 SSOT.
//
// 이 표는 화면 접근 권한을 새로 정의하지 않는다. 자식 라우트가 어느 ADMIN_NAV 항목의
// active 상태·모바일 제목·표면 접근 결정을 상속하는지만 정의한다. 사이드바, AdminLayout,
// 모바일 nav가 각자 문자열 예외를 만들면 같은 화면에서 서로 다른 부모를 가리키게 된다.

export interface AdminNavRouteFamily {
  parentHref: string
  childPathPrefixes: readonly string[]
}

export const ADMIN_NAV_ROUTE_FAMILIES: readonly AdminNavRouteFamily[] = [
  {
    parentHref: "/admin/calendar",
    childPathPrefixes: ["/admin/events"],
  },
  {
    parentHref: "/admin/crm",
    childPathPrefixes: ["/admin/partners"],
  },
  {
    parentHref: "/admin/quotes",
    childPathPrefixes: ["/admin/contracts", "/admin/receipts", "/admin/software-quote-codes"],
  },
  {
    parentHref: "/admin/campaigns",
    childPathPrefixes: ["/admin/marketing"],
  },
  {
    parentHref: "/admin/lead-magnets",
    childPathPrefixes: ["/admin/materials"],
  },
  {
    parentHref: "/admin/analytics",
    childPathPrefixes: ["/admin/traffic"],
  },
  {
    parentHref: "/admin/chatbot",
    childPathPrefixes: ["/admin/docs", "/admin/channel-talk", "/admin/cs-chatbot"],
  },
  {
    parentHref: "/admin/settings",
    childPathPrefixes: ["/admin/users"],
  },
] as const

function hrefPath(href: string) {
  const queryIndex = href.indexOf("?")
  return queryIndex === -1 ? href : href.slice(0, queryIndex)
}

function pathMatchesPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

/**
 * pathname이 parentHref 자체 또는 그 부모에 흡수된 자식 라우트인지 판정한다.
 * 쿼리 딥링크의 query 검사는 nav-active.ts가 별도로 담당한다.
 */
export function isAdminNavRouteMatch(parentHref: string, pathname: string) {
  const parentPath = hrefPath(parentHref)
  if (pathMatchesPrefix(pathname, parentPath)) return true

  const family = ADMIN_NAV_ROUTE_FAMILIES.find((entry) => entry.parentHref === parentPath)
  return family?.childPathPrefixes.some((prefix) => pathMatchesPrefix(pathname, prefix)) ?? false
}

/**
 * 현재 pathname을 책임지는 최상위 nav href를 반환한다.
 * /admin/branch와 /admin/branch/ledger처럼 겹치는 직접 경로는 가장 긴 경로가 이긴다.
 */
export function resolveAdminNavParentHref(
  pathname: string,
  parentHrefs: readonly string[]
): string | null {
  let bestHref: string | null = null
  let bestMatchLength = -1

  for (const href of parentHrefs) {
    const parentPath = hrefPath(href)
    let matchLength = pathMatchesPrefix(pathname, parentPath) ? parentPath.length : -1

    const family = ADMIN_NAV_ROUTE_FAMILIES.find((entry) => entry.parentHref === parentPath)
    for (const prefix of family?.childPathPrefixes ?? []) {
      if (pathMatchesPrefix(pathname, prefix)) matchLength = Math.max(matchLength, prefix.length)
    }

    if (matchLength > bestMatchLength) {
      bestHref = href
      bestMatchLength = matchLength
    }
  }

  return bestHref
}
