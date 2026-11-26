import { describe, expect, it } from "vitest"

import {
  checkFinalAnswer,
  checkInternalCsAnswer,
  extractCustomerDraftBlock,
  extractInstitutionNames,
  hasBlockingWarning,
  warningCodes,
} from "@/lib/internal-cs-chat/answer-checks"

// 기관 이름은 지어낸 값이다. 코드는 이름 목록을 갖지 않고, 호출부가 근거에서 뽑아 넘긴다.
const OTHER = "테스트기관Z"

function codes(answer: string, options = {}) {
  return warningCodes(checkInternalCsAnswer(answer, options))
}

describe("checkInternalCsAnswer", () => {
  it("flags amounts in won, yuan, man-won, currency symbols and percent next to pricing words", () => {
    expect(codes("월 33,000원입니다.")).toContain("amount")
    expect(codes("연 3만 원 수준입니다.")).toContain("amount")
    expect(codes("가격은 ¥199 입니다.")).toContain("amount")
    expect(codes("120위안을 청구합니다.")).toContain("amount")
    expect(codes("최대 30% 할인이 가능합니다.")).toContain("amount")
    expect(codes("배터리 잔량이 80%입니다.")).not.toContain("amount")
  })

  it("flags free-trial, refund and compensation promises but not neutral mentions", () => {
    expect(codes("2주 무료 체험을 제공해 드립니다.")).toContain("free_trial")
    expect(codes("사유와 무관하게 전액 환불 해드립니다.")).toContain("refund_promise")
    expect(codes("3영업일 안에 환불 처리해 드리겠습니다.")).toContain("refund_promise")
    expect(codes("불편에 대해 보상 해드리겠습니다.")).toContain("compensation_promise")
    expect(codes("이용 기간을 연장해 드리겠습니다.")).toContain("compensation_promise")
    expect(codes("환불 가능 여부는 계약 확인 후 안내드립니다.")).not.toContain("refund_promise")
    expect(codes("녹화 메뉴는 설정에서 확인합니다.")).toEqual([])
  })

  it("flags cost and supply price figures", () => {
    expect(codes("문자 원가는 건당 80원입니다.")).toEqual(expect.arrayContaining(["cost_price", "amount"]))
    expect(codes("공급가와 마진을 정리했습니다.")).toContain("cost_price")
  })

  it("flags another customer's institution name only when the caller supplies it, and spares the current customer", () => {
    expect(codes(`${OTHER} 사례처럼 처리하면 됩니다.`)).toEqual([])
    expect(codes(`${OTHER} 사례처럼 처리하면 됩니다.`, { otherCustomerNames: [OTHER] })).toContain("other_customer")
    expect(
      codes(`${OTHER} 문의입니다.`, { otherCustomerNames: [OTHER], allowedNames: [OTHER] })
    ).toEqual([])
    // 공백 차이는 같은 이름으로 본다.
    expect(codes("테스트 기관Z 사례", { otherCustomerNames: [OTHER] })).toContain("other_customer")
  })

  it("flags case ids and account identifiers without echoing them in the excerpt", () => {
    const warnings = checkInternalCsAnswer("UID 12345678 계정과 케이스 ID: AB12CD34, 11111111-2222-3333-4444-555555555555 를 봤습니다.")
    expect(warningCodes(warnings)).toEqual(expect.arrayContaining(["account_id", "case_id"]))
    for (const warning of warnings.filter((item) => ["account_id", "case_id"].includes(item.code))) {
      expect(warning.excerpt).toBe("")
    }
    expect(JSON.stringify(warnings)).not.toContain("12345678")
    expect(JSON.stringify(warnings)).not.toContain("AB12CD34")
  })

  it("masks personal data inside the excerpt of other warnings", () => {
    const [warning] = checkInternalCsAnswer("010-1234-5678 로 연락해 월 33,000원 청구")
    expect(warning.excerpt).toContain("[phone]")
    expect(warning.excerpt).not.toContain("010-1234-5678")
  })

  it("returns an empty list for empty text and marks high-severity findings as blocking", () => {
    expect(checkInternalCsAnswer("")).toEqual([])
    expect(checkInternalCsAnswer(null)).toEqual([])
    expect(hasBlockingWarning(checkInternalCsAnswer("월 3,000원"))).toBe(false)
    expect(hasBlockingWarning(checkInternalCsAnswer("전액 환불 해드립니다"))).toBe(true)
  })
})

describe("answer text helpers", () => {
  it("extracts the customer draft block up to the next heading of the same level", () => {
    const answer = [
      "## 바로 답변",
      "내부 분석입니다.",
      "## 고객 전달 초안(검토 전)",
      "안녕하세요, 확인 후 안내드리겠습니다.",
      "",
      "### 참고",
      "하위 제목은 블록 안입니다.",
      "## 확인 필요",
      "본사 확인",
    ].join("\n")
    expect(extractCustomerDraftBlock(answer)).toBe(
      "안녕하세요, 확인 후 안내드리겠습니다.\n\n### 참고\n하위 제목은 블록 안입니다."
    )
    expect(extractCustomerDraftBlock("## 바로 답변\n내용")).toBeNull()
    expect(extractCustomerDraftBlock(null)).toBeNull()
  })

  it("reads institution names from the consultation evidence context lines", () => {
    const context = [
      "[과거 상담 사례]",
      "1. 내용",
      "   맥락: 태그 환불, 결제 / 기관 테스트기관Z / 유사도 0.82",
      "2. 내용",
      "   맥락: 기관 테스트기관Y / 유사도 0.70",
      "3. 내용",
      "   맥락: 유사도 0.60",
    ].join("\n")
    expect(extractInstitutionNames(context)).toEqual(["테스트기관Z", "테스트기관Y"])
    expect(extractInstitutionNames("")).toEqual([])
  })
})

// 검토(안전-4): 흔한 환불·보상·무료·금액 약속 꼴이 그물을 빠져나갔다. 고정 사례로 막는다.
describe("checkInternalCsAnswer — common promise phrasings", () => {
  it.each([
    ["환불을 진행해 드리겠습니다.", "refund_promise"],
    ["결제하신 금액은 전부 돌려드리겠습니다.", "refund_promise"],
    ["이번 달 이용료는 청구하지 않겠습니다.", "refund_promise"],
    ["환 불 해 드 립 니 다", "refund_promise"],
    ["한 달 더 쓰실 수 있도록 해 드릴게요.", "compensation_promise"],
    ["보상으로 이용권을 드리겠습니다", "compensation_promise"],
    ["무료로 체험하실 수 있습니다.", "free_trial"],
    ["공짜로 설치해 드립니다.", "free_trial"],
    ["오십만 원으로 맞춰 드릴게요.", "amount"],
    ["１０％ 할인해 드립니다.", "amount"],
    ["UID 1234 5678 계정에서", "account_id"],
    ["계정번호 12345678", "account_id"],
  ])("flags %j as %s", (text, code) => {
    expect(warningCodes(checkInternalCsAnswer(text))).toContain(code)
  })

  it("keeps neutral guidance clean", () => {
    expect(checkInternalCsAnswer("앱을 다시 설치한 뒤 수업에 입장해 주세요. 확인 후 다시 안내드리겠습니다.")).toEqual([])
  })
})

// 검토(안전-3): 승인 직전 최종본 검사. 내부 표시는 확인으로 넘길 수 없고, high 경고는 확인을 받아야 한다.
describe("checkFinalAnswer", () => {
  it("finds internal markers left in the final answer", () => {
    const result = checkFinalAnswer("## 내부 분석\n[선례] 같은 증상\nchannel: 상담")
    expect(result.internalMarkers.length).toBe(3)
  })

  it("returns only high-severity warnings", () => {
    const result = checkFinalAnswer("50만원입니다. 전액 환불해 드리겠습니다.")
    expect(result.internalMarkers).toEqual([])
    // 금액(medium)은 빠지고 환불 약속(high)만 남는다.
    expect(result.warnings.length).toBeGreaterThan(0)
    expect(new Set(result.warnings.map((warning) => warning.code))).toEqual(new Set(["refund_promise"]))
    expect(result.warnings.every((warning) => warning.severity === "high")).toBe(true)
    expect(checkFinalAnswer("확인 후 다시 안내드리겠습니다.")).toEqual({ internalMarkers: [], warnings: [] })
  })
})
