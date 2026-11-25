import { readFileSync } from "node:fs"
import { join } from "node:path"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { isConsentBannerOpen, setConsentBannerOpen } from "@/components/consent/banner-presence"
import { CookieSettingsButton } from "@/components/consent/CookieSettingsButton"

/**
 * 쿠키 배너 접근성·동시 노출(쿠키 점검 A 묶음). DOM 테스트 환경이 없어 배선은 소스 계약으로 보고,
 * 동작(포커스 이동·Esc·aria-live·데스크톱 동시 노출)은 Playwright 로 확인했다.
 */
const projectRoot = join(__dirname, "..", "..")
const read = (relativePath: string) => readFileSync(join(projectRoot, relativePath), "utf8")

describe("배너와 챗봇 동시 노출(C16·CX-05)", () => {
  it("배너와 함께 플로팅을 숨기는 규칙은 휴대폰(< 48rem)에만 걸린다", () => {
    const css = read("app/styles/site-base.css")
    const rule = ":where(.site):has([data-consent-banner]) [data-hide-with-banner] { display: none; }"
    expect(css.split(rule)).toHaveLength(2)
    const before = css.slice(0, css.indexOf(rule))
    expect(before.trimEnd().endsWith("@media (width < 48rem) {")).toBe(true)
  })

  it("챗봇 래퍼에 배너가 가렸는지 볼 표지가 있다", () => {
    expect(read("components/AppChrome.tsx")).toContain("<div data-hide-with-banner data-chatbot-slot")
  })
})

describe("배너 위치와 알림(C5)", () => {
  it("배너 DOM 은 스킵 링크 바로 뒤, 헤더보다 앞에 둔다", () => {
    const chrome = read("components/AppChrome.tsx")
    const skip = chrome.indexOf("본문 바로가기")
    const banner = chrome.indexOf("<ConsentBanner />")
    const header = chrome.indexOf("<ConditionalHeader />")
    expect(skip).toBeGreaterThan(0)
    expect(banner).toBeGreaterThan(skip)
    expect(header).toBeGreaterThan(banner)
    expect(chrome.match(/<ConsentBanner \/>/g)).toHaveLength(1)
  })

  it("배너는 이름 있는 region 이고, 처음 뜰 때 한 번 알리는 aria-live 영역이 있다", () => {
    const banner = read("components/consent/ConsentBanner.tsx")
    expect(banner).toContain('role="region"')
    expect(banner).toContain('aria-label="쿠키 사용 동의"')
    expect(banner).not.toContain('role="dialog"')
    expect(banner).toContain('aria-live="polite"')
  })
})

describe("닫기와 버튼(C7·C20)", () => {
  const banner = read("components/consent/ConsentBanner.tsx")

  it("닫기·Esc 는 이미 고른 사람이 다시 연 배너에만 있다", () => {
    expect(banner).toContain("const dismissible = forceOpen && decided")
    expect(banner).toMatch(/\{dismissible \? \(\s*<button/)
    expect(banner).toContain('event.key !== "Escape"')
  })

  it("고르는 버튼은 보이는 높이 32px·글자 14px 이고 같은 모양이다", () => {
    expect(banner).toMatch(/const BTN =\s*"hit-area inline-flex min-h-8 [^"]*text-caption/)
    expect(banner.match(/className=\{CHOICE_BTN\}/g)).toHaveLength(3)
  })

  it("말풍선 폭은 rem 과 화면 폭 중 작은 값이다(글자 200%에서 잘리지 않게, C17)", () => {
    expect(banner).not.toMatch(/w-\[2\d\dpx\]/)
    expect(banner).toContain("w-[min(13.25rem,calc(100vw-4.75rem))]")
    expect(banner).toContain("w-[min(14.5rem,calc(100vw-4.75rem))]")
  })
})

describe("푸터 쿠키 설정 버튼(C21)", () => {
  it("보이는 높이 24px 이상에 hit-area 가 있고, 넘겨준 클래스를 함께 쓴다", () => {
    const html = renderToStaticMarkup(<CookieSettingsButton className="hover:text-white" />)
    expect(html).toContain("hit-area")
    expect(html).toContain("min-h-6")
    expect(html).toContain("hover:text-white")
    expect(html).toContain("쿠키 설정")
  })
})

describe("배너 열림 알림(banner-presence)", () => {
  it("열림·닫힘 값을 그대로 돌려준다", () => {
    setConsentBannerOpen(true)
    expect(isConsentBannerOpen()).toBe(true)
    setConsentBannerOpen(false)
    expect(isConsentBannerOpen()).toBe(false)
  })
})
