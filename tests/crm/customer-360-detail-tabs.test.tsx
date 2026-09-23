import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

const searchParamsRef = { current: new URLSearchParams() }

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParamsRef.current,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/admin/crm/customers/lead%3Alead-1",
  // Customer360DetailTasks(§13 Q2)가 태스크 탭에서 대상을 해석하는 데 쓴다.
  useParams: () => ({ key: "lead:lead-1" }),
}))

import Customer360DetailClient, {
  detailTabSearch,
  resolveDetailTab,
} from "@/components/admin/crm/Customer360DetailClient"
import type { Customer360 } from "@/lib/repositories/crm-customer-360"

// c360-01 — 탭 전환이 router.replace로만 반영돼 동적 렌더 페이지가 360 전체를 다시 조립하던 결함.
// 탭은 로컬 state가 정본이고, URL은 history.replaceState로만 뒤따른다. 여기서는 그 순수 규칙과
// 초기 탭 복원(딥링크)을 고정한다.

function make360(): Customer360 {
  return {
    generatedAt: "2026-09-15T03:00:00.000Z",
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
    money: { available: false, label: null, totalBalance: null, totalOrderAmount: null, orders: [], collections: [], performances: [], eeoAccounts: [] },
    productSummary: { matched: false },
    origin: "site",
    crmRegistered: false,
    neoAccountId: null,
    risk: { severity: "low", reasons: [], overdueTaskCount: 0, riskEventCount: 0, nearestExpireAt: null, totalBalance: null },
    serviceRisk: null,
    activity: { generatedAt: "", health: { ok: true, message: null }, summary: { total: 0, returned: 0, recordings: 0, risks: 0, openNextActions: 0 }, rows: [] },
    compass: { leadIds: [], href: null, entries: [], down: false },
    tasks: { generatedAt: "", health: { ok: true, message: null }, summary: { total: 2, returned: 0, open: 0, overdue: 0, dueToday: 0, snoozed: 0, done: 0 }, rows: [] },
    deals: { generatedAt: "", health: { ok: true, message: null }, summary: { total: 0, returned: 0, open: 0, won: 0, lost: 0, openAmount: 0, noNextActionCount: 0, aggregateTruncated: false }, rows: [] },
    tags: [],
  } as unknown as Customer360
}

describe("c360-01 상세 탭 규칙", () => {
  it("resolveDetailTab은 알 수 없는 값·없음을 개요로 돌린다", () => {
    expect(resolveDetailTab(null)).toBe("overview")
    expect(resolveDetailTab("bogus")).toBe("overview")
    expect(resolveDetailTab("tasks")).toBe("tasks")
  })

  it("detailTabSearch는 개요면 tab을 지우고 나머지는 set하며 다른 파라미터를 보존한다", () => {
    expect(detailTabSearch("?tab=money&from=home", "overview")).toBe("?from=home")
    expect(detailTabSearch("?from=home", "deals")).toBe("?from=home&tab=deals")
    expect(detailTabSearch("", "overview")).toBe("")
    expect(detailTabSearch("tab=tasks", "activity")).toBe("?tab=activity")
  })

  it("초기 렌더는 ?tab= 딥링크를 존중하고 role=tab/aria-selected로 현재 탭을 알린다", () => {
    searchParamsRef.current = new URLSearchParams("tab=tasks")
    const html = renderToStaticMarkup(<Customer360DetailClient data={make360()} customerKey="lead:lead-1" />)
    expect(html).toContain('role="tablist"')
    expect(html).toMatch(/<button[^>]*role="tab"[^>]*aria-selected="true"[^>]*>(?:(?!<\/button>).)*태스크/)
    expect(html).toContain('role="tabpanel"')
    // 탭 버튼은 모바일에서 44px 터치 타깃을 갖고 데스크톱은 기존 높이로 돌아간다.
    expect(html).toContain("min-h-11")
    expect(html).toContain("sm:min-h-0")
  })
})
