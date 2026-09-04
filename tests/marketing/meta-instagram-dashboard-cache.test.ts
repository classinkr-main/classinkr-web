// lib/meta/marketing.ts — getMetaInstagramDashboard Data Cache 배선 회귀 가드 (2026-09-04).
//
// 배경: 이 함수는 기존에 어떤 메모도 없었다(같은 이름의 getMetaCampaignDashboard와 달리,
// dashboardMemo 45초 Map은 그 함수 전용이었다) — Instagram 대시보드는 매 요청 Graph API를
// 다시 불렀다(계정+미디어+미디어당 인사이트, 최대 limit개). unstable_cache(300초, 외부
// 데이터라 자주 안 바뀜)로 감싼다. 실패는 캐시하지 않는다 — unstable_cache는 함수가
// reject하면 아무 값도 저장하지 않으므로(옛 "실패 promise 즉시 비움" 모듈 메모 관례와
// 결과적으로 동일), 별도 방어 코드 없이 다음 호출이 저절로 재시도한다.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const ACCOUNT_ENV = {
  META_ACCESS_TOKEN: "test-token",
  META_INSTAGRAM_BUSINESS_ACCOUNT_ID: "ig-123",
}
const savedEnv: Record<string, string | undefined> = {}

function jsonResponse(body: unknown, ok = true) {
  return {
    ok,
    status: ok ? 200 : 400,
    json: async () => body,
  }
}

const ACCOUNT_BODY = {
  id: "ig-123",
  username: "classin",
  name: "Classin",
  followers_count: 100,
  follows_count: 10,
  media_count: 0,
  profile_picture_url: null,
  website: null,
  biography: null,
  data: [], // media/insights 응답도 겸한다 — data:[]면 media map/insights 루프가 비어 추가 fetch가 없다.
}

async function loadMetaMarketing() {
  vi.resetModules()
  const capturedTags: Record<string, string[]> = {}
  const fetchMock = vi.fn(async () => jsonResponse(ACCOUNT_BODY))
  vi.stubGlobal("fetch", fetchMock)

  vi.doMock("next/cache", () => {
    const stores = new Map<string, Map<string, unknown>>()
    return {
      unstable_cache: (
        fn: (...args: unknown[]) => Promise<unknown>,
        keyParts: string[],
        options?: { revalidate?: number; tags?: string[] },
      ) => {
        const cacheKey = keyParts.join("|")
        capturedTags[cacheKey] = options?.tags ?? []
        if (!stores.has(cacheKey)) stores.set(cacheKey, new Map())
        const s = stores.get(cacheKey)!
        return async (...args: unknown[]) => {
          const argsKey = JSON.stringify(args)
          if (s.has(argsKey)) return s.get(argsKey)
          const result = await fn(...args)
          s.set(argsKey, result)
          return result
        }
      },
    }
  })

  const mod = await import("@/lib/meta/marketing")
  return { ...mod, fetchMock, capturedTags }
}

describe("getMetaInstagramDashboard — unstable_cache 배선", () => {
  beforeEach(() => {
    for (const [key, value] of Object.entries(ACCOUNT_ENV)) {
      savedEnv[key] = process.env[key]
      process.env[key] = value
    }
    vi.resetModules()
  })

  afterEach(() => {
    for (const key of Object.keys(ACCOUNT_ENV)) {
      if (savedEnv[key] === undefined) delete process.env[key]
      else process.env[key] = savedEnv[key]
    }
    vi.unstubAllGlobals()
    vi.doUnmock("next/cache")
    vi.resetModules()
  })

  it("datePreset·limit 키로 300초 캐시한다", async () => {
    const { getMetaInstagramDashboard, capturedTags } = await loadMetaMarketing()
    await getMetaInstagramDashboard({ datePreset: "last_7d", limit: 10 })

    const call = Object.entries(capturedTags).find(([key]) => key.startsWith("meta-instagram-dashboard"))
    expect(call).toBeDefined()
    const [, tags] = call!
    expect(tags).toHaveLength(1)
    expect(tags[0]).toMatch(/instagram/i)
  })

  it("같은 인자로 두 번 부르면 Graph API를 다시 부르지 않는다", async () => {
    const { getMetaInstagramDashboard, fetchMock } = await loadMetaMarketing()

    await getMetaInstagramDashboard({ datePreset: "last_7d", limit: 10 })
    const callsAfterFirst = fetchMock.mock.calls.length
    await getMetaInstagramDashboard({ datePreset: "last_7d", limit: 10 })

    expect(fetchMock.mock.calls.length).toBe(callsAfterFirst)
  })

  it("datePreset이 다르면 별도 엔트리로 Graph API를 다시 부른다", async () => {
    const { getMetaInstagramDashboard, fetchMock } = await loadMetaMarketing()

    await getMetaInstagramDashboard({ datePreset: "last_7d", limit: 10 })
    const callsAfterFirst = fetchMock.mock.calls.length
    await getMetaInstagramDashboard({ datePreset: "last_30d", limit: 10 })

    expect(fetchMock.mock.calls.length).toBeGreaterThan(callsAfterFirst)
  })

  it("실패는 캐시하지 않는다 — 다음 호출이 재시도해 성공할 수 있다", async () => {
    const { getMetaInstagramDashboard, fetchMock } = await loadMetaMarketing()
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { message: "boom" } }, false))

    await expect(getMetaInstagramDashboard({ datePreset: "last_7d", limit: 10 })).rejects.toThrow()

    const dashboard = await getMetaInstagramDashboard({ datePreset: "last_7d", limit: 10 })
    expect(dashboard.account.username).toBe("classin")
  })

  it("반환된 대시보드는 계정 정보를 그대로 담는다", async () => {
    const { getMetaInstagramDashboard } = await loadMetaMarketing()
    const dashboard = await getMetaInstagramDashboard({ datePreset: "last_7d", limit: 10 })

    expect(dashboard.account.username).toBe("classin")
    expect(dashboard.account.followersCount).toBe(100)
    expect(dashboard.media).toEqual([])
  })
})
