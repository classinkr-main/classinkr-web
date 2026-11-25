import { describe, expect, it } from "vitest"

import { KR_TOPICS, resolveContact } from "@/lib/internal-cs-chat/contact"

// R10: 낱말 경계·판정 순서. 질문은 모두 지어낸 것이다. 기대값은 한국 담당표의 업무 영역 키이거나,
// "none" = 한국 담당표 갈래가 아니다(본사 일반·모름 포함).
const CASES: Array<[string, string]> = [
  // 미수 낱말 경계: '미수신'·'미수강'·'미수령'은 수납이 아니다
  ["학생 수업 알림 미수신 문제", "none"],
  ["수업이 미수강 처리돼요", "none"],
  ["초대 메일 미수신인데 확인 부탁", "none"],
  ["녹화 파일 미수령 상태예요", "none"],
  ["미수강 학생 목록이 비어요", "none"],
  // 진짜 수납
  ["미수금 확인 부탁드려요", "payment"],
  ["미수 잔액이 얼마인가요", "payment"],
  ["입금 확인해 주세요", "payment"],
  ["결제 내역 반영이 안 됐어요", "payment"],
  ["수납 처리 담당이 누구죠", "payment"],
  // 홈페이지 어드민 계정은 어드민 권한 문의
  ["홈페이지 어드민 계정 만들어줘", "admin_access"],
  ["사이트 어드민 로그인이 안 돼요", "admin_access"],
  ["어드민 권한 요청드립니다", "admin_access"],
  ["CRM 관리자 계정 발급", "admin_access"],
  ["홈페이지 어드민 권한 회수해 주세요", "admin_access"],
  // 홈페이지 오류는 그대로
  ["홈페이지 문의 폼이 안 열려요", "website_error"],
  ["웹사이트 접속이 느려요", "website_error"],
  ["랜딩 페이지 오류가 나요", "website_error"],
  ["사이트 오류 화면이 떠요", "website_error"],
  // 우리 사이트가 아닌 홈페이지/관리자
  ["학교 홈페이지에 넣은 링크가 안 열려요", "none"],
  ["학원 홈페이지에서 입장 버튼이 안 보여요", "none"],
  ["기관 관리자 권한으로 수업 생성이 안돼요", "none"],
  // 다른 갈래는 그대로
  ["견적서 문자로 보내려는데 SMS 문의", "quote"],
  ["세금계산서 발행 요청", "tax_invoice"],
  ["출고 일정 알려줘", "hw_shipping"],
  ["계약 갱신 문의", "contract"],
  ["마케팅 캠페인 리드 유입 지표", "marketing"],
  ["쇼룸 예약하고 싶어요", "showroom"],
  ["광고 차단 프로그램 때문에 입장이 안 돼요", "none"],
  ["계약 기간 끝났는데 로그인이 막혔어요", "none"],
]

describe("resolveContact 판정 표(R10)", () => {
  it("30문장", () => expect(CASES).toHaveLength(30))

  it.each(CASES)("%s -> %s", async (question, expected) => {
    const card = await resolveContact(question, { listStaff: async () => [] })
    if (expected === "none") {
      expect(card.kind).not.toBe("kr")
      return
    }
    const topic = KR_TOPICS.find((item) => item.key === expected)!
    expect(card.kind).toBe("kr")
    expect(card.reason).toBe(`한국 지사 업무: ${topic.area}`)
  })
})
