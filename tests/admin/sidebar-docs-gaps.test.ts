import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { ADMIN_NAV } from "@/components/admin/admin-nav"

// nav SSOT는 components/admin/admin-nav.ts — 사이드바(AdminSidebar)와
// 커맨드 팔레트(AdminCommandPalette)가 이를 임포트해 렌더한다.
describe("admin sidebar docs gap discoverability", () => {
  const sidebarSource = readFileSync(
    join(process.cwd(), "components/admin/AdminSidebar.tsx"),
    "utf8"
  )

  it("exposes the docs gap queue as a first-class cs nav item deep-linking to the docs tab", () => {
    const gapItem = ADMIN_NAV.find((item) => item.label === "문서 보강 큐")
    expect(gapItem).toBeDefined()
    // redirect 스텁(/admin/docs/gaps) 대신 탭 딥링크를 직접 가리켜 active 하이라이트가 동작한다.
    // 스텁 라우트는 북마크 호환용으로만 유지(app/admin/docs/gaps/page.tsx).
    expect(gapItem?.href).toBe("/admin/docs?tab=gaps")
    expect(gapItem?.section).toBe("cs")
  })

  it("keeps guide docs and gap queue distinguishable via query-aware active matching", () => {
    const docsItem = ADMIN_NAV.find((item) => item.href === "/admin/docs")
    expect(docsItem?.label).toBe("가이드 문서")
    // 사이드바가 tab 쿼리를 읽어 두 항목의 하이라이트를 구분한다(useSearchParams + Suspense 경계).
    expect(sidebarSource).toContain("useSearchParams")
    expect(sidebarSource).toContain("Suspense")
  })

  it("warms alpha readiness data when the gap queue nav item is hovered", () => {
    // warm-up 키는 nav href(쿼리 포함)와 완전히 같아야 적중한다.
    expect(sidebarSource).toContain('"/admin/docs?tab=gaps"')
    expect(sidebarSource).toContain("/api/admin/docs/alpha-readiness")
    expect(sidebarSource).toContain("/api/admin/docs/gaps")
  })
})
