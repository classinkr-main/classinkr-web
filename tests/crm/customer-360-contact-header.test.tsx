/**
 * CT9 — 고객 360 헤더 "마지막 연락 · 다음 연락"(드로어·상세) + 리드 시절 원천 표시 + 건강도 입력.
 * DOM 환경이 없어 renderToStaticMarkup 정적 마크업과 순수 함수, 소스 계약으로 고정한다.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

const searchParamsRef = { current: new URLSearchParams() }

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParamsRef.current,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/admin/crm/customers/neo%3Aacc-9",
  useParams: () => ({ key: "neo:acc-9" }),
}))

import Customer360ContactSummary from "@/components/admin/crm/Customer360ContactSummary"
import Customer360DetailActivity, { activityPanelDescription } from "@/components/admin/crm/Customer360DetailActivity"
import Customer360DetailClient from "@/components/admin/crm/Customer360DetailClient"
import { buildDrawerHealthInput, labelLeadEraRowsForDrawer } from "@/components/admin/crm/Customer360Drawer"
import { buildCustomerContactSummary, type CustomerContactSummary } from "@/lib/crm/customer-contact-summary"
import { computeCustomerHealth } from "@/lib/crm/customer-health"
import type { Customer360 } from "@/lib/repositories/crm-customer-360"
import type { CrmCustomerEventRecord, ListCrmCustomerEventsResult } from "@/lib/repositories/crm-events"

const NOW = new Date("2026-09-25T03:00:00.000Z")

function summary(overrides: Partial<Parameters<typeof buildCustomerContactSummary>[0]> = {}): CustomerContactSummary {
  return buildCustomerContactSummary({
    now: NOW,
    customerSource: "neo_account",
    events: [],
    compassEntries: [{ kind: "call", occurredAt: "2026-09-22T03:00:00.000Z", actor: "진소망" }],
    compassDown: false,
    tasks: [],
    compassNextActionAts: ["2026-09-26T02:00:00.000Z"],
    ...overrides,
  })
}

function event(overrides: Partial<CrmCustomerEventRecord> & { id: string }): CrmCustomerEventRecord {
  return {
    targetType: "neo_account",
    targetId: "acc-9",
    targetLabel: null,
    sourceType: "call",
    sourceId: null,
    occurredAt: "2026-09-24T00:00:00.000Z",
    title: "통화",
    summary: null,
    body: null,
    meetingPurpose: null,
    ownerName: null,
    attendees: [],
    decisions: [],
    blockers: [],
    nextActions: [],
    sentiment: "neutral",
    stageSignal: null,
    tags: [],
    publicEventId: null,
    attendeeOrigin: null,
    recording: null,
    createdBy: null,
    createdAt: "2026-09-24T00:00:00.000Z",
    updatedAt: "2026-09-24T00:00:00.000Z",
    ...overrides,
  }
}

function activity(rows: CrmCustomerEventRecord[]): ListCrmCustomerEventsResult {
  return {
    generatedAt: NOW.toISOString(),
    health: { ok: true, message: null },
    summary: { total: rows.length, returned: rows.length, recordings: 0, risks: 0, openNextActions: 0 },
    pagination: { limit: 50, offset: 0, returned: rows.length, total: rows.length, hasMore: false, nextOffset: null },
    rows,
  }
}

const COMPASS = { leadIds: [], href: null, entries: [], down: false, nextActionAts: [] }

describe("Customer360ContactSummary — 헤더 두 줄", () => {
  it("마지막 연락(원천·작성자)과 다음 연락(원천)을 그리고, 모바일은 두 줄로 쌓고 각 줄은 말줄임한다", () => {
    const html = renderToStaticMarkup(<Customer360ContactSummary summary={summary()} />)

    expect(html).toContain("마지막 연락 3일 전 · Compass 콜 · 진소망")
    expect(html).toContain("다음 연락 내일 · Compass 다음 액션")
    // 좁은 화면 = 세로 두 줄, sm 이상 = 한 줄 이어쓰기. 줄마다 truncate 로 가로 넘침 방지.
    expect(html).toContain("flex-col")
    expect(html).toContain("sm:flex-row")
    expect((html.match(/class="truncate"/g) ?? []).length).toBe(2)
    expect(html).toContain("min-w-0")
  })

  it("상태 표시는 점 + 글자색 — 채움 배지(bg-[#…])를 쓰지 않는다", () => {
    const overdue = summary({
      tasks: [{ title: "콜백", status: "open", dueAt: "2026-09-20T00:00:00.000Z", snoozedUntil: null }],
      compassDown: true,
    })
    const html = renderToStaticMarkup(<Customer360ContactSummary summary={overdue} />)

    expect(html).toContain('data-testid="c360-next-contact" data-tone="danger"')
    expect(html).toContain("text-[#B43E3E]")
    expect(html).toContain("bg-current")
    expect(html).not.toMatch(/bg-\[#/)
    // Compass 가 끊긴 것은 0 과 다른 사실 — 캡션으로 말한다.
    expect(html).toContain("Compass 연결 끊김 — Home 기록만")
  })

  it("옛 캐시 페이로드처럼 summary 가 없으면 아무것도 그리지 않는다", () => {
    expect(renderToStaticMarkup(<Customer360ContactSummary summary={undefined} />)).toBe("")
  })

  it("'며칠 전'은 KST 달력일 — 어제 밤 연락은 경과 24시간 미만이어도 '어제'(목록 셀과 같은 문구)", () => {
    // NOW = 09-25 12:00 KST, 연락 = 09-24 23:30 KST(경과 12.5시간).
    const lateNight = summary({ compassEntries: [{ kind: "call", occurredAt: "2026-09-24T23:30:00+09:00", actor: "진소망" }] })
    expect(lateNight.last?.daysAgo).toBe(0)
    const html = renderToStaticMarkup(<Customer360ContactSummary summary={lateNight} />)
    expect(html).toContain("마지막 연락 어제 · Compass 콜 · 진소망")
    expect(html).not.toContain("마지막 연락 오늘")
  })
})

describe("드로어 — 건강도 입력·리드 시절 표시", () => {
  it("buildDrawerHealthInput 은 헤더와 같은 마지막 연락 일수를 lastContactDays 로 넘긴다", () => {
    const stale = summary({
      compassEntries: [{ kind: "call", occurredAt: "2026-09-01T03:00:00.000Z", actor: null }],
    })
    const data = { risk: { severity: "low" }, serviceRisk: null, contactSummary: stale } as unknown as Customer360
    const input = buildDrawerHealthInput(data, null)
    expect(input.lastContactDays).toBe(24)
    expect(computeCustomerHealth(input).score).toBe(85)

    // Compass 가 끊겨도 통합 목록과 같게 Home 기록 기준 일수를 그대로 쓴다(끊김은 캡션이 말한다).
    const down = { ...data, contactSummary: { ...stale, compassDown: true } } as unknown as Customer360
    expect(buildDrawerHealthInput(down, null).lastContactDays).toBe(24)
    // contactSummary 가 없는 옛 캐시 페이로드는 null(감점 없음).
    const legacy = { risk: { severity: "low" }, serviceRisk: null } as unknown as Customer360
    expect(buildDrawerHealthInput(legacy, null).lastContactDays).toBeNull()
  })

  it("NEO 계정 360 의 리드 시절 행만 제목 머리에 '리드 시절 · '을 붙이고, 원본은 바꾸지 않는다", () => {
    const rows = [event({ id: "own" }), event({ id: "lead", targetType: "lead", targetId: "lead-7", title: "전화 · 응답" })]
    const labelled = labelLeadEraRowsForDrawer(rows, "neo_account")
    expect(labelled.map((r) => r.title)).toEqual(["통화", "리드 시절 · 전화 · 응답"])
    expect(rows[1].title).toBe("전화 · 응답")
    // 리드 360 은 그대로(참조 동일).
    expect(labelLeadEraRowsForDrawer(rows, "lead")).toBe(rows)
  })

  it("소스 계약 — 헤더에 요약을 두고, 피드·타임라인 모두 리드 시절 표시 사본을 쓴다", () => {
    const source = readFileSync(join(process.cwd(), "components/admin/crm/Customer360Drawer.tsx"), "utf8")
    expect(source).toContain("<Customer360ContactSummary summary={data?.contactSummary}")
    expect(source).toContain("labelLeadEraRowsForDrawer(data?.activity.rows ?? [], data?.source)")
    expect(source).toContain("activityRows.filter((event) => event.sentiment === \"risk\")")
    // 세대 가드는 그대로 — 요약도 같은 data 로만 그려진다(별도 fetch 없음).
    expect(source).toContain("const seq = ++loadSeqRef.current")
  })
})

describe("상세 — 활동 탭 리드 시절 원천 칩 · 헤더", () => {
  it("NEO 계정 360 의 target_type lead 행에만 '리드 시절' 칩을 붙인다", () => {
    const rows = [event({ id: "own" }), event({ id: "lead", targetType: "lead", targetId: "lead-7" })]
    const html = renderToStaticMarkup(
      <Customer360DetailActivity
        activity={activity(rows)}
        compass={COMPASS}
        customerSource="neo_account"
        linkedLeads={{ leadIds: ["lead-7"], truncated: false, mergedCount: 1, down: false }}
      />
    )
    expect((html.match(/data-testid="c360-lead-era-chip"/g) ?? []).length).toBe(1)
    expect(html).toContain("리드 시절 1건(연결 리드 1개) 병합")

    const leadHtml = renderToStaticMarkup(
      <Customer360DetailActivity activity={activity(rows)} compass={COMPASS} customerSource="lead" />
    )
    expect(leadHtml).not.toContain("c360-lead-era-chip")
  })

  it("연결·로그 조회 실패는 '없음'과 다른 캡션으로 말한다", () => {
    const html = renderToStaticMarkup(
      <Customer360DetailActivity
        activity={activity([])}
        compass={COMPASS}
        customerSource="neo_account"
        linkedLeads={{ leadIds: [], truncated: false, mergedCount: 0, down: true }}
      />
    )
    expect(html).toContain('data-testid="c360-lead-history-down"')
  })

  it("패널 설명은 병합 원천을 건수와 함께 밝힌다", () => {
    expect(activityPanelDescription({ compassCount: 0, leadEraCount: 0, linkedLeadCount: 0 })).toBe(
      "회의록 · 통화 · 메모 타임라인 (읽기 전용 — 기록 생성은 드로어에서)"
    )
    expect(activityPanelDescription({ compassCount: 3, leadEraCount: 2, linkedLeadCount: 1 })).toBe(
      "회의록 · 통화 · 메모 타임라인 · Compass 3건 · 리드 시절 2건(연결 리드 1개) 병합 (읽기 전용)"
    )
  })

  it("상세 헤더에 마지막·다음 연락이 뜬다", () => {
    searchParamsRef.current = new URLSearchParams()
    const data = {
      generatedAt: NOW.toISOString(),
      key: "neo:acc-9",
      source: "neo_account",
      entityId: "acc-9",
      found: true,
      health: { ok: true, warnings: [] },
      header: {
        key: "neo:acc-9",
        source: "neo_account",
        sourceLabel: "고객",
        name: "큰학원",
        statusLabel: "활성 고객",
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
      risk: { severity: "low", reasons: [], overdueTaskCount: 0, riskEventCount: 0, nearestExpireAt: null, totalBalance: null },
      serviceRisk: null,
      activity: activity([]),
      linkedLeads: { leadIds: [], truncated: false, mergedCount: 0, down: false },
      contactSummary: summary(),
      compass: COMPASS,
      tasks: { summary: { total: 0 }, rows: [] },
      deals: { summary: { total: 0 }, rows: [], pagination: { hasMore: false } },
      tags: [],
    } as unknown as Customer360

    const html = renderToStaticMarkup(<Customer360DetailClient data={data} customerKey="neo:acc-9" />)
    expect(html).toContain('data-testid="c360-contact-summary"')
    expect(html).toContain("마지막 연락 3일 전 · Compass 콜 · 진소망")
  })
})
