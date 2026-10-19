/**
 * 고객 360 상세 페이지 — 10월 줄기(f989a812)의 상시 기록 입력 칸 위에 A안(07474478 "기록은 Compass에서")을 옮겨 심은
 * 병합 고정(2026-10-19). 드로어와 같은 규칙: Compass 에 매칭된 리드는 Home 입력 칸을 바 뒤로 접고(hidden),
 * "Home에 따로 남기기"로 펼치며 "Home에만 저장" 캡션을 단다. Home 정본(NEO·전환·매칭 없음)은 그대로 펼쳐 둔다.
 * 헤더의 Compass 링크(주·보조) 한 곳만 두고 상태 줄의 같은 링크는 두지 않는다.
 */
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/admin/crm/customers/lead%3Alead-1",
  useParams: () => ({ key: "lead:lead-1" }),
}))

import Customer360DetailClient from "@/components/admin/crm/Customer360DetailClient"
import type { Customer360 } from "@/lib/repositories/crm-customer-360"

const HREF = "https://mkt.classin.co.kr/leads?open=77"

function make360(overrides: Partial<Customer360> & { source?: Customer360["source"] } = {}): Customer360 {
  const source = overrides.source ?? "lead"
  const key = source === "lead" ? "lead:lead-1" : "neo:acc-9"
  return {
    generatedAt: "2026-10-19T03:00:00.000Z",
    key,
    source,
    entityId: source === "lead" ? "lead-1" : "acc-9",
    found: true,
    health: { ok: true, warnings: [] },
    header: {
      key,
      source,
      sourceLabel: source === "lead" ? "리드" : "고객",
      name: "큰학원",
      statusLabel: null,
      ownerName: "이매니저",
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
      lineItems: [],
      lineItemsMeta: { truncated: false, sources: [] },
      unmatchedOutbound: [],
    },
    productSummary: { matched: false },
    origin: null,
    crmRegistered: false,
    neoAccountId: null,
    leadStatus: source === "lead" ? "contacted" : null,
    risk: { severity: "low", reasons: [], overdueTaskCount: 0, riskEventCount: 0, nearestExpireAt: null, totalBalance: null },
    serviceRisk: null,
    activity: {
      generatedAt: "2026-10-19T03:00:00.000Z",
      health: { ok: true, message: null },
      summary: { total: 0, returned: 0, recordings: 0, risks: 0, openNextActions: 0 },
      pagination: { limit: 50, offset: 0, returned: 0, total: 0, hasMore: false, nextOffset: null },
      rows: [],
    },
    linkedLeads: { leadIds: [], truncated: false, mergedCount: 0, down: false },
    compass: { leadIds: [77], href: HREF, entries: [], down: false, nextActionAts: [] },
    tasks: { summary: { total: 0 }, rows: [] },
    deals: { summary: { total: 0 }, rows: [], pagination: { hasMore: false } },
    tags: [],
    ...overrides,
  } as unknown as Customer360
}

function hrefCount(html: string, href: string): number {
  return html.split(`href="${href}"`).length - 1
}

describe("고객 360 상세 — 기록 입력 칸의 기록 위치(A안)", () => {
  it("Compass 매칭 리드: 바 + 접힌 Home 입력 칸 + Home 전용 캡션, '기록 입력'은 보조 문구", () => {
    const html = renderToStaticMarkup(<Customer360DetailClient data={make360()} customerKey="lead:lead-1" />)
    expect(html).toContain('data-testid="c360-detail-write-surface-bar"')
    expect(html).toContain('aria-controls="c360-detail-home-composer"')
    expect(html).toMatch(/<div id="c360-detail-home-composer" hidden="">/)
    expect(html).toContain('data-testid="c360-home-only-caption"')
    // 입력 칸 자체는 같은 자리에 있다(감추기만) — 펼치면 바로 쓴다.
    expect(html).toContain('id="customer-record-body"')
    // Compass 새 탭 링크는 헤더 한 곳뿐(상태 줄에 같은 링크를 다시 두지 않는다).
    expect(hrefCount(html, HREF)).toBe(1)
    expect(html).toContain('data-testid="c360-detail-open-compass"')
  })

  it("NEO 계정(Home 정본): 바 없이 입력 칸을 펼쳐 두고, Compass 는 보조 링크 하나", () => {
    const html = renderToStaticMarkup(
      <Customer360DetailClient data={make360({ source: "neo_account" })} customerKey="neo:acc-9" />
    )
    expect(html).not.toContain("c360-detail-write-surface-bar")
    expect(html).toMatch(/<div id="c360-detail-home-composer">/)
    expect(html).not.toContain("c360-home-only-caption")
    expect(html).toContain(">기록 입력<")
    expect(hrefCount(html, HREF)).toBe(1)
    expect(html).toContain('data-testid="c360-detail-compass-record"')
  })

  it("Compass 연결 끊김 + 매칭 없음: 입력 칸은 펼치고 끊김 사실을 캡션으로 말한다", () => {
    const html = renderToStaticMarkup(
      <Customer360DetailClient
        data={make360({ compass: { leadIds: [], href: null, entries: [], down: true, nextActionAts: [] } })}
        customerKey="lead:lead-1"
      />
    )
    expect(html).toContain('data-testid="c360-compass-down-write"')
    expect(html).toMatch(/<div id="c360-detail-home-composer">/)
    expect(html).not.toContain("mkt.classin.co.kr")
  })
})
