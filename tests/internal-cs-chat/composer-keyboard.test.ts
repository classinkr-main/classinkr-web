import { describe, expect, it } from "vitest"

import {
  isEditableTarget,
  isHelpShortcut,
  isNewCaseShortcut,
  shouldSubmitComposerOnKeyDown,
} from "@/components/admin/cs-chat/composer-keyboard"

describe("shouldSubmitComposerOnKeyDown", () => {
  it("does not submit while a Korean IME composition is being confirmed", () => {
    expect(shouldSubmitComposerOnKeyDown({
      key: "Enter",
      shiftKey: false,
      isComposing: true,
      keyCode: 13,
    })).toBe(false)
  })

  it("supports browsers that report IME composition with key code 229", () => {
    expect(shouldSubmitComposerOnKeyDown({
      key: "Enter",
      shiftKey: false,
      isComposing: false,
      keyCode: 229,
    })).toBe(false)
  })

  it("submits a plain Enter but preserves Shift+Enter for a new line", () => {
    expect(shouldSubmitComposerOnKeyDown({
      key: "Enter",
      shiftKey: false,
      isComposing: false,
      keyCode: 13,
    })).toBe(true)
    expect(shouldSubmitComposerOnKeyDown({
      key: "Enter",
      shiftKey: true,
      isComposing: false,
      keyCode: 13,
    })).toBe(false)
  })
})

describe("작업면 단축키(IC-22·IC-25)", () => {
  it("Alt+Shift+N 만 새 상담이고 다른 조합키가 섞이면 아니다", () => {
    expect(isNewCaseShortcut({ altKey: true, shiftKey: true, code: "KeyN" })).toBe(true)
    expect(isNewCaseShortcut({ altKey: true, shiftKey: false, code: "KeyN" })).toBe(false)
    expect(isNewCaseShortcut({ altKey: true, shiftKey: true, ctrlKey: true, code: "KeyN" })).toBe(false)
    expect(isNewCaseShortcut({ altKey: true, shiftKey: true, code: "KeyM" })).toBe(false)
  })

  it("'?' 는 단축키 목록이고 입력 칸 안에서는 가로채지 않는다", () => {
    expect(isHelpShortcut({ key: "?", altKey: false, shiftKey: true })).toBe(true)
    expect(isHelpShortcut({ key: "/", altKey: false, shiftKey: false })).toBe(false)
    expect(isEditableTarget({ tagName: "TEXTAREA" })).toBe(true)
    expect(isEditableTarget({ tagName: "INPUT" })).toBe(true)
    expect(isEditableTarget({ tagName: "DIV", isContentEditable: true })).toBe(true)
    expect(isEditableTarget({ tagName: "BUTTON" })).toBe(false)
    expect(isEditableTarget(null)).toBe(false)
  })
})
