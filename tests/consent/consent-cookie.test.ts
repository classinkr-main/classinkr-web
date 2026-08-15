import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  CONSENT_COOKIE,
  CONSENT_POLICY_VERSION,
  DENIED_CHOICE,
  GRANTED_CHOICE,
  parseConsent,
  readConsent,
  readConsentRaw,
  resyncPendingConsent,
  saveConsent,
  writeConsentCookie,
  type ConsentRecord,
} from "@/lib/consent/consent"

/**
 * jsdom을 쓰지 않고(설치되어 있지 않다) 최소한의 쿠키 저장소만 흉내낸다.
 * 실제 브라우저처럼 `max-age=0`이면 삭제한다.
 */
function installCookieJar() {
  const jar = new Map<string, string>()
  const document = {
    get cookie() {
      return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join("; ")
    },
    set cookie(raw: string) {
      const [pair, ...attributes] = raw.split(";")
      const separator = pair.indexOf("=")
      const name = pair.slice(0, separator).trim()
      const value = pair.slice(separator + 1)
      const maxAge = attributes
        .map((attribute) => attribute.trim().toLowerCase())
        .find((attribute) => attribute.startsWith("max-age="))
      if (maxAge && Number(maxAge.slice("max-age=".length)) === 0) jar.delete(name)
      else jar.set(name, value)
    },
  }

  const dispatchEvent = vi.fn()
  vi.stubGlobal("document", document)
  vi.stubGlobal("window", {
    document,
    dispatchEvent,
    location: { protocol: "https:" },
  })
  return { jar, dispatchEvent }
}

const record: ConsentRecord = {
  v: CONSENT_POLICY_VERSION,
  analytics: true,
  marketing: true,
  ts: 1_700_000_000_000,
  s: 1,
}

describe("consent cookie parsing", () => {
  it("정책 버전이 다르면 재동의가 필요하다(null)", () => {
    expect(parseConsent(JSON.stringify({ ...record, v: "1999-01-01" }))).toBeNull()
  })

  it("빈 값·깨진 JSON은 조용히 null", () => {
    expect(parseConsent("")).toBeNull()
    expect(parseConsent(null)).toBeNull()
    expect(parseConsent("{not json")).toBeNull()
  })

  it("동기화 플래그가 없는 기존 쿠키는 동기화된 것으로 본다", () => {
    const legacy = { v: CONSENT_POLICY_VERSION, analytics: true, marketing: false, ts: 1 }
    expect(parseConsent(JSON.stringify(legacy))?.s).toBe(1)
  })

  it("s:0(동기화 실패)은 보존된다", () => {
    expect(parseConsent(JSON.stringify({ ...record, s: 0 }))?.s).toBe(0)
  })
})

describe("consent cookie round-trip", () => {
  beforeEach(() => {
    installCookieJar()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("기록한 쿠키를 그대로 다시 읽는다 (URL 인코딩 왕복)", () => {
    writeConsentCookie(record)
    expect(readConsentRaw()).toBe(JSON.stringify(record))
    expect(readConsent()).toEqual(record)
  })

  it("다른 쿠키가 앞뒤로 있어도 정확히 골라낸다", () => {
    document.cookie = "other_consent=decoy"
    writeConsentCookie(record)
    document.cookie = "trailing=1"
    expect(readConsent()).toEqual(record)
  })
})

describe("saveConsent — 선택은 네트워크와 무관하게 보존된다", () => {
  let dispatchEvent: ReturnType<typeof vi.fn>

  beforeEach(() => {
    ;({ dispatchEvent } = installCookieJar())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("서버가 실패해도 throw하지 않고 쿠키를 남긴다 (배너 무한 재노출 회귀 방지)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ok: false }), { status: 429 }))
    )

    const saved = await saveConsent(GRANTED_CHOICE)

    expect(saved.analytics).toBe(true)
    expect(saved.marketing).toBe(true)
    // 동기화 실패는 s:0으로 표시되어 다음 방문에 재시도된다.
    expect(saved.s).toBe(0)
    // 핵심: 쿠키가 남아 있어야 배너가 다시 뜨지 않는다.
    expect(readConsent()).not.toBeNull()
    expect(readConsent()?.marketing).toBe(true)
  })

  it("네트워크 자체가 끊겨도 동일하게 보존된다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline")
      })
    )

    await expect(saveConsent(DENIED_CHOICE)).resolves.toMatchObject({
      analytics: false,
      marketing: false,
      s: 0,
    })
    expect(readConsent()?.analytics).toBe(false)
  })

  it("서버 성공 시 서버가 확정한 기록을 반환한다", async () => {
    const serverRecord: ConsentRecord = { ...record, analytics: false, s: 1 }
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ ok: true, stored: true, record: serverRecord }), {
            status: 200,
          })
      )
    )

    await expect(saveConsent({ analytics: false, marketing: true })).resolves.toEqual(serverRecord)
  })

  it("서버 응답을 기다리지 않고 즉시 변경 이벤트를 알린다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        // 이벤트가 이미 나갔어야 한다 — 픽셀/배너가 왕복을 기다리지 않도록.
        expect(dispatchEvent).toHaveBeenCalled()
        return new Response(JSON.stringify({ ok: true, record }), { status: 200 })
      })
    )

    await saveConsent(GRANTED_CHOICE)
    expect(dispatchEvent).toHaveBeenCalledTimes(1)
  })

  it("동의 쿠키 이름은 cln_consent 로 고정된다", () => {
    expect(CONSENT_COOKIE).toBe("cln_consent")
  })
})

describe("resyncPendingConsent — 누락된 감사 로그 메우기", () => {
  beforeEach(() => {
    installCookieJar()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("s:0 이면 서버에 다시 기록을 시도한다", async () => {
    writeConsentCookie({ ...record, s: 0 })
    const fetchMock = vi.fn(
      async (_url: string) => new Response(JSON.stringify({ ok: true, record }), { status: 200 })
    )
    vi.stubGlobal("fetch", fetchMock)

    await resyncPendingConsent()
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledWith("/api/consent", expect.objectContaining({ method: "POST" }))
  })

  it("이미 동기화된 동의는 건드리지 않는다", async () => {
    writeConsentCookie({ ...record, s: 1 })
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    await resyncPendingConsent()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("동의 기록이 없으면 아무 요청도 하지 않는다", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    await resyncPendingConsent()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("재동기화가 실패해도 던지지 않는다", async () => {
    writeConsentCookie({ ...record, s: 0 })
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline")
      })
    )

    await expect(resyncPendingConsent()).resolves.toBeUndefined()
  })
})
