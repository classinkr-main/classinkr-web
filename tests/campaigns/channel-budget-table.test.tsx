import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import {
  ChannelBudgetTable,
  type ChannelBudgetRow,
} from "@/components/admin/campaigns/ChannelBudgetTable"
import type { AdChannel } from "@/lib/types/event-metrics"

function makeBudgets(overrides: Partial<Record<AdChannel, number>> = {}): Record<AdChannel, number> {
  return {
    google: 0,
    meta: 0,
    naver: 0,
    kakao: 0,
    youtube: 0,
    offline: 0,
    other: 0,
    ...overrides,
  }
}

const ROWS: ChannelBudgetRow[] = [
  { channel: "meta", label: "Meta", color: "#0866FF", spend: 5_000_000, leads: 40, cpl: 125_000 },
  { channel: "google", label: "Google Ads", color: "#4285F4", spend: 1_000_000, leads: 30, cpl: 33_333 },
]

function render(overrides: Partial<Parameters<typeof ChannelBudgetTable>[0]> = {}) {
  return renderToStaticMarkup(
    <ChannelBudgetTable
      rows={ROWS}
      budgets={makeBudgets({ meta: 12_000_000, google: 4_000_000 })}
      onBudgetChange={() => {}}
      totalSpend={6_000_000}
      totalRevenue={20_000_000}
      overallRoi={233}
      metaLiveSpend={1234.56}
      metaCurrency="USD"
      {...overrides}
    />
  )
}

describe("ChannelBudgetTable", () => {
  it("renders all 7 channel labels as fixed rows", () => {
    const html = render()
    expect(html).toContain("Meta")
    expect(html).toContain("Google Ads")
    expect(html).toContain("네이버")
    expect(html).toContain("카카오")
    expect(html).toContain("YouTube")
    expect(html).toContain("오프라인")
    expect(html).toContain("기타")
  })

  it("shows a computed 잔여 (배정 − 집행) for channels with both", () => {
    const html = render()
    // meta: 배정 12,000,000 − 집행 5,000,000 = 잔여 7,000,000
    expect(html).toContain("₩7,000,000")
    // google: 배정 4,000,000 − 집행 1,000,000 = 잔여 3,000,000
    expect(html).toContain("₩3,000,000")
  })

  it("renders a totals row summing 배정 / 집행 / 잔여", () => {
    const html = render()
    expect(html).toContain("합계")
    // sum 배정 = 16,000,000
    expect(html).toContain("₩16,000,000")
    // sum 잔여 = 16,000,000 − 6,000,000(=meta 5M+google 1M) = 10,000,000
    expect(html).toContain("₩10,000,000")
  })

  it("does NOT render a per-channel ROAS header (only the aggregate ROAS strip)", () => {
    const html = render()
    // no element whose text is exactly "ROAS" (a channel-level column header)
    expect(html).not.toMatch(/>\s*ROAS\s*</)
    // aggregate ROAS strip is present and caveated
    expect(html).toContain("종합 ROAS")
    expect(html).toContain("233%")
  })

  it("includes the 추정 and 입력 기준 caveats", () => {
    const html = render()
    expect(html).toContain("추정")
    expect(html).toContain("입력 기준")
  })

  it("shows the Meta 대조 callout with both figures and a currency-mismatch note, no drift %", () => {
    const html = render()
    expect(html).toContain("USD")
    expect(html).toContain("통화 상이")
    // does not fabricate a drift/차이 percentage
    expect(html).not.toContain("차이")
  })

  it("omits the Meta 대조 callout when metaLiveSpend is null", () => {
    const html = render({ metaLiveSpend: null })
    expect(html).not.toContain("통화 상이")
  })
})
