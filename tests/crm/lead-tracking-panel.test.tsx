import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import LeadTrackingPanel from "@/components/admin/crm/leads/LeadTrackingPanel"
import type { LeadRecord } from "@/lib/repositories/leads"

function makeLead(overrides: Partial<LeadRecord> = {}): LeadRecord {
  return {
    id: overrides.id ?? "lead-1",
    source: "meta_lead_ads",
    timestamp: "2026-08-01T00:00:00.000Z",
    status: "new",
    ...overrides,
  }
}

const LEADS = [
  makeLead({ id: "a", utm_source: "meta", utm_medium: "paid", utm_campaign: "여름 HW", status: "converted" }),
  makeLead({ id: "b", utm_source: "meta", utm_medium: "paid", utm_campaign: "여름 HW" }),
  makeLead({ id: "c", source: "contact_page" }),
]

function render(props: Partial<Parameters<typeof LeadTrackingPanel>[0]> = {}) {
  return renderToStaticMarkup(
    <LeadTrackingPanel
      leads={LEADS}
      dimension="channel"
      onDimensionChange={() => {}}
      activeKey={null}
      onSelectKey={() => {}}
      {...props}
    />
  )
}

describe("LeadTrackingPanel", () => {
  it("채널 축은 UTM 조합과 UTM 없는 유입 묶음을 함께 세운다", () => {
    const html = render()
    expect(html).toContain("meta / paid")
    expect(html).toContain("홈페이지")
    expect(html).toContain("귀속 3 / 3건")
  })

  it("캠페인 축에서 값이 없는 리드는 미집계로 안내한다", () => {
    const html = render({ dimension: "campaign" })
    expect(html).toContain("여름 HW")
    expect(html).toContain("이 축에 값이 없는 리드 1건은 집계에서 빠집니다")
  })

  it("선택된 행이 있으면 해제 버튼을 노출한다", () => {
    expect(render()).not.toContain("트래킹 필터 해제")
    expect(render({ activeKey: "meta / paid" })).toContain("트래킹 필터 해제")
  })

  it("이 축으로 기록된 리드가 없으면 빈 상태를 보여준다", () => {
    const html = render({ leads: [makeLead({ id: "x", source: "contact_page" })], dimension: "magnet" })
    expect(html).toContain("이 축으로 기록된 리드가 없습니다")
  })
})
