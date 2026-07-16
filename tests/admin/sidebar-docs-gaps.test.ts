import { readFileSync } from "node:fs"
import { join } from "node:path"

import { Bot } from "lucide-react"
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
    // 라벨 "챗봇 운영·보강 큐"(2026-07-16) — ALL_NEW1 IA 재편에서 흡수된 "챗봇 운영" nav의
    // 가시성을 이 항목의 라벨·아이콘으로 복원했다(탭 흡수 자체는 유지, 표면화만 복원).
    const gapItem = ADMIN_NAV.find((item) => item.label === "챗봇 운영·보강 큐")
    expect(gapItem).toBeDefined()
    // redirect 스텁(/admin/docs/gaps) 대신 탭 딥링크를 직접 가리켜 active 하이라이트가 동작한다.
    // 스텁 라우트는 북마크 호환용으로만 유지(app/admin/docs/gaps/page.tsx).
    expect(gapItem?.href).toBe("/admin/docs?tab=gaps")
    expect(gapItem?.section).toBe("cs")
    // 아이콘도 Bot으로 교체돼 챗봇 운영 항목임을 시각적으로 드러낸다.
    expect(gapItem?.icon).toBe(Bot)
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
    // 챗봇 운영 대시보드 흡수 후 DocsGapsPanel이 질문 패턴(stats)도 읽으므로 warm 대상에 포함.
    expect(sidebarSource).toContain("/api/admin/chatbot/stats")
  })

  it("absorbs the chatbot ops dashboard into the gap queue tab (no standalone nav item)", () => {
    // IA 재편(admin-ia-redesign-2026-06-29 §2-🟠3): chatbot 고유 데이터 없음 —
    // 보강 큐 탭(DocsGapsPanel)이 챗봇 대시보드 상위집합이라 /admin/chatbot은 흡수됨.
    const chatbotItem = ADMIN_NAV.find((item) => item.href === "/admin/chatbot")
    expect(chatbotItem).toBeUndefined()

    // ⌘K 검색성 보존 — 챗봇 검색어는 보강 큐 항목 keywords로 병합된다.
    const gapItem = ADMIN_NAV.find((item) => item.href === "/admin/docs?tab=gaps")
    expect(gapItem?.keywords).toContain("챗봇")
    expect(gapItem?.keywords).toContain("chatbot")
  })
})
