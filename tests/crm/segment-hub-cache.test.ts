/**
 * 세그먼트 허브 목록 캐시(리뷰 P2 회귀) — 강등 응답(라이브 평가 실패·추이 실패·표 미적용)은 서버가 no-store 로
 * 주므로 화면 캐시(메모리·sessionStorage, CRM TTL 120초)에도 남기지 않는다. adminFetchJsonCached 는 저장 조건
 * 옵션이 없어, 받은 뒤 clearAdminRequestCache(url) 로 지우는지를 고정한다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const client = vi.hoisted(() => ({
  adminFetchJson: vi.fn(),
  adminFetchJsonCached: vi.fn(),
  clearAdminRequestCache: vi.fn(),
  getCachedAdminJson: vi.fn(),
}))

vi.mock("@/lib/admin-client", () => client)

import {
  fetchSegmentList,
  isSegmentListCacheable,
  readCachedSegmentList,
  segmentsListUrl,
} from "@/components/admin/crm/segments/segment-hub-api"
import { CRM_CACHE_SWR_MS, CRM_CACHE_TTL_MS } from "@/lib/crm/client-cache"
import type { SavedSegmentListResponse } from "@/lib/crm/saved-segment-api"

const URL_ALL = segmentsListUrl("all", false)
const URL_TEAM = segmentsListUrl("team", false)

function listBody(partial: Partial<SavedSegmentListResponse> = {}): SavedSegmentListResponse {
  return {
    available: true,
    warning: null,
    trendWarning: null,
    generatedAt: "2026-09-25T03:00:00.000Z",
    scopeCounts: { all: 1, team: 1, mine: 0 },
    live: { ok: true, compass: "ok", neoStale: false, neoLatestSyncedAt: "2026-09-24T01:00:00.000Z" },
    segments: [],
    ...partial,
  }
}

const HEALTHY = listBody()
const LIVE_FAILED = listBody({ live: { ok: false, compass: "ok", neoStale: false, neoLatestSyncedAt: null } })
const TREND_FAILED = listBody({ trendWarning: "일별 기록을 불러오지 못해 추이가 비어 있습니다." })
const NOT_READY = listBody({
  available: false,
  warning: "세그먼트 표가 아직 적용되지 않았습니다.",
  live: { ok: false, compass: "skipped", neoStale: false, neoLatestSyncedAt: null },
})

beforeEach(() => {
  for (const fn of Object.values(client)) fn.mockReset()
})

describe("isSegmentListCacheable — 강등 응답 판정", () => {
  it("정상만 캐시 가능, 평가 실패·추이 실패·표 미적용은 불가", () => {
    expect(isSegmentListCacheable(HEALTHY)).toBe(true)
    expect(isSegmentListCacheable(LIVE_FAILED)).toBe(false)
    expect(isSegmentListCacheable(TREND_FAILED)).toBe(false)
    expect(isSegmentListCacheable(NOT_READY)).toBe(false)
    // NEO 오래됨·Compass 끊김은 강등이 아니라 원천 상태(서버도 캐시 헤더를 준다) — 캐시 가능
    expect(isSegmentListCacheable(listBody({ live: { ok: true, compass: "down", neoStale: true, neoLatestSyncedAt: null } }))).toBe(true)
  })
})

describe("fetchSegmentList — CRM 캐시 창을 쓰되 강등 응답은 받은 즉시 지운다", () => {
  it("정상 응답은 캐시에 둔다(지우지 않음) — CRM TTL·SWR 창·cacheKey=url", async () => {
    client.adminFetchJsonCached.mockResolvedValueOnce(HEALTHY)
    const data = await fetchSegmentList(URL_ALL)
    expect(data.live.ok).toBe(true)
    expect(client.clearAdminRequestCache).not.toHaveBeenCalled()
    const [url, init, options] = client.adminFetchJsonCached.mock.calls[0]
    expect(url).toBe(URL_ALL)
    expect(init).toBeUndefined()
    expect(options).toMatchObject({ cacheKey: URL_ALL, ttlMs: CRM_CACHE_TTL_MS, staleWhileRevalidateMs: CRM_CACHE_SWR_MS })
  })

  it.each([
    ["라이브 평가 실패(live.ok=false)", LIVE_FAILED],
    ["추이 읽기 실패(trendWarning)", TREND_FAILED],
    ["표 미적용(available:false)", NOT_READY],
  ])("%s 응답은 그리되 캐시에서 지운다 — 탭 복귀·새로 고침이 120초 동안 같은 강등 목록을 재사용하지 않게", async (_label, body) => {
    client.adminFetchJsonCached.mockResolvedValueOnce(body)
    const data = await fetchSegmentList(URL_TEAM, { force: true })
    expect(isSegmentListCacheable(data)).toBe(false)
    expect(client.clearAdminRequestCache).toHaveBeenCalledTimes(1)
    expect(client.clearAdminRequestCache).toHaveBeenCalledWith(URL_TEAM)
    expect(client.adminFetchJsonCached.mock.calls[0][2]).toMatchObject({ force: true })
  })

  it("백그라운드 갱신(onRevalidated) 결과가 강등이면 그것도 지우고, 정상이면 그대로 넘긴다", async () => {
    client.adminFetchJsonCached.mockResolvedValueOnce(HEALTHY)
    const onRevalidated = vi.fn()
    await fetchSegmentList(URL_ALL, { onRevalidated })
    const options = client.adminFetchJsonCached.mock.calls[0][2] as {
      onRevalidated: (result: { data?: unknown; error?: unknown }) => void
    }

    options.onRevalidated({ data: LIVE_FAILED })
    expect(onRevalidated).toHaveBeenLastCalledWith(expect.objectContaining({ live: expect.objectContaining({ ok: false }) }))
    expect(client.clearAdminRequestCache).toHaveBeenCalledWith(URL_ALL)

    client.clearAdminRequestCache.mockClear()
    options.onRevalidated({ data: HEALTHY })
    expect(onRevalidated).toHaveBeenCalledTimes(2)
    expect(client.clearAdminRequestCache).not.toHaveBeenCalled()

    // 갱신 실패({error})는 화면을 바꾸지 않는다
    options.onRevalidated({ error: new Error("timeout") })
    expect(onRevalidated).toHaveBeenCalledTimes(2)
  })
})

describe("readCachedSegmentList — 즉시 그리기용 캐시 읽기", () => {
  it("캐시가 없으면 null", () => {
    client.getCachedAdminJson.mockReturnValueOnce(null)
    expect(readCachedSegmentList(URL_ALL)).toBeNull()
    expect(client.getCachedAdminJson).toHaveBeenCalledWith(URL_ALL, { cacheKey: URL_ALL })
    expect(client.clearAdminRequestCache).not.toHaveBeenCalled()
  })

  it("정상 캐시는 그대로 돌려준다", () => {
    client.getCachedAdminJson.mockReturnValueOnce(HEALTHY)
    expect(readCachedSegmentList(URL_ALL)?.live.ok).toBe(true)
    expect(client.clearAdminRequestCache).not.toHaveBeenCalled()
  })

  it("남아 있던 강등 캐시(이 수정 전 저장분)는 그리되 지워, 이어지는 조회가 네트워크로 간다", () => {
    client.getCachedAdminJson.mockReturnValueOnce(LIVE_FAILED)
    expect(readCachedSegmentList(URL_ALL)?.live.ok).toBe(false)
    expect(client.clearAdminRequestCache).toHaveBeenCalledWith(URL_ALL)
  })
})
