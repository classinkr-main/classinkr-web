import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { ADMIN_NAV } from "@/components/admin/admin-nav"
import {
  NAV_PRESETS,
  resolveNavAccess,
  resolveNavPlacement,
  type NavAccessContext,
} from "@/components/admin/admin-nav-access"

// 기타 그룹은 3범주(고객·매출 / 마케팅·분석 / 시스템)로 묶인다.
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
      "/admin/overview": "system",
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
  it("declares the 6 primary candidates in sidebar order, 캘린더 first", () => {
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
    expect(seen).toEqual(["customer", "growth", "system"])
  })
})

const ctx = (over: Partial<NavAccessContext> = {}): NavAccessContext => ({
  role: "ADMIN",
  preset: "staff",
  overrides: {},
  ...over,
})

describe("resolveNavPlacement", () => {
  it("falls back to legacy role behaviour when no preset is assigned", () => {
    // preset=null이면 오늘과 완전히 동일해야 한다 — 배포 시점 무변화가 이 설계의 안전장치다.
    expect(resolveNavPlacement("/admin/settings", ctx({ preset: null }))).toBe("primary")
    expect(resolveNavPlacement("/admin/crm", ctx({ preset: null }))).toBe("primary")
  })

  it("denies MOON_ONLY tabs for every non-super preset", () => {
    for (const preset of ["staff", "sales", "marketing", "cs", "lead", "branch"] as const) {
      expect(resolveNavPlacement("/admin/settings", ctx({ preset })), preset).toBe("deny")
      expect(resolveNavPlacement("/admin/overview", ctx({ preset })), preset).toBe("deny")
    }
  })

  it("keeps the CS console open and primary for every preset (2026-08-18 진입점 단일화)", () => {
    // 가이드 문서·내부 CS의 nav 항목이 콘솔로 흡수됐다 — 콘솔이 유일한 CS 진입점이므로
    // 어떤 프리셋도 차단하지 않고, "전원 상시"(구 가이드 문서 자리)를 승계한다.
    for (const preset of ["staff", "sales", "marketing", "cs", "lead", "branch", "super"] as const) {
      expect(resolveNavPlacement("/admin/chatbot", ctx({ preset })), preset).toBe("primary")
    }
  })

  it("restricts 매출 장부 to lead/branch and Analytics to lead", () => {
    expect(resolveNavPlacement("/admin/branch/ledger", ctx({ preset: "lead" }))).toBe("folded")
    expect(resolveNavPlacement("/admin/branch/ledger", ctx({ preset: "marketing" }))).toBe("deny")
    expect(resolveNavPlacement("/admin/analytics", ctx({ preset: "lead" }))).toBe("folded")
    expect(resolveNavPlacement("/admin/analytics", ctx({ preset: "branch" }))).toBe("deny")
  })

  it("promotes 매출 장부 to primary for the branch preset that declares it", () => {
    expect(resolveNavPlacement("/admin/branch/ledger", ctx({ preset: "branch" }))).toBe("primary")
  })

  it("folds every OPEN tab the preset did not promote", () => {
    expect(resolveNavPlacement("/admin/calendar", ctx({ preset: "cs" }))).toBe("primary")
    expect(resolveNavPlacement("/admin/hardware", ctx({ preset: "cs" }))).toBe("folded")
  })

  it("lets an override promote, demote, or grant access", () => {
    const granted = ctx({ preset: "marketing", overrides: { "/admin/branch/ledger": "folded" } })
    expect(resolveNavPlacement("/admin/branch/ledger", granted)).toBe("folded")

    const promoted = ctx({ preset: "cs", overrides: { "/admin/hardware": "primary" } })
    expect(resolveNavPlacement("/admin/hardware", promoted)).toBe("primary")

    const revoked = ctx({ preset: "lead", overrides: { "/admin/analytics": "deny" } })
    expect(resolveNavPlacement("/admin/analytics", revoked)).toBe("deny")
  })

  it("never denies SUPER_ADMIN, even with a deny override", () => {
    // 슈퍼 관리자가 자기 설정 화면을 잠그면 복구 경로가 없다.
    // 단 배치(상시/기타)까지 무시하지는 않는다 — 문준혁도 접힌 사이드바를 본다.
    const locked = ctx({
      role: "SUPER_ADMIN",
      preset: "staff",
      overrides: { "/admin/settings": "deny" },
    })
    expect(resolveNavPlacement("/admin/settings", locked)).not.toBe("deny")
  })
})

describe("resolveNavAccess", () => {
  it("splits the cs preset into 3 primary items in declaration order", () => {
    // 내부 CS 상시가 콘솔로 흡수돼 cs 프리셋 상시는 캘린더·견적·CS 콘솔 셋이다.
    const { primary } = resolveNavAccess(ctx({ preset: "cs" }))
    expect(primary.map((item) => item.href)).toEqual([
      "/admin/calendar",
      "/admin/quotes",
      "/admin/chatbot",
    ])
  })

  it("folds the reachable rest and hides the denied ones", () => {
    const { folded } = resolveNavAccess(ctx({ preset: "cs" }))
    const foldedHrefs = folded.flatMap((group) => group.items.map((item) => item.href))
    expect(foldedHrefs).toContain("/admin/crm")
    expect(foldedHrefs).toContain("/admin/hardware")
    expect(foldedHrefs).not.toContain("/admin/settings")
    expect(foldedHrefs).not.toContain("/admin/branch/ledger")
  })

  it("orders folded groups 고객·매출 → 마케팅·분석 → 시스템 and drops empty ones", () => {
    const { folded } = resolveNavAccess(ctx({ preset: "cs" }))
    // cs 프리셋에서 시스템 범주 항목(overview·ops·settings·dev)은 전부 차단이라
    // 시스템 그룹은 비어 사라진다.
    expect(folded.map((group) => group.category)).toEqual(["customer", "growth"])
    expect(folded.every((group) => group.items.length > 0)).toBe(true)
  })

  it("gives super 6 primary and 11 folded", () => {
    // CS 진입점 단일화로 상시 7(가이드 문서·내부 CS 포함) → 6(CS 콘솔), 전체 17 = 6 + 11.
    const { primary, folded } = resolveNavAccess(ctx({ role: "SUPER_ADMIN", preset: "super" }))
    expect(primary).toHaveLength(6)
    expect(folded.flatMap((group) => group.items)).toHaveLength(11)
  })

  // 상시 범주 묶음(2026-08-18) — 소제목 렌더는 이 두 필드가 SSOT다.
  it("partitions primary into category groups without reordering", () => {
    const access = resolveNavAccess(ctx({ role: "SUPER_ADMIN", preset: "super" }))
    expect(access.primaryGroups.flatMap((group) => group.items)).toEqual(access.primary)
    expect(access.primaryGroups.map((group) => group.category)).toEqual(["customer", "growth"])
  })

  it("shows primary headers only for 2+ groups and 4+ items", () => {
    // staff(2항목)·cs(3항목)는 평면 — 항목보다 헤더가 많아지는 걸 막는다(§4.1).
    expect(resolveNavAccess(ctx({ preset: "staff" })).showPrimaryHeaders).toBe(false)
    expect(resolveNavAccess(ctx({ preset: "cs" })).showPrimaryHeaders).toBe(false)
    // sales는 4항목이지만 전부 고객·매출 한 범주라 소제목이 무의미하다 — 평면.
    expect(resolveNavAccess(ctx({ preset: "sales" })).showPrimaryHeaders).toBe(false)
    // super·lead(6항목·2범주)는 소제목을 켠다.
    expect(resolveNavAccess(ctx({ role: "SUPER_ADMIN", preset: "super" })).showPrimaryHeaders).toBe(true)
    expect(resolveNavAccess(ctx({ preset: "lead" })).showPrimaryHeaders).toBe(true)
    // 프리셋 미배정(레거시)은 전 항목 상시 — 17항목 3범주라 소제목이 켜진다.
    expect(resolveNavAccess(ctx({ preset: null })).showPrimaryHeaders).toBe(true)
  })

  it("declares a primary set for every preset key", () => {
    for (const key of Object.keys(NAV_PRESETS)) {
      expect(NAV_PRESETS[key as keyof typeof NAV_PRESETS].primary.length, key).toBeGreaterThan(0)
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

  it("keeps the existing capabilities contract intact", () => {
    // tests/admin/members-capability-ui.test.ts가 고정한 계약 — 깨면 안 된다.
    expect(route).toContain("normalizeAdminCapabilities")
    expect(route).toContain('action: "admin.capabilities.update"')
  })
})
