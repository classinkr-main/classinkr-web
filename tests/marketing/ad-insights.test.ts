import { describe, expect, it } from "vitest"

import {
  fromGoogle,
  fromMeta,
  fromNaver,
  isLiveAdChannel,
  LIVE_AD_CHANNELS,
  mergeSameCurrency,
  summarizeChannel,
  type AdInsightRow,
  type ChannelSpendSummary,
} from "@/lib/marketing/ad-insights"
import {
  buildChannelCoverage,
  coverageScore,
  type ChannelCoverageInput,
} from "@/lib/marketing/channel-coverage"

/**
 * 채널 중립 집계의 정직 규칙을 잠근다. 여기서 지키는 구분은 화면에 그대로 드러난다:
 *   null(소스 실패/미측정)  ≠  0(조회됐고 집행 없음)
 *   통화가 섞이면 합계 없음  ≠  합계 0
 */

const metaRow = (over: Partial<Parameters<typeof fromMeta>[0][number]> = {}) => ({
  date: "2026-09-10",
  campaignId: "m1",
  campaignName: "메타 캠페인",
  spend: 100,
  impressions: 1000,
  clicks: 50,
  leads: 5,
  currency: "USD",
  ...over,
})

describe("채널 중립 행 변환", () => {
  it("Meta 는 leads 축으로, conversions 는 null — 같은 걸 두 번 세지 않는다", () => {
    const [row] = fromMeta([metaRow()])
    expect(row).toMatchObject({ channel: "meta", leads: 5, conversions: null })
  })

  it("Google 은 conversions 축으로, leads 는 0 — 리드와 전환을 같은 칸에 섞지 않는다", () => {
    const [row] = fromGoogle([
      {
        date: "2026-09-10",
        campaignId: "g1",
        campaignName: "구글",
        spend: 1.84,
        impressions: 100,
        clicks: 10,
        conversions: 3,
        currency: "KRW",
      },
    ])
    expect(row).toMatchObject({ channel: "google", leads: 0, conversions: 3 })
  })

  it("네이버 전환 0 은 '측정 없음'(null) 이다 — 전환추적 미연동 계정이 0 을 준다", () => {
    const base = {
      date: "2026-09-10",
      campaignId: "n1",
      campaignName: "네이버",
      spend: 920_000,
      impressions: 12_000,
      clicks: 340,
      currency: "KRW",
    }
    expect(fromNaver([{ ...base, conversions: 0 }])[0].conversions).toBeNull()
    expect(fromNaver([{ ...base, conversions: 4 }])[0].conversions).toBe(4)
  })

  it("라이브 채널 판정", () => {
    expect(LIVE_AD_CHANNELS).toEqual(["meta", "google", "naver"])
    expect(isLiveAdChannel("naver")).toBe(true)
    expect(isLiveAdChannel("kakao")).toBe(false)
  })
})

describe("summarizeChannel — null 과 0 의 구분", () => {
  it("rows 가 null(소스 실패)이면 전 필드 미측정", () => {
    const summary = summarizeChannel("meta", null)
    expect(summary).toEqual({
      channel: "meta",
      spend: null,
      currency: null,
      impressions: null,
      clicks: null,
      conversions: null,
      costPerConversion: null,
      campaignCount: 0,
    })
  })

  it("빈 배열(조회됐고 집행 없음)이면 0 — 미측정과 다르다", () => {
    const summary = summarizeChannel("meta", [])
    expect(summary.spend).toBe(0)
    expect(summary.impressions).toBe(0)
    // 전환은 한 행도 측정되지 않았으므로 여전히 null(0 전환이 아니다).
    expect(summary.conversions).toBeNull()
    expect(summary.costPerConversion).toBeNull()
  })

  it("자기 채널 행만 집계한다", () => {
    const rows = [...fromMeta([metaRow()]), ...fromMeta([metaRow({ campaignId: "m2", spend: 50 })])]
    expect(summarizeChannel("meta", rows).spend).toBe(150)
    expect(summarizeChannel("google", rows).spend).toBe(0)
  })

  it("전환당 비용 = 집행 ÷ 전환. 분모 0 이면 null", () => {
    const rows = fromMeta([metaRow({ spend: 100, leads: 4 })])
    expect(summarizeChannel("meta", rows).costPerConversion).toBe(25)
    expect(summarizeChannel("meta", fromMeta([metaRow({ leads: 0 })])).costPerConversion).toBeNull()
  })

  it("통화가 섞이면 합계를 내지 않는다 — 캠페인 수만 사실대로 보고", () => {
    const rows = [
      ...fromMeta([metaRow({ currency: "USD" })]),
      ...fromMeta([metaRow({ campaignId: "m2", currency: "KRW" })]),
    ]
    const summary = summarizeChannel("meta", rows)
    expect(summary.spend).toBeNull()
    expect(summary.currency).toBeNull()
    expect(summary.campaignCount).toBe(2)
  })

  it("같은 캠페인의 여러 날짜는 캠페인 1개로 센다", () => {
    const rows = fromMeta([metaRow({ date: "2026-09-10" }), metaRow({ date: "2026-09-11" })])
    expect(summarizeChannel("meta", rows).campaignCount).toBe(1)
  })
})

describe("mergeSameCurrency — 합계를 낼 수 있는 유일한 경우", () => {
  const summary = (over: Partial<ChannelSpendSummary>): ChannelSpendSummary => ({
    channel: "meta",
    spend: 100,
    currency: "USD",
    impressions: 0,
    clicks: 0,
    conversions: null,
    costPerConversion: null,
    campaignCount: 1,
    ...over,
  })

  it("전 채널이 같은 통화면 합친다", () => {
    expect(
      mergeSameCurrency([summary({}), summary({ channel: "google", spend: 50 })])
    ).toEqual({ currency: "USD", spend: 150, channels: ["meta", "google"] })
  })

  it("통화가 섞이면 null — 합계 칸을 비운다", () => {
    expect(
      mergeSameCurrency([summary({}), summary({ channel: "naver", currency: "KRW" })])
    ).toBeNull()
  })

  it("잰 채널이 하나도 없으면 null", () => {
    expect(mergeSameCurrency([summary({ spend: null, currency: null })])).toBeNull()
    expect(mergeSameCurrency([])).toBeNull()
  })

  it("미측정 채널은 분모에서 빠지고 나머지만 합친다", () => {
    const merged = mergeSameCurrency([
      summary({}),
      summary({ channel: "naver", spend: null, currency: null }),
    ])
    expect(merged).toEqual({ currency: "USD", spend: 100, channels: ["meta"] })
  })
})

describe("buildChannelCoverage — 실제 설정값으로 판정한다", () => {
  const live = (over: Partial<{ channel: string; configured: boolean; spend: number | null; dataThrough: string | null }> = {}) => ({
    channel: "google",
    configured: true,
    spend: 100,
    dataThrough: "2026-09-13",
    ...over,
  })

  const base: ChannelCoverageInput = {
    live: [],
    googleConversionLabelSet: true,
    naverWcsSet: true,
    naverConversionTypeSet: true,
    metaPixelSet: true,
    kakaoPixelSet: true,
  }

  const rowFor = (channel: string, input: Partial<typeof base> = {}) =>
    buildChannelCoverage({ ...base, ...input }).find((row) => row.channel === channel)!

  it("미연동 채널은 '없음' 이고 무엇을 채워야 하는지 말한다", () => {
    const row = rowFor("google", { live: [live({ configured: false })] })
    expect(row.spendData.state).toBe("none")
    expect(row.spendData.note).toContain("GOOGLE_ADS_")
  })

  it("연동됐는데 스냅샷이 없으면 '반쪽'(크론 대기)", () => {
    expect(rowFor("google", { live: [live({ dataThrough: null })] }).spendData.state).toBe("partial")
  })

  it("연동 + 스냅샷이면 '연동' 이고 최신 일자를 보여준다", () => {
    const cell = rowFor("google", { live: [live()] }).spendData
    expect(cell.state).toBe("live")
    expect(cell.note).toContain("2026-09-13")
  })

  it("Google 전환 라벨이 비면 전환 추적이 '반쪽' — 이 표를 만든 이유", () => {
    const cell = rowFor("google", { googleConversionLabelSet: false }).conversionTracking
    expect(cell.state).toBe("partial")
    expect(cell.note).toContain("전환 미발송")
  })

  it("네이버는 공통키와 전환 유형이 둘 다 있어야 '연동'", () => {
    expect(rowFor("naver").conversionTracking.state).toBe("live")
    expect(rowFor("naver", { naverConversionTypeSet: false }).conversionTracking.state).toBe("partial")
    expect(rowFor("naver", { naverWcsSet: false }).conversionTracking.state).toBe("none")
  })

  it("네이버 리드 귀속은 n_* 수집이 들어간 뒤로 '연동'", () => {
    expect(rowFor("naver").leadAttribution.state).toBe("live")
  })

  it("수기·해당없음 축은 커버리지 점수 분모에서 빠진다 — '빈칸 N' 이 할 일 수와 같아야 한다", () => {
    const offline = rowFor("offline")
    expect(offline.spendData.state).toBe("manual")
    expect(offline.leadAttribution.state).toBe("manual")
    expect(offline.conversionTracking.state).toBe("na")
    // 셋 다 고칠 수 있는 항목이 아니다 → 분모 0.
    expect(coverageScore(offline)).toEqual({ live: 0, total: 0 })
  })

  it("전 축이 연동인 채널은 3/3", () => {
    const meta = rowFor("meta", { live: [live({ channel: "meta" })] })
    expect(coverageScore(meta)).toEqual({ live: 3, total: 3 })
  })

  it("7개 채널 전부를 덮는다 — 표에서 채널이 새지 않게", () => {
    expect(buildChannelCoverage(base)).toHaveLength(7)
  })
})

describe("AdInsightRow 형태 — 화면이 보는 공통 축", () => {
  it("세 채널이 같은 키 집합을 낸다", () => {
    const rows: AdInsightRow[] = [
      ...fromMeta([metaRow()]),
      ...fromGoogle([
        { date: "d", campaignId: "g", campaignName: null, spend: 1, impressions: 1, clicks: 1, conversions: 1, currency: "KRW" },
      ]),
      ...fromNaver([
        { date: "d", campaignId: "n", campaignName: null, spend: 1, impressions: 1, clicks: 1, conversions: 1, currency: "KRW" },
      ]),
    ]
    const keys = rows.map((row) => Object.keys(row).sort().join(","))
    expect(new Set(keys).size).toBe(1)
  })
})
