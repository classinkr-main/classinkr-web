import { describe, it, expect } from "vitest"
import { coverageTone, COVERAGE_TONE_CLASS } from "@/lib/crm/coverage"

describe("coverageTone", () => {
  it("70% 이상은 ok(green)", () => {
    expect(coverageTone(70)).toBe("ok")
    expect(coverageTone(100)).toBe("ok")
  })
  it("40~69%는 warn(amber)", () => {
    expect(coverageTone(40)).toBe("warn")
    expect(coverageTone(69)).toBe("warn")
  })
  it("40% 미만은 risk(terracotta)", () => {
    expect(coverageTone(0)).toBe("risk")
    expect(coverageTone(39)).toBe("risk")
  })
  it("톤별 클래스가 우리 팔레트 리터럴과 일치", () => {
    expect(COVERAGE_TONE_CLASS.ok).toContain("#084734")
    expect(COVERAGE_TONE_CLASS.warn).toContain("#8D6C1F")
    expect(COVERAGE_TONE_CLASS.risk).toContain("#B85C33")
  })
})
