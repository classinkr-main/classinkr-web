import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const KEY = "classinkr_chatbot_anonymous_id"

function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key) },
    setItem: (key, value) => { values.set(key, value) },
  }
}

// 페이지뷰 메모리 id 가 모듈 상태라 테스트마다 새로 불러온다.
async function loadModule() {
  return import("@/lib/channel-talk")
}

beforeEach(() => vi.resetModules())
afterEach(() => vi.unstubAllGlobals())

describe("getChannelTalkAnonymousId", () => {
  it("persists a generated id and reuses it", async () => {
    const storage = memoryStorage()
    vi.stubGlobal("window", { localStorage: storage })
    const { getChannelTalkAnonymousId } = await loadModule()

    const first = getChannelTalkAnonymousId()
    expect(first).toBeTruthy()
    expect(storage.getItem(KEY)).toBe(first)
    expect(getChannelTalkAnonymousId()).toBe(first)
  })

  it("returns the stored id when one exists", async () => {
    const storage = memoryStorage()
    storage.setItem(KEY, "stored-id")
    vi.stubGlobal("window", { localStorage: storage })
    const { getChannelTalkAnonymousId } = await loadModule()

    expect(getChannelTalkAnonymousId()).toBe("stored-id")
  })

  it("does not throw when setItem throws and keeps one id for the page view", async () => {
    const storage = memoryStorage()
    storage.setItem = vi.fn(() => { throw new DOMException("quota", "QuotaExceededError") })
    vi.stubGlobal("window", { localStorage: storage })
    const { buildChannelTalkMemberId, getChannelTalkAnonymousId } = await loadModule()

    let first: string | undefined
    expect(() => { first = getChannelTalkAnonymousId() }).not.toThrow()
    expect(first).toBeTruthy()
    expect(getChannelTalkAnonymousId()).toBe(first)
    expect(buildChannelTalkMemberId(first!)).toMatch(/^classin:web:/)
  })

  it("does not throw when getItem throws", async () => {
    const storage = memoryStorage()
    storage.getItem = vi.fn(() => { throw new DOMException("denied", "SecurityError") })
    storage.setItem = vi.fn(() => { throw new DOMException("denied", "SecurityError") })
    vi.stubGlobal("window", { localStorage: storage })
    const { getChannelTalkAnonymousId } = await loadModule()

    let first: string | undefined
    expect(() => { first = getChannelTalkAnonymousId() }).not.toThrow()
    expect(first).toBeTruthy()
    expect(getChannelTalkAnonymousId()).toBe(first)
  })

  it("does not throw when the localStorage accessor itself throws", async () => {
    const win = {}
    Object.defineProperty(win, "localStorage", {
      get() { throw new DOMException("denied", "SecurityError") },
    })
    vi.stubGlobal("window", win)
    const { getChannelTalkAnonymousId } = await loadModule()

    expect(() => getChannelTalkAnonymousId()).not.toThrow()
    expect(getChannelTalkAnonymousId()).toBeTruthy()
  })

  it("returns undefined on the server", async () => {
    vi.stubGlobal("window", undefined)
    const { getChannelTalkAnonymousId } = await loadModule()

    expect(getChannelTalkAnonymousId()).toBeUndefined()
  })
})

describe("chatbot sound mute storage", () => {
  it("loads and toggles mute when localStorage is blocked", async () => {
    const storage = memoryStorage()
    storage.getItem = vi.fn(() => { throw new DOMException("denied", "SecurityError") })
    storage.setItem = vi.fn(() => { throw new DOMException("denied", "SecurityError") })
    vi.stubGlobal("window", { localStorage: storage })

    const sound = await import("@/lib/chatbot/sound")
    expect(sound.isMuted()).toBe(false)
    expect(() => sound.setMuted(true)).not.toThrow()
    expect(sound.isMuted()).toBe(true)
  })
})
