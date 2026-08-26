import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { CRM_CHILD_NAV } from "@/components/admin/admin-nav"

// CRM 하위 내비게이션은 이제 본문 밴드가 전부 책임진다(사이드바는 평평한 단일 링크).
// 이전에는 CrmSubnav 가 고객·돈흐름이 아니면 null 을 뱉었고, 나머지 5개 화면은
// 사이드바 드릴인이 유일한 내비였다 — 그 조기 반환이 되살아나면 그 화면들의 내비가 0이 된다.
// 이 파일이 그 회귀를 잡는다. CrmSubnav 렌더 테스트는 이전까지 0건이었다.
const routerState = vi.hoisted(() => ({ pathname: "/admin/crm" }))

vi.mock("next/navigation", () => ({
  usePathname: () => routerState.pathname,
}))

import CrmSubnav from "@/components/admin/crm/CrmSubnav"

function render(pathname: string) {
  routerState.pathname = pathname
  return renderToStaticMarkup(<CrmSubnav />)
}

// CRM_CHILD_NAV 가 커버하는 화면 + 2차 서브탭이 붙는 화면
const CRM_PATHS = [
  "/admin/crm",
  "/admin/crm/customers/unified",
  "/admin/crm/customers/leads",
  "/admin/crm/activity",
  "/admin/crm/capture",
  "/admin/crm/matching",
  "/admin/crm/insights",
  "/admin/crm/deals",
  "/admin/crm/deals/rev-sheet",
]

describe("CRM 본문 내비 밴드", () => {
  it.each(CRM_PATHS)("%s 에서 1차 탭 5개가 전부 선다", (pathname) => {
    const html = render(pathname)
    // 라벨은 정본(admin-nav.ts)에서 가져온다 — 하드코딩하면 어휘가 갈린 걸 못 잡는다.
    for (const child of CRM_CHILD_NAV) expect(html).toContain(child.label)
  })

  it.each(CRM_PATHS)("%s 에서 밴드가 비어 있지 않다", (pathname) => {
    // 조기 반환(null) 부활 방지 — 이게 이 파일의 존재 이유다.
    expect(render(pathname).length).toBeGreaterThan(200)
  })

  it("활성 1차 탭은 채운 pill, 2차는 밑줄로 층을 나눈다", () => {
    const html = render("/admin/crm/customers/leads")
    // 1차 활성 = 검은 채움
    expect(html).toContain("bg-[#111110] text-white")
    // 2차 활성 = 그린 밑줄 (검은 채움을 두 층에 겹쳐 쓰면 위계가 사라진다)
    expect(html).toContain("bg-[#084734]")
    expect(html).toContain('aria-current="page"')
  })

  it("고객 섹션에서는 2차 서브탭이 함께 선다", () => {
    const html = render("/admin/crm/customers/leads")
    for (const label of ["통합", "리드", "원천 고객", "지도 원천"]) expect(html).toContain(label)
  })

  it("2차가 없는 화면에서도 1차는 남는다", () => {
    const html = render("/admin/crm/activity")
    expect(html).toContain("기록")
    expect(html).not.toContain("지도 원천")
  })
})
