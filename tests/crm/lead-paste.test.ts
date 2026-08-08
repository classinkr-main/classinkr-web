import { describe, expect, it } from "vitest"

import { checkPastedLeads, parsePastedLeads, pastedLeadRowIssues } from "@/lib/crm/lead-paste"

describe("parsePastedLeads — 헤더 있는 붙여넣기", () => {
  it("한글 헤더로 컬럼을 매핑한다", () => {
    const rows = parsePastedLeads(
      ["학원명\t담당자\t연락처\t이메일", "클래스인 영어학원\t김원장\t010-1111-2222\towner@example.com"].join("\n")
    )
    expect(rows).toEqual([
      { org: "클래스인 영어학원", name: "김원장", phone: "010-1111-2222", email: "owner@example.com" },
    ])
  })

  it("CSV 구분자도 인식한다", () => {
    const rows = parsePastedLeads("org,name,phone,email\nA학원,이선생,01033334444,a@b.co")
    expect(rows[0]).toMatchObject({ org: "A학원", name: "이선생", email: "a@b.co" })
  })
})

describe("parsePastedLeads — 헤더 없는 붙여넣기", () => {
  it("@는 이메일, 숫자 뭉치는 전화, 나머지는 앞에서부터 학원·이름", () => {
    const rows = parsePastedLeads("클래스인 영어학원\t김원장\t010-1111-2222\towner@example.com")
    expect(rows[0]).toEqual({
      org: "클래스인 영어학원",
      name: "김원장",
      phone: "010-1111-2222",
      email: "owner@example.com",
    })
  })

  it("첫 행이 데이터처럼 보이면 헤더로 오인하지 않는다 — 첫 리드가 사라지면 안 된다", () => {
    const rows = parsePastedLeads(
      ["테스트학원\t김원장\towner@example.com", "두번째학원\t박원장\tsecond@example.com"].join("\n")
    )
    expect(rows).toHaveLength(2)
    expect(rows[0].org).toBe("테스트학원")
  })

  it("식별자가 하나도 없는 줄은 버린다", () => {
    expect(parsePastedLeads("\n   \n")).toEqual([])
  })
})

describe("pastedLeadRowIssues", () => {
  it("전화·이메일 형식 불량을 사유로 남긴다", () => {
    expect(pastedLeadRowIssues({ org: "A", phone: "123" })).toEqual(["전화 형식"])
    expect(pastedLeadRowIssues({ org: "A", email: "not-an-email" })).toEqual(["이메일 형식"])
    expect(pastedLeadRowIssues({ org: "A", email: `${"x".repeat(250)}@b.co` })).toEqual(["이메일 형식"])
  })

  it("연락처가 비어 있으면 형식 검사를 걸지 않는다(학원명만 있는 행도 유효)", () => {
    expect(pastedLeadRowIssues({ org: "A학원" })).toEqual([])
  })
})

describe("checkPastedLeads", () => {
  it("제외 행도 사유와 함께 남겨 등록 전에 왜 줄었는지 보여준다", () => {
    // 헤더로 전화 컬럼을 지목한 경우 — 짧은 숫자가 그대로 전화로 들어와 형식 검사에 걸린다.
    const checked = checkPastedLeads(
      parsePastedLeads(["학원명\t담당자\t연락처", "A학원\t김원장\t123", "B학원\t박원장\t010-1111-2222"].join("\n"))
    )
    expect(checked).toHaveLength(2)
    expect(checked[0].issues).toEqual(["전화 형식"])
    expect(checked[1].issues).toEqual([])
  })

  it("헤더가 없으면 짧은 숫자는 전화로 보지 않는다 — 이름 칸으로 흘러 행이 통째로 버려지지 않는다", () => {
    const [row] = parsePastedLeads("A학원\t123")
    expect(row.phone).toBeUndefined()
    expect(pastedLeadRowIssues(row)).toEqual([])
  })
})
