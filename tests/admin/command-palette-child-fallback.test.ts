import { describe, expect, it, vi } from "vitest"

// 캠페인 관리는 지금 사이드바(ADMIN_NAV) 항목이라 ⌘K 에 최상위 명령으로 뜨고, 마케팅 허브의
// 같은 href 자식 명령은 중복이라 방출되지 않는다. 이 파일은 그 항목이 사이드바 SSOT 에서
// 빠지는 날(허브 흡수 결정 D2)을 흉내 내 — 자식 명령이 ⌘K 도달 경로를 이어받는지 확인한다.
// 마케팅 프로젝트는 2026-10 캠페인 관리의 탭이 되며 이미 사이드바에서 빠졌다 — 그 자식 명령
// (?view=projects)은 모킹 없이도 늘 방출된다. 모듈 모킹이 파일 단위라 본 팔레트 테스트와 분리했다.
// vi.mock 팩토리는 파일 맨 위로 끌어올려지므로 참조 값도 vi.hoisted 로 함께 올린다.
const { REMOVED_FROM_NAV } = vi.hoisted(() => ({
  REMOVED_FROM_NAV: ["/admin/campaigns/manage"],
}))

vi.mock("@/components/admin/admin-nav", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/admin/admin-nav")>()
  return {
    ...actual,
    ADMIN_NAV: actual.ADMIN_NAV.filter((item) => !REMOVED_FROM_NAV.includes(item.href)),
  }
})

import { ADMIN_COMMANDS, resolveAdminCommands } from "@/components/admin/AdminCommandPalette"

describe("⌘K child fallback when a surface leaves the sidebar SSOT", () => {
  it.each([
    ["/admin/campaigns/manage", "캠페인 관리"],
    ["/admin/campaigns/manage?view=projects", "마케팅 프로젝트"],
  ])("%s stays reachable as a 마케팅 hub child command", (href, label) => {
    for (const commands of [ADMIN_COMMANDS, resolveAdminCommands({ role: "ADMIN", overrides: {} })]) {
      const matches = commands.filter((cmd) => cmd.href === href)
      expect(matches).toHaveLength(1)
      expect(matches[0]?.label).toBe(label)
      expect(matches[0]?.group).toBe("마케팅·분석")
    }
  })

  it("places the fallback children right after the hub entry", () => {
    const hrefs = ADMIN_COMMANDS.map((cmd) => cmd.href)
    const hub = hrefs.indexOf("/admin/campaigns")

    expect(hrefs.slice(hub, hub + 4)).toEqual([
      "/admin/campaigns",
      "/admin/campaigns?tab=email",
      "/admin/campaigns/manage",
      "/admin/campaigns/manage?view=projects",
    ])
  })
})
