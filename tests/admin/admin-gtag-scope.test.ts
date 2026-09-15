import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * 어드민에서 광고/분석 픽셀이 발화하지 않아야 한다는 계약을 소스 텍스트로 고정한다.
 *
 * 실측 사고(감사 2026-09-07): app/layout.tsx(RootLayout, 서버 컴포넌트라 pathname을 모른다)가
 * Google Ads(gtag.js) 로더를 "전 페이지 공통"이라는 주석과 함께 <head>에 무조건 심고 있었다.
 * components/GoogleAdsScript.tsx·GTMScript.tsx는 이미 pathname.startsWith("/admin")로 어드민을
 * 걸러 AppChrome에서 렌더하는데, 루트 레이아웃의 중복 스크립트가 그 필터를 완전히 우회해
 * /admin/crm/customers/leads 진입만으로 googlesyndication.com/ccm/collect에 dl=…/admin/…가
 * 실제로 전송됐다(운영자 페이지뷰가 광고 전환 데이터에 섞이고, 고객 키가 든 어드민 URL이
 * 외부로 나감).
 *
 * 이 테스트는 RSC를 렌더하지 않고 소스 텍스트를 검사한다 — 이 저장소의 다른 "그레이지 텍스트
 * 고정" 테스트(tests/branch/heatmap-crm-map-link.test.ts 등)와 같은 패턴. 렌더 기반 테스트가
 * 아니므로 "문자열이 있다/없다"만 보장하고 실제 런타임 동작까지 보장하진 않지만, 이번 사고의
 * 재발 형태(레이아웃에 문자열 그대로 다시 박아 넣는 것)는 확실히 잡는다.
 */

const projectRoot = join(__dirname, "..", "..")
const read = (relativePath: string) => readFileSync(join(projectRoot, relativePath), "utf8")

describe("어드민 gtag/GTM 차단 — 루트 레이아웃 우회 재발 방지", () => {
  it("app/layout.tsx는 Google Ads(gtag.js) 로더를 더 이상 직접 심지 않는다", () => {
    const layoutSource = read("app/layout.tsx")

    // 사고의 정확한 재발 형태: 루트 레이아웃이 gtag.js src를 <Script>로 직접 로드하는 것.
    expect(layoutSource).not.toContain("googletagmanager.com/gtag/js")
    expect(layoutSource).not.toContain("gtag-ads-src")
    expect(layoutSource).not.toContain("gtag-ads-init")
  })

  it("Consent Mode 기본값(consent-default) 스크립트는 공개 페이지를 위해 그대로 남는다", () => {
    const layoutSource = read("app/layout.tsx")

    // 네트워크 요청이 없는 로컬 dataLayer 설정이라 어드민에도 남아 있어도 무해하다 —
    // 여기서는 "공개 페이지에서 사라지지 않았는가"만 고정한다(무회귀 근거).
    expect(layoutSource).toContain('id="consent-default"')
    expect(layoutSource).toContain("gtag('consent','default'")
  })

  it("GoogleAdsScript는 /admin 경로에서 렌더를 멈추는 가드를 유지한다", () => {
    const source = read("components/GoogleAdsScript.tsx")

    // 루트 레이아웃의 중복 로더가 사라진 지금, 이 가드가 어드민 차단의 유일한 경계다 —
    // 이 가드마저 지워지면 다시 전 어드민 페이지에 gtag가 발화한다.
    expect(source).toContain('pathname.startsWith("/admin")')
    expect(source).toMatch(/if\s*\(\s*pathname\.startsWith\("\/admin"\)\s*\)\s*return null/)
  })

  it("GTMScript도 /admin 경로에서 렌더를 멈추는 가드를 유지한다", () => {
    const source = read("components/GTMScript.tsx")

    expect(source).toContain('pathname.startsWith("/admin")')
  })

  it("lib/analytics-config.ts는 죽은 GA4_ID export를 되살리지 않는다", () => {
    // GA4_ID는 방금 지운 루트 레이아웃 중복 스크립트의 유일한 소비처였다 — 되돌아오면
    // 또 다른 소비처가 같은 실수를 반복할 여지가 생긴다는 신호다.
    const source = read("lib/analytics-config.ts")
    expect(source).not.toMatch(/export const GA4_ID\b/)
  })
})
