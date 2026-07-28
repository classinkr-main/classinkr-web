import { readFileSync } from "node:fs"
import { join } from "node:path"

import { BookOpen, Bot, Headset, MessageSquare, Search } from "lucide-react"
import { describe, expect, it } from "vitest"

import { ADMIN_NAV } from "@/components/admin/admin-nav"
import { CS_CONSOLE_MODES, resolveCsConsoleMode } from "@/components/admin/cs/CsConsoleNav"

// nav SSOT는 components/admin/admin-nav.ts — 사이드바(AdminSidebar)와
// 커맨드 팔레트(AdminCommandPalette)가 이를 임포트해 렌더한다.
// CS 콘솔 IA 재구성(docs/active/cs-admin-console-ia-2026-07-27.md §2)으로 cs 섹션은
// 5항목 → 3항목이 되고, 보강 큐·채널톡은 콘솔 가로 메뉴(CsConsoleNav)로 옮겨갔다.
// URL은 하나도 바뀌지 않았으므로 이 테스트는 "이동했지 사라지지 않았다"를 고정한다.
describe("admin cs nav — 사이드바 3항목 + 콘솔 가로 메뉴", () => {
  const sidebarSource = readFileSync(
    join(process.cwd(), "components/admin/AdminSidebar.tsx"),
    "utf8"
  )
  const csNav = ADMIN_NAV.filter((item) => item.section === "cs")
  const customerItems = CS_CONSOLE_MODES.find((mode) => mode.mode === "customer")!.items
  const internalItems = CS_CONSOLE_MODES.find((mode) => mode.mode === "internal")!.items

  it("reduces the sidebar cs section to guide docs / CS console / internal CS", () => {
    expect(csNav.map((item) => item.href)).toEqual([
      "/admin/docs",
      "/admin/chatbot",
      "/admin/cs-chatbot",
    ])
    expect(csNav.map((item) => item.label)).toEqual(["가이드 문서", "CS 콘솔", "내부 CS"])
    expect(csNav.map((item) => item.icon)).toEqual([BookOpen, Bot, Headset])
  })

  it("drops the two absorbed sidebar items (they live on the console menu now)", () => {
    // 화면이 사라진 게 아니라 진입점이 옮겨간 것이다 — 아래 콘솔 메뉴 검증이 짝을 이룬다.
    expect(ADMIN_NAV.some((item) => item.href === "/admin/docs?tab=gaps")).toBe(false)
    expect(ADMIN_NAV.some((item) => item.href === "/admin/channel-talk")).toBe(false)
  })

  it("keeps ⌘K searchability for the absorbed surfaces on the CS console item", () => {
    const console = csNav.find((item) => item.href === "/admin/chatbot")
    expect(console?.keywords).toContain("채널톡")
    expect(console?.keywords).toContain("channel talk")
    expect(console?.keywords).toContain("보강")
    expect(console?.keywords).toContain("gaps")
  })

  it("exposes the gap queue as the console's 미해결 큐 menu, still deep-linking to the docs tab", () => {
    const gapItem = customerItems.find((item) => item.label === "미해결 큐")
    expect(gapItem).toBeDefined()
    // redirect 스텁(/admin/docs/gaps) 대신 탭 딥링크를 직접 가리켜 active 하이라이트가 동작한다.
    // 스텁 라우트는 북마크 호환용으로만 유지(app/admin/docs/gaps/page.tsx).
    expect(gapItem?.href).toBe("/admin/docs?tab=gaps")
    // 아이콘은 Search — "대시보드"(Bot)와 시각적으로 구분되는 별도 표면임을 드러낸다.
    expect(gapItem?.icon).toBe(Search)
  })

  it("exposes channel talk as the console's 상담 Inbox menu, admin-only as before", () => {
    const inbox = customerItems.find((item) => item.href === "/admin/channel-talk")
    expect(inbox?.label).toBe("상담 Inbox")
    expect(inbox?.icon).toBe(MessageSquare)
    // 사이드바 시절 STAFF_ADMIN(+BRANCH) 롤을 그대로 승계 — 콘솔에서만 유일하게 좁은 항목.
    expect(inbox?.roles).toEqual(["SUPER_ADMIN", "ADMIN", "BRANCH"])
    expect(inbox?.roles).not.toContain("EDITOR")
    for (const item of customerItems.filter((entry) => entry.href !== "/admin/channel-talk")) {
      expect(item.roles, item.label).toContain("EDITOR")
    }
  })

  it("groups 가이드 문서 over documents / categories / redirects (§5)", () => {
    const guide = customerItems.find((item) => item.label === "가이드 문서")
    expect(guide?.href).toBe("/admin/docs?tab=documents")
    expect(guide?.activeWhen).toContain("/admin/docs?tab=categories")
    expect(guide?.activeWhen).toContain("/admin/docs?tab=redirects")
  })

  it("renders 본사 확인 in the internal menu now that P3 shipped the screen", () => {
    const hq = internalItems.find((item) => item.href === "/admin/cs-chatbot?tab=hq")
    expect(hq?.label).toBe("본사 확인")
    // P3 이전에는 enabled:false로 렌더에서 빠져 있었다 — 화면(tab=hq)이 생기면서 켜졌다.
    expect(hq?.enabled).not.toBe(false)
    // 내부 메뉴 4항목이 §2 표 순서 그대로 전부 렌더된다.
    expect(internalItems.filter((item) => item.enabled !== false).map((item) => item.label)).toEqual([
      "내부 상담",
      "대기열",
      "본사 확인",
      "운영 도구",
    ])
  })

  it("derives the console mode from pathname only (no mode param — §5)", () => {
    expect(resolveCsConsoleMode("/admin/cs-chatbot")).toBe("internal")
    expect(resolveCsConsoleMode("/admin/chatbot")).toBe("customer")
    expect(resolveCsConsoleMode("/admin/channel-talk")).toBe("customer")
    expect(resolveCsConsoleMode("/admin/docs")).toBe("customer")
  })

  it("keeps guide docs and gap queue distinguishable via query-aware active matching", () => {
    const docsItem = ADMIN_NAV.find((item) => item.href === "/admin/docs")
    expect(docsItem?.label).toBe("가이드 문서")
    // 사이드바가 tab 쿼리를 읽어 두 항목의 하이라이트를 구분한다(useSearchParams + Suspense 경계).
    expect(sidebarSource).toContain("useSearchParams")
    expect(sidebarSource).toContain("Suspense")
    // 판정 자체는 nav-active.ts(SSOT)에서 온다 — 사이드바가 자체 구현을 다시 들고 있지 않다.
    expect(sidebarSource).toContain('from "./nav-active"')
  })

  it("keeps warm-up keys for the surfaces that moved to the console menu", () => {
    // warm-up 키는 href(쿼리 포함)와 완전히 같아야 적중한다. URL이 안 바뀌었으므로 키도 유효하다.
    expect(sidebarSource).toContain('"/admin/docs?tab=gaps"')
    expect(sidebarSource).toContain('"/admin/channel-talk"')
    expect(sidebarSource).toContain("/api/admin/docs/alpha-readiness")
    expect(sidebarSource).toContain("/api/admin/docs/gaps")
    // DocsGapsPanel은 질문 패턴(stats)도 읽는다(챗봇 발 유입 배지).
    expect(sidebarSource).toContain("/api/admin/chatbot/stats")
  })

  it("warms the internal CS workspace mount fetches", () => {
    expect(sidebarSource).toContain('"/admin/cs-chatbot"')
    expect(sidebarSource).toContain("/api/admin/cs-chat/conversations?status=all&limit=100")
    expect(sidebarSource).toContain("/api/admin/cs-chat/regression-candidates")
  })
})
