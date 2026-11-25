import { describe, expect, it } from "vitest"

import { formatHandoffMessage, type ChannelTalkHandoffCandidate } from "@/lib/chatbot/channel-handoff"
import {
  describeHandoffReasons,
  extractHandoffCustomerQuestion,
  isHandoffMessage,
} from "@/lib/chatbot/handoff-message"
import { SITE_URL } from "@/lib/seo"

// 내부 점검 handoff-1·2·6: 상담원이 채널톡에서 본 전환 글은 코드 값 줄이 먼저 나오고 고객 질문은 그 아래에 묻혀 있었다.
// 새 형식은 고객 질문을 맨 앞에 두고, 읽는 쪽(동기화의 첫 질문 대체값)은 옛 형식도 계속 읽는다. 예시 값은 이 시험을 위해 지었다.

const base: ChannelTalkHandoffCandidate = {
  answerEventId: "00000000-0000-4000-8000-000000000031",
  sessionId: "00000000-0000-4000-8000-000000000032",
  question: "전자칠판 견적 받을 수 있나요?",
  answer: "규모에 따라 달라서 담당자가 안내해 드려요.",
  answerMode: "handoff",
  confidence: 0.42,
  unresolved: false,
  needsHandoff: true,
  detectedCategory: "consultation",
  detectedIntent: "sales_consulting",
  handoffIntent: "demo",
  sources: [
    {
      title: "도입 상담 안내",
      urlPath: "/docs/consulting",
      category: "consultation",
      excerpt: "",
      score: 0.8,
    },
  ],
  pageUrl: `${SITE_URL}/pricing?utm_source=naver&token=secret-token`,
}

const OLD_FORMAT_MESSAGE = [
  "[챗봇 상담 전환]",
  "",
  "전환 사유: needs_handoff, question_keyword",
  "문의 유형: consultation / sales_consulting",
  "상담 목적: demo",
  "답변 모드: handoff",
  "신뢰도: 0.42",
  `페이지: ${SITE_URL}/pricing`,
  "세션: s-1",
  "답변 이벤트: e-1",
  "",
  "[고객 질문]",
  "휴대폰이요",
  "검색용 질문(직전 대화로 넓힘): 카메라가 안 켜져요 휴대폰이요",
  "",
  "[AI 답변]",
  "권한부터 확인해 주세요.",
  "",
  "[참고 문서]",
  "없음",
].join("\n")

describe("상담 전환 글 새 형식", () => {
  const message = formatHandoffMessage(
    { ...base, recentTurns: [{ role: "user", content: "학원 30명이에요" }, { role: "assistant", content: "인원을 알려 주셔서 고마워요" }] },
    ["needs_handoff", "question_keyword", "category_consultation", "intent_sales_consulting"],
    undefined,
    { contact: { email: false, phone: true } }
  )

  it("머리말에 목적과 쉬운 말 사유를 쓰고 코드 값은 싣지 않는다", () => {
    const head = message.split("\n")[0]
    expect(head).toBe(
      "[챗봇 상담 전환] 도입 상담 — 챗봇이 상담원 연결이 필요하다고 판단했어요 · 질문에 상담·견적·오류 같은 말이 들어 있어요 · 도입 상담 문의예요"
    )
    expect(head).not.toMatch(/needs_handoff|question_keyword/)
  })

  it("고객 질문 → 앞서 물은 내용 → 연락 방법 → 챗봇 답 요약 → 참고 문서 → 기술 정보 순서다", () => {
    const order = ["[고객 질문]", "[앞서 물은 내용]", "[연락 방법]", "[챗봇 답 요약]", "[참고 문서]", "[기술 정보"].map(
      (header) => message.indexOf(header)
    )
    expect(order.every((position) => position >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(message).toContain("[고객 질문]\n전자칠판 견적 받을 수 있나요?")
    expect(message).toContain("[앞서 물은 내용]\n고객: 학원 30명이에요\n챗봇: 인원을 알려 주셔서 고마워요")
    expect(message).toContain("남긴 연락처: 전화 (값은 채널톡 고객 정보에 있어요)")
  })

  it("코드 값·세션·정화한 페이지 주소는 맨 끝 기술 정보에만 있다", () => {
    const tech = message.slice(message.indexOf("[기술 정보"))
    expect(tech).toContain("전환 사유 코드: needs_handoff, question_keyword, category_consultation, intent_sales_consulting")
    expect(tech).toContain(`페이지: ${SITE_URL}/pricing?utm_source=naver\n`)
    expect(message).not.toContain("secret-token")
  })

  it("앞선 대화가 없으면 그 칸을 만들지 않고, 연락처를 모르면 확인하라고 쓴다", () => {
    const plain = formatHandoffMessage(base, ["needs_handoff"])
    expect(plain).not.toContain("[앞서 물은 내용]")
    expect(plain).toContain("남긴 연락처: 확인하지 못했어요")
    expect(formatHandoffMessage(base, ["needs_handoff"], undefined, { contact: null })).toContain("남긴 연락처: 없음")
  })

  it("모르는 사유 코드는 그대로 두고 같은 뜻은 한 번만 쓴다", () => {
    expect(describeHandoffReasons(["category_billing", "intent_billing_support", "brand_new_reason"])).toBe(
      "결제·요금 문의예요 · brand_new_reason"
    )
  })
})

describe("상담 전환 글 읽기 — 새 형식·옛 형식", () => {
  it("새 형식에서 고객 질문만 뽑는다(검색용 질문 줄·다른 칸 제외)", () => {
    const message = formatHandoffMessage(
      { ...base, question: "휴대폰이요", routingQuestion: "카메라가 안 켜져요 휴대폰이요" },
      ["needs_handoff"],
      { rating: "not_helpful", comment: "별로" }
    )
    expect(isHandoffMessage(message)).toBe(true)
    expect(extractHandoffCustomerQuestion(message)).toBe("휴대폰이요")
  })

  it("옛 형식에서도 고객 질문을 뽑는다", () => {
    expect(isHandoffMessage(OLD_FORMAT_MESSAGE)).toBe(true)
    expect(extractHandoffCustomerQuestion(OLD_FORMAT_MESSAGE)).toBe("휴대폰이요")
  })

  it("여러 줄 질문은 다음 칸 머리말 앞까지 읽는다", () => {
    const message = formatHandoffMessage({ ...base, question: "첫 줄\n둘째 줄" }, ["needs_handoff"])
    expect(extractHandoffCustomerQuestion(message)).toBe("첫 줄\n둘째 줄")
  })

  it("전환 글이 아니거나 질문 칸이 없으면 undefined", () => {
    expect(extractHandoffCustomerQuestion("안녕하세요 상담원입니다")).toBeUndefined()
    expect(extractHandoffCustomerQuestion("[챗봇 상담 전환]\n\n[AI 답변]\n없음")).toBeUndefined()
    expect(extractHandoffCustomerQuestion(null)).toBeUndefined()
  })
})
