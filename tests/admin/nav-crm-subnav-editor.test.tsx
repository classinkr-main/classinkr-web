import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import {
  CRM_SUBNAV_PREFERENCE_ITEMS,
  crmSubnavKey,
  type NavOverrides,
} from "@/components/admin/admin-nav-access"
import NavPreferenceEditor, {
  countNavPreferenceExceptions,
} from "@/components/admin/settings/NavPreferenceEditor"

// 편집기 "CRM 하위 탭" 섹션(2026-09-25) — 두 드로어(본인·회원 관리)가 같은 본문을 쓴다.
// jsdom 이 없어 정적 마크업으로 행·배지·미리보기 줄만 확인한다.
// 기본은 전체 사이드바 계정(SUPER_ADMIN) — CRM 하위 탭 섹션은 계정과 무관하지만 도달성 안내 문구가
// 전체/간소(2026-11-20)에 따라 갈린다.
function render(overrides: NavOverrides, account: { role: string; preset?: string | null } = { role: "SUPER_ADMIN" }) {
  // 인접 텍스트 사이 주석 마커(<!-- -->)는 React 버전마다 달라 떼고 비교한다.
  return renderToStaticMarkup(
    <NavPreferenceEditor
      role={account.role}
      preset={account.preset}
      overrides={overrides}
      onChange={vi.fn()}
      subject="self"
    />
  ).replace(/<!-- -->/g, "")
}

describe("NavPreferenceEditor — CRM 하위 탭 섹션", () => {
  it("레지스트리 탭마다 표시|숨김 2단 그룹을 그리고 진입 탭은 행이 없다", () => {
    const html = render({})
    expect(html).toContain("CRM 하위 탭")
    for (const item of CRM_SUBNAV_PREFERENCE_ITEMS) {
      expect(html, item.displayLabel).toContain(`aria-label="${item.displayLabel} 표시"`)
    }
    expect(html).not.toContain('aria-label="현황 표시"')
    expect(html).not.toContain('aria-label="고객DB › 통합 표시"')
    expect(html).not.toContain('aria-label="검수 표시"')
  })

  it("기본값이면 기본 숨김 3개가 미리보기의 'CRM 숨긴 탭 3'에 모인다", () => {
    const html = render({})
    expect(html).toContain("CRM 숨긴 탭 3 — 기록 · 입력함 · 고객DB › 태그")
  })

  it("되살린 탭은 예외로 세고 미리보기에서 빠진다", () => {
    const overrides: NavOverrides = { [crmSubnavKey("/admin/crm/activity")]: "shown" }
    const html = render(overrides)
    expect(html).toContain("CRM 숨긴 탭 2 — 입력함 · 고객DB › 태그")
    expect(countNavPreferenceExceptions({ role: "SUPER_ADMIN", overrides })).toBe(1)
  })

  it("차단 문구 없이 도달성 안내를 유지한다", () => {
    const html = render({})
    expect(html).not.toContain("차단")
    expect(html).toContain("숨긴 탭도 ⌘K와 주소로 그대로 열립니다.")
    expect(html).not.toContain("간소 사이드바 계정입니다")
  })
})

describe("NavPreferenceEditor — 전체 / 간소 사이드바(2026-11-20)", () => {
  const optionPressed = (html: string, label: string, option: string) => {
    const group = html.match(new RegExp(`aria-label="${label} 자리"[^>]*>([\\s\\S]*?)</div>`))?.[1] ?? ""
    const button = [...group.matchAll(/<button\b[^>]*>[^<]*<\/button>/g)].map((m) => m[0]).find((b) => b.includes(`>${option}<`))
    return button ? { pressed: button.includes('aria-pressed="true"'), disabled: /\sdisabled=""/.test(button) } : null
  }

  it("간소 계정 — 장부·견적·하드웨어만 상시이고 나머지는 기본 숨김, 미리보기가 실제 사이드바와 같다", () => {
    const html = render({}, { role: "ADMIN" })
    expect(html).toContain("간소 사이드바 계정입니다. 기본으로 매출 장부 · 견적·문서 · 하드웨어 재고만 보이고")
    expect(html).toContain(">상시 3</span>")
    expect(html).toContain("매출 장부 · 견적·문서 · 하드웨어 재고</span>")
    expect(html).toContain("숨김 13 — Overview")
    expect(html).not.toContain("▸ 기타")
    expect(optionPressed(html, "매출 장부", "상시")).toEqual({ pressed: true, disabled: false })
    expect(optionPressed(html, "Overview", "숨김")).toEqual({ pressed: true, disabled: false })
    expect(optionPressed(html, "CRM", "숨김")).toEqual({ pressed: true, disabled: false })
    // 기본값 그대로라 예외는 0이다.
    expect(countNavPreferenceExceptions({ role: "ADMIN", overrides: {} })).toBe(0)
    expect(html).not.toContain(">예외<")
  })

  it("간소 계정 — 숨김 불가는 매출 장부(착지)이고 Overview 는 숨길 수 있다", () => {
    const html = render({}, { role: "ADMIN" })
    expect(optionPressed(html, "매출 장부", "숨김")).toEqual({ pressed: false, disabled: true })
    expect(html.match(/로그인 첫 화면이라 숨길 수 없습니다/g)?.length).toBeGreaterThan(0)
  })

  it("간소 계정의 안내는 ⌘K 로 열린다고 말하지 않는다", () => {
    const html = render({}, { role: "ADMIN" })
    expect(html).toContain("숨긴 탭은 ⌘K 목록에서도 빠지지만 주소로는 그대로 열립니다.")
    expect(html).not.toContain("숨긴 탭도 ⌘K와 주소로 그대로 열립니다.")
    expect(html).not.toContain("차단")
  })

  it('지정 계정(nav_preset "super")은 전체 계정과 같은 편집기를 본다', () => {
    expect(render({}, { role: "ADMIN", preset: "super" })).toBe(render({}, { role: "SUPER_ADMIN" }))
    expect(optionPressed(render({}, { role: "ADMIN", preset: "super" }), "Overview", "숨김")).toEqual({
      pressed: false,
      disabled: true,
    })
  })

  it("레거시 프리셋(sales)은 간소 계정과 같은 편집기를 본다", () => {
    expect(render({}, { role: "ADMIN", preset: "sales" })).toBe(render({}, { role: "ADMIN" }))
  })
})
