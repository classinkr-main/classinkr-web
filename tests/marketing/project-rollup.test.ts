import { describe, it, expect } from "vitest"
import {
  computeProjectRollup,
  eventAdSpendFromMetrics,
} from "@/lib/marketing/project-rollup"
import type {
  CampaignWithLinks,
  CampaignLink,
  CampaignRefType,
} from "@/lib/types/marketing-campaign"
import { DEFAULT_EVENT_METRICS, type EventMetrics } from "@/lib/types/event-metrics"

/*
 * D3-2 프로젝트 롤업 순수함수 계약.
 * 정직 규칙: budgetSpent 는 링크된 distinct 행사의 KRW 광고비 합만 — Meta 라이브(USD)는
 * 입력에 아예 없어 절대 섞일 수 없다. email/sms/meta 링크는 소진에 기여하지 않는다.
 * 동일 행사가 여러 캠페인에 링크돼도 KRW 는 1회만(이중계상 금지). ROAS/통화 접기 없음.
 */

// 링크 팩토리 — id/campaignId/createdAt 는 롤업 계산에 무관하므로 고정.
function link(refType: CampaignRefType, refId: string): CampaignLink {
  return {
    id: `link-${refType}-${refId}`,
    campaignId: "camp-x",
    refType,
    refId,
    createdAt: "2026-07-24",
  }
}

// 멤버 캠페인 팩토리 — 롤업이 읽는 channels·links 만 의미 있고 나머지는 고정.
function campaign(id: string, channels: string[], links: CampaignLink[]): CampaignWithLinks {
  return {
    id,
    name: `campaign ${id}`,
    objective: null,
    status: "active",
    channels,
    startsAt: null,
    endsAt: null,
    budget: null,
    owner: null,
    projectId: "proj-1",
    createdAt: "2026-07-24",
    updatedAt: "2026-07-24",
    links,
  }
}

describe("computeProjectRollup (프로젝트 롤업 순수함수)", () => {
  it("빈 멤버 캠페인 → 전부 0, budgetAllocated=budget, spentPct=null(예산 null)", () => {
    const rollup = computeProjectRollup([], { eventAdSpend: {}, budget: null })
    expect(rollup).toEqual({
      campaignCount: 0,
      channelCount: 0,
      eventCount: 0,
      budgetAllocated: null,
      budgetSpent: 0,
      spentPct: null,
    })
  })

  it("campaignCount=멤버 수, channelCount=채널 distinct 합집합(중복 채널은 1회)", () => {
    const campaigns = [
      campaign("c1", ["email", "sms"], []),
      campaign("c2", ["sms", "meta"], []), // sms 중복
      campaign("c3", ["email"], []), // email 중복
    ]
    const rollup = computeProjectRollup(campaigns, { eventAdSpend: {}, budget: null })
    expect(rollup.campaignCount).toBe(3)
    expect(rollup.channelCount).toBe(3) // {email, sms, meta}
  })

  it("eventCount=멤버 캠페인의 event 링크 수 합(email/sms/meta 링크는 제외)", () => {
    const campaigns = [
      campaign("c1", [], [link("event", "ev1"), link("email_campaign", "e1")]),
      campaign(
        "c2",
        [],
        [link("event", "ev2"), link("event", "ev3"), link("meta_campaign", "m1")],
      ),
    ]
    const rollup = computeProjectRollup(campaigns, { eventAdSpend: {}, budget: null })
    expect(rollup.eventCount).toBe(3)
  })

  it("budgetSpent=event 광고비(KRW) 합 — email/sms/meta 링크는 소진에 기여 없음", () => {
    const campaigns = [
      campaign("c1", [], [
        link("event", "ev1"),
        link("email_campaign", "e1"), // 집행비 개념 없음
        link("sms_campaign", "s1"), // 집행비 개념 없음
        link("meta_campaign", "m1"), // Meta 라이브(USD)는 프로젝트 롤업 입력에 없음
      ]),
      campaign("c2", [], [link("event", "ev2")]),
    ]
    const eventAdSpend = { ev1: 300_000, ev2: 500_000 }
    const rollup = computeProjectRollup(campaigns, { eventAdSpend, budget: null })
    expect(rollup.budgetSpent).toBe(800_000)
    expect(rollup.eventCount).toBe(2)
  })

  it("spentPct: 예산 없음/0 이면 null(0 나눗셈 방지), 예산>0 이면 round(소진/배정*100)", () => {
    const campaigns = [campaign("c1", [], [link("event", "ev1")])]
    const eventAdSpend = { ev1: 250_000 }
    expect(
      computeProjectRollup(campaigns, { eventAdSpend, budget: null }).spentPct,
    ).toBeNull()
    expect(
      computeProjectRollup(campaigns, { eventAdSpend, budget: 0 }).spentPct,
    ).toBeNull()
    const r = computeProjectRollup(campaigns, { eventAdSpend, budget: 1_000_000 })
    expect(r.budgetAllocated).toBe(1_000_000)
    expect(r.budgetSpent).toBe(250_000)
    expect(r.spentPct).toBe(25)
  })

  it("budgetSpent 은 절대 USD/Meta 값을 포함하지 않는다(통화 접기·metaSpend·ROAS 키 없음)", () => {
    const campaigns = [
      campaign("c1", ["meta"], [
        link("event", "ev1"),
        link("meta_campaign", "m-usd"), // Meta 라이브(USD)는 소스에 아예 주입되지 않는다
      ]),
    ]
    const eventAdSpend = { ev1: 400_000 } // KRW 만
    const rollup = computeProjectRollup(campaigns, { eventAdSpend, budget: 800_000 })
    expect(rollup.budgetSpent).toBe(400_000) // KRW event 광고비만
    expect(rollup.spentPct).toBe(50)
    // 구조적으로 통화 가로지르는 조작 지표가 존재하지 않는다.
    expect(rollup).not.toHaveProperty("metaSpend")
    expect(rollup).not.toHaveProperty("metaCurrency")
    expect(rollup).not.toHaveProperty("roas")
    expect(rollup).not.toHaveProperty("roi")
  })

  it("동일 행사가 두 멤버 캠페인에 링크 → budgetSpent 는 1회만 계상(이중계상 금지), eventCount 는 링크 2건", () => {
    const campaigns = [
      campaign("c1", [], [link("event", "shared-ev")]),
      campaign("c2", [], [link("event", "shared-ev")]),
    ]
    const eventAdSpend = { "shared-ev": 600_000 }
    const rollup = computeProjectRollup(campaigns, { eventAdSpend, budget: null })
    expect(rollup.eventCount).toBe(2) // 링크는 2건
    expect(rollup.budgetSpent).toBe(600_000) // 광고비는 1회만
  })

  it("eventAdSpend 에 없는 행사 id → 0 기여·throw 없음(그레이스풀)", () => {
    const campaigns = [campaign("c1", [], [link("event", "missing-ev")])]
    expect(() =>
      computeProjectRollup(campaigns, { eventAdSpend: {}, budget: 100_000 }),
    ).not.toThrow()
    const rollup = computeProjectRollup(campaigns, { eventAdSpend: {}, budget: 100_000 })
    expect(rollup.budgetSpent).toBe(0)
    expect(rollup.eventCount).toBe(1)
    expect(rollup.spentPct).toBe(0)
  })
})

describe("eventAdSpendFromMetrics (event-metrics → eventId별 KRW 광고비 합)", () => {
  function metricsOf(eventId: string, entries: EventMetrics["adSpendEntries"]): EventMetrics {
    return {
      ...DEFAULT_EVENT_METRICS,
      eventId,
      updatedAt: "2026-07-24",
      adSpendEntries: entries,
    }
  }

  it("각 행사의 adSpendEntries[].amount(KRW) 를 합산 — 'meta' 채널 항목도 KRW 라 포함", () => {
    const all: Record<string, EventMetrics> = {
      ev1: metricsOf("ev1", [
        { channel: "google", amount: 300_000 },
        { channel: "meta", amount: 200_000 }, // KRW 로 수기 입력된 항목(라이브 USD 아님)
      ]),
      ev2: metricsOf("ev2", []),
    }
    const out = eventAdSpendFromMetrics(all)
    expect(out.ev1).toBe(500_000)
    expect(out.ev2).toBe(0)
  })

  it("빈 맵 → 빈 결과", () => {
    expect(eventAdSpendFromMetrics({})).toEqual({})
  })
})
