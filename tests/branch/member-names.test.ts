import { describe, expect, it } from "vitest"
import { branchMemberSearchHaystack, normalizeBranchMemberName } from "@/lib/branch/member-names"

// 멤버 표기 정본은 "이름"이다 — 시트가 성(Hwang)으로 적은 황찬우가 Chanwoo로 정규화되지
// 않으면 같은 사람이 화면·매칭 키에서 두 명으로 갈라진다(2026-07-27 확정 표기).
// 미러/임포트 읽기 경로(branch-dsh-kpi-mirror·sales-ledger-imports)도 이 함수를 읽기
// 시점에 태우므로, 별칭 회귀는 저장 데이터 재동기화 없이도 화면 표기를 되돌려 버린다.
describe("normalizeBranchMemberName", () => {
  it("시트 성 표기 'Hwang'을 대소문자 무관하게 이름 정본 'Chanwoo'로 정규화한다", () => {
    expect(normalizeBranchMemberName("Hwang")).toBe("Chanwoo")
    expect(normalizeBranchMemberName("hwang")).toBe("Chanwoo")
    expect(normalizeBranchMemberName(" HWANG ")).toBe("Chanwoo")
  })

  it("기존 별칭과 패스스루 동작을 유지한다", () => {
    expect(normalizeBranchMemberName("new 2")).toBe("Minjae")
    expect(normalizeBranchMemberName("Wangchan")).toBe("Wangchan")
    expect(normalizeBranchMemberName("")).toBeNull()
    expect(normalizeBranchMemberName(null)).toBeNull()
  })
})

describe("branchMemberSearchHaystack", () => {
  it("'Hwang' 원문도 Chanwoo canonical을 거쳐 한글 별칭(황찬우/찬우)까지 매칭된다", () => {
    const haystack = branchMemberSearchHaystack("Hwang")
    expect(haystack).toContain("hwang")
    expect(haystack).toContain("chanwoo")
    expect(haystack).toContain("황찬우")
    expect(haystack).toContain("찬우")
  })
})
