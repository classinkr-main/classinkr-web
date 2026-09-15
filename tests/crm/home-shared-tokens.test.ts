import { describe, expect, it } from "vitest"

import {
  INTERACTIVE_TEXT_CLASS,
  MOBILE_TOUCH_TARGET_CLASS,
  SECONDARY_TEXT_CLASS,
} from "@/components/admin/crm/home/shared"

describe("home/shared 대비·터치 타깃 토큰", () => {
  it("pins the contrast tokens from the UX 규약", () => {
    expect(SECONDARY_TEXT_CLASS).toBe("text-[#615D59]")
    expect(INTERACTIVE_TEXT_CLASS).toBe("text-[#31302E]")
  })

  it("mobile touch target grows buttons/links to 44px and resets at sm", () => {
    expect(MOBILE_TOUCH_TARGET_CLASS).toBe(
      "[&_button]:min-h-11 [&_a]:min-h-11 sm:[&_button]:min-h-0 sm:[&_a]:min-h-0"
    )
  })
})
