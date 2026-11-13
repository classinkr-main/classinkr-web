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

function render(
  pathname: string,
  options: { role?: string; navOverrides?: Record<string, string> } = {}
) {
  routerState.pathname = pathname
  return renderToStaticMarkup(
    <AdminSidebar
      role={options.role ?? "SUPER_ADMIN"}
      name="테스터"
      email="t@classin.com"
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

/** 접힘 묶음 토글(범주 이름 + 항목 수)의 수. 그 묶음이 없으면 null. */
function foldCount(html: string, label: string) {
  const match = html.match(new RegExp(`>${label}</span><span class="tabular-nums[^"]*">(\\d+)</span>`))
  return match ? Number(match[1]) : null
}

/** 접힘 묶음 토글의 펼침 상태. */
function foldExpanded(html: string, label: string) {
  const button = [...html.matchAll(/<button\b[^>]*aria-expanded="(true|false)"[^>]*>([\s\S]*?)<\/button>/g)].find(
    (match) => match[2].includes(`>${label}</span>`)
  )
  return button ? button[1] === "true" : null
}

/** "숨긴 탭 N · 보기" 토글의 N. 묶음이 없으면 null. */
function hiddenCount(html: string) {
  const match = html.match(/숨긴 탭 <span class="tabular-nums">(\d+)<\/span>/)
  return match ? Number(match[1]) : null
}

describe("사이드바 CRM 평탄화", () => {
  it("CRM 안에서도 다른 상시 링크가 그대로 보인다", () => {
    // 드릴인은 CRM 진입 시 전체 메뉴를 CRM 패널로 교체해, 마케팅·CS 로 바로 갈 수 없었다.
    // 2026-09-10 전면 공개 이후 일부 탭은 접힘 묶음으로 내려갔으므로, 여기서는
    // 상시 목록이 CRM 안에서도 그대로인지만 본다(접힘 접근성은 아래 토글 테스트가 맡는다).
    const html = render("/admin/crm")
    const hrefs = navHrefs(html)
    expect(hrefs).toContain("/admin/chatbot")
    expect(hrefs).toContain("/admin/calendar")
    expect(hrefs).toContain("/admin/hardware")
  })

  it("접힘 묶음이 범주마다 항목 수와 함께 토글로 렌더된다(2026-11-09 D안)", () => {
    // 접힘 자리 8개 = 주문·매출 2 + 마케팅·분석 3 + 시스템 3. 시스템의 운영 상태는 기본 숨김이라(2026-09-25)
    // 시스템 묶음에는 2개가 뜨고, 나머지 1개는 그 아래 "숨긴 탭 1"로 묶인다. "기타" 묶음은 더는 없다.
    const html = render("/admin/crm")
    expect(foldCount(html, "주문·매출")).toBe(2)
    expect(foldCount(html, "마케팅·분석")).toBe(3)
    expect(foldCount(html, "시스템")).toBe(2)
    expect(html).not.toContain(">기타<")
    expect(hiddenCount(html)).toBe(1)
    // 처음에는 전부 접혀 있다 — 접힌 탭 링크는 그리지 않는다.
    expect(foldExpanded(html, "주문·매출")).toBe(false)
    expect(navHrefs(html)).not.toContain("/admin/branch/ledger")
  })

  it("지금 화면이 든 접힘 묶음만 열린다", () => {
    const html = render("/admin/branch/ledger")
    expect(foldExpanded(html, "주문·매출")).toBe(true)
    expect(foldExpanded(html, "마케팅·분석")).toBe(false)
    expect(activeNavHrefs(html)).toEqual(["/admin/branch/ledger"])
    expect(mobileHeader(html)).toContain("매출 장부")
  })

  it("상시 목록은 소제목 없이 하루 동선 순서이고, CS 콘솔은 콘텐츠 바로 밑이다", () => {
    const html = render("/admin/overview")
    const sidebarHrefs = navHrefs(html.slice(html.indexOf("<aside")))
    const primaryOrder = sidebarHrefs.filter((href) =>
      [
        "/admin/overview",
        "/admin/calendar",
        "/admin/crm",
        "/admin/quotes",
        "/admin/hardware",
        "/admin/campaigns",
        "/admin/blog",
        "/admin/chatbot",
      ].includes(href)
    )
    expect(primaryOrder).toEqual([
      "/admin/overview",
      "/admin/calendar",
      "/admin/crm",
      "/admin/quotes",
      "/admin/hardware",
      "/admin/campaigns",
      "/admin/blog",
      "/admin/chatbot",
    ])
    expect(html).not.toContain(">영업·고객<")
    expect(html).not.toContain(">고객 지원<")
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

  it("어떤 역할에게도 CRM 이 상시로 보인다", () => {
    // 평평해진 뒤 CRM 이 '기타' 안에만 있으면 영업 핵심 화면을 메뉴에서 못 찾는다.
    for (const role of ["ADMIN", "BRANCH", "EDITOR", "SUPER_ADMIN"]) {
      expect(navHrefs(render("/admin/calendar", { role })), role).toContain("/admin/crm")
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
    // 전면 공개 이후 오버라이드는 차단이 아니라 자리 이동이다 — 상시에서 빠지고 제 범주 접힘 묶음으로 간다.
    const html = render("/admin/calendar", {
      role: "ADMIN",
      navOverrides: { "/admin/quotes": "folded" },
    })

    // 모바일 하단 바로가기(MOBILE_PRIMARY_NAV)는 고정 목록이라 견적이 남는다 —
    // 여기서 확인하는 것은 사이드바 상시/접힘 배치가 오버라이드를 반영하는지다.
    // 주문·매출 묶음: 기본 2(KR Team·매출 장부) + 내려온 견적 1 = 3.
    expect(foldCount(html, "주문·매출")).toBe(3)
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
