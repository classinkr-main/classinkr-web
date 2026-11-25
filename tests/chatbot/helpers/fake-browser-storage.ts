import { vi } from "vitest"

// 시험용 브라우저 저장소. node 환경에 window·document 를 세우고, blocked 면 저장소에 손대는 순간 SecurityError 를 던진다
// (Safari '모든 쿠키 차단'·샌드박스 iframe 흉내).

export class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()

  get length() {
    return this.values.size
  }

  clear() {
    this.values.clear()
  }

  getItem(key: string) {
    return this.values.has(key) ? (this.values.get(key) as string) : null
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null
  }

  removeItem(key: string) {
    this.values.delete(key)
  }

  setItem(key: string, value: string) {
    this.values.set(key, String(value))
  }
}

export interface FakeBrowser {
  localStorage: MemoryStorage
  sessionStorage: MemoryStorage
  setCookie: (value: string) => void
}

export function installFakeBrowser(options: { blocked?: boolean; href?: string } = {}): FakeBrowser {
  const localStorage = new MemoryStorage()
  const sessionStorage = new MemoryStorage()
  let cookie = ""
  const blocked = () => {
    throw new DOMException("The operation is insecure.", "SecurityError")
  }
  const href = options.href ?? "https://classin.kr/"
  const url = new URL(href)
  const windowStub = {
    location: { href, origin: url.origin, pathname: url.pathname, search: url.search },
    dispatchEvent: vi.fn(),
  }
  Object.defineProperty(windowStub, "localStorage", {
    get: options.blocked ? blocked : () => localStorage,
    configurable: true,
  })
  Object.defineProperty(windowStub, "sessionStorage", {
    get: options.blocked ? blocked : () => sessionStorage,
    configurable: true,
  })
  vi.stubGlobal("window", windowStub)
  vi.stubGlobal("document", {
    get cookie() {
      return cookie
    },
    set cookie(value: string) {
      cookie = value
    },
    querySelector: () => null,
    getElementsByTagName: () => [],
    createElement: () => ({}),
  })
  return {
    localStorage,
    sessionStorage,
    setCookie: (value) => {
      cookie = value
    },
  }
}

/** cln_consent 쿠키 글(lib/consent/consent.ts 의 parseConsent 가 읽는 꼴). */
export function consentCookie(version: string, choice: { analytics: boolean; marketing: boolean }) {
  return `cln_consent=${encodeURIComponent(JSON.stringify({ v: version, ...choice, ts: 1 }))}`
}
