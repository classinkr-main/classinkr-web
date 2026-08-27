import { describe, expect, it } from "vitest"

import {
  ADMIN_COMMANDS,
  resolveAdminCommands,
} from "@/components/admin/AdminCommandPalette"
import type { NavAccessContext } from "@/components/admin/admin-nav-access"

// 팔레트 커맨드는 admin-nav.ts(SSOT)에서 파생된다 — 그룹은 사이드바 섹션 라벨과 동일.
describe("admin command palette (admin-nav 파생)", () => {
  const byHref = (href: string) => ADMIN_COMMANDS.filter((cmd) => cmd.href === href)

  it("exposes the CS console as the cs section entry point", () => {
    // CS 콘솔 IA 재구성(2026-07-27): "챗봇 운영"이 외부 축 전체의 입구인 "CS 콘솔"로 승격.
    const [console] = byHref("/admin/chatbot")
    expect(console?.label).toBe("CS 콘솔")
    expect(console?.group).toBe("고객 지원")
  })

  it("keeps the absorbed cs surfaces reachable as ⌘K child commands", () => {
    // 사이드바 항목에서는 빠졌지만 URL은 그대로다 — 팔레트 도달성이 끊기면 안 된다.
    // 라벨은 콘솔 가로 메뉴명과 일치시킨다(두 표면의 어휘 단일화).
    const [gaps] = byHref("/admin/docs?tab=gaps")
    expect(gaps?.label).toBe("미해결 큐")
    expect(gaps?.group).toBe("고객 지원")

    const [inbox] = byHref("/admin/channel-talk")
    expect(inbox?.label).toBe("상담 Inbox (채널톡)")
    expect(inbox?.group).toBe("고객 지원")
  })

  it("exposes internal CS as its own cs command", () => {
    const [internal] = byHref("/admin/cs-chatbot")
    expect(internal?.label).toBe("내부 CS")
    expect(internal?.group).toBe("고객 지원")
  })

  it("groups commands by sidebar section labels (하드웨어 재고=영업·매출, 가이드 문서=고객 지원)", () => {
    // 하드웨어 재고는 견적·문서 바로 아래(sales 섹션)로 이동됨 — f25fccbc.
    expect(byHref("/admin/hardware")[0]?.group).toBe("영업·매출")
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

  it("keeps every static CRM back-office surface globally discoverable", () => {
    for (const href of [
      "/admin/crm/customers/map",
      "/admin/crm/deals/rev-sheet",
      "/admin/crm/deals/orders",
      "/admin/crm/deals/kpi",
      "/admin/crm/insights",
    ]) {
      expect(byHref(href).length, href).toBeGreaterThan(0)
      expect(byHref(href)[0]?.group).toBe("영업·매출")
    }
  })

  it("exposes creation, quality-review, and member-management deep links", () => {
    expect(byHref("/admin/docs/new")[0]?.label).toBe("새 가이드 문서")
    expect(byHref("/admin/docs?tab=quality")[0]?.label).toBe("AI 품질 검수")
    expect(byHref("/admin/settings?tab=members")[0]?.label).toBe("회원 관리")
  })

  it("keeps command keys (href+label) unique for stable list rendering", () => {
    const keys = ADMIN_COMMANDS.map((cmd) => cmd.href + cmd.label)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it("makes absorbed event routes discoverable by the Korean query '행사'", () => {
    const matches = ADMIN_COMMANDS.filter((command) =>
      `${command.label} ${command.keywords ?? ""}`.toLowerCase().includes("행사")
    )

    expect(matches.map((command) => command.href)).toEqual(
      expect.arrayContaining(["/admin/events", "/admin/events/new"])
    )
  })
})

describe("admin command palette access parity", () => {
  const commandsFor = (overrides: Partial<NavAccessContext> = {}) =>
    resolveAdminCommands({
      role: "ADMIN",
      preset: "staff",
      overrides: {},
      ...overrides,
    })

  const hrefsFor = (overrides: Partial<NavAccessContext> = {}) =>
    commandsFor(overrides).map((command) => command.href)

  it("inherits calendar access for the absorbed event commands", () => {
    expect(hrefsFor()).toEqual(expect.arrayContaining(["/admin/events", "/admin/events/new"]))
  })

  it("inherits Analytics access for traffic", () => {
    expect(hrefsFor()).not.toContain("/admin/traffic")
    expect(hrefsFor({ preset: "lead" })).toContain("/admin/traffic")
  })

  it("removes every absorbed CS command when its console parent is denied", () => {
    const hrefs = hrefsFor({ overrides: { "/admin/chatbot": "deny" } })

    expect(hrefs).not.toContain("/admin/chatbot")
    expect(hrefs).not.toContain("/admin/docs")
    expect(hrefs).not.toContain("/admin/channel-talk")
    expect(hrefs).not.toContain("/admin/cs-chatbot")
  })

  it("applies role visibility before exposing commands", () => {
    expect(hrefsFor({ role: "EDITOR", preset: null })).not.toContain("/admin/settings")
    expect(hrefsFor({ role: "SUPER_ADMIN", preset: null })).toContain("/admin/settings")
  })
})
