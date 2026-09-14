/**
 * warmAdminRequestCacheQueued의 동시성 계약.
 *
 * 횡단 인프라 감사(2026-09-10) 실측 회귀 대상: 예전 구현은 호출 하나마다 자기만의 cursor와
 * 워커 3개를 새로 띄웠다 — AdminSidebar가 탭 A를 hover(큐 investir n개)한 직후 탭 B를
 * hover하면(사이드바를 훑듯 빠르게 옮겨다니는 실제 사용 패턴) 큐가 두 개가 되어 동시
 * in-flight 예열 요청이 3(의도한 상한)이 아니라 최대 6까지 쌓일 수 있었다. 이 테스트는
 * "여러 번의 warmAdminRequestCacheQueued 호출이 있어도 실제 동시 fetch가 3을 넘지 않는다"를
 * 고정한다 — 예전 구현으로는 이 테스트가 깨진다(피크가 3+2=5).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

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

let client: typeof import("@/lib/admin-client")

/** 마이크로태스크 체인(adminFetch → adminFetchJson → adminFetchJsonCachedInternal →
 *  warmAdminRequestCache → pumpWarmQueue)이 여러 .then/.finally를 거치므로, 실제 매크로태스크
 *  틱을 몇 번 흘려보내 전부 settle되게 한다(실 타이머 사용 — 이 파일은 fake timer를 쓰지 않는다). */
async function tick(times = 5) {
  for (let i = 0; i < times; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

beforeEach(async () => {
  const sessionStore = new MemoryStorage()
  const localStore = new MemoryStorage()
  Object.assign(globalThis, {
    window: { sessionStorage: sessionStore, localStorage: localStore },
    sessionStorage: sessionStore,
    localStorage: localStore,
  })

  vi.resetModules()
  client = await import("@/lib/admin-client")
})

afterEach(() => {
  vi.restoreAllMocks()
  for (const key of ["window", "sessionStorage", "localStorage", "fetch", "navigator", "document"]) {
    delete (globalThis as never as Record<string, unknown>)[key]
  }
})

describe("warmAdminRequestCacheQueued — 모듈 전역 동시성", () => {
  it("두 번의 호출이 겹쳐도 실제 동시 fetch는 WARM_QUEUE_CONCURRENCY(3)를 넘지 않는다", async () => {
    let inFlight = 0
    let maxInFlight = 0
    const pendingResolvers: Array<() => void> = []
    const requestedUrls: string[] = []

    globalThis.fetch = vi.fn((input: unknown) => {
      const url = String(input)
      requestedUrls.push(url)
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      return new Promise((resolve) => {
        pendingResolvers.push(() => {
          inFlight--
          resolve({
            ok: true,
            status: 200,
            statusText: "OK",
            json: async () => ({ url }),
          } as Response)
        })
      })
    }) as unknown as typeof fetch

    // 탭 A hover → 큐에 4개 투입. 곧이어(같은 프레임 근처) 탭 B hover → 큐에 2개 추가 투입.
    // 총 6개, 동시성 상한은 3.
    client.warmAdminRequestCacheQueued(["/api/admin/a1", "/api/admin/a2", "/api/admin/a3", "/api/admin/a4"])
    client.warmAdminRequestCacheQueued(["/api/admin/b1", "/api/admin/b2"])

    await tick()

    expect(inFlight).toBeLessThanOrEqual(3)
    expect(maxInFlight).toBeLessThanOrEqual(3)
    expect(maxInFlight).toBeGreaterThan(0) // 실제로 요청이 나가긴 했는지(테스트 자체의 유효성)

    // 순서대로 다 풀어주며 나머지 3개가 뒤이어 시작되는지, 총 6개가 전부 처리되는지 확인한다.
    while (pendingResolvers.length > 0) {
      pendingResolvers.shift()!()
      await tick()
      expect(inFlight).toBeLessThanOrEqual(3)
    }

    expect(requestedUrls.sort()).toEqual(
      ["/api/admin/a1", "/api/admin/a2", "/api/admin/a3", "/api/admin/a4", "/api/admin/b1", "/api/admin/b2"].sort()
    )
    expect(inFlight).toBe(0)
  })

  it("커스텀 cacheKey가 있는 항목도 큐를 통해 정상적으로 fetch된다", async () => {
    const requestedUrls: string[] = []
    globalThis.fetch = vi.fn((input: unknown) => {
      requestedUrls.push(String(input))
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({}),
      } as Response)
    }) as unknown as typeof fetch

    client.warmAdminRequestCacheQueued([
      { url: "/api/admin/marketing/perf", cacheKey: "marketing-perf:30d" },
    ])

    await tick()

    expect(requestedUrls).toEqual(["/api/admin/marketing/perf"])
    // persist 기본값(false)이라 세션/로컬 스토리지에는 쓰지 않는다 — 예열은 메모리 캐시만 채운다.
    expect(client.getCachedAdminJson("/api/admin/marketing/perf", { cacheKey: "marketing-perf:30d" })).toEqual({})
  })

  it("큐가 완전히 빈 뒤에도 다음 호출이 정상적으로 워커를 다시 채운다(워커 카운터 누수 없음)", async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, status: 200, statusText: "OK", json: async () => ({}) } as Response)
    ) as unknown as typeof fetch

    client.warmAdminRequestCacheQueued(["/api/admin/first"])
    await tick()

    client.warmAdminRequestCacheQueued(["/api/admin/second"])
    await tick()

    expect(globalThis.fetch).toHaveBeenCalledTimes(2)
  })
})

// 클라이언트 캐시·번들 규약 점검(2026-09-10) — 동시성 상한(3)과는 별개로, "같은 캐시 키가
// 중복으로 큐에 쌓이는" 낭비를 잡는다. 사이드바를 훑듯 탭을 오가면 같은 URL이 메인 warm
// 표와 CrmSubnav의 두 번째 warm 표 양쪽에 등장하거나, 짧은 시간 안에 같은 탭을 두 번
// hover하는 실제 패턴이 있다 — 워커는 3개뿐이라 중복 항목이 슬롯을 하나 잡아먹는 동안
// 진짜 새 URL의 예열이 그만큼 밀린다.
describe("warmAdminRequestCacheQueued — 중복 예열 가드", () => {
  it("같은 URL이 한 호출 안에서 중복으로 들어와도 fetch는 한 번만 나간다", async () => {
    const requestedUrls: string[] = []
    globalThis.fetch = vi.fn((input: unknown) => {
      requestedUrls.push(String(input))
      return Promise.resolve({ ok: true, status: 200, statusText: "OK", json: async () => ({}) } as Response)
    }) as unknown as typeof fetch

    client.warmAdminRequestCacheQueued(["/api/admin/dup", "/api/admin/dup", "/api/admin/other"])
    await tick()

    expect(requestedUrls.sort()).toEqual(["/api/admin/dup", "/api/admin/other"])
  })

  it("이미 in-flight인 URL을 겹쳐 큐에 넣어도 fetch가 추가로 나가지 않는다", async () => {
    // url별로 resolver를 따로 보관한다 — 한 변수를 재사용하면 두 번째 fetch(예: fresh)가
    // 첫 번째(slow)의 resolver를 덮어써 slow를 영원히 pending으로 남기게 된다.
    const resolvers = new Map<string, (value: Response) => void>()
    const requestedUrls: string[] = []
    globalThis.fetch = vi.fn((input: unknown) => {
      const url = String(input)
      requestedUrls.push(url)
      return new Promise<Response>((resolve) => {
        resolvers.set(url, resolve)
      })
    }) as unknown as typeof fetch

    // 1차 호출 — /api/admin/slow가 in-flight 상태로 걸린다(아직 resolve 안 함).
    client.warmAdminRequestCacheQueued(["/api/admin/slow"])
    await tick()
    expect(requestedUrls).toEqual(["/api/admin/slow"])

    // 사이드바를 훑듯 곧이어 같은 URL을 다시 hover — 여전히 첫 요청이 끝나지 않은 상태.
    client.warmAdminRequestCacheQueued(["/api/admin/slow", "/api/admin/fresh"])
    await tick()

    // slow는 중복 발사되지 않고, fresh만 새로 나간다.
    expect(requestedUrls).toEqual(["/api/admin/slow", "/api/admin/fresh"])

    // 남겨둔 요청을 모두 정리해 다음 테스트로 pending promise가 새지 않게 한다.
    for (const resolve of resolvers.values()) {
      resolve({ ok: true, status: 200, statusText: "OK", json: async () => ({}) } as Response)
    }
    await tick()
  })

  it("커스텀 cacheKey가 같으면 URL 문자열이 달라도 같은 키로 취급해 중복을 막는다", async () => {
    const requestedUrls: string[] = []
    globalThis.fetch = vi.fn((input: unknown) => {
      requestedUrls.push(String(input))
      return Promise.resolve({ ok: true, status: 200, statusText: "OK", json: async () => ({}) } as Response)
    }) as unknown as typeof fetch

    client.warmAdminRequestCacheQueued([
      { url: "/api/admin/marketing/perf?window=30d", cacheKey: "marketing-perf:30d" },
      { url: "/api/admin/marketing/perf?window=30d", cacheKey: "marketing-perf:30d" },
    ])
    await tick()

    expect(requestedUrls).toEqual(["/api/admin/marketing/perf?window=30d"])
  })

  it("이전 요청이 완전히 끝난 뒤에는 같은 URL을 다시 예열할 수 있다(영구 차단 아님)", async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, status: 200, statusText: "OK", json: async () => ({}) } as Response)
    ) as unknown as typeof fetch

    client.warmAdminRequestCacheQueued(["/api/admin/repeat"])
    await tick()
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)

    // force로 캐시 적중을 우회해야 진짜 "다시 예열됐는지"를 fetch 호출 수로 확인할 수 있다
    // (그렇지 않으면 방금 채운 캐시에 적중해 애초에 fetch까지 가지 않는다 — 이 테스트의
    // 관심사인 "큐 중복 가드가 다음 회차까지 영구히 막지는 않는다"와는 다른 경로).
    client.warmAdminRequestCacheQueued(["/api/admin/repeat"], { force: true })
    await tick()

    expect(globalThis.fetch).toHaveBeenCalledTimes(2)
  })
})
