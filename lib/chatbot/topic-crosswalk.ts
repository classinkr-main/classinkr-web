import {
  detectChatbotCategory,
  type ChatbotCategory,
} from "@/lib/chatbot/classification"

/**
 * 채널톡·내부 CS 실태그를 공개 챗봇 분류(ChatbotCategory)로 정규화하는 크로스워크.
 *
 * - 사전(TOPIC_TAG_DICTIONARY)이 최우선 권위 레이어다. CS 맥락에서 의도적으로 공개 분류를
 *   오버라이드하는 항목이 있다(예: "설치"→troubleshooting, "출결"→admin). 사전은 detectChatbotCategory
 *   보다 먼저 조회되므로 이 오버라이드가 항상 이긴다.
 * - 사전 미매칭 시 태그를 문장처럼 이어 detectChatbotCategory로 폴백한다.
 * - 폴백조차 실제 주제를 못 잡으면("general") null을 돌려 호출부가 라인을 생략하게 한다.
 *
 * 순수 모듈이다(server-only 아님). 서버 라우트와 동기화 스크립트, 순수 테스트가 함께 쓴다.
 */
export const TOPIC_TAG_DICTIONARY: Record<string, ChatbotCategory> = {
  // 결제/청구/환불
  결제: "billing",
  환불: "billing",
  요금: "billing",
  견적: "billing",
  세금계산서: "billing",
  // 하드웨어(전자칠판/보드/OPS)
  전자칠판: "hardware",
  보드: "hardware",
  board: "hardware",
  ops: "hardware",
  // 문제 해결 — 설치/로그인은 CS 맥락에서 장애 처리로 본다(공개 분류의 hardware/account 매핑을 의도적으로 오버라이드).
  설치: "troubleshooting",
  로그인: "troubleshooting",
  오류: "troubleshooting",
  장애: "troubleshooting",
  // 관리자/운영 — 출결/출석은 운영 관리로 본다(공개 분류의 classroom 매핑을 의도적으로 오버라이드).
  출결: "admin",
  출석: "admin",
  관리자: "admin",
  api: "admin",
  // 수업 운영
  수업: "classroom",
  녹화: "classroom",
  과제: "classroom",
  // 도입/온보딩
  온보딩: "onboarding",
  도입: "onboarding",
  체험: "onboarding",
  // 상담/영업 연결
  상담: "consultation",
  데모: "consultation",
}

function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase().replace(/\s+/g, " ")
}

// "area:board", "topic:recording" 같은 구조화 태그는 접두어를 떼고 값으로도 사전을 대조한다.
function stripTagPrefix(tag: string): string {
  const index = tag.lastIndexOf(":")
  return index >= 0 ? tag.slice(index + 1).trim() : tag
}

/**
 * 태그 배열을 단일 ChatbotCategory로 정규화한다. 사전 우선, detectChatbotCategory 폴백, 그래도 없으면 null.
 * 여러 태그가 매칭되면 배열 순서상 첫 매칭이 이긴다(결정적).
 */
export function normalizeTopicTags(tags: string[]): ChatbotCategory | null {
  if (!Array.isArray(tags)) return null

  const cleaned = tags
    .map((tag) => (typeof tag === "string" ? normalizeTag(tag) : ""))
    .filter(Boolean)

  if (cleaned.length === 0) return null

  // 1) 사전 정확 매칭(첫 매칭 우선). 구조화 태그는 접두어 제거값도 대조한다.
  for (const tag of cleaned) {
    const direct = TOPIC_TAG_DICTIONARY[tag]
    if (direct) return direct

    const stripped = stripTagPrefix(tag)
    if (stripped && stripped !== tag) {
      const viaPrefix = TOPIC_TAG_DICTIONARY[stripped]
      if (viaPrefix) return viaPrefix
    }
  }

  // 2) 사전 미매칭 → 태그를 문장처럼 이어 공개 분류기로 폴백.
  const detected = detectChatbotCategory(cleaned.join(" "))
  if (detected !== "general") return detected

  // 3) 실제 주제를 못 잡으면 null.
  return null
}
