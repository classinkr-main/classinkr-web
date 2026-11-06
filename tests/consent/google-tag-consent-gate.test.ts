import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { CONSENT_POLICY_VERSION } from "@/lib/consent/consent"

/**
 * Google 태그(gtag.js)·GTM 은 동의 뒤에만 불러온다. DOM 테스트 환경이 없어 배선은 소스 계약으로 본다
 * (tests/admin/admin-gtag-scope.test.ts 와 같은 방식).
 */
const projectRoot = join(__dirname, "..", "..")
const read = (relativePath: string) => readFileSync(join(projectRoot, relativePath), "utf8")

describe("Google 태그 동의 게이트", () => {
  const appChrome = read("components/AppChrome.tsx")

  it("분석이나 마케팅 동의가 하나라도 있어야 gtag.js·GTM 을 렌더한다", () => {
    expect(appChrome).toContain("const tagConsent = consentChoice.analytics || consentChoice.marketing")
    expect(appChrome).toContain("const showGoogleTag = !trackingExcluded && tagConsent")
    expect(appChrome).toContain("{showGoogleTag ? <GoogleAdsScript analytics={consentChoice.analytics} /> : null}")
    expect(appChrome).toMatch(/\{tagConsent \? <GTMScript \/> : null\}/)
    // 동의와 무관하게 GTM 을 렌더하던 자리가 남아 있으면 안 된다.
    expect(appChrome.match(/<GTMScript \/>/g)).toHaveLength(1)
  })

  it("GA4 config 는 분석 동의 때만 건다 — 마케팅만 동의하면 Ads config 만 나간다", () => {
    const tag = read("components/GoogleAdsScript.tsx")
    const adsInit = tag.slice(tag.indexOf('id="gtag-ads-init"'), tag.indexOf("</Script>", tag.indexOf('id="gtag-ads-init"')))
    expect(adsInit).toContain("GOOGLE_ADS_ID")
    expect(adsInit).not.toContain("GA4_MEASUREMENT_ID")
    expect(tag).toMatch(/\{analytics && GA4_MEASUREMENT_ID \? \(\s*<Script id="gtag-ga4-init"/)
    expect(tag.match(/GA4_MEASUREMENT_ID\)\},\{send_page_view:false\}/g)).toHaveLength(1)
  })

  it("배너가 없는 정적 랜딩(/l/omo1)은 gtag 를 직접 싣지 않는다", () => {
    const html = read("public/l/omo1/index.html")
    expect(html).not.toContain("googletagmanager.com/gtag/js")
    expect(html).not.toContain("gtag(")
  })
})

describe("쿠키 정책 버전", () => {
  it("코드 상수이고 env 로 덮지 않는다 — 운영 env 가 옛 값을 고정해도 재동의가 뜬다", () => {
    expect(CONSENT_POLICY_VERSION).toBe("2026-11-06")
    expect(read("lib/consent/consent.ts")).not.toContain("NEXT_PUBLIC_CONSENT_POLICY_VERSION")
    expect(read(".env.local.example")).not.toContain("NEXT_PUBLIC_CONSENT_POLICY_VERSION")
  })
})

describe("쿠키 배너", () => {
  const banner = read("components/consent/ConsentBanner.tsx")

  it("받는 곳·국가를 적고, 자세한 내용은 방침의 쿠키·국외 이전 항목으로 잇는다", () => {
    expect(banner).toContain("방문 통계 · Google(미국)")
    expect(banner).toContain("광고·상담창 · Google·Meta(미국), 카카오, 채널톡")
    expect(banner).toContain('href="/privacy#cookies"')
    expect(banner).toContain('href="/privacy#overseas"')
  })

  it("필수만·모두 동의·선택 저장은 같은 버튼 모양이다", () => {
    expect(banner).not.toContain("PRIMARY_BTN")
    expect(banner.match(/className=\{CHOICE_BTN\}/g)).toHaveLength(3)
  })
})
