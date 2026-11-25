import { describe, expect, it } from "vitest"

import { absolutePageUrl, formatHandoffMessage, type ChannelTalkHandoffCandidate } from "@/lib/chatbot/channel-handoff"
import { SITE_URL } from "@/lib/seo"

// 챗봇 점검 CX-04: 쿼리째 보낸 페이지 주소가 채널톡 상담 메시지 '페이지:' 줄·lastPage 프로필로 그대로 갔다
// (/unsubscribe?email=…&token=…). 서버가 한 번 더 정화한다. 예시 주소는 이 시험을 위해 지었다.

const base: ChannelTalkHandoffCandidate = {
  answerEventId: "00000000-0000-4000-8000-000000000011",
  sessionId: "00000000-0000-4000-8000-000000000012",
  question: "수신거부가 안 돼요",
  answer: "담당자에게 이어 드릴게요.",
  answerMode: "handoff",
  confidence: 0.5,
  unresolved: false,
  needsHandoff: true,
  handoffIntent: "support",
  sources: [],
}

describe("상담 전환 페이지 주소 정화", () => {
  it("추적 제외 경로(/unsubscribe)는 쿼리를 모두 버리고 경로만 남긴다", () => {
    const pageUrl = `${SITE_URL}/unsubscribe?email=a%40b.com&token=secret-token&utm_source=newsletter`
    const message = formatHandoffMessage({ ...base, pageUrl }, ["needs_handoff"])
    expect(message).toContain(`페이지: ${SITE_URL}/unsubscribe\n`)
    expect(message).not.toContain("secret-token")
    expect(message).not.toContain("a%40b.com")
    expect(message).not.toContain("utm_source")
  })

  it("공개 경로는 광고 귀속 쿼리만 남기고 토큰·이메일 값·해시를 버린다", () => {
    const cleaned = absolutePageUrl({
      pageUrl: `${SITE_URL}/pricing?utm_source=naver&token=abc123&contact=a%40b.com#plans`,
    })
    expect(cleaned).toBe(`${SITE_URL}/pricing?utm_source=naver`)
  })

  it("pageUrl 이 없으면 리퍼러, 그다음 경로를 같은 규칙으로 정화한다", () => {
    expect(absolutePageUrl({ referrer: `${SITE_URL}/share/quote/abc?token=x` })).toBe(`${SITE_URL}/share/quote/abc`)
    expect(absolutePageUrl({ path: "/docs/install?email=a%40b.com" })).toBe(`${SITE_URL}/docs/install`)
    expect(absolutePageUrl({})).toBe(SITE_URL)
  })

  it("해석할 수 없거나 http(s)가 아닌 주소는 건너뛴다", () => {
    expect(absolutePageUrl({ pageUrl: "javascript:alert(1)", path: "/faq" })).toBe(`${SITE_URL}/faq`)
  })
})
