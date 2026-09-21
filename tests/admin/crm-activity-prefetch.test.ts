/**
 * P1a — CRM 기록 화면 서버 프리페치의 보안·계약(tests/admin/crm-home-prefetch.test.ts와 같은 패턴).
 *
 * 고정하는 것:
 *  - 미검증·역할 부족·검증 자체 실패면 리포지토리를 부르지 않고 null(레인 없음).
 *  - 허용 역할이면 즉시 레인({promise, generatedAt})으로 온다(settle을 기다리지 않는다).
 *  - listCrmCustomerEvents에 넘기는 인자가 CrmActivityClient의 첫 마운트 기본값(스코프 work·
 *    필터 전체·limit 50·offset 0)과 같다 — defaultActivityEventsUrl()이 그 기본값으로 만드는
 *    URL과 어긋나면 프리페치 시드가 캐시 미스로 조용히 떨어진다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { defaultActivityEventsUrl } from "@/lib/crm/activity-events-url"

const getVerifiedAdminContextForPage = vi.fn()
const listCrmCustomerEvents = vi.fn()

vi.mock("@/lib/admin/page-auth", () => ({ getVerifiedAdminContextForPage }))
vi.mock("@/lib/repositories/crm-events", async () => {
  const actual = await vi.importActual<typeof import("@/lib/repositories/crm-events")>("@/lib/repositories/crm-events")
  return {
    ...actual,
    listCrmCustomerEvents,
  }
})

const EVENTS_RESULT = {
  generatedAt: "2026-09-21T00:00:00.000Z",
  health: { ok: true, message: null },
  summary: { total: 3, returned: 3, recordings: 0, risks: 0, openNextActions: 1 },
  pagination: { limit: 50, offset: 0, returned: 3, total: 3, hasMore: false, nextOffset: null },
  rows: [],
}
const NOW = new Date("2026-09-21T00:00:00.000Z")

async function loadPrefetch() {
  const mod = await import("@/lib/admin/crm/activity-prefetch")
  return mod.prefetchCrmActivityInitialData
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  vi.clearAllMocks()
  listCrmCustomerEvents.mockResolvedValue(EVENTS_RESULT)
})

afterEach(() => {
  vi.useRealTimers()
})

describe("prefetchCrmActivityInitialData 보안 게이트", () => {
  it("검증 컨텍스트가 없으면 조회를 부르지 않고 null(레인 없음)을 돌려준다", async () => {
    getVerifiedAdminContextForPage.mockResolvedValue(null)

    const prefetch = await loadPrefetch()
    expect(await prefetch()).toBeNull()

    expect(listCrmCustomerEvents).not.toHaveBeenCalled()
  })

  it("CRM 허용 역할이 아니면(PARTNER) 조회를 부르지 않는다", async () => {
    getVerifiedAdminContextForPage.mockResolvedValue({ role: "PARTNER", userId: "u1" })

    const prefetch = await loadPrefetch()
    expect(await prefetch()).toBeNull()

    expect(listCrmCustomerEvents).not.toHaveBeenCalled()
  })

  it("검증 자체가 던져도 페이지를 500으로 만들지 않고 null로 떨어진다", async () => {
    getVerifiedAdminContextForPage.mockRejectedValue(new Error("supabase env missing"))
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    const prefetch = await loadPrefetch()
    expect(await prefetch()).toBeNull()

    errorSpy.mockRestore()
  })
})

describe("prefetchCrmActivityInitialData 데이터 조립 — 스트리밍 계약(레인 반환)", () => {
  it("허용 역할이면 즉시 레인({promise, generatedAt})으로 온다 — settle을 기다리지 않는다", async () => {
    getVerifiedAdminContextForPage.mockResolvedValue({ role: "EDITOR", userId: "u1" })
    listCrmCustomerEvents.mockImplementation(() => new Promise(() => {}))

    const prefetch = await loadPrefetch()
    const lane = await prefetch()

    expect(lane).not.toBeNull()
    expect(lane?.events.promise).toBeInstanceOf(Promise)
    expect(typeof lane?.events.generatedAt).toBe("number")
    expect(typeof lane?.generatedAt).toBe("string")
  })

  it("허용 역할이면 defaultActivityEventsUrl()의 기본값과 같은 인자로 조회한다(스코프 work·필터 전체·limit 50·offset 0)", async () => {
    getVerifiedAdminContextForPage.mockResolvedValue({ role: "EDITOR", userId: "u1" })

    const prefetch = await loadPrefetch()
    const lane = await prefetch()
    await vi.advanceTimersByTimeAsync(0)

    if (!lane) throw new Error("허용 역할인데 레인이 null이다")
    await expect(lane.events.promise).resolves.toEqual(EVENTS_RESULT)

    expect(listCrmCustomerEvents).toHaveBeenCalledTimes(1)
    const [args] = listCrmCustomerEvents.mock.calls[0]
    expect(args).toMatchObject({
      targetType: "all",
      sourceType: "all",
      sentiment: "all",
      limit: 50,
      offset: 0,
    })
    // 스코프 "work" — 클라이언트가 scope=work일 때 sourceTypes로 CRM_WORK_ACTIVITY_SOURCE_TYPES를
    // 넘기는 것과 같은 값이어야 한다(라우트 GET의 분기와 동일한 계약).
    expect(Array.isArray(args.sourceTypes)).toBe(true)
    expect(args.sourceTypes.length).toBeGreaterThan(0)

    // defaultActivityEventsUrl()이 참조 가능해야 한다(빌드 타임 계약 — 존재 자체를 확인).
    expect(defaultActivityEventsUrl()).toBe("/api/admin/crm/events?limit=50&offset=0&scope=work")
  })

  it("조회 자체가 실패해도 레인은 null로 settle된다(500 없음)", async () => {
    getVerifiedAdminContextForPage.mockResolvedValue({ role: "SUPER_ADMIN", userId: "u1" })
    listCrmCustomerEvents.mockRejectedValue(new Error("db down"))
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    const prefetch = await loadPrefetch()
    const lane = await prefetch()
    await vi.advanceTimersByTimeAsync(0)

    if (!lane) throw new Error("허용 역할인데 레인이 null이다")
    await expect(lane.events.promise).resolves.toBeNull()
    errorSpy.mockRestore()
  })
})
