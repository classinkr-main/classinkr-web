/**
 * CRM T1 — 인사이트 "단계 퍼널 · 리드 → 딜" 섹션(components/admin/crm/CrmInsightsClient.tsx의
 * CrmStageFunnelSection). renderToStaticMarkup으로 정적 마크업만 검사한다(environment: "node").
 */
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { CrmStageFunnelSection } from "@/components/admin/crm/CrmInsightsClient"
import { buildStageFunnel, type StageFunnelResult } from "@/lib/crm/stage-funnel"

const STAGE_FUNNEL: StageFunnelResult = buildStageFunnel({
  leads: { new: 10, contacted: 80, converted: 20, closed: 6 },
  deals: { consult: 18, demo: 15, quote: 10, decision: 6, order: 4, won: 3, lost: 9, total: 65 },
})!

describe("CrmStageFunnelSection — 9단계 라벨과 캡션", () => {
  it("리드 3단계 + 딜 6단계 라벨을 전부 그린다", () => {
    const html = renderToStaticMarkup(
      <CrmStageFunnelSection stageFunnel={STAGE_FUNNEL} generatedAt="2026-09-21T01:00:00.000Z" loading={false} />
    )
    for (const label of ["리드 신규", "리드 연락중", "리드 전환", "딜 상담", "데모", "견적", "결정", "주문", "결제"]) {
      expect(html).toContain(label)
    }
  })

  it("리드 단계는 leads 보드 filter 딥링크를 걸고, 딜 단계는 링크를 생략한다(/admin/crm/deals가 stage를 받지 않는다)", () => {
    const html = renderToStaticMarkup(
      <CrmStageFunnelSection stageFunnel={STAGE_FUNNEL} generatedAt={null} loading={false} />
    )
    expect(html).toContain('href="/admin/crm/customers/leads?filter=new"')
    expect(html).toContain('href="/admin/crm/customers/leads?filter=contacted"')
    expect(html).toContain('href="/admin/crm/customers/leads?filter=converted"')
    expect(html).not.toContain("/admin/crm/deals?stage=")
  })

  it("리드 종료·딜 이탈을 퍼널 밖 캡션으로 병기한다", () => {
    const html = renderToStaticMarkup(
      <CrmStageFunnelSection stageFunnel={STAGE_FUNNEL} generatedAt={null} loading={false} />
    )
    expect(html).toContain("리드 종료")
    expect(html).toContain("딜")
    expect(html).toContain("이탈")
    expect(html).toContain(String(STAGE_FUNNEL.closed))
    expect(html).toContain(String(STAGE_FUNNEL.lost))
  })

  it("기준 시각 캡션을 그린다", () => {
    const html = renderToStaticMarkup(
      <CrmStageFunnelSection stageFunnel={STAGE_FUNNEL} generatedAt="2026-09-21T01:00:00.000Z" loading={false} />
    )
    expect(html).toContain("기준 ")
  })
})

describe("현재 단계 분포의 의미", () => {
  it("리드와 딜의 누적값을 실제 현재 상태 건수로 표시하며 전환율을 추정하지 않는다", () => {
    const html = renderToStaticMarkup(<CrmStageFunnelSection stageFunnel={STAGE_FUNNEL} generatedAt={null} loading={false} />)
    expect(html).toContain('aria-label="리드 상태 건수"')
    expect(html).toContain('aria-label="딜 단계 건수"')
    expect(html).toContain('data-stage="lead_new" data-count="10"')
    expect(html).toContain('data-stage="lead_contacted" data-count="80"')
    expect(html).toContain('data-stage="deal_consult" data-count="18"')
    expect(html).not.toContain("병목 · 전환")
    expect(html).not.toContain("이전 단계 대비")
  })
})

describe("CrmStageFunnelSection — 로딩/실패 상태", () => {
  it("stageFunnel이 null이고 loading이면 계산 중 문구를 그린다", () => {
    const html = renderToStaticMarkup(<CrmStageFunnelSection stageFunnel={null} generatedAt={null} loading={true} />)
    expect(html).toContain("계산 중입니다")
  })

  it("stageFunnel이 null이고 loading이 끝나면 EmptyState를 그린다(딜 단계 집계 실패)", () => {
    const html = renderToStaticMarkup(<CrmStageFunnelSection stageFunnel={null} generatedAt={null} loading={false} />)
    expect(html).toContain("딜 단계 집계를 가져오지 못했습니다.")
  })
})
