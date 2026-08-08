import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

import { isAllowedPublicImageHost, listSafeSiteImageHosts } from "@/lib/safe-public-url"

// sanitizePublicImageUrl 이 통과시키는 자사 이미지 호스트가 next.config.ts 의
// remotePatterns / CSP img-src 에 빠지면, 이미지가 조용히 폴백되거나 CSP로 차단된다.
// 세 곳이 실제로 같은 집합을 보고 있는지 강제한다.
const nextConfigSource = readFileSync(
  path.join(process.cwd(), "next.config.ts"),
  "utf8",
)

describe("공개 이미지 호스트 허용 목록 동기화", () => {
  const siteHosts = listSafeSiteImageHosts()

  it("자사 호스트 목록이 비어 있지 않다", () => {
    expect(siteHosts.length).toBeGreaterThan(0)
    expect(siteHosts).toContain("classin.co.kr")
    expect(siteHosts).toContain("classin.ai.kr")
  })

  it.each(siteHosts)("next.config.ts 가 %s 를 이미지 호스트로 선언한다", (hostname) => {
    expect(nextConfigSource).toContain(hostname)
  })

  it("next.config.ts 의 siteImageHosts 가 CSP img-src 와 remotePatterns 양쪽에 반영된다", () => {
    expect(nextConfigSource).toContain("${siteImageSources}")
    expect(nextConfigSource).toContain("siteImageHosts")
  })

  it("허용 호스트 판정이 자사·unsplash·supabase 를 통과시키고 그 외를 막는다", () => {
    for (const hostname of siteHosts) {
      expect(isAllowedPublicImageHost(hostname)).toBe(true)
    }
    expect(isAllowedPublicImageHost("images.unsplash.com")).toBe(true)
    expect(isAllowedPublicImageHost("kfoaodkgvhvmfrankeyu.supabase.co")).toBe(true)
    expect(isAllowedPublicImageHost("example.com")).toBe(false)
    expect(isAllowedPublicImageHost("evil-classin.co.kr")).toBe(false)
  })
})
