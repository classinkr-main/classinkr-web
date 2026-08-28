import { describe, expect, it } from "vitest"

import {
  BUDGET_INVALID_MESSAGE,
  clampCount,
  clampMoney,
  parseBudgetInput,
} from "@/lib/marketing/input-normalize"

describe("clampCount", () => {
  it("빈값·공백은 null(미입력) — 0 과 구분한다", () => {
    expect(clampCount("")).toBeNull()
    expect(clampCount("   ")).toBeNull()
    expect(clampCount(null)).toBeNull()
    expect(clampCount(undefined)).toBeNull()
  })

  it("0 은 0 으로 보존한다(미입력으로 접히지 않는다)", () => {
    expect(clampCount("0")).toBe(0)
    expect(clampCount(0)).toBe(0)
  })

  it("음수는 0 으로 클램프", () => {
    expect(clampCount("-1")).toBe(0)
    expect(clampCount(-1200)).toBe(0)
    expect(clampCount("-0.5")).toBe(0)
  })

  it("소수는 floor", () => {
    expect(clampCount("3.9")).toBe(3)
    expect(clampCount(3.1)).toBe(3)
  })

  it("비수치는 null", () => {
    expect(clampCount("abc")).toBeNull()
    expect(clampCount("1,000")).toBeNull()
    expect(clampCount(Number.NaN)).toBeNull()
    expect(clampCount(Number.POSITIVE_INFINITY)).toBeNull()
  })

  it("정상 정수는 그대로", () => {
    expect(clampCount("1200")).toBe(1200)
  })
})

describe("clampMoney", () => {
  it("clampCount 와 같은 규칙(음수→0, 소수→floor, 빈값→null, 0 보존)", () => {
    expect(clampMoney("")).toBeNull()
    expect(clampMoney("0")).toBe(0)
    expect(clampMoney("-5000")).toBe(0)
    expect(clampMoney("1999.9")).toBe(1999)
    expect(clampMoney("원")).toBeNull()
  })
})

describe("parseBudgetInput", () => {
  it("빈값은 null(예산 미설정)", () => {
    expect(parseBudgetInput("")).toBeNull()
    expect(parseBudgetInput("  ")).toBeNull()
  })

  it("0 과 양수는 정수로 통과", () => {
    expect(parseBudgetInput("0")).toBe(0)
    expect(parseBudgetInput("3000000")).toBe(3000000)
    expect(parseBudgetInput("1500.7")).toBe(1500)
  })

  it("음수는 조용히 null 로 버리지 않고 invalid 로 표면화", () => {
    expect(parseBudgetInput("-1")).toBe("invalid")
    expect(parseBudgetInput("-0.5")).toBe("invalid")
  })

  it("비수치도 invalid", () => {
    expect(parseBudgetInput("abc")).toBe("invalid")
    expect(parseBudgetInput("1,000")).toBe("invalid")
  })

  it("에러 문구는 드로어 두 곳이 공유하는 상수", () => {
    expect(BUDGET_INVALID_MESSAGE).toContain("0 이상")
  })
})
