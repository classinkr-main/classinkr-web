import { describe, expect, it } from "vitest"

import { ADMIN_COMMANDS } from "@/components/admin/AdminCommandPalette"

// 팔레트 커맨드는 admin-nav.ts(SSOT)에서 파생된다 — 그룹은 사이드바 섹션 라벨과 동일.
describe("admin command palette (admin-nav 파생)", () => {
  const byHref = (href: string) => ADMIN_COMMANDS.filter((cmd) => cmd.href === href)

  it("exposes the docs gap queue as a docs-tab deep link under the cs section label", () => {
    // IA 재설계(admin-ia-redesign-2026-06-29 §3·§6): 보강 큐는 독립 라우트에서
    // 문서 센터(/admin/docs)의 "보강 큐" 탭으로 병합됨. nav·팔레트 모두 탭 딥링크로 이동.
    const [gaps] = byHref("/admin/docs?tab=gaps")
    expect(gaps?.label).toBe("문서 보강 큐")
    expect(gaps?.group).toBe("고객 지원")
  })

  it("groups commands by sidebar section labels (하드웨어 재고=운영·시스템, 가이드 문서=고객 지원)", () => {
    expect(byHref("/admin/hardware")[0]?.group).toBe("운영·시스템")
    expect(byHref("/admin/docs")[0]?.group).toBe("고객 지원")
  })

  it("includes routes the old hardcoded list was missing", () => {
    for (const href of [
      "/admin/channel-talk",
      "/admin/crm/customers/unified",
      "/admin/crm/capture",
      "/admin/crm/activity",
    ]) {
      expect(byHref(href).length, href).toBeGreaterThan(0)
    }
  })

  it("keeps command keys (href+label) unique for stable list rendering", () => {
    const keys = ADMIN_COMMANDS.map((cmd) => cmd.href + cmd.label)
    expect(new Set(keys).size).toBe(keys.length)
  })
})
