import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

const sidebar = readFileSync(join(process.cwd(), "components/admin/AdminSidebar.tsx"), "utf8")

describe("AdminSidebar — 상시/기타 2단 구조", () => {
  it("resolves placement through the shared access module, not a local copy", () => {
    expect(sidebar).toContain('from "./admin-nav-access"')
    expect(sidebar).toContain("resolveNavAccess(")
  })

  it("stops rendering section headers (기타 범주 소제목이 대신한다)", () => {
    expect(sidebar).not.toContain("ADMIN_NAV_SECTION_META[section].label")
  })

  it("remembers the 기타 open state across reloads", () => {
    expect(sidebar).toContain("admin_sidebar_other_open")
  })

  it("greys out work-in-progress tabs", () => {
    expect(sidebar).toContain('maturity === "wip"')
    expect(sidebar).toContain("다듬는 중")
  })

  it("labels folded groups with the shared category meta", () => {
    expect(sidebar).toContain("ADMIN_NAV_CATEGORY_META")
  })

  it("keeps hover warm-up wired on folded items too", () => {
    // 기타 항목도 hover 시 프리페치돼야 한다 — 접혀 있다고 느려도 되는 건 아니다.
    const foldedBlock = sidebar.slice(sidebar.indexOf("navAccess.folded"))
    expect(foldedBlock).toContain("scheduleWarmAdminTab")
  })

  it("points the mobile bottom bar at the new IA", () => {
    expect(sidebar).toContain('href: "/admin/calendar"')
    expect(sidebar).toContain('href: "/admin/quotes"')
  })
})

const layout = readFileSync(join(process.cwd(), "app/admin/layout.tsx"), "utf8")

describe("AdminLayout — 차단 탭 라우트 가드", () => {
  it("blocks rendering when the current path resolves to deny", () => {
    expect(layout).toContain("resolveNavPlacement(")
    expect(layout).toContain('=== "deny"')
  })

  it("explains the block instead of silently redirecting", () => {
    // 조용한 리다이렉트는 "왜 튕겼지"를 남긴다 — 문구로 알린다.
    expect(layout).toContain("접근 권한이 없습니다")
  })

  it("states plainly that this is a surface guard, not a security boundary", () => {
    expect(layout).toContain("보안 경계가 아니다")
  })
})
