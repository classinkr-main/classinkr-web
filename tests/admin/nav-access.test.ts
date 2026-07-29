import { describe, expect, it } from "vitest"

import { ADMIN_NAV } from "@/components/admin/admin-nav"
import {
  NAV_PRESETS,
  resolveNavAccess,
  resolveNavPlacement,
  type NavAccessContext,
} from "@/components/admin/admin-nav-access"

// 기타 그룹은 3범주(고객·매출 / 마케팅·분석 / 시스템)로 묶인다.
// 상시 후보 7개는 범주가 필요 없다(기타에 들어갈 때만 쓰인다).
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
      "/admin/chatbot": "system",
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
  it("declares the 7 primary candidates in sidebar order, 캘린더 first", () => {
    const primaryCandidates = [
      "/admin/calendar",
      "/admin/quotes",
      "/admin/hardware",
      "/admin/campaigns",
      "/admin/blog",
      // 가이드 문서가 내부 CS보다 위다. 두 가지 이유가 겹친다:
      //  (1) 가이드 문서는 전원 상시, 내부 CS는 cs 프리셋 전용 — 보편적인 쪽이 위로 간다.
      //  (2) sidebar-docs-gaps.test.ts가 cs 섹션 선언 순서를 [docs, chatbot, cs-chatbot]로
      //      고정하고 있어 docs < cs-chatbot이 강제된다. 두 계약이 같은 배열을 filter로
      //      읽으므로 반대 순서는 애초에 표현 불가능하다.
      "/admin/docs",
      "/admin/cs-chatbot",
    ]
    const declared = ADMIN_NAV.map((item) => item.href).filter((href) =>
      primaryCandidates.includes(href)
    )
    expect(declared).toEqual(primaryCandidates)
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
      expect(resolveNavPlacement("/admin/chatbot", ctx({ preset })), preset).toBe("deny")
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
  it("splits the cs preset into 4 primary items in declaration order", () => {
    const { primary } = resolveNavAccess(ctx({ preset: "cs" }))
    expect(primary.map((item) => item.href)).toEqual([
      "/admin/calendar",
      "/admin/quotes",
      "/admin/docs",
      "/admin/cs-chatbot",
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
    // cs 프리셋에서 시스템 범주 항목은 전부 차단(overview·chatbot·ops·settings·dev)이거나
    // 상시(docs·cs-chatbot)라 시스템 그룹은 비어 사라진다.
    expect(folded.map((group) => group.category)).toEqual(["customer", "growth"])
    expect(folded.every((group) => group.items.length > 0)).toBe(true)
  })

  it("gives super 7 primary and 12 folded", () => {
    const { primary, folded } = resolveNavAccess(ctx({ role: "SUPER_ADMIN", preset: "super" }))
    expect(primary).toHaveLength(7)
    expect(folded.flatMap((group) => group.items)).toHaveLength(12)
  })

  it("declares a primary set for every preset key", () => {
    for (const key of Object.keys(NAV_PRESETS)) {
      expect(NAV_PRESETS[key as keyof typeof NAV_PRESETS].primary.length, key).toBeGreaterThan(0)
    }
  })
})
