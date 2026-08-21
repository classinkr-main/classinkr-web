import { describe, expect, it } from "vitest"
import { formatWithCommas, parseMoneyInput } from "@/components/admin/AdminMoneyInput"

// 공용 금액 입력의 순수 로직 계약. 화면(캐럿·IME)은 DOM 없이 검증할 수 없으므로
// 여기서는 "무엇을 보여주고 무엇을 커밋하는가"만 못 박는다.

describe("formatWithCommas", () => {
  it("inserts thousand separators every three digits", () => {
    expect(formatWithCommas("12000000")).toBe("12,000,000")
    expect(formatWithCommas("1234567")).toBe("1,234,567")
    expect(formatWithCommas("999")).toBe("999")
    expect(formatWithCommas("1000")).toBe("1,000")
  })

  it("round-trips with parseMoneyInput — 콤마를 넣었다 빼도 같은 수", () => {
    for (const raw of ["0", "7", "1000", "1234567", "90071992547409"]) {
      const formatted = formatWithCommas(raw)
      expect(parseMoneyInput(formatted)).toBe(Number(raw))
      // 이미 포맷된 문자열을 다시 넣어도 콤마가 겹치지 않는다.
      expect(formatWithCommas(formatted)).toBe(formatted)
    }
  })

  it("strips leading zeros but keeps a lone zero", () => {
    expect(formatWithCommas("007")).toBe("7")
    expect(formatWithCommas("0")).toBe("0")
    expect(formatWithCommas("000")).toBe("0")
    expect(formatWithCommas("012000")).toBe("12,000")
  })

  it("returns an empty string for empty/non-numeric input so placeholder shows", () => {
    expect(formatWithCommas("")).toBe("")
    expect(formatWithCommas("   ")).toBe("")
    expect(formatWithCommas("ㅁㄴㅇㄹ")).toBe("")
  })

  it("drops 한글/문자 mixed into the digits", () => {
    expect(formatWithCommas("12만000")).toBe("12,000")
    expect(formatWithCommas("₩ 1,200,000원")).toBe("1,200,000")
    expect(formatWithCommas("abc500def")).toBe("500")
  })

  it("truncates the decimal part instead of concatenating it (12.5 는 125 가 아니다)", () => {
    expect(formatWithCommas("12.5")).toBe("12")
    expect(formatWithCommas("1234.99")).toBe("1,234")
  })
})

describe("parseMoneyInput", () => {
  it("returns null for empty input — 미입력은 0 이 아니다", () => {
    expect(parseMoneyInput("")).toBeNull()
    expect(parseMoneyInput("   ")).toBeNull()
  })

  it("returns null when nothing numeric survives", () => {
    expect(parseMoneyInput("없음")).toBeNull()
    expect(parseMoneyInput("abc")).toBeNull()
  })

  it("parses formatted and unformatted digits identically", () => {
    expect(parseMoneyInput("12,000,000")).toBe(12_000_000)
    expect(parseMoneyInput("12000000")).toBe(12_000_000)
    expect(parseMoneyInput("₩12,000,000")).toBe(12_000_000)
  })

  it("keeps 0 distinct from null — 측정된 0 은 보존한다", () => {
    expect(parseMoneyInput("0")).toBe(0)
    expect(parseMoneyInput("000")).toBe(0)
  })

  it("floors decimals (원화는 정수 도메인)", () => {
    expect(parseMoneyInput("1234.9")).toBe(1234)
    expect(parseMoneyInput("0.9")).toBe(0)
    // 정수부가 없으면 금액으로 보지 않는다.
    expect(parseMoneyInput(".5")).toBeNull()
  })

  it("clamps negatives to 0 rather than flipping the sign", () => {
    // 정책: 음수는 금액 도메인에 없다 → 0. 부호만 지우면 -5000 이 5000 으로 조용히 뒤집힌다.
    expect(parseMoneyInput("-5000")).toBe(0)
    expect(parseMoneyInput("−5000")).toBe(0)
    expect(parseMoneyInput("-")).toBe(0)
  })

  it("clamps very large numbers to MAX_SAFE_INTEGER", () => {
    expect(parseMoneyInput("999999999999999999999")).toBe(Number.MAX_SAFE_INTEGER)
    expect(parseMoneyInput(String(Number.MAX_SAFE_INTEGER))).toBe(Number.MAX_SAFE_INTEGER)
  })

  it("strips 한글 mixed with digits instead of returning NaN", () => {
    expect(parseMoneyInput("12만")).toBe(12)
    expect(parseMoneyInput("1,200원")).toBe(1200)
  })
})
