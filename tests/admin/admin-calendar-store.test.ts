import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const store = vi.hoisted(() => ({
  deleteStoredCalendarEvent: vi.fn(),
  getStoredCalendarEvent: vi.fn(),
  insertStoredCalendarEvent: vi.fn(),
  listStoredCalendarEvents: vi.fn(),
  updateStoredCalendarEvent: vi.fn(),
}))

const googleSync = vi.hoisted(() => ({
  deleteGoogleCalendarEvent: vi.fn(),
  isGoogleCalendarSyncConfigured: vi.fn(() => false),
  upsertGoogleCalendarEvent: vi.fn(),
}))

// admin_calendar_events 쓰기는 ADMIN_CALENDAR_EVENTS_CACHE_TAG·ADMIN_CALENDAR_HEALTH_CACHE_TAG를
// 무효화한다(2026-09-04, 월/전체 이벤트 조립·연결 상태 라우트를 unstable_cache로 감싼 라운드).
// calendar-data.ts가 임포트하는 lib/notion-marketing-calendar.ts도 모듈 로드 시점에
// withPersistentSourceCache(source-cache.ts)를 거쳐 unstable_cache를 부르므로 함께 목킹한다.
const cache = vi.hoisted(() => ({
  revalidateTag: vi.fn(),
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}))

vi.mock("@/lib/repositories/admin-calendar-events", () => store)
vi.mock("@/lib/google-calendar-sync", () => googleSync)
vi.mock("next/cache", () => cache)

import { createEvent, deleteEvent, updateEvent, type CalendarEvent } from "@/lib/calendar-data"
import {
  ADMIN_CALENDAR_EVENTS_CACHE_TAG,
  ADMIN_CALENDAR_HEALTH_CACHE_TAG,
} from "@/lib/admin-calendar/cache-tags"

const SUPABASE_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "VERCEL",
] as const

const originalEnv: Record<string, string | undefined> = {}

function enableSupabase() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co"
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "publishable-test"
  process.env.SUPABASE_SECRET_KEY = "secret-test"
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
}

function disableSupabase() {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL
  delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  delete process.env.SUPABASE_SECRET_KEY
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
}

/** Vercel 배포 환경 흉내 — 이 상태에서 로컬 JSON 쓰기는 차단된다. */
function pretendDeployed() {
  process.env.VERCEL = "1"
}

function storedEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "ev_test_1",
    title: "주간 팀 회의",
    date: "2026-08-12",
    type: "meeting",
    assignees: ["문준혁"],
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  }
}

beforeEach(() => {
  for (const key of SUPABASE_KEYS) originalEnv[key] = process.env[key]
  vi.clearAllMocks()
  googleSync.isGoogleCalendarSyncConfigured.mockReturnValue(false)
})

afterEach(() => {
  for (const key of SUPABASE_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key]
    else process.env[key] = originalEnv[key]
  }
})

describe("팀 일정 저장소 분기", () => {
  // 이 저장소 전환의 존재 이유 자체를 지키는 회귀 테스트.
  // 예전에는 createEvent 가 무조건 assertLocalJsonWriteAllowed() 를 먼저 호출해서
  // VERCEL=1 이면 무조건 throw 했다 — 프로덕션에서 일정 등록이 영구히 불가능했다.
  it("배포 환경에서도 Supabase 자격이 있으면 저장된다", async () => {
    enableSupabase()
    pretendDeployed()
    store.insertStoredCalendarEvent.mockImplementation(async (event: CalendarEvent) => event)

    const created = await createEvent({
      title: "주간 팀 회의",
      date: "2026-08-12",
      type: "meeting",
      assignees: ["문준혁"],
    })

    expect(store.insertStoredCalendarEvent).toHaveBeenCalledTimes(1)
    expect(created.title).toBe("주간 팀 회의")
    // 저장된 행은 항상 편집 가능한 "팀 일정" 소스로 정규화돼 나간다.
    expect(created.source).toBe("calendar")
    expect(created.readonly).toBe(false)
    // 새 일정이 월/전체 조립 캐시와 연결 상태 라우트의 calendar 소스 카운트에 최대 60초간
    // 안 보이지 않도록 두 태그를 함께 무효화한다.
    expect(cache.revalidateTag).toHaveBeenCalledWith(ADMIN_CALENDAR_EVENTS_CACHE_TAG, "max")
    expect(cache.revalidateTag).toHaveBeenCalledWith(ADMIN_CALENDAR_HEALTH_CACHE_TAG, "max")
  })

  it("배포 환경에서 Supabase 자격이 없으면 조용히 성공하지 않고 막는다", async () => {
    disableSupabase()
    pretendDeployed()

    await expect(
      createEvent({ title: "저장 불가", date: "2026-08-12", type: "team" })
    ).rejects.toThrow(/운영 환경에서는 로컬 JSON/)
    expect(store.insertStoredCalendarEvent).not.toHaveBeenCalled()
    expect(cache.revalidateTag).not.toHaveBeenCalled()
  })

  it("수정은 기존 행을 읽어 병합한 뒤 전체를 덮어쓴다", async () => {
    enableSupabase()
    pretendDeployed()
    store.getStoredCalendarEvent.mockResolvedValue(storedEvent({ description: "원래 메모" }))
    store.updateStoredCalendarEvent.mockImplementation(async (event: CalendarEvent) => event)

    const updated = await updateEvent("ev_test_1", { title: "이름만 변경" })

    expect(updated?.title).toBe("이름만 변경")
    // patch 에 없는 필드가 병합으로 살아남아야 한다 — 부분 업데이트가 나머지를 지우면 안 된다.
    expect(updated?.description).toBe("원래 메모")
    expect(updated?.date).toBe("2026-08-12")
    expect(updated?.updatedAt).not.toBe("2026-08-01T00:00:00.000Z")
    expect(cache.revalidateTag).toHaveBeenCalledWith(ADMIN_CALENDAR_EVENTS_CACHE_TAG, "max")
    expect(cache.revalidateTag).toHaveBeenCalledWith(ADMIN_CALENDAR_HEALTH_CACHE_TAG, "max")
  })

  it("없는 일정을 수정하면 null 을 돌려주고 캐시를 건드리지 않는다", async () => {
    enableSupabase()
    store.getStoredCalendarEvent.mockResolvedValue(null)

    expect(await updateEvent("ev_missing", { title: "x" })).toBeNull()
    expect(store.updateStoredCalendarEvent).not.toHaveBeenCalled()
    expect(cache.revalidateTag).not.toHaveBeenCalled()
  })

  it("구글 미러 삭제가 실패해도 일정 삭제는 진행되고 캐시를 무효화한다", async () => {
    enableSupabase()
    googleSync.isGoogleCalendarSyncConfigured.mockReturnValue(true)
    googleSync.deleteGoogleCalendarEvent.mockRejectedValue(new Error("google down"))
    store.getStoredCalendarEvent.mockResolvedValue(storedEvent({ googleCalendarEventId: "g_1" }))
    store.deleteStoredCalendarEvent.mockResolvedValue(true)

    expect(await deleteEvent("ev_test_1")).toBe(true)
    expect(store.deleteStoredCalendarEvent).toHaveBeenCalledWith("ev_test_1")
    expect(cache.revalidateTag).toHaveBeenCalledWith(ADMIN_CALENDAR_EVENTS_CACHE_TAG, "max")
    expect(cache.revalidateTag).toHaveBeenCalledWith(ADMIN_CALENDAR_HEALTH_CACHE_TAG, "max")
  })

  it("삭제 대상이 실제로는 지워지지 않았으면(레이스) 캐시를 건드리지 않는다", async () => {
    enableSupabase()
    store.getStoredCalendarEvent.mockResolvedValue(storedEvent())
    store.deleteStoredCalendarEvent.mockResolvedValue(false)

    expect(await deleteEvent("ev_test_1")).toBe(false)
    expect(cache.revalidateTag).not.toHaveBeenCalled()
  })

  it("없는 일정을 삭제하면 저장소를 건드리지 않는다", async () => {
    enableSupabase()
    store.getStoredCalendarEvent.mockResolvedValue(null)

    expect(await deleteEvent("ev_missing")).toBe(false)
    expect(store.deleteStoredCalendarEvent).not.toHaveBeenCalled()
    expect(cache.revalidateTag).not.toHaveBeenCalled()
  })
})
