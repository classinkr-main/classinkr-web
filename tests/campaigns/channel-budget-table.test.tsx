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
    // sum 잔여 = 7,000,000(meta) + 3,000,000(google) = 10,000,000 (per-row remainings)
    expect(html).toContain("₩10,000,000")
  })

  it("totals 잔여 equals the sum of visible per-row 잔여 — an unallocated channel's spend does NOT subtract", () => {
    const rows: ChannelBudgetRow[] = [
      { channel: "meta", label: "Meta", color: "#0866FF", spend: 5_000_000, leads: 40, cpl: 125_000 },
      // 네이버: 집행 8M은 있지만 배정 0 → 잔여 "—", 총계 잔여에 기여하지 않아야 한다
      { channel: "naver", label: "네이버", color: "#03C75A", spend: 8_000_000, leads: 10, cpl: 800_000 },
    ]
    const html = renderToStaticMarkup(
      <ChannelBudgetTable
        rows={rows}
        budgets={makeBudgets({ meta: 20_000_000 })} // naver 미배정
        onBudgetChange={() => {}}
        totalSpend={13_000_000}
        totalRevenue={0}
        overallRoi={null}
        metaLiveSpend={null}
        metaCurrency="USD"
      />
    )
    // meta 잔여 = 20,000,000 − 5,000,000 = 15,000,000; 총계 잔여도 15,000,000 이어야 함
    expect(html).toContain("₩15,000,000")
    // 구버전 버그(총계 = 배정합 20M − 전체집행 13M = 7,000,000)가 나오면 안 됨
    expect(html).not.toContain("₩7,000,000")
  })

  it("labels the aggregate metric ROI (matching aggregate.overallRoi math), not ROAS, and shows no per-channel ROI/ROAS header", () => {
    const html = render()
    // no bare per-channel metric column header (aggregate is labeled "종합 ROI")
    expect(html).not.toMatch(/>\s*ROAS\s*</)
    expect(html).not.toMatch(/>\s*ROI\s*</)
    // the shown value is net ROI ((revenue−spend)/spend), so it must read ROI, never ROAS
    expect(html).toContain("종합 ROI")
    expect(html).not.toContain("ROAS")
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
