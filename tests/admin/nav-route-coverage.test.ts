import { readdirSync, statSync } from "node:fs"
import { join, relative, sep } from "node:path"
import { describe, expect, it } from "vitest"

import { ADMIN_NAV } from "@/components/admin/admin-nav"
import { resolveAdminNavParentHref } from "@/components/admin/admin-nav-routes"

// 경로는 "/" 구분으로 통일해 다룬다 — Windows 의 join/relative 는 "\" 를 내서, 아래의
// endsWith("/page.tsx")·정규식이 한 건도 못 잡고 routes 가 0 이 됐다(라우트는 어차피 "/" 다).
function toPosix(path: string) {
  return sep === "/" ? path : path.split(sep).join("/")
}

function walk(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry)
    return statSync(path).isDirectory() ? walk(path) : [toPosix(path)]
  })
}

function pagePathToRepresentativeRoute(path: string) {
  return `/${toPosix(relative("app", path))
    .replace(/\/page\.tsx$/, "")
    .replace(/\[(?:\.\.\.)?([^\]]+)\]/g, "sample-$1")}`
}

describe("admin page route coverage", () => {
  it("assigns every navigable page to one accessible top-level nav parent", () => {
    const parentHrefs = ADMIN_NAV.map((item) => item.href)
    const routes = walk(join(process.cwd(), "app/admin"))
      .filter((path) => path.endsWith("/page.tsx"))
      .map(pagePathToRepresentativeRoute)
      .filter((route) => route !== "/admin" && route !== "/admin/login")

    const unmapped = routes.filter(
      (route) => resolveAdminNavParentHref(route, parentHrefs) === null
    )

    // 2026-08-27 기준 61/61. 새 page.tsx를 추가하면 이 테스트가 같은 계약을 자동 점검한다.
    expect(routes.length).toBeGreaterThanOrEqual(61)
    expect(unmapped).toEqual([])
  })
})
