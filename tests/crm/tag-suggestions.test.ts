import { describe, expect, it } from "vitest"

import { isDuplicateTag, normalizeTag, SUGGESTED_TAGS } from "@/lib/crm/tag-suggestions"

// §13 Q3 — 고객 360 태그 칩. normalizeTag는 서버(lib/repositories/crm-customer-tags.ts)와 같은 규칙을
// 유지해야 클라이언트 미리보기와 실제 저장값이 어긋나지 않는다.

describe("SUGGESTED_TAGS", () => {
  it("기획이 지정한 6개 제안 태그를 그대로 담는다", () => {
    expect(SUGGESTED_TAGS).toEqual(["재계약", "데모 요청", "VIP", "이탈 위험", "하드웨어", "업셀"])
  })
})

describe("normalizeTag", () => {
  it("앞뒤 공백을 trim한다", () => {
    expect(normalizeTag("  VIP  ")).toBe("VIP")
  })

  it("연속 공백을 한 칸으로 줄인다", () => {
    expect(normalizeTag("이탈   위험")).toBe("이탈 위험")
  })

  it("40자를 넘으면 자른다", () => {
    const long = "가".repeat(50)
    const result = normalizeTag(long)
    expect(result).toHaveLength(40)
    expect(result).toBe("가".repeat(40))
  })

  it("공백만 있으면 빈 문자열이 된다(호출부가 걸러야 함)", () => {
    expect(normalizeTag("   ")).toBe("")
  })
})

describe("isDuplicateTag", () => {
  it("대소문자를 무시하고 판정한다", () => {
    expect(isDuplicateTag(["VIP"], "vip")).toBe(true)
    expect(isDuplicateTag(["vip"], "VIP")).toBe(true)
  })

  it("공백 차이를 무시하고 판정한다(연속 공백 정규화 후 비교)", () => {
    expect(isDuplicateTag(["이탈 위험"], "이탈   위험")).toBe(true)
    expect(isDuplicateTag(["이탈 위험"], "  이탈 위험  ")).toBe(true)
  })

  it("다른 태그면 false", () => {
    expect(isDuplicateTag(["VIP", "재계약"], "하드웨어")).toBe(false)
  })

  it("빈 후보는 항상 false(추가 자체가 막히므로 중복으로 보고할 필요가 없다)", () => {
    expect(isDuplicateTag(["VIP"], "   ")).toBe(false)
  })

  it("빈 목록이면 항상 false", () => {
    expect(isDuplicateTag([], "VIP")).toBe(false)
  })
})
