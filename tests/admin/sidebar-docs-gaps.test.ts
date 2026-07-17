import { readFileSync } from "node:fs"
import { join } from "node:path"

import { Bot, Search } from "lucide-react"
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
    // nav 재분리(2026-07-17): "챗봇 운영·보강 큐" 겸직 항목을 "챗봇 운영"(외부)과
    // "문서 보강 큐"(챗봇+내부CS 공유 큐)로 분리했다 — 이 테스트는 보강 큐 표면을 검증한다.
    const gapItem = ADMIN_NAV.find((item) => item.label === "문서 보강 큐")
    expect(gapItem).toBeDefined()
    // redirect 스텁(/admin/docs/gaps) 대신 탭 딥링크를 직접 가리켜 active 하이라이트가 동작한다.
    // 스텁 라우트는 북마크 호환용으로만 유지(app/admin/docs/gaps/page.tsx).
    expect(gapItem?.href).toBe("/admin/docs?tab=gaps")
    expect(gapItem?.section).toBe("cs")
    // 아이콘은 Search — "챗봇 운영"(Bot)과 시각적으로 구분되는 별도 표면임을 드러낸다.
    expect(gapItem?.icon).toBe(Search)
  })

  it("keeps guide docs and gap queue distinguishable via query-aware active matching", () => {
    const docsItem = ADMIN_NAV.find((item) => item.href === "/admin/docs")
    expect(docsItem?.label).toBe("가이드 문서")
    // 사이드바가 tab 쿼리를 읽어 두 항목의 하이라이트를 구분한다(useSearchParams + Suspense 경계).
    expect(sidebarSource).toContain("useSearchParams")
    expect(sidebarSource).toContain("Suspense")
  })

  it("warms alpha readiness and chatbot pattern data when the gap queue nav item is hovered", () => {
    // warm-up 키는 nav href(쿼리 포함)와 완전히 같아야 적중한다.
    expect(sidebarSource).toContain('"/admin/docs?tab=gaps"')
    expect(sidebarSource).toContain("/api/admin/docs/alpha-readiness")
    expect(sidebarSource).toContain("/api/admin/docs/gaps")
    // 챗봇 운영이 별도 표면(/admin/chatbot)이 된 뒤에도 DocsGapsPanel은 질문 패턴(stats)을
    // 계속 읽으므로(챗봇 발 유입 배지 표시) warm 대상에서 빠지지 않는다.
    expect(sidebarSource).toContain("/api/admin/chatbot/stats")
  })

  it("exposes the external chatbot ops dashboard as a standalone cs nav item", () => {
    // nav 재분리(2026-07-17): Task X가 /admin/chatbot을 얇은 외부 운영 대시보드로 재건 —
    // "보강 큐" 탭으로 흡수돼 있던 이전 상태를 되돌려 독립 nav 항목으로 다시 표면화한다.
    const chatbotItem = ADMIN_NAV.find((item) => item.href === "/admin/chatbot")
    expect(chatbotItem).toBeDefined()
    expect(chatbotItem?.label).toBe("챗봇 운영")
    expect(chatbotItem?.section).toBe("cs")
    expect(chatbotItem?.icon).toBe(Bot)

    // ⌘K 검색성 재분배 — 챗봇 운영 검색어는 이 항목으로, 보강 큐 검색어는 gap 항목으로
    // 나뉜다(재병합이 아니라 재분배임을 확인).
    expect(chatbotItem?.keywords).toContain("챗봇")
    expect(chatbotItem?.keywords).toContain("chatbot")

    const gapItem = ADMIN_NAV.find((item) => item.href === "/admin/docs?tab=gaps")
    expect(gapItem?.keywords).toContain("보강")
    expect(gapItem?.keywords).toContain("gaps")
  })
})
