import { describe, expect, it } from "vitest"
import {
  aggregateCompassAdsets,
  type CompassAdsetDailyInput,
} from "@/lib/marketing/compass-adset"

function row(
  over: Partial<CompassAdsetDailyInput> & { day: string; adset_id: string }
): CompassAdsetDailyInput {
  return {
    adset_name: "세트 1",
    campaign_name: "캠페인 X",
    spend_usd: 0,
    leads: 0,
    clicks: 0,
    impressions: 0,
    ...over,
  }
}

describe("aggregateCompassAdsets", () => {
  const window = { since: "2026-08-10", until: "2026-08-12" }

  it("adset_id 단위로 접고 CPL·CTR 은 같은 축끼리 나누며 지출 내림차순으로 정렬한다", () => {
    const { rows, totals } = aggregateCompassAdsets(
      [
        row({ day: "2026-08-10", adset_id: "s1", spend_usd: 30, leads: 2, clicks: 40, impressions: 800 }),
        row({ day: "2026-08-11", adset_id: "s1", spend_usd: 20, leads: 3, clicks: 10, impressions: 200 }),
        row({
          day: "2026-08-11",
          adset_id: "s2",
          adset_name: "세트 2",
          spend_usd: 45,
          leads: 1,
          clicks: 5,
          impressions: 500,
        }),
      ],
      window
    )
    expect(rows.map((r) => r.adsetId)).toEqual(["s1", "s2"]) // 지출 내림차순(50 > 45)
    expect(rows[0]).toMatchObject({
      adsetId: "s1",
      spendUsd: 50,
      leads: 5,
      clicks: 50,
      impressions: 1000,
      cplUsd: 10,
      ctr: 0.05,
    })
    expect(rows[1]).toMatchObject({ adsetId: "s2", spendUsd: 45, leads: 1, cplUsd: 45, ctr: 0.01 })
    expect(totals).toEqual({ adsetCount: 2, leads: 6, spendUsd: 95, cplUsd: 15.83 })
  })

  it("리드 0 이면 CPL 은 null, impressions 0 이면 CTR 은 null(0 으로 포장하지 않는다)", () => {
    const { rows } = aggregateCompassAdsets(
      [row({ day: "2026-08-10", adset_id: "s1", spend_usd: 12.5, leads: 0, clicks: 3, impressions: 0 })],
      window
    )
    expect(rows[0].cplUsd).toBeNull()
    expect(rows[0].ctr).toBeNull()
  })

  it("기간 밖 일자는 집계에 넣지 않는다", () => {
    const { totals } = aggregateCompassAdsets(
      [
        row({ day: "2026-08-09", adset_id: "s1", spend_usd: 999, leads: 99 }),
        row({ day: "2026-08-10", adset_id: "s1", spend_usd: 10, leads: 1 }),
        row({ day: "2026-08-13", adset_id: "s1", spend_usd: 999, leads: 99 }),
      ],
      window
    )
    expect(totals).toMatchObject({ leads: 1, spendUsd: 10 })
  })

  it("spendShare 는 총 spend 대비 비율이고, 총 spend 가 0 이면 null이다", () => {
    const { rows } = aggregateCompassAdsets(
      [
        row({ day: "2026-08-10", adset_id: "s1", spend_usd: 75, leads: 1 }),
        row({ day: "2026-08-10", adset_id: "s2", adset_name: "세트 2", spend_usd: 25, leads: 1 }),
      ],
      window
    )
    const s1 = rows.find((r) => r.adsetId === "s1")
    const s2 = rows.find((r) => r.adsetId === "s2")
    expect(s1?.spendShare).toBe(0.75)
    expect(s2?.spendShare).toBe(0.25)

    // 지출 0 이라도 클릭이 있으면 행 자체는 남는다(전부 0 이 아니라서) — 그때도 spendShare 는
    // 분모(총 spend) 가 0 이므로 null 이지 0 이 아니다.
    const zeroSpend = aggregateCompassAdsets(
      [row({ day: "2026-08-10", adset_id: "s1", spend_usd: 0, leads: 0, clicks: 1, impressions: 10 })],
      window
    )
    expect(zeroSpend.rows).toHaveLength(1)
    expect(zeroSpend.rows[0].spendShare).toBeNull()
  })

  it("모든 측정치가 0 인 세트는 잡음이므로 목록에서 뺀다(compass-creative 와 동일 규칙)", () => {
    const { rows } = aggregateCompassAdsets(
      [row({ day: "2026-08-10", adset_id: "s1", spend_usd: 0, leads: 0, clicks: 0, impressions: 0 })],
      window
    )
    expect(rows).toEqual([])
  })

  it("정렬은 지출 내림차순이고 동률이면 세트명으로 전순서를 만든다(같은 입력이면 같은 순서)", () => {
    const { rows } = aggregateCompassAdsets(
      [
        row({ day: "2026-08-10", adset_id: "b", adset_name: "나", spend_usd: 10 }),
        row({ day: "2026-08-10", adset_id: "c", adset_name: "가", spend_usd: 10 }),
        row({ day: "2026-08-10", adset_id: "a", adset_name: "다", spend_usd: 40 }),
      ],
      window
    )
    expect(rows.map((r) => r.adsetId)).toEqual(["a", "c", "b"])
  })

  it("세트명·캠페인명은 가장 최근 날짜 값이 이긴다(개명 후 옛 이름 잔존 방지)", () => {
    const { rows } = aggregateCompassAdsets(
      [
        row({ day: "2026-08-10", adset_id: "s1", adset_name: "옛 이름", campaign_name: "옛 캠페인", spend_usd: 1 }),
        row({ day: "2026-08-12", adset_id: "s1", adset_name: "새 이름", campaign_name: "새 캠페인", spend_usd: 1 }),
      ],
      window
    )
    expect(rows[0]).toMatchObject({ adsetName: "새 이름", campaignName: "새 캠페인" })
  })

  it("NaN·null 수치는 0 으로 흡수하고 합계를 깨뜨리지 않는다(뷰 원천 방어)", () => {
    const { rows } = aggregateCompassAdsets(
      [
        row({ day: "2026-08-10", adset_id: "s1", spend_usd: null, leads: null, clicks: Number.NaN }),
        row({ day: "2026-08-11", adset_id: "s1", spend_usd: 5, leads: 1 }),
      ],
      window
    )
    expect(rows[0]).toMatchObject({ spendUsd: 5, leads: 1, clicks: 0 })
  })
})
