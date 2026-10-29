import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/analytics-config", () => ({ KAKAO_PIXEL_ID: "test-pixel" }))

import {
  getLastMetaPageViewPath,
  grantMarketingPixels,
  KAKAO_PIXEL_READY_EVENT,
  revokeMarketingPixels,
  setLastMetaPageViewPath,
} from "@/lib/pixels/teardown"
import { CONSENT_POLICY_VERSION } from "@/lib/consent/consent"

const KAKAO_PIXEL_SRC = "https://t1.daumcdn.net/adfit/static/kp.js"

/** jsdom 없이(설치 안 됨) 쿠키 저장소 + 최소 DOM 질의만 흉내낸다. */
function installBrowser() {
  const jar = new Map<string, string>()
  const scripts: { src: string; removed: boolean }[] = []
  const appended: { src: string; async: boolean; onload?: () => void; remove: () => void }[] = []
  const fbq = vi.fn()
  const dispatchEvent = vi.fn()

  const document = {
    get cookie() {
      return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join("; ")
    },
    set cookie(raw: string) {
      const [pair, ...attributes] = raw.split(";")
      const separator = pair.indexOf("=")
      const name = pair.slice(0, separator).trim()
      const flags = attributes.map((a) => a.trim().toLowerCase())
      const maxAge = flags.find((a) => a.startsWith("max-age="))
      const domain = flags.find((a) => a.startsWith("domain="))?.slice("domain=".length)

      if (maxAge && Number(maxAge.slice("max-age=".length)) === 0) {
        // 실제 브라우저처럼, 등록 가능한 도메인에 대한 삭제만 반영한다.
        if (!domain || "classin.co.kr".endsWith(domain.replace(/^\./, ""))) jar.delete(name)
        return
      }
      jar.set(name, pair.slice(separator + 1))
    },
    querySelectorAll: (selector: string) => {
      const match = /script\[src\*="(.+)"\]/.exec(selector)
      const fragment = match?.[1] ?? "\0"
      return scripts
        .filter((s) => !s.removed && s.src.includes(fragment))
        .map((s) => ({ remove: () => void (s.removed = true) }))
    },
    querySelector: (selector: string) => {
      const match = /script\[src="(.+)"\]/.exec(selector)
      return scripts.find((s) => !s.removed && s.src === match?.[1]) ?? null
    },
    createElement: () => ({ src: "", async: false, remove: vi.fn() }),
    body: {
      appendChild: (node: { src: string; async: boolean; onload?: () => void; remove: () => void }) => {
        appended.push(node)
        scripts.push({ src: node.src, removed: false })
      },
    },
  }

  vi.stubGlobal("document", document)
  vi.stubGlobal("window", {
    document,
    location: { hostname: "classin.co.kr", protocol: "https:", pathname: "/" },
    dispatchEvent,
    fbq,
    kakaoPixel: (() => undefined) as unknown,
  })

  return { jar, scripts, appended, fbq, dispatchEvent }
}

afterEach(() => {
  vi.unstubAllGlobals()
  setLastMetaPageViewPath(null)
})

describe("마케팅 동의 철회 시 픽셀 teardown", () => {
  let env: ReturnType<typeof installBrowser>

  beforeEach(() => {
    env = installBrowser()
    env.jar.set("_fbp", "fb.2.123.456")
    env.jar.set("_fbc", "fb.2.123.click")
    env.scripts.push({ src: KAKAO_PIXEL_SRC, removed: false })
  })

  it("Meta 픽셀 전송을 공식 API로 중단한다", () => {
    revokeMarketingPixels()
    expect(env.fbq).toHaveBeenCalledWith("consent", "revoke")
  })

  it("_fbp / _fbc 광고 쿠키를 실제로 지운다", () => {
    expect(env.jar.has("_fbp")).toBe(true)

    revokeMarketingPixels()

    expect(env.jar.has("_fbp")).toBe(false)
    expect(env.jar.has("_fbc")).toBe(false)
  })

  it("window.fbq 는 남긴다 — 지우면 재동의해도 복구할 수 없다", () => {
    revokeMarketingPixels()
    expect(window.fbq).toBeTypeOf("function")
  })

  it("Kakao 픽셀 스크립트와 전역을 걷어낸다", () => {
    revokeMarketingPixels()

    expect(env.scripts.find((s) => s.src === KAKAO_PIXEL_SRC)?.removed).toBe(true)
    expect(window.kakaoPixel).toBeUndefined()
  })
})

describe("재동의 시 픽셀 복구", () => {
  let env: ReturnType<typeof installBrowser>

  beforeEach(() => {
    env = installBrowser()
  })

  it("Meta 픽셀 전송을 다시 허용한다", () => {
    grantMarketingPixels()
    expect(env.fbq).toHaveBeenCalledWith("consent", "grant")
  })

  it("같은 경로에서 재동의해도 PageView 가 다시 잡히도록 dedup 을 푼다", () => {
    // 회귀 방지: dedup 상태가 리마운트를 넘어 살아남아 PageView 가 영영 누락됐다.
    setLastMetaPageViewPath("/pricing")
    expect(getLastMetaPageViewPath()).toBe("/pricing")

    grantMarketingPixels()

    expect(getLastMetaPageViewPath()).toBeNull()
  })

  it("철회로 내렸던 Kakao 픽셀 스크립트를 다시 주입한다", () => {
    revokeMarketingPixels()
    grantMarketingPixels()

    expect(env.appended.map((s) => s.src)).toContain(KAKAO_PIXEL_SRC)
  })

  it("이미 살아있는 Kakao 픽셀은 중복 주입하지 않는다", () => {
    grantMarketingPixels()
    expect(env.appended).toHaveLength(0)
  })

  it("제외 경로에서는 Kakao 픽셀을 다시 주입하지 않는다", () => {
    revokeMarketingPixels()
    window.location.pathname = "/admin"
    grantMarketingPixels()
    expect(env.appended).toHaveLength(0)
  })

  it("재동의 후 SDK 로드가 끝나면 준비 이벤트를 보낸다", () => {
    revokeMarketingPixels()
    env.jar.set("cln_consent", encodeURIComponent(JSON.stringify({ v: CONSENT_POLICY_VERSION, analytics: true, marketing: true, ts: 1, s: 1 })))
    grantMarketingPixels()
    env.appended[0]?.onload?.()
    expect(env.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: KAKAO_PIXEL_READY_EVENT }))
  })

  it("SDK 다운로드 중 동의를 철회하면 늦은 로드를 폐기한다", () => {
    revokeMarketingPixels()
    grantMarketingPixels()
    window.kakaoPixel = vi.fn()
    env.appended[0]?.onload?.()
    expect(window.kakaoPixel).toBeUndefined()
    expect(env.appended[0]?.remove).toHaveBeenCalled()
    expect(env.dispatchEvent).not.toHaveBeenCalled()
  })
})
