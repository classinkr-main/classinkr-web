import { describe, expect, it } from "vitest"

import nextConfig from "@/next.config"

// 쿠키 '모두 동의' 뒤 GA4 가 보내는 수집 요청이 CSP connect-src 에 막히면 콘솔에 차단 에러가 나고 데이터가 빠진다
// (2026-11-04 운영에서 analytics.google.com 차단 확인). 실제 headers() 가 만든 CSP 로 호스트 허용 여부를 본다.

async function contentSecurityPolicy() {
  const rules = (await nextConfig.headers?.()) ?? []
  for (const rule of rules) {
    const header = rule.headers.find((h) => h.key === "Content-Security-Policy")
    if (header) return header.value
  }
  throw new Error("Content-Security-Policy 헤더를 찾지 못했다")
}

function directive(csp: string, name: string): string[] {
  const part = csp.split(";").map((p) => p.trim()).find((p) => p.startsWith(`${name} `))
  return part ? part.split(/\s+/).slice(1) : []
}

// CSP 호스트 소스 매칭(https 한정). "*.example.com" 은 하위 도메인만 맞고 example.com 자체는 아니다
function allows(sources: string[], url: string): boolean {
  const { protocol, hostname } = new URL(url)
  return sources.some((source) => {
    if (!source.startsWith(`${protocol}//`)) return false
    const host = source.slice(protocol.length + 2)
    if (host.startsWith("*.")) return hostname.endsWith(host.slice(1))
    return hostname === host
  })
}

describe("CSP — GA4 수집 호스트", () => {
  it.each([
    "https://analytics.google.com/g/collect",
    "https://region1.analytics.google.com/g/collect",
    "https://www.google-analytics.com/g/collect",
    "https://region1.google-analytics.com/g/collect",
  ])("connect-src 가 %s 를 허용한다", async (url) => {
    expect(allows(directive(await contentSecurityPolicy(), "connect-src"), url)).toBe(true)
  })

  it("img-src 가 GA4 이미지 수집을 허용한다", async () => {
    expect(allows(directive(await contentSecurityPolicy(), "img-src"), "https://www.google-analytics.com/g/collect")).toBe(true)
  })

  it("허용 목록이 아무 호스트나 열지 않는다", async () => {
    const connect = directive(await contentSecurityPolicy(), "connect-src")
    expect(connect).not.toContain("*")
    expect(connect).not.toContain("https:")
    expect(allows(connect, "https://evil.example.com/collect")).toBe(false)
  })
})
