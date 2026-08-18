import { describe, expect, it } from "vitest"

import { rewriteCampaignLinksForTracking } from "@/lib/email"

// 성과 루프(2026-08-18) — 캠페인 본문 링크의 클릭 추적 치환 계약.
// 서명·URL 조립은 서버(security-tokens)가 하므로 여기서는 순수 재작성 규칙만 고정한다.
describe("rewriteCampaignLinksForTracking", () => {
  const build = (url: string) => `https://site.test/api/track/click?u=${encodeURIComponent(url)}`

  it("rewrites absolute http(s) hrefs through the tracker", () => {
    const html = '<a href="https://classin.co.kr/events">행사</a>'
    expect(rewriteCampaignLinksForTracking(html, build)).toBe(
      '<a href="https://site.test/api/track/click?u=https%3A%2F%2Fclassin.co.kr%2Fevents">행사</a>'
    )
  })

  it("leaves mailto, tel, anchors and relative paths untouched", () => {
    const html = '<a href="mailto:a@b.c">m</a><a href="tel:0212345678">t</a><a href="#top">a</a><a href="/contact">r</a>'
    expect(rewriteCampaignLinksForTracking(html, build)).toBe(html)
  })

  it("keeps excluded URLs (수신거부·추적) as-is — 토큰 이중 래핑 방지", () => {
    const html =
      '<a href="https://site.test/api/newsletter/unsubscribe?email=a%40b.c&amp;token=x">수신거부</a>' +
      '<a href="https://classin.co.kr/blog">글</a>'
    const out = rewriteCampaignLinksForTracking(html, build, ["/api/newsletter/unsubscribe", "/api/track/"])
    expect(out).toContain('href="https://site.test/api/newsletter/unsubscribe?email=a%40b.c&amp;token=x"')
    expect(out).toContain("/api/track/click?u=")
  })

  it("unescapes &amp; before building and re-escapes & in the tracked attribute", () => {
    const html = '<a href="https://classin.co.kr/p?a=1&amp;b=2">q</a>'
    const out = rewriteCampaignLinksForTracking(html, (url) => {
      expect(url).toBe("https://classin.co.kr/p?a=1&b=2")
      return "https://site.test/t?u=x&sig=y"
    })
    expect(out).toBe('<a href="https://site.test/t?u=x&amp;sig=y">q</a>')
  })
})
