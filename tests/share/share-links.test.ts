import { afterEach, describe, expect, it, vi } from "vitest"

import {
  buildShareText,
  buildSmsHref,
  copyText,
  detectSharePlatform,
  isShareAbort,
} from "@/lib/share/share-links"

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1"
const ANDROID =
  "Mozilla/5.0 (Linux; Android 15; SM-S928N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36"
const KAKAO_INAPP_ANDROID = `${ANDROID} KAKAOTALK 10.8.0`
const MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15"
const WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"

describe("detectSharePlatform", () => {
  it("treats iPhone and Android (including the KakaoTalk in-app browser) as mobile", () => {
    expect(detectSharePlatform(IPHONE)).toEqual({ isMobile: true, isIOS: true, isAndroid: false })
    expect(detectSharePlatform(ANDROID)).toEqual({ isMobile: true, isIOS: false, isAndroid: true })
    expect(detectSharePlatform(KAKAO_INAPP_ANDROID).isMobile).toBe(true)
  })

  it("treats desktop browsers as desktop", () => {
    expect(detectSharePlatform(MAC, 0)).toEqual({ isMobile: false, isIOS: false, isAndroid: false })
    expect(detectSharePlatform(WINDOWS).isMobile).toBe(false)
    expect(detectSharePlatform("").isMobile).toBe(false)
  })

  it("recognises iPadOS Safari, which sends a desktop Mac UA, by its touch points", () => {
    expect(detectSharePlatform(MAC, 5)).toEqual({ isMobile: true, isIOS: true, isAndroid: false })
  })
})

describe("SMS share link", () => {
  const body = buildShareText("학원 수업 녹화 & 보관 기준", "https://classin.co.kr/blog/a?b=1")

  it("puts the title on the first line and the URL on the second", () => {
    expect(body).toBe("학원 수업 녹화 & 보관 기준\nhttps://classin.co.kr/blog/a?b=1")
    expect(buildShareText("  ", "https://classin.co.kr")).toBe("https://classin.co.kr")
  })

  it("uses sms:&body= on iOS and sms:?body= elsewhere, fully encoded", () => {
    const encoded = encodeURIComponent(body)
    expect(buildSmsHref(body, { isIOS: true })).toBe(`sms:&body=${encoded}`)
    expect(buildSmsHref(body, { isIOS: false })).toBe(`sms:?body=${encoded}`)
    // & · ? · 줄바꿈이 본문 밖으로 새지 않는다
    expect(buildSmsHref(body, { isIOS: false })).not.toMatch(/\n|&b=1/)
  })
})

describe("isShareAbort", () => {
  it("only treats AbortError (the user closed the share sheet) as a quiet cancel", () => {
    expect(isShareAbort(new DOMException("cancel", "AbortError"))).toBe(true)
    expect(isShareAbort(new DOMException("no", "NotAllowedError"))).toBe(false)
    expect(isShareAbort("AbortError")).toBe(false)
  })
})

describe("copyText", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("writes through the Clipboard API when it is available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal("navigator", { clipboard: { writeText } })
    await expect(copyText("https://classin.co.kr")).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledWith("https://classin.co.kr")
  })

  it("falls back to execCommand when the Clipboard API rejects", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } })
    const textarea = { value: "", style: {}, setAttribute: vi.fn(), select: vi.fn(), remove: vi.fn() }
    const execCommand = vi.fn().mockReturnValue(true)
    vi.stubGlobal("document", {
      createElement: vi.fn().mockReturnValue(textarea),
      body: { appendChild: vi.fn() },
      execCommand,
    })
    await expect(copyText("https://classin.co.kr")).resolves.toBe(true)
    expect(execCommand).toHaveBeenCalledWith("copy")
    expect(textarea.value).toBe("https://classin.co.kr")
    expect(textarea.remove).toHaveBeenCalled()
  })

  it("reports failure instead of throwing when nothing can copy", async () => {
    vi.stubGlobal("navigator", {})
    vi.stubGlobal("document", undefined)
    await expect(copyText("x")).resolves.toBe(false)
  })
})
