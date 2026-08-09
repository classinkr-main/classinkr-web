import { describe, expect, it } from "vitest"

import { deriveLeadCategory, deriveLeadLabels } from "@/lib/crm/lead-labels"

// 실측 리드(2026-08-09, 122건)에서 뽑은 대표 케이스로 고정한다.
describe("deriveLeadLabels — 과목", () => {
  it("상호명에서 과목을 추론한다", () => {
    expect(deriveLeadLabels({ org: "정용휘국어독해학원", name: null, branch: null, message: null }).subjectLabel).toBe(
      "국어"
    )
    expect(deriveLeadLabels({ org: "피엠피수학", name: null, branch: null, message: null }).subjectLabel).toBe("수학")
    expect(deriveLeadLabels({ org: "신디쌤english", name: null, branch: null, message: null }).subjectLabel).toBe(
      "영어"
    )
    expect(deriveLeadLabels({ org: "늘품한자", name: null, branch: null, message: null }).subjectLabel).toBe(
      "한자·한문"
    )
    expect(deriveLeadLabels({ org: "지케이보컬", name: null, branch: null, message: null }).subjectLabel).toBe(
      "예체능"
    )
  })

  it("복수 과목 상호는 종합으로 접는다", () => {
    expect(deriveLeadLabels({ org: "입시톡국어영어학원", name: null, branch: null, message: null }).subjectLabel).toBe(
      "종합·보습"
    )
  })

  it("브랜드 사전 — GnB는 영어", () => {
    expect(
      deriveLeadLabels({ org: "진솔지앤비외국어학원", name: null, branch: null, message: null }).subjectLabel
    ).toBe("영어")
  })

  it("모호하면 null — 틀린 라벨을 붙이지 않는다", () => {
    expect(deriveLeadLabels({ org: "오름", name: null, branch: null, message: null }).subject).toBeNull()
    expect(deriveLeadLabels({ org: "미정", name: null, branch: null, message: null }).subject).toBeNull()
  })

  it("폼 응답의 과목 키가 상호 추론보다 우선한다", () => {
    const message =
      "Meta Lead Ads\nleadgen_id=1\nfields=full_name: 김원장 / 과목: 수학 / company_name: 오름학원"
    expect(deriveLeadLabels({ org: "오름학원", name: "김원장", branch: null, message }).subjectLabel).toBe("수학")
  })
})

describe("deriveLeadCategory — 유형", () => {
  it("학원·학교·기업·개인을 가른다", () => {
    expect(deriveLeadCategory({ org: "강남수학전문학원", name: null })).toBe("academy")
    expect(deriveLeadCategory({ org: "전주비전대학교", name: null })).toBe("school_univ")
    expect(deriveLeadCategory({ org: "세마스포츠마케팅", name: null })).toBe("company")
    expect(deriveLeadCategory({ org: "프리랜서", name: null })).toBe("individual")
  })

  it("비교육 자영업은 교육 외로 — 신규 응대 자리를 차지하지 않게", () => {
    expect(deriveLeadCategory({ org: "교토말차와 커피", name: null })).toBe("non_education")
    expect(deriveLeadCategory({ org: "Vietbeautyspa", name: null })).toBe("non_education")
  })

  it("정크 org는 추측하지 않되, 이름의 강사 신호는 살린다", () => {
    expect(deriveLeadCategory({ org: "미정", name: "이수진" })).toBeNull()
    expect(deriveLeadCategory({ org: "학원", name: null })).toBeNull()
    expect(deriveLeadCategory({ org: "미정", name: "김원용쌤" })).toBe("individual")
  })

  it("교육 힌트가 있으면 교육 외로 넘기지 않는다 — 필라테스 학원은 학원", () => {
    expect(deriveLeadCategory({ org: "국제필라테스학원", name: null })).toBe("academy")
  })
})

describe("deriveLeadLabels — 지역", () => {
  it("branch의 시군구를 시도로 표준화한다", () => {
    expect(deriveLeadLabels({ org: null, name: null, branch: "전주시", message: null }).region).toBe("전북")
    expect(deriveLeadLabels({ org: null, name: null, branch: "포천", message: null }).region).toBe("경기")
  })
})
