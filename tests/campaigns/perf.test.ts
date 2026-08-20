import { describe, expect, it } from "vitest"
import {
  resolvePerfPeriod,
  computeDeltaPct,
  computePacing,
  aggregateDailySeries,
  aggregateLeadDailyBySource,
  channelSpendFromEventMetrics,
  resolvePacingBasis,
  shiftDays,
} from "@/lib/marketing/perf"
import { isContactedLead, isConvertedLead } from "@/lib/crm/lead-attribution"
import type { LeadRecord } from "@/lib/repositories/leads"

describe("resolvePerfPeriod", () => {
  it("30d — [오늘-29, 오늘] + 직전 30일", () => {
    const p = resolvePerfPeriod("30d", "2026-08-20")
    expect(p).toEqual({
      key: "30d",
      since: "2026-07-22",
      until: "2026-08-20",
      prevSince: "2026-06-22",
      prevUntil: "2026-07-21",
    })
  })
  it("quarter — 분기 시작~오늘 + 직전 동일 길이", () => {
    const p = resolvePerfPeriod("quarter", "2026-08-20")
    expect(p.since).toBe("2026-07-01")
    expect(p.until).toBe("2026-08-20")
    // QTD 51일(7/1~8/20)의 직전 동일 길이 — 리뷰어 프로브로 확정된 경계값.
    expect(p.prevSince).toBe("2026-05-11")
    expect(p.prevUntil).toBe("2026-06-30")
  })
  it("7d/90d — 일수 삼항 오타 회귀 방지", () => {
    expect(resolvePerfPeriod("7d", "2026-08-20").since).toBe("2026-08-14")
    expect(resolvePerfPeriod("90d", "2026-08-20").since).toBe("2026-05-23")
  })
})

describe("computeDeltaPct", () => {
  it("증감률 계산", () => {
    expect(computeDeltaPct(120, 100)).toBe(20)
    expect(computeDeltaPct(80, 100)).toBe(-20)
  })
  it("이전 0 또는 null 이면 null (0 나눗셈·미측정 정직)", () => {
    expect(computeDeltaPct(120, 0)).toBeNull()
    expect(computeDeltaPct(120, null)).toBeNull()
    expect(computeDeltaPct(null, 100)).toBeNull()
  })
})

describe("computePacing", () => {
  it("기간 경과율 — 기간 내 오늘", () => {
    const p = computePacing({
      startsAt: "2026-08-01",
      endsAt: "2026-08-31",
      today: "2026-08-16",
      spend: 58,
      budget: 100,
    })
    expect(p.elapsedPct).toBe(50) // 31일 중 15.5일 → 반올림 50
    expect(p.executionPct).toBe(58)
  })
  it("예산 없으면 executionPct null, 기간 없으면 elapsedPct null", () => {
    const p = computePacing({ startsAt: null, endsAt: null, today: "2026-08-16", spend: 58, budget: null })
    expect(p.elapsedPct).toBeNull()
    expect(p.executionPct).toBeNull()
  })
  it("기간 종료 후는 100 으로 클램프", () => {
    const p = computePacing({ startsAt: "2026-07-01", endsAt: "2026-07-31", today: "2026-08-16", spend: 0, budget: null })
    expect(p.elapsedPct).toBe(100)
  })
})

describe("aggregateDailySeries", () => {
  it("일자별 spend/leads 합산 — 캠페인 여러 개를 날짜로 접는다", () => {
    const rows = [
      { date: "2026-08-18", campaignId: "a", spend: 10, leads: 2 },
      { date: "2026-08-18", campaignId: "b", spend: 5, leads: 1 },
      { date: "2026-08-19", campaignId: "a", spend: 7, leads: 0 },
    ]
    expect(aggregateDailySeries(rows)).toEqual([
      { date: "2026-08-18", spend: 15, leads: 3 },
      { date: "2026-08-19", spend: 7, leads: 0 },
    ])
  })
  it("역순 입력도 날짜 오름차순으로 정렬한다(.sort 누락 회귀 방지)", () => {
    const rows = [
      { date: "2026-08-19", campaignId: "a", spend: 7, leads: 0 },
      { date: "2026-08-18", campaignId: "b", spend: 5, leads: 1 },
      { date: "2026-08-18", campaignId: "a", spend: 10, leads: 2 },
    ]
    expect(aggregateDailySeries(rows)).toEqual([
      { date: "2026-08-18", spend: 15, leads: 3 },
      { date: "2026-08-19", spend: 7, leads: 0 },
    ])
  })
})

describe("shiftDays", () => {
  it("월·연 경계를 넘는 날짜 이동(윤년 포함)", () => {
    expect(shiftDays("2026-08-20", -13)).toBe("2026-08-07")
    expect(shiftDays("2026-03-01", -1)).toBe("2026-02-28")
    expect(shiftDays("2028-03-01", -1)).toBe("2028-02-29") // 윤년
    expect(shiftDays("2025-12-31", 1)).toBe("2026-01-01")
  })
})

describe("aggregateLeadDailyBySource", () => {
  let seq = 0
  const lead = (source: string, over: Partial<LeadRecord> = {}): LeadRecord => ({
    id: `lead-${(seq += 1)}`,
    source,
    timestamp: "2026-08-01T00:00:00Z",
    status: "new",
    ...over,
  })

  it("일자 × 소스 그룹으로 접는다 — 리드 있는 날·그룹 키만, date asc(0 채움 없음)", () => {
    const out = aggregateLeadDailyBySource([
      { date: "2026-08-02", lead: lead("meta_lead_ads") },
      { date: "2026-08-01", lead: lead("demo_modal") }, // → homepage 그룹
      { date: "2026-08-01", lead: lead("meta_lead_ads") },
      { date: "2026-08-01", lead: lead("meta_lead_ads") },
      { date: "2026-08-01", lead: lead("unknown_source") }, // 매핑 밖 → manual_etc 흡수
    ])
    expect(out).toEqual([
      { date: "2026-08-01", homepage: 1, meta: 2, manual_etc: 1 },
      { date: "2026-08-02", meta: 1 },
    ])
  })

  it("테스트 리드는 제외한다 — 대시보드 리드 집계 전체와 동일 기준(isTestLead)", () => {
    const out = aggregateLeadDailyBySource([
      { date: "2026-08-01", lead: lead("meta_lead_ads", { email: "test@meta.com" }) },
      { date: "2026-08-01", lead: lead("meta_lead_ads", { org: "<test lead: dummy data>" }) },
      { date: "2026-08-01", lead: lead("meta_lead_ads") },
    ])
    expect(out).toEqual([{ date: "2026-08-01", meta: 1 }])
  })
})

describe("isContactedLead — 퍼널 컨택 단계(누적 해석)", () => {
  it("신규만 제외 — 전환·종료도 컨택을 거친 것으로 세서 contacted ≥ converted 불변식이 성립한다", () => {
    const statuses = ["new", "contacted", "converted", "closed", "converted", "new"] as const
    const rows = statuses.map((status) => ({ status }))
    const contacted = rows.filter(isContactedLead).length
    const converted = rows.filter(isConvertedLead).length
    expect(contacted).toBe(4)
    expect(converted).toBe(2)
    expect(contacted).toBeGreaterThanOrEqual(converted)
  })
})

describe("resolvePacingBasis", () => {
  // 기준 입력 — 전부 Meta 링크, USD 계정, lifetimeBudget 합 300.
  const usdReady = {
    links: [
      { refType: "meta_campaign", refId: "m1" },
      { refType: "meta_campaign", refId: "m2" },
    ],
    budgetKrw: null,
    metaLifetimeBudgetById: new Map<string, number | null>([
      ["m1", 300],
      ["m2", null],
    ]),
    metaBudgetIsUsd: true,
    metaSpendUsd: 120.5,
    eventAdSpend: null,
  }

  it("전부 Meta 링크 + USD 계정 + lifetimeBudget 합>0 → USD 기준(비USD 계정이면 금지)", () => {
    expect(resolvePacingBasis(usdReady)).toEqual({ spend: 120.5, budget: 300, currency: "USD" })
    // 계정 통화 가드 — lifetimeBudget 이 USD 가 아니면 "USD" 라벨을 지어내지 않는다.
    expect(resolvePacingBasis({ ...usdReady, metaBudgetIsUsd: false })).toEqual({
      spend: null,
      budget: null,
      currency: null,
    })
  })

  it("lifetimeBudget 합 0 → USD 불성립·KRW 조건으로 폴스루(event 링크 없으면 미산정)", () => {
    expect(
      resolvePacingBasis({
        ...usdReady,
        metaLifetimeBudgetById: new Map<string, number | null>([
          ["m1", null],
          ["m2", null],
        ]),
      })
    ).toEqual({ spend: null, budget: null, currency: null })
  })

  it("KRW 예산 + event 링크 → 링크된 행사 KRW 광고비 합 기준(혼합 링크·중복 링크 1회 계상)", () => {
    expect(
      resolvePacingBasis({
        links: [
          { refType: "meta_campaign", refId: "m1" }, // 혼합 링크 = 전Meta 아님 → USD 규칙 제외
          { refType: "event", refId: "ev1" },
          { refType: "event", refId: "ev1" }, // 동일 행사 중복 링크 — KRW 이중계상 금지
          { refType: "event", refId: "ev2" },
        ],
        budgetKrw: 1_000_000,
        metaLifetimeBudgetById: new Map<string, number | null>([["m1", 300]]),
        metaBudgetIsUsd: true,
        metaSpendUsd: 120.5,
        eventAdSpend: { ev1: 200_000, ev2: 100_000 },
      })
    ).toEqual({ spend: 300_000, budget: 1_000_000, currency: "KRW" })
  })

  it("어느 규칙에도 안 걸리면 전부 null — 링크·예산 없음(집행률 미산정 정직)", () => {
    expect(
      resolvePacingBasis({
        links: [],
        budgetKrw: null,
        metaLifetimeBudgetById: null,
        metaBudgetIsUsd: false,
        metaSpendUsd: null,
        eventAdSpend: null,
      })
    ).toEqual({ spend: null, budget: null, currency: null })
  })
})

describe("channelSpendFromEventMetrics", () => {
  it("행사 여러 개의 adSpendEntries 를 채널별 KRW 합으로 접는다", () => {
    const result = channelSpendFromEventMetrics({
      ev1: {
        adSpendEntries: [
          { channel: "meta", amount: 100_000 },
          { channel: "naver", amount: 50_000 },
        ],
      },
      ev2: { adSpendEntries: [{ channel: "meta", amount: 30_000 }] },
    })
    expect(result.meta).toBe(130_000)
    expect(result.naver).toBe(50_000)
  })
  it("입력이 하나도 없는 채널은 0 이 아니라 null(미측정 정직)", () => {
    const result = channelSpendFromEventMetrics({
      ev1: { adSpendEntries: [{ channel: "google", amount: 10_000 }] },
      ev2: { adSpendEntries: [] },
    })
    expect(result.google).toBe(10_000)
    expect(result.kakao).toBeNull()
    expect(result.offline).toBeNull()
  })
  it("명시 입력된 0원은 측정값 0 으로 유지한다(null 과 구분)", () => {
    const result = channelSpendFromEventMetrics({
      ev1: { adSpendEntries: [{ channel: "youtube", amount: 0 }] },
    })
    expect(result.youtube).toBe(0)
  })
  it("enum 밖 채널·비수치 금액은 무시한다(JSONB 원천 방어)", () => {
    const result = channelSpendFromEventMetrics({
      // JSONB 라 런타임 데이터가 타입을 배신할 수 있다 — 의도적으로 깨진 입력.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ev1: { adSpendEntries: [{ channel: "tiktok", amount: 999 } as any, { channel: "meta", amount: Number.NaN }] },
    })
    expect(result.other).toBeNull() // 미지 채널을 '기타'로 부풀리지 않는다
    expect(result.meta).toBeNull() // NaN 은 측정으로 치지 않는다
  })
  it("빈 입력이면 전 채널 null", () => {
    const result = channelSpendFromEventMetrics({})
    expect(Object.values(result).every((v) => v === null)).toBe(true)
  })
})
