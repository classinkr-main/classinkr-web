import { readdirSync, statSync } from "node:fs"
import { join, relative, sep } from "node:path"
import { describe, expect, it } from "vitest"

import { ADMIN_NAV } from "@/components/admin/admin-nav"
import { resolveAdminNavParentHref } from "@/components/admin/admin-nav-routes"
import { ADMIN_AI_HREF, isAdminAiPreviewEnabled } from "@/lib/admin-ai/preview"

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
    const allRoutes = walk(join(process.cwd(), "app/admin"))
      .filter((path) => path.endsWith("/page.tsx"))
      .map(pagePathToRepresentativeRoute)
      .filter((route) => route !== "/admin" && route !== "/admin/login")

    // 시안 스위치가 꺼져 있으면(기본, 기획 D13 — lib/admin-ai/preview.ts) /admin/ai 는 page.tsx 가 있어도
    // notFound() 이고 ADMIN_NAV 에도 없다. 그 경로만 뺀다 — 켜면 다른 화면과 같은 계약을 받는다
    // (켜짐 쪽 부모 판정은 tests/admin/nav-ai-preview.test.tsx). 뺄 경로가 실제로 있는지도 본다.
    const gatedRoutes = isAdminAiPreviewEnabled() ? [] : [ADMIN_AI_HREF]
    for (const gated of gatedRoutes) expect(allRoutes, gated).toContain(gated)
    const routes = allRoutes.filter((route) => !gatedRoutes.includes(route))

    const unmapped = routes.filter(
      (route) => resolveAdminNavParentHref(route, parentHrefs) === null
    )

    // 2026-08-27 기준 61/61. 새 page.tsx를 추가하면 이 테스트가 같은 계약을 자동 점검한다.
    expect(routes.length).toBeGreaterThanOrEqual(61)
    expect(unmapped).toEqual([])
  })
})
