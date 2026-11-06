import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { AdConsentCheckbox } from "@/components/consent/AdConsentCheckbox"
import { AD_CONSENT_TITLE, EMPTY_AD_CONSENT, isAdConsentGiven } from "@/lib/consent/ad-consent"

const checkboxes = (html: string) => html.match(/<input[^>]*type="checkbox"[^>]*>/g) ?? []

describe("맞춤형 광고 활용 동의 칸", () => {
  it("두 칸 모두 기본으로 비어 있고, 이름이 따로다", () => {
    const html = renderToStaticMarkup(<AdConsentCheckbox value={EMPTY_AD_CONSENT} onChange={() => {}} />)
    const inputs = checkboxes(html)

    expect(inputs).toHaveLength(2)
    expect(inputs[0]).toContain('name="ad-consent-provide"')
    expect(inputs[1]).toContain('name="ad-consent-transfer"')
    for (const input of inputs) {
      expect(input).not.toContain("checked")
      expect(input).not.toContain("required")
    }
    expect(html).toContain(AD_CONSENT_TITLE)
    expect(html).toContain("<details")
    const link = html.match(/<a[^>]*href="\/privacy#ad-consent"[^>]*>/)?.[0]
    expect(link).toContain('target="_blank"')
    expect(link).toContain('rel="noopener noreferrer"')
  })

  it("값을 그대로 보여 준다", () => {
    const html = renderToStaticMarkup(
      <AdConsentCheckbox value={{ provide: true, transfer: false }} onChange={() => {}} />,
    )
    const [provide, transfer] = checkboxes(html)
    expect(provide).toContain("checked")
    expect(transfer).not.toContain("checked")
  })

  it("두 칸을 모두 골라야 동의다", () => {
    expect(isAdConsentGiven(EMPTY_AD_CONSENT)).toBe(false)
    expect(isAdConsentGiven({ provide: true, transfer: false })).toBe(false)
    expect(isAdConsentGiven({ provide: false, transfer: true })).toBe(false)
    expect(isAdConsentGiven({ provide: true, transfer: true })).toBe(true)
  })
})
