import { describe, it, expect } from "vitest"
import { parseRangeLastRow, isRangeLikelyTruncated } from "@/lib/branch/sync/range-truncation"

describe("parseRangeLastRow", () => {
  it("extracts the trailing row number from an A1-notation range", () => {
    expect(parseRangeLastRow("'2. REV'!A1:CF1000")).toBe(1000)
    expect(parseRangeLastRow("'1. DSH'!A1:W300")).toBe(300)
  })
  it("returns null for a range string it can't parse", () => {
    expect(parseRangeLastRow("not a range")).toBeNull()
    expect(parseRangeLastRow("'2. REV'!A1")).toBeNull()
  })
})

describe("isRangeLikelyTruncated", () => {
  it("flags truncation when the read grid reaches the range's last row", () => {
    expect(isRangeLikelyTruncated(1000, "'2. REV'!A1:CF1000")).toBe(true)
  })
  it("flags truncation when the grid exceeds the last row (defensive — shouldn't normally happen)", () => {
    expect(isRangeLikelyTruncated(1001, "'2. REV'!A1:CF1000")).toBe(true)
  })
  it("does not flag truncation when the grid is comfortably short of the range", () => {
    expect(isRangeLikelyTruncated(446, "'2. REV'!A1:CF1000")).toBe(false)
  })
  it("does not flag truncation when the range string can't be parsed", () => {
    expect(isRangeLikelyTruncated(1000, "garbage")).toBe(false)
  })
  // 실측 회귀: 옛 상한(A1:CF400)에서 '2. REV' 그리드 446행 중 398행에 고객명이 있었다 —
  // 400행 상한에 도달해 하단 데이터가 잘렸었다. 새 상한(CF1000)에서는 같은 행 수로는
  // 절단 신호가 뜨지 않아야 한다.
  it("regression: 446-row sheet no longer trips the truncation guard under the new CF1000 range", () => {
    expect(isRangeLikelyTruncated(446, "'2. REV'!A1:CF400")).toBe(true) // old range: would have warned
    expect(isRangeLikelyTruncated(446, "'2. REV'!A1:CF1000")).toBe(false) // new range: comfortable headroom
  })
})
