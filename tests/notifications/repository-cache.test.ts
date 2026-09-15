// lib/notifications/repository.ts — Data Cache 승격 + 무효화 배선 회귀 가드
// (admin-performance-round3-2026-09-10.md §3.3).
//
// 사이드바 벨(GET /api/admin/notifications?countOnly=1)이 콜드 1,207ms였다 — 캐시가 전혀
// 없어 매 네비게이션마다 count 왕복을 다시 태웠다. countUnreadNotificationsForRecipients /
// listNotificationsForRecipients를 unstable_cache(30초)로 승격하고, mark-read/delete는
// {expire:0}(관리자 본인이 방금 조작 — 즉시 반영 필요), createInAppNotifications은
// "max"(시스템이 만드는 알림 — 배경 재검증으로 충분)로 무효화한다.
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { NotificationRecipientTarget } from "@/lib/notifications/types"

type Result = { data: unknown; error: unknown; count?: number | null }

// single()과 순수 await(then) 두 계열을 각각 큐로 소비한다 — 한 함수 안에서 여러 단계
// (예: 존재 확인 → 쓰기)가 서로 다른 결과를 내야 하기 때문이다. 호출 순서는 함수 본문의
// await 순서와 같아 결정적이다.
let singleQueue: Result[]
let plainQueue: Result[]
// countUnreadNotificationsForRecipientsUncached은 Promise.all로 셀렉터별 동시 조회를
// 던지므로, eq(recipient_type/recipient_id)로 잡은 값 조합으로 결과를 찾는다(큐로는 순서를
// 보장할 수 없다).
let countsBySelector: Record<string, number>

function makeBuilder() {
  let selType = ""
  let selId = ""
  const b = {
    select: vi.fn(() => b),
    eq: vi.fn((field: string, value: string) => {
      if (field === "recipient_type") selType = value
      if (field === "recipient_id") selId = value
      return b
    }),
    in: vi.fn(() => b),
    order: vi.fn(() => b),
    limit: vi.fn(() => b),
    update: vi.fn(() => b),
    delete: vi.fn(() => b),
    insert: vi.fn(() => b),
    single: vi.fn(() => Promise.resolve(singleQueue.shift() ?? { data: null, error: null })),
    then: (resolve: (v: Result) => void) => {
      const key = `${selType}:${selId}`
      if (key in countsBySelector) {
        resolve({ data: null, error: null, count: countsBySelector[key] })
        return
      }
      resolve(plainQueue.shift() ?? { data: null, error: null })
    },
  }
  return b
}

const fromSpy = vi.fn(() => makeBuilder())
const { revalidateTag } = vi.hoisted(() => ({ revalidateTag: vi.fn() }))

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => ({ from: fromSpy })),
}))
vi.mock("next/cache", () => ({
  revalidateTag,
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}))

import {
  ADMIN_NOTIFICATIONS_CACHE_TAG,
  countUnreadNotificationsForRecipients,
  createInAppNotifications,
  deleteNotificationForRecipients,
  listNotificationsForRecipients,
  markAllNotificationsReadForRecipients,
  markNotificationReadForRecipients,
} from "@/lib/notifications/repository"

const roleSelector: NotificationRecipientTarget[] = [
  { recipientType: "admin_role", recipientId: "ADMIN" },
]

beforeEach(() => {
  singleQueue = []
  plainQueue = []
  countsBySelector = {}
  fromSpy.mockClear()
  revalidateTag.mockClear()
})

describe("countUnreadNotificationsForRecipients", () => {
  it("셀렉터별 개별 count를 합산한다", async () => {
    countsBySelector = { "admin_role:ADMIN": 3, "admin_user:u1": 2 }
    const selectors: NotificationRecipientTarget[] = [
      { recipientType: "admin_role", recipientId: "ADMIN" },
      { recipientType: "admin_user", recipientId: "u1" },
    ]

    const total = await countUnreadNotificationsForRecipients(selectors)

    expect(total).toBe(5)
  })

  it("셀렉터가 비었으면 0을 즉시 반환한다(조회 없음)", async () => {
    const total = await countUnreadNotificationsForRecipients([])
    expect(total).toBe(0)
    expect(fromSpy).not.toHaveBeenCalled()
  })
})

describe("listNotificationsForRecipients", () => {
  it("recipient가 일치하는 행만 매핑해 반환한다", async () => {
    plainQueue = [
      {
        data: [
          {
            id: "n1",
            recipient_type: "admin_role",
            recipient_id: "ADMIN",
            channel: "in_app",
            event_type: "lead.created",
            notification_type: "info",
            category_tag: "lead",
            scope_tag: "global",
            severity: "info",
            title: "새 리드",
            message: "본문",
            metadata_json: {},
            status: "unread",
            created_at: "2026-09-10T00:00:00.000Z",
          },
          {
            id: "n2",
            recipient_type: "admin_user",
            recipient_id: "다른사람",
            channel: "in_app",
            event_type: "x",
            notification_type: "info",
            category_tag: "lead",
            scope_tag: "global",
            severity: "info",
            title: "다른 사람 알림",
            message: "본문",
            metadata_json: {},
            status: "unread",
            created_at: "2026-09-10T00:00:00.000Z",
          },
        ],
        error: null,
      },
    ]

    const items = await listNotificationsForRecipients(roleSelector, { limit: 20 })

    expect(items).toHaveLength(1)
    expect(items[0].id).toBe("n1")
  })
})

describe("markAllNotificationsReadForRecipients", () => {
  it("성공하면 태그를 {expire:0}으로 즉시 하드 만료한다", async () => {
    plainQueue = [
      { data: [{ id: "n1", recipient_type: "admin_role", recipient_id: "ADMIN", status: "unread" }], error: null },
      { data: null, error: null }, // update
    ]

    const updated = await markAllNotificationsReadForRecipients(roleSelector)

    expect(updated).toBe(1)
    expect(revalidateTag).toHaveBeenCalledWith(ADMIN_NOTIFICATIONS_CACHE_TAG, { expire: 0 })
  })

  it("읽지 않은 알림이 없으면 쓰기·무효화 없이 0을 반환한다", async () => {
    plainQueue = [{ data: [], error: null }]

    const updated = await markAllNotificationsReadForRecipients(roleSelector)

    expect(updated).toBe(0)
    expect(revalidateTag).not.toHaveBeenCalled()
  })
})

describe("deleteNotificationForRecipients", () => {
  it("소속이 맞으면 삭제하고 태그를 {expire:0}으로 하드 만료한다", async () => {
    singleQueue = [{ data: { id: "n1", recipient_type: "admin_role", recipient_id: "ADMIN" }, error: null }]
    plainQueue = [{ data: null, error: null }] // delete

    const ok = await deleteNotificationForRecipients("n1", roleSelector)

    expect(ok).toBe(true)
    expect(revalidateTag).toHaveBeenCalledWith(ADMIN_NOTIFICATIONS_CACHE_TAG, { expire: 0 })
  })

  it("다른 수신자 소유면 삭제도 무효화도 하지 않는다", async () => {
    singleQueue = [{ data: { id: "n1", recipient_type: "admin_user", recipient_id: "other" }, error: null }]

    const ok = await deleteNotificationForRecipients("n1", roleSelector)

    expect(ok).toBe(false)
    expect(revalidateTag).not.toHaveBeenCalled()
  })
})

describe("markNotificationReadForRecipients", () => {
  it("소속이 맞으면 읽음 처리하고 태그를 {expire:0}으로 하드 만료한다", async () => {
    singleQueue = [
      { data: { id: "n1", recipient_type: "admin_role", recipient_id: "ADMIN" }, error: null }, // 존재 확인
      {
        data: {
          id: "n1",
          recipient_type: "admin_role",
          recipient_id: "ADMIN",
          channel: "in_app",
          event_type: "x",
          notification_type: "info",
          category_tag: "lead",
          scope_tag: "global",
          severity: "info",
          title: "t",
          message: "m",
          metadata_json: {},
          status: "read",
          created_at: "2026-09-10T00:00:00.000Z",
        },
        error: null,
      }, // update.select().single()
    ]

    const updated = await markNotificationReadForRecipients("n1", roleSelector)

    expect(updated?.status).toBe("read")
    expect(revalidateTag).toHaveBeenCalledWith(ADMIN_NOTIFICATIONS_CACHE_TAG, { expire: 0 })
  })
})

describe("createInAppNotifications", () => {
  it("성공하면 태그를 max(SWR)로 무효화한다", async () => {
    plainQueue = [{ data: [], error: null }]

    await createInAppNotifications([
      {
        recipientType: "admin_role",
        recipientId: "ADMIN",
        eventType: "lead.created",
        notificationType: "action_required",
        categoryTag: "lead",
        scopeTag: "org_admin",
        severity: "info",
        title: "t",
        message: "m",
        iconKey: "users",
        tone: "green",
      },
    ])

    expect(revalidateTag).toHaveBeenCalledWith(ADMIN_NOTIFICATIONS_CACHE_TAG, "max")
  })

  it("입력이 비어 있으면 쓰기·무효화 없이 빈 배열을 반환한다", async () => {
    const result = await createInAppNotifications([])
    expect(result).toEqual([])
    expect(revalidateTag).not.toHaveBeenCalled()
  })
})
