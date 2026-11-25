import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { CONSENT_POLICY_VERSION } from "@/lib/consent/consent"
import { consentCookie, installFakeBrowser } from "./helpers/fake-browser-storage"

// 챗봇 식별값·저장소 안전(쿠키 점검 C3·C8, CX-19)과 주소 정화(CX-04·C4).
// 모듈 안 메모리 값(탭 식별값·음소거)이 시험마다 새로 시작하도록 모듈을 다시 읽는다.

const PERSISTENT_KEY = "classinkr_chatbot_anonymous_id"
const TAB_KEY = "classinkr.chatbot.tabId.v1"

async function loadChannelTalk() {
  vi.resetModules()
  return import("@/lib/channel-talk")
}

describe("챗봇 식별값 (C3)", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_CHANNEL_PLUGIN_KEY", "test-plugin-key")
    vi.stubEnv("NEXT_PUBLIC_CHANNEL_TALK_PLUGIN_KEY", "")
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it("동의 전·'필수만'에는 영구 값을 만들지 않고 탭 단위 값(sessionStorage)을 쓴다. 남아 있던 영구 값은 지운다", async () => {
    const browser = installFakeBrowser()
    browser.localStorage.setItem(PERSISTENT_KEY, "old-persistent-id")
    const { getChannelTalkAnonymousId, getChannelTalkMemberId } = await loadChannelTalk()

    const first = getChannelTalkAnonymousId()
    expect(first).toBeTruthy()
    expect(first).not.toBe("old-persistent-id")
    expect(browser.localStorage.getItem(PERSISTENT_KEY)).toBeNull()
    expect(browser.sessionStorage.getItem(TAB_KEY)).toBe(first)
    expect(getChannelTalkAnonymousId()).toBe(first)
    expect(getChannelTalkMemberId()).toBeUndefined()

    browser.setCookie(consentCookie(CONSENT_POLICY_VERSION, { analytics: true, marketing: false }))
    expect(getChannelTalkAnonymousId()).toBe(first)
    expect(browser.localStorage.getItem(PERSISTENT_KEY)).toBeNull()
  })

  it("'마케팅' 동의와 채널톡 키가 있으면 영구 값을 쓰고, 처음 만들 때는 이 탭의 값을 올려 대화가 이어진다", async () => {
    const browser = installFakeBrowser()
    const { getChannelTalkAnonymousId, getChannelTalkMemberId } = await loadChannelTalk()
    const tabId = getChannelTalkAnonymousId()

    browser.setCookie(consentCookie(CONSENT_POLICY_VERSION, { analytics: false, marketing: true }))
    expect(getChannelTalkAnonymousId()).toBe(tabId)
    expect(browser.localStorage.getItem(PERSISTENT_KEY)).toBe(tabId)
    expect(getChannelTalkMemberId()).toBe(`classin:web:${tabId}`)
  })

  it("동의를 철회하면 영구 값을 지운다", async () => {
    const browser = installFakeBrowser()
    browser.setCookie(consentCookie(CONSENT_POLICY_VERSION, { analytics: true, marketing: true }))
    const { getChannelTalkAnonymousId, clearPersistentChatbotId } = await loadChannelTalk()
    getChannelTalkAnonymousId()
    expect(browser.localStorage.getItem(PERSISTENT_KEY)).toBeTruthy()

    browser.setCookie(consentCookie(CONSENT_POLICY_VERSION, { analytics: true, marketing: false }))
    getChannelTalkAnonymousId()
    expect(browser.localStorage.getItem(PERSISTENT_KEY)).toBeNull()

    browser.localStorage.setItem(PERSISTENT_KEY, "again")
    clearPersistentChatbotId()
    expect(browser.localStorage.getItem(PERSISTENT_KEY)).toBeNull()
  })

  it("채널톡 키가 없으면 '마케팅' 동의가 있어도 영구 값을 만들지 않는다", async () => {
    vi.stubEnv("NEXT_PUBLIC_CHANNEL_PLUGIN_KEY", "")
    const browser = installFakeBrowser()
    browser.setCookie(consentCookie(CONSENT_POLICY_VERSION, { analytics: true, marketing: true }))
    const { getChannelTalkAnonymousId, getChannelTalkMemberId } = await loadChannelTalk()

    expect(getChannelTalkAnonymousId()).toBe(browser.sessionStorage.getItem(TAB_KEY))
    expect(browser.localStorage.getItem(PERSISTENT_KEY)).toBeNull()
    expect(getChannelTalkMemberId()).toBeUndefined()
  })

  it("저장소가 막혀도 던지지 않고, 페이지가 살아 있는 동안 같은 메모리 값을 쓴다(CX-19)", async () => {
    installFakeBrowser({ blocked: true })
    const { getChannelTalkAnonymousId } = await loadChannelTalk()
    const first = getChannelTalkAnonymousId()
    expect(first).toBeTruthy()
    expect(getChannelTalkAnonymousId()).toBe(first)
  })

  it("로더는 키가 있을 때만 회원 id 를 만들고, 동의가 없으면 영구 값을 지운다", () => {
    const loader = readFileSync(join(process.cwd(), "components/ui/ChannelTalkLoader.tsx"), "utf8")
    expect(loader).toContain("const memberId = getChannelTalkMemberId()")
    expect(loader).not.toContain("getChannelTalkAnonymousId")
    expect(loader).toMatch(/shutdownChannelTalk\(\)\s*clearPersistentChatbotId\(\)/)
  })
})

describe("채널톡 부트 (C8)", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_CHANNEL_PLUGIN_KEY", "test-plugin-key")
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  function installChannelSpy() {
    const calls: unknown[][] = []
    const channel = Object.assign((...args: unknown[]) => calls.push(args), { q: [] as unknown[] })
    ;(window as unknown as { ChannelIO: typeof channel }).ChannelIO = channel
    ;(window as unknown as { ChannelIOInitialized: boolean }).ChannelIOInitialized = true
    return calls
  }

  it("동의 없이 상담을 직접 열면(force) 부트는 하되 회원 id 는 보내지 않는다", async () => {
    installFakeBrowser({ href: "https://classin.kr/unsubscribe?email=a@b.com&token=secret" })
    const calls = installChannelSpy()
    const { openChannelTalk } = await loadChannelTalk()

    expect(openChannelTalk({ memberId: "classin:web:tab-id", chatProfile: { chatbotHandoff: true } })).toBe(true)
    const boot = calls.find(([command]) => command === "boot")
    expect(boot?.[1]).toMatchObject({ pluginKey: "test-plugin-key" })
    expect(boot?.[1]).not.toHaveProperty("memberId")
    // 상담 수신함에 남는 주소에 토큰·이메일이 없다(CX-04·C4). 추적 제외 경로는 경로만.
    const setPage = calls.find(([command]) => command === "setPage")
    expect(setPage?.[1]).toBe("https://classin.kr/unsubscribe")
  })

  it("'마케팅' 동의가 있으면 회원 id 를 함께 보낸다", async () => {
    const browser = installFakeBrowser()
    browser.setCookie(consentCookie(CONSENT_POLICY_VERSION, { analytics: false, marketing: true }))
    const calls = installChannelSpy()
    const { bootChannelTalk } = await loadChannelTalk()

    expect(bootChannelTalk({ memberId: "classin:web:persistent" })).toBe(true)
    expect(calls.find(([command]) => command === "boot")?.[1]).toMatchObject({ memberId: "classin:web:persistent" })
  })
})

describe("챗봇 소리 설정 (CX-19·CX-24)", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  async function loadSound() {
    vi.resetModules()
    return import("@/lib/chatbot/sound")
  }

  it("기본은 꺼짐이고, 사용자가 켜 둔 선택만 따른다", async () => {
    const browser = installFakeBrowser()
    let sound = await loadSound()
    expect(sound.isMuted()).toBe(true)

    sound.setMuted(false)
    expect(browser.localStorage.getItem("classin_chatbot_muted")).toBe("false")
    sound = await loadSound()
    expect(sound.isMuted()).toBe(false)

    browser.localStorage.setItem("classin_chatbot_muted", "true")
    sound = await loadSound()
    expect(sound.isMuted()).toBe(true)
  })

  it("저장소가 막혀도 모듈을 읽고 설정을 바꿀 때 던지지 않는다", async () => {
    installFakeBrowser({ blocked: true })
    const sound = await loadSound()
    expect(sound.isMuted()).toBe(true)
    expect(() => sound.setMuted(false)).not.toThrow()
    expect(sound.isMuted()).toBe(false)
  })
})

describe("챗봇 요청 주소 정화 (CX-04·C4)", () => {
  it("쿼리는 광고 귀속 값만 남기고, 추적 제외 경로는 경로만 보낸다", async () => {
    const { sanitizeChatbotPageUrl } = await import("@/lib/chatbot/pii")
    expect(sanitizeChatbotPageUrl("https://classin.kr/unsubscribe?email=a@b.com&token=x")).toBe("https://classin.kr/unsubscribe")
    expect(sanitizeChatbotPageUrl("https://classin.kr/share/quote/abc?utm_source=mail")).toBe("https://classin.kr/share/quote/abc")
    expect(sanitizeChatbotPageUrl("https://classin.kr/docs/a?utm_source=naver&prefill=요약&gclid=g1#top")).toBe(
      "https://classin.kr/docs/a?utm_source=naver&gclid=g1"
    )
    expect(sanitizeChatbotPageUrl("javascript:alert(1)")).toBeUndefined()
    expect(sanitizeChatbotPageUrl("")).toBeUndefined()
  })

  it("위젯은 정화한 주소를 요청 context.pageUrl 로 보낸다", () => {
    const hook = readFileSync(join(process.cwd(), "components/ui/chatbot/useChatbotConversation.ts"), "utf8")
    expect(hook).toContain("sanitizeChatbotPageUrl(window.location.href)")
    expect(hook).not.toMatch(/pageUrl\s*=\s*typeof window === "undefined" \? undefined : window\.location\.href/)
  })

  it("redactPii 정본은 pii.ts 이고 서버(service.ts)는 다시 내보내기만 한다", () => {
    const service = readFileSync(join(process.cwd(), "lib/chatbot/service.ts"), "utf8")
    expect(service).toMatch(/import \{[^}]*\bredactPii\b[^}]*\} from "@\/lib\/chatbot\/pii"/)
    expect(service).toContain("export { redactPii }")
    expect(service).not.toMatch(/export function redactPii/)
  })
})
