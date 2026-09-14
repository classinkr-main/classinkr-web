// 입력 표 조작 개선(2026-09-14) — 매트릭스 셀에서 확도를 키 한 번으로.
// 시트에서는 글자색을 바꾸는 한 동작이 장부에선 팝오버 마우스 클릭이었다.
// E=예정 · H=고확도 · C=확정. 한글 자판에서도 되도록 물리 키(code)로 판정하고,
// Ctrl/Cmd/Alt 조합(복사 Ctrl+C 등)은 가로채지 않는다.
import { describe, expect, it } from "vitest"

import { confidenceFromShortcut, CONFIDENCE_SHORTCUT_HINT } from "@/components/admin/branch/ledger/confidence-shortcuts"

const key = (code: string, extra: Partial<{ key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean; isComposing: boolean }> = {}) => ({
  code,
  key: extra.key ?? code.replace("Key", "").toLowerCase(),
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  isComposing: false,
  ...extra,
})

describe("confidenceFromShortcut", () => {
  it("maps E/H/C physical keys to expected/high-confidence/confirmed", () => {
    expect(confidenceFromShortcut(key("KeyE"))).toBe("expected")
    expect(confidenceFromShortcut(key("KeyH"))).toBe("high-confidence")
    expect(confidenceFromShortcut(key("KeyC"))).toBe("confirmed")
  })

  it("works with the Korean layout (key is a jamo, code is still the physical key)", () => {
    expect(confidenceFromShortcut(key("KeyC", { key: "ㅊ" }))).toBe("confirmed")
    expect(confidenceFromShortcut(key("KeyH", { key: "ㅗ" }))).toBe("high-confidence")
  })

  it("ignores modifier combos and IME composition so copy/paste and typing keep working", () => {
    expect(confidenceFromShortcut(key("KeyC", { ctrlKey: true }))).toBeNull()
    expect(confidenceFromShortcut(key("KeyC", { metaKey: true }))).toBeNull()
    expect(confidenceFromShortcut(key("KeyE", { altKey: true }))).toBeNull()
    expect(confidenceFromShortcut(key("KeyH", { isComposing: true }))).toBeNull()
  })

  it("ignores other keys", () => {
    expect(confidenceFromShortcut(key("KeyD"))).toBeNull()
    expect(confidenceFromShortcut(key("Digit1", { key: "1" }))).toBeNull()
  })

  it("exposes a short hint for the popover", () => {
    expect(CONFIDENCE_SHORTCUT_HINT).toBe("E 예정 · H 고확도 · C 확정")
  })
})
