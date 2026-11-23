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

// 기본 역할은 SUPER_ADMIN = 전체 사이드바 계정이다. 2026-11-20 부터 그 밖의 계정은 간소 사이드바
// (매출 장부 + 견적·문서 + 하드웨어 재고)라, 이 파일의 2026-11-19 이전 기대값은 전부 전체 계정의 것이다.
// 간소 계정은 맨 아래 "간소 사이드바" describe 가 렌더로 본다.
function render(
  pathname: string,
  options: { role?: string; navPreset?: string | null; navOverrides?: Record<string, string> } = {}
) {
  routerState.pathname = pathname
  return renderToStaticMarkup(
    <AdminSidebar
      role={options.role ?? "SUPER_ADMIN"}
      name="테스터"
      email="t@classin.com"
      navPreset={options.navPreset}
      navOverrides={options.navOverrides ?? {}}
    />
  )
}

function navHrefs(html: string) {
  return [...html.matchAll(/href="(\/admin[^"]*)"/g)].map((m) => m[1])
}

function activeNavHrefs(html: string) {
  return [...html.matchAll(/<a\b[^>]*>/g)]
    .filter(([tag]) => tag.includes('aria-current="page"'))
    .flatMap(([tag]) => tag.match(/href="([^"]+)"/)?.[1] ?? [])
}

function mobileHeader(html: string) {
  return html.match(/<header\b[^>]*>[\s\S]*?<\/header>/)?.[0] ?? ""
}

function mobileBottomBar(html: string) {
  return html.match(/<nav class="fixed inset-x-0 bottom-0[^"]*">[\s\S]*?<\/nav>/)?.[0] ?? ""
}

/** "숨긴 탭 N · 보기" 토글의 N. 묶음이 없으면 null. */
function hiddenCount(html: string) {
  const match = html.match(/숨긴 탭 <span class="tabular-nums">(\d+)<\/span>/)
  return match ? Number(match[1]) : null
}

describe("사이드바 CRM 평탄화", () => {
  it("CRM 안에서도 다른 상시 링크가 그대로 보인다", () => {
    // 드릴인은 CRM 진입 시 전체 메뉴를 CRM 패널로 교체해, 마케팅·CS 로 바로 갈 수 없었다.
    // 2026-09-10 전면 공개 이후 마케팅·시스템 탭은 접힌 "기타"로 내려갔으므로, 여기서는
    // 상시 목록이 CRM 안에서도 그대로인지만 본다(기타 접근성은 아래 토글 테스트가 맡는다).
    const html = render("/admin/crm")
    const hrefs = navHrefs(html)
    expect(hrefs).toContain("/admin/chatbot")
    expect(hrefs).toContain("/admin/calendar")
    expect(hrefs).toContain("/admin/hardware")
  })

  it("접힌 기타에도 항목 수와 함께 토글이 렌더된다", () => {
    // 기타 자리 6개(마케팅·분석 3 + 시스템 3 — 콘텐츠는 2026-10-26, 마케팅 허브는 2026-11-04 상시로 올라감) 중
    // 운영 상태 1개는 기본 숨김이라(2026-09-25) 기타 토글에는 5개가 뜨고, 나머지 1개는 그 아래 "숨긴 탭 1"로 묶인다
    // (2026-10 마케팅 프로젝트는 캠페인 관리 탭이 됐다).
    const html = render("/admin/crm")
    expect(html).toContain("기타")
    expect(html).toContain(">5<")
    expect(hiddenCount(html)).toBe(1)
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

  it("전체 사이드바 계정에게는 역할과 무관하게 CRM 이 상시로 보인다", () => {
    // 평평해진 뒤 CRM 이 '기타' 안에만 있으면 영업 핵심 화면을 메뉴에서 못 찾는다.
    // (2026-11-20) 전체 계정 = SUPER_ADMIN 또는 nav_preset "super" 지정 계정. 그 밖은 간소다.
    expect(navHrefs(render("/admin/calendar", { role: "SUPER_ADMIN" }))).toContain("/admin/crm")
    for (const role of ["ADMIN", "BRANCH", "EDITOR"]) {
      expect(navHrefs(render("/admin/calendar", { role, navPreset: "super" })), role).toContain("/admin/crm")
    }
  })

  it.each([
    ["/admin/events/new", "/admin/calendar", "캘린더"],
    ["/admin/traffic", "/admin/analytics", "Analytics"],
    ["/admin/docs", "/admin/chatbot", "CS 콘솔"],
    ["/admin/channel-talk", "/admin/chatbot", "CS 콘솔"],
    ["/admin/cs-chatbot", "/admin/chatbot", "CS 콘솔"],
  ])("흡수 경로 %s에서 부모 %s를 활성화한다", (pathname, parentHref, mobileLabel) => {
    const html = render(pathname)

    expect(activeNavHrefs(html)).toContain(parentHref)
    expect(mobileHeader(html)).toContain(mobileLabel)
  })

  it("사람별 오버라이드가 상시 목록에서 항목을 내린다", () => {
    // 전면 공개 이후 오버라이드는 차단이 아니라 자리 이동이다 — 상시에서 빠지고 기타로 간다.
    const html = render("/admin/calendar", {
      role: "ADMIN",
      navPreset: "super",
      navOverrides: { "/admin/quotes": "folded" },
    })

    // 모바일 하단 바로가기(MOBILE_PRIMARY_NAV)는 고정 목록이라 견적이 남는다 —
    // 여기서 확인하는 것은 사이드바 상시/기타 배치가 오버라이드를 반영하는지다.
    // 기본 기타 5(기본 숨김 1 제외) + 내려온 견적 1 = 6.
    expect(html).toContain(">6<")
  })

  describe("개인 숨김", () => {
    it("숨긴 항목은 목록에서 빠지고 '숨긴 탭' 개수가 뜬다", () => {
      const html = render("/admin/calendar", { navOverrides: { "/admin/hardware": "hidden" } })

      expect(navHrefs(html)).not.toContain("/admin/hardware")
      // 기본 숨김 1 + 하드웨어 1.
      expect(hiddenCount(html)).toBe(2)
      expect(html).toContain("보기")
    })

    it("아무것도 숨기지 않았으면 숨긴 탭 묶음이 없다", () => {
      const html = render("/admin/calendar", {
        navOverrides: { "/admin/ops": "folded" },
      })
      expect(hiddenCount(html)).toBeNull()
      expect(html).not.toContain("다시 표시")
    })

    it("숨긴 경로에 있으면 묶음이 펼쳐지고 active·모바일 헤더 라벨이 맞다", () => {
      // 주소·⌘K 로 들어온 숨긴 화면 — 도달성은 그대로이고 현재 위치도 보여야 한다.
      const html = render("/admin/ops")

      expect(activeNavHrefs(html)).toEqual(["/admin/ops"])
      expect(mobileHeader(html)).toContain("운영 상태")
      expect(html).toContain("다시 표시")
      expect(html).toContain("접기")
    })

    it("직접 숨긴 상시 항목의 하위 화면에서도 active·헤더가 맞다", () => {
      const html = render("/admin/hardware/items", { navOverrides: { "/admin/hardware": "hidden" } })

      expect(activeNavHrefs(html)).toContain("/admin/hardware")
      expect(mobileHeader(html)).toContain("하드웨어 재고")
    })

    it("모바일 하단 바는 숨긴 견적을 뺀다", () => {
      const html = render("/admin/calendar", { navOverrides: { "/admin/quotes": "hidden" } })
      const bottomBar = mobileBottomBar(html)

      expect(bottomBar).toContain('href="/admin/calendar"')
      expect(bottomBar).toContain('href="/admin/crm"')
      expect(bottomBar).not.toContain('href="/admin/quotes"')
    })

    it("사이드바 편집 버튼은 설정이 없어도 렌더된다", () => {
      expect(render("/admin/calendar")).toContain("사이드바 편집")
    })

    it("Overview 를 숨긴 값이 들어와도 목록에 남는다", () => {
      const html = render("/admin/calendar", { navOverrides: { "/admin/overview": "hidden" } })
      expect(navHrefs(html)).toContain("/admin/overview")
      expect(hiddenCount(html)).toBe(1)
    })
  })

  it.each([
    ["/admin/crm/customers/customer-1", "고객 360"],
    ["/admin/crm/deals/rev-sheet", "매출시트"],
    ["/admin/crm/deals/orders", "오더·설치"],
    ["/admin/crm/deals/kpi", "워크스페이스"],
    ["/admin/crm/matching", "데이터 매칭"],
    ["/admin/crm/insights", "인사이트"],
  ])("모바일 헤더가 CRM 세부 작업면 %s의 실제 이름을 표시한다", (pathname, label) => {
    expect(mobileHeader(render(pathname))).toContain(label)
  })
})

// ── 간소 사이드바(2026-11-20) ─────────────────────────────────────────────────
// docs/active/sales-workspace-simplification-plan-2026-11-20.md W1. SUPER_ADMIN 과 지정 계정
// (nav_preset "super")을 뺀 모든 계정은 매출 장부 · 견적·문서 · 하드웨어 재고 셋만 본다(2026-11-23 하드웨어 추가). 숨김은 목록에서만이다 —
// 주소로 들어간 화면은 그대로 열리고 헤더 라벨도 맞아야 한다.
describe("간소 사이드바", () => {
  const SIMPLE = { role: "ADMIN" } as const
  const LEDGER = "/admin/branch/ledger"
  const QUOTES = "/admin/quotes"
  const HARDWARE = "/admin/hardware"
  const SIMPLE_HREFS = [LEDGER, QUOTES, HARDWARE]

  function desktopAside(html: string) {
    return html.match(/<aside\b[\s\S]*<\/aside>/)?.[0] ?? ""
  }

  it.each(["ADMIN", "BRANCH", "EDITOR", "VIEWER", "PARTNER", "admin"])(
    "%s — 메뉴 링크는 매출 장부·견적·문서·하드웨어 재고 셋뿐이다(데스크톱·모바일 하단 모두)",
    (role) => {
      const html = render(LEDGER, { role })
      expect([...new Set(navHrefs(html))].sort()).toEqual([...SIMPLE_HREFS].sort())
      expect(navHrefs(desktopAside(html))).toEqual(SIMPLE_HREFS)
      expect(navHrefs(mobileBottomBar(html))).toEqual(SIMPLE_HREFS)
    }
  )

  it.each(["staff", "sales", "marketing", "cs", "lead", "branch", ""])(
    'nav_preset "%s" 는 전체 사이드바를 주지 않는다',
    (navPreset) => {
      const html = render(LEDGER, { role: "ADMIN", navPreset })
      expect([...new Set(navHrefs(html))].sort()).toEqual([...SIMPLE_HREFS].sort())
    }
  )

  it('지정 계정(nav_preset "super")은 SUPER_ADMIN 과 같은 링크·묶음을 본다', () => {
    const designated = render("/admin/overview", { role: "ADMIN", navPreset: "super" })
    const superAdmin = render("/admin/overview", { role: "SUPER_ADMIN" })
    expect(navHrefs(designated)).toEqual(navHrefs(superAdmin))
    expect(hiddenCount(designated)).toBe(1)
    expect(designated).toContain("사이드바 편집")
    // 역할 표시는 그대로 "관리자"다 — 지정은 메뉴 표시일 뿐 역할을 올리지 않는다.
    expect(designated).toContain("관리자")
    expect(designated).not.toContain("최고 관리자")
  })

  it("범주 소제목·기타·숨긴 탭 묶음·사이드바 편집 진입점이 없다", () => {
    const html = render(LEDGER, SIMPLE)
    for (const label of ["고객·매출", "마케팅·분석", "시스템", "기타", "숨긴 탭", "다시 표시", "사이드바 편집"]) {
      expect(html, label).not.toContain(label)
    }
    expect(hiddenCount(html)).toBeNull()
    // 빠른 이동(⌘K)·로그아웃은 남는다 — 팔레트 목록은 따로 걸러진다(command-palette.test.ts).
    expect(html).toContain("빠른 이동·검색")
    expect(html).toContain("로그아웃")
  })

  it("착지 화면(매출 장부)이 active 이고 모바일 헤더가 그 이름을 낸다", () => {
    const html = render(LEDGER, SIMPLE)
    expect(activeNavHrefs(html)).toEqual([LEDGER])
    expect(mobileHeader(html)).toContain("매출 장부")
  })

  it("모바일 하단 바는 착지 화면을 포함한다 — 고정 바로가기(캘린더·CRM)가 아니라 그 계정의 상시 목록이다", () => {
    const bar = mobileBottomBar(render(QUOTES, SIMPLE))
    expect(bar).toContain(">장부<")
    expect(bar).toContain(">견적<")
    expect(bar).toContain(">재고<")
    expect(bar).toContain("More")
    expect(bar).not.toContain('href="/admin/calendar"')
    expect(bar).not.toContain('href="/admin/crm"')
    // 장부 · 견적 · 재고 · More = 4칸.
    expect(bar).toContain("repeat(4, minmax(0, 1fr))")
  })

  // 숨김은 메뉴에서만이다(D2) — 주소로 들어가면 열리고, 그 화면의 이름도 맞아야 한다.
  it.each([
    ["/admin/overview", "Overview"],
    ["/admin/crm", "CRM"],
    ["/admin/crm/deals/rev-sheet", "매출시트"],
    ["/admin/settings", "설정"],
    ["/admin/calendar", "캘린더"],
    ["/admin/docs", "CS 콘솔"],
  ])("주소로 들어간 숨긴 화면 %s — 헤더는 %s, 메뉴는 여전히 셋, 숨긴 탭 묶음은 펼쳐지지 않는다", (pathname, label) => {
    const html = render(pathname, SIMPLE)
    expect(mobileHeader(html)).toContain(label)
    expect([...new Set(navHrefs(html))].sort()).toEqual([...SIMPLE_HREFS].sort())
    expect(activeNavHrefs(html)).toEqual([])
    expect(html).not.toContain("숨긴 탭")
    expect(html).not.toContain("접근 권한이 없습니다")
  })

  // 2026-11-23 — 하드웨어 재고는 이제 숨긴 화면이 아니다(위 표에서 여기로 옮겼다). 하위 화면에서도
  // 그 탭이 active 다.
  it("하드웨어 재고 하위 화면 — 헤더는 하드웨어 재고, 메뉴의 그 탭이 active 다", () => {
    const html = render("/admin/hardware/items", SIMPLE)
    expect(mobileHeader(html)).toContain("하드웨어 재고")
    expect([...new Set(navHrefs(html))].sort()).toEqual([...SIMPLE_HREFS].sort())
    expect([...new Set(activeNavHrefs(html))]).toEqual([HARDWARE])
    expect(html).not.toContain("숨긴 탭")
  })

  it("최고 관리자가 되살려 준 탭은 보인다 — 자리는 전체 계정과 같고 소제목은 여전히 없다", () => {
    const html = render(LEDGER, {
      role: "ADMIN",
      navOverrides: { "/admin/crm": "primary", "/admin/analytics": "folded" },
    })
    expect(navHrefs(desktopAside(html))).toEqual([LEDGER, "/admin/crm", QUOTES, HARDWARE])
    // 기타로 되살린 Analytics 는 접힌 "기타 1" 뒤에 있다(빈 묶음이 아니라서 그린다).
    expect(html).toContain("기타")
    expect(html).toContain(">1<")
    expect(html).not.toContain("숨긴 탭")
    expect(html).not.toContain("사이드바 편집")
    // 장부 · CRM · 견적 · 재고 = 4칸(MOBILE_SIMPLE_NAV_MAX) + More.
    expect(navHrefs(mobileBottomBar(html))).toEqual([LEDGER, "/admin/crm", QUOTES, HARDWARE])
  })

  it("착지(매출 장부)를 숨긴 값이 들어와도 목록에 남는다", () => {
    const html = render(QUOTES, {
      role: "ADMIN",
      navOverrides: { [LEDGER]: "hidden", [QUOTES]: "hidden", [HARDWARE]: "hidden" },
    })
    expect([...new Set(navHrefs(html))]).toEqual([LEDGER])
  })
})
