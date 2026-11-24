import { describe, expect, it } from "vitest"

import {
  FULL_NAV_ONLY_LENSES,
  LEDGER_TABLE_VIEWS,
  LENS_TAB_ORDER,
  ledgerTableViewFromParam,
  lensTabOf,
  visibleLensTabIds,
} from "@/components/admin/branch/ledger/ledger-lens-tabs"
import { hasFullAdminNav } from "@/components/admin/admin-nav-access"

// 장부 머리줄의 렌즈 탭(2026-11-23, 기획 L8) — [DSH | 장부] 순서, 보드·콕핏은 전체 사이드바 계정만.
// 숨김은 탭 줄에서만이다: ?lens= 주소로 연 렌즈는 탭 줄에 남는다(현재 위치가 사라지지 않게).

describe("렌즈 탭 — 계정별 노출", () => {
  it("탭 순서는 DSH · 장부 · 보드 · 콕핏이다", () => {
    expect(LENS_TAB_ORDER).toEqual(["dsh", "ledger", "board", "cockpit"])
    expect(Array.from(FULL_NAV_ONLY_LENSES).sort()).toEqual(["board", "cockpit"])
  })

  it("간소 계정은 DSH · 장부 둘만 본다", () => {
    expect(visibleLensTabIds({ fullNav: false, activeLens: "ledger" })).toEqual(["dsh", "ledger"])
    expect(visibleLensTabIds({ fullNav: false, activeLens: "dsh" })).toEqual(["dsh", "ledger"])
    // 주차 검수(rev)는 장부 탭 안의 보기라 탭이 늘지 않는다.
    expect(visibleLensTabIds({ fullNav: false, activeLens: "rev" })).toEqual(["dsh", "ledger"])
  })

  it("전체 사이드바 계정은 넷을 다 본다", () => {
    expect(visibleLensTabIds({ fullNav: true, activeLens: "ledger" })).toEqual(["dsh", "ledger", "board", "cockpit"])
  })

  it("간소 계정도 ?lens=board · ?lens=cockpit 로 열면 그 탭이 줄에 남는다", () => {
    expect(visibleLensTabIds({ fullNav: false, activeLens: "board" })).toEqual(["dsh", "ledger", "board"])
    expect(visibleLensTabIds({ fullNav: false, activeLens: "cockpit" })).toEqual(["dsh", "ledger", "cockpit"])
  })

  it("판정은 사이드바와 같은 hasFullAdminNav 다 — SUPER_ADMIN 역할 또는 nav_preset super", () => {
    const tabs = (role: string, preset: string | null) =>
      visibleLensTabIds({ fullNav: hasFullAdminNav({ role, preset }), activeLens: "ledger" })
    expect(tabs("ADMIN", null)).toEqual(["dsh", "ledger"])
    expect(tabs("ADMIN", "sales")).toEqual(["dsh", "ledger"])
    expect(tabs("ADMIN", "super")).toHaveLength(4)
    expect(tabs("SUPER_ADMIN", null)).toHaveLength(4)
  })

  it("선택돼 보일 탭 — rev 와 모르는 값은 장부", () => {
    expect(lensTabOf("rev")).toBe("ledger")
    expect(lensTabOf("ledger")).toBe("ledger")
    expect(lensTabOf("dsh")).toBe("dsh")
    expect(lensTabOf("board")).toBe("board")
    expect(lensTabOf("cockpit")).toBe("cockpit")
    expect(lensTabOf("kpi")).toBe("ledger")
  })
})

describe("장부 보기 — 건별 · 기관별 · 매니저별", () => {
  it("건별이 맨 앞이고 기본이다", () => {
    expect(LEDGER_TABLE_VIEWS.map((view) => [view.id, view.label])).toEqual([
      ["deals", "건별"],
      ["accounts", "기관별"],
      ["managers", "매니저별"],
    ])
    expect(ledgerTableViewFromParam(null)).toBe("deals")
    expect(ledgerTableViewFromParam("")).toBe("deals")
    expect(ledgerTableViewFromParam("nope")).toBe("deals")
  })

  it("URL view 값을 그대로 읽는다", () => {
    expect(ledgerTableViewFromParam("accounts")).toBe("accounts")
    expect(ledgerTableViewFromParam("managers")).toBe("managers")
    expect(ledgerTableViewFromParam("deals")).toBe("deals")
  })
})
