import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import {
  ADMIN_COMMANDS,
  ADMIN_OPEN_NAV_EDITOR_EVENT,
  resolveAdminCommands,
} from "@/components/admin/AdminCommandPalette"
import { ADMIN_NAV } from "@/components/admin/admin-nav"
import {
  getAccessibleAdminNavItems,
  normalizeNavOverrides,
  resolveAdminNavAccess,
  type NavAccessContext,
} from "@/components/admin/admin-nav-access"
import { CAMPAIGN_TABS } from "@/lib/marketing/hub-tabs"

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

// 팔레트 필터와 같은 규칙(라벨 + 검색어, 소문자 포함 검사)으로 찾는다.
function search(query: string) {
  const q = query.trim().toLowerCase()
  return ADMIN_COMMANDS.filter(
    (cmd) => cmd.label.toLowerCase().includes(q) || (cmd.keywords ?? "").toLowerCase().includes(q)
  )
}

describe("admin command palette — 2026-09-25 탭 정리", () => {
  const byHref = (href: string) => ADMIN_COMMANDS.filter((cmd) => cmd.href === href)

  it.each([
    ["빠른 견적 작성", "app/admin/quotes/new/page.tsx"],
    ["녹화 세트 견적", "app/admin/quotes/recording-studio/page.tsx"],
    ["AI Suite 견적", "app/admin/quotes/ai-suite/page.tsx"],
  ])("%s 는 스텁을 거치지 않고 스텁이 보내는 최종 URL로 간다", (label, stubPath) => {
    // 스텁(북마크 보호용으로 유지)의 redirect 목적지를 읽어 그대로 비교한다 — 스텁 목적지가
    // 바뀌면 이 테스트가 팔레트도 함께 바꾸라고 알려 준다.
    const stub = readFileSync(join(process.cwd(), stubPath), "utf8")
    const target = stub.match(/redirect\("([^"]+)"\)/)?.[1]
    const command = ADMIN_COMMANDS.find((cmd) => cmd.label === label)

    expect(target).toMatch(/^\/admin\/quotes\?tab=hardware&action=/)
    expect(command?.href).toBe(target)
    expect(command?.group).toBe("영업·매출")
  })

  it("no command routes through a /admin/quotes/* redirect stub", () => {
    const stubbed = ADMIN_COMMANDS.filter((cmd) =>
      ["/admin/quotes/new", "/admin/quotes/recording-studio", "/admin/quotes/ai-suite"].includes(cmd.href)
    )
    expect(stubbed).toEqual([])
  })

  it.each([
    ["/admin/crm/customers/tags", "태그", ["태그", "tag"]],
    ["/admin/crm/customers/intake", "접수", ["접수", "intake", "쇼룸"]],
  ])("CRM 고객 보조 탭 %s 가 ⌘K 에서 한/영으로 찾아진다", (href, label, queries) => {
    const [command] = byHref(href)
    expect(command?.label).toBe(label)
    expect(command?.group).toBe("영업·매출")
    for (const query of queries) {
      expect(search(query).map((cmd) => cmd.href), query).toContain(href)
    }
  })

  it("labels rev-sheet 매출시트 (screen title) and keeps the old REV 스냅샷 wording searchable", () => {
    const [command] = byHref("/admin/crm/deals/rev-sheet")
    expect(command?.label).toBe("매출시트")
    expect(search("REV 스냅샷").map((cmd) => cmd.href)).toContain("/admin/crm/deals/rev-sheet")
  })

  it("names the campaigns email tab command after the hub tab (메시지)", () => {
    const hubTabLabel = CAMPAIGN_TABS.find((tab) => tab.id === "email")?.label
    const [command] = byHref("/admin/campaigns?tab=email")

    expect(hubTabLabel).toBe("메시지")
    expect(command?.label).toBe(hubTabLabel)
    // 옛 라벨로 찾던 손버릇은 검색어로 계속 걸린다.
    expect(search("이메일 자동화").map((cmd) => cmd.href)).toContain("/admin/campaigns?tab=email")
  })

  it("reaches 캠페인 관리 and 마케팅 프로젝트 exactly once (child fallback never duplicates a nav item)", () => {
    for (const href of ["/admin/campaigns/manage", "/admin/campaigns/projects"]) {
      expect(byHref(href), href).toHaveLength(1)
      expect(byHref(href)[0]?.group).toBe("마케팅·분석")
    }
    expect(search("프로젝트").map((cmd) => cmd.href)).toContain("/admin/campaigns/projects")
  })

  it("offers '내 사이드바 편집' as an event command, not a navigation", () => {
    const edit = ADMIN_COMMANDS.find((cmd) => cmd.label === "내 사이드바 편집")

    expect(ADMIN_OPEN_NAV_EDITOR_EVENT).toBe("admin:open-nav-editor")
    expect(edit?.event).toBe(ADMIN_OPEN_NAV_EDITOR_EVENT)
    expect(edit?.href).toBe("")
    expect(edit?.group).toBe("운영·시스템")
    for (const query of ["사이드바", "숨기기", "sidebar"]) {
      expect(search(query).map((cmd) => cmd.label), query).toContain("내 사이드바 편집")
    }
  })

  it("only event commands have an empty href (everything else navigates)", () => {
    for (const cmd of ADMIN_COMMANDS) {
      if (cmd.event) expect(cmd.href, cmd.label).toBe("")
      else expect(cmd.href, cmd.label).toMatch(/^\/admin\//)
    }
  })

  it("dispatches the event instead of pushing a route when an event command runs", () => {
    // DOM 환경이 없어 실행부는 소스 계약으로 고정한다 — 이벤트면 dispatch 후 return, 아니면 push.
    const source = readFileSync(join(process.cwd(), "components/admin/AdminCommandPalette.tsx"), "utf8")
    const run = source.slice(source.indexOf("const run = useCallback"), source.indexOf("const onListKeyDown"))

    expect(run).toContain("window.dispatchEvent(new CustomEvent(command.event))")
    expect(run.indexOf("window.dispatchEvent")).toBeLessThan(run.indexOf("router.push(command.href)"))
    expect(run).toMatch(/if \(command\.event\) \{[\s\S]*?return\s*\}/)
    expect(source).toContain("onClick={() => run(cmd)}")
    expect(source).toContain("if (target) run(target)")
  })
})

// 불변식 — 사이드바 배치·숨김(기본 숨김 포함)은 ⌘K 도달성을 절대 줄이지 않는다.
// 팔레트는 getAccessibleAdminNavItems 를 거치고, 그 함수는 항상 ADMIN_NAV 전체를 돌려줘야 한다.
describe("admin command palette — 숨긴 탭도 ⌘K 에서 검색된다", () => {
  const allNavHrefs = ADMIN_NAV.map((item) => item.href)
  const everyItem = (value: string) =>
    normalizeNavOverrides(Object.fromEntries(allNavHrefs.map((href) => [href, value])))

  const cases: Array<[string, NavAccessContext["overrides"]]> = [
    ["설정 없음(전원 공통 기본 — 기본 숨김 포함)", {}],
    ["전부 숨김", everyItem("hidden")],
    ["전부 기타", everyItem("folded")],
    ["전부 상시", everyItem("primary")],
    ["레거시 deny", everyItem("deny")],
  ]

  it.each(cases)("getAccessibleAdminNavItems 는 %s 에서도 ADMIN_NAV 전체다", (_name, overrides) => {
    for (const role of ["SUPER_ADMIN", "ADMIN", "BRANCH", "EDITOR"]) {
      const accessible = getAccessibleAdminNavItems(resolveAdminNavAccess({ role, overrides }))
      expect(accessible.map((item) => item.href), role).toEqual(allNavHrefs)
    }
  })

  it.each(cases)("⌘K 명령 목록은 %s 에서도 설정 없는 목록과 같다", (_name, overrides) => {
    const baseline = resolveAdminCommands({ role: "ADMIN", overrides: {} })
    const commands = resolveAdminCommands({ role: "ADMIN", overrides })

    expect(commands).toEqual(baseline)
    expect(commands.map((cmd) => cmd.href)).toEqual(expect.arrayContaining(allNavHrefs))
    // 숨길 수 있는 부모의 자식 명령(CS 콘솔 → 가이드 문서 등)도 함께 남는다.
    expect(commands.map((cmd) => cmd.href)).toEqual(
      expect.arrayContaining(["/admin/docs", "/admin/channel-talk", "/admin/events", "/admin/traffic"])
    )
    expect(commands.map((cmd) => cmd.label)).toContain("내 사이드바 편집")
  })
})

describe("admin command palette access parity", () => {
  const commandsFor = (overrides: Partial<NavAccessContext> = {}) =>
    resolveAdminCommands({
      role: "ADMIN",
      overrides: {},
      ...overrides,
    })

  const hrefsFor = (overrides: Partial<NavAccessContext> = {}) =>
    commandsFor(overrides).map((command) => command.href)

  it("inherits calendar access for the absorbed event commands", () => {
    expect(hrefsFor()).toEqual(expect.arrayContaining(["/admin/events", "/admin/events/new"]))
  })

  it("inherits Analytics access for traffic", () => {
    // 전면 공개(2026-09-10) 이후 Analytics 는 전원에게 열려 있으므로 흡수된 트래픽 명령도 항상 뜬다.
    expect(hrefsFor()).toContain("/admin/traffic")
  })

  it("기타로 접힌 항목도 ⌘K 에서는 그대로 찾을 수 있다", () => {
    // 접힘은 사이드바 배치일 뿐 접근 제한이 아니다 — 팔레트는 배치와 무관하게 전부 노출한다.
    const hrefs = hrefsFor({ overrides: { "/admin/chatbot": "folded" } })

    expect(hrefs).toContain("/admin/chatbot")
    expect(hrefs).toContain("/admin/docs")
    expect(hrefs).toContain("/admin/channel-talk")
    expect(hrefs).toContain("/admin/cs-chatbot")
  })

  it("모든 역할이 같은 명령 목록을 받는다", () => {
    for (const role of ["EDITOR", "VIEWER", "BRANCH", "ADMIN", "SUPER_ADMIN"]) {
      expect(hrefsFor({ role }), role).toContain("/admin/settings")
      expect(hrefsFor({ role }), role).toContain("/admin/overview")
    }
    expect(hrefsFor({ role: "EDITOR" })).toEqual(hrefsFor({ role: "SUPER_ADMIN" }))
  })
})
