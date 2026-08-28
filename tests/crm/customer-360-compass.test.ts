import { afterEach, describe, expect, it, vi } from "vitest"

const NOW = new Date("2026-08-28T00:00:00.000Z")

function emptyList(extra: Record<string, unknown> = {}) {
  return {
    generatedAt: NOW.toISOString(),
    health: { ok: true, message: null },
    summary: { total: 0, returned: 0, recordings: 0, risks: 0, openNextActions: 0 },
    pagination: { limit: 0, offset: 0, returned: 0, total: 0, hasMore: false, nextOffset: null },
    rows: [],
    ...extra,
  }
}

async function loadRepository(options?: {
  phone?: string | null
  compassLeads?: Array<{ id: number; phone_key: string | null }>
  compassLeadsDown?: boolean
  compassActivities?: Array<{
    id: number
    lead_id: number
    kind: string | null
    body: string | null
    actor: string | null
    created_at: string
  }>
  compassActivitiesDown?: boolean
}) {
  vi.resetModules()

  vi.doMock("@/lib/repositories/leads", () => ({
    getLeadById: vi.fn().mockResolvedValue({
      id: "lead-1",
      source: "contact_page",
      name: "박원장",
      org: "테스트 학원",
      email: "owner@test.com",
      phone: options?.phone === undefined ? "010-1234-5678" : options.phone,
      timestamp: "2026-08-20T00:00:00.000Z",
      status: "new",
      confirmed_at: "2026-08-20T01:00:00.000Z",
    }),
  }))
  vi.doMock("@/lib/admin-crm-customers-neo", () => ({
    getNeoCrmCustomerDetail: vi.fn().mockResolvedValue({ ok: false, error: null, account: null }),
  }))
  vi.doMock("@/lib/repositories/crm-events", () => ({
    listCrmCustomerEvents: vi.fn().mockResolvedValue(
      emptyList({
        summary: { total: 1, returned: 1, recordings: 0, risks: 0, openNextActions: 0 },
        rows: [
          {
            id: "crm-1",
            targetType: "lead",
            targetId: "lead-1",
            targetLabel: null,
            sourceType: "manual_note",
            sourceId: null,
            occurredAt: "2026-08-22T00:00:00.000Z",
            title: "우리 메모",
            summary: null,
            body: null,
            meetingPurpose: null,
            ownerName: "김지사",
            attendees: [],
            decisions: [],
            blockers: [],
            nextActions: [],
            sentiment: "neutral",
            stageSignal: null,
            tags: [],
            publicEventId: null,
            attendeeOrigin: null,
            recording: null,
            createdBy: null,
            createdAt: "2026-08-22T00:00:00.000Z",
            updatedAt: "2026-08-22T00:00:00.000Z",
          },
        ],
      })
    ),
  }))
  vi.doMock("@/lib/repositories/crm-tasks", () => ({
    listCrmTasks: vi.fn().mockResolvedValue(
      emptyList({ summary: { total: 0, returned: 0, open: 0, overdue: 0, dueToday: 0, snoozed: 0, done: 0 } })
    ),
  }))
  vi.doMock("@/lib/repositories/crm-deals", () => ({
    listCrmDeals: vi.fn().mockResolvedValue(
      emptyList({
        summary: {
          total: 0,
          returned: 0,
          open: 0,
          won: 0,
          lost: 0,
          openAmount: 0,
          noNextActionCount: 0,
          aggregateTruncated: false,
        },
      })
    ),
  }))
  vi.doMock("@/lib/repositories/crm-source-links", () => ({
    findConfirmedLeadNeoLink: vi.fn().mockResolvedValue(null),
  }))
  vi.doMock("@/lib/repositories/crm-customer-tags", () => ({
    getCustomerTags: vi.fn().mockResolvedValue([]),
  }))
  vi.doMock("@/lib/repositories/crm-account-money", () => ({
    EMPTY_CRM_ACCOUNT_PRODUCT_SUMMARY: {
      swCumulativeCNY: null,
      hwCumulativeCNY: null,
      hwBoardCount: null,
      matched: false,
    },
    getCrmAccountProductSummary: vi.fn().mockResolvedValue({
      swCumulativeCNY: null,
      hwCumulativeCNY: null,
      hwBoardCount: null,
      matched: false,
    }),
  }))
  vi.doMock("@/lib/compass/bridge", () => ({
    getCompassLeadsByPhoneKeys: vi.fn().mockResolvedValue({
      rows: options?.compassLeads ?? [],
      down: Boolean(options?.compassLeadsDown),
    }),
    getCompassActivitiesByLeadIds: vi.fn().mockResolvedValue({
      rows: options?.compassActivities ?? [],
      down: Boolean(options?.compassActivitiesDown),
    }),
  }))

  return import("@/lib/repositories/crm-customer-360")
}

afterEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
})

const activity = (id: number, kind: string, createdAt: string, body: string | null = "본문") => ({
  id,
  lead_id: 77,
  kind,
  body,
  actor: "진소망",
  created_at: createdAt,
})

describe("고객 360 — Compass 활동 병합", () => {
  it("전화가 일치한 Compass 리드의 활동을 소스 라벨과 딥링크로 붙인다", async () => {
    const { getCrmCustomer360 } = await loadRepository({
      compassLeads: [{ id: 77, phone_key: "01012345678" }],
      compassActivities: [
        activity(1, "call", "2026-08-25T00:00:00.000Z"),
        activity(2, "note", "2026-08-21T00:00:00.000Z"),
      ],
    })

    const result = await getCrmCustomer360(
      { source: "lead", entityId: "lead-1", targetType: "lead" },
      { now: NOW }
    )

    expect(result.compass.leadIds).toEqual([77])
    expect(result.compass.href).toBe("https://mkt.classin.co.kr/leads?open=77")
    expect(result.compass.down).toBe(false)
    expect(result.compass.entries.map((entry) => entry.kindLabel)).toEqual(["콜", "메모"])
    // 기존 타임라인은 건드리지 않는다 — 병합은 화면에서 한다(카운트·페이지네이션 보존).
    expect(result.activity.summary.total).toBe(1)
  })

  it("system 활동은 노이즈라 타임라인에 올리지 않는다", async () => {
    const { getCrmCustomer360 } = await loadRepository({
      compassLeads: [{ id: 77, phone_key: "01012345678" }],
      compassActivities: [
        activity(1, "system", "2026-08-25T00:00:00.000Z"),
        activity(2, "meeting", "2026-08-24T00:00:00.000Z"),
      ],
    })

    const result = await getCrmCustomer360(
      { source: "lead", entityId: "lead-1", targetType: "lead" },
      { now: NOW }
    )

    expect(result.compass.entries.map((entry) => entry.kind)).toEqual(["meeting"])
  })

  it("우리 기록과 Compass 기록이 시간순 한 줄로 합쳐진다", async () => {
    const { getCrmCustomer360 } = await loadRepository({
      compassLeads: [{ id: 77, phone_key: "01012345678" }],
      compassActivities: [
        activity(1, "call", "2026-08-25T00:00:00.000Z"),
        activity(2, "note", "2026-08-10T00:00:00.000Z"),
      ],
    })
    const { mergeCompassTimeline } = await import("@/lib/crm/compass-timeline")

    const result = await getCrmCustomer360(
      { source: "lead", entityId: "lead-1", targetType: "lead" },
      { now: NOW }
    )
    const merged = mergeCompassTimeline(result.activity.rows, result.compass.entries)

    expect(merged.map((item) => (item.kind === "crm" ? item.event.id : item.entry.id))).toEqual([
      "compass:1", // 8/25
      "crm-1", // 8/22
      "compass:2", // 8/10
    ])
  })

  it("전화가 없으면 조회조차 하지 않는다 — 이름으로 추측 매칭하지 않는다", async () => {
    const { getCrmCustomer360 } = await loadRepository({ phone: null })
    const bridge = await import("@/lib/compass/bridge")

    const result = await getCrmCustomer360(
      { source: "lead", entityId: "lead-1", targetType: "lead" },
      { now: NOW }
    )

    expect(result.compass.entries).toEqual([])
    expect(result.compass.down).toBe(false)
    expect(bridge.getCompassLeadsByPhoneKeys).not.toHaveBeenCalled()
  })

  it("브리지가 끊기면 down 으로 강등하고 경고(health)는 오염시키지 않는다", async () => {
    const { getCrmCustomer360 } = await loadRepository({ compassLeadsDown: true })

    const result = await getCrmCustomer360(
      { source: "lead", entityId: "lead-1", targetType: "lead" },
      { now: NOW }
    )

    expect(result.compass.down).toBe(true)
    expect(result.compass.entries).toEqual([])
    expect(result.health.ok).toBe(true)
  })

  it("활동 조회만 끊기면 리드 링크는 남기고 down 만 올린다", async () => {
    const { getCrmCustomer360 } = await loadRepository({
      compassLeads: [{ id: 77, phone_key: "01012345678" }],
      compassActivitiesDown: true,
    })

    const result = await getCrmCustomer360(
      { source: "lead", entityId: "lead-1", targetType: "lead" },
      { now: NOW }
    )

    expect(result.compass.down).toBe(true)
    expect(result.compass.href).toBe("https://mkt.classin.co.kr/leads?open=77")
  })
})
