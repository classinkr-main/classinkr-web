import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { ADMIN_NAV } from "@/components/admin/admin-nav"
import {
  buildNavPreferenceRows,
  DEFAULT_HIDDEN_HREFS,
  DEFAULT_PRIMARY_HREFS,
  getAccessibleAdminNavItems,
  getVisibleAdminNavItems,
  isNavHidden,
  resolveAdminNavAccess,
  normalizeNavOverrides,
  resolveDefaultNavPreference,
  resolveNavAccess,
  resolveNavPlacement,
  resolveNavPreference,
  setNavOverride,
  UNHIDEABLE_NAV_HREFS,
  type NavAccessContext,
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

const ctx = (over: Partial<NavAccessContext> = {}): NavAccessContext => ({
  role: "ADMIN",
  overrides: {},
  ...over,
})

/** 전면 공개 전환 이후 배치가 역할·프리셋과 무관함을 확인할 때 쓰는 표본. */
const EVERY_ROLE = ["SUPER_ADMIN", "ADMIN", "BRANCH", "EDITOR", "VIEWER", "PARTNER"] as const
const EVERY_LEGACY_PRESET = ["staff", "sales", "marketing", "cs", "lead", "branch", "super"] as const

describe("resolveNavPlacement — 전원 공통 배치", () => {
  // 시안 스위치 꺼짐(기본, 기획 D13) 기준 — 켜면 AI 올인원이 더해져 10(tests/admin/nav-ai-preview.test.tsx).
  it("상시 9개는 DEFAULT_PRIMARY_HREFS 그대로다", () => {
    for (const href of DEFAULT_PRIMARY_HREFS) {
      expect(resolveNavPlacement(href, ctx()), href).toBe("primary")
    }
    expect(DEFAULT_PRIMARY_HREFS).toHaveLength(9)
  })

  it("나머지 7개의 자리는 전부 기타다 — 그중 1개는 기본 숨김이라 처음엔 목록에 없다", () => {
    // 2026-10 마케팅 프로젝트가 캠페인 관리의 탭이 되며 기본 숨김 2 → 1, 기타 자리 8 → 7.
    const rest = ADMIN_NAV.map((item) => item.href).filter(
      (href) => !DEFAULT_PRIMARY_HREFS.includes(href)
    )
    expect(rest).toHaveLength(7)
    // resolveNavPlacement 는 "보일 때 앉는 자리"다 — 기본 숨김 항목도 다시 표시하면 기타로 간다.
    for (const href of rest) {
      expect(resolveNavPlacement(href, ctx()), href).toBe("folded")
    }
    const hiddenByDefault = rest.filter((href) => isNavHidden(href, ctx()))
    expect(hiddenByDefault.sort()).toEqual([...DEFAULT_HIDDEN_HREFS].sort())
    expect(rest.length - hiddenByDefault.length).toBe(6)
  })

  // 이 테스트가 "모든 매니저가 같은 사이드바를 본다"를 고정한다.
  // 역할·레거시 프리셋 어떤 조합에서도 배치가 흔들리면 안 된다.
  it("역할·레거시 프리셋과 무관하게 같은 배치를 낸다", () => {
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
  it("상시 9 / 기타 6 / 숨김 1(기본 숨김) 로 나눈다", () => {
    // 2026-09-25 전까지는 "기타 9"였다 — 마케팅 프로젝트·운영 상태가 기본 숨김으로 빠졌다.
    // 2026-10 마케팅 프로젝트는 캠페인 관리의 "프로젝트" 탭이 되며 항목 자체가 빠졌다(숨김 2 → 1).
    // 2026-09-29 AI 올인원이 상시에 더해졌지만 시안 스위치가 꺼져 있으면(기본, 기획 D13) 빠진다 —
    // 2026-10-26 콘텐츠가 기타에서 상시로 올라왔다 — 상시 9, 세 칸을 합치면 16 전부다.
    // 켜짐(상시 10·17)은 tests/admin/nav-ai-preview.test.tsx.
    const { primary, folded, hidden } = resolveNavAccess(ctx())
    expect(primary).toHaveLength(9)
    expect(folded.flatMap((group) => group.items)).toHaveLength(6)
    expect(hidden.map((item) => item.href)).toEqual(["/admin/ops"])
    expect(primary.length + 6 + hidden.length).toBe(ADMIN_NAV.length)
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

  it("상시 소제목을 켠다 — 9항목 3범주", () => {
    expect(resolveNavAccess(ctx()).showPrimaryHeaders).toBe(true)
  })
})

describe("resolveAdminNavAccess", () => {
  const hrefs = (over: Partial<NavAccessContext> = {}) =>
    getAccessibleAdminNavItems(resolveAdminNavAccess(ctx(over))).map((item) => item.href)

  // 전면 공개의 핵심 계약 — 어떤 역할도 항목을 잃지 않는다.
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
const HIDEABLE_HREFS = ADMIN_NAV.map((item) => item.href).filter(
  (href) => !UNHIDEABLE_NAV_HREFS.includes(href)
)
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
      // 목록에 남는 것은 숨길 수 없는 Overview 뿐이다.
      expect(getVisibleAdminNavItems(access).map((item) => item.href), role).toEqual([...UNHIDEABLE_NAV_HREFS])
      expect(access.hidden.map((item) => item.href), role).toEqual(HIDEABLE_HREFS)
    }
  })

  it("숨김 판정도 역할·레거시 프리셋과 무관하다", () => {
    const overrides: Record<string, NavOverrideValue> = { "/admin/hardware": "hidden", "/admin/ops": "folded" }
    const expected = resolveAdminNavAccess(ctx({ overrides })).hidden.map((item) => item.href)
    expect(expected).toEqual(["/admin/hardware"])
    for (const role of EVERY_ROLE) {
      for (const preset of EVERY_LEGACY_PRESET) {
        expect(
          resolveAdminNavAccess(ctx({ role, preset, overrides })).hidden.map((item) => item.href),
          `${role} / ${preset}`
        ).toEqual(expected)
      }
    }
  })

  it("정규화를 거치지 않은 컨텍스트에서도 Overview 는 숨겨지지 않는다", () => {
    const raw = ctx({ overrides: { "/admin/overview": "hidden" } })
    expect(resolveNavPreference("/admin/overview", raw)).toBe("primary")
    expect(resolveNavAccess(raw).primary[0]?.href).toBe("/admin/overview")
  })
})

describe("기본 숨김 목록", () => {
  it("ADMIN_NAV 에 있는 항목이고, 상시 기본·숨김 불가 목록과 겹치지 않는다", () => {
    const known = new Set(ADMIN_NAV.map((item) => item.href))
    for (const href of DEFAULT_HIDDEN_HREFS) {
      expect(known.has(href), href).toBe(true)
      expect(DEFAULT_PRIMARY_HREFS, href).not.toContain(href)
      expect(UNHIDEABLE_NAV_HREFS, href).not.toContain(href)
      expect(resolveDefaultNavPreference(href), href).toBe("hidden")
    }
    expect([...DEFAULT_HIDDEN_HREFS].sort()).toEqual(["/admin/ops"])
  })

  it("사람이 다시 표시하면 그 사람 오버라이드(folded)가 기본 숨김을 이긴다", () => {
    const restored = setNavOverride({}, "/admin/ops", resolveNavPlacement("/admin/ops", ctx()))
    expect(restored).toEqual({ "/admin/ops": "folded" })
    const access = resolveAdminNavAccess(ctx({ overrides: restored }))
    expect(access.hidden.map((item) => item.href)).not.toContain("/admin/ops")
    expect(access.folded.flatMap((group) => group.items).map((item) => item.href)).toContain("/admin/ops")
  })
})

describe("setNavOverride", () => {
  it("결과가 기본값과 같으면 키를 지운다", () => {
    // 상시 기본 항목을 상시로, 기본 숨김 항목을 숨김으로 — 둘 다 예외가 아니다.
    expect(setNavOverride({ "/admin/crm": "folded" }, "/admin/crm", "primary")).toEqual({})
    expect(setNavOverride({ "/admin/ops": "folded" }, "/admin/ops", "hidden")).toEqual({})
    expect(setNavOverride({ "/admin/analytics": "primary" }, "/admin/analytics", "folded")).toEqual({})
    // 콘텐츠는 2026-10-26부터 상시 기본이다.
    expect(setNavOverride({ "/admin/blog": "folded" }, "/admin/blog", "primary")).toEqual({})
  })

  it("기본과 다르면 값을 남긴다", () => {
    expect(setNavOverride({}, "/admin/quotes", "hidden")).toEqual({ "/admin/quotes": "hidden" })
    expect(setNavOverride({}, "/admin/analytics", "primary")).toEqual({ "/admin/analytics": "primary" })
    expect(setNavOverride({}, "/admin/blog", "folded")).toEqual({ "/admin/blog": "folded" })
  })

  it("Overview 숨김·모르는 href 는 무시하고, 입력을 변형하지 않는다", () => {
    const input: Record<string, NavOverrideValue> = { "/admin/blog": "primary" }
    expect(setNavOverride(input, "/admin/overview", "hidden")).toEqual(input)
    expect(setNavOverride(input, "/admin/없는탭", "hidden")).toEqual(input)
    const next = setNavOverride(input, "/admin/dev", "hidden")
    expect(next).toEqual({ "/admin/blog": "primary", "/admin/dev": "hidden" })
    expect(input).toEqual({ "/admin/blog": "primary" })
  })
})

describe("buildNavPreferenceRows — 편집기 행", () => {
  it("Overview 만 숨김 불가이고, 기본 숨김 행은 예외가 아니다", () => {
    const rows = buildNavPreferenceRows(ctx())
    expect(rows).toHaveLength(ADMIN_NAV.length)
    expect(rows.filter((row) => !row.hideable).map((row) => row.item.href)).toEqual([...UNHIDEABLE_NAV_HREFS])
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

describe("숨길 수 없는 항목 = 로그인·/admin 착지", () => {
  // 착지 경로가 바뀌었는데 UNHIDEABLE 을 안 고치면 "로그인하자마자 사이드바에 없는 화면"이 된다.
  const redirectTargets = (path: string, pattern: RegExp) =>
    [...readFileSync(join(process.cwd(), path), "utf8").matchAll(pattern)].map((match) => match[1])

  it("로그인 후 이동 대상이 전부 숨길 수 없는 항목이다", () => {
    const targets = redirectTargets("app/admin/login/page.tsx", /router\.replace\("(\/admin[^"]*)"\)/g)
    expect(targets.length).toBeGreaterThan(0)
    for (const target of targets) {
      expect(UNHIDEABLE_NAV_HREFS, target).toContain(target)
    }
  })

  it("/admin 리다이렉트 대상이 숨길 수 없는 항목이다", () => {
    const targets = redirectTargets("app/admin/page.tsx", /redirect\("(\/admin[^"]*)"\)/g)
    expect(targets.length).toBeGreaterThan(0)
    for (const target of targets) {
      expect(UNHIDEABLE_NAV_HREFS, target).toContain(target)
    }
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
