import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { ADMIN_NAV } from "@/components/admin/admin-nav"
import {
  DEFAULT_PRIMARY_HREFS,
  getAccessibleAdminNavItems,
  resolveAdminNavAccess,
  normalizeNavOverrides,
  resolveNavAccess,
  resolveNavPlacement,
  type NavAccessContext,
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
      "/admin/campaigns/projects": "growth",
      "/admin/overview": "home",
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
  it("상시 8개는 DEFAULT_PRIMARY_HREFS 그대로다", () => {
    for (const href of DEFAULT_PRIMARY_HREFS) {
      expect(resolveNavPlacement(href, ctx()), href).toBe("primary")
    }
    expect(DEFAULT_PRIMARY_HREFS).toHaveLength(8)
  })

  it("나머지는 전부 기타로 접힌다", () => {
    const rest = ADMIN_NAV.map((item) => item.href).filter(
      (href) => !DEFAULT_PRIMARY_HREFS.includes(href)
    )
    expect(rest).toHaveLength(9)
    for (const href of rest) {
      expect(resolveNavPlacement(href, ctx()), href).toBe("folded")
    }
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
  it("상시 8 / 기타 9 로 나눈다", () => {
    const { primary, folded } = resolveNavAccess(ctx())
    expect(primary).toHaveLength(8)
    expect(folded.flatMap((group) => group.items)).toHaveLength(9)
  })

  it("Overview 가 상시 첫 항목이고 home 이 첫 그룹이다", () => {
    const access = resolveNavAccess(ctx())
    expect(access.primary[0]?.href).toBe("/admin/overview")
    expect(access.primaryGroups[0]?.category).toBe("home")
  })

  it("상시를 재정렬 없이 범주로 분할한다 — 홈 + 고객·매출", () => {
    const access = resolveNavAccess(ctx())
    expect(access.primaryGroups.flatMap((group) => group.items)).toEqual(access.primary)
    expect(access.primaryGroups.map((group) => group.category)).toEqual(["home", "customer"])
  })

  it("기타를 마케팅·분석 → 시스템 순서로 묶는다", () => {
    const { folded } = resolveNavAccess(ctx())
    expect(folded.map((group) => group.category)).toEqual(["growth", "system"])
    expect(folded.every((group) => group.items.length > 0)).toBe(true)
  })

  it("상시 소제목을 켠다 — 8항목 2범주", () => {
    expect(resolveNavAccess(ctx()).showPrimaryHeaders).toBe(true)
  })
})

describe("resolveAdminNavAccess", () => {
  const hrefs = (over: Partial<NavAccessContext> = {}) =>
    getAccessibleAdminNavItems(resolveAdminNavAccess(ctx(over))).map((item) => item.href)

  // 전면 공개의 핵심 계약 — 어떤 역할도 항목을 잃지 않는다.
  it("모든 역할이 17개 탭 전부에 도달한다", () => {
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

  it("keeps the existing capabilities contract intact", () => {
    // tests/admin/members-capability-ui.test.ts가 고정한 계약 — 깨면 안 된다.
    expect(route).toContain("normalizeAdminCapabilities")
    expect(route).toContain('action: "admin.capabilities.update"')
  })
})
