import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// 2026-09-25 "당장 해도 안전한 탭 정리" 묶음의 계약 테스트.
// DOM 환경이 없어 소스 계약 + 순수 재현으로 고정한다.
const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8")

describe("설정 — 준비중 플레이스홀더 탭(CTA·변경 이력) 삭제", () => {
  const source = read("app/admin/settings/page.tsx")

  // SECTION_FIELDS 객체 리터럴의 최상위 키 = 유효한 ?tab= 값 집합(activeTab 판정 기준).
  function sectionFieldKeys() {
    const start = source.indexOf("const SECTION_FIELDS")
    const block = source.slice(start, source.indexOf("\n}\n", start))
    return [...block.matchAll(/^ {2}(\w+):/gm)].map((match) => match[1])
  }

  // page.tsx 의 activeTab 판정을 그대로 재현한다(아래 소스 계약 테스트가 그 식을 고정한다).
  function resolveActiveTab(tabParam: string) {
    const keys = sectionFieldKeys()
    const defaultTab = source.match(/const DEFAULT_SETTINGS_TAB: SettingsTab = "(\w+)"/)?.[1]
    return keys.includes(tabParam) ? tabParam : defaultTab
  }

  it("removes cta/history from the tab type, SECTION_FIELDS and render blocks", () => {
    const typeBlock = source.slice(source.indexOf("type SettingsTab ="), source.indexOf("type SettingsKey"))

    expect(typeBlock).not.toContain('"cta"')
    expect(typeBlock).not.toContain('"history"')
    expect(sectionFieldKeys()).not.toContain("cta")
    expect(sectionFieldKeys()).not.toContain("history")
    expect(source).not.toContain('activeTab === "cta"')
    expect(source).not.toContain('activeTab === "history"')
    expect(source).not.toContain("CTA 인벤토리")
    expect(source).not.toContain('title="변경 이력"')
  })

  it("keeps the unknown-tab fallback expression that routes old links to 외부 연동", () => {
    expect(source).toContain('const DEFAULT_SETTINGS_TAB: SettingsTab = "integrations"')
    expect(source).toMatch(
      /const activeTab = Object\.prototype\.hasOwnProperty\.call\(SECTION_FIELDS, tabParam\)\s*\?\s*\(tabParam as SettingsTab\)\s*:\s*DEFAULT_SETTINGS_TAB/
    )
  })

  it.each(["cta", "history", "nope", ""])("?tab=%s lands on integrations", (tab) => {
    expect(resolveActiveTab(tab)).toBe("integrations")
  })

  it.each(["general", "lead", "links", "integrations", "notifications", "security", "members"])(
    "?tab=%s still opens its own tab",
    (tab) => {
      expect(resolveActiveTab(tab)).toBe(tab)
    }
  )

  it("leaves the decision-pending 일반·리드·폼 sections untouched", () => {
    // 일반(숨김, 직접 진입만)·리드·폼은 결정 대기(D6) — 이번 정리에서 지우지 않는다.
    expect(source).toContain('activeTab === "general"')
    expect(source).toContain('activeTab === "lead"')
    expect(source).toContain('label: "리드·폼"')
  })
})

describe("옛 경로를 만드는 코드 교정", () => {
  it("calendar health links the partner source to the final route, not the redirect stub", () => {
    const route = read("app/api/admin/calendar/health/route.ts")
    const stub = read("app/admin/partners/page.tsx")
    const stubTarget = stub.match(/redirect\("([^"]+)"\)/)?.[1]

    expect(stubTarget).toBe("/admin/crm/deals/kpi")
    expect(route).not.toContain('href: "/admin/partners"')
    expect(route).toContain(`href: "${stubTarget}"`)
  })
})

describe("미사용·테스트 표면 삭제", () => {
  it("AdminComingSoon placeholder component is gone", () => {
    expect(existsSync(join(process.cwd(), "components/admin/AdminComingSoon.tsx"))).toBe(false)
  })

  it("the public /channel-test widget test page is gone and nothing links to it", () => {
    // 2026-06-16 "test: add channel talk test page" — 방문만 해도 테스트 프로필로 채널톡을 열던
    // 개발용 페이지. noindex 도 없이 공개돼 있었고 인바운드 링크·사이트맵 항목은 0이었다.
    expect(existsSync(join(process.cwd(), "app/channel-test"))).toBe(false)
    expect(read("app/sitemap.ts")).not.toContain("channel-test")
  })
})

describe("캠페인 관리 → 마케팅 프로젝트 역링크", () => {
  it("campaign manage header links to marketing projects (projects header links back)", () => {
    const manage = read("components/admin/campaigns/manage/CampaignManageClient.tsx")
    const projects = read("components/admin/campaigns/projects/ProjectsClient.tsx")

    expect(manage).toContain('href="/admin/campaigns/projects"')
    expect(manage).toContain("마케팅 프로젝트 →")
    expect(projects).toContain('href="/admin/campaigns/manage"')
  })
})
