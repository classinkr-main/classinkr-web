import { describe, expect, it } from "vitest"
import { checkMarketingSanity } from "@/lib/marketing/insights/sanity-check"
import { digestInput, type MarketingInsightInput } from "@/lib/marketing/insights/input-builder"
import type { MarketingInsightResult } from "@/lib/marketing/insights/gemini-runner"

/** 검증기가 훑는 숫자만 실제 값으로 채운 최소 입력 — 나머지는 계약 충족용. */
function makeInput(overrides: Partial<MarketingInsightInput> = {}): MarketingInsightInput {
  return {
    scope: "weekly",
    generated_for: "2026-08-20",
    period: { key: "30d", since: "2026-07-22", until: "2026-08-20" },
    snapshot_at: "2026-08-20T09:00:00.000Z",
    currency_note: "Meta 광고비는 USD 네이티브다.",
    kpis: {
      spend_usd: 1234.56,
      spend_usd_prev: 980.2,
      spend_usd_delta_pct: 26,
      leads: 108,
      leads_prev: 91,
      leads_delta_pct: 19,
      cpl_usd: 11.43,
      cpl_usd_prev: 10.77,
      cpl_usd_delta_pct: 6,
      lead_conversion_rate_pct: 17.9,
      budget_execution_pct_krw: 62,
    },
    weekly: [
      { week_start: "2026-07-31", week_end: "2026-08-06", spend_usd: 300.5, leads: 27, cpl_usd: 11.13 },
      { week_start: "2026-08-07", week_end: "2026-08-13", spend_usd: 312.4, leads: 25, cpl_usd: 12.5 },
    ],
    funnel: {
      impressions: 45000,
      clicks: 900,
      ctr_pct: 2,
      ad_leads: 108,
      contacted: 64,
      converted_leads: 19,
    },
    scoreboard: [
      {
        name: "여름 리드젠",
        status: "active",
        elapsed_pct: 45,
        execution_pct: 62,
        pacing_currency: "USD",
        leads: 40,
        cpl_usd: 15.2,
      },
    ],
    anomalies: [],
    updates: [],
    data_caveats: [],
    ...overrides,
  }
}

function makeOutput(overrides: Partial<MarketingInsightResult> = {}): MarketingInsightResult {
  return { headline: "", highlights: [], next_actions: [], ...overrides }
}

describe("checkMarketingSanity", () => {
  it("입력에 있는 숫자만 인용하면 경고 0", () => {
    const warnings = checkMarketingSanity(
      makeInput(),
      makeOutput({
        headline: "광고비 1234.56달러로 리드 108건 확보",
        highlights: ["직전 기간 광고비는 980.2달러였다", "클릭 900회"],
        next_actions: [{ title: "예산 재배분", why: "집행률 62% 구간" }],
      })
    )
    expect(warnings).toHaveLength(0)
  })

  it("입력에 없는 숫자를 말하면 경고 발생", () => {
    const warnings = checkMarketingSanity(
      makeInput(),
      makeOutput({ headline: "리드 9999건으로 목표 초과 달성" })
    )
    expect(warnings.length).toBeGreaterThanOrEqual(1)
    expect(warnings[0]).toMatchObject({ field: "headline", value: 9999 })
  })

  it("퍼센트·콤마 표기를 정규화해 대조한다", () => {
    const warnings = checkMarketingSanity(
      makeInput(),
      makeOutput({ highlights: ["노출 45,000회", "전환율 17.9%"] })
    )
    expect(warnings).toHaveLength(0)
  })

  it("200% 초과 증가율은 오탐 없이 통과한다 (리드 21→156건 = 643%)", () => {
    const warnings = checkMarketingSanity(
      makeInput({ kpis: { ...makeInput().kpis, leads_delta_pct: 643 } }),
      makeOutput({ headline: "리드 643% 증가" })
    )
    expect(warnings).toHaveLength(0)
  })

  it("음수 델타는 절댓값으로 대조한다 (cpl_usd_delta_pct: -89 → '89% 감소')", () => {
    const warnings = checkMarketingSanity(
      makeInput({ kpis: { ...makeInput().kpis, cpl_usd_delta_pct: -89 } }),
      makeOutput({ headline: "CPL 89% 감소" })
    )
    expect(warnings).toHaveLength(0)
  })

  it("퍼센트 토큰이 퍼센트 아닌 입력값과 우연히 맞아도 여전히 걸린다 (범위 근사 부활 방지)", () => {
    // spend_usd·leads 는 퍼센트 필드가 아니다 — 156 이 leads 에 있어도 "156%" 는 pcts 후보에 없다.
    const warnings = checkMarketingSanity(
      makeInput({ kpis: { ...makeInput().kpis, spend_usd: 1123.3, leads: 156 } }),
      makeOutput({ headline: "전환율 156% 달성" })
    )
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatchObject({ field: "headline", value: 156 })
  })
})

describe("digestInput", () => {
  it("키 순서·스냅샷 시각이 달라도 수치가 같으면 같은 digest", () => {
    const a = makeInput()
    // 같은 값, 다른 키 삽입 순서 + 다른 동기화 시각(크론 재실행만으로 캐시가 깨지면 안 된다).
    const b = makeInput({
      snapshot_at: "2026-08-20T21:30:00.000Z",
      kpis: {
        leads_prev: 91,
        leads_delta_pct: 19,
        spend_usd: 1234.56,
        spend_usd_delta_pct: 26,
        cpl_usd_prev: 10.77,
        cpl_usd_delta_pct: 6,
        leads: 108,
        budget_execution_pct_krw: 62,
        spend_usd_prev: 980.2,
        lead_conversion_rate_pct: 17.9,
        cpl_usd: 11.43,
      },
    })
    expect(digestInput(b)).toBe(digestInput(a))
  })

  it("수치가 바뀌면 digest 가 바뀐다", () => {
    const changed = makeInput({ ...makeInput(), kpis: { ...makeInput().kpis, leads: 109 } })
    expect(digestInput(changed)).not.toBe(digestInput(makeInput()))
  })
})
