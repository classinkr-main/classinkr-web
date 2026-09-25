import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { CRM_CHILD_NAV } from "@/components/admin/admin-nav"
import {
  CRM_SUBNAV_DEFAULT_HIDDEN_HREFS,
  CRM_SUBNAV_UNHIDEABLE_HREFS,
  crmSubnavKey,
} from "@/components/admin/admin-nav-access"
import { AdminNavPreferencesProvider } from "@/components/admin/admin-nav-preferences-context"

// CRM 하위 내비게이션은 이제 본문 밴드가 전부 책임진다(사이드바는 평평한 단일 링크).
// 이전에는 CrmSubnav 가 고객·돈흐름이 아니면 null 을 뱉었고, 나머지 5개 화면은
// 사이드바 드릴인이 유일한 내비였다 — 그 조기 반환이 되살아나면 그 화면들의 내비가 0이 된다.
// 이 파일이 그 회귀를 잡는다. CrmSubnav 렌더 테스트는 이전까지 0건이었다.
//
// (2026-09-25) CRM 하위 탭 개인 숨김 — 기록·입력함·고객DB›태그는 전원 기본 숨김이다. 진입 탭
// 3개(현황·고객DB·검수)는 숨길 수 없어 1차 줄은 여전히 비지 않고, 숨긴 탭도 그 화면에 있으면
// 강제로 보인다(현재 위치가 탭 줄에서 사라지지 않게).
const routerState = vi.hoisted(() => ({ pathname: "/admin/crm" }))

// useRouter — CrmSubnav의 useSubtabWarmup이 T2(hover FULL 프리페치)로 router.prefetch를
// 부른다. renderToStaticMarkup은 이벤트 핸들러를 실행하지 않으므로 실제로 호출되진 않지만,
// 훅이 렌더 중에 useRouter()를 참조하므로 모킹이 없으면 렌더 자체가 실패한다.
vi.mock("next/navigation", () => ({
  usePathname: () => routerState.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}))

import CrmSubnav from "@/components/admin/crm/CrmSubnav"

function render(pathname: string, navOverrides?: Record<string, string>) {
  routerState.pathname = pathname
  if (!navOverrides) return renderToStaticMarkup(<CrmSubnav />)
  return renderToStaticMarkup(
    <AdminNavPreferencesProvider value={{ role: "ADMIN", navOverrides }}>
      <CrmSubnav />
    </AdminNavPreferencesProvider>
  )
}

/** aria-current="page" 가 붙은 링크들의 마크업. */
function activeLinks(html: string) {
  return html.match(/<a[^>]*aria-current="page"[^>]*>[\s\S]*?<\/a>/g) ?? []
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

const ENTRY_TABS = CRM_CHILD_NAV.filter((child) => CRM_SUBNAV_UNHIDEABLE_HREFS.includes(child.href))
const SHOW_ALL_PRIMARY = {
  [crmSubnavKey("/admin/crm/activity")]: "shown",
  [crmSubnavKey("/admin/crm/capture")]: "shown",
}

describe("CRM 본문 내비 밴드", () => {
  it("진입 탭 3개는 현황·고객DB·검수다(숨길 수 없음)", () => {
    expect(ENTRY_TABS.map((child) => child.label)).toEqual(["현황", "고객DB", "검수"])
  })

  it.each(CRM_PATHS)("%s 에서 기본값이면 진입 탭 3개가 서고 '숨긴 탭' 토글이 붙는다", (pathname) => {
    const html = render(pathname)
    // 라벨은 정본(admin-nav.ts)에서 가져온다 — 하드코딩하면 어휘가 갈린 걸 못 잡는다.
    for (const child of ENTRY_TABS) expect(html).toContain(child.label)
    expect(html).toContain("숨긴 탭")
    expect(html).toContain('aria-expanded="false"')
  })

  it.each(CRM_PATHS)("%s 에서 기본 숨김을 되살리면(shown) 1차 탭 5개가 전부 선다", (pathname) => {
    const html = render(pathname, SHOW_ALL_PRIMARY)
    for (const child of CRM_CHILD_NAV) expect(html).toContain(child.label)
  })

  it.each(CRM_PATHS)("%s 에서 밴드가 비어 있지 않다", (pathname) => {
    // 조기 반환(null) 부활 방지 — 이게 이 파일의 존재 이유다.
    expect(render(pathname).length).toBeGreaterThan(200)
  })

  it("현황에서는 기본 숨김 탭(기록·입력함)이 1차 줄에 없고, 숨긴 탭 수는 3이다", () => {
    const html = render("/admin/crm")
    expect(html).not.toContain(">기록<")
    expect(html).not.toContain(">입력함<")
    expect(html).toContain('숨긴 탭 <span class="tabular-nums">3</span>')
    // 펼치기 전에는 숨긴 탭 패널을 그리지 않는다(펼침 상태는 저장하지 않는다).
    expect(html).not.toContain('aria-label="숨긴 CRM 탭"')
  })

  it.each(CRM_SUBNAV_DEFAULT_HIDDEN_HREFS)("기본 숨김 %s 화면에 있으면 그 탭을 강제로 보인다", (href) => {
    const html = render(href)
    const label = href.endsWith("/tags") ? "태그" : href.endsWith("/capture") ? "입력함" : "기록"
    const forced = activeLinks(html).find((link) => link.includes(label))
    expect(forced, label).toBeTruthy()
    expect(forced).toContain("(숨긴 탭)")
  })

  it("숨기지 않은 활성 탭에는 '(숨긴 탭)' 표시가 없다", () => {
    const html = render("/admin/crm/activity", SHOW_ALL_PRIMARY)
    const active = activeLinks(html).find((link) => link.includes("기록"))
    expect(active).toBeTruthy()
    expect(active).not.toContain("(숨긴 탭)")
  })

  it("숨길 수 없는 탭의 crm: 키는 무시된다 — 검수는 항상 선다", () => {
    const html = render("/admin/crm", {
      [crmSubnavKey("/admin/crm/matching")]: "hidden",
      [crmSubnavKey("/admin/crm")]: "hidden",
    })
    expect(html).toContain(">검수<")
    expect(html).toContain(">현황<")
  })

  it("숨긴 탭이 하나도 없으면 토글을 그리지 않는다", () => {
    const html = render("/admin/crm", {
      ...SHOW_ALL_PRIMARY,
      [crmSubnavKey("/admin/crm/customers/tags")]: "shown",
    })
    expect(html).not.toContain("숨긴 탭")
  })

  it("활성 1차 탭은 채운 pill, 2차는 밑줄로 층을 나눈다", () => {
    const html = render("/admin/crm/customers/leads")
    // 1차 활성 = 검은 채움
    expect(html).toContain("bg-[#111110] text-white")
    // 2차 활성 = 그린 밑줄 (검은 채움을 두 층에 겹쳐 쓰면 위계가 사라진다)
    expect(html).toContain("bg-[#084734]")
    expect(html).toContain('aria-current="page"')
  })

  it("고객 섹션에서는 2차 서브탭이 함께 선다(세그먼트는 원천 고객 뒤·지도 앞)", () => {
    const html = render("/admin/crm/customers/leads")
    for (const label of ["통합", "리드", "원천 고객", "세그먼트", "지도"]) expect(html).toContain(label)
    expect(html.indexOf(">원천 고객<")).toBeLessThan(html.indexOf(">세그먼트<"))
    expect(html.indexOf(">세그먼트<")).toBeLessThan(html.indexOf(">지도<"))
    // 태그는 기본 숨김이라 태그 화면이 아니면 보조 줄에 없다.
    expect(html).not.toContain(">태그<")
  })

  it("세그먼트 화면에서는 세그먼트 보조 탭이 활성이다", () => {
    const html = render("/admin/crm/customers/segments")
    expect(activeLinks(html).some((link) => link.includes("세그먼트"))).toBe(true)
    expect(activeLinks(html).some((link) => link.includes("고객DB"))).toBe(true)
  })

  it("개인이 숨긴 고객 보조 탭은 보조 줄에서 빠진다", () => {
    const html = render("/admin/crm/customers/unified", {
      [crmSubnavKey("/admin/crm/customers/leads")]: "hidden",
    })
    expect(html).not.toContain(">리드<")
    expect(html).toContain('숨긴 탭 <span class="tabular-nums">4</span>')
  })

  it("2차가 없는 화면에서도 1차는 남는다", () => {
    const html = render("/admin/crm/activity")
    expect(html).toContain("기록")
    expect(html).not.toContain("원천 고객")
  })
})
