import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { CampaignRollupCard } from "@/components/admin/campaigns/manage/CampaignDetailPanel"
import type { CampaignRollup } from "@/lib/types/marketing-campaign"

// 롤업 카드는 순수 프레젠테이션(props: rollup) — renderToStaticMarkup 로 정직 규칙만 검증한다.
function makeRollup(overrides: Partial<CampaignRollup> = {}): CampaignRollup {
  return {
    emailRecipients: 1200,
    emailOpens: 340,
    smsRecipients: 800,
    // API 는 리드 attribution 을 v1 에서 집계하지 않아 0 을 자리표시자로 반환한다(실제 0 리드 아님).
    eventLeads: 0,
    eventDeals: 5,
    eventRevenue: null,
    metaSpend: null,
    metaCurrency: null,
    metaLeads: 12,
    linkedCounts: { email: 2, sms: 1, event: 1, meta: 0 },
    ...overrides,
  }
}

describe("CampaignRollupCard — 정직 규칙", () => {
  it("행사 리드를 '미집계'로 표기하고 '리드 0'을 만들지 않는다", () => {
    const html = renderToStaticMarkup(<CampaignRollupCard rollup={makeRollup()} />)
    expect(html).toContain("미집계")
    expect(html).not.toContain("리드 0")
  })

  it("행사 매출이 null 이면 '미입력'으로 표기한다(0원과 구분)", () => {
    const html = renderToStaticMarkup(<CampaignRollupCard rollup={makeRollup({ eventRevenue: null })} />)
    expect(html).toContain("미입력")
  })

  it("Meta 집행이 null 이면 '—'로 표기한다", () => {
    const html = renderToStaticMarkup(
      <CampaignRollupCard rollup={makeRollup({ metaSpend: null, metaCurrency: null })} />,
    )
    expect(html).toContain("—")
  })

  it("Meta 집행은 계정 통화 네이티브로 표기하고 절대 ₩ 로 접지 않는다", () => {
    const html = renderToStaticMarkup(
      <CampaignRollupCard
        rollup={makeRollup({ metaSpend: 1234.5, metaCurrency: "USD", eventRevenue: null })}
      />,
    )
    expect(html).toContain("USD")
    // eventRevenue 가 null 이라 화면 어디에도 ₩ 가 없어야 한다(Meta 를 KRW 로 접지 않았다는 증거).
    expect(html).not.toContain("₩")
  })

  it("조작된 종합 ROAS·블렌디드 합계는 만들지 않는다", () => {
    const html = renderToStaticMarkup(
      <CampaignRollupCard
        rollup={makeRollup({ eventRevenue: 5_000_000, metaSpend: 1000, metaCurrency: "USD" })}
      />,
    )
    expect(html).not.toContain("ROAS")
    expect(html).not.toContain("합계")
  })
})
