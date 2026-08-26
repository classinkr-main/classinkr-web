import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

// 사이드바에서 CRM 은 평평한 단일 링크다 — 드릴인(전체 메뉴 takeover)은 제거됐다.
// 이 파일 이전까지 AdminSidebar 를 렌더하는 테스트가 저장소에 0건이라,
// 드릴인 블록 두 개를 통째로 지워도 3줄 게이트가 전부 녹색으로 통과했다.
const routerState = vi.hoisted(() => ({ pathname: "/admin/crm", search: "" }))

vi.mock("next/navigation", () => ({
  usePathname: () => routerState.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(routerState.search),
}))

import AdminSidebar from "@/components/admin/AdminSidebar"

function render(pathname: string, navPreset: string | null = null) {
  routerState.pathname = pathname
  return renderToStaticMarkup(
    <AdminSidebar role="SUPER_ADMIN" name="테스터" email="t@classin.com" navPreset={navPreset} navOverrides={{}} />
  )
}

function navHrefs(html: string) {
  return [...html.matchAll(/href="(\/admin[^"]*)"/g)].map((m) => m[1])
}

describe("사이드바 CRM 평탄화", () => {
  it("CRM 안에서도 다른 섹션 링크가 그대로 보인다", () => {
    // 드릴인은 CRM 진입 시 전체 메뉴를 CRM 패널로 교체해, 마케팅·CS 로 바로 갈 수 없었다.
    const html = render("/admin/crm")
    const hrefs = navHrefs(html)
    expect(hrefs).toContain("/admin/campaigns")
    expect(hrefs).toContain("/admin/chatbot")
    expect(hrefs).toContain("/admin/calendar")
  })

  it("'전체 메뉴' 복귀 버튼이 더는 없다", () => {
    expect(render("/admin/crm")).not.toContain("전체 메뉴")
  })

  it("CRM 안과 밖의 내비 링크 집합이 같다 — 이게 '평평하다'의 정의다", () => {
    const inCrm = new Set(navHrefs(render("/admin/crm")))
    const outside = new Set(navHrefs(render("/admin/overview")))
    expect([...inCrm].sort()).toEqual([...outside].sort())
  })

  it("CRM 하위 링크를 사이드바가 더는 그리지 않는다", () => {
    const hrefs = navHrefs(render("/admin/crm/customers/leads"))
    // 하위 내비는 본문 밴드(CrmSubnav)가 전부 책임진다.
    expect(hrefs).not.toContain("/admin/crm/activity")
    expect(hrefs).not.toContain("/admin/crm/matching")
    expect(hrefs).toContain("/admin/crm")
  })

  it("저장 보기 딥링크가 사이드바에서 사라졌다 — 본문 통합 고객이 12종을 이미 제공한다", () => {
    expect(render("/admin/crm/customers/unified")).not.toContain("customers/unified?view=")
  })

  it("활성 항목이 aria-current 로 표시된다", () => {
    // 드릴인 제거 전에는 파일 내 aria-current 4곳이 전부 드릴인 블록 안이었다 —
    // 그대로 지웠으면 사이드바의 aria-current 가 0이 되는 무음 접근성 퇴행이었다.
    const html = render("/admin/crm")
    expect(html).toContain('aria-current="page"')
  })

  it("프리셋 사용자에게도 CRM 이 접히지 않고 상시로 보인다", () => {
    // 평평해진 뒤 CRM 이 '기타' 안에만 있으면 영업 핵심 화면을 메뉴에서 못 찾는다.
    expect(navHrefs(render("/admin/calendar", "cs"))).toContain("/admin/crm")
  })
})
