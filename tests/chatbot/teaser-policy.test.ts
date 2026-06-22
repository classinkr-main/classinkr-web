import { describe, expect, it } from "vitest"

import { shouldShowTeaser, TEASER_DWELL_THRESHOLD_MS } from "@/lib/chatbot/teaser-policy"

const base = {
  dwellMs: TEASER_DWELL_THRESHOLD_MS,
  isEligible: true,
  shown: false,
  dismissed: false,
  openedBefore: false,
}

describe("shouldShowTeaser", () => {
  it("threshold is 2 minutes", () => {
    expect(TEASER_DWELL_THRESHOLD_MS).toBe(120_000)
  })

  it("shows once eligible and dwell crosses the threshold", () => {
    expect(shouldShowTeaser(base)).toBe(true)
  })

  it("does not show below the threshold", () => {
    expect(shouldShowTeaser({ ...base, dwellMs: TEASER_DWELL_THRESHOLD_MS - 1 })).toBe(false)
  })

  it("does not show on non-eligible pages", () => {
    expect(shouldShowTeaser({ ...base, isEligible: false })).toBe(false)
  })

  it("is suppressed by shown / dismissed / openedBefore", () => {
    expect(shouldShowTeaser({ ...base, shown: true })).toBe(false)
    expect(shouldShowTeaser({ ...base, dismissed: true })).toBe(false)
    expect(shouldShowTeaser({ ...base, openedBefore: true })).toBe(false)
  })
})
