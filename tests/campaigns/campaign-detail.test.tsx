import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import {
  CampaignLinkLabel,
  CampaignRollupCard,
} from "@/components/admin/campaigns/manage/CampaignDetailPanel"
import type { CampaignLink, CampaignRollup } from "@/lib/types/marketing-campaign"

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
    linkedCounts: { email: 2, sms: 1, event: 1, meta: 1 },
    ...overrides,
  }
}

function makeLink(overrides: Partial<CampaignLink> = {}): CampaignLink {
  return {
    id: "lnk-1",
    campaignId: "cmp-1",
    refType: "email_campaign",
    refId: "ec-42",
    createdAt: "2026-07-01T00:00:00.000Z",
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

  it("Meta 집행이 null 이면(통화 혼재·미해석) '—'로 표기한다", () => {
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

describe("CampaignRollupCard — 빈 채널 약화", () => {
  it("연결 0 건 채널은 0 의 나열 대신 '연결 없음'만 말한다", () => {
    const html = renderToStaticMarkup(
      <CampaignRollupCard
        rollup={makeRollup({ linkedCounts: { email: 2, sms: 0, event: 0, meta: 0 } })}
      />,
    )
    expect(html).toContain("연결 없음")
    // 문자·행사·Meta 는 0 건이라 수치를 만들지 않는다(수신 800·매출 미입력이 타일에 뜨지 않는다).
    expect(html).not.toContain("800")
    expect(html).not.toContain("미입력")
  })

  it("빈 채널 타일은 점선·뉴트럴로 물러나고 '0건' 배지를 달지 않는다", () => {
    const html = renderToStaticMarkup(
      <CampaignRollupCard
        rollup={makeRollup({ linkedCounts: { email: 2, sms: 0, event: 0, meta: 0 } })}
      />,
    )
    expect(html).toContain("border-dashed")
    expect(html).not.toContain("0건")
    expect(html).toContain("2건") // 실데이터 채널은 그대로 건수를 유지
  })

  it("채널은 0 건이어도 목록에서 사라지지 않는다(정직: 숨김 아님)", () => {
    const html = renderToStaticMarkup(
      <CampaignRollupCard
        rollup={makeRollup({ linkedCounts: { email: 0, sms: 0, event: 0, meta: 0 } })}
      />,
    )
    for (const label of ["이메일", "문자", "행사", "Meta 광고"]) {
      expect(html).toContain(label)
    }
  })
})

describe("CampaignLinkLabel — 라벨 우선·refId 폴백", () => {
  it("label 이 있으면 사람이 읽는 이름을 보여준다(raw id 노출 없음)", () => {
    const html = renderToStaticMarkup(
      <CampaignLinkLabel link={makeLink({ label: "7월 신규반 오픈 안내" })} />,
    )
    expect(html).toContain("7월 신규반 오픈 안내")
    // refId 는 툴팁(title)에만 남고 본문 텍스트로는 노출되지 않는다.
    expect(html).not.toContain(">ec-42<")
  })

  it("label 이 없으면 raw refId 로 폴백한다(그럴듯한 이름을 지어내지 않는다)", () => {
    const html = renderToStaticMarkup(<CampaignLinkLabel link={makeLink()} />)
    expect(html).toContain("ec-42")
    expect(html).toContain("font-mono")
    expect(html).not.toContain("이메일 캠페인")
  })
})
