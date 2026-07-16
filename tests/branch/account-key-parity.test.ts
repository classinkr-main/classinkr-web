// 이 픽스처는 supabase/migrations/20260703_normalized_account_key.sql 의 DO 블록과 쌍 —
// 한쪽 수정 시 양쪽 동시 갱신.
import { describe, expect, it } from "vitest"
import { normalizedAccountKey } from "@/lib/branch/account-key"

describe("normalizedAccountKey", () => {
  it("normalizes fullwidth/halfwidth characters (NFKC)", () => {
    expect(normalizedAccountKey("ＡＢＣ　학원")).toBe("abc학원")
  })

  it("lowercases", () => {
    expect(normalizedAccountKey("ClassIn Academy")).toBe("classinacademy")
  })

  it("strips whitespace and all delimiter characters", () => {
    expect(normalizedAccountKey("a b(c)[d]{e}f.g_h-i|j/k")).toBe("abcdefghijk")
  })

  it("strips spaces between Korean words", () => {
    expect(normalizedAccountKey("목동 클래스인 어학원")).toBe(
      "목동클래스인어학원",
    )
  })

  it("returns empty string for empty/null/undefined", () => {
    expect(normalizedAccountKey("")).toBe("")
    expect(normalizedAccountKey(null)).toBe("")
    expect(normalizedAccountKey(undefined)).toBe("")
  })

  it("expands NFKC compatibility characters before delimiter stripping (㈜ -> (주) -> 주)", () => {
    expect(normalizedAccountKey("㈜클래스인")).toBe("주클래스인")
  })
})
