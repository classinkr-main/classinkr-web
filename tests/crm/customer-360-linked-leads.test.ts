/**
 * CT9 — 고객 360 연결 리드 기록 병합 · 마지막/다음 연락 조립(lib/repositories/crm-customer-360.ts).
 *  - NEO 계정 360 은 확정 연결(crm_source_links lead→external_account confirmed) 리드의 기록·연락 로그를
 *    "리드 시절"로 합친다. 미러 이벤트가 있는 로그는 한 번만, 50건 상한 규약 유지.
 *  - 리드 360 은 자기 연락 로그 원본 중 미러가 빠진 것만 더한다.
 *  - 조회 실패는 health 경고가 아니라 linkedLeads.down / contactSummary.leadHistoryDown 으로 말한다.
 */
import { afterEach, describe, expect, it, vi } from "vitest"

import type { CrmCustomerEventRecord, ListCrmCustomerEventsResult } from "@/lib/repositories/crm-events"

// 2026-09-25 12:00 KST
const NOW = new Date("2026-09-25T03:00:00.000Z")

function row(overrides: Partial<CrmCustomerEventRecord> & { id: string }): CrmCustomerEventRecord {
  return {
    targetType: "neo_account",
    targetId: "acc-9",
    targetLabel: null,
    sourceType: "manual_note",
    sourceId: null,
    occurredAt: "2026-09-24T00:00:00.000Z",
    title: "기록",
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
    createdAt: "2026-09-24T00:00:00.000Z",
    updatedAt: "2026-09-24T00:00:00.000Z",
    ...overrides,
  }
}

function list(rows: CrmCustomerEventRecord[], extra: { total?: number; hasMore?: boolean } = {}): ListCrmCustomerEventsResult {
  const total = extra.total ?? rows.length
  return {
    generatedAt: NOW.toISOString(),
    health: { ok: true, message: null },
    summary: {
      total,
      returned: rows.length,
      recordings: 0,
      risks: rows.filter((r) => r.sentiment === "risk").length,
      openNextActions: 0,
    },
    pagination: {
      limit: 20,
      offset: 0,
      returned: rows.length,
      total,
      hasMore: extra.hasMore ?? false,
      nextOffset: extra.hasMore ? rows.length : null,
    },
    rows,
  }
}

type QueryResult = { data: unknown[] | null; error: { message: string } | null }

/** PostgREST 빌더 흉내 — 체인 호출을 기록하고 await 하면 테이블별 결과를 돌려준다. */
class FakeQuery implements PromiseLike<QueryResult> {
  ops: Array<[string, unknown[]]> = []
  constructor(private readonly result: QueryResult) {}
  select(...args: unknown[]) {
    this.ops.push(["select", args])
    return this
  }
  eq(...args: unknown[]) {
    this.ops.push(["eq", args])
    return this
  }
  in(...args: unknown[]) {
    this.ops.push(["in", args])
    return this
  }
  order(...args: unknown[]) {
    this.ops.push(["order", args])
    return this
  }
  limit(...args: unknown[]) {
    this.ops.push(["limit", args])
    return this
  }
  then<A = QueryResult, B = never>(
    onFulfilled?: ((value: QueryResult) => A | PromiseLike<A>) | null,
    onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null
  ): PromiseLike<A | B> {
    return Promise.resolve(this.result).then(onFulfilled, onRejected)
  }
}

interface HarnessOptions {
  source: "lead" | "neo"
  lead?: Record<string, unknown> | null
  sourceLinks?: QueryResult
  contactLogs?: QueryResult
  ownEvents?: ListCrmCustomerEventsResult
  linkedEvents?: Record<string, ListCrmCustomerEventsResult>
  probeRows?: CrmCustomerEventRecord[]
  tasks?: Array<Record<string, unknown>>
  compassLeads?: Array<Record<string, unknown>>
}

async function load(options: HarnessOptions) {
  vi.resetModules()
  const queries: Array<{ table: string; query: FakeQuery }> = []

  vi.doMock("@/lib/supabase/admin", () => ({
    createSupabaseAdminClient: () => ({
      from: (table: string) => {
        const result =
          table === "crm_source_links"
            ? options.sourceLinks ?? { data: [], error: null }
            : table === "lead_contact_logs"
              ? options.contactLogs ?? { data: [], error: null }
              : { data: [], error: null }
        const query = new FakeQuery(result)
        queries.push({ table, query })
        return query
      },
    }),
  }))
  vi.doMock("@/lib/repositories/leads", () => ({
    getLeadById: vi.fn().mockResolvedValue(options.lead ?? null),
  }))
  vi.doMock("@/lib/admin-crm-customers-neo", () => ({
    getNeoCrmCustomerDetail: vi.fn().mockResolvedValue({
      ok: true,
      error: null,
      account: {
        accountId: "acc-9",
        name: "큰학원",
        ownerName: "이매니저",
        phone: "02-123-4567",
        region: null,
        createdAt: "2025-01-01T00:00:00.000Z",
        updatedAt: "2026-06-01T00:00:00.000Z",
      },
      eeoAccounts: [],
      orders: [],
      collections: [],
      performances: [],
    }),
  }))
  const listCrmCustomerEvents = vi.fn(async (opts: { targetType?: string; targetId?: string; sourceTypes?: string[] }) => {
    if (opts.sourceTypes) return list(options.probeRows ?? [])
    if (opts.targetType === "lead" && options.source === "neo") {
      return options.linkedEvents?.[opts.targetId ?? ""] ?? list([])
    }
    return options.ownEvents ?? list([])
  })
  vi.doMock("@/lib/repositories/crm-events", () => ({ LEAD_CONTACT_MIRROR_SOURCE_TYPES: ["lead_contact_log", "call", "sms"], listCrmCustomerEvents }))
  vi.doMock("@/lib/repositories/crm-tasks", () => ({
    listCrmTasks: vi.fn().mockResolvedValue({
      generatedAt: NOW.toISOString(),
      health: { ok: true, message: null },
      summary: { total: 0, returned: 0, open: 0, overdue: 0, dueToday: 0, snoozed: 0, done: 0 },
      pagination: { limit: 50, offset: 0, returned: 0, total: 0, hasMore: false, nextOffset: null },
      rows: options.tasks ?? [],
    }),
  }))
  vi.doMock("@/lib/repositories/crm-deals", () => ({
    listCrmDeals: vi.fn().mockResolvedValue({
      generatedAt: NOW.toISOString(),
      health: { ok: true, message: null },
      summary: { total: 0, returned: 0, open: 0, won: 0, lost: 0, openAmount: 0, noNextActionCount: 0, aggregateTruncated: false },
      pagination: { limit: 20, offset: 0, returned: 0, total: 0, hasMore: false, nextOffset: null },
      rows: [],
    }),
  }))
  vi.doMock("@/lib/repositories/crm-source-links", () => ({
    findConfirmedLeadNeoLink: vi.fn().mockResolvedValue(null),
  }))
  vi.doMock("@/lib/repositories/crm-customer-tags", () => ({
    getCustomerTags: vi.fn().mockResolvedValue([]),
  }))
  vi.doMock("@/lib/repositories/crm-account-money", () => ({
    EMPTY_CRM_ACCOUNT_PRODUCT_SUMMARY: { swCumulativeCNY: null, hwCumulativeCNY: null, hwBoardCount: null, matched: false },
    getCrmAccountProductSummary: vi
      .fn()
      .mockResolvedValue({ swCumulativeCNY: null, hwCumulativeCNY: null, hwBoardCount: null, matched: false }),
    EMPTY_CRM_MONEY_LINE_ITEMS_SUMMARY: { lineItems: [], lineItemsMeta: { truncated: false, sources: [] }, unmatchedOutbound: [] },
    getCrmMoneyLineItemsSummary: vi
      .fn()
      .mockResolvedValue({ lineItems: [], lineItemsMeta: { truncated: false, sources: [] }, unmatchedOutbound: [] }),
  }))
  vi.doMock("@/lib/compass/bridge", () => ({
    getCompassLeadsByPhoneKeys: vi.fn().mockResolvedValue({ rows: options.compassLeads ?? [], down: false }),
    getCompassActivitiesByLeadIds: vi.fn().mockResolvedValue({ rows: [], down: false }),
  }))

  const repo = await import("@/lib/repositories/crm-customer-360")
  return { repo, queries, listCrmCustomerEvents }
}

afterEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
})

const NEO_KEY = { source: "neo", entityId: "acc-9", targetType: "neo_account" } as const
const LEAD_KEY = { source: "lead", entityId: "lead-1", targetType: "lead" } as const

function logRow(id: string, contactedAt: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    lead_id: "lead-7",
    type: "call",
    result: "no_answer",
    notes: null,
    contacted_at: contactedAt,
    contacted_by: "박매니저",
    ...overrides,
  }
}

describe("NEO 계정 360 — 확정 연결 리드(리드 시절) 병합", () => {
  it("연결 리드 기록 + 미러가 빠진 연락 로그를 합치고, 미러가 있는 로그는 한 번만 보인다", async () => {
    const { repo, queries } = await load({
      source: "neo",
      sourceLinks: { data: [{ source_record_key: "lead-7" }], error: null },
      contactLogs: {
        data: [logRow("log-2", "2026-09-21T03:00:00.000Z"), logRow("log-1", "2026-09-20T03:00:00.000Z", { result: "answered" })],
        error: null,
      },
      ownEvents: list([row({ id: "own-1", sourceType: "manual_note", occurredAt: "2026-09-24T00:00:00.000Z" })]),
      linkedEvents: {
        "lead-7": list([
          row({
            id: "lead-ev-1",
            targetType: "lead",
            targetId: "lead-7",
            sourceType: "lead_contact_log",
            sourceId: "log-1",
            title: "전화 · 응답",
            occurredAt: "2026-09-20T03:00:00.000Z",
          }),
          row({
            id: "lead-ev-risk",
            targetType: "lead",
            targetId: "lead-7",
            sourceType: "manual_note",
            sentiment: "risk",
            occurredAt: "2026-09-15T00:00:00.000Z",
          }),
        ]),
      },
    })

    const result = await repo.getCrmCustomer360(NEO_KEY, { now: NOW })

    expect(result.activity.rows.map((r) => r.id)).toEqual([
      "own-1", // 9/24
      "lead-contact-log:log-2", // 9/21 — 미러가 없어 원본에서
      "lead-ev-1", // 9/20 — log-1 의 미러(원본 log-1 은 더하지 않는다)
      "lead-ev-risk", // 9/15
    ])
    expect(result.activity.summary.total).toBe(4)
    expect(result.linkedLeads).toEqual({ leadIds: ["lead-7"], truncated: false, mergedCount: 3, down: false })
    // 리드 시절 위험 기록은 현재 리스크를 올리지 않는다 — 자기 기록으로만 센다.
    expect(result.risk.riskEventCount).toBe(0)
    expect(result.health.ok).toBe(true)

    // 마지막 연락 = 리드 시절 원본 로그(9/21), 메모는 연락이 아니다. 표기는 통합 목록과 같은 last-contact.ts.
    expect(result.contactSummary.last).toMatchObject({
      origin: "lead_era",
      source: "home_log",
      channelLabel: "콜",
      actor: "박매니저",
      daysAgo: 4,
    })

    // 확정 링크 조회 모양 — lead→external_account confirmed, 이 계정으로 좁힌다.
    const links = queries.find((q) => q.table === "crm_source_links")
    expect(links?.query.ops).toEqual(
      expect.arrayContaining([
        ["eq", ["source_system", "lead"]],
        ["eq", ["source_object", "leads"]],
        ["eq", ["target_type", "external_account"]],
        ["eq", ["target_id", "acc-9"]],
        ["eq", ["status", "confirmed"]],
      ])
    )
    const logs = queries.find((q) => q.table === "lead_contact_logs")
    expect(logs?.query.ops).toEqual(expect.arrayContaining([["in", ["lead_id", ["lead-7"]]]]))
  })

  it("연결 리드가 없으면 자기 기록을 그대로 둔다(페이지네이션·집계 의미 보존)", async () => {
    const own = list([row({ id: "own-1" })], { total: 30, hasMore: true })
    const { repo, queries } = await load({ source: "neo", ownEvents: own })

    const result = await repo.getCrmCustomer360(NEO_KEY, { now: NOW })

    expect(result.activity.summary.total).toBe(30)
    expect(result.activity.pagination.nextOffset).toBe(1)
    expect(result.linkedLeads).toMatchObject({ leadIds: [], mergedCount: 0, down: false })
    // 연결 리드가 없으면 연락 로그를 읽지 않는다.
    expect(queries.some((q) => q.table === "lead_contact_logs")).toBe(false)
  })

  it("확정 링크 조회가 실패하면 down 으로 말하고 health 경고는 오염시키지 않는다", async () => {
    const { repo } = await load({
      source: "neo",
      sourceLinks: { data: null, error: { message: "timeout" } },
      ownEvents: list([row({ id: "own-1", sourceType: "call" })]),
    })

    const result = await repo.getCrmCustomer360(NEO_KEY, { now: NOW })

    expect(result.linkedLeads.down).toBe(true)
    expect(result.contactSummary.leadHistoryDown).toBe(true)
    expect(result.health.ok).toBe(true)
    expect(result.activity.rows.map((r) => r.id)).toEqual(["own-1"])
  })

  it("Compass 다음 액션은 종료(lost) 리드를 빼고 가장 이른 것을 다음 연락으로 쓴다", async () => {
    const { repo } = await load({
      source: "neo",
      compassLeads: [
        { id: 1, phone_key: "021234567", stage: "lost", next_action_at: "2026-09-26T00:00:00.000Z" },
        { id: 2, phone_key: "021234567", stage: "quote", next_action_at: "2026-09-29T00:00:00.000Z" },
      ],
    })

    const result = await repo.getCrmCustomer360(NEO_KEY, { now: NOW })

    expect(result.compass.nextActionAts).toEqual(["2026-09-29T00:00:00.000Z"])
    expect(result.contactSummary.next).toMatchObject({ kind: "compass_next_action", title: null, daysUntil: 4 })
  })
})

describe("리드 360 — 자기 연락 로그 원본·팔로업", () => {
  const lead = {
    id: "lead-1",
    source: "contact_page",
    name: "박원장",
    org: "테스트 학원",
    phone: null,
    timestamp: "2026-09-01T00:00:00.000Z",
    status: "contacted",
    follow_up_at: "2026-09-26T01:00:00.000Z",
  }

  it("미러가 빠진 자기 로그는 Home 기록으로 합치고, 진행 중 리드의 팔로업이 다음 연락이 된다", async () => {
    const { repo, queries } = await load({
      source: "lead",
      lead,
      contactLogs: { data: [logRow("log-9", "2026-09-24T05:00:00.000Z", { lead_id: "lead-1" })], error: null },
      ownEvents: list([row({ id: "own-1", targetType: "lead", targetId: "lead-1", occurredAt: "2026-09-10T00:00:00.000Z" })]),
      tasks: [{ id: "t1", title: "견적 회신", status: "open", dueAt: "2026-09-28T00:00:00.000Z", snoozedUntil: null }],
    })

    const result = await repo.getCrmCustomer360(LEAD_KEY, { now: NOW })

    expect(result.activity.rows.map((r) => r.id)).toEqual(["lead-contact-log:log-9", "own-1"])
    // 리드 360 은 리드 시절이 아니다.
    expect(result.linkedLeads.mergedCount).toBe(0)
    // 9/24 14:00 KST 로그 → 22시간 전 = 오늘(통합 목록과 같은 24시간 단위)
    expect(result.contactSummary.last).toMatchObject({ origin: "home", source: "home_log", channelLabel: "콜", daysAgo: 0 })
    expect(result.contactSummary.next).toMatchObject({ kind: "follow_up", daysUntil: 1 })
    // 리드 360 은 계정→리드 링크를 조회하지 않는다.
    expect(queries.some((q) => q.table === "crm_source_links")).toBe(false)
  })

  it("종료·전환 리드의 남은 팔로업은 다음 연락 후보가 아니다", async () => {
    const { repo } = await load({ source: "lead", lead: { ...lead, status: "closed" } })

    const result = await repo.getCrmCustomer360(LEAD_KEY, { now: NOW })

    expect(result.contactSummary.next).toBeNull()
  })

  it("창에 사람 연락이 없고 더 오래된 기록이 남으면 최신 사람 연락 한 건만 따로 찾는다(타임라인엔 넣지 않는다)", async () => {
    const probe = row({
      id: "old-call",
      targetType: "lead",
      targetId: "lead-1",
      sourceType: "call",
      occurredAt: "2026-08-01T00:00:00.000Z",
    })
    const { repo, listCrmCustomerEvents } = await load({
      source: "lead",
      lead,
      ownEvents: list([row({ id: "inflow", targetType: "lead", sourceType: "site_inflow" })], { total: 40, hasMore: true }),
      probeRows: [probe],
    })

    const result = await repo.getCrmCustomer360(LEAD_KEY, { now: NOW })

    expect(listCrmCustomerEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        targetType: "lead",
        targetId: "lead-1",
        sourceTypes: ["call", "sms", "meeting_minutes", "recording", "lead_contact_log"],
        limit: 1,
      })
    )
    expect(result.activity.rows.map((r) => r.id)).toEqual(["inflow"])
    expect(result.contactSummary.last?.at).toBe("2026-08-01T00:00:00.000Z")
  })
})

describe("mergeLeadHistoryIntoActivity — 50건 상한·중복 제거(순수)", () => {
  it("합친 뒤 limit 로 자르고 total 은 원천별 합이다(더 보기는 total > rows 로만 판단)", async () => {
    const { repo } = await load({ source: "neo" })
    const own = list([
      row({ id: "o1", occurredAt: "2026-09-24T00:00:00.000Z" }),
      row({ id: "o2", occurredAt: "2026-09-23T00:00:00.000Z" }),
    ])
    const linked = [
      row({ id: "l1", targetType: "lead", targetId: "lead-7", sourceType: "call", occurredAt: "2026-09-22T00:00:00.000Z" }),
      row({ id: "l2", targetType: "lead", targetId: "lead-7", occurredAt: "2026-09-21T00:00:00.000Z" }),
    ]

    const merged = repo.mergeLeadHistoryIntoActivity({
      customerSource: "neo_account",
      own,
      linkedEvents: linked,
      linkedEventsTotal: 2,
      logs: [],
      limit: 2,
    })

    expect(merged.activity.rows.map((r) => r.id)).toEqual(["o1", "o2"])
    expect(merged.activity.summary.total).toBe(4)
    expect(merged.activity.pagination).toMatchObject({ hasMore: true, nextOffset: null, returned: 2 })
    expect(merged.mergedCount).toBe(0) // 잘린 리드 시절 행은 화면에 없다
  })

  it("기록 컴포저의 콜·문자 미러(source_id = 로그 id)가 있으면 그 로그 원본 행을 더하지 않는다", async () => {
    const { repo } = await load({ source: "lead" })
    const own = list([
      row({ id: "call-mirror", targetType: "lead", targetId: "lead-7", sourceType: "call", sourceId: "log-9" }),
      row({ id: "sms-mirror", targetType: "lead", targetId: "lead-7", sourceType: "sms", sourceId: "log-10" }),
    ])
    const log = (id: string) => ({
      id,
      lead_id: "lead-7",
      type: "call" as const,
      result: "answered" as const,
      notes: "",
      contacted_at: "2026-09-20T00:00:00.000Z",
      contacted_by: "박매니저",
    })

    const merged = repo.mergeLeadHistoryIntoActivity({
      customerSource: "lead",
      own,
      linkedEvents: [],
      linkedEventsTotal: 0,
      logs: [log("log-9"), log("log-10"), log("log-11")],
      limit: 20,
    })

    const ids = merged.activity.rows.map((r) => r.id)
    expect(ids).not.toContain("lead-contact-log:log-9")
    expect(ids).not.toContain("lead-contact-log:log-10")
    expect(ids).toContain("lead-contact-log:log-11") // 미러가 없는 로그만 원본 행으로
    expect(merged.activity.summary.total).toBe(3)
  })

  it("합칠 것이 없으면 own 객체를 그대로 돌려준다", async () => {
    const { repo } = await load({ source: "neo" })
    const own = list([row({ id: "o1" })])
    const merged = repo.mergeLeadHistoryIntoActivity({
      customerSource: "neo_account",
      own,
      linkedEvents: [],
      linkedEventsTotal: 0,
      logs: [],
      limit: 20,
    })
    expect(merged.activity).toBe(own)
  })

  it("연락 로그 원본 행은 미러와 같은 제목·읽기 전용(할 일 승격 없음)", async () => {
    const { repo } = await load({ source: "neo" })
    const timelineRow = repo.leadContactLogToTimelineRow({
      id: "log-5",
      lead_id: "lead-7",
      type: "kakao",
      result: "meeting_set",
      notes: "다음 주 방문",
      contacted_at: "2026-09-20T00:00:00.000Z",
      contacted_by: "박매니저",
    })
    expect(timelineRow).toMatchObject({
      id: "lead-contact-log:log-5",
      targetType: "lead",
      sourceType: "lead_contact_log",
      sourceId: "log-5",
      title: "카카오 · 미팅 확정",
      body: "다음 주 방문",
      sentiment: "positive",
      nextActions: [],
    })
  })
})
