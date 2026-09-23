import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { excludesAnalytics, hidesPublicChrome } from "@/lib/analytics-paths"

/**
 * 공개 크롬과 계측은 범위가 다르다.
 *
 * `/checkout` 은 크롬(헤더·푸터·챗봇)을 걷은 터널이지만 광고 딥링크가 곧장 닿는 퍼널의
 * 종착지다. 크롬 판정을 계측에 그대로 쓰던 때에는 여기서 page_view·Pixel·동의 배너가 함께
 * 꺼져, 직행 방문자는 동의할 기회조차 없었다(round2 문서 §8 D11).
 */

describe("경로별 크롬·계측 범위", () => {
  it("/checkout 은 크롬을 걷되 계측은 켠다", () => {
    for (const path of ["/checkout", "/checkout/success", "/checkout/fail"]) {
      expect(hidesPublicChrome(path), path).toBe(true)
      expect(excludesAnalytics(path), path).toBe(false)
    }
  })

  it("영수증과 어드민은 크롬도 계측도 끈다", () => {
    for (const path of ["/receipt/abc", "/admin", "/admin/crm/customers/intake"]) {
      expect(hidesPublicChrome(path), path).toBe(true)
      expect(excludesAnalytics(path), path).toBe(true)
    }
  })

  it("공개 화면은 크롬도 계측도 켠다", () => {
    for (const path of ["/", "/contact", "/showroom", "/l/omo1"]) {
      expect(hidesPublicChrome(path), path).toBe(false)
      expect(excludesAnalytics(path), path).toBe(false)
    }
  })
})

describe("계측 스크립트의 경로 판정 출처", () => {
  /**
   * 소스 텍스트 고정(tests/admin/admin-gtag-scope.test.ts 와 같은 패턴). 경로 목록을 복사해
   * 들고 있는 스크립트가 두 번 나왔다 — Meta Pixel, 그리고 나중에 병합된 네이버 로그분석.
   * 복사본은 AppChrome 의 판정이 바뀌어도 따라오지 않아 그 스크립트만 조용히 꺼진다.
   */
  const componentsDir = join(__dirname, "..", "..", "components")
  const scripts = readdirSync(componentsDir).filter((name) => name.endsWith("Script.tsx"))

  it("최상위 계측 스크립트가 있다 — 이름 규칙이 바뀌면 이 검사가 빈손이 된다", () => {
    expect(scripts).toEqual(expect.arrayContaining(["MetaPixelScript.tsx", "NaverAnalyticsScript.tsx"]))
  })

  it("/checkout·/receipt 판정을 직접 들지 않는다 — lib/analytics-paths.ts 를 쓴다", () => {
    for (const name of scripts) {
      const source = readFileSync(join(componentsDir, name), "utf8")
      expect(source, name).not.toMatch(/startsWith\(\s*["'`]\/(checkout|receipt)/)
    }
  })
})
