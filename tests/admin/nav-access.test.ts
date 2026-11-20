import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { ADMIN_NAV } from "@/components/admin/admin-nav"
import {
  buildNavPreferenceRows,
  DEFAULT_HIDDEN_HREFS,
  DEFAULT_PRIMARY_HREFS,
  FULL_NAV_LANDING_HREF,
  FULL_NAV_PRESET,
  getAccessibleAdminNavItems,
  getPaletteAdminNavItems,
  getVisibleAdminNavItems,
  hasFullAdminNav,
  isNavHidden,
  isNavHideable,
  resolveAdminLandingHref,
  resolveAdminNavAccess,
  normalizeNavOverrides,
  resolveDefaultNavPreference,
  resolveNavAccess,
  resolveNavPlacement,
  resolveNavPreference,
  setNavOverride,
  SIMPLE_NAV_LANDING_HREF,
  SIMPLE_NAV_PRIMARY_HREFS,
  type NavAccessContext,
  type NavAudienceContext,
  type NavOverrideValue,
} from "@/components/admin/admin-nav-access"

// 기타 그룹은 범주(홈 / 고객·매출 / 마케팅·분석 / 시스템)로 묶인다.
// 범주는 전 항목에 붙는다 — 프리셋에 따라 상시 후보도 기타로 내려가기 때문(Task 2 Step 0).
describe("admin nav — 기타 범주 메타", () => {
  it("assigns a category to every tab that can be folded", () => {
    const expected: Record<string, string> = {
      "/admin/crm": "customer",
      "/admin/branch": "customer",
      "/admin/branch/ledger": "customer",
      "/admin/lead-magnets": "growth",
      "/admin/analytics": "growth",
      "/admin/campaigns/manage": "growth",
      "/admin/overview": "home",
      // AI 올인원(2026-09-29, home 범주)은 시안 스위치가 켜졌을 때만 ADMIN_NAV 에 있다 — 기본(꺼짐) 기준인
      // 이 표에서는 빼고, 켜짐 쪽 범주·자리는 tests/admin/nav-ai-preview.test.tsx 가 본다(기획 D13).
      // CS 콘솔은 일상 고객 지원 업무면이라 customer(2026-08-18, 진입점 단일화와 함께 재범주화).
      "/admin/chatbot": "customer",
      "/admin/ops": "system",
      "/admin/settings": "system",
      "/admin/dev": "system",
    }

    for (const [href, category] of Object.entries(expected)) {
      const item = ADMIN_NAV.find((entry) => entry.href === href)
      expect(item, href).toBeDefined()
      expect(item?.category, href).toBe(category)
    }
  })

  it("marks 매출 장부 as work-in-progress so the sidebar can grey it out", () => {
    const ledger = ADMIN_NAV.find((item) => item.href === "/admin/branch/ledger")
    expect(ledger?.maturity).toBe("wip")
  })

  it("drops 공개 행사 and 방문자/트래픽 — absorbed into 캘린더 and Analytics", () => {
    expect(ADMIN_NAV.some((item) => item.href === "/admin/events")).toBe(false)
    expect(ADMIN_NAV.some((item) => item.href === "/admin/traffic")).toBe(false)
  })

  it("keeps the absorbed surfaces reachable from ⌘K via the host tab keywords", () => {
    const calendar = ADMIN_NAV.find((item) => item.href === "/admin/calendar")
    expect(calendar?.keywords).toContain("행사")
    const analytics = ADMIN_NAV.find((item) => item.href === "/admin/analytics")
    expect(analytics?.keywords).toContain("방문자")
    expect(analytics?.keywords).toContain("트래픽")
  })

  // resolveNavAccess(Task 2)는 ADMIN_NAV 선언 순서를 그대로 상시 목록 순서로 쓴다.
  // 따라서 사이드바 순서는 이 배열 순서로만 표현된다 — 렌더에서 다시 정렬하지 않는다.
  it("declares the sidebar order used by DEFAULT_PRIMARY_HREFS", () => {
    // CS 진입점 단일화(2026-08-18): 가이드 문서·내부 CS 상시 후보가 CS 콘솔 하나로 흡수됐다.
    // CS 콘솔은 고객·매출 범주라 그 블록 끝(하드웨어 재고 뒤)에 선언된다 — 선언이 범주 연속
    // 블록이어야 상시 범주 묶음(primaryGroups)이 재정렬 없는 분할로 남는다.
    const primaryCandidates = [
      "/admin/calendar",
      "/admin/quotes",
      "/admin/hardware",
      "/admin/chatbot",
      "/admin/campaigns",
      "/admin/blog",
    ]
    const declared = ADMIN_NAV.map((item) => item.href).filter((href) =>
      primaryCandidates.includes(href)
    )
    expect(declared).toEqual(primaryCandidates)
  })

  // 상시 범주 소제목(2026-08-18)이 "묶기 = 재정렬"이 되지 않기 위한 전제 —
  // 선언 순서가 범주(고객·매출 → 마케팅·분석 → 시스템) 연속 블록이어야 한다.
  it("declares ADMIN_NAV in contiguous category blocks", () => {
    const categories = ADMIN_NAV.map((item) => item.category ?? "system")
    const firstIndex = new Map<string, number>()
    categories.forEach((category, index) => {
      if (!firstIndex.has(category)) firstIndex.set(category, index)
    })
    // 같은 범주는 반드시 연속 구간이다 — 범주가 한 번 바뀌면 이전 범주로 돌아오지 않는다.
    let previous = ""
    for (const category of categories) {
      if (category !== previous) {
        expect(firstIndex.get(category), category).toBeDefined()
        previous = category
      }
    }
    const seen: string[] = []
    for (const category of categories) {
      if (seen[seen.length - 1] !== category) seen.push(category)
    }
    expect(seen).toEqual(["home", "customer", "growth", "system"])
  })
})

// 2026-11-20 부터 기본값이 계정에 따라 둘이다(admin-nav-access.ts 머리 주석).
//  - ctx()    : 전체 사이드바 계정(SUPER_ADMIN). 이 파일의 2026-09-10 ~ 11-19 기대값은 전부 이 계정의
//               것이다 — "전체 계정의 결과는 변경 전과 같다"를 기존 테스트가 그대로 고정한다.
//  - simple() : 간소 사이드바 계정(ADMIN, 지정 없음). 아래 "전체 / 간소 사이드바" describe 가 본다.
const FULL: NavAudienceContext = { role: "SUPER_ADMIN" }
const SIMPLE: NavAudienceContext = { role: "ADMIN" }

const ctx = (over: Partial<NavAccessContext> = {}): NavAccessContext => ({
  ...FULL,
  overrides: {},
  ...over,
})

const simple = (over: Partial<NavAccessContext> = {}): NavAccessContext => ({
  ...SIMPLE,
  overrides: {},
  ...over,
})

const EVERY_ROLE = ["SUPER_ADMIN", "ADMIN", "BRANCH", "EDITOR", "VIEWER", "PARTNER"] as const
const EVERY_LEGACY_PRESET = ["staff", "sales", "marketing", "cs", "lead", "branch", "super"] as const
/** "super" 를 뺀 레거시 프리셋 — 전체 사이드바를 주지 않는 값들. */
const NON_FULL_PRESETS = EVERY_LEGACY_PRESET.filter((preset) => preset !== FULL_NAV_PRESET)
const NON_SUPER_ROLES = EVERY_ROLE.filter((role) => role !== "SUPER_ADMIN")

/** 전체 사이드바를 보는 모든 조합 — SUPER_ADMIN × (프리셋 없음 + 7종), 그 밖의 역할 × "super". */
const FULL_AUDIENCES: NavAudienceContext[] = [
  { role: "SUPER_ADMIN" },
  { role: "SUPER_ADMIN", preset: null },
  ...EVERY_LEGACY_PRESET.map((preset) => ({ role: "SUPER_ADMIN", preset })),
  ...NON_SUPER_ROLES.map((role) => ({ role, preset: FULL_NAV_PRESET })),
]
/** 간소 사이드바를 보는 모든 조합 — 그 밖의 역할 × (프리셋 없음 · 빈 문자열 · "super" 아닌 레거시 값). */
const SIMPLE_AUDIENCES: NavAudienceContext[] = NON_SUPER_ROLES.flatMap((role) => [
  { role },
  { role, preset: null },
  { role, preset: "" },
  { role, preset: "SUPER" },
  { role, preset: "모르는값" },
  ...NON_FULL_PRESETS.map((preset) => ({ role, preset })),
])
const audienceLabel = (audience: NavAudienceContext) => `${audience.role} / ${String(audience.preset)}`

const hrefsOf = (items: ReadonlyArray<{ href: string }>) => items.map((item) => item.href)
const foldedHrefsOf = (access: { folded: ReadonlyArray<{ items: ReadonlyArray<{ href: string }> }> }) =>
  access.folded.flatMap((group) => hrefsOf(group.items))

describe("resolveNavPlacement — 보일 때 앉는 자리(전체 계정의 배치)", () => {
  // 시안 스위치 꺼짐(기본, 기획 D13) 기준 — 켜면 AI 올인원이 더해져 10(tests/admin/nav-ai-preview.test.tsx).
  it("상시 10개는 DEFAULT_PRIMARY_HREFS 그대로다", () => {
    // 2026-11-04 마케팅 허브가 기타에서 상시로 올라왔다(방문·문의 바로 보기 기획 D6) — 9 → 10.
    for (const href of DEFAULT_PRIMARY_HREFS) {
      expect(resolveNavPlacement(href, ctx()), href).toBe("primary")
    }
    expect(DEFAULT_PRIMARY_HREFS).toHaveLength(10)
    expect(DEFAULT_PRIMARY_HREFS).toContain("/admin/campaigns")
  })

  it("나머지 6개의 자리는 전부 기타다 — 그중 1개는 기본 숨김이라 처음엔 목록에 없다", () => {
    // 2026-10 마케팅 프로젝트가 캠페인 관리의 탭이 되며 기본 숨김 2 → 1, 기타 자리 8 → 7.
    // 2026-11-04 마케팅 허브가 상시로 올라가며 기타 자리 7 → 6.
    const rest = ADMIN_NAV.map((item) => item.href).filter(
      (href) => !DEFAULT_PRIMARY_HREFS.includes(href)
    )
    expect(rest).toHaveLength(6)
    // resolveNavPlacement 는 "보일 때 앉는 자리"다 — 기본 숨김 항목도 다시 표시하면 기타로 간다.
    for (const href of rest) {
      expect(resolveNavPlacement(href, ctx()), href).toBe("folded")
    }
    const hiddenByDefault = rest.filter((href) => isNavHidden(href, ctx()))
    expect(hiddenByDefault.sort()).toEqual([...DEFAULT_HIDDEN_HREFS].sort())
    expect(rest.length - hiddenByDefault.length).toBe(5)
  })

  // 2026-11-19 까지 이 테스트는 "모든 매니저가 같은 사이드바를 본다"를 고정했다. 지금은 기본
  // **숨김**이 계정(전체/간소)에 따라 갈리지만, "보일 때 앉는 자리"는 여전히 한 표다 — 간소 계정이
  // 되살린 탭은 전체 계정에서 그 탭이 앉는 자리로 간다. 그래서 저장된 자리의 뜻이 계정이 바뀌어도 같다.
  it("자리(상시/기타)는 역할·프리셋과 무관하다 — 전체/간소가 같은 표를 읽는다", () => {
    for (const item of ADMIN_NAV) {
      const expected = resolveNavPlacement(item.href, ctx())
      for (const role of EVERY_ROLE) {
        for (const preset of EVERY_LEGACY_PRESET) {
          expect(
            resolveNavPlacement(item.href, ctx({ role, preset })),
            `${item.href} / ${role} / ${preset}`
          ).toBe(expected)
        }
      }
    }
  })

  it("사람별 오버라이드는 상시↔기타 두 자리만 옮긴다", () => {
    expect(resolveNavPlacement("/admin/analytics", ctx({ overrides: { "/admin/analytics": "primary" } }))).toBe("primary")
    expect(resolveNavPlacement("/admin/crm", ctx({ overrides: { "/admin/crm": "folded" } }))).toBe("folded")
  })
})

describe("normalizeNavOverrides — 레거시 deny 처리", () => {
  // 전면 공개 전에 저장된 {"/admin/settings":"deny"} 같은 값이 DB에 남아 있다.
  // 그냥 버리면 숨겨 뒀던 항목이 상시로 튀어오르고, 남겨두면 전환이 무의미해진다.
  it("deny 를 folded 로 강등한다 — 버리지도, 차단하지도 않는다", () => {
    const normalized = normalizeNavOverrides({
      "/admin/settings": "deny",
      "/admin/analytics": "primary",
      "/admin/없는탭": "deny",
      "/admin/crm": "이상한값",
    })
    expect(normalized).toEqual({
      "/admin/settings": "folded",
      "/admin/analytics": "primary",
    })
  })

  it("deny 오버라이드가 있어도 항목이 사라지지 않는다", () => {
    // 레거시 DB 값을 그대로 흉내 낸다 — 타입에서는 "deny" 가 사라졌으므로 정규화 입구로 넣는다.
    const legacyOverrides = normalizeNavOverrides({ "/admin/settings": "deny" })
    const access = resolveAdminNavAccess(ctx({ overrides: legacyOverrides }))
    const hrefs = getAccessibleAdminNavItems(access).map((item) => item.href)
    expect(hrefs).toContain("/admin/settings")
    expect(access.folded.flatMap((group) => group.items).map((item) => item.href)).toContain(
      "/admin/settings"
    )
  })
})

describe("resolveNavAccess", () => {
  it("상시 10 / 기타 5 / 숨김 1(기본 숨김) 로 나눈다", () => {
    // 2026-09-25 전까지는 "기타 9"였다 — 마케팅 프로젝트·운영 상태가 기본 숨김으로 빠졌다.
    // 2026-10 마케팅 프로젝트는 캠페인 관리의 "프로젝트" 탭이 되며 항목 자체가 빠졌다(숨김 2 → 1).
    // 2026-09-29 AI 올인원이 상시에 더해졌지만 시안 스위치가 꺼져 있으면(기본, 기획 D13) 빠진다 —
    // 2026-10-26 콘텐츠가 기타에서 상시로 올라왔다 — 상시 9, 세 칸을 합치면 16 전부다.
    // 2026-11-04 마케팅 허브가 기타에서 상시로 올라왔다 — 상시 10 · 기타 5.
    // 켜짐(상시 11·17)은 tests/admin/nav-ai-preview.test.tsx.
    const { primary, folded, hidden } = resolveNavAccess(ctx())
    expect(primary).toHaveLength(10)
    expect(folded.flatMap((group) => group.items)).toHaveLength(5)
    expect(hidden.map((item) => item.href)).toEqual(["/admin/ops"])
    expect(primary.length + 5 + hidden.length).toBe(ADMIN_NAV.length)
  })

  it("Overview 가 상시 첫 항목이고 home 이 첫 그룹이다", () => {
    const access = resolveNavAccess(ctx())
    expect(access.primary[0]?.href).toBe("/admin/overview")
    expect(access.primaryGroups[0]?.category).toBe("home")
  })

  it("상시를 재정렬 없이 범주로 분할한다 — 홈 + 고객·매출 + 마케팅·분석(콘텐츠)", () => {
    const access = resolveNavAccess(ctx())
    expect(access.primaryGroups.flatMap((group) => group.items)).toEqual(access.primary)
    expect(access.primaryGroups.map((group) => group.category)).toEqual(["home", "customer", "growth"])
    expect(access.primary.at(-1)?.href).toBe("/admin/blog")
  })

  it("기타를 마케팅·분석 → 시스템 순서로 묶는다", () => {
    const { folded } = resolveNavAccess(ctx())
    expect(folded.map((group) => group.category)).toEqual(["growth", "system"])
    expect(folded.every((group) => group.items.length > 0)).toBe(true)
  })

  it("상시 소제목을 켠다 — 10항목 3범주", () => {
    expect(resolveNavAccess(ctx()).showPrimaryHeaders).toBe(true)
  })
})

describe("resolveAdminNavAccess", () => {
  const hrefs = (over: Partial<NavAccessContext> = {}) =>
    getAccessibleAdminNavItems(resolveAdminNavAccess(ctx(over))).map((item) => item.href)

  // 전면 공개의 핵심 계약 — 어떤 역할도 항목을 잃지 않는다. 2026-11-20 간소 사이드바도 이 계약을
  // 깨지 않는다: 숨김은 목록 정리이고 accessible(주소 도달·헤더 라벨의 원천)은 항상 전체다.
  it("모든 역할이 16개 탭 전부에 도달한다", () => {
    for (const role of EVERY_ROLE) {
      expect(hrefs({ role }), role).toHaveLength(ADMIN_NAV.length)
      expect(hrefs({ role }), role).toContain("/admin/settings")
      expect(hrefs({ role }), role).toContain("/admin/overview")
      expect(hrefs({ role }), role).toContain("/admin/dev")
    }
  })

  it("레거시 소문자 role 도 같은 결과를 낸다", () => {
    expect(hrefs({ role: "admin" })).toEqual(hrefs({ role: "ADMIN" }))
    expect(hrefs({ role: "branch" })).toEqual(hrefs({ role: "BRANCH" }))
  })
})

// ── 개인 숨김(2026-09-25) ────────────────────────────────────────────────────
// hidden 은 "내 목록에서 치움"이지 접근 제한이 아니다. 아래 테스트가 그 경계를 고정한다.
/** 그 계정이 숨길 수 있는 항목 — 착지 화면 하나만 빠진다. */
const hideableHrefsFor = (audience: NavAudienceContext) =>
  ADMIN_NAV.map((item) => item.href).filter((href) => href !== resolveAdminLandingHref(audience))
const HIDE_EVERYTHING: Record<string, NavOverrideValue> = Object.fromEntries(
  ADMIN_NAV.map((item) => [item.href, "hidden" as const])
)

describe("normalizeNavOverrides — hidden", () => {
  it("hidden 을 보존한다(예전처럼 조용히 버리지 않는다)", () => {
    expect(normalizeNavOverrides({ "/admin/quotes": "hidden" })).toEqual({ "/admin/quotes": "hidden" })
  })

  it("Overview 의 hidden 은 키째 지운다 — 로그인 착지를 숨길 수 없다", () => {
    expect(normalizeNavOverrides({ "/admin/overview": "hidden", "/admin/dev": "hidden" })).toEqual({
      "/admin/dev": "hidden",
    })
  })

  it("레거시 deny 는 folded 로 강등할 뿐 hidden 으로 옮기지 않는다", () => {
    const normalized = normalizeNavOverrides({ "/admin/settings": "deny", "/admin/crm": "deny" })
    expect(normalized).toEqual({ "/admin/settings": "folded", "/admin/crm": "folded" })
    expect(Object.values(normalized)).not.toContain("hidden")
  })

  // 2026-09-25 리뷰 — deny→folded 를 기본 숨김 항목에도 적용하면, deny 가 남아 있던 사람만 그
  // 항목이 기타에 "보이게" 된다(숨기려던 제한이 노출로 뒤집힘). 키를 버려 기본값(숨김)을 따른다.
  it("기본 숨김 항목의 레거시 deny 는 키째 버려 기본값(숨김)을 따른다 — 기타로 올리지 않는다", () => {
    const legacy = Object.fromEntries(DEFAULT_HIDDEN_HREFS.map((href) => [href, "deny"]))
    const normalized = normalizeNavOverrides({ ...legacy, "/admin/settings": "deny" })
    // 다른 항목은 지금처럼 folded, 기본 숨김 항목은 키가 없다(hidden 을 저장하지도 않는다).
    expect(normalized).toEqual({ "/admin/settings": "folded" })

    const access = resolveAdminNavAccess(ctx({ overrides: normalized }))
    const foldedHrefs = access.folded.flatMap((group) => group.items.map((item) => item.href))
    for (const href of DEFAULT_HIDDEN_HREFS) {
      expect(access.hidden.map((item) => item.href), href).toContain(href)
      expect(foldedHrefs, href).not.toContain(href)
    }
    // deny 가 없는 사람과 같은 결과다 — 기본 숨김 항목에 대해서는 deny 가 아무 차이를 만들지 않는다.
    const baseline = resolveAdminNavAccess(ctx({ overrides: { "/admin/settings": "folded" } }))
    expect(access).toEqual(baseline)
    // 도달성은 그대로(⌘K·주소).
    expect(getAccessibleAdminNavItems(access)).toHaveLength(ADMIN_NAV.length)
  })

  it("기본 숨김 항목이라도 사람이 고른 folded/primary 는 그대로 이긴다(deny 만 버린다)", () => {
    expect(normalizeNavOverrides({ "/admin/ops": "folded" })).toEqual({ "/admin/ops": "folded" })
    expect(normalizeNavOverrides({ "/admin/ops": "primary" })).toEqual({ "/admin/ops": "primary" })
  })

  it("사이드바에서 빠진 마케팅 프로젝트 항목의 옛 오버라이드는 조용히 버린다(2026-10 캠페인 관리 탭 통합)", () => {
    expect(
      normalizeNavOverrides({ "/admin/campaigns/projects": "primary", "/admin/ops": "folded" })
    ).toEqual({ "/admin/ops": "folded" })
  })
})

describe("개인 숨김 — 목록과 도달성", () => {
  it("숨긴 항목은 hidden 에만 들어가고 상시·기타에서 빠진다", () => {
    const access = resolveAdminNavAccess(ctx({ overrides: { "/admin/quotes": "hidden", "/admin/blog": "hidden" } }))
    const primaryHrefs = access.primary.map((item) => item.href)
    const foldedHrefs = access.folded.flatMap((group) => group.items.map((item) => item.href))
    const hiddenHrefs = access.hidden.map((item) => item.href)

    for (const href of ["/admin/quotes", "/admin/blog"]) {
      expect(hiddenHrefs, href).toContain(href)
      expect(primaryHrefs, href).not.toContain(href)
      expect(foldedHrefs, href).not.toContain(href)
    }
    expect(getVisibleAdminNavItems(access).map((item) => item.href)).not.toContain("/admin/quotes")
  })

  // 불변식의 핵심 — ⌘K·active 판정·모바일 헤더가 이 집합에 기댄다.
  it("숨길 수 있는 걸 전부 숨겨도 accessible 은 16 전부다", () => {
    for (const role of EVERY_ROLE) {
      const access = resolveAdminNavAccess(ctx({ role, overrides: HIDE_EVERYTHING }))
      expect(getAccessibleAdminNavItems(access), role).toHaveLength(ADMIN_NAV.length)
      expect(getAccessibleAdminNavItems(access).map((item) => item.href), role).toEqual(
        ADMIN_NAV.map((item) => item.href)
      )
      // 목록에 남는 것은 숨길 수 없는 그 계정의 착지 화면뿐이다(전체: Overview, 간소: 매출 장부).
      expect(getVisibleAdminNavItems(access).map((item) => item.href), role).toEqual([
        resolveAdminLandingHref({ role }),
      ])
      expect(access.hidden.map((item) => item.href), role).toEqual(hideableHrefsFor({ role }))
    }
  })

  // 2026-11-19 까지는 "숨김 판정도 역할·레거시 프리셋과 무관하다"였다. 지금은 전체/간소 두 묶음
  // **안에서만** 같다 — 묶음을 가르는 것은 hasFullAdminNav 하나다.
  it("숨김 판정은 전체 계정끼리 같고, 간소 계정끼리 같다", () => {
    const overrides: Record<string, NavOverrideValue> = { "/admin/hardware": "hidden", "/admin/ops": "folded" }
    const fullExpected = hrefsOf(resolveAdminNavAccess(ctx({ overrides })).hidden)
    expect(fullExpected).toEqual(["/admin/hardware"])
    for (const audience of FULL_AUDIENCES) {
      expect(
        hrefsOf(resolveAdminNavAccess({ ...audience, overrides }).hidden),
        audienceLabel(audience)
      ).toEqual(fullExpected)
    }

    const simpleExpected = hrefsOf(resolveAdminNavAccess(simple({ overrides })).hidden)
    // 간소: 매출 장부·견적(기본 상시)과 되살린 운영 상태를 뺀 전부가 숨김이다.
    expect(simpleExpected).toEqual(
      ADMIN_NAV.map((item) => item.href).filter(
        (href) => ![...SIMPLE_NAV_PRIMARY_HREFS, "/admin/ops"].includes(href)
      )
    )
    for (const audience of SIMPLE_AUDIENCES) {
      expect(
        hrefsOf(resolveAdminNavAccess({ ...audience, overrides }).hidden),
        audienceLabel(audience)
      ).toEqual(simpleExpected)
    }
  })

  it("정규화를 거치지 않은 컨텍스트에서도 Overview 는 숨겨지지 않는다", () => {
    const raw = ctx({ overrides: { "/admin/overview": "hidden" } })
    expect(resolveNavPreference("/admin/overview", raw)).toBe("primary")
    expect(resolveNavAccess(raw).primary[0]?.href).toBe("/admin/overview")
  })
})

describe("기본 숨김 목록", () => {
  it("ADMIN_NAV 에 있는 항목이고, 상시 기본·착지 화면과 겹치지 않는다", () => {
    const known = new Set(ADMIN_NAV.map((item) => item.href))
    for (const href of DEFAULT_HIDDEN_HREFS) {
      expect(known.has(href), href).toBe(true)
      expect(DEFAULT_PRIMARY_HREFS, href).not.toContain(href)
      expect([FULL_NAV_LANDING_HREF, SIMPLE_NAV_LANDING_HREF], href).not.toContain(href)
      expect(resolveDefaultNavPreference(href, FULL), href).toBe("hidden")
    }
    expect([...DEFAULT_HIDDEN_HREFS].sort()).toEqual(["/admin/ops"])
  })

  it("사람이 다시 표시하면 그 사람 오버라이드(folded)가 기본 숨김을 이긴다", () => {
    const restored = setNavOverride({}, "/admin/ops", resolveNavPlacement("/admin/ops", ctx()), FULL)
    expect(restored).toEqual({ "/admin/ops": "folded" })
    const access = resolveAdminNavAccess(ctx({ overrides: restored }))
    expect(access.hidden.map((item) => item.href)).not.toContain("/admin/ops")
    expect(access.folded.flatMap((group) => group.items).map((item) => item.href)).toContain("/admin/ops")
  })
})

describe("setNavOverride", () => {
  it("결과가 기본값과 같으면 키를 지운다", () => {
    // 상시 기본 항목을 상시로, 기본 숨김 항목을 숨김으로 — 둘 다 예외가 아니다.
    expect(setNavOverride({ "/admin/crm": "folded" }, "/admin/crm", "primary", FULL)).toEqual({})
    expect(setNavOverride({ "/admin/ops": "folded" }, "/admin/ops", "hidden", FULL)).toEqual({})
    expect(setNavOverride({ "/admin/analytics": "primary" }, "/admin/analytics", "folded", FULL)).toEqual({})
    // 콘텐츠는 2026-10-26부터 상시 기본이다.
    expect(setNavOverride({ "/admin/blog": "folded" }, "/admin/blog", "primary", FULL)).toEqual({})
  })

  it("기본과 다르면 값을 남긴다", () => {
    expect(setNavOverride({}, "/admin/quotes", "hidden", FULL)).toEqual({ "/admin/quotes": "hidden" })
    expect(setNavOverride({}, "/admin/analytics", "primary", FULL)).toEqual({ "/admin/analytics": "primary" })
    expect(setNavOverride({}, "/admin/blog", "folded", FULL)).toEqual({ "/admin/blog": "folded" })
  })

  it("Overview 숨김·모르는 href 는 무시하고, 입력을 변형하지 않는다", () => {
    const input: Record<string, NavOverrideValue> = { "/admin/blog": "primary" }
    expect(setNavOverride(input, "/admin/overview", "hidden", FULL)).toEqual(input)
    expect(setNavOverride(input, "/admin/없는탭", "hidden", FULL)).toEqual(input)
    const next = setNavOverride(input, "/admin/dev", "hidden", FULL)
    expect(next).toEqual({ "/admin/blog": "primary", "/admin/dev": "hidden" })
    expect(input).toEqual({ "/admin/blog": "primary" })
  })
})

describe("buildNavPreferenceRows — 편집기 행", () => {
  it("전체 계정은 Overview 만 숨김 불가이고, 기본 숨김 행은 예외가 아니다", () => {
    const rows = buildNavPreferenceRows(ctx())
    expect(rows).toHaveLength(ADMIN_NAV.length)
    expect(rows.filter((row) => !row.hideable).map((row) => row.item.href)).toEqual([FULL_NAV_LANDING_HREF])
    expect(rows.filter((row) => row.isException)).toHaveLength(0)
    const ops = rows.find((row) => row.item.href === "/admin/ops")
    expect(ops?.preference).toBe("hidden")
    expect(ops?.base).toBe("hidden")
  })

  it("기본과 다르게 고른 행만 예외로 센다", () => {
    const rows = buildNavPreferenceRows(ctx({ overrides: { "/admin/ops": "folded", "/admin/quotes": "hidden" } }))
    expect(rows.filter((row) => row.isException).map((row) => row.item.href).sort()).toEqual([
      "/admin/ops",
      "/admin/quotes",
    ])
  })
})

// ── 전체 / 간소 사이드바(2026-11-20) ────────────────────────────────────────────
// 정본: docs/active/sales-workspace-simplification-plan-2026-11-20.md W1 · D1 · D2,
// components/admin/admin-nav-access.ts 머리 주석. 아래 (a)~(e)가 그 결정의 불변식이다.

/** 오버라이드 표본 — 설정 없음 · 자리 이동 · 숨김 · 전부 숨김/상시/기타 · 레거시 deny · crm: 키 혼합. */
const OVERRIDE_SAMPLES: Array<[string, Record<string, NavOverrideValue>]> = [
  ["설정 없음", {}],
  ["자리 이동", { "/admin/analytics": "primary", "/admin/crm": "folded" }],
  ["숨김 몇 개", { "/admin/quotes": "hidden", "/admin/hardware": "hidden", "/admin/ops": "folded" }],
  ["두 착지 모두 숨김(정규화 전 값)", { [FULL_NAV_LANDING_HREF]: "hidden", [SIMPLE_NAV_LANDING_HREF]: "hidden" }],
  ["전부 숨김", HIDE_EVERYTHING],
  ["전부 상시", Object.fromEntries(ADMIN_NAV.map((item) => [item.href, "primary" as const]))],
  ["전부 기타", Object.fromEntries(ADMIN_NAV.map((item) => [item.href, "folded" as const]))],
  ["레거시 deny", normalizeNavOverrides(Object.fromEntries(ADMIN_NAV.map((item) => [item.href, "deny"])))],
  ["CRM 하위 탭 키 혼합", { "crm:/admin/crm/activity": "shown", "/admin/blog": "hidden" }],
]

describe("hasFullAdminNav — 전체 사이드바 계정", () => {
  it("SUPER_ADMIN 은 프리셋과 무관하게 전체다", () => {
    for (const preset of [undefined, null, "", ...EVERY_LEGACY_PRESET]) {
      expect(hasFullAdminNav({ role: "SUPER_ADMIN", preset }), String(preset)).toBe(true)
    }
  })

  it('그 밖의 역할은 nav_preset 이 "super" 일 때만 전체다 — 역할을 올리지 않는 지정 계정', () => {
    for (const role of NON_SUPER_ROLES) {
      expect(hasFullAdminNav({ role, preset: "super" }), role).toBe(true)
      expect(hasFullAdminNav({ role }), role).toBe(false)
      expect(hasFullAdminNav({ role, preset: null }), role).toBe(false)
    }
    expect(FULL_NAV_PRESET).toBe("super")
  })

  // (e) 운영 DB 에는 2026-09-10 이전에 배정한 프리셋 값이 남아 있을 수 있다.
  it('(e) "super" 가 아닌 레거시 값(sales·branch 등)·빈 값·모르는 값은 전체를 주지 않는다', () => {
    expect(NON_FULL_PRESETS).toEqual(["staff", "sales", "marketing", "cs", "lead", "branch"])
    for (const audience of SIMPLE_AUDIENCES) {
      expect(hasFullAdminNav(audience), audienceLabel(audience)).toBe(false)
      const access = resolveAdminNavAccess({ ...audience, overrides: {} })
      expect(access.fullNav, audienceLabel(audience)).toBe(false)
      expect(hrefsOf(access.primary), audienceLabel(audience)).toEqual([...SIMPLE_NAV_PRIMARY_HREFS])
    }
  })

  it("레거시 소문자 역할(admin·branch·partner)은 간소다", () => {
    for (const role of ["admin", "branch", "partner", "모르는역할"]) {
      expect(hasFullAdminNav({ role }), role).toBe(false)
    }
  })
})

describe("(a) 전체 사이드바 계정의 결과는 2026-11-20 이전과 같다", () => {
  // 변경 전(1e4d298e 이전) resolveAdminNavAccess({ role: 아무 역할, overrides: {} }) 의 출력을 글자로
  // 박아 둔다. 시안 스위치 꺼짐(기본) 기준 — 켜짐은 tests/admin/nav-ai-preview.test.tsx.
  const BEFORE = {
    primary: [
      "/admin/overview",
      "/admin/calendar",
      "/admin/branch",
      "/admin/branch/ledger",
      "/admin/crm",
      "/admin/quotes",
      "/admin/hardware",
      "/admin/chatbot",
      "/admin/campaigns",
      "/admin/blog",
    ],
    folded: ["/admin/campaigns/manage", "/admin/lead-magnets", "/admin/analytics", "/admin/settings", "/admin/dev"],
    hidden: ["/admin/ops"],
  }

  it.each(FULL_AUDIENCES.map((audience) => [audienceLabel(audience), audience] as const))(
    "%s — 상시 10 · 기타 5 · 숨김 1, 소제목 켜짐, Overview 만 숨김 불가",
    (_label, audience) => {
      const access = resolveAdminNavAccess({ ...audience, overrides: {} })
      expect(access.fullNav).toBe(true)
      expect(hrefsOf(access.primary)).toEqual(BEFORE.primary)
      expect([...foldedHrefsOf(access)].sort()).toEqual([...BEFORE.folded].sort())
      expect(hrefsOf(access.hidden)).toEqual(BEFORE.hidden)
      expect(access.showPrimaryHeaders).toBe(true)
      expect(access.primaryGroups.map((group) => group.category)).toEqual(["home", "customer", "growth"])
      expect(access.folded.map((group) => group.category)).toEqual(["growth", "system"])
      expect(resolveAdminLandingHref(audience)).toBe("/admin/overview")
      expect(
        buildNavPreferenceRows({ ...audience, overrides: {} })
          .filter((row) => !row.hideable)
          .map((row) => row.item.href)
      ).toEqual(["/admin/overview"])
    }
  )

  it.each(OVERRIDE_SAMPLES)("오버라이드 '%s' — 전체 계정 조합이 모두 같은 결과를 낸다", (_name, overrides) => {
    const expected = resolveAdminNavAccess(ctx({ overrides }))
    for (const audience of FULL_AUDIENCES) {
      expect(resolveAdminNavAccess({ ...audience, overrides }), audienceLabel(audience)).toEqual(expected)
      expect(buildNavPreferenceRows({ ...audience, overrides }), audienceLabel(audience)).toEqual(
        buildNavPreferenceRows(ctx({ overrides }))
      )
    }
  })

  it("⌘K 숙주는 숨긴 탭까지 전부다 — 전체 계정은 숨긴 탭도 ⌘K 로 찾는다", () => {
    for (const [name, overrides] of OVERRIDE_SAMPLES) {
      const access = resolveAdminNavAccess(ctx({ overrides }))
      expect(hrefsOf(getPaletteAdminNavItems(access)), name).toEqual(ADMIN_NAV.map((item) => item.href))
    }
  })
})

describe("(b) 간소 사이드바 계정 — 상시는 매출 장부·견적·문서 둘뿐이다", () => {
  it("상시 목록 상수는 장부·견적이고, 착지가 그 안에 있으며, 전부 전체 계정의 상시 자리다", () => {
    expect([...SIMPLE_NAV_PRIMARY_HREFS]).toEqual(["/admin/branch/ledger", "/admin/quotes"])
    expect(SIMPLE_NAV_PRIMARY_HREFS).toContain(SIMPLE_NAV_LANDING_HREF)
    // 기타 자리의 항목을 넣으면 간소 사이드바에 "기타" 묶음이 생긴다 — 자리 표를 전체와 같이 쓰기 때문.
    for (const href of SIMPLE_NAV_PRIMARY_HREFS) expect(DEFAULT_PRIMARY_HREFS, href).toContain(href)
  })

  it.each(SIMPLE_AUDIENCES.map((audience) => [audienceLabel(audience), audience] as const))(
    "%s — 상시 2 · 기타 0 · 나머지 전부 숨김, 소제목 없음",
    (_label, audience) => {
      const access = resolveAdminNavAccess({ ...audience, overrides: {} })
      expect(access.fullNav).toBe(false)
      expect(hrefsOf(access.primary)).toEqual(["/admin/branch/ledger", "/admin/quotes"])
      expect(access.folded).toEqual([])
      expect(hrefsOf(access.hidden)).toEqual(
        ADMIN_NAV.map((item) => item.href).filter((href) => !SIMPLE_NAV_PRIMARY_HREFS.includes(href))
      )
      expect(access.showPrimaryHeaders).toBe(false)
      expect(hrefsOf(getVisibleAdminNavItems(access))).toEqual(["/admin/branch/ledger", "/admin/quotes"])
      // Overview 는 간소 계정에게 기본 숨김이다 — 관리자 화면에 떨어지지 않는다(S3).
      expect(isNavHidden("/admin/overview", { ...audience, overrides: {} })).toBe(true)
    }
  )

  it("되살린 탭이 늘어도 범주 소제목은 켜지지 않는다 — 평평한 목록이다", () => {
    const access = resolveAdminNavAccess(
      simple({ overrides: Object.fromEntries(ADMIN_NAV.map((item) => [item.href, "primary" as const])) })
    )
    expect(access.primary).toHaveLength(ADMIN_NAV.length)
    expect(access.primaryGroups.length).toBeGreaterThanOrEqual(2)
    expect(access.showPrimaryHeaders).toBe(false)
  })

  it("개인 오버라이드는 간소 기본값을 이긴다 — 되살린 탭은 전체 계정에서 앉는 자리로 간다", () => {
    const seatCrm = resolveNavPlacement("/admin/crm", simple())
    const seatAnalytics = resolveNavPlacement("/admin/analytics", simple())
    expect([seatCrm, seatAnalytics]).toEqual(["primary", "folded"])

    let overrides = setNavOverride({}, "/admin/crm", seatCrm, SIMPLE)
    overrides = setNavOverride(overrides, "/admin/analytics", seatAnalytics, SIMPLE)
    // 간소 계정에게는 둘 다 기본(숨김)과 다르므로 키가 남는다 — 전체 계정이면 둘 다 기본값이라 지워진다.
    expect(overrides).toEqual({ "/admin/crm": "primary", "/admin/analytics": "folded" })
    expect(setNavOverride({}, "/admin/crm", "primary", FULL)).toEqual({})

    const access = resolveAdminNavAccess(simple({ overrides }))
    expect(hrefsOf(access.primary)).toEqual(["/admin/branch/ledger", "/admin/crm", "/admin/quotes"])
    expect(foldedHrefsOf(access)).toEqual(["/admin/analytics"])
    expect(hrefsOf(access.hidden)).not.toContain("/admin/crm")
  })

  it("다시 숨기면 키가 지워진다 — 간소 계정의 기본값이 숨김이라 예외가 아니다", () => {
    expect(setNavOverride({ "/admin/crm": "primary" }, "/admin/crm", "hidden", SIMPLE)).toEqual({})
    expect(setNavOverride({ "/admin/overview": "primary" }, "/admin/overview", "hidden", SIMPLE)).toEqual({})
    // 견적은 간소 계정에게도 숨길 수 있다(착지가 아니다) — 숨기면 예외로 남는다.
    expect(setNavOverride({}, "/admin/quotes", "hidden", SIMPLE)).toEqual({ "/admin/quotes": "hidden" })
    // 장부·견적을 상시로 두는 것은 기본값이라 키가 남지 않는다.
    expect(setNavOverride({ "/admin/quotes": "folded" }, "/admin/quotes", "primary", SIMPLE)).toEqual({})
  })

  it("편집기 행 — 매출 장부만 숨김 불가이고, 설정이 없으면 예외가 0이다", () => {
    const rows = buildNavPreferenceRows(simple())
    expect(rows).toHaveLength(ADMIN_NAV.length)
    expect(hrefsOf(rows.filter((row) => !row.hideable).map((row) => row.item))).toEqual(["/admin/branch/ledger"])
    expect(rows.filter((row) => row.isException)).toEqual([])
    expect(hrefsOf(rows.filter((row) => row.base !== "hidden").map((row) => row.item))).toEqual([
      "/admin/branch/ledger",
      "/admin/quotes",
    ])
    const overview = rows.find((row) => row.item.href === "/admin/overview")
    expect(overview).toMatchObject({ preference: "hidden", base: "hidden", hideable: true })
  })

  it("⌘K 숙주는 보이는 탭뿐이고, 되살린 탭은 다시 숙주가 된다", () => {
    expect(hrefsOf(getPaletteAdminNavItems(resolveAdminNavAccess(simple())))).toEqual([
      "/admin/branch/ledger",
      "/admin/quotes",
    ])
    expect(
      hrefsOf(getPaletteAdminNavItems(resolveAdminNavAccess(simple({ overrides: { "/admin/analytics": "folded" } }))))
    ).toEqual(["/admin/branch/ledger", "/admin/quotes", "/admin/analytics"])
  })
})

describe("(c) 착지 경로는 그 계정에게 숨김이 아니다", () => {
  const EVERY_AUDIENCE = [...FULL_AUDIENCES, ...SIMPLE_AUDIENCES]

  it("전체 → Overview, 간소 → 매출 장부. 둘 다 ADMIN_NAV 항목이다", () => {
    for (const audience of FULL_AUDIENCES) {
      expect(resolveAdminLandingHref(audience), audienceLabel(audience)).toBe("/admin/overview")
    }
    for (const audience of SIMPLE_AUDIENCES) {
      expect(resolveAdminLandingHref(audience), audienceLabel(audience)).toBe("/admin/branch/ledger")
    }
    const known = ADMIN_NAV.map((item) => item.href)
    expect(known).toContain(FULL_NAV_LANDING_HREF)
    expect(known).toContain(SIMPLE_NAV_LANDING_HREF)
  })

  // 2026-09-10 사고의 재발 방지 — 역할·프리셋·오버라이드 어떤 조합에서도 착지 화면이 사이드바의
  // 상시 또는 기타에 있어야 한다. 전부 숨김·착지 숨김(정규화 전 값)까지 넣어 본다.
  it.each(OVERRIDE_SAMPLES)("오버라이드 '%s' — 모든 계정의 착지가 목록에 보인다", (_name, overrides) => {
    for (const audience of EVERY_AUDIENCE) {
      const landing = resolveAdminLandingHref(audience)
      const context = { ...audience, overrides }
      const label = audienceLabel(audience)

      expect(isNavHideable(landing, audience), label).toBe(false)
      expect(isNavHidden(landing, context), label).toBe(false)
      expect(resolveNavPreference(landing, context), label).not.toBe("hidden")
      expect(resolveDefaultNavPreference(landing, audience), label).not.toBe("hidden")

      // 정규화를 거친 실제 진입점과, 거치지 않은 판정 양쪽 모두.
      for (const access of [resolveAdminNavAccess(context), resolveNavAccess(context)]) {
        expect(hrefsOf(access.hidden), label).not.toContain(landing)
        expect(hrefsOf(getVisibleAdminNavItems(access)), label).toContain(landing)
        expect(hrefsOf(getPaletteAdminNavItems(access)), label).toContain(landing)
      }
    }
  })

  it("착지 화면만 숨김 불가다 — 상대 계정의 착지는 숨길 수 있다", () => {
    expect(isNavHideable("/admin/overview", FULL)).toBe(false)
    expect(isNavHideable("/admin/branch/ledger", FULL)).toBe(true)
    expect(isNavHideable("/admin/branch/ledger", SIMPLE)).toBe(false)
    expect(isNavHideable("/admin/overview", SIMPLE)).toBe(true)
    // 전체 계정은 지금처럼 매출 장부를 숨길 수 있다.
    expect(setNavOverride({}, "/admin/branch/ledger", "hidden", FULL)).toEqual({ "/admin/branch/ledger": "hidden" })
    // 간소 계정의 착지 숨김은 무시된다(입력 그대로).
    expect(setNavOverride({}, "/admin/branch/ledger", "hidden", SIMPLE)).toEqual({})
  })

  it("전체 계정일 때 매출 장부를 숨겼던 사람이 간소 계정이 돼도 착지가 사라지지 않는다", () => {
    const saved = normalizeNavOverrides({ "/admin/branch/ledger": "hidden" })
    // 정규화는 계정을 모른다 — 전체 계정에게 정당한 값이라 지우지 않는다.
    expect(saved).toEqual({ "/admin/branch/ledger": "hidden" })
    expect(hrefsOf(resolveAdminNavAccess(ctx({ overrides: saved })).hidden)).toContain("/admin/branch/ledger")
    const demoted = resolveAdminNavAccess(simple({ overrides: saved }))
    expect(hrefsOf(demoted.primary)).toEqual(["/admin/branch/ledger", "/admin/quotes"])
  })

  // 착지를 정하는 곳은 admin-nav-access.ts 하나다 — 두 진입점이 경로를 글자로 박으면 다시 따로 논다.
  const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8")

  it("로그인은 경로를 글자로 박지 않고 resolveAdminLandingHref 만 쓴다(Supabase·레거시 두 경로)", () => {
    const login = read("app/admin/login/page.tsx")
    expect([...login.matchAll(/router\.replace\("(\/admin[^"]*)"\)/g)]).toEqual([])
    expect(login).not.toContain('"/admin/overview"')
    expect(login).not.toContain('"/admin/branch/ledger"')
    expect([...login.matchAll(/router\.replace\(resolveAdminLandingHref\(/g)]).toHaveLength(2)
    // Supabase 경로는 nav_preset 을 읽어 넘기고(지정 계정 → Overview), 컬럼이 없으면 3컬럼으로 폴백한다.
    expect(login).toContain('.select("display_name, role, status, nav_preset")')
    expect(login).toContain('.select("display_name, role, status")')
    expect(login).toContain("resolveAdminLandingHref({ role: profile.role, preset: navPreset })")
  })

  it("/admin 은 서버 셸 세션으로 같은 함수를 부르고, 세션이 없으면 Overview 로 보낸다", () => {
    const page = read("app/admin/page.tsx")
    expect([...page.matchAll(/redirect\("(\/admin[^"]*)"\)/g)]).toEqual([])
    expect(page).not.toContain('"/admin/overview"')
    expect(page).not.toContain('"use client"')
    expect(page).toContain("await resolveAdminShellSession()")
    expect(page).toContain("resolveAdminLandingHref({ role: session.role, preset: session.navPreset })")
    expect(page).toContain(": FULL_NAV_LANDING_HREF")
  })

  it("착지 경로를 글자로 가진 곳은 admin-nav-access.ts 의 두 상수뿐이다", () => {
    const access = read("components/admin/admin-nav-access.ts")
    expect(access).toContain('export const FULL_NAV_LANDING_HREF = "/admin/overview"')
    expect(access).toContain('export const SIMPLE_NAV_LANDING_HREF = "/admin/branch/ledger"')
    // 고정 목록은 지웠다 — 되살리면 "Overview 는 누구에게나 숨김 불가"라는 옛 전제가 돌아온다.
    expect(access).not.toContain("export const UNHIDEABLE_NAV_HREFS")
  })
})

describe("(d) getAccessibleAdminNavItems 는 간소 계정에서도 ADMIN_NAV 전체다", () => {
  const ALL = ADMIN_NAV.map((item) => item.href)

  it.each(OVERRIDE_SAMPLES)("오버라이드 '%s' — 모든 계정에서 선언 순서 그대로 전부다", (_name, overrides) => {
    for (const audience of [...FULL_AUDIENCES, ...SIMPLE_AUDIENCES]) {
      const access = resolveAdminNavAccess({ ...audience, overrides })
      expect(hrefsOf(getAccessibleAdminNavItems(access)), audienceLabel(audience)).toEqual(ALL)
      // 세 칸은 겹치지 않고 합치면 전체다 — 어느 계정에서도 항목이 걸러지지 않는다(차단 없음).
      const buckets = [...hrefsOf(access.primary), ...foldedHrefsOf(access), ...hrefsOf(access.hidden)]
      expect(buckets, audienceLabel(audience)).toHaveLength(ALL.length)
      expect([...buckets].sort(), audienceLabel(audience)).toEqual([...ALL].sort())
    }
  })

  it("간소 계정의 숨긴 탭은 hidden 에 남는다 — 주소로 들어간 화면의 헤더 라벨·active 판정이 여기에 기댄다", () => {
    const access = resolveAdminNavAccess(simple())
    expect(hrefsOf(access.hidden)).toContain("/admin/overview")
    expect(hrefsOf(access.hidden)).toContain("/admin/crm")
    expect(hrefsOf(getAccessibleAdminNavItems(access))).toContain("/admin/crm")
    expect(hrefsOf(getVisibleAdminNavItems(access))).not.toContain("/admin/crm")
  })
})

describe("PATCH /api/admin/users — nav access 계약", () => {
  const route = readFileSync(join(process.cwd(), "app/api/admin/users/route.ts"), "utf8")

  it("stays SUPER_ADMIN-only", () => {
    expect(route).toContain('requireVerifiedAdminContext(req, ["SUPER_ADMIN"])')
  })

  it("accepts navPreset and navOverrides alongside capabilities", () => {
    expect(route).toContain("navPreset")
    expect(route).toContain("navOverrides")
    expect(route).toContain("isNavPresetKey")
    expect(route).toContain("normalizeNavOverrides")
  })

  it("audits nav access changes separately from capability changes", () => {
    expect(route).toContain('action: "admin.nav_access.update"')
  })

  it("clears the shell session cache so the target's sidebar picks up the change", () => {
    expect(route).toContain("invalidateAdminShellSessionCache()")
  })

  it("keeps the existing capabilities contract intact", () => {
    // tests/admin/members-capability-ui.test.ts가 고정한 계약 — 깨면 안 된다.
    expect(route).toContain("normalizeAdminCapabilities")
    expect(route).toContain('action: "admin.capabilities.update"')
  })
})
