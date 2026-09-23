import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import LeadSummaryPanel from "@/components/admin/crm/home/LeadSummaryPanel"
import type { LeadActionKpis } from "@/components/admin/crm/home/shared"

// home-05 — 리드 요약 힌트 줄('48h 이상 N건'·'오늘 예정 N건')이 실패 상태에서 0 을 그리지 않는다.

const KPIS: LeadActionKpis = {
  total: 10,
  byStatus: { new: 4, contacted: 3, converted: 2, closed: 1 },
  unrespondedCount: 4,
  unresponded24hCount: 2,
  unresponded48hCount: 1,
  todayFollowUpCount: 5,
  overdueFollowUpCount: 2,
  unconfirmedCount: 3,
}

const noop = () => undefined

describe("LeadSummaryPanel 힌트 3분기", () => {
  it("실패(error && !leadKpis)면 힌트도 '확인 불가'이고 '0건'이 없다", () => {
    const html = renderToStaticMarkup(<LeadSummaryPanel leadKpis={null} loading={false} error="KPI 조회 실패" onRetry={noop} />)
    expect(html).not.toContain("0건")
    expect(html).toContain("48h 이상")
    expect(html).toContain("오늘 예정")
    expect(html.match(/확인 불가/g)?.length ?? 0).toBeGreaterThanOrEqual(3)
    // 실패 배너: role=alert + 원인 + 재시도, 폐기된 색 리터럴 없음.
    expect(html).toContain('role="alert"')
    expect(html).toContain("KPI 조회 실패")
    expect(html).toContain(">다시 확인</button>")
    expect(html).not.toContain("#B85C33")
  })

  it("콜드 로드는 힌트도 스켈레톤이며 0 이 없다", () => {
    const html = renderToStaticMarkup(<LeadSummaryPanel leadKpis={null} loading error={null} onRetry={noop} />)
    expect(html).not.toContain("0건")
    expect(html).toContain("animate-pulse")
    expect(html).not.toContain('role="alert"')
  })

  it("정상이면 힌트에 실제 숫자를 그린다", () => {
    const html = renderToStaticMarkup(<LeadSummaryPanel leadKpis={KPIS} loading={false} error={null} onRetry={noop} />)
    expect(html).toContain("48h 이상 1건")
    expect(html).toContain("오늘 예정 5건")
    expect(html).not.toContain("확인 불가")
  })
})
