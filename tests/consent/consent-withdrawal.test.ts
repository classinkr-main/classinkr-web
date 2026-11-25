import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  CONSENT_POLICY_VERSION,
  cookieDomainCandidates,
  isConsentWithdrawal,
  trackingCookiesToExpire,
} from "@/lib/consent/consent"

/**
 * 철회 뒤 정리·다른 탭 동기화(쿠키 점검 C12). DOM 시험 환경이 없어 window·document·BroadcastChannel 을
 * 최소한으로 흉내 낸다. 실제 브라우저 동작(새로고침·다른 탭)은 Playwright 로 확인했다.
 */

const projectRoot = join(__dirname, "..", "..")
const read = (relativePath: string) => readFileSync(join(projectRoot, relativePath), "utf8")

const ALL = { analytics: true, marketing: true }
const NONE = { analytics: false, marketing: false }

function consentRaw(choice: { analytics: boolean; marketing: boolean }) {
  return encodeURIComponent(JSON.stringify({ v: CONSENT_POLICY_VERSION, ...choice, ts: 1 }))
}

/** document.cookie 흉내 — 이름별 값 하나, Max-Age=0 이면 지운다. 쓰기는 모두 기록한다. */
function createCookieJar(initial: Record<string, string>) {
  const jar = new Map(Object.entries(initial))
  const writes: string[] = []
  return {
    jar,
    writes,
    get cookie() {
      return [...jar].map(([k, v]) => `${k}=${v}`).join("; ")
    },
    set cookie(value: string) {
      writes.push(value)
      const [pair, ...attrs] = value.split(";")
      const eq = pair.indexOf("=")
      const name = pair.slice(0, eq).trim()
      const expired = attrs.some((attr) => /^\s*max-age=0\s*$/i.test(attr))
      if (expired) jar.delete(name)
      else jar.set(name, pair.slice(eq + 1))
    },
  }
}

class FakeBroadcastChannel {
  static instances: FakeBroadcastChannel[] = []
  name: string
  onmessage: ((event: { data: unknown }) => void) | null = null
  posted: unknown[] = []
  closed = false
  constructor(name: string) {
    this.name = name
    FakeBroadcastChannel.instances.push(this)
  }
  postMessage(data: unknown) {
    this.posted.push(data)
  }
  close() {
    this.closed = true
  }
}

class FakeInputElement {
  type = "text"
  value = ""
  defaultValue = ""
  checked = false
  defaultChecked = false
  inBanner = false
  closest(selector: string) {
    return selector === "[data-consent-banner]" && this.inBanner ? {} : null
  }
}
class FakeSelectElement {}

interface BrowserStub {
  cookies: ReturnType<typeof createCookieJar>
  gtag: ReturnType<typeof vi.fn>
  fbq: ReturnType<typeof vi.fn>
  reload: ReturnType<typeof vi.fn>
  events: Event[]
  setTrackerScript: (present: boolean) => void
  setFields: (fields: FakeInputElement[]) => void
  setVisibility: (state: "visible" | "hidden") => void
  fire: (type: string, init?: Record<string, unknown>) => void
  /** 사용자가 칸에 입력했다(document 캡처 리스너가 받는 input 이벤트) */
  typeInto: (field: FakeInputElement, value: string) => void
}

function stubBrowser({
  initialCookies,
  hostname = "www.classin.kr",
  protocol = "https:",
}: {
  initialCookies: Record<string, string>
  hostname?: string
  protocol?: string
}): BrowserStub {
  const target = new EventTarget()
  const docTarget = new EventTarget()
  const cookies = createCookieJar(initialCookies)
  const gtag = vi.fn()
  const fbq = vi.fn()
  const reload = vi.fn()
  const events: Event[] = []
  let trackerScript = false
  let fields: FakeInputElement[] = []
  let visibility: "visible" | "hidden" = "visible"

  vi.stubGlobal("window", {
    location: { hostname, protocol, reload },
    gtag,
    fbq,
    setTimeout: (fn: () => void, ms?: number) => setTimeout(fn, ms),
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    dispatchEvent: (event: Event) => {
      events.push(event)
      return target.dispatchEvent(event)
    },
  })
  vi.stubGlobal("document", {
    get cookie() {
      return cookies.cookie
    },
    set cookie(value: string) {
      cookies.cookie = value
    },
    get visibilityState() {
      return visibility
    },
    addEventListener: docTarget.addEventListener.bind(docTarget),
    querySelector: (selector: string) => (trackerScript && selector.includes("googletagmanager.com") ? {} : null),
    querySelectorAll: () => fields,
  })
  vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel)
  vi.stubGlobal("HTMLInputElement", FakeInputElement)
  vi.stubGlobal("HTMLSelectElement", FakeSelectElement)

  return {
    cookies,
    gtag,
    fbq,
    reload,
    events,
    setTrackerScript: (present) => {
      trackerScript = present
    },
    setFields: (next) => {
      fields = next
    },
    setVisibility: (state) => {
      visibility = state
      docTarget.dispatchEvent(new Event("visibilitychange"))
    },
    fire: (type, init) => {
      const event = new Event(type)
      Object.assign(event, init ?? {})
      target.dispatchEvent(event)
    },
    typeInto: (field, value) => {
      field.value = value
      // React 제어 입력처럼 defaultValue 도 value 에 맞춰 둔다 — 값 비교로는 못 찾는 경우
      field.defaultValue = value
      const event = new Event("input")
      Object.defineProperty(event, "target", { value: field })
      docTarget.dispatchEvent(event)
    },
  }
}

function stubConsentApi(browser: BrowserStub, record: { analytics: boolean; marketing: boolean }) {
  const fetchMock = vi.fn(async () => {
    // 서버 Set-Cookie 반영
    browser.cookies.jar.set("cln_consent", consentRaw(record))
    return new Response(
      JSON.stringify({ ok: true, stored: true, record: { v: CONSENT_POLICY_VERSION, ...record, ts: 2 } }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

const TRACKING_COOKIES = {
  _ga: "GA1.1.1",
  _ga_TEST000000: "GS1",
  _gcl_au: "1.1",
  _gcl_aw: "GCL.1",
  _gac_UA1: "1",
  _fbp: "fb.1",
  _fbc: "fb.1.c",
}

async function loadConsent() {
  vi.resetModules()
  return import("@/lib/consent/consent")
}

beforeEach(() => {
  vi.useFakeTimers()
  FakeBroadcastChannel.instances = []
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("끈 범주의 외부 쿠키 고르기", () => {
  const cookieString =
    "_ga=1; _ga_ABC=2; _gac_UA1=3; _gcl_au=4; _gcl_aw=5; _fbp=6; _fbc=7; cln_consent=x; cln_aid=y; _gid=z; other=1"

  it("분석을 끄면 Google 애널리틱스 쿠키만, 마케팅을 끄면 광고·Meta 쿠키만 고른다", () => {
    expect(trackingCookiesToExpire(cookieString, { analytics: false, marketing: true })).toEqual(["_ga", "_ga_ABC"])
    expect(trackingCookiesToExpire(cookieString, { analytics: true, marketing: false })).toEqual([
      "_gac_UA1",
      "_gcl_au",
      "_gcl_aw",
      "_fbp",
      "_fbc",
    ])
    expect(trackingCookiesToExpire(cookieString, ALL)).toEqual([])
  })

  it("동의 쿠키(cln_consent·cln_aid)와 목록 밖 쿠키는 건드리지 않는다", () => {
    const names = trackingCookiesToExpire(cookieString, NONE)
    expect(names).not.toContain("cln_consent")
    expect(names).not.toContain("cln_aid")
    expect(names).not.toContain("other")
    expect(names).toHaveLength(7)
  })

  it("호스트 전용과 상위 도메인 모두에서 지운다. localhost·IP 는 호스트 전용만", () => {
    expect(cookieDomainCandidates("www.classin.kr")).toEqual([null, "www.classin.kr", "classin.kr"])
    expect(cookieDomainCandidates("localhost")).toEqual([null])
    expect(cookieDomainCandidates("127.0.0.1")).toEqual([null])
  })

  it("철회는 켜져 있던 범주가 꺼질 때만이다", () => {
    expect(isConsentWithdrawal(ALL, NONE)).toBe(true)
    expect(isConsentWithdrawal(ALL, { analytics: true, marketing: false })).toBe(true)
    expect(isConsentWithdrawal({ analytics: true, marketing: false }, { analytics: false, marketing: true })).toBe(true)
    expect(isConsentWithdrawal(NONE, NONE)).toBe(false)
    expect(isConsentWithdrawal(NONE, ALL)).toBe(false)
  })
})

describe("이 탭에서 철회", () => {
  it("끈 범주의 쿠키를 모든 도메인 후보에서 만료하고, 다른 탭에 값 없이 알리고, 붙은 스크립트는 새로고침으로 내린다", async () => {
    const browser = stubBrowser({ initialCookies: { ...TRACKING_COOKIES, cln_consent: consentRaw(ALL) } })
    browser.setTrackerScript(true)
    stubConsentApi(browser, NONE)
    const consent = await loadConsent()
    consent.startConsentSync()

    await consent.saveConsent(NONE)

    expect([...browser.cookies.jar.keys()]).toEqual(["cln_consent"])
    const gaWrites = browser.cookies.writes.filter((w) => w.startsWith("_ga="))
    expect(gaWrites).toEqual([
      "_ga=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; Secure",
      "_ga=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; Domain=www.classin.kr; Secure",
      "_ga=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; Domain=classin.kr; Secure",
    ])
    expect(browser.gtag).toHaveBeenCalledWith("consent", "update", expect.objectContaining({ analytics_storage: "denied", ad_storage: "denied" }))
    expect(browser.fbq).toHaveBeenCalledWith("consent", "revoke")

    const channel = FakeBroadcastChannel.instances[0]
    expect(channel.name).toBe("cln-consent")
    expect(channel.posted).toEqual([{ type: "consent-change" }])
    expect(browser.events.map((e) => e.type)).toEqual(["cln:consent-change"])

    expect(browser.reload).not.toHaveBeenCalled()
    vi.advanceTimersByTime(200)
    expect(browser.reload).toHaveBeenCalledTimes(1)
  })

  it("입력 중인 글이 있으면 지금 새로고침하지 않고 다음 이동 때 한 번 정리한다(배너 체크 칸은 입력으로 보지 않는다)", async () => {
    const browser = stubBrowser({ initialCookies: { cln_consent: consentRaw(ALL) } })
    browser.setTrackerScript(true)
    const bannerToggle = Object.assign(new FakeInputElement(), { type: "checkbox", checked: true, inBanner: true })
    const draft = Object.assign(new FakeInputElement(), { value: "도입 문의드려요" })
    browser.setFields([bannerToggle, draft])
    stubConsentApi(browser, { analytics: true, marketing: false })
    const consent = await loadConsent()
    consent.startConsentSync()

    await consent.saveConsent({ analytics: true, marketing: false })
    vi.advanceTimersByTime(1000)

    expect(browser.reload).not.toHaveBeenCalled()
    expect(consent.takeTrackerReloadOnNavigation()).toBe(true)
    expect(consent.takeTrackerReloadOnNavigation()).toBe(false)
  })

  it("React 제어 입력(defaultValue 가 value 를 따라감)도 사용자가 입력했으면 입력 중으로 본다", async () => {
    const browser = stubBrowser({ initialCookies: { cln_consent: consentRaw(ALL) } })
    browser.setTrackerScript(true)
    const controlled = new FakeInputElement()
    browser.setFields([controlled])
    stubConsentApi(browser, NONE)
    const consent = await loadConsent()
    consent.startConsentSync()
    browser.typeInto(controlled, "학원 이름")

    await consent.saveConsent(NONE)
    vi.advanceTimersByTime(1000)
    expect(browser.reload).not.toHaveBeenCalled()
    expect(consent.takeTrackerReloadOnNavigation()).toBe(true)
  })

  it("입력했다가 모두 지운 칸(보낸 뒤 비운 챗봇 입력창 등)은 입력 중으로 보지 않는다", async () => {
    const browser = stubBrowser({ initialCookies: { cln_consent: consentRaw(ALL) } })
    browser.setTrackerScript(true)
    const composer = new FakeInputElement()
    browser.setFields([composer])
    stubConsentApi(browser, NONE)
    const consent = await loadConsent()
    consent.startConsentSync()
    browser.typeInto(composer, "가격이 궁금해요")
    browser.typeInto(composer, "")

    await consent.saveConsent(NONE)
    vi.advanceTimersByTime(200)
    expect(browser.reload).toHaveBeenCalledTimes(1)
  })

  it("배너 체크 칸만 바뀌었으면 입력 중으로 보지 않고 바로 새로고침한다", async () => {
    const browser = stubBrowser({ initialCookies: { cln_consent: consentRaw(ALL) } })
    browser.setTrackerScript(true)
    browser.setFields([Object.assign(new FakeInputElement(), { type: "checkbox", checked: false, defaultChecked: true, inBanner: true })])
    stubConsentApi(browser, NONE)
    const consent = await loadConsent()
    consent.startConsentSync()

    await consent.saveConsent(NONE)
    vi.advanceTimersByTime(200)
    expect(browser.reload).toHaveBeenCalledTimes(1)
  })

  it("동의를 더 켜거나 첫 방문에 '필수만'을 고르면 새로고침하지 않는다", async () => {
    const browser = stubBrowser({ initialCookies: {} })
    browser.setTrackerScript(true)
    stubConsentApi(browser, NONE)
    const consent = await loadConsent()
    consent.startConsentSync()
    await consent.saveConsent(NONE)

    stubConsentApi(browser, ALL)
    await consent.saveConsent(ALL)
    vi.advanceTimersByTime(1000)

    expect(browser.reload).not.toHaveBeenCalled()
    expect(consent.takeTrackerReloadOnNavigation()).toBe(false)
  })

  it("불러온 추적 스크립트가 없으면 쿠키만 지우고 새로고침하지 않는다", async () => {
    const browser = stubBrowser({ initialCookies: { _fbp: "fb.1", cln_consent: consentRaw(ALL) } })
    stubConsentApi(browser, { analytics: true, marketing: false })
    const consent = await loadConsent()
    consent.startConsentSync()

    await consent.saveConsent({ analytics: true, marketing: false })
    vi.advanceTimersByTime(1000)

    expect(browser.cookies.jar.has("_fbp")).toBe(false)
    expect(browser.reload).not.toHaveBeenCalled()
  })
})

describe("다른 탭 동기화", () => {
  it("다른 탭의 알림을 받으면 쿠키를 다시 읽어 Consent Mode·Meta 철회·구독 이벤트를 맞춘다", async () => {
    const browser = stubBrowser({ initialCookies: { cln_consent: consentRaw(ALL) } })
    const consent = await loadConsent()
    consent.startConsentSync()
    const channel = FakeBroadcastChannel.instances[0]

    // 다른 탭이 철회 저장 → 공유 쿠키가 바뀐 뒤 알림
    browser.cookies.jar.set("cln_consent", consentRaw(NONE))
    channel.onmessage?.({ data: { type: "consent-change" } })

    expect(browser.gtag).toHaveBeenCalledWith("consent", "update", expect.objectContaining({ analytics_storage: "denied" }))
    expect(browser.fbq).toHaveBeenCalledWith("consent", "revoke")
    expect(browser.events.map((e) => e.type)).toEqual(["cln:consent-change"])

    // 쿠키가 그대로면 다시 알려도 아무것도 하지 않는다
    channel.onmessage?.({ data: { type: "consent-change" } })
    expect(browser.events).toHaveLength(1)
  })

  it("가려진 탭은 입력 중인 글이 없으면 바로, 보이는 탭은 다음 이동 때 스크립트를 내린다", async () => {
    const hidden = stubBrowser({ initialCookies: { cln_consent: consentRaw(ALL) } })
    hidden.setTrackerScript(true)
    hidden.setVisibility("hidden")
    let consent = await loadConsent()
    consent.startConsentSync()
    hidden.cookies.jar.set("cln_consent", consentRaw(NONE))
    FakeBroadcastChannel.instances[0].onmessage?.({ data: {} })
    vi.advanceTimersByTime(200)
    expect(hidden.reload).toHaveBeenCalledTimes(1)

    vi.unstubAllGlobals()
    FakeBroadcastChannel.instances = []
    const visible = stubBrowser({ initialCookies: { cln_consent: consentRaw(ALL) } })
    visible.setTrackerScript(true)
    consent = await loadConsent()
    consent.startConsentSync()
    visible.cookies.jar.set("cln_consent", consentRaw({ analytics: true, marketing: false }))
    FakeBroadcastChannel.instances[0].onmessage?.({ data: {} })
    vi.advanceTimersByTime(1000)
    expect(visible.reload).not.toHaveBeenCalled()
    expect(consent.takeTrackerReloadOnNavigation()).toBe(true)
  })

  it("BroadcastChannel 이 없어도 탭이 다시 보일 때 쿠키로 맞춘다", async () => {
    const browser = stubBrowser({ initialCookies: { cln_consent: consentRaw(ALL) } })
    vi.stubGlobal("BroadcastChannel", undefined)
    const consent = await loadConsent()
    consent.startConsentSync()

    browser.cookies.jar.set("cln_consent", consentRaw(NONE))
    browser.setVisibility("visible")

    expect(browser.events.map((e) => e.type)).toEqual(["cln:consent-change"])
    expect(browser.fbq).toHaveBeenCalledWith("consent", "revoke")
  })

  it("bfcache 를 막지 않게 떠날 때 채널을 닫고, 돌아오면 다시 열어 맞춘다", async () => {
    const browser = stubBrowser({ initialCookies: { cln_consent: consentRaw(ALL) } })
    const consent = await loadConsent()
    consent.startConsentSync()
    const first = FakeBroadcastChannel.instances[0]

    browser.fire("pagehide", { persisted: true })
    expect(first.closed).toBe(true)

    browser.cookies.jar.set("cln_consent", consentRaw(NONE))
    browser.fire("pageshow", { persisted: true })
    expect(FakeBroadcastChannel.instances).toHaveLength(2)
    expect(browser.events.map((e) => e.type)).toEqual(["cln:consent-change"])
  })

  it("이미 고른 사람이 끈 범주의 남은 쿠키는 처음 구독할 때 지운다. 미결정이면 지우지 않는다", async () => {
    const decided = stubBrowser({ initialCookies: { ...TRACKING_COOKIES, cln_consent: consentRaw({ analytics: true, marketing: false }) } })
    let consent = await loadConsent()
    consent.startConsentSync()
    expect([...decided.cookies.jar.keys()].sort()).toEqual(["_ga", "_ga_TEST000000", "cln_consent"])

    vi.unstubAllGlobals()
    const undecided = stubBrowser({ initialCookies: { ...TRACKING_COOKIES } })
    consent = await loadConsent()
    consent.startConsentSync()
    expect(undecided.cookies.writes).toEqual([])
  })
})

describe("배선", () => {
  it("useConsent 가 구독할 때 다른 탭 동기화를 켠다", () => {
    const hook = read("lib/consent/useConsent.ts")
    const subscribe = hook.slice(hook.indexOf("function subscribe"), hook.indexOf("export function useConsent"))
    expect(subscribe).toContain("startConsentSync()")
  })

  it("PageViewTracker 는 미룬 정리를 다음 페이지뷰 때 새 문서 로드로 처리한다(같은 경로 재실행은 제외)", () => {
    const tracker = read("components/PageViewTracker.tsx")
    const effect = tracker.slice(tracker.indexOf("if (lastTrackedKeyRef.current === path) return"))
    const reloadAt = effect.indexOf("if (takeTrackerReloadOnNavigation()) {")
    expect(reloadAt).toBeGreaterThan(0)
    expect(effect.slice(reloadAt, reloadAt + 120)).toContain("window.location.reload()")
    // 다시 세기 전에 새로고침한다 — 옛 문서에서 페이지뷰를 한 번 더 보내지 않는다
    expect(reloadAt).toBeLessThan(effect.indexOf('trackEvent("page_view"'))
  })

  it("정책 버전은 그대로다(정리만 했고 문구는 바꾸지 않았다)", () => {
    expect(CONSENT_POLICY_VERSION).toBe("2026-11-06")
  })
})
