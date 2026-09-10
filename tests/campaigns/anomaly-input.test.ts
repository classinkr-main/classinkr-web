import { describe, expect, it } from "vitest"
import {
  ANOMALY_LOAD_DAYS,
  anomalyLoadSince,
  buildAnomalyCampaignInputs,
  cplOf,
  ctrOf,
  resolveAnomalyWindows,
  sumWindow,
  type AnomalyDailyRow,
} from "@/lib/marketing/anomaly-input"
import { detectAnomalies } from "@/lib/marketing/anomaly"

const TODAY = "2026-08-20"

function row(date: string, over: Partial<AnomalyDailyRow> = {}): AnomalyDailyRow {
  return {
    date,
    campaignId: "m1",
    spend: 0,
    leads: 0,
    impressions: 0,
    clicks: 0,
    ...over,
  }
}

const campaign = (id: string, metaIds: string[]) => ({
  id,
  name: `캠페인 ${id}`,
  links: metaIds.map((refId) => ({ refType: "meta_campaign", refId })),
})

describe("창 경계", () => {
  it("로드 범위가 30일 창과 직전 7일 창을 모두 덮는다", () => {
    const windows = resolveAnomalyWindows(TODAY)
    const since = anomalyLoadSince(TODAY)
    expect(since).toBe("2026-07-15") // today - 36
    expect(since <= windows.cur30.since).toBe(true)
    expect(since <= windows.prev7.since).toBe(true)
    expect(ANOMALY_LOAD_DAYS).toBeGreaterThanOrEqual(29)
  })

  it("최근 7일과 직전 7일은 겹치지 않고 맞닿는다", () => {
    const { cur7, prev7 } = resolveAnomalyWindows(TODAY)
    expect(cur7).toEqual({ since: "2026-08-14", until: TODAY })
    expect(prev7).toEqual({ since: "2026-08-07", until: "2026-08-13" })
    expect(prev7.until < cur7.since).toBe(true)
  })

  it("sumWindow 는 경계 양끝을 포함하고 범위 밖 행은 무시한다", () => {
    const rows = [
      row("2026-08-13", { leads: 100 }), // 범위 밖(하루 이르다)
      row("2026-08-14", { leads: 1, spend: 10 }), // 시작 경계 포함
      row("2026-08-20", { leads: 2, spend: 20 }), // 끝 경계 포함
      row("2026-08-21", { leads: 100 }), // 범위 밖(미래)
    ]
    expect(sumWindow(rows, "2026-08-14", TODAY)).toEqual({
      spend: 30,
      leads: 3,
      impressions: 0,
      clicks: 0,
    })
  })
})

describe("미측정 축", () => {
  it("리드 0 이면 CPL 은 0 이 아니라 null, 노출 0 이면 CTR 도 null", () => {
    expect(cplOf({ spend: 500, leads: 0, impressions: 0, clicks: 0 })).toBeNull()
    expect(ctrOf({ spend: 0, leads: 0, impressions: 0, clicks: 5 })).toBeNull()
    expect(cplOf({ spend: 500, leads: 4, impressions: 0, clicks: 0 })).toBe(125)
    expect(ctrOf({ spend: 0, leads: 0, impressions: 1000, clicks: 25 })).toBe(2.5)
  })

  it("소스 실패(dailyRows null)는 이상 없음이 아니라 판단 불가 — 감지가 침묵한다", () => {
    const inputs = buildAnomalyCampaignInputs({
      today: TODAY,
      dailyRows: null,
      campaigns: [campaign("c1", ["m1"])],
      pacingByCampaignId: new Map(),
      includeUnlinkedMeta: true,
    })
    expect(inputs).toHaveLength(1)
    expect(inputs[0]).toMatchObject({ cpl7d: null, cpl30d: null, ctr7d: null, ctr30d: null })
    expect(detectAnomalies({ campaigns: inputs })).toHaveLength(0)
  })

  it("Meta 링크가 없는 캠페인도 축을 지어내지 않는다(빈 창 → null/0)", () => {
    const inputs = buildAnomalyCampaignInputs({
      today: TODAY,
      dailyRows: [row("2026-08-18", { leads: 9, spend: 90 })],
      campaigns: [campaign("c1", [])],
      pacingByCampaignId: new Map(),
      includeUnlinkedMeta: false,
    })
    expect(inputs[0]).toMatchObject({ cpl7d: null, cpl30d: null, leads7d: 0, leadsPrev7d: 0 })
  })
})

describe("캠페인별 창 파생", () => {
  // 최근 7일 CPL 50(리드 6 / 300) vs 30일 CPL 약 25 — 임계(1.5배) 초과 + 표본 충족.
  const spikeRows: AnomalyDailyRow[] = [
    row("2026-08-18", { campaignId: "m1", spend: 300, leads: 6 }),
    row("2026-07-25", { campaignId: "m1", spend: 300, leads: 30 }),
  ]

  it("링크된 Meta 캠페인의 행을 합쳐 우리 캠페인 축으로 접는다", () => {
    const inputs = buildAnomalyCampaignInputs({
      today: TODAY,
      dailyRows: [...spikeRows, row("2026-08-18", { campaignId: "m2", spend: 100, leads: 4 })],
      campaigns: [campaign("c1", ["m1", "m2"])],
      pacingByCampaignId: new Map([["c1", { elapsedPct: 40, executionPct: 90 }]]),
      includeUnlinkedMeta: false,
    })
    expect(inputs).toHaveLength(1)
    // 두 Meta 캠페인 합산: 최근 7일 spend 400 / leads 10 = CPL 40
    expect(inputs[0]).toMatchObject({ id: "c1", cpl7d: 40, leads7d: 10 })
    expect(inputs[0].executionPct).toBe(90)
    const kinds = detectAnomalies({ campaigns: inputs }).map((f) => f.kind)
    expect(kinds).toContain("pacing_over")
  })

  it("미연결 Meta 캠페인은 옵션에 따라 포함/제외된다", () => {
    const options = {
      today: TODAY,
      dailyRows: spikeRows,
      campaigns: [campaign("c1", [])],
      pacingByCampaignId: new Map(),
    }
    const excluded = buildAnomalyCampaignInputs({ ...options, includeUnlinkedMeta: false })
    expect(excluded.map((i) => i.id)).toEqual(["c1"])

    const included = buildAnomalyCampaignInputs({ ...options, includeUnlinkedMeta: true })
    expect(included.map((i) => i.id)).toEqual(["c1", "m1"])
    // 포함된 미연결 캠페인에서 CPL 급등이 실제로 감지된다(7일 50 vs 30일 16.67).
    expect(detectAnomalies({ campaigns: included }).map((f) => f.kind)).toContain("cpl_spike")
  })

  it("링크가 겹쳐도 캠페인 축은 각자 계산된다(감지 중복 없음)", () => {
    const inputs = buildAnomalyCampaignInputs({
      today: TODAY,
      dailyRows: spikeRows,
      campaigns: [campaign("c1", ["m1"]), campaign("c2", ["m1"])],
      pacingByCampaignId: new Map(),
      includeUnlinkedMeta: true,
    })
    // m1 은 두 캠페인 모두에 연결됐으므로 미연결 축으로 다시 세지 않는다.
    expect(inputs.map((i) => i.id)).toEqual(["c1", "c2"])
    expect(inputs[0].cpl7d).toBe(inputs[1].cpl7d)
  })
})
