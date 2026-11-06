import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import PrivacyArchivePage, { metadata as archiveMetadata } from "@/app/privacy/2026-06-14/page"
import PrivacyPage from "@/app/privacy/page"
import { AD_CONSENT_DETAILS } from "@/lib/consent/ad-consent"
import { PRIVACY_EFFECTIVE } from "@/lib/legal/privacy-dates"

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;")

describe("개인정보처리방침", () => {
  const html = renderToStaticMarkup(<PrivacyPage />)

  it("자리표시가 하나도 남지 않는다(병합 가드)", () => {
    for (const marker of ["〔", "〕", "[확인 필요]", "TODO", "병합 전", "등이 포함될 수 있습니다"]) {
      expect(html).not.toContain(marker)
    }
  })

  it("쿠키 배너·폼이 가리키는 앵커가 있다", () => {
    for (const id of ["ad-consent", "overseas", "cookies", "changes"]) {
      expect(html).toContain(`id="${id}"`)
    }
  })

  it("5항은 폼 체크 칸의 상세 문구를 그대로 싣는다", () => {
    for (const line of AD_CONSENT_DETAILS) expect(html).toContain(escapeHtml(line))
  })

  it("결정된 사실을 싣고 WeCom 은 싣지 않는다", () => {
    expect(html).toContain("개인정보 보호책임자: 구옌")
    expect(html).toContain("北京仁科互动网络技术有限公司")
    expect(html).toContain("국세기본법 제85조의3, 부가가치세법 제71조")
    expect(html).toContain("국외 이전")
    expect(html).not.toMatch(/wecom/i)
    expect(html).toContain(`${PRIVACY_EFFECTIVE.ko}부터 적용합니다`)
    expect(html).toContain('href="/privacy/2026-06-14"')
  })

  it("이전 방침은 적용 기간을 달고 색인에서 빠진다", () => {
    const archive = renderToStaticMarkup(<PrivacyArchivePage />)
    expect(archive).toContain(`(2026년 6월 14일 ~ ${PRIVACY_EFFECTIVE.prevEndKo} 적용)`)
    expect(archiveMetadata.robots).toMatchObject({ index: false })
  })
})
