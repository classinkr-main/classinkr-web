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
function render(overrides: NavOverrides) {
  // 인접 텍스트 사이 주석 마커(<!-- -->)는 React 버전마다 달라 떼고 비교한다.
  return renderToStaticMarkup(
    <NavPreferenceEditor role="ADMIN" overrides={overrides} onChange={vi.fn()} subject="self" />
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
    expect(countNavPreferenceExceptions({ role: "ADMIN", overrides })).toBe(1)
  })

  it("차단 문구 없이 도달성 안내를 유지한다", () => {
    const html = render({})
    expect(html).not.toContain("차단")
    expect(html).toContain("숨긴 탭도 ⌘K와 주소로 그대로 열립니다.")
  })
})
