import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import { describe, expect, it, vi } from "vitest"

const attribution = readFileSync("public/l/attribution.js", "utf8")

function setup(install = true) {
  let listener: ((event: unknown) => void) | undefined
  const store = { addEventListener: vi.fn((_type, cb) => { if (!install) throw Error("blocked"); listener = cb }), removeEventListener: vi.fn() }
  const storage = { setItem: vi.fn(), removeItem: vi.fn() }
  const window = { cookieStore: store, localStorage: storage, navigator: { locks: {} }, crypto: { randomUUID: () => "id" }, gtag: vi.fn(), fbq: vi.fn(), classinConsentObservationHeaders: undefined as undefined | (() => Record<string, string>) }
  runInNewContext(attribution, { window })
  return { window, storage, listener }
}

describe("정적 랜딩 동의 관찰", () => {
  it("관찰 설치가 성공한 탭만 능력을 알리고 광고 귀속을 저장하지 않는다", () => {
    const { window, storage } = setup()
    expect(storage.setItem).not.toHaveBeenCalled()
    expect(window.classinConsentObservationHeaders?.()).toEqual({ "X-Classin-Consent-Observation": "cookie-store-v1" })
    expect(storage.setItem).not.toHaveBeenCalledWith("classinkr.leadAttribution.v1", expect.anything())
    window.cookieStore = {} as typeof window.cookieStore
    expect(window.classinConsentObservationHeaders?.()).toEqual({})
  })

  it("설치 실패는 실패 닫힘이며 쿠키 변경 시 태그를 철회한다", () => {
    expect(setup(false).window.classinConsentObservationHeaders?.()).toEqual({})
    const { window, listener, storage } = setup()
    window.gtag.mockImplementationOnce(() => { throw Error("tag failed") })
    listener?.({ changed: [{ name: "cln_revoke_m" }], deleted: [] })
    expect(window.fbq).toHaveBeenCalledWith("consent", "revoke")
    expect(storage.removeItem).toHaveBeenCalledWith("classinkr.leadAttribution.v1")
  })

  it.each(["enterprise", "kids", "managed", "online", "omo1", "meets-july"])("%s 폼은 신청 필드를 유지하며 식별자를 보내지 않는다", (slug) => {
    const html = readFileSync(`public/l/${slug}/index.html`, "utf8")
    const payload = html.match(/(?:const|var) payload = \{([\s\S]*?)\n\s*\};/)?.[1] ?? ""
    expect(payload).toMatch(/\bname\b/)
    expect(payload).toMatch(/\bphone\b/)
    if (slug !== "omo1") expect(payload).toMatch(/\bemail\b/)
    expect(payload).not.toMatch(/gclid|fbclid|utmSource|naverAd|location\.search|location\.href|referrer/)
    expect(html).toContain("window.classinConsentObservationHeaders")
    expect(html).toMatch(/fetch\('\/api\/(lead|events\/meets-july\/register)'/)
  })

  it("상담 폼은 관찰 기능이 없어도 필수 연락처로 제출할 수 있다", async () => {
    const html = readFileSync("public/l/enterprise/index.html", "utf8")
    const marker = "form?.addEventListener('submit', "
    const start = html.indexOf(marker) + marker.length
    const end = html.indexOf("\n    });", start)
    expect(start).toBeGreaterThan(marker.length)
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })
    const fields: Record<string, string> = { org: "Class", name: "Kim", phone: "01012345678", email: "kim@example.com", message: "문의" }
    const form = { querySelector: () => null, reset: vi.fn() }
    const callback = runInNewContext(`(${html.slice(start, end)}
})`, { field: (name: string) => fields[name] ?? "", form, submitButton: null, setStatus: vi.fn(), window: { location: { origin: "https://classin.co.kr", pathname: "/l/enterprise", href: "https://classin.co.kr/l/enterprise?gclid=secret" } }, fetch, Boolean })
    await callback({ preventDefault() {} })
    expect(fetch).toHaveBeenCalledOnce()
    const body = JSON.parse(fetch.mock.calls[0][1].body)
    expect(body).toMatchObject({ org: "Class", name: "Kim", phone: "01012345678", email: "kim@example.com", currentPage: "https://classin.co.kr/l/enterprise" })
    expect(JSON.stringify(body)).not.toContain("secret")
    expect(form.reset).toHaveBeenCalledOnce()
  })
})
