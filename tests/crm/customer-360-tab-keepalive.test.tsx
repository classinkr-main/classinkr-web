import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

const searchParamsRef = { current: new URLSearchParams() }

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParamsRef.current,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/admin/crm/customers/lead%3Alead-1",
  useParams: () => ({ key: "lead:lead-1" }),
}))

import Customer360DetailClient, {
  Customer360DetailTabPanels,
} from "@/components/admin/crm/Customer360DetailClient"
import type { Customer360 } from "@/lib/repositories/crm-customer-360"

// P3 — 방문한 탭은 마운트 유지(hidden 속성), 미방문 탭은 그대로 마운트하지 않는다.
// react-dom/server의 renderToStaticMarkup은 클릭을 재현하지 못하므로, 두 탭 이상 방문한
// 상태는 Customer360DetailTabPanels(내부 렌더 로직을 뽑아 export한 것)를 직접 렌더해 고정한다.

function make360(): Customer360 {
  return {
    generatedAt: "2026-09-21T00:00:00.000Z",
    key: "lead:lead-1",
    source: "lead",
    entityId: "lead-1",
    found: true,
    health: { ok: true, warnings: [] },
    header: {
      key: "lead:lead-1",
      source: "lead",
      sourceLabel: "리드",
      name: "테스트 학원",
      statusLabel: "신규",
      ownerName: null,
      ownerKeys: [],
      region: null,
      score: null,
      priorityReason: null,
      nextActionLabel: null,
      createdAt: null,
      updatedAt: null,
    },
    contacts: { phone: null, email: null, message: null, extra: [] },
    money: {
      available: false,
      label: null,
      totalBalance: null,
      totalOrderAmount: null,
      orders: [],
      collections: [],
      performances: [],
      eeoAccounts: [],
    },
    productSummary: { matched: false },
    origin: "site",
    crmRegistered: false,
    neoAccountId: null,
    risk: { severity: "low", reasons: [], overdueTaskCount: 0, riskEventCount: 0, nearestExpireAt: null, totalBalance: null },
    serviceRisk: null,
    activity: {
      generatedAt: "",
      health: { ok: true, message: null },
      summary: { total: 0, returned: 0, recordings: 0, risks: 0, openNextActions: 0 },
      rows: [],
    },
    compass: { leadIds: [], href: null, entries: [], down: false },
    tasks: {
      generatedAt: "",
      health: { ok: true, message: null },
      summary: { total: 2, returned: 0, open: 0, overdue: 0, dueToday: 0, snoozed: 0, done: 0 },
      rows: [],
    },
    deals: {
      generatedAt: "",
      health: { ok: true, message: null },
      summary: { total: 0, returned: 0, open: 0, won: 0, lost: 0, openAmount: 0, noNextActionCount: 0, aggregateTruncated: false },
      rows: [],
    },
    tags: [],
  } as unknown as Customer360
}

describe("P3 고객 360 탭 keep-alive — 초기 렌더(전체 컴포넌트)", () => {
  it("방문 집합이 활성 탭 하나뿐이면 패널도 하나만 마운트한다(미방문 탭은 렌더하지 않는다)", () => {
    searchParamsRef.current = new URLSearchParams("tab=tasks")
    const html = renderToStaticMarkup(<Customer360DetailClient data={make360()} customerKey="lead:lead-1" />)

    const panelMatches = html.match(/role="tabpanel"/g) ?? []
    expect(panelMatches.length).toBe(1)
    expect(html).toContain('id="c360-detail-tabpanel-tasks"')
    expect(html).not.toContain('id="c360-detail-tabpanel-overview"')
    // 유일한 패널은 활성 탭이므로 hidden이 없고 aria-hidden="false"다.
    expect(html).toContain('aria-hidden="false"')
    expect(html).not.toMatch(/id="c360-detail-tabpanel-tasks"[^>]*\shidden=""/)
  })

  it("탭 버튼과 패널이 id·aria-controls·aria-labelledby로 서로를 가리킨다", () => {
    searchParamsRef.current = new URLSearchParams()
    const html = renderToStaticMarkup(<Customer360DetailClient data={make360()} customerKey="lead:lead-1" />)

    expect(html).toContain('id="c360-detail-tab-overview"')
    expect(html).toContain('aria-controls="c360-detail-tabpanel-overview"')
    expect(html).toContain('id="c360-detail-tabpanel-overview"')
    expect(html).toContain('aria-labelledby="c360-detail-tab-overview"')
  })
})

describe("P3 고객 360 탭 keep-alive — Customer360DetailTabPanels(방문 집합 직접 주입)", () => {
  it("두 탭이 방문 집합에 있으면 두 패널이 렌더되고, 비활성 패널만 hidden·aria-hidden=true다", () => {
    const html = renderToStaticMarkup(
      <Customer360DetailTabPanels data={make360()} activeTab="tasks" visitedTabs={["overview", "tasks"]} />
    )

    const panelMatches = html.match(/role="tabpanel"/g) ?? []
    expect(panelMatches.length).toBe(2)
    expect(html).toContain('id="c360-detail-tabpanel-overview"')
    expect(html).toContain('id="c360-detail-tabpanel-tasks"')

    // overview(비활성) — hidden 속성이 실제로 붙는다(display:none) + aria-hidden="true".
    expect(html).toMatch(/id="c360-detail-tabpanel-overview"[^>]*\shidden=""/)
    expect(html).toMatch(/id="c360-detail-tabpanel-overview"[^>]*aria-hidden="true"/)

    // tasks(활성) — hidden 속성이 없고 aria-hidden="false".
    expect(html).not.toMatch(/id="c360-detail-tabpanel-tasks"[^>]*\shidden=""/)
    expect(html).toMatch(/id="c360-detail-tabpanel-tasks"[^>]*aria-hidden="false"/)
  })

  it("방문하지 않은 탭(deals·activity·money)은 아예 렌더되지 않는다", () => {
    const html = renderToStaticMarkup(
      <Customer360DetailTabPanels data={make360()} activeTab="overview" visitedTabs={["overview"]} />
    )

    expect(html).not.toContain("c360-detail-tabpanel-deals")
    expect(html).not.toContain("c360-detail-tabpanel-activity")
    expect(html).not.toContain("c360-detail-tabpanel-money")
  })

  it("visitedTabs 순서와 무관하게 TABS 정의 순서로 렌더한다", () => {
    const html = renderToStaticMarkup(
      <Customer360DetailTabPanels data={make360()} activeTab="overview" visitedTabs={["tasks", "overview"]} />
    )

    const overviewIndex = html.indexOf("c360-detail-tabpanel-overview")
    const tasksIndex = html.indexOf("c360-detail-tabpanel-tasks")
    expect(overviewIndex).toBeGreaterThan(-1)
    expect(tasksIndex).toBeGreaterThan(-1)
    expect(overviewIndex).toBeLessThan(tasksIndex)
  })
})
