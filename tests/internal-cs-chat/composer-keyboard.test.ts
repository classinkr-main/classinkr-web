import { describe, expect, it } from "vitest"

import { shouldSubmitComposerOnKeyDown } from "@/components/admin/cs-chat/composer-keyboard"

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
