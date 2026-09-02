import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

const sidebar = readFileSync(join(process.cwd(), "components/admin/AdminSidebar.tsx"), "utf8")

describe("AdminSidebar — 상시/기타 2단 구조", () => {
  it("resolves placement through the shared access module, not a local copy", () => {
    expect(sidebar).toContain('from "./admin-nav-access"')
    expect(sidebar).toContain("resolveAdminNavAccess(")
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

  it("groups the primary list with the shared category partition (2026-08-18)", () => {
    // 상시 소제목의 표시 여부·묶음은 사이드바가 자체 계산하지 않고 resolveNavAccess 결과를 쓴다.
    expect(sidebar).toContain("navAccess.primaryGroups")
    expect(sidebar).toContain("navAccess.showPrimaryHeaders")
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

// 셸 본문은 app/admin/layout.tsx에서 components/admin/AdminShell.tsx로 옮겼다.
// (레이아웃은 서버에서 세션을 확정해 넘기는 얇은 RSC가 됐다 — 아래 두 번째 describe)
const shell = readFileSync(join(process.cwd(), "components/admin/AdminShell.tsx"), "utf8")

describe("AdminShell — 차단 탭 라우트 가드", () => {
  it("blocks rendering when the current path resolves to deny", () => {
    expect(shell).toContain("resolveAdminNavParentHref(")
    expect(shell).toContain("resolveAdminNavAccess(")
    expect(shell).toContain("getAccessibleAdminNavItems(")
  })

  it("passes the same session access context to the command palette", () => {
    expect(shell).toContain("<AdminCommandPaletteLauncher")
    expect(shell).toContain("navPreset={session.navPreset}")
    expect(shell).toContain("navOverrides={session.navOverrides}")
  })

  it("explains the block instead of silently redirecting", () => {
    // 조용한 리다이렉트는 "왜 튕겼지"를 남긴다 — 문구로 알린다.
    expect(shell).toContain("접근 권한이 없습니다")
  })

  it("states plainly that this is a surface guard, not a security boundary", () => {
    expect(shell).toContain("보안 경계가 아니다")
  })
})

const layout = readFileSync(join(process.cwd(), "app/admin/layout.tsx"), "utf8")

describe("AdminLayout — 서버 셸 부트스트랩", () => {
  it("stays a server component that resolves the session before render", () => {
    // "use client"가 다시 붙으면 첫 진입 왕복 2회가 그대로 돌아온다.
    expect(layout).not.toContain('"use client"')
    expect(layout).toContain("await resolveAdminShellSession()")
    expect(layout).toContain("<AdminShell initialSession={initialSession}>")
  })

  it("keeps the surface-guard note where the guard is bootstrapped", () => {
    expect(layout).toContain("보안 경계가 아니다")
  })
})

const drawer = readFileSync(
  join(process.cwd(), "components/admin/settings/MemberNavAccessDrawer.tsx"),
  "utf8"
)

describe("MemberNavAccessDrawer", () => {
  it("previews with the shared resolver instead of a second implementation", () => {
    // 미리보기가 자체 계산을 하면 실제 사이드바와 어긋나고, 어긋난 미리보기는
    // 이 기능 전체의 신뢰를 깎는다.
    expect(drawer).toContain("resolveAdminNavAccess(")
    expect(drawer).toContain('from "@/components/admin/admin-nav-access"')
  })

  it("locks every row when the target is a SUPER_ADMIN", () => {
    expect(drawer).toContain('targetRole === "SUPER_ADMIN"')
  })

  it("marks rows that differ from the preset as 예외", () => {
    expect(drawer).toContain("예외")
  })

  it("always sends both nav fields — the PATCH overwrites both columns", () => {
    expect(drawer).toContain("navPreset")
    expect(drawer).toContain("navOverrides")
    expect(drawer).toContain('method: "PATCH"')
  })

  it("renders explicit saving, saved, and error states", () => {
    expect(drawer).toContain('"saving"')
    expect(drawer).toContain('"saved"')
    expect(drawer).toContain('role="alert"')
  })
})

describe("MembersPanel — 탭 권한 진입점", () => {
  const panel = readFileSync(
    join(process.cwd(), "components/admin/settings/MembersPanel.tsx"),
    "utf8"
  )

  it("shows the nav access entry only to a SUPER_ADMIN viewer", () => {
    expect(panel).toContain("canManageCapabilities")
    expect(panel).toContain("MemberNavAccessDrawer")
  })
})
