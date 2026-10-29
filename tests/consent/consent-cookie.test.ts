import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  CONSENT_COOKIE,
  CONSENT_POLICY_VERSION,
  CONSENT_SIGNAL_KEY,
  ANALYTICS_REVOCATION_COOKIE,
  MARKETING_REVOCATION_COOKIE,
  DENIED_CHOICE,
  GRANTED_CHOICE,
  currentChoice,
  parseConsent,
  prepareConsentMarkers,
  readConsent,
  readConsentRevocations,
  resyncPendingConsent,
  saveConsent,
  writeConsentCookie,
  type ConsentRecord,
} from "@/lib/consent/consent"

// 여러 탭이 같은 쿠키·저장소·Web Locks를 사용하는 상황을 모의한다.
function installBrowser() {
  const jar = new Map<string, string>()
  const storage = new Map<string, string>()
  const observedAtSignal: Array<ConsentRecord | null> = []
  const tails = new Map<string, Promise<void>>()
  const document = {
    get cookie() { return [...jar].map(([name, value]) => `${name}=${value}`).join("; ") },
    set cookie(raw: string) {
      const [pair, ...attributes] = raw.split(";")
      const separator = pair.indexOf("=")
      const name = pair.slice(0, separator).trim()
      const value = pair.slice(separator + 1)
      if (attributes.some((item) => item.trim().toLowerCase() === "max-age=0")) jar.delete(name)
      else jar.set(name, value)
    },
  }
  const localStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value)
      if (key === CONSENT_SIGNAL_KEY) {
        const cookie = jar.get(CONSENT_COOKIE)
        observedAtSignal.push(cookie ? parseConsent(decodeURIComponent(cookie)) : null)
      }
    },
    removeItem: (key: string) => { storage.delete(key) },
  }
  const locks = {
    request<T>(name: string, optionsOrCallback: { signal?: AbortSignal } | (() => T | Promise<T>), callback?: () => T | Promise<T>): Promise<T> {
      const options = typeof optionsOrCallback === "function" ? {} : optionsOrCallback
      const task = typeof optionsOrCallback === "function" ? optionsOrCallback : callback!
      const result = (tails.get(name) ?? Promise.resolve()).then(() => {
        if (options.signal?.aborted) throw new DOMException("Aborted", "AbortError")
        return task()
      })
      tails.set(name, result.then(() => undefined, () => undefined))
      return result
    },
  }
  const cookieStore = { addEventListener: vi.fn(), removeEventListener: vi.fn() }
  vi.stubGlobal("document", document)
  vi.stubGlobal("window", { document, localStorage, cookieStore, __classinConsentObserverReady: true, __classinConsentObservedStore: cookieStore, dispatchEvent: vi.fn(), location: { protocol: "https:" } })
  vi.stubGlobal("navigator", { locks })
  vi.stubGlobal("CustomEvent", class { constructor(public type: string, public init?: unknown) {} })
  return { jar, storage, locks, observedAtSignal }
}

const legacy: ConsentRecord = { v: CONSENT_POLICY_VERSION, analytics: true, marketing: true, ts: 1 }

describe("동의 쿠키", () => {
  let browser: ReturnType<typeof installBrowser>
  beforeEach(() => { browser = installBrowser(); prepareConsentMarkers() })
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

  it("정책 버전이 다른 쿠키는 거부하고 표식 없는 기존 허용은 재선택을 요구한다", () => {
    expect(parseConsent(JSON.stringify({ ...legacy, v: "1999-01-01" }))).toBeNull()
    writeConsentCookie(legacy)
    expect(readConsent()).toMatchObject(legacy)
    expect(currentChoice()).toEqual(DENIED_CHOICE)
  })

  it("문자열 false 등 잘못된 동의 값을 허용으로 해석하지 않는다", () => {
    expect(parseConsent(JSON.stringify({ ...legacy, analytics: "false", marketing: "false" }))).toMatchObject(DENIED_CHOICE)
    expect(parseConsent(JSON.stringify({ ...legacy, s: "0" }))?.s).toBe(0)
    expect(parseConsent(JSON.stringify({ ...legacy, s: null }))?.s).toBe(0)
  })

  it("허용을 선택한 시점에 표식이 없으면 표식만 준비하고 재선택 전까지 거절한다", async () => {
    browser.jar.delete(ANALYTICS_REVOCATION_COOKIE)
    browser.jar.delete(MARKETING_REVOCATION_COOKIE)
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    await expect(saveConsent(GRANTED_CHOICE)).rejects.toThrow("다시 선택")
    expect(currentChoice()).toEqual(DENIED_CHOICE)
    expect(browser.jar.has(ANALYTICS_REVOCATION_COOKIE)).toBe(true)
    expect(browser.jar.has(MARKETING_REVOCATION_COOKIE)).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("새 프로토콜에서 서버 검증 전 선택은 기록하지만 추적은 거부한다", async () => {
    let release!: () => void
    vi.stubGlobal("fetch", vi.fn(async () => {
      await new Promise<void>(resolve => { release = resolve })
      return new Response(JSON.stringify({ ok: false }), { status: 500 })
    }))
    const saving = saveConsent(GRANTED_CHOICE)
    await vi.waitFor(() => expect(release).toBeDefined())
    expect(readConsent()).toMatchObject({ ...GRANTED_CHOICE, s: 0 })
    // 다른 탭이 신호를 받는 순간 이미 새 쿠키를 읽을 수 있어야 한다.
    expect(browser.observedAtSignal.at(-1)).toMatchObject({ ...GRANTED_CHOICE, s: 0 })
    expect(currentChoice()).toEqual(DENIED_CHOICE)
    release(); await saving
    expect(currentChoice()).toEqual(DENIED_CHOICE)
  })

  it("검증된 서버 응답만 허용하고 익명 쿠키를 발급한다", async () => {
    const fetchMock = vi.fn(async (_url: string, options: { body: string; headers: Record<string, string> }) => {
      expect(options.headers["X-Consent-Client-Commit"]).toBe("1")
      const body = JSON.parse(options.body)
      expect(body.policy_version).toBe(CONSENT_POLICY_VERSION)
      return new Response(JSON.stringify({ ok: true, stored: true, anonymous_id: "anon-12345678", record: { v: CONSENT_POLICY_VERSION, analytics: body.analytics, marketing: body.marketing, ts: 1 } }), { headers: { "x-consent-client-commit": "1" } })
    })
    vi.stubGlobal("fetch", fetchMock)
    expect(await saveConsent(GRANTED_CHOICE)).toMatchObject({ ...GRANTED_CHOICE, s: 1 })
    expect(currentChoice()).toEqual(GRANTED_CHOICE)
    expect(document.cookie).toContain("cln_aid=anon-12345678")
  })

  it("두 탭의 오래된 허용 응답은 최신 거절을 덮지 못한다", async () => {
    const pending: Array<{ finish: () => void; body: { analytics: boolean; marketing: boolean } }> = []
    vi.stubGlobal("fetch", vi.fn(async (_url: string, options: { body: string }) => {
      const body = JSON.parse(options.body)
      await new Promise<void>(resolve => pending.push({ finish: resolve, body }))
      return new Response(JSON.stringify({ ok: true, stored: true, record: { v: CONSENT_POLICY_VERSION, analytics: body.analytics, marketing: body.marketing, ts: 1 } }), { headers: { "x-consent-client-commit": "1" } })
    }))
    // 모듈을 새로 읽어 각 탭의 독립 상태를 모의한다. 잠금과 저장소만 공유한다.
    const tab1 = await import("@/lib/consent/consent")
    vi.resetModules()
    const tab2 = await import("@/lib/consent/consent")
    const grant = tab1.saveConsent(GRANTED_CHOICE)
    await vi.waitFor(() => expect(pending).toHaveLength(1))
    const deny = tab2.saveConsent(DENIED_CHOICE)
    await vi.waitFor(() => expect(tab2.readConsent()).toMatchObject({ ...DENIED_CHOICE, s: 0 }))
    expect(tab2.currentChoice()).toEqual(DENIED_CHOICE)
    pending[0].finish(); await grant
    await vi.waitFor(() => expect(pending).toHaveLength(2))
    expect(tab2.currentChoice()).toEqual(DENIED_CHOICE)
    pending[1].finish(); await deny
    expect(tab2.readConsent()).toMatchObject({ ...DENIED_CHOICE, s: 1 })
  })

  it("한 탭에서 잠금과 공유 저장소가 실패해도 이전 허용 응답이 거절을 덮지 못하고 새 허용은 가능하다", async () => {
    const pending: Array<{ finish: () => void; body: { analytics: boolean; marketing: boolean } }> = []
    vi.stubGlobal("fetch", vi.fn(async (_url: string, options: { body: string }) => {
      const body = JSON.parse(options.body)
      await new Promise<void>(resolve => pending.push({ finish: resolve, body }))
      return new Response(JSON.stringify({ ok: true, stored: true, record: { v: CONSENT_POLICY_VERSION, analytics: body.analytics, marketing: body.marketing, ts: 1 } }), { headers: { "x-consent-client-commit": "1" } })
    }))
    const oldGrant = saveConsent(GRANTED_CHOICE)
    await vi.waitFor(() => expect(pending).toHaveLength(1))
    vi.stubGlobal("navigator", {})
    await saveConsent(DENIED_CHOICE)
    expect(currentChoice()).toEqual(DENIED_CHOICE)
    vi.stubGlobal("navigator", { locks: browser.locks })
    pending[0].finish(); await oldGrant
    expect(currentChoice()).toEqual(DENIED_CHOICE)
    await vi.waitFor(() => expect(pending).toHaveLength(2))
    expect(pending[1].body).toMatchObject(DENIED_CHOICE)
    pending[1].finish()
    await vi.waitFor(() => expect(readConsent()).toMatchObject({ ...DENIED_CHOICE, s: 1 }))
    const newGrant = saveConsent(GRANTED_CHOICE)
    await vi.waitFor(() => expect(pending).toHaveLength(3))
    pending[2].finish(); await newGrant
    expect(currentChoice()).toEqual(GRANTED_CHOICE)
  })

  it("허용 요청이 상태 잠금을 기다리는 사이 새 철회가 생겨도 허용하지 않는다", async () => {
    let release!: () => void
    const held = browser.locks.request("classin-consent-state-v1", () => new Promise<void>(resolve => { release = resolve }))
    await vi.waitFor(() => expect(release).toBeDefined())
    vi.stubGlobal("fetch", vi.fn(async (_url: string, options: { body: string }) => {
      const body = JSON.parse(options.body)
      return new Response(JSON.stringify({ ok: true, stored: true, record: { v: CONSENT_POLICY_VERSION, analytics: body.analytics, marketing: body.marketing, ts: 1 } }), { headers: { "x-consent-client-commit": "1" } })
    }))
    const grant = saveConsent(GRANTED_CHOICE)
    vi.stubGlobal("navigator", {})
    await saveConsent(DENIED_CHOICE)
    vi.stubGlobal("navigator", { locks: browser.locks })
    release(); await held; await grant
    expect(currentChoice()).toEqual(DENIED_CHOICE)
  })

  it("정책 불일치·오래된 서버·네트워크 실패는 허용으로 전환하지 않는다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true, stored: true, record: legacy }))))
    await saveConsent(GRANTED_CHOICE)
    expect(readConsent()?.s).toBe(0)
    expect(currentChoice()).toEqual(DENIED_CHOICE)
  })

  it("Web Locks 미지원 환경에서 허용은 거부하고 필수만 사용을 유지한다", async () => {
    vi.stubGlobal("navigator", {})
    await expect(saveConsent(GRANTED_CHOICE)).rejects.toThrow("안전하게 저장")
    expect(currentChoice()).toEqual(DENIED_CHOICE)
    await expect(saveConsent(DENIED_CHOICE)).resolves.toMatchObject(DENIED_CHOICE)
  })

  it("공유 저장소가 중간에 실패해도 허용 쿠키를 남기지 않는다", async () => {
    writeConsentCookie(legacy)
    const original = window.localStorage.setItem.bind(window.localStorage)
    vi.spyOn(window.localStorage, "setItem").mockImplementation((key, value) => {
      if (key === CONSENT_SIGNAL_KEY) throw new Error("storage unavailable")
      original(key, value)
    })
    await expect(saveConsent(GRANTED_CHOICE)).rejects.toThrow("storage unavailable")
    expect(readConsent()).toMatchObject({ ...DENIED_CHOICE, s: 0 })
    expect(currentChoice()).toEqual(DENIED_CHOICE)
  })

  it("미동기화 선택을 재시도하며 선택 식별자가 유지된다", async () => {
    const markers = readConsentRevocations()
    const record: ConsentRecord = { ...legacy, s: 0, rid: "decision-one", ackAnalytics: markers.analytics!, ackMarketing: markers.marketing! }
    writeConsentCookie(record)
    window.localStorage.setItem(CONSENT_SIGNAL_KEY, JSON.stringify(record))
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true, stored: true, record: legacy }), { headers: { "x-consent-client-commit": "1" } })))
    await resyncPendingConsent()
    expect(readConsent()).toMatchObject({ rid: "decision-one", s: 1 })
  })

  it("서버 요청이 타임아웃되어도 거절은 즉시 적용되고 두 요청이 끝난다", async () => {
    const fetchMock = vi.fn(async (_url: string, options: { signal: AbortSignal }) => {
      await new Promise<void>((_resolve, reject) => {
        options.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true })
      })
      throw new Error("unreachable")
    })
    vi.stubGlobal("fetch", fetchMock)
    const grant = saveConsent(GRANTED_CHOICE)
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const deny = saveConsent(DENIED_CHOICE)
    await vi.waitFor(() => expect(readConsent()).toMatchObject({ ...DENIED_CHOICE, s: 0 }))
    expect(currentChoice()).toEqual(DENIED_CHOICE)
    await Promise.all([grant, deny])
    expect(readConsent()).toMatchObject({ ...DENIED_CHOICE, s: 0 })
  }, 12_000)

  it("이전 동의의 재동기화 응답은 이후의 거절을 덮지 못한다", async () => {
    const markers = readConsentRevocations()
    const record: ConsentRecord = { ...legacy, s: 0, rid: "old-decision", ackAnalytics: markers.analytics!, ackMarketing: markers.marketing! }
    writeConsentCookie(record)
    window.localStorage.setItem(CONSENT_SIGNAL_KEY, JSON.stringify(record))
    const pending: Array<() => void> = []
    vi.stubGlobal("fetch", vi.fn(async (_url: string, options: { body: string }) => {
      const body = JSON.parse(options.body)
      await new Promise<void>(resolve => pending.push(resolve))
      return new Response(JSON.stringify({ ok: true, stored: true, record: { v: CONSENT_POLICY_VERSION, analytics: body.analytics, marketing: body.marketing, ts: 1 } }), { headers: { "x-consent-client-commit": "1" } })
    }))
    const retry = resyncPendingConsent()
    await vi.waitFor(() => expect(pending).toHaveLength(1))
    const deny = saveConsent(DENIED_CHOICE)
    await vi.waitFor(() => expect(readConsent()).toMatchObject({ ...DENIED_CHOICE, s: 0 }))
    pending[0](); await retry
    await vi.waitFor(() => expect(pending).toHaveLength(2))
    expect(currentChoice()).toEqual(DENIED_CHOICE)
    pending[1](); await deny
    expect(readConsent()).toMatchObject({ ...DENIED_CHOICE, s: 1 })
  })
})
