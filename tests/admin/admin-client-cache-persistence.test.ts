/**
 * 어드민 요청 캐시의 지속성 계약.
 *
 * 고정하는 두 가지 회귀:
 *  1) 프루너가 전역 5분 상수로 엔트리를 지워, 호출부가 요청한 stale-while-revalidate 창
 *     (CRM 홈 10분)을 절반에서 잘라먹던 문제.
 *  2) 지속 계층이 sessionStorage뿐이라 새 탭·브라우저 재시작이면 무조건 콜드였던 문제.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// 브라우저 Storage 흉내 — 항목은 own 프로퍼티, 메서드는 프로토타입에 둬야
// Object.keys(storage)가 실제 Storage처럼 저장된 키만 돌려준다(프루너가 이걸 쓴다).
class MemoryStorage {
  getItem(key: string): string | null {
    return Object.prototype.hasOwnProperty.call(this, key) ? (this as never as Record<string, string>)[key] : null
  }
  setItem(key: string, value: string) {
    ;(this as never as Record<string, string>)[key] = String(value)
  }
  removeItem(key: string) {
    delete (this as never as Record<string, string>)[key]
  }
  clear() {
    for (const key of Object.keys(this)) this.removeItem(key)
  }
}

const CACHE_PREFIX = "admin_request_cache:"
// 지속 키에는 배포 토큰(NEXT_PUBLIC_ADMIN_CACHE_BUILD)이 섞인다. 테스트 환경에는 값이 없어
// 폴백 "dev"가 쓰인다 — admin-client의 ADMIN_CACHE_BUILD 폴백과 같은 값이어야 한다.
const CACHE_BUILD = "dev"
const CRM_URL = "/api/admin/crm/overview"
const OTHER_URL = "/api/admin/blog/posts"
const storageKey = (url: string) => `${CACHE_PREFIX}${CACHE_BUILD}:GET:${url}`

let sessionStore: MemoryStorage
let localStore: MemoryStorage
let client: typeof import("@/lib/admin-client")

beforeEach(async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-08-28T00:00:00Z"))

  sessionStore = new MemoryStorage()
  localStore = new MemoryStorage()
  const win = {
    sessionStorage: sessionStore,
    localStorage: localStore,
    setTimeout: globalThis.setTimeout.bind(globalThis),
  }
  Object.assign(globalThis, {
    window: win,
    sessionStorage: sessionStore,
    localStorage: localStore,
  })

  vi.resetModules()
  client = await import("@/lib/admin-client")
})

afterEach(() => {
  vi.useRealTimers()
  for (const key of ["window", "sessionStorage", "localStorage"]) {
    delete (globalThis as never as Record<string, unknown>)[key]
  }
})

/** 저장소 프루너는 쓰기 뒤 idle에 예약된다 — 그 예약을 실제로 돌린다. */
function runScheduledPrune() {
  client.seedAdminRequestCache("/api/admin/ops/heartbeat", { tick: true }, { ttlMs: 1_000 })
  vi.advanceTimersByTime(600)
}

describe("엔트리별 보존창(keepUntil)", () => {
  it("10분 창을 요청한 엔트리는 6분 뒤 프루너를 통과한다", () => {
    client.seedAdminRequestCache(CRM_URL, { v: 1 }, { ttlMs: 120_000, staleWhileRevalidateMs: 600_000 })

    vi.advanceTimersByTime(6 * 60_000)
    runScheduledPrune()

    expect(client.getCachedAdminJson(CRM_URL, { allowExpired: true })).toEqual({ v: 1 })
  })

  it("기본 창(5분)만 요청한 엔트리는 6분 뒤 정리된다", () => {
    client.seedAdminRequestCache(OTHER_URL, { v: 2 }, { ttlMs: 45_000 })

    vi.advanceTimersByTime(6 * 60_000)
    runScheduledPrune()

    expect(client.getCachedAdminJson(OTHER_URL, { allowExpired: true })).toBeNull()
  })

  it("keepUntil이 없는 레거시 엔트리는 기존 5분 규칙으로 정리된다", () => {
    const savedAt = Date.now() - 6 * 60_000
    sessionStore.setItem(
      storageKey(OTHER_URL),
      JSON.stringify({ data: { legacy: true }, expiresAt: savedAt + 45_000, savedAt })
    )

    runScheduledPrune()

    expect(client.getCachedAdminJson(OTHER_URL, { allowExpired: true })).toBeNull()
  })

  it("보존창은 상한(30분)을 넘지 않는다", () => {
    client.seedAdminRequestCache(CRM_URL, { v: 3 }, { ttlMs: 1_000, staleWhileRevalidateMs: 24 * 60 * 60_000 })

    vi.advanceTimersByTime(31 * 60_000)
    runScheduledPrune()

    expect(client.getCachedAdminJson(CRM_URL, { allowExpired: true })).toBeNull()
  })
})

describe("지속 계층 선택", () => {
  it("CRM 스코프는 localStorage에, 그 외 어드민은 sessionStorage에 쓴다", () => {
    client.seedAdminRequestCache(CRM_URL, { v: 1 }, { ttlMs: 120_000 })
    client.seedAdminRequestCache(OTHER_URL, { v: 2 }, { ttlMs: 120_000 })

    expect(localStore.getItem(storageKey(CRM_URL))).not.toBeNull()
    expect(sessionStore.getItem(storageKey(CRM_URL))).toBeNull()

    expect(sessionStore.getItem(storageKey(OTHER_URL))).not.toBeNull()
    expect(localStore.getItem(storageKey(OTHER_URL))).toBeNull()
  })

  it("persistTo로 계층을 덮어쓸 수 있다", () => {
    client.seedAdminRequestCache(OTHER_URL, { v: 2 }, { ttlMs: 120_000, persistTo: "local" })

    expect(localStore.getItem(storageKey(OTHER_URL))).not.toBeNull()
    expect(sessionStore.getItem(storageKey(OTHER_URL))).toBeNull()
  })

  it("새 탭·브라우저 재시작(sessionStorage 소실)을 넘어 CRM 캐시가 살아남는다", async () => {
    client.seedAdminRequestCache(CRM_URL, { v: 1 }, { ttlMs: 120_000, staleWhileRevalidateMs: 600_000 })

    // 새 탭 = 세션 저장소도 메모리 캐시도 없는 상태에서 모듈이 다시 로드된다.
    sessionStore.clear()
    vi.resetModules()
    const freshClient = await import("@/lib/admin-client")

    expect(freshClient.getCachedAdminJson(CRM_URL, { allowExpired: true })).toEqual({ v: 1 })
  })
})

describe("무효화", () => {
  it("스코프 무효화가 localStorage 계층도 비운다", () => {
    client.seedAdminRequestCache(CRM_URL, { v: 1 }, { ttlMs: 120_000 })
    client.seedAdminRequestCache(OTHER_URL, { v: 2 }, { ttlMs: 120_000 })

    client.clearAdminRequestCache("/api/admin/crm")

    expect(client.getCachedAdminJson(CRM_URL, { allowExpired: true })).toBeNull()
    expect(localStore.getItem(storageKey(CRM_URL))).toBeNull()
    // 다른 스코프는 건드리지 않는다.
    expect(client.getCachedAdminJson(OTHER_URL, { allowExpired: true })).toEqual({ v: 2 })
  })

  it("로그아웃 정리가 두 계층을 모두 비운다", () => {
    client.seedAdminRequestCache(CRM_URL, { v: 1 }, { ttlMs: 120_000 })
    client.seedAdminRequestCache(OTHER_URL, { v: 2 }, { ttlMs: 120_000 })

    client.clearAdminSessionStorage()

    expect(localStore.getItem(storageKey(CRM_URL))).toBeNull()
    expect(sessionStore.getItem(storageKey(OTHER_URL))).toBeNull()
  })
})

describe("배포 토큰(캐시 스키마 버전)", () => {
  /** 이전 배포가 남긴 엔트리 — 읽기 키의 배포 토큰만 다르다. */
  function seedPreviousDeployEntry(url: string, data: unknown, store: MemoryStorage = localStore) {
    const savedAt = Date.now()
    store.setItem(
      `${CACHE_PREFIX}previous:GET:${url}`,
      JSON.stringify({ data, expiresAt: savedAt + 120_000, savedAt, keepUntil: savedAt + 600_000 })
    )
  }

  it("쓰기 키에 배포 토큰이 들어간다 — 토큰을 빼면 이 테스트가 깨진다", () => {
    client.seedAdminRequestCache(CRM_URL, { homepageTotal: 4 }, { ttlMs: 120_000 })

    expect(localStore.getItem(storageKey(CRM_URL))).not.toBeNull()
    // 버전 없는 옛 키 자리에는 쓰지 않는다(= 옛 배포와 슬롯을 공유하지 않는다).
    expect(localStore.getItem(`${CACHE_PREFIX}GET:${CRM_URL}`)).toBeNull()
  })

  it("버전 없이 저장된 옛 배포 엔트리는 읽지 않는다 — 이번 배포가 곧 이 상황이다", () => {
    // 이 변경 이전 코드가 쓰던 키 형식 그대로. 필드명이 바뀐 응답이 여기 남아 있었다.
    const savedAt = Date.now()
    localStore.setItem(
      `${CACHE_PREFIX}GET:${CRM_URL}`,
      JSON.stringify({ data: { contactPageTotal: 4 }, expiresAt: savedAt + 120_000, savedAt })
    )

    expect(client.getCachedAdminJson(CRM_URL, { allowExpired: true })).toBeNull()
  })

  it("다른 배포 토큰으로 저장된 엔트리도 읽지 않는다", () => {
    seedPreviousDeployEntry(CRM_URL, { contactPageTotal: 4 })

    expect(client.getCachedAdminJson(CRM_URL, { allowExpired: true })).toBeNull()
  })

  it("그래도 스코프 무효화는 이전 배포 엔트리까지 지운다 — 고정 접두사로 훑기 때문", () => {
    seedPreviousDeployEntry(CRM_URL, { contactPageTotal: 4 })

    client.clearAdminRequestCache("/api/admin/crm")

    expect(localStore.getItem(`${CACHE_PREFIX}previous:GET:${CRM_URL}`)).toBeNull()
  })

  it("로그아웃 정리도 이전 배포 엔트리를 남기지 않는다", () => {
    seedPreviousDeployEntry(CRM_URL, { contactPageTotal: 4 })
    seedPreviousDeployEntry(OTHER_URL, { legacy: true }, sessionStore)

    client.clearAdminSessionStorage()

    expect(localStore.getItem(`${CACHE_PREFIX}previous:GET:${CRM_URL}`)).toBeNull()
    expect(sessionStore.getItem(`${CACHE_PREFIX}previous:GET:${OTHER_URL}`)).toBeNull()
  })

  it("프루너가 보존창을 넘긴 이전 배포 엔트리를 스스로 정리한다(저장소에 영구 적재 방지)", () => {
    seedPreviousDeployEntry(CRM_URL, { contactPageTotal: 4 })

    vi.advanceTimersByTime(11 * 60_000)
    runScheduledPrune()

    expect(localStore.getItem(`${CACHE_PREFIX}previous:GET:${CRM_URL}`)).toBeNull()
  })
})

describe("서버 프리페치 시드", () => {
  it("시드한 값은 네트워크 없이 즉시 읽힌다", () => {
    client.seedAdminRequestCache(CRM_URL, { seeded: true }, { ttlMs: 120_000 })
    expect(client.getCachedAdminJson(CRM_URL)).toEqual({ seeded: true })
  })

  it("이미 더 최신 엔트리가 있으면 덮어쓰지 않는다", () => {
    client.seedAdminRequestCache(CRM_URL, { fresh: true }, { ttlMs: 120_000 })
    client.seedAdminRequestCache(CRM_URL, { older: true }, { ttlMs: 120_000 })

    expect(client.getCachedAdminJson(CRM_URL)).toEqual({ fresh: true })
  })
})
