import { describe, expect, it } from "vitest"
import {
  aggregateCompassCreatives,
  attachCompassSpend,
  indexCompassCreativesByAdName,
  normalizeCreativeName,
  type CompassAdDailyInput,
} from "@/lib/marketing/compass-creative"
import type { AdCreativePerf } from "@/lib/marketing/creative-input"

function row(over: Partial<CompassAdDailyInput> & { day: string; ad_id: string }): CompassAdDailyInput {
  return {
    ad_name: "소재 A",
    adset_name: "세트 1",
    campaign_name: "캠페인 X",
    category: null,
    creative_thumb: null,
    creative_title: null,
    creative_body: null,
    spend_usd: 0,
    leads: 0,
    clicks: 0,
    impressions: 0,
    ...over,
  }
}

describe("aggregateCompassCreatives", () => {
  const window = { since: "2026-08-10", until: "2026-08-12" }

  it("ad_id 단위로 접고 CPL 은 같은 축끼리 나눈다", () => {
    const { rows, totals } = aggregateCompassCreatives(
      [
        row({ day: "2026-08-10", ad_id: "a1", spend_usd: 30, leads: 2, clicks: 40, impressions: 900 }),
        row({ day: "2026-08-11", ad_id: "a1", spend_usd: 20, leads: 3, clicks: 10, impressions: 100 }),
        row({ day: "2026-08-11", ad_id: "a2", ad_name: "소재 B", spend_usd: 45, leads: 1 }),
      ],
      window
    )
    expect(rows.map((r) => r.adId)).toEqual(["a1", "a2"]) // 리드 내림차순
    expect(rows[0]).toMatchObject({ leads: 5, spendUsd: 50, cplUsd: 10, clicks: 50, impressions: 1000 })
    expect(rows[1]).toMatchObject({ leads: 1, spendUsd: 45, cplUsd: 45 })
    expect(totals).toEqual({ adCount: 2, leads: 6, spendUsd: 95, cplUsd: 15.83 })
  })

  it("리드 0 이면 CPL 은 0 이 아니라 null(분모 0 정직)", () => {
    const { rows, totals } = aggregateCompassCreatives(
      [row({ day: "2026-08-10", ad_id: "a1", spend_usd: 12.5, leads: 0, clicks: 3 })],
      window
    )
    expect(rows[0].cplUsd).toBeNull()
    expect(totals.cplUsd).toBeNull()
  })

  it("기간 밖 행은 집계에 넣지 않는다", () => {
    const { totals } = aggregateCompassCreatives(
      [
        row({ day: "2026-08-09", ad_id: "a1", spend_usd: 999, leads: 99 }),
        row({ day: "2026-08-10", ad_id: "a1", spend_usd: 10, leads: 1 }),
        row({ day: "2026-08-13", ad_id: "a1", spend_usd: 999, leads: 99 }),
      ],
      window
    )
    expect(totals).toMatchObject({ leads: 1, spendUsd: 10 })
  })

  it("크리에이티브 메타는 가장 최근 날짜 값이 이긴다(소재 교체 후 옛 문구 잔존 방지)", () => {
    const { rows } = aggregateCompassCreatives(
      [
        row({ day: "2026-08-10", ad_id: "a1", creative_title: "옛 카피", leads: 1 }),
        row({ day: "2026-08-12", ad_id: "a1", creative_title: "새 카피", leads: 1 }),
      ],
      window
    )
    expect(rows[0].title).toBe("새 카피")
  })

  it("빈 문자열 메타는 값으로 치지 않고 이전 값을 유지한다", () => {
    const { rows } = aggregateCompassCreatives(
      [
        row({ day: "2026-08-10", ad_id: "a1", creative_title: "카피", leads: 1 }),
        row({ day: "2026-08-12", ad_id: "a1", creative_title: "   ", leads: 1 }),
      ],
      window
    )
    expect(rows[0].title).toBe("카피")
  })

  it("조회 범위가 스파크라인 창을 안 덮으면 0 을 채우지 않고 빈 배열로 강등한다", () => {
    const notCovered = aggregateCompassCreatives(
      [row({ day: "2026-08-12", ad_id: "a1", leads: 2 })],
      { since: "2026-08-10", until: "2026-08-12", sparklineDays: 5 }
    )
    expect(notCovered.rows[0].sparkline).toEqual([])

    const covered = aggregateCompassCreatives(
      [
        row({ day: "2026-08-09", ad_id: "a1", leads: 1 }),
        row({ day: "2026-08-12", ad_id: "a1", leads: 2 }),
      ],
      { since: "2026-08-10", until: "2026-08-12", sparklineDays: 5, loadedSince: "2026-08-08" }
    )
    // 창 = 8/8~8/12. 8/9 은 집계 기간 밖이지만 스파크라인에는 실측으로 들어간다.
    expect(covered.rows[0].sparkline).toEqual([0, 1, 0, 0, 2])
    expect(covered.rows[0].leads).toBe(2) // 집계는 여전히 기간 안(8/10~8/12)만
  })

  it("NaN·null 수치는 0 으로 흡수하고 합계를 깨뜨리지 않는다(뷰 원천 방어)", () => {
    const { rows } = aggregateCompassCreatives(
      [
        row({ day: "2026-08-10", ad_id: "a1", spend_usd: null, leads: null, clicks: Number.NaN }),
        row({ day: "2026-08-11", ad_id: "a1", spend_usd: 5, leads: 1 }),
      ],
      window
    )
    expect(rows[0]).toMatchObject({ spendUsd: 5, leads: 1, clicks: 0 })
  })

  it("정렬은 리드 → 지출 → 이름 순으로 전순서다(같은 입력이면 같은 순서)", () => {
    const { rows } = aggregateCompassCreatives(
      [
        row({ day: "2026-08-10", ad_id: "b", ad_name: "나", leads: 3, spend_usd: 10 }),
        row({ day: "2026-08-10", ad_id: "c", ad_name: "가", leads: 3, spend_usd: 10 }),
        row({ day: "2026-08-10", ad_id: "a", ad_name: "다", leads: 3, spend_usd: 40 }),
      ],
      window
    )
    expect(rows.map((r) => r.adId)).toEqual(["a", "c", "b"])
  })
})

describe("indexCompassCreativesByAdName / attachCompassSpend", () => {
  const compassRows = aggregateCompassCreatives(
    [
      row({ day: "2026-08-10", ad_id: "a1", ad_name: "여름 원장 ROI", spend_usd: 40, leads: 4 }),
      // 같은 광고명의 다른 ad_id — 합산해야 지출이 사라지지 않는다.
      row({ day: "2026-08-10", ad_id: "a2", ad_name: "여름  원장 ROI ", spend_usd: 20, leads: 1 }),
      row({ day: "2026-08-10", ad_id: "a3", ad_name: "무료 체험", spend_usd: 30, leads: 0 }),
    ],
    { since: "2026-08-10", until: "2026-08-10" }
  ).rows

  const index = indexCompassCreativesByAdName(compassRows)

  const ranked: AdCreativePerf[] = [
    { campaign: "캠페인 X", adset: "세트", ad: "여름 원장 ROI", leads: 9, converted: 2 },
    { campaign: "캠페인 X", adset: "세트", ad: "무료 체험", leads: 3, converted: 0 },
    { campaign: "캠페인 X", adset: "세트", ad: "매칭 안 되는 소재", leads: 1, converted: 0 },
  ]

  it("공백·대소문자 흔들림을 흡수하고 동명 소재를 합산한다", () => {
    expect(normalizeCreativeName("  여름  원장 ROI ")).toBe("여름 원장 roi")
    const stat = index.get("여름 원장 roi")
    expect(stat).toMatchObject({ leads: 5, spendUsd: 60, cplUsd: 12 })
    expect(stat?.adIds).toHaveLength(2)
  })

  it("매칭 실패는 0 이 아니라 null 이고 spend_matched=false 로 밝힌다", () => {
    const joined = attachCompassSpend(ranked, index)
    expect(joined[0]).toMatchObject({
      leads: 9, // 우리 리드 DB 축은 그대로
      compass_leads: 5, // Meta 리포트 축은 별개
      spend_usd: 60,
      cpl_usd: 12,
      spend_matched: true,
    })
    expect(joined[2]).toMatchObject({
      spend_usd: null,
      compass_leads: null,
      cpl_usd: null,
      spend_matched: false,
    })
  })

  it("Compass 리드 0 인 소재는 지출이 있어도 CPL 을 만들지 않는다", () => {
    const joined = attachCompassSpend(ranked, index)
    expect(joined[1]).toMatchObject({ spend_usd: 30, compass_leads: 0, cpl_usd: null, spend_matched: true })
  })

  it("브리지 다운(빈 인덱스)이면 전 행이 미집계로 붙는다 — 랭킹 자체는 살아 있다", () => {
    const joined = attachCompassSpend(ranked, new Map())
    expect(joined).toHaveLength(3)
    expect(joined.every((r) => r.spend_usd === null && !r.spend_matched)).toBe(true)
    expect(joined[0].leads).toBe(9)
  })
})
