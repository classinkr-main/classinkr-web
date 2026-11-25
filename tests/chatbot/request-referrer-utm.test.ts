import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { chatbotRequestReferrer, sanitizeChatbotUtm, sanitizeChatSessionAttribution } from "@/lib/chatbot/pii"

// 확인 결과(CX-04·C4 후속): context.pageUrl 은 정화했지만 같은 fetch 의 Referer 헤더가 주소 전체(쿼리 포함)를 싣고,
// context.utm 은 원래 쿼리 값을 그대로 실었다. 서버는 Referer 를 chat_sessions.referrer 로, utm 을 chat_sessions.utm 으로
// 그대로 저장했다. 예시 주소·이메일은 이 시험을 위해 지었다.

const UNSUBSCRIBE =
  "https://classin.kr/unsubscribe?email=victim%40example.com&token=SECRET-TOKEN-123&utm_source=mail&utm_term=victim%40example.com"

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8")
}

describe("챗봇 요청 Referer (chatbotRequestReferrer)", () => {
  it("추적 제외 경로는 경로만, 공개 경로는 광고 귀속 쿼리만 남긴다", () => {
    expect(chatbotRequestReferrer(UNSUBSCRIBE)).toBe("https://classin.kr/unsubscribe")
    expect(chatbotRequestReferrer("https://classin.kr/docs/a?utm_source=naver&prefill=요약&token=t#top")).toBe(
      "https://classin.kr/docs/a?utm_source=naver"
    )
  })

  it("해석할 수 없으면 빈 문자열 — Referer 를 보내지 않는다", () => {
    expect(chatbotRequestReferrer("javascript:alert(1)")).toBe("")
    expect(chatbotRequestReferrer("")).toBe("")
    expect(chatbotRequestReferrer(undefined)).toBe("")
  })

  it("위젯의 챗봇 fetch 세 곳이 모두 정화한 referrer 를 준다", () => {
    const hook = read("components/ui/chatbot/useChatbotConversation.ts")
    const streamCall = hook.slice(hook.indexOf('fetch("/api/chatbot/query/stream"'), hook.indexOf("body: JSON.stringify", hook.indexOf('fetch("/api/chatbot/query/stream"')))
    expect(streamCall).toContain("referrer: chatbotRequestReferrer()")
    const starterCall = hook.slice(hook.indexOf('fetch("/api/chatbot/recommended-questions"'), hook.indexOf(".then(", hook.indexOf('fetch("/api/chatbot/recommended-questions"')))
    expect(starterCall).toContain("referrer: chatbotRequestReferrer()")

    const list = read("components/ui/chatbot/MessageList.tsx")
    const feedbackCall = list.slice(list.indexOf('fetch("/api/chatbot/feedback"'), list.indexOf("body: JSON.stringify", list.indexOf('fetch("/api/chatbot/feedback"')))
    expect(feedbackCall).toContain("referrer: chatbotRequestReferrer()")
  })
})

describe("챗봇 utm (sanitizeChatbotUtm)", () => {
  it("utm 다섯 키의 문자열만 남기고, 이메일 같은 개인정보 값은 버린다", () => {
    const params = new URLSearchParams("utm_source=mail&utm_term=victim%40example.com&utm_campaign=spring&token=x&gclid=g1")
    expect(sanitizeChatbotUtm(params, "/pricing")).toEqual({ utm_source: "mail", utm_campaign: "spring" })
    expect(sanitizeChatbotUtm({ utm_medium: "cpc", utm_content: "010-1234-5678", utm_source: 3, other: "x" })).toEqual({
      utm_medium: "cpc",
    })
  })

  it("추적 제외 경로에서는 아무것도 남기지 않는다", () => {
    const params = new URLSearchParams("utm_source=mail&utm_campaign=spring")
    expect(sanitizeChatbotUtm(params, "/unsubscribe")).toEqual({})
    expect(sanitizeChatbotUtm(params, "/share/quote/abc")).toEqual({})
  })

  it("객체가 아니거나 빈 값이면 빈 객체, 긴 값은 자른다", () => {
    expect(sanitizeChatbotUtm(null)).toEqual({})
    expect(sanitizeChatbotUtm(["utm_source"])).toEqual({})
    expect(sanitizeChatbotUtm({ utm_source: "   " })).toEqual({})
    expect(sanitizeChatbotUtm({ utm_source: "a".repeat(500) }).utm_source).toHaveLength(200)
  })

  it("위젯은 원래 쿼리를 그대로 담지 않고 sanitizeChatbotUtm 을 거쳐 보낸다", () => {
    const hook = read("components/ui/chatbot/useChatbotConversation.ts")
    expect(hook).toContain("sanitizeChatbotUtm(new URLSearchParams(window.location.search), window.location.pathname)")
    expect(hook).not.toMatch(/\.map\(\(key\) => \[key, searchParams\.get\(key\)\]/)
  })
})

describe("chat_sessions 저장 직전 정화 (sanitizeChatSessionAttribution)", () => {
  it("옛 위젯·직접 호출이 주소 전체 Referer 와 이메일 utm 을 보내도 저장하지 않는다", () => {
    const stored = sanitizeChatSessionAttribution({
      referrer: UNSUBSCRIBE,
      utm: { utm_source: "mail", utm_term: "victim@example.com" },
      path: "/unsubscribe",
      pageUrl: "https://classin.kr/unsubscribe",
    })
    expect(stored).toEqual({ referrer: "https://classin.kr/unsubscribe", utm: {} })
    expect(JSON.stringify(stored)).not.toMatch(/SECRET-TOKEN|victim/)
  })

  it("경로를 안 보내도 리퍼러·pageUrl 이 추적 제외 경로면 utm 을 버린다", () => {
    expect(sanitizeChatSessionAttribution({ referrer: UNSUBSCRIBE, utm: { utm_source: "mail" } }).utm).toEqual({})
    expect(sanitizeChatSessionAttribution({ pageUrl: "/account/settings?x=1", utm: { utm_source: "mail" } }).utm).toEqual({})
  })

  it("공개 경로는 광고 귀속 값을 남기되 이메일 든 값은 버린다", () => {
    expect(
      sanitizeChatSessionAttribution({
        referrer: "https://classin.kr/pricing?utm_source=naver&token=abc&utm_term=a%40b.com",
        utm: { utm_source: "naver", utm_term: "a@b.com" },
        path: "/pricing",
      })
    ).toEqual({ referrer: "https://classin.kr/pricing?utm_source=naver", utm: { utm_source: "naver" } })
  })

  it("리퍼러가 없거나 해석할 수 없으면 null", () => {
    expect(sanitizeChatSessionAttribution({}).referrer).toBeNull()
    expect(sanitizeChatSessionAttribution({ referrer: "/relative?token=x" }).referrer).toBeNull()
    expect(sanitizeChatSessionAttribution({ referrer: "not a url" }).referrer).toBeNull()
  })

  it("서버(ensureSession)는 받은 Referer·utm 대신 정화한 값을 chat_sessions 에 넣는다", () => {
    const service = read("lib/chatbot/service.ts")
    const ensure = service.slice(service.indexOf("async function ensureSession("), service.indexOf('.from("chat_sessions")\n    .insert(sessionInsert)'))
    expect(ensure).toContain("sanitizeChatSessionAttribution({")
    expect(ensure).not.toContain("referrer: meta.referrer ?? null")
    expect(ensure).not.toContain("getContextObject(context.utm)")
  })
})
