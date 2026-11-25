// 별칭 표의 정규 이름 · "별칭 표에 없는 이름" 판정 — lib/branch/member-names.ts(대조 5절이 쓴다)
import { describe, expect, it } from "vitest"

import { BRANCH_MEMBER_CANONICAL_NAMES, isKnownBranchMember, normalizeBranchMemberName } from "@/lib/branch/member-names"

describe("BRANCH_MEMBER_CANONICAL_NAMES · isKnownBranchMember", () => {
  it("정규 이름은 중복 없이 별칭 표의 값 전부", () => {
    expect(new Set(BRANCH_MEMBER_CANONICAL_NAMES).size).toBe(BRANCH_MEMBER_CANONICAL_NAMES.length)
    expect([...BRANCH_MEMBER_CANONICAL_NAMES].sort()).toEqual(
      ["Chanwoo", "Gyusung", "Han", "Heesung", "Junhyuk", "Minjae", "Somang", "Wangchan"].sort(),
    )
    for (const name of BRANCH_MEMBER_CANONICAL_NAMES) expect(normalizeBranchMemberName(name.toLowerCase())).toBe(name)
  })

  it("별칭·대소문자·공백을 정규화한 뒤 판정한다", () => {
    expect(isKnownBranchMember("New 2")).toBe(true)
    expect(isKnownBranchMember("hwang")).toBe(true)
    expect(isKnownBranchMember(" MINJAE ")).toBe(true)
    expect(isKnownBranchMember("wangchan")).toBe(true)
    expect(isKnownBranchMember("예시A")).toBe(false)
    expect(isKnownBranchMember("")).toBe(false)
    expect(isKnownBranchMember(null)).toBe(false)
  })
})
