import { describe, expect, it } from "vitest"
import { buildAdBoard, gadCampaignIdOf } from "@/lib/marketing/ad-board"
import type { AdInsightRow } from "@/lib/marketing/ad-insights"
import type { AdCampaignRecord } from "@/lib/marketing/google-ads-setup"
import type { LeadRecord } from "@/lib/repositories/leads"

const UNTIL = "2026-11-06"

function row(overrides: Partial<AdInsightRow>): AdInsightRow {
  return {
    channel: "meta",
    date: UNTIL,
    campaignId: "m1",
    campaignName: "상시(HW·SW)",
    spend: 10,
    currency: "USD",
    impressions: 100,
    clicks: 5,
    leads: 1,
    conversions: null,
    ...overrides,
  }
}

function lead(overrides: Partial<LeadRecord>): LeadRecord {
  return { id: "l", source: "contact_page", status: "new", timestamp: `${UNTIL}T01:00:00Z`, ...overrides } as LeadRecord
}

const plan: AdCampaignRecord[] = [
  { account: "395", key: "C1", name: "유튜브", type: "동영상", campaignId: "g1", status: "running", start: "2026-11-03", end: "2026-12-31", dailyBudget: 8000, note: null },
  { account: "395", key: "C2", name: "리드", type: "디맨드젠", campaignId: null, status: "planned", start: "2026-11-09", end: "2026-12-31", dailyBudget: 14000, note: null },
  { account: "395", key: "C4", name: "검색", type: "검색", campaignId: "g4", status: "held", start: null, end: null, dailyBudget: 7000, note: null },
  { account: "395", key: "T1", name: "시험", type: "디맨드젠", campaignId: "g2", status: "running", start: "2026-10-01", end: "2026-10-20", dailyBudget: 20000, note: null },
  { account: "924", key: null, name: "Campaign #1", type: "실적 최대화", campaignId: "old1", status: "paused", start: null, end: null, dailyBudget: 10000, note: null },
]

const google = (overrides: Partial<AdInsightRow>) =>
  row({ channel: "google", currency: "KRW", leads: 0, conversions: 0, campaignName: "유튜브", campaignId: "g1", ...overrides })

describe("buildAdBoard", () => {
  const board = buildAdBoard({
    since: "2026-10-08",
    until: UNTIL,
    meta: [
      row({ date: "2026-10-10", campaignName: "오프라인 HW/SW" }),
      row({ date: UNTIL }),
      row({ campaignId: "m2", campaignName: "설명회(인천)", date: "2026-10-29", spend: 50, leads: 3 }),
    ],
    google: [
      google({ date: "2026-11-05", spend: 5000 }),
      google({ campaignId: "g4", campaignName: "검색", date: UNTIL, spend: 700 }),
      google({ campaignId: "g9", campaignName: "계획 밖", date: "2026-11-01", spend: 300 }),
    ],
    plan,
    leads: [
      // Meta: 옛 이름·새 이름·ID 모두 같은 캠페인으로
      lead({ source: "meta_lead_ads", utm_campaign: "오프라인 HW/SW", status: "contacted" }),
      lead({ source: "meta_lead_ads", utm_campaign: "상시(HW·SW)" }),
      lead({ source: "meta_lead_ads", utm_campaign: "m1" }),
      lead({ source: "meta_lead_ads", utm_campaign: "모르는 이름" }),
      // Google: gad_campaignid 우선, 계정에 없는 ID 는 따로, gclid 만은 미상
      lead({ landing_page: "https://classin.co.kr/?gad_source=1&gad_campaignid=g1x".replace("g1x", "123"), gclid: "a" }),
      lead({ landing_page: "https://classin.co.kr/contact?gad_campaignid=999", gclid: "b", status: "contacted" }),
      lead({ gclid: "c" }),
      lead({ utm_campaign: "유튜브" }),
      // 아무 키도 없는 홈페이지 문의는 광고로 세지 않는다
      lead({ source: "newsletter" }),
    ],
  })

  it("Meta 리드는 utm_campaign 이름(옛 이름 포함)·ID 로 캠페인에 붙고, 못 찾으면 따로 센다", () => {
    const main = board.meta.campaigns.find((c) => c.id === "m1")!
    expect(main.dbLeads).toBe(3)
    expect(main.contacted).toBe(1)
    expect(main.name).toBe("상시(HW·SW)")
    expect(main.note).toContain("오프라인 HW/SW")
    expect(main.status).toBe("running")
    expect(board.meta.unmatched).toEqual([expect.objectContaining({ label: "캠페인 이름 못 찾음", dbLeads: 1 })])
    expect(board.meta.dbLeads).toBe(4)
  })

  it("Meta 캠페인은 마지막 집행이 2일 넘으면 멈춤으로, 광고비는 USD 그대로", () => {
    const stopped = board.meta.campaigns.find((c) => c.id === "m2")!
    expect(stopped.status).toBe("paused")
    expect(stopped.lastActive).toBe("2026-10-29")
    expect(board.meta.spend).toBe(70)
    expect(board.meta.currency).toBe("USD")
  })

  it("Google 계획표 상태 + 스냅샷: 운영·예정·보류·종료, 어긋나면 표시", () => {
    const byKey = Object.fromEntries(board.google.campaigns.map((c) => [c.key ?? c.id, c]))
    expect(byKey.C1.status).toBe("running")
    expect(byKey.C1.planMismatch).toBe(false)
    expect(byKey.C2.status).toBe("planned")
    expect(byKey.C2.spend).toBeNull()
    expect(byKey.C2.dbLeads).toBeNull()
    // 보류인데 오늘 집행이 있다 → 운영으로 보이고 '계획과 다름'
    expect(byKey.C4.status).toBe("running")
    expect(byKey.C4.planMismatch).toBe(true)
    // 계획상 운영인데 기간이 끝났고 집행이 없다 → 종료(어긋남 아님)
    expect(byKey.T1.status).toBe("ended")
    expect(byKey.T1.planMismatch).toBe(false)
    // 계획표에 없는 라이브 캠페인도 빠뜨리지 않는다
    expect(byKey.g9.note).toBe("계획표에 없음")
    // 운영이 먼저
    expect(board.google.campaigns[0].status).toBe("running")
  })

  it("Google 리드: gad_campaignid → utm 이름 → gclid 만, 924 는 집행 미집계", () => {
    const c1 = board.google.campaigns.find((c) => c.key === "C1")!
    expect(c1.dbLeads).toBe(1) // utm_campaign '유튜브'
    expect(board.google.unmatched).toEqual([
      expect.objectContaining({ label: "캠페인 ID 만", dbLeads: 2, contacted: 1 }),
      expect.objectContaining({ label: "gclid 만", dbLeads: 1 }),
    ])
    expect(board.google.dbLeads).toBe(4)
    expect(board.google.legacy[0]).toEqual(expect.objectContaining({ name: "Campaign #1", status: "paused", spend: null, dbLeads: 0 }))
    expect(board.google.spend).toBe(6000)
  })

  it("조회 실패는 0 이 아니라 미측정", () => {
    const failed = buildAdBoard({ since: "2026-10-08", until: UNTIL, meta: null, google: null, plan, leads: null })
    expect(failed.leadsMeasured).toBe(false)
    expect(failed.meta.spend).toBeNull()
    expect(failed.google.spend).toBeNull()
    const c1 = failed.google.campaigns.find((c) => c.key === "C1")!
    expect(c1.status).toBe("running") // 스냅샷을 못 읽으면 계획표 상태를 그대로 보여 준다
    expect(c1.planMismatch).toBe(false)
    expect(c1.dbLeads).toBeNull()
  })
})

describe("gadCampaignIdOf", () => {
  it("랜딩 주소 쿼리의 gad_campaignid 만 읽는다", () => {
    expect(gadCampaignIdOf("https://x/?gad_source=1&gad_campaignid=23961303778&gclid=z")).toBe("23961303778")
    expect(gadCampaignIdOf("https://x/?utm_source=google")).toBeNull()
    expect(gadCampaignIdOf(null)).toBeNull()
  })
})
