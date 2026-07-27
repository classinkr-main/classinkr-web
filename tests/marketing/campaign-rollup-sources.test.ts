import { beforeEach, describe, expect, it, vi } from "vitest"
import type { CampaignLink, CampaignRefType } from "@/lib/types/marketing-campaign"

/*
 * gatherRollupSources 계약 — 롤업 소스 수집의 배치 규약 회귀 가드.
 *
 * 핵심: 목록 라우트가 캠페인마다 이 함수를 부르면 N+1 이 된다. 라우트는 전체 캠페인의 링크를
 * 합쳐 1회만 호출하고, 여기서는 "채널당 .in() 배치 1회"만 나가야 한다 —
 * 링크 수·캠페인 수가 늘어도 쿼리 수는 그대로다. 아래 테스트가 그 불변식을 고정한다.
 * 더불어 채널별 실패 격리(Meta 미구성 → 빈 맵, 라우트 200)와 라벨 정직 규칙도 함께 고정한다.
 */

const mocks = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  getAllEventMetrics: vi.fn(),
  getAllEventsForAdmin: vi.fn(),
  getMetaCampaignDashboard: vi.fn(),
}))

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}))
vi.mock("@/lib/repositories/event-metrics", () => ({
  getAllEventMetrics: mocks.getAllEventMetrics,
}))
vi.mock("@/lib/repositories/public-events", () => ({
  getAllEventsForAdmin: mocks.getAllEventsForAdmin,
}))
vi.mock("@/lib/meta/marketing", () => ({
  getMetaCampaignDashboard: mocks.getMetaCampaignDashboard,
}))

import { gatherRollupSources } from "@/lib/marketing/campaign-rollup-sources"

type Result = { data: unknown[] | null; error: unknown }

interface QueryBuilder {
  select: (columns: string) => QueryBuilder
  in: (column: string, ids: string[]) => QueryBuilder
  then: (resolve: (value: Result) => void) => void
}

let tableRows: Record<string, unknown[]>
let throwingTables: Set<string>
let fromCalls: string[]
let inCalls: { table: string; column: string; ids: string[] }[]

function makeBuilder(table: string): QueryBuilder {
  const b: QueryBuilder = {
    select: () => b,
    in: (column, ids) => {
      inCalls.push({ table, column, ids })
      return b
    },
    then: (resolve) => {
      if (throwingTables.has(table)) throw new Error(`[test] ${table} 조회 실패`)
      resolve({ data: tableRows[table] ?? [], error: null })
    },
  }
  return b
}

function link(refType: CampaignRefType, refId: string, campaignId = "camp-1"): CampaignLink {
  return { id: `link-${refType}-${refId}-${campaignId}`, campaignId, refType, refId, createdAt: "2026-07-24" }
}

function callsFor(table: string) {
  return inCalls.filter((c) => c.table === table)
}

beforeEach(() => {
  tableRows = {
    email_campaigns: [
      { id: "e-1", subject: "7월 뉴스레터", recipient_count: 1200, open_count: 380 },
      { id: "e-2", subject: null, recipient_count: 500, open_count: 90 },
    ],
    sms_campaigns: [{ id: "s-1", message: "개학 특가 안내입니다", recipient_count: 340 }],
  }
  throwingTables = new Set()
  fromCalls = []
  inCalls = []

  mocks.createSupabaseAdminClient.mockReset()
  mocks.createSupabaseAdminClient.mockImplementation(() => ({
    from: (table: string) => {
      fromCalls.push(table)
      return makeBuilder(table)
    },
  }))

  mocks.getAllEventMetrics.mockReset()
  mocks.getAllEventMetrics.mockReturnValue({
    "ev-1": { eventId: "ev-1", dealsCount: 2, dealsRevenue: 4_000_000 },
    "ev-무관": { eventId: "ev-무관", dealsCount: 9, dealsRevenue: 9_000_000 },
  })

  mocks.getAllEventsForAdmin.mockReset()
  mocks.getAllEventsForAdmin.mockResolvedValue([
    { id: "ev-1", title: "여름 원장 세미나" },
    { id: "ev-무관", title: "다른 행사" },
  ])

  mocks.getMetaCampaignDashboard.mockReset()
  mocks.getMetaCampaignDashboard.mockResolvedValue({
    account: { currency: "USD" },
    campaigns: [{ id: "m-1", name: "리드 캠페인", insights: { spend: 120.5, leads: 7 } }],
  })
})

describe("배치 규약 (N+1 금지)", () => {
  it("캠페인 3건이 4채널을 링크해도 채널당 .in() 1회 · Meta 1콜 · 행사 소스 1회", async () => {
    // 캠페인 3건의 링크를 합친 입력(목록 라우트가 flatMap 으로 만드는 모양).
    // e-1 은 두 캠페인이 공유 → 중복 id 는 배치에서 한 번만 나가야 한다.
    const links = [
      link("email_campaign", "e-1", "camp-1"),
      link("meta_campaign", "m-1", "camp-1"),
      link("email_campaign", "e-1", "camp-2"),
      link("email_campaign", "e-2", "camp-2"),
      link("sms_campaign", "s-1", "camp-2"),
      link("event", "ev-1", "camp-3"),
      link("meta_campaign", "m-2", "camp-3"),
    ]

    await gatherRollupSources(links)

    expect(fromCalls.filter((t) => t === "email_campaigns")).toHaveLength(1)
    expect(fromCalls.filter((t) => t === "sms_campaigns")).toHaveLength(1)

    expect(callsFor("email_campaigns")).toHaveLength(1)
    expect(callsFor("email_campaigns")[0].column).toBe("id")
    expect(callsFor("email_campaigns")[0].ids).toEqual(["e-1", "e-2"]) // 중복 제거
    expect(callsFor("sms_campaigns")).toHaveLength(1)
    expect(callsFor("sms_campaigns")[0].ids).toEqual(["s-1"])

    expect(mocks.getAllEventMetrics).toHaveBeenCalledTimes(1)
    expect(mocks.getAllEventsForAdmin).toHaveBeenCalledTimes(1)
    // Meta 링크가 2건이어도 라이브 대시보드는 요청당 1콜.
    expect(mocks.getMetaCampaignDashboard).toHaveBeenCalledTimes(1)
  })

  it("링크가 없는 채널은 아예 조회하지 않는다", async () => {
    await gatherRollupSources([link("email_campaign", "e-1")])

    expect(fromCalls).toEqual(["email_campaigns"])
    expect(mocks.getAllEventMetrics).not.toHaveBeenCalled()
    expect(mocks.getAllEventsForAdmin).not.toHaveBeenCalled()
    expect(mocks.getMetaCampaignDashboard).not.toHaveBeenCalled()
  })

  it("링크가 하나도 없으면 소스 조회 0회 · 빈 맵", async () => {
    const { sources, labels } = await gatherRollupSources([])

    expect(fromCalls).toEqual([])
    expect(mocks.getMetaCampaignDashboard).not.toHaveBeenCalled()
    expect(sources).toEqual({ emailCampaigns: {}, smsCampaigns: {}, eventMetrics: {}, metaCampaigns: {} })
    expect(labels).toEqual({ email_campaign: {}, sms_campaign: {}, event: {}, meta_campaign: {} })
  })
})

describe("수집 결과 (지표 + 라벨)", () => {
  it("채널별 지표를 매핑하고 행사 leads 는 v1 미집계(0)로 고정", async () => {
    const { sources } = await gatherRollupSources([
      link("email_campaign", "e-1"),
      link("sms_campaign", "s-1"),
      link("event", "ev-1"),
      link("meta_campaign", "m-1"),
    ])

    expect(sources.emailCampaigns["e-1"]).toEqual({ recipientCount: 1200, openCount: 380 })
    expect(sources.smsCampaigns["s-1"]).toEqual({ recipientCount: 340 })
    expect(sources.eventMetrics["ev-1"]).toEqual({ dealsCount: 2, dealsRevenue: 4_000_000, leads: 0 })
    // 링크되지 않은 행사는 소스에 들어오지 않는다(다른 캠페인 매출 오염 금지).
    expect(sources.eventMetrics["ev-무관"]).toBeUndefined()
    expect(sources.metaCampaigns["m-1"]).toEqual({ spend: 120.5, leads: 7, currency: "USD" })
  })

  it("라벨을 채널별로 채우고, 조회되지 않은 refId 는 라벨 없음", async () => {
    const { labels } = await gatherRollupSources([
      link("email_campaign", "e-1"),
      link("email_campaign", "e-2"), // subject null → id 폴백(행은 실제로 존재)
      link("email_campaign", "e-삭제됨"), // 행 없음 → 라벨 없음
      link("sms_campaign", "s-1"),
      link("event", "ev-1"),
      link("meta_campaign", "m-1"),
      link("meta_campaign", "m-지평밖"), // 대시보드 상위 N 밖 → 라벨 없음
    ])

    expect(labels.email_campaign["e-1"]).toBe("7월 뉴스레터")
    expect(labels.email_campaign["e-2"]).toBe("(제목 없음) #e-2")
    expect(labels.email_campaign["e-삭제됨"]).toBeUndefined()
    expect(labels.sms_campaign["s-1"]).toBe("개학 특가 안내입니다")
    expect(labels.event["ev-1"]).toBe("여름 원장 세미나")
    expect(labels.meta_campaign["m-1"]).toBe("리드 캠페인")
    expect(labels.meta_campaign["m-지평밖"]).toBeUndefined()
  })
})

describe("실패 격리 (그레이스풀 강등)", () => {
  it("Meta 실패(미구성/레이트리밋) → meta 빈 맵, 다른 채널은 그대로, throw 없음", async () => {
    mocks.getMetaCampaignDashboard.mockRejectedValue(new Error("Missing META_ACCESS_TOKEN"))

    const { sources, labels } = await gatherRollupSources([
      link("email_campaign", "e-1"),
      link("meta_campaign", "m-1"),
    ])

    expect(sources.metaCampaigns).toEqual({})
    expect(labels.meta_campaign).toEqual({})
    expect(sources.emailCampaigns["e-1"]).toEqual({ recipientCount: 1200, openCount: 380 })
  })

  it("한 테이블 조회가 throw 해도 다른 채널은 살아남는다", async () => {
    throwingTables.add("email_campaigns")

    const { sources } = await gatherRollupSources([
      link("email_campaign", "e-1"),
      link("sms_campaign", "s-1"),
    ])

    expect(sources.emailCampaigns).toEqual({})
    expect(sources.smsCampaigns["s-1"]).toEqual({ recipientCount: 340 })
  })

  it("행사 라벨 조회가 실패해도 행사 지표는 유지된다(두 소스 독립 격리)", async () => {
    mocks.getAllEventsForAdmin.mockRejectedValue(new Error("public_events 조회 실패"))

    const { sources, labels } = await gatherRollupSources([link("event", "ev-1")])

    expect(sources.eventMetrics["ev-1"]).toEqual({ dealsCount: 2, dealsRevenue: 4_000_000, leads: 0 })
    expect(labels.event).toEqual({})
  })
})
