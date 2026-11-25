import { describe, expect, it } from "vitest"

import { formatMoney, formatMoneyAmount, formatMoneyExact, formatPercent } from "@/lib/branch/ledger-format"
import { cny, cnyExact, yuan } from "@/lib/branch/money-format"

// F-44 — 장부 화면의 만 단위 금액은 formatMoney 하나. 부호는 ¥ 앞("-¥19.5만"), 정확한 금액은 title(formatMoneyExact).
// cny(KR Team 대시보드)는 양수 표기를 그대로 두고 음수도 같은 단위로 줄인다.

describe("formatMoney — 만 단위, 부호는 ¥ 앞", () => {
  it("1만 이상은 만 단위(천 단위 쉼표 · 소수 한 자리까지), 그 밖은 원 단위", () => {
    expect(formatMoney(12_000_000)).toBe("¥1,200만")
    expect(formatMoney(195_000)).toBe("¥19.5만")
    expect(formatMoney(920_000)).toBe("¥92만")
    expect(formatMoney(5_000)).toBe("¥5,000")
    expect(formatMoney(0)).toBe("¥0")
  })

  it("음수는 '-' 가 ¥ 앞에 온다 — '¥-19.5만' 이 아니다", () => {
    expect(formatMoney(-195_000)).toBe("-¥19.5만")
    expect(formatMoney(-30_000)).toBe("-¥3만")
    expect(formatMoney(-5_000)).toBe("-¥5,000")
    expect(formatMoney(-12_000_000)).toBe("-¥1,200만")
  })

  it("보이는 글자가 0 이면 부호를 붙이지 않고, 값이 없거나 비유한이면 ¥0", () => {
    expect(formatMoney(-0)).toBe("¥0")
    expect(formatMoney(null)).toBe("¥0")
    expect(formatMoney(undefined)).toBe("¥0")
    expect(formatMoney(Number.NaN)).toBe("¥0")
  })
})

describe("formatMoneyAmount — ¥ 없이 숫자 부분(표 칸 · ¥ 를 따로 그리는 곳)", () => {
  it("formatMoney 와 같은 몸통, 부호는 숫자 앞", () => {
    expect(formatMoneyAmount(12_000_000)).toBe("1,200만")
    expect(formatMoneyAmount(-195_000)).toBe("-19.5만")
    expect(formatMoneyAmount(4_500)).toBe("4,500")
    for (const value of [0, 1, 9_999, 10_000, 47_910_000, -30_000, -5]) {
      expect(`${value < 0 ? "-" : ""}¥${formatMoneyAmount(Math.abs(value))}`).toBe(formatMoney(value))
    }
  })

  it("plus 면 양수에 '+'(목표 대비 차이) — 음수는 '-', 0 은 부호 없음", () => {
    expect(formatMoneyAmount(30_000, { plus: true })).toBe("+3만")
    expect(formatMoneyAmount(-30_000, { plus: true })).toBe("-3만")
    expect(formatMoneyAmount(0, { plus: true })).toBe("0")
  })
})

describe("formatMoneyExact — title 용 정확한 금액", () => {
  it("원 단위 전체 자릿수, 부호는 ¥ 앞", () => {
    expect(formatMoneyExact(1_234_567)).toBe("¥1,234,567")
    expect(formatMoneyExact(-30_000)).toBe("-¥30,000")
    expect(formatMoneyExact(1_750.5)).toBe("¥1,750.5")
    expect(formatMoneyExact(0)).toBe("¥0")
    expect(formatMoneyExact(Number.NaN)).toBe("¥0")
  })
})

describe("cny — 음수도 같은 단위로 줄인다(F-44)", () => {
  it("양수 표기는 그대로(대시보드 화면 무변경)", () => {
    expect(cny(30_000)).toBe("3.0만")
    expect(cny(12_000_000)).toBe("1200.0만")
    expect(cny(150_000_000)).toBe("1.5억")
    expect(cny(null)).toBe("-")
    expect(cny(Number.POSITIVE_INFINITY)).toBe("-")
  })

  it("음수는 절댓값으로 단위를 고르고 부호를 맨 앞에 — 예전에는 '-30,000' 으로 줄이지 않았다", () => {
    expect(cny(-30_000)).toBe("-3.0만")
    expect(cny(-150_000_000)).toBe("-1.5억")
    expect(cny(-5_000)).toBe((-5_000).toLocaleString())
  })

  it("cnyExact 는 그대로", () => {
    expect(cnyExact(-30_000)).toBe("-30,000")
  })

  it("yuan 은 ¥ 를 붙이고 부호를 ¥ 앞에 — '¥-3.0만' 이 되지 않는다", () => {
    expect(yuan(30_000)).toBe("¥3.0만")
    expect(yuan(-30_000)).toBe("-¥3.0만")
    expect(yuan(-150_000_000)).toBe("-¥1.5억")
    expect(yuan(null)).toBe("-")
  })
})

describe("formatPercent", () => {
  it("소수 한 자리까지", () => {
    expect(formatPercent(40)).toBe("40%")
    expect(formatPercent(57.14)).toBe("57.1%")
  })
})
